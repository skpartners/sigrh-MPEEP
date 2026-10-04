"""Import groupé des communications officielles."""

import zipfile
from datetime import date
from xml.etree import ElementTree

from django.contrib.auth.models import User
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .communication import ETAPE_DRH, NATURES, PERIMETRES, URGENCES
from .communications import _interdit
from .import_agents import ImportInvalide, _date, _jusqu_a_entete, _lire_feuille, _norm, _texte, _vide, _Valeur
from .models import Publication
from .classeur import habiller

TAILLE_MAX = 5 * 1024 * 1024
LIGNES_MAX = 500
OUI = {"oui", "o", "yes", "vrai", "true", "1", "x"}
NON = {"non", "n", "no", "faux", "false", "0"}
COLONNES = (
    ("intitule", "Intitulé", ("titre",)),
    ("corps", "Corps", ("texte",)),
    ("nature", "Nature", ()),
    ("urgence", "Urgence", ()),
    ("perimetre", "Destinataires", ("perimetre", "périmètre")),
    ("accuse", "Accusé de lecture", ("accuse",)),
    ("echeance", "Échéance", ("echeance",)),
    ("soumettre", "Soumettre", ("visa",)),
)


def modele() -> bytes:
    return habiller([
        {
            "nom": "Communications",
            "titre": "SIGRH  ·  Communications officielles",
            "sous_titre": "Une ligne par note, circulaire ou communiqué.",
            "notice": "L'intitulé identifie la communication. Soumettre à oui la transmet au visa du DRH.",
            "lignes": [[titre for _champ, titre, _alias in COLONNES]],
            "saisies": 16,
        },
        {
            "nom": "Consignes",
            "titre": "Mode d'emploi",
            "sous_titre": "Seule la feuille Communications est importée.",
            "notice": "Si une ligne est incorrecte, aucune modification n'est enregistrée.",
            "lignes": _consignes()[_consignes().index(["Colonne", "Exemple"]):],
            "onglet": "FF0B1C30",
        },
        {
            "nom": "Listes",
            "titre": "Codes admis",
            "sous_titre": "Aide à la saisie. Cette feuille n'est pas importée.",
            "notice": "Nature, urgence et destinataires : recopiez le code ou le libellé.",
            "lignes": _listes(),
            "onglet": "FF9E4300",
        },
    ])


def importer(contenu: bytes, user: User) -> dict:
    if len(contenu) > TAILLE_MAX:
        raise ImportInvalide("Le classeur dépasse 5 Mo.")
    try:
        lignes = _feuille(contenu)
    except (zipfile.BadZipFile, ElementTree.ParseError, KeyError, ValueError) as exc:
        raise ImportInvalide("Ce fichier n'est pas un classeur Excel .xlsx lisible.") from exc
    if len(lignes) > LIGNES_MAX:
        raise ImportInvalide(f"Le classeur dépasse {LIGNES_MAX} communications. Découpez l'import.")
    if not lignes:
        raise ImportInvalide("Le classeur ne contient aucune communication à enregistrer.")

    connus: dict[str, list[Publication]] = {}
    for item in Publication.objects.all():
        connus.setdefault(_norm(item.intitule), []).append(item)

    erreurs: list[dict] = []
    plans = []
    vus: set[str] = set()
    for numero, valeurs in lignes:
        try:
            plans.append(_preparer(numero, valeurs, connus, vus))
        except _Ligne as exc:
            erreurs.append({"ligne": exc.ligne, "message": exc.message})
    if erreurs:
        raise ImportInvalide(_resume(len(erreurs)), erreurs)

    plans = [plan for plan in plans if plan is not None]
    if not plans:
        return {"detail": "Ces communications sont déjà enregistrées.", "crees": 0, "mis_a_jour": 0}

    with transaction.atomic():
        crees, maj = _appliquer(plans, user)
    return {"detail": _bilan(crees, maj), "crees": crees, "mis_a_jour": maj}


class _Ligne(Exception):
    def __init__(self, ligne: int, message: str) -> None:
        self.ligne = ligne
        self.message = message


def _feuille(contenu: bytes) -> list[tuple[int, dict]]:
    cles = {_norm(titre) for _champ, titre, alias in COLONNES for titre in (titre, *alias)}
    lignes = _jusqu_a_entete(_lire_feuille(contenu, "Communications", absente=True), cles)
    if not lignes:
        raise ImportInvalide("La feuille Communications est absente. Téléchargez le modèle.")
    index = _index(lignes[0][1])
    pret = []
    for numero, ligne in lignes[1:]:
        valeurs = {champ: _cellule(ligne, position) for champ, position in index.items()}
        if all(_vide(valeur) for valeur in valeurs.values()):
            continue
        pret.append((numero, valeurs))
    return pret


