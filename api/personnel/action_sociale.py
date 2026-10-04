"""Action sociale (SDAS) : budget de l'exercice, registre des requêtes, mandatement et relances."""

from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Agent, BlocEcran, EnveloppeSociale, Notification, PieceJointe, PrestationSociale
from .present import agent_brief

ETAT = PrestationSociale.Etat
NATURES = [
    "Secours décès & obsèques",
    "Évacuation sanitaire",
    "Allocation de rentrée scolaire",
    "Avance à 0 % sur solde",
    "Dotation de matériel inclusif",
    "Secours sinistre exceptionnel",
]


def requete_row(item: PrestationSociale) -> dict:
    return {
        "id": item.id,
        "reference": item.reference,
        "agent": {**agent_brief(item.agent), "fonction": item.agent.fonction},
        "nature": item.nature,
        "objet": item.objet,
        "ayant_droit": item.ayant_droit,
        "montant": item.montant,
        "date_demande": item.date_demande.isoformat(),
        "pieces": item.pieces,
        "avis_commission": item.avis_commission,
        "urgent": item.urgent,
        "etat": item.etat,
        "etat_libelle": item.get_etat_display(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def tableau(request):
    if request.method == "POST":
        return _deposer(request)
    aujourd_hui = timezone.localdate()
    enveloppe = EnveloppeSociale.objects.filter(organisme__code="dgpe").order_by("-exercice").first()
    requetes = list(PrestationSociale.objects.exclude(etat="").select_related("agent", "agent__organisme").order_by("-urgent", "-date_demande"))
    exercice = enveloppe.exercice if enveloppe else aujourd_hui.year
    instruites = PrestationSociale.objects.filter(date_demande__year=exercice)
    blocs = {bloc.cle: bloc.contenu for bloc in BlocEcran.objects.filter(ecran="action-sociale")}
    return Response(
        {
            "exercice": exercice,
            "budget": {
                "allouee": enveloppe.allouee if enveloppe else 0,
                "engagee": enveloppe.engagee if enveloppe else 0,
                "reliquat": enveloppe.reliquat if enveloppe else 0,
                "ligne": enveloppe.ligne if enveloppe else "",
            },
            "instruites": instruites.count(),
            "instruites_mois": instruites.filter(date_demande__month=aujourd_hui.month).count(),
            "commission": sum(1 for item in requetes if item.etat == ETAT.COMMISSION),
            "requetes": [requete_row(item) for item in requetes],
            "natures": NATURES,
            "etats": [{"code": code, "libelle": libelle} for code, libelle in ETAT.choices],
            "agents": [
                {"matricule": agent.matricule, "nom_complet": agent.nom_complet, "organisme_sigle": agent.organisme.sigle}
                for agent in Agent.objects.select_related("organisme").order_by("nom", "prenoms")
            ],
            **{cle: blocs.get(cle) for cle in ("entete", "guichets", "partenaires", "medecine", "handicap", "retraites", "activites", "ecoute")},
        }
    )


def _deposer(request):
    """Nouvelle requête de secours : elle entre au registre en attente de l'avis de la commission."""
    donnees = request.data
    agent = Agent.objects.filter(matricule__iexact=(donnees.get("matricule") or "").strip()).first()
    if agent is None:
        return Response({"detail": "Choisissez l'agent bénéficiaire."}, status=400)
    nature = (donnees.get("nature") or "").strip()
    if nature not in NATURES:
        return Response({"detail": "Choisissez la nature du secours."}, status=400)
    try:
        montant = int(donnees.get("montant") or 0)
    except (TypeError, ValueError):
        montant = 0
    if montant <= 0:
        return Response({"detail": "Indiquez le montant sollicité."}, status=400)
    fichier = request.FILES.get("fichier")
    if fichier is not None and Path(fichier.name).suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        return Response({"detail": "La pièce doit être un PDF ou une image."}, status=400)
    aujourd_hui = timezone.localdate()
    with transaction.atomic():
        numero = PrestationSociale.objects.filter(reference__startswith=f"SDAS-{aujourd_hui.year}-").count() + 801
        item = PrestationSociale.objects.create(
            agent=agent, reference=f"SDAS-{aujourd_hui.year}-{numero:04d}", nature=nature,
            objet=(donnees.get("objet") or "").strip()[:240] or nature, montant=montant, date_demande=aujourd_hui,
            statut=ETAT.COMMISSION.label, etat=ETAT.COMMISSION, ayant_droit=(donnees.get("ayant_droit") or "Agent").strip()[:160],
            pieces=fichier.name if fichier else "Pièces à verser", avis_commission="Inscrite à la prochaine session",
        )
        if fichier is not None:
            piece = PieceJointe(
                agent=agent, intitule=f"Justificatif — {nature}", categorie="Action sociale", date_depot=aujourd_hui,
                taille_ko=max(1, (fichier.size + 1023) // 1024), verifiee=False,
            )
            piece.fichier.save(Path(fichier.name).name, ContentFile(fichier.read()), save=False)
            piece.save()
    return Response(requete_row(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mandater(request, pk: int):
    """Mandater une requête conforme : le montant est engagé sur l'enveloppe de l'exercice."""
    with transaction.atomic():
        item = get_object_or_404(PrestationSociale.objects.select_for_update().exclude(etat=""), pk=pk)
        if item.etat != ETAT.CONFORME:
            return Response({"detail": "Seule une requête conforme se mandate."}, status=409)
        enveloppe = EnveloppeSociale.objects.select_for_update().filter(organisme__code="dgpe").order_by("-exercice").first()
        if enveloppe is not None:
            if enveloppe.reliquat < item.montant:
                return Response({"detail": "Le solde de l'enveloppe ne couvre pas ce montant."}, status=409)
            enveloppe.engagee += item.montant
            enveloppe.save(update_fields=["engagee"])
        item.etat = ETAT.MANDATEE
        item.statut = ETAT.MANDATEE.label
        item.save(update_fields=["etat", "statut"])
    return Response(requete_row(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def relancer(request, pk: int):
    """Relancer l'agent pour les pièces manquantes : la relance est consignée."""
    item = get_object_or_404(PrestationSociale.objects.select_related("agent").exclude(etat=""), pk=pk)
    if item.etat != ETAT.RESERVE:
        return Response({"detail": "Aucune pièce n'est attendue pour cette requête."}, status=409)
    Notification.objects.create(
        destinataire=request.user, categorie="demande", titre="Relance transmise",
        message=f"{item.agent.nom_complet} · {item.nature} : pièces manquantes demandées.",
        lien="/app/action-sociale", creee_le=timezone.now(),
    )
    return Response(requete_row(item))
