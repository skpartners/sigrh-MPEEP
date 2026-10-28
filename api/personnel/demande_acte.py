"""Demandes d'actes déposées par l'agent : attestations, permissions et autorisations d'absence.

Les actes demandables se configurent avec les circuits de validation. Un acte attribué à un circuit
en suit les étapes ; sinon il suit le circuit par défaut (visa du chef de service, puis visa du DRH).
L'acte est délivré à l'agent après le dernier visa.
"""

import re
from datetime import date
from pathlib import Path

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.dateparse import parse_date

from .circuits_config import etapes_pour_acte
from .demo_ecrans import jours_ouvres
from .hors_ligne import aujourdhui
from .inscriptions import _reference
from .models import Absence, ActeDemandable, Agent, Demande, Notification, VisaDemande
from .signatures import copie_signature

CATEGORIE = "acte"
DUREE_MAX_JOURS = 30
# Actes dont la période dépasse le plafond des absences (l'allaitement s'étend sur quinze mois).
SANS_PLAFOND = {"autorisation-horaire-allaitement"}

ROLES_CHEF = {"Chef de service", "Sous directeur", "Directeur", "Directeur général"}
ROLES_DRH = {"Directeur", "Directeur général"}

# Circuit par défaut, quand l'acte n'est attribué à aucun circuit configuré.
ETAPES_DEFAUT = [
    ("Visa du chef de service", "Supérieur hiérarchique"),
    ("Visa DRH", "Directeur des Ressources Humaines"),
]
ROLES_SOUS_DIRECTION = {"Sous directeur", "Directeur", "Directeur général"}
ROLES_DEFAUT = {"Visa du chef de service": ROLES_CHEF, "Visa de la sous-direction": ROLES_SOUS_DIRECTION, "Visa DRH": ROLES_DRH}
LIVRAISON = ("Acte délivré", "Délivrance de l'acte à l'agent")
# Dernière étape d'un congé : le papier est versé une fois les visas apposés ; ce n'est pas un visa.
PAPIER_CONGE = "Scan versé"
SANS_VISA = {LIVRAISON[0], PAPIER_CONGE}
A_SIGNER = ("Validée : à signer", "Secrétariat : impression et signature")
CLOTURE_OK = ("Clôturée : acte délivré", "Original à retirer au secrétariat")
CLOTURE_CONGE = ("Clôturée : congé accordé", "Congé accordé")
CLOTURE_REFUS = ("Clôturée : demande refusée", "Voir le motif du refus")

EXTENSIONS_JUSTIFICATIF = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
TAILLE_MAX_JUSTIFICATIF = 5 * 1024 * 1024


def types() -> list[dict]:
    """Actes que l'agent peut demander, tels que configurés."""
    actes = list(ActeDemandable.objects.select_related("parent"))
    racines = [acte for acte in actes if acte.parent_id is None]
    ordonnes = [
        element
        for racine in racines
        for element in (racine, *[acte for acte in actes if acte.parent_id == racine.pk])
    ]
    return [
        {
            "code": acte.code,
            "libelle": acte.libelle,
            "parent": acte.parent.code if acte.parent_id else "",
            "groupe": acte.libelle_groupe,
            "icone": acte.icone,
            "periode": acte.periode,
            "destinataire": acte.destinataire,
            "justificatif": acte.justificatif or ("Pièce justificative." if acte.justificatif_obligatoire else "Pièce justificative (facultatif)."),
            "justificatif_obligatoire": acte.justificatif_obligatoire,
            "circuit": [instance for instance, _fonction in etapes_circuit(acte.code)],
        }
        for acte in ordonnes
    ]


def etapes_circuit(code: str) -> list[tuple[str, str]]:
    """Visas du circuit de l'acte : le circuit attribué, sinon le circuit par défaut."""
    return etapes_pour_acte(code) or ETAPES_DEFAUT


def roles_pour(instance: str) -> set[str]:
    """Rôles habilités à viser une étape : le rôle de l'étape, ou ceux du circuit par défaut."""
    return ROLES_DEFAUT.get(instance) or {instance}


