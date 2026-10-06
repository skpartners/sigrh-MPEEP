"""Comptes habilités à se connecter au SIGRH."""

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .effectifs import _ligne_structure
from .models import EntiteTutelle, ModuleHabilitation, Organisme, Profil, RoleMatrice

NIVEAUX = ("refus", "lecture", "saisie", "validation")
RANG = {niveau: index for index, niveau in enumerate(NIVEAUX)}


def _texte(valeur) -> str:
    return str(valeur or "").strip()


def _ligne(user: User, courant: User) -> dict:
    profil = user.profil
    return {
        "matricule": user.username,
        "nom": user.last_name,
        "prenoms": user.first_name,
        "nom_complet": user.get_full_name(),
        "courriel": user.email,
        "fonction": profil.fonction,
        "role": profil.role,
        "organisme": profil.organisme.code,
        "organisme_nom": profil.organisme.nom,
        "organisme_sigle": profil.organisme.sigle,
        "structure": profil.structure.code if profil.structure_id else "",
        "structure_nom": profil.structure.nom if profil.structure_id else "",
        "pole": profil.structure.pole.code if profil.structure_id else "",
        "pole_libelle": profil.structure.pole.nom if profil.structure_id else "",
        "superieur": profil.superieur.username if profil.superieur_id else "",
        "superieur_nom": profil.superieur.get_full_name() if profil.superieur_id else "",
        "alerte": _alerte_hierarchie(profil),
        "interim": _interim(profil),
        "interimaire": profil.interim.code if profil.interim_id else "",
        "interimaire_nom": profil.interim.nom if profil.interim_id else "",
        "interimaire_texte": _texte_interimaire(profil),
        "actif": user.is_active,
        "moi": user.pk == courant.pk,
        "personnalisees": profil.habilitations is not None,
        "habilitations": _effectives(profil),
        "precisions": _precisions_compte(profil),
    }


def _modules() -> list[ModuleHabilitation]:
    return list(ModuleHabilitation.objects.prefetch_related("fonctions"))


def _aligner(droits, taille: int, remplissage: str = "refus") -> list[str]:
    valeurs = [item if item in RANG else remplissage for item in (droits or [])]
    if len(valeurs) < taille:
        valeurs += [remplissage] * (taille - len(valeurs))
    return valeurs[:taille]


def _defaut_role(role: str, taille: int) -> list[str]:
    item = RoleMatrice.objects.filter(role=role).first()
    return _aligner(item.droits if item else [], taille)


def _precisions_role(role: str) -> dict[str, str]:
    item = RoleMatrice.objects.filter(role=role).first()
    if item is None:
        return {}
    return {str(cle): valeur for cle, valeur in (item.precisions or {}).items() if valeur in RANG}


def _precisions_compte(profil: Profil) -> dict[str, str]:
    if profil.habilitations is None or not profil.precisions:
        return {}
    return {str(cle): valeur for cle, valeur in profil.precisions.items() if valeur in RANG}


def _droit_fonction(droits: list[str], precisions: dict[str, str], index: int, fonction_id: int) -> str:
    choisi = precisions.get(str(fonction_id))
    if choisi in RANG:
        return choisi
    return droits[index] if index < len(droits) else "refus"


def _precisions_resolues(profil: Profil) -> dict[str, str]:
    if profil.administrateur:
        return {
            str(fonction.pk): "validation"
            for module in _modules()
            for fonction in module.fonctions.all()
        }
    droits = _effectives(profil)
    precisions = _precisions_compte(profil) if profil.habilitations is not None else _precisions_role(profil.role)
    return {
        str(fonction.pk): _droit_fonction(droits, precisions, index, fonction.pk)
        for index, module in enumerate(_modules())
        for fonction in module.fonctions.all()
    }


def est_administrateur(user: User) -> bool:
    profil = getattr(user, "profil", None)
    return bool(profil and profil.administrateur)


