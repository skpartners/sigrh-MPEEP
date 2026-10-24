"""Secrétariat : suivi des demandes dans leur circuit, impression des documents validés et versement du document signé.

Une demande de congé ou d'acte, une fois visée par toute la chaîne, donne un document (certificat, attestation,
autorisation) que le secrétariat imprime, fait signer physiquement, puis verse en version signée. L'agent en est
alors notifié : il le voit dans son espace et passe retirer l'original.
"""

import mimetypes
import re
from pathlib import Path

from django.contrib.auth.models import User
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .demande_acte import CLOTURE_OK, LIVRAISON, SANS_VISA, A_SIGNER
from .models import Demande, Notification, TypeConge, VisaDemande
from .roles import ROLE_SECRETAIRE
from .utilisateurs import perimetre_matricules

CATEGORIES = ("acte", "conge")
EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
TAILLE_MAX = 10 * 1024 * 1024


def peut_secretariat(user) -> bool:
    """L'administrateur et les secrétaires, rattachées à une structure : eux seuls entrent dans l'espace secrétariat."""
    profil = getattr(user, "profil", None)
    if profil is None:
        return False
    return bool(profil.administrateur or (profil.role == ROLE_SECRETAIRE and profil.structure_id))


def _dans_le_perimetre(user, matricule: str) -> bool:
    perimetre = perimetre_matricules(user)
    return perimetre is None or matricule in perimetre


def comptes_secretariat(matricule_agent: str) -> list[User]:
    """Comptes habilités au secrétariat qui suivent cet agent."""
    candidats = User.objects.filter(is_active=True).filter(Q(profil__role=ROLE_SECRETAIRE) | Q(profil__administrateur=True)).select_related("profil")
    return [compte for compte in candidats if peut_secretariat(compte) and _dans_le_perimetre(compte, matricule_agent)]


def _attente(visas: list[VisaDemande]) -> bool:
    return any(visa.avis == "En attente" and visa.instance not in SANS_VISA for visa in visas)


def statut(demande: Demande) -> str:
    """refusee, signe, a_signer (validée de bout en bout, sans document signé) ou circuit."""
    if demande.etape.startswith("Clôturée : demande refusée"):
        return "refusee"
    if demande.document_signe:
        return "signe"
    if _attente(list(demande.visas.all())):
        return "circuit"
    return "a_signer"


def _agent_document(agent) -> dict:
    from .normalisation import nom_complet_structure
    from .present import etat_civil, situation_saisie

    return {
        "matricule": agent.matricule,
        "nom": agent.nom,
        "prenoms": agent.prenoms,
        "grade": agent.grade,
        "structure": agent.structure,
        "direction_complete": nom_complet_structure(agent.direction or agent.structure),
        "prise_service": agent.prise_service.isoformat() if getattr(agent.prise_service, "isoformat", None) else (agent.prise_service or ""),
        "etat_civil": etat_civil(agent),
        "situation_saisie": situation_saisie(agent),
    }


def _conge(demande: Demande, types: list[TypeConge] | None = None) -> dict:
    """Ce qu'il faut pour rédiger le certificat de cessation : type de congé, jours et rang parmi les périodes arrêtées."""
    from .depot_conge import _annuel, periodes_arretees

    nature = demande.nature
    libelle = re.sub(r"\s*\(\d+ j\)\s*$", "", nature)
    type_conge = next((item for item in (types if types is not None else TypeConge.objects.all()) if item.libelle == libelle), None)
    trouve = re.search(r"\((\d+) j", nature)
    periodes = periodes_arretees(demande.agent) if type_conge is not None and _annuel(type_conge) else []
    rang = next((index for index, (debut, fin) in enumerate(periodes) if debut == demande.debut and fin == demande.fin), 0)
    from .droits_conges import exercice_a_attribuer

    from .models import DroitConge

    exercice = demande.exercice or exercice_a_attribuer(demande.agent)
    return {
        "exercice": exercice,
        # Seuls les exercices qui donnent droit à un congé : ceux qui comptent des jours, et celui de la demande.
        "exercices": sorted(
            {droit.annee for droit in DroitConge.objects.filter(agent=demande.agent) if droit.restant > 0} | ({exercice} if exercice else set()),
            reverse=True,
        ),
        "type": type_conge.code if type_conge else "",
        "libelle": libelle,
        "annuel": bool(type_conge and _annuel(type_conge)),
        "jours": int(trouve.group(1)) if trouve else 0,
        "rang": rang,
        "periodes": len(periodes),
    }


