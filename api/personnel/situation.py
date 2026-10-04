"""Rubriques de la situation administrative déduites des données déjà au dossier."""


def rattachement(libelle: str) -> tuple[str, str, str]:
    if libelle.startswith("Sous-Direction") or libelle.startswith("Sous-direction"):
        return "", libelle, ""
    if libelle.startswith("Service"):
        return "", "", libelle
    return libelle, "", ""


def completer(agent, actes) -> list[str]:
    """Renseigne les champs que le rattachement et les actes validés établissent déjà."""
    champs: list[str] = []

    if not agent.direction and not agent.sous_direction and not agent.service:
        agent.direction, agent.sous_direction, agent.service = rattachement(agent.structure or "")
        champs += ["direction", "sous_direction", "service"]
    if not agent.emploi and agent.corps:
        agent.emploi = agent.corps
        champs.append("emploi")
    if not agent.type_agent:
        agent.type_agent = "Fonctionnaire"
        champs.append("type_agent")

    valides = [acte for acte in actes if getattr(acte, "statut", "") == "valide" and acte.date_effet]
    nominations = [acte for acte in valides if "nomination" in (acte.nature or "").lower()]
    if nominations and not agent.fonction:
        dernier = max(nominations, key=lambda acte: acte.date_effet)
        agent.fonction = _qualite(dernier.titre)
        agent.prise_service_fonction = dernier.date_effet
        champs += ["fonction", "prise_service_fonction"]

    integrations = [acte for acte in valides if "intégration" in (acte.nature or "").lower()]
    if integrations:
        premier = min(integrations, key=lambda acte: acte.date_effet)
        if not agent.prise_service_emploi:
            agent.prise_service_emploi = premier.date_effet
            champs.append("prise_service_emploi")
        if not agent.mode_recrutement and "concours" in (premier.resume or "").lower():
            agent.mode_recrutement = "Concours"
            champs.append("mode_recrutement")

    if not agent.prise_service_ministere:
        entrees = [acte for acte in valides if "mutation" in (acte.nature or "").lower() and _vers_ministere(acte)]
        if entrees:
            agent.prise_service_ministere = min(entrees, key=lambda acte: acte.date_effet).date_effet
            champs.append("prise_service_ministere")

    return champs


def _qualite(titre: str) -> str:
    marque = "en qualité de "
    indice = titre.lower().find(marque)
    if indice < 0:
        return titre
    reste = titre[indice + len(marque):]
    return reste[:1].upper() + reste[1:]


def _vers_ministere(acte) -> bool:
    texte = f"{acte.titre} {acte.resume}".lower()
    return any(mot in texte for mot in ("dgpe", "mpeep", "ministère", "ministere"))
