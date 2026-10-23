"""Expression des besoins : un appel est lancé aux responsables de structure, qui répondent depuis leur profil.

Chaque responsable exprime les fonctionnaires et les contractuels dont sa structure a besoin. Les réponses sont ensuite
centralisées : le service remonte à la sous-direction, qui remonte à la direction.
"""

from collections import defaultdict
from datetime import date

from django.contrib.auth.models import User
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .taches import en_arriere_plan
from .effectifs import _reference
from .models import CampagneBesoin, EmploiReferentiel, EntiteTutelle, FicheBesoin, Notification, Profil
from .roles import ROLES_SIMPLES
from .rattachement import structures_reglables

PLAFOND_AGENTS = 500


# --- Qui est qui -----------------------------------------------------------------------------


def _structures_du_responsable(user) -> list[EntiteTutelle]:
    """Les structures dont le compte est responsable (titulaire ou intérimaire)."""
    profil = getattr(user, "profil", None)
    if profil is not None and profil.administrateur:
        # Le compte administrateur tient toutes les structures : il peut exprimer un besoin pour n'importe laquelle.
        return list(EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).order_by("ordre", "nom"))
    if profil is None or profil.role in ROLES_SIMPLES:
        return []
    retenues: dict[int, EntiteTutelle] = {}
    for structure in (profil.structure, profil.interim):
        if structure is not None and structure.niveau != EntiteTutelle.Niveau.MINISTERE:
            retenues[structure.id] = structure
    return list(retenues.values())


def _est_pilote(user) -> bool:
    """Le DRH et l'administrateur lancent l'appel et voient toute la centralisation."""
    return structures_reglables(user) is None


def _responsables() -> dict[int, User]:
    """Un responsable par structure : le titulaire d'abord, à défaut l'intérimaire."""
    resultat: dict[int, User] = {}
    profils = Profil.objects.select_related("user", "structure", "interim").exclude(role__in=ROLES_SIMPLES)
    for profil in profils:
        if profil.structure_id and profil.structure_id not in resultat:
            resultat[profil.structure_id] = profil.user
    for profil in profils:
        if profil.interim_id and profil.interim_id not in resultat:
            resultat[profil.interim_id] = profil.user
    return resultat


def _nom(user: User | None) -> str:
    return (user.get_full_name() or user.username) if user else ""


def _campagne() -> CampagneBesoin | None:
    return CampagneBesoin.objects.order_by("-exercice").first()


def _ligne_campagne(campagne: CampagneBesoin | None) -> dict | None:
    if campagne is None:
        return None
    aujourd_hui = timezone.localdate()
    depassee = bool(campagne.limite and aujourd_hui > campagne.limite)
    return {
        "exercice": campagne.exercice,
        "ouverte": campagne.ouverte and not depassee,
        "cloturee": not campagne.ouverte,
        "limite_depassee": campagne.ouverte and depassee,
        "cadrage": campagne.cadrage,
        "ouverte_le": campagne.ouverte_le.isoformat() if campagne.ouverte_le else None,
        "limite": campagne.limite.isoformat() if campagne.limite else None,
    }


# --- Centralisation ---------------------------------------------------------------------------


def _chemin(structure: EntiteTutelle, par_id: dict[int, EntiteTutelle]) -> list[str]:
    chemin, courant, vus = [], structure, set()
    while courant is not None and courant.id not in vus and courant.niveau != EntiteTutelle.Niveau.MINISTERE:
        vus.add(courant.id)
        chemin.append(courant.nom)
        courant = par_id.get(courant.parent_id)
    return list(reversed(chemin))


def _ligne_fiche(item: FicheBesoin, par_id: dict[int, EntiteTutelle]) -> dict:
    moment = timezone.localtime(item.depose_le)
    return {
        "reference": item.reference,
        "entite": {"id": item.entite_id, "nom": item.entite.nom},
        "chemin": _chemin(item.entite, par_id),
        "emploi": {"code": item.emploi.code, "libelle": item.emploi.libelle} if item.emploi_id else {"code": "", "libelle": item.profil},
        "profil": item.profil,
        "grade": item.grade,
        "motif": item.motif,
        "fonctionnaires": item.fonctionnaires,
        "contractuels": item.contractuels,
        "volume": item.volume,
        "auteur": _nom(item.auteur),
        "depose_le": moment.date().isoformat(),
    }


