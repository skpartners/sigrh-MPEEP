"""Droits de congé annuel par exercice.

En principe, un agent ne prend en année N que les congés de N-1, aux dates arrêtées par la campagne. Un exercice plus ancien
(N-2…) est un reliquat : l'agent en choisit lui-même les dates de départ, en N, et le DRH peut l'annuler.
"""

from django.utils import timezone

from .models import DroitConge


def annee_courante() -> int:
    return timezone.localdate().year


def est_reliquat(annee: int) -> bool:
    """Un exercice antérieur à N-1 est un reliquat : il sort de la règle de la campagne."""
    return annee < annee_courante() - 1


def exercice_a_attribuer(agent) -> int | None:
    """Exercice dont relève le prochain congé annuel : N-1 s'il compte encore des jours, sinon le plus ancien qui en compte."""
    ouverts = [droit.annee for droit in DroitConge.objects.filter(agent=agent).order_by("annee") if droit.restant > 0]
    if not ouverts:
        return None
    return annee_courante() - 1 if annee_courante() - 1 in ouverts else ouverts[0]


def consommer(agent, jours: int, annee: int | None = None) -> None:
    """Impute des jours de congé annuel : d'abord sur l'exercice demandé, le surplus du plus ancien au plus récent."""
    reste = jours
    droits = list(DroitConge.objects.filter(agent=agent).order_by("annee"))
    if annee is not None:
        droits.sort(key=lambda droit: droit.annee != annee)
    for droit in droits:
        if reste <= 0:
            break
        pris = min(droit.restant, reste)
        if pris:
            droit.jours_pris += pris
            droit.save(update_fields=["jours_pris"])
            reste -= pris


def remettre_a_zero(agent, annee: int, par: str) -> tuple[int, str | None]:
    """Annule ce qui reste d'un reliquat. Retourne (jours retirés, message d'erreur)."""
    if not est_reliquat(annee):
        return 0, f"Seuls les exercices antérieurs à {annee_courante() - 1} peuvent être annulés : {annee} suit la campagne."
    droit = DroitConge.objects.filter(agent=agent, annee=annee).first()
    if droit is None or droit.restant <= 0:
        return 0, f"Aucun jour ne reste à annuler au titre de {annee}."
    retires = droit.restant
    droit.jours_dus = droit.jours_pris
    droit.remis_a_zero_le = timezone.localdate()
    droit.remis_a_zero_par = par[:160]
    droit.save(update_fields=["jours_dus", "remis_a_zero_le", "remis_a_zero_par"])
    agent.conges_acquis = max(agent.conges_acquis - retires, 0)
    agent.report_conges = max(agent.report_conges - retires, 0)
    agent.save(update_fields=["conges_acquis", "report_conges"])
    return retires, None


def detail(agent) -> list[dict]:
    return [
        {
            "annee": droit.annee,
            "dus": droit.jours_dus,
            "pris": droit.jours_pris,
            "restant": droit.restant,
            "reliquat": est_reliquat(droit.annee),
            "remis_a_zero_le": droit.remis_a_zero_le.isoformat() if droit.remis_a_zero_le else "",
        }
        for droit in DroitConge.objects.filter(agent=agent).order_by("annee")
    ]
