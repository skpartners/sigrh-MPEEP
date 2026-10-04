"""Signature apposée : copie figée de l'image déposée par le responsable au moment du visa.

La signature du profil est remplacée (et l'ancien fichier supprimé) quand le responsable en
dépose une nouvelle : chaque visa garde donc sa propre copie, celle qui figurait au jour du visa.
"""

from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone


def copie_signature(user) -> str:
    """Copie la signature du responsable et renvoie le nom du fichier stocké ("" sans signature)."""
    fichier = getattr(getattr(user, "profil", None), "signature", None)
    if not fichier:
        return ""
    jour = timezone.localdate()
    with fichier.open("rb") as source:
        contenu = source.read()
    return default_storage.save(f"visas/{jour:%Y/%m}/{Path(fichier.name).name}", ContentFile(contenu))
