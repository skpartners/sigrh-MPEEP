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

from .models import Agent, BlocEcran, Notification, PieceJointe, ProcedureDisciplinaire, SanctionDisciplinaire, SessionParitaire
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


def procedure_row(item: ProcedureDisciplinaire, aujourd_hui: date, delai: int) -> dict:
    echeance = item.saisine + timedelta(days=delai)
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
    lignes = list(agents_visibles(ProcedureDisciplinaire.objects.select_related("agent", "agent__organisme"), request.user, "agent__matricule"))
    actives = [item for item in lignes if item.avis not in {ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE}]
    sanctions = list(agents_visibles(SanctionDisciplinaire.objects.select_related("agent"), request.user, "agent__matricule"))
    exercice = [item for item in sanctions if item.prononcee_le.year == aujourd_hui.year]
    premier = [item for item in exercice if item.degre == 1]
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
            "echelle": blocs.get("echelle") or {},
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
        return Response({"detail": "Le grief et les faits reprochés sont obligatoires."}, status=400)
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
    if degre not in (connus or {1, 2, 3}):
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
            phase=ProcedureDisciplinaire.Phase.DEMANDE_EXPLICATION,
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
        .exclude(profil__role="Agent")
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
        return Response({"detail": "Le grief et les faits reprochés sont obligatoires."}, status=400)
    try:
        degre = int(donnees.get("degre", item.degre))
    except (TypeError, ValueError):
        degre = 0
    connus = {int(d["degre"]) for d in (blocs.get("echelle") or {}).get("degres") or [] if str(d.get("degre", "")).isdigit()}
    if degre not in (connus or {1, 2, 3}):
        return Response({"detail": "Ce degré ne figure pas sur l'échelle des sanctions."}, status=400)

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

    if phase == ProcedureDisciplinaire.Phase.DECISION_EXECUTION:
        if not decision or date_decision is None:
            return Response({"detail": "Une décision exige son contenu et sa date."}, status=400)
        if date_decision > aujourd_hui:
            return Response({"detail": "La décision ne peut pas être datée dans le futur."}, status=400)
        if date_decision < item.saisine:
            return Response({"detail": "La décision ne peut pas précéder la saisine."}, status=400)
        if executee_le is not None and executee_le < date_decision:
            return Response({"detail": "L'exécution ne peut pas précéder la décision."}, status=400)
        avis = ProcedureDisciplinaire.Avis.SANCTION if nature else ProcedureDisciplinaire.Avis.CLASSEE
    else:
        nature, decision, date_decision, executee_le = "", "", None, None
        avis = donnees.get("avis") or (
            ProcedureDisciplinaire.Avis.DELIBERE if phase == ProcedureDisciplinaire.Phase.INSTRUCTION_CONSEIL
            else ProcedureDisciplinaire.Avis.ATTENTE_REPONSE
        )
        if avis not in {code for code, _libelle in ProcedureDisciplinaire.Avis.choices} or avis in {
            ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE,
        }:
            return Response({"detail": "Cet avis ne convient pas à une procédure en cours."}, status=400)

    with transaction.atomic():
        item.grief, item.description, item.degre, item.rapporteur = grief[:160], description, degre, rapporteur
        item.phase, item.avis = phase, avis
        item.stade = item.get_phase_display()
        item.stade_detail = str(donnees.get("stade_detail", item.stade_detail) or "").strip()[:160]
        item.decision, item.sanction_nature, item.date_decision, item.executee_le = decision, nature, date_decision, executee_le
        item.save()
        # La sanction du registre suit la décision : créée, mise à jour, ou retirée avec elle.
        if nature and date_decision:
            SanctionDisciplinaire.objects.update_or_create(
                procedure=item, defaults={"agent": item.agent, "nature": nature, "degre": degre, "prononcee_le": date_decision},
            )
        else:
            item.sanctions.all().delete()
    return Response(procedure_row(item, aujourd_hui, delai))
