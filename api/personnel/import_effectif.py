"""Chargement initial de l'effectif du ministère depuis un classeur Excel.

Le classeur remplace la saisie dossier par dossier : chaque ligne crée (ou met à jour) un agent, son rattachement à une
structure des paramètres et son compte de connexion. Le matricule est l'identifiant ; le mot de passe initial est
`matricule@2026`, et l'agent est invité à le changer. Une première fois, le chargement peut remplacer toutes les
données de démonstration.
"""

import re
import zipfile
from datetime import date
from xml.etree import ElementTree

from django.apps import apps
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import ProtectedError
from django.utils import timezone

from .classeur import habiller
from .dotation_agents import appliquer_rattachement
from .import_agents import ImportInvalide, _date as _lire_date, _norm, _texte, _vide
from .import_structures import _Ligne, _erreur, _feuille, _resume
from .models import (
    Agent,
    EmploiReferentiel,
    EntiteTutelle,
    GradeReferentiel,
    Notification,
    Organisme,
    ParametresMinistere,
    Profil,
    RoleMatrice,
)
from .nomenclature import FAMILLES
from .rattachement import structures_par_nom

TAILLE_MAX = 5 * 1024 * 1024
LIGNES_MAX = 5000
MOT_DE_PASSE_INITIAL = "{matricule}@2026"
MATRICULE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$")
COURRIEL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# champ, en-tête, alias, obligatoire, format, valeurs admises, exemple, description
COLONNES = (
    ("matricule", "Matricule", (), True, "Texte, sans espace, 2 à 32 caractères", "Unique dans le classeur", "349812K", "Identifiant de l'agent et nom d'utilisateur de connexion."),
    ("nom", "Nom", (), True, "Texte", "", "KOFFI", "Nom de famille."),
    ("prenoms", "Prénoms", (), True, "Texte", "", "Yao Christian", "Tous les prénoms."),
    ("sexe", "Sexe", (), True, "H ou F", "H, F (Homme, Femme)", "H", "Genre de l'agent."),
    ("date_naissance", "Date de naissance", (), True, "JJ/MM/AAAA ou AAAA-MM-JJ", "", "14/03/1981", "Sert au calcul de la limite d'âge et de la tranche d'âge."),
    ("lieu_naissance", "Lieu de naissance", (), False, "Texte", "", "Abidjan", ""),
    ("situation_matrimoniale", "Situation matrimoniale", (), False, "Texte", "Célibataire, Marié(e), Veuf(ve), Divorcé(e)", "Marié(e)", ""),
    ("telephone", "Téléphone", (), False, "Texte", "", "+225 07 00 00 00 00", ""),
    ("courriel", "Courriel", (), False, "Adresse courriel", "", "agent@exemple.ci", ""),
    ("structure", "Structure d'affectation", ("structure",), True, "Nom exact d'une structure", "Feuille Structures", "Service des actes", "Service, sous-direction ou direction de l'agent. Elle doit exister dans Paramètres > Structures du ministère."),
    ("emploi", "Emploi", (), False, "Nom exact d'un emploi", "Feuille Emplois", "Administrateur civil", "Emploi de la nomenclature reconnue par la Fonction publique."),
    ("grade", "Grade", (), True, "Code du grade", "Feuille Grades", "A4", "La catégorie (A, B, C, D) s'en déduit."),
    ("echelon", "Échelon", (), False, "Nombre ou texte", "", "3", ""),
    ("corps", "Corps", (), False, "Texte", "", "Corps des administrateurs civils", ""),
    ("fonction", "Fonction", (), False, "Texte", "", "Chef de service", "Fonction exercée (chef de service, sous-directeur…)."),
    ("type_agent", "Type d'agent", ("statut",), True, "Fonctionnaire ou Contractuel", "Fonctionnaire, Contractuel", "Fonctionnaire", "Alimente l'état des effectifs par statut."),
    ("mode_recrutement", "Mode de recrutement", (), False, "Texte", "", "Concours", ""),
    ("prise_service", "Date de première prise de service", ("premiere prise de service",), False, "JJ/MM/AAAA ou AAAA-MM-JJ", "", "12/01/2005", "Entrée dans la Fonction publique."),
    ("prise_service_ministere", "Date de prise de service au ministère", ("date de prise de service dans le ministere",), False, "JJ/MM/AAAA ou AAAA-MM-JJ", "", "01/10/2018", ""),
    ("situation", "Situation", ("position",), False, "Texte", "En activité (par défaut), En détachement, En disponibilité, Mis à disposition…", "En activité", "Sans valeur, l'agent est en activité."),
    ("role", "Rôle dans l'application", ("role",), False, "Nom d'un rôle", "Agent (par défaut), Chef de service, Sous directeur, Directeur…", "Chef de service", "Détermine les droits. Un rôle autre qu'Agent rattache le compte à la structure dont il est responsable."),
    ("superieur", "Supérieur hiérarchique", ("matricule du superieur",), False, "Matricule", "Matricule d'un agent du classeur", "455870T", "Définit qui encadre l'agent : ses demandes remontent à ce compte."),
)
CHAMPS = tuple((champ, titre, alias) for champ, titre, alias, *_reste in COLONNES)
SEXES = {"h": "H", "homme": "H", "m": "H", "masculin": "H", "f": "F", "femme": "F", "feminin": "F", "féminin": "F"}
MATRIMONIAL = {
    "celibataire": "celibataire", "célibataire": "celibataire", "marie": "marie", "marié": "marie", "mariee": "marie", "marié(e)": "marie",
    "veuf": "veuf", "veuve": "veuf", "veuf(ve)": "veuf", "veuf / veuve": "veuf", "divorce": "divorce", "divorcé": "divorce", "divorcee": "divorce", "divorcé(e)": "divorce",
}
TYPES_AGENT = {"fonctionnaire": "Fonctionnaire", "contractuel": "Contractuel", "contractuelle": "Contractuel"}

