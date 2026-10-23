"""Traitements longs en arrière-plan (Celery), suivis depuis l'écran de celui qui les a lancés.

Une vue décorée par `@en_arriere_plan("Libellé")` répond comme avant tant qu'aucun worker Celery n'est disponible
(développement, tests, panne de Redis) : le traitement se fait alors dans la requête, sans rien changer pour l'appelant.
Quand un worker répond, la requête est enregistrée (méthode, paramètres, fichiers reçus), confiée au worker, et la vue
répond 202 avec l'identifiant de la tâche. Le worker rejoue la vue avec cette requête et garde sa réponse : corps
JSON, ou fichier produit. Le front attend la fin (api() et telecharger() le font seuls) et affiche un indicateur.

Une vue longue peut annoncer son avancement avec `progresser(pourcentage, message)`.
"""

import contextvars
import functools
import json
import logging
import time
from datetime import timedelta
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.utils.encoders import JSONEncoder

from .models import TacheFond

logger = logging.getLogger(__name__)

REGISTRE: dict[str, object] = {}
COURANTE: contextvars.ContextVar[str | None] = contextvars.ContextVar("tache_courante", default=None)
VALIDITE_WORKER_S = 20
_sonde = {"quand": 0.0, "ok": False}
TAILLE_MAX_FICHIER = 25 * 1024 * 1024
CONSERVATION_H = 24


def worker_disponible() -> bool:
    """Vrai si un broker est configuré et qu'un worker répond (résultat gardé quelques secondes : le ping coûte)."""
    if not (getattr(settings, "CELERY_BROKER_URL", "") or "").strip():
        return False
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return True
    maintenant = time.monotonic()
    if maintenant - _sonde["quand"] < VALIDITE_WORKER_S:
        return _sonde["ok"]
    try:
        from config.celery import app

        reponse = app.control.inspect(timeout=1.0).ping()
        _sonde["ok"] = bool(reponse)
    except Exception:
        logger.debug("Ping Celery indisponible", exc_info=True)
        _sonde["ok"] = False
    _sonde["quand"] = maintenant
    return _sonde["ok"]


def en_arriere_plan(libelle: str):
    """Confie la vue à Celery quand c'est possible ; sinon elle s'exécute dans la requête, comme avant."""

    def decorateur(vue):
        nom = f"{vue.__module__}.{vue.__qualname__}"
        REGISTRE[nom] = vue

        @functools.wraps(vue)
        def enveloppe(request, *args, **kwargs):
            if request.headers.get("X-Sans-Fond") == "1" or not worker_disponible():
                return vue(request, *args, **kwargs)
            tache = _creer(request, nom, libelle, kwargs)
            executer_vue.delay(str(tache.id))
            return Response({"tache": str(tache.id), "libelle": libelle}, status=202)

        return enveloppe

    return decorateur


def _creer(request, nom: str, libelle: str, kwargs: dict) -> TacheFond:
    """Enregistre la requête pour que le worker la rejoue : paramètres, corps et fichiers reçus."""
    donnees = request.data
    champs = {cle: donnees.getlist(cle) if hasattr(donnees, "getlist") else donnees[cle] for cle in donnees}
    tache = TacheFond.objects.create(utilisateur=request.user, libelle=libelle, vue=nom, requete={})
    fichiers = []
    for cle in request.FILES:
        for fichier in request.FILES.getlist(cle):
            chemin = default_storage.save(f"taches/entrees/{tache.id}/{Path(fichier.name).name}", fichier)
            fichiers.append({"champ": cle, "nom": fichier.name, "chemin": chemin, "type": fichier.content_type or ""})
    tache.requete = {
        "methode": request.method,
        "chemin": request.path,
        "requete": {cle: request.query_params.getlist(cle) for cle in request.query_params},
        "champs": {cle: valeur for cle, valeur in champs.items() if cle not in request.FILES},
        "json": request.content_type is not None and "json" in request.content_type,
        "fichiers": fichiers,
        "kwargs": kwargs,
    }
    tache.save(update_fields=["requete"])
    return tache


