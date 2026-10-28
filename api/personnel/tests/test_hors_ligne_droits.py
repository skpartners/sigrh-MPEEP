"""Droits hors ligne par rôle : réglage dans les paramètres et refus au rejeu."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.hors_ligne_catalogue import CODES
from personnel.hors_ligne_droits import capacites_du_role
from personnel.models import Demande, Profil, RoleMatrice

pytestmark = pytest.mark.django_db

CONGE = {"type": "conge-annuel", "debut": "2026-05-04", "fin": "2026-05-18", "interim": "KOFFI Yao Christian", "observations": "Bouaké"}
ROUTE_CONGE = "/api/v1/agents/340188P/conges/demande/"
ROUTE_MATRICE = "/api/v1/parametres/hors-ligne/"


@pytest.fixture
def api():
    call_command("seed_demo")
    return APIClient()


def _connexion(api, matricule: str) -> dict:
    jeton = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    return {"HTTP_AUTHORIZATION": f"Token {jeton}"}


def _retirer(api, role: str, capacite: str):
    """Retire une capacité à un rôle, en passant par l'écran des paramètres (compte Ministre)."""
    Profil.objects.filter(user__username="DRH-2018-044").update(role="Ministre")
    auth = _connexion(api, "DRH-2018-044")
    ligne = RoleMatrice.objects.get(role=role)
    reponse = api.patch(ROUTE_MATRICE, {"role": ligne.pk, "capacite": capacite, "autorise": False}, format="json", **auth)
    assert reponse.status_code == 200, reponse.content
    return reponse


def test_par_defaut_un_role_peut_tout_faire_hors_ligne(api):
    auth = _connexion(api, "340188P")
    assert api.get("/api/v1/hors-ligne/droits/", **auth).json()["capacites"] == list(CODES)


def test_le_reglage_est_visible_et_retire_la_capacite_du_role(api):
    reponse = _retirer(api, "Agent", "conge").json()
    agent = next(ligne for ligne in reponse["roles"] if ligne["role"] == "Agent")
    assert "conge" not in agent["capacites"] and "lecture" in agent["capacites"]
    assert reponse["peut_modifier"] is True
    assert [c["code"] for c in reponse["capacites"]] == list(CODES)
    droits = api.get("/api/v1/hors-ligne/droits/", **_connexion(api, "340188P")).json()["capacites"]
    assert "conge" not in droits and "acte" in droits


def test_on_peut_redonner_une_capacite(api):
    _retirer(api, "Agent", "acte")
    auth = _connexion(api, "DRH-2018-044")
    ligne = RoleMatrice.objects.get(role="Agent")
    api.patch(ROUTE_MATRICE, {"role": ligne.pk, "capacite": "acte", "autorise": True}, format="json", **auth)
    assert capacites_du_role("Agent") == list(CODES)


def test_reglage_refuse_sans_habilitation_aux_parametres(api):
    auth = _connexion(api, "340188P")  # un simple agent : rubrique Paramètres fermée
    assert api.get(ROUTE_MATRICE, **auth).status_code == 403
    ligne = RoleMatrice.objects.get(role="Agent")
    assert api.patch(ROUTE_MATRICE, {"role": ligne.pk, "capacite": "conge", "autorise": False}, format="json", **auth).status_code == 403
    assert "conge" in capacites_du_role("Agent")


def test_reglage_valide_ses_entrees(api):
    Profil.objects.filter(user__username="DRH-2018-044").update(role="Ministre")
    auth = _connexion(api, "DRH-2018-044")
    ligne = RoleMatrice.objects.get(role="Agent")
    assert api.patch(ROUTE_MATRICE, {"role": ligne.pk, "capacite": "inconnue", "autorise": False}, format="json", **auth).status_code == 400
    assert api.patch(ROUTE_MATRICE, {"role": ligne.pk, "capacite": "conge", "autorise": "non"}, format="json", **auth).status_code == 400
    assert api.patch(ROUTE_MATRICE, {"role": 999999, "capacite": "conge", "autorise": False}, format="json", **auth).status_code == 404


