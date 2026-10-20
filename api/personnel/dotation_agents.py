"""Dotation : répartir les agents et contractuels mis à la disposition du ministère.

- Affectation : un nouvel agent rejoint une structure.
- Réaffectation : un fonctionnaire qui a réussi un concours professionnel change de structure ; sa structure
  précédente est conservée.
- Redéploiement : la hiérarchie envoie un agent dans une autre structure pour les besoins du service, en motivant ;
  la hiérarchie montante en prend connaissance, la DRH et son équipe suivent et l'agent est notifié.
- Mise à disposition : à la demande de l'agent, avec l'avis favorable de la structure d'accueil ; sa hiérarchie accepte
  ou rejette avec motif, la DRH constate et suit.
"""

from pathlib import Path

from django.contrib.auth.models import User
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .besoins import _est_pilote
from .models import (
    Agent,
    Demande,
    EmploiReferentiel,
    EntiteTutelle,
    EtapeParcours,
    MiseADisposition,
    MouvementAgent,
    Notification,
    PositionAdministrative,
    Profil,
    Redeploiement,
)
from .positions import synchroniser_situation
from .rattachement import structure_de, structures_par_nom, structures_sous
from .visibilite import agent_visible

EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
TAILLE_MAX = 5 * 1024 * 1024
NIVEAU_DIRECTION = {"direction-generale", "direction-centrale"}


# --- Qui peut quoi ------------------------------------------------------------------------------


def _equipe_drh(user) -> bool:
    """Le DRH, l'administrateur et les comptes rattachés à la direction des ressources humaines."""
    if _est_pilote(user):
        return True
    profil = getattr(user, "profil", None)
    drh = EntiteTutelle.objects.filter(code="drh").first()
    if profil is None or drh is None:
        return False
    perimetre = structures_sous([drh])
    return any(s is not None and s.id in perimetre for s in (profil.structure, profil.interim))


def _refus_equipe() -> Response:
    return Response({"detail": "Seule la direction des ressources humaines et son équipe tiennent la dotation."}, status=403)


def _agent_du_compte(user) -> Agent | None:
    return Agent.objects.filter(matricule=user.username).first()


def _superieur_de(user, agent: Agent) -> bool:
    """La hiérarchie de l'agent : un compte qui le supervise, jamais l'agent lui-même."""
    return user.username != agent.matricule and agent_visible(user, agent)


def _notifier(destinataire: User | None, titre: str, message: str, lien: str) -> None:
    if destinataire is None:
        return
    Notification.objects.create(
        destinataire=destinataire, categorie=Notification.Categorie.SYSTEME, titre=titre[:160], message=message[:280],
        lien=lien[:200], creee_le=timezone.now(),
    )


def _compte(agent: Agent) -> User | None:
    return User.objects.filter(username=agent.matricule).first()


def _nom(user: User | None) -> str:
    return (user.get_full_name() or user.username) if user else ""


# --- Rattachement de l'agent --------------------------------------------------------------------


def structure_actuelle(agent: Agent) -> EntiteTutelle | None:
    return structure_de(agent, structures_par_nom())


def appliquer_rattachement(agent: Agent, structure: EntiteTutelle | None) -> None:
    """Le service, la sous-direction et la direction de l'agent suivent la structure qui l'accueille."""
    agent.service = agent.sous_direction = agent.direction = ""
    courant, vus = structure, set()
    while courant is not None and courant.id not in vus and courant.niveau != EntiteTutelle.Niveau.MINISTERE:
        vus.add(courant.id)
        if courant.niveau == EntiteTutelle.Niveau.SERVICE and not agent.service:
            agent.service = courant.nom
        elif courant.niveau == EntiteTutelle.Niveau.SOUS_DIRECTION and not agent.sous_direction:
            agent.sous_direction = courant.nom
        elif courant.niveau in NIVEAU_DIRECTION and not agent.direction:
            agent.direction = courant.nom
        courant = courant.parent
    if structure is not None:
        agent.structure = structure.nom
    agent.save(update_fields=["service", "sous_direction", "direction", "structure"])