def _arbre(visibles: set[int] | None, fiches: list[FicheBesoin], responsables: dict[int, User], racines_forcees: list[int] | None = None):
    """Les structures avec leurs réponses propres et cumulées (service, sous-direction, direction)."""
    entites = list(EntiteTutelle.objects.exclude(niveau=EntiteTutelle.Niveau.MINISTERE).order_by("ordre", "nom"))
    par_id = {e.id: e for e in entites}
    enfants: dict[int | None, list[EntiteTutelle]] = defaultdict(list)
    for e in entites:
        enfants[e.parent_id if e.parent_id in par_id else None].append(e)
    propres: dict[int, list[FicheBesoin]] = defaultdict(list)
    for fiche in fiches:
        propres[fiche.entite_id].append(fiche)

    def noeud(e: EntiteTutelle) -> dict:
        sous = [noeud(c) for c in enfants.get(e.id, [])]
        mes = propres.get(e.id, [])
        f, c = sum(x.fonctionnaires for x in mes), sum(x.contractuels for x in mes)
        cumul_f = f + sum(s["cumul"]["fonctionnaires"] for s in sous)
        cumul_c = c + sum(s["cumul"]["contractuels"] for s in sous)
        responsable = responsables.get(e.id)
        return {
            "id": e.id,
            "nom": e.nom,
            "niveau": e.niveau,
            "niveau_libelle": e.get_niveau_display(),
            "responsable": _nom(responsable),
            "a_un_responsable": responsable is not None,
            "repond": bool(mes),
            "fiches": len(mes),
            "lignes": [
                {
                    "reference": x.reference,
                    "emploi": x.emploi.libelle if x.emploi_id else x.profil,
                    "emploi_code": x.emploi.code if x.emploi_id else "",
                    "grade": x.grade,
                    "motif": x.motif,
                    "fonctionnaires": x.fonctionnaires,
                    "contractuels": x.contractuels,
                    "auteur": _nom(x.auteur),
                    "depose_le": timezone.localtime(x.depose_le).date().isoformat(),
                }
                for x in sorted(mes, key=lambda f: f.profil)
            ],
            "propre": {"fonctionnaires": f, "contractuels": c, "total": f + c},
            "cumul": {"fonctionnaires": cumul_f, "contractuels": cumul_c, "total": cumul_f + cumul_c},
            "enfants": sous,
        }

    if racines_forcees is not None:
        racines = [par_id[i] for i in racines_forcees if i in par_id]
    elif visibles is None:
        racines = enfants.get(None, [])
    else:
        racines = [e for e in entites if e.id in visibles and (e.parent_id not in visibles)]
    return [noeud(e) for e in racines], par_id


def _par_emploi(fiches: list[FicheBesoin]) -> list[dict]:
    """Les besoins regroupés par emploi : combien de fonctionnaires et de contractuels, demandés par combien de structures."""
    regroupe: dict[str, dict] = {}
    for fiche in fiches:
        cle = fiche.emploi.code if fiche.emploi_id else fiche.profil
        ligne = regroupe.setdefault(cle, {
            "code": fiche.emploi.code if fiche.emploi_id else "", "libelle": fiche.emploi.libelle if fiche.emploi_id else fiche.profil,
            "grade": fiche.grade, "fonctionnaires": 0, "contractuels": 0, "total": 0, "structures": set(),
        })
        ligne["fonctionnaires"] += fiche.fonctionnaires
        ligne["contractuels"] += fiche.contractuels
        ligne["total"] += fiche.volume
        ligne["structures"].add(fiche.entite_id)
    lignes = [{**ligne, "structures": len(ligne["structures"])} for ligne in regroupe.values()]
    return sorted(lignes, key=lambda ligne: (-ligne["total"], ligne["libelle"]))


