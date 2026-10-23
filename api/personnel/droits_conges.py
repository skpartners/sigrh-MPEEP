"""Droits de congé annuel par exercice : le plus ancien exercice se consomme en premier."""

from .models import DroitConge


def exercice_a_attribuer(agent) -> int | None:
    """Exercice le plus ancien qui compte encore des jours : c'est celui dont relève le prochain congé annuel."""
    for droit in DroitConge.objects.filter(agent=agent).order_by("annee"):
        if droit.restant > 0:
            return droit.annee
    return None


def consommer(agent, jours: int) -> None:
    """Impute des jours de congé annuel pris sur les exercices, du plus ancien au plus récent."""
    reste = jours
    for droit in DroitConge.objects.filter(agent=agent).order_by("annee"):
        if reste <= 0:
            break
        pris = min(droit.restant, reste)
        if pris:
            droit.jours_pris += pris
            droit.save(update_fields=["jours_pris"])
            reste -= pris


def detail(agent) -> list[dict]:
    return [{"annee": droit.annee, "dus": droit.jours_dus, "pris": droit.jours_pris, "restant": droit.restant} for droit in DroitConge.objects.filter(agent=agent).order_by("annee")]
