"""États du tableau de bord, lus en direct dans les registres.

Effectifs, dotations, absences et congés, mises en formation : chaque état est calculé
à l'ouverture de l'écran, dans le périmètre de l'utilisateur quand il en a un.
"""

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import (
    Absence,
    Agent,
    BranchePlafond,
    DemandeDotation,
    Formation,
    InscriptionFormation,
    SessionFormation,
    VisaEnAttente,
)
from .statistiques_dynamiques import _tranche
from .utilisateurs import perimetre_matricules

VIDE = "Non renseigné"
LIGNES_MAX = 12
CONGES_CLOS = (
    Absence.Instruction.SIGNE,
    Absence.Instruction.REJETE,
    Absence.Instruction.DECALE,
    Absence.Instruction.APPROBATION_AUTO,
)
AXES_EFFECTIFS = (
    ("categorie", "Catégorie", "categorie"),
    ("grade", "Grade", "grade"),
    ("emploi", "Emploi", "emploi"),
    ("structure", "Structure", "structure"),
    ("corps", "Corps", "corps"),
    ("situation", "Situation", "situation"),
    ("tranche_age", "Tranche d'âge", None),
)
CATEGORIES_VISA = {"carriere": ("carrière", "carrières"), "conge": ("congé", "congés"), "formation": ("formation", "formations")}


def _n(valeur) -> str:
    return f"{int(valeur or 0):_}".replace("_", " ")


def _pct(part, total) -> float:
    return round(part * 100 / total, 1) if total else 0.0


def _libelle(valeur, choix: dict | None = None) -> str:
    if valeur in (None, ""):
        return VIDE
    return (choix or {}).get(str(valeur), str(valeur))


def _plafonner(lignes: list[dict], champs: tuple[str, ...]) -> list[dict]:
    """Garde les plus fortes lignes ; les suivantes se regroupent dans « Autres »."""
    lignes = sorted(lignes, key=lambda item: (-item["total"], item["libelle"]))
    if len(lignes) <= LIGNES_MAX:
        return lignes
    gardees, reste = lignes[: LIGNES_MAX - 1], lignes[LIGNES_MAX - 1 :]
    autres = {"libelle": f"Autres ({len(reste)})"}
    for champ in champs:
        autres[champ] = sum(item[champ] for item in reste)
    return [*gardees, autres]


def etats(user: User, exercice: int) -> dict:
    matricules = perimetre_matricules(user)
    agents = Agent.objects.all()
    if matricules is not None:
        agents = agents.filter(matricule__in=matricules)
    jour = timezone.localdate()
    return {
        "effectifs": _effectifs(agents),
        "dotations": _dotations(),
        "absences": _absences(agents, jour, exercice),
        "formation": _formation(agents, jour, exercice),
        "perimetre": matricules is not None,
    }


