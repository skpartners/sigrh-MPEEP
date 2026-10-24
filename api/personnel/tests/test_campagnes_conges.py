from datetime import date, timedelta

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.models import CampagnePlanConge

pytestmark = pytest.mark.django_db
URL = "/api/v1/conges/planification/campagnes/"


@pytest.fixture
def api(db):
    call_command("seed_demo")
    return APIClient()


def _jeton(api, matricule: str) -> dict:
    login = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json")
    assert login.status_code == 200, login.content
    return {"HTTP_AUTHORIZATION": f"Token {login.json()['token']}"}


def _corps(exercice: int, communique: str = "Choisissez vos congés") -> dict:
    jour = date.today()
    return {
        "exercice": exercice, "communique": communique,
        "limite_agents": (jour + timedelta(days=10)).isoformat(), "limite_hierarchie": (jour + timedelta(days=20)).isoformat(),
        "limite_rh": (jour + timedelta(days=30)).isoformat(), "limite_drh": (jour + timedelta(days=40)).isoformat(), "delai": (jour + timedelta(days=50)).isoformat(),
    }


def test_crud_des_campagnes_de_conges(api):
    drh = _jeton(api, "DRH-2018-044")
    simple = _jeton(api, "394812H")
    CampagnePlanConge.objects.all().delete()

    assert api.get(URL, **simple).status_code == 403
    assert api.get(URL, **drh).json()["campagnes"] == [] and api.get(URL, **drh).json()["peut_ouvrir"] is True

    # Créer : une seule campagne en cours à la fois.
    cree = api.post(URL, _corps(2031), format="json", **drh)
    assert cree.status_code == 201 and [c["exercice"] for c in cree.json()["campagnes"]] == [2031] and cree.json()["peut_ouvrir"] is False
    identifiant = cree.json()["campagnes"][0]["id"]
    assert api.post(URL, _corps(2032), format="json", **drh).status_code == 409

    # Modifier : échéances et communiqué ; des échéances incohérentes sont refusées.
    modifiee = api.patch(f"{URL}{identifiant}/", {**_corps(2031, "Nouveau communiqué")}, format="json", **drh)
    assert modifiee.status_code == 200 and modifiee.json()["campagnes"][0]["communique"] == "Nouveau communiqué"
    incoherente = {**_corps(2031), "limite_rh": (date.today() + timedelta(days=5)).isoformat()}
    assert api.patch(f"{URL}{identifiant}/", incoherente, format="json", **drh).status_code == 400

    # Clôturer : la campagne ne se modifie plus et une autre peut s'ouvrir.
    close = api.post(f"{URL}{identifiant}/cloturer/", **drh)
    assert close.status_code == 200 and close.json()["campagnes"][0]["cloturee"] is True and close.json()["peut_ouvrir"] is True
    assert api.patch(f"{URL}{identifiant}/", _corps(2031), format="json", **drh).status_code == 409
    assert api.post(f"{URL}{identifiant}/cloturer/", **drh).status_code == 409
    suivante = api.post(URL, _corps(2032), format="json", **drh)
    assert suivante.status_code == 201 and len(suivante.json()["campagnes"]) == 2

    # Supprimer.
    supprimee = api.delete(f"{URL}{identifiant}/", **drh)
    assert supprimee.status_code == 200 and [c["exercice"] for c in supprimee.json()["campagnes"]] == [2032]
    assert not CampagnePlanConge.objects.filter(pk=identifiant).exists()


