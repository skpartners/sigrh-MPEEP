"""Surveillance des échéances de congés : un rappel à J-3, la veille et le jour même."""

import logging
import os
import sys
import threading
import time

from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import close_old_connections
from django.utils import timezone

from .models import CampagnePlanConge, PlanConge, RappelEcheance
from .planification import _avancer, _campagne, _est_drh, _est_rh, _notifier, _participants, _prochain

logger = logging.getLogger(__name__)
_fil = None


def _code(jours: int) -> str | None:
    if jours < 0 or jours > 3:
        return None
    if jours >= 2:
        return "j3"
    if jours == 1:
        return "j1"
    return "j0"


def _reste(jours: int, echeance) -> str:
    quand = echeance.strftime("%d/%m/%Y")
    if jours <= 0:
        return f"C'est aujourd'hui la date limite, le {quand}."
    if jours == 1:
        return f"Il reste 1 jour, jusqu'au {quand}."
    return f"Il reste {jours} jours, jusqu'au {quand}."


def _envoyer(campagne, cle: str, user, titre: str, message: str, jours: int) -> bool:
    if user is None:
        return False
    _, cree = RappelEcheance.objects.get_or_create(campagne=campagne, destinataire=user, cle=cle)
    if not cree:
        return False
    _notifier(user, titre, message, urgente=jours <= 1)
    return True


def surveiller() -> int:
    """Prévient les échéances de campagne et les retours du lendemain. Retourne le nombre de rappels créés."""
    from .retours import surveiller_retours

    envois = surveiller_retours()
    campagne = _campagne()
    if campagne is None or campagne.statut in {CampagnePlanConge.Statut.ACCORD, CampagnePlanConge.Statut.PUBLIEE}:
        return envois
    _avancer(campagne)
    campagne.refresh_from_db()
    if campagne.statut == CampagnePlanConge.Statut.PUBLIEE:
        return envois
    aujourd_hui = timezone.localdate()
    if campagne.statut == CampagnePlanConge.Statut.OUVERTE:
        envois += _rappeler_agents(campagne, aujourd_hui)
    if campagne.statut in {CampagnePlanConge.Statut.OUVERTE, CampagnePlanConge.Statut.REMONTEE}:
        envois += _rappeler_chefs(campagne, aujourd_hui)
        envois += _rappeler_rh(campagne, aujourd_hui)
    if campagne.statut == CampagnePlanConge.Statut.SOUMIS:
        envois += _rappeler_drh(campagne, aujourd_hui)
    return envois


def _rappeler_agents(campagne, aujourd_hui) -> int:
    jours = (campagne.limite_agents - aujourd_hui).days
    code = _code(jours)
    if code is None:
        return 0
    deja = set(campagne.plans.values_list("agent_id", flat=True))
    envois = 0
    for agent in _participants().exclude(id__in=deja):
        if _envoyer(
            campagne, f"agents:{code}", agent, "Choisissez vos congés",
            f"La campagne {campagne.exercice} est ouverte. {_reste(jours, campagne.limite_agents)}",
            jours,
        ):
            envois += 1
    return envois


def _rappeler_chefs(campagne, aujourd_hui) -> int:
    if aujourd_hui <= campagne.limite_agents:
        return 0
    paniers: dict[tuple, dict] = {}
    for plan in campagne.plans.filter(palier=PlanConge.Palier.HIERARCHIE, chez__isnull=False).select_related("chez"):
        echeance = plan.echeance or campagne.limite_hierarchie
        if aujourd_hui <= echeance:
            panier = paniers.setdefault((plan.chez_id, echeance), {"user": plan.chez, "date": echeance, "viser": 0, "fixer": 0})
            panier["viser"] += 1
    deja = set(campagne.plans.values_list("agent_id", flat=True))
    for agent in _participants().exclude(id__in=deja):
        palier, chez = _prochain(agent)
        echeance = campagne.limite_hierarchie if palier == PlanConge.Palier.HIERARCHIE else campagne.limite_rh
        if chez is not None and aujourd_hui <= echeance:
            panier = paniers.setdefault((chez.id, echeance), {"user": chez, "date": echeance, "viser": 0, "fixer": 0})
            panier["fixer"] += 1
    envois = 0
    for (identifiant, echeance), panier in paniers.items():
        jours = (echeance - aujourd_hui).days
        code = _code(jours)
        if code is None:
            continue
        detail = _detail_chef(panier["viser"], panier["fixer"])
        if _envoyer(
            campagne, f"hierarchie:{identifiant}:{echeance.isoformat()}:{code}", panier["user"],
            "Échéance de votre équipe", f"{detail} {_reste(jours, echeance)}", jours,
        ):
            envois += 1
    return envois


def _detail_chef(viser: int, fixer: int) -> str:
    morceaux = []
    if viser:
        morceaux.append(f"{viser} plan{'s' if viser > 1 else ''} à viser")
    if fixer:
        morceaux.append(f"{fixer} date{'s' if fixer > 1 else ''} à fixer")
    return (" et ".join(morceaux) + ".") if morceaux else "Des congés de votre équipe attendent votre visa."


def _rappeler_rh(campagne, aujourd_hui) -> int:
    jours = (campagne.limite_rh - aujourd_hui).days
    code = _code(jours)
    if code is None:
        return 0
    envois = 0
    for personne in _participants():
        if not _est_rh(personne):
            continue
        if _envoyer(
            campagne, f"rh:{code}", personne, "Échéance de l'équipe RH",
            f"L'ensemble des congés {campagne.exercice} doit être soumis au DRH. {_reste(jours, campagne.limite_rh)}",
            jours,
        ):
            envois += 1
    return envois


def _rappeler_drh(campagne, aujourd_hui) -> int:
    jours = (campagne.limite_drh - aujourd_hui).days
    code = _code(jours)
    if code is None:
        return 0
    envois = 0
    for personne in User.objects.filter(profil__isnull=False).select_related("profil__structure"):
        if not _est_drh(personne):
            continue
        if _envoyer(
            campagne, f"drh:{code}", personne, "Échéance du DRH",
            f"L'arrêté des congés {campagne.exercice} est à viser. {_reste(jours, campagne.limite_drh)}",
            jours,
        ):
            envois += 1
    return envois


def surveiller_si_besoin() -> int:
    """Au plus un passage par heure, lorsque l'application est consultée."""
    if not cache.add("sigrh-echeances-conges", "1", timeout=3600):
        return 0
    try:
        return surveiller()
    except Exception:
        logger.exception("Surveillance des échéances de congés")
        cache.delete("sigrh-echeances-conges")
        return 0


def demarrer_si_serveur() -> None:
    """Lance la tâche avec le serveur de développement. Les tests ne la démarrent pas."""
    global _fil
    if _fil is not None or "pytest" in sys.modules:
        return
    if os.environ.get("RUN_MAIN") != "true" and "--noreload" not in sys.argv:
        return
    _fil = threading.Thread(target=_boucle, name="echeances-conges", daemon=True)
    _fil.start()


def _boucle() -> None:
    time.sleep(5)
    while True:
        try:
            close_old_connections()
            surveiller()
        except Exception:
            logger.exception("Surveillance des échéances de congés")
        time.sleep(6 * 3600)
