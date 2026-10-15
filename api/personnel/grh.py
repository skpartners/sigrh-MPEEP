"""GRH : bilans de la gestion des carrières, suivi du plan de formation et programmation des effectifs."""

from collections import Counter, defaultdict

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .visibilite import agent_visible, agents_visibles, refus_hors_perimetre
from .formation import EXERCICE as EXERCICE_FORMATION
from .formation import _session_row, _sessions
from .models import (
    Absence,
    Acte,
    Agent,
    BesoinFormation,
    FormationExterne,
    InscriptionFormation,
    MouvementAgent,
    DemandeDotation,
    DossierRetraite,
    EntiteTutelle,
    FicheBesoin,
    PlanFormation,
    ProcedureDisciplinaire,
    SanctionDisciplinaire,
    SessionFormation,
    ValidationBesoin,
)


def _repartition(compteur: Counter, total: int | None = None) -> list[dict]:
    somme = total if total is not None else sum(compteur.values())
    return [
        {"libelle": libelle or "Non renseigné", "nombre": nombre, "part": round(100 * nombre / somme, 1) if somme else 0}
        for libelle, nombre in sorted(compteur.items(), key=lambda item: (-item[1], item[0] or ""))
    ]


# --- Gestion des carrières : bilan -------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bilan_carriere(request):
    """Photographie de l'exercice : effectifs, mouvements, discipline, congés, absences, sorties."""
    annee = timezone.localdate().year
    utilisateur = request.user
    agents = list(agents_visibles(Agent.objects.only("situation", "categorie", "sexe", "matricule"), utilisateur))
    total = len(agents)

    actes = agents_visibles(Acte.objects.filter(domaine=Acte.Domaine.CARRIERE, date_enregistrement__year=annee), utilisateur, "agent__matricule")
    mouvements = Counter(actes.values_list("nature", flat=True))

    procedures = list(agents_visibles(ProcedureDisciplinaire.objects.all(), utilisateur, "agent__matricule"))
    closes = {ProcedureDisciplinaire.Avis.SANCTION, ProcedureDisciplinaire.Avis.CLASSEE}
    sanctions = agents_visibles(SanctionDisciplinaire.objects.filter(prononcee_le__year=annee), utilisateur, "agent__matricule")

    absences = list(agents_visibles(Absence.objects.filter(debut__year=annee), utilisateur, "agent__matricule"))
    conges = [a for a in absences if not a.type_autorisation]
    autorisations = [a for a in absences if a.type_autorisation]

    departs = Counter(
        agents_visibles(DossierRetraite.objects.exclude(motif=None), utilisateur, "agent__matricule").values_list("motif__libelle", flat=True)
    )

    return Response({
        "exercice": annee,
        "effectifs": {
            "total": total,
            "femmes": sum(1 for a in agents if a.sexe == "F"),
            "hommes": sum(1 for a in agents if a.sexe == "H"),
            "par_situation": _repartition(Counter(a.situation for a in agents), total),
            "par_categorie": _repartition(Counter(a.categorie for a in agents), total),
        },
        "mouvements": {
            "total": sum(mouvements.values()),
            "par_nature": _repartition(mouvements),
        },
        "discipline": {
            "procedures": len(procedures),
            "ouvertes": sum(1 for p in procedures if p.avis not in closes),
            "classees": sum(1 for p in procedures if p.avis == ProcedureDisciplinaire.Avis.CLASSEE),
            "sanctions": sanctions.count(),
            "premier_degre": sanctions.filter(degre=1).count(),
            "second_degre": sanctions.filter(degre__gt=1).count(),
            "par_sanction": _repartition(Counter(s.get_nature_display() for s in sanctions)),
        },
        "conges": {
            "demandes": len(conges),
            "jours": sum(a.jours for a in conges),
            "par_nature": _repartition(Counter(a.nature for a in conges)),
        },
        "absences": {
            "autorisations": len(autorisations),
            "jours": sum(a.jours for a in autorisations),
            "par_type": _repartition(Counter(a.get_type_autorisation_display() for a in autorisations)),
            "en_attente": sum(1 for a in autorisations if a.decision == Absence.Decision.EN_ATTENTE),
        },
        "sorties": {
            "total": sum(departs.values()),
            "par_motif": _repartition(departs),
        },
    })