def test_un_conge_differe_est_refuse_si_le_role_n_a_pas_le_droit(api):
    _retirer(api, "Agent", "conge")
    auth = _connexion(api, "340188P")
    avant = Demande.objects.count()
    differe = api.post(ROUTE_CONGE, CONGE, format="json", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="k-diff", **auth)
    assert differe.status_code == 403
    assert differe.json()["code"] == "hors_ligne_refuse"
    assert Demande.objects.count() == avant
    # Le refus n'est pas mémorisé : le même appel en ligne reste possible.
    en_ligne = api.post(ROUTE_CONGE, CONGE, format="json", HTTP_IDEMPOTENCY_KEY="k-diff", **auth)
    assert en_ligne.status_code == 201


def test_un_conge_differe_passe_si_le_role_a_le_droit(api):
    auth = _connexion(api, "340188P")
    reponse = api.post(ROUTE_CONGE, CONGE, format="json", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="k-ok", **auth)
    assert reponse.status_code == 201


def test_les_notifications_differees_suivent_leur_capacite(api):
    _retirer(api, "Agent", "notification")
    auth = _connexion(api, "340188P")
    assert api.post("/api/v1/notifications/tout-lu/", HTTP_X_HORS_LIGNE="1", **auth).status_code == 403
    assert api.post("/api/v1/notifications/tout-lu/", **auth).status_code == 200


def test_un_role_hors_matrice_comme_l_administrateur_garde_tout(api):
    Profil.objects.filter(user__username="340188P").update(role="Administrateur")
    auth = _connexion(api, "340188P")
    assert api.get("/api/v1/hors-ligne/droits/", **auth).json()["capacites"] == list(CODES)


# --- Mise à jour du dossier et pièces jointes -------------------------------------------------------

ROUTE_PROFIL = "/api/v1/agents/340188P/profil/"
ROUTE_ENFANTS = "/api/v1/agents/340188P/enfants/"
PROFIL = {"telephone": "+225 07 08 09 10 11"}
ENFANT = {"nom": "Koné", "prenoms": "Awa", "sexe": "F", "date_naissance": "2015-04-02", "lieu_naissance": "Bouaké"}


def _acte():
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("acte.pdf", b"%PDF-1.4 test", content_type="application/pdf")


def test_le_catalogue_compte_le_dossier_et_les_pieces_jointes():
    assert {"dossier", "fichier"} <= set(CODES)


def test_une_mise_a_jour_du_profil_differee_exige_la_capacite_dossier(api):
    _retirer(api, "Agent", "dossier")
    auth = _connexion(api, "340188P")
    refus = api.patch(ROUTE_PROFIL, PROFIL, format="json", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="p-1", **auth)
    assert refus.status_code == 403 and refus.json()["code"] == "hors_ligne_refuse"
    # Le refus n'est pas mémorisé, et en ligne la modification reste possible.
    assert api.patch(ROUTE_PROFIL, PROFIL, format="json", HTTP_IDEMPOTENCY_KEY="p-1", **auth).status_code == 200


def test_une_mise_a_jour_du_profil_differee_passe_et_ne_se_rejoue_pas_deux_fois(api):
    auth = _connexion(api, "340188P")
    premiere = api.patch(ROUTE_PROFIL, PROFIL, format="json", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="p-2", **auth)
    assert premiere.status_code == 200
    rejeu = api.patch(ROUTE_PROFIL, PROFIL, format="json", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="p-2", **auth)
    assert rejeu.status_code == 200 and rejeu["Idempotent-Replayed"] == "true"


def test_un_fichier_differe_exige_la_capacite_pieces_jointes(api):
    _retirer(api, "Agent", "fichier")
    auth = _connexion(api, "340188P")
    refus = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte()}, format="multipart", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="e-1", **auth)
    assert refus.status_code == 403 and refus.json()["code"] == "hors_ligne_refuse"
    # Les informations seules (sans fichier) restent permises : seule la pièce jointe est retenue.
    assert api.patch(ROUTE_PROFIL, PROFIL, format="json", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="p-3", **auth).status_code == 200


def test_un_enfant_avec_acte_differe_passe_quand_les_deux_capacites_sont_accordees(api):
    auth = _connexion(api, "340188P")
    reponse = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte()}, format="multipart", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="e-2", **auth)
    assert reponse.status_code == 201, reponse.content
