"""Prise en charge des actions saisies hors ligne, rejouées au retour de la connexion.

Deux garanties, une pour chaque risque d'un rejeu :

- **Date de saisie** : l'en-tête `X-Saisi-Le` (instant où l'utilisateur a validé son action, sur son appareil) devient la date
  qui fait foi. `aujourdhui()` la rend aux règles métier (échéances, contrôles de période) à la place de la date du serveur.
- **Idempotence** : l'en-tête `Idempotency-Key` identifie l'action. Rejouée (coupure après l'envoi, double synchronisation),
  elle renvoie la réponse déjà donnée sans refaire l'action.
"""

from __future__ import annotations

import contextvars
import hashlib
import json
import random
from datetime import date, datetime, timedelta
from functools import wraps

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response

from .models import CleIdempotence

ENTETE_SAISIE = "X-Saisi-Le"
ENTETE_CLE = "Idempotency-Key"

# Une action saisie hors ligne reste rejouable pendant ce délai ; au-delà, la saisie est refusée (données trop anciennes).
SAISIE_MAX = timedelta(days=30)
# Tolérance d'horloge : un appareil peut avancer de quelques minutes. Au-delà, la saisie est refusée.
TOLERANCE_HORLOGE = timedelta(minutes=10)
# Durée de conservation d'une réponse mémorisée (plus longue que SAISIE_MAX : un rejeu tardif doit encore être reconnu).
CONSERVATION = timedelta(days=45)

_saisie: contextvars.ContextVar[datetime | None] = contextvars.ContextVar("sigrh_saisie", default=None)


def instant() -> datetime:
    """Instant qui fait foi : la saisie de l'utilisateur si elle est connue, sinon maintenant."""
    return _saisie.get() or timezone.now()


def aujourdhui() -> date:
    """Jour qui fait foi (fuseau du ministère). À utiliser à la place de `timezone.localdate()` dans les actions rejouables."""
    return timezone.localtime(instant()).date()


def lire_saisie(valeur: str) -> datetime:
    """Interprète l'en-tête. Lève ValueError si la date est absente de sens, future ou trop ancienne."""
    saisie = parse_datetime(valeur.strip())
    if saisie is None:
        raise ValueError("La date de saisie est illisible.")
    if timezone.is_naive(saisie):
        saisie = timezone.make_aware(saisie, timezone.utc)
    maintenant = timezone.now()
    if saisie > maintenant + TOLERANCE_HORLOGE:
        raise ValueError("La date de saisie est dans le futur : vérifiez l'horloge de l'appareil.")
    if saisie < maintenant - SAISIE_MAX:
        raise ValueError(f"Cette saisie date de plus de {SAISIE_MAX.days} jours : elle ne peut plus être transmise, saisissez-la de nouveau.")
    return min(saisie, maintenant)


class SaisieHorsLigneMiddleware:
    """Pose la date de saisie pour la durée de la requête."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        valeur = request.headers.get(ENTETE_SAISIE, "")
        if not valeur:
            return self.get_response(request)
        try:
            saisie = lire_saisie(valeur)
        except ValueError as erreur:
            return JsonResponse({"detail": str(erreur), "code": "saisie_invalide"}, status=422)
        jeton = _saisie.set(saisie)
        try:
            return self.get_response(request)
        finally:
            _saisie.reset(jeton)


def _empreinte(request) -> str:
    """Empreinte du contenu : une même clé ne doit jamais servir deux actions différentes."""
    corps = request.body if getattr(request, "content_type", "") == "application/json" else b""
    return hashlib.sha256(request.method.encode() + b"|" + request.path.encode() + b"|" + corps).hexdigest()


def idempotente(vue):
    """Rend une vue DRF rejouable. À poser sous `@api_view`, car elle lit `request.user`.

    Sans en-tête `Idempotency-Key`, la vue s'exécute normalement. Avec l'en-tête :
    - première fois : la vue s'exécute, sa réponse (succès ou refus métier) est mémorisée ;
    - rejeu : la réponse mémorisée est renvoyée telle quelle (en-tête `Idempotent-Replayed: true`) ;
    - rejeu pendant que la première exécution tourne encore : 409, le client réessaiera ;
    - même clé avec un autre contenu : 422.
    Une erreur serveur (5xx) n'est pas mémorisée : l'action peut être retentée.
    """

    @wraps(vue)
    def enveloppe(request, *args, **kwargs):
        cle = request.headers.get(ENTETE_CLE, "").strip()
        if not cle:
            return vue(request, *args, **kwargs)
        if len(cle) > 80:
            return Response({"detail": "Clé d'idempotence invalide."}, status=400)
        empreinte = _empreinte(request)
        if random.random() < 0.02:
            CleIdempotence.objects.filter(creee_le__lt=timezone.now() - CONSERVATION).delete()
        try:
            with transaction.atomic():
                ligne = CleIdempotence.objects.create(utilisateur=request.user.username, cle=cle, empreinte=empreinte)
        except IntegrityError:
            ligne = CleIdempotence.objects.filter(utilisateur=request.user.username, cle=cle).first()
            if ligne is None:  # supprimée entre-temps : on laisse le client réessayer
                return Response({"detail": "Action en cours de traitement, réessayez."}, status=409)
            if ligne.empreinte != empreinte:
                return Response({"detail": "Cette clé d'idempotence a déjà servi pour une autre action.", "code": "cle_reutilisee"}, status=422)
            if ligne.statut is None:
                return Response({"detail": "Action en cours de traitement, réessayez.", "code": "en_cours"}, status=409)
            rejeu = Response(ligne.reponse, status=ligne.statut)
            rejeu["Idempotent-Replayed"] = "true"
            return rejeu

        try:
            reponse = vue(request, *args, **kwargs)
        except BaseException:
            ligne.delete()
            raise
        statut = getattr(reponse, "status_code", 500)
        if statut >= 500 or not hasattr(reponse, "data"):
            ligne.delete()
            return reponse
        try:
            ligne.reponse = json.loads(json.dumps(reponse.data, default=str))
        except (TypeError, ValueError):
            ligne.delete()
            return reponse
        ligne.statut = statut
        ligne.save(update_fields=["reponse", "statut"])
        return reponse

    return enveloppe
