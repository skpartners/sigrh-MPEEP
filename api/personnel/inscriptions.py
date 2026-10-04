"""Inscription d'un agent à un module ouvert par la direction de la formation continue."""

from pathlib import Path

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from .models import Demande, InscriptionFormation, Notification, SessionFormation, VisaDemande
from .signatures import copie_signature

EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
TAILLE_MAX = 15 * 1024 * 1024

ETAPES = [
    (2, "Étape 2 : chef de service", "Avis hiérarchique attendu", "J-3 avant relance"),
    (3, "Étape 3 : SD Formation Continue", "Contrôle de la direction de la formation continue", "Dans les délais"),
    (4, "Étape 4 : signature DRH", "Visa du directeur des ressources humaines", "Priorité courante"),
]
CLOTURE = ("Étape 5 : notifiée", "Prise en compte notifiée à l'agent", "Clôturée")


def inscrire(agent, code: str, fichier=None) -> str | None:
    """Ouvre le circuit. Retourne un message d'erreur, ou None."""
    session = (
        SessionFormation.objects.filter(code=(code or "").strip(), ouverte=True)
        .select_related("type_formation")
        .first()
    )
    if session is None:
        return "Ce module n'est pas ouvert par la direction de la formation continue."
    erreur = _piece(session, fichier)
    if erreur:
        return erreur
    libelle = session.libelle
    deja = agent.demandes.filter(categorie="formation", nature=libelle).exclude(etape__icontains="notifi")
    if deja.exists():
        return "Une inscription à ce module est déjà dans le circuit de validation."
    aujourd_hui = timezone.localdate()
    with transaction.atomic():
        demande = Demande.objects.create(
            reference=_reference(aujourd_hui.year),
            agent=agent,
            nature=libelle,
            icone="school",
            etape=ETAPES[0][1],
            responsable=ETAPES[0][2],
            echeance=ETAPES[0][3],
            depose_le=aujourd_hui,
            categorie="formation",
        )
        inscription = InscriptionFormation.objects.create(demande=demande, session=session)
        if fichier is not None and session.type_formation.piece_requise:
            inscription.fichier.save(Path(getattr(fichier, "name", "piece")).name, fichier, save=True)
        _visas_initiaux(demande, aujourd_hui)
    return None


def _piece(session: SessionFormation, fichier) -> str | None:
    """Le document n'est exigé que lorsque le type ne peut pas être vérifié dans le dossier."""
    if not session.type_formation.piece_requise:
        return None
    libelle = session.type_formation.piece_libelle or "document demandé"
    if fichier is None:
        return f"Joignez le {libelle.lower()} avant de transmettre la candidature."
    extension = Path(getattr(fichier, "name", "") or "").suffix.lower()
    if extension not in EXTENSIONS:
        return "Le document doit être un PDF ou une image (PNG, JPG, WEBP)."
    if fichier.size > TAILLE_MAX:
        return "Le document dépasse 15 Mo."
    return None


def valider_etape(demande: Demande, acteur) -> tuple[str, bool]:
    """Valide l'étape en attente. La dernière étape notifie l'agent de sa prise en compte."""
    if demande.categorie != "formation":
        return "Cette validation concerne une inscription à une formation.", False
    if "notifi" in demande.etape.lower():
        return "Cette inscription est déjà notifiée à l'agent.", False
    visa = demande.visas.filter(avis="En attente").order_by("ordre").first()
    if visa is None:
        return "Cette inscription n'a plus d'étape à valider.", False
    aujourd_hui = timezone.localdate()
    nom = acteur.get_full_name() or acteur.username
    fonction = getattr(getattr(acteur, "profil", None), "fonction", "") or nom
    with transaction.atomic():
        if visa.ordre >= 4:
            _cloturer(demande, nom, fonction, aujourd_hui, acteur)
            return "", True
        visa.avis = "Favorable"
        visa.commentaire = "Étape validée."
        visa.date = aujourd_hui
        visa.titulaire = nom
        visa.fonction = fonction
        visa.signature = copie_signature(acteur)
        visa.save()
        suivante = next(etape for etape in ETAPES if etape[0] == visa.ordre + 1)
        demande.etape, demande.responsable, demande.echeance = suivante[1], suivante[2], suivante[3]
        demande.save(update_fields=["etape", "responsable", "echeance"])
    return "", False


