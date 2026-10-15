"""Visibilité des agents : tout écran qui liste ou calcule sur des agents passe par ces aides.

Le périmètre dépend de l'utilisateur connecté (voir `rattachement.py`). `None` signifie tout le ministère.
"""

from functools import wraps

from rest_framework.response import Response

from .utilisateurs import perimetre_matricules


def matricules_visibles(user) -> set[str] | None:
    return perimetre_matricules(user)


def agents_visibles(qs, user, champ: str = "matricule"):
    """Restreint un queryset au périmètre ; `champ` désigne le matricule de l'agent (ex. « agent__matricule »)."""
    visibles = matricules_visibles(user)
    return qs if visibles is None else qs.filter(**{f"{champ}__in": visibles})


def agent_visible(user, agent) -> bool:
    visibles = matricules_visibles(user)
    return visibles is None or agent.matricule in visibles


def refus_hors_perimetre() -> Response:
    return Response({"detail": "Ce dossier est hors de votre supervision."}, status=404)


def dans_le_perimetre(vue):
    """Décorateur d'une route `…/<matricule>/…` : 404 quand l'agent n'est pas sous la supervision de l'utilisateur."""

    @wraps(vue)
    def enveloppe(request, matricule, *args, **kwargs):
        from .models import Agent

        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is not None and not agent_visible(request.user, agent):
            return refus_hors_perimetre()
        return vue(request, matricule, *args, **kwargs)

    return enveloppe
