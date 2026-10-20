import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.models import EmploiReferentiel, CampagneBesoin, EntiteTutelle, FicheBesoin, Notification, Organisme, PoleMinisteriel, Profil

pytestmark = pytest.mark.django_db


def _client(matricule: str, mot_de_passe: str = "Sigrh-Dev-2026") -> APIClient:
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": matricule, "password": mot_de_passe}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


@pytest.fixture
def monde():
    """Direction > sous-direction > service, chacun avec son responsable, plus un agent sans responsabilité."""
    call_command("seed_demo")
    drh = _client("DRH-2018-044")
    organisme = Organisme.objects.first()
    pole = PoleMinisteriel.objects.first()
    direction = EntiteTutelle.objects.create(code="dir-test", nom="Direction test", pole=pole, niveau="direction-centrale")
    sous = EntiteTutelle.objects.create(code="sd-test", nom="Sous-direction test", pole=pole, niveau="sous-direction", parent=direction)
    service = EntiteTutelle.objects.create(code="sv-test", nom="Service test", pole=pole, niveau="service", parent=sous)
    comptes = {}
    for cle, structure in (("direction", direction), ("sous", sous), ("service", service)):
        user = User.objects.create_user(username=f"RESP-{cle}", password="Sigrh-Dev-2026")
        Profil.objects.create(user=user, fonction=f"Responsable {cle}", role="Chef de service", organisme=organisme, structure=structure)
        comptes[cle] = _client(user.username)
    simple = User.objects.create_user(username="AGENT-simple", password="Sigrh-Dev-2026")
    Profil.objects.create(user=simple, fonction="Agent", role="Agent", organisme=organisme)
    comptes["simple"] = _client("AGENT-simple")
    return {"drh": drh, "structures": {"direction": direction, "sous": sous, "service": service}, **comptes}


def _emploi(rang: int = 0) -> str:
    return list(EmploiReferentiel.objects.order_by("ordre", "id").values_list("code", flat=True)[:10])[rang]


def _fiche(emploi=None, fonctionnaires=2, contractuels=1, **reste):
    return {"emploi": emploi or _emploi(0), "fonctionnaires": fonctionnaires, "contractuels": contractuels, "motif": "Renfort", **reste}


def test_l_appel_est_lance_par_le_drh_et_previent_les_responsables(monde):
    assert monde["service"].post("/api/v1/besoins/campagne/", {}, format="json").status_code == 403
    CampagneBesoin.objects.all().delete()
    lancement = monde["drh"].post("/api/v1/besoins/campagne/", {"exercice": 2027, "cadrage": "Besoins 2027"}, format="json")
    assert lancement.status_code == 201 and lancement.json()["campagne"]["ouverte"]
    assert Notification.objects.filter(destinataire__username="RESP-service", titre__contains="2027").exists()
    assert not Notification.objects.filter(destinataire__username="AGENT-simple", titre__contains="2027").exists()


def test_seul_un_responsable_voit_et_saisit_ses_besoins(monde):
    assert monde["simple"].get("/api/v1/besoins/mes-fiches/").json() == {"responsable": False}
    assert monde["simple"].post("/api/v1/besoins/fiches/", _fiche(), format="json").status_code == 403
    vue = monde["service"].get("/api/v1/besoins/mes-fiches/").json()
    assert vue["responsable"] and [s["nom"] for s in vue["structures"]] == ["Service test"]
    assert monde["service"].post("/api/v1/besoins/fiches/", _fiche(fonctionnaires=0, contractuels=0), format="json").status_code == 400
    assert monde["service"].post("/api/v1/besoins/fiches/", _fiche(fonctionnaires=-1), format="json").status_code == 400
    cree = monde["service"].post("/api/v1/besoins/fiches/", _fiche(), format="json")
    assert cree.status_code == 201 and cree.json()["volume"] == 3 and cree.json()["chemin"] == ["Direction test", "Sous-direction test", "Service test"]


