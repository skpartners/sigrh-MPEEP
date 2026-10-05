"""Import groupé des pôles, structures, grades et emplois du ministère."""

import zipfile
from xml.etree import ElementTree

from django.db import transaction
from django.db.models import Max
from django.http import HttpResponse
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .effectifs import _code_libre
from .import_agents import ImportInvalide, _jusqu_a_entete, _lire_feuille, _norm, _texte, _vide
from .nomenclature import FAMILLES
from .structures import niveau_depuis_nom
from .models import EmploiReferentiel, EntiteTutelle, GradeReferentiel, PoleMinisteriel
from .classeur import habiller

TAILLE_MAX = 5 * 1024 * 1024
LIGNES_MAX = 1000
OUI = {"oui", "o", "yes", "vrai", "true", "1", "x"}
NON = {"non", "n", "no", "faux", "false", "0"}

POLES = (("nom", "Nom", ()),)
STRUCTURES = (
    ("nom", "Nom", ("structure",)),
    ("pole", "Pôle", ("pole",)),
    ("niveau", "Niveau", ()),
    ("rattachement", "Rattachement", ("parent",)),
)
GRADES = (
    ("code", "Code", ()),
    ("categorie", "Catégorie", ()),
    ("libelle", "Définition", ("libelle",)),
    ("en_vigueur", "En vigueur", ("vigueur",)),
)
EMPLOIS = (
    ("libelle", "Nom", ("emploi",)),
    ("famille", "Famille", ()),
    ("grade", "Grade", ()),
)


def modele() -> bytes:
    familles = [["Code", "Libellé"]]
    for code, libelle in FAMILLES:
        familles.append([code, libelle])
    return habiller([
        {"nom": "Pôles", "titre": "SIGRH  ·  Pôles ministériels", "sous_titre": "Une ligne crée un pôle, ou met à jour un pôle déjà nommé.", "notice": "Le nom est l'identifiant. Ne le renommez pas dans l'en-tête.", "lignes": [["Nom"]], "saisies": 12},
        {"nom": "Structures", "titre": "SIGRH  ·  Structures", "sous_titre": "Direction générale, direction centrale, sous-direction ou service.", "notice": "Le pôle et le rattachement se saisissent par leur nom exact. Une cellule vide conserve la valeur enregistrée.", "lignes": [["Nom", "Pôle", "Niveau", "Rattachement"]], "saisies": 20},
        {"nom": "Grades", "titre": "SIGRH  ·  Grades", "sous_titre": "Référentiel indiciaire.", "notice": "La catégorie est A, B, C ou D. En vigueur : oui ou non.", "lignes": [["Code", "Catégorie", "Définition", "En vigueur"]], "saisies": 16, "onglet": "FF0A5E3A"},
        {"nom": "Emplois", "titre": "SIGRH  ·  Emplois", "sous_titre": "Emplois classés par famille et par grade.", "notice": "La famille se saisit par son code ou son libellé (feuille Familles). Le grade est son code, par exemple A4.", "lignes": [["Nom", "Famille", "Grade"]], "saisies": 20, "onglet": "FF0A5E3A"},
        {"nom": "Consignes", "titre": "Mode d'emploi", "sous_titre": "Quatre feuilles sont lues : Pôles, Structures, Grades et Emplois.", "notice": "Une ligne crée un élément ou met à jour un élément déjà nommé. Une cellule vide conserve la valeur enregistrée. Le pôle, le rattachement, la famille et le grade se saisissent par leur nom ou leur code. Si une ligne est incorrecte, aucune modification n'est enregistrée.", "lignes": _consignes()[_consignes().index(["Feuille", "Colonne", "Exemple"]):], "onglet": "FF0B1C30"},
        {"nom": "Familles", "titre": "Familles d'emplois", "sous_titre": "Aide à la saisie. Cette feuille n'est pas importée.", "notice": "Recopiez le code ou le libellé dans la colonne Famille.", "lignes": familles, "onglet": "FF9E4300"},
    ])