# Les référentiels et les réglages restent ; tout le reste vient du jeu de démonstration.
A_SUPPRIMER = (
    "Agent", "SituationSociale", "Notification", "Conversation", "Participation", "Message", "Publication", "LecturePublication",
    "Communication", "ConsultationFlash", "ReponseSondage", "SessionFormation", "Prestataire", "PlanFormation", "CollecteBesoinFormation",
    "BesoinFormation", "EnveloppeSociale", "DemandeDotation", "AlertePoste", "Passerelle", "JournalEffectif", "CampagneBesoin",
    "SessionParitaire", "PilotageFinCarriere", "ActionAccompagnement", "DistinctionCarriere", "CampagnePlanConge", "RappelRetour",
    "CompositionStatistique", "AlerteReleve", "MouvementStrategique", "Demande", "Acte", "VisaEnAttente",
)


# --- Modèle -----------------------------------------------------------------------------------------------------


def modele() -> bytes:
    entetes = [titre for _champ, titre, *_reste in COLONNES]
    consignes = [["Colonne", "Obligatoire", "Format", "Valeurs admises", "Exemple", "Description"]]
    for _champ, titre, _alias, obligatoire, format_, valeurs, exemple, description in COLONNES:
        consignes.append([titre, "Oui" if obligatoire else "Non", format_, valeurs or "Libre", exemple, description])
    structures = [["Nom", "Niveau", "Rattachement"]]
    for e in EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).select_related("parent").order_by("ordre", "nom"):
        structures.append([e.nom, e.get_niveau_display(), e.parent.nom if e.parent_id and e.parent.niveau != EntiteTutelle.Niveau.MINISTERE else ""])
    grades = [["Code", "Catégorie", "Définition"]] + [[g.code, g.categorie, g.libelle] for g in GradeReferentiel.objects.order_by("ordre", "code")]
    emplois = [["Nom", "Famille", "Grade"]] + [[e.libelle, dict(FAMILLES).get(e.famille, e.famille), e.grade.code] for e in EmploiReferentiel.objects.select_related("grade").order_by("famille", "libelle")]
    roles = sorted(RoleMatrice.objects.values_list("role", flat=True))
    valeurs = [["Liste", "Valeur"]]
    valeurs += [["Sexe", "H (Homme)"], ["Sexe", "F (Femme)"], ["Type d'agent", "Fonctionnaire"], ["Type d'agent", "Contractuel"]]
    valeurs += [["Rôle", "Agent"]] + [["Rôle", r] for r in roles if r != "Agent"]
    valeurs += [["Situation matrimoniale", v] for v in ("Célibataire", "Marié(e)", "Veuf(ve)", "Divorcé(e)")]
    return habiller([
        {"nom": "Agents", "titre": "SIGRH  ·  Effectif du ministère", "sous_titre": "Une ligne par agent. Les colonnes marquées d'un astérisque dans la feuille Consignes sont obligatoires.",
         "notice": "Ne modifiez ni l'ordre ni les titres des colonnes. Choisissez la structure, l'emploi et le grade dans les feuilles Structures, Emplois et Grades. Chaque agent reçoit un compte : matricule comme identifiant, matricule@2026 comme mot de passe initial.",
         "lignes": [entetes], "saisies": 200},
        {"nom": "Consignes", "titre": "Mode d'emploi du chargement de l'effectif", "sous_titre": "Ce classeur alimente l'application en une fois, à la place de la saisie dossier par dossier.",
         "notice": "1. Remplissez la feuille Agents. 2. Dans Paramètres, chargez le classeur. 3. Si une ligne est incorrecte, rien n'est enregistré et les lignes à corriger sont listées. 4. Au premier chargement, vous pouvez remplacer les données de démonstration : elles disparaissent alors.",
         "lignes": consignes, "onglet": "FF0B1C30"},
        {"nom": "Structures", "titre": "Structures du ministère", "sous_titre": "Recopiez le nom exact dans la colonne Structure d'affectation.", "notice": "Cette feuille n'est pas importée. Les structures se gèrent dans Paramètres > Structures du ministère.", "lignes": structures, "onglet": "FF9E4300"},
        {"nom": "Grades", "titre": "Grades", "sous_titre": "Recopiez le code dans la colonne Grade.", "notice": "Cette feuille n'est pas importée.", "lignes": grades, "onglet": "FF9E4300"},
        {"nom": "Emplois", "titre": "Emplois reconnus par la Fonction publique", "sous_titre": "Recopiez le nom exact dans la colonne Emploi.", "notice": "Cette feuille n'est pas importée.", "lignes": emplois, "onglet": "FF9E4300"},
        {"nom": "Valeurs", "titre": "Valeurs admises", "sous_titre": "Sexe, type d'agent, rôle et situation matrimoniale.", "notice": "Cette feuille n'est pas importée.", "lignes": valeurs, "onglet": "FF9E4300"},
    ])


