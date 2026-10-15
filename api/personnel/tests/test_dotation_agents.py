from datetime import date, timedelta

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.dotation_agents import structure_actuelle
from personnel.models import Agent, EntiteTutelle, EtapeParcours, MiseADisposition, Notification, Profil

pytestmark = pytest.mark.django_db


def _client(matricule: str, mot_de_passe: str = "Sigrh-Dev-2026") -> APIClient:
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": matricule, "password": mot_de_passe}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def _pdf(nom="avis.pdf"):
    return SimpleUploadedFile(nom, b"%PDF-1.4 test", content_type="application/pdf")


@pytest.fixture
def monde():
    call_command("seed_demo")
    drh = _client("DRH-2018-044")
    # 349812K encadre 318490K ; il dépend lui-même du DRH (rattachement du jeu de démonstration).
    Profil.objects.filter(user__username="318490K").update(superieur=User.objects.get(username="349812K"))
    return {"drh": drh, "chef": _client("349812K"), "agent": _client("318490K"), "autre": _client("394812H")}


def test_seule_l_equipe_de_la_drh_tient_la_dotation(monde):
    assert monde["drh"].get("/api/v1/dotation-agents/").status_code == 200
    assert monde["agent"].get("/api/v1/dotation-agents/").status_code == 403
    assert monde["agent"].post("/api/v1/dotation-agents/mouvements/", {"type": "affectation"}, format="json").status_code == 403


def test_affectation_puis_reaffectation_garde_la_structure_precedente(monde):
    agent = Agent.objects.get(matricule="289043B")
    Agent.objects.filter(pk=agent.pk).update(service="", sous_direction="", direction="", structure="")
    cible = EntiteTutelle.objects.get(code="svc-actes")
    autre = EntiteTutelle.objects.get(code="svc-courrier")
    route = "/api/v1/dotation-agents/mouvements/"
    base = {"matricule": "289043B", "structure": cible.id, "date_effet": date.today().isoformat(), "categorie": "fonctionnaire"}

    affecte = monde["drh"].post(route, {**base, "type": "affectation"}, format="multipart")
    assert affecte.status_code == 201, affecte.content
    agent.refresh_from_db()
    assert structure_actuelle(agent).id == cible.id and agent.service == cible.nom
    assert EtapeParcours.objects.filter(agent=agent, intitule__startswith="Affectation").exists()
    # Un agent déjà affecté ne se réaffecte pas par une affectation.
    assert monde["drh"].post(route, {**base, "type": "affectation", "structure": autre.id}, format="multipart").status_code == 409

    # La réaffectation exige le concours et garde la structure précédente.
    sans_concours = monde["drh"].post(route, {**base, "type": "reaffectation", "structure": autre.id}, format="multipart")
    assert sans_concours.status_code == 400
    meme = monde["drh"].post(route, {**base, "type": "reaffectation", "concours": "Concours des attachés"}, format="multipart")
    assert meme.status_code == 400
    reaffecte = monde["drh"].post(route, {**base, "type": "reaffectation", "structure": autre.id, "concours": "Concours des attachés"}, format="multipart")
    assert reaffecte.status_code == 201 and reaffecte.json()["precedente"] == cible.nom
    agent.refresh_from_db()
    assert structure_actuelle(agent).id == autre.id

    donnees = monde["drh"].get("/api/v1/dotation-agents/").json()
    assert len(donnees["affectations"]) == 1 and len(donnees["reaffectations"]) == 1
    # Retirer la réaffectation ramène l'agent à sa structure précédente.
    assert monde["drh"].delete(f"{route}{reaffecte.json()['id']}/").status_code == 204
    agent.refresh_from_db()
    assert structure_actuelle(agent).id == cible.id


