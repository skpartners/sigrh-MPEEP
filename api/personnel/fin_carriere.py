"""Carrières · Fin de carrière : dossiers, relève, distinctions et pilotage, tous modifiables."""

from datetime import date

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    ActionAccompagnement,
    Agent,
    DistinctionCarriere,
    DossierRetraite,
    TypeFinCarriere,
)
from .present import GRADES_65_ANS, agent_brief
from .visibilite import agent_visible, agents_visibles, refus_hors_perimetre

HORIZON_ADMISSION = 365

TRANCHES = [
    ("60+", "60 ans et plus (radiation imminente)", 60, 200),
    ("55-59", "55 à 59 ans (vivier senior & binômage)", 55, 59),
    ("40-54", "40 à 54 ans (cadres confirmés)", 40, 54),
    ("-40", "Moins de 40 ans (relève montante)", 0, 39),
]


def _age(naissance: date, le: date) -> int:
    return le.year - naissance.year - ((le.month, le.day) < (naissance.month, naissance.day))


def _anniversaire(naissance: date, age: int) -> date:
    try:
        return naissance.replace(year=naissance.year + age)
    except ValueError:  # 29 février
        return naissance.replace(year=naissance.year + age, day=28)


def _anciennete(entree: date | None, le: date) -> str:
    if entree is None:
        return ""
    mois = (le.year - entree.year) * 12 + le.month - entree.month - (le.day < entree.day)
    return f"{mois // 12} ans {mois % 12:02d} mois"


def age_statutaire(agent: Agent) -> int:
    return 65 if (agent.grade or "").strip() in GRADES_65_ANS else 60


def _automatique(item: DossierRetraite) -> bool:
    return item.motif_id is None or bool(item.motif and item.motif.automatique)


def dossier_row(item: DossierRetraite, aujourd_hui: date) -> dict:
    agent = item.agent
    automatique = _automatique(item)
    if automatique:
        limite = _anniversaire(agent.date_naissance, item.age_limite) if agent.date_naissance else None
    else:
        limite = item.date_cessation
    return {
        "id": item.id,
        "automatique": automatique,
        "motif": {"id": item.motif_id, "code": item.motif.code, "libelle": item.motif.libelle} if item.motif_id else None,
        "agent": {**agent_brief(agent), "fonction": agent.fonction},
        "anciennete": _anciennete(item.entree_service, aujourd_hui),
        "date_limite": limite.isoformat() if limite else None,
        "age": _age(agent.date_naissance, aujourd_hui) if agent.date_naissance else None,
        "age_limite": item.age_limite,
        "age_statutaire": age_statutaire(agent),
        "decret": item.decret,
        "date_decret": item.date_decret.isoformat() if item.date_decret else None,
        "date_cessation": item.date_cessation.isoformat() if item.date_cessation else None,
        "statut": item.statut,
        "statut_libelle": item.get_statut_display(),
        "statut_detail": item.statut_detail,
        "entree_service": item.entree_service.isoformat() if item.entree_service else None,
    }