def importer(contenu: bytes) -> dict:
    if len(contenu) > TAILLE_MAX:
        raise ImportInvalide("Le classeur dépasse 5 Mo.")
    try:
        poles = _feuille(contenu, "Pôles", POLES)
        structures = _feuille(contenu, "Structures", STRUCTURES)
        grades = _feuille(contenu, "Grades", GRADES)
        emplois = _feuille(contenu, "Emplois", EMPLOIS)
    except (zipfile.BadZipFile, ElementTree.ParseError, KeyError, ValueError) as exc:
        raise ImportInvalide("Ce fichier n'est pas un classeur Excel .xlsx lisible.") from exc

    if sum(len(lignes) for lignes in (poles, structures, grades, emplois)) > LIGNES_MAX:
        raise ImportInvalide(f"Le classeur dépasse {LIGNES_MAX} lignes. Découpez l'import.")

    erreurs: list[dict] = []
    poles_connus = list(PoleMinisteriel.objects.all())
    structures_connues = list(EntiteTutelle.objects.select_related("pole", "parent"))
    grades_connus = list(GradeReferentiel.objects.all())
    emplois_connus = list(EmploiReferentiel.objects.select_related("grade"))

    nouveaux_poles, erreurs = _poles(poles, poles_connus, erreurs)
    mouvements_structures, erreurs = _structures(structures, structures_connues, poles_connus, nouveaux_poles, erreurs)
    mouvements_grades, erreurs = _grades(grades, grades_connus, erreurs)
    mouvements_emplois, erreurs = _emplois(emplois, emplois_connus, grades_connus, mouvements_grades, erreurs)
    if erreurs:
        raise ImportInvalide(_resume(len(erreurs)), erreurs)

    total = len(nouveaux_poles) + len(mouvements_structures) + len(mouvements_grades) + len(mouvements_emplois)
    if total == 0:
        if poles or structures or grades or emplois:
            return {"detail": "Ces éléments sont déjà enregistrés.", "crees": 0, "mis_a_jour": 0}
        raise ImportInvalide(
            "Le classeur ne contient aucune donnée à enregistrer. Renseignez au moins une feuille du modèle."
        )

    with transaction.atomic():
        _appliquer(nouveaux_poles, mouvements_structures, mouvements_grades, mouvements_emplois)
    return {"detail": _bilan(nouveaux_poles, mouvements_structures, mouvements_grades, mouvements_emplois), "crees": _crees(nouveaux_poles, mouvements_structures, mouvements_grades, mouvements_emplois), "mis_a_jour": _maj(mouvements_structures, mouvements_grades, mouvements_emplois)}


class _Ligne(Exception):
    def __init__(self, ligne: int, message: str) -> None:
        self.ligne = ligne
        self.message = message


def _feuille(contenu: bytes, nom: str, colonnes) -> list[tuple[int, dict]]:
    cles = {_norm(titre) for _champ, titre, alias in colonnes for titre in (titre, *alias)}
    lignes = _jusqu_a_entete(_lire_feuille(contenu, nom, absente=True), cles)
    if not lignes:
        return []
    index = _index(lignes[0][1], colonnes, nom)
    pret = []
    for numero, ligne in lignes[1:]:
        valeurs = {champ: _cellule(ligne, position) for champ, position in index.items()}
        if all(_vide(valeur) for valeur in valeurs.values()):
            continue
        pret.append((numero, valeurs))
    return pret


