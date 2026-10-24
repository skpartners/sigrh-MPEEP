"""Carrières · Positions administratives : détachements, mises à disposition, disponibilités, hors-cadre."""

from datetime import date

from pathlib import Path

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .visibilite import dans_le_perimetre
from .models import Agent, PositionAdministrative
from .informer import informer_position
from .parcours import peut_gerer_carriere, refus_carriere

SITUATION_NORMALE = "En activité"
EXTENSIONS_ACTE = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
TAILLE_MAX_ACTE = 5 * 1024 * 1024
TYPES = {code for code, _libelle in PositionAdministrative.Type.choices}
# Les types qui exigent une structure d'accueil.
AVEC_ACCUEIL = {"detachement", "mise_a_disposition", "hors_cadre"}


def position_row(item: PositionAdministrative, aujourd_hui: date | None = None) -> dict:
    aujourd_hui = aujourd_hui or timezone.localdate()
    en_cours = item.date_debut <= aujourd_hui and (item.date_fin is None or item.date_fin >= aujourd_hui)
    return {
        "id": item.id,
        "type": item.type,
        "type_libelle": item.get_type_display(),
        "structure_accueil": item.structure_accueil,
        "motif": item.motif,
        "date_debut": item.date_debut.isoformat(),
        "date_fin": item.date_fin.isoformat() if item.date_fin else "",
        "reference_acte": item.reference_acte,
        "detail": item.detail,
        "document_url": item.document.url if item.document else "",
        "document_nom": Path(item.document.name).name if item.document else "",
        "etat": "en_cours" if en_cours else ("a_venir" if item.date_debut > aujourd_hui else "terminee"),
    }


SITUATION_FORMATION = "En formation"


def _en_formation(agent: Agent, aujourd_hui: date) -> bool:
    """Retenu pour un module dont la session a débuté et n'est pas terminée, sans abandon ni report."""
    from .formation import etat_inscription, etat_session
    from .models import InscriptionFormation

    inscriptions = InscriptionFormation.objects.filter(demande__agent=agent, issue="").select_related("demande", "session")
    return any(
        etat_inscription(i) == "retenue" and etat_session(i.session, aujourd_hui) == "en_cours" for i in inscriptions
    )


def synchroniser_situation(agent: Agent, aujourd_hui: date | None = None) -> bool:
    """La situation de l'agent suit sa période en cours, puis sa formation en cours ; sans l'une ni l'autre, il redevient « En activité ».

    Tout se décide d'après les dates et le jour d'aujourd'hui. Retourne vrai quand la situation a changé."""
    aujourd_hui = aujourd_hui or timezone.localdate()
    courante = next(
        (p for p in agent.positions.all() if p.date_debut <= aujourd_hui and (p.date_fin is None or p.date_fin >= aujourd_hui)),
        None,
    )
    if courante is not None:
        voulue = PositionAdministrative.SITUATIONS[courante.type]
    elif agent.situation in {SITUATION_NORMALE, SITUATION_FORMATION} and _en_formation(agent, aujourd_hui):
        voulue = SITUATION_FORMATION
    elif agent.situation in {*PositionAdministrative.SITUATIONS.values(), SITUATION_FORMATION}:
        voulue = SITUATION_NORMALE
    else:
        return False  # Une situation hors position (retraite, décès…) n'est pas touchée.
    if agent.situation != voulue:
        agent.situation = voulue
        agent.save(update_fields=["situation"])
        return True
    return False


def famille_position(situation: str) -> str:
    """Famille de position d'un agent : détachement, disponibilité, hors-cadre, ou activité.

    L'activité couvre la présence au poste, la formation et les congés (annuel, paternité, maternité, maladie) :
    tout ce qui n'est ni détachement, ni mise à disposition, ni disponibilité, ni hors-cadre.
    """
    texte = (situation or "").lower()
    if "détach" in texte or "detach" in texte or "disposition" in texte:
        return "detachement"
    if "disponib" in texte:
        return "disponibilite"
    if "hors" in texte or "exclu" in texte:
        return "hors"
    return "activite"


