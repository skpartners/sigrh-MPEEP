import io
import zipfile

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.models import Formation, InscriptionFormation, SessionFormation

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    call_command("seed_demo")
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def _session(api, code):
    return next(s for s in api.get("/api/v1/formation/").json()["sessions"] if s["code"] == code)


def test_tableau_calcule_depuis_la_base(api):
    body = api.get("/api/v1/formation/").json()
    etats = {s["code"]: s["etat"] for s in body["sessions"]}
    assert etats["carr-fonction"] == "en_cours" and etats["categ-corps"] == "terminee" and etats["spec-controle"] == "a_planifier"
    assert body["indicateurs"]["engage"] == sum(s["engage"] for s in body["sessions"])
    assert body["indicateurs"]["formes"] == 4  # présents des deux modules terminés
    assert body["indicateurs"]["candidatures_a_traiter"] == 3
    assert body["plan"]["dotation"] == 120_000_000
    assert len(body["prestataires"]) == 5 and body["recensement"]


def test_planifier_modifier_et_supprimer_une_session(api):
    cree = api.post(
        "/api/v1/formation/sessions/",
        {"type": "PERF", "libelle": "Rédaction administrative", "heures": 21, "places": 12, "cout_participant": 180000, "date_debut": "2026-12-01", "date_fin": "2026-12-03"},
        format="json",
    )
    assert cree.status_code == 201 and cree.json()["etat"] == "planifiee"
    code = cree.json()["code"]
    modif = api.patch(f"/api/v1/formation/sessions/{code}/", {**cree.json(), "type": "PERF", "places": 16, "prestataire": None}, format="json")
    assert modif.json()["places"] == 16
    assert api.post(f"/api/v1/formation/sessions/{code}/ouvrir/").json()["etat"] == "inscriptions_ouvertes"
    assert api.delete(f"/api/v1/formation/sessions/{code}/").status_code == 204
    # Un module avec des candidatures ne se supprime pas.
    assert api.delete("/api/v1/formation/sessions/perf-pilotage/").status_code == 409


def test_validations_de_planification(api):
    base = {"type": "PERF", "libelle": "Test", "heures": 10, "places": 10, "cout_participant": 0}
    assert "précède" in api.post("/api/v1/formation/sessions/", {**base, "date_debut": "2026-12-05", "date_fin": "2026-12-01"}, format="json").json()["detail"]
    assert api.post("/api/v1/formation/sessions/", {**base, "type": "INCONNU"}, format="json").status_code == 400
    assert api.post("/api/v1/formation/sessions/spec-controle/ouvrir/").status_code == 409  # sans dates


def test_annuler_refuse_les_candidatures_en_cours(api):
    assert api.post("/api/v1/formation/sessions/perf-pilotage/annuler/", {}, format="json").status_code == 400
    reponse = api.post("/api/v1/formation/sessions/perf-pilotage/annuler/", {"motif": "Prestataire indisponible"}, format="json")
    assert reponse.json()["etat"] == "annulee"
    etats = {i["etat"] for i in api.get("/api/v1/formation/").json()["inscriptions"] if i["session"]["code"] == "perf-pilotage"}
    assert etats == {"refusee"}


def test_cloturer_exige_l_emargement_puis_alimente_le_dossier(api):
    assert api.post("/api/v1/formation/sessions/carr-fonction/cloturer/").status_code == 409  # une présence manque
    manquante = InscriptionFormation.objects.get(session__code="carr-fonction", present__isnull=True)
    assert api.patch(f"/api/v1/formation/inscriptions/{manquante.id}/", {"present": True, "note_satisfaction": 4}, format="json").status_code == 200
    avant = Formation.objects.count()
    assert api.post("/api/v1/formation/sessions/carr-fonction/cloturer/").json()["etat"] == "terminee"
    assert Formation.objects.count() == avant + 2
    assert api.patch(f"/api/v1/formation/inscriptions/{manquante.id}/", {"present": False}, format="json").status_code == 409


def test_refus_motive_et_controle_des_places(api):
    candidature = InscriptionFormation.objects.filter(session__code="perf-pilotage", demande__etape__startswith="Étape 3").first()
    assert api.post(f"/api/v1/formation/inscriptions/{candidature.id}/refuser/", {}, format="json").status_code == 400
    assert api.post(f"/api/v1/formation/inscriptions/{candidature.id}/refuser/", {"motif": "Profil hors public"}, format="json").json()["etat"] == "refusee"

    # Module plein : la SD ne peut plus transmettre au DRH.
    SessionFormation.objects.filter(code="perf-pilotage").update(places=1)
    autre = InscriptionFormation.objects.filter(session__code="perf-pilotage", demande__etape__startswith="Étape 3").first()
    assert api.post(f"/api/v1/demandes/{autre.demande.reference}/valider/").status_code == 409


def test_crud_catalogue_prestataires_besoins_et_plan(api):
    assert api.delete("/api/v1/formation/types/PERF/").status_code == 409  # utilisé
    cree = api.post("/api/v1/formation/types/", {"code": "DIGI", "libelle": "Cycles numériques", "publics": ["Agents volontaires"]}, format="json")
    assert cree.status_code == 201 and cree.json()["publics"] == ["Agents volontaires"]
    assert api.post("/api/v1/formation/types/", {"code": "DIGI", "libelle": "Doublon"}, format="json").status_code == 409
    assert api.delete("/api/v1/formation/types/DIGI/").status_code == 204

    p = api.post("/api/v1/formation/prestataires/", {"nom": "Atelier Test", "categorie": "cabinet", "contact_email": "pas-un-courriel"}, format="json")
    assert p.status_code == 400
    p = api.post("/api/v1/formation/prestataires/", {"nom": "Atelier Test", "categorie": "cabinet"}, format="json").json()
    assert api.delete(f"/api/v1/formation/prestataires/{p['id']}/").status_code == 204

    b = api.post("/api/v1/formation/besoins/", {"organisme": "dgpe", "type": "PERF", "intitule": "Excel avancé", "effectif": 7, "priorite": "basse"}, format="json")
    assert b.status_code == 201
    assert api.delete(f"/api/v1/formation/besoins/{b.json()['id']}/").status_code == 204

    assert api.put("/api/v1/formation/plan/", {"dotation": "150 000 000", "objectif_agents": 80}, format="json").json()["dotation"] == 150_000_000


def test_inscription_par_la_sd_et_export(api):
    reponse = api.post("/api/v1/formation/sessions/perf-pilotage/inscrire/", {"matricules": ["340188P", "INCONNU"]}, format="json").json()
    assert reponse["inscrits"] == 1
    export = api.get("/api/v1/formation/plan/export/")
    assert export["Content-Type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert "Séminaire de perfectionnement au pilotage" in zipfile.ZipFile(io.BytesIO(export.content)).read("xl/worksheets/sheet1.xml").decode("utf-8")