def deposer(agent: Agent, payload: dict, justificatif=None) -> str | None:
    """Ouvre le circuit. Retourne un message d'erreur, ou None."""
    acte = ActeDemandable.objects.filter(code=str(payload.get("type") or "").strip()).first()
    if acte is None:
        return "Choisissez l'acte demandé."
    motif = " ".join(str(payload.get("motif") or "").split())
    if not motif:
        return "Précisez le motif de votre demande."
    if len(motif) > 600:
        return "Le motif est trop long (600 caractères au plus)."
    debut = fin = None
    if acte.periode:
        debut = parse_date(str(payload.get("debut") or ""))
        fin = parse_date(str(payload.get("fin") or ""))
        if debut is None or fin is None:
            return "Indiquez la date de début et la date de fin."
        if fin < debut:
            return "La date de fin précède la date de début."
        if debut < aujourdhui():
            return "La date de début ne peut pas être dans le passé."
        if acte.code not in SANS_PLAFOND and (fin - debut).days + 1 > DUREE_MAX_JOURS:
            return f"Une absence ne peut pas dépasser {DUREE_MAX_JOURS} jours."
    if acte.justificatif_obligatoire and not justificatif:
        return "Joignez le justificatif de votre demande : cet acte n'est pas recevable sans pièce."
    erreur_fichier = _controler_justificatif(justificatif)
    if erreur_fichier:
        return erreur_fichier
    if acte.code == "autorisation-speciale" and debut and fin:
        from .present import conges_agent

        restants = conges_agent(agent)["autorisations_restantes"] - _jours_en_cours(agent, acte.code)
        if jours_ouvres(debut, fin) > restants:
            return f"Il vous reste {max(0, restants)} jour(s) d'autorisation spéciale cette année : cette demande les dépasse."
    destinataire = " ".join(str(payload.get("destinataire") or "").split())[:160] if acte.destinataire else ""
    etapes = etapes_circuit(acte.code)
    aujourd_hui = aujourdhui()
    from .parametres import libelle_echeance_hierarchie

    with transaction.atomic():
        demande = Demande.objects.create(
            reference=_reference(aujourd_hui.year),
            agent=agent,
            nature=acte.libelle,
            icone=acte.icone,
            etape=f"Étape 2 : {etapes[0][0]}",
            responsable=etapes[0][1] or "Avis attendu",
            echeance=libelle_echeance_hierarchie(),
            depose_le=aujourd_hui,
            categorie=CATEGORIE,
            type_acte=acte.code,
            motif=motif,
            debut=debut,
            fin=fin,
            destinataire=destinataire,
            justificatif=justificatif or "",
        )
        VisaDemande.objects.create(
            demande=demande, ordre=1, instance="Requête déposée", titulaire=agent.nom_complet,
            fonction=agent.fonction or "Agent demandeur", avis="Déposée", commentaire=motif, date=aujourd_hui,
        )
        suite = [*etapes, LIVRAISON]
        VisaDemande.objects.bulk_create(
            [
                VisaDemande(demande=demande, ordre=ordre, instance=instance, fonction=fonction or "Validation", avis="En attente")
                for ordre, (instance, fonction) in enumerate(suite, start=2)
            ]
        )
        _prevenir_suivants(demande)
    return None


def _controler_justificatif(fichier) -> str | None:
    """Le justificatif est facultatif ; s'il est joint, c'est un PDF ou une image de 5 Mo au plus."""
    if fichier is None:
        return None
    if Path(getattr(fichier, "name", "") or "").suffix.lower() not in EXTENSIONS_JUSTIFICATIF:
        return "Le justificatif doit être un PDF ou une image (PNG, JPG, WEBP)."
    if fichier.size > TAILLE_MAX_JUSTIFICATIF:
        return "Le justificatif dépasse 5 Mo."
    return None


def _jours_en_cours(agent: Agent, code: str) -> int:
    """Jours ouvrés déjà demandés, pas encore décidés, pour ce type d'acte."""
    total = 0
    for item in agent.demandes.filter(categorie=CATEGORIE, type_acte=code, debut__isnull=False):
        if not item.etape.startswith("Clôturée"):
            total += jours_ouvres(item.debut, item.fin)
    return total


# Rapprochement avec le registre des absences (écran Carrières · Absences).
TYPE_AUTORISATION = {
    "permission-speciale": Absence.TypeAutorisation.PERMISSION,
    "autorisation-speciale": Absence.TypeAutorisation.SPECIALE,
    "permission": Absence.TypeAutorisation.AUTORISATION,
}


