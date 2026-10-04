"""Enregistrement de la situation administrative saisie depuis le dossier."""

from datetime import datetime

from django.db import transaction

from .models import Agent, Organisme

TEXTES = {
    "direction": 240,
    "sous_direction": 240,
    "service": 240,
    "localisation": 200,
    "emploi": 240,
    "type_agent": 80,
    "mode_recrutement": 120,
    "fonction": 180,
}
OBLIGATOIRES = {"grade": 40, "echelon": 20, "situation": 80}
DATES = {
    "prise_service_ministere": "date de prise de service dans le ministère",
    "prise_service_emploi": "date de prise de service dans l'emploi",
    "prise_service_fonction": "date de prise de service dans la fonction",
}
LIBELLES = {
    "direction": "direction",
    "sous_direction": "sous-direction",
    "service": "service",
    "localisation": "lieu de travail",
    "emploi": "emploi",
    "type_agent": "type d'agent",
    "mode_recrutement": "mode de recrutement",
    "fonction": "fonction",
    "grade": "grade",
    "echelon": "échelon",
    "situation": "position",
    "categorie": "catégorie",
}


class _Invalide(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def enregistrer_situation(agent: Agent, data) -> str | None:
    """Applique la saisie. Retourne un message d'erreur, ou None si l'agent est enregistré."""
    if not isinstance(data, dict):
        return "Le corps de la requête est invalide."
    try:
        return _appliquer(agent, data)
    except _Invalide as exc:
        return exc.message


def _appliquer(agent: Agent, data: dict) -> None:
    code = _texte(data, "organisme")
    organisme = Organisme.objects.filter(code=code).first()
    if organisme is None:
        raise _Invalide("La structure choisie est inconnue.")

    valeurs: dict[str, str] = {}
    for champ, taille in {**TEXTES, **OBLIGATOIRES, "categorie": 40}.items():
        texte = _categorie(_texte(data, champ)) if champ == "categorie" else _texte(data, champ)
        if len(texte) > taille:
            raise _Invalide(f"Le champ « {LIBELLES[champ]} » dépasse {taille} caractères.")
        if champ in OBLIGATOIRES and not texte:
            raise _Invalide(f"Le champ « {LIBELLES[champ]} » est obligatoire.")
        valeurs[champ] = texte

    prise = _texte(data, "prise_service")
    if prise and not (prise.isdigit() and len(prise) == 4) and _jour(prise) is None:
        raise _Invalide("La date de première prise de service est invalide.")

    dates = {}
    for champ, libelle in DATES.items():
        brut = _texte(data, champ)
        if not brut:
            dates[champ] = None
            continue
        jour = _jour(brut)
        if jour is None:
            raise _Invalide(f"La {libelle} est invalide.")
        dates[champ] = jour

    with transaction.atomic():
        agent.organisme = organisme
        for champ, texte in valeurs.items():
            setattr(agent, champ, texte)
        agent.prise_service = prise
        for champ, jour in dates.items():
            setattr(agent, champ, jour)
        rattache = agent.service or agent.sous_direction or agent.direction
        if rattache:
            agent.structure = rattache
        agent.save()


def _texte(data: dict, cle: str) -> str:
    if cle not in data or data[cle] is None:
        return ""
    valeur = data[cle]
    if not isinstance(valeur, str):
        raise _Invalide(f"Le champ « {LIBELLES.get(cle, cle)} » est invalide.")
    return valeur.strip()


def _categorie(valeur: str) -> str:
    if valeur.lower().startswith("catégorie "):
        return valeur.split(" ", 1)[1].strip()
    return valeur


def _jour(valeur: str):
    try:
        return datetime.strptime(valeur, "%Y-%m-%d").date()
    except ValueError:
        return None
