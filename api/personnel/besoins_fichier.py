"""Expression des besoins par fichier : le gestionnaire RH télécharge le modèle, le renseigne, puis le verse.

Le modèle est le classeur que la DRH adresse aux gestionnaires à l'ouverture de l'appel. Le versement est tout ou rien :
une seule ligne incorrecte et rien n'est enregistré ; les lignes à corriger sont listées.
"""

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .besoins import PLAFOND_AGENTS, _campagne, _ouverte, _structures_du_responsable
from .classeur import habiller
from .effectifs import _reference
from .import_agents import _lire_feuille, _norm
from .models import EmploiReferentiel, EntiteTutelle, FicheBesoin

TAILLE_MAX = 5 * 1024 * 1024
COLONNES = ("Structure", "Emploi", "Fonctionnaires", "Contractuels", "Motif")
LIGNES_A_RENSEIGNER = 40


def modele(structures: list[EntiteTutelle]) -> bytes:
    """Classeur à renseigner : les lignes portent déjà la structure du gestionnaire, qui n'a plus qu'à choisir l'emploi et les effectifs."""
    nom_structure = structures[0].nom if len(structures) == 1 else ""
    saisies = [[nom_structure, "", "", "", ""] for _ in range(LIGNES_A_RENSEIGNER)]
    emplois = [["Emploi", "Grade"]] + [[e.libelle, e.grade.code] for e in EmploiReferentiel.objects.select_related("grade").order_by("famille", "libelle")]
    consignes = [
        ["Colonne", "Obligatoire", "Description"],
        ["Structure", "Oui" if len(structures) != 1 else "Non", "Nom de la structure concernée. Déjà renseigné pour vous." if len(structures) == 1 else "Nom exact de la structure dont vous êtes gestionnaire RH."],
        ["Emploi", "Oui", "Nom exact de l'emploi, tel qu'il figure dans la feuille Emplois."],
        ["Fonctionnaires", "Non", f"Nombre de fonctionnaires demandés (de 0 à {PLAFOND_AGENTS})."],
        ["Contractuels", "Non", f"Nombre de contractuels demandés (de 0 à {PLAFOND_AGENTS}). Au moins un fonctionnaire ou un contractuel par ligne."],
        ["Motif", "Non", "Raison du besoin, en quelques mots (240 caractères au plus)."],
    ]
    return habiller([
        {
            "nom": "Besoins", "titre": "SIGRH  ·  Expression des besoins en agents",
            "sous_titre": "Une ligne par emploi demandé. Ne modifiez ni l'ordre ni les titres des colonnes.",
            "notice": "Choisissez l'emploi dans la feuille Emplois, indiquez les effectifs, puis versez ce fichier dans votre espace, onglet Besoins RH. Versé de nouveau, il corrige les besoins déjà exprimés pour le même emploi.",
            "lignes": [list(COLONNES)] + saisies, "saisies": 20,
        },
        {"nom": "Consignes", "titre": "Mode d'emploi", "sous_titre": "Expression des besoins", "notice": "Si une ligne est incorrecte, rien n'est enregistré et les lignes à corriger vous sont indiquées.", "lignes": consignes, "onglet": "FF0B1C30"},
        {"nom": "Emplois", "titre": "Emplois de la nomenclature", "sous_titre": "Recopiez le nom exact dans la colonne Emploi.", "notice": "Cette feuille n'est pas importée.", "lignes": emplois, "onglet": "FF9E4300"},
    ])


def _entier(valeur, libelle: str) -> int:
    if valeur in (None, ""):
        return 0
    try:
        nombre = float(str(valeur).replace(",", ".").strip())
    except ValueError:
        raise ValueError(f"{libelle} : indiquez un nombre.") from None
    if nombre != int(nombre) or not 0 <= nombre <= PLAFOND_AGENTS:
        raise ValueError(f"{libelle} : un nombre entier de 0 à {PLAFOND_AGENTS}.")
    return int(nombre)


