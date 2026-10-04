"""Import groupé de la situation administrative depuis un classeur Excel."""

import io
import unicodedata
import zipfile
from datetime import datetime, timedelta
from xml.etree import ElementTree

from django.contrib.auth.models import User
from django.db import transaction

from .models import Agent, Organisme
from .present import situation_saisie
from .saisie import enregistrer_situation
from .utilisateurs import perimetre_matricules

TAILLE_MAX = 5 * 1024 * 1024
LIGNES_MAX = 1000

# Même rubriques que le formulaire du dossier, dans le même ordre.
COLONNES = (
    ("matricule", "Matricule", ()),
    ("organisme", "Structure", ("organisme", "code structure")),
    ("direction", "Direction", ()),
    ("sous_direction", "Sous-Direction", ("sous direction",)),
    ("service", "Service", ()),
    ("localisation", "Lieu de Travail", ("localisation",)),
    ("emploi", "Emploi", ()),
    ("type_agent", "Type Agent", ("type d'agent", "type agent")),
    ("mode_recrutement", "Mode Recrutement", ("mode de recrutement",)),
    ("categorie", "Catégorie", ()),
    ("grade", "Grade", ()),
    ("echelon", "Échelon", ()),
    (
        "prise_service",
        "Date de première prise de service (Fonction Publique)",
        ("premiere prise de service", "date de premiere prise de service"),
    ),
    ("prise_service_ministere", "Date de prise de service dans le ministère", ()),
    ("prise_service_emploi", "Date de prise de service dans l'emploi", ()),
    ("fonction", "Fonction", ()),
    ("prise_service_fonction", "Date de prise de service dans la fonction", ()),
    ("situation", "Positions", ("position", "situation")),
)
CHAMPS = {champ: entete for champ, entete, _alias in COLONNES}
DATES = {
    "prise_service_ministere": "date de prise de service dans le ministère",
    "prise_service_emploi": "date de prise de service dans l'emploi",
    "prise_service_fonction": "date de prise de service dans la fonction",
}


class ImportInvalide(Exception):
    def __init__(self, message: str, erreurs: list | None = None) -> None:
        self.message = message
        self.erreurs = erreurs or []


def modele() -> bytes:
    """Classeur du dossier numérique : bandeau, en-têtes colorés, mode d'emploi et structures."""
    entetes = [entete for _champ, entete, _alias in COLONNES]
    exemple = [
        "349812K",
        "DGPE",
        "Direction des Ressources Humaines",
        "Sous-direction des Actes",
        "Service de la Solde",
        "Plateau, Abidjan",
        "Administrateur des services financiers",
        "Fonctionnaire",
        "Concours",
        "A",
        "A5",
        "4",
        "2015-01-12",
        "2018-10-01",
        "2015-01-12",
        "Chef de service",
        "2024-06-01",
        "En activité",
    ]
    structures = [[item.code, item.sigle, item.nom] for item in Organisme.objects.order_by("nom")]
    return _classeur_dossier(entetes, exemple, structures)