def _fichier(request, cle: str, obligatoire: bool):
    fichier = request.FILES.get(cle)
    if fichier is None:
        return None, ("Le document est obligatoire." if obligatoire else None)
    if Path(fichier.name).suffix.lower() not in EXTENSIONS:
        return None, "Le document doit être un PDF ou une image (PNG, JPG, WEBP)."
    if fichier.size > TAILLE_MAX:
        return None, "Le document dépasse 5 Mo."
    return fichier, None


def _date(valeur):
    from datetime import date

    try:
        return date.fromisoformat(str(valeur)[:10]) if valeur else None
    except ValueError:
        return False


def _reference(prefixe: str, modele, annee: int) -> str:
    dernier = modele.objects.filter(reference__startswith=f"{prefixe}-{annee}-").count()
    while True:
        dernier += 1
        reference = f"{prefixe}-{annee}-{dernier:03d}"
        if not modele.objects.filter(reference=reference).exists():
            return reference


# --- Lignes -------------------------------------------------------------------------------------


def _lien(fichier) -> str:
    return fichier.url if fichier else ""


def ligne_mouvement(item: MouvementAgent) -> dict:
    agent = item.agent
    return {
        "id": item.id,
        "reference": item.reference,
        "type": item.type,
        "categorie": item.categorie,
        "categorie_libelle": item.get_categorie_display(),
        "agent": {"matricule": agent.matricule, "nom_complet": agent.nom_complet, "grade": agent.grade},
        "structure": {"id": item.structure_id, "nom": item.structure.nom},
        "precedente": item.structure_precedente.nom if item.structure_precedente_id else item.precedente_nom,
        "emploi": {"code": item.emploi.code, "libelle": item.emploi.libelle} if item.emploi_id else None,
        "concours": item.concours,
        "date_effet": item.date_effet.isoformat(),
        "reference_acte": item.reference_acte,
        "document_url": _lien(item.document),
        "document_nom": Path(item.document.name).name if item.document else "",
        "observation": item.observation,
    }


def ligne_redeploiement(item: Redeploiement) -> dict:
    return {
        "id": item.id,
        "reference": item.reference,
        "agent": {"matricule": item.agent.matricule, "nom_complet": item.agent.nom_complet, "grade": item.agent.grade},
        "origine": item.structure_origine.nom if item.structure_origine_id else item.origine_nom,
        "destination": {"id": item.structure_destination_id, "nom": item.structure_destination.nom},
        "motif": item.motif,
        "initiateur": item.initiateur_nom,
        "date_effet": item.date_effet.isoformat() if item.date_effet else "",
        "statut": item.statut,
        "statut_libelle": item.get_statut_display(),
        "connaissance_par": item.connaissance_par,
        "connaissance_le": item.connaissance_le.isoformat() if item.connaissance_le else "",
        "observation_connaissance": item.observation_connaissance,
        "effectue_le": item.effectue_le.isoformat() if item.effectue_le else "",
        "reference_acte": item.reference_acte,
        "observation": item.observation,
        "depose_le": item.depose_le.isoformat(),
    }


def ligne_disposition(item: MiseADisposition) -> dict:
    aujourd_hui = timezone.localdate()
    etat = ""
    if item.statut == MiseADisposition.Statut.CONSTATEE:
        fin = item.date_fin
        etat = "a_venir" if item.date_debut > aujourd_hui else ("terminee" if fin and fin < aujourd_hui else "en_cours")
    return {
        "id": item.id,
        "agent": {"matricule": item.agent.matricule, "nom_complet": item.agent.nom_complet, "grade": item.agent.grade},
        "ministere_accueil": item.ministere_accueil,
        "structure_accueil": item.structure_accueil,
        "date_debut": item.date_debut.isoformat(),
        "date_fin": item.date_fin.isoformat() if item.date_fin else "",
        "motif": item.motif,
        "avis_url": _lien(item.avis_document),
        "avis_nom": Path(item.avis_document.name).name if item.avis_document else "",
        "statut": item.statut,
        "statut_libelle": item.get_statut_display(),
        "motif_decision": item.motif_decision,
        "decide_par": item.decide_par,
        "decide_le": item.decide_le.isoformat() if item.decide_le else "",
        "constate_le": item.constate_le.isoformat() if item.constate_le else "",
        "reference_acte": item.reference_acte,
        "observation": item.observation,
        "etat": etat,
        "etat_libelle": {"a_venir": "À venir", "en_cours": "En cours", "terminee": "Terminée", "": ""}[etat],
        "depose_le": item.depose_le.isoformat(),
    }