def _index(entete: list) -> dict[str, int]:
    attendus = {}
    for champ, titre, alias in COLONNES:
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
            raise ImportInvalide(f"La colonne « {cellule} » est en double.")
        index[champ] = position
    if inconnues:
        noms = ", ".join(f"« {nom} »" for nom in inconnues)
        raise ImportInvalide(f"Colonne inconnue : {noms}. Téléchargez le modèle et conservez les en-têtes.")
    if "intitule" not in index:
        raise ImportInvalide("La colonne « Intitulé » est absente. Téléchargez le modèle.")
    return index


def _preparer(numero: int, valeurs: dict, connus: dict, vus: set[str]):
    intitule = _obligatoire(valeurs.get("intitule"), "L'intitulé", numero)
    if len(intitule) > 240:
        raise _Ligne(numero, "L'intitulé dépasse 240 caractères.")
    cle = _norm(intitule)
    if cle in vus:
        raise _Ligne(numero, f"L'intitulé « {intitule} » est déjà présent dans le classeur.")
    vus.add(cle)
    trouves = connus.get(cle, [])
    if len(trouves) > 1:
        raise _Ligne(numero, f"Plusieurs communications portent l'intitulé « {intitule} ».")
    actuel = trouves[0] if trouves else None
    if actuel is not None and actuel.statut != Publication.Statut.BROUILLON:
        raise _Ligne(numero, f"« {intitule} » est déjà transmise ou diffusée. Elle ne peut pas être réimportée.")

    corps = "" if _vide(valeurs.get("corps")) else _texte(valeurs.get("corps"))
    nature = _choix(valeurs.get("nature"), NATURES, "La nature", numero)
    urgence = _choix(valeurs.get("urgence"), URGENCES, "L'urgence", numero)
    perimetre = _choix(valeurs.get("perimetre"), PERIMETRES, "Les destinataires", numero)
    accuse = _booleen(valeurs.get("accuse"), "Accusé de lecture", numero)
    echeance = _echeance(valeurs.get("echeance"), numero)
    soumettre = _booleen(valeurs.get("soumettre"), "Soumettre", numero)

    if actuel is None:
        if not corps:
            raise _Ligne(numero, "Le corps du texte est obligatoire.")
        if not nature:
            raise _Ligne(numero, "La nature est obligatoire.")
        if not urgence:
            raise _Ligne(numero, "L'urgence est obligatoire.")
        if not perimetre:
            raise _Ligne(numero, "Les destinataires sont obligatoires.")
        return {
            "action": "creer",
            "intitule": intitule,
            "corps": corps,
            "nature": nature,
            "urgence": urgence,
            "perimetre": perimetre,
            "accuse": True if accuse is None else accuse,
            "echeance": echeance,
            "soumettre": bool(soumettre),
        }

    champs = {}
    if corps and corps != actuel.corps:
        champs["corps"] = corps
    if nature and nature != actuel.nature:
        champs["nature"] = nature
    if urgence and urgence != actuel.urgence:
        champs["urgence"] = urgence
    if perimetre and perimetre != actuel.perimetre:
        champs["perimetre"] = perimetre
    if accuse is not None and accuse != actuel.accuse:
        champs["accuse"] = accuse
    if echeance is not None and echeance != actuel.echeance:
        champs["echeance"] = echeance
    if soumettre and actuel.statut == Publication.Statut.BROUILLON:
        champs["soumettre"] = True
    if not champs:
        return None
    return {"action": "modifier", "item": actuel, "champs": champs}


def _appliquer(plans: list[dict], user: User) -> tuple[int, int]:
    crees = maj = 0
    reserve: set[str] = set()
    signataire = user.get_full_name() or user.username
    for plan in plans:
        if plan["action"] == "creer":
            soumis = plan.pop("soumettre")
            plan.pop("action")
            Publication.objects.create(
                reference=_reference(reserve),
                statut=Publication.Statut.VISA if soumis else Publication.Statut.BROUILLON,
                etape_visa=ETAPE_DRH if soumis else "",
                signataire=signataire,
                auteur=user,
                **plan,
            )
            crees += 1
            continue
        soumis = plan["champs"].pop("soumettre", False)
        item = plan["item"]
        for champ, valeur in plan["champs"].items():
            setattr(item, champ, valeur)
        if soumis:
            item.statut = Publication.Statut.VISA
            item.etape_visa = ETAPE_DRH
        item.save()
        maj += 1
    return crees, maj


def _reference(reserve: set[str]) -> str:
    annee = timezone.localdate().year
    prefixe = f"REF/MPEEP/DRH/{annee}-COM-"
    prises = set(Publication.objects.filter(reference__startswith=prefixe).values_list("reference", flat=True))
    nombre = 1
    while True:
        reference = f"{prefixe}{nombre:03d}"
        if reference not in prises and reference not in reserve:
            reserve.add(reference)
            return reference
        nombre += 1