def _effectives(profil: Profil) -> list[str]:
    taille = len(_modules())
    if profil.administrateur:
        return ["validation"] * taille
    defaut = _defaut_role(profil.role, taille)
    if profil.habilitations is None:
        droits = defaut
    else:
        perso = [item if item in RANG else "refus" for item in profil.habilitations]
        if len(perso) < taille:
            perso += defaut[len(perso):]
        droits = perso[:taille]
    poste = profil.interim if profil.interim_id else None
    if poste is None:
        return droits
    couvert = _defaut_role(_role_responsable(poste), taille)
    return [actuel if RANG[actuel] >= RANG[autre] else autre for actuel, autre in zip(droits, couvert)]


def _roles() -> list[str]:
    return list(RoleMatrice.objects.values_list("role", flat=True))


def _racine_ministere(user: User) -> bool:
    profil = getattr(user, "profil", None)
    if profil is None:
        return False
    if profil.superieur_id is None and not _roles_superieurs(profil.role):
        return True
    structure = getattr(profil, "structure", None)
    return profil.role == "Directeur" and getattr(structure, "code", "") == "drh"


def _descendants(user_id: int) -> set[int]:
    vus: set[int] = set()
    front = [user_id]
    while front:
        enfants = [
            pk
            for pk in Profil.objects.filter(superieur_id__in=front).values_list("user_id", flat=True)
            if pk not in vus
        ]
        vus.update(enfants)
        front = enfants
    return vus


def perimetre_ids(user: User) -> set[int] | None:
    """None : tout le ministère. Sinon le compte et les personnes qu'il encadre, pas ses pairs."""
    if not hasattr(user, "profil"):
        return {user.pk}
    if user.profil.administrateur or _racine_ministere(user):
        return None
    return _descendants(user.pk) | {user.pk}


def perimetre_matricules(user: User) -> set[str] | None:
    identifiants = perimetre_ids(user)
    if identifiants is None:
        return None
    return set(User.objects.filter(pk__in=identifiants).values_list("username", flat=True))


def _attributions_identiques(profil: Profil, habilitations, precisions) -> bool:
    ancien = list(profil.habilitations) if profil.habilitations is not None else None
    nouveau = list(habilitations) if habilitations is not None else None
    anciennes = {str(cle): valeur for cle, valeur in (profil.precisions or {}).items()} if profil.habilitations is not None else {}
    nouvelles = {str(cle): valeur for cle, valeur in (precisions or {}).items()} if habilitations is not None else {}
    return ancien == nouveau and anciennes == nouvelles


def _role_responsable(structure) -> str:
    """Rôle d'habilitation du premier responsable, selon le rang de la structure."""
    if structure.niveau == "service":
        return "Chef de service"
    if structure.niveau == "sous-direction":
        return "Sous directeur"
    if structure.niveau == "direction-generale":
        return "Directeur général"
    if structure.niveau == "ministere":
        return "Ministre"
    return "Directeur"


def _alerte_hierarchie(profil: Profil) -> str:
    """Signale un compte déjà enregistré qui ne suit pas le rattachement hiérarchique."""
    structure = profil.structure
    if structure is None:
        return "Ce compte n'est rattaché à aucune structure."
    if profil.role != "Agent" and profil.role != _role_responsable(structure):
        return "Le rôle ne correspond pas au niveau de cette structure."
    identifiant = profil.user.username
    superieur = profil.superieur
    if profil.role == "Agent":
        responsable = _referent(structure, identifiant)
        if responsable is None:
            return "Cette structure n'a pas encore de premier responsable."
        if superieur is None or superieur.pk != responsable.pk:
            return f"Le supérieur doit être {responsable.get_full_name()}, premier responsable de cette structure."
        return ""
    if _responsable(structure, identifiant) is not None:
        return "Cette structure a déjà un premier responsable."
    parent = structure.parent
    if parent is not None:
        responsable = _referent(parent, identifiant)
        if responsable is None:
            if superieur is not None:
                return f"Le poste de {parent.nom} est vacant : ce compte ne peut pas avoir de supérieur."
            return ""
        if superieur is None or superieur.pk != responsable.pk:
            return f"Le supérieur doit être {responsable.get_full_name()}, premier responsable de {parent.nom}."
        return ""
    if superieur is not None:
        if structure.niveau == "ministere":
            return "Le ministre est au sommet de la chaîne hiérarchique."
        return "Le premier responsable de cette structure n'a pas de supérieur hiérarchique."
    return ""