# --- Formation continue : suivi du plan et bilan -----------------------------------


POSITIONS = [
    ("candidature", "Candidature en cours"),
    ("a_venir", "Retenu · module à venir"),
    ("en_formation", "En formation"),
    ("a_emarger", "À émarger"),
    ("formee", "Formé"),
    ("absente", "Absent"),
    ("abandon", "Abandon"),
    ("reportee", "Reportée"),
    ("annulee", "Module annulé"),
    ("refusee", "Candidature refusée"),
]
LIBELLE_POSITION = dict(POSITIONS)


def position_agent(inscription: InscriptionFormation, etat_session: str) -> str:
    """Où en est l'agent : déduit du circuit de sa candidature, du module et de l'émargement."""
    from .formation import etat_inscription

    etat = etat_inscription(inscription)
    if etat == "refusee":
        return "refusee"
    if etat != "retenue":
        return "candidature"
    if etat_session == "annulee":
        return "annulee"
    if inscription.issue in {"abandon", "reporte"}:
        return "abandon" if inscription.issue == "abandon" else "reportee"
    if etat_session == "terminee":
        return {True: "formee", False: "absente", None: "a_emarger"}[inscription.present]
    if etat_session == "en_cours":
        return "en_formation"
    return "a_venir"


def _ligne_suivi(inscription: InscriptionFormation, session: dict) -> dict:
    from .formation import _structure_agent

    agent = inscription.demande.agent
    position = position_agent(inscription, session["etat"])
    return {
        "id": inscription.id,
        "reference": inscription.demande.reference,
        "agent": {
            "matricule": agent.matricule, "nom_complet": agent.nom_complet, "initiales": agent.initiales,
            "fonction": getattr(agent, "fonction", "") or agent.corps, "structure": _structure_agent(agent),
        },
        "session": {
            "code": session["code"], "libelle": session["libelle"], "zone_libelle": session["zone_libelle"],
            "cadre_libelle": session["cadre_libelle"], "lieu": session["lieu"], "etat": session["etat"],
            "date_debut": session["date_debut"], "date_fin": session["date_fin"],
        },
        "position": position,
        "position_libelle": LIBELLE_POSITION[position],
        "present": inscription.present,
        "note_satisfaction": inscription.note_satisfaction,
        "issue": inscription.issue,
        "observation": inscription.observation,
        "modifiable": position not in {"candidature", "refusee"},
    }


def _suivi_agents(user, sessions: dict) -> tuple[list[dict], list[dict]]:
    """Les agents inscrits aux modules du plan, dans le périmètre de la personne connectée."""
    inscriptions = agents_visibles(
        InscriptionFormation.objects.select_related("demande__agent__organisme", "session"), user, "demande__agent__matricule",
    ).order_by("demande__agent__nom", "demande__agent__prenoms")
    lignes = [_ligne_suivi(i, sessions[i.session.code]) for i in inscriptions if i.session.code in sessions]
    comptes = Counter(ligne["position"] for ligne in lignes)
    positions = [{"code": code, "libelle": libelle, "nombre": comptes.get(code, 0)} for code, libelle in POSITIONS]
    return lignes, positions


def _ligne_externe(item: FormationExterne, aujourd_hui) -> dict:
    fin = item.date_fin or item.date_debut
    etat = "a_venir" if item.date_debut > aujourd_hui else "terminee" if fin < aujourd_hui else "en_cours"
    return {
        "id": item.id,
        "agent": {"matricule": item.agent.matricule, "nom_complet": item.agent.nom_complet},
        "intitule": item.intitule,
        "cadre": item.cadre,
        "cadre_libelle": item.get_cadre_display(),
        "zone_libelle": SessionFormation.ZONES[SessionFormation.zone_du_cadre(item.cadre)],
        "dispensateur": item.dispensateur,
        "lieu": item.lieu,
        "date_debut": item.date_debut.isoformat(),
        "date_fin": item.date_fin.isoformat() if item.date_fin else None,
        "observation": item.observation,
        "etat": etat,
        "etat_libelle": {"a_venir": "À venir", "en_cours": "En cours", "terminee": "Terminée"}[etat],
    }