def cloturer_formation(demande: Demande, acteur) -> None:
    """Le visa du DRH clôt l'inscription et notifie l'agent."""
    aujourd_hui = timezone.localdate()
    nom = acteur.get_full_name() or acteur.username
    fonction = getattr(getattr(acteur, "profil", None), "fonction", "") or nom
    _cloturer(demande, nom, fonction, aujourd_hui, acteur)


def _cloturer(demande, nom: str, fonction: str, aujourd_hui, acteur) -> None:
    VisaDemande.objects.filter(demande=demande, ordre=4).update(
        signature=copie_signature(acteur),
        avis="Favorable",
        commentaire="Visa du directeur des ressources humaines. L'agent est pris en compte pour cette formation.",
        date=aujourd_hui,
        titulaire=nom,
        fonction=fonction,
    )
    VisaDemande.objects.filter(demande=demande, ordre=5).update(
        avis="Notifiée",
        commentaire="L'agent a été notifié de sa prise en compte.",
        date=aujourd_hui,
        titulaire="Direction des Ressources Humaines",
        fonction="Notification à l'agent",
    )
    demande.etape, demande.responsable, demande.echeance = CLOTURE
    demande.save(update_fields=["etape", "responsable", "echeance"])
    _notifier(demande, acteur)


def _notifier(demande: Demande, acteur) -> None:
    agent = demande.agent
    accord = "prise" if agent.sexe == "F" else "pris"
    message = f"Vous avez été {accord} en compte pour {demande.nature}."
    lien = f"/app/dossiers/{agent.matricule}?onglet=formation"
    compte = User.objects.filter(username=agent.matricule).first()
    if compte is not None:
        _creer(compte, "Prise en compte pour une formation", message, lien)
    if compte is None or compte.pk != acteur.pk:
        _creer(
            acteur,
            "Prise en compte pour une formation",
            f"{agent.nom_complet} a été {accord} en compte pour {demande.nature}.",
            lien,
        )


def _creer(destinataire, titre: str, message: str, lien: str) -> None:
    Notification.objects.create(
        destinataire=destinataire,
        categorie=Notification.Categorie.DEMANDE,
        titre=titre,
        message=message,
        lien=lien,
        urgente=False,
        creee_le=timezone.now(),
    )


def _reference(annee: int) -> str:
    prefixe = f"DM-{annee}-"
    dernier = Demande.objects.filter(reference__startswith=prefixe).order_by("-reference").first()
    numero = 1
    if dernier is not None:
        try:
            numero = int(dernier.reference.rsplit("-", 1)[-1]) + 1
        except ValueError:
            numero = Demande.objects.filter(reference__startswith=prefixe).count() + 1
    return f"{prefixe}{numero:04d}"


def _visas_initiaux(demande: Demande, aujourd_hui) -> None:
    agent = demande.agent
    etapes = [
        (1, "Requête déposée", agent.nom_complet, agent.fonction or "Agent", "Déposée", "Inscription déposée par l'agent.", aujourd_hui),
        (2, "Visa du chef de service", "", "Supérieur hiérarchique", "En attente", "", None),
        (3, "Direction de la formation continue", "", "Sous-direction de la formation continue", "En attente", "", None),
        (4, "Visa DRH", "", "Direction des Ressources Humaines", "En attente", "", None),
        (5, "Notification à l'agent", "", "Prise en compte", "En attente", "", None),
    ]
    VisaDemande.objects.bulk_create(
        [
            VisaDemande(
                demande=demande,
                ordre=ordre,
                instance=instance,
                titulaire=titulaire,
                fonction=fonction,
                avis=avis,
                commentaire=commentaire,
                date=jour,
            )
            for ordre, instance, titulaire, fonction, avis, commentaire, jour in etapes
        ]
    )
