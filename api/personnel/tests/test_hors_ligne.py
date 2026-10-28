"""Actions saisies hors ligne : date de saisie et rejeu sans doublon."""

from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from personnel.models import CleIdempotence, Demande
from .test_api import _auth

pytestmark = pytest.mark.django_db

ROUTE = "/api/v1/agents/340188P/conges/demande/"
CORPS = {
    "type": "conge-annuel",
    "debut": "2026-05-04",
    "fin": "2026-05-18",
    "interim": "KOFFI Yao Christian",
    "observations": "Résidence à Bouaké",
}


@pytest.fixture
def api():
    call_command("seed_demo")
    return APIClient()


def _depot(api, auth, **entetes):
    return api.post(ROUTE, CORPS, format="json", **auth, **entetes)


def test_rejeu_avec_la_meme_cle_ne_cree_qu_une_demande(api):
    auth = _auth(api)
    avant = Demande.objects.count()
    premier = _depot(api, auth, HTTP_IDEMPOTENCY_KEY="cle-conge-1")
    assert premier.status_code == 201
    rejeu = _depot(api, auth, HTTP_IDEMPOTENCY_KEY="cle-conge-1")
    assert rejeu.status_code == 201
    assert rejeu["Idempotent-Replayed"] == "true"
    assert rejeu.json() == premier.json()
    assert Demande.objects.count() == avant + 1
    assert CleIdempotence.objects.filter(cle="cle-conge-1", statut=201).count() == 1


def test_sans_cle_rien_n_est_memorise(api):
    auth = _auth(api)
    reponse = _depot(api, auth)
    assert reponse.status_code == 201
    assert "Idempotent-Replayed" not in reponse
    assert CleIdempotence.objects.count() == 0


def test_un_refus_metier_est_memorise_et_rejoue(api):
    auth = _auth(api)
    incomplet = {"type": "conge-annuel"}
    premier = api.post(ROUTE, incomplet, format="json", HTTP_IDEMPOTENCY_KEY="cle-refus", **auth)
    assert premier.status_code == 400
    rejeu = api.post(ROUTE, incomplet, format="json", HTTP_IDEMPOTENCY_KEY="cle-refus", **auth)
    assert rejeu.status_code == 400
    assert rejeu["Idempotent-Replayed"] == "true"
    assert rejeu.json() == premier.json()


def test_une_cle_ne_sert_pas_pour_une_autre_action(api):
    auth = _auth(api)
    assert _depot(api, auth, HTTP_IDEMPOTENCY_KEY="cle-x").status_code == 201
    autre = api.post(ROUTE, {**CORPS, "fin": "2026-05-12"}, format="json", HTTP_IDEMPOTENCY_KEY="cle-x", **auth)
    assert autre.status_code == 422
    assert autre.json()["code"] == "cle_reutilisee"


def test_une_action_en_cours_repond_409(api):
    auth = _auth(api)
    reponse = _depot(api, auth, HTTP_IDEMPOTENCY_KEY="cle-en-cours")
    assert reponse.status_code == 201
    CleIdempotence.objects.filter(cle="cle-en-cours").update(statut=None, reponse=None)
    assert _depot(api, auth, HTTP_IDEMPOTENCY_KEY="cle-en-cours").status_code == 409


def test_la_date_de_saisie_fait_foi(api):
    auth = _auth(api)
    saisie = timezone.now() - timedelta(days=3)
    reponse = _depot(api, auth, HTTP_X_SAISI_LE=saisie.isoformat())
    assert reponse.status_code == 201
    demande = Demande.objects.filter(agent__matricule="340188P").order_by("-id").first()
    assert demande.depose_le == timezone.localtime(saisie).date()


def test_une_saisie_future_ou_trop_ancienne_est_refusee(api):
    auth = _auth(api)
    avant = Demande.objects.count()
    futur = timezone.now() + timedelta(hours=2)
    ancien = timezone.now() - timedelta(days=45)
    assert _depot(api, auth, HTTP_X_SAISI_LE=futur.isoformat()).status_code == 422
    assert _depot(api, auth, HTTP_X_SAISI_LE=ancien.isoformat()).status_code == 422
    assert _depot(api, auth, HTTP_X_SAISI_LE="pas une date").status_code == 422
    assert Demande.objects.count() == avant


def test_les_cles_sont_propres_a_chaque_utilisateur(api):
    auth = _auth(api)
    assert _depot(api, auth, HTTP_IDEMPOTENCY_KEY="partagee").status_code == 201
    CleIdempotence.objects.filter(cle="partagee").update(utilisateur="quelqu-un-d-autre")
    # La clé appartient à un autre utilisateur : ici, l'action s'exécute vraiment (et la règle métier refuse le doublon de période).
    suite = _depot(api, auth, HTTP_IDEMPOTENCY_KEY="partagee")
    assert "Idempotent-Replayed" not in suite
    assert CleIdempotence.objects.filter(cle="partagee").count() == 2
