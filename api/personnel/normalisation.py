"""Normalisation des données saisies : fonctions pures, sans accès à la base.

Convention des identités :
- `nom` : nom d'usage, en MAJUSCULES (pour une femme mariée, le nom de l'époux) ;
- `nom_jeune_fille` : nom de naissance, en MAJUSCULES ;
- `prenoms` : casse de titre, trait d'union et apostrophe conservés (`Jean-Marie`, `N'Guessan`).

Chaque fonction est idempotente : normaliser une valeur déjà normalisée ne la change pas.
"""

import re
import unicodedata
from dataclasses import dataclass, field

_NEE = re.compile(r"\bN[ÉE]E\b", re.IGNORECASE)
_EPOUSE = re.compile(r"\b[ÉE]p(?:se|ouse)\b\.?", re.IGNORECASE)


def espaces(valeur: str) -> str:
    """Unicode NFC, espaces (y compris insécables) réduits à un seul, sans espace en bordure."""
    return " ".join(unicodedata.normalize("NFC", valeur or "").replace(" ", " ").split())


def nom_majuscules(valeur: str) -> str:
    return espaces(valeur).upper()


def prenoms_titre(valeur: str) -> str:
    """Casse de titre mot par mot, y compris après un trait d'union ou une apostrophe."""
    def mot(texte: str) -> str:
        return re.sub(r"[^-'’]+", lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(), texte)

    return " ".join(mot(m) for m in espaces(valeur).split())


@dataclass
class Identite:
    nom: str
    prenoms: str
    nom_jeune_fille: str = ""
    # Cas qu'aucune règle ne tranche à coup sûr : à faire valider par la DRH.
    douteux: list[str] = field(default_factory=list)


def normaliser_identite(nom: str, prenoms: str, nom_jeune_fille: str = "", deduire_epoux: bool = True) -> Identite:
    """`deduire_epoux=False` : à la saisie, on met en forme sans réattribuer le nom de l'époux."""
    nom, prenoms, jeune_fille = espaces(nom), espaces(prenoms), espaces(nom_jeune_fille)
    douteux: list[str] = []

    # « ACHIEPO NEE GUEDE » : nom d'usage avant « NEE », nom de naissance après.
    morceaux = _NEE.split(nom, maxsplit=1)
    if len(morceaux) == 2 and morceaux[0].strip():
        nom, naissance = morceaux[0].strip(), morceaux[1].strip()
        if naissance:
            if jeune_fille and nom_majuscules(jeune_fille) != nom_majuscules(naissance):
                douteux.append(f"nom de naissance déjà renseigné ({jeune_fille}) ≠ « née {naissance} »")
            jeune_fille = jeune_fille or naissance

    # « Miyala Annick Epse Bassole » : le nom de l'époux est tombé dans les prénoms.
    morceaux = _EPOUSE.split(prenoms, maxsplit=1) if deduire_epoux else [prenoms]
    if len(morceaux) == 2 and morceaux[0].strip():
        prenoms, epoux = morceaux[0].strip(), morceaux[1].strip()
        if epoux and not jeune_fille:
            # Le nom saisi était le nom de naissance ; celui de l'époux devient le nom d'usage.
            jeune_fille, nom = nom, epoux
            douteux.append(f"nom d'usage déduit de « Epse {epoux} » : vérifier lequel est le nom de naissance")
        elif epoux:
            douteux.append(f"« Epse {epoux} » dans les prénoms alors qu'un nom de naissance existe")

    if len(nom.split()) == 1 and len(prenoms.split()) >= 3 and not jeune_fille:
        douteux.append("nom d'un seul mot, trois prénoms ou plus : nom de famille composé tronqué ?")

    return Identite(nom_majuscules(nom), prenoms_titre(prenoms), nom_majuscules(jeune_fille), douteux)


