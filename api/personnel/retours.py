"""Veille des retours : la veille, l'agent et son supérieur sont prévenus."""

import re
from datetime import datetime, timedelta

from django.contrib.auth.models import User
from django.utils import timezone

from .formation import etat_inscription
from .models import Absence, Demande, InscriptionFormation, Notification, PlanConge, RappelRetour

_PERIODE = re.compile(r"du (\d{2}/\d{2}/\d{4}) au (\d{2}/\d{2}/\d{4})")
_CONGES_TENUS = {
    Absence.Instruction.SIGNE,
    Absence.Instruction.APPROBATION_AUTO,
    Absence.Instruction.REMPLACEMENT,
}
_LIENS = {
    "congé": "/app/carrieres/conges",
    "absence": "/app/carrieres/absences",
    "formation": "/app/formation",
}
_TITRES = {
    "congé": ("Reprise de congé", "Reprise de congé dans votre équipe"),
    "absence": ("Retour d'absence", "Retour d'absence dans votre équipe"),
    "formation": ("Retour de formation", "Retour de formation dans votre équipe"),
}


def surveiller_retours() -> int:
    """Prévient l'agent et son supérieur la veille du retour, ou le jour même si la veille a été manquée."""
    aujourd_hui = timezone.localdate()
    hier = aujourd_hui - timedelta(days=1)
    comptes: dict[str, User | None] = {}
    vus: set[str] = set()
    envois = 0
    for item in Absence.objects.filter(fin__gte=hier, fin__lte=aujourd_hui).select_related("agent"):
        nature = _nature_absence(item)
        if nature is None:
            continue
        envois += _annoncer(nature, item.agent.matricule, item.agent.nom_complet, item.nature, item.fin + timedelta(days=1), aujourd_hui, comptes, vus)
    for plan in PlanConge.objects.filter(palier=PlanConge.Palier.PUBLIE, fin__gte=hier, fin__lte=aujourd_hui).select_related("agent"):
        nom = plan.agent.get_full_name() or plan.agent.username
        envois += _annoncer("congé", plan.agent.username, nom, "Congé annuel", plan.fin + timedelta(days=1), aujourd_hui, comptes, vus)
    for demande in Demande.objects.filter(categorie="conge").select_related("agent"):
        if not _close(demande.etape):
            continue
        reprise = _reprise(demande)
        if reprise is None or not hier < reprise <= aujourd_hui + timedelta(days=1):
            continue
        envois += _annoncer("congé", demande.agent.matricule, demande.agent.nom_complet, demande.nature, reprise, aujourd_hui, comptes, vus)
    inscriptions = InscriptionFormation.objects.filter(
        session__annulee=False, session__date_fin__gte=hier, session__date_fin__lte=aujourd_hui,
    ).select_related("session", "demande__agent")
    for inscription in inscriptions:
        if inscription.present is False or etat_inscription(inscription) != "retenue":
            continue
        session = inscription.session
        agent = inscription.demande.agent
        envois += _annoncer("formation", agent.matricule, agent.nom_complet, session.libelle, session.date_fin + timedelta(days=1), aujourd_hui, comptes, vus)
    return envois


def _nature_absence(item: Absence) -> str | None:
    if item.instruction:
        return "congé" if item.instruction in _CONGES_TENUS else None
    if item.type_autorisation:
        return "absence" if item.decision == Absence.Decision.VALIDEE else None
    statut = item.statut.lower()
    if "rejet" in statut or "attente" in statut or "instruction" in statut:
        return None
    if "cong" in item.nature.lower():
        return "congé"
    return "absence"


def _close(etape: str) -> bool:
    normalise = etape.lower().replace("é", "e").replace("ô", "o")
    return "etape 5" in normalise or "notifie" in normalise or "clotur" in normalise


def _reprise(demande: Demande):
    visa = demande.visas.order_by("ordre").first()
    if visa is None:
        return None
    trouve = _PERIODE.search(visa.commentaire or "")
    if not trouve:
        return None
    try:
        return datetime.strptime(trouve.group(2), "%d/%m/%Y").date()
    except ValueError:
        return None


def _annoncer(nature: str, matricule: str, nom: str, libelle: str, retour, aujourd_hui, comptes: dict, vus: set[str]) -> int:
    if retour < aujourd_hui or retour > aujourd_hui + timedelta(days=1):
        return 0
    cle = f"{nature}:{matricule}:{retour.isoformat()}"
    if cle in vus:
        return 0
    vus.add(cle)
    compte = _compte(matricule, comptes)
    superieur = compte.profil.superieur if compte is not None and hasattr(compte, "profil") else None
    quand = f"aujourd'hui, le {retour:%d/%m/%Y}" if retour == aujourd_hui else f"demain, le {retour:%d/%m/%Y}"
    titre_agent, titre_chef = _TITRES[nature]
    detail = f" {libelle}." if libelle else ""
    envois = 0
    if _poser(compte, cle, titre_agent, f"Vous reprenez {quand}.{detail}", _LIENS[nature]):
        envois += 1
    if superieur is not None and (compte is None or superieur.pk != compte.pk):
        if _poser(superieur, cle, titre_chef, f"{nom} reprend {quand}.{detail}", _LIENS[nature]):
            envois += 1
    return envois


def _compte(matricule: str, comptes: dict) -> User | None:
    if matricule not in comptes:
        comptes[matricule] = (
            User.objects.filter(username__iexact=matricule).select_related("profil__superieur").first()
        )
    return comptes[matricule]


def _poser(user, cle: str, titre: str, message: str, lien: str) -> bool:
    if user is None:
        return False
    _, cree = RappelRetour.objects.get_or_create(destinataire=user, cle=cle)
    if not cree:
        return False
    Notification.objects.create(
        destinataire=user, categorie=Notification.Categorie.DEMANDE, titre=titre,
        message=message[:280], lien=lien, urgente=True, creee_le=timezone.now(),
    )
    return True