def _a_plat(arbre: list[dict]):
    for n in arbre:
        yield n
        yield from _a_plat(n["enfants"])


def _totaux(arbre: list[dict]) -> dict:
    noeuds = list(_a_plat(arbre))
    avec_responsable = [n for n in noeuds if n["a_un_responsable"]]
    f = sum(n["cumul"]["fonctionnaires"] for n in arbre)
    c = sum(n["cumul"]["contractuels"] for n in arbre)
    return {
        "structures": len(avec_responsable),
        "reponses": sum(1 for n in avec_responsable if n["repond"]),
        "fonctionnaires": f,
        "contractuels": c,
        "volume": f + c,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def centralisation(request):
    """Les réponses regroupées par service, sous-direction et direction, dans le périmètre de la personne connectée."""
    campagne = _campagne()
    visibles = structures_reglables(request.user)
    fiches = list(FicheBesoin.objects.filter(campagne=campagne).select_related("entite", "auteur", "emploi")) if campagne else []
    if visibles is not None:
        fiches = [f for f in fiches if f.entite_id in visibles]
    arbre, par_id = _arbre(visibles, fiches, _responsables())
    return Response({
        "campagne": _ligne_campagne(campagne),
        "peut_lancer": _est_pilote(request.user),
        "totaux": _totaux(arbre),
        "arbre": arbre,
        "emplois": _par_emploi(fiches),
        "fiches": [_ligne_fiche(f, par_id) for f in fiches],
    })


# --- L'appel ------------------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def lancer_campagne(request):
    """Lance (ou rouvre) l'appel : chaque responsable de structure en est prévenu."""
    if not _est_pilote(request.user):
        return Response({"detail": "Seule la direction des ressources humaines lance l'appel."}, status=403)
    donnees = request.data
    aujourd_hui = timezone.localdate()
    try:
        exercice = int(donnees.get("exercice") or aujourd_hui.year)
    except (TypeError, ValueError):
        return Response({"detail": "L'exercice est invalide."}, status=400)
    if not 2000 <= exercice <= 2100:
        return Response({"detail": "L'exercice est invalide."}, status=400)
    limite = None
    if donnees.get("limite"):
        try:
            limite = date.fromisoformat(str(donnees["limite"])[:10])
        except ValueError:
            return Response({"detail": "La date limite est invalide."}, status=400)
        if limite < aujourd_hui:
            return Response({"detail": "La date limite est déjà passée."}, status=400)
    cadrage = " ".join(str(donnees.get("cadrage") or "").split())[:240]
    with transaction.atomic():
        CampagneBesoin.objects.exclude(exercice=exercice).update(ouverte=False)
        campagne, _ = CampagneBesoin.objects.update_or_create(
            exercice=exercice,
            defaults={"ouverte": True, "cadrage": cadrage, "limite": limite, "ouverte_le": aujourd_hui},
        )
        responsables = _responsables()
        destinataires = {u.pk: u for u in responsables.values()}
        mention = f" Réponse attendue avant le {limite:%d/%m/%Y}." if limite else ""
        maintenant = timezone.now()
        Notification.objects.bulk_create([
            Notification(
                destinataire=user, categorie=Notification.Categorie.SYSTEME,
                titre=f"Expression des besoins {exercice}",
                message=f"Indiquez les fonctionnaires et contractuels dont votre structure a besoin.{mention}"[:280],
                lien=f"/app/agents/{user.username}?onglet=besoins", urgente=True, creee_le=maintenant,
            )
            for user in destinataires.values()
        ])
    return Response({
        "campagne": _ligne_campagne(campagne),
        "prevenus": len(destinataires),
        "alerte": "" if destinataires else "Aucun responsable de structure n'est désigné : personne n'a reçu l'appel. Nommez-les dans Utilisateurs.",
    }, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cloturer_campagne(request):
    if not _est_pilote(request.user):
        return Response({"detail": "Seule la direction des ressources humaines clôture l'appel."}, status=403)
    campagne = _campagne()
    if campagne is None or not campagne.ouverte:
        return Response({"detail": "Aucun appel n'est ouvert."}, status=409)
    campagne.ouverte = False
    campagne.save(update_fields=["ouverte"])
    return Response({"campagne": _ligne_campagne(campagne)})


# --- Saisie par le responsable, depuis son profil -------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mes_fiches(request):
    """Ce que voit un responsable de structure dans son profil : l'appel, ses réponses et la remontée de ses structures."""
    structures = _structures_du_responsable(request.user)
    if not structures:
        return Response({"responsable": False})
    # Par défaut la campagne la plus récente ; ?exercice=AAAA consulte un exercice passé (lecture seule : la campagne est close).
    exercices = list(CampagneBesoin.objects.order_by("-exercice").values_list("exercice", flat=True))
    campagne = _campagne()
    demande = str(request.query_params.get("exercice") or "")
    if demande.isdigit() and int(demande) in exercices:
        campagne = CampagneBesoin.objects.get(exercice=int(demande))
    ids = {s.id for s in structures}
    from .rattachement import structures_sous

    perimetre = structures_sous(structures)
    fiches = list(FicheBesoin.objects.filter(campagne=campagne, entite_id__in=perimetre).select_related("entite", "auteur", "emploi")) if campagne else []
    # Racines de l'arbre : les structures dont le parent n'est pas lui-même dans la liste (évite les doublons).
    racines = [s.id for s in structures if s.parent_id not in ids]
    arbre, par_id = _arbre(perimetre, fiches, _responsables(), racines_forcees=racines)
    propres = [f for f in fiches if f.entite_id in ids]
    return Response({
        "responsable": True,
        "exercices": exercices,
        "structures": [{"id": s.id, "nom": s.nom, "niveau_libelle": s.get_niveau_display()} for s in structures],
        "campagne": _ligne_campagne(campagne),
        "fiches": [_ligne_fiche(f, par_id) for f in propres],
        "arbre": arbre,
        "emplois": _par_emploi(fiches),
        "totaux": _totaux(arbre),
    })


def _ouverte(campagne: CampagneBesoin | None):
    if campagne is None or not campagne.ouverte:
        return Response({"detail": "Aucun appel n'est ouvert : les besoins ne peuvent plus être modifiés."}, status=409)
    if campagne.limite and timezone.localdate() > campagne.limite:
        return Response({"detail": "La date limite de réponse est dépassée."}, status=409)
    return None


def _nombre(donnees, cle: str, libelle: str):
    try:
        valeur = int(donnees.get(cle) if donnees.get(cle) not in (None, "") else 0)
    except (TypeError, ValueError):
        return None, Response({"detail": f"{libelle} : indiquez un nombre."}, status=400)
    if not 0 <= valeur <= PLAFOND_AGENTS:
        return None, Response({"detail": f"{libelle} : de 0 à {PLAFOND_AGENTS}."}, status=400)
    return valeur, None


def _lire(donnees, structures: list[EntiteTutelle], actuelle: FicheBesoin | None = None):
    emploi = EmploiReferentiel.objects.select_related("grade").filter(code=str(donnees.get("emploi") or "")).first()
    if emploi is None:
        return Response({"detail": "Choisissez l'emploi demandé dans la nomenclature."}, status=400)
    fonctionnaires, erreur = _nombre(donnees, "fonctionnaires", "Fonctionnaires")
    if erreur:
        return erreur
    contractuels, erreur = _nombre(donnees, "contractuels", "Contractuels")
    if erreur:
        return erreur
    if fonctionnaires + contractuels < 1:
        return Response({"detail": "Demandez au moins un fonctionnaire ou un contractuel."}, status=400)
    if actuelle is not None:
        structure = actuelle.entite
    else:
        try:
            identifiant = int(donnees.get("structure") or (structures[0].id if len(structures) == 1 else 0))
        except (TypeError, ValueError):
            identifiant = 0
        structure = next((s for s in structures if s.id == identifiant), None)
        if structure is None:
            return Response({"detail": "Choisissez la structure dont vous êtes responsable."}, status=400)
    existant = FicheBesoin.objects.filter(campagne=actuelle.campagne if actuelle is not None else _campagne(), entite=structure, emploi=emploi)
    if actuelle is not None:
        existant = existant.exclude(pk=actuelle.pk)
    if existant.exists():
        return Response({"detail": "Cet emploi est déjà demandé par la structure : modifiez le besoin existant."}, status=409)
    return {
        "entite": structure,
        "emploi": emploi,
        "profil": emploi.libelle[:200],
        "grade": emploi.grade.code[:40],
        "motif": " ".join(str(donnees.get("motif") or "").split())[:240],
        "fonctionnaires": fonctionnaires,
        "contractuels": contractuels,
        "volume": fonctionnaires + contractuels,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_fiche(request):
    structures = _structures_du_responsable(request.user)
    if not structures:
        return Response({"detail": "Seul un responsable de structure exprime des besoins."}, status=403)
    campagne = _campagne()
    refus = _ouverte(campagne)
    if refus:
        return refus
    valeurs = _lire(request.data, structures)
    if isinstance(valeurs, Response):
        return valeurs
    with transaction.atomic():
        item = FicheBesoin.objects.create(
            reference=_reference("BES", FicheBesoin, campagne.exercice), campagne=campagne, auteur=request.user,
            depose_le=timezone.now(), **valeurs,
        )
    par_id = {e.id: e for e in EntiteTutelle.objects.all()}
    return Response(_ligne_fiche(item, par_id), status=201)


def _prevenir_auteur(acteur, item: FicheBesoin, verbe: str) -> None:
    """Quand le DRH corrige un besoin après l'appel, le responsable qui l'avait saisi en est informé."""
    if item.auteur_id is None or item.auteur_id == acteur.pk:
        return
    Notification.objects.create(
        destinataire=item.auteur, categorie=Notification.Categorie.SYSTEME,
        titre="Besoin corrigé par la DRH" if verbe == "modifié" else "Besoin retiré par la DRH",
        message=f"{item.profil} ({item.entite.nom}) a été {verbe}."[:280],
        lien=f"/app/agents/{item.auteur.username}?onglet=besoins", creee_le=timezone.now(),
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def fiche(request, reference: str):
    """Modifier ou retirer un besoin. Le responsable le fait tant que l'appel est ouvert ; le DRH, seul, le fait ensuite."""
    structures = _structures_du_responsable(request.user)
    pilote = _est_pilote(request.user)
    item = get_object_or_404(FicheBesoin.objects.select_related("entite", "auteur", "campagne", "emploi"), reference=reference)
    if not pilote:
        if item.entite_id not in {s.id for s in structures}:
            return Response({"detail": "Cette fiche appartient à une autre structure."}, status=404)
        refus = _ouverte(item.campagne)
        if refus:
            return refus
    if request.method == "DELETE":
        _prevenir_auteur(request.user, item, "retiré")
        item.delete()
        return Response(status=204)
    valeurs = _lire(request.data, structures, item)
    if isinstance(valeurs, Response):
        return valeurs
    for cle, valeur in valeurs.items():
        setattr(item, cle, valeur)
    item.save()
    _prevenir_auteur(request.user, item, "modifié")
    par_id = {e.id: e for e in EntiteTutelle.objects.all()}
    return Response(_ligne_fiche(item, par_id))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@en_arriere_plan("Export des besoins")
def exporter(request):
    """Plan des besoins en PDF, dans le périmètre de la personne connectée."""
    from .rapports.documents import rendre_plan_besoins

    campagne = _campagne()
    visibles = structures_reglables(request.user)
    fiches = list(FicheBesoin.objects.filter(campagne=campagne).select_related("entite")) if campagne else []
    if visibles is not None:
        fiches = [f for f in fiches if f.entite_id in visibles]
    reponse = HttpResponse(rendre_plan_besoins(fiches), content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="plan-besoins-{timezone.localdate().isoformat()}.pdf"'
    return reponse