def _poste_couvert(profil: Profil):
    """Structure parente sans titulaire, dont ce responsable n'assure les fonctions que dans sa compétence."""
    structure = profil.structure
    if structure is None or profil.role == "Agent" or profil.superieur_id or not structure.parent_id:
        return None
    parent = structure.parent
    if parent.niveau == "ministere":
        return None
    if profil.interim_id == parent.pk:
        return None
    if _referent(parent, profil.user.username) is not None:
        return None
    return parent


def _interim(profil: Profil) -> str:
    parent = _poste_couvert(profil)
    if parent is None:
        return ""
    return (
        f"En l'absence de désignation du {_role_responsable(parent).lower()} de {parent.nom}, "
        f"ce compte assure les fonctions de ce poste dans la limite des compétences de {profil.structure.nom}, "
        "jusqu'à cette désignation. Une note de service le constate."
    )


def _constater_interim(user: User, structure, grantor: User) -> None:
    """Émet la note de service quand un responsable couvre un poste non désigné, dans la limite de sa structure."""
    from .communication import ETAPE_DRH, _est_drh, _reference
    from .models import Notification, Publication

    if structure is None:
        return
    profil = user.profil
    if profil.role != "Agent":
        Publication.objects.filter(perimetre_detail__startswith=f"interim:{structure.code}:").exclude(
            statut=Publication.Statut.CLOTURE,
        ).update(statut=Publication.Statut.CLOTURE)
    parent = structure.parent if profil.role != "Agent" and not profil.superieur_id else None
    if parent is None or parent.niveau == "ministere" or profil.interim_id == parent.pk or _referent(parent) is not None:
        return
    marque = f"interim:{parent.code}:{user.username}"[:200]
    if Publication.objects.filter(perimetre_detail=marque).exclude(statut=Publication.Statut.CLOTURE).exists():
        return
    role_parent = _role_responsable(parent)
    nom = user.get_full_name() or user.username
    intitule = f"Fonctions de {role_parent.lower()} dans la limite des compétences — {parent.nom}"[:240]
    corps = (
        f"En l'absence de désignation du {role_parent.lower()} de {parent.nom}, "
        f"{nom}, {profil.role.lower()} de {structure.nom}, assure les fonctions de ce poste "
        f"dans la limite des compétences de {structure.nom}, jusqu'à la désignation du titulaire."
    )
    emise = _est_drh(grantor)
    Publication.objects.create(
        reference=_reference(),
        nature=Publication.Nature.NOTE,
        urgence=Publication.Urgence.IMPORTANT,
        intitule=intitule,
        corps=corps,
        perimetre=Publication.Perimetre.TOUS,
        perimetre_detail=marque,
        statut=Publication.Statut.DIFFUSE if emise else Publication.Statut.VISA,
        etape_visa="" if emise else ETAPE_DRH,
        accuse=True,
        signataire=grantor.get_full_name() or grantor.username,
        visa=f"Émise par {grantor.get_full_name() or grantor.username}" if emise else "",
        auteur=grantor,
        publiee_le=timezone.now() if emise else None,
    )
    message = corps[:280]
    maintenant = timezone.now()
    if emise:
        Notification.objects.create(
            destinataire=user, categorie=Notification.Categorie.SYSTEME, titre="Note de service",
            message=message, lien="/app/communication", creee_le=maintenant,
        )
        return
    for destinataire in User.objects.filter(is_active=True, profil__role="Directeur", profil__structure__code="drh"):
        Notification.objects.create(
            destinataire=destinataire, categorie=Notification.Categorie.VISA, titre="Note de service à viser",
            message=message, lien="/app/communication", urgente=True, creee_le=maintenant,
        )


