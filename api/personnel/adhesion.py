"""Parcours d'adhésion de la première connexion : CGU, confidentialité, protection des données.

Les trois documents s'acceptent dans cet ordre. Une adhésion est enregistrée par compte et par version :
changer `VERSION` d'un document redemande son acceptation à tous les comptes à leur prochaine connexion.
"""

from django.db import IntegrityError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AdhesionJuridique

# (code, libellé, version en vigueur, route publique du document), dans l'ordre du parcours.
DOCUMENTS = [
    ("cgu", "Conditions générales d'utilisation", "2026-10", "/conditions-generales"),
    ("confidentialite", "Politique de confidentialité", "2026-10", "/confidentialite"),
    ("protection-donnees", "Protection des données personnelles", "2026-10", "/protection-des-donnees"),
]
VERSIONS = {code: version for code, _libelle, version, _route in DOCUMENTS}


def _acceptees(user) -> set[str]:
    """Codes des documents dont la version en vigueur est acceptée."""
    lignes = AdhesionJuridique.objects.filter(user=user, document__in=VERSIONS).values_list("document", "version")
    return {document for document, version in lignes if VERSIONS.get(document) == version}


def adhesion_complete(user) -> bool:
    return _acceptees(user) >= set(VERSIONS)


def _adresse(request) -> str | None:
    transmise = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    return transmise or request.META.get("REMOTE_ADDR") or None


def _etat(user) -> dict:
    acceptees = {ligne.document: ligne for ligne in AdhesionJuridique.objects.filter(user=user, document__in=VERSIONS) if VERSIONS[ligne.document] == ligne.version}
    return {
        "complet": set(acceptees) >= set(VERSIONS),
        "documents": [
            {
                "code": code,
                "libelle": libelle,
                "version": version,
                "route": route,
                "acceptee": code in acceptees,
                "acceptee_le": acceptees[code].accepte_le.isoformat() if code in acceptees else None,
            }
            for code, libelle, version, route in DOCUMENTS
        ],
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def adhesion(request):
    """GET : état du parcours du compte. POST `{document, version}` : accepte un document, dans l'ordre."""
    if request.method == "GET":
        return Response(_etat(request.user))
    code = str(request.data.get("document") or "")
    version = str(request.data.get("version") or "")
    if code not in VERSIONS:
        return Response({"detail": "Document inconnu."}, status=400)
    if version != VERSIONS[code]:
        return Response({"detail": "Ce document a été mis à jour : relisez-le avant de l'accepter."}, status=409)
    acceptees = _acceptees(request.user)
    ordre = [c for c, *_reste in DOCUMENTS]
    if any(precedent not in acceptees for precedent in ordre[: ordre.index(code)]):
        return Response({"detail": "Acceptez d'abord les documents précédents."}, status=409)
    try:
        AdhesionJuridique.objects.get_or_create(user=request.user, document=code, version=version, defaults={"adresse_ip": _adresse(request)})
    except IntegrityError:  # deux clics simultanés : l'adhésion existe déjà
        pass
    return Response(_etat(request.user))
