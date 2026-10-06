"""Temps réel : un WebSocket par onglet, un groupe Channels par utilisateur.

Protocole (JSON) :
- le client ouvre ws://<api>/ws/ puis envoie {"type": "auth", "token": "<jeton DRF>"} ;
  le jeton ne passe jamais dans l'URL (il finirait dans les journaux) ;
- sans authentification valide sous 10 s, ou avec un jeton invalide, la connexion est fermée (4401) ;
- le serveur répond {"type": "pret"}, puis pousse les événements :
  « message.nouveau », « messagerie.lu », « notification.nouvelle »,
  « habilitation.changee », « registre.change ».
"""

import asyncio

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from rest_framework.authtoken.models import Token

from .messagerie import personne
from .models import (
    Absence,
    Acte,
    Agent,
    AlertePoste,
    AyantDroit,
    BranchePlafond,
    CampagneBesoin,
    CampagnePlanConge,
    Communication,
    CompositionStatistique,
    Demande,
    DemandeDotation,
    DossierRetraite,
    EmploiReferentiel,
    EntiteTutelle,
    FicheBesoin,
    GradeReferentiel,
    InscriptionFormation,
    Message,
    MouvementPlanConge,
    Notification,
    ParametresMinistere,
    Participation,
    Passerelle,
    PieceJointe,
    PlanConge,
    PoleMinisteriel,
    PrestationSociale,
    ProcedureDisciplinaire,
    Profil,
    Publication,
    RepriseConge,
    ReponseSondage,
    RoleMatrice,
    SanctionDisciplinaire,
    SessionFormation,
    SessionParitaire,
    SituationSociale,
    VisaDemande,
    VisaDossier,
    VisaEnAttente,
)

DELAI_AUTH_S = 10
FERMETURE_NON_AUTHENTIFIE = 4401


def groupe(user_id: int) -> str:
    return f"utilisateur.{user_id}"


GROUPE_SESSIONS = "sessions"
_annonce_en_attente = False


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


def annoncer_changement() -> None:
    """Une seule annonce par transaction, après sa validation."""
    global _annonce_en_attente
    if _annonce_en_attente:
        return
    _annonce_en_attente = True

    def envoyer():
        global _annonce_en_attente
        _annonce_en_attente = False
        _pousser_changement()

    transaction.on_commit(envoyer)


def _pousser_changement() -> None:
    couche = get_channel_layer()
    if couche is None:
        return
    async_to_sync(couche.group_send)(GROUPE_SESSIONS, {"type": "evenement", "donnees": {"type": "registre.change"}})


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
            await self.channel_layer.group_add(GROUPE_SESSIONS, self.channel_name)
            await self.send_json({"type": "pret"})
        elif contenu.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def disconnect(self, code):
        if getattr(self, "delai", None):
            self.delai.cancel()
        if self.user is not None:
            await self.channel_layer.group_discard(groupe(self.user.id), self.channel_name)
            await self.channel_layer.group_discard(GROUPE_SESSIONS, self.channel_name)

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


# Le rôle du premier responsable, selon le niveau de la structure couverte en intérim.
_NIVEAU_DU_ROLE = {
    "Chef de service": "service",
    "Sous directeur": "sous-direction",
    "Directeur": "direction-centrale",
    "Directeur général": "direction-generale",
    "Ministre": "ministere",
}


def _comptes_du_role(nom: str) -> list[int]:
    """Comptes dont les droits de menu suivent ce rôle, y compris un intérim sur ce niveau."""
    identifiants = set(Profil.objects.filter(role=nom, administrateur=False).values_list("user_id", flat=True))
    niveau = _NIVEAU_DU_ROLE.get(nom)
    if niveau:
        postes = EntiteTutelle.objects.filter(niveau=niveau).values_list("pk", flat=True)
        identifiants.update(
            Profil.objects.filter(interim_id__in=postes, administrateur=False).values_list("user_id", flat=True)
        )
    return list(identifiants)


@receiver(post_save, sender=RoleMatrice)
def _role_change(sender, instance: RoleMatrice, **kwargs):
    champs = kwargs.get("update_fields")
    if champs is not None and set(champs).isdisjoint({"droits", "precisions"}):
        return
    diffuser(_comptes_du_role(instance.role), {"type": "habilitation.changee"})


@receiver(post_save, sender=Profil)
def _profil_droits_changes(sender, instance: Profil, **kwargs):
    if instance.administrateur:
        return
    champs = kwargs.get("update_fields")
    if champs is not None and set(champs).isdisjoint({"habilitations", "precisions", "role", "interim"}):
        return
    diffuser([instance.user_id], {"type": "habilitation.changee"})


# Registres affichés à l'écran : toute écriture prévient les sessions ouvertes.
_REGISTRES = (
    Absence, Acte, Agent, AlertePoste, AyantDroit, BranchePlafond, CampagneBesoin, CampagnePlanConge,
    Communication, CompositionStatistique, Demande, DemandeDotation, DossierRetraite, EmploiReferentiel,
    EntiteTutelle, FicheBesoin, GradeReferentiel, InscriptionFormation, MouvementPlanConge, ParametresMinistere,
    Passerelle, PieceJointe, PlanConge, PoleMinisteriel, PrestationSociale, ProcedureDisciplinaire, Profil,
    Publication, RepriseConge, ReponseSondage, SanctionDisciplinaire, SessionFormation, SessionParitaire,
    SituationSociale, VisaDemande, VisaDossier, VisaEnAttente,
)


def _registre_modifie(sender, **kwargs):
    annoncer_changement()


for _modele in _REGISTRES:
    post_save.connect(_registre_modifie, sender=_modele, weak=False)
    post_delete.connect(_registre_modifie, sender=_modele, weak=False)
