"""Messagerie interne : échanges entre les comptes du SIGRH, à la manière d'une messagerie instantanée.

Un utilisateur ne voit que les conversations auxquelles il participe ; toute autre conversation
répond 404, sans révéler qu'elle existe.

- Médias : photos, documents, notes vocales et vidéos se joignent aux messages. Pour ne pas saturer le disque,
  le fichier n'est gardé que 48 h (`CONSERVATION_MEDIAS_H`) ; passé ce délai il est supprimé et le message indique
  que le média a expiré. Le texte des messages, lui, se garde.
- Accusés : un message de l'utilisateur est « envoyé », « reçu » (le client de chaque destinataire l'a chargé)
  puis « lu ».
- Réponses citées, suppression d'un message pour tous (dans les 48 h), groupes, présence « en ligne » et
  « écrit… » (voir temps_reel.py).
"""

import io
import mimetypes
from datetime import timedelta
from pathlib import Path

from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Conversation, Message, Participation, PieceMessage

LONGUEUR_MAX = 2000
CONSERVATION_MEDIAS_H = 48
PIECES_MAX = 5
TAILLE_MAX_PIECE = 15 * 1024 * 1024
PARTICIPANTS_MAX = 50
SUJET_MAX = 160
PRESENCE_S = 75

EXTENSIONS = {
    "image": {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"},
    "audio": {".mp3", ".m4a", ".ogg", ".oga", ".wav", ".webm", ".opus", ".aac"},
    "video": {".mp4", ".mov", ".webm", ".mkv"},
    "document": {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".txt", ".csv", ".zip"},
}
TYPES_FORCES = {".webm": "audio/webm", ".opus": "audio/ogg", ".heic": "image/heic", ".oga": "audio/ogg"}
APERCU_COTE = 360


def cle_presence(user_id: int) -> str:
    return f"presence:{user_id}"


def en_ligne(user_id: int) -> bool:
    return bool(cache.get(cle_presence(user_id)))


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


def _piece(piece: PieceMessage) -> dict:
    return {
        "id": piece.id,
        "nom": piece.nom,
        "type": piece.type_contenu,
        "categorie": piece.categorie,
        "taille": piece.taille,
        "expiree": piece.expiree,
        "expire_le": piece.expire_le.isoformat(),
        "apercu": bool(piece.apercu) and not piece.expiree,
    }


def _extrait(message: Message) -> str:
    if message.supprime:
        return "Message supprimé"
    if message.texte:
        return message.texte
    pieces = list(message.pieces.all())
    if not pieces:
        return ""
    libelles = {"image": "Photo", "audio": "Message vocal", "video": "Vidéo", "document": pieces[0].nom}
    return libelles.get(pieces[0].categorie, "Fichier") if len(pieces) == 1 else f"{len(pieces)} fichiers"


def _statut(message: Message, autres: list[Participation]) -> str:
    """envoye, recu (chaque destinataire a chargé le message) ou lu (chacun l'a lu)."""
    if not autres:
        return "envoye"
    if all(p.lu_jusqu_a and p.lu_jusqu_a >= message.envoye_le for p in autres):
        return "lu"
    if all(p.recu_jusqu_a and p.recu_jusqu_a >= message.envoye_le for p in autres):
        return "recu"
    return "envoye"


def _message(message: Message, moi: User, autres: list[Participation] | None = None) -> dict:
    cite = message.reponse_a
    ligne = {
        "id": message.id,
        "texte": "" if message.supprime else message.texte,
        "envoye_le": message.envoye_le.isoformat(),
        "auteur": personne(message.auteur),
        "de_moi": message.auteur_id == moi.id,
        "supprime": message.supprime,
        "pieces": [] if message.supprime else [_piece(piece) for piece in message.pieces.all()],
        "reponse_a": {"id": cite.id, "auteur": personne(cite.auteur)["nom_complet"], "extrait": _extrait(cite)[:140]} if cite else None,
    }
    if message.auteur_id == moi.id and autres is not None:
        ligne["statut"] = _statut(message, autres)
    return ligne


def _non_lus(conversation: Conversation, participation: Participation) -> int:
    messages = conversation.messages.exclude(auteur_id=participation.utilisateur_id)
    if participation.lu_jusqu_a:
        messages = messages.filter(envoye_le__gt=participation.lu_jusqu_a)
    return messages.count()


def _conversation(conversation: Conversation, moi: User) -> dict:
    participation = next(p for p in conversation.participations.all() if p.utilisateur_id == moi.id)
    autres = [p.utilisateur for p in conversation.participations.all() if p.utilisateur_id != moi.id]
    dernier = conversation.messages.select_related("auteur", "auteur__profil", "auteur__profil__organisme").prefetch_related("pieces").last()
    resume = None
    if dernier:
        resume = {
            "id": dernier.id,
            "texte": _extrait(dernier),
            "envoye_le": dernier.envoye_le.isoformat(),
            "de_moi": dernier.auteur_id == moi.id,
            "auteur": personne(dernier.auteur),
        }
    return {
        "id": conversation.id,
        "titre": conversation.sujet or ", ".join(personne(u)["nom_complet"] for u in autres),
        "groupe": len(autres) > 1 or bool(conversation.sujet),
        "interlocuteurs": [personne(u) for u in autres],
        "en_ligne": len(autres) == 1 and en_ligne(autres[0].id),
        "dernier_message": resume,
        "non_lus": _non_lus(conversation, participation),
        "mise_a_jour": conversation.mise_a_jour.isoformat(),
    }


def _mes_conversations(user: User):
    return (
        Conversation.objects.filter(participations__utilisateur=user)
        .prefetch_related("participations__utilisateur__profil__organisme")
        .distinct()
    )


def _marquer_recu(user: User, conversations: list[Conversation]) -> None:
    """Le client de l'utilisateur vient de charger ces conversations : les messages qui s'y trouvent sont reçus."""
    from .temps_reel import diffuser

    maintenant = timezone.now()
    for conversation in conversations:
        participation = next((p for p in conversation.participations.all() if p.utilisateur_id == user.id), None)
        if participation is None:
            continue
        if participation.recu_jusqu_a and participation.recu_jusqu_a >= conversation.mise_a_jour:
            continue
        Participation.objects.filter(pk=participation.pk).update(recu_jusqu_a=maintenant)
        autres = [p.utilisateur_id for p in conversation.participations.all() if p.utilisateur_id != user.id]
        diffuser(autres, {"type": "messagerie.recu", "conversation_id": conversation.id})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def conversations(request):
    if request.method == "GET":
        liste = list(_mes_conversations(request.user))
        _marquer_recu(request.user, liste)
        rows = [_conversation(item, request.user) for item in liste]
        return Response({"non_lus": sum(row["non_lus"] for row in rows), "conversations": rows})

    # POST : ouvrir (ou retrouver) l'échange à deux avec un collègue, ou créer un groupe.
    if request.data.get("participants") is not None:
        return _creer_groupe(request)
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


def _creer_groupe(request):
    sujet = " ".join(str(request.data.get("sujet") or "").split())
    if not sujet:
        return Response({"detail": "Donnez un nom au groupe."}, status=400)
    if len(sujet) > SUJET_MAX:
        return Response({"detail": f"Le nom du groupe dépasse {SUJET_MAX} caractères."}, status=400)
    try:
        identifiants = {int(valeur) for valeur in request.data.get("participants") or []}
    except (TypeError, ValueError):
        return Response({"detail": "Participants invalides."}, status=400)
    identifiants.discard(request.user.id)
    membres = list(User.objects.filter(pk__in=identifiants, is_active=True))
    if len(membres) < 2:
        return Response({"detail": "Un groupe compte au moins trois personnes, vous comprise."}, status=400)
    if len(membres) + 1 > PARTICIPANTS_MAX:
        return Response({"detail": f"Un groupe compte {PARTICIPANTS_MAX} personnes au plus."}, status=400)
    maintenant = timezone.now()
    with transaction.atomic():
        conversation = Conversation.objects.create(sujet=sujet, mise_a_jour=maintenant)
        Participation.objects.bulk_create(
            [Participation(conversation=conversation, utilisateur=u, lu_jusqu_a=maintenant) for u in [request.user, *membres]]
        )
    return Response(_conversation(_mes_conversations(request.user).get(pk=conversation.pk), request.user), status=201)


def _categorie(nom: str) -> str | None:
    extension = Path(nom).suffix.lower()
    for categorie, extensions in EXTENSIONS.items():
        if extension in extensions:
            return categorie
    return None


def _apercu(fichier) -> ContentFile | None:
    """Vignette d'une image : l'écran de la conversation n'a pas à charger l'original de chaque photo."""
    try:
        from PIL import Image, ImageOps

        fichier.seek(0)
        image = ImageOps.exif_transpose(Image.open(fichier))
        image.thumbnail((APERCU_COTE, APERCU_COTE))
        tampon = io.BytesIO()
        image.convert("RGB").save(tampon, format="JPEG", quality=78, optimize=True)
        fichier.seek(0)
        return ContentFile(tampon.getvalue())
    except Exception:  # noqa: BLE001 : un format que Pillow ne lit pas (HEIC…) s'affiche sans vignette
        fichier.seek(0)
        return None


def _lire_pieces(request) -> tuple[list, Response | None]:
    fichiers = request.FILES.getlist("fichiers")
    if len(fichiers) > PIECES_MAX:
        return [], Response({"detail": f"Un message porte {PIECES_MAX} fichiers au plus."}, status=400)
    pieces = []
    for fichier in fichiers:
        categorie = _categorie(fichier.name)
        if categorie is None:
            return [], Response({"detail": f"« {fichier.name} » : ce type de fichier n'est pas accepté."}, status=400)
        if fichier.size > TAILLE_MAX_PIECE:
            return [], Response({"detail": f"« {fichier.name} » dépasse {TAILLE_MAX_PIECE // (1024 * 1024)} Mo."}, status=400)
        pieces.append((fichier, categorie))
    return pieces, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def messages(request, pk: int):
    conversation = get_object_or_404(_mes_conversations(request.user), pk=pk)
    autres = [p for p in conversation.participations.all() if p.utilisateur_id != request.user.id]
    if request.method == "GET":
        _marquer_recu(request.user, [conversation])
        rows = conversation.messages.select_related("auteur", "auteur__profil", "auteur__profil__organisme", "reponse_a", "reponse_a__auteur").prefetch_related("pieces")
        return Response({"conversation": _conversation(conversation, request.user), "messages": [_message(m, request.user, autres) for m in rows]})

    texte = str(request.data.get("texte") or "").strip()
    pieces, erreur = _lire_pieces(request)
    if erreur:
        return erreur
    if not texte and not pieces:
        return Response({"detail": "Le message est vide."}, status=400)
    if len(texte) > LONGUEUR_MAX:
        return Response({"detail": f"Le message dépasse {LONGUEUR_MAX} caractères."}, status=400)
    cite = None
    if request.data.get("reponse_a"):
        try:
            cite = conversation.messages.get(pk=int(request.data["reponse_a"]))
        except (TypeError, ValueError, Message.DoesNotExist):
            return Response({"detail": "Le message cité est introuvable."}, status=400)
    maintenant = timezone.now()
    with transaction.atomic():
        message = Message.objects.create(conversation=conversation, auteur=request.user, texte=texte, envoye_le=maintenant, reponse_a=cite)
        expire = maintenant + timedelta(hours=CONSERVATION_MEDIAS_H)
        for fichier, categorie in pieces:
            type_contenu = TYPES_FORCES.get(Path(fichier.name).suffix.lower()) or mimetypes.guess_type(fichier.name)[0] or "application/octet-stream"
            piece = PieceMessage(message=message, nom=Path(fichier.name).name[:200], type_contenu=type_contenu, taille=fichier.size, categorie=categorie, expire_le=expire)
            piece.fichier.save(Path(fichier.name).name, fichier, save=False)
            if categorie == "image":
                vignette = _apercu(fichier)
                if vignette is not None:
                    piece.apercu.save(f"{Path(fichier.name).stem}.jpg", vignette, save=False)
            piece.save()
        Conversation.objects.filter(pk=conversation.pk).update(mise_a_jour=maintenant)
        # Écrire vaut lecture de tout ce qui précède.
        Participation.objects.filter(conversation=conversation, utilisateur=request.user).update(lu_jusqu_a=maintenant, recu_jusqu_a=maintenant)
    message = Message.objects.select_related("auteur", "reponse_a", "reponse_a__auteur").prefetch_related("pieces").get(pk=message.pk)
    return Response(_message(message, request.user, autres), status=201)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def supprimer_message(request, pk: int):
    """Supprime un de ses messages pour tous, dans les 48 h : le texte et les médias disparaissent."""
    from .temps_reel import diffuser

    message = get_object_or_404(Message.objects.select_related("conversation"), pk=pk, auteur=request.user)
    if timezone.now() - message.envoye_le > timedelta(hours=CONSERVATION_MEDIAS_H):
        return Response({"detail": "Ce message est trop ancien pour être supprimé."}, status=409)
    with transaction.atomic():
        for piece in message.pieces.all():
            _effacer_fichiers(piece)
            piece.expiree = True
            piece.save(update_fields=["fichier", "apercu", "expiree"])
        message.texte, message.supprime = "", True
        message.save(update_fields=["texte", "supprime"])
    participants = Participation.objects.filter(conversation_id=message.conversation_id).values_list("utilisateur_id", flat=True)
    diffuser(participants, {"type": "messagerie.lu", "conversation_id": message.conversation_id})
    return Response({"id": message.id, "supprime": True})


def _effacer_fichiers(piece: PieceMessage) -> None:
    for champ in (piece.fichier, piece.apercu):
        if champ:
            try:
                champ.delete(save=False)
            except OSError:
                pass


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def piece(request, pk: int):
    """Média d'un message, pour les participants de la conversation. `?apercu=1` : la vignette d'une image."""
    element = get_object_or_404(PieceMessage.objects.select_related("message"), pk=pk)
    if not _mes_conversations(request.user).filter(pk=element.message.conversation_id).exists():
        return Response({"detail": "Fichier introuvable."}, status=404)
    if element.expiree or not element.fichier:
        return Response({"detail": "Ce média a expiré : les fichiers de la messagerie ne se gardent que 48 h."}, status=410)
    vignette = request.query_params.get("apercu") == "1" and element.apercu
    champ = element.apercu if vignette else element.fichier
    reponse = FileResponse(champ.open("rb"), content_type="image/jpeg" if vignette else element.type_contenu)
    inline = element.categorie in {"image", "audio", "video"} or element.type_contenu == "application/pdf"
    reponse["Content-Disposition"] = f'{"inline" if inline else "attachment"}; filename="{element.nom}"'
    reponse["Cache-Control"] = "private, max-age=3600"
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marquer_lu(request, pk: int):
    from .temps_reel import diffuser

    conversation = get_object_or_404(_mes_conversations(request.user), pk=pk)
    maintenant = timezone.now()
    Participation.objects.filter(conversation=conversation, utilisateur=request.user).update(lu_jusqu_a=maintenant, recu_jusqu_a=maintenant)
    # Les autres onglets du même utilisateur effacent aussi leurs compteurs.
    diffuser([request.user.id], {"type": "messagerie.lu", "conversation_id": conversation.id})
    # Les auteurs voient passer leurs coches en « lu ».
    autres = [p.utilisateur_id for p in conversation.participations.all() if p.utilisateur_id != request.user.id]
    diffuser(autres, {"type": "messagerie.recu", "conversation_id": conversation.id})
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


# --- Tâche planifiée : suppression des médias de plus de 48 h ----------------------------------


def purger_medias() -> int:
    """Supprime les fichiers expirés (original et vignette) et le marque sur la ligne. Retourne le nombre de médias retirés."""
    total = 0
    for element in PieceMessage.objects.filter(expiree=False, expire_le__lte=timezone.now()).iterator(chunk_size=200):
        _effacer_fichiers(element)
        element.expiree = True
        element.save(update_fields=["fichier", "apercu", "expiree"])
        total += 1
    return total