# --- Structures --------------------------------------------------------------------------------------
# Sigles conservés en majuscules.
SIGLES = {"DGPE", "DGPN", "DGEPN", "BTP", "DAAF", "DAJ", "DRHC", "DSPS", "PSPS", "DRH", "DGE"}
# Mots-outils en minuscules (sauf en tête de libellé).
PETITS_MOTS = {"de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "à", "pour", "sur", "par", "dans", "avec", "autres", "ou", "l", "d", "n", "s", "qu"}
# Fautes de frappe relevées dans le fichier du personnel (clé : mot sans accent, en minuscules).
FAUTES = {
    "hydrocabure": "hydrocarbure", "hydrocabures": "hydrocarbures", "hydrocarure": "hydrocarbure",
    "ssteme": "système", "sisteme": "système", "secodaire": "secondaire", "genrale": "générale",
    "commnication": "communication", "secreetariat": "secrétariat", "secretaraît": "secrétariat", "secretarait": "secrétariat",
    "transerse": "transverse", "portefeuillle": "portefeuille",
}
# Accents rétablis (clé : mot sans accent, en minuscules). Liste volontairement limitée aux mots rencontrés.
ACCENTS = {
    "general": "général", "generale": "générale", "generaux": "généraux", "comptabilite": "comptabilité",
    "telecommunication": "télécommunication", "telecommunications": "télécommunications", "telecom": "télécom",
    "secretariat": "secrétariat", "media": "média", "medias": "médias", "strategie": "stratégie", "electricite": "électricité",
    "etude": "étude", "etudes": "études", "evaluation": "évaluation", "controle": "contrôle", "depenses": "dépenses",
    "developpement": "développement", "systeme": "système", "systemes": "systèmes", "rattache": "rattaché",
    "carriere": "carrière", "carrieres": "carrières", "college": "collège", "marche": "marché", "marches": "marchés",
    "materiel": "matériel", "materiels": "matériels", "procedures": "procédures", "aerien": "aérien",
    "electronique": "électronique", "ministere": "ministère", "etat": "État", "batiment": "bâtiment", "financieres": "financières",
    "numerique": "numérique", "memoire": "mémoire", "reglementation": "réglementation",
}


def _sans_accent(mot: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", mot) if not unicodedata.combining(c)).lower()


def _mot_structure(mot: str, debut: bool, parentheses: bool, colle: bool) -> str:
    """`colle` : mot qui suit un trait d'union (« Sous-direction »)."""
    if mot.upper() in SIGLES:
        return mot.upper()
    cle = _sans_accent(mot)
    corrige = ACCENTS.get(_sans_accent(FAUTES[cle]), FAUTES[cle]) if cle in FAUTES else ACCENTS.get(cle, mot.lower())
    if parentheses or colle or (corrige in PETITS_MOTS and not debut):
        return corrige
    return corrige[:1].upper() + corrige[1:]


def nom_structure(libelle: str) -> str:
    """Libellé d'une structure : casse de titre, accents et ponctuation corrigés, fautes de frappe relevées."""
    texte = espaces(libelle)
    texte = re.sub(r"^(SERVICE)(?=[A-ZÉÈ]{3})", r"\1 ", texte)               # « SERVICETECHNOLOGIE »
    texte = re.sub(r"\bRATTACH[ÉE] A\b", "RATTACHÉ À", texte, flags=re.IGNORECASE)
    texte = re.sub(r"\bSOUS[ -]DIRECTION\b", "Sous-direction", texte, flags=re.IGNORECASE)
    texte = re.sub(r"^SD\b", "Sous-direction", texte)
    texte = re.sub(r"\s*,(?:\s*,)*\s*", ", ", texte)                          # « A ,B , C » → « A, B, C »
    texte = re.sub(r",\s+(?=et\b)", " ", texte, flags=re.IGNORECASE)           # « POSTE, ET FINANCES »
    texte = re.sub(r"\(\s+", "(", re.sub(r"\s+\)", ")", re.sub(r"(?<=\S)\(", " (", texte))).strip(" ,")

    sortie, profondeur, debut, colle = [], 0, True, False
    for jeton in re.findall(r"[^\W\d_]+|\d+|\W", texte):
        if jeton[:1].isalpha():
            sortie.append(_mot_structure(jeton, debut, profondeur > 0, colle))
            debut = colle = False
        else:
            profondeur += jeton == "("
            profondeur -= jeton == ")"
            colle = jeton == "-"
            sortie.append(jeton)
    return "".join(sortie)