def _structures():
    return [
        {"id": e.id, "nom": e.nom, "niveau_libelle": e.get_niveau_display()}
        for e in EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).order_by("ordre", "nom")
    ]


# --- Espace de la DRH : le suivi de la dotation ---------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dotation(request):
    """Affectations, réaffectations, redéploiements et mises à disposition, tels que la DRH les suit."""
    if not _equipe_drh(request.user):
        return _refus_equipe()
    par_nom = structures_par_nom()
    mouvements = list(MouvementAgent.objects.select_related("agent", "structure", "structure_precedente", "emploi"))
    return Response({
        "affectations": [ligne_mouvement(m) for m in mouvements if m.type == MouvementAgent.Type.AFFECTATION],
        "reaffectations": [ligne_mouvement(m) for m in mouvements if m.type == MouvementAgent.Type.REAFFECTATION],
        "redeploiements": [ligne_redeploiement(r) for r in Redeploiement.objects.select_related("agent", "structure_origine", "structure_destination")],
        "dispositions": [ligne_disposition(d) for d in MiseADisposition.objects.select_related("agent")],
        "structures": _structures(),
        "agents": [
            {
                "matricule": a.matricule, "nom_complet": a.nom_complet,
                "structure": (structure_de(a, par_nom).nom if structure_de(a, par_nom) else a.structure),
                "affecte": structure_de(a, par_nom) is not None,
            }
            for a in Agent.objects.order_by("nom", "prenoms")
        ],
    })


def _lire_mouvement(request, type_mouvement: str, actuel: MouvementAgent | None = None):
    donnees = request.data
    if actuel is not None:
        agent = actuel.agent
    else:
        agent = Agent.objects.filter(matricule__iexact=str(donnees.get("matricule") or "").strip()).first()
        if agent is None:
            return None, "Choisissez l'agent."
    try:
        structure = EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).filter(pk=int(donnees.get("structure") or 0)).first()
    except (TypeError, ValueError):
        structure = None
    if structure is None:
        return None, "Choisissez la structure d'affectation."
    categorie = str(donnees.get("categorie") or MouvementAgent.Categorie.FONCTIONNAIRE)
    if categorie not in MouvementAgent.Categorie.values:
        return None, "Choisissez fonctionnaire ou contractuel."
    emploi = None
    if donnees.get("emploi"):
        emploi = EmploiReferentiel.objects.filter(code=str(donnees["emploi"])).first()
        if emploi is None:
            return None, "Cet emploi n'existe pas dans la nomenclature."
    effet = _date(donnees.get("date_effet"))
    if not effet:
        return None, "Indiquez la date d'effet."
    concours = " ".join(str(donnees.get("concours") or "").split())[:200]
    if type_mouvement == MouvementAgent.Type.REAFFECTATION and not concours:
        return None, "Indiquez le concours professionnel réussi."
    fichier, erreur = _fichier(request, "document", False)
    if erreur:
        return None, erreur
    return {
        "agent": agent, "structure": structure, "categorie": categorie, "emploi": emploi, "concours": concours, "date_effet": effet,
        "reference_acte": " ".join(str(donnees.get("reference_acte") or "").split())[:120],
        "observation": " ".join(str(donnees.get("observation") or "").split())[:240],
        "_fichier": fichier,
    }, None


