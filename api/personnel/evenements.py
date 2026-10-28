"""Profil agent, onglet « Événements » : ce que l'équipe de communication RH a diffusé, lisible sans passer par son module."""

from pathlib import Path

from django.contrib.auth.models import User
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .communication import NATURES, URGENCES, _destinataires, _quand
from .models import Agent, LecturePublication, Notification, Publication

P = Publication.Perimetre


def _visible_pour(user, publication: Publication) -> bool:
    """Une publication diffusée se lit si le périmètre visé comprend le compte."""
    if publication.statut != Publication.Statut.DIFFUSE:
        return False
    if publication.perimetre == P.TOUS:
        return True
    profil = getattr(user, "profil", None)
    if publication.perimetre == P.CADRES:
        agent = Agent.objects.filter(matricule=user.username).only("categorie").first()
        return agent is not None and agent.categorie.upper().startswith("A")
    return profil is not None and "ressource" in (profil.fonction or "").lower()


def _publications(user) -> list[Publication]:
    diffusees = Publication.objects.filter(statut=Publication.Statut.DIFFUSE).order_by("-publiee_le", "-id")[:200]
    return [item for item in diffusees if _visible_pour(user, item)]


def _ligne(publication: Publication, lues: set[int]) -> dict:
    return {
        "id": publication.id,
        "reference": publication.reference,
        "nature": publication.nature,
        "nature_libelle": NATURES[publication.nature],
        "urgence": publication.urgence,
        "urgence_libelle": URGENCES[publication.urgence],
        "intitule": publication.intitule,
        "corps": publication.corps,
        "signataire": publication.signataire,
        "echeance": publication.echeance.isoformat() if publication.echeance else None,
        "publiee_le": timezone.localtime(publication.publiee_le).isoformat() if publication.publiee_le else None,
        "publiee_libelle": _quand(publication.publiee_le or publication.creee_le),
        "piece_nom": Path(publication.piece.name).name if publication.piece else "",
        "lue": publication.id in lues,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def evenements(request):
    """Communications diffusées à l'utilisateur, les plus récentes d'abord ; aucune habilitation de communication n'est requise."""
    publications = _publications(request.user)
    lues = set(LecturePublication.objects.filter(lecteur=request.user).values_list("publication_id", flat=True))
    return Response({"evenements": [_ligne(item, lues) for item in publications]})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marquer_lu(request, pk: int):
    """L'ouverture du détail vaut accusé de lecture, comme dans le registre de la communication."""
    publication = get_object_or_404(Publication, pk=pk)
    if not _visible_pour(request.user, publication):
        return Response({"detail": "Cette publication ne vous est pas destinée."}, status=403)
    LecturePublication.objects.get_or_create(publication=publication, lecteur=request.user)
    # Lire la publication éteint aussi la notification qui l'annonçait.
    Notification.objects.filter(destinataire=request.user, lien=lien_evenement(publication), lue=False).update(lue=True)
    return Response({"id": publication.id, "lue": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def piece(request, pk: int):
    publication = get_object_or_404(Publication, pk=pk)
    if not _visible_pour(request.user, publication):
        return Response({"detail": "Cette publication ne vous est pas destinée."}, status=403)
    if not publication.piece:
        return Response({"detail": "Cette publication n'a pas de pièce jointe."}, status=404)
    return FileResponse(publication.piece.open("rb"), as_attachment=True, filename=Path(publication.piece.name).name)


def lien_evenement(publication: Publication) -> str:
    """Route ouverte au clic d'une notification : l'onglet Événements du profil, sur la publication concernée."""
    return f"/app/agents?onglet=evenements&evenement={publication.id}"


def prevenir_destinataires(publication: Publication, auteur=None) -> int:
    """À la diffusion, chaque destinataire reçoit une notification qui l'amène sur l'onglet Événements de son profil."""
    visees = _destinataires()[publication.perimetre]
    comptes = User.objects.filter(is_active=True, username__in=visees, profil__isnull=False)
    if auteur is not None:
        comptes = comptes.exclude(pk=auteur.pk)
    maintenant = timezone.now()
    evenement = publication.nature == Publication.Nature.EVENEMENT
    notifications = [
        Notification(
            destinataire=compte,
            categorie=Notification.Categorie.SYSTEME,
            titre="Nouvel événement" if evenement else "Nouvelle communication de la DRH",
            message=publication.intitule[:280],
            lien=lien_evenement(publication),
            urgente=publication.urgence == Publication.Urgence.URGENT,
            creee_le=maintenant,
        )
        for compte in comptes
    ]
    Notification.objects.bulk_create(notifications)
    return len(notifications)
