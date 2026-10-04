"""Rapport de pilotage : les données suivent le périmètre de la personne connectée."""

from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, KeepTogether, Spacer

from ..models import (
    Absence,
    Acte,
    Agent,
    AlertePoste,
    DemandeDotation,
    EntiteTutelle,
    Evaluation,
    FicheBesoin,
    PieceJointe,
    ProcedureDisciplinaire,
    VisaEnAttente,
)
from ..present import GRADES_65_ANS
from ..utilisateurs import perimetre_matricules
from .documents import _jour, _signataire
from .mise_en_page import assembler, encadre, fiche, metriques, paragraphe, section, tableau, tableau_reporte, texte
from .papier import ORANGE, VERT

PLAFOND_LIGNES = 8
OUVERT_ACTE = {Acte.Statut.INSTRUCTION, Acte.Statut.COMPLEMENT, Acte.Statut.ACCORDE}
OUVERT_DOTATION = {DemandeDotation.Statut.ARBITRAGE, DemandeDotation.Statut.VISA_CF}
OUVERT_BESOIN = {FicheBesoin.Statut.INSTRUCTION, FicheBesoin.Statut.COMPLEMENT}
CLOS_PROCEDURE = {ProcedureDisciplinaire.Avis.CLASSEE, ProcedureDisciplinaire.Avis.SANCTION}
BANDES = ("Moins de 30 ans", "30 à 39 ans", "40 à 49 ans", "50 à 59 ans", "60 ans et plus", "Date non renseignée")


def rendre_pilotage(user) -> bytes:
    """État 360 de la gestion RH, limité aux agents visibles par ce compte."""
    corps = _corps_chiffre(user)
    return assembler(
        {
            "reference": f"PILOTAGE-{corps['exercice']}",
            "titre": f"Rapport de pilotage {corps['exercice']}",
            "sujet": "Pilotage des ressources humaines",
            "mention": "rapport de pilotage confidentiel",
            "suite": "Pilotage",
            "service": "Direction des ressources humaines",
            "detail": "Direction des ressources humaines",
            "kicker": "Direction des ressources humaines",
            "titre_affiche": "RAPPORT DE PILOTAGE",
            "sous_titre": corps["sous_titre"],
            "badge": "CONFIDENTIEL",
            "gabarit": "pilotage",
            "bandeau": "PILOTAGE RH",
        },
        lambda feuille: _corps_pilotage(feuille, corps),
        _signataire(),
    )