def _etape_parcours(agent: Agent, type_etape: str, intitule: str, effet, acte: str, detail: str) -> EtapeParcours:
    return EtapeParcours.objects.create(agent=agent, type=type_etape, intitule=intitule[:200], date_effet=effet, reference_acte=acte, detail=detail[:300])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def creer_mouvement(request):
    """Affecte un nouvel agent, ou réaffecte un fonctionnaire après concours professionnel."""
    if not _equipe_drh(request.user):
        return _refus_equipe()
    type_mouvement = str(request.data.get("type") or "")
    if type_mouvement not in MouvementAgent.Type.values:
        return Response({"detail": "Choisissez affectation ou réaffectation."}, status=400)
    valeurs, erreur = _lire_mouvement(request, type_mouvement)
    if erreur:
        return Response({"detail": erreur}, status=400)
    fichier = valeurs.pop("_fichier")
    agent: Agent = valeurs["agent"]
    actuelle = structure_actuelle(agent)
    if type_mouvement == MouvementAgent.Type.AFFECTATION and actuelle is not None:
        return Response({"detail": f"{agent.nom_complet} est déjà rattaché à « {actuelle.nom} » : utilisez une réaffectation."}, status=409)
    precedente_nom = ""
    if type_mouvement == MouvementAgent.Type.REAFFECTATION:
        precedente_nom = actuelle.nom if actuelle else " ".join(str(request.data.get("precedente") or agent.structure or "").split())[:240]
        if actuelle is not None and actuelle.id == valeurs["structure"].id:
            return Response({"detail": "La nouvelle structure est celle où l'agent se trouve déjà."}, status=400)
        if not precedente_nom:
            return Response({"detail": "Indiquez la structure précédente de l'agent."}, status=400)
    with transaction.atomic():
        libelle = "Réaffectation après concours professionnel" if type_mouvement == MouvementAgent.Type.REAFFECTATION else "Affectation"
        detail = f"De {precedente_nom} vers {valeurs['structure'].nom}" if precedente_nom else f"Vers {valeurs['structure'].nom}"
        etape = _etape_parcours(agent, EtapeParcours.Type.MUTATION, f"{libelle} : {valeurs['structure'].nom}", valeurs["date_effet"], valeurs["reference_acte"], detail)
        item = MouvementAgent.objects.create(
            reference=_reference("MVT", MouvementAgent, timezone.localdate().year), type=type_mouvement,
            structure_precedente=actuelle, precedente_nom=precedente_nom, etape=etape, **valeurs,
        )
        if fichier is not None:
            item.document.save(Path(fichier.name).name, fichier, save=True)
        appliquer_rattachement(agent, valeurs["structure"])
        _notifier(_compte(agent), f"{libelle}", f"Vous êtes rattaché à {valeurs['structure'].nom} à compter du {valeurs['date_effet']:%d/%m/%Y}.", f"/app/agents/{agent.matricule}")
    return Response(ligne_mouvement(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def mouvement(request, pk: int):
    if not _equipe_drh(request.user):
        return _refus_equipe()
    item = get_object_or_404(MouvementAgent.objects.select_related("agent", "structure", "structure_precedente", "emploi", "etape"), pk=pk)
    agent = item.agent
    if request.method == "DELETE":
        with transaction.atomic():
            actuelle = structure_actuelle(agent)
            if actuelle is not None and actuelle.id == item.structure_id:
                appliquer_rattachement(agent, item.structure_precedente)
            if item.document:
                item.document.delete(save=False)
            if item.etape_id:
                item.etape.delete()
            item.delete()
        return Response(status=204)
    valeurs, erreur = _lire_mouvement(request, item.type, item)
    if erreur:
        return Response({"detail": erreur}, status=400)
    fichier = valeurs.pop("_fichier")
    valeurs.pop("agent")
    with transaction.atomic():
        ancienne = item.structure_id
        for cle, valeur in valeurs.items():
            setattr(item, cle, valeur)
        if fichier is not None:
            if item.document:
                item.document.delete(save=False)
            item.document = fichier
        item.save()
        if item.etape_id:
            etape = item.etape
            etape.intitule = f"{item.get_type_display()} : {item.structure.nom}"[:200]
            etape.date_effet, etape.reference_acte = item.date_effet, item.reference_acte
            etape.save(update_fields=["intitule", "date_effet", "reference_acte"])
        if ancienne != item.structure_id:
            appliquer_rattachement(agent, item.structure)
    return Response(ligne_mouvement(item))


# --- Redéploiement ------------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def effectuer_redeploiement(request, pk: int):
    """La DRH constate que l'agent a rejoint sa nouvelle structure : son rattachement change et il en est notifié."""
    if not _equipe_drh(request.user):
        return _refus_equipe()
    item = get_object_or_404(Redeploiement.objects.select_related("agent", "structure_origine", "structure_destination"), pk=pk)
    if item.statut == Redeploiement.Statut.EFFECTUE:
        return Response({"detail": "Ce redéploiement est déjà effectué."}, status=409)
    if item.statut != Redeploiement.Statut.CONNU:
        return Response({"detail": "La hiérarchie montante n'a pas encore pris connaissance de ce redéploiement."}, status=409)
    effet = _date(request.data.get("date_effet")) or timezone.localdate()
    if effet is False:
        return Response({"detail": "La date d'effet est invalide."}, status=400)
    acte = " ".join(str(request.data.get("reference_acte") or "").split())[:120]
    with transaction.atomic():
        agent = item.agent
        etape = _etape_parcours(agent, EtapeParcours.Type.MUTATION, f"Redéploiement : {item.structure_destination.nom}", effet, acte,
                                f"Pour besoin de service. {item.motif}")
        item.statut, item.effectue_le, item.date_effet, item.reference_acte, item.etape = Redeploiement.Statut.EFFECTUE, timezone.localdate(), effet, acte, etape
        item.observation = " ".join(str(request.data.get("observation") or item.observation).split())[:240]
        item.save()
        appliquer_rattachement(agent, item.structure_destination)
        _notifier(_compte(agent), "Redéploiement effectif", f"Vous êtes redéployé vers {item.structure_destination.nom} à compter du {effet:%d/%m/%Y}.", f"/app/agents/{agent.matricule}")
        _notifier(item.initiateur, "Redéploiement effectué", f"{agent.nom_complet} a rejoint {item.structure_destination.nom}.", "/app/agents")
    return Response(ligne_redeploiement(item))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def retirer_redeploiement(request, pk: int):
    if not _equipe_drh(request.user):
        return _refus_equipe()
    item = get_object_or_404(Redeploiement, pk=pk)
    if item.statut == Redeploiement.Statut.EFFECTUE:
        return Response({"detail": "Un redéploiement effectué fait partie du parcours de l'agent : il ne se retire pas."}, status=409)
    item.delete()
    return Response(status=204)


# --- Mises à disposition : constat et suivi par la DRH ---------------------------------------------


def _position_depuis(item: MiseADisposition) -> PositionAdministrative:
    valeurs = {
        "type": PositionAdministrative.Type.MISE_A_DISPOSITION,
        "structure_accueil": ", ".join(filter(None, [item.structure_accueil, item.ministere_accueil]))[:200],
        "motif": item.motif[:200], "date_debut": item.date_debut, "date_fin": item.date_fin, "reference_acte": item.reference_acte,
        "detail": item.observation[:300],
    }
    if item.position_id:
        for cle, valeur in valeurs.items():
            setattr(item.position, cle, valeur)
        item.position.save()
        return item.position
    return PositionAdministrative.objects.create(agent=item.agent, **valeurs)


@api_view(["POST", "PATCH"])
@permission_classes([IsAuthenticated])
def constater_disposition(request, pk: int):
    """Constat (POST) puis suivi (PATCH) de la mise à disposition : dates, acte et observation."""
    if not _equipe_drh(request.user):
        return _refus_equipe()
    item = get_object_or_404(MiseADisposition.objects.select_related("agent", "position"), pk=pk)
    constat = request.method == "POST"
    if constat and item.statut != MiseADisposition.Statut.ACCEPTEE:
        return Response({"detail": "Seule une mise à disposition acceptée par la hiérarchie se constate."}, status=409)
    if not constat and item.statut != MiseADisposition.Statut.CONSTATEE:
        return Response({"detail": "La mise à disposition n'est pas encore constatée."}, status=409)
    donnees = request.data
    debut = _date(donnees.get("date_debut")) if donnees.get("date_debut") else item.date_debut
    fin = _date(donnees.get("date_fin")) if "date_fin" in donnees else item.date_fin
    if debut is False or fin is False or not debut:
        return Response({"detail": "Les dates sont invalides."}, status=400)
    if fin and fin < debut:
        return Response({"detail": "La fin de la mise à disposition précède son début."}, status=400)
    with transaction.atomic():
        item.date_debut, item.date_fin = debut, fin
        item.reference_acte = " ".join(str(donnees.get("reference_acte", item.reference_acte) or "").split())[:120]
        item.observation = " ".join(str(donnees.get("observation", item.observation) or "").split())[:240]
        if constat:
            item.statut, item.constate_le = MiseADisposition.Statut.CONSTATEE, timezone.localdate()
        item.position = _position_depuis(item)
        item.save()
        synchroniser_situation(item.agent)
        if constat:
            if item.demande_id:
                demande = item.demande
                demande.etape, demande.echeance = "Clôturée : mise à disposition constatée par la DRH", f"Constatée le {item.constate_le:%d/%m/%Y}"
                demande.save(update_fields=["etape", "echeance"])
            _notifier(_compte(item.agent), "Mise à disposition constatée", f"La DRH a constaté votre mise à disposition auprès de {item.structure_accueil}.", f"/app/agents/{item.agent.matricule}?onglet=disposition")
    return Response(ligne_disposition(item))


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def retirer_disposition(request, pk: int):
    if not _equipe_drh(request.user):
        return _refus_equipe()
    item = get_object_or_404(MiseADisposition.objects.select_related("agent", "position"), pk=pk)
    with transaction.atomic():
        agent = item.agent
        if item.position_id:
            item.position.delete()
        if item.avis_document:
            item.avis_document.delete(save=False)
        if item.demande_id:
            item.demande.delete()
        item.delete()
        synchroniser_situation(agent)
    return Response(status=204)


# --- Espace mobilité : l'agent demande, sa hiérarchie décide ou déclenche ---------------------------------


def _subordonnes(user):
    """Les agents que le compte encadre (hors lui-même)."""
    from .visibilite import agents_visibles

    return agents_visibles(Agent.objects.exclude(matricule=user.username), user).order_by("nom", "prenoms")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mobilite(request):
    """Ce que voit chacun dans son profil : sa demande de mise à disposition, et ce que sa hiérarchie traite."""
    user = request.user
    moi = _agent_du_compte(user)
    mes = MiseADisposition.objects.filter(agent=moi).select_related("agent") if moi else MiseADisposition.objects.none()
    equipe = list(_subordonnes(user))
    matricules = {a.matricule for a in equipe}
    disp = MiseADisposition.objects.filter(agent__matricule__in=matricules).select_related("agent")
    redeployes = Redeploiement.objects.filter(agent__matricule__in=matricules).select_related("agent", "structure_origine", "structure_destination")
    # Prendre connaissance : les redéploiements déclenchés par un compte que je supervise.
    initiateurs = {a.matricule: a for a in equipe}
    a_connaitre = [
        r for r in Redeploiement.objects.filter(statut=Redeploiement.Statut.DECLENCHE).select_related("agent", "structure_origine", "structure_destination", "initiateur")
        if r.initiateur is not None and r.initiateur.username in initiateurs
    ]
    from .mutations import ligne as ligne_mutation
    from .models import Mutation

    mutations = Mutation.objects.select_related("agent", "demande", "structure_demandee", "demandeur")
    return Response({
        "agent": moi.matricule if moi else "",
        "mes_mutations": [ligne_mutation(m) for m in mutations.filter(agent=moi)] if moi else [],
        "mutations_equipe": [ligne_mutation(m) for m in mutations.filter(agent__matricule__in=matricules)],
        "mes_dispositions": [ligne_disposition(d) for d in mes],
        "hierarchie": bool(equipe),
        "dispositions_equipe": [ligne_disposition(d) for d in disp],
        "redeploiements_equipe": [ligne_redeploiement(r) for r in redeployes],
        "a_connaitre": [ligne_redeploiement(r) for r in a_connaitre],
        "agents": [{"matricule": a.matricule, "nom_complet": a.nom_complet, "structure": a.structure} for a in equipe],
        "structures": _structures(),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def demander_mutation(request):
    """L'agent demande sa mutation ; un responsable la demande pour un agent qu'il encadre."""
    from .mutations import deposer, ligne

    matricule = str(request.data.get("matricule") or "").strip()
    moi = _agent_du_compte(request.user)
    agent = Agent.objects.filter(matricule__iexact=matricule).first() if matricule else moi
    if agent is None:
        return Response({"detail": "Votre compte n'est pas rattaché à un dossier d'agent." if not matricule else "Agent introuvable."}, status=404 if matricule else 403)
    if agent != moi and not _superieur_de(request.user, agent):
        return Response({"detail": "Vous ne pouvez demander la mutation que de vous-même ou d'un agent que vous encadrez."}, status=403)
    souhaitee = _date(request.data.get("date_souhaitee"))
    if souhaitee is False:
        return Response({"detail": "La date souhaitée est invalide."}, status=400)
    try:
        structure = int(request.data.get("structure") or 0)
    except (TypeError, ValueError):
        structure = 0
    document, erreur = _fichier(request, "justificatif", False)
    if erreur:
        return Response({"detail": erreur}, status=400)
    item, erreur = deposer(request.user, agent, structure, str(request.data.get("motif") or ""), souhaitee, document)
    if erreur:
        return Response({"detail": erreur}, status=400)
    return Response(ligne(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def demander_disposition(request):
    """L'agent demande sa mise à disposition, avec l'avis favorable de la structure d'accueil."""
    agent = _agent_du_compte(request.user)
    if agent is None:
        return Response({"detail": "Votre compte n'est pas rattaché à un dossier d'agent."}, status=403)
    donnees = request.data
    structure = " ".join(str(donnees.get("structure_accueil") or "").split())[:200]
    if not structure:
        return Response({"detail": "Indiquez la structure d'accueil."}, status=400)
    debut = _date(donnees.get("date_debut"))
    fin = _date(donnees.get("date_fin"))
    if not debut or fin is False:
        return Response({"detail": "Indiquez une date de début valide."}, status=400)
    if fin and fin < debut:
        return Response({"detail": "La fin de la mise à disposition précède son début."}, status=400)
    avis, erreur = _fichier(request, "avis", True)
    if erreur:
        return Response({"detail": "L'avis favorable de la structure d'accueil est obligatoire : " + erreur.lower() if erreur.startswith("Le document est") else erreur}, status=400)
    if MiseADisposition.objects.filter(agent=agent, statut__in=[MiseADisposition.Statut.EN_ATTENTE, MiseADisposition.Statut.ACCEPTEE]).exists():
        return Response({"detail": "Une demande de mise à disposition est déjà en cours."}, status=409)
    aujourd_hui = timezone.localdate()
    with transaction.atomic():
        demande = Demande.objects.create(
            reference=_reference("MAD", Demande, aujourd_hui.year), agent=agent, nature="Mise à disposition", icone="swap_horiz",
            etape="En attente de la hiérarchie", responsable="Hiérarchie", echeance="À traiter", depose_le=aujourd_hui,
            categorie="mise-a-disposition", motif=str(donnees.get("motif") or "")[:240], debut=debut, fin=fin or None, destinataire=structure,
        )
        item = MiseADisposition.objects.create(
            agent=agent, demande=demande, ministere_accueil=" ".join(str(donnees.get("ministere_accueil") or "").split())[:200],
            structure_accueil=structure, date_debut=debut, date_fin=fin or None, motif=" ".join(str(donnees.get("motif") or "").split())[:240],
            avis_document=avis, depose_le=aujourd_hui,
        )
        chef = getattr(getattr(request.user, "profil", None), "superieur", None)
        _notifier(chef, "Mise à disposition à examiner", f"{agent.nom_complet} demande sa mise à disposition auprès de {structure}.", f"/app/agents/{chef.username}?onglet=disposition" if chef else "/app")
    return Response(ligne_disposition(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decider_disposition(request, pk: int):
    """La hiérarchie de l'agent accepte, ou rejette en motivant."""
    item = get_object_or_404(MiseADisposition.objects.select_related("agent", "demande"), pk=pk)
    if not _superieur_de(request.user, item.agent):
        return Response({"detail": "Seule la hiérarchie de l'agent décide."}, status=403)
    if item.statut != MiseADisposition.Statut.EN_ATTENTE:
        return Response({"detail": "Cette demande est déjà décidée."}, status=409)
    sens = request.data.get("sens")
    motif = " ".join(str(request.data.get("motif") or "").split())[:500]
    if sens not in {"accepter", "rejeter"}:
        return Response({"detail": "Choisissez accepter ou rejeter."}, status=400)
    if sens == "rejeter" and not motif:
        return Response({"detail": "Le rejet doit être motivé."}, status=400)
    accepte = sens == "accepter"
    with transaction.atomic():
        item.statut = MiseADisposition.Statut.ACCEPTEE if accepte else MiseADisposition.Statut.REJETEE
        item.motif_decision, item.decide_par, item.decide_le = motif, _nom(request.user), timezone.localdate()
        item.save()
        if item.demande_id:
            demande = item.demande
            demande.etape = "Acceptée par la hiérarchie : constat de la DRH attendu" if accepte else "Rejetée par la hiérarchie"
            demande.responsable, demande.echeance = ("DRH", "À constater") if accepte else (_nom(request.user), "Clôturée")
            demande.save(update_fields=["etape", "responsable", "echeance"])
        titre = "Mise à disposition acceptée" if accepte else "Mise à disposition rejetée"
        _notifier(_compte(item.agent), titre, (motif or "Votre hiérarchie a accepté votre demande, la DRH la constatera.")[:280], f"/app/agents/{item.agent.matricule}?onglet=disposition")
    return Response(ligne_disposition(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def declencher_redeploiement(request):
    """La hiérarchie envoie un agent dans une autre structure pour les besoins du service, en motivant."""
    agent = Agent.objects.filter(matricule__iexact=str(request.data.get("matricule") or "").strip()).first()
    if agent is None or not _superieur_de(request.user, agent):
        return Response({"detail": "Vous ne pouvez redéployer que les agents que vous encadrez."}, status=403)
    try:
        destination = EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).filter(pk=int(request.data.get("structure") or 0)).first()
    except (TypeError, ValueError):
        destination = None
    if destination is None:
        return Response({"detail": "Choisissez la structure de destination."}, status=400)
    motif = " ".join(str(request.data.get("motif") or "").split())[:500]
    if not motif:
        return Response({"detail": "Le redéploiement doit être motivé par le besoin du service."}, status=400)
    actuelle = structure_actuelle(agent)
    if actuelle is not None and actuelle.id == destination.id:
        return Response({"detail": "L'agent se trouve déjà dans cette structure."}, status=400)
    if Redeploiement.objects.filter(agent=agent).exclude(statut=Redeploiement.Statut.EFFECTUE).exists():
        return Response({"detail": "Un redéploiement est déjà en cours pour cet agent."}, status=409)
    effet = _date(request.data.get("date_effet"))
    if effet is False:
        return Response({"detail": "La date d'effet prévue est invalide."}, status=400)
    aujourd_hui = timezone.localdate()
    with transaction.atomic():
        item = Redeploiement.objects.create(
            reference=_reference("RED", Redeploiement, aujourd_hui.year), agent=agent, initiateur=request.user, initiateur_nom=_nom(request.user),
            structure_origine=actuelle, origine_nom="" if actuelle else agent.structure, structure_destination=destination, motif=motif,
            date_effet=effet, depose_le=aujourd_hui,
        )
        _notifier(_compte(agent), "Redéploiement engagé", f"Votre hiérarchie engage votre redéploiement vers {destination.nom} : {motif}", f"/app/agents/{agent.matricule}?onglet=disposition")
        chef = getattr(getattr(request.user, "profil", None), "superieur", None)
        _notifier(chef, "Redéploiement à prendre en connaissance", f"{agent.nom_complet} est redéployé vers {destination.nom} : {motif}", f"/app/agents/{chef.username}?onglet=disposition" if chef else "/app")
    return Response(ligne_redeploiement(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def connaitre_redeploiement(request, pk: int):
    """La hiérarchie montante prend connaissance du redéploiement décidé par un de ses subordonnés."""
    item = get_object_or_404(Redeploiement.objects.select_related("agent", "structure_origine", "structure_destination", "initiateur"), pk=pk)
    initiateur = _agent_du_compte(item.initiateur) if item.initiateur_id else None
    if initiateur is None or not _superieur_de(request.user, initiateur):
        return Response({"detail": "Seule la hiérarchie de celui qui a déclenché le redéploiement en prend connaissance."}, status=403)
    if item.statut != Redeploiement.Statut.DECLENCHE:
        return Response({"detail": "Ce redéploiement a déjà été pris en connaissance."}, status=409)
    item.statut, item.connaissance_par, item.connaissance_le = Redeploiement.Statut.CONNU, _nom(request.user), timezone.localdate()
    item.observation_connaissance = " ".join(str(request.data.get("observation") or "").split())[:240]
    item.save()
    return Response(ligne_redeploiement(item))
