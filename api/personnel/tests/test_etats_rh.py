import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.models import Agent

pytestmark = pytest.mark.django_db


def _client(matricule: str) -> APIClient:
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


@pytest.fixture
def api():
    call_command("seed_demo")
    return _client("DRH-2018-044")


def test_etats_socio_demographiques_somment_l_effectif(api):
    corps = api.get("/api/v1/dashboard/etats/").json()
    socio = corps["socio_demographie"]
    total = Agent.objects.count()
    assert socio["total"] == total and socio["hommes"] + socio["femmes"] == total
    for cle in ("par_categorie", "par_grade", "par_statut", "par_famille", "par_tranche_age"):
        assert sum(l["total"] for l in socio[cle]) == total, cle
        assert all(l["hommes"] + l["femmes"] == l["total"] for l in socio[cle])
    assert sum(p["total"] for p in socio["par_programme"]) == total
    assert all(sum(s["total"] for s in p["structures"]) == p["total"] for p in socio["par_programme"])
    assert all(l["libelle"].startswith("Catégorie") or l["libelle"] == "Non renseigné" for l in socio["par_categorie"])


def test_sorties_de_carriere_projection_et_agents_admis(api):
    corps = api.get("/api/v1/dashboard/etats/?debut=2024&fin=2040").json()["sorties"]
    avec_date = Agent.objects.exclude(date_naissance=None).count()
    assert corps["admis"]["debut"] == 2024 and corps["admis"]["fin"] == 2040
    assert len(corps["admis"]["par_annee"]) == 17
    assert sum(a["total"] for a in corps["admis"]["par_annee"]) == len(corps["admis"]["agents"])
    assert len(corps["admis"]["agents"]) <= avec_date
    assert all(a["date_limite"][:4] == str(a["annee"]) for a in corps["admis"]["agents"])
    assert corps["projection"][-1]["libelle"].isdigit() and len(corps["projection"]) >= 11
    assert api.get("/api/v1/dashboard/etats/?debut=2030&fin=2024").status_code == 400


def test_responsables_et_detail_par_emploi_et_perimetre(api):
    autres = api.get("/api/v1/dashboard/etats/").json()["autres"]
    assert autres["responsables"]["structures_pourvues"] >= 1
    assert any("Direction des Ressources Humaines" == l["structure"] for l in autres["responsables"]["structures"])
    assert sum(l["effectif"] for l in autres["detail"]) == Agent.objects.count()
    # Un agent simple ne voit que son périmètre.
    restreint = _client("318490K").get("/api/v1/dashboard/etats/").json()
    assert restreint["perimetre"] is True and restreint["socio_demographie"]["total"] < Agent.objects.count()
