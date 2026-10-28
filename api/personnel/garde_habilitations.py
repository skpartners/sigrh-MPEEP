"""Garde des habilitations : le menu grisé ne suffit pas, l'API refuse aussi ce que la matrice refuse.

Chaque écran de gestion ne s'appuie que sur ses propres routes. Quand la matrice refuse à un compte la rubrique
(la fonction, ou le module entier pour les écrans qui en dépendent), ses routes répondent 403, même appelées à la main.
Les routes que tout agent connecté utilise pour lui-même (profil, notifications, messagerie, demandes, collecte des besoins
de formation…) ne figurent pas ici : elles se règlent par leur propre périmètre.
"""

import functools

from django.http import JsonResponse
from django.urls.resolvers import URLPattern, URLResolver

from .authentification import JetonSigrh
from .utilisateurs import acces_menu

STATS = "Statistiques & RBAC"
CARRIERES = "Carrières & Actes"

# (préfixes de route, module, fonction ou None = une rubrique au moins du module doit rester ouverte, routes laissées libres)
REGLES: tuple[tuple[tuple[str, ...], str, str | None, tuple[str, ...]], ...] = (
    (("statistiques/",), STATS, "Statistiques", ()),
    (("dashboard/",), STATS, "Tableau de bord", ()),
    (("utilisateurs/",), STATS, "Comptes utilisateurs", ()),
    (("circuits/habilitations/",), STATS, "Habilitations", ()),
    (("circuits/configuration/", "circuits/elements/", "circuits/actes/"), STATS, "Circuits et habilitations", ()),
    # Un préfixe précédé de « = » désigne exactement cette route.
    (("=carrieres/", "carrieres/registres/", "avancements/"), CARRIERES, "Situation administrative", ()),
    (("carrieres/types-fin-carriere/",), CARRIERES, "Fin de carrière", ()),
    (("carrieres/discipline/",), CARRIERES, "Procédures disciplinaires", ()),
    (("carrieres/absences/", "absences/"), CARRIERES, "Absences", ()),
    (("carrieres/conges/",), CARRIERES, "Congés", ()),
    (("grh/bilan-carriere/",), CARRIERES, "Bilan de carrière", ()),
    # Le tableau « formation/ » nourrit aussi l'onglet Formation du profil, et la réponse à la collecte est celle de l'agent.
    (("formation/", "grh/formation/"), "Formations", None, ("formation/", "formation/collecte/repondre/")),
    (("grh/programmation/", "besoins/campagne/", "besoins/export/"), "GPEC", None, ()),
    (("=besoins/",), "GPEC", "Expression des besoins", ()),
    (("dotation/", "dotation-agents/"), "GPEC", "Recrutement", ()),
    # Structures, pôles, grades et emplois se gèrent depuis l'écran des structures. Le quorum d'un service se règle depuis le profil du chef.
    (("structures/", "poles/", "grades/", "emplois/"), STATS, "Structures du ministère", ("structures/<slug:code>/quorum/",)),
)

REFUS = "Votre habilitation ne donne pas accès à cette rubrique."


def _droit(acces: dict, module: str, fonction: str | None) -> str:
    if fonction:
        return acces["fonctions"].get(f"{module}|{fonction}") or acces["modules"].get(module, "refus")
    ouverts = [valeur for cle, valeur in acces["fonctions"].items() if cle.startswith(f"{module}|")]
    ouverts.append(acces["modules"].get(module, "refus"))
    return next((valeur for valeur in ouverts if valeur != "refus"), "refus")


def autorise(user, module: str, fonction: str | None) -> bool:
    """Un compte sans profil ou une route hors matrice ne sont pas concernés ; sinon la matrice décide."""
    profil = getattr(user, "profil", None)
    if profil is None:
        return True
    return _droit(acces_menu(profil), module, fonction) != "refus"


def _regle(route: str):
    for prefixes, module, fonction, libres in REGLES:
        if route in libres:
            continue
        if any(route == prefixe[1:] if prefixe.startswith("=") else route.startswith(prefixe) for prefixe in prefixes):
            return module, fonction
    return None


def _garder(vue, module: str, fonction: str | None):
    @functools.wraps(vue)
    def enveloppe(request, *args, **kwargs):
        try:
            identifie = JetonSigrh().authenticate(request)
        except Exception:  # jeton absent ou invalide : la vue répond elle-même 401
            identifie = None
        if identifie is not None and not autorise(identifie[0], module, fonction):
            return JsonResponse({"detail": REFUS}, status=403)
        return vue(request, *args, **kwargs)

    return enveloppe


def proteger(patterns: list) -> list:
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            proteger(pattern.url_patterns)
        elif isinstance(pattern, URLPattern):
            regle = _regle(str(pattern.pattern))
            if regle:
                pattern.callback = _garder(pattern.callback, *regle)
    return patterns