def _inscrire_absence(demande: Demande, aujourd_hui: date, motif: str) -> None:
    """L'acte délivré inscrit l'absence accordée : elle compte dans le solde et dans l'assiduité."""
    type_autorisation = TYPE_AUTORISATION.get(demande.type_acte)
    if type_autorisation is None or demande.debut is None or demande.fin is None:
        return
    Absence.objects.create(
        agent=demande.agent,
        nature=demande.nature,
        debut=demande.debut,
        fin=demande.fin,
        jours=jours_ouvres(demande.debut, demande.fin),
        statut="Justifiée",
        type_autorisation=type_autorisation,
        justificatif=f"Acte {demande.reference}",
        decision=Absence.Decision.VALIDEE,
        motif_decision=(motif or demande.motif)[:1000],
        decide_le=aujourd_hui,
    )


def _prevenir_suivants(demande: Demande) -> None:
    """Prévient ceux qui peuvent viser l'étape en cours."""
    visa = etape_courante(demande)
    if visa is None:
        return
    agent = demande.agent
    for compte in User.objects.filter(profil__role__in=roles_pour(visa.instance)).exclude(username=agent.matricule):
        if not peut_decider(compte, demande):
            continue
        Notification.objects.create(
            destinataire=compte, categorie="demande", titre={"conge": "Demande de congé à viser", "mutation": "Demande de mutation à viser"}.get(demande.categorie, "Demande d'acte à viser"),
            message=f"{agent.nom_complet} · {demande.nature}.", lien="/app/agents?onglet=demandes", creee_le=timezone.now(),
        )


def etape_courante(demande: Demande) -> VisaDemande | None:
    """Prochain visa à apposer ; la délivrance n'est pas un visa."""
    return demande.visas.filter(avis="En attente").exclude(instance__in=SANS_VISA).order_by("ordre").first()


def peut_decider(user, demande: Demande) -> bool:
    """Le rôle de l'étape en cours, dans son périmètre ; jamais sur sa propre demande."""
    from .utilisateurs import perimetre_matricules

    if user.username == demande.agent.matricule:
        return False
    visa = etape_courante(demande)
    if visa is None:
        return False
    role = getattr(getattr(user, "profil", None), "role", "")
    if role not in roles_pour(visa.instance):
        return False
    perimetre = perimetre_matricules(user)
    return perimetre is None or demande.agent.matricule in perimetre


def visa_initial(demande: Demande) -> VisaDemande | None:
    """Premier visa du circuit (celui qui suit le dépôt)."""
    return demande.visas.filter(ordre__gt=1).exclude(instance__in=SANS_VISA).order_by("ordre").first()


def visa_final(demande: Demande) -> VisaDemande | None:
    """Dernier visa du circuit : celui qui délivre l'acte."""
    return demande.visas.filter(ordre__gt=1).exclude(instance__in=SANS_VISA).order_by("-ordre").first()


def decider(demande: Demande, acteur, sens: str, motif: str) -> str | None:
    """Vise ou refuse l'étape en cours. Le refus exige un motif ; le dernier visa délivre l'acte."""
    if sens not in {"valider", "refuser"}:
        return "Décision inconnue : « valider » ou « refuser » attendu."
    motif = " ".join((motif or "").split())[:600]
    if sens == "refuser" and not motif:
        return "Le motif du refus est obligatoire."
    visa = etape_courante(demande)
    if visa is None:
        return "Cette demande n'attend plus de décision."
    nom = acteur.get_full_name() or acteur.username
    fonction = getattr(getattr(acteur, "profil", None), "fonction", "") or nom
    aujourd_hui = timezone.localdate()
    delivre = False
    with transaction.atomic():
        visa.titulaire, visa.fonction, visa.date = nom, fonction, aujourd_hui
        if sens == "refuser":
            visa.avis, visa.commentaire = "Refusée", motif
            visa.save()
            demande.visas.filter(avis="En attente").update(avis="Sans suite")
            demande.etape, demande.responsable = CLOTURE_REFUS
            demande.echeance = "Aucune suite"
            _solder_registre(demande, False, motif, aujourd_hui)
            if demande.categorie == "mutation":
                from .mutations import refuser

                refuser(demande, motif)
        else:
            suivant = demande.visas.filter(ordre__gt=visa.ordre, avis="En attente").exclude(instance__in=SANS_VISA).order_by("ordre").first()
            visa.avis, visa.commentaire = "Favorable", motif or "Visa apposé."
            visa.signature = copie_signature(acteur)
            visa.reference = f"MPEEP-{aujourd_hui.year}-{demande.id:05d}" if suivant is None else ""
            visa.save()
            if suivant is None and demande.categorie == "mutation":
                from .mutations import accorder

                delivre = True
                accorder(demande, aujourd_hui)
            elif suivant is None and demande.categorie == "conge":
                delivre = True
                _accorder_conge(demande, aujourd_hui)
            elif suivant is None:
                delivre = True
                _inscrire_absence(demande, aujourd_hui, motif)
                # Toutes les validations sont obtenues : le secrétariat imprime, fait signer, puis verse le document signé.
                demande.etape, demande.responsable = A_SIGNER
                demande.echeance = "Signature en cours"
            else:
                demande.etape = f"Étape {suivant.ordre} : {suivant.instance}"
                demande.responsable = suivant.fonction or "Avis attendu"
        demande.save(update_fields=["etape", "responsable", "echeance"])
        _prevenir(demande, delivre, sens == "refuser", motif)
    return None


