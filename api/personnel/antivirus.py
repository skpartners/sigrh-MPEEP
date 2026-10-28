"""Analyse antivirus (ClamAV) de tous les fichiers reçus par l'API.

Le démon `clamd` tourne comme service Windows (ClamAV-Daemon, 127.0.0.1:3310), partagé avec les autres applications du
serveur. Chaque fichier qu'un envoi multipart apporte lui est transmis pendant sa réception (protocole INSTREAM) ; le
fichier n'est conservé par aucune vue tant que le verdict n'est pas tombé. Un point d'entrée unique couvre ainsi tous les
envois, ceux d'aujourd'hui comme ceux qu'on ajoutera.

- menace détectée : l'envoi est refusé (422), le fichier n'est jamais écrit ;
- démon injoignable : l'envoi est refusé (503) plutôt que de laisser passer un fichier non analysé. Un envoi différé
  depuis un appareil hors ligne est alors retenté par l'application au lieu d'être perdu.

Actif en production, inactif en développement (aucun démon requis) ; `SIGRH_CLAMAV=true|false` force le choix.
"""

from __future__ import annotations

import logging
import socket
import struct

from django.conf import settings
from django.core.files.uploadhandler import FileUploadHandler
from django.http.multipartparser import MultiPartParserError

logger = logging.getLogger(__name__)

MESSAGE_MENACE = (
    "Fichier refusé : l'analyse antivirus a détecté une menace. "
    "Si vous pensez à une erreur, contactez l'administrateur."
)
MESSAGE_INDISPONIBLE = (
    "Le fichier n'a pas pu être analysé par l'antivirus pour le moment. "
    "Aucun fichier n'est enregistré sans analyse : réessayez dans un instant."
)

# Fichier de test standard EICAR : tout antivirus à jour le détecte, sans danger.
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

_FIN_FLUX = struct.pack("!I", 0)


class AnalyseRefusee(MultiPartParserError):
    """Le fichier n'est pas accepté. Portée par `ParseError` (cause implicite) jusqu'au gestionnaire d'erreurs de l'API."""

    statut = 422
    code = "antivirus_menace"
    message_public = MESSAGE_MENACE

    def __init__(self, menace: str = ""):
        super().__init__(self.message_public)
        self.menace = menace


class AnalyseIndisponible(AnalyseRefusee):
    statut = 503
    code = "antivirus_indisponible"
    message_public = MESSAGE_INDISPONIBLE


def analyse_active() -> bool:
    return bool(getattr(settings, "CLAMAV_ACTIF", False))


def _parametres() -> tuple[str, int, float]:
    return (
        getattr(settings, "CLAMAV_HOTE", "127.0.0.1"),
        int(getattr(settings, "CLAMAV_PORT", 3310)),
        float(getattr(settings, "CLAMAV_DELAI", 60)),
    )


class FluxClamd:
    """Une analyse INSTREAM en cours : les morceaux du fichier partent au démon à mesure qu'ils arrivent."""

    def __init__(self) -> None:
        hote, port, delai = _parametres()
        try:
            self._socket = socket.create_connection((hote, port), timeout=delai)
            self._socket.settimeout(delai)
            self._socket.sendall(b"zINSTREAM\0")
        except OSError as erreur:
            logger.error("ClamAV injoignable (%s:%s) : %s", hote, port, erreur)
            raise AnalyseIndisponible() from erreur

    def envoyer(self, morceau: bytes) -> None:
        if not morceau:
            return
        try:
            self._socket.sendall(struct.pack("!I", len(morceau)) + morceau)
        except OSError as erreur:
            # clamd coupe la connexion et répond « size limit exceeded » si le fichier dépasse StreamMaxLength.
            logger.error("Envoi à ClamAV interrompu : %s", erreur)
            self.fermer()
            raise AnalyseIndisponible() from erreur

    def conclure(self) -> None:
        """Termine le flux et lit le verdict. Lève `AnalyseRefusee` (menace) ou `AnalyseIndisponible` (réponse inutilisable)."""
        try:
            self._socket.sendall(_FIN_FLUX)
            reponse = b""
            while not reponse.endswith(b"\0") and len(reponse) < 4096:
                lu = self._socket.recv(1024)
                if not lu:
                    break
                reponse += lu
        except OSError as erreur:
            logger.error("Réponse de ClamAV illisible : %s", erreur)
            raise AnalyseIndisponible() from erreur
        finally:
            self.fermer()
        verdict = reponse.rstrip(b"\0\n").decode("utf-8", "replace")
        if verdict.endswith("OK"):
            return
        if verdict.endswith("FOUND"):
            menace = verdict.removeprefix("stream:").removesuffix("FOUND").strip() or "inconnue"
            logger.warning("Fichier refusé par ClamAV : menace %s", menace)
            raise AnalyseRefusee(menace)
        logger.error("Verdict ClamAV inattendu : %r", verdict)
        raise AnalyseIndisponible()

    def fermer(self) -> None:
        try:
            self._socket.close()
        except OSError:
            pass


class AnalyseAntivirus(FileUploadHandler):
    """À placer en tête de `FILE_UPLOAD_HANDLERS` : lit chaque morceau au passage et le rend intact au gestionnaire suivant."""

    def __init__(self, request=None):
        super().__init__(request)
        self._flux: FluxClamd | None = None

    def new_file(self, *args, **kwargs):
        super().new_file(*args, **kwargs)
        self._flux = FluxClamd() if analyse_active() else None

    def receive_data_chunk(self, raw_data, start):
        if self._flux is not None:
            self._flux.envoyer(raw_data)
        return raw_data

    def file_complete(self, file_size):
        flux, self._flux = self._flux, None
        if flux is not None:
            flux.conclure()
        return None

    def upload_interrupted(self):
        if self._flux is not None:
            self._flux.fermer()
            self._flux = None


def gestionnaire_erreurs(exc, contexte):
    """Gestionnaire d'erreurs de l'API : rend l'analyse refusée en JSON clair (et non « Multipart form parse error »)."""
    from rest_framework.exceptions import ParseError
    from rest_framework.response import Response
    from rest_framework.views import exception_handler

    cause = exc.__context__ if isinstance(exc, ParseError) else None
    if isinstance(cause, AnalyseRefusee):
        return Response({"detail": cause.message_public, "code": cause.code}, status=cause.statut)
    return exception_handler(exc, contexte)