def progresser(pourcentage: int, message: str = "") -> None:
    """Annonce l'avancement de la tâche en cours (sans effet hors d'une tâche de fond)."""
    identifiant = COURANTE.get()
    if not identifiant:
        return
    # Dans le cache et non en base : la vue écrit souvent dans une transaction que personne d'autre ne voit avant sa fin.
    cache.set(f"tache:{identifiant}", (max(0, min(int(pourcentage), 99)), message[:240]), 3600)


def _requete_rejouee(tache: TacheFond) -> Request:
    spec = tache.requete
    fabrique = APIRequestFactory()
    methode = spec["methode"].lower()
    if methode == "get":
        brut = fabrique.get(spec["chemin"], spec["requete"])
    elif spec["json"] and not spec["fichiers"]:
        brut = getattr(fabrique, methode)(spec["chemin"], spec["champs"], format="json")
    else:
        corps = dict(spec["champs"])
        for fichier in spec["fichiers"]:
            with default_storage.open(fichier["chemin"], "rb") as source:
                corps[fichier["champ"]] = SimpleUploadedFile(fichier["nom"], source.read(), content_type=fichier["type"] or "application/octet-stream")
        brut = getattr(fabrique, methode)(spec["chemin"], corps, format="multipart")
    brut.user = tache.utilisateur
    requete = Request(brut, parsers=[p() for p in _parseurs()])
    requete.user = tache.utilisateur
    return requete


def _parseurs():
    from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

    return [JSONParser, MultiPartParser, FormParser]


def _enregistrer_reponse(tache: TacheFond, reponse) -> None:
    code = getattr(reponse, "status_code", 200)
    tache.code_http = code
    if isinstance(reponse, Response):
        tache.resultat = json.loads(json.dumps(reponse.data, cls=JSONEncoder))
    elif isinstance(reponse, FileResponse) or getattr(reponse, "streaming", False):
        _garder_fichier(tache, b"".join(reponse.streaming_content), reponse)
    elif isinstance(reponse, HttpResponse):
        type_contenu = reponse.get("Content-Type", "")
        if "json" in type_contenu:
            tache.resultat = json.loads(reponse.content.decode("utf-8") or "null")
        else:
            _garder_fichier(tache, reponse.content, reponse)
    if code >= 400:
        detail = (tache.resultat or {}).get("detail") if isinstance(tache.resultat, dict) else None
        tache.statut = TacheFond.Statut.ECHEC
        tache.message = str(detail or "Le traitement a échoué.")[:240]
    else:
        tache.statut = TacheFond.Statut.TERMINEE
        tache.message = "Terminé"
        tache.progression = 100


def _garder_fichier(tache: TacheFond, contenu: bytes, reponse) -> None:
    disposition = reponse.get("Content-Disposition", "")
    nom = ""
    if 'filename="' in disposition:
        nom = disposition.split('filename="', 1)[1].split('"', 1)[0]
    tache.nom_fichier = nom or f"{tache.id}.bin"
    tache.type_contenu = reponse.get("Content-Type", "application/octet-stream")
    tache.fichier.save(Path(tache.nom_fichier).name, ContentFile(contenu), save=False)


