"""États statistiques composés : des blocs (graphique, tableau, points à retenir) enregistrés et partagés."""

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import EtatStatistique
from .statistiques_dynamiques import CompositionInvalide, valider_configuration

MAX_BLOCS = 24
MAX_COMMENTAIRES = 10
TYPES_REDACTION = {"programme", "grade", "age", "famille", "statut", "libre"}


def _texte(valeur, longueur: int) -> str:
    return str(valeur or "").strip()[:longueur]


def valider_etat(brut) -> dict:
    """Garde de la configuration d'un état ce qui est connu et borné ; chaque tableau passe par la validation des tableaux croisés."""
    if not isinstance(brut, dict):
        raise CompositionInvalide("La configuration de l'état est invalide.")
    blocs = []
    for rang, bloc in enumerate((brut.get("blocs") if isinstance(brut.get("blocs"), list) else [])[:MAX_BLOCS]):
        if not isinstance(bloc, dict):
            continue
        commentaires = bloc.get("commentaires") if isinstance(bloc.get("commentaires"), list) else None
        blocs.append({
            "id": _texte(bloc.get("id"), 40) or f"bloc-{rang + 1}",
            "redaction": bloc.get("redaction") if bloc.get("redaction") in TYPES_REDACTION else "libre",
            "titre": _texte(bloc.get("titre"), 240),
            "sous_titre": _texte(bloc.get("sous_titre"), 240),
            "kicker": _texte(bloc.get("kicker"), 80),
            "titre_auto": bloc.get("titre_auto") is not False,
            # Anneau d'accompagnement : la répartition des totaux, à côté du graphique principal.
            "anneau": bloc.get("anneau") is True,
            # Null : les points à retenir sont rédigés à partir des données ; une liste : le texte est celui de l'utilisateur.
            "commentaires": None if commentaires is None else [_texte(item, 600) for item in commentaires[:MAX_COMMENTAIRES] if _texte(item, 600)],
            "config": valider_configuration(bloc.get("config") or {}),
        })
    if not blocs:
        raise CompositionInvalide("Un état comporte au moins un bloc.")
    return {
        "titre": _texte(brut.get("titre"), 160),
        "sous_titre": _texte(brut.get("sous_titre"), 300),
        "source": _texte(brut.get("source"), 300),
        "synthese": brut.get("synthese") is not False,
        "blocs": blocs,
    }


def _presenter(etat: EtatStatistique, user) -> dict:
    return {
        "id": etat.id,
        "nom": etat.nom,
        "modele": etat.modele,
        "configuration": etat.configuration,
        "mien": etat.auteur_id == user.id,
        "auteur": etat.auteur.get_full_name() or etat.auteur.username,
        "modifiee_le": etat.modifiee_le.isoformat() if etat.modifiee_le else None,
    }


def _corps(data) -> dict:
    nom = _texte(data.get("nom"), 160)
    if not nom:
        raise CompositionInvalide("Donnez un nom à l'état.")
    return {"nom": nom, "modele": _texte(data.get("modele"), 40), "configuration": valider_etat(data.get("configuration"))}


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def etats(request):
    if request.method == "GET":
        return Response([_presenter(item, request.user) for item in EtatStatistique.objects.select_related("auteur")])
    try:
        corps = _corps(request.data)
    except CompositionInvalide as exc:
        return Response({"detail": str(exc)}, status=400)
    etat = EtatStatistique.objects.create(auteur=request.user, **corps)
    return Response(_presenter(etat, request.user), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def etat(request, pk: int):
    objet = get_object_or_404(EtatStatistique.objects.select_related("auteur"), pk=pk)
    if objet.auteur_id != request.user.id:
        return Response({"detail": "Cet état ne vous appartient pas."}, status=403)
    if request.method == "DELETE":
        objet.delete()
        return Response(status=204)
    try:
        corps = _corps({**{"nom": objet.nom, "modele": objet.modele, "configuration": objet.configuration}, **request.data})
    except CompositionInvalide as exc:
        return Response({"detail": str(exc)}, status=400)
    for cle, valeur in corps.items():
        setattr(objet, cle, valeur)
    objet.save()
    return Response(_presenter(objet, request.user))
