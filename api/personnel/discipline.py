"""Carrières · Procédures disciplinaires : registre, commission paritaire, effacement des sanctions."""

from datetime import date, datetime, time, timedelta

from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Agent, BlocEcran, Notification, PieceJointe, PositionAdministrative, ProcedureDisciplinaire, SanctionDisciplinaire, SessionParitaire
from .roles import ROLES_SIMPLES
from .rapports.convocation import Signataire, rendre_convocation
from .parcours import peut_gerer_carriere, refus_carriere
from .visibilite import agent_visible, agents_visibles, refus_hors_perimetre
from .present import agent_brief

# Repli si le bloc « regles » n'est pas encore versé : les valeurs servies viennent de la base.
REGLES_DEFAUT = {
    "delai_jours": 30,
    "effacement_ans": 3,
    "horizon_jours": 120,
    "stade_ouverture": "Instruction ouverte",
    "detail_ouverture": "Communication du dossier à l'agent",
}


# L'échelle des sanctions compte deux degrés : le 1er degré, et le 2nd devant le conseil de discipline.
DEGRES = {1, 2}


def _echelle(blocs: dict) -> dict:
    echelle = dict(blocs.get("echelle") or {})
    if "degres" in echelle:
        echelle["degres"] = [item for item in echelle["degres"] or [] if str(item.get("degre", "")).isdigit() and int(item["degre"]) in DEGRES]
    return echelle


def _blocs() -> dict:
    return {bloc.cle: bloc.contenu for bloc in BlocEcran.objects.filter(ecran="discipline")}


def _regles(blocs: dict) -> dict:
    contenu = blocs.get("regles") or {}
    return {cle: contenu.get(cle, defaut) for cle, defaut in REGLES_DEFAUT.items()}


def _effacement(sanction: SanctionDisciplinaire, ans: int) -> date:
    prononcee = sanction.prononcee_le
    try:
        return prononcee.replace(year=prononcee.year + ans)
    except ValueError:  # 29 février
        return prononcee.replace(year=prononcee.year + ans, day=28)


def exclusion_en_cours(item: ProcedureDisciplinaire, aujourd_hui: date) -> PositionAdministrative | None:
    """L'exclusion temporaire que cette procédure a prononcée, tant qu'elle est en cours et que l'agent n'est pas réintégré."""
    if item.reintegre_le is not None:
        return None
    return next(
        (
            p for p in item.positions.all()
            if p.type == PositionAdministrative.Type.EXCLUSION and p.date_debut <= aujourd_hui and (p.date_fin is None or p.date_fin >= aujourd_hui)
        ),
        None,
    )


