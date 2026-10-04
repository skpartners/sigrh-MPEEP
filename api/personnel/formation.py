"""Sous-direction de la formation continue : catalogue, planification des sessions, candidatures,
émargement, clôture, prestataires, besoins et plan annuel.

Les candidatures des agents restent des demandes qui suivent le circuit de validation
(chef de service → SD Formation Continue → DRH → notification, voir inscriptions.py).
"""

import re
from collections import defaultdict
from datetime import date

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import ProtectedError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .classeur import habiller
from .models import (
    Agent,
    BesoinFormation,
    Formation,
    InscriptionFormation,
    Notification,
    Organisme,
    PlanFormation,
    Prestataire,
    PublicFormation,
    SessionFormation,
    TypeFormation,
    VisaDemande,
)

EXERCICE = 2026


class Invalide(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


def _erreur(message: str, statut: int = 400) -> Response:
    return Response({"detail": message}, status=statut)


# --- Lecture des saisies -------------------------------------------------------


def _texte(data, cle: str, libelle: str, longueur: int, obligatoire: bool = False) -> str:
    valeur = str(data.get(cle) or "").strip()
    if obligatoire and not valeur:
        raise Invalide(f"Le champ « {libelle} » est obligatoire.")
    if len(valeur) > longueur:
        raise Invalide(f"Le champ « {libelle} » dépasse {longueur} caractères.")
    return valeur


def _entier(data, cle: str, libelle: str, minimum: int = 0, maximum: int = 10**12) -> int:
    brut = data.get(cle)
    if brut in (None, ""):
        raise Invalide(f"Le champ « {libelle} » est obligatoire.")
    try:
        valeur = int(str(brut).replace(" ", "").replace(" ", ""))
    except ValueError:
        raise Invalide(f"Le champ « {libelle} » doit être un nombre entier.") from None
    if not minimum <= valeur <= maximum:
        raise Invalide(f"Le champ « {libelle} » doit être compris entre {minimum} et {maximum}.")
    return valeur


def _date(data, cle: str, libelle: str, obligatoire: bool = False) -> date | None:
    brut = str(data.get(cle) or "").strip()
    if not brut:
        if obligatoire:
            raise Invalide(f"Le champ « {libelle} » est obligatoire.")
        return None
    try:
        return date.fromisoformat(brut)
    except ValueError:
        raise Invalide(f"Le champ « {libelle} » n'est pas une date valide.") from None


def _slug(texte: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", texte.lower().encode("ascii", "ignore").decode()).strip("-")
    return base[:32] or "module"


# --- État des sessions et des candidatures ------------------------------------

ETAT_SESSION = {
    "a_planifier": "À planifier",
    "planifiee": "Planifiée",
    "inscriptions_ouvertes": "Inscriptions ouvertes",
    "en_cours": "En cours",
    "terminee": "Terminée",
    "annulee": "Annulée",
}


def etat_session(session: SessionFormation, aujourd_hui: date | None = None) -> str:
    aujourd_hui = aujourd_hui or timezone.localdate()
    if session.annulee:
        return "annulee"
    if session.cloturee_le:
        return "terminee"
    if session.date_debut and session.date_debut <= aujourd_hui and (session.date_fin is None or aujourd_hui <= session.date_fin):
        return "en_cours"
    if session.ouverte:
        return "inscriptions_ouvertes"
    return "planifiee" if session.date_debut else "a_planifier"


ETAT_INSCRIPTION = {
    "avis_hierarchique": "Avis du chef de service",
    "controle_sd": "Contrôle SD Formation",
    "visa_drh": "Visa DRH",
    "retenue": "Retenue",
    "refusee": "Refusée",
}


def etat_inscription(inscription: InscriptionFormation) -> str:
    etape = inscription.demande.etape.lower()
    if "rejet" in etape or "refus" in etape:
        return "refusee"
    if "notifi" in etape:
        return "retenue"
    if "étape 4" in etape:
        return "visa_drh"
    if "étape 3" in etape:
        return "controle_sd"
    return "avis_hierarchique"


def _occupees(session: SessionFormation) -> int:
    """Places prises : candidatures validées par la SD (au visa DRH) ou retenues."""
    return sum(1 for i in session.inscriptions.all() if etat_inscription(i) in {"visa_drh", "retenue"})


def verifier_places(demande) -> str | None:
    """Avant que la SD ne transmette une candidature au DRH : le module ne doit pas être complet."""
    inscription = getattr(demande, "inscription_formation", None)
    if inscription is None or etat_inscription(inscription) != "controle_sd":
        return None
    session = inscription.session
    if session.annulee:
        return "Ce module est annulé."
    if _occupees(session) >= session.places:
        return f"Le module est complet ({session.places} places). Augmentez le nombre de places ou refusez la candidature."
    return None


# --- Présentation ---------------------------------------------------------------


def _type_row(item: TypeFormation) -> dict:
    return {
        "code": item.code,
        "libelle": item.libelle,
        "ordre": item.ordre,
        "publics": [public.libelle for public in item.publics.all()],
        "piece_requise": item.piece_requise,
        "piece_libelle": item.piece_libelle,
        "sessions": item.sessions.count(),
    }


def _prestataire_row(item: Prestataire) -> dict:
    aujourd_hui = timezone.localdate()
    return {
        "id": item.id,
        "nom": item.nom,
        "categorie": item.categorie,
        "categorie_libelle": item.get_categorie_display(),
        "specialites": item.specialites,
        "ville": item.ville,
        "contact_nom": item.contact_nom,
        "contact_email": item.contact_email,
        "contact_telephone": item.contact_telephone,
        "convention_debut": item.convention_debut.isoformat() if item.convention_debut else None,
        "convention_fin": item.convention_fin.isoformat() if item.convention_fin else None,
        "convention_valide": bool(item.convention_fin and item.convention_fin >= aujourd_hui),
        "actif": item.actif,
        "sessions": item.sessions.count(),
        "heures": sum(s.heures for s in item.sessions.all() if s.cloturee_le),
    }


def _inscription_row(item: InscriptionFormation) -> dict:
    demande = item.demande
    agent = demande.agent
    etat = etat_inscription(item)
    return {
        "id": item.id,
        "reference": demande.reference,
        "etat": etat,
        "etat_libelle": ETAT_INSCRIPTION[etat],
        "etape": demande.etape,
        "deposee_le": demande.depose_le.isoformat(),
        "present": item.present,
        "note_satisfaction": item.note_satisfaction,
        "piece": bool(item.fichier),
        "session": {"code": item.session.code, "libelle": item.session.libelle},
        "agent": {
            "matricule": agent.matricule,
            "nom_complet": agent.nom_complet,
            "initiales": agent.initiales,
            "fonction": getattr(agent, "fonction", "") or agent.corps,
            "organisme": agent.organisme.sigle or agent.organisme.nom,
        },
    }


def _session_row(item: SessionFormation, aujourd_hui: date) -> dict:
    inscriptions = list(item.inscriptions.all())
    etats = [etat_inscription(i) for i in inscriptions]
    retenues = sum(1 for e in etats if e == "retenue")
    occupees = sum(1 for e in etats if e in {"visa_drh", "retenue"})
    notes = [i.note_satisfaction for i in inscriptions if i.note_satisfaction]
    presents = [i.present for i in inscriptions if etat_inscription(i) == "retenue"]
    etat = etat_session(item, aujourd_hui)
    return {
        "code": item.code,
        "libelle": item.libelle,
        "objectif": item.objectif,
        "cadre_budgetaire": item.cadre_budgetaire,
        "type": item.type_formation.code,
        "type_libelle": item.type_formation.libelle,
        "etat": etat,
        "etat_libelle": ETAT_SESSION[etat],
        "ouverte": item.ouverte,
        "prestataire": {"id": item.prestataire.id, "nom": item.prestataire.nom} if item.prestataire else None,
        "lieu": item.lieu,
        "formateur": item.formateur,
        "date_debut": item.date_debut.isoformat() if item.date_debut else None,
        "date_fin": item.date_fin.isoformat() if item.date_fin else None,
        "heures": item.heures,
        "places": item.places,
        "cout_participant": item.cout_participant,
        "motif_annulation": item.motif_annulation,
        "cloturee_le": item.cloturee_le.isoformat() if item.cloturee_le else None,
        "candidatures": len(inscriptions),
        "a_traiter": sum(1 for e in etats if e == "controle_sd"),
        "occupees": occupees,
        "retenues": retenues,
        "presents": sum(1 for p in presents if p),
        "emargement_complet": all(p is not None for p in presents) and bool(presents),
        "satisfaction": round(sum(notes) / len(notes), 2) if notes else None,
        "engage": item.cout_participant * occupees if not item.annulee else 0,
    }


def _sessions():
    return SessionFormation.objects.select_related("type_formation", "prestataire").prefetch_related(
        "inscriptions__demande__agent__organisme"
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tableau(request):
    """Tout l'écran de la sous-direction, calculé depuis la base."""
    aujourd_hui = timezone.localdate()
    plan = PlanFormation.objects.filter(annee=EXERCICE).first()
    sessions = [_session_row(s, aujourd_hui) for s in _sessions()]
    inscriptions = [
        _inscription_row(i)
        for i in InscriptionFormation.objects.select_related("demande__agent__organisme", "session").order_by("-demande__depose_le", "-id")
    ]
    besoins = BesoinFormation.objects.filter(annee=EXERCICE).select_related("organisme", "type_formation", "session")
    types = TypeFormation.objects.prefetch_related("publics", "sessions")

    engage = sum(s["engage"] for s in sessions)
    formes = sum(s["presents"] for s in sessions if s["etat"] == "terminee")
    notes = [i["note_satisfaction"] for i in inscriptions if i["note_satisfaction"]]
    par_type: dict[str, int] = defaultdict(int)
    for s in sessions:
        par_type[s["type"]] += s["engage"]

    recensement = []
    for t in types:
        lignes = [b for b in besoins if b.type_formation_id == t.id]
        if not lignes:
            continue
        recensement.append(
            {
                "type": t.code,
                "libelle": t.libelle,
                "besoins": len(lignes),
                "structures": len({b.organisme_id for b in lignes}),
                "effectif": sum(b.effectif for b in lignes),
                "couverts": sum(1 for b in lignes if b.statut == BesoinFormation.Statut.COUVERT),
            }
        )

    return Response(
        {
            "exercice": EXERCICE,
            "plan": {"annee": EXERCICE, "dotation": plan.dotation if plan else 0, "objectif_agents": plan.objectif_agents if plan else 0},
            "indicateurs": {
                "engage": engage,
                "formes": formes,
                "sessions": len([s for s in sessions if s["etat"] != "annulee"]),
                "sessions_ouvertes": len([s for s in sessions if s["etat"] == "inscriptions_ouvertes"]),
                "sessions_en_cours": len([s for s in sessions if s["etat"] == "en_cours"]),
                "candidatures_a_traiter": len([i for i in inscriptions if i["etat"] == "controle_sd"]),
                "satisfaction": round(sum(notes) / len(notes), 2) if notes else None,
                "evaluations": len(notes),
                "prestataires_actifs": Prestataire.objects.filter(actif=True).count(),
            },
            "budget_par_type": [
                {"type": t.code, "libelle": t.libelle, "montant": par_type.get(t.code, 0)} for t in types if par_type.get(t.code)
            ],
            "recensement": recensement,
            "types": [_type_row(t) for t in types],
            "sessions": sessions,
            "inscriptions": inscriptions,
            "prestataires": [_prestataire_row(p) for p in Prestataire.objects.prefetch_related("sessions")],
            "besoins": [
                {
                    "id": b.id,
                    "intitule": b.intitule,
                    "effectif": b.effectif,
                    "priorite": b.priorite,
                    "priorite_libelle": b.get_priorite_display(),
                    "statut": b.statut,
                    "statut_libelle": b.get_statut_display(),
                    "exprime_le": b.exprime_le.isoformat(),
                    "organisme": {"code": b.organisme.code, "nom": b.organisme.sigle or b.organisme.nom},
                    "type": b.type_formation.code,
                    "type_libelle": b.type_formation.libelle,
                    "session": {"code": b.session.code, "libelle": b.session.libelle} if b.session else None,
                }
                for b in besoins
            ],
            "organismes": [{"code": o.code, "nom": o.sigle or o.nom} for o in Organisme.objects.all()],
        }
    )


# --- Plan annuel ----------------------------------------------------------------


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def plan(request):
    try:
        dotation = _entier(request.data, "dotation", "dotation", 0, 10**13)
        objectif = _entier(request.data, "objectif_agents", "objectif d'agents à former", 0, 100_000)
    except Invalide as exc:
        return _erreur(exc.message)
    PlanFormation.objects.update_or_create(annee=EXERCICE, defaults={"dotation": dotation, "objectif_agents": objectif})
    return Response({"annee": EXERCICE, "dotation": dotation, "objectif_agents": objectif})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_plan(request):
    """Plan de formation en classeur Excel coloré."""
    aujourd_hui = timezone.localdate()
    lignes = []
    for session in _sessions():
        ligne = _session_row(session, aujourd_hui)
        lignes.append([
            session.code,
            session.libelle,
            session.type_formation.libelle,
            ligne["etat_libelle"],
            session.date_debut.strftime("%d/%m/%Y") if session.date_debut else "",
            session.date_fin.strftime("%d/%m/%Y") if session.date_fin else "",
            session.heures,
            session.lieu,
            session.prestataire.nom if session.prestataire else "",
            session.places,
            ligne["retenues"],
            session.cout_participant,
            ligne["engage"],
        ])
    contenu = habiller([{
        "nom": "Plan",
        "titre": f"SIGRH  ·  Plan de formation {EXERCICE}",
        "sous_titre": "Modules, places, retenus et montants engagés.",
        "notice": "Les montants sont en francs CFA. Une ligne correspond à un module du plan.",
        "lignes": [[
            "Code", "Module", "Type", "État", "Début", "Fin", "Heures", "Lieu", "Prestataire",
            "Places", "Retenus", "Coût par participant (FCFA)", "Montant engagé (FCFA)",
        ], *lignes],
        "paysage": True,
    }])
    reponse = HttpResponse(contenu, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    reponse["Content-Disposition"] = f'attachment; filename="plan-formation-{EXERCICE}.xlsx"'
    return reponse


# --- Catalogue (types de formation) ----------------------------------------------


def _lire_type(data) -> dict:
    libelle = _texte(data, "libelle", "intitulé du cycle", 160, obligatoire=True)
    publics = data.get("publics") or []
    if not isinstance(publics, list):
        raise Invalide("Les publics concernés doivent être une liste.")
    publics = [str(p).strip() for p in publics if str(p).strip()]
    if any(len(p) > 160 for p in publics):
        raise Invalide("Un public concerné dépasse 160 caractères.")
    piece = bool(data.get("piece_requise"))
    piece_libelle = _texte(data, "piece_libelle", "pièce exigée", 160, obligatoire=piece)
    return {"libelle": libelle, "publics": publics, "piece_requise": piece, "piece_libelle": piece_libelle if piece else ""}


def _enregistrer_publics(item: TypeFormation, publics: list[str]) -> None:
    item.publics.all().delete()
    PublicFormation.objects.bulk_create([PublicFormation(type_formation=item, libelle=p, ordre=i) for i, p in enumerate(publics, 1)])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_type(request):
    try:
        valeurs = _lire_type(request.data)
        code = _texte(request.data, "code", "code", 40, obligatoire=True).upper()
    except Invalide as exc:
        return _erreur(exc.message)
    if not re.fullmatch(r"[A-Z0-9-]{2,40}", code):
        return _erreur("Le code doit contenir de 2 à 40 lettres majuscules, chiffres ou tirets.")
    if TypeFormation.objects.filter(code=code).exists():
        return _erreur(f"Le code « {code} » existe déjà.", 409)
    with transaction.atomic():
        ordre = (TypeFormation.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        item = TypeFormation.objects.create(code=code, libelle=valeurs["libelle"], ordre=ordre, piece_requise=valeurs["piece_requise"], piece_libelle=valeurs["piece_libelle"])
        _enregistrer_publics(item, valeurs["publics"])
    return Response(_type_row(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def type_formation(request, code: str):
    item = get_object_or_404(TypeFormation, code=code)
    if request.method == "DELETE":
        if item.sessions.exists() or item.besoins.exists():
            return _erreur("Ce cycle est utilisé par des modules ou des besoins : retirez-les d'abord.", 409)
        item.delete()
        return Response(status=204)
    try:
        valeurs = _lire_type(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    with transaction.atomic():
        item.libelle, item.piece_requise, item.piece_libelle = valeurs["libelle"], valeurs["piece_requise"], valeurs["piece_libelle"]
        item.save()
        _enregistrer_publics(item, valeurs["publics"])
    return Response(_type_row(item))


# --- Sessions : planification ----------------------------------------------------


def _lire_session(data) -> dict:
    type_formation = TypeFormation.objects.filter(code=str(data.get("type") or "")).first()
    if type_formation is None:
        raise Invalide("Choisissez le cycle de formation.")
    prestataire = None
    if data.get("prestataire"):
        prestataire = Prestataire.objects.filter(pk=data.get("prestataire")).first()
        if prestataire is None:
            raise Invalide("Le prestataire choisi est inconnu.")
    debut = _date(data, "date_debut", "date de début")
    fin = _date(data, "date_fin", "date de fin")
    if debut and fin and fin < debut:
        raise Invalide("La date de fin précède la date de début.")
    if fin and not debut:
        raise Invalide("Indiquez la date de début.")
    return {
        "type_formation": type_formation,
        "libelle": _texte(data, "libelle", "intitulé du module", 160, obligatoire=True),
        "objectif": _texte(data, "objectif", "objectif", 240),
        "cadre_budgetaire": _texte(data, "cadre_budgetaire", "cadre budgétaire", 160),
        "prestataire": prestataire,
        "lieu": _texte(data, "lieu", "lieu", 160),
        "formateur": _texte(data, "formateur", "formateur", 160),
        "date_debut": debut,
        "date_fin": fin,
        "heures": _entier(data, "heures", "volume horaire", 0, 2000),
        "places": _entier(data, "places", "nombre de places", 1, 1000),
        "cout_participant": _entier(data, "cout_participant", "coût par participant", 0, 10**10),
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_session(request):
    try:
        valeurs = _lire_session(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    base = _slug(valeurs["libelle"])
    code, n = base, 2
    while SessionFormation.objects.filter(code=code).exists():
        code, n = f"{base}-{n}", n + 1
    session = SessionFormation.objects.create(code=code, **valeurs)
    _couvrir_besoins(session, request.data.get("besoins"))
    return Response(_session_row(_sessions().get(pk=session.pk), timezone.localdate()), status=201)


def _couvrir_besoins(session: SessionFormation, identifiants) -> None:
    if isinstance(identifiants, list) and identifiants:
        BesoinFormation.objects.filter(pk__in=identifiants).update(session=session, statut=BesoinFormation.Statut.COUVERT)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def session(request, code: str):
    item = get_object_or_404(SessionFormation, code=code)
    if request.method == "DELETE":
        if item.inscriptions.exists():
            return _erreur("Des agents ont candidaté à ce module : annulez-le plutôt que de le supprimer.", 409)
        BesoinFormation.objects.filter(session=item).update(session=None, statut=BesoinFormation.Statut.RETENU)
        try:
            item.delete()
        except ProtectedError:
            return _erreur("Ce module est référencé ailleurs et ne peut pas être supprimé.", 409)
        return Response(status=204)
    if item.cloturee_le or item.annulee:
        return _erreur("Un module terminé ou annulé ne se modifie plus.", 409)
    try:
        valeurs = _lire_session(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    if valeurs["places"] < _occupees(item):
        return _erreur(f"{_occupees(item)} places sont déjà attribuées : le nombre de places ne peut pas être inférieur.", 409)
    for champ, valeur in valeurs.items():
        setattr(item, champ, valeur)
    item.save()
    _couvrir_besoins(item, request.data.get("besoins"))
    return Response(_session_row(_sessions().get(pk=item.pk), timezone.localdate()))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def action_session(request, code: str, action: str):
    """ouvrir / fermer les inscriptions, annuler (motif obligatoire), cloturer (émargement complet)."""
    item = get_object_or_404(_sessions(), code=code)
    aujourd_hui = timezone.localdate()
    if item.annulee or item.cloturee_le:
        return _erreur("Ce module est déjà terminé ou annulé.", 409)

    if action == "ouvrir":
        if not item.date_debut:
            return _erreur("Planifiez les dates du module avant d'ouvrir les inscriptions.", 409)
        item.ouverte, item.ouverte_le = True, item.ouverte_le or aujourd_hui
        item.save(update_fields=["ouverte", "ouverte_le"])
    elif action == "fermer":
        item.ouverte = False
        item.save(update_fields=["ouverte"])
    elif action == "annuler":
        motif = str(request.data.get("motif") or "").strip()
        if not motif:
            return _erreur("Indiquez le motif de l'annulation : il est communiqué aux candidats.")
        if len(motif) > 240:
            return _erreur("Le motif dépasse 240 caractères.")
        with transaction.atomic():
            item.annulee, item.ouverte, item.motif_annulation = True, False, motif
            item.save(update_fields=["annulee", "ouverte", "motif_annulation"])
            for inscription in item.inscriptions.all():
                if etat_inscription(inscription) != "refusee":
                    _refuser(inscription, f"Module annulé : {motif}", request.user)
            BesoinFormation.objects.filter(session=item).update(session=None, statut=BesoinFormation.Statut.RETENU)
    elif action == "cloturer":
        retenues = [i for i in item.inscriptions.all() if etat_inscription(i) == "retenue"]
        if not retenues:
            return _erreur("Aucun participant retenu : annulez le module plutôt que de le clôturer.", 409)
        manquants = [i for i in retenues if i.present is None]
        if manquants:
            return _erreur(f"Renseignez la présence de {len(manquants)} participant{'s' if len(manquants) > 1 else ''} avant de clôturer.", 409)
        organisme = item.prestataire.nom if item.prestataire else "Direction de la formation continue"
        with transaction.atomic():
            item.cloturee_le, item.ouverte = aujourd_hui, False
            item.save(update_fields=["cloturee_le", "ouverte"])
            # La formation suivie entre dans le dossier de chaque agent présent.
            for inscription in retenues:
                if inscription.present:
                    Formation.objects.create(
                        agent=inscription.demande.agent,
                        intitule=item.libelle,
                        organisme=organisme,
                        debut=item.date_debut or aujourd_hui,
                        fin=item.date_fin or aujourd_hui,
                        heures=item.heures,
                        statut="Terminée",
                        certification=f"Attestation de formation {item.code.upper()}",
                    )
    else:
        return _erreur("Action inconnue.", 404)
    return Response(_session_row(_sessions().get(pk=item.pk), aujourd_hui))


# --- Candidatures ----------------------------------------------------------------


def _refuser(inscription: InscriptionFormation, motif: str, acteur) -> None:
    demande = inscription.demande
    aujourd_hui = timezone.localdate()
    nom = acteur.get_full_name() or acteur.username
    VisaDemande.objects.filter(demande=demande, ordre=3).update(
        avis="Défavorable", commentaire=motif, date=aujourd_hui, titulaire=nom, fonction="Sous-direction de la formation continue"
    )
    VisaDemande.objects.filter(demande=demande, avis="En attente").exclude(ordre=3).update(avis="Sans objet")
    demande.etape, demande.responsable, demande.echeance = "Rejetée : SD Formation Continue", motif[:140], "Clôturée"
    demande.save(update_fields=["etape", "responsable", "echeance"])
    compte = User.objects.filter(username=demande.agent.matricule).first()
    if compte is not None:
        Notification.objects.create(
            destinataire=compte, categorie=Notification.Categorie.DEMANDE, titre="Candidature non retenue",
            message=f"{inscription.session.libelle} : {motif}", lien=f"/app/dossiers/{demande.agent.matricule}?onglet=formation",
            creee_le=timezone.now(),
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refuser_inscription(request, pk: int):
    inscription = get_object_or_404(InscriptionFormation.objects.select_related("demande__agent", "session"), pk=pk)
    if etat_inscription(inscription) in {"retenue", "refusee"}:
        return _erreur("Cette candidature est déjà tranchée.", 409)
    motif = str(request.data.get("motif") or "").strip()
    if not motif:
        return _erreur("Indiquez le motif du refus : il est communiqué à l'agent.")
    if len(motif) > 240:
        return _erreur("Le motif dépasse 240 caractères.")
    with transaction.atomic():
        _refuser(inscription, motif, request.user)
    return Response(_inscription_row(inscription))


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def emarger(request, pk: int):
    """Présence et satisfaction d'un participant retenu, pendant ou après la session."""
    inscription = get_object_or_404(InscriptionFormation.objects.select_related("demande__agent__organisme", "session"), pk=pk)
    if etat_inscription(inscription) != "retenue":
        return _erreur("Seuls les participants retenus s'émargent.", 409)
    if inscription.session.cloturee_le:
        return _erreur("Le module est clôturé : l'émargement est figé.", 409)
    champs = []
    if "present" in request.data:
        valeur = request.data.get("present")
        if valeur not in (True, False, None):
            return _erreur("La présence vaut vrai, faux ou vide.")
        inscription.present = valeur
        champs.append("present")
    if "note_satisfaction" in request.data:
        note = request.data.get("note_satisfaction")
        if note is not None and (not isinstance(note, int) or not 1 <= note <= 5):
            return _erreur("La note de satisfaction va de 1 à 5.")
        inscription.note_satisfaction = note
        champs.append("note_satisfaction")
    if champs:
        inscription.save(update_fields=champs)
    return Response(_inscription_row(inscription))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def inscrire_agents(request, code: str):
    """La SD inscrit des agents à un module ouvert : chaque candidature entre dans le circuit."""
    from .inscriptions import inscrire

    matricules = request.data.get("matricules")
    if not isinstance(matricules, list) or not matricules:
        return _erreur("Choisissez au moins un agent.")
    resultats = []
    for matricule in matricules[:50]:
        agent = Agent.objects.filter(matricule=str(matricule)).first()
        if agent is None:
            resultats.append({"matricule": matricule, "ok": False, "message": "Agent introuvable."})
            continue
        erreur = inscrire(agent, code)
        resultats.append({"matricule": agent.matricule, "nom": agent.nom_complet, "ok": erreur is None, "message": erreur or "Candidature transmise au chef de service."})
    return Response({"resultats": resultats, "inscrits": sum(1 for r in resultats if r["ok"])})


# --- Prestataires ----------------------------------------------------------------


def _lire_prestataire(data) -> dict:
    categorie = str(data.get("categorie") or "")
    if categorie not in Prestataire.Categorie.values:
        raise Invalide("Choisissez la catégorie du prestataire.")
    email = _texte(data, "contact_email", "courriel", 254)
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise Invalide("Le courriel du contact n'est pas valide.")
    debut = _date(data, "convention_debut", "début de convention")
    fin = _date(data, "convention_fin", "fin de convention")
    if debut and fin and fin < debut:
        raise Invalide("La fin de convention précède son début.")
    return {
        "nom": _texte(data, "nom", "nom", 160, obligatoire=True),
        "categorie": categorie,
        "specialites": _texte(data, "specialites", "spécialités", 240),
        "ville": _texte(data, "ville", "ville", 80),
        "contact_nom": _texte(data, "contact_nom", "contact", 120),
        "contact_email": email,
        "contact_telephone": _texte(data, "contact_telephone", "téléphone", 40),
        "convention_debut": debut,
        "convention_fin": fin,
        "actif": bool(data.get("actif", True)),
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_prestataire(request):
    try:
        valeurs = _lire_prestataire(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    if Prestataire.objects.filter(nom__iexact=valeurs["nom"]).exists():
        return _erreur("Un prestataire porte déjà ce nom.", 409)
    item = Prestataire.objects.create(**valeurs)
    return Response(_prestataire_row(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def prestataire(request, pk: int):
    item = get_object_or_404(Prestataire, pk=pk)
    if request.method == "DELETE":
        if item.sessions.exists():
            return _erreur("Ce prestataire a dispensé des modules : désactivez-le plutôt que de le supprimer.", 409)
        item.delete()
        return Response(status=204)
    try:
        valeurs = _lire_prestataire(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    if Prestataire.objects.filter(nom__iexact=valeurs["nom"]).exclude(pk=pk).exists():
        return _erreur("Un prestataire porte déjà ce nom.", 409)
    for champ, valeur in valeurs.items():
        setattr(item, champ, valeur)
    item.save()
    return Response(_prestataire_row(item))


# --- Besoins recensés ------------------------------------------------------------


def _lire_besoin(data) -> dict:
    organisme = Organisme.objects.filter(code=str(data.get("organisme") or "")).first()
    if organisme is None:
        raise Invalide("Choisissez la structure qui exprime le besoin.")
    type_formation = TypeFormation.objects.filter(code=str(data.get("type") or "")).first()
    if type_formation is None:
        raise Invalide("Choisissez le cycle de formation.")
    priorite = str(data.get("priorite") or "")
    statut = str(data.get("statut") or BesoinFormation.Statut.EXPRIME)
    if priorite not in BesoinFormation.Priorite.values:
        raise Invalide("Choisissez la priorité.")
    if statut not in BesoinFormation.Statut.values:
        raise Invalide("Le statut est inconnu.")
    return {
        "organisme": organisme,
        "type_formation": type_formation,
        "intitule": _texte(data, "intitule", "besoin", 200, obligatoire=True),
        "effectif": _entier(data, "effectif", "nombre d'agents", 1, 5000),
        "priorite": priorite,
        "statut": statut,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_besoin(request):
    try:
        valeurs = _lire_besoin(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    item = BesoinFormation.objects.create(annee=EXERCICE, exprime_le=timezone.localdate(), **valeurs)
    return Response({"id": item.id}, status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def besoin(request, pk: int):
    item = get_object_or_404(BesoinFormation, pk=pk)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    try:
        valeurs = _lire_besoin(request.data)
    except Invalide as exc:
        return _erreur(exc.message)
    if valeurs["statut"] != BesoinFormation.Statut.COUVERT:
        item.session = None
    for champ, valeur in valeurs.items():
        setattr(item, champ, valeur)
    item.save()
    return Response({"id": item.id})