def _index(entete: list, colonnes, feuille: str) -> dict[str, int]:
    attendus = {}
    for champ, titre, alias in colonnes:
        attendus[_norm(titre)] = champ
        for nom in alias:
            attendus[_norm(nom)] = champ
    index: dict[str, int] = {}
    inconnues = []
    for position, cellule in enumerate(entete):
        if _vide(cellule):
            continue
        champ = attendus.get(_norm(str(cellule)))
        if champ is None:
            inconnues.append(str(cellule).strip())
            continue
        if champ in index:
            raise ImportInvalide(f"La colonne « {cellule} » est en double sur la feuille {feuille}.")
        index[champ] = position
    if inconnues:
        noms = ", ".join(f"« {nom} »" for nom in inconnues)
        raise ImportInvalide(f"Colonne inconnue sur la feuille {feuille} : {noms}. Téléchargez le modèle et conservez les en-têtes.")
    if "nom" not in index and "libelle" not in index and "code" not in index:
        raise ImportInvalide(f"La feuille {feuille} n'a pas les en-têtes du modèle.")
    return index


def _poles(lignes, connus, erreurs):
    par_nom = {_norm(item.nom): item for item in connus}
    vus = set()
    nouveaux = []
    for numero, valeurs in lignes:
        try:
            nom = _obligatoire(valeurs.get("nom"), "Le nom du pôle", numero)
            if len(nom) > 180:
                raise _Ligne(numero, "Le nom du pôle dépasse 180 caractères.")
            cle = _norm(nom)
            if cle in vus:
                raise _Ligne(numero, f"Le pôle « {nom} » est déjà présent dans le classeur.")
            vus.add(cle)
            if cle not in par_nom and not any(_norm(item.code) == cle for item in connus):
                nouveaux.append(nom)
                par_nom[cle] = nom
        except _Ligne as exc:
            erreurs.append(_erreur("Pôles", exc))
    return nouveaux, erreurs


def _structures(lignes, connues, poles, nouveaux_poles, erreurs):
    par_nom = {_norm(item.nom): item for item in connues}
    noms_feuille = {_norm(nom) for _numero, valeurs in lignes if not _vide(valeurs.get("nom")) for nom in [_texte(valeurs.get("nom"))]}
    vus = set()
    mouvements = []
    for numero, valeurs in lignes:
        try:
            nom = _obligatoire(valeurs.get("nom"), "Le nom de la structure", numero)
            if len(nom) > 220:
                raise _Ligne(numero, "Le nom de la structure dépasse 220 caractères.")
            cle = _norm(nom)
            if cle in vus:
                raise _Ligne(numero, f"La structure « {nom} » est déjà présente dans le classeur.")
            vus.add(cle)
            brute = valeurs.get("pole")
            actuelle = par_nom.get(cle)
            pole = ""
            if not _vide(brute):
                pole = _resoudre_pole(_texte(brute), poles, nouveaux_poles, numero)
            elif actuelle is None:
                raise _Ligne(numero, "Le pôle est obligatoire pour une nouvelle structure.")
            niveau = _niveau_saisi(valeurs.get("niveau"), numero) if not _vide(valeurs.get("niveau")) else ""
            rattachement = "" if _vide(valeurs.get("rattachement")) else _texte(valeurs.get("rattachement"))
            if rattachement and _norm(rattachement) not in par_nom and _norm(rattachement) not in noms_feuille:
                raise _Ligne(numero, f"La structure de rattachement « {rattachement} » est inconnue.")
            if rattachement and _norm(rattachement) == cle:
                raise _Ligne(numero, "Une structure ne peut pas se rattacher à elle-même.")
            if actuelle is None:
                mouvements.append({"action": "creer", "nom": nom, "pole": pole, "niveau": niveau, "rattachement": rattachement})
            else:
                changement = {}
                if pole and _norm(actuelle.pole.nom) != _norm(pole) and _norm(actuelle.pole.code) != _norm(pole):
                    changement["pole"] = pole
                if niveau and niveau != actuelle.niveau:
                    changement["niveau"] = niveau
                if rattachement and (actuelle.parent_id is None or _norm(actuelle.parent.nom) != _norm(rattachement)):
                    changement["rattachement"] = rattachement
                if changement:
                    mouvements.append({"action": "modifier", "item": actuelle, "champs": changement})
        except _Ligne as exc:
            erreurs.append(_erreur("Structures", exc))
    return mouvements, erreurs