def importer(contenu: bytes, user: User) -> dict:
    """Met à jour les agents du classeur. Lève ImportInvalide sans rien enregistrer si une ligne échoue."""
    if len(contenu) > TAILLE_MAX:
        raise ImportInvalide("Le classeur dépasse 5 Mo.")
    try:
        lignes = _lire_feuille(contenu, "Agents")
    except (zipfile.BadZipFile, ElementTree.ParseError, KeyError, ValueError) as exc:
        raise ImportInvalide("Ce fichier n'est pas un classeur Excel .xlsx lisible.") from exc
    lignes = _depuis_entete(lignes)
    if not lignes:
        raise ImportInvalide("Le classeur est vide. Téléchargez le modèle et conservez la ligne d'en-têtes.")

    index = _index_entetes(lignes[0][1])
    if len(lignes) - 1 > LIGNES_MAX:
        raise ImportInvalide(f"Le classeur dépasse {LIGNES_MAX} agents. Découpez l'import.")

    perimetre = perimetre_matricules(user)
    agents = {
        agent.matricule.casefold(): agent
        for agent in Agent.objects.select_related("organisme").filter(
            **({} if perimetre is None else {"matricule__in": perimetre})
        )
    }
    organismes = list(Organisme.objects.all())
    plans: list[tuple[int, Agent, dict]] = []
    vus: dict[str, int] = {}
    erreurs: list[dict] = []

    for numero, ligne in lignes[1:]:
        try:
            plan = _preparer(numero, ligne, index, agents, organismes, vus)
        except _Ligne as exc:
            erreurs.append({"ligne": exc.ligne, "message": exc.message})
            continue
        if plan is not None:
            plans.append(plan)

    if erreurs:
        raise ImportInvalide(_resume(len(erreurs)), erreurs)
    if not plans:
        raise ImportInvalide(
            "Le classeur ne contient aucune donnée à enregistrer. Renseignez au moins une colonne en plus du matricule."
        )

    with transaction.atomic():
        for numero, agent, saisie in plans:
            erreur = enregistrer_situation(agent, saisie)
            if erreur:
                erreurs.append({"ligne": numero, "message": erreur})
        if erreurs:
            transaction.set_rollback(True)

    if erreurs:
        raise ImportInvalide(_resume(len(erreurs)), erreurs)
    n = len(plans)
    return {"detail": "1 dossier mis à jour." if n == 1 else f"{n} dossiers mis à jour.", "mis_a_jour": n}


class _Ligne(Exception):
    def __init__(self, ligne: int, message: str) -> None:
        self.ligne = ligne
        self.message = message


