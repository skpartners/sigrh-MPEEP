"""Tableau de bord : les états du personnel du ministère, lus en direct dans les registres.

I. Caractéristiques socio-démographiques ; II. Sorties de carrière ; III. Autres états.
Chaque état se limite au périmètre de la personne connectée.
"""

from collections import defaultdict
from datetime import date

from django.contrib.auth.models import User  # noqa: F401  (typage)
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .effectifs import FAMILLES
from .fin_carriere import _anniversaire, age_statutaire
from .models import Agent, DossierRetraite, EmploiReferentiel, EntiteTutelle, Profil
from .rattachement import normaliser, structure_de, structures_par_nom
from .utilisateurs import perimetre_matricules

VIDE = "Non renseigné"
PERIODE_PAR_DEFAUT = (2024, 2030)
HORIZON_PROJECTION = 10
TRANCHES = (
    ("Moins de 25 ans", 0, 24),
    ("25 à 34 ans", 25, 34),
    ("35 à 44 ans", 35, 44),
    ("45 à 54 ans", 45, 54),
    ("55 à 59 ans", 55, 59),
    ("60 ans et plus", 60, 200),
)
FAMILLES_LIBELLES = dict(FAMILLES)


def _age(naissance: date, jour: date) -> int:
    return jour.year - naissance.year - ((jour.month, jour.day) < (naissance.month, naissance.day))


def _categorie(agent: Agent) -> str:
    for valeur in (agent.grade, agent.categorie):
        lettre = (valeur or "").strip()[:1].upper()
        if lettre in {"A", "B", "C", "D"}:
            return f"Catégorie {lettre}"
    return VIDE


def _ventiler(agents: list[Agent], cle) -> list[dict]:
    """Les effectifs par modalité, avec le genre."""
    cumul: dict[str, dict] = {}
    for agent in agents:
        libelle = cle(agent) or VIDE
        ligne = cumul.setdefault(libelle, {"libelle": libelle, "hommes": 0, "femmes": 0, "total": 0})
        ligne["femmes" if agent.sexe == "F" else "hommes"] += 1
        ligne["total"] += 1
    return sorted(cumul.values(), key=lambda ligne: (ligne["libelle"] == VIDE, -ligne["total"], ligne["libelle"]))


def _contexte(agents: list[Agent]):
    par_nom = structures_par_nom()
    structures = {a.matricule: structure_de(a, par_nom) for a in agents}
    familles = {normaliser(e.libelle): e.famille for e in EmploiReferentiel.objects.all()}
    return structures, familles


def _nom_structure(agent: Agent, structures: dict) -> str:
    entite = structures.get(agent.matricule)
    return entite.nom if entite else (agent.service or agent.sous_direction or agent.direction or agent.structure or VIDE)


def _famille(agent: Agent, familles: dict) -> str:
    code = familles.get(normaliser(agent.emploi)) if agent.emploi else None
    return FAMILLES_LIBELLES.get(code, code) if code else "Famille non classée"


def _socio_demographie(agents: list[Agent], structures: dict, familles: dict, jour: date) -> dict:
    def programme_de(agent: Agent) -> str:
        entite = structures.get(agent.matricule)
        return entite.pole.nom if entite else "Hors structures des paramètres"

    programmes: dict[str, list[Agent]] = defaultdict(list)
    for agent in agents:
        programmes[programme_de(agent)].append(agent)
    par_programme = []
    for programme, membres in sorted(programmes.items(), key=lambda item: (-len(item[1]), item[0])):
        total = _ventiler(membres, lambda a: programme)[0]
        par_programme.append({
            "programme": programme, "hommes": total["hommes"], "femmes": total["femmes"], "total": total["total"],
            "structures": _ventiler(membres, lambda a: _nom_structure(a, structures)),
        })

    def tranche(agent: Agent) -> str:
        if agent.date_naissance is None:
            return VIDE
        age = _age(agent.date_naissance, jour)
        return next((libelle for libelle, bas, haut in TRANCHES if bas <= age <= haut), VIDE)

    ordre_tranches = {libelle: i for i, (libelle, _b, _h) in enumerate(TRANCHES)}
    par_tranche = sorted(_ventiler(agents, tranche), key=lambda ligne: ordre_tranches.get(ligne["libelle"], 99))
    return {
        "total": len(agents),
        "hommes": sum(1 for a in agents if a.sexe != "F"),
        "femmes": sum(1 for a in agents if a.sexe == "F"),
        "par_programme": par_programme,
        "par_categorie": sorted(_ventiler(agents, _categorie), key=lambda ligne: ligne["libelle"]),
        "par_grade": sorted(_ventiler(agents, lambda a: a.grade), key=lambda ligne: (ligne["libelle"] == VIDE, ligne["libelle"])),
        "par_statut": _ventiler(agents, lambda a: a.type_agent),
        "par_famille": _ventiler(agents, lambda a: _famille(a, familles)),
        "par_tranche_age": par_tranche,
    }


def _date_limite(agent: Agent, dossier: DossierRetraite | None) -> tuple[date, int] | None:
    if agent.date_naissance is None:
        return None
    age = dossier.age_limite if dossier is not None else age_statutaire(agent)
    return _anniversaire(agent.date_naissance, age), age


