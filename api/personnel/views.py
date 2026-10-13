from django.contrib.auth import authenticate
from django.utils import timezone
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

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
from .circuits_config import enregistrer, lister
from .parametres import identite_ministre, portrait_url
from .utilisateurs import acces_menu, perimetre_matricules
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


def _snapshot() -> SnapshotExercice:
    return get_object_or_404(SnapshotExercice, annee=EXERCICE)


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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def deposer_photo(request, matricule: str):
    """L'agent verse sa photo de profil, choisie ou prise avec l'appareil photo."""
    from pathlib import Path

    agent = get_object_or_404(Agent, matricule=matricule)
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
    return Response(agent_detail(agent))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
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
        ),
        matricule=matricule,
    )
    contenu = rendre_dossier(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="dossier-{agent.matricule}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
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
def releve_conges(_request, matricule: str):
    from .rapports.documents import rendre_conges

    agent = get_object_or_404(Agent.objects.prefetch_related("absences"), matricule=matricule)
    contenu = rendre_conges(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="conges-{agent.matricule}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def rapport_social(_request, matricule: str):
    from .rapports.documents import rendre_social

    agent = get_object_or_404(Agent.objects.prefetch_related("prestations"), matricule=matricule)
    contenu = rendre_social(agent)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="social-{agent.matricule}.pdf"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
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
        ))
    except FiltreInconnu as exc:
        return Response({"detail": str(exc)}, status=400)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_statistiques(request, format_export):
    try:
        corps = calculer(
            request.GET.get("structure", ""),
            request.GET.get("segment", ""),
            request.GET.get("exercice", ""),
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
            "valeur": _n(FicheBesoin.objects.filter(statut=FicheBesoin.Statut.INSTRUCTION).count()),
            "detail": f"{_n(FicheBesoin.objects.filter(critique=True, statut=FicheBesoin.Statut.INSTRUCTION).count())} fiches critiques",
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
            "campagne": snap.dashboard.get("campagne"),
            # Indicateurs et états lus en direct, à la place des chiffres figés de l'instantané.
            "kpis": kpis(request.user, EXERCICE, etats_calcules),
            "etats": etats_calcules,
            "modules": _activite(),
            "visas": [visa_row(item) for item in visas],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_pilotage(request):
    from .rapports.pilotage import rendre_pilotage

    contenu = rendre_pilotage(request.user)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="rapport-pilotage-{EXERCICE}.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def agents(request):
    query = str(request.query_params.get("q") or "").strip()
    rows = Agent.objects.select_related("organisme")
    matricules = perimetre_matricules(request.user)
    if matricules is not None:
        rows = rows.filter(matricule__in=matricules)
    if query:
        rows = rows.filter(nom__icontains=query) | rows.filter(prenoms__icontains=query) | rows.filter(
            matricule__icontains=query
        )
    return Response([agent_brief(agent) for agent in rows.distinct()])


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
    if request.method == "PATCH":
        from .saisie import enregistrer_situation

        erreur = enregistrer_situation(agent, request.data)
        if erreur:
            return Response({"detail": erreur}, status=400)
    return Response(agent_detail(agent))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def inscrire_formation(request, matricule: str):
    from .inscriptions import inscrire

    agent = get_object_or_404(Agent.objects.select_related("organisme"), matricule=matricule)
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
    erreur = deposer(agent, request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(agent_detail(agent), status=201)


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
    erreur, notifiee = valider_etape(demande, request.user)
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
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
def carrieres(_request):
    snap = _snapshot()
    lignes = LigneAvancement.objects.select_related("agent", "agent__organisme")
    mouvements = MouvementStrategique.objects.select_related("agent", "agent__organisme", "organisme")
    alertes = AlerteReleve.objects.select_related("titulaire", "titulaire__organisme", "organisme")
    return Response(
        {
            **snap.carriere,
            "lignes": [avancement_row(item) for item in lignes],
            "mouvements": [mouvement_row(item) for item in mouvements],
            "alertes": [alerte_row(item) for item in alertes],
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def carrieres_registres(_request):
    agents = Agent.objects.select_related("organisme").prefetch_related("actes")
    absences = Absence.objects.select_related("agent", "agent__organisme")
    actes = Acte.objects.filter(domaine__in=[Acte.Domaine.CARRIERE, Acte.Domaine.CONGE]).select_related(
        "agent", "agent__organisme"
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
        "Pilotage du plan",
        "Candidatures",
        "Catalogue des cycles",
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
