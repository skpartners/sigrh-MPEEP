"""Rattachement des agents aux structures des paramètres, et périmètre de supervision qui en découle.

Un agent n'est pas relié à une structure par une clé : son service, sa sous-direction ou sa direction
(le plus précis d'abord) est rapproché du nom d'une structure des paramètres. Le responsable d'une structure
supervise les agents de cette structure et de toutes celles qu'elle contient. Il ne voit ni ses pairs, ni
les agents rattachés directement à son propre supérieur.
"""

import re
import unicodedata

from .models import Agent, EntiteTutelle
from .roles import ROLES_SIMPLES


def normaliser(texte: str) -> str:
    """Comparable d'un nom de structure : sans accents, sans parenthèses, apostrophes et casse unifiées."""
    texte = re.sub(r"\([^)]*\)", " ", texte or "").replace("’", "'")
    texte = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", texte.lower()).strip()


def structures_par_nom() -> dict:
    """Les structures des paramètres (hors ministère), indexées par nom normalisé."""
    par_nom: dict = {}
    for entite in EntiteTutelle.objects.exclude(niveau="ministere").select_related("pole", "parent"):
        par_nom.setdefault(normaliser(entite.nom), entite)
    return par_nom


def structure_de(agent: Agent, par_nom: dict):
    """La structure des paramètres de l'agent, ou None si son rattachement n'y figure pas."""
    return next(
        (par_nom[cle] for cle in (normaliser(v) for v in (agent.service, agent.sous_direction, agent.direction, agent.structure)) if cle in par_nom),
        None,
    )


def structures_sous(racines) -> set[int]:
    """Identifiants des structures données et de toutes celles qu'elles contiennent."""
    ids = {structure.id for structure in racines}
    front = list(ids)
    while front:
        enfants = [pk for pk in EntiteTutelle.objects.filter(parent_id__in=front).values_list("id", flat=True) if pk not in ids]
        ids.update(enfants)
        front = enfants
    return ids


def matricules_des_structures(ids: set[int]) -> set[str]:
    """Matricules des agents rattachés à l'une de ces structures, comptes ou non."""
    par_nom = structures_par_nom()
    return {agent.matricule for agent in Agent.objects.all() if (entite := structure_de(agent, par_nom)) is not None and entite.id in ids}


def seuils_effectifs(defaut: int) -> dict[int, tuple[int, bool]]:
    """Seuil de quorum de chaque structure : le sien, sinon celui de la structure qui la contient, sinon le défaut.

    Retourne `{id: (seuil, hérité)}`.
    """
    lignes = {e.id: (e.parent_id, e.quorum_presence_pourcent) for e in EntiteTutelle.objects.only("id", "parent_id", "quorum_presence_pourcent")}
    resultat: dict[int, tuple[int, bool]] = {}
    for identifiant, (_parent, propre) in lignes.items():
        if propre:
            resultat[identifiant] = (propre, False)
            continue
        courant, vus = lignes[identifiant][0], {identifiant}
        valeur = defaut
        while courant is not None and courant in lignes and courant not in vus:
            vus.add(courant)
            parent, propre_parent = lignes[courant]
            if propre_parent:
                valeur = propre_parent
                break
            courant = parent
        resultat[identifiant] = (valeur, True)
    return resultat


def structures_reglables(user) -> set[int] | None:
    """Structures dont l'utilisateur peut régler le quorum : None pour tout le ministère, sinon la sienne et celles qu'elle contient."""
    from .utilisateurs import perimetre_ids

    if perimetre_ids(user) is None:
        return None
    profil = getattr(user, "profil", None)
    racines = []
    if profil is not None:
        if profil.structure_id and profil.role not in ROLES_SIMPLES:
            racines.append(profil.structure)
        if profil.interim_id:
            racines.append(profil.interim)
    return structures_sous(racines) if racines else set()
