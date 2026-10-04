"""Messagerie interne : échanges entre les comptes du SIGRH.

Un utilisateur ne voit que les conversations auxquelles il participe ; toute autre conversation
répond 404, sans révéler qu'elle existe.
"""

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Conversation, Message, Participation

LONGUEUR_MAX = 2000


def personne(user: User) -> dict:
    profil = getattr(user, "profil", None)
    # Les comptes d'agents suivent la convention administrative du SIGRH : « NOM Prénoms »
    # (nom en capitales), comme dans les dossiers ; les autres comptes gardent « Prénom Nom ».
    administratif = bool(user.last_name) and user.last_name == user.last_name.upper()
    ordre = (user.last_name, user.first_name) if administratif else (user.first_name, user.last_name)
    nom_complet = " ".join(mot for mot in ordre if mot) or user.username
    return {
        "id": user.id,
        "matricule": user.username,
        "nom_complet": nom_complet,
        "initiales": "".join(mot[0] for mot in ordre if mot).upper() or nom_complet[:2].upper(),
        "fonction": profil.fonction if profil else "",
        "organisme": (profil.organisme.sigle or profil.organisme.nom) if profil else "",
    }


def _message(message: Message, moi: User) -> dict:
    return {
        "id": message.id,
        "texte": message.texte,
        "envoye_le": message.envoye_le.isoformat(),
        "auteur": personne(message.auteur),
        "de_moi": message.auteur_id == moi.id,
    }


def _non_lus(conversation: Conversation, participation: Participation) -> int:
    messages = conversation.messages.exclude(auteur_id=participation.utilisateur_id)
    if participation.lu_jusqu_a:
        messages = messages.filter(envoye_le__gt=participation.lu_jusqu_a)
    return messages.count()


def _conversation(conversation: Conversation, moi: User) -> dict:
    participation = next(p for p in conversation.participations.all() if p.utilisateur_id == moi.id)
    autres = [p.utilisateur for p in conversation.participations.all() if p.utilisateur_id != moi.id]
    dernier = conversation.messages.select_related("auteur", "auteur__profil", "auteur__profil__organisme").last()
    return {
        "id": conversation.id,
        "titre": conversation.sujet or ", ".join(personne(u)["nom_complet"] for u in autres),
        "groupe": len(autres) > 1,
        "interlocuteurs": [personne(u) for u in autres],
        "dernier_message": _message(dernier, moi) if dernier else None,
        "non_lus": _non_lus(conversation, participation),
        "mise_a_jour": conversation.mise_a_jour.isoformat(),
    }


def _mes_conversations(user: User):
    return (
        Conversation.objects.filter(participations__utilisateur=user)
        .prefetch_related("participations__utilisateur__profil__organisme")
        .distinct()
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversations(request):
    if request.method == "GET":
        rows = [_conversation(item, request.user) for item in _mes_conversations(request.user)]
        return Response({"non_lus": sum(row["non_lus"] for row in rows), "conversations": rows})

    # POST : ouvrir (ou retrouver) l'échange à deux avec un collègue.
    try:
        destinataire = User.objects.get(pk=int(request.data.get("destinataire")), is_active=True)
    except (TypeError, ValueError, User.DoesNotExist):
        return Response({"detail": "Destinataire introuvable."}, status=400)
    if destinataire == request.user:
        return Response({"detail": "Vous ne pouvez pas vous écrire à vous-même."}, status=400)
    existante = (
        Conversation.objects.filter(sujet="")
        .annotate(total=Count("participations"))
        .filter(total=2, participations__utilisateur=request.user)
        .filter(participations__utilisateur=destinataire)
        .first()
    )
    if existante is None:
        with transaction.atomic():
            existante = Conversation.objects.create(mise_a_jour=timezone.now())
            Participation.objects.bulk_create(
                [Participation(conversation=existante, utilisateur=u, lu_jusqu_a=timezone.now()) for u in (request.user, destinataire)]
            )
    conversation = _mes_conversations(request.user).get(pk=existante.pk)
    return Response(_conversation(conversation, request.user), status=201)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def messages(request, pk: int):
    conversation = get_object_or_404(_mes_conversations(request.user), pk=pk)
    if request.method == "GET":
        rows = conversation.messages.select_related("auteur", "auteur__profil", "auteur__profil__organisme")
        return Response({"conversation": _conversation(conversation, request.user), "messages": [_message(m, request.user) for m in rows]})

    texte = str(request.data.get("texte") or "").strip()
    if not texte:
        return Response({"detail": "Le message est vide."}, status=400)
    if len(texte) > LONGUEUR_MAX:
        return Response({"detail": f"Le message dépasse {LONGUEUR_MAX} caractères."}, status=400)
    maintenant = timezone.now()
    with transaction.atomic():
        message = Message.objects.create(conversation=conversation, auteur=request.user, texte=texte, envoye_le=maintenant)
        Conversation.objects.filter(pk=conversation.pk).update(mise_a_jour=maintenant)
        # Écrire vaut lecture de tout ce qui précède.
        Participation.objects.filter(conversation=conversation, utilisateur=request.user).update(lu_jusqu_a=maintenant)
    return Response(_message(message, request.user), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marquer_lu(request, pk: int):
    conversation = get_object_or_404(_mes_conversations(request.user), pk=pk)
    Participation.objects.filter(conversation=conversation, utilisateur=request.user).update(lu_jusqu_a=timezone.now())
    # Les autres onglets du même utilisateur effacent aussi leurs compteurs.
    # Import local : temps_reel importe déjà ce module (dépendance circulaire).
    from .temps_reel import diffuser

    diffuser([request.user.id], {"type": "messagerie.lu", "conversation_id": conversation.id})
    return Response({"id": conversation.id, "non_lus": 0})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def annuaire(request):
    """Collègues joignables par la messagerie (comptes actifs avec un profil)."""
    q = str(request.query_params.get("q") or "").strip()
    rows = User.objects.filter(is_active=True, profil__isnull=False).exclude(pk=request.user.pk).select_related("profil__organisme")
    if q:
        rows = rows.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(username__icontains=q) | Q(profil__fonction__icontains=q))
    return Response([personne(u) for u in rows.order_by("last_name", "first_name")[:30]])