def details_activite(agents, aujourd_hui: date | None = None) -> dict[str, str]:
    """Ce que fait aujourd'hui chaque agent en activité : formation, congé en cours, absence, sinon présence au poste.

    Les agents qui ne sont pas en activité (détachement, disponibilité…) n'ont pas de détail : leur position le dit déjà.
    Deux requêtes pour tous les agents, quel que soit leur nombre.
    """
    import re

    from .models import Absence, Demande

    aujourd_hui = aujourd_hui or timezone.localdate()
    agents = list(agents)
    actifs = {agent.id for agent in agents if famille_position(agent.situation) == "activite"}
    conges: dict[int, str] = {}
    for demande in Demande.objects.filter(
        agent_id__in=actifs, categorie="conge", etape__startswith="Clôturée : congé accordé", debut__lte=aujourd_hui, fin__gt=aujourd_hui,
    ).order_by("debut"):
        conges.setdefault(demande.agent_id, re.sub(r"\s*\(\d+ j\)\s*$", "", demande.nature))
    absences: dict[int, str] = {}
    for absence in (
        Absence.objects.filter(agent_id__in=actifs, debut__lte=aujourd_hui, fin__gte=aujourd_hui)
        .exclude(decision="invalidee")
        .exclude(instruction__in=["rejete", "decale"])
        .order_by("debut")
    ):
        absences.setdefault(absence.agent_id, absence.nature)
    resultat: dict[str, str] = {}
    for agent in agents:
        if agent.id not in actifs:
            resultat[agent.matricule] = ""
        elif agent.situation == SITUATION_FORMATION:
            resultat[agent.matricule] = SITUATION_FORMATION
        elif agent.id in conges:
            resultat[agent.matricule] = conges[agent.id]
        elif agent.id in absences:
            resultat[agent.matricule] = absences[agent.id]
        else:
            resultat[agent.matricule] = "Présence au poste"
    return resultat


HORIZON_ECHEANCE_JOURS = 90


def echeances_en_cours(aujourd_hui: date | None = None) -> dict[str, dict]:
    """Pour chaque agent dont une position a un terme : la date de fin de la période en cours et les jours restants."""
    aujourd_hui = aujourd_hui or timezone.localdate()
    resultat: dict[str, dict] = {}
    periodes = PositionAdministrative.objects.filter(date_debut__lte=aujourd_hui, date_fin__gte=aujourd_hui).select_related("agent")
    for periode in periodes:
        jours = (periode.date_fin - aujourd_hui).days
        resultat[periode.agent.matricule] = {
            "echeance": periode.date_fin.isoformat(),
            "echeance_jours": jours,
            "echeance_proche": jours <= HORIZON_ECHEANCE_JOURS,
        }
    return resultat


def synchroniser_tous() -> int:
    """Remet toutes les situations d'après les dates du jour. Retourne le nombre d'agents dont la situation a changé."""
    concernes = Q(positions__isnull=False) | Q(situation=SITUATION_FORMATION) | Q(demandes__inscription_formation__isnull=False)
    return sum(1 for agent in Agent.objects.filter(concernes).distinct() if synchroniser_situation(agent))


def en_activite(agents):
    """Les agents en activité : tout sauf le détachement, la mise à disposition, la disponibilité et le hors-cadre."""
    return agents.exclude(
        Q(situation__icontains="détach") | Q(situation__icontains="detach") | Q(situation__icontains="disposition")
        | Q(situation__icontains="disponib") | Q(situation__icontains="hors") | Q(situation__icontains="exclu")
    )


def fichier_recu(data):
    """Le fichier joint : en multipart, DRF le range dans request.data."""
    fichier = data.get("document") if hasattr(data, "get") else None
    return fichier if hasattr(fichier, "size") and hasattr(fichier, "name") else None