def _niveau_saisi(valeur, numero: int) -> str:
    cle = _norm(str(valeur))
    niveaux = {
        "ministere": "ministere",
        "direction generale": "direction-generale",
        "direction centrale": "direction-centrale",
        "direction": "direction-centrale",
        "sous direction": "sous-direction",
        "service": "service",
        "cellule": "direction-centrale",
    }
    if cle not in niveaux:
        raise _Ligne(numero, "Le niveau est ministère, direction générale, direction centrale, sous-direction ou service.")
    return niveaux[cle]


def _grades(lignes, connus, erreurs):
    par_code = {item.code.casefold(): item for item in connus}
    vus = set()
    mouvements = []
    for numero, valeurs in lignes:
        try:
            code = _obligatoire(valeurs.get("code"), "Le code du grade", numero).upper()
            if len(code) > 8 or not code.replace("-", "").isalnum():
                raise _Ligne(numero, "Indiquez un code de grade, par exemple A4.")
            if code.casefold() in vus:
                raise _Ligne(numero, f"Le grade « {code} » est déjà présent dans le classeur.")
            vus.add(code.casefold())
            actuel = par_code.get(code.casefold())
            categorie = _categorie(valeurs.get("categorie"), numero) if not _vide(valeurs.get("categorie")) else ""
            libelle = "" if _vide(valeurs.get("libelle")) else _texte(valeurs.get("libelle"))
            if len(libelle) > 320:
                raise _Ligne(numero, "La définition dépasse 320 caractères.")
            vigueur = _vigueur(valeurs.get("en_vigueur"), numero)
            if actuel is None:
                if not categorie:
                    raise _Ligne(numero, "La catégorie est obligatoire pour un nouveau grade.")
                if not libelle:
                    raise _Ligne(numero, "La définition est obligatoire pour un nouveau grade.")
                mouvements.append({"action": "creer", "code": code, "categorie": categorie, "libelle": libelle, "en_vigueur": True if vigueur is None else vigueur})
            else:
                changement = {}
                if categorie and categorie != actuel.categorie:
                    changement["categorie"] = categorie
                if libelle and libelle != actuel.libelle:
                    changement["libelle"] = libelle
                if vigueur is not None and vigueur != actuel.en_vigueur:
                    changement["en_vigueur"] = vigueur
                if changement:
                    mouvements.append({"action": "modifier", "item": actuel, "champs": changement})
        except _Ligne as exc:
            erreurs.append(_erreur("Grades", exc))
    return mouvements, erreurs


def _emplois(lignes, connus, grades, mouvements_grades, erreurs):
    par_nom = {_norm(item.libelle): item for item in connus}
    codes = {item.code.casefold() for item in grades}
    codes.update(item["code"].casefold() for item in mouvements_grades if item["action"] == "creer")
    vus = set()
    mouvements = []
    for numero, valeurs in lignes:
        try:
            libelle = _obligatoire(valeurs.get("libelle"), "Le nom de l'emploi", numero)
            if len(libelle) > 220:
                raise _Ligne(numero, "Le nom de l'emploi dépasse 220 caractères.")
            cle = _norm(libelle)
            if cle in vus:
                raise _Ligne(numero, f"L'emploi « {libelle} » est déjà présent dans le classeur.")
            vus.add(cle)
            actuel = par_nom.get(cle)
            famille = _famille(valeurs.get("famille"), numero) if not _vide(valeurs.get("famille")) else ""
            grade = _grade(valeurs.get("grade"), codes, numero) if not _vide(valeurs.get("grade")) else ""
            if actuel is None:
                if not famille:
                    raise _Ligne(numero, "La famille est obligatoire pour un nouvel emploi.")
                if not grade:
                    raise _Ligne(numero, "Le grade est obligatoire pour un nouvel emploi.")
                mouvements.append({"action": "creer", "libelle": libelle, "famille": famille, "grade": grade})
            else:
                changement = {}
                if famille and famille != actuel.famille:
                    changement["famille"] = famille
                if grade and grade.casefold() != actuel.grade.code.casefold():
                    changement["grade"] = grade
                if changement:
                    mouvements.append({"action": "modifier", "item": actuel, "champs": changement})
        except _Ligne as exc:
            erreurs.append(_erreur("Emplois", exc))
    return mouvements, erreurs