# --- Lecture et validation ---------------------------------------------------------------------------------------


def _obligatoire(valeur, libelle: str, numero: int) -> str:
    if _vide(valeur):
        raise _Ligne(numero, f"{libelle} est obligatoire.")
    return _texte(valeur)


def _date_ligne(valeur, libelle: str, numero: int) -> date | None:
    if _vide(valeur):
        return None
    try:
        return date.fromisoformat(_lire_date(valeur, libelle))
    except Exception as exc:  # noqa: BLE001 - le message de la lecture de date est déjà lisible
        raise _Ligne(numero, str(exc)) from exc


def _preparer(lignes, structures, grades, emplois, roles) -> tuple[list[dict], list[dict]]:
    erreurs: list[dict] = []
    plans: list[dict] = []
    vus: dict[str, int] = {}
    for numero, v in lignes:
        try:
            matricule = _obligatoire(v.get("matricule"), "Le matricule", numero)
            if not MATRICULE.match(matricule):
                raise _Ligne(numero, f"Le matricule « {matricule} » est invalide : 2 à 32 caractères, lettres, chiffres, point, tiret ou souligné.")
            if matricule.casefold() in vus:
                raise _Ligne(numero, f"Le matricule « {matricule} » figure déjà à la ligne {vus[matricule.casefold()]}.")
            vus[matricule.casefold()] = numero
            nom = _obligatoire(v.get("nom"), "Le nom", numero)[:80]
            prenoms = _obligatoire(v.get("prenoms"), "Les prénoms", numero)[:120]
            sexe = SEXES.get(_norm(_obligatoire(v.get("sexe"), "Le sexe", numero)))
            if sexe is None:
                raise _Ligne(numero, "Le sexe vaut H (homme) ou F (femme).")
            naissance = _date_ligne(v.get("date_naissance"), "date de naissance", numero)
            if naissance is None:
                raise _Ligne(numero, "La date de naissance est obligatoire.")
            if not 1930 <= naissance.year <= timezone.localdate().year - 15:
                raise _Ligne(numero, f"La date de naissance {naissance:%d/%m/%Y} n'est pas plausible.")
            structure = structures.get(_norm(_obligatoire(v.get("structure"), "La structure d'affectation", numero)))
            if structure is None:
                raise _Ligne(numero, f"La structure « {_texte(v.get('structure'))} » n'existe pas dans les paramètres. Recopiez un nom de la feuille Structures.")
            grade = grades.get(_obligatoire(v.get("grade"), "Le grade", numero).casefold())
            if grade is None:
                raise _Ligne(numero, f"Le grade « {_texte(v.get('grade'))} » est inconnu. Recopiez un code de la feuille Grades.")
            emploi = None
            if not _vide(v.get("emploi")):
                emploi = emplois.get(_norm(_texte(v.get("emploi"))))
                if emploi is None:
                    raise _Ligne(numero, f"L'emploi « {_texte(v.get('emploi'))} » n'est pas reconnu par la Fonction publique. Recopiez un nom de la feuille Emplois.")
            type_agent = TYPES_AGENT.get(_norm(_obligatoire(v.get("type_agent"), "Le type d'agent", numero)))
            if type_agent is None:
                raise _Ligne(numero, "Le type d'agent vaut Fonctionnaire ou Contractuel.")
            role = "Agent"
            if not _vide(v.get("role")):
                role = roles.get(_norm(_texte(v.get("role"))))
                if role is None:
                    raise _Ligne(numero, f"Le rôle « {_texte(v.get('role'))} » n'existe pas. Recopiez un rôle de la feuille Valeurs.")
            matrimonial = ""
            if not _vide(v.get("situation_matrimoniale")):
                matrimonial = MATRIMONIAL.get(_norm(_texte(v.get("situation_matrimoniale"))), "")
                if not matrimonial:
                    raise _Ligne(numero, "La situation matrimoniale vaut Célibataire, Marié(e), Veuf(ve) ou Divorcé(e).")
            courriel = "" if _vide(v.get("courriel")) else _texte(v.get("courriel"))
            if courriel and not COURRIEL.match(courriel):
                raise _Ligne(numero, f"Le courriel « {courriel} » est invalide.")
            premiere = _date_ligne(v.get("prise_service"), "date de première prise de service", numero)
            echelon = "" if _vide(v.get("echelon")) else _texte(v.get("echelon")).removesuffix(".0")
            plans.append({
                "ligne": numero, "matricule": matricule, "nom": nom, "prenoms": prenoms, "sexe": sexe, "date_naissance": naissance,
                "lieu_naissance": "" if _vide(v.get("lieu_naissance")) else _texte(v.get("lieu_naissance"))[:160],
                "statut_matrimonial": matrimonial,
                "telephone": "" if _vide(v.get("telephone")) else _texte(v.get("telephone"))[:40], "courriel": courriel,
                "structure": structure, "emploi": emploi.libelle if emploi else "", "grade": grade.code, "categorie": grade.categorie,
                "echelon": echelon[:20], "corps": "" if _vide(v.get("corps")) else _texte(v.get("corps"))[:180],
                "fonction": "" if _vide(v.get("fonction")) else _texte(v.get("fonction"))[:180], "type_agent": type_agent,
                "mode_recrutement": "" if _vide(v.get("mode_recrutement")) else _texte(v.get("mode_recrutement"))[:120],
                "prise_service": premiere.isoformat() if premiere else "",
                "prise_service_ministere": _date_ligne(v.get("prise_service_ministere"), "date de prise de service au ministère", numero),
                "situation": "En activité" if _vide(v.get("situation")) else _texte(v.get("situation"))[:80],
                "role": role, "superieur": "" if _vide(v.get("superieur")) else _texte(v.get("superieur")),
            })
        except _Ligne as exc:
            erreurs.append(_erreur("Agents", exc))
    return plans, erreurs