def kpis(user: User, exercice: int, etats_calcules: dict) -> list[dict]:
    effectifs = etats_calcules["effectifs"]
    absences = etats_calcules["absences"]
    formation = etats_calcules["formation"]
    visas = VisaEnAttente.objects.filter(statut=VisaEnAttente.Statut.EN_ATTENTE)
    urgents = visas.filter(urgent=True).count()
    # L'action sociale ne figure plus au tableau de bord : ses actes restent dans la file, sans ligne à part.
    categories = visas.filter(categorie__in=CATEGORIES_VISA).order_by().values("categorie").annotate(total=Count("pk")).order_by("-total")
    total = effectifs["total"]
    return [
        {
            "libelle": "Effectif",
            "valeur": _n(total),
            "unite": "",
            "icone": "groups",
            "ton": "primary",
            "badge": f"{_pct(effectifs['femmes'], total):.1f} % de femmes".replace(".", ","),
            "badge_ton": "neutre",
            "detail": "Dossiers agents de votre périmètre" if etats_calcules["perimetre"] else "Dossiers agents du ministère",
            "tendance": "",
            "jauge": {
                "pourcentage": _pct(effectifs["femmes"], total),
                "gauche": f"{_n(effectifs['femmes'])} femmes",
                "droite": f"{_n(effectifs['hommes'])} hommes",
            },
        },
        {
            "libelle": "Visas en attente",
            "valeur": _n(visas.count()),
            "unite": "",
            "icone": "pending_actions",
            "ton": "secondary",
            "badge": f"{urgents} urgent{'s' if urgents > 1 else ''}" if urgents else "",
            "badge_ton": "alerte" if urgents else "neutre",
            "detail": "Actes qui attendent votre visa",
            "tendance": "",
            "repartition": [
                f"{item['total']} {CATEGORIES_VISA[item['categorie']][1 if item['total'] > 1 else 0]}" for item in categories[:3]
            ],
        },
        {
            "libelle": "Absents aujourd'hui",
            "valeur": _n(absences["absents"]),
            "unite": "",
            "icone": "event_busy",
            "ton": "primary",
            "badge": f"{absences['a_decider']} à décider" if absences["a_decider"] else "",
            "badge_ton": "alerte" if absences["a_decider"] else "neutre",
            "detail": f"Congés à instruire : {absences['conges']['a_instruire']}",
            "tendance": "",
            "jauge": {
                "pourcentage": _pct(absences["absents"], total),
                "gauche": f"{_pct(absences['absents'], total):.1f} % de l'effectif".replace(".", ","),
                "droite": f"{_n(total - absences['absents'])} présents",
            },
        },
        {
            "libelle": "Agents en formation",
            "valeur": _n(formation["agents_en_cours"]),
            "unite": "",
            "icone": "school",
            "ton": "secondary",
            "badge": f"{formation['sessions_ouvertes']} session{'s' if formation['sessions_ouvertes'] > 1 else ''} ouverte{'s' if formation['sessions_ouvertes'] > 1 else ''}",
            "badge_ton": "neutre",
            "detail": f"{_n(formation['inscrits'])} inscrits aux sessions de {exercice}",
            "tendance": "",
            "jauge": {
                "pourcentage": _pct(formation["agents_formes"], total),
                "gauche": f"{_n(formation['agents_formes'])} agents formés en {exercice}",
                "droite": f"{_pct(formation['agents_formes'], total):.1f} %".replace(".", ","),
            },
        },
    ]


def _effectifs(agents) -> dict:
    total = agents.count()
    femmes = agents.filter(sexe="F").count()
    axes = []
    for code, libelle, champ in AXES_EFFECTIFS:
        qs = agents.order_by()
        if champ is None:
            qs = qs.annotate(valeur=_tranche("date_naissance"))
            champ = "valeur"
        brutes = qs.values(champ).annotate(total=Count("pk"), femmes=Count("pk", filter=Q(sexe="F")))
        regroupees: dict[str, dict] = {}
        for ligne in brutes:
            nom = _libelle(ligne[champ])
            cible = regroupees.setdefault(nom, {"libelle": nom, "total": 0, "femmes": 0})
            cible["total"] += ligne["total"]
            cible["femmes"] += ligne["femmes"]
        for ligne in regroupees.values():
            ligne["hommes"] = ligne["total"] - ligne["femmes"]
        axes.append({
            "code": code,
            "libelle": libelle,
            "modalites": len(regroupees),
            "lignes": _plafonner(list(regroupees.values()), ("total", "femmes", "hommes")),
            # Toutes les modalités, pour l'export : l'écran n'en montre que les plus fortes.
            "toutes": sorted(regroupees.values(), key=lambda item: (-item["total"], item["libelle"])),
        })
    return {"total": total, "femmes": femmes, "hommes": total - femmes, "axes": axes}


def _dotations() -> dict:
    branches = list(BranchePlafond.objects.order_by("ordre", "id"))
    effectif = sum(item.effectif for item in branches)
    plafond = sum(item.plafond for item in branches)
    demandes = DemandeDotation.objects.order_by()
    ouvertes = demandes.exclude(statut__in=[DemandeDotation.Statut.ACTE, DemandeDotation.Statut.REJET])
    statuts = dict(DemandeDotation.Statut.choices)
    natures = dict(DemandeDotation.Nature.choices)
    return {
        "effectif": effectif,
        "plafond": plafond,
        "occupation": _pct(effectif, plafond),
        "branches": [
            {"libelle": item.libelle, "effectif": item.effectif, "plafond": item.plafond, "occupation": _pct(item.effectif, item.plafond)}
            for item in branches
        ],
        "demandes": demandes.count(),
        "ouvertes": ouvertes.count(),
        "impact_ouvert": ouvertes.aggregate(total=Sum("impact"))["total"] or 0,
        "par_statut": [
            {"libelle": statuts.get(ligne["statut"], ligne["statut"]), "total": ligne["total"]}
            for ligne in demandes.values("statut").annotate(total=Count("pk")).order_by("-total")
        ],
        "par_nature": [
            {"libelle": natures.get(ligne["nature"], ligne["nature"]), "total": ligne["total"]}
            for ligne in demandes.values("nature").annotate(total=Count("pk")).order_by("-total")
        ],
    }