def _responsable(structure, sauf: str = ""):
    comptes = User.objects.filter(
        is_active=True, profil__structure=structure, profil__administrateur=False,
    ).exclude(profil__role="Agent").select_related("profil", "profil__structure", "profil__structure__pole")
    if sauf:
        comptes = comptes.exclude(username=sauf)
    return comptes.order_by("pk").first()


def _interimaire(structure, sauf: str = ""):
    comptes = User.objects.filter(is_active=True, profil__interim=structure, profil__administrateur=False).select_related("profil")
    if sauf:
        comptes = comptes.exclude(username=sauf)
    return comptes.order_by("pk").first()


def _referent(structure, sauf: str = ""):
    """Titulaire du poste, ou l'intérimaire nommé s'il n'est pas désigné."""
    return _responsable(structure, sauf) or _interimaire(structure, sauf)


def _texte_interimaire(profil: Profil) -> str:
    poste = profil.interim
    if poste is None:
        return ""
    role = _role_responsable(poste).lower()
    titulaire = _responsable(poste, profil.user.username)
    if titulaire is None:
        return (
            f"Intérimaire du poste de {role} de {poste.nom}, non désigné. "
            "Il en assure pleinement les fonctions jusqu'à la nomination du titulaire."
        )
    return f"Intérimaire de {titulaire.get_full_name()}. Il assure pleinement ses fonctions en son absence."


def _constater_pleinement(user: User, grantor: User) -> None:
    """Note de service quand un intérimaire est nommé pour exercer pleinement un poste."""
    from .communication import ETAPE_DRH, _est_drh, _reference
    from .models import Notification, Publication

    profil = user.profil
    marque = f"pleinement:{user.username}:{profil.interim.code}"[:200] if profil.interim_id else ""
    Publication.objects.filter(perimetre_detail__startswith=f"pleinement:{user.username}:").exclude(
        perimetre_detail=marque,
    ).exclude(statut=Publication.Statut.CLOTURE).update(statut=Publication.Statut.CLOTURE)
    if not marque or Publication.objects.filter(perimetre_detail=marque).exclude(statut=Publication.Statut.CLOTURE).exists():
        return
    poste = profil.interim
    role = _role_responsable(poste).lower()
    nom = user.get_full_name() or user.username
    titulaire = _responsable(poste, user.username)
    if titulaire is None:
        intitule = f"Intérim plein du poste de {role} — {poste.nom}"[:240]
        corps = (
            f"{nom} est nommé intérimaire du poste de {role} de {poste.nom}, qui n'est pas désigné. "
            "Il en assure pleinement les fonctions jusqu'à la nomination du titulaire."
        )
    else:
        intitule = f"Intérim de {titulaire.get_full_name()} — {poste.nom}"[:240]
        corps = (
            f"{nom} est nommé intérimaire de {titulaire.get_full_name()}, {role} de {poste.nom}. "
            "Il en assure pleinement les fonctions en son absence."
        )
    emise = _est_drh(grantor)
    Publication.objects.create(
        reference=_reference(),
        nature=Publication.Nature.NOTE,
        urgence=Publication.Urgence.IMPORTANT,
        intitule=intitule,
        corps=corps,
        perimetre=Publication.Perimetre.TOUS,
        perimetre_detail=marque,
        statut=Publication.Statut.DIFFUSE if emise else Publication.Statut.VISA,
        etape_visa="" if emise else ETAPE_DRH,
        accuse=True,
        signataire=grantor.get_full_name() or grantor.username,
        visa=f"Émise par {grantor.get_full_name() or grantor.username}" if emise else "",
        auteur=grantor,
        publiee_le=timezone.now() if emise else None,
    )
    message = corps[:280]
    maintenant = timezone.now()
    if emise:
        Notification.objects.create(
            destinataire=user, categorie=Notification.Categorie.SYSTEME, titre="Note de service",
            message=message, lien="/app/communication", creee_le=maintenant,
        )
        return
    for destinataire in User.objects.filter(is_active=True, profil__role="Directeur", profil__structure__code="drh"):
        Notification.objects.create(
            destinataire=destinataire, categorie=Notification.Categorie.VISA, titre="Note de service à viser",
            message=message, lien="/app/communication", urgente=True, creee_le=maintenant,
        )