def _sorties(agents: list[Agent], structures: dict, jour: date, debut: int, fin: int) -> dict:
    dossiers = {d.agent_id: d for d in DossierRetraite.objects.filter(agent__in=agents)}
    echeances = []
    for agent in agents:
        resultat = _date_limite(agent, dossiers.get(agent.id))
        if resultat is not None:
            echeances.append((agent, *resultat))

    projection = []
    deja = [e for e in echeances if e[1].year < jour.year]
    if deja:
        projection.append(_ligne_annee("Limite d'âge déjà atteinte", deja))
    for annee in range(jour.year, jour.year + HORIZON_PROJECTION + 1):
        projection.append(_ligne_annee(str(annee), [e for e in echeances if e[1].year == annee]))

    admis = sorted((e for e in echeances if debut <= e[1].year <= fin), key=lambda e: (e[1], e[0].nom))
    return {
        "projection": projection,
        "admis": {
            "debut": debut, "fin": fin,
            "par_annee": [{"annee": a, "total": sum(1 for e in admis if e[1].year == a)} for a in range(debut, fin + 1)],
            "agents": [
                {
                    "matricule": agent.matricule, "nom_complet": agent.nom_complet, "grade": agent.grade, "sexe": agent.sexe,
                    "structure": _nom_structure(agent, structures), "age_limite": age, "date_limite": limite.isoformat(),
                    "annee": limite.year,
                    "dossier": dossiers[agent.id].get_statut_display() if agent.id in dossiers else "Dossier non ouvert",
                    "atteinte": limite <= jour,
                }
                for agent, limite, age in admis
            ],
        },
    }


def _ligne_annee(libelle: str, echeances: list) -> dict:
    return {
        "libelle": libelle,
        "total": len(echeances),
        "hommes": sum(1 for e in echeances if e[0].sexe != "F"),
        "femmes": sum(1 for e in echeances if e[0].sexe == "F"),
        "cadres_a": sum(1 for e in echeances if (e[0].grade or "").startswith("A")),
    }


def _responsables(visibles: set[str] | None) -> dict:
    """Les agents qui occupent un poste de responsabilité, structure par structure."""
    par_structure: dict[int, dict] = {}
    for profil in Profil.objects.select_related("user", "structure__pole", "interim__pole").exclude(role="Agent"):
        if visibles is not None and profil.user.username not in visibles:
            continue
        for structure, interim in ((profil.structure, False), (profil.interim, True)):
            if structure is None or structure.niveau == EntiteTutelle.Niveau.MINISTERE:
                continue
            ligne = par_structure.setdefault(structure.id, {
                "structure": structure.nom, "niveau": structure.get_niveau_display(), "programme": structure.pole.nom, "responsables": [],
            })
            ligne["responsables"].append({
                "matricule": profil.user.username, "nom_complet": profil.user.get_full_name() or profil.user.username,
                "fonction": profil.fonction, "role": profil.role, "interim": interim,
            })
    lignes = sorted(par_structure.values(), key=lambda ligne: (ligne["programme"], ligne["structure"]))
    avec = len(lignes)
    total = EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).count()
    return {"structures": lignes, "structures_total": total, "structures_pourvues": avec, "agents": sum(len(l["responsables"]) for l in lignes)}


def _detail(agents: list[Agent], structures: dict, familles: dict) -> list[dict]:
    """Les agents par famille d'emploi, emploi, grade, genre et structure."""
    cumul: dict[tuple, int] = defaultdict(int)
    for agent in agents:
        cle = (_famille(agent, familles), agent.emploi or "Emploi non renseigné", agent.grade or VIDE, "Femme" if agent.sexe == "F" else "Homme", _nom_structure(agent, structures))
        cumul[cle] += 1
    return [
        {"famille": f, "emploi": e, "grade": g, "genre": genre, "structure": s, "effectif": n}
        for (f, e, g, genre, s), n in sorted(cumul.items(), key=lambda item: (item[0][0], item[0][1], item[0][2], item[0][4], item[0][3]))
    ]


def synthese(user, debut: int = PERIODE_PAR_DEFAUT[0], fin: int = PERIODE_PAR_DEFAUT[1]) -> dict:
    visibles = perimetre_matricules(user)
    agents = Agent.objects.select_related("organisme")
    if visibles is not None:
        agents = agents.filter(matricule__in=visibles)
    agents = list(agents)
    jour = timezone.localdate()
    structures, familles = _contexte(agents)
    return {
        "date": jour.isoformat(),
        "perimetre": visibles is not None,
        "socio_demographie": _socio_demographie(agents, structures, familles, jour),
        "sorties": _sorties(agents, structures, jour, debut, fin),
        "autres": {"responsables": _responsables(visibles), "detail": _detail(agents, structures, familles)},
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def etats_personnel(request):
    """États du personnel pour le tableau de bord ; la période des départs à la retraite se règle par `debut` et `fin`."""
    try:
        debut = int(request.query_params.get("debut") or PERIODE_PAR_DEFAUT[0])
        fin = int(request.query_params.get("fin") or PERIODE_PAR_DEFAUT[1])
    except ValueError:
        return Response({"detail": "La période est invalide."}, status=400)
    if not 1990 <= debut <= fin <= 2100 or fin - debut > 40:
        return Response({"detail": "La période est invalide : début et fin entre 1990 et 2100, quarante ans au plus."}, status=400)
    return Response(synthese(request.user, debut, fin))