# --- Données de démonstration ---------------------------------------------------------------------------------------


def purger_donnees_factices(garder: set[int]) -> dict[str, int]:
    """Supprime les données de démonstration ; les référentiels, les paramètres et les comptes protégés restent."""
    supprimes: dict[str, int] = {}
    restants = [apps.get_model("personnel", nom) for nom in A_SUPPRIMER]
    for _tour in range(len(restants) + 3):
        suivants = []
        for modele_ in restants:
            nombre = modele_.objects.count()
            try:
                modele_.objects.all().delete()
            except ProtectedError:
                suivants.append(modele_)
                continue
            if nombre:
                supprimes[modele_.__name__] = supprimes.get(modele_.__name__, 0) + nombre
        if not suivants:
            break
        restants = suivants

    Profil.objects.filter(user_id__in=garder, superieur__isnull=False).exclude(superieur_id__in=garder).update(superieur=None)
    comptes = User.objects.exclude(pk__in=garder).exclude(is_superuser=True)
    supprimes["Comptes"] = comptes.count()
    Profil.objects.filter(user__in=comptes).delete()
    comptes.delete()
    for organisme in Organisme.objects.all():
        try:
            organisme.delete()
        except ProtectedError:
            continue
    return {cle: valeur for cle, valeur in supprimes.items() if valeur}