def _ligne(demande: Demande, administrateur: bool = False, types: list[TypeConge] | None = None) -> dict:
    visas = list(demande.visas.all())
    etat = statut(demande)
    validations = [visa for visa in visas if visa.ordre > 1 and visa.instance not in SANS_VISA]
    ligne = {
        "reference": demande.reference,
        "categorie": demande.categorie,
        "type_acte": demande.type_acte,
        "nature": demande.nature,
        "agent": {"matricule": demande.agent.matricule, "nom_complet": demande.agent.nom_complet, "structure": demande.agent.structure},
        "depose_le": demande.depose_le.isoformat(),
        "debut": demande.debut.isoformat() if demande.debut else "",
        "fin": demande.fin.isoformat() if demande.fin else "",
        "etape": demande.etape,
        "responsable": demande.responsable,
        "statut": etat,
        "fait": sum(1 for visa in validations if visa.avis == "Favorable"),
        "total": len(validations),
        "visas": [
            {"ordre": visa.ordre, "instance": visa.instance, "titulaire": visa.titulaire, "avis": visa.avis, "date": visa.date.isoformat() if visa.date else ""}
            for visa in visas
        ],
        "signe_le": demande.signe_le.isoformat() if demande.signe_le else "",
        "signe_par": demande.signe_par,
        "document": None,
        # Imprimable une fois toute la chaîne validée ; l'administrateur imprime à tout moment, pour juger du rendu.
        "imprimable": etat in {"a_signer", "signe"} or (administrateur and etat != "refusee"),
    }
    # Tant que le circuit n'est pas complet, le secrétariat ne voit qu'une prévisualisation.
    if etat != "refusee":
        ligne["document"] = {"agent": _agent_document(demande.agent), "conge": _conge(demande, types) if demande.categorie == "conge" else None}
    return ligne


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def liste(request):
    if not peut_secretariat(request.user):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    perimetre = perimetre_matricules(request.user)
    demandes = Demande.objects.filter(categorie__in=CATEGORIES).select_related("agent").prefetch_related("visas")
    if perimetre is not None:
        demandes = demandes.filter(agent__matricule__in=perimetre)
    administrateur = bool(request.user.profil.administrateur)
    types = list(TypeConge.objects.all())
    return Response({"demandes": [_ligne(demande, administrateur, types) for demande in demandes.order_by("-depose_le", "-id")[:500]]})


def _reponse_fichier(demande: Demande) -> FileResponse:
    nom = f"{demande.reference}-signe{Path(demande.document_signe.name).suffix.lower()}"
    reponse = FileResponse(demande.document_signe.open("rb"), content_type=mimetypes.guess_type(nom)[0] or "application/octet-stream")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def fichier_signe(request, reference: str):
    """Document signé : pour l'intéressé, ou pour le secrétariat qui suit cet agent."""
    demande = get_object_or_404(Demande.objects.select_related("agent"), reference=reference, categorie__in=CATEGORIES)
    concerne = request.user.username == demande.agent.matricule
    if not concerne and not (peut_secretariat(request.user) and _dans_le_perimetre(request.user, demande.agent.matricule)):
        return Response({"detail": "Ce document ne vous est pas destiné."}, status=403)
    if not demande.document_signe:
        return Response({"detail": "Le document signé n'est pas encore joint."}, status=409)
    return _reponse_fichier(demande)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def verser_signe(request, reference: str):
    """Joint le document signé d'une demande validée de bout en bout, et prévient l'intéressé."""
    demande = get_object_or_404(Demande.objects.select_related("agent").prefetch_related("visas"), reference=reference, categorie__in=CATEGORIES)
    if not (peut_secretariat(request.user) and _dans_le_perimetre(request.user, demande.agent.matricule)):
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    if statut(demande) not in {"a_signer", "signe"}:
        return Response({"detail": "Cette demande n'a pas encore reçu toutes les validations."}, status=409)
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez le document signé."}, status=400)
    if Path(fichier.name).suffix.lower() not in EXTENSIONS:
        return Response({"detail": "Le document signé doit être un PDF ou une image (PNG, JPG, WEBP)."}, status=400)
    if fichier.size > TAILLE_MAX:
        return Response({"detail": "Le document signé dépasse 10 Mo."}, status=400)
    premiere_fois = not demande.document_signe
    if demande.document_signe:
        demande.document_signe.delete(save=False)
    aujourd_hui = timezone.localdate()
    nom = request.user.get_full_name() or request.user.username
    demande.document_signe = fichier
    demande.signe_le, demande.signe_par = aujourd_hui, nom
    champs = ["document_signe", "signe_le", "signe_par"]
    if demande.categorie == "acte" and demande.etape == A_SIGNER[0]:
        demande.etape, demande.responsable = CLOTURE_OK
        demande.echeance = "Terminée"
        champs += ["etape", "responsable", "echeance"]
        VisaDemande.objects.filter(demande=demande, instance=LIVRAISON[0]).update(
            avis="Délivré", titulaire=nom, fonction="Secrétariat", date=aujourd_hui,
            commentaire="Document signé versé : l'original est à retirer au secrétariat.",
        )
    demande.save(update_fields=champs)
    compte = User.objects.filter(username=demande.agent.matricule).first()
    if premiere_fois and compte is not None:
        Notification.objects.create(
            destinataire=compte, categorie="demande", titre="Votre document signé est disponible",
            message=f"{demande.nature} : passez prendre l'original auprès du secrétariat."[:280],
            lien="/app/agents?onglet=demandes", creee_le=timezone.now(),
        )
    demande = Demande.objects.select_related("agent").prefetch_related("visas").get(pk=demande.pk)
    return Response(_ligne(demande, bool(request.user.profil.administrateur)))
