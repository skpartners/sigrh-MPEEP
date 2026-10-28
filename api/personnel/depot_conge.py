"""Dépôt d'une demande de congé ou d'absence dans le circuit de visa."""

import re
from datetime import date, timedelta

from django.db import transaction
from django.utils.dateparse import parse_date

from .circuits_config import etapes_pour_absence, etapes_pour_conge
from .hors_ligne import aujourdhui
from .inscriptions import _reference
from .models import PLAFOND_EXERCICE, Absence, Demande, TypeAbsence, TypeConge, VisaDemande

ETAPE = ("Étape 2 : chef de service", "Avis hiérarchique attendu")


def _echeance_hierarchie() -> str:
    from .parametres import libelle_echeance_hierarchie

    return libelle_echeance_hierarchie()


def deposer(agent, payload: dict) -> str | None:
    """Ouvre le circuit. Retourne un message d'erreur, ou None."""
    code = (payload.get("type") or "").strip()
    type_conge = TypeConge.objects.filter(code=code).first()
    absence = None if type_conge is not None else TypeAbsence.objects.filter(code=code).first()
    if type_conge is None and absence is None:
        return "Choisissez la nature de la demande."
    element = type_conge or absence
    debut = parse_date(str(payload.get("debut") or ""))
    fin = parse_date(str(payload.get("fin") or ""))
    if debut is None or fin is None:
        return "Indiquez la date de début et la date de reprise."
    if fin <= debut:
        return "La date de reprise doit être postérieure à la date de début."
    # Le congé annuel se décompte en jours calendaires (samedis et dimanches compris) ; le reste, en jours ouvrables.
    jours = _decompte(debut, fin, annuel=type_conge is not None and _annuel(type_conge))
    if jours <= 0:
        return "Cette période ne compte aucun jour ouvrable."
    # Le congé annuel suit les dates arrêtées par la campagne de planification : l'agent n'en donne pas d'autres,
    # il active l'une de ses périodes. Sans plan arrêté (pas de campagne), la saisie des dates reste libre.
    exercice = None
    if type_conge is not None and _annuel(type_conge):
        erreur, exercice = _controler_exercice(agent, payload, debut, fin, jours)
        if erreur:
            return erreur
    interim = " ".join(str(payload.get("interim") or "").split())  # facultatif
    observations = " ".join(str(payload.get("observations") or "").split())
    if type_conge is not None and _annuel(type_conge) and jours > PLAFOND_EXERCICE:
        return f"On ne peut pas prendre plus de {PLAFOND_EXERCICE} jours au titre d'un seul exercice : déposez une demande par exercice."
    if type_conge is not None and _annuel(type_conge) and _deja_ouvert(agent) + jours > agent.reliquat_conges:
        return f"Le reliquat de congé annuel ({agent.reliquat_conges} j) ne couvre pas cette demande."
    # Date de saisie : une demande déposée hors ligne compte à la date où l'agent l'a validée, pas à celle de la synchronisation.
    aujourd_hui = aujourdhui()
    configurees = etapes_pour_conge(type_conge) if type_conge is not None else etapes_pour_absence(absence)
    if configurees:
        etape, responsable = f"Étape 2 : {configurees[0][0]}", configurees[0][1] or "Avis attendu"
    else:
        etape, responsable = ETAPE[0], ETAPE[1]
    with transaction.atomic():
        demande = Demande.objects.create(
            reference=_reference(aujourd_hui.year),
            agent=agent,
            nature=f"{element.libelle} ({jours} j)",
            icone="calendar_month",
            etape=etape,
            responsable=responsable,
            echeance=_echeance_hierarchie(),
            depose_le=aujourd_hui,
            categorie="conge",
            debut=debut,
            fin=fin,
            exercice=exercice,
        )
        _visas(demande, aujourd_hui, debut, fin, interim, observations, configurees)
        if absence is not None:
            _inscrire_au_registre(demande, absence, agent, debut, fin, jours, interim)
    return None


# Nature d'autorisation du registre des absences selon le type de demande de l'agent ; à défaut, une autorisation d'absence.
AUTORISATION_PAR_TYPE = {
    "convenance-personnelle": Absence.TypeAutorisation.AUTORISATION,
    "evenement-familial": Absence.TypeAutorisation.PERMISSION,
    "formation": Absence.TypeAutorisation.SPECIALE,
    "mission": Absence.TypeAutorisation.SPECIALE,
}


