"""Compte retenu le temps d'une requête, pour le pied des PDF."""

from contextvars import ContextVar

_AUTEUR: ContextVar[str] = ContextVar("auteur_pdf", default="")


def noter_auteur(user) -> None:
    if user is None or not getattr(user, "is_authenticated", False):
        _AUTEUR.set("")
        return
    nom = (user.get_full_name() or "").strip()
    matricule = user.get_username()
    _AUTEUR.set(f"{nom} · {matricule}" if nom else matricule)


def oublier_auteur() -> None:
    _AUTEUR.set("")


def auteur_courant() -> str:
    return _AUTEUR.get()