def test_la_centralisation_remonte_du_service_a_la_direction(monde):
    monde["service"].post("/api/v1/besoins/fiches/", _fiche(fonctionnaires=2, contractuels=1), format="json")
    monde["sous"].post("/api/v1/besoins/fiches/", _fiche(_emploi(1), fonctionnaires=1, contractuels=0), format="json")
    monde["direction"].post("/api/v1/besoins/fiches/", _fiche(_emploi(0), fonctionnaires=0, contractuels=2), format="json")
    # La direction voit la remontée de toutes ses structures ; le service ne voit que lui-même.
    direction = monde["direction"].get("/api/v1/besoins/mes-fiches/").json()
    racine = direction["arbre"][0]
    assert racine["propre"]["total"] == 2 and racine["cumul"] == {"fonctionnaires": 3, "contractuels": 3, "total": 6}
    sous = racine["enfants"][0]
    assert sous["cumul"]["total"] == 4 and sous["enfants"][0]["propre"] == {"fonctionnaires": 2, "contractuels": 1, "total": 3}
    service = monde["service"].get("/api/v1/besoins/").json()
    assert len(service["fiches"]) == 1 and service["arbre"][0]["nom"] == "Service test"
    # Le DRH voit tout.
    tout = monde["drh"].get("/api/v1/besoins/").json()
    assert tout["totaux"]["volume"] >= 6 + 16 and tout["peut_lancer"]


def test_pas_de_saisie_hors_de_sa_structure_ni_appel_clos(monde):
    cree = monde["service"].post("/api/v1/besoins/fiches/", _fiche(), format="json").json()
    route = f"/api/v1/besoins/fiches/{cree['reference']}/"
    assert monde["sous"].patch(route, _fiche(), format="json").status_code == 404
    assert monde["service"].patch(route, _fiche(fonctionnaires=4), format="json").json()["volume"] == 5
    assert monde["drh"].post("/api/v1/besoins/campagne/cloturer/", {}, format="json").status_code == 200
    assert monde["service"].post("/api/v1/besoins/fiches/", _fiche(), format="json").status_code == 409
    assert monde["service"].patch(route, _fiche(fonctionnaires=9), format="json").status_code == 409
    assert monde["service"].delete(route).status_code == 409
    assert FicheBesoin.objects.filter(reference=cree["reference"]).exists()
    # L'appel clos, seul le DRH corrige ou retire une ligne, et le responsable en est informé.
    corrigee = monde["drh"].patch(route, _fiche(fonctionnaires=7, contractuels=0), format="json")
    assert corrigee.status_code == 200 and corrigee.json()["volume"] == 7
    assert Notification.objects.filter(destinataire__username="RESP-service", titre="Besoin corrigé par la DRH").exists()
    assert monde["drh"].delete(route).status_code == 204
    assert not FicheBesoin.objects.filter(reference=cree["reference"]).exists()
    assert Notification.objects.filter(destinataire__username="RESP-service", titre="Besoin retiré par la DRH").exists()


def test_les_besoins_sont_exprimes_par_emploi_de_la_nomenclature(monde):
    service = monde["service"]
    assert service.post("/api/v1/besoins/fiches/", {"fonctionnaires": 1, "contractuels": 0, "emploi": "inconnu"}, format="json").status_code == 400
    premier = service.post("/api/v1/besoins/fiches/", _fiche(_emploi(0), 2, 1), format="json")
    assert premier.status_code == 201 and premier.json()["emploi"]["code"] == _emploi(0)
    # Un même emploi n'est demandé qu'une fois par structure.
    assert service.post("/api/v1/besoins/fiches/", _fiche(_emploi(0), 1, 0), format="json").status_code == 409
    assert service.post("/api/v1/besoins/fiches/", _fiche(_emploi(1), 1, 0), format="json").status_code == 201
    # Les structures qui demandent le même emploi se cumulent dans la centralisation.
    monde["sous"].post("/api/v1/besoins/fiches/", _fiche(_emploi(0), 0, 4), format="json")
    emplois = monde["drh"].get("/api/v1/besoins/").json()["emplois"]
    ligne = next(e for e in emplois if e["code"] == _emploi(0))
    assert ligne["fonctionnaires"] >= 2 and ligne["contractuels"] >= 5 and ligne["structures"] >= 2


