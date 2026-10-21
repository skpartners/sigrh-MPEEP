"""Convertit Base_personnel_MPEEP.xlsx vers les classeurs d'import du système, puis charge (ou valide à blanc).

Ce script s'exécute dans le shell Django, depuis le dossier api/ ; la méthode complète est dans docs/IMPORT_PERSONNEL.md.

    # PowerShell
    $env:BASE_PERSONNEL = "C:\\chemin\\Base_personnel_MPEEP.xlsx"
    uv run python manage.py shell -c "MODE='apercu'; exec(open('../scripts/import_personnel/convertir_base_personnel.py', encoding='utf-8').read())"

MODE = "apercu" (défaut) : lit le fichier et affiche le bilan, sans toucher à la base ;
MODE = "essai"           : charge pour de vrai dans une transaction, puis annule tout ;
MODE = "reel"            : charge et enregistre (remplace les données de démonstration, une seule fois).
"""
import os
import re
import sys
from pathlib import Path
from collections import Counter, defaultdict
from datetime import date, timedelta

DOSSIER = Path(os.environ.get("SIGRH_IMPORT_DOSSIER") or Path.cwd().parent / "scripts" / "import_personnel")
sys.path.insert(0, str(DOSSIER))
from lire_xlsx import lire  # noqa: E402

from django.contrib.auth.models import User  # noqa: E402
from django.db import transaction  # noqa: E402

from personnel import import_effectif, import_structures  # noqa: E402
from personnel.classeur import habiller  # noqa: E402
from personnel.import_agents import _norm  # noqa: E402
from personnel.normalisation import nom_structure  # noqa: E402
from personnel.models import Agent, Diplome, EmploiReferentiel, EntiteTutelle, GradeReferentiel, PoleMinisteriel  # noqa: E402

FICHIER = os.environ.get("BASE_PERSONNEL", "")
if not FICHIER or not os.path.exists(FICHIER):
    raise SystemExit("Indiquez le classeur du personnel dans la variable d'environnement BASE_PERSONNEL.")
MODE = globals().get("MODE", "apercu")
# Compte d'administration technique conservé par le chargement (celui qui ouvre la connexion).
ADMIN = os.environ.get("SIGRH_ADMIN", "491160T")
n = lambda s: " ".join((s or "").split())  # noqa: E731

# Familles d'emplois du fichier → familles du système.
FAMILLE = {
    "emplois a caractere administratif, juridique et diplomatique": "administratif",
    "emplois de gestion economique et financiere": "financier",
    "emplois scientifiques et techniques": "scientifique",
    "emplois de production litteraire et artistique": "culturel",
    "emplois de l'education et de la formation": "education",
    "emplois des affaires sociales": "social",
}
# Structures de rang supérieur du fichier → structure existante du système.
ALIAS = {"dgpe": "Direction Générale du Portefeuille de l'État", "cabinet": "Cabinet", "dgepn": "DGPN"}
POLE_PAR_K = {"dgpe": "DGPE", "cabinet": "Cabinet", "dgepn": "DGPN"}
POLE_DEFAUT = "Administration générale"
DIPLOME = [("doctorat", "doctorat"), ("bac+5", "master"), ("bac+4", "master"), ("ingenieur", "master"), ("master", "master"),
           ("bac+3", "licence"), ("licence", "licence"), ("bac+2", "bac"), ("bac", "bac"), ("bepc", "bepc"), ("cepe", "cepe")]


def serie(valeur):
    try:
        return date(1899, 12, 30) + timedelta(days=int(float(valeur)))
    except (TypeError, ValueError):
        return None


def scinder(complet: str) -> tuple[str, str]:
    mots = n(complet).split()
    if "NEE" in [m.upper() for m in mots][1:-1]:
        i = [m.upper() for m in mots].index("NEE", 1)
        nom, reste = " ".join(mots[: i + 2]), mots[i + 2:]
    else:
        nom, reste = mots[0], mots[1:]
    prenoms = " ".join(reste).title() if reste else nom.title()
    return nom, prenoms


# --- Lecture -----------------------------------------------------------------------------------------
brut = [r for r in lire(FICHIER)["base"][1:] if r.get("A") and n(r["A"])]
vus, lignes, doublons = {}, [], []
for r in brut:
    mle = n(r["A"])
    if mle.casefold() in vus:  # même personne saisie deux fois : on garde la graphie la plus complète
        ancien = lignes[vus[mle.casefold()]]
        doublons.append((mle, ancien["B"], r["B"]))
        if len(n(r["B"])) > len(n(ancien["B"])):
            lignes[vus[mle.casefold()]] = r
        continue
    vus[mle.casefold()] = len(lignes)
    lignes.append(r)

