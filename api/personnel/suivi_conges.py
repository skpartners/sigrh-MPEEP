"""Registre de suivi des congés pour la GRH : tout ce que les agents ont déposé, avec le circuit de chaque dépôt.

Deux sources : les demandes de congé de l'agent (circuit de visas) et les dates choisies à la campagne de planification
(agent, hiérarchie, équipe RH, DRH, arrêté).
"""

import re
import unicodedata
from datetime import timedelta

from .models import Agent, Demande, PlanConge
from .present import agent_brief

LIMITE = 300
ETAPES_PLAN = [
    (PlanConge.Palier.AGENT, "Choix de l'agent"),
    (PlanConge.Palier.HIERARCHIE, "Avis du supérieur"),
    (PlanConge.Palier.RH, "Équipe RH"),
    (PlanConge.Palier.DRH, "Visa du DRH"),
    (PlanConge.Palier.PUBLIE, "Arrêté publié"),
]


def _normaliser(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texte.lower()) if unicodedata.category(c) != "Mn")


def _etape(etape: str) -> int:
    trouve = re.search(r"\d+", _normaliser(etape))
    return int(trouve.group(0)) if trouve else 1


def _clos(etape: str) -> bool:
    texte = _normaliser(etape)
    return "etape 5" in texte or "notifie" in texte or "clotur" in texte


def _agent(agent: Agent) -> dict:
    return {**agent_brief(agent), "fonction": agent.fonction}


def _ligne_demande(demande: Demande) -> dict:
    visas = [
        {
            "ordre": visa.ordre, "instance": visa.instance, "titulaire": visa.titulaire, "fonction": visa.fonction, "avis": visa.avis,
            "commentaire": visa.commentaire, "date": visa.date.isoformat() if visa.date else None,
            "signature_url": visa.signature.url if visa.signature else "",
        }
        for visa in demande.visas.all()
    ]
    clos = _clos(demande.etape)
    refuse = any("refus" in visa["avis"].lower() for visa in visas)
    return {
        "source": "demande",
        "reference": demande.reference,
        "agent": _agent(demande.agent),
        "structure": demande.agent.structure,
        "intitule": demande.nature,
        "debut": demande.debut.isoformat() if demande.debut else "",
        # `fin` est le jour de reprise : le dernier jour de congé est la veille.
        "fin": (demande.fin - timedelta(days=1)).isoformat() if demande.fin else "",
        "depose_le": demande.depose_le.isoformat(),
        "etape": demande.etape,
        "responsable": demande.responsable,
        "clos": clos,
        "refuse": refuse,
        "ordre_actuel": None if clos else _etape(demande.etape),
        "visas": visas,
    }


def _ligne_plan(plan: PlanConge, agents: dict[str, Agent]) -> dict:
    agent = agents.get(plan.agent.username)
    ordres = [code for code, _libelle in ETAPES_PLAN]
    courant = ordres.index(plan.palier) if plan.palier in ordres else 0
    publie = plan.palier == PlanConge.Palier.PUBLIE
    visas = []
    for rang, (code, libelle) in enumerate(ETAPES_PLAN):
        fait = publie or rang < courant
        visas.append({
            "ordre": rang + 1, "instance": libelle, "titulaire": plan.chez.get_full_name() if rang == courant and not publie and plan.chez_id else "",
            "fonction": "", "avis": "Validé" if fait else ("À traiter" if rang == courant else "En attente"), "commentaire": "",
            "date": None, "signature_url": "", "etat": "ok" if fait else "attente",
        })
    periodes = f"du {plan.debut:%d/%m/%Y} au {plan.fin:%d/%m/%Y}" + (f" et du {plan.debut2:%d/%m/%Y} au {plan.fin2:%d/%m/%Y}" if plan.debut2 and plan.fin2 else "")
    return {
        "source": "plan",
        "reference": f"PLAN-{plan.campagne.exercice}-{plan.id}",
        "agent": _agent(agent) if agent else None,
        "structure": agent.structure if agent else "",
        "intitule": f"Congés annuels {plan.campagne.exercice} {periodes}",
        "debut": plan.debut.isoformat(),
        "fin": (plan.fin2 or plan.fin).isoformat(),
        "depose_le": plan.creee_le.date().isoformat() if hasattr(plan, "creee_le") and plan.creee_le else plan.debut.isoformat(),
        "etape": dict(ETAPES_PLAN)[ETAPES_PLAN[courant][0]],
        "responsable": plan.chez.get_full_name() if plan.chez_id else "",
        "clos": publie,
        "refuse": False,
        "ordre_actuel": None if publie else courant + 1,
        "visas": visas,
    }


def suivi(visibles: set[str] | None) -> list[dict]:
    """Les dépôts de congé des agents du périmètre, les plus récents d'abord."""
    demandes = Demande.objects.filter(categorie="conge").select_related("agent").prefetch_related("visas").order_by("-depose_le", "-id")
    if visibles is not None:
        demandes = demandes.filter(agent__matricule__in=visibles)
    lignes = [_ligne_demande(item) for item in demandes[:LIMITE]]
    plans = PlanConge.objects.select_related("agent", "campagne", "chez").order_by("-campagne__exercice", "-id")
    if visibles is not None:
        plans = plans.filter(agent__username__in=visibles)
    plans = list(plans[:LIMITE])
    agents = {agent.matricule: agent for agent in Agent.objects.filter(matricule__in={plan.agent.username for plan in plans})}
    lignes += [_ligne_plan(plan, agents) for plan in plans if plan.agent.username in agents]
    return sorted(lignes, key=lambda ligne: ligne["depose_le"], reverse=True)
