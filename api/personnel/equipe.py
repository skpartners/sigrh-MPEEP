"""Profil agent, onglet « Ma team » : les collaborateurs de l'agent connecté."""

from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Absence, Agent, Profil
from .rattachement import structure_de, structures_par_nom
from .utilisateurs import perimetre_matricules

LIMITE = 600

# Ordre d'affichage, et libellé de chaque lien avec l'agent connecté.
RELATIONS = {
    "superieur": "Supérieur hiérarchique",
    "rattache": "Rattaché à vous",
    "service": "Même service",
    "perimetre": "Dans votre périmètre",
}


def _presence(agent: Agent, absence: Absence | None) -> dict:
    if absence is None:
        return {"ton": "present", "badge": "Disponible", "libelle": "Présent"}
    jusqu_au = absence.fin.strftime("%d/%m/%Y")
    if "maladie" in absence.nature.lower():
        return {"ton": "maladie", "badge": "Arrêt maladie", "libelle": f"{absence.nature} : jusqu'au {jusqu_au}"}
    return {"ton": "conge", "badge": "En congé", "libelle": f"{absence.nature} : jusqu'au {jusqu_au}"}


def _membre(agent: Agent, relation: str, entite, absence: Absence | None) -> dict:
    return {
        "matricule": agent.matricule,
        "nom_complet": agent.nom_complet,
        "initiales": agent.initiales,
        "photo_url": agent.photo.url if agent.photo else "",
        "fonction": agent.fonction or agent.emploi or "",
        "structure": entite.nom if entite is not None else (agent.service or agent.structure or ""),
        "courriel": agent.courriel,
        "telephone": agent.telephone,
        "relation": relation,
        "relation_libelle": RELATIONS[relation],
        "presence": _presence(agent, absence),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def equipe(request, matricule: str):
    """Supérieur, collègues du service, agents qui relèvent de l'utilisateur et agents de son périmètre."""
    if request.user.username != matricule:
        return Response({"detail": "Votre équipe ne se consulte que depuis votre propre profil."}, status=403)
    moi = get_object_or_404(Agent, matricule=matricule)
    par_nom = structures_par_nom()
    mon_entite = structure_de(moi, par_nom)
    profil = getattr(request.user, "profil", None)

    superieur = profil.superieur.username if profil is not None and profil.superieur_id else ""
    rattaches = set(Profil.objects.filter(superieur=request.user).values_list("user__username", flat=True))
    perimetre = perimetre_matricules(request.user)  # None : visibilité sur tout le ministère, qui ne fait pas une équipe

    entites = {}
    relations: dict[str, str] = {}
    for agent in Agent.objects.exclude(pk=moi.pk):
        entite = structure_de(agent, par_nom)
        entites[agent.matricule] = entite
        if agent.matricule == superieur:
            relations[agent.matricule] = "superieur"
        elif agent.matricule in rattaches:
            relations[agent.matricule] = "rattache"
        elif mon_entite is not None and entite is not None and entite.id == mon_entite.id:
            relations[agent.matricule] = "service"
        elif perimetre is not None and agent.matricule in perimetre:
            relations[agent.matricule] = "perimetre"

    jour = date.today()
    absences = {
        item.agent.matricule: item
        for item in Absence.objects.filter(debut__lte=jour, fin__gte=jour, agent__matricule__in=relations)
        .exclude(decision=Absence.Decision.INVALIDEE)
        .select_related("agent")
    }
    ordre = list(RELATIONS)
    membres = sorted(
        (
            _membre(agent, relations[agent.matricule], entites[agent.matricule], absences.get(agent.matricule))
            for agent in Agent.objects.filter(matricule__in=relations)
        ),
        key=lambda item: (ordre.index(item["relation"]), item["nom_complet"]),
    )
    total = len(membres)
    return Response(
        {
            "service": mon_entite.nom if mon_entite is not None else (moi.service or moi.structure or ""),
            "total": total,
            "tronque": total > LIMITE,
            "relations": [{"code": code, "libelle": libelle, "nombre": sum(1 for item in membres if item["relation"] == code)} for code, libelle in RELATIONS.items()],
            "membres": membres[:LIMITE],
        }
    )