# --- Structures --------------------------------------------------------------------------------------
connues = {_norm(e.nom): e for e in EntiteTutelle.objects.exclude(niveau="ministere").select_related("pole")}
poles_connus = {_norm(p.nom): p for p in PoleMinisteriel.objects.all()}
definies: dict[str, dict] = {}  # nom normalisé → définition à créer


def alias(nom: str) -> str:
    return ALIAS.get(n(nom).casefold()) or nom_structure(n(nom))  # même graphie que la base normalisée


def nom_de_rang(r) -> str:
    return alias(n(r.get("K")))


LIBELLE_NIVEAU = {"direction-generale": "Direction générale", "direction-centrale": "Direction centrale", "sous-direction": "Sous-direction", "service": "Service"}
CODE_NIVEAU = {v: k for k, v in LIBELLE_NIVEAU.items()}


def niveau_code(nom: str) -> str:
    cle = _norm(nom)
    if cle in connues:
        return connues[cle].niveau
    return CODE_NIVEAU[definies[cle]["niveau"]] if cle in definies else ""


def pole_de(nom: str, defaut: str) -> str:
    cle = _norm(nom)
    if cle in connues:
        return connues[cle].pole.nom
    return definies[cle]["pole"] if cle in definies else defaut


def definir(nom: str, souhaite: str, parent: str, pole: str) -> str:
    """Crée la structure sous son parent en respectant les règles de la hiérarchie ; retourne celle où se rattacher."""
    cle = _norm(nom)
    if cle in connues or cle in definies:
        return nom
    rang = niveau_code(parent) if parent else ""
    if rang == "service":
        return parent  # rien ne se rattache à un service : l'agent reste dans ce service
    niveau = {"": "Direction centrale", "direction-generale": "Direction centrale", "direction-centrale": "Sous-direction" if souhaite != "Service" else "Service",
              "sous-direction": "Service"}[rang]
    definies[cle] = {"nom": nom, "niveau": niveau, "parent": parent, "pole": pole_de(parent, pole) if parent else pole}
    return nom


affectation: dict[str, str] = {}
for r in lignes:
    k = n(r.get("K")).casefold()
    pole = POLE_PAR_K.get(k, POLE_DEFAUT)
    racine = alias(n(r.get("K")))
    if k not in ALIAS:
        definir(racine, "Direction centrale", "", pole)
    parent = racine
    for colonne, souhaite in (("L", "Direction centrale"), ("M", "Sous-direction"), ("N", "Service")):
        nom = alias(n(r.get(colonne)))
        if not nom or _norm(nom) == _norm(parent):  # absent, ou même nom que son parent : un seul niveau
            continue
        parent = definir(nom, souhaite, parent, pole)
    affectation[n(r["A"])] = parent

# --- Emplois -----------------------------------------------------------------------------------------
grades_connus = {g.code.casefold() for g in GradeReferentiel.objects.all()}
emplois_connus = {_norm(e.libelle) for e in EmploiReferentiel.objects.all()}
canon: dict[str, str] = {}  # un emploi n'a qu'une graphie, même si le fichier l'écrit de plusieurs façons
for r in lignes:
    if n(r.get("D")):
        canon.setdefault(_norm(n(r["D"])), n(r["D"]))
for r in lignes:
    if n(r.get("D")):
        r["D"] = canon[_norm(n(r["D"]))]
par_emploi = defaultdict(Counter)
famille_emploi: dict[str, str] = {}
for r in lignes:
    d = n(r.get("D"))
    if not d:
        continue
    g = n(r.get("G"))
    if g.casefold() in grades_connus:
        par_emploi[d][g.upper()] += 1
    famille_emploi.setdefault(d, FAMILLE.get(_norm(n(r.get("E"))), ""))
emplois_crees = {d: (famille_emploi[d], c.most_common(1)[0][0]) for d, c in par_emploi.items() if famille_emploi.get(d) and _norm(d) not in emplois_connus}
emplois_valides = {d for d in par_emploi if famille_emploi.get(d)} | {d for d in famille_emploi if _norm(d) in emplois_connus}

# --- Classeurs ---------------------------------------------------------------------------------------
poles_a_creer = sorted({s["pole"] for s in definies.values() if _norm(s["pole"]) not in poles_connus})
ordre_niveau = {"Direction centrale": 0, "Sous-direction": 1, "Service": 2}

structures_lignes = [["Nom", "Pôle", "Niveau", "Rattachement"]]
for s in sorted(definies.values(), key=lambda s: (ordre_niveau[s["niveau"]], s["nom"])):
    structures_lignes.append([s["nom"], s["pole"], s["niveau"], s["parent"]])
