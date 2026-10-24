"""Carrières · Absences : autorisations instruites par le gestionnaire."""

from datetime import date
from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .taches import en_arriere_plan
from .demo_ecrans import jours_ouvres
from .models import Absence, Agent, BlocEcran, Notification, Organisme, PieceJointe
from .present import agent_brief
from .roles import ROLES_SIMPLES
from .visibilite import agent_visible, agents_visibles, matricules_visibles, refus_hors_perimetre
from .rattachement import normaliser as _normaliser, seuils_effectifs, structure_de, structures_par_nom, structures_reglables

TYPES = Absence.TypeAutorisation


def presenteisme_calcule(visibles: set[str] | None = None) -> dict:
    """Présence du mois en cours, son écart avec le mois précédent et le quorum minimal : tout est tiré des données."""
    from .parametres import quorum_presence

    aujourd_hui = timezone.localdate()
    mensuel = radar_presence(aujourd_hui.year, quorum_presence(), aujourd_hui, visibles)["mensuel"]
    mois = aujourd_hui.month - 1
    return {
        "taux": float(mensuel[mois]),
        "evolution": float(mensuel[mois] - mensuel[mois - 1]) if mois > 0 else None,
        "objectif": float(quorum_presence()),
    }


def _bloc(ecran: str, cle: str, defaut):
    bloc = BlocEcran.objects.filter(ecran=ecran, cle=cle).first()
    return bloc.contenu if bloc else defaut


def autorisation_row(item: Absence, par_nom: dict | None = None) -> dict:
    entite = structure_de(item.agent, structures_par_nom() if par_nom is None else par_nom)
    return {
        "id": item.id,
        "agent": {**agent_brief(item.agent), "fonction": item.agent.fonction},
        "structure": entite.nom if entite else (item.agent.structure or "Structure non renseignée"),
        "demande": item.demande.reference if item.demande_id else "",
        "type": item.type_autorisation,
        "type_libelle": item.get_type_autorisation_display(),
        "justificatif": item.justificatif,
        "debut": item.debut.isoformat(),
        "fin": item.fin.isoformat(),
        "jours": item.jours,
        "decision": item.decision,
        "motif_decision": item.motif_decision,
    }


# Le suivi ne porte que sur les permissions que l'agent demande depuis son profil : les permissions statutaires
# (« permission spéciale d'absence ») et les permissions générales (« permission »).
ACTES_SUIVIS = {"permission-speciale": TYPES.PERMISSION, "permission": TYPES.AUTORISATION}
LIBELLES_SUIVIS = {TYPES.PERMISSION: "Permission statutaire", TYPES.AUTORISATION: "Permission"}


def _statut_demande(demande) -> str:
    """Où en est la demande : en traitement, validée par le circuit (en signature), accordée (acte délivré) ou refusée."""
    if demande.etape.startswith("Clôturée : acte délivré"):
        return "accordee"
    if demande.etape.startswith("Validée"):
        return "validee"
    if demande.etape.startswith("Clôturée"):
        return "refusee"
    return "traitement"


def _visas_demande(demande) -> list[dict]:
    return [
        {
            "ordre": visa.ordre, "instance": visa.instance, "titulaire": visa.titulaire, "fonction": visa.fonction, "avis": visa.avis,
            "commentaire": visa.commentaire, "date": visa.date.isoformat() if visa.date else None,
            "signature_url": visa.signature.url if visa.signature else "",
        }
        for visa in demande.visas.all()
    ]


