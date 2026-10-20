"""Prévenir l'agent quand quelqu'un d'autre modifie un élément de son dossier."""

import re

from django.contrib.auth.models import User
from django.utils import timezone

from .models import Agent, Notification


def _auteur(auteur) -> str:
    if auteur is None:
        return "La direction des ressources humaines"
    return auteur.get_full_name() or auteur.username


def informer_agent(agent: Agent, auteur, titre: str, message: str) -> None:
    """Notifie l'agent d'une modification de son dossier, sauf s'il l'a faite lui-même ou n'a pas de compte."""
    compte = User.objects.filter(username=agent.matricule).first()
    if compte is None or (auteur is not None and compte.pk == auteur.pk):
        return
    Notification.objects.create(
        destinataire=compte,
        categorie=Notification.Categorie.DOSSIER,
        titre=titre[:160],
        message=f"{message} Par {_auteur(auteur)}."[:280],
        lien=f"/app/agents/{agent.matricule}",
        creee_le=timezone.now(),
    )


def _affiche(valeur) -> str:
    texte = str(valeur or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", texte):
        annee, mois, jour = texte.split("-")
        return f"{jour}/{mois}/{annee}"
    return texte or "non renseigné"


def instantane_situation(agent: Agent) -> dict[str, str]:
    """Les rubriques de la situation administrative, pour comparer avant et après une modification."""
    from .present import situation_administrative

    return {ligne["libelle"]: _affiche(ligne["valeur"]) for ligne in situation_administrative(agent)}


def informer_situation(agent: Agent, auteur, avant: dict[str, str]) -> None:
    """Dit à l'agent quelles rubriques de sa situation administrative ont changé."""
    apres = instantane_situation(agent)
    changements = [f"{libelle} ({avant.get(libelle, 'non renseigné')} → {valeur})" for libelle, valeur in apres.items() if avant.get(libelle) != valeur]
    if changements:
        informer_agent(agent, auteur, "Votre situation administrative a été modifiée", "Rubriques modifiées : " + ", ".join(changements) + ".")


def _periode(debut, fin) -> str:
    texte = f"du {debut:%d/%m/%Y}"
    return f"{texte} au {fin:%d/%m/%Y}" if fin else f"{texte}, sans terme fixé"


def informer_position(agent: Agent, auteur, item, verbe: str) -> None:
    informer_agent(
        agent, auteur, f"Position administrative {verbe}",
        f"{item.get_type_display()} {_periode(item.date_debut, item.date_fin)} : position {verbe} dans votre dossier.",
    )


def informer_parcours(agent: Agent, auteur, item, verbe: str) -> None:
    informer_agent(
        agent, auteur, f"Parcours professionnel : événement {verbe}",
        f"{item.get_type_display()} « {item.intitule} » au {item.date_effet:%d/%m/%Y}.",
    )