def _choix(valeur, table: dict, libelle: str, numero: int) -> str:
    if _vide(valeur):
        return ""
    cle = _norm(_texte(valeur))
    for code, label in table.items():
        if _norm(code) == cle or _norm(str(label)) == cle:
            return code
    raise _Ligne(numero, f"{libelle} « {_texte(valeur)} » est inconnue. Utilisez un code ou un libellé de la feuille Listes.")


def _booleen(valeur, libelle: str, numero: int) -> bool | None:
    if _vide(valeur):
        return None
    texte = _norm(_texte(valeur))
    if texte in OUI:
        return True
    if texte in NON:
        return False
    raise _Ligne(numero, f"La colonne « {libelle} » attend oui ou non.")


def _echeance(valeur, numero: int) -> date | None:
    if _vide(valeur):
        return None
    try:
        return date.fromisoformat(_date(valeur, "date d'échéance"))
    except _Valeur as exc:
        raise _Ligne(numero, exc.message) from exc


def _obligatoire(valeur, libelle: str, numero: int) -> str:
    if _vide(valeur):
        raise _Ligne(numero, f"{libelle} est obligatoire.")
    return _texte(valeur)


def _cellule(ligne: list, position: int):
    if position >= len(ligne):
        return None
    return ligne[position]


def _resume(n: int) -> str:
    if n == 1:
        return "Le classeur n'a pas été importé : 1 ligne est incorrecte. Aucune modification n'a été enregistrée."
    return f"Le classeur n'a pas été importé : {n} lignes sont incorrectes. Aucune modification n'a été enregistrée."


def _bilan(crees: int, maj: int) -> str:
    morceaux = []
    if crees == 1:
        morceaux.append("1 communication ajoutée")
    elif crees:
        morceaux.append(f"{crees} communications ajoutées")
    if maj == 1:
        morceaux.append("1 communication mise à jour")
    elif maj:
        morceaux.append(f"{maj} communications mises à jour")
    return f"{' et '.join(morceaux)}."


def _listes() -> list[list]:
    lignes = [["Liste", "Code", "Libellé"]]
    for code, libelle in NATURES.items():
        lignes.append(["Nature", code, str(libelle)])
    for code, libelle in URGENCES.items():
        lignes.append(["Urgence", code, str(libelle)])
    for code, libelle in PERIMETRES.items():
        lignes.append(["Destinataires", code, str(libelle)])
    return lignes


def _consignes() -> list[list]:
    return [
        ["Mode d'emploi"],
        ["Renseignez la feuille Communications : une ligne par communication."],
        ["L'intitulé identifie la communication. S'il existe déjà en brouillon, les colonnes remplies le mettent à jour."],
        ["Une communication déjà transmise au visa ou diffusée ne peut pas être réimportée."],
        ["Une cellule vide, sur un brouillon déjà connu, conserve la valeur enregistrée."],
        ["Nature, urgence et destinataires : utilisez le code ou le libellé de la feuille Listes."],
        ["Accusé de lecture et Soumettre : oui ou non. Vide signifie oui pour l'accusé, et non pour la soumission."],
        ["Soumettre à oui transmet la communication au visa du DRH. Non, ou vide, la laisse en brouillon."],
        ["L'échéance s'écrit AAAA-MM-JJ ou JJ/MM/AAAA."],
        ["Ne renommez pas les en-têtes et n'ajoutez pas de colonne."],
        ["Si une ligne est incorrecte, aucune modification n'est enregistrée."],
        [],
        ["Colonne", "Exemple"],
        ["Intitulé", "Horaires d'ouverture du secrétariat pendant le mois d'octobre"],
        ["Corps", "Le secrétariat reçoit les agents du lundi au vendredi, de 7 h 30 à 16 h 30."],
        ["Nature", "Note de service"],
        ["Urgence", "Important"],
        ["Destinataires", "Ensemble des agents du portefeuille"],
        ["Accusé de lecture", "oui"],
        ["Échéance", "2026-10-31"],
        ["Soumettre", "non"],
    ]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def modele_import(request):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    contenu = modele()
    reponse = HttpResponse(contenu, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    reponse["Content-Disposition"] = 'attachment; filename="modele-communications.xlsx"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def importer_communications(request):
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez un classeur Excel (.xlsx)."}, status=400)
    if fichier.size > TAILLE_MAX:
        return Response({"detail": "Le classeur dépasse 5 Mo."}, status=400)
    try:
        return Response(importer(fichier.read(), request.user))
    except ImportInvalide as exc:
        corps = {"detail": exc.message}
        if exc.erreurs:
            corps["erreurs"] = exc.erreurs
        return Response(corps, status=400)
