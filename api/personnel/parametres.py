"""Identité et portrait officiel de la ministre, déposés dans les paramètres du ministère."""

from pathlib import Path

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Organisme, ParametresMinistere
from .utilisateurs import RANG, acces_menu

MODULE = "Statistiques & RBAC"
FONCTION = "Paramètres"
TAILLE_MAX = 5 * 1024 * 1024
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
CIVILITES = {"", "Madame", "Monsieur"}
NOM_MAX = 160
INACTIVITE_MIN = 1
INACTIVITE_MAX = 240
INACTIVITE_DEFAUT = 15


def _parametres() -> ParametresMinistere | None:
    return ParametresMinistere.objects.filter(pk=1).first()


def portrait_url() -> str:
    objet = _parametres()
    if objet is None or not objet.photo:
        return ""
    return objet.photo.url


def identite_ministre() -> dict:
    objet = _parametres()
    if objet is None:
        return {"civilite": "", "nom": ""}
    return {"civilite": objet.civilite, "nom": objet.nom}


def _droit(user) -> str:
    acces = acces_menu(user.profil)
    return acces["fonctions"].get(f"{MODULE}|{FONCTION}") or acces["modules"].get(MODULE, "refus")


def _peut_modifier(user) -> bool:
    return RANG.get(_droit(user), 0) >= RANG["saisie"]


def _compte_admin():
    objet = _parametres()
    matricule = objet.admin_matricule if objet else ""
    if not matricule:
        return objet, None
    return objet, User.objects.filter(username=matricule).select_related("profil__organisme").first()


def _connexion() -> dict:
    objet, compte = _compte_admin()
    profil = getattr(compte, "profil", None) if compte else None
    return {
        "active": bool(objet and objet.connexion_active and objet.admin_matricule),
        "matricule": objet.admin_matricule if objet else "",
        "nom": compte.last_name if compte else "",
        "prenoms": compte.first_name if compte else "",
        "fonction": profil.fonction if profil else "",
        "organisme": profil.organisme.code if profil else "",
    }


def inactivite_minutes() -> int:
    objet = _parametres()
    if objet is None:
        return INACTIVITE_DEFAUT
    return objet.inactivite_minutes or INACTIVITE_DEFAUT


def _ligne(user) -> dict:
    return {
        "photo_url": portrait_url(),
        "peut_modifier": _peut_modifier(user),
        "inactivite_minutes": inactivite_minutes(),
        "connexion": _connexion(),
        **identite_ministre(),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def parametres(request):
    return Response(_ligne(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_photo_ministre(request):
    if not _peut_modifier(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez une photo."}, status=400)
    if Path(fichier.name).suffix.lower() not in EXTENSIONS:
        return Response({"detail": "La photo doit être une image PNG, JPG ou WEBP."}, status=400)
    if fichier.size > TAILLE_MAX:
        return Response({"detail": "La photo dépasse 5 Mo."}, status=400)
    objet, _cree = ParametresMinistere.objects.get_or_create(pk=1)
    if objet.photo:
        objet.photo.delete(save=False)
    objet.photo = fichier
    objet.save(update_fields=["photo"])
    return Response(_ligne(request.user))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def retirer_photo_ministre(request):
    if not _peut_modifier(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    objet = _parametres()
    if objet is not None and objet.photo:
        objet.photo.delete(save=False)
        objet.photo = ""
        objet.save(update_fields=["photo"])
    return Response(_ligne(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enregistrer_identite_ministre(request):
    if not _peut_modifier(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    civilite = str(request.data.get("civilite") or "").strip()
    nom = str(request.data.get("nom") or "").strip()
    if civilite not in CIVILITES:
        return Response({"detail": "La civilité doit être Madame ou Monsieur."}, status=400)
    if len(nom) > NOM_MAX:
        return Response({"detail": "Le nom dépasse 160 caractères."}, status=400)
    objet, _cree = ParametresMinistere.objects.get_or_create(pk=1)
    objet.civilite = civilite
    objet.nom = nom
    objet.save(update_fields=["civilite", "nom"])
    return Response(_ligne(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enregistrer_connexion(request):
    if not _peut_modifier(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    objet, compte = _compte_admin()
    if objet is None or not objet.connexion_active or compte is None or not hasattr(compte, "profil"):
        return Response({"detail": "La connexion n'est pas encore activée."}, status=409)
    matricule = str(request.data.get("matricule") or "").strip()
    nom = str(request.data.get("nom") or "").strip()
    prenoms = str(request.data.get("prenoms") or "").strip()
    fonction = str(request.data.get("fonction") or "").strip() or "Administrateur"
    organisme_code = str(request.data.get("organisme") or "").strip()
    mot_de_passe = str(request.data.get("mot_de_passe") or "")
    confirmation = str(request.data.get("confirmation") or "")
    if not matricule or len(matricule) > 150:
        return Response({"detail": "Indiquez le matricule de l'administrateur."}, status=400)
    if len(nom) > 150 or len(prenoms) > 150 or len(fonction) > 160:
        return Response({"detail": "Un des champs dépasse la longueur autorisée."}, status=400)
    if User.objects.exclude(pk=compte.pk).filter(username=matricule).exists():
        return Response({"detail": "Ce matricule est déjà utilisé."}, status=400)
    organisme = Organisme.objects.filter(code=organisme_code).first()
    if organisme is None:
        return Response({"detail": "Choisissez l'organisme de rattachement."}, status=400)
    if mot_de_passe or confirmation:
        if mot_de_passe != confirmation:
            return Response({"detail": "La confirmation du mot de passe ne correspond pas."}, status=400)
        compte.username = matricule
        compte.last_name = nom
        compte.first_name = prenoms
        try:
            validate_password(mot_de_passe, compte)
        except ValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        compte.set_password(mot_de_passe)
    compte.username = matricule
    compte.last_name = nom
    compte.first_name = prenoms
    compte.save()
    profil = compte.profil
    profil.fonction = fonction
    profil.organisme = organisme
    profil.administrateur = True
    profil.role = "Administrateur"
    profil.structure = None
    profil.superieur = None
    profil.interim = None
    profil.habilitations = None
    profil.precisions = None
    profil.save()
    objet.admin_matricule = matricule
    objet.save(update_fields=["admin_matricule"])
    return Response(_ligne(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enregistrer_inactivite(request):
    if not _peut_modifier(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    texte = str(request.data.get("minutes") if request.data.get("minutes") is not None else "").strip()
    if not texte.isdigit():
        return Response({"detail": "Indiquez une durée en minutes."}, status=400)
    minutes = int(texte)
    if minutes < INACTIVITE_MIN or minutes > INACTIVITE_MAX:
        return Response(
            {"detail": f"Indiquez une durée entre {INACTIVITE_MIN} et {INACTIVITE_MAX} minutes."},
            status=400,
        )
    objet, _cree = ParametresMinistere.objects.get_or_create(pk=1)
    objet.inactivite_minutes = minutes
    objet.save(update_fields=["inactivite_minutes"])
    return Response(_ligne(request.user))
