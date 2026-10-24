from datetime import date

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel import depot_conge
from personnel.models import Agent, Demande, DroitConge

pytestmark = pytest.mark.django_db

MATRICULE = "340188P"


@pytest.fixture
def api(db):
    call_command("seed_demo")
    return APIClient()


def _jeton(api, matricule: str) -> dict:
    login = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json")
    assert login.status_code == 200, login.content
    return {"HTTP_AUTHORIZATION": f"Token {login.json()['token']}"}


def _droits(**annees: tuple[int, int]) -> None:
    """Droits de l'agent : {"a2024": (dus, pris), …}."""
    agent = Agent.objects.get(matricule=MATRICULE)
    DroitConge.objects.filter(agent=agent).delete()
    for cle, (dus, pris) in annees.items():
        DroitConge.objects.create(agent=agent, annee=int(cle[1:]), jours_dus=dus, jours_pris=pris)
    agent.conges_acquis, agent.conges_consommes = sum(dus for dus, _ in annees.values()), sum(pris for _, pris in annees.values())
    agent.save(update_fields=["conges_acquis", "conges_consommes"])


def _demande(api, auth, **corps):
    return api.post(f"/api/v1/agents/{MATRICULE}/conges/demande/", {"type": "conge-annuel", **corps}, format="json", **auth)


def test_reliquat_se_prend_en_annee_courante_et_la_demande_garde_son_exercice(api):
    n = date.today().year
    _droits(**{f"a{n - 2}": (10, 0), f"a{n - 1}": (30, 0)})
    auth = _jeton(api, "DRH-2018-044")

    # Un reliquat ne se prend pas sur l'année précédente.
    hors = _demande(api, auth, exercice=n - 2, debut=f"{n - 1}-11-03", fin=f"{n - 1}-11-08")
    assert hors.status_code == 400 and str(n) in hors.json()["detail"]
    # Ni au-delà de ce qu'il reste.
    trop = _demande(api, auth, exercice=n - 2, debut=f"{n}-11-02", fin=f"{n}-11-20")
    assert trop.status_code == 400 and "Il reste 10 j" in trop.json()["detail"]
    # Dates libres, en année N.
    ok = _demande(api, auth, exercice=n - 2, debut=f"{n}-11-02", fin=f"{n}-11-08")
    assert ok.status_code == 201, ok.content
    assert Demande.objects.filter(agent__matricule=MATRICULE, categorie="conge").latest("id").exercice == n - 2


def test_exercice_sans_droit_refuse_et_defaut_sur_n_moins_un(api):
    n = date.today().year
    _droits(**{f"a{n - 2}": (10, 10), f"a{n - 1}": (30, 0)})
    auth = _jeton(api, "DRH-2018-044")
    assert _demande(api, auth, exercice=n - 2, debut=f"{n}-11-02", fin=f"{n}-11-08").status_code == 400
    defaut = _demande(api, auth, debut=f"{n}-11-02", fin=f"{n}-11-08")
    assert defaut.status_code == 201
    assert Demande.objects.filter(agent__matricule=MATRICULE, categorie="conge").latest("id").exercice == n - 1


def test_la_tranche_la_plus_ancienne_se_demande_d_abord(api, monkeypatch):
    agent = Agent.objects.get(matricule=MATRICULE)
    premiere, seconde = (date(2026, 7, 1), date(2026, 7, 16)), (date(2026, 12, 1), date(2026, 12, 16))
    monkeypatch.setattr(depot_conge, "periodes_arretees", lambda _agent: [premiere, seconde])
    assert "première période" in depot_conge._controler_plan_arrete(agent, *seconde)
    assert depot_conge._controler_plan_arrete(agent, *premiere) is None


def test_consommation_imputee_sur_l_exercice_choisi(api):
    from personnel.droits_conges import consommer

    n = date.today().year
    agent = Agent.objects.get(matricule=MATRICULE)
    _droits(**{f"a{n - 2}": (10, 0), f"a{n - 1}": (30, 0)})
    consommer(agent, 12, n - 1)
    pris = {droit.annee: droit.jours_pris for droit in DroitConge.objects.filter(agent=agent)}
    assert pris == {n - 2: 0, n - 1: 12}


def test_le_drh_annule_un_reliquat_mais_pas_n_moins_un(api):
    n = date.today().year
    _droits(**{f"a{n - 2}": (10, 4), f"a{n - 1}": (30, 0)})
    agent = Agent.objects.get(matricule=MATRICULE)
    avant = agent.reliquat_conges
    url = lambda annee: f"/api/v1/agents/{MATRICULE}/droits-conges/{annee}/remise-a-zero/"  # noqa: E731

    assert api.post(url(n - 2), **_jeton(api, "394812H")).status_code == 403
    drh = _jeton(api, "DRH-2018-044")
    assert api.post(url(n - 1), **drh).status_code == 400
    reponse = api.post(url(n - 2), **drh)
    assert reponse.status_code == 200, reponse.content
    droit = DroitConge.objects.get(agent=agent, annee=n - 2)
    assert droit.restant == 0 and droit.jours_pris == 4 and droit.remis_a_zero_le is not None
    agent.refresh_from_db()
    assert agent.reliquat_conges == avant - 6
    assert api.post(url(n - 2), **drh).status_code == 400  # plus rien à annuler


def test_les_plages_deja_prises_par_les_collegues_de_la_structure_sont_visibles(api):
    from datetime import timedelta

    from django.contrib.auth.models import User

    from personnel.planification import _collegues

    moi = Agent.objects.get(matricule=MATRICULE)
    collegue = Agent.objects.filter(structure=moi.structure).exclude(matricule=MATRICULE).first()
    assert collegue is not None
    n = date.today().year
    Demande.objects.create(
        reference="CG-TEST-1", agent=collegue, nature="Congé annuel (6 j)", categorie="conge",
        etape="Étape 2 : chef de service", responsable="Chef", echeance="", depose_le=date.today(),
        debut=date(n, 12, 1), fin=date(n, 12, 7),
    )
    Demande.objects.create(
        reference="CG-TEST-2", agent=collegue, nature="Congé annuel (3 j)", categorie="conge",
        etape="Refusée", responsable="Chef", echeance="", depose_le=date.today(),
        debut=date(n, 12, 20), fin=date(n, 12, 23),
    )
    visibles = _collegues(User.objects.get(username=MATRICULE), None)
    entree = next(item for item in visibles if item["matricule"] == collegue.matricule)
    # Le jour de reprise n'est pas un jour d'absence ; la demande refusée n'est pas une plage prise.
    assert (entree["debut"], entree["fin"]) == (date(n, 12, 1).isoformat(), (date(n, 12, 7) - timedelta(days=1)).isoformat())
    assert entree["autres"] == [] and entree["palier"] == "demande"