emplois_lignes = [["Nom", "Famille", "Grade"]] + [[d, fam, gr] for d, (fam, gr) in sorted(emplois_crees.items())]
classeur_structures = habiller([
    {"nom": "Pôles", "titre": "Pôles", "sous_titre": "", "notice": "", "lignes": [["Nom"]] + [[p] for p in poles_a_creer], "saisies": 1},
    {"nom": "Structures", "titre": "Structures", "sous_titre": "", "notice": "", "lignes": structures_lignes, "saisies": 1},
    {"nom": "Grades", "titre": "Grades", "sous_titre": "", "notice": "", "lignes": [["Code", "Catégorie", "Définition"]], "saisies": 1},
    {"nom": "Emplois", "titre": "Emplois", "sous_titre": "", "notice": "", "lignes": emplois_lignes, "saisies": 1},
])

entetes = [titre for _c, titre, *_r in import_effectif.COLONNES]
agents_lignes = [entetes]
for r in lignes:
    mle = n(r["A"])
    nom, prenoms = scinder(r["B"])
    naissance = serie(r.get("W"))
    emploi = n(r.get("D"))
    grade = n(r.get("G"))
    corps = n(r.get("F"))
    statut = "Contractuel" if n(r.get("P")).upper().startswith("CONTRAC") else "Fonctionnaire"
    entree = serie(r.get("T"))
    agents_lignes.append([
        mle, nom, prenoms, "F" if n(r.get("C")).upper() == "F" else "H", naissance.isoformat() if naissance else "", n(r.get("X")),
        "", "", "", affectation[mle], emploi if emploi in emplois_valides else "",
        grade if grade.casefold() in grades_connus else "", "", "" if corps.upper() == "NC" else corps, n(r.get("I")), statut,
        n(r.get("Y")) or n(r.get("Q")), "", entree.isoformat() if entree else "", "", "", "",
    ])
classeur_agents = habiller([{"nom": "Agents", "titre": "Agents", "sous_titre": "", "notice": "", "lignes": agents_lignes, "saisies": 1}])


def charger() -> dict:
    admin = User.objects.get(username=ADMIN)
    rapport = {}
    # Rien à créer (structures et emplois déjà en base) : le classeur de structures serait vide, et refusé.
    if definies or poles_a_creer or emplois_crees:
        rapport["structures"] = import_structures.importer(classeur_structures)
    else:
        rapport["structures"] = "rien à créer"
    rapport["agents"] = import_effectif.importer(classeur_agents, admin, remplacer=True)
    # Compléments que le classeur d'import ne porte pas : prise de service dans l'emploi, diplômes, emploi hors référentiel.
    par_mle = {n(r["A"]).casefold(): r for r in lignes}
    diplomes = 0
    for agent in Agent.objects.all():
        r = par_mle.get(agent.matricule.casefold())
        if r is None:
            continue
        champs = []
        ps = serie(r.get("U"))
        if ps:
            agent.prise_service_emploi = ps
            champs.append("prise_service_emploi")
        if not agent.emploi and n(r.get("D")):
            agent.corps = (agent.corps + " · " if agent.corps else "") + n(r["D"])
            champs.append("corps")
        if champs:
            agent.save(update_fields=champs)
        libelle = n(r.get("R"))
        niveau = next((code for mot, code in DIPLOME if mot in _norm(libelle)), "")
        if libelle and niveau:
            Diplome.objects.create(agent=agent, niveau_etude=niveau, libelle=libelle[:240], domaine_formation=n(r.get("S"))[:160])
            diplomes += 1
            agent.niveau_etude, agent.libelle_diplome, agent.domaine_formation = niveau, libelle[:240], n(r.get("S"))[:160]
            agent.save(update_fields=["niveau_etude", "libelle_diplome", "domaine_formation"])
    rapport["diplomes"] = diplomes
    return rapport


print("agents lus:", len(brut), "| à charger:", len(lignes), "| doublons fusionnés:", doublons)
print("pôles à créer:", poles_a_creer, "| structures à créer:", len(definies), Counter(s["niveau"] for s in definies.values()))
print("emplois à créer:", len(emplois_crees), "| emplois sans grade ni famille (portés par 'corps'):", len({n(r.get('D')) for r in lignes if n(r.get('D')) and n(r.get('D')) not in emplois_valides}))
print("noms: exemples", [scinder(r["B"]) for r in lignes[:3]] + [scinder(r["B"]) for r in lignes if " NEE " in r["B"].upper()][:2])

if MODE in ("essai", "reel"):
    try:
        with transaction.atomic():
            rapport = charger()
            print("RAPPORT:", rapport)
            print("agents en base:", Agent.objects.count(), "| structures:", EntiteTutelle.objects.count(), "| comptes:", User.objects.count())
            if MODE == "essai":
                transaction.set_rollback(True)
                print("(essai : tout est annulé)")
    except Exception as exc:  # noqa: BLE001
        detail = getattr(exc, "erreurs", None) or getattr(exc, "args", exc)
        print("ÉCHEC:", type(exc).__name__, str(exc)[:300])
        for e in (getattr(exc, "details", None) or getattr(exc, "erreurs", None) or [])[:15]:
            print("  -", e)
