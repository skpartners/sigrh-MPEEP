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

from .demo_ecrans import jours_ouvres
from .models import Absence, Agent, BlocEcran, Notification, PieceJointe
from .present import agent_brief

TYPES = Absence.TypeAutorisation


def _bloc(ecran: str, cle: str, defaut):
    bloc = BlocEcran.objects.filter(ecran=ecran, cle=cle).first()
    return bloc.contenu if bloc else defaut


def autorisation_row(item: Absence) -> dict:
    return {
        "id": item.id,
        "agent": {**agent_brief(item.agent), "fonction": item.agent.fonction},
        "type": item.type_autorisation,
        "type_libelle": item.get_type_autorisation_display(),
        "justificatif": item.justificatif,
        "debut": item.debut.isoformat(),
        "fin": item.fin.isoformat(),
        "jours": item.jours,
        "decision": item.decision,
        "motif_decision": item.motif_decision,
        "impact_solde": item.impact_solde,
        "impact_detail": item.impact_detail,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def autorisations(request):
    if request.method == "POST":
        return _regulariser(request)
    lignes = list(
        Absence.objects.exclude(type_autorisation="").select_related("agent", "agent__organisme").order_by("-debut", "-id")
    )
    total = len(lignes)
    compte = {code: sum(1 for item in lignes if item.type_autorisation == code) for code, _ in TYPES.choices}
    decisions = {code: sum(1 for item in lignes if item.decision == code) for code, _ in Absence.Decision.choices}
    return Response(
        {
            "exercice": timezone.localdate().year,
            "presenteisme": _bloc("absences", "presenteisme", {"taux": None, "evolution": None, "objectif": None}),
            "indicateurs": {"total": total, **decisions},
            "ventilation": [
                {"code": code, "libelle": libelle, "nombre": compte[code], "part": round(compte[code] * 100 / total) if total else 0}
                for code, libelle in TYPES.choices
            ],
            "types": [{"code": code, "libelle": libelle} for code, libelle in TYPES.choices],
            "autorisations": [autorisation_row(item) for item in lignes],
            "agents": [
                {"matricule": agent.matricule, "nom_complet": agent.nom_complet, "organisme_sigle": agent.organisme.sigle, "structure": agent.structure}
                for agent in Agent.objects.select_related("organisme").order_by("nom", "prenoms")
            ],
        }
    )


def _regulariser(request):
    """Le gestionnaire verse une autorisation avec sa pièce : elle entre en instruction."""
    donnees = request.data
    matricule = (donnees.get("matricule") or "").strip()
    agent = Agent.objects.filter(Q(matricule__iexact=matricule)).select_related("organisme").first()
    if agent is None:
        return Response({"detail": "Aucun agent ne porte ce matricule."}, status=400)
    type_code = donnees.get("type") or ""
    if type_code not in TYPES.values:
        return Response({"detail": "Choisissez le type d'autorisation."}, status=400)
    try:
        debut = date.fromisoformat(donnees.get("debut") or "")
        fin = date.fromisoformat(donnees.get("fin") or "")
    except ValueError:
        return Response({"detail": "Indiquez les dates de début et de fin."}, status=400)
    if fin < debut:
        return Response({"detail": "La date de fin précède la date de début."}, status=400)
    fichier = request.FILES.get("fichier")
    if fichier is not None and Path(fichier.name).suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        return Response({"detail": "La pièce doit être un PDF ou une image."}, status=400)
    aujourd_hui = timezone.localdate()
    with transaction.atomic():
        item = Absence.objects.create(
            agent=agent,
            nature=TYPES(type_code).label,
            debut=debut,
            fin=fin,
            jours=jours_ouvres(debut, fin),
            statut="En instruction",
            type_autorisation=type_code,
            justificatif=fichier.name if fichier else "Pièce à verser",
            decision=Absence.Decision.EN_ATTENTE,
            impact_solde="À déterminer",
            impact_detail="Selon la décision",
        )
        if fichier is not None:
            piece = PieceJointe(
                agent=agent, intitule=f"Justificatif — {item.nature}", categorie="Absences",
                date_depot=aujourd_hui, taille_ko=max(1, (fichier.size + 1023) // 1024), verifiee=False,
            )
            piece.fichier.save(Path(fichier.name).name, ContentFile(fichier.read()), save=False)
            piece.save()
        if str(donnees.get("notifier", "")).lower() in {"1", "true", "on"}:
            Notification.objects.create(
                destinataire=request.user, categorie="demande", titre="Autorisation à statuer",
                message=f"{agent.nom_complet} · {item.nature}, du {debut:%d/%m/%Y} au {fin:%d/%m/%Y}.",
                lien="/app/carrieres/absences", creee_le=timezone.now(),
            )
    return Response(autorisation_row(item), status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_assiduite(_request):
    """PDF du mois en cours : présentéisme et autorisations qui le traversent."""
    from calendar import monthrange

    from .rapports.documents import rendre_assiduite

    aujourd_hui = timezone.localdate()
    debut = aujourd_hui.replace(day=1)
    fin = aujourd_hui.replace(day=monthrange(aujourd_hui.year, aujourd_hui.month)[1])
    lignes = list(
        Absence.objects.exclude(type_autorisation="")
        .filter(debut__lte=fin, fin__gte=debut)
        .select_related("agent", "agent__organisme")
        .order_by("debut", "agent__nom")
    )
    contenu = rendre_assiduite(aujourd_hui, _bloc("absences", "presenteisme", {}), lignes)
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
        if item.decision != Absence.Decision.EN_ATTENTE:
            return Response({"detail": "Cette autorisation est déjà décidée."}, status=409)
        valide = sens == "valider"
        item.decision = Absence.Decision.VALIDEE if valide else Absence.Decision.INVALIDEE
        item.statut = "Justifiée" if valide else "Injustifiée"
        item.motif_decision = motif[:1000]
        item.decide_le = timezone.localdate()
        if not valide:
            item.impact_solde = f"Retenue {item.jours}/30e émise"
            item.impact_detail = "Transmission au Trésor à faire"
        item.save(update_fields=["decision", "statut", "motif_decision", "decide_le", "impact_solde", "impact_detail"])
    return Response(autorisation_row(item))


# --- Congés : arbitrage de la sous-direction des carrières ----------------------------------

INSTRUCTION = Absence.Instruction
OUVERTES = {INSTRUCTION.PRET_SIGNATURE, INSTRUCTION.REMPLACEMENT, INSTRUCTION.CONFLIT_QUORUM}


def arbitrage_row(item: Absence) -> dict:
    return {
        "id": item.id,
        "agent": {**agent_brief(item.agent), "fonction": item.agent.fonction},
        "nature": item.nature,
        "debut": item.debut.isoformat(),
        "fin": item.fin.isoformat(),
        "jours": item.jours,
        "interim": item.interim,
        "interim_detail": item.interim_detail,
        "instruction": item.instruction,
        "instruction_libelle": item.get_instruction_display(),
        "motif": item.motif_decision,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def conges(_request):
    from django.db.models import Sum

    agents = Agent.objects.all()
    totaux = agents.aggregate(acquis=Sum("conges_acquis"), consommes=Sum("conges_consommes"), reports=Sum("report_conges"))
    lignes = list(Absence.objects.exclude(instruction="").select_related("agent", "agent__organisme").order_by("debut"))
    blocs = {bloc.cle: bloc.contenu for bloc in BlocEcran.objects.filter(ecran="conges")}
    annee = timezone.localdate().year
    campagne = blocs.get("campagne", {})
    if campagne.get("reference"):
        campagne = {**campagne, "reference": campagne["reference"].replace("{annee}", str(annee))}
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
            "presence": blocs.get("presence", {}),
            "trimestres": blocs.get("trimestres", []),
            "mensuel": blocs.get("mensuel", []),
            "quorums": blocs.get("quorums", []),
            "reliquats": blocs.get("reliquats", {}),
            "en_attente": sum(1 for item in lignes if item.instruction in OUVERTES),
            "instructions": [{"code": code, "libelle": libelle} for code, libelle in INSTRUCTION.choices],
            "demandes": [arbitrage_row(item) for item in lignes],
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
        if item.instruction not in OUVERTES:
            return Response({"detail": "Cette demande est déjà arbitrée."}, status=409)
        if action == "signer" and item.instruction == INSTRUCTION.CONFLIT_QUORUM:
            return Response({"detail": "Le quorum du service n'est pas garanti : décalez le départ ou rejetez la demande."}, status=409)
        item.instruction = {"signer": INSTRUCTION.SIGNE, "rejeter": INSTRUCTION.REJETE, "decaler": INSTRUCTION.DECALE}[action]
        item.statut = {"signer": "Arrêté signé", "rejeter": "Rejetée", "decaler": "À décaler"}[action]
        item.motif_decision = motif[:1000]
        item.decide_le = timezone.localdate()
        item.save(update_fields=["instruction", "statut", "motif_decision", "decide_le"])
    return Response(arbitrage_row(item))