def _solder_registre(demande: Demande, accordee: bool, motif: str, aujourd_hui: date) -> None:
    """Une absence demandée figure aussi au registre : l'issue du circuit la décide, sans seconde validation."""
    Absence.objects.filter(demande=demande, decision=Absence.Decision.EN_ATTENTE).update(
        decision=Absence.Decision.VALIDEE if accordee else Absence.Decision.INVALIDEE,
        statut="Justifiée" if accordee else "Injustifiée",
        motif_decision=(motif or ("Demande accordée au terme du circuit de validation." if accordee else "Demande refusée."))[:1000],
        decide_le=aujourd_hui,
    )


def _accorder_conge(demande: Demande, aujourd_hui: date) -> None:
    """Dernier visa d'un congé : la demande est close, le congé annuel est décompté du reliquat de l'agent."""
    VisaDemande.objects.filter(demande=demande, instance=PAPIER_CONGE).update(
        avis="Accordé", titulaire="Direction des Ressources Humaines", fonction="Notification à l'agent",
        date=aujourd_hui, commentaire="Le congé est accordé : l'agent est notifié.",
    )
    demande.etape, demande.responsable = CLOTURE_CONGE
    demande.echeance = "Terminée"
    _solder_registre(demande, True, "", aujourd_hui)
    trouve = re.search(r"\((\d+) j", demande.nature)
    if trouve and "annuel" in demande.nature.lower():
        Agent.objects.filter(pk=demande.agent_id).update(conges_consommes=F("conges_consommes") + int(trouve.group(1)))
        from .droits_conges import consommer, exercice_a_attribuer

        # L'exercice dont relève ce congé est celui choisi au dépôt ; à défaut, celui que désignent les droits.
        demande.exercice = demande.exercice or exercice_a_attribuer(demande.agent)
        demande.save(update_fields=["exercice"])
        consommer(demande.agent, int(trouve.group(1)), demande.exercice)


def _prevenir(demande: Demande, delivre: bool, refuse: bool, motif: str) -> None:
    """Prévient l'agent de l'issue, ou le prochain responsable quand le circuit continue."""
    if not (delivre or refuse):
        _prevenir_suivants(demande)
        return
    if delivre and demande.categorie != "mutation":
        prevenir_secretariat(demande)
    compte = User.objects.filter(username=demande.agent.matricule).first()
    if compte is None:
        return
    if demande.categorie == "mutation":
        return  # la mutation informe elle-même l'agent et celui qui l'a demandée (mutations.py)
    conge = demande.categorie == "conge"
    if delivre:
        titre, message = (
            ("Votre congé est accordé", f"{demande.nature} : toutes les validations sont obtenues.")
            if conge
            else ("Votre demande est validée", f"{demande.nature} : toutes les validations sont obtenues, le document part à la signature.")
        )
    else:
        titre, message = ("Demande de congé refusée" if conge else "Demande d'acte refusée"), f"{demande.nature} : {motif}"[:280]
    Notification.objects.create(
        destinataire=compte, categorie="demande", titre=titre, message=message,
        lien="/app/agents?onglet=demandes", creee_le=timezone.now(),
    )


def prevenir_secretariat(demande: Demande) -> None:
    """Prévient le secrétariat qu'un document validé de bout en bout attend d'être imprimé."""
    from .secretariat import comptes_secretariat

    for compte in comptes_secretariat(demande.agent.matricule):
        Notification.objects.create(
            destinataire=compte, categorie="demande", titre="Document à imprimer et à faire signer",
            message=f"{demande.agent.nom_complet} · {demande.nature}."[:280], lien="/app/secretariat", creee_le=timezone.now(),
        )


def delivree(demande: Demande) -> bool:
    return demande.categorie == CATEGORIE and demande.etape.startswith("Clôturée : acte délivré")
