"""Droits de congé annuel au départ du suivi : jours dus par exercice, lus dans le classeur de la DAAF.

Le classeur compte une feuille par sous-direction ; chaque ligne d'agent porte le matricule, les jours dus
au titre de 2024 et de 2025 (« - » ou vide : aucun) et une observation (« EPUISE » : plus rien à prendre).
Le reliquat de l'agent devient le total des jours dus ; le plus ancien exercice se consomme en premier.
"""

import io
import re
import zipfile

from django.db import transaction

from .import_agents import _feuilles, _lire_feuille
from .models import Agent, DroitConge

MATRICULE = re.compile(r"^[0-9A-Z]{5,12}$")
COLONNE_MATRICULE = 1
COLONNES_ANNEES = {2024: 4, 2025: 5}


def _jours(valeur) -> int:
    """« - », vide ou texte : aucun jour ; sinon le nombre de jours (entier)."""
    if isinstance(valeur, (int, float)):
        return max(int(round(valeur)), 0)
    texte = str(valeur or "").strip().replace(",", ".")
    try:
        return max(int(round(float(texte))), 0)
    except ValueError:
        return 0


def lire(contenu: bytes) -> list[dict]:
    """Une entrée par matricule : jours dus par exercice, feuille d'origine et observation."""
    with zipfile.ZipFile(io.BytesIO(contenu)) as archive:
        titres = [titre for titre, _chemin in _feuilles(archive)]
    lignes: dict[str, dict] = {}
    for titre in titres:
        for _numero, cellules in _lire_feuille(contenu, titre):
            matricule = str(cellules[COLONNE_MATRICULE]).strip().upper() if len(cellules) > COLONNE_MATRICULE and cellules[COLONNE_MATRICULE] else ""
            if not MATRICULE.match(matricule) or not any(chiffre.isdigit() for chiffre in matricule):
                continue
            droits = {annee: _jours(cellules[colonne]) if len(cellules) > colonne else 0 for annee, colonne in COLONNES_ANNEES.items()}
            observation = str(cellules[7]).strip() if len(cellules) > 7 and cellules[7] else ""
            lignes[matricule] = {"matricule": matricule, "nom": str(cellules[2] or "").strip() if len(cellules) > 2 else "", "feuille": titre, "droits": droits, "observation": observation}
    return list(lignes.values())


def appliquer(lignes: list[dict], *, ecrire: bool) -> dict:
    """Rapproche les lignes des agents par matricule ; en mode simulation, rien n'est écrit."""
    agents = {agent.matricule.upper(): agent for agent in Agent.objects.all()}
    inconnus = [ligne for ligne in lignes if ligne["matricule"] not in agents]
    trouves = [ligne for ligne in lignes if ligne["matricule"] in agents]
    if ecrire:
        with transaction.atomic():
            for ligne in trouves:
                agent = agents[ligne["matricule"]]
                for annee, jours in ligne["droits"].items():
                    pris = DroitConge.objects.filter(agent=agent, annee=annee).values_list("jours_pris", flat=True).first() or 0
                    DroitConge.objects.update_or_create(agent=agent, annee=annee, defaults={"jours_dus": jours, "jours_pris": min(pris, jours)})
                total = sum(ligne["droits"].values())
                agent.conges_acquis = total
                agent.conges_consommes = 0
                agent.report_conges = ligne["droits"].get(2024, 0)
                agent.save(update_fields=["conges_acquis", "conges_consommes", "report_conges"])
    return {
        "lues": len(lignes),
        "appliquees": len(trouves),
        "inconnus": [f"{ligne['matricule']} · {ligne['nom']} ({ligne['feuille']})" for ligne in inconnus],
        "jours_2024": sum(ligne["droits"].get(2024, 0) for ligne in trouves),
        "jours_2025": sum(ligne["droits"].get(2025, 0) for ligne in trouves),
        "sans_droit": sum(1 for ligne in trouves if not any(ligne["droits"].values())),
    }
