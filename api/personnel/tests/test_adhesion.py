import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel import adhesion
from personnel.models import AdhesionJuridique

pytestmark = pytest.mark.django_db

CODES = [code for code, *_reste in adhesion.DOCUMENTS]


@pytest.fixture
def agent():
    call_command("seed_demo")
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def _accepter(client, code, version=None):
    return client.post("/api/v1/adhesion/", {"document": code, "version": version or adhesion.VERSIONS[code]}, format="json")


def test_la_premiere_connexion_n_a_rien_accepte(agent):
    etat = agent.get("/api/v1/adhesion/").json()
    assert etat["complet"] is False
    assert [d["code"] for d in etat["documents"]] == CODES
    assert not any(d["acceptee"] for d in etat["documents"])
    assert agent.get("/api/v1/me/").json()["adhesion_complete"] is False


def test_les_documents_s_acceptent_dans_l_ordre(agent):
    refus = _accepter(agent, CODES[1])
    assert refus.status_code == 409 and AdhesionJuridique.objects.count() == 0
    assert _accepter(agent, CODES[0]).json()["documents"][0]["acceptee"] is True
    assert _accepter(agent, CODES[1]).status_code == 200
    assert agent.get("/api/v1/adhesion/").json()["complet"] is False


def test_le_parcours_complet_leve_l_obligation(agent):
    for code in CODES:
        assert _accepter(agent, code).status_code == 200
    assert agent.get("/api/v1/adhesion/").json()["complet"] is True
    assert agent.get("/api/v1/me/").json()["adhesion_complete"] is True


def test_accepter_deux_fois_ne_duplique_pas(agent):
    _accepter(agent, CODES[0])
    _accepter(agent, CODES[0])
    assert AdhesionJuridique.objects.filter(document=CODES[0]).count() == 1


def test_document_inconnu_ou_version_perimee_refuses(agent):
    assert _accepter(agent, "inconnu", version="2026-10").status_code == 400
    assert _accepter(agent, CODES[0], version="1999-01").status_code == 409


def test_une_nouvelle_version_redemande_l_adhesion(agent, monkeypatch):
    for code in CODES:
        _accepter(agent, code)
    monkeypatch.setitem(adhesion.VERSIONS, CODES[0], "2027-01")
    etat = agent.get("/api/v1/adhesion/").json()
    assert etat["complet"] is False
    assert [d["acceptee"] for d in etat["documents"]] == [False, True, True]


def test_l_adhesion_exige_une_connexion():
    assert APIClient().get("/api/v1/adhesion/").status_code in (401, 403)


def test_les_pages_du_front_s_affichent_dans_un_cadre_de_meme_origine_seulement():
    reponse = APIClient().get("/sigrh/conditions-generales")
    assert reponse["X-Frame-Options"] == "SAMEORIGIN"
