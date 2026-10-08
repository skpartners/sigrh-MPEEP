"""Ouverture de la connexion à partir du compte administrateur déclaré dans l'environnement."""

from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.utils import OperationalError, ProgrammingError
from django.utils.text import slugify

from .models import Organisme, ParametresMinistere, Profil

_erreur = ""


def detail_ouverture() -> str:
    return _erreur


def connexion_active() -> bool:
    if getattr(settings, "CONNEXION_OUVERTE", False):
        return True
    objet = ParametresMinistere.objects.filter(pk=1).first()
    return bool(objet and objet.connexion_active and objet.admin_matricule)


def assurer_administrateur() -> None:
    """Crée le compte administrateur au premier démarrage, puis laisse le profil en être le maître."""
    global _erreur
    matricule = settings.ADMIN_MATRICULE
    mot_de_passe = settings.ADMIN_MOT_DE_PASSE
    if not matricule or not mot_de_passe:
        return
    try:
        if ParametresMinistere.objects.filter(pk=1, connexion_active=True).exclude(admin_matricule="").exists():
            _erreur = ""
            return
        validate_password(mot_de_passe)
        code = (slugify(settings.ADMIN_ORGANISME or "") or "dgpe")[:40]
        organisme, _cree = Organisme.objects.get_or_create(
            code=code,
            defaults={"nom": code, "sigle": code.upper()[:40]},
        )
        user, cree = User.objects.get_or_create(username=matricule[:150])
        if settings.ADMIN_PRENOMS:
            user.first_name = settings.ADMIN_PRENOMS[:150]
        if settings.ADMIN_NOM:
            user.last_name = settings.ADMIN_NOM[:150]
        user.is_staff = True
        user.set_password(mot_de_passe)
        user.save()
        fonction = (settings.ADMIN_FONCTION or "Administrateur")[:160]
        profil, _cree_profil = Profil.objects.get_or_create(
            user=user,
            defaults={"fonction": fonction, "role": "Administrateur", "organisme": organisme, "administrateur": True},
        )
        profil.administrateur = True
        profil.role = "Administrateur"
        profil.organisme = organisme
        profil.structure = None
        profil.superieur = None
        profil.interim = None
        profil.habilitations = None
        profil.precisions = None
        if cree or not profil.fonction:
            profil.fonction = fonction
        profil.save()
        objet, _ligne = ParametresMinistere.objects.get_or_create(pk=1)
        objet.connexion_active = True
        objet.admin_matricule = user.username
        objet.save(update_fields=["connexion_active", "admin_matricule"])
        _erreur = ""
    except ValidationError as exc:
        _erreur = " ".join(exc.messages)
    except (OperationalError, ProgrammingError):
        return
