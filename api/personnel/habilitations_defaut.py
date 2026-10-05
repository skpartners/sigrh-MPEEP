"""Droits par rubrique de Paramètres.

Le module « Statistiques & RBAC » reste le droit de repli (tableau de bord,
statistiques, communication). Les rubriques regroupées sous Paramètres ont
leur propre niveau, sinon un chef ou un directeur hériterait de la validation
du module sur les comptes, les circuits et l'identité du ministère.
"""

from django.contrib.auth.models import User

from personnel.models import FonctionHabilitation, Profil, RoleMatrice

MATRICULE_DRH = "DRH-2018-044"

RUBRIQUES = {
    "Agent": {
        "Paramètres": "refus",
        "Circuits et habilitations": "refus",
        "Habilitations": "refus",
        "Comptes utilisateurs": "refus",
        "Structures du ministère": "refus",
    },
    "Chef de service": {
        "Paramètres": "refus",
        "Circuits et habilitations": "lecture",
        "Habilitations": "refus",
        "Comptes utilisateurs": "refus",
        "Structures du ministère": "lecture",
    },
    "Sous directeur": {
        "Paramètres": "refus",
        "Circuits et habilitations": "lecture",
        "Habilitations": "refus",
        "Comptes utilisateurs": "lecture",
        "Structures du ministère": "saisie",
    },
    "Directeur": {
        "Paramètres": "refus",
        "Circuits et habilitations": "validation",
        "Habilitations": "lecture",
        "Comptes utilisateurs": "validation",
        "Structures du ministère": "validation",
    },
    "Directeur général": {
        "Paramètres": "validation",
        "Circuits et habilitations": "validation",
        "Habilitations": "validation",
        "Comptes utilisateurs": "validation",
        "Structures du ministère": "validation",
    },
    "Ministre": {
        "Paramètres": "validation",
        "Circuits et habilitations": "validation",
        "Habilitations": "validation",
        "Comptes utilisateurs": "validation",
        "Structures du ministère": "validation",
    },
}


def appliquer(Role=RoleMatrice, Fonction=FonctionHabilitation, Compte=Profil, Utilisateur=User) -> None:
    """Pose les précisions de rôle, et la dérogation du DRH sur ces rubriques."""
    libelles = {libelle for droits in RUBRIQUES.values() for libelle in droits}
    identifiants = {
        item.libelle: item.pk
        for item in Fonction.objects.filter(libelle__in=libelles)
    }
    for nom, droits in RUBRIQUES.items():
        role = Role.objects.filter(role=nom).first()
        if role is None:
            continue
        precisions = {str(cle): valeur for cle, valeur in (role.precisions or {}).items()}
        for libelle, droit in droits.items():
            pk = identifiants.get(libelle)
            if pk is not None:
                precisions[str(pk)] = droit
        role.precisions = precisions
        role.save(update_fields=["precisions"])

    compte = Utilisateur.objects.filter(username=MATRICULE_DRH).first()
    if compte is None:
        return
    profil = Compte.objects.filter(user_id=compte.pk).first()
    if profil is None or profil.habilitations is None:
        return
    precisions = {str(cle): valeur for cle, valeur in (profil.precisions or {}).items()}
    for libelle in RUBRIQUES["Directeur général"]:
        pk = identifiants.get(libelle)
        if pk is not None:
            precisions[str(pk)] = "validation"
    profil.precisions = precisions
    profil.save(update_fields=["precisions"])
