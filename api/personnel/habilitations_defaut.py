"""Répartition par défaut des habilitations.

Tout le monde ouvre le profil agent. Le tableau de bord est réservé aux responsables
hiérarchiques. La GRH, les statistiques, les projets et études et la communication
sont réservés aux responsables de la DRH (sous-directeur, directeur) et, en lecture
ou validation, au directeur général et au ministre. Le secrétariat reste au rôle
Secrétaire. Le gestionnaire RH,
point focal d'une structure, n'exprime que les besoins.
"""

from django.contrib.auth.models import User

from personnel.models import FonctionHabilitation, ModuleHabilitation, Profil, RoleMatrice

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


# Droit du module. Une fonction absente de PRECISIONS hérite de ce niveau.
# Les rôles absents ici n'ont aucun module, sauf ceux de ROLES_VALIDATION.
DROITS_MODULES = {
    "Agent": {"Dossier Agent": "lecture"},
    "Secrétaire": {"Dossier Agent": "lecture"},
    "Gestionnaire RH": {"Dossier Agent": "lecture"},
    "Chef de service": {"Dossier Agent": "lecture"},
    "Sous directeur": {
        "Dossier Agent": "lecture",
        "Carrières & Actes": "validation",
        "Social & Santé": "validation",
        "Formations": "validation",
        "Statistiques & RBAC": "lecture",
        "GPEC": "saisie",
        "Projets et études RH": "saisie",
    },
    "Directeur": {
        "Dossier Agent": "validation",
        "Carrières & Actes": "validation",
        "Social & Santé": "validation",
        "Formations": "validation",
        "Statistiques & RBAC": "validation",
        "GPEC": "validation",
        "Projets et études RH": "validation",
    },
}
ROLES_VALIDATION = {"Directeur général", "Ministre", "Administrateur"}
MODULE_PROJETS = "Projets et études RH"
FONCTION_PROJETS = "Projets et études"

# Exceptions par fonction : (module, fonction) → niveau, seulement s'il diffère du module.
PRECISIONS = {
    "Secrétaire": {("Carrières & Actes", "Secrétariat"): "saisie"},
    "Gestionnaire RH": {("GPEC", "Expression des besoins"): "saisie"},
    "Chef de service": {
        ("Carrières & Actes", "Congés"): "validation",
        ("Carrières & Actes", "Absences"): "lecture",
        ("Statistiques & RBAC", "Tableau de bord"): "lecture",
        ("Statistiques & RBAC", "Circuits et habilitations"): "lecture",
        ("Statistiques & RBAC", "Structures du ministère"): "lecture",
    },
    "Sous directeur": {
        ("Statistiques & RBAC", "Communication"): "saisie",
        ("Statistiques & RBAC", "Paramètres"): "refus",
        ("Statistiques & RBAC", "Habilitations"): "refus",
        ("Statistiques & RBAC", "Circuits et habilitations"): "lecture",
        ("Statistiques & RBAC", "Comptes utilisateurs"): "lecture",
        ("Statistiques & RBAC", "Structures du ministère"): "saisie",
    },
    "Directeur": {
        ("Statistiques & RBAC", "Paramètres"): "refus",
        ("Statistiques & RBAC", "Habilitations"): "lecture",
        ("Statistiques & RBAC", "Circuits et habilitations"): "validation",
        ("Statistiques & RBAC", "Comptes utilisateurs"): "validation",
        ("Statistiques & RBAC", "Structures du ministère"): "validation",
    },
}


def _assurer_projets(Module, Fonction) -> None:
    module = Module.objects.filter(libelle=MODULE_PROJETS).first()
    if module is None:
        ordre = (Module.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        module = Module.objects.create(ordre=ordre, libelle=MODULE_PROJETS)
    if not Fonction.objects.filter(module=module, libelle=FONCTION_PROJETS).exists():
        Fonction.objects.create(module=module, ordre=1, libelle=FONCTION_PROJETS)


def repartir(Role=RoleMatrice, Fonction=FonctionHabilitation, Module=ModuleHabilitation) -> None:
    """Pose la répartition par défaut et retire les exceptions de fonction qui ouvraient tout le menu."""
    _assurer_projets(Module, Fonction)
    modules = list(Module.objects.order_by("ordre"))
    index = {module.libelle: position for position, module in enumerate(modules)}
    fonctions = {
        (fonction.module.libelle, fonction.libelle): fonction
        for fonction in Fonction.objects.select_related("module")
    }
    for role in Role.objects.all():
        spec = DROITS_MODULES.get(role.role, {})
        plein = role.role in ROLES_VALIDATION
        droits = [
            "validation" if plein else spec.get(module.libelle, "refus")
            for module in modules
        ]
        precisions = {}
        for (module_nom, libelle), droit in PRECISIONS.get(role.role, {}).items():
            fonction = fonctions.get((module_nom, libelle))
            position = index.get(module_nom)
            if fonction is None or position is None or droit == droits[position]:
                continue
            precisions[str(fonction.pk)] = droit
        secretariat = fonctions.get(("Carrières & Actes", "Secrétariat"))
        carriere = index.get("Carrières & Actes")
        if secretariat is not None and carriere is not None and role.role != "Secrétaire" and droits[carriere] != "refus":
            precisions[str(secretariat.pk)] = "refus"
        role.droits = droits
        role.precisions = precisions
        role.save(update_fields=["droits", "precisions"])


def appliquer(Role=RoleMatrice, Fonction=FonctionHabilitation, Compte=Profil, Utilisateur=User) -> None:
    """Pose les précisions des rubriques de paramètres, et la dérogation du DRH."""
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


ROLE_GESTIONNAIRE_RH = "Gestionnaire RH"


def appliquer_gestionnaire_rh(Role) -> None:
    """Rôle « Gestionnaire RH » : point focal d'une structure, aux habilitations de l'agent (calqué sur lui)."""
    if Role.objects.filter(role=ROLE_GESTIONNAIRE_RH).exists():
        return
    modele = Role.objects.filter(role="Agent").first()
    if modele is None:
        return
    ordre = (Role.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    Role.objects.create(
        ordre=ordre,
        role=ROLE_GESTIONNAIRE_RH,
        description="Point focal RH d'une structure : exprime ses besoins en agents",
        icone="support_agent",
        droits=list(modele.droits),
        superieurs=list(modele.superieurs),
        precisions=dict(modele.precisions or {}),
    )


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
