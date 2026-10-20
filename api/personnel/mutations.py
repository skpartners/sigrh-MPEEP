"""Demande de mutation : l'agent, ou sa hiérarchie pour lui, demande à rejoindre une autre structure.

La demande suit le circuit de validation (chef de service, sous-direction, DRH) avec le moteur des demandes d'actes.
Quand c'est la hiérarchie qui la dépose, ses propres visas sont acquis d'office et l'agent est notifié. Le dernier visa
rattache l'agent à sa nouvelle structure et inscrit la mutation à son parcours.
"""

from datetime import date
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from .dotation_agents import _compte, _nom, _notifier, _reference, appliquer_rattachement, structure_actuelle
from .models import Agent, Demande, EntiteTutelle, EtapeParcours, Mutation, VisaDemande

CATEGORIE = "mutation"
ETAPES = [
    ("Visa du chef de service", "Supérieur hiérarchique"),
    ("Visa de la sous-direction", "Sous-direction"),
    ("Visa DRH", "Directeur des Ressources Humaines"),
]
CLOTURE_ACCORD = ("Clôturée : mutation accordée", "Mutation prononcée")
CLOTURE_REFUS = ("Clôturée : mutation refusée", "Voir le motif du refus")


def deposer(demandeur, agent: Agent, structure_id, motif: str, souhaitee, document=None) -> tuple[Mutation | None, str | None]:
    """Ouvre le circuit. Retourne la mutation créée, ou un message d'erreur."""
    from .demande_acte import roles_pour

    destination = EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).filter(pk=structure_id or 0).first()
    if destination is None:
        return None, "Choisissez la structure demandée."
    motif = " ".join((motif or "").split())[:500]
    if not motif:
        return None, "Précisez le motif de la demande de mutation."
    actuelle = structure_actuelle(agent)
    if actuelle is not None and actuelle.id == destination.id:
        return None, "L'agent se trouve déjà dans cette structure."
    if souhaitee and souhaitee < timezone.localdate():
        return None, "La date souhaitée ne peut pas être dans le passé."
    if agent.mutations.filter(statut=Mutation.Statut.EN_COURS).exists():
        return None, "Une demande de mutation est déjà en cours pour cet agent."

    pour_un_autre = demandeur.username != agent.matricule
    nom_demandeur = _nom(demandeur)
    fonction_demandeur = getattr(getattr(demandeur, "profil", None), "fonction", "") or nom_demandeur
    role = getattr(getattr(demandeur, "profil", None), "role", "")
    aujourd_hui = timezone.localdate()
    with transaction.atomic():
        demande = Demande.objects.create(
            reference=_reference("MUT", Demande, aujourd_hui.year), agent=agent, nature=f"Mutation vers {destination.nom}",
            icone="swap_horiz", etape="", responsable="", echeance="", depose_le=aujourd_hui, categorie=CATEGORIE,
            motif=motif, destinataire=destination.nom[:160],
        )
        if document is not None:  # pièce facultative : lettre, avis de la structure d'accueil…
            demande.justificatif.save(Path(document.name).name, document, save=True)
        VisaDemande.objects.create(
            demande=demande, ordre=1, instance="Requête déposée", titulaire=nom_demandeur,
            fonction=fonction_demandeur if pour_un_autre else (agent.fonction or "Agent demandeur"), avis="Déposée",
            commentaire=motif, date=aujourd_hui,
        )
        courant = None
        for ordre, (instance, fonction) in enumerate(ETAPES, start=2):
            # Une demande de la hiérarchie vaut visa pour les étapes que son rôle tient déjà.
            acquis = courant is None and pour_un_autre and role in roles_pour(instance)
            VisaDemande.objects.create(
                demande=demande, ordre=ordre, instance=instance, fonction=fonction,
                avis="Favorable" if acquis else "En attente",
                titulaire=nom_demandeur if acquis else "", date=aujourd_hui if acquis else None,
                commentaire="Demande formulée par la hiérarchie : visa acquis." if acquis else "",
            )
            if not acquis and courant is None:
                courant = (ordre, instance, fonction)
        if courant is None:  # le demandeur tient tous les visas : le DRH reste l'ultime décideur
            dernier = demande.visas.order_by("-ordre").first()
            dernier.avis, dernier.titulaire, dernier.date, dernier.commentaire = "En attente", "", None, ""
            dernier.save()
            courant = (dernier.ordre, dernier.instance, dernier.fonction)
        demande.etape, demande.responsable, demande.echeance = f"Étape {courant[0]} : {courant[1]}", courant[2] or "Avis attendu", "Dans les délais"
        demande.save(update_fields=["etape", "responsable", "echeance"])
        item = Mutation.objects.create(
            agent=agent, demande=demande, demandeur=demandeur, demandeur_nom=nom_demandeur, structure_demandee=destination,
            origine_nom=actuelle.nom if actuelle else agent.structure, motif=motif, date_souhaitee=souhaitee,
        )
        if pour_un_autre:
            _notifier(
                _compte(agent), "Demande de mutation vous concernant",
                f"{nom_demandeur} demande votre mutation vers {destination.nom} : {motif}", f"/app/agents/{agent.matricule}?onglet=disposition",
            )
        from .demande_acte import _prevenir_suivants

        _prevenir_suivants(demande)
    return item, None


