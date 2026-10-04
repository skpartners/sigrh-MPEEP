import pytest
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth.models import User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.authtoken.models import Token

from config.asgi import application
from personnel.models import Conversation, Message, Notification

# transaction=True : les événements partent sur transaction.on_commit.
pytestmark = [pytest.mark.django_db(transaction=True), pytest.mark.asyncio]

ORIGINE = (b"origin", b"http://127.0.0.1:9100")


@database_sync_to_async
def _preparer():
    call_command("seed_demo")
    drh = User.objects.get(username="DRH-2018-044")
    kouassi = User.objects.get(username="394812H")
    intrus = User.objects.get(username="340188P")
    fil = Conversation.objects.filter(participations__utilisateur=drh).filter(participations__utilisateur=kouassi).get(sujet="")
    jetons = {u.username: Token.objects.get_or_create(user=u)[0].key for u in (drh, kouassi, intrus)}
    return drh, kouassi, fil, jetons


async def _connecter(jeton: str) -> WebsocketCommunicator:
    communicateur = WebsocketCommunicator(application, "/ws/", headers=[ORIGINE])
    connecte, _ = await communicateur.connect()
    assert connecte
    await communicateur.send_json_to({"type": "auth", "token": jeton})
    return communicateur


async def test_jeton_invalide_ferme_la_connexion():
    await _preparer()
    communicateur = await _connecter("faux-jeton")
    sortie = await communicateur.receive_output(timeout=2)
    assert sortie == {"type": "websocket.close", "code": 4401}


async def test_origine_inconnue_refusee():
    communicateur = WebsocketCommunicator(application, "/ws/", headers=[(b"origin", b"https://site-pirate.example")])
    connecte, _ = await communicateur.connect()
    assert not connecte


async def test_nouveau_message_pousse_aux_participants_seulement():
    _drh, kouassi, fil, jetons = await _preparer()
    drh_ws = await _connecter(jetons["DRH-2018-044"])
    assert await drh_ws.receive_json_from(timeout=2) == {"type": "pret"}
    intrus_ws = await _connecter(jetons["340188P"])
    assert await intrus_ws.receive_json_from(timeout=2) == {"type": "pret"}

    await database_sync_to_async(Message.objects.create)(
        conversation=fil, auteur=kouassi, texte="Le dossier est complet.", envoye_le=timezone.now()
    )
    evenement = await drh_ws.receive_json_from(timeout=2)
    assert evenement["type"] == "message.nouveau"
    assert evenement["conversation_id"] == fil.id
    assert evenement["auteur"] == "KOUASSI Jean-Baptiste"
    assert await intrus_ws.receive_nothing(timeout=0.3)  # hors de la conversation : rien

    await drh_ws.disconnect()
    await intrus_ws.disconnect()


async def test_notification_poussee_a_son_destinataire():
    drh, _kouassi, _fil, jetons = await _preparer()
    drh_ws = await _connecter(jetons["DRH-2018-044"])
    await drh_ws.receive_json_from(timeout=2)
    await database_sync_to_async(Notification.objects.create)(
        destinataire=drh, categorie="visa", titre="Nouveau visa à apposer", message="Test", creee_le=timezone.now()
    )
    evenement = await drh_ws.receive_json_from(timeout=2)
    assert evenement["type"] == "notification.nouvelle" and evenement["titre"] == "Nouveau visa à apposer"
    await drh_ws.disconnect()