def _corps_chiffre(user) -> dict:
    aujourd_hui = timezone.localdate()
    exercice = aujourd_hui.year
    matricules = perimetre_matricules(user)
    agents = Agent.objects.all()
    complet = matricules is None
    if not complet:
        agents = agents.filter(matricule__in=matricules)
    profil = getattr(user, "profil", None)
    fonction = profil.fonction if profil is not None else ""
    lecteur = user.get_full_name() or user.username
    effectif = agents.count()
    actifs = agents.filter(situation="En activité").count()
    femmes = agents.filter(sexe="F").count()
    notes = set(Evaluation.objects.filter(agent__in=agents, annee=exercice).values_list("agent_id", flat=True))
    actifs_ids = set(agents.filter(situation="En activité").values_list("id", flat=True))
    sans_note = len(actifs_ids - notes)
    horizon = aujourd_hui + timedelta(days=365)
    proches = 0
    atteints = 0
    ages = {bande: [0, 0] for bande in BANDES}
    for _pk, sexe, naissance, grade, _situation in agents.values_list("id", "sexe", "date_naissance", "grade", "situation"):
        colonne = 1 if sexe == "F" else 0
        ages[_bande(naissance, aujourd_hui)][colonne] += 1
        if naissance is None:
            continue
        radiation = _dans(naissance, 65 if grade in GRADES_65_ANS else 60)
        if radiation < aujourd_hui:
            atteints += 1
        elif radiation <= horizon:
            proches += 1
    visas = VisaEnAttente.objects.filter(statut=VisaEnAttente.Statut.EN_ATTENTE, agent__in=agents)
    actes = Acte.objects.filter(agent__in=agents, statut__in=OUVERT_ACTE)
    absences = Absence.objects.filter(agent__in=agents).filter(
        Q(decision=Absence.Decision.EN_ATTENTE)
        | Q(instruction__in=[
            Absence.Instruction.PRET_SIGNATURE,
            Absence.Instruction.CONFLIT_QUORUM,
            Absence.Instruction.DECALE,
        ])
        | Q(statut__icontains="instruction")
    )
    procedures = ProcedureDisciplinaire.objects.filter(agent__in=agents).exclude(avis__in=CLOS_PROCEDURE)
    pieces = PieceJointe.objects.filter(agent__in=agents, verifiee=False)
    entites = _entites_visibles(complet, profil)
    alertes = AlertePoste.objects.filter(traitee=False).select_related("entite")
    besoins = FicheBesoin.objects.filter(statut__in=OUVERT_BESOIN, critique=True)
    dotations = DemandeDotation.objects.filter(statut__in=OUVERT_DOTATION)
    if entites is not None:
        alertes = alertes.filter(entite_id__in=entites)
        besoins = besoins.filter(entite_id__in=entites)
        dotations = dotations.filter(entite_id__in=entites)
    return {
        "exercice": exercice,
        "lecteur": lecteur,
        "matricule": user.username,
        "fonction": fonction,
        "complet": complet,
        "sous_titre": f"{lecteur} · {'ensemble du ministère' if complet else 'périmètre de supervision'}",
        "effectif": effectif,
        "actifs": actifs,
        "femmes": femmes,
        "sans_note": sans_note,
        "proches": proches,
        "atteints": atteints,
        "ages": ages,
        "organismes": list(
            agents.values("organisme__sigle", "organisme__nom")
            .annotate(total=Count("id"), femmes=Count("id", filter=Q(sexe="F")))
            .order_by("-total", "organisme__nom")
        ),
        "situations": list(agents.values("situation").annotate(total=Count("id")).order_by("-total", "situation")),
        "visas": list(visas.select_related("agent").order_by("-urgent", "id")),
        "actes": list(actes.select_related("agent").order_by("date_enregistrement", "id")),
        "absences": list(absences.select_related("agent").order_by("debut", "id")),
        "procedures": list(procedures.select_related("agent").order_by("saisine", "id")),
        "pieces": pieces.count(),
        "alertes": list(alertes.order_by("-jours", "id")),
        "besoins": list(besoins.order_by("-depose_le", "id")),
        "dotations": list(dotations.order_by("recu_le", "id")),
    }