def _roles_superieurs(role: str) -> list[str]:
    item = RoleMatrice.objects.filter(role=role).first()
    if item is None:
        return []
    return [str(nom) for nom in (item.superieurs or [])]


def _habilitations_demande(data, role: str, grantor: User) -> tuple[list[str] | None, Response | None]:
    if not data.get("personnaliser"):
        return None, None
    brut = data.get("habilitations")
    colonnes = _modules()
    if not isinstance(brut, list) or len(brut) != len(colonnes):
        return None, Response({"detail": "Indiquez un droit pour chaque module."}, status=400)
    if not hasattr(grantor, "profil"):
        return None, Response({"detail": "Votre compte ne peut pas déléguer d'habilitation."}, status=400)
    defaut = _defaut_role(role, len(colonnes))
    plafond = _effectives(grantor.profil)
    resultat = []
    for index, valeur in enumerate(brut):
        if valeur not in RANG:
            return None, Response({"detail": "Chaque habilitation est lecture, saisie, validation ou accès refusé."}, status=400)
        toit = max(RANG[defaut[index]], RANG[plafond[index]] if index < len(plafond) else 0)
        if RANG[valeur] > toit:
            return None, Response(
                {"detail": f"Vous ne pouvez pas accorder plus que votre propre droit sur {colonnes[index].libelle}."},
                status=400,
            )
        resultat.append(valeur)
    return resultat, None


def _precisions_demande(data, role: str, habilitations: list[str] | None, grantor: User) -> tuple[dict | None, Response | None]:
    if habilitations is None:
        return None, None
    brut = data.get("precisions") or {}
    if not isinstance(brut, dict):
        return None, Response({"detail": "Les précisions de fonction sont invalides."}, status=400)
    if not hasattr(grantor, "profil"):
        return None, Response({"detail": "Votre compte ne peut pas déléguer d'habilitation."}, status=400)
    colonnes = _modules()
    fonctions = {fonction.pk: (index, fonction) for index, module in enumerate(colonnes) for fonction in module.fonctions.all()}
    role_droits = _defaut_role(role, len(colonnes))
    role_precisions = _precisions_role(role)
    plafond = _effectives(grantor.profil)
    plafond_precisions = _precisions_resolues(grantor.profil)
    resultat = {}
    for cle, valeur in brut.items():
        if valeur in (None, "", "herite"):
            continue
        try:
            fonction_id = int(cle)
        except (TypeError, ValueError):
            return None, Response({"detail": "Une fonction indiquée est inconnue."}, status=400)
        trouve = fonctions.get(fonction_id)
        if trouve is None:
            return None, Response({"detail": "Une fonction indiquée est inconnue."}, status=400)
        if valeur not in RANG:
            return None, Response({"detail": "Chaque fonction est en lecture, saisie, validation ou accès refusé."}, status=400)
        index, fonction = trouve
        if valeur == habilitations[index]:
            continue
        du_role = _droit_fonction(role_droits, role_precisions, index, fonction.pk)
        du_responsable = plafond_precisions.get(str(fonction.pk), plafond[index] if index < len(plafond) else "refus")
        if RANG[valeur] > max(RANG[du_role], RANG[du_responsable]):
            return None, Response(
                {"detail": f"Vous ne pouvez pas accorder plus que votre propre droit sur {fonction.libelle}."},
                status=400,
            )
        resultat[str(fonction.pk)] = valeur
    return resultat, None


