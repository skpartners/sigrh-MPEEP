"""Compositions statistiques : catalogue fermé, agrégats et tableaux croisés.

Les codes d'axes viennent du catalogue. Les modalités (un corps, une structure,
un statut) sont lues dans la base au moment du calcul.
"""

import json
from dataclasses import dataclass, field
from datetime import date

from django.db import models
from django.db.models import Case, CharField, Count, Q, Sum, Value, When
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

PLAFOND = 25
VIDE = "Non renseigné"
AUTRES = "Autres"


class CompositionInvalide(ValueError):
    pass


def _choix(enumeration) -> dict[str, str]:
    return {valeur: str(libelle) for valeur, libelle in enumeration}


@dataclass(frozen=True)
class Axe:
    code: str
    libelle: str
    champ: str
    choix: dict[str, str] = field(default_factory=dict)
    derive: str = ""
    entier: bool = False


@dataclass(frozen=True)
class Mesure:
    code: str
    libelle: str
    champ: str = ""


@dataclass(frozen=True)
class Sujet:
    code: str
    libelle: str
    modele: type[models.Model]
    axes: tuple[Axe, ...]
    mesures: tuple[Mesure, ...]

    def axe(self, code: str) -> Axe:
        for item in self.axes:
            if item.code == code:
                return item
        raise CompositionInvalide("Cet axe n'est pas disponible pour ce sujet.")

    def mesure(self, code: str) -> Mesure:
        for item in self.mesures:
            if item.code == code:
                return item
        raise CompositionInvalide("Cette mesure n'est pas disponible pour ce sujet.")


def _axe(code: str, libelle: str, champ: str, choix=None, *, derive: str = "", entier: bool = False) -> Axe:
    return Axe(code, libelle, champ, choix or {}, derive, entier)


NOMBRE = Mesure("nombre", "Nombre")
SEXE = {"H": "Homme", "F": "Femme"}