def _corps_pilotage(feuille, corps: dict) -> list:
    part = _part(corps["femmes"], corps["effectif"])
    histoire = [
        paragraphe("Rapport de pilotage des ressources humaines", feuille["titre_gauche"]),
        Spacer(1, 1.2 * mm),
        HRFlowable(width="100%", thickness=1.1, color=VERT, spaceBefore=0, spaceAfter=1.5 * mm),
        HRFlowable(width="28%", thickness=0.8, color=ORANGE, spaceBefore=0, spaceAfter=0),
        Spacer(1, 3 * mm),
        fiche(feuille, [
            ("Établi pour", corps["lecteur"]),
            ("Matricule", corps["matricule"]),
            ("Fonction", corps["fonction"]),
            ("Périmètre", "Ensemble des agents du ministère" if corps["complet"] else "Agents placés sous sa supervision"),
            ("Exercice", str(corps["exercice"])),
        ]),
        Spacer(1, 3 * mm),
        metriques(feuille, [
            ("Effectif", _n(corps["effectif"])),
            ("En activité", _n(corps["actifs"])),
            ("Femmes", f"{_n(corps['femmes'])} · {part}"),
            ("Visas ouverts", _n(len(corps["visas"]))),
            ("Sans notation", _n(corps["sans_note"])),
            ("Limite d'âge", _n(corps["proches"] + corps["atteints"])),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Observations"),
        *texte(feuille, _observation(corps)),
        Spacer(1, 1 * mm),
        *section(feuille, "Points d'attention"),
        _tableau_attention(feuille, corps),
        Spacer(1, 3 * mm),
        *_avec_titre(feuille, "Effectifs par organisme", _tableau_organismes(feuille, corps["organismes"])),
        *_avec_titre(feuille, "Situations administratives", _tableau_situations(feuille, corps["situations"])),
        *_avec_titre(feuille, "Répartition par âge", _tableau_ages(feuille, corps["ages"])),
    ]
    histoire += _bloc_personnes(
        feuille,
        "Visas en attente",
        ["Agent", "Objet", "Échéance", "Urgence"],
        [
            [item.agent.nom_complet, item.objet, item.echeance, "Urgent" if item.urgent else "Courant"]
            for item in corps["visas"]
        ],
        [1.8, 2.4, 1.3, 0.9],
    )
    histoire += _bloc_personnes(
        feuille,
        "Actes encore ouverts",
        ["Agent", "Nature", "Référence", "Statut"],
        [
            [item.agent.nom_complet, item.nature, item.reference, item.get_statut_display()]
            for item in corps["actes"]
        ],
        [1.8, 1.8, 1.6, 1.4],
    )
    histoire += _bloc_personnes(
        feuille,
        "Congés et absences à traiter",
        ["Agent", "Nature", "Début", "Jours"],
        [
            [item.agent.nom_complet, item.nature, _jour(item.debut), str(item.jours)]
            for item in corps["absences"]
        ],
        [1.8, 2.2, 1.5, 0.8],
        nombres_jours=True,
    )
    histoire += _bloc_personnes(
        feuille,
        "Procédures disciplinaires ouvertes",
        ["Agent", "Grief", "Stade", "Degré"],
        [
            [item.agent.nom_complet, item.grief, item.stade, str(item.degre)]
            for item in corps["procedures"]
        ],
        [1.7, 2.2, 1.8, 0.6],
    )
    if corps["alertes"] or corps["besoins"] or corps["dotations"]:
        histoire += [
            Spacer(1, 3 * mm),
            *section(feuille, "Emplois et recrutement"),
            _tableau_emplois(feuille, corps),
        ]
    return histoire


def _observation(corps: dict) -> str:
    if corps["effectif"] == 0:
        return (
            f"{corps['lecteur']} n'a aucun agent dans son périmètre de supervision. "
            "Le rapport reste vide tant qu'une équipe ne lui est pas rattachée."
        )
    phrases = [
        (
            f"Ce rapport retient {_compte(corps['effectif'], 'agent')}"
            f"{', dont ' + str(corps['actifs']) + ' en activité' if corps['actifs'] != corps['effectif'] else ''}. "
            f"Les femmes représentent {_part(corps['femmes'], corps['effectif'])} de l'effectif."
        )
    ]
    if corps["sans_note"]:
        phrases.append(
            f"La campagne de notation {corps['exercice']} laisse {_compte(corps['sans_note'], 'agent')} en activité sans note versée au dossier."
        )
    elif corps["actifs"]:
        phrases.append(f"Chaque agent en activité a une notation versée pour l'exercice {corps['exercice']}.")
    if corps["visas"] or corps["actes"]:
        phrases.append(
            f"{_compte(len(corps['visas']), 'visa')} et {_compte(len(corps['actes']), 'acte')} restent ouverts."
        )
    if corps["atteints"]:
        phrases.append(f"{_compte(corps['atteints'], 'agent')} ont atteint la limite d'âge.")
    elif corps["proches"]:
        phrases.append(f"{_compte(corps['proches'], 'agent')} atteignent la limite d'âge dans les douze mois.")
    if corps["pieces"] == 1:
        phrases.append("Une pièce versée au dossier reste à vérifier.")
    elif corps["pieces"]:
        phrases.append(f"{corps['pieces']} pièces versées au dossier restent à vérifier.")
    return " ".join(phrases)


def _tableau_attention(feuille, corps: dict):
    lignes = []
    urgents = sum(1 for item in corps["visas"] if item.urgent)
    if urgents:
        lignes.append(["Urgent", "Visas", f"{_compte(urgents, 'visa')} marqués urgents attendent une décision."])
    if corps["atteints"]:
        lignes.append(["Urgent", "Limite d'âge", f"{_compte(corps['atteints'], 'agent')} ont dépassé la limite d'âge de leur grade."])
    conflits = sum(1 for item in corps["absences"] if item.instruction == Absence.Instruction.CONFLIT_QUORUM)
    if conflits:
        lignes.append(["Urgent", "Quorum", f"{_compte(conflits, 'absence')} en conflit de quorum de service."])
    if corps["sans_note"]:
        lignes.append(["Vigilance", "Notation", f"{_compte(corps['sans_note'], 'agent')} en activité sans notation {corps['exercice']}."])
    courants = len(corps["visas"]) - urgents
    if courants == 1:
        lignes.append(["Vigilance", "Visas", "1 autre visa reste dans la file."])
    elif courants:
        lignes.append(["Vigilance", "Visas", f"{courants} autres visas restent dans la file."])
    if len(corps["actes"]) == 1:
        lignes.append(["Vigilance", "Actes", "1 acte n'est pas encore validé."])
    elif corps["actes"]:
        lignes.append(["Vigilance", "Actes", f"{len(corps['actes'])} actes ne sont pas encore validés."])
    if corps["procedures"]:
        lignes.append(["Vigilance", "Discipline", f"{_compte(len(corps['procedures']), 'procédure', 'procédures')} encore ouvertes."])
    if corps["proches"]:
        lignes.append(["Suivi", "Départs", f"{_compte(corps['proches'], 'départ')} à la limite d'âge dans les douze mois."])
    if corps["pieces"]:
        lignes.append(["Suivi", "Pièces", f"{_compte(corps['pieces'], 'pièce', 'pièces')} restent à vérifier."])
    if corps["alertes"]:
        postes = sum(item.postes for item in corps["alertes"])
        lignes.append(["Suivi", "Postes critiques", f"{_compte(len(corps['alertes']), 'alerte')}, {_compte(postes, 'poste')} non pourvus."])
    if corps["dotations"] or corps["besoins"]:
        lignes.append([
            "Suivi",
            "Recrutement",
            f"{_compte(len(corps['dotations']), 'demande de poste', 'demandes de poste')} et {_compte(len(corps['besoins']), 'besoin critique', 'besoins critiques')} sont encore ouverts.",
        ])
    if not lignes:
        return encadre(
            feuille,
            "Rien à signaler",
            "Aucun visa, aucun acte ouvert, aucune procédure et aucune limite d'âge proche n'appellent une décision sur ce périmètre.",
        )
    return tableau(feuille, ["Niveau", "Sujet", "Observation"], lignes, [1, 1.3, 3.4], compact=True)


def _tableau_organismes(feuille, lignes_src: list):
    if not lignes_src:
        return tableau(feuille, ["Organisme", "Effectif", "Femmes"], [], [3, 1, 1], compact=True)
    lignes = [
        [item["organisme__sigle"] or item["organisme__nom"], _n(item["total"]), _n(item["femmes"])]
        for item in lignes_src
    ]
    nombres = [[None, float(item["total"]), float(item["femmes"])] for item in lignes_src]
    return tableau_reporte(feuille, ["Organisme", "Effectif", "Femmes"], lignes, [3, 1, 1], nombres, compact=True)


def _tableau_situations(feuille, lignes_src: list):
    if not lignes_src:
        return tableau(feuille, ["Situation", "Effectif"], [], [3, 1], compact=True)
    lignes = [[item["situation"] or "Non renseignée", _n(item["total"])] for item in lignes_src]
    nombres = [[None, float(item["total"])] for item in lignes_src]
    return tableau_reporte(feuille, ["Situation", "Effectif"], lignes, [3, 1], nombres, compact=True)


def _tableau_ages(feuille, ages: dict):
    lignes = []
    nombres = []
    for bande in BANDES:
        hommes, femmes = ages[bande]
        if hommes + femmes == 0:
            continue
        lignes.append([bande, _n(hommes), _n(femmes), _n(hommes + femmes)])
        nombres.append([None, float(hommes), float(femmes), float(hommes + femmes)])
    if not lignes:
        return tableau(feuille, ["Tranche", "Hommes", "Femmes", "Total"], [], [2.2, 1, 1, 1], compact=True)
    return tableau_reporte(
        feuille,
        ["Tranche", "Hommes", "Femmes", "Total"],
        lignes,
        [2.2, 1, 1, 1],
        nombres,
        compact=True,
    )


def _tableau_emplois(feuille, corps: dict):
    lignes = []
    for item in corps["alertes"]:
        lignes.append(["Poste critique", item.entite.nom, item.intitule, f"{_compte(item.postes, 'poste')} · {item.jours} j"])
    for item in corps["besoins"]:
        lignes.append(["Besoin critique", item.direction, item.profil, item.get_statut_display()])
    for item in corps["dotations"]:
        lignes.append(["Demande de poste", item.direction, item.poste, item.get_statut_display()])
    return tableau(
        feuille,
        ["Nature", "Structure", "Intitulé", "Situation"],
        lignes[:PLAFOND_LIGNES],
        [1.3, 1.8, 2, 1.4],
        compact=True,
    )


def _avec_titre(feuille, titre: str, bloc) -> list:
    return [Spacer(1, 3 * mm), KeepTogether([*section(feuille, titre), bloc])]


def _bloc_personnes(feuille, titre, entetes, lignes, largeurs, nombres_jours=False) -> list:
    if not lignes:
        return []
    total = len(lignes)
    visible = lignes[:PLAFOND_LIGNES]
    bloc = [*section(feuille, titre)]
    if total > PLAFOND_LIGNES:
        bloc += texte(feuille, f"{PLAFOND_LIGNES} premiers dossiers, sur {total}.")
    if nombres_jours:
        nombres = [[None, None, None, float(ligne[3])] for ligne in visible]
        tableau_bloc = tableau_reporte(feuille, entetes, visible, largeurs, nombres, compact=True)
    else:
        tableau_bloc = tableau(feuille, entetes, visible, largeurs, compact=True)
    return [Spacer(1, 3 * mm), KeepTogether(bloc + [tableau_bloc])]


def _entites_visibles(complet: bool, profil):
    if complet:
        return None
    racine = getattr(profil, "structure_id", None) if profil is not None else None
    if not racine:
        return set()
    vus = set()
    front = [racine]
    while front:
        vus.update(front)
        front = list(EntiteTutelle.objects.filter(parent_id__in=front).exclude(pk__in=vus).values_list("pk", flat=True))
    return vus


def _bande(naissance, aujourd_hui: date) -> str:
    if naissance is None:
        return BANDES[-1]
    age = aujourd_hui.year - naissance.year - ((aujourd_hui.month, aujourd_hui.day) < (naissance.month, naissance.day))
    if age < 30:
        return BANDES[0]
    if age < 40:
        return BANDES[1]
    if age < 50:
        return BANDES[2]
    if age < 60:
        return BANDES[3]
    return BANDES[4]


def _dans(naissance: date, annees: int) -> date:
    try:
        return naissance.replace(year=naissance.year + annees)
    except ValueError:
        return naissance.replace(year=naissance.year + annees, day=28)


def _part(partiel: int, total: int) -> str:
    if not total:
        return "0 %"
    return f"{partiel / total * 100:.1f} %".replace(".", ",")


def _n(valeur: int) -> str:
    return f"{valeur:,}".replace(",", "\u00a0")


def _compte(nombre: int, singulier: str, pluriel: str = "") -> str:
    return f"{nombre} {singulier if nombre <= 1 else pluriel or singulier + 's'}"