def test_mise_a_disposition_de_la_demande_de_l_agent_au_constat_de_la_drh(monde):
    demande = {"ministere_accueil": "Ministère de la Santé", "structure_accueil": "Direction des Études", "date_debut": date.today().isoformat(), "motif": "Convenance"}
    assert monde["agent"].post("/api/v1/mobilite/dispositions/", demande, format="multipart").status_code == 400  # avis obligatoire
    cree = monde["agent"].post("/api/v1/mobilite/dispositions/", {**demande, "avis": _pdf()}, format="multipart")
    assert cree.status_code == 201 and cree.json()["statut"] == "en_attente"
    pk = cree.json()["id"]
    assert monde["agent"].post("/api/v1/mobilite/dispositions/", {**demande, "avis": _pdf()}, format="multipart").status_code == 409
    # Seule la hiérarchie de l'agent décide ; le rejet est motivé.
    decision = f"/api/v1/mobilite/dispositions/{pk}/decision/"
    assert monde["autre"].post(decision, {"sens": "accepter"}, format="json").status_code == 403
    assert monde["agent"].post(decision, {"sens": "accepter"}, format="json").status_code == 403
    assert monde["chef"].post(decision, {"sens": "rejeter"}, format="json").status_code == 400
    assert monde["chef"].get("/api/v1/mobilite/").json()["dispositions_equipe"][0]["statut"] == "en_attente"
    assert monde["chef"].post(decision, {"sens": "accepter", "motif": "Accord"}, format="json").json()["statut"] == "acceptee"
    # La DRH ne fait que constater puis suivre.
    constat = f"/api/v1/dotation-agents/dispositions/{pk}/"
    assert monde["agent"].post(constat, {}, format="json").status_code == 403
    assert monde["autre"].post(constat, {}, format="json").status_code == 403
    constate = monde["drh"].post(constat, {"reference_acte": "ARR-12"}, format="json")
    assert constate.status_code == 200 and constate.json()["statut"] == "constatee" and constate.json()["etat"] == "en_cours"
    agent = Agent.objects.get(matricule="318490K")
    assert agent.situation == "Mis à disposition" and agent.positions.filter(type="mise_a_disposition").count() == 1
    suivi = monde["drh"].patch(constat, {"date_fin": (date.today() + timedelta(days=90)).isoformat(), "observation": "Prolongée"}, format="json")
    assert suivi.status_code == 200 and suivi.json()["date_fin"]
    assert agent.positions.get().date_fin is not None
    assert Notification.objects.filter(destinataire__username="318490K", titre="Mise à disposition constatée").exists()
    # La demande rejetée n'ouvre aucune position.
    assert MiseADisposition.objects.filter(statut="constatee").count() == 1


def test_redeploiement_de_la_hierarchie_a_l_effet_decide_par_la_drh(monde):
    destination = EntiteTutelle.objects.get(code="svc-courrier")
    route = "/api/v1/mobilite/redeploiements/"
    assert monde["autre"].post(route, {"matricule": "318490K", "structure": destination.id, "motif": "Besoin"}, format="json").status_code == 403
    assert monde["chef"].post(route, {"matricule": "318490K", "structure": destination.id}, format="json").status_code == 400
    cree = monde["chef"].post(route, {"matricule": "318490K", "structure": destination.id, "motif": "Renfort du service du courrier"}, format="json")
    assert cree.status_code == 201 and cree.json()["statut"] == "declenche"
    pk = cree.json()["id"]
    assert Notification.objects.filter(destinataire__username="318490K", titre="Redéploiement engagé").exists()
    # La DRH ne peut rien effectuer avant que la hiérarchie montante ait pris connaissance.
    assert monde["drh"].post(f"/api/v1/dotation-agents/redeploiements/{pk}/effectuer/", {}, format="json").status_code == 409
    assert monde["autre"].post(f"{route}{pk}/connaissance/", {}, format="json").status_code == 403
    assert monde["agent"].post(f"{route}{pk}/connaissance/", {}, format="json").status_code == 403
    assert monde["drh"].get("/api/v1/mobilite/").json()["a_connaitre"][0]["id"] == pk
    assert monde["drh"].post(f"{route}{pk}/connaissance/", {"observation": "Pris acte"}, format="json").json()["statut"] == "connu"
    fait = monde["drh"].post(f"/api/v1/dotation-agents/redeploiements/{pk}/effectuer/", {"reference_acte": "NS-7"}, format="json")
    assert fait.status_code == 200 and fait.json()["statut"] == "effectue"
    assert structure_actuelle(Agent.objects.get(matricule="318490K")).id == destination.id
    assert Notification.objects.filter(destinataire__username="318490K", titre="Redéploiement effectif").exists()
    assert monde["drh"].delete(f"/api/v1/dotation-agents/redeploiements/{pk}/").status_code == 409
