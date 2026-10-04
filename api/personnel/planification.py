"""Planification annuelle des congés : ouverture, remontée hiérarchique, arrêté du DRH."""

from datetime import datetime, timedelta

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Absence, Agent, CampagnePlanConge, MouvementPlanConge, Notification, PlanConge, Profil, Publication, RepriseConge

LIEN = "/app/carrieres/conges"


def _nom(user) -> str:
    if user is None:
        return "la hiérarchie"
    return user.get_full_name() or user.username


def _profil(user):
    return getattr(user, "profil", None)


def _est_drh(user) -> bool:
    profil = _profil(user)
    if profil is None:
        return False
    if profil.role == "DRH":
        return True
    return profil.role == "Directeur" and getattr(profil.structure, "code", "") == "drh"


def _est_rh(user) -> bool:
    profil = _profil(user)
    if profil is None or _est_drh(user):
        return False
    texte = f"{profil.role} {profil.fonction}".lower()
    return "carrière" in texte or "carriere" in texte or "ressource" in texte


def _notifier(user, titre: str, message: str, urgente: bool = False) -> None:
    if user is None:
        return
    Notification.objects.create(
        destinataire=user, categorie="demande", titre=titre, message=message[:280],
        lien=LIEN, urgente=urgente, creee_le=timezone.now(),
    )