def test_quorum_du_ministere_moyenne_des_structures_ou_valeur_fixee(api):
    from personnel.models import EntiteTutelle, ParametresMinistere
    from personnel.parametres import etat_quorum, quorum_presence

    drh = _jeton(api, "DRH-2018-044")
    simple = _jeton(api, "394812H")
    ParametresMinistere.objects.get_or_create(pk=1)
    EntiteTutelle.objects.update(quorum_presence_pourcent=None)
    # Aucun quorum de structure : la valeur du ministère (65 % par défaut).
    assert quorum_presence() == 65 and etat_quorum()["automatique"] is False
    # Les responsables fixent le leur dans leurs structures : le quorum du ministère en est la moyenne.
    a, b = list(EntiteTutelle.objects.all()[:2])
    EntiteTutelle.objects.filter(pk=a.pk).update(quorum_presence_pourcent=70)
    EntiteTutelle.objects.filter(pk=b.pk).update(quorum_presence_pourcent=80)
    etat = etat_quorum()
    assert etat["valeur"] == 75 and etat["automatique"] is True and etat["moyenne_structures"] == 75 and etat["structures_definies"] == 2

    url = "/api/v1/carrieres/conges/quorum/"
    assert api.patch(url, {"quorum": 60}, format="json", **simple).status_code == 403
    assert api.patch(url, {"quorum": 0}, format="json", **drh).status_code == 400
    fixe = api.patch(url, {"quorum": 60}, format="json", **drh)
    assert fixe.status_code == 200 and fixe.json()["valeur"] == 60 and fixe.json()["automatique"] is False
    assert quorum_presence() == 60
    retour = api.patch(url, {"quorum": ""}, format="json", **drh)
    assert retour.json()["valeur"] == 75 and retour.json()["automatique"] is True
    assert api.get("/api/v1/carrieres/conges/", **drh).json()["quorum"]["valeur"] == 75


def test_le_registre_grh_montre_les_conges_deposes_par_les_agents(api):
    from django.contrib.auth.models import User

    from personnel.models import Agent, Demande, PlanConge

    drh = _jeton(api, "DRH-2018-044")
    agent = Agent.objects.get(matricule="340188P")
    jour = date.today()
    # Une demande déposée depuis l'espace de l'agent, au visa du chef de service.
    reponse = api.post(
        f"/api/v1/agents/{agent.matricule}/conges/demande/",
        {"type": "conge-annuel", "debut": (jour + timedelta(days=30)).isoformat(), "fin": (jour + timedelta(days=40)).isoformat()}, format="json", **drh,
    )
    assert reponse.status_code == 201, reponse.content
    # Les dates choisies par l'agent à la campagne.
    CampagnePlanConge.objects.all().delete()
    campagne = CampagnePlanConge.objects.create(
        exercice=jour.year, delai=jour + timedelta(days=50), limite_agents=jour + timedelta(days=10), limite_hierarchie=jour + timedelta(days=20),
        limite_rh=jour + timedelta(days=30), limite_drh=jour + timedelta(days=40), communique="x", statut="ouverte",
    )
    PlanConge.objects.create(campagne=campagne, agent=User.objects.get(username=agent.matricule), debut=jour + timedelta(days=60), fin=jour + timedelta(days=74), palier="rh")

    suivi = api.get("/api/v1/carrieres/conges/", **drh).json()["suivi"]
    demande = next(item for item in suivi if item["source"] == "demande" and item["agent"]["matricule"] == agent.matricule)
    assert demande["clos"] is False and demande["visas"] and demande["ordre_actuel"] >= 1
    plan = next(item for item in suivi if item["source"] == "plan" and item["agent"]["matricule"] == agent.matricule)
    # Au palier « équipe RH » : l'agent et le supérieur ont validé, l'équipe RH est l'étape actuelle.
    assert [v["etat"] for v in plan["visas"]] == ["ok", "ok", "attente", "attente", "attente"] and plan["ordre_actuel"] == 3


def test_le_responsable_voit_et_regle_le_quorum_de_sa_structure_depuis_son_profil(api):
    from personnel.models import EntiteTutelle, Profil

    jeton = _jeton(api, "DRH-2018-044")
    profil = Profil.objects.get(user__username="DRH-2018-044")
    reponse = api.get("/api/v1/conges/mes-quorums/", **jeton).json()
    if profil.structure_id:
        assert reponse["structures"] and reponse["structures"][0]["principale"] is True
        code = reponse["structures"][0]["code"]
        # Le responsable règle le quorum de sa structure ; il remonte dans la moyenne du ministère.
        EntiteTutelle.objects.update(quorum_presence_pourcent=None)
        fixe = api.patch(f"/api/v1/structures/{code}/quorum/", {"quorum_presence_pourcent": 72}, format="json", **jeton)
        assert fixe.status_code == 200
        apres = next(s for s in api.get("/api/v1/conges/mes-quorums/", **jeton).json()["structures"] if s["code"] == code)
        assert apres["propre"] == 72 and apres["herite"] is False and apres["valeur"] == 72
    # Un agent sans responsabilité n'a aucune structure à régler.
    simple = _jeton(api, "394812H")
    assert api.get("/api/v1/conges/mes-quorums/", **simple).json()["structures"] == []
