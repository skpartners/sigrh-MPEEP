"""Tableaux croisés dynamiques : sources fermées, cube agrégé, configurations enregistrées.

Le serveur regroupe les enregistrements d'une source selon les champs demandés et
renvoie, pour chaque combinaison, le nombre d'enregistrements et les agrégats des
mesures numériques. Le navigateur fait pivoter ce cube (lignes, colonnes, filtres,
sous-totaux, pourcentages) sans nouvel aller-retour.

Les codes de champs et de mesures viennent du catalogue. Les modalités (un corps,
une structure, un statut) sont lues dans la base au moment du calcul.
"""

import json
from dataclasses import dataclass, field
from datetime import date

from django.db import models
from django.db.models import (
    Avg,
    Case,
    CharField,
    Count,
    Exists,
    ExpressionWrapper,
    F,
    FloatField,
    IntegerField,
    Max,
    Min,
    OuterRef,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce, ExtractYear
from django.utils import timezone

from .models import (
    Absence,
    Acte,
    Agent,
    BesoinFormation,
    Demande,
    DemandeDotation,
    DossierRetraite,
    EnveloppeSociale,
    Evaluation,
    FicheBesoin,
    Formation,
    PrestationSociale,
    ProcedureDisciplinaire,
    SanctionDisciplinaire,
    SessionFormation,
)

VIDE = "Non renseigné"
MAX_CHAMPS = 8
MAX_VALEURS = 6
MAX_GROUPES = 20000
AGREGATS = ("nombre", "somme", "moyenne", "min", "max")
AFFICHAGES = ("valeur", "pct_total", "pct_ligne", "pct_colonne")
FORMES = (
    "barre", "horizontale", "empilee", "empilee-horizontale", "pourcentage",
    "ligne", "aire", "points", "entonnoir", "secteur", "anneau",
)


class CompositionInvalide(ValueError):
    pass


def _choix(enumeration) -> dict[str, str]:
    return {valeur: str(libelle) for valeur, libelle in enumeration}


@dataclass(frozen=True)
class Champ:
    code: str
    libelle: str
    chemin: str
    choix: dict[str, str] = field(default_factory=dict)
    # "" : valeur lue telle quelle ; "annee" : année du champ date ; "tranche_age" : tranche calculée.
    calcul: str = ""
    groupe: str = ""
    # Champ propre à une source croisée (la nature d'une absence) : le tableau passe au grain de cette source.
    detail: str = ""


@dataclass(frozen=True)
class Mesure:
    code: str
    libelle: str
    chemin: str = ""
    # "" : champ numérique ; "duree" : années écoulées depuis la date du chemin ;
    # "compte", "somme", "moyenne" : total par agent d'une source croisée (chemin « source:champ »).
    calcul: str = ""
    groupe: str = ""

    @property
    def numerique(self) -> bool:
        return self.code != "nombre"


@dataclass(frozen=True)
class Source:
    code: str
    libelle: str
    modele: type[models.Model]
    champs: tuple[Champ, ...]
    mesures: tuple[Mesure, ...]
    # Les sources rattachées à un agent reçoivent aussi les champs du dossier agent.
    rattachee: bool = True

    def champ(self, code: str) -> Champ:
        for item in self.champs:
            if item.code == code:
                return item
        raise CompositionInvalide(f"Le champ « {code} » n'existe pas dans {self.libelle.lower()}.")

    def mesure(self, code: str) -> Mesure:
        for item in self.mesures:
            if item.code == code:
                return item
        raise CompositionInvalide(f"La mesure « {code} » n'existe pas dans {self.libelle.lower()}.")


def _c(code: str, libelle: str, chemin: str, choix=None, calcul: str = "") -> Champ:
    return Champ(code, libelle, chemin, choix or {}, calcul)


NOMBRE = Mesure("nombre", "Nombre")
SEXE = {"H": "Homme", "F": "Femme"}

CHAMPS_AGENT: tuple[Champ, ...] = (
    _c("organisme", "Organisme", "organisme__nom"),
    _c("sexe", "Sexe", "sexe", SEXE),
    _c("corps", "Corps", "corps"),
    _c("grade", "Grade", "grade"),
    _c("categorie", "Catégorie", "categorie"),
    _c("situation", "Situation", "situation"),
    _c("type_agent", "Type d'agent", "type_agent"),
    _c("mode_recrutement", "Mode de recrutement", "mode_recrutement"),
    _c("structure", "Structure", "structure"),
    _c("direction", "Direction", "direction"),
    _c("service", "Service", "service"),
    _c("emploi", "Emploi", "emploi"),
    _c("fonction", "Fonction", "fonction"),
    _c("localisation", "Localisation", "localisation"),
    _c("tranche_age", "Tranche d'âge", "date_naissance", calcul="tranche_age"),
    _c("annee_naissance", "Année de naissance", "date_naissance", calcul="annee"),
    _c("annee_prise_service", "Année de prise de service", "prise_service_ministere", calcul="annee"),
)


def _source(code, libelle, modele, champs, mesures=(), rattachee=True) -> Source:
    propres = tuple(champs)
    if rattachee:
        propres += tuple(
            Champ(
                f"agent.{item.code}",
                item.libelle,
                f"agent__{item.chemin}",
                item.choix,
                item.calcul,
                "Agent",
            )
            for item in CHAMPS_AGENT
        )
    return Source(code, libelle, modele, propres, (NOMBRE, *mesures), rattachee)


SOURCES: tuple[Source, ...] = (
    _source(
        "agents",
        "Dossiers agents",
        Agent,
        CHAMPS_AGENT,
        (
            Mesure("age", "Âge atteint dans l'année", "date_naissance", "duree"),
            Mesure("anciennete", "Ancienneté au ministère (années)", "prise_service_ministere", "duree"),
            Mesure("indice", "Indice", "indice"),
            Mesure("conges_acquis", "Congés acquis (jours)", "conges_acquis"),
            Mesure("conges_consommes", "Congés consommés (jours)", "conges_consommes"),
        ),
        rattachee=False,
    ),
    _source(
        "actes",
        "Actes",
        Acte,
        (
            _c("domaine", "Domaine", "domaine", _choix(Acte.Domaine.choices)),
            _c("statut", "Statut", "statut", _choix(Acte.Statut.choices)),
            _c("nature", "Nature", "nature"),
            _c("annee", "Année d'enregistrement", "date_enregistrement", calcul="annee"),
            _c("annee_effet", "Année d'effet", "date_effet", calcul="annee"),
        ),
    ),
    _source(
        "absences",
        "Absences",
        Absence,
        (
            _c("nature", "Nature", "nature"),
            _c("statut", "Statut", "statut"),
            _c("type_autorisation", "Type d'autorisation", "type_autorisation", _choix(Absence.TypeAutorisation.choices)),
            _c("decision", "Décision", "decision", _choix(Absence.Decision.choices)),
            _c("instruction", "Instruction", "instruction", _choix(Absence.Instruction.choices)),
            _c("annee", "Année de début", "debut", calcul="annee"),
        ),
        (Mesure("jours", "Jours d'absence", "jours"),),
    ),
    _source(
        "demandes",
        "Demandes",
        Demande,
        (
            _c("categorie", "Catégorie", "categorie"),
            _c("nature", "Nature", "nature"),
            _c("etape", "Étape", "etape"),
            _c("annee", "Année de dépôt", "depose_le", calcul="annee"),
        ),
    ),
    _source(
        "notations",
        "Notations",
        Evaluation,
        (
            _c("mention", "Mention", "mention"),
            _c("statut", "Statut", "statut"),
            _c("annee", "Année", "annee"),
        ),
        (Mesure("note", "Note", "note"),),
    ),
    _source(
        "formations",
        "Formations suivies",
        Formation,
        (
            _c("statut", "Statut", "statut"),
            _c("organisme", "Organisme de formation", "organisme"),
            _c("annee", "Année de début", "debut", calcul="annee"),
        ),
        (Mesure("heures", "Heures", "heures"),),
    ),
    _source(
        "sessions",
        "Sessions de formation",
        SessionFormation,
        (
            _c("type", "Type", "type_formation__libelle"),
            _c("prestataire", "Prestataire", "prestataire__nom"),
            _c("lieu", "Lieu", "lieu"),
            _c("annee", "Année de début", "date_debut", calcul="annee"),
        ),
        (
            Mesure("heures", "Heures", "heures"),
            Mesure("places", "Places", "places"),
            Mesure("cout_participant", "Coût par participant (FCFA)", "cout_participant"),
        ),
        rattachee=False,
    ),
    _source(
        "besoins_formation",
        "Besoins de formation",
        BesoinFormation,
        (
            _c("priorite", "Priorité", "priorite", _choix(BesoinFormation.Priorite.choices)),
            _c("statut", "Statut", "statut", _choix(BesoinFormation.Statut.choices)),
            _c("organisme", "Organisme", "organisme__nom"),
            _c("type", "Type", "type_formation__libelle"),
            _c("annee", "Année", "annee"),
        ),
        (Mesure("effectif", "Effectif concerné", "effectif"),),
        rattachee=False,
    ),
    _source(
        "prestations",
        "Prestations sociales",
        PrestationSociale,
        (
            _c("nature", "Nature", "nature"),
            _c("statut", "Statut", "statut"),
            _c("etat", "État", "etat", _choix(PrestationSociale.Etat.choices)),
            _c("annee", "Année de demande", "date_demande", calcul="annee"),
        ),
        (Mesure("montant", "Montant (FCFA)", "montant"),),
    ),
    _source(
        "enveloppes",
        "Enveloppes sociales",
        EnveloppeSociale,
        (
            _c("organisme", "Organisme", "organisme__nom"),
            _c("ligne", "Ligne", "ligne"),
        ),
        (
            Mesure("allouee", "Montant alloué (FCFA)", "allouee"),
            Mesure("engagee", "Montant engagé (FCFA)", "engagee"),
        ),
        rattachee=False,
    ),
    _source(
        "dotations",
        "Demandes de dotation",
        DemandeDotation,
        (
            _c("nature", "Nature", "nature", _choix(DemandeDotation.Nature.choices)),
            _c("statut", "Statut", "statut", _choix(DemandeDotation.Statut.choices)),
            _c("entite", "Entité", "entite__nom"),
        ),
        (Mesure("impact", "Impact sur l'effectif", "impact"),),
        rattachee=False,
    ),
    _source(
        "besoins",
        "Fiches de besoin",
        FicheBesoin,
        (
            _c("nature", "Nature", "nature", _choix(FicheBesoin.Nature.choices)),
            _c("statut", "Statut", "statut", _choix(FicheBesoin.Statut.choices)),
            _c("entite", "Entité", "entite__nom"),
        ),
        (
            Mesure("volume", "Volume de postes", "volume"),
            Mesure("cout_annuel", "Coût annuel (FCFA)", "cout_annuel"),
        ),
        rattachee=False,
    ),
    _source(
        "procedures",
        "Procédures disciplinaires",
        ProcedureDisciplinaire,
        (
            _c("avis", "Avis", "avis", _choix(ProcedureDisciplinaire.Avis.choices)),
            _c("degre", "Degré", "degre"),
            _c("grief", "Grief", "grief"),
            _c("annee", "Année de saisine", "saisine", calcul="annee"),
        ),
    ),
    _source(
        "sanctions",
        "Sanctions disciplinaires",
        SanctionDisciplinaire,
        (
            _c("nature", "Nature", "nature", _choix(SanctionDisciplinaire.Nature.choices)),
            _c("degre", "Degré", "degre"),
            _c("annee", "Année de prononcé", "prononcee_le", calcul="annee"),
        ),
    ),
    _source(
        "retraites",
        "Dossiers de retraite",
        DossierRetraite,
        (
            _c("statut", "Statut", "statut", _choix(DossierRetraite.Statut.choices)),
            _c("annee_cessation", "Année de cessation", "date_cessation", calcul="annee"),
        ),
    ),
)

PAR_CODE = {item.code: item for item in SOURCES}


# --- Croisement de sources -----------------------------------------------------------------
#
# Un dossier agent peut recevoir, pour chaque source qui se rattache à lui, un champ « oui / non »
# et les totaux de cette source pour cet agent : chaque agent reste une ligne, les sommes du tableau
# restent justes. Deux sources d'événements (absences et sanctions) ne se croisent pas entre elles :
# rien n'apparie une absence à une sanction précise.

PIVOT = "agents"
LIENS = {
    "actes": "actes",
    "absences": "absences",
    "demandes": "demandes",
    "notations": "evaluations",
    "formations": "formations",
    "prestations": "prestations",
    "procedures": "procedures",
    "sanctions": "sanctions",
    "retraites": "dossier_retraite",
}
# Un seul enregistrement par agent : ses champs se lisent directement depuis l'agent.
UNIQUES = {"retraites"}
SINGULIERS = {
    "actes": "Acte",
    "absences": "Absence",
    "demandes": "Demande",
    "notations": "Notation",
    "formations": "Formation suivie",
    "prestations": "Prestation sociale",
    "procedures": "Procédure disciplinaire",
    "sanctions": "Sanction",
    "retraites": "Dossier de retraite",
}
MOYENNES = {"note"}
# Année de rattachement de chaque source croisée, pour la période choisie : (champ, déjà une année).
DATES = {
    "actes": ("date_enregistrement", False),
    "absences": ("debut", False),
    "demandes": ("depose_le", False),
    "notations": ("annee", True),
    "formations": ("debut", False),
    "prestations": ("date_demande", False),
    "procedures": ("saisine", False),
    "sanctions": ("prononcee_le", False),
    "retraites": ("date_cessation", False),
}


def _de(mot: str) -> str:
    return f"d'{mot}" if mot[:1].lower() in "aeéèêiîoôuûyh" else f"de {mot}"


def motif_croisement(source_code: str, autre_code: str) -> str:
    """Raison pour laquelle deux sources ne se croisent pas ; chaîne vide si le croisement est possible."""
    source = PAR_CODE[source_code]
    autre = PAR_CODE[autre_code]
    if source_code == autre_code:
        return "C'est déjà la source du tableau."
    if source_code == PIVOT:
        if autre_code in LIENS:
            return ""
        return f"« {autre.libelle} » ne se rattache pas à un agent : rien ne relie ses enregistrements aux dossiers agents."
    if source_code not in LIENS:
        return f"« {source.libelle} » ne se rattache pas à un agent : cette source ne se croise avec aucune autre."
    if autre_code == PIVOT:
        return f"Les champs du dossier de l'agent sont déjà proposés dans « {source.libelle} », sous « Dossier de l'agent »."
    if autre_code not in LIENS:
        return f"« {autre.libelle} » ne se rattache pas à un agent : rien ne la relie à « {source.libelle} »."
    return (
        f"Un enregistrement de « {source.libelle} » ne correspond à aucun enregistrement précis de « {autre.libelle} » : "
        f"les croiser multiplierait les lignes et fausserait les totaux. Prenez « Dossiers agents » comme source "
        f"et croisez-y « {source.libelle} » et « {autre.libelle} »."
    )


def champs_croises(code: str) -> tuple[Champ, ...]:
    autre = PAR_CODE[code]
    lien = LIENS[code]
    champs = [Champ(f"x.{code}.presence", f"{SINGULIERS[code]} (oui / non)", code, {}, "presence", autre.libelle)]
    propres = [item for item in autre.champs if not item.groupe]
    if code in UNIQUES:
        champs += [
            Champ(f"x.{code}.{item.code}", item.libelle, f"{lien}__{item.chemin}", item.choix, item.calcul, autre.libelle)
            for item in propres
        ]
    else:
        # Un agent a plusieurs enregistrements : ces champs comptent chaque agent une fois par modalité.
        champs += [
            Champ(f"x.{code}.{item.code}", item.libelle, item.chemin, item.choix, item.calcul, autre.libelle, code)
            for item in propres
        ]
    return tuple(champs)


def annees_croisement(code: str) -> list[int]:
    champ, deja = DATES[code]
    lignes = PAR_CODE[code].modele.objects.order_by()
    if deja:
        brutes = lignes.values_list(champ, flat=True).distinct()
    else:
        brutes = lignes.annotate(a=ExtractYear(champ)).values_list("a", flat=True).distinct()
    return sorted({int(item) for item in brutes if item is not None}, reverse=True)


def periodes_demandees(croisements: list[str], brutes) -> dict[str, dict]:
    """Période de chaque source croisée : {"de": année ou None, "a": année ou None}."""
    if isinstance(brutes, str):
        try:
            brutes = json.loads(brutes) if brutes.strip() else {}
        except json.JSONDecodeError as exc:
            raise CompositionInvalide("Les périodes sont illisibles.") from exc
    if brutes is None:
        brutes = {}
    if not isinstance(brutes, dict):
        raise CompositionInvalide("Les périodes sont illisibles.")
    propres = {}
    for code, periode in brutes.items():
        if code not in croisements or not isinstance(periode, dict):
            continue
        bornes = {}
        for cle in ("de", "a"):
            valeur = periode.get(cle)
            if valeur in (None, ""):
                bornes[cle] = None
                continue
            try:
                bornes[cle] = int(valeur)
            except (TypeError, ValueError) as exc:
                raise CompositionInvalide("Une année de période n'est pas un nombre.") from exc
        if bornes["de"] is not None and bornes["a"] is not None and bornes["de"] > bornes["a"]:
            bornes["de"], bornes["a"] = bornes["a"], bornes["de"]
        if bornes["de"] is not None or bornes["a"] is not None:
            propres[code] = bornes
    return propres


def _filtre_periode(code: str, periodes: dict) -> dict:
    periode = periodes.get(code)
    if not periode:
        return {}
    champ, deja = DATES[code]
    chemin = champ if deja else f"{champ}__year"
    filtre = {}
    if periode["de"] is not None:
        filtre[f"{chemin}__gte"] = periode["de"]
    if periode["a"] is not None:
        filtre[f"{chemin}__lte"] = periode["a"]
    return filtre


def source_detaillee(champs: list[Champ]) -> str:
    detaillees = list(dict.fromkeys(item.detail for item in champs if item.detail))
    if len(detaillees) > 1:
        libelles = " et ".join(f"« {PAR_CODE[code].libelle} »" for code in detaillees)
        raise CompositionInvalide(
            f"Les champs détaillés de {libelles} ne se combinent pas : chaque enregistrement de l'une serait répété "
            f"pour chaque enregistrement de l'autre, et les totaux seraient faux. Gardez le détail d'une seule source ; "
            f"les autres restent disponibles en « oui / non » et en totaux par agent."
        )
    return detaillees[0] if detaillees else ""


def mesures_croisees(code: str) -> tuple[Mesure, ...]:
    autre = PAR_CODE[code]
    mesures = [Mesure(f"x.{code}.nombre", f"Nombre {_de(autre.libelle.lower())}", f"{code}:pk", "compte", autre.libelle)]
    for item in autre.mesures:
        if not item.numerique or item.calcul:
            continue
        moyenne = item.code in MOYENNES
        libelle = f"{item.libelle} (moyenne de l'agent)" if moyenne else item.libelle
        mesures.append(Mesure(f"x.{code}.{item.code}", libelle, f"{code}:{item.chemin}", "moyenne" if moyenne else "somme", autre.libelle))
    return tuple(mesures)


def croisements_demandes(source: Source, codes) -> list[str]:
    propres = champs_demandes(codes)
    for code in propres:
        if code not in PAR_CODE:
            raise CompositionInvalide("Cette source à croiser n'est pas disponible.")
        motif = motif_croisement(source.code, code)
        if motif:
            raise CompositionInvalide(motif)
    return propres


def _champ(source: Source, code: str, croisements: list[str]) -> Champ:
    if code.startswith("x."):
        autre = code.split(".")[1]
        if autre not in croisements:
            raise CompositionInvalide("Ce champ appartient à une source qui n'est pas croisée avec le tableau.")
        for item in champs_croises(autre):
            if item.code == code:
                return item
        raise CompositionInvalide(f"Le champ « {code} » n'existe pas.")
    return source.champ(code)


def _mesure(source: Source, code: str, croisements: list[str]) -> Mesure:
    if code.startswith("x."):
        autre = code.split(".")[1]
        if autre not in croisements:
            raise CompositionInvalide("Cette mesure appartient à une source qui n'est pas croisée avec le tableau.")
        for item in mesures_croisees(autre):
            if item.code == code:
                return item
        raise CompositionInvalide(f"La mesure « {code} » n'existe pas.")
    return source.mesure(code)


def decrire_catalogue() -> dict:
    return {
        "sources": [
            {
                "code": source.code,
                "libelle": source.libelle,
                "champs": [{"code": item.code, "libelle": item.libelle, "groupe": item.groupe} for item in source.champs],
                "mesures": [{"code": item.code, "libelle": item.libelle, "numerique": item.numerique, "groupe": ""} for item in source.mesures],
                "croisements": [
                    {
                        "code": autre.code,
                        "libelle": autre.libelle,
                        "possible": not motif_croisement(source.code, autre.code),
                        "motif": motif_croisement(source.code, autre.code),
                    }
                    for autre in SOURCES
                    if autre.code != source.code
                ],
                "croises": {
                    code: {
                        "champs": [
                            {"code": item.code, "libelle": item.libelle, "groupe": item.groupe, "detail": item.detail}
                            for item in champs_croises(code)
                        ],
                        "mesures": [{"code": item.code, "libelle": item.libelle, "numerique": True, "groupe": item.groupe} for item in mesures_croisees(code)],
                        "annees": annees_croisement(code),
                    }
                    for code in (LIENS if source.code == PIVOT else ())
                },
            }
            for source in SOURCES
        ],
        "agregats": list(AGREGATS),
        "affichages": list(AFFICHAGES),
        "formes": list(FORMES),
    }


def source_demandee(code) -> Source:
    texte = _texte(code)
    if not texte:
        raise CompositionInvalide("Choisissez une source de données.")
    try:
        return PAR_CODE[texte]
    except KeyError as exc:
        raise CompositionInvalide("Cette source de données n'est pas disponible.") from exc


def champs_demandes(texte) -> list[str]:
    if isinstance(texte, list):
        morceaux = texte
    else:
        morceaux = str(texte or "").split(",")
    return list(dict.fromkeys(_texte(item) for item in morceaux if _texte(item)))


def calculer_cube(source_code, codes_champs, codes_croisements=None, periodes_brutes=None) -> dict:
    """Regroupe la source selon les champs et agrège chaque mesure numérique, croisements compris.

    Avec un champ détaillé d'une source croisée (la nature d'une absence), les lignes du calcul sont les
    enregistrements de cette source ; chaque groupe porte alors la liste des agents concernés, pour que
    le tableau compte les agents distincts dans les sous-totaux.
    """
    source = source_demandee(source_code)
    croisements = croisements_demandes(source, codes_croisements)
    periodes = periodes_demandees(croisements, periodes_brutes)
    codes = champs_demandes(codes_champs)
    if len(codes) > MAX_CHAMPS:
        raise CompositionInvalide(f"Un tableau croise au plus {MAX_CHAMPS} champs.")
    champs = [_champ(source, code, croisements) for code in codes]
    detail = source_detaillee(champs)

    if detail:
        modele = PAR_CODE[detail].modele
        qs = modele.objects.filter(**_filtre_periode(detail, periodes))
        prefixe, ref = "agent__", "agent"
        numeriques = list(mesures_croisees(detail))
    else:
        qs = source.modele.objects.all()
        prefixe, ref = "", "pk"
        numeriques = [item for item in source.mesures if item.numerique]
        numeriques += [item for code in croisements for item in mesures_croisees(code)]

    annotations = {}
    for indice, item in enumerate(champs):
        annotations[f"d{indice}"] = _expression_champ(item, prefixe, ref, periodes)
    for indice, item in enumerate(numeriques):
        annotations[f"m{indice}"] = _expression_mesure(item, ref, periodes, detail)
    agregats = {"n": Count("pk")}
    for indice, item in enumerate(numeriques):
        alias = f"m{indice}"
        agregats[f"s{indice}"] = Sum(alias)
        agregats[f"c{indice}"] = Count(alias)
        agregats[f"lo{indice}"] = Min(alias)
        agregats[f"hi{indice}"] = Max(alias)

    cles = [f"d{indice}" for indice in range(len(champs))] + (["agent"] if detail else [])
    lignes = qs.annotate(**annotations).order_by().values(*cles).annotate(**agregats)

    groupes: dict[tuple[str, ...], dict] = {}
    agents: dict[tuple[str, ...], set[int]] = {}
    for ligne in lignes.iterator():
        cle = tuple(_etiquette(item, ligne[f"d{indice}"]) for indice, item in enumerate(champs))
        groupe = groupes.get(cle)
        if groupe is None:
            if len(groupes) >= MAX_GROUPES:
                raise CompositionInvalide("Ce croisement donne trop de combinaisons. Retirez un champ ou filtrez la source.")
            groupe = {"v": list(cle), "n": 0, "m": {}}
            groupes[cle] = groupe
            agents[cle] = set()
        groupe["n"] += int(ligne["n"] or 0)
        if detail:
            agents[cle].add(ligne["agent"])
        for indice, item in enumerate(numeriques):
            _fusionner(
                groupe["m"],
                item.code,
                ligne[f"s{indice}"],
                ligne[f"c{indice}"],
                ligne[f"lo{indice}"],
                ligne[f"hi{indice}"],
            )
    if detail:
        for cle, groupe in groupes.items():
            groupe["a"] = sorted(agents[cle])
    return {
        "source": {"code": source.code, "libelle": source.libelle},
        "croisements": croisements,
        "periodes": periodes,
        "detail": detail or None,
        "mesures": ["nombre", *(item.code for item in numeriques)],
        "champs": [{"code": item.code, "libelle": item.libelle} for item in champs],
        "groupes": list(groupes.values()),
        "total": len(set().union(*agents.values())) if detail else sum(item["n"] for item in groupes.values()),
        "calcule_le": timezone.now().isoformat(),
    }


def _fusionner(cible: dict, code: str, somme, nombre, minimum, maximum) -> None:
    nombre = int(nombre or 0)
    if not nombre:
        return
    somme = _nombre(somme)
    minimum = _nombre(minimum)
    maximum = _nombre(maximum)
    courant = cible.get(code)
    if courant is None:
        cible[code] = [somme, nombre, minimum, maximum]
        return
    courant[0] += somme
    courant[1] += nombre
    courant[2] = min(courant[2], minimum)
    courant[3] = max(courant[3], maximum)


def _nombre(valeur) -> float | int:
    if valeur is None:
        return 0
    if isinstance(valeur, int):
        return valeur
    flottant = float(valeur)
    return int(flottant) if flottant.is_integer() else round(flottant, 4)


def _expression_champ(champ: Champ, prefixe: str = "", ref: str = "pk", periodes: dict | None = None):
    periodes = periodes or {}
    if champ.calcul == "presence":
        modele = PAR_CODE[champ.chemin].modele
        lignes = modele.objects.filter(agent=OuterRef(ref), **_filtre_periode(champ.chemin, periodes))
        return Case(When(Exists(lignes), then=Value("Oui")), default=Value("Non"), output_field=CharField())
    # Un champ détaillé se lit sur l'enregistrement lui-même ; les autres passent par l'agent.
    chemin = champ.chemin if champ.detail else f"{prefixe}{champ.chemin}"
    if champ.calcul == "annee":
        return ExtractYear(chemin)
    if champ.calcul == "tranche_age":
        return _tranche(chemin)
    return F(chemin)


def _expression_mesure(mesure: Mesure, ref: str = "pk", periodes: dict | None = None, detail: str = ""):
    periodes = periodes or {}
    if mesure.calcul in ("compte", "somme", "moyenne"):
        code, champ = mesure.chemin.split(":", 1)
        if detail:
            # Au grain de la source détaillée, chaque enregistrement compte pour un et porte sa propre valeur.
            return Value(1, output_field=IntegerField()) if mesure.calcul == "compte" else F(champ)
        lignes = PAR_CODE[code].modele.objects.filter(agent=OuterRef(ref), **_filtre_periode(code, periodes)).order_by().values("agent")
        if mesure.calcul == "moyenne":
            return Subquery(lignes.annotate(v=Avg(champ)).values("v")[:1], output_field=FloatField())
        agregat = Count("pk") if mesure.calcul == "compte" else Sum(champ)
        valeur = Subquery(lignes.annotate(v=agregat).values("v")[:1], output_field=IntegerField())
        return Coalesce(valeur, Value(0), output_field=IntegerField())
    if mesure.calcul == "duree":
        annee = timezone.localdate().year
        return ExpressionWrapper(Value(annee) - ExtractYear(mesure.chemin), output_field=IntegerField())
    return F(mesure.chemin)


def _tranche(chemin: str):
    jour = timezone.localdate()
    return Case(
        When(**{f"{chemin}__isnull": True}, then=Value("Date de naissance non renseignée")),
        When(**{f"{chemin}__gt": _il_y_a(35, jour)}, then=Value("Moins de 35 ans")),
        When(**{f"{chemin}__gt": _il_y_a(46, jour)}, then=Value("35 à 45 ans")),
        When(**{f"{chemin}__gt": _il_y_a(56, jour)}, then=Value("46 à 55 ans")),
        default=Value("Plus de 55 ans"),
        output_field=CharField(),
    )


def _il_y_a(annees: int, jour: date) -> date:
    try:
        return jour.replace(year=jour.year - annees)
    except ValueError:
        return jour.replace(year=jour.year - annees, day=28)


def _etiquette(champ: Champ, valeur) -> str:
    if valeur is None or valeur == "":
        return VIDE
    if champ.choix:
        return champ.choix.get(str(valeur), str(valeur))
    return str(valeur)


# --- Configurations enregistrées ---------------------------------------------------------


def valider_tableau(nom, configuration) -> dict:
    texte = _texte(nom)
    if not texte:
        raise CompositionInvalide("Indiquez un nom pour ce tableau.")
    if len(texte) > 160:
        raise CompositionInvalide("Le nom dépasse 160 caractères.")
    propre = valider_configuration(configuration)
    return {"nom": texte, "sujet": propre["source"], "configuration": propre}


def valider_configuration(configuration) -> dict:
    if not isinstance(configuration, dict):
        raise CompositionInvalide("La configuration du tableau est illisible.")
    source = source_demandee(configuration.get("source"))
    croisements = croisements_demandes(source, _liste(configuration.get("croisements"), "croisements"))
    periodes = periodes_demandees(croisements, configuration.get("periodes"))
    zones = {}
    vus: set[str] = set()
    places: list[Champ] = []
    for zone in ("filtres", "colonnes", "lignes"):
        codes = champs_demandes(_liste(configuration.get(zone), zone))
        for code in codes:
            places.append(_champ(source, code, croisements))
            if code in vus:
                raise CompositionInvalide("Un champ ne peut être placé que dans une seule zone.")
            vus.add(code)
        zones[zone] = codes
    if len(vus) > MAX_CHAMPS:
        raise CompositionInvalide(f"Un tableau croise au plus {MAX_CHAMPS} champs.")
    source_detaillee(places)

    valeurs = []
    for item in _liste(configuration.get("valeurs"), "valeurs"):
        if not isinstance(item, dict):
            raise CompositionInvalide("Chaque valeur indique une mesure.")
        mesure = _mesure(source, _texte(item.get("mesure")) or "nombre", croisements)
        agregat = _texte(item.get("agregat")) or ("somme" if mesure.numerique else "nombre")
        if agregat not in AGREGATS or (not mesure.numerique and agregat != "nombre"):
            raise CompositionInvalide(f"Le calcul « {agregat} » n'est pas possible pour « {mesure.libelle} ».")
        affichage = _texte(item.get("affichage")) or "valeur"
        if affichage not in AFFICHAGES:
            raise CompositionInvalide("Ce mode d'affichage n'est pas disponible.")
        valeurs.append({"mesure": mesure.code, "agregat": agregat, "affichage": affichage})
    if len(valeurs) > MAX_VALEURS:
        raise CompositionInvalide(f"Un tableau affiche au plus {MAX_VALEURS} valeurs.")
    if not valeurs:
        valeurs = [{"mesure": "nombre", "agregat": "nombre", "affichage": "valeur"}]

    selections = {}
    brutes = configuration.get("selections") or {}
    if not isinstance(brutes, dict):
        raise CompositionInvalide("Les sélections de valeurs sont illisibles.")
    for code, choix in brutes.items():
        if code not in vus or not isinstance(choix, dict):
            continue
        for mode in ("inclus", "exclus"):
            liste = choix.get(mode)
            if isinstance(liste, list):
                propres = [str(item)[:240] for item in liste[:1000]]
                selections[code] = {mode: propres}
                break

    tri = configuration.get("tri") if isinstance(configuration.get("tri"), dict) else {}
    options = configuration.get("options") if isinstance(configuration.get("options"), dict) else {}
    graphique = configuration.get("graphique") if isinstance(configuration.get("graphique"), dict) else {}
    forme = _texte(graphique.get("forme")) or "barre"
    replies = [str(item)[:600] for item in _liste(configuration.get("replies"), "replies")[:500]]
    return {
        "source": source.code,
        "croisements": croisements,
        "periodes": periodes,
        **zones,
        "valeurs": valeurs,
        "selections": selections,
        "tri": {
            "par": "valeur" if tri.get("par") == "valeur" else "libelle",
            "sens": "desc" if tri.get("sens") == "desc" else "asc",
        },
        "options": {
            "total_lignes": options.get("total_lignes", True) is not False,
            "total_colonnes": options.get("total_colonnes", True) is not False,
            "sous_totaux": options.get("sous_totaux", True) is not False,
        },
        "replies": replies,
        "graphique": {
            "visible": graphique.get("visible", True) is not False,
            "forme": forme if forme in FORMES else "barre",
            "etiquettes": graphique.get("etiquettes", True) is not False,
            "legende": graphique.get("legende", True) is not False,
            "inverser": graphique.get("inverser") is True,
            "titre": _texte(graphique.get("titre"))[:160],
        },
        "nom_auto": configuration.get("nom_auto") is True,
    }


def configuration_de(composition) -> dict:
    """Configuration du tableau ; les compositions d'avant les tableaux croisés sont converties."""
    if composition.configuration:
        try:
            return valider_configuration(composition.configuration)
        except CompositionInvalide:
            return {}
    return _depuis_composition(composition)


MESURES_ANCIENNES = {
    "somme_jours": "jours",
    "somme_heures": "heures",
    "somme_montant": "montant",
    "somme_allouee": "allouee",
    "somme_engagee": "engagee",
    "somme_volume": "volume",
    "somme_cout": "cout_annuel",
}


def _depuis_composition(composition) -> dict:
    volets = [item for item in (composition.volets or []) if isinstance(item, str)] or [composition.sujet]
    combine = len(volets) > 1
    source_code = next((item for item in volets if item != "agents"), "agents") if combine else volets[0]
    source = PAR_CODE.get(source_code)
    if source is None:
        return {}

    def champ(dimension: str) -> str:
        dimension = _texte(dimension)
        if not dimension:
            return ""
        origine, _, axe = dimension.rpartition(".")
        if origine in ("", source.code):
            code = axe
        elif origine == "agents":
            code = f"agent.{axe}"
        else:
            return ""
        codes = {item.code for item in source.champs}
        return code if code in codes else ""

    lignes = [code for code in [champ(composition.axe_lignes)] if code]
    colonnes = [code for code in [champ(composition.axe_colonnes)] if code and code not in lignes]
    filtres, selections = [], {}
    for item in composition.filtres or []:
        if not isinstance(item, dict):
            continue
        code = champ(item.get("dimension", ""))
        if not code:
            continue
        objet = source.champ(code)
        valeur = item.get("valeur")
        selections.setdefault(code, {"inclus": []})["inclus"].append(_etiquette(objet, valeur))
        if code not in lignes and code not in colonnes and code not in filtres:
            filtres.append(code)
    mesure = "nombre" if combine else MESURES_ANCIENNES.get(composition.mesure, "nombre")
    try:
        return valider_configuration({
            "source": source.code,
            "lignes": lignes,
            "colonnes": colonnes,
            "filtres": filtres,
            "valeurs": [{"mesure": mesure, "agregat": "nombre" if mesure == "nombre" else "somme"}],
            "selections": selections,
        })
    except CompositionInvalide:
        return {}


def presenter(composition, user) -> dict:
    return {
        "id": composition.id,
        "nom": composition.nom,
        "configuration": configuration_de(composition),
        "mien": composition.auteur_id == user.id,
        "auteur": composition.auteur.get_full_name() or composition.auteur.username,
        "modifiee_le": composition.modifiee_le.isoformat() if composition.modifiee_le else None,
    }


def _liste(valeur, zone: str) -> list:
    if valeur is None:
        return []
    if not isinstance(valeur, list):
        raise CompositionInvalide(f"La zone « {zone} » doit être une liste.")
    return valeur


def _texte(valeur) -> str:
    if valeur is None:
        return ""
    return str(valeur).strip()
