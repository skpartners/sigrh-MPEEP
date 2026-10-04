"""Dépôt d'une demande de congé ou d'absence dans le circuit de visa."""

import re
from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from .circuits_config import etapes_pour_conge
from .inscriptions import _reference
from .models import Demande, TypeConge, VisaDemande

ETAPE = ("Étape 2 : chef de service", "Avis hiérarchique attendu", "J-3 avant relance")


def deposer(agent, payload: dict) -> str | None:
    """Ouvre le circuit. Retourne un message d'erreur, ou None."""
    type_conge = TypeConge.objects.filter(code=(payload.get("type") or "").strip()).first()
    if type_conge is None:
        return "Choisissez la nature de la demande."
    debut = parse_date(str(payload.get("debut") or ""))
    fin = parse_date(str(payload.get("fin") or ""))
    if debut is None or fin is None:
        return "Indiquez la date de début et la date de reprise."
    if fin <= debut:
        return "La date de reprise doit être postérieure à la date de début."
    jours = _ouvrables(debut, fin)
    if jours <= 0:
        return "Cette période ne compte aucun jour ouvrable."
    interim = " ".join(str(payload.get("interim") or "").split())
    if not interim:
        return "Désignez le remplaçant qui assure la continuité du service."
    observations = " ".join(str(payload.get("observations") or "").split())
    if _annuel(type_conge) and _deja_ouvert(agent) + jours > agent.reliquat_conges:
        return f"Le reliquat de congé annuel ({agent.reliquat_conges} j) ne couvre pas cette demande."
    aujourd_hui = timezone.localdate()
    configurees = etapes_pour_conge(type_conge)
    if configurees:
        etape, responsable = f"Étape 2 : {configurees[0][0]}", configurees[0][1] or "Avis attendu"
    else:
        etape, responsable = ETAPE[0], ETAPE[1]
    with transaction.atomic():
        demande = Demande.objects.create(
            reference=_reference(aujourd_hui.year),
            agent=agent,
            nature=f"{type_conge.libelle} ({jours} j)",
            icone="calendar_month",
            etape=etape,
            responsable=responsable,
            echeance=ETAPE[2],
            depose_le=aujourd_hui,
            categorie="conge",
        )
        _visas(demande, aujourd_hui, debut, fin, interim, observations, configurees)
    return None


def _annuel(type_conge: TypeConge) -> bool:
    return type_conge.code == "conge-annuel" or "annuel" in type_conge.libelle.lower()


def _deja_ouvert(agent) -> int:
    total = 0
    for demande in agent.demandes.filter(categorie="conge"):
        if _close(demande.etape) or "annuel" not in demande.nature.lower():
            continue
        trouve = re.search(r"\((\d+) j", demande.nature)
        total += int(trouve.group(1)) if trouve else 0
    return total


def _close(etape: str) -> bool:
    normalise = etape.lower().replace("é", "e").replace("ô", "o")
    return "etape 5" in normalise or "notifie" in normalise or "clotur" in normalise


def _ouvrables(debut: date, fin: date) -> int:
    compte = 0
    jour = debut
    while jour < fin:
        if jour.weekday() < 5:
            compte += 1
        jour += timedelta(days=1)
    return compte


def _visas(
    demande: Demande,
    aujourd_hui: date,
    debut: date,
    fin: date,
    interim: str,
    observations: str,
    configurees: list[tuple[str, str]] | None,
) -> None:
    agent = demande.agent
    commentaire = f"Demande déposée du {debut.strftime('%d/%m/%Y')} au {fin.strftime('%d/%m/%Y')}. Remplaçant : {interim}."
    if observations:
        commentaire = f"{commentaire} {observations}"
    etapes = [
        (1, "Requête déposée", agent.nom_complet, agent.fonction or "Agent demandeur", "Déposée", commentaire, aujourd_hui),
    ]
    suite = configurees or [
        ("Visa du chef de service", "Supérieur hiérarchique"),
        ("Visa de la sous-direction", "SD Carrières et Actes"),
        ("Visa DRH", "Directeur des Ressources Humaines"),
        ("Scan versé", "Versement du papier à en-tête"),
    ]
    etapes.extend(
        (ordre, instance, "", fonction or "Validation", "En attente", "", None)
        for ordre, (instance, fonction) in enumerate(suite, start=2)
    )
    VisaDemande.objects.bulk_create(
        [
            VisaDemande(
                demande=demande,
                ordre=ordre,
                instance=instance,
                titulaire=titulaire,
                fonction=fonction,
                avis=avis,
                commentaire=texte,
                date=jour,
            )
            for ordre, instance, titulaire, fonction, avis, texte, jour in etapes
        ]
    )