def _appliquer(poles, structures, grades, emplois) -> None:
    ordre = PoleMinisteriel.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0
    for nom in poles:
        ordre += 1
        PoleMinisteriel.objects.create(code=_code_libre(nom, PoleMinisteriel, "pole"), nom=nom, ordre=ordre)
    ordre = EntiteTutelle.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0
    crees = []
    for item in structures:
        if item["action"] == "creer":
            ordre += 1
            niveau = item["niveau"] or niveau_depuis_nom(item["nom"])
            cree = EntiteTutelle.objects.create(
                code=_code_libre(item["nom"], EntiteTutelle, "structure"),
                nom=item["nom"],
                pole=_pole_enregistre(item["pole"]),
                ordre=ordre,
                niveau=niveau,
            )
            crees.append((cree, item.get("rattachement") or ""))
        else:
            champs = item["champs"]
            if "pole" in champs:
                item["item"].pole = _pole_enregistre(champs["pole"])
                if item["item"].parent_id and item["item"].parent.pole_id != item["item"].pole_id:
                    item["item"].parent = None
            if "niveau" in champs:
                item["item"].niveau = champs["niveau"]
            if "rattachement" in champs:
                item["item"].parent = _structure_enregistree(champs["rattachement"])
            item["item"].save()
    for cree, rattachement in crees:
        if rattachement:
            cree.parent = _structure_enregistree(rattachement)
            _verifier_rattachement(cree)
            cree.save(update_fields=["parent"])
    for item in structures:
        if item["action"] == "modifier" and item["item"].parent_id:
            _verifier_rattachement(item["item"])
    ordre = GradeReferentiel.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0
    for item in grades:
        if item["action"] == "creer":
            ordre += 1
            GradeReferentiel.objects.create(ordre=ordre, code=item["code"], categorie=item["categorie"], libelle=item["libelle"], en_vigueur=item["en_vigueur"])
        else:
            for champ, valeur in item["champs"].items():
                setattr(item["item"], champ, valeur)
            item["item"].save(update_fields=list(item["champs"]))
    ordre = EmploiReferentiel.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0
    for item in emplois:
        if item["action"] == "creer":
            ordre += 1
            grade = GradeReferentiel.objects.get(code__iexact=item["grade"])
            EmploiReferentiel.objects.create(
                code=_code_libre(item["libelle"], EmploiReferentiel, "emploi"),
                libelle=item["libelle"],
                famille=item["famille"],
                grade=grade,
                ordre=ordre,
            )
        else:
            if "grade" in item["champs"]:
                item["item"].grade = GradeReferentiel.objects.get(code__iexact=item["champs"].pop("grade"))
            for champ, valeur in item["champs"].items():
                setattr(item["item"], champ, valeur)
            item["item"].save()


def _resoudre_pole(texte: str, poles, nouveaux, numero: int) -> str:
    cle = _norm(texte)
    for item in poles:
        if _norm(item.nom) == cle or _norm(item.code) == cle:
            return item.nom
    for nom in nouveaux:
        if _norm(nom) == cle:
            return nom
    raise _Ligne(numero, f"Le pôle « {texte} » est inconnu. Utilisez son nom exact, ou ajoutez-le sur la feuille Pôles.")


def _pole_enregistre(nom: str) -> PoleMinisteriel:
    cle = _norm(nom)
    for item in PoleMinisteriel.objects.all():
        if _norm(item.nom) == cle or _norm(item.code) == cle:
            return item
    raise ImportInvalide(f"Le pôle « {nom} » est introuvable.")