def _lire(data, agent: Agent, item: PositionAdministrative | None = None):
    """(valeurs, erreur)."""

    def valeur(cle, defaut=""):
        return data[cle] if cle in data else (getattr(item, cle) if item else defaut)

    type_position = str(valeur("type")).strip()
    if type_position not in TYPES:
        return None, "Choisissez la position."
    accueil = " ".join(str(valeur("structure_accueil")).split())
    if type_position in AVEC_ACCUEIL and not accueil:
        return None, "Indiquez la structure d'accueil."
    motif = " ".join(str(valeur("motif")).split())
    reference = " ".join(str(valeur("reference_acte")).split())
    detail = " ".join(str(valeur("detail")).split())
    if len(accueil) > 200 or len(motif) > 200 or len(reference) > 120 or len(detail) > 300:
        return None, "Un des champs dépasse sa longueur maximale."

    def jour(cle, libelle, obligatoire):
        brut = valeur(cle, None)
        if isinstance(brut, date):
            return brut, None
        if not brut:
            return (None, f"{libelle} est obligatoire.") if obligatoire else (None, None)
        try:
            return date.fromisoformat(str(brut)), None
        except ValueError:
            return None, f"{libelle} n'est pas valide."

    debut, erreur = jour("date_debut", "La date de début", True)
    if erreur:
        return None, erreur
    fin, erreur = jour("date_fin", "La date de fin", False)
    if erreur:
        return None, erreur
    if fin is not None and fin < debut:
        return None, "La fin de la période ne peut pas précéder son début."
    # Deux périodes ne se chevauchent pas : la situation de l'agent doit rester univoque.
    for autre in agent.positions.exclude(pk=item.pk if item else None):
        fin_autre = autre.date_fin or date.max
        if debut <= fin_autre and (fin or date.max) >= autre.date_debut:
            return None, f"Cette période chevauche une autre position ({autre.get_type_display()} du {autre.date_debut:%d/%m/%Y})."
    fichier = fichier_recu(data)
    if fichier is None and not (item and item.document):
        return None, "Joignez l'acte qui prononce cette position."
    if fichier is not None:
        if Path(fichier.name).suffix.lower() not in EXTENSIONS_ACTE:
            return None, "L'acte doit être un PDF ou une image (PNG, JPG, WEBP)."
        if fichier.size > TAILLE_MAX_ACTE:
            return None, "L'acte dépasse 5 Mo."
    return {
        "_fichier": fichier, "type": type_position, "structure_accueil": accueil, "motif": motif, "date_debut": debut,
        "date_fin": fin, "reference_acte": reference, "detail": detail,
    }, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@dans_le_perimetre
def positions(request, matricule: str):
    agent = get_object_or_404(Agent, matricule=matricule)
    if request.method == "GET":
        return Response([position_row(item) for item in agent.positions.all()])
    if not peut_gerer_carriere(request.user, agent):
        return refus_carriere()
    valeurs, erreur = _lire(request.data, agent)
    if erreur:
        return Response({"detail": erreur}, status=400)
    fichier = valeurs.pop("_fichier")
    with transaction.atomic():
        item = PositionAdministrative.objects.create(agent=agent, document=fichier, **valeurs)
        synchroniser_situation(agent)
        informer_position(agent, request.user, item, "ajoutée")
    return Response(position_row(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@dans_le_perimetre
def position(request, matricule: str, pk: int):
    agent = get_object_or_404(Agent, matricule=matricule)
    if not peut_gerer_carriere(request.user, agent):
        return refus_carriere()
    item = get_object_or_404(PositionAdministrative, pk=pk, agent=agent)
    with transaction.atomic():
        if request.method == "DELETE":
            retiree = PositionAdministrative(type=item.type, date_debut=item.date_debut, date_fin=item.date_fin)
            if item.document:
                item.document.delete(save=False)
            item.delete()
            informer_position(agent, request.user, retiree, "supprimée")
            # Sans autre période, la situation redevient normale si elle venait de celle-ci.
            if not agent.positions.exists() and agent.situation in PositionAdministrative.SITUATIONS.values():
                agent.situation = SITUATION_NORMALE
                agent.save(update_fields=["situation"])
            else:
                synchroniser_situation(agent)
            return Response(status=204)
        valeurs, erreur = _lire(request.data, agent, item)
        if erreur:
            return Response({"detail": erreur}, status=400)
        fichier = valeurs.pop("_fichier")
        for champ, valeur in valeurs.items():
            setattr(item, champ, valeur)
        if fichier is not None:
            if item.document:
                item.document.delete(save=False)
            item.document = fichier
        item.save()
        synchroniser_situation(agent)
        informer_position(agent, request.user, item, "modifiée")
    return Response(position_row(item))
