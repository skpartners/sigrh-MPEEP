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
    communicateur = WebsocketCommunicator(application, "/sigrh/ws/", headers=[ORIGINE])
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
    communicateur = WebsocketCommunicator(application, "/sigrh/ws/", headers=[(b"origin", b"https://site-pirate.example")])
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


async def test_retrait_d_habilitation_pousse_aux_comptes_du_role():
    from personnel.models import Organisme, Profil, RoleMatrice

    await _preparer()

    def comptes():
        org = Organisme.objects.get(code="dgpe")
        sous_directeur = User.objects.create_user("SD-TEMPS", password="Sigrh-Dev-2026")
        Profil.objects.create(user=sous_directeur, role="Sous directeur", fonction="Sous-directeur", organisme=org)
        agent = User.objects.create_user("AG-TEMPS", password="Sigrh-Dev-2026")
        Profil.objects.create(user=agent, role="Agent", fonction="Agent", organisme=org)
        return {
            "SD-TEMPS": Token.objects.create(user=sous_directeur).key,
            "AG-TEMPS": Token.objects.create(user=agent).key,
        }

    jetons = await database_sync_to_async(comptes)()
    sd = await _connecter(jetons["SD-TEMPS"])
    assert await sd.receive_json_from(timeout=2) == {"type": "pret"}
    agent = await _connecter(jetons["AG-TEMPS"])
    assert await agent.receive_json_from(timeout=2) == {"type": "pret"}

    def retirer():
        role = RoleMatrice.objects.get(role="Sous directeur")
        droits = list(role.droits)
        droits[0] = "refus"
        role.droits = droits
        role.save(update_fields=["droits"])

    await database_sync_to_async(retirer)()
    evenement = await sd.receive_json_from(timeout=2)
    assert evenement == {"type": "habilitation.changee"}
    assert await agent.receive_nothing(timeout=0.3)
    await sd.disconnect()
    await agent.disconnect()


async def test_une_action_rafraichit_les_sessions_ouvertes():
    from personnel.models import Absence, Agent

    _drh, _kouassi, _fil, jetons = await _preparer()
    drh = await _connecter(jetons["DRH-2018-044"])
    assert await drh.receive_json_from(timeout=2) == {"type": "pret"}
    autre = await _connecter(jetons["340188P"])
    assert await autre.receive_json_from(timeout=2) == {"type": "pret"}

    def poser():
        agent = Agent.objects.first()
        Absence.objects.create(
            agent=agent, nature="Absence de test", debut=timezone.now().date(), fin=timezone.now().date(),
            jours=1, statut="Demandée",
        )

    await database_sync_to_async(poser)()
    assert await drh.receive_json_from(timeout=2) == {"type": "registre.change"}
    assert await autre.receive_json_from(timeout=2) == {"type": "registre.change"}
    await drh.disconnect()
    await autre.disconnect()


async def test_une_ecriture_annulee_ne_coupe_pas_les_annonces_suivantes():
    from django.db import transaction

    from personnel.models import Absence, Agent

    _drh, _kouassi, _fil, jetons = await _preparer()
    drh = await _connecter(jetons["DRH-2018-044"])
    assert await drh.receive_json_from(timeout=2) == {"type": "pret"}

    def poser():
        Absence.objects.create(
            agent=Agent.objects.first(), nature="Absence de test", debut=timezone.now().date(), fin=timezone.now().date(),
            jours=1, statut="Demandée",
        )

    def annuler():
        try:
            with transaction.atomic():
                poser()
                raise RuntimeError("enregistrement interrompu")
        except RuntimeError:
            pass

    await database_sync_to_async(annuler)()
    assert await drh.receive_nothing(timeout=0.3)
    await database_sync_to_async(poser)()
    assert await drh.receive_json_from(timeout=2) == {"type": "registre.change"}
    await drh.disconnect()
