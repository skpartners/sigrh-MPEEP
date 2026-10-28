"""Droits hors ligne par rôle : ce que chaque rôle est autorisé à faire sans connexion.

Deux endroits les appliquent :
- l'application, qui n'enregistre ni ne met en file ce que le rôle n'a pas le droit de faire hors ligne ;
- le serveur, qui refuse au rejeu une action différée (en-tête `X-Hors-Ligne`) dont le rôle n'a pas le droit. Retirer un droit
  dans les paramètres prend donc effet même pour une action déjà en attente sur un appareil.
"""

from __future__ import annotations

from functools import wraps

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .hors_ligne_catalogue import CAPACITES, CODES, FICHIER, normaliser
from .models import DroitHorsLigne, RoleMatrice
from .parametres import _droit, _peut_modifier
from .utilisateurs import RANG

ENTETE_DIFFERE = "X-Hors-Ligne"
REFUS_DIFFERE = "Votre rôle n'est pas autorisé à faire cette action hors ligne. Elle n'a pas été enregistrée."


def _capacites_de_ligne(ligne: RoleMatrice) -> list[str]:
    """Un rôle sans réglage enregistré reçoit tout : le retrait est un choix explicite des paramètres."""
    droit = getattr(ligne, "droit_hors_ligne", None)
    return normaliser(droit.capacites) if droit is not None else list(CODES)


def capacites_du_role(role: str) -> list[str]:
    """Un rôle hors matrice (l'administrateur, qui a tous les droits) n'est pas réglable : il garde tout."""
    ligne = RoleMatrice.objects.filter(role=role).select_related("droit_hors_ligne").first()
    return _capacites_de_ligne(ligne) if ligne else list(CODES)


def capacites_de(user) -> list[str]:
    """Un compte sans profil n'est pas concerné par la matrice : il garde tout, comme pour les habilitations."""
    profil = getattr(user, "profil", None)
    if profil is None:
        return list(CODES)
    return capacites_du_role(profil.role)


def exiger_hors_ligne(*capacites: str):
    """À poser sous `@api_view`. Une action rejouée depuis la file d'attente exige que le rôle ait toutes ces capacités
    (une action qui modifie le dossier et joint un fichier demande « Dossier » et « Pièces jointes »)."""

    def decorateur(vue):
        @wraps(vue)
        def enveloppe(request, *args, **kwargs):
            if request.headers.get(ENTETE_DIFFERE):
                exigees = set(capacites)
                # « Pièces jointes » ne se demande que si la requête porte vraiment un fichier.
                # Le flux d'une requête JSON reste intact : l'idempotence en lit encore le corps.
                if FICHIER in exigees and not (str(request.content_type or "").startswith("multipart/") and request.FILES):
                    exigees.discard(FICHIER)
            else:
                exigees = set()
            if exigees and not exigees <= set(capacites_de(request.user)):
                return Response({"detail": REFUS_DIFFERE, "code": "hors_ligne_refuse"}, status=403)
            return vue(request, *args, **kwargs)

        return enveloppe

    return decorateur


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mes_droits(request):
    return Response({"capacites": capacites_de(request.user)})


def _matrice(user) -> dict:
    return {
        "peut_modifier": _peut_modifier(user),
        "capacites": [{"code": code, "libelle": libelle, "aide": aide} for code, libelle, aide in CAPACITES],
        "roles": [
            {"id": ligne.pk, "role": ligne.role, "description": ligne.description, "capacites": _capacites_de_ligne(ligne)}
            for ligne in RoleMatrice.objects.select_related("droit_hors_ligne")
        ],
    }


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def parametres_hors_ligne(request):
    profil = getattr(request.user, "profil", None)
    if profil is None or RANG.get(_droit(request.user), 0) < RANG["lecture"]:
        return Response({"detail": "Cette rubrique est hors de votre habilitation."}, status=403)
    if request.method == "GET":
        return Response(_matrice(request.user))

    if not _peut_modifier(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    capacite = str(request.data.get("capacite") or "")
    if capacite not in CODES:
        return Response({"detail": "Cette capacité n'existe pas."}, status=400)
    autorise = request.data.get("autorise")
    if not isinstance(autorise, bool):
        return Response({"detail": "Indiquez si la capacité est autorisée ou non."}, status=400)
    ligne = RoleMatrice.objects.filter(pk=request.data.get("role")).first()
    if ligne is None:
        return Response({"detail": "Ce rôle n'est pas dans la matrice."}, status=404)
    actuelles = set(_capacites_de_ligne(ligne))
    if autorise:
        actuelles.add(capacite)
    else:
        actuelles.discard(capacite)
    DroitHorsLigne.objects.update_or_create(role=ligne, defaults={"capacites": normaliser(actuelles)})
    return Response(_matrice(request.user))