class _Valeur(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def _index_entetes(entete: list) -> dict[str, int]:
    index: dict[str, int] = {}
    inconnues = []
    for position, cellule in enumerate(entete):
        if cellule is None or str(cellule).strip() == "":
            continue
        cle = _norm(str(cellule))
        champ = _CHAMP_PAR_ENTETE.get(cle)
        if champ is None:
            inconnues.append(str(cellule).strip())
            continue
        if champ in index:
            raise ImportInvalide(f"La colonne « {CHAMPS[champ]} » est en double.")
        index[champ] = position
    if inconnues:
        noms = ", ".join(f"« {nom} »" for nom in inconnues)
        raise ImportInvalide(f"Colonne inconnue : {noms}. Téléchargez le modèle et conservez les en-têtes.")
    if "matricule" not in index:
        raise ImportInvalide("La colonne « Matricule » est absente. Téléchargez le modèle et conservez la ligne d'en-têtes.")
    return index


def _preparer(numero, ligne, index, agents, organismes, vus):
    valeurs = {champ: _cellule(ligne, position) for champ, position in index.items()}
    matricule = valeurs.pop("matricule")
    if _vide(matricule) and all(_vide(valeur) for valeur in valeurs.values()):
        return None
    if _vide(matricule):
        raise _Ligne(numero, "Le matricule est obligatoire.")
    matricule = _texte(matricule)
    cle = matricule.casefold()
    if cle in vus:
        raise _Ligne(numero, f"Le matricule « {matricule} » est déjà présent à la ligne {vus[cle]}.")
    vus[cle] = numero
    agent = agents.get(cle)
    if agent is None:
        raise _Ligne(numero, f"Aucun agent ne porte le matricule « {matricule} ».")

    maj: dict[str, str] = {}
    for champ, brut in valeurs.items():
        if _vide(brut):
            continue
        try:
            if champ == "organisme":
                maj[champ] = _organisme(_texte(brut), organismes).code
            elif champ == "prise_service":
                maj[champ] = _prise_service(brut)
            elif champ in DATES:
                maj[champ] = _date(brut, DATES[champ])
            else:
                maj[champ] = _texte(brut)
        except _Valeur as exc:
            raise _Ligne(numero, exc.message) from exc
    if not maj:
        return None
    saisie = situation_saisie(agent)
    saisie.update(maj)
    return numero, agent, saisie


def _cellule(ligne: list, position: int):
    if position >= len(ligne):
        return None
    return ligne[position]


def _vide(valeur) -> bool:
    return valeur is None or str(valeur).strip() == ""


def _texte(valeur) -> str:
    if isinstance(valeur, float) and valeur == int(valeur):
        return str(int(valeur))
    return str(valeur).strip()


def _prise_service(valeur) -> str:
    if isinstance(valeur, (int, float)) and valeur == int(valeur) and 1900 <= int(valeur) <= 2100:
        return str(int(valeur))
    if isinstance(valeur, str) and valeur.strip().isdigit() and len(valeur.strip()) == 4:
        return valeur.strip()
    return _date(valeur, "date de première prise de service")


def _date(valeur, libelle: str) -> str:
    if isinstance(valeur, (int, float)):
        jour = (datetime(1899, 12, 30) + timedelta(days=float(valeur))).date()
        if 1950 <= jour.year <= 2100:
            return jour.isoformat()
        raise _Valeur(f"La {libelle} est invalide. Utilisez AAAA-MM-JJ ou JJ/MM/AAAA.")
    texte = str(valeur).strip()
    for motif in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            return datetime.strptime(texte, motif).date().isoformat()
        except ValueError:
            continue
    raise _Valeur(f"La {libelle} est invalide. Utilisez AAAA-MM-JJ ou JJ/MM/AAAA.")


def _organisme(texte: str, organismes: list[Organisme]) -> Organisme:
    cle = texte.casefold()
    for attribut in ("code", "sigle", "nom"):
        correspondants = [item for item in organismes if str(getattr(item, attribut)).casefold() == cle]
        if len(correspondants) == 1:
            return correspondants[0]
        if len(correspondants) > 1:
            raise _Valeur(f"La structure « {texte} » correspond à plusieurs organismes.")
    raise _Valeur(f"La structure « {texte} » est inconnue. Utilisez son code, son sigle ou son nom exact.")


def _resume(n: int) -> str:
    if n == 1:
        return "Le classeur n'a pas été importé : 1 ligne est incorrecte. Aucune modification n'a été enregistrée."
    return f"Le classeur n'a pas été importé : {n} lignes sont incorrectes. Aucune modification n'a été enregistrée."


def _norm(texte: str) -> str:
    texte = texte.replace("\ufeff", "").replace("’", "'").replace("-", " ")
    decompose = unicodedata.normalize("NFKD", texte)
    sans = "".join(ch for ch in decompose if not unicodedata.combining(ch))
    return " ".join(sans.casefold().split())


def _champ_par_entete() -> dict[str, str]:
    index = {}
    for champ, entete, alias in COLONNES:
        index[_norm(entete)] = champ
        for nom in alias:
            index[_norm(nom)] = champ
    return index


_CHAMP_PAR_ENTETE = _champ_par_entete()


def _depuis_entete(lignes: list) -> list:
    """Ignore le bandeau : la ligne d'en-têtes est celle qui porte la colonne Matricule."""
    return _jusqu_a_entete(lignes, {"matricule"})


def _jusqu_a_entete(lignes: list, cles: set[str]) -> list:
    """Ignore le bandeau jusqu'à la ligne qui contient un en-tête attendu."""
    while lignes and all(_vide(cellule) for cellule in lignes[0][1]):
        lignes.pop(0)
    for index, (_numero, cellules) in enumerate(lignes):
        if any(_norm(str(cellule)) in cles for cellule in cellules if not _vide(cellule)):
            return lignes[index:]
    return lignes


def _lire_feuille(contenu: bytes, nom: str, *, absente: bool = False) -> list:
    if not contenu.startswith(b"PK"):
        raise zipfile.BadZipFile
    with zipfile.ZipFile(io.BytesIO(contenu)) as archive:
        feuilles = _feuilles(archive)
        voulu = _norm(nom)
        chemin = next((chemin for titre, chemin in feuilles if _norm(titre) == voulu), None)
        if chemin is None:
            if absente:
                return []
            chemin = feuilles[0][1]
        partagees = _chaines(archive) if "xl/sharedStrings.xml" in archive.namelist() else []
        racine = ElementTree.fromstring(archive.read(chemin))
    lignes = []
    for ligne in racine.iter():
        if _balise(ligne) != "row":
            continue
        cellules: dict[int, str | float | None] = {}
        for cellule in ligne:
            if _balise(cellule) != "c":
                continue
            ref = cellule.attrib.get("r", "")
            lettres = "".join(ch for ch in ref if ch.isalpha())
            if not lettres:
                continue
            cellules[_colonne(lettres)] = _valeur(cellule, partagees)
        numero_brut = "".join(caractere for caractere in ligne.attrib.get("r", "") if caractere.isdigit())
        numero = int(numero_brut) if numero_brut else (lignes[-1][0] + 1 if lignes else 1)
        if not cellules:
            lignes.append((numero, []))
            continue
        largeur = max(cellules) + 1
        lignes.append((numero, [cellules.get(i) for i in range(largeur)]))
    return lignes


def _feuilles(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    classeur = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    liens = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    cibles = {}
    for lien in liens:
        if _balise(lien) != "Relationship":
            continue
        cible = lien.attrib.get("Target", "").lstrip("/")
        if not cible.startswith("xl/"):
            cible = f"xl/{cible}"
        cibles[lien.attrib.get("Id")] = cible
    feuilles = []
    for feuille in classeur.iter():
        if _balise(feuille) != "sheet":
            continue
        identifiant = feuille.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        feuilles.append((feuille.attrib.get("name", ""), cibles[identifiant]))
    if not feuilles:
        raise KeyError("feuille")
    return feuilles


def _chaines(archive: zipfile.ZipFile) -> list[str]:
    racine = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    textes = []
    for item in racine:
        if _balise(item) != "si":
            continue
        textes.append("".join(noeud.text or "" for noeud in item.iter() if _balise(noeud) == "t"))
    return textes


def _valeur(cellule, partagees: list[str]):
    nature = cellule.attrib.get("t")
    if nature == "inlineStr":
        return _texte_noeud(cellule) or None
    noeud = next((enfant for enfant in cellule if _balise(enfant) == "v"), None)
    if noeud is None or noeud.text is None:
        return None
    brut = noeud.text
    if nature == "s":
        return partagees[int(brut)]
    if nature in {None, "n"}:
        return float(brut)
    return brut


def _texte_noeud(noeud) -> str:
    return "".join(enfant.text or "" for enfant in noeud.iter() if _balise(enfant) == "t").strip()


def _colonne(lettres: str) -> int:
    indice = 0
    for caractere in lettres:
        indice = indice * 26 + ord(caractere.upper()) - 64
    return indice - 1


def _balise(noeud) -> str:
    return noeud.tag.rsplit("}", 1)[-1]


# --- Classeur mis en forme --------------------------------------------------------------------

_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_LARGEURS = (16, 16, 38, 34, 30, 24, 40, 18, 22, 14, 12, 12, 32, 32, 32, 26, 32, 20)
_DATES = {13, 14, 16}
_CONSIGNES = (
    "Renseignez la feuille Agents : une ligne par agent. Seule cette feuille est importée.",
    "La feuille Exemple montre une ligne complète. Elle n'est pas importée.",
    "Le matricule doit déjà exister. L'import met à jour les dossiers, il n'en crée pas.",
    "Une cellule vide conserve la valeur déjà enregistrée.",
    "Ne renommez pas les en-têtes et n'ajoutez pas de colonne.",
    "Les dates s'écrivent AAAA-MM-JJ (2024-06-01) ou JJ/MM/AAAA (01/06/2024).",
    "La première prise de service peut être une date ou seulement une année (2015).",
    "La structure se saisit par son code, son sigle ou son nom exact (feuille Structures).",
    "La catégorie est A, B, C ou D.",
    "Si une ligne est incorrecte, aucune modification n'est enregistrée.",
)


def _classeur_dossier(entetes: list[str], exemple: list[str], structures: list[list[str]]) -> bytes:
    feuilles = {
        "Agents": _feuille_agents(entetes),
        "Consignes": _feuille_consignes(entetes, exemple),
        "Structures": _feuille_structures(structures),
        "Exemple": _feuille_exemple(entetes, exemple),
    }
    return _assembler(feuilles)


def _feuille_agents(entetes: list[str]) -> str:
    derniere = _lettre(len(entetes))
    lignes = [
        _ligne_bandeau(1, 30, f"A1:{derniere}1", "SIGRH  ·  Dossier numérique des agents", 1),
        _ligne_bandeau(2, 18, f"A2:{derniere}2", "Situation administrative  —  une ligne par agent, identifié par son matricule", 2),
        _ligne_bandeau(
            3, 18, f"A3:{derniere}3",
            "Une cellule vide conserve la valeur déjà enregistrée. Ne renommez pas les en-têtes. Les dates : AAAA-MM-JJ ou JJ/MM/AAAA.",
            3,
        ),
    ]
    lignes.append(_ligne_cellules(4, 32, [_xml_cellule(_lettre(i + 1), 4, entete, 4) for i, entete in enumerate(entetes)]))
    for rang in range(5, 45):
        style_base = 6 if rang % 2 == 0 else 5
        style_date = 8 if rang % 2 == 0 else 7
        cellules = [
            _xml_cellule(_lettre(i + 1), rang, "", style_date if i in _DATES else style_base)
            for i in range(len(entetes))
        ]
        lignes.append(_ligne_cellules(rang, 18, cellules))
    return _worksheet(
        lignes,
        largeurs=_LARGEURS,
        fusions=(f"A1:{derniere}1", f"A2:{derniere}2", f"A3:{derniere}3"),
        gel="A5",
        filtre=f"A4:{derniere}44",
        liste=("J5:J44", '"A,B,C,D"'),
        paysage=True,
        onglet="FF004428",
    )


def _feuille_consignes(entetes: list[str], exemple: list[str]) -> str:
    lignes = [
        _ligne_bandeau(1, 30, "A1:C1", "Mode d'emploi du dossier numérique", 1),
        _ligne_bandeau(2, 18, "A2:C2", "Ministère du Portefeuille de l'État et des Entreprises publiques", 2),
    ]
    for index, texte in enumerate(_CONSIGNES, start=1):
        rang = index + 3
        lignes.append(_ligne_cellules(rang, 18, [
            _xml_cellule("A", rang, f"{index}.  {texte}", 10),
        ]))
    depart = len(_CONSIGNES) + 5
    lignes.append(_ligne_bandeau(depart, 30, f"A{depart}:C{depart}", "Colonnes et exemple de saisie", 1))
    entete = depart + 1
    lignes.append(_ligne_cellules(entete, 18, [
        _xml_cellule("A", entete, "Colonne", 4),
        _xml_cellule("B", entete, "Exemple", 4),
    ]))
    for index, (entete_col, valeur) in enumerate(zip(entetes, exemple)):
        rang = entete + 1 + index
        style = 6 if index % 2 else 5
        lignes.append(_ligne_cellules(rang, 18, [
            _xml_cellule("A", rang, entete_col, 16 if index % 2 == 0 else 10),
            _xml_cellule("B", rang, valeur, style),
        ]))
    largeur_nom = max(len("Colonne"), *(len(nom) for nom in entetes)) + 4
    return _worksheet(
        lignes,
        largeurs=(largeur_nom, 56, 24),
        fusions=(
            "A1:C1", "A2:C2",
            *(f"A{index + 3}:C{index + 3}" for index in range(1, len(_CONSIGNES) + 1)),
            f"A{depart}:C{depart}", f"B{entete}:C{entete}",
        ) + tuple(f"B{entete + 1 + i}:C{entete + 1 + i}" for i in range(len(entetes))),
        onglet="FF0A5E3A",
    )


def _feuille_structures(structures: list[list[str]]) -> str:
    lignes = [
        _ligne_bandeau(1, 30, "A1:C1", "Structures du portefeuille", 1),
        _ligne_bandeau(2, 18, "A2:C2", "Dans la colonne Structure, saisissez le code, le sigle ou le nom exact.", 3),
        _ligne_cellules(4, 18, [_xml_cellule("A", 4, "Code", 4), _xml_cellule("B", 4, "Sigle", 4), _xml_cellule("C", 4, "Nom", 4)]),
    ]
    if not structures:
        lignes.append(_ligne_cellules(5, 18, [_xml_cellule("A", 5, "—", 11), _xml_cellule("B", 5, "", 11), _xml_cellule("C", 5, "Aucune structure enregistrée", 11)]))
    for index, (code, sigle, nom) in enumerate(structures):
        rang = 5 + index
        style = 6 if index % 2 else 5
        lignes.append(_ligne_cellules(rang, 18, [
            _xml_cellule("A", rang, code, 16 if index % 2 == 0 else style),
            _xml_cellule("B", rang, sigle, style),
            _xml_cellule("C", rang, nom, style),
        ]))
    return _worksheet(
        lignes, largeurs=(18, 18, 64), fusions=("A1:C1", "A2:C2"), gel="A5",
        filtre=f"A4:C{max(4, 4 + len(structures))}", onglet="FF0B1C30",
    )


def _feuille_exemple(entetes: list[str], exemple: list[str]) -> str:
    derniere = _lettre(len(entetes))
    lignes = [
        _ligne_bandeau(1, 22, f"A1:{derniere}1", "Exemple  ·  cette feuille n'est pas importée", 12),
        _ligne_bandeau(2, 18, f"A2:{derniere}2", "Reproduisez ce niveau de détail sur la feuille Agents, pour un matricule déjà enregistré.", 3),
        _ligne_cellules(4, 32, [_xml_cellule(_lettre(i + 1), 4, entete, 13) for i, entete in enumerate(entetes)]),
        _ligne_cellules(5, 18, [_xml_cellule(_lettre(i + 1), 5, valeur, 14) for i, valeur in enumerate(exemple)]),
    ]
    return _worksheet(lignes, largeurs=_LARGEURS, fusions=(f"A1:{derniere}1", f"A2:{derniere}2"), paysage=True, onglet="FF9E4300")


def _worksheet(lignes, *, largeurs, fusions=(), gel="", filtre="", liste=None, paysage=False, onglet="FF004428") -> str:
    cols = "".join(
        f'<col min="{i}" max="{i}" width="{largeur}" customWidth="1"/>'
        for i, largeur in enumerate(largeurs, start=1)
    )
    vue = ""
    if gel:
        vue = (
            '<sheetViews><sheetView workbookViewId="0">'
            f'<pane ySplit="{int(gel[1:]) - 1}" topLeftCell="{gel}" activePane="bottomLeft" state="frozen"/>'
            "</sheetView></sheetViews>"
        )
    page = ""
    if paysage:
        page = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>'
    fusion = ""
    if fusions:
        fusion = f'<mergeCells count="{len(fusions)}">' + "".join(f'<mergeCell ref="{ref}"/>' for ref in fusions) + "</mergeCells>"
    auto = f'<autoFilter ref="{filtre}"/>' if filtre else ""
    validation = ""
    if liste:
        plage, formule = liste
        validation = (
            '<dataValidations count="1">'
            f'<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="{plage}">'
            f"<formula1>{formule}</formula1></dataValidation></dataValidations>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{_NS}">'
        f'<sheetPr><tabColor rgb="{onglet}"/></sheetPr>'
        f"{vue}<cols>{cols}</cols><sheetData>{''.join(lignes)}</sheetData>"
        f"{auto}{fusion}{validation}"
        '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
        f"{page}</worksheet>"
    )


def _ligne_bandeau(rang: int, hauteur: int, _ref: str, texte: str, style: int) -> str:
    lettre = "A"
    return _ligne_cellules(rang, hauteur, [_xml_cellule(lettre, rang, texte, style)])


def _ligne_cellules(rang: int, hauteur: int, cellules: list[str]) -> str:
    return f'<row r="{rang}" ht="{hauteur}" customHeight="1">{"".join(cellules)}</row>'


def _xml_cellule(colonne: str, rang: int, texte: str, style: int) -> str:
    ref = f"{colonne}{rang}"
    if texte == "":
        return f'<c r="{ref}" s="{style}"/>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{_echapper(texte)}</t></is></c>'


def _lettre(indice: int) -> str:
    nom = ""
    while indice:
        indice, reste = divmod(indice - 1, 26)
        nom = chr(65 + reste) + nom
    return nom


def _echapper(valeur: str) -> str:
    return str(valeur).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _assembler(feuilles: dict[str, str]) -> bytes:
    rels = []
    sheets = []
    fichiers = {"xl/styles.xml": _styles()}
    for index, (nom, contenu) in enumerate(feuilles.items(), start=1):
        fichiers[f"xl/worksheets/sheet{index}.xml"] = contenu
        rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
        sheets.append(f'<sheet name="{_echapper(nom)}" sheetId="{index}" r:id="rId{index}"/>')
    rels.append(
        f'<Relationship Id="rId{len(feuilles) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    fichiers["xl/workbook.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheets)}</sheets></workbook>'
    )
    fichiers["xl/_rels/workbook.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels)}</Relationships>'
    )
    feuilles_xml = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, len(feuilles) + 1)
    )
    fichiers["[Content_Types].xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        f"{feuilles_xml}</Types>"
    )
    fichiers["_rels/.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    return _zipper(fichiers)


def _styles() -> str:
    police = "Arial"
    def fonte(taille, *, gras=False, italique=False, couleur="FF0B1C30"):
        marque = "<b/>" if gras else ""
        inclin = "<i/>" if italique else ""
        return f'<font>{marque}{inclin}<sz val="{taille}"/><color rgb="{couleur}"/><name val="{police}"/></font>'

    fonts = "".join([
        fonte(11),
        fonte(20, gras=True, couleur="FFFFFFFF"),
        fonte(11, couleur="FFFFFFFF"),
        fonte(10, italique=True),
        fonte(10, gras=True, couleur="FFFFFFFF"),
        fonte(10),
        fonte(11, gras=True, couleur="FFFFFFFF"),
        fonte(10, gras=True, couleur="FF004428"),
    ])
    def aplat(couleur):
        return f'<fill><patternFill patternType="solid"><fgColor rgb="{couleur}"/><bgColor indexed="64"/></patternFill></fill>'

    fills = (
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        + aplat("FF004428") + aplat("FF0A5E3A") + aplat("FFE7F6EE") + aplat("FFF7FBFA")
        + aplat("FFFFF6F1") + aplat("FF9E4300")
    )
    trait = '<left style="thin"><color rgb="FFD5E5DC"/></left><right style="thin"><color rgb="FFD5E5DC"/></right><top style="thin"><color rgb="FFD5E5DC"/></top><bottom style="thin"><color rgb="FFD5E5DC"/></bottom>'
    borders = f"<border/>{''.join(f'<border>{trait}</border>' for _ in range(4))}"
    # xf : font fill border align numFmt
    def xf(fonte_id, fill, border=0, horizontal="left", wrap=False, num="0"):
        retour = ' wrapText="1"' if wrap else ""
        nombre = ' applyNumberFormat="1"' if num != "0" else ""
        return (
            f'<xf numFmtId="{num}" fontId="{fonte_id}" fillId="{fill}" borderId="{border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"{nombre}>'
            f'<alignment horizontal="{horizontal}" vertical="center"{retour}/></xf>'
        )

    xfs = "".join([
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        xf(1, 2, horizontal="left"),          # 1 titre
        xf(2, 3),                              # 2 sous-titre
        xf(3, 4, wrap=True),                   # 3 notice
        xf(4, 2, 1, "center", True),           # 4 en-tête
        xf(5, 0, 1),                           # 5 saisie
        xf(5, 5, 1),                           # 6 saisie alternée
        xf(5, 0, 1, num="164"),                # 7 date
        xf(5, 5, 1, num="164"),                # 8 date alternée
        xf(1, 2),                              # 9 réserve
        xf(5, 0, 1, wrap=True),                # 10 texte de consigne
        xf(5, 4, wrap=True),                   # 11 texte atténué
        xf(6, 7),                              # 12 bandeau cuivre
        xf(4, 7, 1, "center", True),           # 13 en-tête exemple
        xf(5, 6, 1),                           # 14 valeur exemple
        xf(4, 2, 1, "center"),                 # 15 pastille
        xf(7, 0, 1, wrap=True),                # 16 libellé vert
    ])
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<styleSheet xmlns="{_NS}">'
        '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>'
        f'<fonts count="8">{fonts}</fonts>'
        f'<fills count="8">{fills}</fills>'
        f'<borders count="5">{borders}</borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        f'<cellXfs count="17">{xfs}</cellXfs>'
        "</styleSheet>"
    )


def _zipper(fichiers: dict[str, str]) -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for nom, contenu in fichiers.items():
            archive.writestr(nom, contenu.encode("utf-8"))
    return tampon.getvalue()