def _valider(data, creation: bool, grantor: User) -> tuple[dict | None, Response | None]:
    nom = _texte(data.get("nom"))
    prenoms = _texte(data.get("prenoms"))
    fonction = _texte(data.get("fonction"))
    role = _texte(data.get("role"))
    structure_code = _texte(data.get("structure"))
    courriel = _texte(data.get("courriel"))
    mot_de_passe = str(data.get("mot_de_passe") or "")
    confirmation = str(data.get("confirmation") or "")
    if not nom or not prenoms:
        return None, Response({"detail": "Indiquez le nom et les prénoms."}, status=400)
    if role not in _roles():
        return None, Response({"detail": "Choisissez un rôle reconnu."}, status=400)
    if mot_de_passe or confirmation:
        if mot_de_passe != confirmation:
            return None, Response({"detail": "La confirmation du mot de passe ne correspond pas."}, status=400)
    if creation or mot_de_passe:
        if len(mot_de_passe) < 8:
            return None, Response({"detail": "Le mot de passe doit compter au moins 8 caractères."}, status=400)
    matricule = _texte(data.get("matricule"))
    matricule_superieur = _texte(data.get("superieur"))
    structure = EntiteTutelle.objects.select_related("pole", "parent").filter(code=structure_code).first()
    if structure is None:
        return None, Response({"detail": "Choisissez une structure du ministère."}, status=400)
    role_responsable = _role_responsable(structure)
    if role != "Agent" and role != role_responsable:
        return None, Response({"detail": "Le rôle ne correspond pas au niveau de cette structure."}, status=400)
    if role == "Agent":
        responsable = _referent(structure, matricule)
        if responsable is None:
            return None, Response({"detail": "Désignez d'abord le premier responsable de cette structure."}, status=400)
        if matricule_superieur != responsable.username:
            return None, Response({"detail": "Le supérieur d'un agent est le premier responsable de sa structure, ou l'intérimaire si le poste n'est pas désigné."}, status=400)
        superieur = responsable
    else:
        if _responsable(structure, matricule) is not None:
            return None, Response({"detail": "Cette structure a déjà un premier responsable."}, status=400)
        if structure.parent_id:
            responsable = _referent(structure.parent, matricule)
            if responsable is None:
                if structure.parent.niveau == "ministere" and matricule_superieur:
                    return None, Response({"detail": "Le supérieur d'un directeur général est le ministre."}, status=400)
                if matricule_superieur:
                    return None, Response({"detail": "Le supérieur est le premier responsable de la structure de rattachement."}, status=400)
                superieur = None
            elif matricule_superieur != responsable.username:
                detail = "Le supérieur d'un directeur général est le ministre." if structure.parent.niveau == "ministere" else "Le supérieur est le premier responsable de la structure de rattachement."
                return None, Response({"detail": detail}, status=400)
            else:
                superieur = responsable
        else:
            if matricule_superieur:
                detail = "Le ministre est au sommet de la chaîne hiérarchique." if structure.niveau == "ministere" else "Le premier responsable de cette structure n'a pas de supérieur hiérarchique."
                return None, Response({"detail": detail}, status=400)
            superieur = None
    organisme, _cree = Organisme.objects.get_or_create(
        code=structure.pole.code,
        defaults={"sigle": structure.pole.code.upper()[:40], "nom": structure.pole.nom},
    )
    if creation and (not matricule or " " in matricule or len(matricule) > 150):
        return None, Response({"detail": "Indiquez un matricule, sans espace."}, status=400)
    habilitations, erreur = _habilitations_demande(data, role, grantor)
    if erreur:
        return None, erreur
    precisions, erreur = _precisions_demande(data, role, habilitations, grantor)
    if erreur:
        return None, erreur
    if creation and not _racine_ministere(grantor):
        if superieur is None or superieur.pk != grantor.pk:
            return None, Response(
                {"detail": "Vous ne pouvez ouvrir un compte que pour une personne sous votre supervision."},
                status=400,
            )
    if habilitations is not None and not est_administrateur(grantor) and (superieur is None or superieur.pk != grantor.pk):
        return None, Response(
            {"detail": "Seul le supérieur hiérarchique peut écarter ce compte du rôle par défaut."},
            status=400,
        )
    code_interim = _texte(data.get("interimaire"))
    poste_interim = None
    if code_interim:
        poste_interim = EntiteTutelle.objects.filter(code=code_interim).first()
        if poste_interim is None:
            return None, Response({"detail": "Le poste d'intérim est inconnu."}, status=400)
        if role != "Agent" and poste_interim.pk == structure.pk:
            return None, Response({"detail": "Le premier responsable n'est pas l'intérimaire de son propre poste."}, status=400)
        deja = _interimaire(poste_interim, matricule)
        if deja is not None:
            return None, Response(
                {"detail": f"{deja.get_full_name() or deja.username} est déjà l'intérimaire de ce poste."},
                status=400,
            )
    return {
        "matricule": matricule,
        "nom": nom,
        "prenoms": prenoms,
        "fonction": fonction,
        "role": role,
        "organisme": organisme,
        "structure": structure,
        "superieur": superieur,
        "interim": poste_interim,
        "courriel": courriel,
        "mot_de_passe": mot_de_passe,
        "habilitations": habilitations,
        "precisions": precisions,
    }, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def utilisateurs(request):
    if request.method == "GET":
        comptes = User.objects.filter(profil__isnull=False, profil__administrateur=False).select_related(
            "profil", "profil__organisme", "profil__structure", "profil__structure__pole",
            "profil__structure__parent", "profil__superieur", "profil__interim",
        ).order_by("last_name", "first_name")
        identifiants = perimetre_ids(request.user)
        if identifiants is not None:
            comptes = comptes.filter(pk__in=identifiants)
        return Response({
            "utilisateurs": [_ligne(user, request.user) for user in comptes],
            "modules": [
                {
                    "libelle": module.libelle,
                    "fonctions": [{"id": fonction.pk, "libelle": fonction.libelle} for fonction in module.fonctions.all()],
                }
                for module in _modules()
            ],
            "mes_droits": _effectives(request.user.profil) if hasattr(request.user, "profil") else [],
            "mes_precisions": _precisions_resolues(request.user.profil) if hasattr(request.user, "profil") else {},
            "roles": [
                {
                    "role": item.role,
                    "description": item.description,
                    "superieurs": item.superieurs or [],
                    "droits": _defaut_role(item.role, ModuleHabilitation.objects.count()),
                    "precisions": _precisions_role(item.role),
                }
                for item in RoleMatrice.objects.all()
            ],
            "structures": [
                _ligne_structure(item)
                for item in EntiteTutelle.objects.select_related("pole", "parent")
            ],
            "organismes": [{"code": item.code, "nom": item.nom, "sigle": item.sigle} for item in Organisme.objects.all()],
            "administrateur": est_administrateur(request.user),
        })

    saisie, erreur = _valider(request.data, creation=True, grantor=request.user)
    if erreur:
        return erreur
    if User.objects.filter(username=saisie["matricule"]).exists():
        return Response({"detail": "Ce matricule est déjà utilisé."}, status=400)
    user = User.objects.create_user(
        username=saisie["matricule"],
        password=saisie["mot_de_passe"],
        first_name=saisie["prenoms"],
        last_name=saisie["nom"],
        email=saisie["courriel"],
    )
    Profil.objects.create(
        user=user,
        fonction=saisie["fonction"],
        role=saisie["role"],
        organisme=saisie["organisme"],
        structure=saisie["structure"],
        superieur=saisie["superieur"],
        interim=saisie["interim"],
        habilitations=saisie["habilitations"],
        precisions=saisie["precisions"],
    )
    _constater_interim(user, saisie["structure"], request.user)
    _constater_pleinement(user, request.user)
    return Response(_ligne(user, request.user), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def utilisateur(request, matricule: str):
    user = User.objects.filter(username=matricule, profil__isnull=False).select_related("profil", "profil__organisme", "profil__structure", "profil__superieur").first()
    if user is None or (perimetre_ids(request.user) is not None and user.pk not in perimetre_ids(request.user)):
        return Response({"detail": "Compte introuvable."}, status=404)
    if user.profil.administrateur:
        return Response({"detail": "Le compte administrateur se gère dans les paramètres de connexion."}, status=400)
    if request.method == "DELETE":
        return _supprimer(request, user)
    saisie, erreur = _valider({**_actuel(user), **request.data}, creation=False, grantor=request.user)
    if erreur:
        return erreur
    if not _attributions_identiques(user.profil, saisie["habilitations"], saisie["precisions"]):
        if not est_administrateur(request.user) and user.profil.superieur_id != request.user.pk:
            return Response(
                {"detail": "Seul le supérieur hiérarchique peut modifier les attributions de ce compte."},
                status=400,
            )
    actif = request.data.get("actif", user.is_active)
    if isinstance(actif, str):
        actif = actif.lower() in {"1", "true", "oui"}
    if user.pk == request.user.pk and not actif:
        return Response({"detail": "Vous ne pouvez pas suspendre votre propre compte."}, status=400)
    user.first_name = saisie["prenoms"]
    user.last_name = saisie["nom"]
    user.email = saisie["courriel"]
    user.is_active = bool(actif)
    if saisie["mot_de_passe"]:
        user.set_password(saisie["mot_de_passe"])
    user.save()
    profil = user.profil
    profil.fonction = saisie["fonction"]
    profil.role = saisie["role"]
    profil.organisme = saisie["organisme"]
    profil.structure = saisie["structure"]
    profil.superieur = saisie["superieur"]
    profil.interim = saisie["interim"]
    profil.habilitations = saisie["habilitations"]
    profil.precisions = saisie["precisions"]
    profil.save()
    _constater_interim(user, saisie["structure"], request.user)
    _constater_pleinement(user, request.user)
    return Response(_ligne(user, request.user))


def _supprimer(request, user: User):
    if user.pk == request.user.pk:
        return Response({"detail": "Vous ne pouvez pas supprimer votre propre compte."}, status=400)
    equipe = list(Profil.objects.filter(superieur=user).select_related("user")[:5])
    if equipe:
        noms = ", ".join(item.user.get_full_name() or item.user.username for item in equipe)
        return Response(
            {"detail": f"Ce compte encadre encore {noms}. Réaffectez ces personnes avant de le supprimer."},
            status=400,
        )
    user.delete()
    return Response(status=204)


def _actuel(user: User) -> dict:
    profil = user.profil
    return {
        "matricule": user.username,
        "nom": user.last_name,
        "prenoms": user.first_name,
        "courriel": user.email,
        "fonction": profil.fonction,
        "role": profil.role,
        "structure": profil.structure.code if profil.structure_id else "",
        "superieur": profil.superieur.username if profil.superieur_id else "",
        "interimaire": profil.interim.code if profil.interim_id else "",
        "personnaliser": profil.habilitations is not None,
        "habilitations": _effectives(profil),
        "precisions": _precisions_compte(profil),
    }


def acces_menu(profil: Profil) -> dict:
    """Droits effectifs du compte, pour griser les entrées de menu hors habilitation."""
    modules = _modules()
    droits = _effectives(profil)
    resolues = _precisions_resolues(profil)
    return {
        "modules": {
            module.libelle: droits[index] if index < len(droits) else "refus"
            for index, module in enumerate(modules)
        },
        "fonctions": {
            f"{module.libelle}|{fonction.libelle}": resolues.get(
                str(fonction.pk), droits[index] if index < len(droits) else "refus"
            )
            for index, module in enumerate(modules)
            for fonction in module.fonctions.all()
        },
    }