def _inscrire_au_registre(demande: Demande, absence: TypeAbsence, agent, debut: date, fin: date, jours: int, interim: str) -> None:
    """La demande d'absence de l'agent apparaît dans « Suivi des absences », à statuer par le gestionnaire."""
    Absence.objects.create(
        agent=agent,
        demande=demande,
        nature=absence.libelle,
        debut=debut,
        fin=fin,
        jours=jours,
        statut="En instruction",
        interim=interim,
        type_autorisation=AUTORISATION_PAR_TYPE.get(absence.code, Absence.TypeAutorisation.AUTORISATION),
        justificatif=f"Demande {demande.reference}",
        decision=Absence.Decision.EN_ATTENTE,
    )


def periodes_arretees(agent) -> list[tuple[date, date]]:
    """Périodes de congé annuel arrêtées pour l'agent (début, jour de reprise), dans l'ordre du calendrier."""
    from .models import PlanConge

    plan = PlanConge.objects.filter(agent__username=agent.matricule, palier=PlanConge.Palier.PUBLIE).order_by("-campagne__exercice").first()
    if plan is None:
        return []
    periodes = [(plan.debut, plan.fin + timedelta(days=1))]
    if plan.debut2 and plan.fin2:
        periodes.append((plan.debut2, plan.fin2 + timedelta(days=1)))
    return periodes


def _periode_demandee(agent, debut: date, fin: date) -> bool:
    return agent.demandes.filter(categorie="conge", debut=debut, fin=fin).exclude(etape__icontains="refus").exists()


def _controler_plan_arrete(agent, debut: date, fin: date) -> str | None:
    arretees = periodes_arretees(agent)
    if not arretees:
        return None
    if (debut, fin) not in arretees:
        return "Votre congé annuel suit les dates arrêtées par la campagne : choisissez l'une de vos périodes."
    if _periode_demandee(agent, debut, fin):
        return "Cette période a déjà été demandée."
    # Deux tranches : la plus ancienne se demande d'abord.
    restantes = [periode for periode in arretees if not _periode_demandee(agent, *periode)]
    if restantes and (debut, fin) != restantes[0]:
        return "Demandez d'abord votre première période : la tranche la plus ancienne se prend en premier."
    return None


def _controler_exercice(agent, payload: dict, debut: date, fin: date, jours: int) -> tuple[str | None, int | None]:
    """Exercice dont relève le congé annuel, et règle de dates qui en découle. Retourne (erreur, exercice)."""
    from .droits_conges import annee_courante, est_reliquat
    from .models import DroitConge

    droits = list(DroitConge.objects.filter(agent=agent))
    if not droits:
        # Droits non chargés pour cet agent : seule la règle de la campagne s'applique.
        return _controler_plan_arrete(agent, debut, fin), None
    ouverts = {droit.annee: droit for droit in droits if droit.restant > 0}
    if not ouverts:
        return "Aucun jour de congé annuel ne reste à prendre.", None
    normal = annee_courante() - 1
    try:
        exercice = int(payload.get("exercice") or 0)
    except (TypeError, ValueError):
        exercice = 0
    if not exercice:
        exercice = normal if normal in ouverts else min(ouverts)
    if exercice not in ouverts:
        return f"Aucun jour de congé annuel n'est dû au titre de {exercice}.", None
    deja = sum(
        int(trouve.group(1))
        for demande in agent.demandes.filter(categorie="conge", exercice=exercice)
        if not _close(demande.etape) and "refus" not in demande.etape.lower() and (trouve := re.search(r"\((\d+) j", demande.nature))
    )
    if jours > ouverts[exercice].restant - deja:
        return f"Il reste {max(ouverts[exercice].restant - deja, 0)} j au titre de {exercice} : la demande en compte {jours}.", None
    if est_reliquat(exercice):
        # Reliquat : l'agent choisit son départ, mais en année N.
        if debut.year != annee_courante():
            return f"Les jours de {exercice} se prennent en {annee_courante()} : choisissez un départ en {annee_courante()}.", None
        return None, exercice
    return _controler_plan_arrete(agent, debut, fin), exercice


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


def _decompte(debut: date, fin: date, annuel: bool) -> int:
    """Jours entre le départ (inclus) et la reprise (exclue) : tous les jours pour le congé annuel, sinon les jours ouvrables."""
    if annuel:
        return max((fin - debut).days, 0)
    return _ouvrables(debut, fin)


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
    commentaire = f"Demande déposée du {debut.strftime('%d/%m/%Y')} au {fin.strftime('%d/%m/%Y')}."
    if interim:
        commentaire = f"{commentaire} Remplaçant : {interim}."
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