@shared_task(name="personnel.executer_vue", ignore_result=True, soft_time_limit=1800, time_limit=2000)
def executer_vue(identifiant: str) -> None:
    """Rejoue la vue d'une tâche de fond avec la requête enregistrée, et garde sa réponse."""
    # Le worker ne charge pas les routes : l'import de personnel.urls enregistre toutes les vues de fond.
    import personnel.urls  # noqa: F401

    tache = TacheFond.objects.select_related("utilisateur", "utilisateur__profil").get(pk=identifiant)
    tache.statut = TacheFond.Statut.EN_COURS
    tache.save(update_fields=["statut"])
    jeton = COURANTE.set(identifiant)
    try:
        vue = REGISTRE.get(tache.vue)
        if vue is None:
            raise LookupError(f"Vue inconnue : {tache.vue}")
        reponse = vue(_requete_rejouee(tache), **tache.requete.get("kwargs", {}))
        _enregistrer_reponse(tache, reponse)
    except Exception as exc:  # noqa: BLE001 : toute erreur de la vue est rendue à celui qui l'a lancée
        logger.exception("Tâche %s en échec", identifiant)
        tache.statut = TacheFond.Statut.ECHEC
        tache.message = f"Le traitement a échoué : {exc}"[:240]
        tache.code_http = 500
    finally:
        COURANTE.reset(jeton)
        _supprimer_entrees(tache)
        tache.termine_le = timezone.now()
        tache.save()
        _prevenir(tache)


def _supprimer_entrees(tache: TacheFond) -> None:
    for fichier in tache.requete.get("fichiers", []):
        try:
            default_storage.delete(fichier["chemin"])
        except OSError:
            logger.debug("Fichier d'entrée déjà supprimé", exc_info=True)


def _prevenir(tache: TacheFond) -> None:
    from .temps_reel import diffuser

    diffuser([tache.utilisateur_id], {"type": "tache.maj", "id": str(tache.id), "statut": tache.statut})


@shared_task(name="personnel.purger_taches", ignore_result=True)
def purger_taches() -> int:
    """Supprime les tâches terminées depuis plus de 24 h, avec leur fichier : le disque ne doit pas se remplir."""
    limite = timezone.now() - timedelta(hours=CONSERVATION_H)
    anciennes = TacheFond.objects.filter(cree_le__lt=limite).exclude(statut__in=[TacheFond.Statut.ATTENTE, TacheFond.Statut.EN_COURS])
    total = 0
    for tache in anciennes:
        if tache.fichier:
            tache.fichier.delete(save=False)
        tache.delete()
        total += 1
    return total


# --- Suivi par celui qui a lancé la tâche -------------------------------------------------------


def _ligne(tache: TacheFond, avec_resultat: bool = False) -> dict:
    progression, message = tache.progression, tache.message
    if tache.statut in {TacheFond.Statut.ATTENTE, TacheFond.Statut.EN_COURS}:
        avance = cache.get(f"tache:{tache.id}")
        if avance:
            progression, message = avance
    ligne = {
        "id": str(tache.id),
        "libelle": tache.libelle,
        "statut": tache.statut,
        "progression": progression,
        "message": message,
        "code": tache.code_http,
        "fichier": bool(tache.fichier),
        "nom_fichier": tache.nom_fichier,
        "cree_le": tache.cree_le.isoformat(),
    }
    if avec_resultat:
        ligne["resultat"] = tache.resultat
    return ligne


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mes_taches(request):
    """Mes tâches en cours et celles terminées depuis moins de 24 h."""
    limite = timezone.now() - timedelta(hours=CONSERVATION_H)
    taches = TacheFond.objects.filter(utilisateur=request.user, cree_le__gte=limite)[:30]
    return Response({"taches": [_ligne(tache) for tache in taches]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def tache(request, identifiant):
    tache = get_object_or_404(TacheFond, pk=identifiant, utilisateur=request.user)
    return Response(_ligne(tache, avec_resultat=True))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def fichier_tache(request, identifiant):
    tache = get_object_or_404(TacheFond, pk=identifiant, utilisateur=request.user)
    if not tache.fichier:
        return Response({"detail": "Cette tâche n'a produit aucun fichier."}, status=409)
    reponse = FileResponse(tache.fichier.open("rb"), content_type=tache.type_contenu or "application/octet-stream")
    reponse["Content-Disposition"] = f'attachment; filename="{tache.nom_fichier}"'
    return reponse
