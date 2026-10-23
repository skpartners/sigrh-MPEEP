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


MODULE_SECRETARIAT = "Carrières & Actes"
FONCTION_SECRETARIAT = "Secrétariat"
ROLE_SECRETAIRE = "Secrétaire"


def appliquer_secretariat(Module, Fonction, Role) -> None:
    """Fonction « Secrétariat » : fermée à tous les rôles, ouverte au rôle « Secrétaire » (calqué sur l'agent)."""
    module = Module.objects.filter(libelle=MODULE_SECRETARIAT).first()
    if module is None:
        return
    dernier = Fonction.objects.filter(module=module).order_by("-ordre").values_list("ordre", flat=True).first() or 0
    fonction, _cree = Fonction.objects.get_or_create(module=module, libelle=FONCTION_SECRETARIAT, defaults={"ordre": dernier + 1})
    for role in Role.objects.exclude(role=ROLE_SECRETAIRE):
        precisions = dict(role.precisions or {})
        precisions.setdefault(str(fonction.pk), "refus")
        role.precisions = precisions
        role.save(update_fields=["precisions"])
    modele = Role.objects.filter(role="Agent").first()
    if modele is not None and not Role.objects.filter(role=ROLE_SECRETAIRE).exists():
        ordre = (Role.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        precisions = dict(modele.precisions or {})
        precisions[str(fonction.pk)] = "saisie"
        Role.objects.create(
            ordre=ordre,
            role=ROLE_SECRETAIRE,
            description="Imprime les demandes validées, les fait signer et verse le document signé",
            icone="assignment_ind",
            droits=list(modele.droits),
            superieurs=list(modele.superieurs),
            precisions=precisions,
        )
