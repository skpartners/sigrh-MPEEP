"""Carrières · Suivi des parcours professionnels : positions, nominations, promotions, mutations."""

from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .visibilite import dans_le_perimetre
from .models import Agent, EtapeParcours
from .informer import informer_parcours
from .present import parcours_agent, parcours_row


def peut_gerer_carriere(user, agent) -> bool:
    """Le gestionnaire (responsable du périmètre ou administrateur) tient la carrière ; l'agent ne fait que la consulter."""
    from .utilisateurs import perimetre_matricules
    from .views import ROLES_GESTION_DOSSIER

    profil = getattr(user, "profil", None)
    if profil is None:
        return False
    if profil.administrateur:
        return True
    if user.username == agent.matricule or profil.role not in ROLES_GESTION_DOSSIER:
        return False
    perimetre = perimetre_matricules(user)
    return perimetre is None or agent.matricule in perimetre


def refus_carriere() -> Response:
    return Response({"detail": "Seul un gestionnaire de la carrière de cet agent peut effectuer cette modification."}, status=403)


def _lire(data, item: EtapeParcours | None = None):
    """Retourne (valeurs, erreur)."""
    type_etape = str(data.get("type") if "type" in data else (item.type if item else "")).strip()
    if type_etape not in {code for code, _libelle in EtapeParcours.Type.choices}:
        return None, "Choisissez le type d'événement."
    intitule = " ".join(str(data.get("intitule") if "intitule" in data else (item.intitule if item else "")).split())
    if not intitule:
        return None, "Renseignez l'intitulé de l'événement."
    if len(intitule) > 200:
        return None, "L'intitulé dépasse 200 caractères."
    brut = data.get("date_effet") if "date_effet" in data else (item.date_effet.isoformat() if item else "")
    try:
        jour = date.fromisoformat(str(brut))
    except ValueError:
        return None, "La date d'effet n'est pas valide."
    reference = " ".join(str(data.get("reference_acte") if "reference_acte" in data else (item.reference_acte if item else "")).split())
    detail = " ".join(str(data.get("detail") if "detail" in data else (item.detail if item else "")).split())
    if len(reference) > 120 or len(detail) > 300:
        return None, "La référence de l'acte (120 caractères) ou le détail (300 caractères) est trop long."
    return {"type": type_etape, "intitule": intitule, "date_effet": jour, "reference_acte": reference, "detail": detail}, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def parcours(request, matricule: str):
    agent = get_object_or_404(Agent, matricule=matricule)
    if request.method == "GET":
        return Response(parcours_agent(agent))
    if not peut_gerer_carriere(request.user, agent):
        return refus_carriere()
    valeurs, erreur = _lire(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    item = EtapeParcours.objects.create(agent=agent, **valeurs)
    informer_parcours(agent, request.user, item, "ajouté")
    return Response(parcours_row(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def etape_parcours(request, matricule: str, pk: int):
    agent = get_object_or_404(Agent, matricule=matricule)
    if not peut_gerer_carriere(request.user, agent):
        return refus_carriere()
    item = get_object_or_404(EtapeParcours, pk=pk, agent=agent)
    if request.method == "DELETE":
        informer_parcours(agent, request.user, item, "supprimé")
        item.delete()
        return Response(status=204)
    valeurs, erreur = _lire(request.data, item)
    if erreur:
        return Response({"detail": erreur}, status=400)
    for champ, valeur in valeurs.items():
        setattr(item, champ, valeur)
    item.save()
    informer_parcours(agent, request.user, item, "modifié")
    return Response(parcours_row(item))
