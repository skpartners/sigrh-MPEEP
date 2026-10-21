import io
import zipfile

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.import_effectif import COLONNES
from personnel.models import Agent, CampagneBesoin, EntiteTutelle, Notification, ParametresMinistere, Profil, SessionFormation
from personnel.statistiques import _xlsx

pytestmark = pytest.mark.django_db
ENTETES = [titre for _champ, titre, *_reste in COLONNES]


@pytest.fixture
def api():
    call_command("seed_demo")
    return APIClient()


def _auth(api, matricule="DRH-2018-044"):
    jeton = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    return {"HTTP_AUTHORIZATION": f"Token {jeton}"}


def _ligne(**valeurs):
    base = {
        "Matricule": "REEL-001", "Nom": "DIABATÉ", "Prénoms": "Awa", "Sexe": "F", "Date de naissance": "14/03/1981",
        "Structure d'affectation": "Service des actes", "Grade": "A4", "Type d'agent": "Fonctionnaire",
    }
    base.update(valeurs)
    return [base.get(titre, "") for titre in ENTETES]


def _classeur(*lignes):
    return _xlsx({"Agents": [ENTETES, *lignes]})


def _poster(api, auth, contenu, **champs):
    return api.post("/api/v1/parametres/effectif/import/", {"fichier": SimpleUploadedFile("agents.xlsx", contenu), **champs}, **auth)


def test_le_modele_est_documente_et_decrit_chaque_colonne(api):
    auth = _auth(api)
    modele = api.get("/api/v1/parametres/effectif/modele/", **auth)
    assert modele.status_code == 200 and "modele-agents-du-ministere" in modele["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(modele.content)) as archive:
        classeur = archive.read("xl/workbook.xml").decode()
        texte = " ".join(archive.read(nom).decode() for nom in archive.namelist() if nom.startswith("xl/") and nom.endswith(".xml"))
    for feuille in ("Agents", "Consignes", "Structures", "Grades", "Emplois", "Valeurs"):
        assert feuille in classeur
    assert "Matricule" in texte and "Service des actes" in texte and "matricule@2026" in texte
    assert api.get("/api/v1/parametres/effectif/modele/").status_code == 401


def test_chaque_ligne_incorrecte_est_signalee_sans_rien_enregistrer(api):
    auth = _auth(api)
    avant = Agent.objects.count()
    reponse = _poster(api, auth, _classeur(
        _ligne(**{"Matricule": "OK-1"}),
        _ligne(**{"Matricule": "OK-1"}),
        _ligne(**{"Matricule": "BAD-2", "Structure d'affectation": "Structure inconnue"}),
        _ligne(**{"Matricule": "BAD-3", "Grade": "Z99"}),
        _ligne(**{"Matricule": "BAD-6", "Sexe": "?"}),
        _ligne(**{"Matricule": "BAD-4", "Type d'agent": "Stagiaire"}),
        _ligne(**{"Matricule": "BAD-7", "Date de naissance": "n'importe quoi"}),
        _ligne(**{"Matricule": "BAD-5", "Supérieur hiérarchique": "INCONNU"}),
    ))
    assert reponse.status_code == 400
    messages = " | ".join(e["message"] for e in reponse.json()["erreurs"])
    for attendu in ("déjà", "Structure inconnue", "Z99", "sexe", "type d'agent", "date de naissance", "supérieur"):
        assert attendu.lower() in messages.lower(), attendu
    assert Agent.objects.count() == avant and not User.objects.filter(username="OK-1").exists()


def test_le_chargement_cree_agents_comptes_et_messages_sans_toucher_aux_donnees_de_demonstration(api):
    auth = _auth(api)
    avant = Agent.objects.count()
    reponse = _poster(api, auth, _classeur(
        _ligne(),
        _ligne(**{"Matricule": "REEL-002", "Nom": "KONÉ", "Prénoms": "Ali", "Sexe": "H", "Rôle dans l'application": "Chef de service", "Supérieur hiérarchique": "REEL-001", "Type d'agent": "Contractuel"}),
    ))
    assert reponse.status_code == 200, reponse.content
    corps = reponse.json()
    assert corps["crees"] == 2 and corps["comptes_crees"] == 2 and corps["supprimes"] == {}
    assert Agent.objects.count() == avant + 2
    agent = Agent.objects.get(matricule="REEL-001")
    assert agent.service == "Service des Actes" and agent.categorie == "A" and agent.type_agent == "Fonctionnaire"
    # Le matricule est l'identifiant, matricule@2026 le mot de passe initial, et l'agent en est informé.
    connexion = api.post("/api/v1/auth/login/", {"matricule": "REEL-001", "password": "REEL-001@2026"}, format="json")
    assert connexion.status_code == 200
    assert api.post("/api/v1/auth/login/", {"matricule": "REEL-001", "password": "autre"}, format="json").status_code in {400, 401}
    message = Notification.objects.get(destinataire__username="REEL-001")
    assert "mot de passe" in message.message and message.urgente
    chef = Profil.objects.get(user__username="REEL-002")
    assert chef.role == "Chef de service" and chef.structure.nom == "Service des Actes" and chef.superieur.username == "REEL-001"
    # Recharger le même classeur met à jour sans doubler les comptes.
    seconde = _poster(api, auth, _classeur(_ligne(**{"Nom": "DIABATÉ-KONÉ"})))
    assert seconde.json()["crees"] == 0 and seconde.json()["mis_a_jour"] == 1 and seconde.json()["comptes_crees"] == 0
    assert User.objects.filter(username="REEL-001").count() == 1


def test_le_premier_chargement_peut_remplacer_toutes_les_donnees_de_demonstration(api):
    auth = _auth(api)
    assert api.get("/api/v1/parametres/", **auth).json()["effectif"]["donnees_factices"] is True
    assert Agent.objects.count() > 1 and SessionFormation.objects.exists() and CampagneBesoin.objects.exists()
    structures = EntiteTutelle.objects.count()
    reponse = _poster(api, auth, _classeur(_ligne()), remplacer="true")
    assert reponse.status_code == 200, reponse.content
    assert list(Agent.objects.values_list("matricule", flat=True)) == ["REEL-001"]
    assert not SessionFormation.objects.exists() and not CampagneBesoin.objects.exists() and not Notification.objects.exclude(destinataire__username="REEL-001").exists()
    assert EntiteTutelle.objects.count() == structures
    assert ParametresMinistere.objects.get(pk=1).donnees_reelles is True
    # Les comptes de démonstration disparaissent ; celui qui a chargé le classeur reste.
    assert not User.objects.filter(username="349812K").exists() and User.objects.filter(username="DRH-2018-044").exists()
    assert api.get("/api/v1/parametres/", **auth).json()["effectif"] == {"agents": 1, "donnees_factices": False}
    # Un compte conservé voit toujours un tableau de bord et les états du personnel.
    assert api.get("/api/v1/dashboard/", **auth).status_code == 200
    assert api.get("/api/v1/dashboard/etats/", **auth).json()["socio_demographie"]["total"] == 1


def test_seul_un_compte_habilite_charge_l_effectif(api):
    assert _poster(api, _auth(api, "318490K"), _classeur(_ligne())).status_code == 403