def suivi_permissions(visibles, par_nom: dict) -> list[dict]:
    """Les permissions demandées par les agents du périmètre, chacune avec son circuit, les plus récentes d'abord."""
    from .models import Demande

    demandes = Demande.objects.filter(categorie="acte", type_acte__in=ACTES_SUIVIS).select_related("agent", "absence_liee").prefetch_related("visas")
    absences = Absence.objects.filter(type_autorisation__in=ACTES_SUIVIS.values()).exclude(demande__categorie="acte").select_related("agent", "demande")
    if visibles is not None:
        demandes = demandes.filter(agent__matricule__in=visibles)
        absences = absences.filter(agent__matricule__in=visibles)
    lignes = []
    for demande in demandes.order_by("-depose_le", "-id")[:300]:
        type_absence = ACTES_SUIVIS[demande.type_acte]
        entite = structure_de(demande.agent, par_nom)
        lignes.append({
            "source": "demande",
            "reference": demande.reference,
            "agent": {**agent_brief(demande.agent), "fonction": demande.agent.fonction},
            "structure": entite.nom if entite else (demande.agent.structure or "Structure non renseignée"),
            "type": type_absence,
            "type_libelle": LIBELLES_SUIVIS[type_absence],
            "intitule": demande.nature,
            "motif": demande.motif,
            "debut": demande.debut.isoformat() if demande.debut else "",
            "fin": demande.fin.isoformat() if demande.fin else "",
            "depose_le": demande.depose_le.isoformat(),
            "statut": _statut_demande(demande),
            "etape": demande.etape,
            "responsable": demande.responsable,
            "visas": _visas_demande(demande),
            "absence": autorisation_row(demande.absence_liee, par_nom) if getattr(demande, "absence_liee", None) else None,
        })
    for absence in absences.order_by("-debut", "-id")[:300]:
        statut = {"validee": "accordee", "invalidee": "refusee"}.get(absence.decision, "traitement")
        ligne = autorisation_row(absence, par_nom)
        lignes.append({
            "source": "absence",
            "reference": f"ABS-{absence.id}",
            "agent": ligne["agent"],
            "structure": ligne["structure"],
            "type": absence.type_autorisation,
            "type_libelle": LIBELLES_SUIVIS[absence.type_autorisation],
            "intitule": absence.nature,
            "motif": absence.motif_decision,
            "debut": ligne["debut"],
            "fin": ligne["fin"],
            "depose_le": ligne["debut"],
            "statut": statut,
            "etape": "Décision de la gestion des absences",
            "responsable": "",
            "visas": [],
            "absence": ligne,
        })
    return sorted(lignes, key=lambda item: item["depose_le"], reverse=True)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def autorisations(request):
    visibles = matricules_visibles(request.user)
    suivi = suivi_permissions(visibles, structures_par_nom())
    compte = {statut: sum(1 for item in suivi if item["statut"] == statut) for statut in ("accordee", "traitement", "validee", "refusee")}
    return Response(
        {
            "exercice": timezone.localdate().year,
            "presenteisme": presenteisme_calcule(visibles),
            "indicateurs": {"accordees": compte["accordee"], "en_traitement": compte["traitement"], "validees": compte["validee"]},
            "types": [{"code": code, "libelle": LIBELLES_SUIVIS[code]} for code in ACTES_SUIVIS.values()],
            "suivi": suivi,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@en_arriere_plan("Rapport d'assiduité")
def exporter_assiduite(request):
    """PDF du mois en cours : présentéisme et autorisations qui le traversent."""
    from calendar import monthrange

    from .rapports.documents import rendre_assiduite

    aujourd_hui = timezone.localdate()
    debut = aujourd_hui.replace(day=1)
    fin = aujourd_hui.replace(day=monthrange(aujourd_hui.year, aujourd_hui.month)[1])
    lignes = list(
        agents_visibles(Absence.objects.exclude(type_autorisation=""), request.user, "agent__matricule")
        .filter(debut__lte=fin, fin__gte=debut)
        .select_related("agent", "agent__organisme")
        .order_by("debut", "agent__nom")
    )
    contenu = rendre_assiduite(aujourd_hui, presenteisme_calcule(matricules_visibles(request.user)), lignes)
    nom = f"rapport-assiduite-{aujourd_hui.year}-{aujourd_hui.month:02d}.pdf"
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decider(request, pk: int):
    """Valider ou invalider une autorisation : le motif est obligatoire et consigné."""
    sens = request.data.get("sens")
    motif = (request.data.get("motif") or "").strip()
    if sens not in {"valider", "invalider"}:
        return Response({"detail": "Décision inconnue : « valider » ou « invalider » attendu."}, status=400)
    if not motif:
        return Response({"detail": "Le motif est obligatoire."}, status=400)
    with transaction.atomic():
        item = get_object_or_404(Absence.objects.select_for_update().exclude(type_autorisation=""), pk=pk)
        if not agent_visible(request.user, item.agent):
            return refus_hors_perimetre()
        if item.decision != Absence.Decision.EN_ATTENTE:
            return Response({"detail": "Cette autorisation est déjà décidée."}, status=409)
        valide = sens == "valider"
        item.decision = Absence.Decision.VALIDEE if valide else Absence.Decision.INVALIDEE
        item.statut = "Justifiée" if valide else "Injustifiée"
        item.motif_decision = motif[:1000]
        item.decide_le = timezone.localdate()
        item.save(update_fields=["decision", "statut", "motif_decision", "decide_le"])
        if item.demande_id:
            # L'agent voit l'issue de sa demande dans son profil.
            demande = item.demande
            demande.etape = "Clôturée : autorisation accordée" if valide else "Clôturée : autorisation refusée"
            demande.responsable = getattr(getattr(request.user, "profil", None), "fonction", "") or request.user.get_full_name() or "Gestionnaire des absences"
            demande.echeance = f"Décidée le {item.decide_le:%d/%m/%Y}"
            demande.save(update_fields=["etape", "responsable", "echeance"])
    return Response(autorisation_row(item))


# --- Congés : arbitrage de la sous-direction des carrières ----------------------------------

INSTRUCTION = Absence.Instruction
OUVERTES = {INSTRUCTION.PRET_SIGNATURE, INSTRUCTION.REMPLACEMENT, INSTRUCTION.CONFLIT_QUORUM}


class ContexteQuorum:
    """Ce qu'il faut savoir pour juger si un départ garde le quorum de la structure de l'agent."""

    def __init__(self, seuil: int, par_nom: dict | None = None) -> None:
        from collections import defaultdict

        from .models import Profil

        self.seuil = seuil  # quorum par défaut ; chaque structure peut avoir le sien
        self.seuils = seuils_effectifs(seuil)
        self.par_nom = structures_par_nom() if par_nom is None else par_nom
        techniques = list(Profil.objects.filter(administrateur=True).values_list("user__username", flat=True))
        self.entite_de: dict[int, int] = {}
        self.effectif: dict[int, int] = defaultdict(int)
        for agent in Agent.objects.exclude(matricule__in=techniques).only("id", "service", "sous_direction", "direction", "structure"):
            entite = structure_de(agent, self.par_nom)
            if entite is not None:
                self.entite_de[agent.id] = entite.id
                self.effectif[entite.id] += 1
        self.periodes: dict[int, list] = defaultdict(list)
        for agent_id, debut, fin in (
            Absence.objects.exclude(instruction=INSTRUCTION.REJETE).exclude(decision=Absence.Decision.INVALIDEE)
            .values_list("agent_id", "debut", "fin")
        ):
            entite_id = self.entite_de.get(agent_id)
            if entite_id is not None:
                self.periodes[entite_id].append((agent_id, debut, fin))

    def seuil_de(self, item: Absence) -> int:
        """Quorum de la plus petite structure de l'agent (service, sinon sous-direction, sinon direction)."""
        entite_id = self.entite_de.get(item.agent_id)
        return self.seuils.get(entite_id, (self.seuil, True))[0] if entite_id is not None else self.seuil

    def presence_minimale(self, item: Absence) -> int | None:
        """Présence la plus basse de la structure de l'agent pendant son départ ; None si elle n'est pas évaluable (structure inconnue ou trop petite pour son quorum)."""
        entite_id = self.entite_de.get(item.agent_id)
        if entite_id is None:
            return None
        effectif = self.effectif[entite_id]
        # Si aucune absence isolée n'est compatible avec le quorum (structure trop petite), il ne peut pas servir de critère.
        if round(100 * (effectif - 1) / effectif) < self.seuil_de(item):
            return None
        pire = 100
        for jour in _jours_ouvres(item.debut, item.fin):
            absents = {agent for agent, debut, fin in self.periodes[entite_id] if debut <= jour <= fin} | {item.agent_id}
            pire = min(pire, round(100 * (effectif - len(absents)) / effectif))
        return pire

    def instruction(self, item: Absence) -> tuple[str, str]:
        """(instruction, précision) : le conflit de quorum se déduit de la présence réelle, il n'est pas saisi."""
        if item.instruction not in OUVERTES:
            return item.instruction, item.interim_detail
        pire = self.presence_minimale(item)
        seuil = self.seuil_de(item)
        if pire is not None and pire < seuil:
            return INSTRUCTION.CONFLIT_QUORUM, f"Présence de la structure à {pire} % pendant la période (quorum {seuil} %)"
        if item.instruction == INSTRUCTION.CONFLIT_QUORUM:
            return INSTRUCTION.PRET_SIGNATURE, "Quorum garanti sur la période"
        return item.instruction, item.interim_detail


def arbitrage_row(item: Absence, par_nom: dict | None = None, contexte: "ContexteQuorum | None" = None) -> dict:
    if contexte is None:
        from .parametres import quorum_presence

        contexte = ContexteQuorum(quorum_presence(), par_nom)
    instruction, precision = contexte.instruction(item)
    entite = structure_de(item.agent, contexte.par_nom)
    return {
        "id": item.id,
        "agent": {**agent_brief(item.agent), "fonction": item.agent.fonction},
        "structure": entite.nom if entite else (item.agent.structure or "Structure non renseignée"),
        "nature": item.nature,
        "debut": item.debut.isoformat(),
        "fin": item.fin.isoformat(),
        "jours": item.jours,
        "interim": item.interim,
        "interim_detail": precision,
        "instruction": instruction,
        "instruction_libelle": INSTRUCTION(instruction).label if instruction else "",
        "motif": item.motif_decision,
    }


def quorums_par_structure(aujourd_hui, seuil: int = 65, visibles: set[str] | None = None, utilisateur=None) -> tuple[list[dict], int]:
    """Présence du jour dans chaque structure des paramètres, et nombre d'agents qu'aucune structure n'accueille.

    Un agent n'est pas relié à une structure par une clé : son service, sa sous-direction ou sa direction
    (le plus précis d'abord) est rapproché du nom d'une structure des paramètres.
    """
    par_nom = structures_par_nom()
    seuils = seuils_effectifs(seuil)
    reglables = structures_reglables(utilisateur) if utilisateur is not None else set()
    absents_aujourd_hui = set(
        Absence.objects.filter(debut__lte=aujourd_hui, fin__gte=aujourd_hui)
        .exclude(instruction=INSTRUCTION.REJETE)
        .exclude(decision=Absence.Decision.INVALIDEE)
        .values_list("agent_id", flat=True)
    )
    effectifs: dict[int, dict] = {}
    non_rattaches = 0
    # Le compte administrateur est technique : il n'appartient à aucune structure.
    from .models import Profil

    techniques = Profil.objects.filter(administrateur=True).values_list("user__username", flat=True)
    for agent in Agent.objects.exclude(matricule__in=list(techniques)).only("id", "matricule", "service", "sous_direction", "direction", "structure"):
        # Le quorum d'une structure se juge sur tous ses agents ; on n'en montre que les structures qu'on supervise.
        supervise = visibles is None or agent.matricule in visibles
        entite = structure_de(agent, par_nom)
        if entite is None:
            non_rattaches += supervise
            continue
        ligne = effectifs.setdefault(entite.id, {"entite": entite, "effectif": 0, "absents": 0, "supervises": 0})
        ligne["effectif"] += 1
        ligne["absents"] += agent.id in absents_aujourd_hui
        ligne["supervises"] += supervise

    lignes = []
    for ligne in effectifs.values():
        if not ligne["supervises"]:
            continue
        entite, effectif, nombre = ligne["entite"], ligne["effectif"], ligne["absents"]
        lignes.append({
            "code": entite.code,
            "entite": entite.nom,
            "nom": entite.nom,
            "quorum_propre": entite.quorum_presence_pourcent,
            "peut_modifier": reglables is None or entite.id in reglables,
            "effectif": effectif,
            "absents": nombre,
            "presence": round(100 * (effectif - nombre) / effectif),
            "seuil": seuils.get(entite.id, (seuil, True))[0],
            "detail": f"{nombre} absent{'s' if nombre > 1 else ''} sur {effectif}" if nombre else f"Effectif complet ({effectif})",
        })
    # Les structures les plus proches de leur seuil d'abord.
    return sorted(lignes, key=lambda item: (item["presence"] - item["seuil"], item["entite"])), non_rattaches


MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def _jours_ouvres(debut, fin):
    from datetime import timedelta

    jour = debut
    while jour <= fin:
        if jour.weekday() < 5:
            yield jour
        jour += timedelta(days=1)


def radar_presence(annee: int, seuil: int, aujourd_hui, visibles: set[str] | None = None) -> dict:
    """Présence prévue mois par mois et trimestre par trimestre, tirée des congés, absences et plans de la campagne.

    Un agent compte comme absent un jour ouvré s'il a une absence ou un congé non rejeté ce jour-là,
    ou si son plan de congé de la campagne de l'exercice le couvre.
    """
    from datetime import date, timedelta

    from .models import PlanConge, Profil

    techniques = list(Profil.objects.filter(administrateur=True).values_list("user__username", flat=True))
    agents = {
        a.matricule: a.id
        for a in Agent.objects.exclude(matricule__in=techniques).only("id", "matricule")
        if visibles is None or a.matricule in visibles
    }
    effectif = len(agents)
    premier, dernier = date(annee, 1, 1), date(annee, 12, 31)

    absences: dict[int, set] = {identifiant: set() for identifiant in agents.values()}
    bornes = list(
        Absence.objects.filter(debut__lte=dernier, fin__gte=premier)
        .exclude(instruction=INSTRUCTION.REJETE)
        .exclude(decision=Absence.Decision.INVALIDEE)
        .values_list("agent_id", "debut", "fin")
    )
    bornes += [
        (agents[plan[0]], plan[1], plan[2])
        for plan in PlanConge.objects.filter(campagne__exercice=annee, debut__lte=dernier, fin__gte=premier)
        .values_list("agent__username", "debut", "fin")
        if plan[0] in agents
    ]
    bornes += [  # seconde période des congés pris en deux temps
        (agents[plan[0]], plan[1], plan[2])
        for plan in PlanConge.objects.filter(campagne__exercice=annee, debut2__isnull=False, debut2__lte=dernier, fin2__gte=premier)
        .values_list("agent__username", "debut2", "fin2")
        if plan[0] in agents
    ]
    for identifiant, debut, fin in bornes:
        if identifiant in absences:
            absences[identifiant].update(_jours_ouvres(max(debut, premier), min(fin, dernier)))

    mensuel, trimestres = [], []
    absents_mois: list[int] = []
    for mois in range(1, 13):
        jours = list(_jours_ouvres(date(annee, mois, 1), date(annee + (mois == 12), mois % 12 + 1, 1) - timedelta(days=1)))
        total = sum(1 for dates in absences.values() for jour in jours if jour in dates)
        absents_mois.append(total)
        capacite = effectif * len(jours)
        mensuel.append(round(100 * (capacite - total) / capacite) if capacite else 100)

    for rang in range(4):
        mois = range(rang * 3, rang * 3 + 3)
        concernes = {
            identifiant for identifiant, dates in absences.items() if any(jour.month - 1 in mois for jour in dates)
        }
        jours_absence = sum(absents_mois[index] for index in mois)
        pire = min(mois, key=lambda index: mensuel[index])
        taux, nom_mois = mensuel[pire], MOIS_LONGS[pire]
        if taux < seuil:
            etat, ton = f"Sous le seuil en {nom_mois} ({taux} % de présence)", "attention"
        elif taux < seuil + 10:
            etat, ton = f"Proche du seuil en {nom_mois} ({taux} % de présence)", "attention"
        else:
            etat, ton = f"Continuité assurée ({taux} % de présence au plus bas)", "neutre"
        trimestres.append({
            "titre": f"T{rang + 1} • {MOIS_LONGS[rang * 3].capitalize()} – {MOIS_LONGS[rang * 3 + 2]}",
            "departs": len(concernes),
            "texte": (
                f"{len(concernes)} agent{'s' if len(concernes) > 1 else ''} en congé ou absence · {jours_absence} jour{'s' if jours_absence > 1 else ''} ouvré{'s' if jours_absence > 1 else ''} cumulé{'s' if jours_absence > 1 else ''}."
                if concernes else "Aucun départ enregistré ni planifié sur ce trimestre."
            ),
            "etat": etat,
            "ton": ton,
        })

    present_aujourdhui = None
    if effectif:
        absents = sum(1 for dates in absences.values() if aujourd_hui in dates)
        present_aujourdhui = round(100 * (effectif - absents) / effectif, 1)
    return {"trimestres": trimestres, "mensuel": mensuel, "taux_du_jour": present_aujourdhui}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def conges(request):
    from django.db.models import Sum

    visibles = matricules_visibles(request.user)
    agents = agents_visibles(Agent.objects.all(), request.user)
    totaux = agents.aggregate(acquis=Sum("conges_acquis"), consommes=Sum("conges_consommes"), reports=Sum("report_conges"))
    lignes = list(
        agents_visibles(Absence.objects.exclude(instruction=""), request.user, "agent__matricule")
        .select_related("agent", "agent__organisme").order_by("debut")
    )
    annee = timezone.localdate().year
    from .models import CampagnePlanConge

    courante = CampagnePlanConge.objects.order_by("-exercice").first()
    campagne = (
        {"exercice": courante.exercice, "statut": courante.statut, "statut_libelle": courante.get_statut_display(), "delai": courante.delai.isoformat()}
        if courante else None
    )
    from . import suivi_conges
    from .parametres import etat_quorum, quorum_presence

    seuil = quorum_presence()
    quorums = quorums_par_structure(timezone.localdate(), seuil, visibles, request.user)
    radar = radar_presence(annee, seuil, timezone.localdate(), visibles)
    par_nom = structures_par_nom()
    contexte = ContexteQuorum(seuil, par_nom)
    return Response(
        {
            "exercice": annee,
            "volume": {
                "effectifs": agents.count(),
                "acquis": totaux["acquis"] or 0,
                "consommes": totaux["consommes"] or 0,
                "reliquats": totaux["reports"] or 0,
                "alertes_reliquat": agents.filter(report_conges__gt=0).count(),
            },
            "campagne": campagne,
            "presence": {"taux": radar["taux_du_jour"], "seuil": seuil},
            "quorum": etat_quorum(),
            "suivi": suivi_conges.suivi(visibles),
            "trimestres": radar["trimestres"],
            "mensuel": radar["mensuel"],
            "quorums": quorums[0],
            "quorums_non_rattaches": quorums[1],
            "en_attente": sum(1 for item in lignes if item.instruction in OUVERTES),
            "instructions": [{"code": code, "libelle": libelle} for code, libelle in INSTRUCTION.choices],
            "demandes": [arbitrage_row(item, par_nom, contexte) for item in lignes],
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def instruire_conge(request, pk: int):
    """Signer l'arrêté (signature électronique exigée), le rejeter ou demander de décaler le départ (motif exigé)."""
    action = request.data.get("action")
    motif = (request.data.get("motif") or "").strip()
    if action not in {"signer", "rejeter", "decaler"}:
        return Response({"detail": "Action inconnue : « signer », « rejeter » ou « decaler » attendu."}, status=400)
    if action != "signer" and not motif:
        return Response({"detail": "Le motif est obligatoire."}, status=400)
    if action == "signer" and not getattr(getattr(request.user, "profil", None), "signature", None):
        return Response({"detail": "Déposez d'abord votre signature électronique : elle est apposée sur l'arrêté."}, status=409)
    with transaction.atomic():
        item = get_object_or_404(Absence.objects.select_for_update().exclude(instruction=""), pk=pk)
        if not agent_visible(request.user, item.agent):
            return refus_hors_perimetre()
        if item.instruction not in OUVERTES:
            return Response({"detail": "Cette demande est déjà arbitrée."}, status=409)
        from .parametres import quorum_presence

        if action == "signer" and ContexteQuorum(quorum_presence()).instruction(item)[0] == INSTRUCTION.CONFLIT_QUORUM:
            return Response({"detail": "Le quorum du service n'est pas garanti : décalez le départ ou rejetez la demande."}, status=409)
        item.instruction = {"signer": INSTRUCTION.SIGNE, "rejeter": INSTRUCTION.REJETE, "decaler": INSTRUCTION.DECALE}[action]
        item.statut = {"signer": "Arrêté signé", "rejeter": "Rejetée", "decaler": "À décaler"}[action]
        item.motif_decision = motif[:1000]
        item.decide_le = timezone.localdate()
        item.save(update_fields=["instruction", "statut", "motif_decision", "decide_le"])
    return Response(arbitrage_row(item))


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def modifier_quorum(request):
    """Fixe le quorum mensuel du ministère (1 à 100 %), ou revient à la moyenne des quorums des structures (valeur vide)."""
    from .parametres import _parametres, etat_quorum
    from .planification import _est_drh, _est_rh

    if not (_est_rh(request.user) or _est_drh(request.user)):
        return Response({"detail": "Seule l'équipe RH règle le quorum du ministère."}, status=403)
    objet = _parametres()
    if objet is None:
        return Response({"detail": "Les paramètres du ministère ne sont pas encore initialisés."}, status=409)
    brut = request.data.get("quorum")
    if brut in (None, ""):
        objet.quorum_automatique = True
        objet.save(update_fields=["quorum_automatique"])
        return Response(etat_quorum())
    try:
        quorum = int(brut)
    except (TypeError, ValueError):
        quorum = 0
    if not 1 <= quorum <= 100:
        return Response({"detail": "Le quorum de présence est un pourcentage entre 1 et 100."}, status=400)
    objet.quorum_presence_pourcent = quorum
    objet.quorum_automatique = False
    objet.save(update_fields=["quorum_presence_pourcent", "quorum_automatique"])
    return Response(etat_quorum())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mes_quorums(request):
    """Les structures dont l'utilisateur est le responsable (et celles qu'elles contiennent), avec leur quorum : il le règle depuis son profil."""
    from .models import EntiteTutelle
    from .parametres import quorum_presence
    from .rattachement import seuils_effectifs, structures_sous

    profil = getattr(request.user, "profil", None)
    if profil is None or profil.role in ROLES_SIMPLES:
        return Response({"quorum_ministere": quorum_presence(), "structures": []})
    racines = [s for s in (profil.structure, profil.interim) if s is not None]
    if not racines:
        return Response({"quorum_ministere": quorum_presence(), "structures": []})
    identifiants = structures_sous(racines)
    seuils = seuils_effectifs(quorum_presence())
    ordre = {s.id: rang for rang, s in enumerate(racines)}
    structures = sorted(
        EntiteTutelle.objects.filter(id__in=identifiants).select_related("parent"),
        key=lambda s: (ordre.get(s.id, len(racines)), s.nom),
    )
    return Response({
        "quorum_ministere": quorum_presence(),
        "structures": [
            {
                "code": s.code,
                "nom": s.nom,
                "niveau_libelle": s.get_niveau_display(),
                "principale": s.id in ordre,
                "parent": s.parent.nom if s.parent_id else "",
                "propre": s.quorum_presence_pourcent,
                "valeur": seuils.get(s.id, (quorum_presence(), True))[0],
                "herite": seuils.get(s.id, (quorum_presence(), True))[1],
            }
            for s in structures[:80]
        ],
    })