def assurer_admissions(aujourd_hui: date) -> None:
    """Ouvre le dossier d'admission à la retraite des agents à douze mois ou moins de la limite d'âge."""
    motif = TypeFinCarriere.objects.filter(code="retraite", automatique=True).first()
    if motif is None:
        return
    deja = set(DossierRetraite.objects.values_list("agent_id", flat=True))
    for agent in Agent.objects.exclude(date_naissance=None).exclude(pk__in=deja):
        age = age_statutaire(agent)
        if (_anniversaire(agent.date_naissance, age) - aujourd_hui).days > HORIZON_ADMISSION:
            continue
        DossierRetraite.objects.create(
            agent=agent, motif=motif, age_limite=age, entree_service=_date(agent.prise_service), statut=DossierRetraite.Statut.NOTIFIE,
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tableau(request):
    aujourd_hui = timezone.localdate()
    assurer_admissions(aujourd_hui)
    agents = list(agents_visibles(Agent.objects.exclude(date_naissance=None), request.user))
    dossiers = list(agents_visibles(DossierRetraite.objects.select_related("agent", "agent__organisme", "motif"), request.user, "agent__matricule"))
    lignes = [dossier_row(item, aujourd_hui) for item in dossiers]
    dans_l_annee = [ligne for ligne in lignes if ligne["date_limite"] and (date.fromisoformat(ligne["date_limite"]) - aujourd_hui).days <= 365]
    pyramide = []
    for code, libelle, minimum, maximum in TRANCHES:
        membres = [agent for agent in agents if minimum <= _age(agent.date_naissance, aujourd_hui) <= maximum]
        pyramide.append(
            {
                "code": code,
                "libelle": libelle,
                "effectif": len(membres),
                "part": round(len(membres) * 1000 / len(agents)) / 10 if agents else 0,
                "hommes": sum(1 for agent in membres if agent.sexe == "H"),
                "femmes": sum(1 for agent in membres if agent.sexe == "F"),
                "cadres": sum(1 for agent in membres if agent.grade.startswith("A")),
            }
        )
    pilotage = _pilotage()
    # Départs de l'année en cours : les dossiers dont la date de départ tombe dans l'exercice.
    departs_annee = [ligne for ligne in lignes if ligne["date_limite"] and date.fromisoformat(ligne["date_limite"]).year == aujourd_hui.year]
    pilotage["renouvellement"] = _renouvellement(agents, len(dans_l_annee), aujourd_hui)
    return Response(
        {
            "exercice": aujourd_hui.year,
            "effectif": len(agents),
            "indicateurs": {
                "departs_annee": len(departs_annee),
                "notifies": sum(1 for ligne in lignes if ligne["statut"] == DossierRetraite.Statut.NOTIFIE),
                "receptions": sum(1 for ligne in lignes if ligne["statut"] == DossierRetraite.Statut.RECEPTION),
                "transmis": sum(1 for ligne in lignes if ligne["statut"] == DossierRetraite.Statut.TRANSMIS),
                "dossiers": len(lignes),
            },
            "pyramide": pyramide,
            "dossiers": lignes,
            "motifs": [
                {"id": item.id, "code": item.code, "libelle": item.libelle, "automatique": item.automatique}
                for item in TypeFinCarriere.objects.all()
            ],
            "statuts": [{"code": code, "libelle": libelle} for code, libelle in DossierRetraite.Statut.choices],
            "agents": [
                {"matricule": agent.matricule, "nom_complet": agent.nom_complet, "organisme_sigle": agent.organisme.sigle}
                for agent in agents_visibles(Agent.objects.select_related("organisme"), request.user).order_by("nom", "prenoms")
            ],
            **pilotage,
        }
    )


def _pilotage() -> dict:
    actions = [
        {"id": action.id, "titre": action.titre, "detail": action.detail, "quand": action.quand, "valeur": action.valeur}
        for action in ActionAccompagnement.objects.all()
    ]
    distinctions = [
        _distinction(distinction)
        for distinction in DistinctionCarriere.objects.all()
    ]
    return {"renouvellement": {}, "accompagnement": {"actions": actions}, "distinctions": distinctions}


def _renouvellement(agents: list, sortants: int, aujourd_hui: date) -> dict:
    """Agents entrés au ministère sur les douze derniers mois, rapportés aux départs des douze mois à venir."""
    depuis = aujourd_hui.replace(year=aujourd_hui.year - 1) if not (aujourd_hui.month == 2 and aujourd_hui.day == 29) else aujourd_hui.replace(year=aujourd_hui.year - 1, day=28)
    entrants = sum(1 for agent in agents if agent.prise_service_ministere and depuis <= agent.prise_service_ministere <= aujourd_hui)
    if not entrants and not sortants:
        return {"texte": ""}
    return {"texte": f"{entrants} entrant{'s' if entrants > 1 else ''} sur 12 mois pour {sortants} sortant{'s' if sortants > 1 else ''} prévu{'s' if sortants > 1 else ''}"}


def _agent(matricule: str) -> Agent | None:
    return Agent.objects.filter(matricule__iexact=(matricule or "").strip()).select_related("organisme").first()


def _date(valeur) -> date | None:
    if not valeur:
        return None
    try:
        return date.fromisoformat(str(valeur)[:10])
    except ValueError:
        return None


def _entier(valeur, defaut=0) -> int | None:
    try:
        return int(valeur if valeur not in (None, "") else defaut)
    except (TypeError, ValueError):
        return None


def _dossier_depuis(donnees, agent: Agent | None = None, entree_actuelle: date | None = None):
    if agent is None:
        agent = _agent(donnees.get("matricule") or "")
        if agent is None:
            return Response({"detail": "Choisissez un agent du système."}, status=400)
    if "entree_service" in donnees:
        entree = _date(donnees.get("entree_service"))
    else:
        entree = entree_actuelle
    if donnees.get("entree_service") and entree is None:
        return Response({"detail": "La date d'entrée en service est invalide."}, status=400)
    age = _entier(donnees.get("age_limite"), 60)
    if age is None or not 40 <= age <= 75:
        return Response({"detail": "L'âge limite doit être compris entre 40 et 75 ans."}, status=400)
    statut = (donnees.get("statut") or DossierRetraite.Statut.NOTIFIE).strip()
    if statut not in DossierRetraite.Statut.values:
        return Response({"detail": "Ce statut de dossier n'existe pas."}, status=400)
    return agent, entree, age, statut, (donnees.get("statut_detail") or "").strip()[:160]


def _report(donnees, item: DossierRetraite):
    """L'âge statutaire est automatique. Le dépasser exige un décret présidentiel."""
    if "age_limite" not in donnees:
        return item.age_limite, item.decret, item.date_decret
    vise = _entier(donnees.get("age_limite"), None)
    if vise is None or not 40 <= vise <= 75:
        return Response({"detail": "L'âge limite doit être compris entre 40 et 75 ans."}, status=400)
    plancher = age_statutaire(item.agent)
    if vise > plancher:
        decret = (donnees.get("decret") or "").strip()
        quand = _date(donnees.get("date_decret"))
        if not decret or quand is None:
            return Response(
                {"detail": "Le report de la retraite se fait par décret présidentiel : indiquez la référence et la date."},
                status=400,
            )
        return vise, decret[:80], quand
    if vise != item.age_limite:
        return Response(
            {"detail": "L'âge d'admission est fixé automatiquement. Seul un décret présidentiel peut le repousser."},
            status=400,
        )
    return item.age_limite, item.decret, item.date_decret


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_dossier(request):
    """Enregistre une cessation autre que l'admission à la retraite, qui s'ouvre toute seule."""
    donnees = request.data
    motif = TypeFinCarriere.objects.filter(pk=donnees.get("motif")).first()
    if motif is None:
        return Response({"detail": "Choisissez un motif de cessation."}, status=400)
    if motif.automatique:
        return Response(
            {"detail": "L'admission à la retraite est automatique. Le dossier s'ouvre à l'approche de la limite d'âge."},
            status=409,
        )
    agent = _agent(donnees.get("matricule") or "")
    if agent is None or not agent_visible(request.user, agent):
        return Response({"detail": "Choisissez un agent de votre périmètre."}, status=400)
    if DossierRetraite.objects.filter(agent=agent).exists():
        return Response({"detail": "Cet agent a déjà un dossier de fin de carrière."}, status=409)
    cessation = _date(donnees.get("date_cessation"))
    if cessation is None:
        return Response({"detail": "Indiquez la date de cessation."}, status=400)
    entree = _date(donnees.get("entree_service")) if "entree_service" in donnees else _date(agent.prise_service)
    item = DossierRetraite.objects.create(
        agent=agent, motif=motif, age_limite=age_statutaire(agent), entree_service=entree, date_cessation=cessation,
        statut_detail=(donnees.get("statut_detail") or "").strip()[:160],
    )
    return Response(dossier_row(item, timezone.localdate()), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def dossier(request, pk: int):
    item = get_object_or_404(DossierRetraite.objects.select_related("agent", "agent__organisme", "motif"), pk=pk)
    if not agent_visible(request.user, item.agent):
        return refus_hors_perimetre()
    if request.method == "DELETE":
        if _automatique(item):
            return Response({"detail": "L'admission à la retraite est automatique. Ce dossier ne se retire pas."}, status=409)
        item.delete()
        return Response(status=204)
    if _automatique(item):
        report = _report(request.data, item)
        if isinstance(report, Response):
            return report
        age, decret, date_decret = report
        lu = _dossier_depuis(request.data, item.agent, item.entree_service)
        if isinstance(lu, Response):
            return lu
        _, entree, _, statut, detail = lu
        item.age_limite = age
        item.decret = decret
        item.date_decret = date_decret
        item.entree_service = entree
        item.statut = statut
        item.statut_detail = detail
        item.save()
        return Response(dossier_row(item, timezone.localdate()))
    if "date_cessation" in request.data:
        cessation = _date(request.data.get("date_cessation"))
        if cessation is None:
            return Response({"detail": "Indiquez la date de cessation."}, status=400)
        item.date_cessation = cessation
    if "motif" in request.data:
        motif = TypeFinCarriere.objects.filter(pk=request.data.get("motif"), automatique=False).first()
        if motif is None:
            return Response({"detail": "Choisissez un motif de cessation."}, status=400)
        item.motif = motif
    item.statut_detail = (request.data.get("statut_detail") if "statut_detail" in request.data else item.statut_detail or "").strip()[:160]
    item.save()
    return Response(dossier_row(item, timezone.localdate()))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_motif(request):
    libelle = (request.data.get("libelle") or "").strip()
    if not libelle:
        return Response({"detail": "Le libellé du motif est obligatoire."}, status=400)
    base = slugify(libelle)[:40] or "motif"
    code = base
    numero = 2
    while TypeFinCarriere.objects.filter(code=code).exists():
        suffixe = f"-{numero}"
        code = f"{base[:40 - len(suffixe)]}{suffixe}"
        numero += 1
    ordre = (TypeFinCarriere.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    item = TypeFinCarriere.objects.create(code=code, libelle=libelle[:80], ordre=ordre)
    return Response({"id": item.id, "code": item.code, "libelle": item.libelle, "automatique": False}, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def motif(request, pk: int):
    item = get_object_or_404(TypeFinCarriere, pk=pk)
    if item.automatique:
        return Response({"detail": "L'admission à la retraite est automatique. Ce motif ne se modifie pas."}, status=409)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    libelle = (request.data.get("libelle") or "").strip()
    if not libelle:
        return Response({"detail": "Le libellé du motif est obligatoire."}, status=400)
    item.libelle = libelle[:80]
    item.save(update_fields=["libelle"])
    return Response({"id": item.id, "code": item.code, "libelle": item.libelle, "automatique": False})


def _distinction(item: DistinctionCarriere) -> dict:
    return {
        "id": item.id, "rang": item.rang, "titre": item.titre, "detail": item.detail, "etat": item.etat,
        "famille": item.famille, "famille_libelle": item.get_famille_display(),
    }


def _famille(data, defaut: str = "autre") -> str:
    valeur = str(data.get("famille") or defaut)
    return valeur if valeur in {code for code, _libelle in DistinctionCarriere.FAMILLES} else defaut


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_distinction(request):
    titre = (request.data.get("titre") or "").strip()
    rang = (request.data.get("rang") or "").strip()
    if not titre or not rang:
        return Response({"detail": "Le rang et l'intitulé de la distinction sont obligatoires."}, status=400)
    ordre = (DistinctionCarriere.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    item = DistinctionCarriere.objects.create(
        rang=rang[:12], titre=titre[:200], detail=(request.data.get("detail") or "").strip()[:240],
        etat=(request.data.get("etat") or "").strip()[:80], famille=_famille(request.data), ordre=ordre,
    )
    return Response(_distinction(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def distinction(request, pk: int):
    item = get_object_or_404(DistinctionCarriere, pk=pk)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    titre = (request.data.get("titre") or "").strip()
    rang = (request.data.get("rang") or "").strip()
    if not titre or not rang:
        return Response({"detail": "Le rang et l'intitulé de la distinction sont obligatoires."}, status=400)
    item.rang = rang[:12]
    item.titre = titre[:200]
    item.detail = (request.data.get("detail") or "").strip()[:240]
    item.etat = (request.data.get("etat") or "").strip()[:80]
    item.famille = _famille(request.data, item.famille)
    item.save()
    return Response(_distinction(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_action(request):
    titre = (request.data.get("titre") or "").strip()
    if not titre:
        return Response({"detail": "L'intitulé de l'action est obligatoire."}, status=400)
    ordre = (ActionAccompagnement.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    item = ActionAccompagnement.objects.create(
        titre=titre[:160], detail=(request.data.get("detail") or "").strip()[:200],
        quand=(request.data.get("quand") or "").strip()[:120], valeur=(request.data.get("valeur") or "").strip()[:80], ordre=ordre,
    )
    return Response({"id": item.id, "titre": item.titre, "detail": item.detail, "quand": item.quand, "valeur": item.valeur}, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def action(request, pk: int):
    item = get_object_or_404(ActionAccompagnement, pk=pk)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    titre = (request.data.get("titre") or "").strip()
    if not titre:
        return Response({"detail": "L'intitulé de l'action est obligatoire."}, status=400)
    item.titre = titre[:160]
    item.detail = (request.data.get("detail") or "").strip()[:200]
    item.quand = (request.data.get("quand") or "").strip()[:120]
    item.valeur = (request.data.get("valeur") or "").strip()[:80]
    item.save()
    return Response({"id": item.id, "titre": item.titre, "detail": item.detail, "quand": item.quand, "valeur": item.valeur})
