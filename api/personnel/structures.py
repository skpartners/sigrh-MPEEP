"""Structures réelles du ministère, communes à la dotation et à l'expression des besoins."""

POLES = (
    ("cabinet", "Cabinet"),
    ("dgpe", "DGPE"),
    ("dgpn", "DGPN"),
)

NIVEAUX = (
    ("direction-generale", "Direction générale"),
    ("direction-centrale", "Direction centrale"),
    ("sous-direction", "Sous-direction"),
    ("service", "Service"),
)

# Une cellule n'est pas un rang : elle occupe celui d'une direction centrale ou d'une sous-direction.
ALIAS_NIVEAUX = {
    "direction": "direction-centrale",
    "cellule": "direction-centrale",
}

# (code, structure parente, nom, niveau) — sous la direction centrale DRH.
RATTACHEMENTS = (
    ("sd-carrieres", "drh", "SD Carrières et Actes", "sous-direction"),
    ("sd-social", "drh", "SD Action Sociale", "sous-direction"),
    ("sd-formation", "drh", "SD Formation Continue", "sous-direction"),
    ("svc-actes", "drh", "Service des actes", "service"),
    ("svc-courrier", "drh", "Service du courrier", "service"),
)


def niveau_depuis_nom(nom: str) -> str:
    """Déduit le rang. Une cellule prend le rang de direction centrale ; on peut ensuite la placer en sous-direction."""
    texte = nom.casefold().replace("é", "e").replace("è", "e")
    if texte.startswith("direction generale") or texte.startswith("direction générale"):
        return "direction-generale"
    if texte.startswith("direction centrale"):
        return "direction-centrale"
    if texte.startswith("sous-direction") or texte.startswith("sous direction") or texte.startswith("sd "):
        return "sous-direction"
    if texte.startswith("service"):
        return "service"
    if texte.startswith("cellule") or texte.startswith("inspection"):
        return "direction-centrale"
    if texte.startswith("direction"):
        return "direction-centrale"
    return "direction-centrale"


# (code, pôle, nom, niveau, parent) — la direction générale contient les directions centrales, qui contiennent les sous-directions, qui contiennent les services.
STRUCTURES = (
    ("cabinet", "cabinet", "Cabinet", "direction-generale", ""),
    ("dgpe", "dgpe", "Direction Générale du Portefeuille de l'État", "direction-generale", ""),
    ("dgpn", "dgpn", "DGPN", "direction-generale", ""),
    ("ig", "cabinet", "Inspection Générale", "direction-centrale", "cabinet"),
    ("daf", "cabinet", "Direction des Affaires Financières", "direction-centrale", "cabinet"),
    ("drh", "cabinet", "Direction des Ressources Humaines", "direction-centrale", "cabinet"),
    ("dsps", "cabinet", "Direction de la Stratégie, de la Planification et des Statistiques", "direction-centrale", "cabinet"),
    ("dcrp", "cabinet", "Direction de la Communication et des Relations Publiques", "direction-centrale", "cabinet"),
    ("dsi", "cabinet", "Direction des Systèmes d'Information", "direction-centrale", "cabinet"),
    ("cmp", "cabinet", "Cellule de Passation des Marchés Publics", "direction-centrale", "cabinet"),
    ("genre", "cabinet", "Cellule Genre", "direction-centrale", "cabinet"),
    ("dppss", "dgpe", "Direction du Portefeuille des Secteurs Primaire et Secondaire", "direction-centrale", "dgpe"),
    ("dpst", "dgpe", "Direction du Portefeuille du Secteur Tertiaire", "direction-centrale", "dgpe"),
    ("dse", "dgpe", "Direction de la Stratégie et de l'Expertise", "direction-centrale", "dgpe"),
    ("daj-dgpe", "dgpe", "Direction des Affaires Juridiques (DGPE)", "direction-centrale", "dgpe"),
    ("dchc", "dgpe", "Direction du Capital Humain et de la Communication", "direction-centrale", "dgpe"),
    ("cgam", "dgpe", "Cellule de Gestion et d'Attribution des Marchés", "direction-centrale", "dgpe"),
    ("dspq", "dgpn", "Direction du Suivi de la Performance et de la Qualité", "direction-centrale", "dgpn"),
    ("dsar", "dgpn", "Direction de la Stratégie, de l'Audit et des Risques", "direction-centrale", "dgpn"),
    ("daj-dgpn", "dgpn", "Direction des Affaires Juridiques (DGEPN)", "direction-centrale", "dgpn"),
    ("dinfo", "dgpn", "Direction de l'Informatique", "direction-centrale", "dgpn"),
    ("dpc", "dgpn", "Direction du Personnel et de la Communication", "direction-centrale", "dgpn"),
    ("sdap", "cabinet", "Service de la Documentation, des Archives et de la Publication", "service", "dcrp"),
    ("sgpte", "dgpe", "Service de Gestion des Projets, de la Transformation, du Suivi et de l'Évaluation", "service", "dse"),
    ("smg-dgpe", "dgpe", "Service des Moyens Généraux (DGPE)", "service", "dchc"),
    ("ssi-dgpe", "dgpe", "Service des Systèmes d'Information (DGPE)", "service", "dse"),
    ("sfmg", "dgpn", "Service Financier et des Moyens Généraux", "service", "dpc"),
)