def _date(valeur):
    if not valeur:
        return None
    try:
        return datetime.strptime(str(valeur)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _periode(corps) -> tuple | Response:
    debut = _date(corps.get("debut"))
    fin = _date(corps.get("fin"))
    if debut is None or fin is None or fin < debut:
        return Response({"detail": "Indiquez une date de début et une date de fin, dans cet ordre."}, status=400)
    return debut, fin


def _participants():
    return User.objects.filter(profil__isnull=False).exclude(profil__role="DRH").select_related("profil")


def _prochain(user):
    """Le plan quitte ce compte vers son supérieur, ou vers l'équipe RH si la chaîne s'arrête."""
    profil = _profil(user)
    superieur = profil.superieur if profil else None
    if superieur is None or _est_drh(superieur):
        return PlanConge.Palier.RH, None
    return PlanConge.Palier.HIERARCHIE, superieur


def _placer(plan: PlanConge, palier: str, chez) -> None:
    plan.palier = palier
    plan.chez = chez
    plan.save(update_fields=["palier", "chez", "debut", "fin", "origine"])


def _tracer(plan, auteur, action: str, motif: str = "") -> None:
    MouvementPlanConge.objects.create(
        plan=plan, auteur=auteur, action=action, motif=motif, debut=plan.debut, fin=plan.fin,
    )


def _campagne() -> CampagnePlanConge | None:
    return CampagnePlanConge.objects.order_by("-exercice").first()


def _duree_hierarchie(campagne: CampagnePlanConge) -> int:
    return max((campagne.limite_hierarchie - campagne.limite_agents).days, 1)


def _dans_le_delai(campagne: CampagnePlanConge, jour):
    return min(jour, campagne.delai)


def _avancer(campagne: CampagnePlanConge) -> None:
    """Ferme le choix des agents. Les dates manquantes restent à fixer par leur responsable."""
    if campagne.statut != CampagnePlanConge.Statut.OUVERTE or timezone.localdate() <= campagne.limite_agents:
        return
    campagne.statut = CampagnePlanConge.Statut.REMONTEE
    campagne.save(update_fields=["statut"])
    deja = set(campagne.plans.values_list("agent_id", flat=True))
    prevenus: dict[int, tuple] = {}
    for agent in _participants().exclude(id__in=deja):
        palier, chez = _prochain(agent)
        if chez is not None:
            prevenus[chez.id] = (chez, campagne.limite_hierarchie)
        elif palier == PlanConge.Palier.RH:
            for rh in _participants():
                if _est_rh(rh):
                    prevenus[rh.id] = (rh, campagne.limite_rh)
    for personne, echeance in prevenus.values():
        _notifier(
            personne, "Congés à fixer",
            f"La date limite des agents est passée. Fixez les dates de ceux qui n'ont pas choisi, avant le {echeance:%d/%m/%Y}.",
            urgente=True,
        )


def _peut_voir(user, plan: PlanConge) -> bool:
    if plan.agent_id == user.id or _est_drh(user) or _est_rh(user):
        return True
    return plan.chez_id == user.id or plan.reprises.filter(chez=user).exists()


def _fenetre(user, plan: PlanConge) -> str | None:
    """None si ce compte peut traiter le plan maintenant, sinon la raison du refus."""
    aujourd_hui = timezone.localdate()
    campagne = plan.campagne
    if plan.palier == PlanConge.Palier.HIERARCHIE and plan.chez_id == user.id:
        if aujourd_hui <= campagne.limite_agents:
            return (
                f"Les agents choisissent jusqu'au {campagne.limite_agents:%d/%m/%Y}. "
                f"Vous centraliserez ensuite, jusqu'au {campagne.limite_hierarchie:%d/%m/%Y}."
            )
        if plan.echeance and aujourd_hui > plan.echeance:
            return f"Votre date limite était le {plan.echeance:%d/%m/%Y}."
        return None
    if plan.palier == PlanConge.Palier.RH and _est_rh(user):
        borne = plan.echeance or campagne.limite_rh
        if aujourd_hui > borne:
            return f"La date limite de l'équipe RH était le {borne:%d/%m/%Y}."
        return None
    if plan.palier == PlanConge.Palier.DRH and _est_drh(user):
        borne = plan.echeance or campagne.limite_drh
        if aujourd_hui > borne:
            return f"La date limite du DRH était le {borne:%d/%m/%Y}."
        return None
    return "Ce plan n'est pas à votre niveau."


def _peut_traiter(user, plan: PlanConge) -> bool:
    return _fenetre(user, plan) is None


def _ligne(plan: PlanConge, user) -> dict:
    profil = _profil(plan.agent)
    return {
        "id": plan.id,
        "matricule": plan.agent.username,
        "nom": _nom(plan.agent),
        "fonction": profil.fonction if profil else "",
        "debut": plan.debut.isoformat(),
        "fin": plan.fin.isoformat(),
        "origine": plan.origine,
        "origine_libelle": plan.get_origine_display(),
        "echeance": plan.echeance.isoformat() if plan.echeance else None,
        "palier": plan.palier,
        "palier_libelle": plan.get_palier_display(),
        "chez": _nom(plan.chez) if plan.chez_id else "",
        "moi": plan.agent_id == user.id,
        "traitable": _peut_traiter(user, plan),
        "blocage": "" if (refus := _fenetre(user, plan)) in (None, "Ce plan n'est pas à votre niveau.") else refus,
        "mouvements": [
            {
                "auteur": _nom(item.auteur),
                "action": item.action,
                "motif": item.motif,
                "debut": item.debut.isoformat() if item.debut else None,
                "fin": item.fin.isoformat() if item.fin else None,
                "quand": timezone.localtime(item.cree_le).strftime("%d/%m/%Y %H:%M"),
            }
            for item in plan.mouvements.all()[:6]
        ],
    }


def _reprise(item: RepriseConge, user) -> dict:
    return {
        "id": item.id,
        "plan": item.plan_id,
        "agent": _nom(item.plan.agent),
        "demandeur": _nom(item.demandeur),
        "debut": item.debut.isoformat(),
        "fin": item.fin.isoformat(),
        "motif": item.motif,
        "palier": item.palier,
        "chez": _nom(item.chez) if item.chez_id else "",
        "traitable": (item.palier == RepriseConge.Palier.HIERARCHIE and item.chez_id == user.id)
        or (item.palier == RepriseConge.Palier.RH and _est_rh(user))
        or (item.palier == RepriseConge.Palier.DRH and _est_drh(user)),
    }


def _phase(campagne: CampagnePlanConge) -> str:
    if campagne.statut == CampagnePlanConge.Statut.ACCORD:
        return "accord"
    if campagne.statut == CampagnePlanConge.Statut.PUBLIEE:
        return "publiee"
    if campagne.statut == CampagnePlanConge.Statut.SOUMIS:
        return "drh"
    aujourd_hui = timezone.localdate()
    if campagne.statut == CampagnePlanConge.Statut.OUVERTE and aujourd_hui <= campagne.limite_agents:
        return "agents"
    if aujourd_hui <= campagne.limite_hierarchie:
        return "hierarchie"
    if aujourd_hui <= campagne.limite_rh:
        return "rh"
    return "drh"


def _sans_dates(user, campagne: CampagnePlanConge) -> list[dict]:
    if _phase(campagne) not in {"hierarchie", "rh"}:
        return []
    deja = set(campagne.plans.values_list("agent_id", flat=True))
    manquants = []
    for agent in _participants().exclude(id__in=deja).select_related("profil"):
        palier, chez = _prochain(agent)
        if chez is not None and chez.id == user.id and timezone.localdate() <= campagne.limite_hierarchie:
            manquants.append(agent)
        elif chez is None and palier == PlanConge.Palier.RH and _est_rh(user) and timezone.localdate() <= campagne.limite_rh:
            manquants.append(agent)
    return [
        {"matricule": agent.username, "nom": _nom(agent), "fonction": _profil(agent).fonction if _profil(agent) else ""}
        for agent in manquants
    ]


def _limites(campagne: CampagnePlanConge) -> list[dict]:
    return [
        {"niveau": "agents", "libelle": "Agents", "date": campagne.limite_agents.isoformat()},
        {"niveau": "hierarchie", "libelle": "Responsables", "date": campagne.limite_hierarchie.isoformat()},
        {"niveau": "rh", "libelle": "Équipe RH", "date": campagne.limite_rh.isoformat()},
        {"niveau": "drh", "libelle": "DRH", "date": campagne.limite_drh.isoformat()},
    ]


def _tableau(user) -> dict:
    campagne = _campagne()
    if campagne:
        _avancer(campagne)
        campagne.refresh_from_db()
    plans = []
    reprises = []
    if campagne:
        visibles = campagne.plans.select_related("agent", "agent__profil", "chez", "campagne").prefetch_related("mouvements", "mouvements__auteur")
        if not _est_drh(user) and not _est_rh(user):
            visibles = visibles.filter(Q(agent=user) | Q(chez=user))
        plans = [_ligne(item, user) for item in visibles]
        reprises = [
            _reprise(item, user)
            for item in RepriseConge.objects.filter(plan__campagne=campagne).select_related("plan__agent", "demandeur", "chez")
            if _est_drh(user) or _est_rh(user) or item.demandeur_id == user.id or item.chez_id == user.id or item.plan.agent_id == user.id
        ]
    moi = next((item for item in plans if item["moi"]), None)
    phase = _phase(campagne) if campagne else ""
    formulaire = bool(
        campagne and phase == "agents" and not _est_drh(user) and (moi is None or moi["palier"] == PlanConge.Palier.AGENT)
    )
    return {
        "role": "drh" if _est_drh(user) else "rh" if _est_rh(user) else "chef" if Profil.objects.filter(superieur=user).exists() else "agent",
        "campagne": None if campagne is None else {
            "id": campagne.id,
            "exercice": campagne.exercice,
            "statut": campagne.statut,
            "statut_libelle": campagne.get_statut_display(),
            "phase": phase,
            "delai": campagne.delai.isoformat(),
            "limites": _limites(campagne),
            "communique": campagne.communique,
            "formulaire": formulaire,
            "sans_dates": _sans_dates(user, campagne),
            "en_attente_hierarchie": campagne.plans.filter(palier=PlanConge.Palier.HIERARCHIE).count(),
            "chez_rh": campagne.plans.filter(palier=PlanConge.Palier.RH).count(),
            "participants": _participants().count(),
        },
        "plans": plans,
        "reprises": reprises,
    }


def _publier_communique(campagne: CampagnePlanConge, user) -> None:
    Publication.objects.create(
        reference=f"PLAN-CONGES-{campagne.exercice}",
        nature=Publication.Nature.COMMUNIQUE,
        urgence=Publication.Urgence.IMPORTANT,
        intitule=f"Planification des congés annuels {campagne.exercice}",
        corps=campagne.communique,
        perimetre=Publication.Perimetre.TOUS,
        statut=Publication.Statut.DIFFUSE,
        signataire=_nom(user),
        auteur=user,
        publiee_le=timezone.now(),
        accuse=False,
    )
    for agent in _participants():
        _notifier(
            agent, f"Planification des congés {campagne.exercice}",
            f"Choisissez vos dates avant le {campagne.limite_agents:%d/%m/%Y}. Passé ce délai, votre responsable les fixera.",
            urgente=True,
        )


def _bornes(corps) -> tuple | Response:
    delai = _date(corps.get("delai"))
    agents = _date(corps.get("limite_agents"))
    hierarchie = _date(corps.get("limite_hierarchie"))
    rh = _date(corps.get("limite_rh"))
    drh = _date(corps.get("limite_drh"))
    if delai is None or agents is None or hierarchie is None or rh is None or drh is None:
        return Response({"detail": "Indiquez le délai de la campagne et l'échéance de chaque niveau."}, status=400)
    if not agents < hierarchie < rh < drh <= delai:
        return Response({"detail": "Chaque échéance suit celle du niveau précédent, et toutes restent dans le délai de la campagne."}, status=400)
    return delai, agents, hierarchie, rh, drh


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tableau(request):
    return Response(_tableau(request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter(_request):
    """PDF de l'état des congés : soldes, campagne et plans arrêtés ou en cours."""
    from .rapports.documents import rendre_etat_conges

    annee = timezone.localdate().year
    totaux = Agent.objects.aggregate(acquis=Sum("conges_acquis"), consommes=Sum("conges_consommes"), reports=Sum("report_conges"))
    campagne = _campagne()
    plans = list(campagne.plans.select_related("agent", "agent__profil")) if campagne is not None else []
    cloturees = {Absence.Instruction.SIGNE, Absence.Instruction.REJETE, Absence.Instruction.DECALE}
    demandes = list(Absence.objects.exclude(instruction="").exclude(instruction__in=cloturees).select_related("agent").order_by("debut"))
    contenu = rendre_etat_conges(annee, totaux, campagne, plans, demandes)
    nom = f"etat-conges-{annee}.pdf"
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ouvrir(request):
    if not (_est_rh(request.user) or _est_drh(request.user)):
        return Response({"detail": "L'équipe RH ouvre la planification, avec l'accord du DRH."}, status=403)
    if CampagnePlanConge.objects.exclude(statut=CampagnePlanConge.Statut.PUBLIEE).exists():
        return Response({"detail": "Une planification est déjà en cours."}, status=409)
    bornes = _bornes(request.data)
    if isinstance(bornes, Response):
        return bornes
    exercice = int(request.data.get("exercice") or timezone.localdate().year)
    communique = str(request.data.get("communique") or "").strip()
    if not communique:
        return Response({"detail": "Indiquez le texte du communiqué."}, status=400)
    if CampagnePlanConge.objects.filter(exercice=exercice).exists():
        return Response({"detail": f"L'exercice {exercice} a déjà une planification."}, status=409)
    directe = _est_drh(request.user)
    campagne = CampagnePlanConge.objects.create(
        exercice=exercice, delai=bornes[0], limite_agents=bornes[1], limite_hierarchie=bornes[2], limite_rh=bornes[3], limite_drh=bornes[4],
        communique=communique,
        statut=CampagnePlanConge.Statut.OUVERTE if directe else CampagnePlanConge.Statut.ACCORD,
        ouverte_par=request.user, accordee_par=request.user if directe else None,
    )
    if directe:
        _publier_communique(campagne, request.user)
    else:
        for drh in User.objects.filter(profil__role="DRH"):
            _notifier(drh, "Accord sur la planification des congés", f"L'équipe RH propose d'ouvrir la campagne {exercice}. Votre accord est attendu.", urgente=True)
    return Response(_tableau(request.user), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accorder(request):
    if not _est_drh(request.user):
        return Response({"detail": "Seul le DRH accorde l'ouverture."}, status=403)
    campagne = get_object_or_404(CampagnePlanConge, statut=CampagnePlanConge.Statut.ACCORD)
    campagne.statut = CampagnePlanConge.Statut.OUVERTE
    campagne.accordee_par = request.user
    campagne.save(update_fields=["statut", "accordee_par"])
    _publier_communique(campagne, request.user)
    return Response(_tableau(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deposer(request):
    campagne = _campagne()
    if campagne is not None:
        _avancer(campagne)
        campagne.refresh_from_db()
    if campagne is None or campagne.statut != CampagnePlanConge.Statut.OUVERTE or timezone.localdate() > campagne.limite_agents:
        detail = "La date limite des agents est passée. Votre responsable fixera vos dates." if campagne and campagne.statut == CampagnePlanConge.Statut.REMONTEE else "La planification n'est pas ouverte."
        return Response({"detail": detail}, status=409)
    if _est_drh(request.user):
        return Response({"detail": "Le DRH ne dépose pas son propre calendrier dans cette campagne."}, status=403)
    if PlanConge.objects.filter(campagne=campagne, agent=request.user).exclude(palier=PlanConge.Palier.AGENT).exists():
        return Response({"detail": "Vos dates sont déjà transmises."}, status=409)
    periode = _periode(request.data)
    if isinstance(periode, Response):
        return periode
    palier, chez = _prochain(request.user)
    plan, _cree = PlanConge.objects.update_or_create(
        campagne=campagne, agent=request.user,
        defaults={
            "debut": periode[0], "fin": periode[1], "origine": PlanConge.Origine.SAISIE,
            "palier": palier, "chez": chez,
            "echeance": campagne.limite_hierarchie if palier == PlanConge.Palier.HIERARCHIE else campagne.limite_rh,
        },
    )
    _tracer(plan, request.user, "soumis")
    if chez:
        _notifier(
            chez, "Congés reçus",
            f"{_nom(request.user)} a choisi du {periode[0]:%d/%m/%Y} au {periode[1]:%d/%m/%Y}. Vous les viserez après le {campagne.limite_agents:%d/%m/%Y}.",
        )
    return Response(_tableau(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def fixer(request):
    campagne = _campagne()
    if campagne is None:
        return Response({"detail": "Aucune planification n'est ouverte."}, status=404)
    _avancer(campagne)
    campagne.refresh_from_db()
    if timezone.localdate() <= campagne.limite_agents:
        return Response({"detail": "Les agents choisissent encore leurs dates."}, status=409)
    if campagne.statut not in {CampagnePlanConge.Statut.OUVERTE, CampagnePlanConge.Statut.REMONTEE}:
        return Response({"detail": "Les dates ne se fixent plus à ce stade."}, status=409)
    agent = get_object_or_404(User, username=str(request.data.get("matricule") or "").strip())
    if PlanConge.objects.filter(campagne=campagne, agent=agent).exists():
        return Response({"detail": "Cet agent a déjà des dates."}, status=409)
    palier, chez = _prochain(agent)
    if chez is not None and chez.id == request.user.id:
        if timezone.localdate() > campagne.limite_hierarchie:
            return Response({"detail": f"Votre date limite était le {campagne.limite_hierarchie:%d/%m/%Y}."}, status=409)
        echeance = campagne.limite_hierarchie
    elif chez is None and palier == PlanConge.Palier.RH and _est_rh(request.user):
        if timezone.localdate() > campagne.limite_rh:
            return Response({"detail": f"La date limite de l'équipe RH était le {campagne.limite_rh:%d/%m/%Y}."}, status=409)
        echeance = campagne.limite_rh
    else:
        return Response({"detail": "Seul le responsable de cet agent fixe ses dates."}, status=403)
    periode = _periode(request.data)
    if isinstance(periode, Response):
        return periode
    plan = PlanConge.objects.create(
        campagne=campagne, agent=agent, debut=periode[0], fin=periode[1],
        origine=PlanConge.Origine.CHEF, palier=palier, chez=chez, echeance=echeance,
    )
    _tracer(plan, request.user, "fixe")
    _notifier(
        agent, "Vos congés ont été fixés",
        f"{_nom(request.user)} a fixé vos congés du {periode[0]:%d/%m/%Y} au {periode[1]:%d/%m/%Y}, vous n'aviez pas choisi vos dates.",
        urgente=True,
    )
    return Response(_tableau(request.user))


def _modifier(plan: PlanConge, user, debut, fin, motif: str) -> Response | None:
    change = debut != plan.debut or fin != plan.fin
    if change and not motif:
        return Response({"detail": "Joignez l'explication de la modification."}, status=400)
    plan.debut = debut
    plan.fin = fin
    if change:
        _tracer(plan, user, "modifie", motif)
        _notifier(
            plan.agent, "Vos congés ont été modifiés",
            f"{_nom(user)} a modifié vos dates : du {debut:%d/%m/%Y} au {fin:%d/%m/%Y}. Motif : {motif}",
            urgente=True,
        )
    return None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def transmettre(request, pk: int):
    plan = get_object_or_404(PlanConge.objects.select_related("agent", "chez", "campagne"), pk=pk)
    _avancer(plan.campagne)
    plan.refresh_from_db()
    refus = _fenetre(request.user, plan)
    if refus:
        return Response({"detail": refus}, status=403 if refus == "Ce plan n'est pas à votre niveau." else 409)
    debut = _date(request.data.get("debut")) or plan.debut
    fin = _date(request.data.get("fin")) or plan.fin
    if fin < debut:
        return Response({"detail": "La date de fin précède la date de début."}, status=400)
    motif = str(request.data.get("motif") or "").strip()
    refus = _modifier(plan, request.user, debut, fin, motif)
    if refus:
        return refus
    if plan.palier in {PlanConge.Palier.RH, PlanConge.Palier.DRH}:
        plan.save(update_fields=["debut", "fin"])
        return Response(_tableau(request.user))
    palier, chez = _prochain(request.user)
    plan.palier = palier
    plan.chez = chez
    if palier == PlanConge.Palier.HIERARCHIE:
        plan.echeance = _dans_le_delai(plan.campagne, timezone.localdate() + timedelta(days=_duree_hierarchie(plan.campagne)))
    else:
        plan.echeance = plan.campagne.limite_rh
    plan.save(update_fields=["debut", "fin", "palier", "chez", "echeance"])
    _tracer(plan, request.user, "transmis", motif)
    if chez:
        _notifier(chez, "Plan de congés à revoir", f"Les dates de {_nom(plan.agent)} vous sont transmises.")
    return Response(_tableau(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def soumettre(request):
    if not _est_rh(request.user):
        return Response({"detail": "L'équipe RH soumet l'ensemble au DRH."}, status=403)
    campagne = _campagne()
    if campagne is None:
        return Response({"detail": "Aucune planification n'est ouverte."}, status=404)
    _avancer(campagne)
    campagne.refresh_from_db()
    if campagne.statut not in {CampagnePlanConge.Statut.OUVERTE, CampagnePlanConge.Statut.REMONTEE}:
        return Response({"detail": "L'ensemble a déjà été soumis."}, status=409)
    if timezone.localdate() > campagne.limite_rh:
        return Response({"detail": f"La date limite de l'équipe RH était le {campagne.limite_rh:%d/%m/%Y}."}, status=409)
    if _participants().exclude(plans_conges__campagne=campagne, plans_conges__palier=PlanConge.Palier.RH).exists():
        return Response({"detail": "Tous les plans ne sont pas encore parvenus à l'équipe RH."}, status=409)
    with transaction.atomic():
        campagne.plans.update(palier=PlanConge.Palier.DRH, chez=None, echeance=campagne.limite_drh)
        campagne.statut = CampagnePlanConge.Statut.SOUMIS
        campagne.save(update_fields=["statut"])
    for drh in User.objects.filter(profil__role="DRH"):
        _notifier(drh, "Planification des congés à viser", f"L'équipe RH vous soumet l'ensemble des congés {campagne.exercice}.", urgente=True)
    return Response(_tableau(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def renvoyer(request, pk: int):
    if not _est_drh(request.user):
        return Response({"detail": "Seul le DRH renvoie un plan pour modification."}, status=403)
    plan = get_object_or_404(PlanConge.objects.select_related("campagne", "agent"), pk=pk, palier=PlanConge.Palier.DRH)
    refus = _fenetre(request.user, plan)
    if refus:
        return Response({"detail": refus}, status=409)
    motif = str(request.data.get("motif") or "").strip()
    if not motif:
        return Response({"detail": "Indiquez la modification demandée."}, status=400)
    debut = _date(request.data.get("debut")) or plan.debut
    fin = _date(request.data.get("fin")) or plan.fin
    if fin < debut:
        return Response({"detail": "La date de fin précède la date de début."}, status=400)
    plan.debut, plan.fin = debut, fin
    plan.palier = PlanConge.Palier.RH
    plan.chez = None
    plan.echeance = plan.campagne.limite_drh
    plan.save(update_fields=["debut", "fin", "palier", "chez", "echeance"])
    _tracer(plan, request.user, "demande", motif)
    _notifier(plan.agent, "Le DRH demande une modification", f"{_nom(request.user)} demande une modification. Motif : {motif}", urgente=True)
    for rh in _participants():
        if _est_rh(rh):
            _notifier(rh, "Plan renvoyé par le DRH", f"{_nom(plan.agent)} : {motif}")
    return Response(_tableau(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def publier(request):
    if not _est_drh(request.user):
        return Response({"detail": "Seul le DRH publie l'arrêté des congés."}, status=403)
    campagne = get_object_or_404(CampagnePlanConge, statut=CampagnePlanConge.Statut.SOUMIS)
    with transaction.atomic():
        for plan in campagne.plans.select_related("agent"):
            plan.palier = PlanConge.Palier.PUBLIE
            plan.chez = None
            plan.save(update_fields=["palier", "chez"])
            _tracer(plan, request.user, "publie")
            _notifier(
                plan.agent, "Congés arrêtés",
                f"Vos congés {campagne.exercice} sont arrêtés du {plan.debut:%d/%m/%Y} au {plan.fin:%d/%m/%Y}.",
                urgente=True,
            )
        campagne.statut = CampagnePlanConge.Statut.PUBLIEE
        campagne.save(update_fields=["statut"])
    return Response(_tableau(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reprendre(request, pk: int):
    plan = get_object_or_404(PlanConge.objects.select_related("agent"), pk=pk, palier=PlanConge.Palier.PUBLIE)
    if plan.agent_id != request.user.id and not _est_rh(request.user):
        return Response({"detail": "L'agent, ou l'équipe RH pour lui, demande la modification."}, status=403)
    if plan.reprises.exclude(palier__in=[RepriseConge.Palier.ACCEPTEE, RepriseConge.Palier.REFUSEE]).exists():
        return Response({"detail": "Une demande de modification est déjà en cours."}, status=409)
    periode = _periode(request.data)
    if isinstance(periode, Response):
        return periode
    motif = str(request.data.get("motif") or "").strip()
    if not motif:
        return Response({"detail": "Indiquez le motif de la demande."}, status=400)
    palier, chez = _prochain(plan.agent)
    if palier == PlanConge.Palier.RH:
        palier = RepriseConge.Palier.RH
    reprise = RepriseConge.objects.create(
        plan=plan, demandeur=request.user, debut=periode[0], fin=periode[1], motif=motif, palier=palier, chez=chez,
    )
    if chez:
        _notifier(chez, "Demande de modification de congés", f"{_nom(plan.agent)} demande du {periode[0]:%d/%m/%Y} au {periode[1]:%d/%m/%Y}. Motif : {motif}")
    return Response(_reprise(reprise, request.user), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def suivre_reprise(request, pk: int):
    reprise = get_object_or_404(RepriseConge.objects.select_related("plan__agent", "demandeur", "chez"), pk=pk)
    ligne = _reprise(reprise, request.user)
    if not ligne["traitable"]:
        return Response({"detail": "Cette demande n'est pas à votre niveau."}, status=403)
    sens = str(request.data.get("sens") or "transmettre")
    motif = str(request.data.get("motif") or "").strip()
    if reprise.palier == RepriseConge.Palier.DRH and sens == "accepter":
        plan = reprise.plan
        plan.debut, plan.fin = reprise.debut, reprise.fin
        plan.save(update_fields=["debut", "fin"])
        reprise.palier = RepriseConge.Palier.ACCEPTEE
        reprise.chez = None
        reprise.save(update_fields=["palier", "chez"])
        _tracer(plan, request.user, "reprise", reprise.motif)
        _notifier(plan.agent, "Modification de congés acceptée", f"{_nom(request.user)} a accepté du {plan.debut:%d/%m/%Y} au {plan.fin:%d/%m/%Y}. Motif initial : {reprise.motif}")
        return Response(_tableau(request.user))
    if reprise.palier == RepriseConge.Palier.DRH and sens == "refuser":
        if not motif:
            return Response({"detail": "Indiquez le motif du refus."}, status=400)
        reprise.palier = RepriseConge.Palier.REFUSEE
        reprise.chez = None
        reprise.save(update_fields=["palier", "chez"])
        _notifier(reprise.plan.agent, "Modification de congés refusée", f"{_nom(request.user)} a refusé. Motif : {motif}")
        return Response(_tableau(request.user))
    if reprise.palier == RepriseConge.Palier.RH:
        reprise.palier = RepriseConge.Palier.DRH
        reprise.chez = None
    else:
        palier, chez = _prochain(request.user)
        reprise.palier = RepriseConge.Palier.RH if palier == PlanConge.Palier.RH else RepriseConge.Palier.HIERARCHIE
        reprise.chez = chez
    reprise.save(update_fields=["palier", "chez"])
    if reprise.chez_id:
        _notifier(reprise.chez, "Demande de modification à transmettre", f"{_nom(reprise.plan.agent)} : {reprise.motif}")
    return Response(_tableau(request.user))