def lire(contenu: bytes, structures: list[EntiteTutelle]) -> tuple[list[dict], list[dict]]:
    """Lignes valides et lignes en erreur du classeur versé."""
    try:
        lignes = _lire_feuille(contenu, "Besoins")
    except Exception:  # noqa: BLE001 - un fichier illisible n'est pas un classeur Excel
        return [], [{"ligne": 0, "message": "Ce fichier n'est pas un classeur Excel (.xlsx) lisible."}]
    cles = [_norm(titre) for titre in COLONNES]
    entete = next((index for index, (_n, cellules) in enumerate(lignes) if {"emploi", "fonctionnaires"} <= {_norm(str(c)) for c in cellules if c not in (None, "")}), None)
    if entete is None:
        return [], [{"ligne": 0, "message": "Les titres de colonnes du modèle sont introuvables : utilisez le modèle téléchargé dans votre espace."}]
    position = {_norm(str(c)): i for i, c in enumerate(lignes[entete][1]) if c not in (None, "")}
    manquantes = [titre for titre, cle in zip(COLONNES, cles) if cle not in position and titre != "Structure" and titre != "Motif"]
    if manquantes:
        return [], [{"ligne": lignes[entete][0], "message": f"Colonne absente : {', '.join(manquantes)}."}]

    par_nom = {_norm(s.nom): s for s in structures}
    emplois = {_norm(e.libelle): e for e in EmploiReferentiel.objects.select_related("grade")}
    emplois.update({_norm(e.code): e for e in EmploiReferentiel.objects.select_related("grade")})
    valides, erreurs, vus = [], [], set()
    for numero, cellules in lignes[entete + 1:]:
        def cellule(titre: str):
            indice = position.get(_norm(titre))
            return cellules[indice] if indice is not None and indice < len(cellules) else None

        if all(c in (None, "") for c in cellules):
            continue
        # Une ligne où seule la structure est préremplie n'est pas une ligne saisie.
        if all(cellule(t) in (None, "") for t in ("Emploi", "Fonctionnaires", "Contractuels", "Motif")):
            continue
        try:
            nom_structure = str(cellule("Structure") or "").strip()
            if nom_structure:
                structure = par_nom.get(_norm(nom_structure))
                if structure is None:
                    raise ValueError(f"La structure « {nom_structure} » n'est pas la vôtre.")
            elif len(structures) == 1:
                structure = structures[0]
            else:
                raise ValueError("Indiquez la structure concernée.")
            libelle_emploi = str(cellule("Emploi") or "").strip()
            if not libelle_emploi:
                raise ValueError("L'emploi est obligatoire.")
            emploi = emplois.get(_norm(libelle_emploi))
            if emploi is None:
                raise ValueError(f"L'emploi « {libelle_emploi} » n'est pas dans la nomenclature (feuille Emplois).")
            fonctionnaires = _entier(cellule("Fonctionnaires"), "Fonctionnaires")
            contractuels = _entier(cellule("Contractuels"), "Contractuels")
            if fonctionnaires + contractuels < 1:
                raise ValueError("Demandez au moins un fonctionnaire ou un contractuel.")
            if (structure.id, emploi.id) in vus:
                raise ValueError("Cet emploi figure déjà plus haut pour la même structure.")
            vus.add((structure.id, emploi.id))
        except ValueError as exc:
            erreurs.append({"ligne": numero, "message": str(exc)})
            continue
        valides.append({
            "entite": structure, "emploi": emploi, "profil": emploi.libelle[:200], "grade": emploi.grade.code[:40],
            "motif": " ".join(str(cellule("Motif") or "").split())[:240],
            "fonctionnaires": fonctionnaires, "contractuels": contractuels, "volume": fonctionnaires + contractuels,
        })
    if not valides and not erreurs:
        erreurs.append({"ligne": 0, "message": "Le classeur ne contient aucune ligne renseignée."})
    return valides, erreurs


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def modele_besoins(request):
    structures = _structures_du_responsable(request.user)
    if not structures:
        return Response({"detail": "Seul un gestionnaire RH exprime les besoins de sa structure."}, status=403)
    reponse = HttpResponse(modele(structures), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    reponse["Content-Disposition"] = 'attachment; filename="modele-expression-besoins.xlsx"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def verser_besoins(request):
    """Enregistre les besoins du classeur renseigné, tout ou rien ; un emploi déjà demandé est corrigé."""
    structures = _structures_du_responsable(request.user)
    if not structures:
        return Response({"detail": "Seul un gestionnaire RH exprime les besoins de sa structure."}, status=403)
    campagne = _campagne()
    refus = _ouverte(campagne)
    if refus:
        return refus
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez le classeur Excel renseigné (.xlsx)."}, status=400)
    if fichier.size > TAILLE_MAX:
        return Response({"detail": "Le classeur dépasse 5 Mo."}, status=400)
    valides, erreurs = lire(fichier.read(), structures)
    if erreurs:
        return Response({"detail": "Aucun besoin n'a été enregistré : corrigez les lignes indiquées.", "erreurs": erreurs}, status=400)
    creees = corrigees = 0
    with transaction.atomic():
        for valeurs in valides:
            existant = FicheBesoin.objects.filter(campagne=campagne, entite=valeurs["entite"], emploi=valeurs["emploi"]).first()
            if existant is not None:
                for cle, valeur in valeurs.items():
                    setattr(existant, cle, valeur)
                existant.auteur, existant.depose_le = request.user, timezone.now()
                existant.save()
                corrigees += 1
            else:
                FicheBesoin.objects.create(
                    reference=_reference("BES", FicheBesoin, campagne.exercice), campagne=campagne, auteur=request.user,
                    depose_le=timezone.now(), **valeurs,
                )
                creees += 1
    return Response({"creees": creees, "corrigees": corrigees}, status=201)