def accorder(demande: Demande, aujourd_hui: date) -> None:
    """Dernier visa : l'agent rejoint sa nouvelle structure, la mutation entre dans son parcours."""
    item = Mutation.objects.select_related("agent", "structure_demandee").filter(demande=demande).first()
    demande.etape, demande.responsable = CLOTURE_ACCORD
    demande.echeance = "Terminée"
    if item is None:
        return
    agent, destination = item.agent, item.structure_demandee
    effet = max(item.date_souhaitee or aujourd_hui, aujourd_hui) if item.date_souhaitee else aujourd_hui
    EtapeParcours.objects.create(
        agent=agent, type=EtapeParcours.Type.MUTATION, intitule=f"Mutation : {destination.nom}"[:200], date_effet=effet,
        reference_acte=demande.reference, detail=f"De {item.origine_nom or 'structure non renseignée'} vers {destination.nom}"[:300],
    )
    appliquer_rattachement(agent, destination)
    item.statut, item.decidee_le = Mutation.Statut.ACCORDEE, aujourd_hui
    item.save(update_fields=["statut", "decidee_le"])
    _informer(item, "Mutation accordée", f"La mutation de {agent.nom_complet} vers {destination.nom} est accordée, à compter du {effet:%d/%m/%Y}.")


def refuser(demande: Demande, motif: str) -> None:
    item = Mutation.objects.select_related("agent", "structure_demandee").filter(demande=demande).first()
    if item is None:
        return
    item.statut, item.decidee_le = Mutation.Statut.REFUSEE, timezone.localdate()
    item.save(update_fields=["statut", "decidee_le"])
    _informer(item, "Mutation refusée", f"La demande de mutation de {item.agent.nom_complet} vers {item.structure_demandee.nom} est refusée : {motif}")


def _informer(item: Mutation, titre: str, message: str) -> None:
    """L'agent est toujours informé de l'issue, et celui qui a déposé la demande aussi."""
    lien = f"/app/agents/{item.agent.matricule}?onglet=disposition"
    destinataires = [_compte(item.agent)]
    if item.demandeur_id and item.demandeur_id != getattr(destinataires[0], "pk", None):
        destinataires.append(item.demandeur)
    for compte in destinataires:
        _notifier(compte, titre, message, lien)


def ligne(item: Mutation) -> dict:
    return {
        "id": item.id,
        "reference": item.demande.reference,
        "agent": {"matricule": item.agent.matricule, "nom_complet": item.agent.nom_complet},
        "origine": item.origine_nom,
        "destination": item.structure_demandee.nom,
        "motif": item.motif,
        "demandeur": item.demandeur_nom,
        "pour_un_autre": bool(item.demandeur_id and item.demandeur.username != item.agent.matricule),
        "date_souhaitee": item.date_souhaitee.isoformat() if item.date_souhaitee else "",
        "statut": item.statut,
        "statut_libelle": item.get_statut_display(),
        "etape": item.demande.etape,
        "depose_le": item.demande.depose_le.isoformat(),
        "document_url": item.demande.justificatif.url if item.demande.justificatif else "",
        "document_nom": Path(item.demande.justificatif.name).name if item.demande.justificatif else "",
        "decidee_le": item.decidee_le.isoformat() if item.decidee_le else "",
        "visas": [
            {"ordre": v.ordre, "instance": v.instance, "avis": v.avis, "titulaire": v.titulaire, "date": v.date.isoformat() if v.date else "", "commentaire": v.commentaire}
            for v in item.demande.visas.order_by("ordre")
        ],
    }