def _absences(agents, jour, exercice: int) -> dict:
    absences = Absence.objects.filter(agent__in=agents).exclude(decision=Absence.Decision.INVALIDEE).order_by()
    en_cours = absences.filter(debut__lte=jour, fin__gte=jour)
    annee = absences.filter(debut__year=exercice)
    conges = Absence.objects.filter(agent__in=agents).exclude(instruction="").order_by()
    soldes = agents.aggregate(acquis=Sum("conges_acquis"), consommes=Sum("conges_consommes"), report=Sum("report_conges"))
    acquis = (soldes["acquis"] or 0) + (soldes["report"] or 0)
    consommes = soldes["consommes"] or 0
    natures = [
        {"libelle": _libelle(ligne["nature"]), "total": ligne["total"], "jours": ligne["jours"] or 0}
        for ligne in annee.values("nature").annotate(total=Count("pk"), jours=Sum("jours"))
    ]
    return {
        "absents": en_cours.values("agent").distinct().count(),
        "en_cours": [
            {"libelle": _libelle(ligne["nature"]), "total": ligne["total"]}
            for ligne in en_cours.values("nature").annotate(total=Count("agent", distinct=True)).order_by("-total")[:6]
        ],
        "a_decider": Absence.objects.filter(agent__in=agents, decision=Absence.Decision.EN_ATTENTE).count(),
        "annee": {
            "absences": annee.count(),
            "jours": annee.aggregate(total=Sum("jours"))["total"] or 0,
            "par_nature": _plafonner(list(natures), ("total", "jours"))[:8],
            "toutes_natures": sorted(natures, key=lambda item: (-item["jours"], item["libelle"])),
        },
        "conges": {
            "a_instruire": conges.exclude(instruction__in=CONGES_CLOS).count(),
            "signes": conges.filter(instruction=Absence.Instruction.SIGNE).count(),
            "acquis": acquis,
            "consommes": consommes,
            "reliquat": acquis - consommes,
            "consommation": _pct(consommes, acquis),
        },
    }


def _formation(agents, jour, exercice: int) -> dict:
    sessions = SessionFormation.objects.filter(annulee=False).order_by()
    inscriptions = InscriptionFormation.objects.filter(demande__agent__in=agents, session__annulee=False).order_by()
    en_cours = inscriptions.filter(session__date_debut__lte=jour, session__date_fin__gte=jour)
    de_l_annee = inscriptions.filter(Q(session__date_debut__year=exercice) | Q(session__date_debut__isnull=True, session__ouverte=True))
    suivies = Formation.objects.filter(agent__in=agents, debut__year=exercice).order_by()
    prochaines = (
        sessions.filter(date_debut__gte=jour)
        .select_related("type_formation")
        .annotate(inscrits=Count("inscriptions", filter=Q(inscriptions__demande__agent__in=agents)))
        .order_by("date_debut")[:5]
    )
    return {
        "sessions_ouvertes": sessions.filter(ouverte=True, cloturee_le__isnull=True).count(),
        "sessions_en_cours": sessions.filter(date_debut__lte=jour, date_fin__gte=jour).count(),
        "agents_en_cours": en_cours.values("demande__agent").distinct().count(),
        "inscrits": de_l_annee.count(),
        "presents": inscriptions.filter(present=True).count(),
        "agents_formes": suivies.values("agent").distinct().count(),
        "heures": suivies.aggregate(total=Sum("heures"))["total"] or 0,
        "par_type": [
            {"libelle": _libelle(ligne["session__type_formation__libelle"]), "total": ligne["total"]}
            for ligne in de_l_annee.values("session__type_formation__libelle").annotate(total=Count("pk")).order_by("-total")[:6]
        ],
        "prochaines": [
            {
                "libelle": item.libelle or item.type_formation.libelle,
                "debut": item.date_debut.isoformat() if item.date_debut else None,
                "lieu": item.lieu,
                "inscrits": item.inscrits,
                "places": item.places,
            }
            for item in prochaines
        ],
    }