def _structure_enregistree(nom: str) -> EntiteTutelle:
    cle = _norm(nom)
    for item in EntiteTutelle.objects.select_related("pole"):
        if _norm(item.nom) == cle or _norm(item.code) == cle:
            return item
    raise ImportInvalide(f"La structure de rattachement « {nom} » est introuvable.")


def _verifier_rattachement(item: EntiteTutelle) -> None:
    parent = item.parent
    if item.niveau == "ministere":
        if parent is not None:
            raise ImportInvalide(f"« {item.nom} » est le ministère : il est au sommet de la chaîne.")
        return
    if item.niveau == "direction-generale":
        if parent is None or parent.niveau != "ministere":
            raise ImportInvalide(f"« {item.nom} » se rattache au ministère.")
        return
    if parent is None:
        return
    if parent.pole_id != item.pole_id:
        raise ImportInvalide(f"« {item.nom} » et « {parent.nom} » n'appartiennent pas au même pôle.")
    if item.niveau == "direction-centrale" and parent.niveau != "direction-generale":
        raise ImportInvalide(f"« {item.nom} » se rattache à une direction générale.")
    if item.niveau == "sous-direction" and parent.niveau != "direction-centrale":
        raise ImportInvalide(f"« {item.nom} » se rattache à une direction centrale.")
    if item.niveau == "service" and parent.niveau not in {"sous-direction", "direction-centrale"}:
        raise ImportInvalide(f"« {item.nom} » se rattache à une sous-direction ou à une direction centrale.")


def _categorie(valeur, numero: int) -> str:
    texte = _norm(_texte(valeur)).removeprefix("categorie").strip().upper()
    if texte in {"A", "B", "C", "D"}:
        return texte
    raise _Ligne(numero, "La catégorie est A, B, C ou D.")


def _vigueur(valeur, numero: int) -> bool | None:
    if _vide(valeur):
        return None
    texte = _norm(_texte(valeur))
    if texte in OUI:
        return True
    if texte in NON:
        return False
    raise _Ligne(numero, "La colonne « En vigueur » attend oui ou non.")


def _famille(valeur, numero: int) -> str:
    cle = _norm(_texte(valeur))
    for code, libelle in FAMILLES:
        if _norm(code) == cle or _norm(libelle) == cle:
            return code
    raise _Ligne(numero, f"La famille « {valeur} » est inconnue. Utilisez le code ou le libellé de la feuille Familles.")


def _grade(valeur, codes: set[str], numero: int) -> str:
    texte = _texte(valeur).upper()
    if texte.casefold() not in codes:
        raise _Ligne(numero, f"Le grade « {_texte(valeur)} » est inconnu. Créez-le sur la feuille Grades ou utilisez un code existant.")
    return texte


def _obligatoire(valeur, libelle: str, numero: int) -> str:
    if _vide(valeur):
        raise _Ligne(numero, f"{libelle} est obligatoire.")
    return _texte(valeur)


def _cellule(ligne: list, position: int):
    if position >= len(ligne):
        return None
    return ligne[position]


def _erreur(feuille: str, exc: _Ligne) -> dict:
    return {"ligne": exc.ligne, "message": f"Feuille {feuille} — {exc.message}"}


def _resume(n: int) -> str:
    if n == 1:
        return "Le classeur n'a pas été importé : 1 ligne est incorrecte. Aucune modification n'a été enregistrée."
    return f"Le classeur n'a pas été importé : {n} lignes sont incorrectes. Aucune modification n'a été enregistrée."


def _crees(poles, structures, grades, emplois) -> int:
    return len(poles) + sum(item["action"] == "creer" for item in (*structures, *grades, *emplois))


def _maj(structures, grades, emplois) -> int:
    return sum(item["action"] == "modifier" for item in (*structures, *grades, *emplois))


