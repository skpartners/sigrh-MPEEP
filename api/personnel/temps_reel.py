"""Temps réel : un WebSocket par onglet, un groupe Channels par utilisateur.

Protocole (JSON) :
- le client ouvre ws://<api>/ws/ puis envoie {"type": "auth", "token": "<jeton DRF>"} ;
  le jeton ne passe jamais dans l'URL (il finirait dans les journaux) ;
- sans authentification valide sous 10 s, ou avec un jeton invalide, la connexion est fermée (4401) ;
- le serveur répond {"type": "pret"}, puis pousse les événements :
  « message.nouveau », « messagerie.lu », « notification.nouvelle ».
"""

import asyncio

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from rest_framework.authtoken.models import Token

from .messagerie import personne
from .models import Message, Notification, Participation

DELAI_AUTH_S = 10
FERMETURE_NON_AUTHENTIFIE = 4401


def groupe(user_id: int) -> str:
    return f"utilisateur.{user_id}"


def diffuser(user_ids, evenement: dict) -> None:
    """Pousse un événement aux utilisateurs, une fois la transaction validée (jamais une donnée annulée)."""
    couche = get_channel_layer()
    if couche is None:
        return
    destinataires = list(dict.fromkeys(user_ids))

    def envoyer():
        for user_id in destinataires:
            async_to_sync(couche.group_send)(groupe(user_id), {"type": "evenement", "donnees": evenement})

    transaction.on_commit(envoyer)


@database_sync_to_async
def _utilisateur_du_jeton(cle: str):
    try:
        return Token.objects.select_related("user").get(key=cle).user
    except Token.DoesNotExist:
        return None


class TempsReelConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = None
        await self.accept()
        self.delai = asyncio.create_task(self._fermer_si_anonyme())

    async def _fermer_si_anonyme(self):
        await asyncio.sleep(DELAI_AUTH_S)
        if self.user is None:
            await self.close(code=FERMETURE_NON_AUTHENTIFIE)

    async def receive_json(self, contenu, **kwargs):
        if contenu.get("type") == "auth" and self.user is None:
            user = await _utilisateur_du_jeton(str(contenu.get("token") or ""))
            if user is None or not user.is_active:
                await self.close(code=FERMETURE_NON_AUTHENTIFIE)
                return
            self.user = user
            self.delai.cancel()
            await self.channel_layer.group_add(groupe(user.id), self.channel_name)
            await self.send_json({"type": "pret"})
        elif contenu.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def disconnect(self, code):
        if getattr(self, "delai", None):
            self.delai.cancel()
        if self.user is not None:
            await self.channel_layer.group_discard(groupe(self.user.id), self.channel_name)

    async def evenement(self, event):
        await self.send_json(event["donnees"])


# --- Événements déclenchés par les modèles ------------------------------------


@receiver(post_save, sender=Message)
def _message_cree(sender, instance: Message, created: bool, **kwargs):
    if not created:
        return
    participants = Participation.objects.filter(conversation_id=instance.conversation_id).values_list("utilisateur_id", flat=True)
    auteur = instance.auteur
    diffuser(
        participants,
        {
            "type": "message.nouveau",
            "conversation_id": instance.conversation_id,
            "message_id": instance.id,
            "auteur_id": auteur.id,
            "auteur_matricule": auteur.username,
            "auteur": personne(auteur)["nom_complet"],
            "extrait": instance.texte[:120],
        },
    )


@receiver(post_save, sender=Notification)
def _notification_creee(sender, instance: Notification, created: bool, **kwargs):
    if created:
        diffuser([instance.destinataire_id], {"type": "notification.nouvelle", "id": instance.id, "titre": instance.titre, "urgente": instance.urgente})