def procedure_row(item: ProcedureDisciplinaire, aujourd_hui: date, delai: int) -> dict:
    echeance = item.saisine + timedelta(days=delai)
    exclusion = exclusion_en_cours(item, aujourd_hui)
    reprise = exclusion.date_fin + timedelta(days=1) if exclusion is not None and exclusion.date_fin else None
    return {
        "id": item.id,
        "reference": item.reference,
        "agent": {**agent_brief(item.agent), "fonction": item.agent.fonction},
        "saisine": item.saisine.isoformat(),
        "echeance": echeance.isoformat(),
        "jours_restants": (echeance - aujourd_hui).days,
        "grief": item.grief,
        "description": item.description,
        "degre": item.degre,
        "rapporteur": item.rapporteur,
        "stade": item.stade,
        "stade_detail": item.stade_detail,
        "avis": item.avis,
        "avis_libelle": item.get_avis_display(),
        "phase": item.phase,
        "phase_libelle": item.get_phase_display(),
        "decision": item.decision,
        "sanction_nature": item.sanction_nature,
        "sanction_libelle": dict(SanctionDisciplinaire.Nature.choices).get(item.sanction_nature, ""),
        "date_decision": item.date_decision.isoformat() if item.date_decision else "",
        "executee_le": item.executee_le.isoformat() if item.executee_le else "",
        "duree_jours": item.duree_jours,
        "reintegre_le": item.reintegre_le.isoformat() if item.reintegre_le else "",
        # Exclusion en cours : l'agent peut être réintégré maintenant, ou l'être automatiquement à la date de reprise.
        "exclusion_en_cours": exclusion is not None,
        "reprise_le": reprise.isoformat() if reprise else "",
        "jours_avant_reprise": (reprise - aujourd_hui).days if reprise else None,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def procedures(request):
    if request.method == "POST":
        return _saisir(request)
    aujourd_hui = timezone.localdate()
    blocs = _blocs()
    regles = _regles(blocs)
    delai = int(regles["delai_jours"])
    ans = int(regles["effacement_ans"])
    horizon = int(regles["horizon_jours"])
    lignes = list(agents_visibles(ProcedureDisciplinaire.objects.select_related("agent", "agent__organisme").prefetch_related("positions"), request.user, "agent__matricule"))
    actives = [item for item in lignes if item.avis not in {ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE}]
    sanctions = list(agents_visibles(SanctionDisciplinaire.objects.select_related("agent"), request.user, "agent__matricule"))
    exercice = [item for item in sanctions if item.prononcee_le.year == aujourd_hui.year]
    premier = [item for item in exercice if item.degre == 1]
    # Décisions de l'exercice : une procédure aboutit à une sanction (du 1er ou du 2nd degré) ou est classée sans suite (non-lieu).
    decidees = [
        item for item in lignes
        if item.avis in {ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE}
        and (item.date_decision or item.saisine).year == aujourd_hui.year
    ]
    sanctionnees = [item for item in decidees if item.avis == ProcedureDisciplinaire.Avis.SANCTION]
    sessions = list(SessionParitaire.objects.filter(date__date__gte=aujourd_hui))
    effacements = sorted(
        (
            (item, _effacement(item, ans))
            for item in sanctions
            if item.degre == 1 and aujourd_hui <= _effacement(item, ans) <= aujourd_hui + timedelta(days=horizon)
        ),
        key=lambda paire: paire[1],
    )
    return Response(
        {
            "exercice": aujourd_hui.year,
            "regles": regles,
            "entete": blocs.get("entete") or {},
            "echelle": _echelle(blocs),
            "registre_texte": blocs.get("registre") or {},
            "calendrier": blocs.get("calendrier") or {},
            "amnistie": blocs.get("amnistie") or {},
            "suivi": blocs.get("suivi") or {},
            "indicateurs": {
                "instruction": len(actives),
                "dans_les_delais": sum(1 for item in actives if (item.saisine + timedelta(days=delai)) >= aujourd_hui),
                "sanctions_premier_degre": len(premier),
                "avertissements": sum(1 for item in premier if item.nature == SanctionDisciplinaire.Nature.AVERTISSEMENT),
                "blames": sum(1 for item in premier if item.nature == SanctionDisciplinaire.Nature.BLAME),
                "sessions": len(sessions),
                "second_degre": sum(1 for item in actives if item.degre >= 2),
                "decisions": len(decidees),
                "decisions_premier_degre": sum(1 for item in sanctionnees if item.degre == 1),
                "decisions_second_degre": sum(1 for item in sanctionnees if item.degre >= 2),
                "non_lieu": len(decidees) - len(sanctionnees),
            },
            "regularite": _regularite(actives, delai, aujourd_hui),
            "procedures": [procedure_row(item, aujourd_hui, delai) for item in lignes],
            "etats_session": [{"code": code, "libelle": libelle} for code, libelle in SessionParitaire.Etat.choices],
            "phases": [{"code": code, "libelle": libelle} for code, libelle in ProcedureDisciplinaire.Phase.choices],
            "avis_possibles": [
                {"code": code, "libelle": libelle}
                for code, libelle in ProcedureDisciplinaire.Avis.choices
                if code not in {ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE}
            ],
            "natures_sanction": [{"code": code, "libelle": libelle} for code, libelle in SanctionDisciplinaire.Nature.choices],
            "sessions": [_session_row(item) for item in sessions],
            "effacements": [
                {
                    "agent": agent_brief(item.agent),
                    "nature": item.get_nature_display(),
                    "annee": item.prononcee_le.year,
                    "le": quand.isoformat(),
                }
                for item, quand in effacements
            ],
            "agents": [
                {"matricule": agent.matricule, "nom_complet": agent.nom_complet, "organisme_sigle": agent.organisme.sigle}
                for agent in agents_visibles(Agent.objects.select_related("organisme"), request.user).order_by("nom", "prenoms")
            ],
        }
    )


def _regularite(actives: list, delai: int, aujourd_hui: date) -> dict:
    """Part des procédures en cours encore dans leur délai d'instruction."""
    if not actives:
        return {"taux": None, "detail": "Aucune procédure en cours"}
    dans_les_delais = sum(1 for item in actives if item.saisine + timedelta(days=delai) >= aujourd_hui)
    return {
        "taux": round(100 * dans_les_delais / len(actives)),
        "detail": f"{dans_les_delais} procédure{'s' if dans_les_delais > 1 else ''} sur {len(actives)} dans le délai de {delai} jours",
    }


def _session_row(item: SessionParitaire) -> dict:
    return {
        "code": item.code,
        "intitule": item.intitule,
        "date": timezone.localtime(item.date).isoformat(),
        "etat": item.etat,
        "etat_libelle": item.get_etat_display(),
        "ordre_du_jour": item.ordre_du_jour,
        "description": item.description,
        "composition": item.composition,
        "lieu": item.lieu,
    }


def _saisir(request):
    """Saisir la commission : la procédure s'ouvre en instruction, avec son rapporteur."""
    donnees = request.data
    agent = Agent.objects.select_related("organisme").filter(matricule__iexact=(donnees.get("matricule") or "").strip()).first()
    if agent is None:
        return Response({"detail": "Aucun agent ne porte ce matricule."}, status=400)
    if not peut_gerer_carriere(request.user, agent):
        return refus_carriere()
    grief = (donnees.get("grief") or "").strip()
    description = (donnees.get("description") or "").strip()
    # Le rapporteur n'est pas obligatoire à l'ouverture : il peut être désigné ensuite.
    matricule_rapporteur = (donnees.get("rapporteur") or "").strip()
    rapporteur = Agent.objects.filter(matricule__iexact=matricule_rapporteur).first() if matricule_rapporteur else None
    if not grief or not description:
        return Response({"detail": "La faute et les faits reprochés sont obligatoires."}, status=400)
    if matricule_rapporteur and rapporteur is None:
        return Response({"detail": "Aucun agent ne porte le matricule du rapporteur."}, status=400)
    if rapporteur is not None and rapporteur.pk == agent.pk:
        return Response({"detail": "Le rapporteur ne peut pas être l'agent mis en cause."}, status=400)
    try:
        degre = int(donnees.get("degre") or 1)
    except (TypeError, ValueError):
        degre = 0
    blocs = _blocs()
    connus = {int(item["degre"]) for item in (blocs.get("echelle") or {}).get("degres") or [] if str(item.get("degre", "")).isdigit()}
    if degre not in ((connus or {1, 2}) & DEGRES):
        return Response({"detail": "Ce degré ne figure pas sur l'échelle des sanctions."}, status=400)
    aujourd_hui = timezone.localdate()
    regles = _regles(blocs)
    delai = int(regles["delai_jours"])
    with transaction.atomic():
        numero = ProcedureDisciplinaire.objects.filter(reference__startswith=f"DISC-{aujourd_hui.year}-").count() + 1
        reference = f"DISC-{aujourd_hui.year}-{numero:03d}"
        while ProcedureDisciplinaire.objects.filter(reference=reference).exists():
            numero += 1
            reference = f"DISC-{aujourd_hui.year}-{numero:03d}"
        item = ProcedureDisciplinaire.objects.create(
            reference=reference, agent=agent, saisine=aujourd_hui, grief=grief[:160], description=description,
            degre=degre, rapporteur=rapporteur.nom_complet[:120] if rapporteur else "",
            stade=str(regles["stade_ouverture"])[:120], stade_detail=str(regles["detail_ouverture"])[:160],
            phase=ProcedureDisciplinaire.Phase.INSTRUCTION,
        )
        _notifier_convocation(item, blocs)
    return Response(procedure_row(item, aujourd_hui, delai), status=201)


def _contenu(item: ProcedureDisciplinaire, blocs: dict | None = None) -> bytes:
    blocs = _blocs() if blocs is None else blocs
    delai = int(_regles(blocs)["delai_jours"])
    return rendre_convocation(
        item,
        echeance=item.saisine + timedelta(days=delai),
        delai=delai,
        degre=_degre(blocs, item.degre),
        seance=_seance_liee(item.reference),
        signataire=resoudre_signataire(),
    )


def resoudre_signataire() -> Signataire | None:
    """Signature du DRH si elle est déposée, sinon celle de son intérimaire ou de son remplaçant."""
    titulaire = (
        User.objects.filter(is_active=True, profil__structure__code="drh")
        .exclude(profil__role__in=ROLES_SIMPLES)
        .select_related("profil", "profil__structure")
        .order_by("pk")
        .first()
    )
    if titulaire is None:
        titulaire = User.objects.filter(is_active=True, profil__role="DRH").select_related("profil").order_by("pk").first()
    image = _octets_signature(getattr(titulaire, "profil", None))
    if titulaire is not None and image:
        return Signataire(_nom(titulaire), "Le Directeur des ressources humaines", "", image)
    structure_id = getattr(getattr(titulaire, "profil", None), "structure_id", None)
    if structure_id is None:
        from .models import EntiteTutelle

        structure_id = EntiteTutelle.objects.filter(code="drh").values_list("pk", flat=True).first()
    autre = None
    if structure_id:
        autre = (
            User.objects.filter(is_active=True, profil__interim_id=structure_id)
            .exclude(pk=titulaire.pk if titulaire else 0)
            .select_related("profil")
            .order_by("pk")
            .first()
        )
    image_autre = _octets_signature(getattr(autre, "profil", None))
    if autre is not None and image_autre:
        if titulaire is not None:
            return Signataire(
                _nom(autre),
                "Remplaçant du directeur des ressources humaines",
                f"en remplacement de {_nom(titulaire)}",
                image_autre,
            )
        return Signataire(_nom(autre), "Intérimaire du directeur des ressources humaines", "", image_autre)
    if titulaire is not None:
        return Signataire(_nom(titulaire), "Le Directeur des ressources humaines", "", None)
    return None


def _nom(user: User) -> str:
    return user.get_full_name() or user.username


def _octets_signature(profil) -> bytes | None:
    champ = getattr(profil, "signature", None)
    if not champ:
        return None
    try:
        with champ.open("rb") as fichier:
            contenu = fichier.read()
    except (OSError, ValueError):
        return None
    return contenu or None


def _notifier_convocation(item: ProcedureDisciplinaire, blocs: dict) -> None:
    """Verse la convocation au dossier numérique et prévient l'agent, en urgence."""
    contenu = _contenu(item, blocs)
    nom = f"convocation-{item.reference}.pdf"
    piece = PieceJointe(
        agent=item.agent,
        intitule=f"Convocation disciplinaire {item.reference}"[:200],
        categorie="Actes de carrière",
        date_depot=timezone.localdate(),
        taille_ko=max(1, (len(contenu) + 1023) // 1024),
        verifiee=True,
    )
    piece.fichier.save(nom, ContentFile(contenu), save=False)
    piece.save()
    compte = User.objects.filter(username=item.agent.matricule, is_active=True).first()
    if compte is None:
        return
    Notification.objects.create(
        destinataire=compte,
        categorie=Notification.Categorie.DOSSIER,
        titre="Convocation disciplinaire — urgent",
        message=(
            f"{item.reference} · {item.grief}. "
            "La convocation est dans votre dossier numérique. Téléchargez-la sans délai."
        )[:280],
        lien=f"/app/dossiers/{item.agent.matricule}?onglet=pieces",
        urgente=True,
        creee_le=timezone.now(),
    )


def _degre(blocs: dict, degre: int) -> dict | None:
    for item in (blocs.get("echelle") or {}).get("degres") or []:
        try:
            if int(item.get("degre")) == degre:
                return item
        except (TypeError, ValueError):
            continue
    return None


def _seance_liee(reference: str) -> SessionParitaire | None:
    """Prochaine séance dont l'ordre du jour cite ce dossier."""
    return (
        SessionParitaire.objects.filter(ordre_du_jour__icontains=reference, date__date__gte=timezone.localdate())
        .order_by("date")
        .first()
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def convocation(request, pk: int):
    """Convocation formelle établie à partir du dossier d'instruction."""
    item = get_object_or_404(ProcedureDisciplinaire.objects.select_related("agent", "agent__organisme"), pk=pk)
    if not agent_visible(request.user, item.agent):
        return refus_hors_perimetre()
    contenu = _contenu(item)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="convocation-{item.reference}.pdf"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def fixer_session(request):
    """Inscrit une séance à venir au calendrier de la commission paritaire."""
    donnees = request.data
    intitule = (donnees.get("intitule") or "").strip()
    ordre = (donnees.get("ordre_du_jour") or "").strip()
    if not intitule or not ordre:
        return Response({"detail": "L'intitulé et l'ordre du jour sont obligatoires."}, status=400)
    try:
        quand = datetime.combine(date.fromisoformat(donnees.get("date") or ""), time.fromisoformat(donnees.get("heure") or ""))
    except (TypeError, ValueError):
        return Response({"detail": "Indiquez la date et l'heure de la séance."}, status=400)
    quand = timezone.make_aware(quand) if timezone.is_naive(quand) else quand
    if timezone.localtime(quand).date() < timezone.localdate():
        return Response({"detail": "La séance doit être fixée à une date à venir."}, status=400)
    etat = (donnees.get("etat") or SessionParitaire.Etat.A_CONFIRMER).strip()
    if etat not in SessionParitaire.Etat.values:
        return Response({"detail": "Cet état de séance n'existe pas."}, status=400)
    matricules = donnees.get("composition") or []
    if not isinstance(matricules, list):
        return Response({"detail": "La composition est une liste de matricules."}, status=400)
    composition = []
    for matricule in matricules:
        personne = Agent.objects.filter(matricule__iexact=str(matricule).strip()).select_related("organisme").first()
        if personne is None:
            return Response({"detail": "Chaque membre de la composition doit être un agent du système."}, status=400)
        composition.append(f"{personne.nom_complet} · {personne.organisme.sigle}"[:120])
    lieu = (donnees.get("lieu") or "").strip()[:120]
    description = (donnees.get("description") or "").strip()
    annee = timezone.localtime(quand).year
    with transaction.atomic():
        numero = SessionParitaire.objects.filter(code__startswith=f"{str(annee)[2:]}-S").count() + 1
        code = f"{str(annee)[2:]}-S{numero}"
        while SessionParitaire.objects.filter(code=code).exists():
            numero += 1
            code = f"{str(annee)[2:]}-S{numero}"
        item = SessionParitaire.objects.create(
            code=code, intitule=intitule[:120], date=quand, etat=etat, ordre_du_jour=ordre[:240],
            description=description, composition=composition, lieu=lieu,
        )
    return Response(_session_row(item), status=201)


def _jour(valeur, libelle: str):
    """(date | None, erreur)."""
    if not valeur:
        return None, None
    if isinstance(valeur, date):
        return valeur, None
    try:
        jour = date.fromisoformat(str(valeur))
    except ValueError:
        return None, f"{libelle} n'est pas valide."
    return jour, None


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def procedure(request, pk: int):
    """Met à jour la procédure (phase, décision, exécution) ou la supprime. L'agent la suit depuis son profil."""
    item = get_object_or_404(ProcedureDisciplinaire.objects.select_related("agent", "agent__organisme"), pk=pk)
    if not peut_gerer_carriere(request.user, item.agent):
        return refus_carriere()
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)

    donnees = request.data
    aujourd_hui = timezone.localdate()
    blocs = _blocs()
    delai = int(_regles(blocs)["delai_jours"])

    grief = (donnees.get("grief", item.grief) or "").strip()
    description = (donnees.get("description", item.description) or "").strip()
    if not grief or not description:
        return Response({"detail": "La faute et les faits reprochés sont obligatoires."}, status=400)
    try:
        degre = int(donnees.get("degre", item.degre))
    except (TypeError, ValueError):
        degre = 0
    connus = {int(d["degre"]) for d in (blocs.get("echelle") or {}).get("degres") or [] if str(d.get("degre", "")).isdigit()}
    # Le non-lieu (degré 0) est une issue possible d'une procédure ouverte, pas un degré d'ouverture.
    if degre not in (((connus or {1, 2}) & DEGRES) | {0}) and degre != item.degre:
        return Response({"detail": "Ce degré ne figure pas sur l'échelle des sanctions."}, status=400)
    non_lieu = degre == 0
    duree = donnees.get("duree_jours", item.duree_jours)
    try:
        duree = int(duree) if duree not in (None, "") else None
    except (TypeError, ValueError):
        return Response({"detail": "La durée de la sanction est un nombre de jours."}, status=400)
    if duree is not None and not 1 <= duree <= 3650:
        return Response({"detail": "La durée de la sanction va de 1 jour à 10 ans."}, status=400)

    rapporteur = item.rapporteur
    if donnees.get("rapporteur"):
        choisi = Agent.objects.filter(matricule__iexact=str(donnees["rapporteur"]).strip()).first()
        if choisi is None:
            return Response({"detail": "Aucun agent ne porte le matricule du rapporteur."}, status=400)
        if choisi.pk == item.agent_id:
            return Response({"detail": "Le rapporteur ne peut pas être l'agent mis en cause."}, status=400)
        rapporteur = choisi.nom_complet[:120]

    phase = donnees.get("phase", item.phase)
    if phase not in {code for code, _libelle in ProcedureDisciplinaire.Phase.choices}:
        return Response({"detail": "Choisissez la phase de la procédure."}, status=400)
    decision = (donnees.get("decision", item.decision) or "").strip()[:240]
    nature = donnees.get("sanction_nature", item.sanction_nature) or ""
    if nature and nature not in {code for code, _libelle in SanctionDisciplinaire.Nature.choices}:
        return Response({"detail": "La nature de la sanction n'est pas valide."}, status=400)
    date_decision, erreur = _jour(donnees.get("date_decision", item.date_decision), "La date de la décision")
    if erreur:
        return Response({"detail": erreur}, status=400)
    executee_le, erreur = _jour(donnees.get("executee_le", item.executee_le), "La date d'exécution")
    if erreur:
        return Response({"detail": erreur}, status=400)

    if non_lieu and phase != ProcedureDisciplinaire.Phase.DECISION:
        return Response({"detail": "Un non-lieu se prononce à la phase Décision."}, status=400)
    if phase == ProcedureDisciplinaire.Phase.DECISION:
        if not decision or date_decision is None:
            return Response({"detail": "Une décision exige son contenu et sa date."}, status=400)
        if non_lieu:
            nature = ""
        elif not nature:
            return Response({"detail": "Choisissez la sanction prononcée, ou le non-lieu."}, status=400)
        if date_decision > aujourd_hui:
            return Response({"detail": "La décision ne peut pas être datée dans le futur."}, status=400)
        if date_decision < item.saisine:
            return Response({"detail": "La décision ne peut pas précéder la saisine."}, status=400)
        if executee_le is not None and executee_le < date_decision:
            return Response({"detail": "L'exécution ne peut pas précéder la décision."}, status=400)
        avis = ProcedureDisciplinaire.Avis.CLASSEE if non_lieu else ProcedureDisciplinaire.Avis.SANCTION
        if non_lieu:
            duree = None
    else:
        duree = None
        nature, decision, date_decision, executee_le = "", "", None, None
        # L'avis suit la phase : plus de saisie séparée.
        avis = ProcedureDisciplinaire.Avis.DELIBERE if phase == ProcedureDisciplinaire.Phase.AUDIENCE else ProcedureDisciplinaire.Avis.INSTRUCTION

    with transaction.atomic():
        item.grief, item.description, item.degre, item.rapporteur = grief[:160], description, degre, rapporteur
        item.phase, item.avis = phase, avis
        item.stade = item.get_phase_display()
        item.decision, item.sanction_nature, item.date_decision, item.executee_le = decision, nature, date_decision, executee_le
        item.duree_jours = duree
        item.save()
        _appliquer_exclusion(item, nature, date_decision, executee_le, duree)
        # La sanction du registre suit la décision : créée, mise à jour, ou retirée avec elle.
        if nature and date_decision:
            SanctionDisciplinaire.objects.update_or_create(
                procedure=item, defaults={"agent": item.agent, "nature": nature, "degre": degre, "prononcee_le": date_decision},
            )
        else:
            item.sanctions.all().delete()
    item.refresh_from_db()
    return Response(procedure_row(item, aujourd_hui, delai))


# --- Durée de la sanction, exclusion temporaire et réintégration -------------------------------------------


def _appliquer_exclusion(item: ProcedureDisciplinaire, nature: str, date_decision, executee_le, duree: int | None) -> None:
    """Une exclusion temporaire place l'agent dans une position à dates : elle prend fin toute seule à la date de reprise.

    La durée court à partir de l'exécution, à défaut de la décision. Sans durée, l'exclusion dure jusqu'à la réintégration.
    """
    from .positions import synchroniser_situation

    debut = executee_le or date_decision
    if nature == SanctionDisciplinaire.Nature.EXCLUSION and debut is not None:
        fin = debut + timedelta(days=duree - 1) if duree else None
        PositionAdministrative.objects.update_or_create(
            procedure=item,
            defaults={
                "agent": item.agent, "type": PositionAdministrative.Type.EXCLUSION, "date_debut": debut, "date_fin": fin,
                "motif": f"Sanction disciplinaire {item.reference}", "reference_acte": item.reference, "detail": item.decision[:300],
            },
        )
        item.reintegre_le = None
        item.save(update_fields=["reintegre_le"])
    else:
        item.positions.all().delete()
        if item.reintegre_le is not None:
            item.reintegre_le = None
            item.save(update_fields=["reintegre_le"])
    synchroniser_situation(item.agent)


def _equipe_rh() -> list[User]:
    """L'équipe RH et le DRH : ils sont alertés des réintégrations."""
    from .planification import _est_drh, _est_rh

    return [user for user in User.objects.filter(is_active=True).select_related("profil") if _est_rh(user) or _est_drh(user)]


def _alerter(destinataires, titre: str, message: str, urgente: bool, lien: str) -> int:
    """Une alerte par destinataire, jamais deux fois la même pour une procédure."""
    envois = 0
    for user in destinataires:
        if Notification.objects.filter(destinataire=user, titre=titre, message=message[:280]).exists():
            continue
        Notification.objects.create(
            destinataire=user, categorie=Notification.Categorie.DOSSIER, titre=titre, message=message[:280],
            lien=lien, urgente=urgente, creee_le=timezone.now(),
        )
        envois += 1
    return envois


def reintegrer(item: ProcedureDisciplinaire, aujourd_hui: date | None = None, *, automatique: bool = False) -> bool:
    """Met fin à l'exclusion : l'agent reprend son poste. Retourne vrai quand une exclusion a été levée."""
    from .positions import synchroniser_situation

    aujourd_hui = aujourd_hui or timezone.localdate()
    exclusion = item.positions.filter(type=PositionAdministrative.Type.EXCLUSION).order_by("-date_debut").first()
    if exclusion is None or item.reintegre_le is not None:
        return False
    if exclusion.date_debut >= aujourd_hui:
        exclusion.delete()
    elif exclusion.date_fin is None or exclusion.date_fin >= aujourd_hui:
        exclusion.date_fin = aujourd_hui - timedelta(days=1)
        exclusion.save(update_fields=["date_fin"])
    item.reintegre_le = aujourd_hui
    item.save(update_fields=["reintegre_le"])
    agent = item.agent
    synchroniser_situation(agent)
    lien = "/app/carrieres/discipline"
    quand = "automatiquement " if automatique else ""
    _alerter(
        _equipe_rh(), f"Agent réintégré : {agent.nom_complet}",
        f"{item.reference} · {agent.nom_complet} ({agent.matricule}) est {quand}réintégré(e) le {aujourd_hui.strftime('%d/%m/%Y')} à la fin de son exclusion.", False, lien,
    )
    compte = User.objects.filter(username=agent.matricule).first()
    if compte is not None:
        _alerter([compte], "Vous reprenez votre poste", f"Votre exclusion temporaire ({item.reference}) a pris fin : vous êtes réintégré(e) le {aujourd_hui.strftime('%d/%m/%Y')}.", False, f"/app/agents/{agent.matricule}")
    return True


def surveiller_reintegrations(aujourd_hui: date | None = None) -> int:
    """Alerte l'équipe RH à l'approche de la fin d'une exclusion (7 jours, la veille), puis réintègre l'agent à la date de reprise.

    S'appuie sur les dates : une exclusion sans durée n'a pas de terme, elle ne prend fin que par la réintégration manuelle.
    Retourne le nombre d'alertes et de réintégrations.
    """
    aujourd_hui = aujourd_hui or timezone.localdate()
    equipe = _equipe_rh()
    total = 0
    lien = "/app/carrieres/discipline"
    exclusions = PositionAdministrative.objects.filter(
        type=PositionAdministrative.Type.EXCLUSION, procedure__isnull=False, procedure__reintegre_le__isnull=True, date_fin__isnull=False,
    ).select_related("procedure", "agent")
    for exclusion in exclusions:
        item = exclusion.procedure
        agent = exclusion.agent
        jours = (exclusion.date_fin + timedelta(days=1) - aujourd_hui).days  # jours avant la reprise
        reprise = (exclusion.date_fin + timedelta(days=1)).strftime("%d/%m/%Y")
        if jours <= 0:
            total += int(reintegrer(item, aujourd_hui, automatique=True))
            continue
        if jours <= 1:
            total += _alerter(equipe, f"Réintégration demain : {agent.nom_complet}", f"{item.reference} · {agent.nom_complet} reprend son poste demain, le {reprise}. Préparez sa réintégration.", True, lien)
        elif jours <= 7:
            total += _alerter(equipe, f"Réintégration dans {jours} jours : {agent.nom_complet}", f"{item.reference} · l'exclusion de {agent.nom_complet} prend fin le {reprise}. La réintégration sera automatique.", False, lien)
    return total


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reintegrer_agent(request, pk: int):
    """Réintègre dès maintenant l'agent exclu : fin de l'exclusion, alerte de l'équipe RH."""
    item = get_object_or_404(ProcedureDisciplinaire.objects.select_related("agent", "agent__organisme"), pk=pk)
    if not peut_gerer_carriere(request.user, item.agent):
        return refus_carriere()
    aujourd_hui = timezone.localdate()
    if exclusion_en_cours(item, aujourd_hui) is None:
        return Response({"detail": "Aucune exclusion n'est en cours pour cette procédure."}, status=409)
    reintegrer(item, aujourd_hui)
    item.refresh_from_db()
    delai = int(_regles(_blocs())["delai_jours"])
    return Response(procedure_row(item, aujourd_hui, delai))