def _externes(user, aujourd_hui) -> list[dict]:
    qs = agents_visibles(FormationExterne.objects.select_related("agent"), user, "agent__matricule")
    return [_ligne_externe(item, aujourd_hui) for item in qs]


def _lire_externe(donnees, actuelle: FormationExterne | None = None):
    from datetime import date as _date

    from .models import Agent as _Agent

    intitule = str(donnees.get("intitule") or "").strip()
    if not intitule:
        return Response({"detail": "L'intitulé de la formation est obligatoire."}, status=400)
    cadre = str(donnees.get("cadre") or "")
    if cadre not in {code for code, _ in SessionFormation.CADRES if code != "ci_ministere"}:
        return Response({"detail": "Précisez le lieu et la catégorie de la formation."}, status=400)
    if actuelle is not None and "matricule" not in donnees:
        agent = actuelle.agent
    else:
        agent = _Agent.objects.filter(matricule__iexact=str(donnees.get("matricule") or "").strip()).first()
        if agent is None:
            return Response({"detail": "Choisissez l'agent suivi."}, status=400)
    try:
        debut = _date.fromisoformat(str(donnees.get("date_debut") or "")[:10])
        fin = _date.fromisoformat(str(donnees["date_fin"])[:10]) if donnees.get("date_fin") else None
    except ValueError:
        return Response({"detail": "Les dates sont invalides."}, status=400)
    if fin and fin < debut:
        return Response({"detail": "La fin de la formation précède son début."}, status=400)
    return {
        "agent": agent, "intitule": intitule[:200], "cadre": cadre,
        "dispensateur": str(donnees.get("dispensateur") or "").strip()[:200],
        "lieu": str(donnees.get("lieu") or "").strip()[:160],
        "date_debut": debut, "date_fin": fin,
        "observation": str(donnees.get("observation") or "").strip()[:240],
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_externe(request):
    """Enregistre une formation suivie hors du plan du ministère."""
    valeurs = _lire_externe(request.data)
    if isinstance(valeurs, Response):
        return valeurs
    if not agent_visible(request.user, valeurs["agent"]):
        return refus_hors_perimetre()
    item = FormationExterne.objects.create(**valeurs)
    return Response(_ligne_externe(item, timezone.localdate()), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def externe(request, pk: int):
    item = get_object_or_404(FormationExterne.objects.select_related("agent"), pk=pk)
    if not agent_visible(request.user, item.agent):
        return refus_hors_perimetre()
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    valeurs = _lire_externe(request.data, item)
    if isinstance(valeurs, Response):
        return valeurs
    if not agent_visible(request.user, valeurs["agent"]):
        return refus_hors_perimetre()
    for cle, valeur in valeurs.items():
        setattr(item, cle, valeur)
    item.save()
    return Response(_ligne_externe(item, timezone.localdate()))


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def modifier_suivi(request, pk: int):
    """Corrige le suivi d'un agent : présence, note, issue (abandon, report) et observation."""
    inscription = get_object_or_404(InscriptionFormation.objects.select_related("demande__agent__organisme", "session"), pk=pk)
    if not agent_visible(request.user, inscription.demande.agent):
        return refus_hors_perimetre()
    if request.method == "DELETE":
        if inscription.session.cloturee_le:
            return Response({"detail": "Le module est clôturé : l'agent reste au dossier de formation."}, status=409)
        inscription.demande.delete()
        return Response(status=204)
    sessions = {s["code"]: s for s in [_session_row(inscription.session, timezone.localdate())]}
    if position_agent(inscription, sessions[inscription.session.code]["etat"]) in {"candidature", "refusee"}:
        return Response({"detail": "Le suivi s'ouvre quand l'agent est retenu : la candidature suit son circuit."}, status=409)
    donnees = request.data
    champs = []
    if "present" in donnees:
        if donnees["present"] not in (True, False, None):
            return Response({"detail": "La présence vaut oui, non ou vide."}, status=400)
        inscription.present = donnees["present"]
        champs.append("present")
    if "note_satisfaction" in donnees:
        note = donnees["note_satisfaction"]
        if note is not None and (not isinstance(note, int) or isinstance(note, bool) or not 1 <= note <= 5):
            return Response({"detail": "La note de satisfaction va de 1 à 5."}, status=400)
        inscription.note_satisfaction = note
        champs.append("note_satisfaction")
    if "issue" in donnees:
        if donnees["issue"] not in {"", *[code for code, _ in InscriptionFormation.ISSUES]}:
            return Response({"detail": "Cette issue n'existe pas."}, status=400)
        inscription.issue = donnees["issue"]
        champs.append("issue")
    if "observation" in donnees:
        inscription.observation = str(donnees["observation"] or "").strip()[:240]
        champs.append("observation")
    if champs:
        inscription.save(update_fields=champs)
    return Response(_ligne_suivi(inscription, sessions[inscription.session.code]))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def suivi_formation(request):
    """Exécution du plan de formation, par cadre (hors Côte d'Ivoire / en Côte d'Ivoire)."""
    aujourd_hui = timezone.localdate()
    sessions = [_session_row(item, aujourd_hui) for item in _sessions()]
    plan = PlanFormation.objects.filter(annee=EXERCICE_FORMATION).first()
    actives = [s for s in sessions if s["etat"] != "annulee"]

    cadres = []
    for code, libelle in SessionFormation.CADRES + [("", "Cadre à préciser")]:
        lignes = [s for s in actives if s["cadre"] == code]
        if code == "" and not lignes:
            continue
        notes = [s["satisfaction"] for s in lignes if s["satisfaction"] is not None]
        cadres.append({
            "code": code,
            "libelle": libelle,
            "modules": len(lignes),
            "termines": sum(1 for s in lignes if s["etat"] == "terminee"),
            "places": sum(s["places"] for s in lignes),
            "retenus": sum(s["retenues"] for s in lignes),
            "formes": sum(s["presents"] for s in lignes if s["etat"] == "terminee"),
            "engage": sum(s["engage"] for s in lignes),
            "satisfaction": round(sum(notes) / len(notes), 2) if notes else None,
            "sessions": [
                {
                    "code": s["code"], "libelle": s["libelle"], "type_libelle": s["type_libelle"],
                    "etat": s["etat"], "etat_libelle": s["etat_libelle"], "lieu": s["lieu"],
                    "date_debut": s["date_debut"], "date_fin": s["date_fin"],
                    "retenues": s["retenues"], "places": s["places"], "engage": s["engage"],
                }
                for s in lignes
            ],
        })

    agents, positions = _suivi_agents(request.user, {s["code"]: s for s in sessions})

    besoins = list(BesoinFormation.objects.filter(annee=EXERCICE_FORMATION))
    couverts = sum(1 for b in besoins if b.statut == BesoinFormation.Statut.COUVERT)
    engage = sum(c["engage"] for c in cadres)
    formes = sum(c["formes"] for c in cadres)
    notes = [s["satisfaction"] for s in actives if s["satisfaction"] is not None]
    dotation = plan.dotation if plan else 0
    objectif = plan.objectif_agents if plan else 0
    return Response({
        "exercice": EXERCICE_FORMATION,
        "plan": {"dotation": dotation, "objectif_agents": objectif},
        "cadres": cadres,
        "agents": agents,
        "externes": _externes(request.user, aujourd_hui),
        "agents_choix": [
            {"matricule": a.matricule, "nom_complet": a.nom_complet}
            for a in agents_visibles(Agent.objects.all(), request.user).order_by("nom", "prenoms")
        ],
        "cadres_externes": [
            {"code": code, "libelle": libelle, "zone_libelle": SessionFormation.ZONES[SessionFormation.zone_du_cadre(code)]}
            for code, libelle in SessionFormation.CADRES
            if code != "ci_ministere"
        ],
        "positions": positions,
        "issues": [{"code": code, "libelle": libelle} for code, libelle in InscriptionFormation.ISSUES],
        "bilan": {
            "modules": len(actives),
            "annules": len(sessions) - len(actives),
            "engage": engage,
            "execution_budget": round(100 * engage / dotation, 1) if dotation else None,
            "formes": formes,
            "realisation_objectif": round(100 * formes / objectif, 1) if objectif else None,
            "satisfaction": round(sum(notes) / len(notes), 2) if notes else None,
            "besoins": len(besoins),
            "besoins_couverts": couverts,
            "couverture_besoins": round(100 * couverts / len(besoins), 1) if besoins else None,
        },
    })


# --- Programmation des effectifs ---------------------------------------------------

ETAPES = {code: libelle for code, libelle in ValidationBesoin.Etape.choices}


def _etape(code: str) -> str:
    if code not in ETAPES:
        from django.http import Http404

        raise Http404
    return code


def _detail(validation: ValidationBesoin | None):
    if validation is None:
        return None
    return {
        "decision": validation.decision,
        "decision_libelle": validation.get_decision_display(),
        "fonctionnaires": validation.fonctionnaires,
        "contractuels": validation.contractuels,
        "volume": validation.volume,
        "reference": validation.reference,
        "observations": validation.observations,
        "valide_le": validation.valide_le.isoformat(),
    }


def _emplois_demandes(campagne):
    """Les emplois demandés lors de la collecte : pour chacun, le décompte des structures qui le réclament."""
    par_emploi: dict[int, dict] = {}
    if campagne is None:
        return par_emploi
    for fiche in FicheBesoin.objects.filter(campagne=campagne, emploi__isnull=False).select_related("entite", "emploi__grade"):
        ligne = par_emploi.setdefault(fiche.emploi_id, {
            "emploi": fiche.emploi, "fonctionnaires": 0, "contractuels": 0, "structures": [],
        })
        ligne["fonctionnaires"] += fiche.fonctionnaires
        ligne["contractuels"] += fiche.contractuels
        ligne["structures"].append({"nom": fiche.entite.nom, "fonctionnaires": fiche.fonctionnaires, "contractuels": fiche.contractuels})
    return par_emploi


def _validations_par_emploi(campagne) -> dict[int, dict[str, ValidationBesoin]]:
    resultat: dict[int, dict[str, ValidationBesoin]] = defaultdict(dict)
    if campagne is not None:
        for validation in ValidationBesoin.objects.filter(campagne=campagne):
            resultat[validation.emploi_id][validation.etape] = validation
    return resultat


def _ligne_programmation(demande: dict, validations: dict[str, ValidationBesoin]) -> dict:
    emploi = demande["emploi"]
    return {
        "reference": emploi.code,
        "emploi": {"code": emploi.code, "libelle": emploi.libelle},
        "grade": emploi.grade.code,
        "structures": sorted(demande["structures"], key=lambda s: s["nom"]),
        "nombre_structures": len(demande["structures"]),
        "fonctionnaires": demande["fonctionnaires"],
        "contractuels": demande["contractuels"],
        "volume": demande["fonctionnaires"] + demande["contractuels"],
        "conference": _detail(validations.get(ValidationBesoin.Etape.CONFERENCE)),
        "catalogue": _detail(validations.get(ValidationBesoin.Etape.CATALOGUE)),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def programmation(request, etape: str):
    """Emplois soumis à une étape (Conférence de programmation, Catalogue des mesures nouvelles).

    La décision se prend par emploi ; le nombre d'agents n'est qu'un décompte des emplois retenus.
    """
    etape = _etape(etape)
    if request.method == "POST":
        return _valider(request, etape)

    from .besoins import _campagne, _est_pilote, _ligne_campagne

    campagne = _campagne()
    validations = _validations_par_emploi(campagne)
    lignes = []
    for emploi_id, demande in _emplois_demandes(campagne).items():
        par_etape = validations.get(emploi_id, {})
        conference = par_etape.get(ValidationBesoin.Etape.CONFERENCE)
        if etape == ValidationBesoin.Etape.CATALOGUE and not (conference and conference.volume > 0):
            continue
        lignes.append(_ligne_programmation(demande, par_etape))
    lignes.sort(key=lambda ligne: (-ligne["volume"], ligne["emploi"]["libelle"]))
    examinees = [ligne for ligne in lignes if ligne[etape]]
    maintenues = [ligne for ligne in examinees if ligne[etape]["decision"] == ValidationBesoin.Decision.MAINTENU]
    collecte_close = campagne is not None and not campagne.ouverte
    return Response({
        "etape": etape,
        "libelle": ETAPES[etape],
        "campagne": _ligne_campagne(campagne),
        "ouverte": collecte_close if etape == ValidationBesoin.Etape.CONFERENCE else True,
        "peut_decider": _est_pilote(request.user),
        "lignes": lignes,
        "totaux": {
            "soumis": len(lignes),
            "examines": len(examinees),
            "maintenus": len(maintenues),
            "modifies": len(examinees) - len(maintenues),
            "fonctionnaires_soumis": sum(l["fonctionnaires"] for l in lignes),
            "contractuels_soumis": sum(l["contractuels"] for l in lignes),
            "fonctionnaires_conference": sum(l["conference"]["fonctionnaires"] for l in lignes if l["conference"]),
            "contractuels_conference": sum(l["conference"]["contractuels"] for l in lignes if l["conference"]),
            "volume_conference": sum(l["conference"]["volume"] for l in lignes if l["conference"]),
            "fonctionnaires_valides": sum(l[etape]["fonctionnaires"] for l in examinees),
            "contractuels_valides": sum(l[etape]["contractuels"] for l in examinees),
            "volume_soumis": sum(l["volume"] for l in lignes),
            "volume_valide": sum(l[etape]["volume"] for l in examinees),
        },
    })


def _entier_positif(valeur) -> int | None:
    try:
        nombre = int(valeur if valeur not in (None, "") else 0)
    except (TypeError, ValueError):
        return None
    return nombre if nombre >= 0 else None


def _valider(request, etape: str):
    """Maintient le nombre d'un emploi, ou le modifie. Le Catalogue est la décision de la Fonction publique."""
    from .besoins import _campagne, _est_pilote

    if not _est_pilote(request.user):
        return Response({"detail": "Seule la direction des ressources humaines enregistre les décisions."}, status=403)
    campagne = _campagne()
    demandes = _emplois_demandes(campagne)
    emploi = next((d["emploi"] for d in demandes.values() if d["emploi"].code == str(request.data.get("emploi") or "")), None)
    if emploi is None:
        return Response({"detail": "Cet emploi ne fait pas partie des besoins collectés."}, status=404)
    demande = demandes[emploi.id]
    reference = " ".join(str(request.data.get("reference") or "").split())[:80]
    observations = " ".join(str(request.data.get("observations") or "").split())[:240]

    if etape == ValidationBesoin.Etape.CONFERENCE:
        if campagne.ouverte:
            return Response({"detail": "La Conférence examine les besoins une fois l'appel clôturé."}, status=409)
        base_f, base_c = demande["fonctionnaires"], demande["contractuels"]
    else:
        conference = ValidationBesoin.objects.filter(campagne=campagne, emploi=emploi, etape=ValidationBesoin.Etape.CONFERENCE).first()
        if conference is None or conference.volume < 1:
            return Response({"detail": "Cet emploi doit d'abord être retenu par la Conférence de programmation."}, status=400)
        base_f, base_c = conference.fonctionnaires, conference.contractuels

    if request.data.get("maintenir"):
        fonctionnaires, contractuels = base_f, base_c
    else:
        fonctionnaires = _entier_positif(request.data.get("fonctionnaires"))
        contractuels = _entier_positif(request.data.get("contractuels"))
        if fonctionnaires is None or contractuels is None or fonctionnaires > 5000 or contractuels > 5000:
            return Response({"detail": "Indiquez un nombre de fonctionnaires et de contractuels entre 0 et 5000."}, status=400)
    decision = (
        ValidationBesoin.Decision.MAINTENU
        if (fonctionnaires, contractuels) == (base_f, base_c)
        else ValidationBesoin.Decision.MODIFIE
    )
    if decision == ValidationBesoin.Decision.MODIFIE and not observations:
        return Response({"detail": "Indiquez dans les observations pourquoi le nombre est modifié."}, status=400)

    _, cree = ValidationBesoin.objects.update_or_create(
        campagne=campagne,
        emploi=emploi,
        etape=etape,
        defaults={
            "decision": decision, "fonctionnaires": fonctionnaires, "contractuels": contractuels,
            "volume": fonctionnaires + contractuels, "reference": reference, "observations": observations,
            "valide_le": timezone.localdate(),
        },
    )
    validations = {v.etape: v for v in ValidationBesoin.objects.filter(campagne=campagne, emploi=emploi)}
    return Response(_ligne_programmation(demande, validations), status=201 if cree else 200)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def retirer_validation(request, etape: str, reference: str):
    """Retire la décision d'un emploi. Retirer la Conférence retire aussi le catalogue qui en découle."""
    from .besoins import _campagne, _est_pilote

    if not _est_pilote(request.user):
        return Response({"detail": "Seule la direction des ressources humaines enregistre les décisions."}, status=403)
    etape = _etape(etape)
    campagne = _campagne()
    with transaction.atomic():
        suppression = ValidationBesoin.objects.filter(campagne=campagne, emploi__code=reference)
        suppression = suppression if etape == ValidationBesoin.Etape.CONFERENCE else suppression.filter(etape=etape)
        suppression.delete()
    return Response(status=204)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bilan_satisfaction(_request):
    """Pour chaque emploi : ce qui a été demandé, retenu en Conférence, retenu au Catalogue puis effectivement affecté."""
    from .besoins import _campagne, _ligne_campagne

    campagne = _campagne()
    validations = _validations_par_emploi(campagne)
    vide = lambda: {"fonctionnaires": 0, "contractuels": 0}  # noqa: E731
    lignes_par_emploi: dict[str, dict] = {}

    def ligne(libelle: str, grade: str = "") -> dict:
        return lignes_par_emploi.setdefault(libelle, {
            "emploi": libelle, "grade": grade, "demande": vide(), "conference": vide(), "catalogue": vide(), "dote": vide(),
        })

    for emploi_id, demande in _emplois_demandes(campagne).items():
        emploi = demande["emploi"]
        courante = ligne(emploi.libelle, emploi.grade.code)
        courante["demande"] = {"fonctionnaires": demande["fonctionnaires"], "contractuels": demande["contractuels"]}
        for etape in ("conference", "catalogue"):
            validation = validations.get(emploi_id, {}).get(etape)
            if validation:
                courante[etape] = {"fonctionnaires": validation.fonctionnaires, "contractuels": validation.contractuels}

    # La dotation : les agents affectés ou réaffectés depuis l'ouverture de l'appel, par emploi et par catégorie.
    mouvements = MouvementAgent.objects.select_related("emploi__grade")
    if campagne is not None and campagne.ouverte_le:
        mouvements = mouvements.filter(date_effet__gte=campagne.ouverte_le)
    for mouvement in mouvements:
        courante = ligne(mouvement.emploi.libelle, mouvement.emploi.grade.code) if mouvement.emploi_id else ligne("Emploi non précisé")
        cle = "fonctionnaires" if mouvement.categorie == MouvementAgent.Categorie.FONCTIONNAIRE else "contractuels"
        courante["dote"][cle] += 1

    def total(valeurs: dict) -> int:
        return valeurs["fonctionnaires"] + valeurs["contractuels"]

    lignes = []
    for courante in lignes_par_emploi.values():
        demande, catalogue, dote = total(courante["demande"]), total(courante["catalogue"]), total(courante["dote"])
        for cle in ("demande", "conference", "catalogue", "dote"):
            courante[cle]["total"] = total(courante[cle])
        courante["ecart"] = dote - catalogue
        courante["taux"] = round(100 * min(dote, catalogue) / catalogue, 1) if catalogue else None
        courante["couverture"] = round(100 * min(dote, demande) / demande, 1) if demande else None
        lignes.append(courante)
    lignes.sort(key=lambda item: (item["taux"] is None, item["taux"] if item["taux"] is not None else 0, item["emploi"]))

    def somme(etape: str) -> dict:
        f = sum(item[etape]["fonctionnaires"] for item in lignes)
        c = sum(item[etape]["contractuels"] for item in lignes)
        return {"fonctionnaires": f, "contractuels": c, "total": f + c}

    demande, conference, catalogue, dote = somme("demande"), somme("conference"), somme("catalogue"), somme("dote")
    satisfait = sum(min(item["dote"]["total"], item["catalogue"]["total"]) for item in lignes)
    couvert = sum(min(item["dote"]["total"], item["demande"]["total"]) for item in lignes)
    return Response({
        "campagne": _ligne_campagne(campagne),
        "totaux": {
            "demande": demande, "conference": conference, "catalogue": catalogue, "dote": dote,
            "taux": round(100 * satisfait / catalogue["total"], 1) if catalogue["total"] else None,
            "couverture": round(100 * couvert / demande["total"], 1) if demande["total"] else None,
            "taux_validation": round(100 * catalogue["total"] / demande["total"], 1) if demande["total"] else None,
        },
        "lignes": lignes,
    })