def donnees_factices_presentes() -> bool:
    parametres = ParametresMinistere.objects.filter(pk=1).first()
    return not (parametres and parametres.donnees_reelles)


# --- Chargement ---------------------------------------------------------------------------------------------------------


def _organisme_defaut() -> Organisme:
    organisme, _ = Organisme.objects.get_or_create(code="mpeep", defaults={"nom": "Ministère", "sigle": "MPEEP"})
    return organisme


def _initiales(nom: str, prenoms: str) -> str:
    return ((nom[:1] + prenoms[:1]).upper() or "AG")[:4]


def importer(contenu: bytes, user: User, remplacer: bool = False) -> dict:
    if len(contenu) > TAILLE_MAX:
        raise ImportInvalide("Le classeur dépasse 5 Mo.")
    try:
        lignes = _feuille(contenu, "Agents", CHAMPS)
    except (zipfile.BadZipFile, ElementTree.ParseError, KeyError, ValueError) as exc:
        raise ImportInvalide("Ce fichier n'est pas un classeur Excel .xlsx lisible.") from exc
    if not lignes:
        raise ImportInvalide("Le classeur ne contient aucun agent. Renseignez la feuille Agents du modèle.")
    if len(lignes) > LIGNES_MAX:
        raise ImportInvalide(f"Le classeur dépasse {LIGNES_MAX} agents. Découpez le chargement.")

    structures = {_norm(e.nom): e for e in EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE)}
    grades = {g.code.casefold(): g for g in GradeReferentiel.objects.all()}
    emplois = {_norm(e.libelle): e for e in EmploiReferentiel.objects.all()}
    roles = {_norm(r): r for r in RoleMatrice.objects.values_list("role", flat=True)}
    roles.setdefault(_norm("Agent"), "Agent")
    plans, erreurs = _preparer(lignes, structures, grades, emplois, roles)

    # Un supérieur doit être un agent du classeur, ou un compte conservé.
    garder = {user.pk} | set(User.objects.filter(is_superuser=True).values_list("pk", flat=True))
    garder |= set(Profil.objects.filter(administrateur=True).values_list("user_id", flat=True))
    dans_le_classeur = {p["matricule"].casefold() for p in plans}
    comptes_conserves = set(User.objects.filter(pk__in=garder).values_list("username", flat=True)) if remplacer else set(User.objects.values_list("username", flat=True))
    for plan in plans:
        sup = plan["superieur"]
        if sup and sup.casefold() not in dans_le_classeur and sup not in comptes_conserves:
            erreurs.append({"ligne": plan["ligne"], "message": f"Feuille Agents — Le supérieur « {sup} » n'est pas un agent du classeur."})
        if sup and sup.casefold() == plan["matricule"].casefold():
            erreurs.append({"ligne": plan["ligne"], "message": "Feuille Agents — Un agent ne peut pas être son propre supérieur."})
    if erreurs:
        raise ImportInvalide(_resume(len(erreurs)), sorted(erreurs, key=lambda e: e["ligne"]))

    with transaction.atomic():
        supprimes = purger_donnees_factices(garder) if remplacer else {}
        organisme = _organisme_defaut()
        crees = mis_a_jour = comptes_crees = 0
        utilisateurs: dict[str, User] = {}
        for plan in plans:
            valeurs = {
                "nom": plan["nom"], "prenoms": plan["prenoms"], "initiales": _initiales(plan["nom"], plan["prenoms"]), "sexe": plan["sexe"],
                "date_naissance": plan["date_naissance"], "lieu_naissance": plan["lieu_naissance"], "statut_matrimonial": plan["statut_matrimonial"],
                "telephone": plan["telephone"], "courriel": plan["courriel"], "emploi": plan["emploi"], "grade": plan["grade"],
                "categorie": plan["categorie"], "echelon": plan["echelon"], "corps": plan["corps"], "fonction": plan["fonction"],
                "type_agent": plan["type_agent"], "mode_recrutement": plan["mode_recrutement"], "prise_service": plan["prise_service"],
                "prise_service_ministere": plan["prise_service_ministere"], "situation": plan["situation"], "structure": plan["structure"].nom,
            }
            agent = Agent.objects.filter(matricule__iexact=plan["matricule"]).first()
            if agent is None:
                agent = Agent.objects.create(matricule=plan["matricule"], organisme=organisme, **valeurs)
                crees += 1
            else:
                for cle, valeur in valeurs.items():
                    setattr(agent, cle, valeur)
                agent.save()
                mis_a_jour += 1
            appliquer_rattachement(agent, plan["structure"])

            compte = User.objects.filter(username__iexact=plan["matricule"]).first()
            nouveau = compte is None
            if nouveau:
                compte = User.objects.create_user(
                    username=plan["matricule"], password=MOT_DE_PASSE_INITIAL.format(matricule=plan["matricule"]),
                    first_name=plan["prenoms"][:150], last_name=plan["nom"][:150], email=plan["courriel"],
                )
                comptes_crees += 1
            profil, _ = Profil.objects.get_or_create(
                user=compte, defaults={"fonction": (plan["fonction"] or plan["role"])[:160], "role": plan["role"], "organisme": organisme},
            )
            if not nouveau:
                profil.fonction = (plan["fonction"] or profil.fonction)[:160]
                profil.role = plan["role"]
            profil.structure = plan["structure"] if plan["role"] != "Agent" else None
            profil.save()
            utilisateurs[plan["matricule"].casefold()] = compte
            if nouveau:
                Notification.objects.create(
                    destinataire=compte, categorie=Notification.Categorie.SYSTEME, urgente=True, titre="Bienvenue : changez votre mot de passe",
                    message="Votre accès à SIGRH est créé. Votre identifiant est votre matricule ; votre mot de passe initial est votre matricule suivi de @2026. Modifiez-le dès votre première connexion.",
                    lien=f"/app/agents/{compte.username}", creee_le=timezone.now(),
                )
        for plan in plans:
            if plan["superieur"]:
                chef = utilisateurs.get(plan["superieur"].casefold()) or User.objects.filter(username__iexact=plan["superieur"]).first()
                Profil.objects.filter(user=utilisateurs[plan["matricule"].casefold()]).update(superieur=chef)
        if remplacer:
            ParametresMinistere.objects.get_or_create(pk=1)
            ParametresMinistere.objects.filter(pk=1).update(donnees_reelles=True)

    detail = f"{crees} agent{'s' if crees > 1 else ''} créé{'s' if crees > 1 else ''}, {mis_a_jour} mis à jour, {comptes_crees} compte{'s' if comptes_crees > 1 else ''} de connexion créé{'s' if comptes_crees > 1 else ''}."
    if remplacer:
        detail += " Les données de démonstration ont été supprimées."
    return {"detail": detail, "crees": crees, "mis_a_jour": mis_a_jour, "comptes_crees": comptes_crees, "supprimes": supprimes, "donnees_reelles": True if remplacer else not donnees_factices_presentes()}