def _bilan(poles, structures, grades, emplois) -> str:
    ajouts = [
        _compte(len(poles), "pôle ajouté", "pôles ajoutés"),
        _compte(sum(item["action"] == "creer" for item in structures), "structure ajoutée", "structures ajoutées"),
        _compte(sum(item["action"] == "creer" for item in grades), "grade ajouté", "grades ajoutés"),
        _compte(sum(item["action"] == "creer" for item in emplois), "emploi ajouté", "emplois ajoutés"),
    ]
    mises = [
        _compte(sum(item["action"] == "modifier" for item in structures), "structure mise à jour", "structures mises à jour"),
        _compte(sum(item["action"] == "modifier" for item in grades), "grade mis à jour", "grades mis à jour"),
        _compte(sum(item["action"] == "modifier" for item in emplois), "emploi mis à jour", "emplois mis à jour"),
    ]
    phrases = []
    ajouts = [item for item in ajouts if item]
    mises = [item for item in mises if item]
    if ajouts:
        phrases.append(_joindre(ajouts) + ".")
    if mises:
        phrases.append(_joindre(mises) + ".")
    return " ".join(phrases)


def _compte(n: int, un: str, plusieurs: str) -> str:
    if n == 0:
        return ""
    if n == 1:
        return f"1 {un}"
    return f"{n} {plusieurs}"


def _joindre(morceaux: list[str]) -> str:
    if len(morceaux) == 1:
        return morceaux[0]
    return f"{', '.join(morceaux[:-1])} et {morceaux[-1]}"


def _consignes() -> list[list]:
    return [
        ["Mode d'emploi"],
        ["Quatre feuilles sont lues : Pôles, Structures, Grades et Emplois. Les autres sont des aides."],
        ["Une ligne crée un élément. S'il existe déjà, les colonnes renseignées le mettent à jour."],
        ["Une cellule vide, sur une ligne déjà connue, conserve la valeur enregistrée."],
        ["Le pôle d'une structure se saisit par son nom exact ou son code. Un pôle nouveau se déclare sur la feuille Pôles."],
        ["Le niveau est direction générale, direction centrale, sous-direction ou service. Vide, il est déduit du nom. Une cellule prend le rang de direction centrale."],
        ["Le rattachement est la direction générale d'une direction centrale, la direction centrale d'une sous-direction, la sous-direction d'un service. Une direction générale n'en a pas."],
        ["La catégorie d'un grade est A, B, C ou D. En vigueur : oui ou non."],
        ["La famille d'un emploi se saisit par son code ou son libellé (feuille Familles)."],
        ["Le grade d'un emploi est son code, par exemple A4. Il peut être créé dans le même classeur."],
        ["Ne renommez pas les en-têtes et n'ajoutez pas de colonne."],
        ["Si une ligne est incorrecte, aucune modification n'est enregistrée."],
        [],
        ["Feuille", "Colonne", "Exemple"],
        ["Pôles", "Nom", "Pôle de la transformation"],
        ["Structures", "Nom", "Cellule du suivi des réformes"],
        ["Structures", "Pôle", "DGPE"],
        ["Structures", "Niveau", "direction centrale"],
        ["Structures", "Rattachement", "Direction Générale du Portefeuille de l'État"],
        ["Grades", "Code", "Z9"],
        ["Grades", "Catégorie", "A"],
        ["Grades", "Définition", "Grade de conception réservé aux emplois contractuels."],
        ["Grades", "En vigueur", "oui"],
        ["Emplois", "Nom", "Chargé de la transformation"],
        ["Emplois", "Famille", "Administratif et juridique"],
        ["Emplois", "Grade", "A4"],
    ]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def modele_import(_request):
    contenu = modele()
    reponse = HttpResponse(contenu, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    reponse["Content-Disposition"] = 'attachment; filename="modele-structures.xlsx"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def importer_structures(request):
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez un classeur Excel (.xlsx)."}, status=400)
    if fichier.size > TAILLE_MAX:
        return Response({"detail": "Le classeur dépasse 5 Mo."}, status=400)
    try:
        return Response(importer(fichier.read()))
    except ImportInvalide as exc:
        corps = {"detail": exc.message}
        if exc.erreurs:
            corps["erreurs"] = exc.erreurs
        return Response(corps, status=400)
