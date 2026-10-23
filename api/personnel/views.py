import re
from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .taches import en_arriere_plan
from .models import (
    Absence,
    Acte,
    Agent,
    AlerteReleve,
    BranchePlafond,
    Demande,
    DemandeDotation,
    EntiteTutelle,
    FicheBesoin,
    FonctionHabilitation,
    PoleMinisteriel,
    Profil,
    EtapeCircuit,
    Evaluation,
    LigneAvancement,
    MouvementStrategique,
    Notification,
    Organisme,
    PrestationSociale,
    ProcedureDisciplinaire,
    Publication,
    SessionFormation,
    InscriptionFormation,
    ModuleHabilitation,
    ParcoursEtape,
    RoleMatrice,
    SnapshotExercice,
    CircuitValidation,
    CompositionStatistique,
    TypeFinCarriere,
    VisaEnAttente,
)
from . import resume_carrieres
from .adhesion import adhesion_complete
from .circuits_config import enregistrer, lister
from .parametres import identite_ministre, portrait_url
from .utilisateurs import acces_menu, perimetre_matricules
from .secretariat import peut_secretariat
from .visibilite import agents_visibles, dans_le_perimetre
from .statistiques import FiltreInconnu, calculer, classeur, diaporama, lire_echeance, synthese
from .statistiques_dynamiques import (
    CompositionInvalide,
    calculer_cube,
    configuration_de,
    decrire_catalogue,
    presenter,
    valider_tableau,
)
from .present import (
    acte_row,
    absence_row,
    agent_brief,
    agent_detail,
    alerte_row,
    avancement_row,
    demande_row,
    mouvement_row,
    notification_row,
    registre_agent,
    visa_row,
)

EXERCICE = 2026


# Textes d'accueil seulement : aucun chiffre. Les indicateurs sont toujours lus dans les registres.
SNAPSHOT_PAR_DEFAUT = {
    "accueil": {
        "titre": "Système intégré de gestion des ressources humaines du Portefeuille de l'État",
        "chapo": "Le socle numérique unifié pour le pilotage des carrières, le suivi des actes administratifs, l'action sociale et le développement des compétences des agents.",
        "piliers": [
            {
                "code": "SD-01", "titre": "Sous-direction de la gestion des carrières",
                "texte": "Cycle statutaire de l'agent, de l'affectation à la liquidation des droits à pension.",
                "points": ["Référentiel matriculaire unique", "Avancements d'échelon et reclassements", "Départs à la retraite (GPEEC)", "Mutations"],
                "lien": "/app/carrieres",
            },
            {
                "code": "SD-02", "titre": "Sous-direction de l'action sociale",
                "texte": "Prévoyance, santé et soutien matériel aux agents.",
                "points": ["Aides exceptionnelles et secours", "Prêts d'équipement et logement", "Médecine du travail"],
                "lien": "/app/action-sociale",
            },
            {
                "code": "SD-03", "titre": "Sous-direction de la formation continue",
                "texte": "Compétences managériales et perfectionnement des agents.",
                "points": ["Besoins annuels de formation", "Cycles de formation", "Dossier de formation de l'agent", "Plan de formation"],
                "lien": "/app/formation",
            },
        ],
    },
    "dashboard": {},
    "carriere": {
        "titre": "Sous-direction de la gestion des carrières",
        "chapo": "Pilotage des actes, des avancements et des mouvements du ministère.",
    },
    "modules": {
        "social": {"titre": "Sous-direction de l'action sociale", "chapo": "Aides, prêts et secours des agents."},
        "formation": {"titre": "Sous-direction de la formation continue", "chapo": "Plans de formation et certifications."},
        "carriere": {"titre": "Actes de carrière", "chapo": "Arrêtés, mutations et disponibilités."},
    },
}


def _snapshot() -> SnapshotExercice:
    snap, _cree = SnapshotExercice.objects.get_or_create(annee=EXERCICE, defaults=SNAPSHOT_PAR_DEFAUT)
    return snap



MOTS_VIDES = {"de", "des", "du", "la", "le", "les", "l", "d", "et", "a", "au", "aux", "en"}
NIVEAUX_COURRIER = {"direction-centrale", "sous-direction", "service"}


def _sigle_structure(structure) -> str:
    """Sigle d'une structure : son code s'il est déjà un sigle, sinon les initiales de son nom."""
    if "-" not in structure.code and len(structure.code) <= 6:
        return structure.code.upper()
    mots = re.split(r"[\s'’\-]+", structure.nom)
    return "".join(mot[0] for mot in mots if mot and mot.lower() not in MOTS_VIDES).upper()


def _reference_courrier(user) -> dict:
    """Éléments du numéro de courrier : sigle du ministère, hiérarchie de la structure de l'imprimeur, ses initiales."""
    chaine = []
    structure = user.profil.structure
    while structure is not None:
        if structure.niveau in NIVEAUX_COURRIER and structure.code != "cabinet":
            chaine.insert(0, _sigle_structure(structure))
        structure = structure.parent
    initiales = "".join(mot[0] for mot in f"{user.last_name} {user.first_name}".split() if mot).lower()
    return {"structures": chaine, "initiales": initiales}

def _me(user, request) -> dict:
    profil = user.profil
    signature = ""
    if profil.signature:
        signature = profil.signature.url
    agent = Agent.objects.filter(matricule=user.username).only("photo").first()
    return {
        "matricule": user.username,
        "nom": user.last_name,
        "prenoms": user.first_name,
        "nom_complet": user.get_full_name(),
        "fonction": profil.fonction,
        "organisme": profil.organisme.nom,
        "organisme_sigle": profil.organisme.sigle,
        "signature_url": signature,
        "photo_url": agent.photo.url if agent and agent.photo else "",
        "administrateur": bool(profil.administrateur),
        "adhesion_complete": adhesion_complete(user),
        "reference_courrier": _reference_courrier(user),
        "secretariat": peut_secretariat(user),
        "acces": acces_menu(profil),
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request):
    return Response({"status": "ok", "service": "sigrh-api"})


def _entier(valeur: int) -> str:
    return f"{valeur:_}".replace("_", " ")


def _chiffres_intro() -> list[dict]:
    """Comptes du registre. Pas de taux inventé (dématerialisation, disponibilité)."""
    return [
        {
            "valeur": _entier(Agent.objects.count()),
            "libelle": "Dossiers ouverts",
            "detail": "Agents enregistrés dans le registre",
            "icone": "groups",
        },
        {
            "valeur": _entier(EntiteTutelle.objects.count()),
            "libelle": "Structures du ministère",
            "detail": "Directions, services et cellules",
            "icone": "account_tree",
        },
        {
            "valeur": _entier(Acte.objects.filter(publie=True).count()),
            "libelle": "Actes publiés",
            "detail": "Actes versés au registre",
            "icone": "description",
        },
    ]