SUJETS: tuple[Sujet, ...] = (
    Sujet(
        "agents",
        "Dossiers agents",
        Agent,
        (
            _axe("organisme", "Organisme", "organisme__nom"),
            _axe("sexe", "Sexe", "sexe", SEXE),
            _axe("corps", "Corps", "corps"),
            _axe("grade", "Grade", "grade"),
            _axe("categorie", "Catégorie", "categorie"),
            _axe("situation", "Situation", "situation"),
            _axe("type_agent", "Type d'agent", "type_agent"),
            _axe("mode_recrutement", "Mode de recrutement", "mode_recrutement"),
            _axe("structure", "Structure", "structure"),
            _axe("direction", "Direction", "direction"),
            _axe("service", "Service", "service"),
            _axe("emploi", "Emploi", "emploi"),
            _axe("fonction", "Fonction", "fonction"),
            _axe("localisation", "Localisation", "localisation"),
            _axe("tranche_age", "Tranche d'âge", "tranche_age", derive="tranche_age"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "actes",
        "Actes",
        Acte,
        (
            _axe("domaine", "Domaine", "domaine", _choix(Acte.Domaine.choices)),
            _axe("statut", "Statut", "statut", _choix(Acte.Statut.choices)),
            _axe("nature", "Nature", "nature"),
            _axe("organisme", "Organisme de l'agent", "agent__organisme__nom"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "absences",
        "Absences",
        Absence,
        (
            _axe("nature", "Nature", "nature"),
            _axe("statut", "Statut", "statut"),
            _axe("type_autorisation", "Type d'autorisation", "type_autorisation", _choix(Absence.TypeAutorisation.choices)),
            _axe("decision", "Décision", "decision", _choix(Absence.Decision.choices)),
            _axe("instruction", "Instruction", "instruction", _choix(Absence.Instruction.choices)),
            _axe("organisme", "Organisme de l'agent", "agent__organisme__nom"),
        ),
        (NOMBRE, Mesure("somme_jours", "Jours d'absence", "jours")),
    ),
    Sujet(
        "demandes",
        "Demandes",
        Demande,
        (
            _axe("categorie", "Catégorie", "categorie"),
            _axe("nature", "Nature", "nature"),
            _axe("etape", "Étape", "etape"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "notations",
        "Notations",
        Evaluation,
        (
            _axe("mention", "Mention", "mention"),
            _axe("statut", "Statut", "statut"),
            _axe("annee", "Année", "annee", entier=True),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "formations",
        "Formations suivies",
        Formation,
        (
            _axe("statut", "Statut", "statut"),
            _axe("organisme", "Organisme de formation", "organisme"),
        ),
        (NOMBRE, Mesure("somme_heures", "Heures", "heures")),
    ),
    Sujet(
        "sessions",
        "Sessions de formation",
        SessionFormation,
        (
            _axe("type", "Type", "type_formation__libelle"),
            _axe("prestataire", "Prestataire", "prestataire__nom"),
            _axe("lieu", "Lieu", "lieu"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "besoins_formation",
        "Besoins de formation",
        BesoinFormation,
        (
            _axe("priorite", "Priorité", "priorite", _choix(BesoinFormation.Priorite.choices)),
            _axe("statut", "Statut", "statut", _choix(BesoinFormation.Statut.choices)),
            _axe("organisme", "Organisme", "organisme__nom"),
            _axe("type", "Type", "type_formation__libelle"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "prestations",
        "Prestations sociales",
        PrestationSociale,
        (
            _axe("nature", "Nature", "nature"),
            _axe("statut", "Statut", "statut"),
            _axe("etat", "État", "etat", _choix(PrestationSociale.Etat.choices)),
        ),
        (NOMBRE, Mesure("somme_montant", "Montant (FCFA)", "montant")),
    ),
    Sujet(
        "enveloppes",
        "Enveloppes sociales",
        EnveloppeSociale,
        (
            _axe("organisme", "Organisme", "organisme__nom"),
            _axe("ligne", "Ligne", "ligne"),
        ),
        (
            NOMBRE,
            Mesure("somme_allouee", "Montant alloué (FCFA)", "allouee"),
            Mesure("somme_engagee", "Montant engagé (FCFA)", "engagee"),
        ),
    ),
    Sujet(
        "dotations",
        "Demandes de dotation",
        DemandeDotation,
        (
            _axe("nature", "Nature", "nature", _choix(DemandeDotation.Nature.choices)),
            _axe("statut", "Statut", "statut", _choix(DemandeDotation.Statut.choices)),
            _axe("entite", "Entité", "entite__nom"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "besoins",
        "Fiches de besoin",
        FicheBesoin,
        (
            _axe("nature", "Nature", "nature", _choix(FicheBesoin.Nature.choices)),
            _axe("statut", "Statut", "statut", _choix(FicheBesoin.Statut.choices)),
            _axe("entite", "Entité", "entite__nom"),
        ),
        (
            NOMBRE,
            Mesure("somme_volume", "Volume de postes", "volume"),
            Mesure("somme_cout", "Coût annuel (FCFA)", "cout_annuel"),
        ),
    ),
    Sujet(
        "procedures",
        "Procédures disciplinaires",
        ProcedureDisciplinaire,
        (
            _axe("avis", "Avis", "avis", _choix(ProcedureDisciplinaire.Avis.choices)),
            _axe("degre", "Degré", "degre", entier=True),
            _axe("grief", "Grief", "grief"),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "sanctions",
        "Sanctions disciplinaires",
        SanctionDisciplinaire,
        (
            _axe("nature", "Nature", "nature", _choix(SanctionDisciplinaire.Nature.choices)),
            _axe("degre", "Degré", "degre", entier=True),
        ),
        (NOMBRE,),
    ),
    Sujet(
        "retraites",
        "Dossiers de retraite",
        DossierRetraite,
        (_axe("statut", "Statut", "statut", _choix(DossierRetraite.Statut.choices)),),
        (NOMBRE,),
    ),
)

PAR_CODE = {item.code: item for item in SUJETS}

# Préfixe de jointure depuis le dossier agent. Chaîne vide : le dossier est l'agent lui-même.
LIENS = {
    "agents": "",
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


def decrire_catalogue() -> dict:
    return {
        "sujets": [
            {
                "code": sujet.code,
                "libelle": sujet.libelle,
                "combinable": sujet.code in LIENS,
                "axes": [{"code": axe.code, "libelle": axe.libelle} for axe in sujet.axes],
                "mesures": [{"code": mesure.code, "libelle": mesure.libelle} for mesure in sujet.mesures],
            }
            for sujet in SUJETS
        ]
    }


def lister_valeurs(sujet_code: str, axe_code: str) -> list[dict]:
    sujet = _sujet(sujet_code)
    axe = _axe_demande(sujet, axe_code, "Cet axe n'est pas disponible pour ce sujet.")
    qs = sujet.modele.objects.all()
    if axe.derive == "tranche_age":
        qs = _annoter_tranche(qs)
    brut = qs.order_by().values_list(axe.champ, flat=True).distinct()
    vues: dict[str, str] = {}
    for valeur in brut:
        cle = "" if valeur is None else str(valeur)
        vues[cle] = _etiquette(axe, valeur)
    return sorted(
        ({"cle": cle, "libelle": libelle} for cle, libelle in vues.items()),
        key=lambda item: item["libelle"],
    )[:200]


def calculer_composition(sujet: str, mesure: str, lignes: str, colonnes: str = "", filtres=None, dossiers=None) -> dict:
    codes = _codes_dossiers(dossiers, sujet)
    if len(codes) > 1:
        return _calculer_combine(codes, mesure, lignes, colonnes, filtres)
    sujet_obj, mesure_obj, axe_lignes, axe_colonnes, filtres_propres = resoudre(
        codes[0] if codes else sujet, mesure, lignes, colonnes, filtres,
    )
    qs = _requete(sujet_obj, axe_lignes, axe_colonnes, filtres_propres)
    cellules = _agreger(qs, mesure_obj, axe_lignes, axe_colonnes)
    series, tableau, total = _reduire(cellules, axe_colonnes is not None)
    return _avec_lecture(
        {
            "sujet": {"code": sujet_obj.code, "libelle": sujet_obj.libelle},
            "dossiers": [{"code": sujet_obj.code, "libelle": sujet_obj.libelle}],
            "mesure": {"code": mesure_obj.code, "libelle": mesure_obj.libelle},
            "lignes": {"code": axe_lignes.code, "libelle": axe_lignes.libelle},
            "colonnes": {"code": axe_colonnes.code, "libelle": axe_colonnes.libelle} if axe_colonnes else None,
            "total": total,
            "series": series,
            "tableau": tableau,
        },
        _population([sujet_obj], combine=False),
        (sujet_obj, axe_lignes),
        (sujet_obj, axe_colonnes) if axe_colonnes else None,
        _textes_filtres([(sujet_obj, _axe_demande(sujet_obj, item["dimension"], "Cet axe n'est pas disponible."), item["valeur"]) for item in filtres_propres]),
        mesure_obj.libelle,
        total,
        combine=False,
    )


def valider_composition(nom, sujet: str = "", mesure: str = "", lignes: str = "", colonnes: str = "", filtres=None, dossiers=None, volets=None) -> dict:
    texte = _texte(nom)
    if not texte:
        raise CompositionInvalide("Indiquez un nom pour cette composition.")
    if len(texte) > 160:
        raise CompositionInvalide("Le nom dépasse 160 caractères.")
    codes = _codes_demandes(dossiers, volets, sujet)
    if len(codes) > 1:
        combine = _calculer_combine(codes, mesure, lignes, colonnes, filtres)
        return {
            "nom": texte,
            "sujet": codes[0],
            "mesure": "nombre",
            "axe_lignes": combine["lignes"]["code"],
            "axe_colonnes": combine["colonnes"]["code"] if combine["colonnes"] else "",
            "filtres": _filtres_combines(codes, filtres),
            "volets": codes,
        }
    sujet_obj, mesure_obj, axe_lignes, axe_colonnes, filtres_propres = resoudre(
        codes[0] if codes else sujet, mesure, lignes, colonnes, filtres,
    )
    return {
        "nom": texte,
        "sujet": sujet_obj.code,
        "mesure": mesure_obj.code,
        "axe_lignes": axe_lignes.code,
        "axe_colonnes": axe_colonnes.code if axe_colonnes else "",
        "filtres": filtres_propres,
        "volets": [sujet_obj.code],
    }


def _codes_dossiers(dossiers, sujet: str) -> list[str]:
    if isinstance(dossiers, str):
        dossiers = [item.strip() for item in dossiers.split(",") if item.strip()]
    if isinstance(dossiers, list) and dossiers:
        return list(dict.fromkeys(_texte(item) for item in dossiers if _texte(item)))
    return [_texte(sujet)] if _texte(sujet) else []


def _codes_demandes(dossiers, volets, sujet: str) -> list[str]:
    codes = _codes_dossiers(dossiers, "")
    if codes:
        return codes
    if isinstance(volets, list) and volets and all(isinstance(item, str) for item in volets):
        return list(dict.fromkeys(item for item in volets if _texte(item)))
    if isinstance(volets, list) and volets and all(isinstance(item, dict) for item in volets):
        return list(dict.fromkeys(_texte(item.get("sujet")) for item in volets if _texte(item.get("sujet"))))
    return [_texte(sujet)] if _texte(sujet) else []


def _calculer_combine(codes: list[str], mesure: str, lignes: str, colonnes: str, filtres) -> dict:
    if len(codes) > 6:
        raise CompositionInvalide("Une composition porte au plus sur six dossiers.")
    sujets = [_sujet(code) for code in codes]
    for sujet in sujets:
        if sujet.code not in LIENS:
            raise CompositionInvalide(f"{sujet.libelle} ne se combine pas avec un dossier d'agent.")
    if _texte(mesure) not in ("", "nombre"):
        raise CompositionInvalide("La combinaison de dossiers compte les agents concernés.")
    axe_sujet, axe_lignes = _axe_parmi(sujets, lignes, "Choisissez l'axe de répartition.")
    axe_colonnes = None
    sujet_colonnes = None
    if _texte(colonnes):
        sujet_colonnes, axe_colonnes = _axe_parmi(sujets, colonnes, "Cet axe n'est pas disponible pour les dossiers choisis.")
        if (axe_sujet.code, axe_lignes.code) == (sujet_colonnes.code, axe_colonnes.code):
            raise CompositionInvalide("Les deux axes doivent être différents.")
    filtres_propres = _filtres_combines(codes, filtres)
    qs = Agent.objects.all()
    if axe_lignes.derive == "tranche_age" or (axe_colonnes and axe_colonnes.derive == "tranche_age") or any(
        _porte_tranche(sujets, item) for item in filtres_propres
    ):
        qs = _annoter_tranche(qs)
    for sujet in sujets:
        lien = LIENS[sujet.code]
        if lien:
            qs = qs.filter(**{f"{lien}__pk__isnull": False})
    for item in filtres_propres:
        sujet, axe = _axe_parmi(sujets, item["dimension"], "Cet axe n'est pas disponible pour les dossiers choisis.")
        qs = _appliquer_filtre(qs, _vue(sujet, axe), item["valeur"])
    vue_lignes = _vue(axe_sujet, axe_lignes)
    vue_colonnes = _vue(sujet_colonnes, axe_colonnes) if axe_colonnes and sujet_colonnes else None
    cellules = _agreger(qs, Mesure("nombre", "Agents concernés"), vue_lignes, vue_colonnes, distinct=True)
    series, tableau, _somme = _reduire(cellules, vue_colonnes is not None)
    total = qs.order_by().aggregate(total=Count("pk", distinct=True))["total"] or 0
    filtres_dits = []
    for item in filtres_propres:
        sujet_filtre, axe_filtre = _axe_parmi(sujets, item["dimension"], "Cet axe n'est pas disponible pour les dossiers choisis.")
        filtres_dits.append((sujet_filtre, axe_filtre, item["valeur"]))
    return _avec_lecture(
        {
            "sujet": {"code": "+".join(sujet.code for sujet in sujets), "libelle": " et ".join(sujet.libelle for sujet in sujets)},
            "dossiers": [{"code": sujet.code, "libelle": sujet.libelle} for sujet in sujets],
            "mesure": {"code": "nombre", "libelle": "Agents concernés"},
            "lignes": {"code": vue_lignes.code, "libelle": vue_lignes.libelle},
            "colonnes": {"code": vue_colonnes.code, "libelle": vue_colonnes.libelle} if vue_colonnes else None,
            "total": total,
            "series": series,
            "tableau": tableau,
        },
        _population(sujets, combine=True),
        (axe_sujet, axe_lignes),
        (sujet_colonnes, axe_colonnes) if axe_colonnes and sujet_colonnes else None,
        _textes_filtres(filtres_dits),
        "Agents concernés",
        total,
        combine=True,
    )


CONDITIONS = {
    "retraites": "un dossier de retraite",
    "absences": "au moins une absence",
    "actes": "au moins un acte",
    "demandes": "au moins une demande",
    "notations": "au moins une notation",
    "formations": "au moins une formation suivie",
    "prestations": "au moins une prestation sociale",
    "procedures": "au moins une procédure disciplinaire",
    "sanctions": "au moins une sanction",
}


def _population(sujets: list[Sujet], combine: bool) -> str:
    if not combine:
        return sujets[0].libelle
    autres = [CONDITIONS.get(sujet.code, sujet.libelle.lower()) for sujet in sujets if sujet.code != "agents"]
    if not autres:
        return "Agents"
    return "Agents qui ont " + _enum(autres)


def _axe_dit(sujet: Sujet, axe: Axe) -> str:
    libelle = axe.libelle.lower()
    if sujet.code == "agents":
        return libelle
    return f"{libelle} ({sujet.libelle.lower()})"


def _textes_filtres(filtres: list[tuple[Sujet, Axe, str]]) -> str:
    return ", ".join(f"{axe.libelle} : {_etiquette(axe, valeur)}" for _sujet, axe, valeur in filtres)


def _avec_lecture(corps: dict, population: str, lignes: tuple[Sujet, Axe], colonnes: tuple[Sujet, Axe] | None, filtres: str, mesure: str, total: int, combine: bool) -> dict:
    axe_lignes = _axe_dit(*lignes)
    repartition = f"par {axe_lignes}"
    if colonnes:
        repartition += f" et par {_axe_dit(*colonnes)}"
    nom = f"{population}, {repartition}"
    if len(nom) > 160:
        nom = nom[:157].rstrip() + "…"
    if colonnes:
        lecture = f"{population}. Lignes : {axe_lignes}. Colonnes : {_axe_dit(*colonnes)}."
    else:
        lecture = f"{population}, répartis {repartition}."
    if filtres:
        lecture += f" Filtres : {filtres}."
    if combine:
        if total == 1:
            decompte = "1 agent est concerné."
        else:
            decompte = f"{total} agents sont concernés."
        lecture += f" {decompte} Un agent peut apparaître dans plusieurs cases : ce total compte les agents, pas la somme d'une ligne."
    else:
        lecture += f" Total : {total} ({mesure.lower()})."
    corps["nom_propose"] = nom
    corps["lecture"] = lecture
    return corps


def _enum(morceaux: list[str]) -> str:
    if len(morceaux) == 1:
        return morceaux[0]
    return ", ".join(morceaux[:-1]) + " et " + morceaux[-1]


def _filtres_combines(codes: list[str], filtres) -> list[dict]:
    sujets = [_sujet(code) for code in codes]
    if filtres is None:
        return []
    if not isinstance(filtres, list):
        raise CompositionInvalide("Les filtres doivent être une liste.")
    propres = []
    for item in filtres:
        if not isinstance(item, dict) or "valeur" not in item:
            raise CompositionInvalide("Chaque filtre indique une dimension et une valeur.")
        dimension = _texte(item.get("dimension") or (f"{item.get('dossier')}.{item.get('axe')}" if item.get("dossier") and item.get("axe") else ""))
        if not dimension:
            raise CompositionInvalide("Chaque filtre indique une dimension et une valeur.")
        sujet, axe = _axe_parmi(sujets, dimension, "Cet axe n'est pas disponible pour les dossiers choisis.")
        valeur = item.get("valeur")
        propres.append({"dimension": f"{sujet.code}.{axe.code}", "valeur": "" if valeur is None else str(valeur)})
    return propres


def _axe_parmi(sujets: list[Sujet], code: str, message_vide: str) -> tuple[Sujet, Axe]:
    texte = _texte(code)
    if not texte:
        raise CompositionInvalide(message_vide)
    if "." in texte:
        sujet_code, axe_code = texte.split(".", 1)
        sujet = next((item for item in sujets if item.code == sujet_code), None)
        if sujet is None:
            raise CompositionInvalide("Cet axe n'appartient pas aux dossiers choisis.")
        return sujet, sujet.axe(axe_code)
    trouvés = [(sujet, axe) for sujet in sujets for axe in sujet.axes if axe.code == texte]
    if len(trouvés) == 1:
        return trouvés[0]
    if not trouvés:
        raise CompositionInvalide("Cet axe n'est pas disponible pour les dossiers choisis.")
    raise CompositionInvalide("Précisez le dossier de cet axe.")


def _vue(sujet: Sujet, axe: Axe) -> Axe:
    return Axe(
        f"{sujet.code}.{axe.code}",
        f"{sujet.libelle} — {axe.libelle}",
        _champ_agent(sujet, axe),
        axe.choix,
        axe.derive,
        axe.entier,
    )


def _champ_agent(sujet: Sujet, axe: Axe) -> str:
    if sujet.code == "agents" or axe.derive == "tranche_age":
        return axe.champ
    champ = axe.champ
    if champ.startswith("agent__"):
        return champ[len("agent__"):]
    return f"{LIENS[sujet.code]}__{champ}"


def _porte_tranche(sujets: list[Sujet], item: dict) -> bool:
    try:
        _sujet_filtre, axe = _axe_parmi(sujets, item["dimension"], "")
    except CompositionInvalide:
        return False
    return axe.derive == "tranche_age"


def filtres_query(texte: str):
    if not str(texte or "").strip():
        return []
    try:
        return json.loads(texte)
    except json.JSONDecodeError as exc:
        raise CompositionInvalide("Les filtres sont illisibles.") from exc


def presenter(composition, user) -> dict:
    dossiers = _codes_demandes(None, composition.volets, composition.sujet)
    try:
        resultat = calculer_composition(
            composition.sujet,
            composition.mesure,
            composition.axe_lignes,
            composition.axe_colonnes,
            composition.filtres,
            dossiers,
        )
    except CompositionInvalide:
        resultat = None
    return {
        "id": composition.id,
        "nom": composition.nom,
        "sujet": composition.sujet,
        "mesure": composition.mesure,
        "axe_lignes": composition.axe_lignes,
        "axe_colonnes": composition.axe_colonnes,
        "filtres": composition.filtres,
        "dossiers": dossiers,
        "volets": dossiers,
        "mien": composition.auteur_id == user.id,
        "auteur": composition.auteur.get_full_name() or composition.auteur.username,
        "resultat": resultat,
    }


def resoudre(sujet: str, mesure: str, lignes: str, colonnes: str = "", filtres=None):
    sujet_obj = _sujet(sujet)
    mesure_obj = _mesure(sujet_obj, mesure)
    axe_lignes = _axe_demande(sujet_obj, lignes, "Choisissez l'axe de répartition.")
    axe_colonnes = None
    if _texte(colonnes):
        axe_colonnes = _axe_demande(sujet_obj, colonnes, "Cet axe n'est pas disponible pour ce sujet.")
        if axe_colonnes.code == axe_lignes.code:
            raise CompositionInvalide("Les deux axes doivent être différents.")
    return sujet_obj, mesure_obj, axe_lignes, axe_colonnes, _normaliser_filtres(sujet_obj, filtres)


def _sujet(code: str) -> Sujet:
    texte = _texte(code)
    if not texte:
        raise CompositionInvalide("Choisissez un sujet.")
    try:
        return PAR_CODE[texte]
    except KeyError as exc:
        raise CompositionInvalide("Ce sujet n'est pas disponible.") from exc


def _mesure(sujet: Sujet, code: str) -> Mesure:
    texte = _texte(code)
    if not texte:
        raise CompositionInvalide("Choisissez une mesure.")
    return sujet.mesure(texte)


def _axe_demande(sujet: Sujet, code: str, message_vide: str) -> Axe:
    texte = _texte(code)
    if not texte:
        raise CompositionInvalide(message_vide)
    prefixe = f"{sujet.code}."
    if texte.startswith(prefixe):
        texte = texte[len(prefixe):]
    return sujet.axe(texte)


def _normaliser_filtres(sujet: Sujet, filtres) -> list[dict]:
    if filtres is None:
        return []
    if not isinstance(filtres, list):
        raise CompositionInvalide("Les filtres doivent être une liste.")
    propres = []
    for item in filtres:
        if not isinstance(item, dict) or "dimension" not in item or "valeur" not in item:
            raise CompositionInvalide("Chaque filtre indique une dimension et une valeur.")
        dimension = _texte(item.get("dimension"))
        if not dimension:
            raise CompositionInvalide("Chaque filtre indique une dimension et une valeur.")
        _axe_demande(sujet, dimension, "Cet axe n'est pas disponible pour ce sujet.")
        valeur = item.get("valeur")
        propres.append({"dimension": dimension, "valeur": "" if valeur is None else str(valeur)})
    return propres


def _requete(sujet: Sujet, axe_lignes: Axe, axe_colonnes: Axe | None, filtres: list[dict]):
    qs = sujet.modele.objects.all()
    axes = [axe_lignes, *([axe_colonnes] if axe_colonnes else []), *(sujet.axe(item["dimension"]) for item in filtres)]
    if any(item.derive == "tranche_age" for item in axes):
        qs = _annoter_tranche(qs)
    for item in filtres:
        axe = sujet.axe(item["dimension"])
        valeur = item["valeur"]
        if axe.derive == "tranche_age":
            qs = qs.filter(tranche_age=valeur)
        elif valeur == "":
            qs = qs.filter(Q(**{f"{axe.champ}__isnull": True}) | Q(**{axe.champ: ""}))
        else:
            qs = qs.filter(**{axe.champ: _valeur_orm(axe, valeur)})
    return qs


def _appliquer_filtre(qs, axe: Axe, valeur: str):
    if axe.derive == "tranche_age":
        return qs.filter(tranche_age=valeur)
    if valeur == "":
        return qs.filter(Q(**{f"{axe.champ}__isnull": True}) | Q(**{axe.champ: ""}))
    return qs.filter(**{axe.champ: _valeur_orm(axe, valeur)})


def _agreger(qs, mesure: Mesure, axe_lignes: Axe, axe_colonnes: Axe | None, distinct: bool = False) -> dict[tuple[str, str], int]:
    if mesure.champ:
        aggregation = Sum(mesure.champ)
    elif distinct:
        aggregation = Count("pk", distinct=True)
    else:
        aggregation = Count("pk")
    champs = [axe_lignes.champ, axe_colonnes.champ] if axe_colonnes else [axe_lignes.champ]
    cellules: dict[tuple[str, str], int] = {}
    for ligne in qs.order_by().values(*champs).annotate(total=aggregation):
        libelle_ligne = _etiquette(axe_lignes, ligne[axe_lignes.champ])
        libelle_colonne = _etiquette(axe_colonnes, ligne[axe_colonnes.champ]) if axe_colonnes else ""
        cle = (libelle_ligne, libelle_colonne)
        cellules[cle] = cellules.get(cle, 0) + int(ligne["total"] or 0)
    return cellules


def _reduire(cellules: dict[tuple[str, str], int], croise: bool):
    if not cellules:
        if croise:
            return None, {"colonnes": [], "lignes": []}, 0
        return [], None, 0
    if not croise:
        totaux: dict[str, int] = {}
        for (libelle, _), total in cellules.items():
            totaux[libelle] = totaux.get(libelle, 0) + total
        gardes, exclus = _plafer(totaux)
        series = [{"libelle": libelle, "total": totaux[libelle]} for libelle in gardes]
        reste = sum(totaux[libelle] for libelle in exclus)
        if reste:
            series.append({"libelle": AUTRES, "total": reste})
        return series, None, sum(totaux.values())

    totaux_lignes: dict[str, int] = {}
    totaux_colonnes: dict[str, int] = {}
    for (libelle_ligne, libelle_colonne), total in cellules.items():
        totaux_lignes[libelle_ligne] = totaux_lignes.get(libelle_ligne, 0) + total
        totaux_colonnes[libelle_colonne] = totaux_colonnes.get(libelle_colonne, 0) + total
    gardes_lignes, exclus_lignes = _plafer(totaux_lignes)
    gardes_colonnes, exclus_colonnes = _plafer(totaux_colonnes)
    gardes_lignes = _avec_autres(gardes_lignes, exclus_lignes)
    gardes_colonnes = _avec_autres(gardes_colonnes, exclus_colonnes)
    grille = {(ligne, colonne): 0 for ligne in gardes_lignes for colonne in gardes_colonnes}
    for (libelle_ligne, libelle_colonne), total in cellules.items():
        ligne = AUTRES if libelle_ligne in exclus_lignes else libelle_ligne
        colonne = AUTRES if libelle_colonne in exclus_colonnes else libelle_colonne
        grille[(ligne, colonne)] = grille.get((ligne, colonne), 0) + total
    lignes = []
    for libelle in gardes_lignes:
        valeurs = [grille.get((libelle, colonne), 0) for colonne in gardes_colonnes]
        lignes.append({"libelle": libelle, "cellules": valeurs, "total": sum(valeurs)})
    return None, {"colonnes": gardes_colonnes, "lignes": lignes}, sum(totaux_lignes.values())


def _plafer(totaux: dict[str, int]) -> tuple[list[str], set[str]]:
    tries = sorted(totaux, key=lambda libelle: (-totaux[libelle], libelle))
    if len(tries) <= PLAFOND:
        return tries, set()
    return tries[:PLAFOND], set(tries[PLAFOND:])


def _avec_autres(gardes: list[str], exclus: set[str]) -> list[str]:
    if not exclus or AUTRES in gardes:
        return gardes
    return [*gardes, AUTRES]


def _etiquette(axe: Axe, valeur) -> str:
    if valeur is None or valeur == "":
        return VIDE
    if axe.choix:
        return axe.choix.get(str(valeur), str(valeur))
    return str(valeur)


def _valeur_orm(axe: Axe, valeur: str):
    if not axe.entier:
        return valeur
    try:
        return int(valeur)
    except (TypeError, ValueError) as exc:
        raise CompositionInvalide("Cette valeur n'est pas un nombre.") from exc


def _annoter_tranche(qs):
    jour = timezone.localdate()
    return qs.annotate(
        tranche_age=Case(
            When(date_naissance__isnull=True, then=Value("Date de naissance non renseignée")),
            When(date_naissance__gt=_il_y_a(35, jour), then=Value("Moins de 35 ans")),
            When(date_naissance__gt=_il_y_a(46, jour), then=Value("35 à 45 ans")),
            When(date_naissance__gt=_il_y_a(56, jour), then=Value("46 à 55 ans")),
            default=Value("Plus de 55 ans"),
            output_field=CharField(),
        )
    )


def _il_y_a(annees: int, jour: date) -> date:
    try:
        return jour.replace(year=jour.year - annees)
    except ValueError:
        return jour.replace(year=jour.year - annees, day=28)


def _texte(valeur) -> str:
    if valeur is None:
        return ""
    return str(valeur).strip()
