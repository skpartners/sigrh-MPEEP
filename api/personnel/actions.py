"""Actions du DRH qui modifient l'état : chacune est atomique et laisse une notification.

Les notifications sont adressées à l'utilisateur qui agit : dans le prototype, le DRH est le seul
compte ; elles tiennent lieu de journal des conséquences (acte exécutoire, visa en file…).
"""

from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    Acte,
    Demande,
    LigneAvancement,
    MouvementStrategique,
    Notification,
    PieceJointe,
    VisaDemande,
    VisaDossier,
    VisaEnAttente,
)
from .present import visa_row
from .signatures import copie_signature

STATUT_TRANSMIS = "Transmis à la signature"
STATUT_PIECES = "Pièces demandées"


def _notifier(user, categorie: str, titre: str, message: str, lien: str = "", urgente: bool = False) -> None:
    Notification.objects.create(
        destinataire=user, categorie=categorie, titre=titre, message=message, lien=lien,
        urgente=urgente, creee_le=timezone.now(),
    )


def _conflit(message: str) -> Response:
    return Response({"detail": message}, status=409)


def _signataire(user) -> str:
    return getattr(getattr(user, "profil", None), "fonction", "") or user.get_full_name()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decision_visa(request, pk: int):
    """Le DRH appose son visa ou renvoie l'acte pour complément."""
    decision = request.data.get("decision")
    if decision not in {"visa", "complement"}:
        return Response({"detail": "Décision inconnue : « visa » ou « complement » attendu."}, status=400)
    with transaction.atomic():
        visa = get_object_or_404(VisaEnAttente.objects.select_for_update().select_related("agent", "acte"), pk=pk)
        if visa.statut != VisaEnAttente.Statut.EN_ATTENTE:
            return _conflit("Cet acte a déjà été traité.")
        aujourd_hui = timezone.localdate()
        agent = visa.agent
        reference = f"MPEEP-{aujourd_hui.year}-DRH-{visa.id:05d}" if decision == "visa" else ""

        signature = ""
        if decision == "visa":
            profil = getattr(request.user, "profil", None)
            fichier = getattr(profil, "signature", None)
            if not fichier:
                return Response(
                    {"detail": "Déposez d'abord votre signature électronique : elle est apposée sur le document qui circule."},
                    status=409,
                )
            nom = Path(fichier.name).name
            visa.signature.save(nom, ContentFile(fichier.read()), save=False)
            signature = request.build_absolute_uri(visa.signature.url)

        visa.statut = VisaEnAttente.Statut.VISE if decision == "visa" else VisaEnAttente.Statut.COMPLEMENT
        visa.traite_le = timezone.now()
        visa.save(update_fields=["statut", "traite_le", "signature"])

        if visa.acte:
            acte = visa.acte
            if decision == "visa":
                # L'accord des responsables autorise l'édition du papier à en-tête.
                # Le droit de l'agent s'ouvre seulement quand ce papier est scanné.
                acte.statut = Acte.Statut.ACCORDE
                acte.signataire = _signataire(request.user)
            else:
                acte.statut = Acte.Statut.COMPLEMENT
            acte.save(update_fields=["statut", "signataire"])

        VisaDossier.objects.filter(agent=agent, ordre=2).update(
            titulaire=request.user.get_full_name(),
            avis="Visa apposé" if decision == "visa" else "Complément demandé",
            date=aujourd_hui,
            reference=reference,
        )
        lien = f"/app/dossiers/{agent.matricule}"
        if decision == "visa":
            concernees = Demande.objects.filter(agent=agent, etape__startswith="Étape 4").exclude(etape__icontains="papier")
            identifiants = list(concernees.values_list("id", flat=True))
            concernees.update(
                etape="Étape 4 : accord acquis — papier à en-tête à établir",
                responsable="Visas apposés",
                echeance="Établir le papier à en-tête, puis le scanner",
            )
            VisaDemande.objects.filter(demande_id__in=identifiants, ordre=4).update(
                signature=copie_signature(request.user),
                avis="Accord acquis",
                commentaire="Les visas sont apposés. Le papier à en-tête peut être établi.",
                date=aujourd_hui,
                titulaire=request.user.get_full_name(),
                fonction=_signataire(request.user),
                reference=reference,
            )
            _notifier(
                request.user, "dossier", "Accord acquis",
                f"{agent.nom_complet} · {visa.objet}. Les visas sont apposés : le papier à en-tête peut être établi. Le droit s'ouvre au scan.",
                lien,
            )
        else:
            _notifier(request.user, "demande", "Renvoyé pour complément", f"{agent.nom_complet} · {visa.objet}", lien)
    return Response({"visa": visa_row(visa), "reference": reference, "signature": signature})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def verser_scan(request, pk: int):
    """Le papier à en-tête, une fois signé hors ligne, est scanné : c'est ce versement qui ouvre le droit."""
    from .present import agent_detail

    acte = get_object_or_404(Acte.objects.select_related("agent"), pk=pk)
    if acte.statut != Acte.Statut.ACCORDE:
        return Response({"detail": "Le scan du papier à en-tête se verse une fois les visas apposés."}, status=409)
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez le scan du papier à en-tête."}, status=400)
    if Path(fichier.name).suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        return Response({"detail": "Le scan doit être un PDF ou une image."}, status=400)
    aujourd_hui = timezone.localdate()
    nom = Path(fichier.name).name
    contenu = fichier.read()
    with transaction.atomic():
        acte.scan.save(nom, ContentFile(contenu), save=False)
        acte.statut = Acte.Statut.VALIDE
        acte.date_effet = acte.date_effet or aujourd_hui
        acte.save(update_fields=["scan", "statut", "date_effet"])
        piece = PieceJointe(
            agent=acte.agent,
            intitule=f"Papier à en-tête — {acte.reference}",
            categorie="Actes de carrière",
            date_depot=aujourd_hui,
            taille_ko=max(1, (fichier.size + 1023) // 1024),
            verifiee=True,
        )
        piece.fichier.save(nom, ContentFile(contenu), save=False)
        piece.save()
        concernees = Demande.objects.filter(agent=acte.agent, etape__icontains="papier")
        identifiants = list(concernees.values_list("id", flat=True))
        concernees.update(
            etape="Étape 5 : papier à en-tête versé — droit ouvert",
            responsable="Droit ouvert",
            echeance="Notifié",
        )
        VisaDemande.objects.filter(demande_id__in=identifiants, ordre=5).update(
            avis="Droit ouvert",
            commentaire="Papier à en-tête scanné et versé au dossier. Le droit est ouvert.",
            date=aujourd_hui,
            titulaire=request.user.get_full_name(),
            fonction=_signataire(request.user),
        )
        _notifier(
            request.user, "dossier", "Droit ouvert",
            f"{acte.agent.nom_complet} · {acte.titre}. Le papier à en-tête scanné est versé au dossier.",
            f"/app/dossiers/{acte.agent.matricule}",
        )
    return Response(agent_detail(acte.agent))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decision_avancement(request, pk: int):
    """SD Carrières : transmettre un avancement à la signature du DRH, ou le renvoyer pour pièces."""
    decision = request.data.get("decision")
    if decision not in {"transmettre", "renvoyer"}:
        return Response({"detail": "Décision inconnue : « transmettre » ou « renvoyer » attendu."}, status=400)
    with transaction.atomic():
        ligne = get_object_or_404(LigneAvancement.objects.select_for_update().select_related("agent"), pk=pk)
        if ligne.statut in {STATUT_TRANSMIS, STATUT_PIECES}:
            return _conflit(f"Ce dossier est déjà « {ligne.statut.lower()} ».")
        agent = ligne.agent
        aujourd_hui = timezone.localdate()
        if decision == "transmettre":
            ligne.statut = STATUT_TRANSMIS
            acte = Acte.objects.create(
                agent=agent,
                reference=f"{aujourd_hui.year}-{300 + ligne.id:04d}/MPEEP",
                nature="Arrêté d'avancement",
                titre=f"Avancement {ligne.mode.lower()} : {ligne.grade_echelon} vers {ligne.proposition.lower()}",
                resume=f"Note de service {ligne.note} / 20, avis {ligne.avis.lower()} du supérieur.",
                domaine=Acte.Domaine.CARRIERE,
                statut=Acte.Statut.INSTRUCTION,
                date_enregistrement=aujourd_hui,
            )
            VisaEnAttente.objects.create(
                agent=agent, acte=acte, categorie="carriere",
                objet=f"Avancement {ligne.mode.lower()} : {ligne.grade_echelon} vers {ligne.proposition.lower()}",
                echeance=f"Transmis le {aujourd_hui:%d/%m/%Y}", visa_amont="Visa SD Carrières OK",
            )
            _notifier(request.user, "visa", "Nouveau visa à apposer", f"{agent.nom_complet} · avancement vers {ligne.proposition.lower()}.", "/app")
        else:
            ligne.statut = STATUT_PIECES
            _notifier(
                request.user, "demande", "Dossier renvoyé pour pièces",
                f"{agent.nom_complet} · avancement {ligne.grade_echelon} : pièces justificatives demandées.",
                f"/app/dossiers/{agent.matricule}",
            )
        ligne.save(update_fields=["statut"])
    return Response({"id": ligne.id, "statut": ligne.statut})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generer_tableau(request):
    """Certifie le calcul des dossiers à avis favorable encore ouverts."""
    with transaction.atomic():
        ouvertes = LigneAvancement.objects.exclude(statut__in=[STATUT_TRANSMIS, STATUT_PIECES])
        certifiees = ouvertes.filter(avis="Favorable").update(statut="Calcul certifié")
        reservees = ouvertes.exclude(avis="Favorable").count()
        _notifier(
            request.user, "systeme", "Tableau d'avancement 2026 généré",
            f"{certifiees} dossier{'s' if certifiees > 1 else ''} certifié{'s' if certifiees > 1 else ''}, "
            f"{reservees} en attente d'avis.",
            "/app/carrieres",
        )
    return Response({"certifiees": certifiees, "reservees": reservees})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_tableau(_request):
    """PDF du tableau d'avancement de l'exercice, tel qu'il est arrêté."""
    from .rapports.documents import rendre_tableau_avancement

    annee = timezone.localdate().year
    lignes = list(LigneAvancement.objects.select_related("agent").order_by("agent__nom", "id"))
    contenu = rendre_tableau_avancement(annee, lignes)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="tableau-avancement-{annee}.pdf"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def publier_mouvements(request):
    with transaction.atomic():
        a_publier = MouvementStrategique.objects.exclude(statut__in=["Arrêté signé", "Avis publié"])
        nombre = a_publier.update(statut="Avis publié")
        if nombre == 0:
            return _conflit("Tous les avis de mutation sont déjà publiés.")
        _notifier(request.user, "releve", "Avis de mutation publiés", f"{nombre} mouvement{'s' if nombre > 1 else ''} publié{'s' if nombre > 1 else ''} aux structures concernées.", "/app/carrieres")
    return Response({"publies": nombre})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def signer_lot(request):
    """Appose la signature sur les demandes à l'étape 4. L'accord autorise le papier à en-tête ; le droit s'ouvre au scan."""
    profil = getattr(request.user, "profil", None)
    if not getattr(profil, "signature", None):
        return Response(
            {"detail": "Déposez d'abord votre signature électronique : elle est apposée sur les documents qui circulent."},
            status=409,
        )
    with transaction.atomic():
        lot = Demande.objects.select_for_update().filter(etape__startswith="Étape 4").exclude(etape__icontains="papier")
        formations = list(lot.filter(categorie="formation"))
        autres = lot.exclude(categorie="formation")
        nombre = autres.count() + len(formations)
        if nombre == 0:
            return _conflit("Aucune demande n'attend votre signature.")
        identifiants = list(autres.values_list("id", flat=True))
        autres.update(
            etape="Étape 4 : accord acquis — papier à en-tête à établir",
            responsable=f"Signée par {request.user.get_full_name()}",
            echeance="Établir le papier à en-tête, puis le scanner",
        )
        aujourd_hui = timezone.localdate()
        signature = copie_signature(request.user)
        for demande_id in identifiants:
            VisaDemande.objects.filter(demande_id=demande_id, ordre=4).update(
                signature=signature,
                avis="Accord acquis",
                commentaire=f"Lot signé par {request.user.get_full_name()}. Le papier à en-tête peut être établi.",
                date=aujourd_hui,
                titulaire=request.user.get_full_name(),
                fonction=_signataire(request.user),
                reference=f"MPEEP-{aujourd_hui.year}-DRH-{demande_id:05d}",
            )
        from .inscriptions import cloturer_formation

        for demande in formations:
            cloturer_formation(demande, request.user)
        _notifier(
            request.user, "demande", "Lot DRH signé",
            f"{nombre} demande{'s' if nombre > 1 else ''} signée{'s' if nombre > 1 else ''}. Le papier à en-tête peut être établi ; le droit s'ouvre au scan.",
            "/app/circuits",
        )
    return Response({"signees": nombre})