@api_view(["GET"])
@permission_classes([AllowAny])
def accueil(_request):
    snap = _snapshot()
    actes = Acte.objects.filter(publie=True).select_related("agent", "agent__organisme")[:6]
    return Response(
        {
            "exercice": EXERCICE,
            "marque": {
                "sigle": "SIGRH-PORTEFEUILLE",
                "ministere": "Ministère du Portefeuille de l'État et des Entreprises Publiques",
                "devise": "Union - Discipline - Travail",
            },
            "photo_ministre_url": portrait_url(),
            "ministre": identite_ministre(),
            **snap.accueil,
            "piliers": [{cle: valeur for cle, valeur in pilier.items() if cle != "indicateur"} for pilier in snap.accueil.get("piliers", [])],
            "chiffres": _chiffres_intro(),
            "actes_recents": [acte_row(acte) for acte in actes],
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def organismes(_request):
    rows = [
        {"code": item.code, "nom": item.nom, "sigle": item.sigle}
        for item in Organisme.objects.all()
    ]
    return Response(rows)


@api_view(["GET"])
@permission_classes([AllowAny])
def etat_connexion(_request):
    from .connexion_admin import assurer_administrateur, connexion_active, detail_ouverture

    assurer_administrateur()
    return Response({"active": connexion_active(), "detail": detail_ouverture()})


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    from .connexion_admin import assurer_administrateur

    assurer_administrateur()
    matricule = str(request.data.get("matricule") or "").strip()
    password = str(request.data.get("password") or "")
    organisme_code = str(request.data.get("organisme") or "").strip()
    user = authenticate(request, username=matricule, password=password)
    if user is None or not hasattr(user, "profil"):
        return Response(
            {"detail": "Matricule ou mot de passe incorrect."},
            status=401,
        )
    if organisme_code and user.profil.organisme.code != organisme_code:
        return Response(
            {"detail": "Cet identifiant n'est pas rattaché à l'entité sélectionnée."},
            status=403,
        )
    token, _created = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": _me(user, request)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({"detail": "Session fermée."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(_me(request.user, request))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def changer_mot_de_passe(request):
    """Chaque utilisateur change son propre mot de passe, en confirmant l'ancien.

    Le jeton est renouvelé : la session en cours continue avec le nouveau, les autres
    appareils doivent se reconnecter.
    """
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    user = request.user
    actuel = str(request.data.get("actuel") or "")
    nouveau = str(request.data.get("nouveau") or "")
    confirmation = str(request.data.get("confirmation") or "")
    if not user.check_password(actuel):
        return Response({"detail": "Le mot de passe actuel est incorrect."}, status=400)
    if not nouveau:
        return Response({"detail": "Saisissez le nouveau mot de passe."}, status=400)
    if nouveau != confirmation:
        return Response({"detail": "La confirmation ne correspond pas au nouveau mot de passe."}, status=400)
    if nouveau == actuel:
        return Response({"detail": "Le nouveau mot de passe doit être différent de l'actuel."}, status=400)
    try:
        validate_password(nouveau, user)
    except ValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=400)
    user.set_password(nouveau)
    user.save(update_fields=["password"])
    Token.objects.filter(user=user).delete()
    token = Token.objects.create(user=user)
    Notification.objects.create(
        destinataire=user,
        categorie=Notification.Categorie.SYSTEME,
        titre="Mot de passe modifié",
        message="Votre mot de passe a été changé. Si vous n'êtes pas à l'origine de ce changement, prévenez un administrateur.",
        lien="/app",
        creee_le=timezone.now(),
    )
    return Response({"detail": "Votre mot de passe est modifié.", "token": token.key})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_signature(request):
    """Le responsable dépose l'image de sa signature, réutilisée à chaque visa."""
    from pathlib import Path

    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez l'image de votre signature."}, status=400)
    if Path(fichier.name).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        return Response({"detail": "La signature doit être une image PNG, JPG ou WEBP."}, status=400)
    if fichier.size > 2 * 1024 * 1024:
        return Response({"detail": "L'image de signature dépasse 2 Mo."}, status=400)
    profil = request.user.profil
    if profil.signature:
        profil.signature.delete(save=False)
    profil.signature = fichier
    profil.save(update_fields=["signature"])
    return Response(_me(request.user, request))


ROLES_GESTION_DOSSIER = {"Chef de service", "Sous directeur", "Directeur", "Directeur général"}


def _peut_gerer_dossier(user, agent) -> bool:
    """L'agent gère son propre dossier ; un responsable, ceux de son périmètre ; l'administrateur, tous."""
    if user.username == agent.matricule:
        return True
    profil = getattr(user, "profil", None)
    if profil is None:
        return False
    if profil.administrateur:
        return True
    if profil.role not in ROLES_GESTION_DOSSIER:
        return False
    perimetre = perimetre_matricules(user)
    return perimetre is None or agent.matricule in perimetre


def _refus_dossier():
    return Response({"detail": "Seul l'agent, ou un responsable de son périmètre, peut modifier ce dossier."}, status=403)


def _detail(agent, user) -> dict:
    """Dossier de l'agent, avec le droit de modification de l'utilisateur qui le consulte."""
    return {**agent_detail(agent), "modifiable": _peut_gerer_dossier(user, agent)}


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_photo(request, matricule: str):
    """L'agent verse sa photo de profil, choisie ou prise avec l'appareil photo."""
    from pathlib import Path

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez une photo."}, status=400)
    if Path(fichier.name).suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        return Response({"detail": "La photo doit être une image PNG, JPG ou WEBP."}, status=400)
    if fichier.size > 5 * 1024 * 1024:
        return Response({"detail": "La photo dépasse 5 Mo."}, status=400)
    if agent.photo:
        agent.photo.delete(save=False)
    agent.photo = fichier
    agent.save(update_fields=["photo"])
    return Response(_detail(agent, request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_piece_identite(request, matricule: str):
    """L'agent déclare le type de sa pièce d'identité, son numéro, puis charge le document."""
    from pathlib import Path

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    types = {code for code, _libelle in Agent._meta.get_field("type_piece_identite").choices}
    type_piece = (request.data.get("type_piece") or "").strip()
    if type_piece not in types:
        return Response({"detail": "Choisissez le type de pièce d'identité."}, status=400)
    numero = (request.data.get("numero") or "").strip()[:40]
    if not numero:
        return Response({"detail": "Renseignez le numéro de la pièce."}, status=400)
    fichier = request.FILES.get("fichier")
    if fichier is None and not agent.piece_identite:
        return Response({"detail": "Chargez le document de la pièce d'identité."}, status=400)
    if fichier is not None:
        if Path(fichier.name).suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
            return Response({"detail": "Le document doit être un PDF ou une image (PNG, JPG, WEBP)."}, status=400)
        if fichier.size > 5 * 1024 * 1024:
            return Response({"detail": "Le document dépasse 5 Mo."}, status=400)
        if agent.piece_identite:
            agent.piece_identite.delete(save=False)
        agent.piece_identite = fichier
    agent.type_piece_identite = type_piece
    agent.numero_piece_identite = numero
    agent.save(update_fields=["type_piece_identite", "numero_piece_identite", "piece_identite"])
    return Response(_detail(agent, request.user))


CHAMPS_PROFIL_TEXTE = {
    "nom": 80, "prenoms": 120, "nom_jeune_fille": 120, "lieu_naissance": 160,
    "adresse_residence": 240, "ville": 120, "telephone": 40, "telephone_secondaire": 40,
    "contact_urgence_nom": 160, "contact_urgence_telephone": 40,
    "libelle_diplome": 240, "domaine_formation": 160,
    "conjoint_nom": 120, "conjoint_prenoms": 160, "conjoint_telephone": 40,
}
CHAMPS_PROFIL_COURRIEL = {"courriel", "conjoint_courriel"}
CHAMPS_PROFIL_TELEPHONE = {"telephone", "telephone_secondaire", "contact_urgence_telephone", "conjoint_telephone"}
CHAMPS_PROFIL_NOM = {"nom", "prenoms", "nom_jeune_fille", "contact_urgence_nom", "conjoint_nom", "conjoint_prenoms"}
# Numéro ivoirien à 10 chiffres (01, 05, 07 mobiles ; 20 à 27 fixes), indicatif +225 ou 00225 en option.
TELEPHONE_CI = re.compile(r"^(?:\+225|00225)?(?:0[157]|2[0-7])\d{8}$")
NOM_PROPRE = re.compile(r"^[^\W\d_][^\W\d_\s'’.-]*(?:[\s'’.-]+[^\W\d_]+)*[.]?$")
CHAMPS_PROFIL_DATE = {"date_naissance", "date_mariage"}


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def modifier_profil(request, matricule: str):
    """Met à jour les informations personnelles : état civil, coordonnées, parcours académique, conjoint."""
    from datetime import date

    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    donnees = request.data
    modifies: dict = {}
    for champ, longueur in CHAMPS_PROFIL_TEXTE.items():
        if champ in donnees:
            valeur = str(donnees.get(champ) or "").strip()
            if len(valeur) > longueur:
                return Response({"detail": f"« {champ} » dépasse {longueur} caractères."}, status=400)
            if valeur and champ in CHAMPS_PROFIL_TELEPHONE and not TELEPHONE_CI.match(re.sub(r"[\s.()-]", "", valeur)):
                return Response({"detail": "Un numéro de téléphone n'est pas valide : 10 chiffres ivoiriens attendus, avec ou sans +225."}, status=400)
            if valeur and champ in CHAMPS_PROFIL_NOM and not NOM_PROPRE.match(valeur):
                return Response({"detail": "Un nom ou prénom ne doit contenir que des lettres, espaces, apostrophes et traits d'union."}, status=400)
            modifies[champ] = valeur
    for champ in CHAMPS_PROFIL_COURRIEL:
        if champ in donnees:
            valeur = str(donnees.get(champ) or "").strip()
            if valeur:
                try:
                    validate_email(valeur)
                except ValidationError:
                    return Response({"detail": "Une adresse e-mail n'est pas valide."}, status=400)
            modifies[champ] = valeur
    for champ in CHAMPS_PROFIL_DATE:
        if champ in donnees:
            brut = donnees.get(champ)
            if not brut:
                modifies[champ] = None
                continue
            try:
                jour = date.fromisoformat(str(brut))
            except ValueError:
                return Response({"detail": "Une date n'est pas valide."}, status=400)
            if jour > date.today():
                return Response({"detail": "Une date ne peut pas être dans le futur."}, status=400)
            modifies[champ] = jour
    for champ, code_champ, vide_permis in (
        ("sexe", "sexe", False),
        ("statut_matrimonial", "statut_matrimonial", True),
        ("niveau_etude", "niveau_etude", True),
    ):
        if champ in donnees:
            valeur = donnees.get(champ) or ""
            codes = {code for code, _l in Agent._meta.get_field(code_champ).choices}
            if valeur == "" and vide_permis:
                modifies[champ] = ""
            elif valeur in codes:
                modifies[champ] = valeur
            else:
                return Response({"detail": f"La valeur de « {champ} » n'est pas valide."}, status=400)
    if ("nom" in modifies and not modifies["nom"]) or ("prenoms" in modifies and not modifies["prenoms"]):
        return Response({"detail": "Le nom et les prénoms sont obligatoires."}, status=400)
    for champ, valeur in modifies.items():
        setattr(agent, champ, valeur)
    if "nom" in modifies or "prenoms" in modifies:
        agent.initiales = "".join(m[:1] for m in f"{agent.prenoms} {agent.nom}".split())[:4].upper() or agent.matricule[:4].upper()
        modifies["initiales"] = agent.initiales
    if modifies:
        agent.save(update_fields=list(modifies))
    return Response(_detail(agent, request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ajouter_enfant(request, matricule: str):
    """Déclare un enfant à charge sur le dossier de l'agent."""
    from datetime import date

    from .models import Enfant

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    donnees = request.data
    nom = (donnees.get("nom") or "").strip()[:120]
    prenoms = (donnees.get("prenoms") or "").strip()[:160]
    if not nom or not prenoms:
        return Response({"detail": "Renseignez le nom et les prénoms de l'enfant."}, status=400)
    if not NOM_PROPRE.match(nom) or not NOM_PROPRE.match(prenoms):
        return Response({"detail": "Un nom ou prénom ne doit contenir que des lettres, espaces, apostrophes et traits d'union."}, status=400)
    sexe = donnees.get("sexe")
    if sexe not in {"H", "F"}:
        return Response({"detail": "Précisez le sexe de l'enfant."}, status=400)
    naissance = None
    if donnees.get("date_naissance"):
        try:
            naissance = date.fromisoformat(str(donnees["date_naissance"]))
        except ValueError:
            return Response({"detail": "La date de naissance n'est pas valide."}, status=400)
        if naissance > date.today():
            return Response({"detail": "La date de naissance ne peut pas être dans le futur."}, status=400)
    Enfant.objects.create(
        agent=agent,
        nom=nom,
        prenoms=prenoms,
        sexe=sexe,
        date_naissance=naissance,
        lieu_naissance=(donnees.get("lieu_naissance") or "").strip()[:160],
    )
    return Response(_detail(agent, request.user), status=201)


def _aligner_diplome_principal(agent: Agent) -> None:
    """Les trois champs du dossier (états, exports) reprennent le diplôme le plus élevé déclaré."""
    from .models import Diplome

    ordre = [code for code, _libelle in Diplome.NIVEAUX]
    plus_haut = max(agent.diplomes.all(), key=lambda d: ordre.index(d.niveau_etude), default=None)
    agent.niveau_etude = plus_haut.niveau_etude if plus_haut else ""
    agent.libelle_diplome = plus_haut.libelle if plus_haut else ""
    agent.domaine_formation = plus_haut.domaine_formation if plus_haut else ""
    agent.save(update_fields=["niveau_etude", "libelle_diplome", "domaine_formation"])


def _justificatif_diplome(request, agent: Agent, libelle: str):
    """Pièce à rattacher à un diplôme : fichier téléversé ou pièce déjà au coffre. Retourne (pièce, erreur)."""
    from .pieces import RUBRIQUE_DIPLOMES, verser_justificatif_diplome

    if request.FILES.get("fichier") is not None:
        return verser_justificatif_diplome(agent, request.FILES["fichier"], libelle[:80])
    identifiant = request.data.get("piece_id")
    if identifiant in (None, ""):
        return None, None
    piece = agent.pieces.filter(pk=identifiant if str(identifiant).isdigit() else 0, categorie=RUBRIQUE_DIPLOMES).first()
    if piece is None:
        return None, "Cette pièce n'est pas dans la rubrique des diplômes de l'agent."
    return piece, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def ajouter_diplome(request, matricule: str):
    """Ajoute une ligne au parcours académique de l'agent."""
    from .models import Diplome

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    donnees = request.data
    niveau = donnees.get("niveau_etude")
    if niveau not in {code for code, _libelle in Diplome.NIVEAUX}:
        return Response({"detail": "Précisez le niveau d'étude."}, status=400)
    libelle = (donnees.get("libelle") or "").strip()[:240]
    with transaction.atomic():
        piece, erreur = _justificatif_diplome(request, agent, libelle or dict(Diplome.NIVEAUX)[niveau])
        if erreur:
            return Response({"detail": erreur}, status=400)
        Diplome.objects.create(
            agent=agent,
            niveau_etude=niveau,
            libelle=libelle,
            domaine_formation=(donnees.get("domaine_formation") or "").strip()[:160],
            piece=piece,
        )
        _aligner_diplome_principal(agent)
    return Response(_detail(agent, request.user), status=201)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def justificatif_diplome(request, matricule: str, pk: int):
    """Rattache (POST) ou détache (DELETE) le justificatif d'une ligne du parcours académique."""
    from .models import Diplome

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    diplome = get_object_or_404(Diplome, pk=pk, agent=agent)
    if request.method == "DELETE":
        diplome.piece = None
    else:
        with transaction.atomic():
            piece, erreur = _justificatif_diplome(request, agent, diplome.libelle or diplome.get_niveau_etude_display())
            if erreur or piece is None:
                return Response({"detail": erreur or "Joignez un fichier ou choisissez une pièce déjà versée."}, status=400)
            diplome.piece = piece
    diplome.save(update_fields=["piece"])
    return Response(_detail(agent, request.user))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def retirer_diplome(request, matricule: str, pk: int):
    """Retire une ligne du parcours académique."""
    from .models import Diplome

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    get_object_or_404(Diplome, pk=pk, agent=agent).delete()
    _aligner_diplome_principal(agent)
    return Response(_detail(agent, request.user))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def retirer_enfant(request, matricule: str, pk: int):
    """Retire un enfant du dossier de l'agent."""
    from .models import Enfant

    agent = get_object_or_404(Agent, matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    get_object_or_404(Enfant, pk=pk, agent=agent).delete()
    return Response(_detail(agent, request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@en_arriere_plan("Dossier de l'agent (PDF)")
@dans_le_perimetre
def exporter_dossier(_request, matricule: str):
    from .rapports.documents import rendre_dossier

    agent = get_object_or_404(
        Agent.objects.select_related("organisme").prefetch_related(
            "actes",
            "evaluations",
            "absences",
            "formations",
            "prestations",
            "pieces",
            "demandes",
            "visas_dossier",
            "ayants_droit",
            "enfants",
            "diplomes",
            "parcours",
        ),
        matricule=matricule,
    )
    contenu = rendre_dossier(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="dossier-{agent.matricule}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def bulletin_notations(_request, matricule: str):
    from .rapports.documents import rendre_notations

    agent = get_object_or_404(Agent.objects.prefetch_related("evaluations"), matricule=matricule)
    if not agent.evaluations.exists():
        return Response({"detail": "Aucune notation n'est versée à ce dossier."}, status=400)
    contenu = rendre_notations(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="notations-{agent.matricule}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def releve_conges(_request, matricule: str):
    from .rapports.documents import rendre_conges

    agent = get_object_or_404(Agent.objects.prefetch_related("absences"), matricule=matricule)
    contenu = rendre_conges(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="conges-{agent.matricule}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def rapport_social(_request, matricule: str):
    from .rapports.documents import rendre_social

    agent = get_object_or_404(Agent.objects.prefetch_related("prestations"), matricule=matricule)
    contenu = rendre_social(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="social-{agent.matricule}.pdf"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def accuser_notation(_request, matricule: str, pk: int):
    """L'agent accuse réception de sa notation : elle passe à « Signée par l'agent »."""
    evaluation = get_object_or_404(Evaluation.objects.select_related("agent"), pk=pk, agent__matricule=matricule)
    if "sign" in evaluation.statut.lower():
        return Response({"detail": "Cette notation est déjà signée par l'agent."}, status=409)
    evaluation.statut = "Signée par l'agent"
    evaluation.save(update_fields=["statut"])
    return Response(agent_detail(evaluation.agent))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def statistiques(request):
    try:
        return Response(calculer(
            request.GET.get("structure", ""),
            request.GET.get("segment", ""),
            request.GET.get("exercice", ""),
            perimetre_matricules(request.user),
        ))
    except FiltreInconnu as exc:
        return Response({"detail": str(exc)}, status=400)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@en_arriere_plan("Export des statistiques")
def export_statistiques(request, format_export):
    try:
        corps = calculer(
            request.GET.get("structure", ""),
            request.GET.get("segment", ""),
            request.GET.get("exercice", ""),
            perimetre_matricules(request.user),
        )
    except FiltreInconnu as exc:
        return Response({"detail": str(exc)}, status=400)
    if format_export == "xlsx":
        contenu, type_mime, extension = classeur(corps), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    elif format_export == "pdf":
        contenu, type_mime, extension = synthese(corps), "application/pdf", "pdf"
    elif format_export == "pptx":
        contenu, type_mime, extension = diaporama(corps), "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"
    else:
        return Response({"detail": "Ce format d'export n'est pas disponible."}, status=404)
    reponse = HttpResponse(contenu, content_type=type_mime)
    reponse["Content-Disposition"] = f'attachment; filename="statistiques-{corps["exercice"]}.{extension}"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def planifier_statistiques(request):
    try:
        echeance = lire_echeance(str(request.data.get("echeance", "")))
    except FiltreInconnu as exc:
        return Response({"detail": str(exc)}, status=400)
    if echeance < timezone.localdate():
        return Response({"detail": "La date du point ne peut pas être passée."}, status=400)
    objet = str(request.data.get("objet", "")).strip()
    if not objet:
        return Response({"detail": "Indiquez l'objet du point."}, status=400)
    Notification.objects.create(
        destinataire=request.user,
        categorie=Notification.Categorie.SYSTEME,
        titre="Point statistique au Cabinet",
        message=f"Point prévu le {echeance.strftime('%d/%m/%Y')} — {objet}"[:280],
        lien="/app/statistiques",
        creee_le=timezone.now(),
    )
    return Response({"detail": "Le point est inscrit dans vos notifications."}, status=201)


def _reponse_composition(exc: CompositionInvalide):
    return Response({"detail": str(exc)}, status=400)


def _corps_composition(data, composition=None) -> dict:
    nom = data["nom"] if "nom" in data else (composition.nom if composition else "")
    if "configuration" in data:
        configuration = data["configuration"]
    else:
        configuration = configuration_de(composition) if composition else None
    return valider_tableau(nom, configuration)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def catalogue_statistiques(_request):
    return Response(decrire_catalogue())


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cube_statistiques(request):
    try:
        return Response(calculer_cube(
            request.GET.get("source", ""),
            request.GET.get("champs", ""),
            request.GET.get("croisements", ""),
            request.GET.get("periodes", ""),
            perimetre_matricules(request.user),
        ))
    except CompositionInvalide as exc:
        return _reponse_composition(exc)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def compositions_statistiques(request):
    if request.method == "GET":
        lignes = CompositionStatistique.objects.select_related("auteur")
        return Response([presenter(item, request.user) for item in lignes])
    try:
        corps = _corps_composition(request.data)
    except CompositionInvalide as exc:
        return _reponse_composition(exc)
    composition = CompositionStatistique.objects.create(auteur=request.user, **corps)
    return Response(presenter(composition, request.user), status=201)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def composition_statistique(request, pk: int):
    composition = get_object_or_404(CompositionStatistique.objects.select_related("auteur"), pk=pk)
    if request.method == "GET":
        return Response(presenter(composition, request.user))
    if composition.auteur_id != request.user.id:
        return Response({"detail": "Ce tableau ne vous appartient pas."}, status=403)
    if request.method == "DELETE":
        composition.delete()
        return Response(status=204)
    try:
        corps = _corps_composition(request.data, composition)
    except CompositionInvalide as exc:
        return _reponse_composition(exc)
    for cle, valeur in corps.items():
        setattr(composition, cle, valeur)
    composition.save()
    return Response(presenter(composition, request.user))


def _n(valeur: int) -> str:
    return f"{valeur:_}".replace("_", " ")


def _activite() -> list[dict]:
    """Compteurs lus dans les registres, pour le tableau de bord."""
    conges_clos = [
        Absence.Instruction.SIGNE,
        Absence.Instruction.REJETE,
        Absence.Instruction.DECALE,
        Absence.Instruction.APPROBATION_AUTO,
    ]
    return [
        {
            "cle": "dossiers",
            "libelle": "Dossiers agents",
            "valeur": _n(Agent.objects.count()),
            "detail": f"{_n(Organisme.objects.count())} organismes",
            "icone": "badge",
            "lien": "/app/dossiers",
        },
        {
            "cle": "absences",
            "libelle": "Absences",
            "valeur": _n(Absence.objects.count()),
            "detail": f"{_n(Absence.objects.filter(decision=Absence.Decision.EN_ATTENTE).count())} en attente de décision",
            "icone": "event_busy",
            "lien": "/app/carrieres/absences",
        },
        {
            "cle": "conges",
            "libelle": "Congés",
            "valeur": _n(Absence.objects.exclude(instruction="").count()),
            "detail": f"{_n(Absence.objects.exclude(instruction='').exclude(instruction__in=conges_clos).count())} à instruire",
            "icone": "beach_access",
            "lien": "/app/carrieres/conges",
        },
        {
            "cle": "discipline",
            "libelle": "Discipline",
            "valeur": _n(
                ProcedureDisciplinaire.objects.exclude(
                    avis__in=[ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE]
                ).count()
            ),
            "detail": "procédures encore ouvertes",
            "icone": "gavel",
            "lien": "/app/carrieres/procedures-disciplinaires",
        },
        {
            "cle": "fin",
            "libelle": "Fin de carrière",
            "valeur": _n(AlerteReleve.objects.count()),
            "detail": "postes clés à relever",
            "icone": "elderly",
            "lien": "/app/carrieres/fin-de-carriere",
        },
        {
            "cle": "social",
            "libelle": "Action sociale",
            "valeur": _n(PrestationSociale.objects.count()),
            "detail": f"{_n(PrestationSociale.objects.exclude(etat__in=['', PrestationSociale.Etat.MANDATEE]).count())} dossiers encore ouverts",
            "icone": "volunteer_activism",
            "lien": "/app/action-sociale",
        },
        {
            "cle": "formation",
            "libelle": "Formation",
            "valeur": _n(SessionFormation.objects.filter(ouverte=True, annulee=False).count()),
            "detail": f"{_n(InscriptionFormation.objects.count())} inscriptions",
            "icone": "school",
            "lien": "/app/formation",
        },
        {
            "cle": "besoins",
            "libelle": "Besoins GPEC",
            "valeur": _n(FicheBesoin.objects.filter(campagne__ouverte=True).count()),
            "detail": f"{_n(FicheBesoin.objects.filter(campagne__ouverte=True).values('entite').distinct().count())} structures ont répondu",
            "icone": "groups",
            "lien": "/app/gpec/expression-des-besoins",
        },
        {
            "cle": "recrutement",
            "libelle": "Recrutement",
            "valeur": _n(
                DemandeDotation.objects.exclude(
                    statut__in=[DemandeDotation.Statut.ACTE, DemandeDotation.Statut.REJET]
                ).count()
            ),
            "detail": "demandes de poste encore ouvertes",
            "icone": "person_add",
            "lien": "/app/gpec/recrutement",
        },
        {
            "cle": "communication",
            "libelle": "Communication",
            "valeur": _n(Publication.objects.filter(statut=Publication.Statut.DIFFUSE).count()),
            "detail": f"{_n(Publication.objects.filter(statut=Publication.Statut.VISA).count())} en attente du visa du DRH",
            "icone": "campaign",
            "lien": "/app/communication",
        },
    ]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    from .tableau_de_bord import etats, kpis

    snap = _snapshot()
    visas = VisaEnAttente.objects.filter(statut=VisaEnAttente.Statut.EN_ATTENTE).select_related("agent", "agent__organisme")
    etats_calcules = etats(request.user, EXERCICE)
    return Response(
        {
            "exercice": EXERCICE,
            "campagne": None,
            # Indicateurs et états lus en direct, à la place des chiffres figés de l'instantané.
            "kpis": kpis(request.user, EXERCICE, etats_calcules),
            "etats": etats_calcules,
            "modules": _activite(),
            "visas": [visa_row(item) for item in visas],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@en_arriere_plan("Rapport de pilotage")
def exporter_pilotage(request):
    from .rapports.pilotage import rendre_pilotage

    contenu = rendre_pilotage(request.user)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="rapport-pilotage-{EXERCICE}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def agents(request):
    from .positions import echeances_en_cours, synchroniser_tous

    synchroniser_tous()
    query = str(request.query_params.get("q") or "").strip()
    rows = Agent.objects.select_related("organisme")
    matricules = perimetre_matricules(request.user)
    if matricules is not None:
        rows = rows.filter(matricule__in=matricules)
    if query:
        rows = rows.filter(nom__icontains=query) | rows.filter(prenoms__icontains=query) | rows.filter(
            matricule__icontains=query
        )
    echeances = echeances_en_cours()
    return Response([{**agent_brief(agent), **echeances.get(agent.matricule, {})} for agent in rows.distinct()])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def modele_import_agents(_request):
    from .import_agents import modele

    contenu = modele()
    reponse = HttpResponse(
        contenu,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    reponse["Content-Disposition"] = 'attachment; filename="modele-dossiers-agents.xlsx"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
@en_arriere_plan("Import des agents")
def importer_agents(request):
    from .import_agents import ImportInvalide, importer

    fichier = request.FILES.get("fichier")
    if fichier is None:
        return Response({"detail": "Choisissez un classeur Excel (.xlsx)."}, status=400)
    if fichier.size > 5 * 1024 * 1024:
        return Response({"detail": "Le classeur dépasse 5 Mo."}, status=400)
    try:
        return Response(importer(fichier.read(), request.user))
    except ImportInvalide as exc:
        corps = {"detail": exc.message}
        if exc.erreurs:
            corps["erreurs"] = exc.erreurs
        return Response(corps, status=400)


def _dossier_personnel(user, matricule: str) -> Agent | None:
    """Le profil du compte connecté, créé à la première ouverture s'il n'a pas encore de dossier."""
    if user.username != matricule or not hasattr(user, "profil"):
        return None
    existant = Agent.objects.filter(matricule=matricule).first()
    if existant is not None:
        return existant
    nom = (user.last_name or matricule)[:80]
    prenoms = (user.first_name or "")[:120]
    initiales = "".join(morceau[:1] for morceau in f"{prenoms} {nom}".split())[:4].upper() or matricule[:4].upper()
    structure = getattr(user.profil.structure, "nom", "") or user.profil.fonction
    return Agent.objects.create(
        matricule=matricule,
        nom=nom,
        prenoms=prenoms,
        initiales=initiales,
        corps="—",
        grade="—",
        echelon="—",
        structure=structure[:240],
        organisme=user.profil.organisme,
        fonction=user.profil.fonction,
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def agent_detail_view(request, matricule: str):
    if not Agent.objects.filter(matricule=matricule).exists():
        _dossier_personnel(request.user, matricule)
    agent = get_object_or_404(
        Agent.objects.select_related("organisme").prefetch_related(
            "actes",
            "evaluations",
            "absences",
            "prestations",
            "formations",
            "pieces",
            "visas_dossier",
            "demandes__visas",
            "situation_sociale",
            "ayants_droit",
        ),
        matricule=matricule,
    )
    matricules = perimetre_matricules(request.user)
    if matricules is not None and agent.matricule not in matricules:
        return Response({"detail": "Ce dossier est hors de votre supervision."}, status=404)
    from .positions import synchroniser_situation

    synchroniser_situation(agent)
    if request.method == "PATCH":
        from .informer import informer_situation, instantane_situation
        from .saisie import enregistrer_situation

        avant = instantane_situation(agent)
        erreur = enregistrer_situation(agent, request.data)
        if erreur:
            return Response({"detail": erreur}, status=400)
        informer_situation(agent, request.user, avant)
    return Response(_detail(agent, request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def inscrire_formation(request, matricule: str):
    from .inscriptions import inscrire

    agent = get_object_or_404(Agent.objects.select_related("organisme"), matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return Response({"detail": "Seul l'agent, ou un responsable de son périmètre, peut déposer cette candidature."}, status=403)
    erreur = inscrire(agent, str(request.data.get("code") or ""), request.FILES.get("fichier"))
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(agent_detail(agent), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def deposer_conge(request, matricule: str):
    from .depot_conge import deposer

    agent = get_object_or_404(Agent.objects.select_related("organisme"), matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return Response({"detail": "Seul l'agent, ou un responsable de son périmètre, peut déposer cette demande."}, status=403)
    erreur = deposer(agent, request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(_detail(agent, request.user), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def valider_inscription(request, reference: str):
    from .inscriptions import valider_etape

    demande = get_object_or_404(Demande.objects.select_related("agent"), reference=reference)
    # La SD ne transmet pas au DRH une candidature à un module déjà complet.
    from .formation import verifier_places

    complet = verifier_places(demande)
    if complet:
        return Response({"detail": complet}, status=409)
    motif = str(request.data.get("motif") or "").strip()
    erreur, notifiee = valider_etape(demande, request.user, motif)
    if erreur:
        return Response({"detail": erreur}, status=400)
    demande.refresh_from_db()
    return Response({"reference": demande.reference, "etape": demande.etape, "notifiee": notifiee})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_piece(request, matricule: str):
    from .pieces import deposer

    agent = get_object_or_404(Agent.objects.select_related("organisme"), matricule=matricule)
    erreur = deposer(
        agent,
        request.FILES.get("fichier"),
        str(request.data.get("intitule") or ""),
        str(request.data.get("categorie") or ""),
    )
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(agent_detail(agent), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_document(request, matricule: str):
    """Verse une pièce du dossier personnel numérique (état civil, diplômes, actes administratifs)."""
    from .pieces import deposer_document as verser

    agent = get_object_or_404(Agent.objects.select_related("organisme"), matricule=matricule)
    if not _peut_gerer_dossier(request.user, agent):
        return _refus_dossier()
    erreur = verser(
        agent,
        request.FILES.get("fichier"),
        str(request.data.get("rubrique") or ""),
        str(request.data.get("type_document") or ""),
        str(request.data.get("precision") or ""),
        str(request.data.get("date_expiration") or ""),
    )
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(_detail(agent, request.user), status=201)


def _demande_acte_row(demande) -> dict:
    return {
        "reference": demande.reference,
        "nature": demande.nature,
        "type_acte": demande.type_acte,
        "agent": {"matricule": demande.agent.matricule, "nom_complet": demande.agent.nom_complet},
        "categorie": demande.categorie,
        "motif": demande.motif or (demande.visas.order_by("ordre").values_list("commentaire", flat=True).first() or ""),
        "debut": demande.debut.isoformat() if demande.debut else "",
        "fin": demande.fin.isoformat() if demande.fin else "",
        "destinataire": demande.destinataire,
        "justificatif_url": demande.justificatif.url if demande.justificatif else "",
        "etape": demande.etape,
        "depose_le": demande.depose_le.isoformat(),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def demandes_actes(request):
    """Actes demandables et demandes qui attendent le visa de l'utilisateur."""
    from .demande_acte import CATEGORIE, peut_decider, types

    en_cours = Demande.objects.filter(categorie__in=[CATEGORIE, "conge", "mutation"]).select_related("agent").order_by("depose_le", "id")
    a_traiter = [_demande_acte_row(item) for item in en_cours if peut_decider(request.user, item)]
    return Response({"types": types(), "a_traiter": a_traiter})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def deposer_demande_acte(request, matricule: str):
    """L'agent demande un acte en son nom : attestation, permission ou autorisation d'absence."""
    from .demande_acte import deposer

    if request.user.username != matricule:
        return Response({"detail": "Vous ne pouvez demander un acte qu'en votre nom."}, status=403)
    agent = get_object_or_404(Agent.objects.select_related("organisme"), matricule=matricule)
    erreur = deposer(agent, request.data, request.FILES.get("justificatif"))
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(_detail(agent, request.user), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def decider_demande_acte(request, reference: str):
    """Vise ou refuse une demande d'acte à l'étape qui revient à l'utilisateur."""
    from .demande_acte import CATEGORIE, decider, peut_decider

    demande = get_object_or_404(Demande.objects.select_related("agent__organisme"), reference=reference, categorie__in=[CATEGORIE, "conge", "mutation"])
    if not peut_decider(request.user, demande):
        return Response({"detail": "Cette demande n'attend pas votre visa."}, status=403)
    erreur = decider(demande, request.user, str(request.data.get("sens") or ""), str(request.data.get("motif") or ""))
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(_detail(demande.agent, request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def document_demande_acte(request, reference: str):
    """PDF de l'acte délivré, pour l'agent concerné ou pour un responsable."""
    from .demande_acte import CATEGORIE, ROLES_CHEF, delivree, visa_final
    from .rapports.convocation import Signataire
    from .rapports.documents import rendre_acte_demande

    demande = get_object_or_404(Demande.objects.select_related("agent__organisme"), reference=reference, categorie=CATEGORIE)
    role = getattr(getattr(request.user, "profil", None), "role", "")
    if request.user.username != demande.agent.matricule and role not in ROLES_CHEF:
        return Response({"detail": "Cet acte ne vous est pas destiné."}, status=403)
    if demande.document_signe:
        from .secretariat import _reponse_fichier

        return _reponse_fichier(demande)
    if not delivree(demande):
        return Response({"detail": "Cet acte n'est pas encore délivré."}, status=409)
    visa = visa_final(demande)
    image = None
    if visa is not None and visa.signature:
        try:
            with visa.signature.open("rb") as source:
                image = source.read()
        except (OSError, ValueError):
            image = None
    qualite = "Le Directeur des ressources humaines" if visa is None or visa.instance == "Visa DRH" else (visa.fonction or visa.instance)
    signataire = Signataire(visa.titulaire if visa else "", qualite, f"Visa {visa.reference}" if visa and visa.reference else "", image)
    reponse = HttpResponse(rendre_acte_demande(demande, signataire), content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="{demande.reference}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@en_arriere_plan("Archive des pièces du dossier")
@dans_le_perimetre
def archive_pieces(_request, matricule: str):
    from .pieces import archive

    agent = get_object_or_404(Agent, matricule=matricule)
    if not agent.pieces.exists():
        return Response({"detail": "Ce dossier ne contient aucune pièce à exporter."}, status=400)
    contenu, nom = archive(agent)
    reponse = HttpResponse(contenu, content_type="application/zip")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@dans_le_perimetre
def telecharger_acte(_request, matricule: str, pk: int):
    import mimetypes
    from pathlib import Path

    from .rapports.documents import rendre_acte as rendre

    acte = get_object_or_404(
        Acte.objects.select_related("agent", "agent__organisme"),
        pk=pk,
        agent__matricule=matricule,
    )
    if acte.scan:
        contenu = acte.scan.read()
        type_mime = mimetypes.guess_type(acte.scan.name)[0] or "application/octet-stream"
        extension = Path(acte.scan.name).suffix or ""
    elif acte.statut == Acte.Statut.VALIDE:
        contenu = rendre(acte)
        type_mime = "application/pdf"
        extension = ".pdf"
    else:
        return Response({"detail": "Cet acte n'a pas encore été mis à disposition par la hiérarchie."}, status=403)
    nom = f"{acte.reference.replace('/', '-')}{extension}"
    reponse = HttpResponse(contenu, content_type=type_mime)
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def types_fin_carriere(_request):
    return Response([{"code": item.code, "libelle": item.libelle} for item in TypeFinCarriere.objects.all()])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def carrieres(request):
    snap = _snapshot()
    lignes = agents_visibles(LigneAvancement.objects.select_related("agent", "agent__organisme"), request.user, "agent__matricule")
    mouvements = agents_visibles(MouvementStrategique.objects.select_related("agent", "agent__organisme", "organisme"), request.user, "agent__matricule")
    alertes = agents_visibles(AlerteReleve.objects.select_related("titulaire", "titulaire__organisme", "organisme"), request.user, "titulaire__matricule")
    return Response(
        {
            "titre": snap.carriere.get("titre", SNAPSHOT_PAR_DEFAUT["carriere"]["titre"]),
            "chapo": snap.carriere.get("chapo", SNAPSHOT_PAR_DEFAUT["carriere"]["chapo"]),
            **resume_carrieres.resume(request.user, timezone.localdate()),
            "lignes": [avancement_row(item) for item in lignes],
            "mouvements": [mouvement_row(item) for item in mouvements],
            "alertes": [alerte_row(item) for item in alertes],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def carrieres_registres(request):
    agents = agents_visibles(Agent.objects.select_related("organisme").prefetch_related("actes"), request.user)
    absences = agents_visibles(Absence.objects.select_related("agent", "agent__organisme"), request.user, "agent__matricule")
    actes = agents_visibles(
        Acte.objects.filter(domaine__in=[Acte.Domaine.CARRIERE, Acte.Domaine.CONGE]).select_related("agent", "agent__organisme"),
        request.user, "agent__matricule",
    )
    return Response(
        {
            "agents": [registre_agent(agent) for agent in agents],
            "absences": [absence_row(item) for item in absences],
            "actes": [acte_row(item) for item in actes],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def circuits(_request):
    demandes = Demande.objects.select_related("agent", "agent__organisme")
    return Response(
        {
            "exercice": EXERCICE,
            "etapes": [
                {
                    "ordre": etape.ordre,
                    "titre": etape.titre,
                    "compteur": etape.compteur,
                    "detail": etape.detail,
                }
                for etape in EtapeCircuit.objects.all()
            ],
            "parcours": [
                {
                    "ordre": etape.ordre,
                    "acteur": etape.acteur,
                    "titre": etape.titre,
                    "texte": etape.texte,
                    "metas": etape.metas,
                }
                for etape in ParcoursEtape.objects.all()
            ],
            "demandes": [demande_row(item) for item in demandes],
            "matrice": _matrice(),
        }
    )


NIVEAUX_HABILITATION = {"lecture", "saisie", "validation", "refus"}
# Fonctions connues de chaque module. Celles déjà posées n'apparaissent plus dans la liste.
CATALOGUE_FONCTIONS = {
    "Dossier Agent": (
        "Consultation du dossier",
        "Identité et coordonnées",
        "Pièces et actes",
        "Notations et évaluations",
        "Visite médicale",
        "Affiliation CGRAE",
    ),
    "Carrières & Actes": (
        "Accueil",
        "Situation administrative",
        "Absences",
        "Congés",
        "Procédures disciplinaires",
        "Fin de carrière",
        "Actes de carrière",
        "Avancements",
        "Mutations",
    ),
    "Social & Santé": (
        "Action sociale",
        "Demandes d'aide",
        "Prêts et fonds de solidarité",
        "Quotité cessible",
        "Secours médical",
        "Prestations",
    ),
    "Formations": (
        "Formation continue",
        "Plan et sessions",
        "Inscriptions",
        "Besoins de formation",
        "Candidatures",
        "Prestataires",
        "Passeport de formation",
        "Évaluations",
    ),
    "Statistiques & RBAC": (
        "Statistiques",
        "Circuits et habilitations",
        "Habilitations",
        "Comptes utilisateurs",
        "Structures du ministère",
        "Communication",
        "Exports",
        "Compositions",
        "Tableau de bord",
    ),
    "GPEC": (
        "GPEC",
        "Expression des besoins",
        "Recrutement",
    ),
}
COLONNES_INITIALES = (
    "Dossier Agent",
    "Carrières & Actes",
    "Social & Santé",
    "Formations",
    "Statistiques & RBAC",
)


def _colonnes() -> list[ModuleHabilitation]:
    colonnes = list(ModuleHabilitation.objects.prefetch_related("fonctions"))
    if colonnes:
        return colonnes
    return [
        ModuleHabilitation(ordre=ordre, libelle=libelle)
        for ordre, libelle in enumerate(COLONNES_INITIALES, start=1)
    ]


def _droits_alignes(droits, taille: int) -> list[str]:
    valeurs = [item if item in NIVEAUX_HABILITATION else "refus" for item in (droits or [])]
    if len(valeurs) < taille:
        valeurs += ["refus"] * (taille - len(valeurs))
    return valeurs[:taille]


def _precisions(role: RoleMatrice) -> dict[str, str]:
    return {
        str(cle): valeur
        for cle, valeur in (role.precisions or {}).items()
        if valeur in NIVEAUX_HABILITATION
    }


def _disponibles(module: ModuleHabilitation) -> list[str]:
    presentes = {item.libelle.casefold() for item in module.fonctions.all()} if module.pk else set()
    return [nom for nom in CATALOGUE_FONCTIONS.get(module.libelle, ()) if nom.casefold() not in presentes]


def _matrice() -> dict:
    colonnes = _colonnes()
    fonctions = {
        module.pk: [{"id": item.pk, "libelle": item.libelle} for item in module.fonctions.all()]
        for module in colonnes
        if module.pk
    }
    return {
        "colonnes": [item.libelle for item in colonnes],
        "fonctions": [fonctions.get(item.pk, []) for item in colonnes],
        "disponibles": [_disponibles(item) for item in colonnes],
        "roles": [
            {
                "id": role.pk,
                "role": role.role,
                "description": role.description,
                "icone": role.icone,
                "droits": _droits_alignes(role.droits, len(colonnes)),
                "precisions": _precisions(role),
            }
            for role in RoleMatrice.objects.all()
        ],
    }


def _texte_habilitation(valeur, libelle: str, taille: int) -> tuple[str | None, str | None]:
    texte = " ".join(str(valeur or "").split())
    if not texte:
        return None, f"Indiquez {libelle}."
    if len(texte) > taille:
        return None, f"{libelle.capitalize()} dépasse {taille} caractères."
    return texte, None


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def habilitation_cellule(request):
    try:
        index = int(request.data.get("colonne"))
    except (TypeError, ValueError):
        return Response({"detail": "Choisissez un module."}, status=400)
    droit = str(request.data.get("droit") or "")
    if droit not in NIVEAUX_HABILITATION:
        return Response({"detail": "Le niveau est lecture, saisie, validation ou accès refusé."}, status=400)
    colonnes = list(ModuleHabilitation.objects.all())
    if index < 0 or index >= len(colonnes):
        return Response({"detail": "Ce module n'est pas dans la matrice."}, status=400)
    role = RoleMatrice.objects.filter(pk=request.data.get("role")).first()
    if role is None:
        return Response({"detail": "Ce rôle n'est pas dans la matrice."}, status=404)
    droits = _droits_alignes(role.droits, len(colonnes))
    droits[index] = droit
    role.droits = droits
    role.save(update_fields=["droits"])
    return Response(_matrice())


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def habilitation_role(request):
    nom, erreur = _texte_habilitation(request.data.get("role"), "le nom du rôle", 80)
    if erreur:
        return Response({"detail": erreur}, status=400)
    description, erreur = _texte_habilitation(request.data.get("description") or "Rôle du ministère", "la description", 180)
    if erreur:
        return Response({"detail": erreur}, status=400)
    if RoleMatrice.objects.filter(role__iexact=nom).exists():
        return Response({"detail": "Ce rôle existe déjà."}, status=400)
    ordre = (RoleMatrice.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    RoleMatrice.objects.create(
        ordre=ordre,
        role=nom,
        description=description,
        icone="badge",
        droits=["refus"] * ModuleHabilitation.objects.count(),
        superieurs=[],
    )
    return Response(_matrice(), status=201)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def habilitation_role_detail(request, pk: int):
    role = get_object_or_404(RoleMatrice, pk=pk)
    nom, erreur = _texte_habilitation(request.data.get("role"), "le nom du rôle", 80)
    if erreur:
        return Response({"detail": erreur}, status=400)
    description, erreur = _texte_habilitation(request.data.get("description"), "la description", 180)
    if erreur:
        return Response({"detail": erreur}, status=400)
    if RoleMatrice.objects.filter(role__iexact=nom).exclude(pk=role.pk).exists():
        return Response({"detail": "Ce rôle existe déjà."}, status=400)
    if nom != role.role:
        Profil.objects.filter(role=role.role).update(role=nom)
    role.role = nom
    role.description = description
    role.save(update_fields=["role", "description"])
    return Response(_matrice())


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def habilitation_module(request):
    libelle, erreur = _texte_habilitation(request.data.get("libelle"), "le nom du module", 80)
    if erreur:
        return Response({"detail": erreur}, status=400)
    if ModuleHabilitation.objects.filter(libelle__iexact=libelle).exists():
        return Response({"detail": "Ce module existe déjà."}, status=400)
    ordre = (ModuleHabilitation.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    ModuleHabilitation.objects.create(ordre=ordre, libelle=libelle)
    taille = ModuleHabilitation.objects.count()
    for role in RoleMatrice.objects.all():
        role.droits = _droits_alignes(role.droits, taille)
        role.save(update_fields=["droits"])
    return Response(_matrice(), status=201)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def habilitation_precision(request):
    role = RoleMatrice.objects.filter(pk=request.data.get("role")).first()
    if role is None:
        return Response({"detail": "Ce rôle n'est pas dans la matrice."}, status=404)
    fonction = FonctionHabilitation.objects.filter(pk=request.data.get("fonction")).first()
    if fonction is None:
        return Response({"detail": "Cette fonction n'est pas dans le module."}, status=404)
    droit = request.data.get("droit")
    precisions = _precisions(role)
    if droit in (None, "", "herite"):
        precisions.pop(str(fonction.pk), None)
    elif droit not in NIVEAUX_HABILITATION:
        return Response({"detail": "Le niveau est lecture, saisie, validation ou accès refusé."}, status=400)
    else:
        precisions[str(fonction.pk)] = droit
    role.precisions = precisions
    role.save(update_fields=["precisions"])
    return Response(_matrice())


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def habilitation_fonction(request):
    module = ModuleHabilitation.objects.filter(libelle=str(request.data.get("module") or "")).first()
    if module is None:
        return Response({"detail": "Choisissez un module."}, status=400)
    demande = " ".join(str(request.data.get("libelle") or "").split())
    libelle = next((nom for nom in CATALOGUE_FONCTIONS.get(module.libelle, ()) if nom.casefold() == demande.casefold()), None)
    if libelle is None:
        return Response({"detail": "Choisissez une fonction proposée pour cette section."}, status=400)
    if module.fonctions.filter(libelle__iexact=libelle).exists():
        return Response({"detail": "Cette fonction est déjà dans la section."}, status=400)
    ordre = (module.fonctions.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    FonctionHabilitation.objects.create(module=module, ordre=ordre, libelle=libelle)
    return Response(_matrice(), status=201)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def habilitation_fonction_detail(_request, pk: int):
    fonction = get_object_or_404(FonctionHabilitation, pk=pk)
    cle = str(fonction.pk)
    fonction.delete()
    for role in RoleMatrice.objects.all():
        precisions = _precisions(role)
        if cle in precisions:
            precisions.pop(cle)
            role.precisions = precisions
            role.save(update_fields=["precisions"])
    return Response(_matrice())


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def configuration_circuits(request):
    if request.method == "GET":
        return Response(lister())
    circuit, erreur = enregistrer(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(circuit, status=201)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def configuration_circuit(request, pk: int):
    circuit = get_object_or_404(CircuitValidation, pk=pk)
    if request.method == "DELETE":
        circuit.delete()
        return Response({"ok": True})
    circuit, erreur = enregistrer(request.data, circuit)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(circuit)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def configuration_elements(request, famille: str):
    """Ajoute un congé (ou une sous-rubrique) ou une absence à la liste proposée aux agents."""
    from .circuits_config import enregistrer_element

    element, erreur = enregistrer_element(famille, request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(element, status=201)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def configuration_element(request, famille: str, pk: int):
    """Modifie ou retire un congé ou une absence."""
    from .circuits_config import _modele, enregistrer_element, supprimer_element

    modele = _modele(famille)
    if modele is None:
        return Response({"detail": "Famille inconnue."}, status=404)
    objet = get_object_or_404(modele, pk=pk)
    if request.method == "DELETE":
        erreur = supprimer_element(famille, objet)
        if erreur:
            return Response({"detail": erreur}, status=409)
        return Response({"ok": True})
    element, erreur = enregistrer_element(famille, request.data, objet)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(element)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def configuration_actes(request):
    """Ajoute un acte que l'agent pourra demander."""
    from .circuits_config import enregistrer_acte

    acte, erreur = enregistrer_acte(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(acte, status=201)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser])
def configuration_acte(request, pk: int):
    """Modifie ou retire un acte demandable."""
    from .circuits_config import enregistrer_acte, supprimer_acte
    from .models import ActeDemandable

    acte = get_object_or_404(ActeDemandable, pk=pk)
    if request.method == "DELETE":
        erreur = supprimer_acte(acte)
        if erreur:
            return Response({"detail": erreur}, status=409)
        return Response({"ok": True})
    donnees, erreur = enregistrer_acte(request.data, acte)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(donnees)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def module(_request, domaine: str):
    if domaine not in {Acte.Domaine.SOCIAL, Acte.Domaine.FORMATION, Acte.Domaine.CARRIERE}:
        return Response({"detail": "Module inconnu."}, status=404)
    snap = _snapshot()
    meta = (snap.modules or {}).get(domaine, {})
    actes = Acte.objects.filter(domaine=domaine).select_related("agent", "agent__organisme")
    return Response({**meta, "domaine": domaine, "actes": [acte_row(item) for item in actes]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notifications(request):
    from .echeances import surveiller_si_besoin

    surveiller_si_besoin()
    rows = Notification.objects.filter(destinataire=request.user)[:30]
    return Response(
        {
            "non_lues": Notification.objects.filter(destinataire=request.user, lue=False).count(),
            "notifications": [notification_row(item) for item in rows],
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_lue(request, pk: int):
    notification = get_object_or_404(Notification, pk=pk, destinataire=request.user)
    notification.lue = True
    notification.save(update_fields=["lue"])
    return Response(notification_row(notification))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notifications_toutes_lues(request):
    total = Notification.objects.filter(destinataire=request.user, lue=False).update(lue=True)
    return Response({"marquees": total})
