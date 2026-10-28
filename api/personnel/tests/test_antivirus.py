"""Analyse antivirus des envois de fichiers, contre un faux démon clamd qui parle le protocole INSTREAM."""

import socket
import struct
import threading

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APIClient

from personnel.antivirus import EICAR, MESSAGE_INDISPONIBLE, MESSAGE_MENACE
from personnel.models import Agent

pytestmark = pytest.mark.django_db

ROUTE_ENFANTS = "/api/v1/agents/340188P/enfants/"
ENFANT = {"nom": "Koné", "prenoms": "Awa", "sexe": "F", "date_naissance": "2015-04-02", "lieu_naissance": "Bouaké"}


def _lire(connexion: socket.socket, n: int) -> bytes:
    donnees = b""
    while len(donnees) < n:
        lu = connexion.recv(n - len(donnees))
        if not lu:
            raise ConnectionError
        donnees += lu
    return donnees


class FauxClamd:
    """Écoute en local, lit un flux INSTREAM et répond OK ou FOUND selon la présence d'EICAR dans le fichier."""

    def __init__(self, reponse: bytes | None = None):
        self.reponse = reponse
        self.recus: list[bytes] = []
        self._serveur = socket.socket()
        self._serveur.bind(("127.0.0.1", 0))
        self._serveur.listen(5)
        self.port = self._serveur.getsockname()[1]
        threading.Thread(target=self._boucle, daemon=True).start()

    def _boucle(self):
        while True:
            try:
                connexion, _ = self._serveur.accept()
            except OSError:
                return
            threading.Thread(target=self._servir, args=(connexion,), daemon=True).start()

    def _servir(self, connexion: socket.socket):
        with connexion:
            try:
                assert _lire(connexion, 10) == b"zINSTREAM\0"
                contenu = b""
                while True:
                    (taille,) = struct.unpack("!I", _lire(connexion, 4))
                    if taille == 0:
                        break
                    contenu += _lire(connexion, taille)
                self.recus.append(contenu)
                if self.reponse is not None:
                    connexion.sendall(self.reponse)
                elif EICAR in contenu:
                    connexion.sendall(b"stream: Win.Test.EICAR_HDB-1 FOUND\0")
                else:
                    connexion.sendall(b"stream: OK\0")
            except (ConnectionError, AssertionError):
                return

    def arreter(self):
        self._serveur.close()


@pytest.fixture
def clamd():
    faux = FauxClamd()
    yield faux
    faux.arreter()


@pytest.fixture
def api():
    call_command("seed_demo")
    client = APIClient()
    jeton = client.post("/api/v1/auth/login/", {"matricule": "340188P", "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {jeton}")
    return client


def _acte(contenu: bytes = b"%PDF-1.4 test"):
    return SimpleUploadedFile("acte.pdf", contenu, content_type="application/pdf")


def _enfants() -> int:
    return Agent.objects.get(matricule="340188P").enfants.count()


def test_un_fichier_sain_est_analyse_puis_conserve(api, clamd):
    avant = _enfants()
    with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=clamd.port):
        reponse = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte()}, format="multipart")
    assert reponse.status_code == 201, reponse.content
    assert _enfants() == avant + 1
    assert clamd.recus == [b"%PDF-1.4 test"]


def test_une_menace_est_refusee_et_rien_n_est_conserve(api, clamd):
    avant = _enfants()
    with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=clamd.port):
        reponse = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte(EICAR)}, format="multipart")
    assert reponse.status_code == 422
    assert reponse.json() == {"detail": MESSAGE_MENACE, "code": "antivirus_menace"}
    assert _enfants() == avant


def test_demon_injoignable_refuse_l_envoi_au_lieu_de_laisser_passer(api):
    libre = socket.socket()
    libre.bind(("127.0.0.1", 0))
    port = libre.getsockname()[1]
    libre.close()  # plus rien n'écoute sur ce port
    avant = _enfants()
    with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=port, CLAMAV_DELAI=2):
        reponse = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte()}, format="multipart")
    assert reponse.status_code == 503
    assert reponse.json() == {"detail": MESSAGE_INDISPONIBLE, "code": "antivirus_indisponible"}
    assert _enfants() == avant


def test_reponse_inattendue_du_demon_n_est_jamais_prise_pour_un_ok(api):
    faux = FauxClamd(reponse=b"INSTREAM size limit exceeded. ERROR\0")
    try:
        with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=faux.port):
            reponse = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte()}, format="multipart")
    finally:
        faux.arreter()
    assert reponse.status_code == 503


def test_analyse_inactive_ne_contacte_pas_le_demon(api, clamd):
    with override_settings(CLAMAV_ACTIF=False, CLAMAV_PORT=clamd.port):
        reponse = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte(EICAR)}, format="multipart")
    assert reponse.status_code == 201
    assert clamd.recus == []


def test_un_envoi_sans_fichier_ne_passe_pas_par_l_antivirus(api, clamd):
    with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=clamd.port):
        reponse = api.patch("/api/v1/agents/340188P/profil/", {"telephone": "+225 07 08 09 10 11"}, format="json")
    assert reponse.status_code == 200
    assert clamd.recus == []


def test_un_envoi_differe_infecte_est_refuse_comme_un_envoi_direct(api, clamd):
    """Au retour du réseau, la pièce hors ligne passe par la même analyse que si elle était envoyée en ligne."""
    with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=clamd.port):
        reponse = api.post(
            ROUTE_ENFANTS,
            {**ENFANT, "fichier": _acte(EICAR)},
            format="multipart",
            HTTP_X_HORS_LIGNE="1",
            HTTP_IDEMPOTENCY_KEY="av-1",
        )
    assert reponse.status_code == 422 and reponse.json()["code"] == "antivirus_menace"
    # Le refus n'est pas mémorisé comme un succès : la même clé peut servir à renvoyer un fichier sain.
    with override_settings(CLAMAV_ACTIF=True, CLAMAV_PORT=clamd.port):
        ok = api.post(ROUTE_ENFANTS, {**ENFANT, "fichier": _acte()}, format="multipart", HTTP_X_HORS_LIGNE="1", HTTP_IDEMPOTENCY_KEY="av-1")
    assert ok.status_code == 201, ok.content