def test_l_administrateur_a_l_onglet_et_exprime_pour_n_importe_quelle_structure(monde):
    organisme = Organisme.objects.first()
    admin = User.objects.create_user(username="ADMIN-test", password="Sigrh-Dev-2026")
    Profil.objects.create(user=admin, fonction="Administrateur", role="Administrateur", organisme=organisme, administrateur=True)
    compte = _client("ADMIN-test")

    assert monde["drh"].post("/api/v1/besoins/campagne/", {"exercice": 2027, "cadrage": "Besoins 2027"}, format="json").status_code == 201
    vue = compte.get("/api/v1/besoins/mes-fiches/").json()
    assert vue["responsable"] is True
    assert {s["id"] for s in vue["structures"]} >= {s.id for s in monde["structures"].values()}
    cible = monde["structures"]["service"]
    depot = compte.post("/api/v1/besoins/fiches/", _fiche(structure=cible.id), format="json")
    assert depot.status_code == 201
    assert len(compte.get("/api/v1/besoins/mes-fiches/").json()["fiches"]) == 1
    # Les structures imbriquées ne sont pas dupliquées à la racine de l'arbre.
    arbre = compte.get("/api/v1/besoins/mes-fiches/").json()["arbre"]
    ids = [n["id"] for n in arbre]
    assert len(ids) == len(set(ids)) and cible.id not in ids


def test_le_drh_est_un_responsable_de_sa_direction_seulement(monde):
    # Dans cet espace le DRH est un responsable comme les autres : sa direction, et elle seule.
    vue = monde["drh"].get("/api/v1/besoins/mes-fiches/").json()
    assert vue["responsable"] is True
    assert [s["nom"] for s in vue["structures"]] == ["Direction des Ressources Humaines"]
    autre = monde["structures"]["service"]
    assert monde["drh"].post("/api/v1/besoins/campagne/", {"exercice": 2027, "cadrage": "Besoins 2027"}, format="json").status_code == 201
    assert monde["drh"].post("/api/v1/besoins/fiches/", _fiche(structure=autre.id), format="json").status_code == 400


def test_exercices_passes_consultables_en_lecture_seule(monde):
    assert monde["drh"].post("/api/v1/besoins/campagne/", {"exercice": 2026, "cadrage": "Besoins 2026"}, format="json").status_code == 201
    assert monde["service"].post("/api/v1/besoins/fiches/", _fiche(), format="json").status_code == 201
    assert monde["drh"].post("/api/v1/besoins/campagne/", {"exercice": 2027, "cadrage": "Besoins 2027"}, format="json").status_code == 201

    courant = monde["service"].get("/api/v1/besoins/mes-fiches/").json()
    assert courant["exercices"] == [2027, 2026]
    assert courant["campagne"]["exercice"] == 2027 and courant["fiches"] == []

    passe = monde["service"].get("/api/v1/besoins/mes-fiches/?exercice=2026").json()
    assert passe["campagne"]["exercice"] == 2026 and passe["campagne"]["ouverte"] is False
    assert len(passe["fiches"]) == 1
    # Un exercice inconnu retombe sur le plus récent.
    assert monde["service"].get("/api/v1/besoins/mes-fiches/?exercice=1999").json()["campagne"]["exercice"] == 2027


def test_lancer_l_appel_alerte_les_responsables_meme_sans_date_limite(monde):
    lancement = monde["drh"].post("/api/v1/besoins/campagne/", {"exercice": 2027, "cadrage": "Besoins 2027"}, format="json")
    assert lancement.status_code == 201
    assert lancement.json()["prevenus"] >= 3 and lancement.json()["alerte"] == ""
    notifications = Notification.objects.filter(titre="Expression des besoins 2027")
    assert notifications.count() == lancement.json()["prevenus"]
    assert all(n.urgente for n in notifications)  # alerte systématique, avec ou sans date limite


def test_lancer_l_appel_sans_responsable_le_signale(monde):
    admin = User.objects.create_user(username="ADMIN-test", password="Sigrh-Dev-2026")
    Profil.objects.create(user=admin, fonction="Administrateur", role="Administrateur", organisme=Organisme.objects.first(), administrateur=True)
    compte = _client("ADMIN-test")
    Profil.objects.exclude(administrateur=True).update(role="Agent")  # plus aucun responsable de structure
    lancement = compte.post("/api/v1/besoins/campagne/", {"exercice": 2028}, format="json")
    assert lancement.status_code == 201
    corps = lancement.json()
    assert corps["prevenus"] == 0 and "Aucun responsable" in corps["alerte"]
