import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    call_command("seed_demo")
    return APIClient()


def test_accueil_est_public_et_autorise_le_front(api):
    from personnel.models import Acte, Agent, EntiteTutelle

    response = api.get("/api/v1/public/accueil/", HTTP_ORIGIN="http://127.0.0.1:9100")
    assert response.status_code == 200
    assert response["Access-Control-Allow-Origin"] == "http://127.0.0.1:9100"
    body = response.json()
    assert body["marque"]["sigle"] == "SIGRH-PORTEFEUILLE"
    assert [item["valeur"] for item in body["chiffres"]] == [
        f"{Agent.objects.count():_}".replace("_", " "),
        f"{EntiteTutelle.objects.count():_}".replace("_", " "),
        f"{Acte.objects.filter(publie=True).count():_}".replace("_", " "),
    ]
    assert "4 826" not in [item["valeur"] for item in body["chiffres"]]
    assert body["actes_recents"]


def test_registre_des_publications(api, settings, tmp_path):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel.models import Publication

    settings.MEDIA_ROOT = tmp_path
    anonyme = api.get("/api/v1/communication/")
    assert anonyme.status_code in (401, 403)
    login = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026", "organisme": "dgpe"},
        format="json",
    )
    auth = {"HTTP_AUTHORIZATION": f"Token {login.json()['token']}"}
    page = api.get("/api/v1/communication/", **auth)
    assert page.status_code == 200
    corps = page.json()
    assert corps["peut_viser"] is True
    assert corps["indicateurs"]["actives"] >= 3
    assert any(item["reference"] == "014/MPEEP/DRH" for item in corps["publications"])
    assert corps["visas"]
    compteur = api.get("/api/v1/communication/compteur/", **auth)
    assert compteur.status_code == 200
    assert compteur.json()["decompte"] >= len(corps["visas"])
    fichier = SimpleUploadedFile("note.pdf", b"%PDF-1.4 note de service", content_type="application/pdf")
    cree = api.post(
        "/api/v1/communication/",
        {
            "nature": "flash",
            "urgence": "urgent",
            "perimetre": "tous",
            "intitule": "Alerte de test",
            "corps": "Message de vérification du registre.",
            "diffuser": "true",
            "fichier": fichier,
        },
        format="multipart",
        **auth,
    )
    assert cree.status_code == 201
    assert cree.json()["statut"] == "visa"
    assert cree.json()["piece_nom"] == "note.pdf"
    piece = api.get(f"/api/v1/communication/{cree.json()['id']}/piece/", **auth)
    assert piece.status_code == 200
    assert b"".join(piece.streaming_content).startswith(b"%PDF")
    agent = api.post("/api/v1/auth/login/", {"matricule": "349812K", "password": "Sigrh-Dev-2026"}, format="json")
    refus = api.post(f"/api/v1/communication/{cree.json()['id']}/viser/", HTTP_AUTHORIZATION=f"Token {agent.json()['token']}")
    assert refus.status_code == 403
    assert Publication.objects.get(pk=cree.json()["id"]).statut == Publication.Statut.VISA
    vise = api.post(f"/api/v1/communication/{cree.json()['id']}/viser/", **auth)
    assert vise.status_code == 200
    assert Publication.objects.get(pk=cree.json()["id"]).statut == Publication.Statut.DIFFUSE
    titres = {item["titre"] for item in api.get("/api/v1/public/communications/").json()}
    assert "Alerte de test" not in titres
    agent_public = api.post(f"/api/v1/communication/{cree.json()['id']}/public/", HTTP_AUTHORIZATION=f"Token {agent.json()['token']}")
    assert agent_public.status_code == 403
    rendu = api.post(f"/api/v1/communication/{cree.json()['id']}/public/", **auth)
    assert rendu.status_code == 200 and rendu.json()["publique"] is True
    assert "Alerte de test" in {item["titre"] for item in api.get("/api/v1/public/communications/").json()}
    avant = next(item["emargements"] for item in api.get("/api/v1/communication/", **auth).json()["publications"] if item["id"] == cree.json()["id"])
    agent_auth = {"HTTP_AUTHORIZATION": f"Token {agent.json()['token']}"}
    lu = api.post("/api/v1/communication/lues/", {"ids": [cree.json()["id"]]}, format="json", **agent_auth)
    assert lu.status_code == 200
    apres = next(item["emargements"] for item in api.get("/api/v1/communication/", **auth).json()["publications"] if item["id"] == cree.json()["id"])
    assert apres == avant + 1


def test_communications_de_la_drh(api):
    public = api.get("/api/v1/public/communications/")
    assert public.status_code == 200
    titres = {item["titre"] for item in public.json()}
    assert "Vérification des coordonnées personnelles" in titres
    assert all(item["publie"] for item in public.json())

    login = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026", "organisme": "dgpe"},
        format="json",
    )
    jeton = login.json()["token"]
    auth = {"HTTP_AUTHORIZATION": f"Token {jeton}"}
    cree = api.post(
        "/api/v1/communications/",
        {"titre": "Fermeture du guichet", "texte": "Le secrétariat est fermé le vendredi 10 octobre.", "rubrique": "avis", "publie": False},
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    identifiant = cree.json()["id"]
    assert cree.json()["publie"] is False
    assert "Fermeture du guichet" not in {item["titre"] for item in api.get("/api/v1/public/communications/").json()}

    modifie = api.patch(
        f"/api/v1/communications/{identifiant}/",
        {"titre": "Fermeture du guichet", "texte": "Le secrétariat est fermé le vendredi 10 octobre.", "rubrique": "avis", "publie": True},
        format="json",
        **auth,
    )
    assert modifie.status_code == 200
    assert "Fermeture du guichet" in {item["titre"] for item in api.get("/api/v1/public/communications/").json()}

    agent = api.post(
        "/api/v1/auth/login/",
        {"matricule": "318490K", "password": "Sigrh-Dev-2026"},
        format="json",
    )
    refuse = api.post(
        "/api/v1/communications/",
        {"titre": "Hors habilitation", "texte": "Ne doit pas passer.", "rubrique": "information", "publie": True},
        format="json",
        HTTP_AUTHORIZATION=f"Token {agent.json()['token']}",
    )
    assert refuse.status_code == 403

    assert api.delete(f"/api/v1/communications/{identifiant}/", **auth).status_code == 204


def test_sondage_aupres_de_tous_les_agents(api):
    drh = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026", "organisme": "dgpe"},
        format="json",
    )
    auth = {"HTTP_AUTHORIZATION": f"Token {drh.json()['token']}"}
    ouvert = api.post(
        "/api/v1/communication/consultation/",
        {"question": "Le guichet du jeudi vous convient-il ?", "cloture": "2026-12-31", "options": ["Oui", "Non"]},
        format="json",
        **auth,
    )
    assert ouvert.status_code == 201
    assert ouvert.json()["consultation"]["perimetre"] == "Ensemble des agents"
    assert ouvert.json()["consultation"]["participants"] == 0

    agent = api.post("/api/v1/auth/login/", {"matricule": "318490K", "password": "Sigrh-Dev-2026"}, format="json")
    jeton = {"HTTP_AUTHORIZATION": f"Token {agent.json()['token']}"}
    courant = api.get("/api/v1/sondage/", **jeton)
    assert courant.status_code == 200
    assert courant.json()["ouverte"] is True
    assert courant.json()["ma_reponse"] == ""
    voix = api.post("/api/v1/sondage/reponse/", {"choix": "Oui"}, format="json", **jeton)
    assert voix.status_code == 201
    assert voix.json()["participants"] == 1
    assert voix.json()["options"][0]["voix"] == 1
    assert api.post("/api/v1/sondage/reponse/", {"choix": "Non"}, format="json", **jeton).status_code == 400


def test_login_puis_tableau_de_bord(api):
    denied = api.get("/api/v1/dashboard/")
    assert denied.status_code == 401

    login = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026", "organisme": "dgpe"},
        format="json",
    )
    assert login.status_code == 200
    token = login.json()["token"]
    assert login.json()["user"]["fonction"].startswith("Directeur")

    dashboard = api.get("/api/v1/dashboard/", HTTP_AUTHORIZATION=f"Token {token}")
    assert dashboard.status_code == 200
    payload = dashboard.json()
    from personnel.models import Absence, Agent

    effectif = Agent.objects.count()
    assert payload["kpis"][0]["valeur"] == f"{effectif:_}".replace("_", " ")
    assert payload["etats"]["effectifs"]["total"] == effectif
    assert payload["etats"]["effectifs"]["femmes"] + payload["etats"]["effectifs"]["hommes"] == effectif
    axes = {axe["code"]: axe for axe in payload["etats"]["effectifs"]["axes"]}
    assert {"categorie", "grade", "emploi", "structure"} <= set(axes)
    assert sum(ligne["total"] for ligne in axes["structure"]["lignes"]) == effectif
    assert payload["etats"]["absences"]["a_decider"] == Absence.objects.filter(decision=Absence.Decision.EN_ATTENTE).count()
    assert {"dotations", "formation"} <= set(payload["etats"])
    assert "charges" not in payload
    libelles = " ".join(kpi["libelle"].lower() for kpi in payload["kpis"])
    assert "sociale" not in libelles and "évaluation" not in libelles
    assert payload["visas"]
    assert "mouvements" not in payload

    dossiers = next(item for item in payload["modules"] if item["cle"] == "dossiers")
    assert dossiers["lien"] == "/app/dossiers"
    assert dossiers["valeur"] == f"{Agent.objects.count():_}".replace("_", " ")
    assert {item["cle"] for item in payload["modules"]} >= {
        "absences", "conges", "discipline", "fin", "social", "formation", "besoins", "recrutement", "communication",
    }


def _ouvrir_tableau_de_bord(matricule: str) -> None:
    from personnel.models import ModuleHabilitation, Profil
    from personnel.utilisateurs import _defaut_role

    profil = Profil.objects.get(user__username=matricule)
    modules = ModuleHabilitation.objects.all()
    fonction = modules.get(libelle="Statistiques & RBAC").fonctions.get(libelle="Tableau de bord")
    profil.habilitations = _defaut_role(profil.role, len(modules))
    profil.precisions = {str(fonction.pk): "lecture"}
    profil.save()


def test_rapport_pilotage_selon_le_perimetre(api):
    from personnel.models import Agent

    anonyme = api.get("/api/v1/dashboard/rapport/")
    assert anonyme.status_code == 401

    ministere = api.get("/api/v1/dashboard/rapport/", HTTP_AUTHORIZATION=f"Token {_token(api)}")
    assert ministere.status_code == 200
    assert ministere["Content-Type"] == "application/pdf"
    assert "rapport-pilotage-" in ministere["Content-Disposition"]
    assert ministere.content.startswith(b"%PDF")
    assert b"PILOTAGE" in ministere.content
    assert b"Ensemble des agents" in ministere.content
    assert f"retient {Agent.objects.count()} agents".encode() in ministere.content

    # Un agent simple n'a pas le tableau de bord : le serveur le refuse comme le menu. Une habilitation particulière l'ouvre sur son seul périmètre.
    assert api.get("/api/v1/dashboard/rapport/", **_connexion(api, "318490K")).status_code == 403
    _ouvrir_tableau_de_bord("318490K")
    restreint = api.get("/api/v1/dashboard/rapport/", **_connexion(api, "318490K"))
    assert restreint.status_code == 200
    assert restreint.content.startswith(b"%PDF")
    assert b"318490K" in restreint.content
    assert b"retient 1 agent" in restreint.content
    assert b"KOFFI" not in restreint.content
    assert b"Ensemble des agents" not in restreint.content
    assert f"retient {Agent.objects.count()} agents".encode() not in restreint.content


def test_mauvais_mot_de_passe(api):
    response = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "incorrect"},
        format="json",
    )
    assert response.status_code == 401


def test_dossier_agent(api):
    login = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"},
        format="json",
    )
    token = login.json()["token"]
    dossier = api.get("/api/v1/agents/349812K/", HTTP_AUTHORIZATION=f"Token {token}")
    assert dossier.status_code == 200
    body = dossier.json()
    assert body["nom"] == "KOFFI"
    assert body["conges"]["reliquat"] == 18
    assert body["actes"]
    rubriques = [ligne["libelle"] for ligne in body["situation_administrative"]]
    assert rubriques == [
        "Matricule",
        "Structure",
        "Direction",
        "Sous-Direction",
        "Service",
        "Lieu de Travail",
        "Emploi",
        "Type Agent",
        "Mode Recrutement",
        "Catégorie",
        "Grade",
        "Date de première prise de service (Fonction Publique)",
        "Date de prise de service dans le ministère",
        "Date de prise de service dans l'emploi",
        "Fonction",
        "Date de prise de service dans la fonction",
        "Positions",
    ]
    valeurs = {ligne["libelle"]: ligne["valeur"] for ligne in body["situation_administrative"]}
    assert valeurs["Matricule"] == "349812K"
    assert valeurs["Direction"] == "Direction des Affaires Financières"  # structure des Paramètres
    assert valeurs["Emploi"] == "Corps des Administrateurs Financiers"
    assert valeurs["Type Agent"] == "Fonctionnaire"
    assert valeurs["Mode Recrutement"] == "Concours"
    assert valeurs["Catégorie"] == "Catégorie A"
    assert valeurs["Fonction"] == "Chef de cellule de contrôle financier"
    assert valeurs["Date de prise de service dans le ministère"] == "2018-10-01"
    assert valeurs["Date de prise de service dans l'emploi"] == "2015-01-12"
    assert valeurs["Date de prise de service dans la fonction"] == "2022-03-15"
    assert valeurs["Positions"] == "En activité · En formation"  # en activité, retenu pour un module de formation en cours (jeu de démonstration)
    assert valeurs["Lieu de Travail"].startswith("Immeuble SCIAM")

    anonyme = api.get("/api/v1/agents/349812K/dossier/")
    assert anonyme.status_code == 401
    pdf = api.get("/api/v1/agents/349812K/dossier/", HTTP_AUTHORIZATION=f"Token {token}")
    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert "dossier-349812K.pdf" in pdf["Content-Disposition"]
    assert pdf.content.startswith(b"%PDF")
    assert b"349812K" in pdf.content
    assert b"KOFFI" in pdf.content
    assert b"Compte " in pdf.content
    assert b"DRH-2018-044" in pdf.content


def test_modifier_situation_administrative(api):
    from personnel.models import Agent

    token = _token(api)
    auth = {"HTTP_AUTHORIZATION": f"Token {token}"}
    saisie = {
        "organisme": "dgpe",
        "direction": "Direction des Ressources Humaines",
        "sous_direction": "",
        "service": "Service de la Solde",
        "localisation": "Plateau, Abidjan",
        "emploi": "Administrateur",
        "type_agent": "Fonctionnaire",
        "mode_recrutement": "Concours",
        "categorie": "A",
        "grade": "A5",
        "echelon": "4",
        "prise_service": "2015-01-12",
        "prise_service_ministere": "2018-10-01",
        "prise_service_emploi": "",
        "fonction": "Chef de service",
        "prise_service_fonction": "2024-06-01",
        "situation": "Détachement",
    }
    anonyme = api.patch("/api/v1/agents/349812K/", saisie, format="json")
    assert anonyme.status_code == 401

    response = api.patch("/api/v1/agents/349812K/", saisie, format="json", **auth)
    assert response.status_code == 200
    valeurs = {ligne["libelle"]: ligne["valeur"] for ligne in response.json()["situation_administrative"]}
    assert valeurs["Direction"] == "Direction des Ressources Humaines"
    assert valeurs["Service"] == "Service de la Solde"
    assert valeurs["Sous-Direction"] == ""
    assert valeurs["Emploi"] == "Administrateur"
    assert valeurs["Grade"] == "A5"
    assert valeurs["Catégorie"] == "Catégorie A"
    assert valeurs["Fonction"] == "Chef de service"
    # La position est automatique : celle envoyée par le formulaire est ignorée, l'agent garde la position que ses dates lui donnent.
    assert "Détachement" not in valeurs["Positions"] and valeurs["Positions"].startswith("En activité")
    assert valeurs["Date de première prise de service (Fonction Publique)"] == "2015-01-12"
    assert valeurs["Date de prise de service dans l'emploi"] == ""
    assert valeurs["Date de prise de service dans la fonction"] == "2024-06-01"
    agent = Agent.objects.get(matricule="349812K")
    assert agent.structure == "Service de la Solde"
    assert agent.prise_service_emploi is None
    assert agent.localisation == "Plateau, Abidjan"

    invalide = {**saisie, "prise_service_ministere": "32/13/2020"}
    rejet = api.patch("/api/v1/agents/349812K/", invalide, format="json", **auth)
    assert rejet.status_code == 400
    assert Agent.objects.get(matricule="349812K").situation.startswith("En ")


def test_telecharger_acte_mis_a_disposition(api):
    from personnel.models import Acte

    auth = {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}
    valide = Acte.objects.get(reference="2015-0042/MFPMA")
    anonyme = api.get(f"/api/v1/agents/349812K/actes/{valide.id}/")
    assert anonyme.status_code == 401
    pdf = api.get(f"/api/v1/agents/349812K/actes/{valide.id}/", **auth)
    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert b"2015-0042/MFPMA" in pdf.content

    en_instruction = Acte.objects.get(reference="2026-0231/MPEEP")
    refuse = api.get(f"/api/v1/agents/394812H/actes/{en_instruction.id}/", **auth)
    assert refuse.status_code == 403


def test_depot_et_archive_des_pieces(api, settings, tmp_path):
    import io
    import zipfile

    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel.models import PieceJointe

    settings.MEDIA_ROOT = tmp_path
    auth = {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}
    avant = PieceJointe.objects.filter(agent__matricule="349812K").count()
    fichier = SimpleUploadedFile("cni.pdf", b"%PDF-1.4 piece de test", content_type="application/pdf")
    depot = api.post(
        "/api/v1/agents/349812K/pieces/",
        {"intitule": "CNI", "categorie": "CNI", "fichier": fichier},
        format="multipart",
        **auth,
    )
    assert depot.status_code == 201
    assert PieceJointe.objects.filter(agent__matricule="349812K", intitule="CNI").count() == 1
    assert any(piece["intitule"] == "CNI" for piece in depot.json()["pieces"])

    hors_liste = api.post(
        "/api/v1/agents/349812K/pieces/",
        {"intitule": "Arrêté d'avancement", "categorie": "Actes de carrière", "fichier": SimpleUploadedFile("acte.pdf", b"%PDF-1.4", content_type="application/pdf")},
        format="multipart",
        **auth,
    )
    assert hors_liste.status_code == 400

    refuse = api.post(
        "/api/v1/agents/349812K/pieces/",
        {"intitule": "Script", "categorie": "Autre", "fichier": SimpleUploadedFile("note.exe", b"MZ", content_type="application/octet-stream")},
        format="multipart",
        **auth,
    )
    assert refuse.status_code == 400
    assert PieceJointe.objects.filter(agent__matricule="349812K").count() == avant + 1

    anonyme = api.get("/api/v1/agents/349812K/pieces/archive/")
    assert anonyme.status_code == 401
    archive = api.get("/api/v1/agents/349812K/pieces/archive/", **auth)
    assert archive.status_code == 200
    assert archive["Content-Type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(archive.content)) as zipf:
        noms = zipf.namelist()
    assert "manifeste.xlsx" in noms
    assert any(nom.endswith(".pdf") for nom in noms)


def _token(api) -> str:
    login = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"},
        format="json",
    )
    return login.json()["token"]


def test_dossier_agent_expose_tous_les_onglets(api):
    body = api.get("/api/v1/agents/349812K/", HTTP_AUTHORIZATION=f"Token {_token(api)}").json()
    for onglet in ("evaluations", "absences", "prestations", "formations", "pieces", "visas"):
        assert onglet in body
    assert len(body["evaluations"]) == 3
    assert len(body["visas"]) == 3
    # Les congés annuels 2026 détaillés totalisent les jours consommés.
    pris_2026 = sum(a["jours"] for a in body["absences"] if a["nature"] == "Congé annuel")
    assert pris_2026 == body["conges"]["consommes"]
    assert body["coordonnees"]["courriel"].endswith(".ci")


def test_projection_de_carriere():
    from datetime import date

    from personnel.models import Agent
    from personnel.present import projection

    call_command("seed_demo")
    agent = Agent.objects.get(matricule="349812K")
    # Dernier avancement validé au 1er janvier 2024 : échelon 4 deux ans plus tard.
    resultat = projection(agent, aujourd_hui=date(2025, 6, 1))
    assert resultat["prochain_echelon"] == 4
    assert resultat["date_prochain_echelon"] == "2026-01-01"
    assert resultat["age_limite"] == 65  # grade A4
    assert resultat["date_radiation"] == "2043-06-14"


def test_carrieres_mouvements_et_alertes(api):
    body = api.get("/api/v1/carrieres/", HTTP_AUTHORIZATION=f"Token {_token(api)}").json()
    assert len(body["lignes"]) >= 5
    assert body["mouvements"]
    assert body["alertes"][0]["risque"] == "eleve"
    assert body["pyramide"]


def test_notifications_du_drh(api):
    from personnel.models import Notification

    auth = {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}
    body = api.get("/api/v1/notifications/", **auth).json()
    # Le jeu de démonstration fixe le nombre de non-lues : le test le relit plutôt que de le recopier.
    attendues = Notification.objects.filter(destinataire__username="DRH-2018-044", lue=False).count()
    assert attendues >= 2
    assert body["non_lues"] == attendues
    premiere = body["notifications"][0]
    assert premiere["lue"] is False  # les non-lues d'abord

    api.post(f"/api/v1/notifications/{premiere['id']}/lue/", **auth)
    assert api.get("/api/v1/notifications/", **auth).json()["non_lues"] == attendues - 1

    assert api.post("/api/v1/notifications/tout-lu/", **auth).json()["marquees"] == attendues - 1
    assert api.get("/api/v1/notifications/", **auth).json()["non_lues"] == 0


def test_notification_d_un_autre_utilisateur_introuvable(api):
    from django.contrib.auth.models import User

    from personnel.models import Notification

    autre = User.objects.create_user("autre", password="x")
    cible = Notification.objects.filter(destinataire__username="DRH-2018-044").first()
    api.force_authenticate(autre)
    assert api.post(f"/api/v1/notifications/{cible.id}/lue/").status_code == 404


# --- Actions du DRH -----------------------------------------------------------


def _auth(api) -> dict:
    return {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}


def _non_lues(api, auth) -> int:
    return api.get("/api/v1/notifications/", **auth).json()["non_lues"]


def test_apposer_un_visa_rend_l_acte_executoire(api, tmp_path, settings):
    import base64

    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel.models import Acte, VisaDossier, VisaEnAttente

    settings.MEDIA_ROOT = tmp_path
    auth = _auth(api)
    visa = VisaEnAttente.objects.get(agent__matricule="394812H")
    avant = _non_lues(api, auth)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )

    # Sans image de signature, le visa ne part pas : le document qui circule doit porter la signature.
    refus = api.post(f"/api/v1/visas/{visa.id}/decision/", {"decision": "visa"}, format="json", **auth)
    assert refus.status_code == 409

    signature = SimpleUploadedFile("signature.png", png, content_type="image/png")
    depot = api.post("/api/v1/me/signature/", {"fichier": signature}, format="multipart", **auth)
    assert depot.status_code == 200
    assert depot.json()["signature_url"].startswith("/sigrh/media/")

    reponse = api.post(f"/api/v1/visas/{visa.id}/decision/", {"decision": "visa"}, format="json", **auth)
    assert reponse.status_code == 200
    assert reponse.json()["reference"].startswith("MPEEP-")
    assert reponse.json()["signature"].startswith("/sigrh/media/")
    acte = Acte.objects.get(reference="2026-0231/MPEEP")
    # L'accord autorise le papier à en-tête ; le droit n'est pas encore ouvert.
    assert acte.statut == Acte.Statut.ACCORDE
    fiche = next(item for item in api.get(f"/api/v1/agents/{visa.agent.matricule}/", **auth).json()["actes"] if item["id"] == acte.id)
    assert fiche["signatures"] and fiche["signatures"][0]["signature_url"].startswith("/sigrh/media/")
    assert fiche["scan_url"] == ""
    assert VisaDossier.objects.get(agent=visa.agent, ordre=2).avis == "Visa apposé"
    assert _non_lues(api, auth) == avant + 1
    file = api.get("/api/v1/dashboard/", **auth).json()["visas"]
    assert visa.id not in [item["id"] for item in file]
    assert api.post(f"/api/v1/visas/{visa.id}/decision/", {"decision": "visa"}, format="json", **auth).status_code == 409

    scan = SimpleUploadedFile("entete.png", png, content_type="image/png")
    verse = api.post(f"/api/v1/actes/{acte.id}/scan/", {"fichier": scan}, format="multipart", **auth)
    assert verse.status_code == 200
    acte.refresh_from_db()
    assert acte.statut == Acte.Statut.VALIDE
    assert acte.scan
    fiche = next(item for item in verse.json()["actes"] if item["id"] == acte.id)
    assert fiche["scan_url"].startswith("/sigrh/media/")


def test_decision_de_visa_inconnue(api):
    from personnel.models import VisaEnAttente

    visa = VisaEnAttente.objects.first()
    reponse = api.post(f"/api/v1/visas/{visa.id}/decision/", {"decision": "peut-etre"}, format="json", **_auth(api))
    assert reponse.status_code == 400


def test_transmettre_un_avancement_le_place_dans_la_file_du_drh(api):
    from personnel.models import LigneAvancement

    auth = _auth(api)
    ligne = LigneAvancement.objects.get(agent__matricule="318490K")
    file_avant = len(api.get("/api/v1/dashboard/", **auth).json()["visas"])

    reponse = api.post(f"/api/v1/avancements/{ligne.id}/decision/", {"decision": "transmettre"}, format="json", **auth)
    assert reponse.json()["statut"] == "Transmis à la signature"
    file = api.get("/api/v1/dashboard/", **auth).json()["visas"]
    assert len(file) == file_avant + 1

    # Boucle complète : le visa créé se vise depuis la file, avec la signature déposée.
    import base64

    from django.core.files.uploadedfile import SimpleUploadedFile

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    api.post(
        "/api/v1/me/signature/",
        {"fichier": SimpleUploadedFile("signature.png", png, content_type="image/png")},
        format="multipart",
        **auth,
    )
    nouveau = next(item for item in file if item["agent"]["matricule"] == "318490K")
    assert "J-2" in nouveau["echeance"]
    assert api.post(f"/api/v1/visas/{nouveau['id']}/decision/", {"decision": "visa"}, format="json", **auth).status_code == 200
    assert api.post(f"/api/v1/avancements/{ligne.id}/decision/", {"decision": "renvoyer"}, format="json", **auth).status_code == 409


def test_signer_le_lot_fait_avancer_les_demandes(api, tmp_path, settings):
    import base64

    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    auth = _auth(api)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    assert api.post("/api/v1/demandes/signer-lot/", **auth).status_code == 409
    api.post(
        "/api/v1/me/signature/",
        {"fichier": SimpleUploadedFile("signature.png", png, content_type="image/png")},
        format="multipart",
        **auth,
    )
    from personnel.models import Demande

    a_signer = Demande.objects.filter(etape__startswith="Étape 4").exclude(etape__icontains="papier").count()
    reponse = api.post("/api/v1/demandes/signer-lot/", **auth)
    assert a_signer >= 2 and reponse.json()["signees"] == a_signer
    circuits = api.get("/api/v1/circuits/", **auth).json()
    assert not [d for d in circuits["demandes"] if d["etape"].startswith("Étape 4") and "papier" not in d["etape"]]
    assert api.post("/api/v1/demandes/signer-lot/", **auth).status_code == 409
    dossier = api.get("/api/v1/agents/288103A/", **auth).json()
    demande = next(item for item in dossier["demandes"] if item["reference"] == "DM-2026-0847")
    visa = next(item for item in demande["visas"] if item["ordre"] == 4)
    assert visa["avis"] == "Accord acquis"
    assert visa["titulaire"] == "Kouamé N'Dri"
    assert visa["reference"].startswith("MPEEP-")
    assert "papier à en-tête" in visa["commentaire"]
    # Le visa garde sa propre copie de la signature : la remplacer ensuite ne l'efface pas.
    assert visa["signature_url"]
    api.post(
        "/api/v1/me/signature/",
        {"fichier": SimpleUploadedFile("nouvelle.png", png, content_type="image/png")},
        format="multipart",
        **auth,
    )
    from personnel.models import VisaDemande

    copie = VisaDemande.objects.get(demande__reference="DM-2026-0847", ordre=4).signature
    assert copie.storage.exists(copie.name)


def test_les_visas_de_la_demande_portent_le_commentaire(api):
    auth = _auth(api)
    dossier = api.get("/api/v1/agents/476112P/", **auth).json()
    demande = next(item for item in dossier["demandes"] if item["reference"] == "DM-2026-0852")
    assert [visa["avis"] for visa in demande["visas"]] == [
        "Déposée",
        "Favorable",
        "Complément requis",
        "En attente",
        "En attente",
    ]
    assert demande["visas"][2]["commentaire"] == "Facture normalisée manquante"
    assert demande["visas"][1]["titulaire"]
    assert demande["visas"][2]["date"] is None


def test_registres_de_carriere(api):
    anonyme = api.get("/api/v1/carrieres/registres/")
    assert anonyme.status_code == 401
    auth = _auth(api)
    body = api.get("/api/v1/carrieres/registres/", **auth).json()
    assert body["agents"]
    assert body["absences"]
    agent = next(item for item in body["agents"] if item["matricule"] == "349812K")
    assert agent["conges"]["reliquat"] == 18
    assert agent["radiation"]["date_radiation"]
    assert any(item["nature"] == "Congé annuel" for item in body["absences"])


def test_publier_mouvements_et_generer_tableau(api):
    auth = _auth(api)
    assert api.post("/api/v1/mouvements/publier/", **auth).json()["publies"] == 3
    assert api.post("/api/v1/mouvements/publier/", **auth).status_code == 409
    resultat = api.post("/api/v1/avancements/generer/", **auth).json()
    assert resultat["certifiees"] == 8 and resultat["reservees"] == 2
    tableau = api.get("/api/v1/avancements/export/", **auth)
    assert tableau.status_code == 200
    assert tableau["Content-Type"] == "application/pdf"
    assert tableau.content.startswith(b"%PDF")
    assert b"318490K" in tableau.content
    assert "tableau-avancement-" in tableau["Content-Disposition"]


# --- Messagerie interne -------------------------------------------------------


def _connexion(api, matricule: str) -> dict:
    token = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    return {"HTTP_AUTHORIZATION": f"Token {token}"}


def test_messagerie_non_lus_envoi_et_lecture(api):
    drh = _connexion(api, "DRH-2018-044")
    liste = api.get("/api/v1/messagerie/conversations/", **drh).json()
    assert liste["non_lus"] == 2
    fil = next(c for c in liste["conversations"] if c["interlocuteurs"][0]["matricule"] == "394812H")
    assert fil["non_lus"] == 1 and fil["groupe"] is False

    # Le DRH lit puis répond ; l'agent voit la réponse comme non lue.
    api.post(f"/api/v1/messagerie/conversations/{fil['id']}/lu/", **drh)
    assert api.get("/api/v1/messagerie/conversations/", **drh).json()["non_lus"] == 1
    envoye = api.post(f"/api/v1/messagerie/conversations/{fil['id']}/messages/", {"texte": "Visa apposé ce matin."}, format="json", **drh)
    assert envoye.status_code == 201 and envoye.json()["de_moi"] is True

    agent = _connexion(api, "394812H")
    cote_agent = api.get("/api/v1/messagerie/conversations/", **agent).json()
    assert cote_agent["non_lus"] == 1
    messages = api.get(f"/api/v1/messagerie/conversations/{fil['id']}/messages/", **agent).json()["messages"]
    assert messages[-1]["texte"] == "Visa apposé ce matin." and messages[-1]["de_moi"] is False


def test_messagerie_confidentialite_et_validations(api):
    drh = _connexion(api, "DRH-2018-044")
    fil = api.get("/api/v1/messagerie/conversations/", **drh).json()["conversations"][0]
    # Un agent extérieur à la conversation ne peut ni la lire ni y écrire.
    intrus = _connexion(api, "340188P")
    assert api.get(f"/api/v1/messagerie/conversations/{fil['id']}/messages/", **intrus).status_code == 404
    assert api.post(f"/api/v1/messagerie/conversations/{fil['id']}/messages/", {"texte": "x"}, format="json", **intrus).status_code == 404
    assert api.post(f"/api/v1/messagerie/conversations/{fil['id']}/messages/", {"texte": "   "}, format="json", **drh).status_code == 400
    assert api.post(f"/api/v1/messagerie/conversations/{fil['id']}/messages/", {"texte": "a" * 2001}, format="json", **drh).status_code == 400


def test_bulletin_et_accuse_de_notation(api):
    auth = _auth(api)
    bulletin = api.get("/api/v1/agents/340188P/notations/bulletin/", **auth)
    assert bulletin.status_code == 200
    assert bulletin.content.startswith(b"%PDF")
    assert 'filename="notations-340188P.pdf"' in bulletin["Content-Disposition"]

    dossier = api.get("/api/v1/agents/340188P/", **auth).json()
    assert len(dossier["evaluations"]) == 3
    ouverte = next((item for item in dossier["evaluations"] if "sign" not in item["statut"].lower()), None)
    if ouverte is None:
        refus = api.post(f"/api/v1/agents/340188P/notations/{dossier['evaluations'][0]['id']}/accuser/", **auth)
        assert refus.status_code == 409
        return
    accuse = api.post(f"/api/v1/agents/340188P/notations/{ouverte['id']}/accuser/", **auth)
    assert accuse.status_code == 200
    signee = next(item for item in accuse.json()["evaluations"] if item["id"] == ouverte["id"])
    assert signee["statut"] == "Signée par l'agent"
    second = api.post(f"/api/v1/agents/340188P/notations/{ouverte['id']}/accuser/", **auth)
    assert second.status_code == 409


def test_types_actes_geres(api):
    auth = _auth(api)
    types = api.get("/api/v1/agents/340188P/", **auth).json()["types_actes"]
    assert [item["libelle"] for item in types] == [
        "Arrêté de nomination",
        "Certificate de première prise de service",
        "Cessation",
        "Certificat de prise de service",
        "Acte de nomination dans une fonction",
        "CV",
        "Extrait de naissance",
        "CNI",
    ]


def test_inscription_formation_ouverte_puis_notification(api):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel.models import Notification, SessionFormation

    auth = _auth(api)
    dossier = api.get("/api/v1/agents/340188P/", **auth).json()
    assert [item["code"] for item in dossier["sessions_formations"] if item["type"] == "PREP"] == ["prep-admin", "prep-redacteur"]
    types = {item["code"]: item for item in dossier["types_formations"]}
    assert types["PREP"]["piece_requise"] is True
    assert types["PREP"]["piece_libelle"] == "Document d'inscription au concours"
    assert all(not item["piece_requise"] for code, item in types.items() if code != "PREP")

    SessionFormation.objects.filter(code="spec-controle").update(ouverte=False)
    fermee = api.post("/api/v1/agents/340188P/formations/inscription/", {"code": "spec-controle"}, format="json", **auth)
    assert fermee.status_code == 400
    inconnue = api.post("/api/v1/agents/340188P/formations/inscription/", {"code": "autre"}, format="json", **auth)
    assert inconnue.status_code == 400
    sans_piece = api.post("/api/v1/agents/340188P/formations/inscription/", {"code": "prep-admin"}, format="json", **auth)
    assert sans_piece.status_code == 400

    fichier = SimpleUploadedFile("inscription.pdf", b"%PDF-1.4 inscription", content_type="application/pdf")
    depot = api.post(
        "/api/v1/agents/340188P/formations/inscription/",
        {"code": "prep-admin", "fichier": fichier},
        format="multipart",
        **auth,
    )
    assert depot.status_code == 201
    demande = next(item for item in depot.json()["demandes"] if "administrateur civil" in item["nature"])
    assert demande["categorie"] == "formation"
    assert demande["etape"].startswith("Étape 2")
    assert api.post("/api/v1/agents/340188P/formations/inscription/", {"code": "prep-admin"}, format="json", **auth).status_code == 400
    # Un autre module ouvert (carr-fonction, en cours, est fermé aux inscriptions).
    assert api.post("/api/v1/agents/340188P/formations/inscription/", {"code": "perf-pilotage"}, format="json", **auth).status_code == 201

    reference = demande["reference"]
    notifiee = False
    etape = ""
    for _ in range(4):
        visa = api.post(f"/api/v1/demandes/{reference}/valider/", format="json", **auth)
        assert visa.status_code == 200
        notifiee = visa.json()["notifiee"]
        etape = visa.json()["etape"]
        if notifiee:
            break
    assert notifiee
    assert etape.startswith("Étape 5")
    message = Notification.objects.filter(destinataire__username="340188P", titre="Prise en compte pour une formation").latest("id").message
    assert "en compte" in message
    assert "Préparation" in message


def test_types_de_formation(api):
    auth = _auth(api)
    types = api.get("/api/v1/agents/340188P/", **auth).json()["types_formations"]
    assert [item["libelle"] for item in types] == [
        "Cycles de Préparation aux concours professionnels",
        "Cycles et stage de formation d'accompagnement de carrière",
        "Cycles et stage de formation catégorielle",
        "Cycles, séminaire et stage de perfectionnement",
        "Cycles et stage de spécialisation",
    ]
    assert types[0]["publics"] == ["Fonctionnaires candidats"]
    assert types[1]["publics"] == [
        "Fonctionnaires admis aux concours professionnel bénéficiaires",
        "Fonctionnaires nommés à un poste de responsabilité",
    ]
    assert types[2]["publics"] == ["Fonctionnaires admis aux concours professionnel bénéficiaires"]
    assert types[3]["publics"] == ["Fonctionnaires bénéficiaires"]
    assert types[4]["publics"] == ["Fonctionnaires bénéficiaires"]


def test_types_de_fin_de_carriere(api):
    auth = _auth(api)
    types = api.get("/api/v1/carrieres/types-fin-carriere/", **auth).json()
    assert [item["libelle"] for item in types] == [
        "Démission",
        "Licenciement",
        "Révocation",
        "Admission à la retraite",
        "Décès",
    ]


def test_depot_de_conge_entre_dans_le_circuit(api):
    auth = _auth(api)
    incomplet = api.post("/api/v1/agents/340188P/conges/demande/", {}, format="json", **auth)
    assert incomplet.status_code == 400
    inverse = api.post(
        "/api/v1/agents/340188P/conges/demande/",
        {"type": "conge-annuel", "debut": "2026-05-18", "fin": "2026-05-04", "interim": "KOFFI Yao Christian"},
        format="json",
        **auth,
    )
    assert inverse.status_code == 400
    depot = api.post(
        "/api/v1/agents/340188P/conges/demande/",
        {
            "type": "conge-annuel",
            "debut": "2026-05-04",
            "fin": "2026-05-18",
            "interim": "KOFFI Yao Christian",
            "observations": "Résidence à Bouaké",
        },
        format="json",
        **auth,
    )
    assert depot.status_code == 201
    demande = next(item for item in depot.json()["demandes"] if item["nature"] == "Congé annuel (14 j)")  # week-ends compris
    assert demande["categorie"] == "conge"
    assert demande["etape"].startswith("Étape 2")
    assert demande["visas"][0]["avis"] == "Déposée"
    assert "KOFFI Yao Christian" in demande["visas"][0]["commentaire"]
    assert demande["visas"][1]["avis"] == "En attente"
    assert len(demande["visas"]) == 5


def test_types_de_conges(api):
    auth = _auth(api)
    types = api.get("/api/v1/agents/340188P/", **auth).json()["types_conges"]
    assert [item["libelle"] for item in types] == [
        "Congé annuel",
        "Congé de maternité",
        "Congé de paternité",
        "Congé parental",
        "Congé de maladie",
    ]
    assert [item["libelle"] for item in types[-1]["enfants"]] == [
        "Congé de maladie de courte durée",
        "Congé de maladie de longue durée",
    ]
    assert types[0]["enfants"] == []


def test_dossier_conges_vient_de_la_base(api):
    auth = _auth(api)
    dossier = api.get("/api/v1/agents/340188P/", **auth).json()
    assert dossier["conges"]["reliquat"] == dossier["conges"]["acquis"] - dossier["conges"]["consommes"]
    assert dossier["conges"]["report"] == 0
    assert dossier["conges"]["autorisations"] == 10
    assert dossier["presence"]["quorum"] == 65
    assert dossier["presence"]["membres"][0]["vous"] is True
    assert dossier["presence"]["membres"][0]["nom"].startswith("ADJOUMANI")
    assert all("notifi" in item["etape"].lower() or "étape 5" in item["etape"].lower() for item in dossier["demandes"] if item["categorie"] == "conge")
    ouverte = api.get("/api/v1/agents/288103A/", **auth).json()
    conge = next(item for item in ouverte["demandes"] if item["categorie"] == "conge")
    assert "Étape 4" in conge["etape"]
    assert len(conge["visas"]) == 5


def test_releve_de_conges(api):
    auth = _auth(api)
    releve = api.get("/api/v1/agents/340188P/conges/releve/", **auth)
    assert releve.status_code == 200
    assert releve.content.startswith(b"%PDF")
    assert 'filename="conges-340188P.pdf"' in releve["Content-Disposition"]


def test_dossier_social_vient_de_la_base(api):
    auth = _auth(api)
    dossier = api.get("/api/v1/agents/340188P/", **auth).json()
    social = dossier["social"]
    assert social["cmu"]
    assert not {"traitement_brut", "cotisations", "solde_nette", "quotite", "marge"} & set(social)
    assert social["enveloppe"]["allouee"] == 120_000_000
    assert social["enveloppe"]["engagee"] == 72_800_000
    assert social["enveloppe"]["ligne"] == "7412-Action-Soc"
    assert social["enveloppe"]["reliquat"] == 47_200_000
    assert isinstance(social["ayants_droit"], list)
    assert any(item["code"] == "secours-deces" for item in social["dispositifs"])


def test_rapport_social(api):
    auth = _auth(api)
    rapport = api.get("/api/v1/agents/340188P/social/rapport/", **auth)
    assert rapport.status_code == 200
    assert rapport.content.startswith(b"%PDF")
    assert 'filename="social-340188P.pdf"' in rapport["Content-Disposition"]


def test_photo_de_profil_de_l_agent(api, tmp_path, settings):
    import base64

    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    auth = _auth(api)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    vide = api.get("/api/v1/agents/340188P/", **auth)
    assert vide.status_code == 200
    assert vide.json()["photo_url"] == ""
    dossier_sans_photo = api.get("/api/v1/agents/340188P/dossier/", **auth)
    assert dossier_sans_photo.status_code == 200

    refuse = api.post("/api/v1/agents/340188P/photo/", {}, format="multipart", **auth)
    assert refuse.status_code == 400

    depot = api.post(
        "/api/v1/agents/340188P/photo/",
        {"fichier": SimpleUploadedFile("portrait.png", png, content_type="image/png")},
        format="multipart",
        **auth,
    )
    assert depot.status_code == 200
    assert depot.json()["photo_url"].startswith("/sigrh/media/")
    session = api.post("/api/v1/auth/login/", {"matricule": "340188P", "password": "Sigrh-Dev-2026"}, format="json")
    assert session.status_code == 200
    assert session.json()["user"]["photo_url"] == depot.json()["photo_url"]
    portrait = api.get(depot.json()["photo_url"])
    assert portrait.status_code == 200
    assert b"".join(portrait.streaming_content).startswith(b"\x89PNG")
    assert api.get("/api/v1/agents/", **auth).json()
    trouve = next(agent for agent in api.get("/api/v1/agents/", **auth).json() if agent["matricule"] == "340188P")
    assert trouve["photo_url"].endswith(".png")
    dossier_avec_photo = api.get("/api/v1/agents/340188P/dossier/", **auth)
    assert dossier_avec_photo.status_code == 200
    assert dossier_avec_photo.content.count(b"/Subtype /Image") == dossier_sans_photo.content.count(b"/Subtype /Image") + 1


def test_photo_de_la_ministre_dans_les_parametres(api, tmp_path, settings):
    import base64

    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    auth = _auth(api)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    assert api.get("/api/v1/public/accueil/").json()["photo_ministre_url"] == ""
    depart = api.get("/api/v1/parametres/", **auth).json()
    assert depart["photo_url"] == ""
    assert depart["peut_modifier"] is True
    assert depart["inactivite_minutes"] == 15
    assert depart["delais"] == {"visa_acte_jours": 2, "validation_hierarchie_jours": 3, "quorum_presence_pourcent": 65}
    assert depart["civilite"] == ""
    assert depart["nom"] == ""

    agent = api.post("/api/v1/auth/login/", {"matricule": "340188P", "password": "Sigrh-Dev-2026"}, format="json")
    assert agent.status_code == 200
    agent_auth = {"HTTP_AUTHORIZATION": f"Token {agent.json()['token']}"}
    refuse = api.post(
        "/api/v1/parametres/photo/",
        {"fichier": SimpleUploadedFile("portrait.png", png, content_type="image/png")},
        format="multipart",
        **agent_auth,
    )
    assert refuse.status_code == 403

    vide = api.post("/api/v1/parametres/photo/", {}, format="multipart", **auth)
    assert vide.status_code == 400
    texte = api.post(
        "/api/v1/parametres/photo/",
        {"fichier": SimpleUploadedFile("note.txt", b"pas une image", content_type="text/plain")},
        format="multipart",
        **auth,
    )
    assert texte.status_code == 400

    depot = api.post(
        "/api/v1/parametres/photo/",
        {"fichier": SimpleUploadedFile("portrait.png", png, content_type="image/png")},
        format="multipart",
        **auth,
    )
    assert depot.status_code == 200
    assert depot.json()["photo_url"].startswith("/sigrh/media/")
    assert api.get("/api/v1/public/accueil/").json()["photo_ministre_url"] == depot.json()["photo_url"]
    portrait = api.get(depot.json()["photo_url"])
    assert portrait.status_code == 200
    assert b"".join(portrait.streaming_content).startswith(b"\x89PNG")

    retire = api.delete("/api/v1/parametres/photo/retirer/", **auth)
    assert retire.status_code == 200
    assert retire.json()["photo_url"] == ""
    assert api.get("/api/v1/public/accueil/").json()["photo_ministre_url"] == ""

    refuse_nom = api.post(
        "/api/v1/parametres/identite/",
        {"civilite": "Madame", "nom": "Koné Mariétou"},
        format="json",
        **agent_auth,
    )
    assert refuse_nom.status_code == 403
    invalide = api.post("/api/v1/parametres/identite/", {"civilite": "Docteur", "nom": "Koné"}, format="json", **auth)
    assert invalide.status_code == 400
    identite = api.post(
        "/api/v1/parametres/identite/",
        {"civilite": "Madame", "nom": "  Koné Mariétou  "},
        format="json",
        **auth,
    )
    assert identite.status_code == 200
    assert identite.json()["civilite"] == "Madame"
    assert identite.json()["nom"] == "Koné Mariétou"
    assert identite.json()["matricule"] == "MINISTRE"
    from django.contrib.auth.models import User
    ministre = User.objects.get(username="MINISTRE")
    assert ministre.last_name == "Koné" and ministre.first_name == "Mariétou"
    assert ministre.profil.role == "Ministre" and ministre.profil.structure.niveau == "ministere" and ministre.profil.superieur_id is None
    refuse_delai = api.post("/api/v1/parametres/inactivite/", {"minutes": 30}, format="json", **agent_auth)
    assert refuse_delai.status_code == 403
    delai_invalide = api.post("/api/v1/parametres/inactivite/", {"minutes": 0}, format="json", **auth)
    assert delai_invalide.status_code == 400
    delai = api.post("/api/v1/parametres/inactivite/", {"minutes": 20}, format="json", **auth)
    assert delai.status_code == 200
    assert delai.json()["inactivite_minutes"] == 20
    refuse_delais = api.post(
        "/api/v1/parametres/delais/",
        {"visa_acte_jours": 5, "validation_hierarchie_jours": 7},
        format="json",
        **agent_auth,
    )
    assert refuse_delais.status_code == 403
    delais_invalides = api.post(
        "/api/v1/parametres/delais/",
        {"visa_acte_jours": 0, "validation_hierarchie_jours": 7},
        format="json",
        **auth,
    )
    assert delais_invalides.status_code == 400
    delais = api.post(
        "/api/v1/parametres/delais/",
        {"visa_acte_jours": 5, "validation_hierarchie_jours": 7},
        format="json",
        **auth,
    )
    assert delais.status_code == 200
    assert delais.json()["delais"] == {"visa_acte_jours": 5, "validation_hierarchie_jours": 7, "quorum_presence_pourcent": 65}
    assert api.get("/api/v1/public/couleurs/").json() == {"principale": "#042F32", "accent": "#D6FFCB"}
    refuse_couleurs = api.post("/api/v1/parametres/couleurs/", {"principale": "#112233", "accent": "#ddeeff"}, format="json", **agent_auth)
    assert refuse_couleurs.status_code == 403
    couleur_invalide = api.post("/api/v1/parametres/couleurs/", {"principale": "vert", "accent": "#ddeeff"}, format="json", **auth)
    assert couleur_invalide.status_code == 400
    couleurs = api.post("/api/v1/parametres/couleurs/", {"principale": "#112233", "accent": "#ddeeff"}, format="json", **auth)
    assert couleurs.status_code == 200
    assert couleurs.json()["couleurs"] == {"principale": "#112233", "accent": "#DDEEFF"}
    assert api.get("/api/v1/public/couleurs/").json() == {"principale": "#112233", "accent": "#DDEEFF"}
    publique = api.get("/api/v1/public/accueil/").json()["ministre"]
    assert publique == {"civilite": "Madame", "nom": "Koné Mariétou"}
    efface = api.post("/api/v1/parametres/identite/", {"civilite": "", "nom": ""}, format="json", **auth)
    assert efface.status_code == 200
    assert efface.json()["civilite"] == ""
    assert efface.json()["nom"] == ""


def test_la_connexion_suit_les_parametres_admin(api, settings):
    from django.contrib.auth.models import User

    from personnel.connexion_admin import assurer_administrateur
    from personnel.models import ParametresMinistere

    settings.CONNEXION_OUVERTE = False
    settings.ADMIN_MATRICULE = ""
    settings.ADMIN_MOT_DE_PASSE = ""
    ParametresMinistere.objects.update_or_create(pk=1, defaults={"connexion_active": False, "admin_matricule": ""})
    ferme = api.get("/api/v1/public/connexion/")
    assert ferme.status_code == 200
    assert ferme.json()["active"] is False
    compte = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"},
        format="json",
    )
    assert compte.status_code == 200

    settings.ADMIN_MATRICULE = "ADM-2026-001"
    settings.ADMIN_MOT_DE_PASSE = "Cabinet-Admin-2026"
    settings.ADMIN_NOM = "Koné"
    settings.ADMIN_PRENOMS = "Awa"
    settings.ADMIN_FONCTION = "Administrateur"
    settings.ADMIN_ORGANISME = "dgpe"
    assurer_administrateur()
    ouverte = api.get("/api/v1/public/connexion/")
    assert ouverte.json()["active"] is True
    login = api.post(
        "/api/v1/auth/login/",
        {"matricule": "ADM-2026-001", "password": "Cabinet-Admin-2026", "organisme": "dgpe"},
        format="json",
    )
    assert login.status_code == 200
    auth = {"HTTP_AUTHORIZATION": f"Token {login.json()['token']}"}
    session = api.get("/api/v1/me/", **auth).json()
    assert session["administrateur"] is True
    assert session["acces"]["fonctions"]["Statistiques & RBAC|Paramètres"] == "validation"
    assert session["acces"]["fonctions"]["Statistiques & RBAC|Habilitations"] == "validation"
    annuaire = api.get("/api/v1/utilisateurs/", **auth).json()
    assert annuaire["administrateur"] is True
    assert "ADM-2026-001" not in {item["matricule"] for item in annuaire["utilisateurs"]}
    admin = User.objects.select_related("profil").get(username="ADM-2026-001")
    assert admin.profil.role == "Administrateur"
    assert admin.profil.structure_id is None
    assert admin.profil.superieur_id is None
    assert api.patch("/api/v1/utilisateurs/ADM-2026-001/", {"nom": "Koné"}, format="json", **auth).status_code == 400
    agent = api.post("/api/v1/auth/login/", {"matricule": "340188P", "password": "Sigrh-Dev-2026"}, format="json")
    assert api.post(
        "/api/v1/parametres/connexion/",
        {"matricule": "ADM-2026-001", "nom": "Koné", "prenoms": "Awa", "fonction": "Administrateur", "organisme": "dgpe", "mot_de_passe": "Autre-Passe-2026", "confirmation": "Autre-Passe-2026"},
        format="json",
        **{"HTTP_AUTHORIZATION": f"Token {agent.json()['token']}"},
    ).status_code == 403

    enregistre = api.post(
        "/api/v1/parametres/connexion/",
        {
            "matricule": "ADM-2026-002",
            "nom": "Koné",
            "prenoms": "Awa",
            "fonction": "Administrateur général",
            "organisme": "dgpe",
            "mot_de_passe": "Autre-Passe-2026",
            "confirmation": "Autre-Passe-2026",
        },
        format="json",
        **auth,
    )
    assert enregistre.status_code == 200
    assert enregistre.json()["connexion"]["matricule"] == "ADM-2026-002"
    assert api.post(
        "/api/v1/auth/login/",
        {"matricule": "ADM-2026-001", "password": "Cabinet-Admin-2026"},
        format="json",
    ).status_code == 401
    suivant = api.post(
        "/api/v1/auth/login/",
        {"matricule": "ADM-2026-002", "password": "Autre-Passe-2026", "organisme": "dgpe"},
        format="json",
    )
    assert suivant.status_code == 200
    assert User.objects.filter(username="ADM-2026-002", last_name="Koné").exists()

    settings.ADMIN_MATRICULE = "ADM-2026-001"
    settings.ADMIN_MOT_DE_PASSE = "Cabinet-Admin-2026"
    assurer_administrateur()
    assert User.objects.filter(username="ADM-2026-002").exists()
    assert not User.objects.filter(username="ADM-2026-001").exists()


def test_configurer_un_circuit_et_l_attribuer(api):
    auth = _auth(api)
    vide = api.get("/api/v1/circuits/configuration/", **auth).json()
    assert vide["circuits"] == []
    assert [item["role"] for item in vide["roles"]] == [
        "Chef de service",
        "Sous directeur",
        "Directeur",
        "Directeur général",
        "Ministre",
    ]
    assert "Congé annuel" in [item["libelle"] for item in vide["elements"]["conges"]]
    assert "Congé de maternité" in [item["libelle"] for item in vide["elements"]["conges"]]
    assert "Autorisation d'absence (événement familial)" in [item["libelle"] for item in vide["elements"]["absences"]]

    refuse = api.post("/api/v1/circuits/configuration/", {"nom": "Sans étape", "etapes": []}, format="json", **auth)
    assert refuse.status_code == 400

    cree = api.post(
        "/api/v1/circuits/configuration/",
        {
            "nom": "Circuit maternité",
            "etapes": [
                {"instance": "Chef de service", "fonction": "Avis hiérarchique"},
                {"instance": "Sous directeur", "fonction": "Contrôle de légalité"},
            ],
            "attributions": [
                {"famille": "conge", "code": "conge-maternite"},
                {"famille": "absence", "code": "evenement-familial"},
            ],
        },
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    corps = cree.json()
    assert [etape["instance"] for etape in corps["etapes"]] == ["Chef de service", "Sous directeur"]
    assert {item["libelle"] for item in corps["attributions"]} == {
        "Congé de maternité",
        "Autorisation d'absence (événement familial)",
    }

    deplace = api.post(
        "/api/v1/circuits/configuration/",
        {
            "nom": "Circuit parental",
            "etapes": [{"instance": "Directeur", "fonction": "Visa unique"}],
            "attributions": [{"famille": "conge", "code": "conge-maternite"}],
        },
        format="json",
        **auth,
    )
    assert deplace.status_code == 201
    config = api.get("/api/v1/circuits/configuration/", **auth).json()
    maternite = next(item for item in config["elements"]["conges"] if item["code"] == "conge-maternite")
    assert maternite["circuit_id"] == deplace.json()["id"]
    familial = next(item for item in config["elements"]["absences"] if item["code"] == "evenement-familial")
    assert familial["circuit_id"] == corps["id"]

    depot = api.post(
        "/api/v1/agents/340188P/conges/demande/",
        {
            "type": "conge-maternite",
            "debut": "2026-06-01",
            "fin": "2026-06-05",
            "interim": "KOFFI Yao Christian",
        },
        format="json",
        **auth,
    )
    assert depot.status_code == 201
    demande = next(item for item in depot.json()["demandes"] if item["nature"].startswith("Congé de maternité"))
    assert demande["etape"] == "Étape 2 : Directeur"
    assert [visa["instance"] for visa in demande["visas"]] == ["Requête déposée", "Directeur"]
    assert demande["visas"][1]["fonction"] == "Visa unique"

    annuel = api.post(
        "/api/v1/agents/340188P/conges/demande/",
        {
            "type": "conge-annuel",
            "debut": "2026-07-06",
            "fin": "2026-07-10",
            "interim": "KOFFI Yao Christian",
        },
        format="json",
        **auth,
    )
    assert annuel.status_code == 201
    sans_circuit = next(item for item in annuel.json()["demandes"] if item["nature"].startswith("Congé annuel"))
    assert len(sans_circuit["visas"]) == 5

    retrait = api.delete(f"/api/v1/circuits/configuration/{deplace.json()['id']}/", **auth)
    assert retrait.status_code == 200
    apres = api.get("/api/v1/circuits/configuration/", **auth).json()
    rendu = next(item for item in apres["elements"]["conges"] if item["code"] == "conge-maternite")
    assert rendu["circuit_id"] is None


def test_messagerie_nouvelle_conversation_et_annuaire(api):
    drh = _connexion(api, "DRH-2018-044")
    annuaire = api.get("/api/v1/messagerie/annuaire/?q=adjou", **drh).json()
    assert [p["matricule"] for p in annuaire] == ["340188P"]
    assert "DRH-2018-044" not in [p["matricule"] for p in api.get("/api/v1/messagerie/annuaire/", **drh).json()]

    premiere = api.post("/api/v1/messagerie/conversations/", {"destinataire": annuaire[0]["id"]}, format="json", **drh).json()
    seconde = api.post("/api/v1/messagerie/conversations/", {"destinataire": annuaire[0]["id"]}, format="json", **drh).json()
    assert premiere["id"] == seconde["id"]  # l'échange à deux est retrouvé, pas dupliqué
    # L'échange existant avec KOUASSI est réutilisé aussi.
    kouassi = api.get("/api/v1/messagerie/annuaire/?q=kouassi", **drh).json()[0]
    existante = api.post("/api/v1/messagerie/conversations/", {"destinataire": kouassi["id"]}, format="json", **drh).json()
    assert existante["dernier_message"] is not None


def test_dotation_et_expression_des_besoins(api):
    auth = _auth(api)
    page = api.get("/api/v1/dotation/", **auth)
    assert page.status_code == 200
    corps = page.json()
    # L'effectif se compte dans le registre des agents : aucun chiffre figé.
    assert corps["effectif"] == sum(branche["effectif"] for branche in corps["branches"])
    from personnel.models import Agent

    assert 0 < corps["effectif"] <= Agent.objects.count()
    assert corps["plafond"] == corps["effectif"] + sum(branche["besoins"] for branche in corps["branches"])
    assert all(branche["plafond"] == branche["effectif"] + branche["besoins"] for branche in corps["branches"])
    assert len(corps["demandes"]) == 4
    assert "masse_salariale" not in corps
    assert "economie" not in corps

    refuse = api.post("/api/v1/dotation/plans/", {"poste": ""}, format="json", **auth)
    assert refuse.status_code == 400
    assert any(item["libelle"] == "Agents administratifs" for item in corps["postes"])
    inconnu = api.post(
        "/api/v1/dotation/plans/",
        {
            "entite": "drh",
            "direction": "Direction des Ressources Humaines",
            "poste": "Géologue de réservoir",
            "nature": "affectation",
            "impact": 1,
        },
        format="json",
        **auth,
    )
    assert inconnu.status_code == 400

    cree = api.post(
        "/api/v1/dotation/plans/",
        {
            "entite": "drh",
            "direction": "Direction des Ressources Humaines",
            "poste": "Agents administratifs",
            "nature": "affectation",
            "impact": 1,
            "detail": "Renfort du plateau technique",
        },
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    reference = cree.json()["reference"]
    assert reference.startswith("REC-2026-")
    modifie = api.post(
        f"/api/v1/dotation/demandes/{reference}/modifier/",
        {
            "entite": "drh",
            "direction": "Direction des Ressources Humaines",
            "poste": "Corps des Administrateurs Civils",
            "nature": "affectation",
            "impact": 1,
            "detail": "Renfort du plateau technique",
        },
        format="json",
        **auth,
    )
    assert modifie.status_code == 200
    assert modifie.json()["poste"] == "Corps des Administrateurs Civils"

    sans_motif = api.post(
        f"/api/v1/dotation/demandes/{reference}/instruire/",
        {"statut": "acte", "motif": "  "},
        format="json",
        **auth,
    )
    assert sans_motif.status_code == 400

    instruit = api.post(
        f"/api/v1/dotation/demandes/{reference}/instruire/",
        {"statut": "acte", "motif": "Poste couvert par le plafond de la branche.", "visa": "Visa DRH"},
        format="json",
        **auth,
    )
    assert instruit.status_code == 200
    assert instruit.json()["statut"] == "acte"

    notifie = api.post(f"/api/v1/dotation/demandes/{reference}/notifier/", {}, format="json", **auth)
    assert notifie.status_code == 200
    assert notifie.json()["notifiee"] is True
    encore = api.post(f"/api/v1/dotation/demandes/{reference}/notifier/", {}, format="json", **auth)
    assert encore.status_code == 409
    retire = api.post(f"/api/v1/dotation/demandes/{reference}/supprimer/", {}, format="json", **auth)
    assert retire.status_code == 200
    assert all(item["reference"] != reference for item in api.get("/api/v1/dotation/", **auth).json()["demandes"])

    plafond = api.post(
        "/api/v1/dotation/branches/cabinet/plafond/",
        {"plafond": 950, "motif": "Marge pour les structures du cabinet"},
        format="json",
        **auth,
    )
    assert plafond.status_code == 400

    import io
    import zipfile

    export = api.get("/api/v1/dotation/export/", **auth)
    assert export.status_code == 200
    assert export.content[:2] == b"PK"
    assert "Référence" in zipfile.ZipFile(io.BytesIO(export.content)).read("xl/worksheets/sheet1.xml").decode("utf-8")

    gestion = api.get("/api/v1/dotation/export/pdf/", **auth)
    assert gestion.status_code == 200
    assert gestion.content.startswith(b"%PDF")
    assert "gestion-dotation-" in gestion.headers["Content-Disposition"]
    assert b"Plafond" in gestion.content

    inconnue = api.post(
        "/api/v1/dotation/alertes/",
        {"entite": "drh", "intitule": "Poste imaginaire", "detail": "Vacance.", "postes": 1, "jours": 1, "piste": "Recrutement"},
        format="json",
        **auth,
    )
    assert inconnue.status_code == 400
    creee = api.post(
        "/api/v1/dotation/alertes/",
        {
            "entite": "drh",
            "intitule": "Cadres des sociétés d'État",
            "detail": "Vacance signalée par la direction.",
            "postes": 2,
            "jours": 12,
            "piste": "Mobilité interne",
        },
        format="json",
        **auth,
    )
    assert creee.status_code == 201
    alerte = creee.json()
    assert alerte["traitee"] is False and alerte["entite_code"] == "drh"
    modifiee = api.post(
        f"/api/v1/dotation/alertes/{alerte['id']}/modifier/",
        {
            "entite": "drh",
            "intitule": "Cadres des sociétés d'État",
            "detail": "Vacance confirmée.",
            "postes": 3,
            "jours": 15,
            "piste": "Mobilité interne",
        },
        format="json",
        **auth,
    )
    assert modifiee.status_code == 200
    assert modifiee.json()["postes"] == 3
    assert any(item["id"] == alerte["id"] and item["postes"] == 3 for item in api.get("/api/v1/dotation/", **auth).json()["alertes"])
    retiree = api.post(f"/api/v1/dotation/alertes/{alerte['id']}/supprimer/", {}, format="json", **auth)
    assert retiree.status_code == 200
    assert all(item["id"] != alerte["id"] for item in api.get("/api/v1/dotation/", **auth).json()["alertes"])

    besoins = api.get("/api/v1/besoins/", **auth)
    assert besoins.status_code == 200
    assert besoins.json()["totaux"]["volume"] == 16
    assert len(besoins.json()["fiches"]) == 5

    plan = api.get("/api/v1/besoins/export/", **auth)
    assert plan.status_code == 200
    assert plan.content.startswith(b"%PDF")


def test_gestion_des_utilisateurs(api):
    auth = _auth(api)
    liste = api.get("/api/v1/utilisateurs/", **auth)
    assert liste.status_code == 200
    corps = liste.json()
    matricules = {item["matricule"] for item in corps["utilisateurs"]}
    assert "DRH-2018-044" in matricules
    drh = next(item for item in corps["utilisateurs"] if item["matricule"] == "DRH-2018-044")
    assert drh["role"] == "Directeur" and drh["moi"] is True and drh["alerte"] == ""
    koffi = next(item for item in corps["utilisateurs"] if item["matricule"] == "349812K")
    assert koffi["alerte"] == ""
    from personnel.models import Profil

    Profil.objects.filter(user__username="349812K").update(structure=None)
    koffi = next(item for item in api.get("/api/v1/utilisateurs/", **auth).json()["utilisateurs"] if item["matricule"] == "349812K")
    # Le dossier de l'agent porte déjà son rattachement : la liste ne déclare pas « sans structure » un agent rattaché.
    assert koffi["structure"] and koffi["structure_nom"]
    assert koffi["alerte"] != "Ce compte n'est rattaché à aucune structure."
    from personnel.models import Agent

    Agent.objects.filter(matricule="349812K").update(service="", sous_direction="", direction="", structure="Hors organigramme")
    koffi = next(item for item in api.get("/api/v1/utilisateurs/", **auth).json()["utilisateurs"] if item["matricule"] == "349812K")
    assert koffi["structure"] == ""
    assert koffi["alerte"] == "Ce compte n'est rattaché à aucune structure."

    hors_hierarchie = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-SG",
            "nom": "Bamba",
            "prenoms": "Awa",
            "fonction": "Cheffe de service",
            "role": "Chef de service",
            "structure": "sgpte",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert hors_hierarchie.status_code == 400

    couvert = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-N1",
            "nom": "Bamba",
            "prenoms": "Awa",
            "fonction": "Cheffe de service",
            "role": "Chef de service",
            "structure": "sgpte",
            "superieur": "",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert couvert.status_code == 201
    assert "compétences" in couvert.json()["interim"]
    from personnel.models import Publication
    note = Publication.objects.get(perimetre_detail="interim:dse:USR-2026-N1")
    assert note.nature == "note" and note.statut == "diffuse"
    assert "Direction de la Stratégie et de l'Expertise" in note.corps
    assert "dans la limite des compétences" in note.corps

    toujours = api.patch(
        "/api/v1/utilisateurs/USR-2026-N1/",
        {"fonction": "Cheffe de service par intérim"},
        format="json",
        **auth,
    )
    assert toujours.status_code == 200
    assert Publication.objects.filter(perimetre_detail="interim:dse:USR-2026-N1").count() == 1

    titulaire = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-DC",
            "nom": "Diallo",
            "prenoms": "Moussa",
            "fonction": "Directeur",
            "role": "Directeur",
            "structure": "dse",
            "superieur": "",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert titulaire.status_code == 201
    note.refresh_from_db()
    assert note.statut == "cloture"
    assert Publication.objects.filter(perimetre_detail="interim:dgpe:USR-2026-DC", statut="diffuse").exists()

    from personnel.models import Profil

    Profil.objects.filter(structure__code="svc-courrier").update(structure=None)
    nomme = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-INT",
            "nom": "Kone",
            "prenoms": "Awa",
            "fonction": "Cheffe de service",
            "role": "Chef de service",
            "structure": "svc-courrier",
            "superieur": "DRH-2018-044",
            "interimaire": "dgpe",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert nomme.status_code == 201
    assert "pleinement" in nomme.json()["interimaire_texte"]
    assert "non désigné" in nomme.json()["interimaire_texte"]
    assert Publication.objects.filter(perimetre_detail="pleinement:USR-2026-INT:dgpe", statut="diffuse").exists()

    doublon = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-INT2",
            "nom": "Traore",
            "prenoms": "Ali",
            "fonction": "Chargé d'études",
            "role": "Agent",
            "structure": "svc-courrier",
            "superieur": "USR-2026-INT",
            "interimaire": "dgpe",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert doublon.status_code == 400

    absence = api.patch(
        "/api/v1/utilisateurs/USR-2026-INT/",
        {"interimaire": "drh"},
        format="json",
        **auth,
    )
    assert absence.status_code == 200
    assert "en son absence" in absence.json()["interimaire_texte"]

    propre = api.patch(
        "/api/v1/utilisateurs/USR-2026-INT/",
        {"interimaire": "svc-courrier"},
        format="json",
        **auth,
    )
    assert propre.status_code == 400

    ecart = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-01",
            "nom": "Kouassi",
            "prenoms": "Aya",
            "fonction": "Cheffe de service",
            "role": "Chef de service",
            "structure": "svc-actes",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "autre-mot",
        },
        format="json",
        **auth,
    )
    assert ecart.status_code == 400

    cree = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-01",
            "nom": "Kouassi",
            "prenoms": "Aya",
            "fonction": "Cheffe de service",
            "role": "Chef de service",
            "structure": "svc-actes",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
            "courriel": "aya.kouassi@portefeuille.gouv.ci",
        },
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    assert cree.json()["actif"] is True
    assert cree.json()["structure"] == "svc-actes"
    assert cree.json()["structure_nom"] == "Service des Actes"
    assert cree.json()["pole"] == "administration-generale"
    assert cree.json()["superieur"] == "DRH-2018-044"

    sans_superieur = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-03",
            "nom": "Bamba",
            "prenoms": "Ali",
            "fonction": "Gestionnaire",
            "role": "Agent",
            "structure": "drh",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert sans_superieur.status_code == 400

    agent = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-03",
            "nom": "Bamba",
            "prenoms": "Ali",
            "fonction": "Gestionnaire",
            "role": "Agent",
            "structure": "daf",
            "superieur": "USR-2026-01",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert agent.status_code == 400

    agent = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-03",
            "nom": "Bamba",
            "prenoms": "Ali",
            "fonction": "Gestionnaire",
            "role": "Agent",
            "structure": "svc-actes",
            "superieur": "USR-2026-01",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert agent.status_code == 201
    assert agent.json()["superieur"] == "USR-2026-01"
    assert agent.json()["structure"] == "svc-actes"
    assert agent.json()["structure_nom"] == "Service des Actes"

    hors_ministere = api.post(
        "/api/v1/utilisateurs/",
        {"matricule": "USR-2026-02", "nom": "Bamba", "prenoms": "Ali", "fonction": "Gestionnaire", "role": "Agent", "structure": "ansut", "mot_de_passe": "Sigrh-Dev-2026", "confirmation": "Sigrh-Dev-2026"},
        format="json",
        **auth,
    )
    assert hors_ministere.status_code == 400

    doublon = api.post(
        "/api/v1/utilisateurs/",
        {"matricule": "USR-2026-01", "nom": "Kouassi", "prenoms": "Aya", "fonction": "Gestionnaire", "role": "Chef de service", "structure": "svc-actes", "superieur": "DRH-2018-044", "mot_de_passe": "Sigrh-Dev-2026", "confirmation": "Sigrh-Dev-2026"},
        format="json",
        **auth,
    )
    assert doublon.status_code == 400

    Profil.objects.filter(structure__code="sd-formation").exclude(user__username="USR-2026-01").update(structure=None)
    suspendu = api.patch(
        "/api/v1/utilisateurs/USR-2026-01/",
        {"actif": False, "role": "Sous directeur", "structure": "sd-formation"},
        format="json",
        **auth,
    )
    assert suspendu.status_code == 200
    assert suspendu.json()["actif"] is False
    assert suspendu.json()["role"] == "Sous directeur"
    assert suspendu.json()["superieur"] == "DRH-2018-044"

    soi = api.patch("/api/v1/utilisateurs/DRH-2018-044/", {"actif": False}, format="json", **auth)
    assert soi.status_code == 400

    bloque = api.delete("/api/v1/utilisateurs/USR-2026-01/", **auth)
    assert bloque.status_code == 400
    retire = api.delete("/api/v1/utilisateurs/USR-2026-03/", **auth)
    assert retire.status_code == 204
    parti = api.delete("/api/v1/utilisateurs/USR-2026-01/", **auth)
    assert parti.status_code == 204
    encore = api.get("/api/v1/utilisateurs/", **auth).json()
    assert "USR-2026-01" not in {item["matricule"] for item in encore["utilisateurs"]}
    soi_supprime = api.delete("/api/v1/utilisateurs/DRH-2018-044/", **auth)
    assert soi_supprime.status_code == 400


def test_habilitations_personnelles_d_un_compte(api):
    from personnel.models import Profil

    Profil.objects.filter(structure__code__in=["svc-actes", "svc-courrier"]).update(structure=None)
    from personnel.models import Profil

    auth = _auth(api)
    annuaire = api.get("/api/v1/utilisateurs/", **auth).json()
    assert annuaire["modules"][0]["libelle"] == "Dossier Agent"
    defaut_agent = next(item for item in annuaire["roles"] if item["role"] == "Agent")["droits"]
    defaut_chef = next(item for item in annuaire["roles"] if item["role"] == "Chef de service")["droits"]
    defaut_directeur = next(item for item in annuaire["roles"] if item["role"] == "Directeur")["droits"]
    defaut_social = next(item for item in annuaire["roles"] if item["role"] == "Sous directeur")["droits"]

    ordinaire = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-10",
            "nom": "Traoré",
            "prenoms": "Awa",
            "fonction": "Gestionnaire",
            "role": "Sous directeur",
            "structure": "sd-social",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert ordinaire.status_code == 201
    assert ordinaire.json()["personnalisees"] is False
    assert ordinaire.json()["habilitations"] == defaut_social

    particulieres = list(defaut_chef)
    particulieres[0] = "saisie"
    delegue = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-11",
            "nom": "Diomandé",
            "prenoms": "Serge",
            "fonction": "Adjoint",
            "role": "Chef de service",
            "structure": "svc-actes",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
            "personnaliser": True,
            "habilitations": particulieres,
        },
        format="json",
        **auth,
    )
    assert delegue.status_code == 201
    assert delegue.json()["personnalisees"] is True
    assert delegue.json()["habilitations"][0] == "saisie"

    agent = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-14",
            "nom": "Yao",
            "prenoms": "Ines",
            "fonction": "Agent de saisie",
            "role": "Agent",
            "structure": "svc-actes",
            "superieur": "USR-2026-11",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert agent.status_code == 201
    assert agent.json()["personnalisees"] is False
    assert agent.json()["habilitations"] == defaut_agent

    drh_reduit = list(defaut_directeur)
    drh_reduit[-1] = "lecture"
    central = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-12",
            "nom": "Bedi",
            "prenoms": "Paul",
            "fonction": "Adjoint au directeur",
            "role": "Directeur",
            "structure": "drh",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
            "personnaliser": True,
            "habilitations": drh_reduit,
        },
        format="json",
        **auth,
    )
    assert central.status_code == 400

    Profil.objects.filter(user__username="DRH-2018-044").update(habilitations=["lecture"] * len(annuaire["modules"]))
    trop = list(defaut_chef)
    trop[0] = "saisie"
    refuse = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-13",
            "nom": "Kone",
            "prenoms": "Mina",
            "fonction": "Adjointe",
            "role": "Chef de service",
            "structure": "svc-courrier",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
            "personnaliser": True,
            "habilitations": trop,
        },
        format="json",
        **auth,
    )
    assert refuse.status_code == 400

    conserve = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-13",
            "nom": "Kone",
            "prenoms": "Mina",
            "fonction": "Adjointe",
            "role": "Chef de service",
            "structure": "svc-courrier",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
            "personnaliser": True,
            "habilitations": defaut_chef,
        },
        format="json",
        **auth,
    )
    assert conserve.status_code == 201
    assert conserve.json()["habilitations"] == defaut_chef

    retire = api.patch("/api/v1/utilisateurs/USR-2026-11/", {"personnaliser": False}, format="json", **auth)
    assert retire.status_code == 200
    assert retire.json()["personnalisees"] is False
    assert retire.json()["habilitations"] == defaut_chef
    assert retire.json()["precisions"] == {}


def test_precisions_personnelles_d_un_compte(api):
    from personnel.models import Profil

    Profil.objects.filter(structure__code__in=["svc-actes", "svc-courrier"]).update(structure=None)
    from personnel.models import Profil

    auth = _auth(api)
    annuaire = api.get("/api/v1/utilisateurs/", **auth).json()
    formations = next(item for item in annuaire["modules"] if item["libelle"] == "Formations")
    inscriptions = next(item for item in formations["fonctions"] if item["libelle"] == "Inscriptions")
    defaut_agent = next(item for item in annuaire["roles"] if item["role"] == "Agent")["droits"]
    chef = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-20",
            "nom": "Goue",
            "prenoms": "Luc",
            "fonction": "Chef de service",
            "role": "Chef de service",
            "structure": "svc-actes",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert chef.status_code == 201
    brut = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-2026-21",
            "nom": "Adjoua",
            "prenoms": "Marie",
            "fonction": "Gestionnaire formation",
            "role": "Agent",
            "structure": "svc-actes",
            "superieur": "USR-2026-20",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert brut.status_code == 201
    hors_chef = api.patch(
        "/api/v1/utilisateurs/USR-2026-21/",
        {"personnaliser": True, "habilitations": defaut_agent, "precisions": {str(inscriptions["id"]): "lecture"}},
        format="json",
        **auth,
    )
    assert hors_chef.status_code == 400
    jeton = api.post("/api/v1/auth/login/", {"matricule": "USR-2026-20", "password": "Sigrh-Dev-2026"}, format="json")
    chef_auth = {"HTTP_AUTHORIZATION": f"Token {jeton.json()['token']}"}
    cree = api.patch(
        "/api/v1/utilisateurs/USR-2026-21/",
        {"personnaliser": True, "habilitations": defaut_agent, "precisions": {str(inscriptions["id"]): "lecture"}},
        format="json",
        **chef_auth,
    )
    assert cree.status_code == 200
    assert cree.json()["precisions"][str(inscriptions["id"])] == "lecture"
    assert cree.json()["habilitations"][3] == "saisie"
    equipe = {item["matricule"] for item in api.get("/api/v1/utilisateurs/", **chef_auth).json()["utilisateurs"]}
    assert equipe == {"USR-2026-20", "USR-2026-21"}
    assert "349812K" not in {item["matricule"] for item in api.get("/api/v1/agents/?q=Koffi", **chef_auth).json()}
    assert api.get("/api/v1/agents/349812K/", **chef_auth).status_code == 404

    trop = api.patch(
        "/api/v1/utilisateurs/USR-2026-21/",
        {"personnaliser": True, "habilitations": defaut_agent, "precisions": {str(inscriptions["id"]): "validation"}},
        format="json",
        **chef_auth,
    )
    assert trop.status_code == 400


def test_nomenclature_grades_et_emplois(api):
    auth = _auth(api)
    page = api.get("/api/v1/nomenclature/", **auth)
    assert page.status_code == 200
    corps = page.json()
    grades = {item["code"]: item for item in corps["grades"]}
    assert grades["A7"]["en_vigueur"] is True
    assert grades["A3"]["categorie"] == "A"
    assert grades["B1"]["categorie"] == "B"
    assert grades["D1"]["categorie"] == "D"
    assert grades["A1"]["en_vigueur"] is False
    assert any(item["libelle"] == "Administrateur des ressources humaines" and item["grade"] == "A4" for item in corps["emplois"])
    assert any(item["libelle"] == "Huissier" and item["grade"] == "D1" for item in corps["emplois"])
    assert {item["code"] for item in corps["familles"]} == {
        "education", "scientifique", "administratif", "financier", "social", "culturel",
    }

    interdit = api.post("/api/v1/grades/", {"code": "E1", "categorie": "E", "libelle": "Hors statut"}, format="json", **auth)
    assert interdit.status_code == 400
    cree = api.post("/api/v1/grades/", {"code": "ct1", "categorie": "A", "libelle": "Grade contractuel de conception"}, format="json", **auth)
    assert cree.status_code == 201
    assert cree.json()["code"] == "CT1"
    occupe = api.delete("/api/v1/grades/A4/", **auth)
    assert occupe.status_code == 400
    emploi = api.post(
        "/api/v1/emplois/",
        {"libelle": "Chargé d'études du portefeuille", "famille": "financier", "grade": "A4"},
        format="json",
        **auth,
    )
    assert emploi.status_code == 201
    retire = api.delete(f"/api/v1/emplois/{emploi.json()['code']}/", **auth)
    assert retire.status_code == 204
    assert api.delete("/api/v1/grades/CT1/", **auth).status_code == 204


def test_matrice_habilitations_modifiable(api):
    auth = _auth(api)
    matrice = api.get("/api/v1/circuits/", **auth).json()["matrice"]
    assert matrice["colonnes"] == [
        "Dossier Agent",
        "Carrières & Actes",
        "Social & Santé",
        "Formations",
        "Statistiques & RBAC",
        "GPEC",
        "Projets et études RH",
    ]
    agent = next(item for item in matrice["roles"] if item["role"] == "Agent")
    assert agent["droits"][0] == "lecture"
    cellule = api.patch(
        "/api/v1/circuits/habilitations/cellule/",
        {"role": agent["id"], "colonne": 0, "droit": "saisie"},
        format="json",
        **auth,
    )
    assert cellule.status_code == 200
    mis = next(item for item in cellule.json()["roles"] if item["id"] == agent["id"])
    assert mis["droits"][0] == "saisie"

    cree = api.post(
        "/api/v1/circuits/habilitations/roles/",
        {"role": "Inspecteur", "description": "Contrôle interne"},
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    inspecteur = next(item for item in cree.json()["roles"] if item["role"] == "Inspecteur")
    assert inspecteur["droits"] == ["refus"] * len(cree.json()["colonnes"])
    assert api.post(
        "/api/v1/circuits/habilitations/roles/",
        {"role": "agent", "description": "Doublon"},
        format="json",
        **auth,
    ).status_code == 400

    module = api.post("/api/v1/circuits/habilitations/modules/", {"libelle": "Archives"}, format="json", **auth)
    assert module.status_code == 201
    corps = module.json()
    assert corps["colonnes"][-1] == "Archives"
    assert all(len(item["droits"]) == len(corps["colonnes"]) for item in corps["roles"])
    assert next(item for item in corps["roles"] if item["role"] == "Inspecteur")["droits"][-1] == "refus"

    renomme = api.patch(
        f"/api/v1/circuits/habilitations/roles/{inspecteur['id']}/",
        {"role": "Inspecteur général", "description": "Contrôle interne du ministère"},
        format="json",
        **auth,
    )
    assert renomme.status_code == 200
    assert any(item["role"] == "Inspecteur général" for item in renomme.json()["roles"])


def test_menu_suit_l_habilitation(api):
    from personnel.models import Profil

    Profil.objects.filter(structure__code__in=["svc-actes", "svc-courrier"]).update(structure=None)
    auth = _auth(api)
    moi = api.get("/api/v1/me/", **auth).json()
    assert moi["acces"]["modules"]["GPEC"] == "validation"
    assert moi["acces"]["modules"]["Statistiques & RBAC"] == "validation"
    assert moi["acces"]["fonctions"]["GPEC|Recrutement"] == "validation"
    assert moi["acces"]["fonctions"]["Dossier Agent|Consultation du dossier"] == "validation"
    assert moi["acces"]["fonctions"]["Statistiques & RBAC|Tableau de bord"] == "validation"
    assert moi["acces"]["fonctions"]["Statistiques & RBAC|Paramètres"] == "validation"
    assert moi["acces"]["fonctions"]["Statistiques & RBAC|Habilitations"] == "validation"
    assert moi["acces"]["fonctions"]["Statistiques & RBAC|Comptes utilisateurs"] == "validation"

    chef = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-MENU-01",
            "nom": "Dago",
            "prenoms": "Yves",
            "fonction": "Chef de service",
            "role": "Chef de service",
            "structure": "svc-actes",
            "superieur": "DRH-2018-044",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert chef.status_code == 201
    jeton_chef = api.post("/api/v1/auth/login/", {"matricule": "USR-MENU-01", "password": "Sigrh-Dev-2026"}, format="json")
    session_chef = api.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Token {jeton_chef.json()['token']}").json()
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Paramètres"] == "refus"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Circuits et habilitations"] == "lecture"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Habilitations"] == "refus"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Comptes utilisateurs"] == "refus"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Structures du ministère"] == "lecture"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Tableau de bord"] == "lecture"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Statistiques"] == "refus"
    assert session_chef["acces"]["fonctions"]["Statistiques & RBAC|Communication"] == "refus"
    assert session_chef["acces"]["fonctions"]["Carrières & Actes|Congés"] == "validation"
    assert session_chef["acces"]["fonctions"]["Projets et études RH|Projets et études"] == "refus"
    matrice = api.get("/api/v1/circuits/", **auth).json()["matrice"]
    fonctions = {item["libelle"]: item["id"] for colonne in matrice["fonctions"] for item in colonne}
    index = matrice["colonnes"].index("Statistiques & RBAC")

    def rubrique(role: str, libelle: str) -> str:
        ligne = next(item for item in matrice["roles"] if item["role"] == role)
        return ligne["precisions"].get(str(fonctions[libelle]), ligne["droits"][index])

    assert rubrique("Sous directeur", "Paramètres") == "refus"
    assert rubrique("Sous directeur", "Comptes utilisateurs") == "lecture"
    assert rubrique("Sous directeur", "Structures du ministère") == "saisie"
    assert rubrique("Directeur", "Paramètres") == "refus"
    assert rubrique("Directeur", "Habilitations") == "lecture"
    assert rubrique("Directeur", "Circuits et habilitations") == "validation"
    assert rubrique("Directeur général", "Paramètres") == "validation"
    assert rubrique("Ministre", "Paramètres") == "validation"
    assert rubrique("Agent", "Tableau de bord") == "refus"
    assert rubrique("Sous directeur", "Communication") == "saisie"
    assert rubrique("Directeur", "Statistiques") == "validation"
    agent = api.post(
        "/api/v1/utilisateurs/",
        {
            "matricule": "USR-MENU-02",
            "nom": "Brou",
            "prenoms": "Awa",
            "fonction": "Agent",
            "role": "Agent",
            "structure": "svc-actes",
            "superieur": "USR-MENU-01",
            "mot_de_passe": "Sigrh-Dev-2026",
            "confirmation": "Sigrh-Dev-2026",
        },
        format="json",
        **auth,
    )
    assert agent.status_code == 201
    jeton = api.post("/api/v1/auth/login/", {"matricule": "USR-MENU-02", "password": "Sigrh-Dev-2026"}, format="json")
    session = api.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Token {jeton.json()['token']}").json()
    assert session["acces"]["modules"]["Dossier Agent"] == "lecture"
    assert session["acces"]["modules"]["Formations"] == "refus"
    assert session["acces"]["modules"]["Statistiques & RBAC"] == "refus"
    assert session["acces"]["modules"]["GPEC"] == "refus"
    assert session["acces"]["fonctions"]["Dossier Agent|Consultation du dossier"] == "lecture"
    assert session["acces"]["fonctions"]["Carrières & Actes|Congés"] == "refus"
    assert session["acces"]["fonctions"]["Statistiques & RBAC|Tableau de bord"] == "refus"
    assert session["acces"]["fonctions"]["Statistiques & RBAC|Comptes utilisateurs"] == "refus"
    assert session["acces"]["fonctions"]["Projets et études RH|Projets et études"] == "refus"


def test_precision_de_fonction(api):
    auth = _auth(api)
    matrice = api.get("/api/v1/circuits/", **auth).json()["matrice"]
    dossier = matrice["fonctions"][0]
    assert [item["libelle"] for item in dossier] == [
        "Consultation du dossier",
        "Identité et coordonnées",
        "Pièces et actes",
    ]
    assert any(item["libelle"] == "Congés" for item in matrice["fonctions"][1])
    agent = next(item for item in matrice["roles"] if item["role"] == "Agent")
    identite = next(item for item in dossier if item["libelle"] == "Identité et coordonnées")

    precise = api.patch(
        "/api/v1/circuits/habilitations/precision/",
        {"role": agent["id"], "fonction": identite["id"], "droit": "refus"},
        format="json",
        **auth,
    )
    assert precise.status_code == 200
    cible = next(item for item in precise.json()["roles"] if item["id"] == agent["id"])
    assert cible["precisions"][str(identite["id"])] == "refus"
    assert cible["droits"][0] == "lecture"

    herite = api.patch(
        "/api/v1/circuits/habilitations/precision/",
        {"role": agent["id"], "fonction": identite["id"], "droit": "herite"},
        format="json",
        **auth,
    )
    assert herite.status_code == 200
    assert str(identite["id"]) not in next(item for item in herite.json()["roles"] if item["id"] == agent["id"])["precisions"]

    assert "Notations et évaluations" in matrice["disponibles"][0]
    inconnue = api.post(
        "/api/v1/circuits/habilitations/fonctions/",
        {"module": "Dossier Agent", "libelle": "Rémunération"},
        format="json",
        **auth,
    )
    assert inconnue.status_code == 400
    ajoutee = api.post(
        "/api/v1/circuits/habilitations/fonctions/",
        {"module": "Dossier Agent", "libelle": "Notations et évaluations"},
        format="json",
        **auth,
    )
    assert ajoutee.status_code == 201
    fonctions = ajoutee.json()["fonctions"][0]
    assert fonctions[-1]["libelle"] == "Notations et évaluations"
    assert "Notations et évaluations" not in ajoutee.json()["disponibles"][0]
    retiree = api.delete(f"/api/v1/circuits/habilitations/fonctions/{fonctions[-1]['id']}/", **auth)
    assert retiree.status_code == 200
    assert "Notations et évaluations" in retiree.json()["disponibles"][0]


def test_ajout_de_structure(api):
    auth = _auth(api)
    page = api.get("/api/v1/structures/", **auth)
    assert page.status_code == 200
    corps = page.json()
    assert any(item["code"] == "drh" for item in corps["structures"])
    assert {item["code"] for item in corps["poles"]} == {"administration-generale", "dgpe", "dgpn"}
    # Le Cabinet fait partie du programme Administration générale, comme les directions qui en relèvent.
    assert next(item for item in corps["structures"] if item["code"] == "cabinet")["pole"] == "administration-generale"

    doublon = api.post(
        "/api/v1/structures/",
        {"nom": "Direction des Ressources Humaines", "pole": "administration-generale"},
        format="json",
        **auth,
    )
    assert doublon.status_code == 400

    cree = api.post(
        "/api/v1/structures/",
        {"nom": "Cellule de Prospective", "pole": "dgpe"},
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    assert cree.json()["code"] == "cellule-de-prospective"
    assert cree.json()["pole_libelle"] == "DGPE"
    assert cree.json()["niveau"] == "direction-centrale"
    cabinet = next(item for item in corps["structures"] if item["code"] == "cabinet")
    assert cabinet["niveau"] == "direction-generale" and cabinet["parent"] == "ministere"
    drh = next(item for item in corps["structures"] if item["code"] == "drh")
    assert drh["niveau"] == "direction-centrale" and drh["parent"] == "cabinet"
    marches = next(item for item in corps["structures"] if item["code"] == "cmp")
    assert marches["niveau"] == "direction-centrale" and marches["parent"] == "cabinet"
    assert any(item["code"] == "sd-formation" and item["parent"] == "drh" for item in corps["structures"])

    annuaire = api.get("/api/v1/utilisateurs/", **auth).json()
    assert any(item["code"] == "cellule-de-prospective" for item in annuaire["structures"])

    modifie = api.patch(
        "/api/v1/structures/cellule-de-prospective/",
        {"nom": "Cellule de Prospective et d'Études", "pole": "administration-generale"},
        format="json",
        **auth,
    )
    assert modifie.status_code == 200
    assert modifie.json()["code"] == "cellule-de-prospective"
    assert modifie.json()["pole"] == "administration-generale"

    occupee = api.delete("/api/v1/structures/drh/", **auth)
    assert occupee.status_code == 400

    retiree = api.delete("/api/v1/structures/cellule-de-prospective/", **auth)
    assert retiree.status_code == 204
    apres = api.get("/api/v1/structures/", **auth).json()
    assert all(item["code"] != "cellule-de-prospective" for item in apres["structures"])

    pole = api.post("/api/v1/poles/", {"nom": "Secrétariat général"}, format="json", **auth)
    assert pole.status_code == 201
    assert pole.json()["code"] == "secretariat-general"
    renomme = api.patch("/api/v1/poles/secretariat-general/", {"nom": "Secrétariat général du ministère"}, format="json", **auth)
    assert renomme.status_code == 200
    assert renomme.json()["nom"] == "Secrétariat général du ministère"
    occupe = api.delete("/api/v1/poles/dgpe/", **auth)
    assert occupe.status_code == 400
    vide = api.delete("/api/v1/poles/secretariat-general/", **auth)
    assert vide.status_code == 204


def test_statistiques(api):
    auth = _auth(api)
    page = api.get("/api/v1/statistiques/", **auth)
    assert page.status_code == 200
    corps = page.json()
    from personnel.models import EntiteTutelle

    # Le registre des structures grandit avec l'organigramme : le compte se lit dans la base.
    structures = EntiteTutelle.objects.count()
    assert corps["poles"] == 3
    assert structures >= 24
    assert corps["structures"] == structures
    assert corps["agents"] > 0
    from personnel.models import Agent

    assert 0 < corps["effectif"] <= Agent.objects.count()
    assert sum(item["structures"] for item in corps["par_pole"]) == structures
    assert corps["kpi"]["dossiers"] == corps["agents"]
    assert len(corps["lignes"]) == corps["structures"]
    assert {ligne["code"] for ligne in corps["lignes"]} >= {"drh", "ig", "dsi"}
    assert "petroci" not in {ligne["code"] for ligne in corps["lignes"]}
    assert sum(item["total"] for item in corps["repartition"]) == corps["agents"]
    actes = next(serie for serie in corps["comparaison"] if serie["code"] == "actes")
    assert sum(point["total"] for point in actes["valeurs"]) > 0
    assert corps["exercice"] in corps["exercices"]
    precedent = api.get("/api/v1/statistiques/?exercice=2025", **auth)
    assert precedent.status_code == 200
    vue = precedent.json()
    assert vue["exercice"] == 2025
    serie = next(item for item in vue["comparaison"] if item["code"] == "actes")
    assert vue["flux"]["actes"]["total"] == next(point["total"] for point in serie["valeurs"] if point["annee"] == 2025)
    assert vue["flux"]["actes"]["precedent"] == next(point["total"] for point in serie["valeurs"] if point["annee"] == 2024)
    assert api.get("/api/v1/statistiques/?exercice=siecle", **auth).status_code == 400


def test_statistiques_filtre_exports_et_planification(api):
    import io
    import zipfile

    auth = _auth(api)
    inconnu = api.get("/api/v1/statistiques/?structure=introuvable", **auth)
    assert inconnu.status_code == 400

    filtre = api.get("/api/v1/statistiques/?structure=drh&segment=A", **auth)
    assert filtre.status_code == 200
    corps = filtre.json()
    assert [ligne["code"] for ligne in corps["lignes"]] == ["drh"]
    assert corps["kpi"]["effectif_officiel"] is None

    classeur = api.get("/api/v1/statistiques/export/xlsx/", **auth)
    assert classeur.status_code == 200
    assert classeur.content[:2] == b"PK"
    with zipfile.ZipFile(io.BytesIO(classeur.content)) as archive:
        feuille = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert "Structure" in feuille

    synthese = api.get("/api/v1/statistiques/export/pdf/", **auth)
    assert synthese.status_code == 200
    assert synthese.content.startswith(b"%PDF")
    assert b"reporter" in synthese.content
    assert b"(Report)" in synthese.content

    diaporama = api.get("/api/v1/statistiques/export/pptx/?structure=drh", **auth)
    assert diaporama.status_code == 200
    assert diaporama.content[:2] == b"PK"
    with zipfile.ZipFile(io.BytesIO(diaporama.content)) as archive:
        slide = archive.read("ppt/slides/slide1.xml").decode("utf-8")
    assert "Observatoire" in slide

    refus = api.post("/api/v1/statistiques/planifier/", {"echeance": "2000-01-01", "objet": "Point"}, format="json", **auth)
    assert refus.status_code == 400
    plan = api.post(
        "/api/v1/statistiques/planifier/",
        {"echeance": "2099-01-15", "objet": "Point sur les effectifs"},
        format="json",
        **auth,
    )
    assert plan.status_code == 201


def test_tableaux_croises_dynamiques(api):
    from personnel.models import Absence, Agent, CompositionStatistique

    auth = _auth(api)
    catalogue = api.get("/api/v1/statistiques/catalogue/", **auth)
    assert catalogue.status_code == 200
    sources = {item["code"]: item for item in catalogue.json()["sources"]}
    assert {"agents", "absences"} <= set(sources)
    assert "agent.corps" in [item["code"] for item in sources["absences"]["champs"]]
    assert "age" in [item["code"] for item in sources["agents"]["mesures"] if item["numerique"]]

    cube = api.get("/api/v1/statistiques/cube/?source=agents&champs=corps,sexe", **auth)
    assert cube.status_code == 200
    corps = cube.json()
    assert [item["code"] for item in corps["champs"]] == ["corps", "sexe"]
    assert corps["total"] == Agent.objects.count()
    assert sum(groupe["n"] for groupe in corps["groupes"]) == corps["total"]
    assert {"Homme", "Femme"} <= {groupe["v"][1] for groupe in corps["groupes"]}
    assert all(len(groupe["v"]) == 2 for groupe in corps["groupes"])

    jours = api.get("/api/v1/statistiques/cube/?source=absences&champs=agent.sexe", **auth).json()
    assert jours["total"] == Absence.objects.count()
    somme = sum(groupe["m"]["jours"][0] for groupe in jours["groupes"] if "jours" in groupe["m"])
    assert somme == sum(Absence.objects.values_list("jours", flat=True))

    croise = api.get(
        "/api/v1/statistiques/cube/?source=agents&champs=sexe,x.absences.presence&croisements=absences,notations",
        **auth,
    ).json()
    assert croise["total"] == Agent.objects.count()
    jours_croises = sum(groupe["m"]["x.absences.jours"][0] for groupe in croise["groupes"])
    assert jours_croises == sum(Absence.objects.values_list("jours", flat=True))
    avec = sum(groupe["n"] for groupe in croise["groupes"] if groupe["v"][1] == "Oui")
    assert avec == Agent.objects.filter(absences__isnull=False).distinct().count()
    sources_croisees = {item["code"]: item for item in sources["agents"]["croisements"]}
    assert sources_croisees["absences"]["possible"] is True
    assert sources_croisees["sessions"]["possible"] is False
    impossible = api.get("/api/v1/statistiques/cube/?source=absences&croisements=sanctions", **auth)
    assert impossible.status_code == 400
    assert "Dossiers agents" in impossible.json()["detail"]
    sans_croisement = api.get("/api/v1/statistiques/cube/?source=agents&champs=x.absences.presence", **auth)
    assert sans_croisement.status_code == 400

    detail = api.get(
        "/api/v1/statistiques/cube/?source=agents&champs=corps,x.absences.nature&croisements=absences",
        **auth,
    ).json()
    assert detail["detail"] == "absences"
    assert sum(groupe["n"] for groupe in detail["groupes"]) == Absence.objects.count()
    assert detail["total"] == Agent.objects.filter(absences__isnull=False).distinct().count()
    assert all(groupe["a"] for groupe in detail["groupes"])
    assert "age" not in detail["mesures"]
    deux_details = api.get(
        "/api/v1/statistiques/cube/?source=agents&champs=x.absences.nature,x.sanctions.nature&croisements=absences,sanctions",
        **auth,
    )
    assert deux_details.status_code == 400
    annee = Absence.objects.order_by("debut").first().debut.year
    periode = api.get(
        "/api/v1/statistiques/cube/?source=agents&champs=sexe&croisements=absences"
        f'&periodes={{"absences":{{"de":{annee},"a":{annee}}}}}',
        **auth,
    ).json()
    assert periode["periodes"] == {"absences": {"de": annee, "a": annee}}
    jours_annee = sum(groupe["m"]["x.absences.jours"][0] for groupe in periode["groupes"])
    assert jours_annee == sum(Absence.objects.filter(debut__year=annee).values_list("jours", flat=True))

    assert api.get("/api/v1/statistiques/cube/?source=agents&champs=matricule", **auth).status_code == 400
    assert api.get("/api/v1/statistiques/cube/?source=inconnue", **auth).status_code == 400

    configuration = {
        "source": "agents",
        "lignes": ["corps"],
        "colonnes": ["sexe"],
        "filtres": ["situation"],
        "valeurs": [{"mesure": "nombre"}, {"mesure": "age", "agregat": "moyenne"}],
        "selections": {"situation": {"exclus": ["Retraité"]}, "inconnu": {"exclus": ["x"]}},
        "graphique": {"forme": "anneau", "etiquettes": False},
        "croisements": ["absences"],
        "nom_auto": True,
    }
    cree = api.post(
        "/api/v1/statistiques/compositions/",
        {"nom": "Effectif par corps et par sexe", "configuration": configuration},
        format="json",
        **auth,
    )
    assert cree.status_code == 201
    identifiant = cree.json()["id"]
    assert cree.json()["mien"] is True
    enregistree = cree.json()["configuration"]
    assert enregistree["lignes"] == ["corps"]
    assert enregistree["valeurs"][0] == {"mesure": "nombre", "agregat": "nombre", "affichage": "valeur"}
    assert enregistree["valeurs"][1]["agregat"] == "moyenne"
    assert enregistree["selections"] == {"situation": {"exclus": ["Retraité"]}}
    assert enregistree["graphique"]["forme"] == "anneau"
    assert enregistree["graphique"]["etiquettes"] is False
    assert enregistree["croisements"] == ["absences"]
    assert enregistree["nom_auto"] is True

    doublon = api.post(
        "/api/v1/statistiques/compositions/",
        {"nom": "Doublon", "configuration": {**configuration, "colonnes": ["corps"]}},
        format="json",
        **auth,
    )
    assert doublon.status_code == 400
    somme_texte = api.post(
        "/api/v1/statistiques/compositions/",
        {"nom": "Somme impossible", "configuration": {**configuration, "valeurs": [{"mesure": "nombre", "agregat": "somme"}]}},
        format="json",
        **auth,
    )
    assert somme_texte.status_code == 400

    liste = api.get("/api/v1/statistiques/compositions/", **auth)
    assert liste.status_code == 200
    assert any(item["id"] == identifiant for item in liste.json())

    renomme = api.patch(
        f"/api/v1/statistiques/compositions/{identifiant}/",
        {"nom": "Parité par corps"},
        format="json",
        **auth,
    )
    assert renomme.status_code == 200
    assert renomme.json()["nom"] == "Parité par corps"
    assert renomme.json()["configuration"]["colonnes"] == ["sexe"]

    ancienne = CompositionStatistique.objects.create(
        auteur=CompositionStatistique.objects.get(pk=identifiant).auteur,
        nom="Ancienne composition",
        sujet="agents",
        mesure="nombre",
        axe_lignes="agents.corps",
        axe_colonnes="absences.nature",
        filtres=[{"dimension": "agents.sexe", "valeur": "F"}],
        volets=["agents", "absences"],
    )
    convertie = api.get(f"/api/v1/statistiques/compositions/{ancienne.pk}/", **auth).json()["configuration"]
    assert convertie["source"] == "absences"
    assert convertie["lignes"] == ["agent.corps"]
    assert convertie["colonnes"] == ["nature"]
    assert convertie["filtres"] == ["agent.sexe"]
    assert convertie["selections"] == {"agent.sexe": {"inclus": ["Femme"]}}

    autre = api.post(
        "/api/v1/auth/login/",
        {"matricule": "349812K", "password": "Sigrh-Dev-2026"},
        format="json",
    )
    assert autre.status_code == 200
    auth_autre = {"HTTP_AUTHORIZATION": f"Token {autre.json()['token']}"}
    refus = api.delete(f"/api/v1/statistiques/compositions/{identifiant}/", **auth_autre)
    assert refus.status_code == 403
    assert CompositionStatistique.objects.filter(pk=identifiant).exists()

    retire = api.delete(f"/api/v1/statistiques/compositions/{identifiant}/", **auth)
    assert retire.status_code == 204
    assert not CompositionStatistique.objects.filter(pk=identifiant).exists()


def test_etats_statistiques_composes_et_champs_de_structure(api):
    from personnel.models import EtatStatistique

    auth = _connexion(api, "DRH-2018-044")

    # Les champs ajoutés pour les états : programme, catégorie d'après le grade, famille d'emploi, tranches d'âge détaillées.
    cube = api.get(
        "/api/v1/statistiques/cube/?source=agents&champs=programme,categorie_statutaire,famille_emploi,tranche_age_detail,sexe",
        **auth,
    )
    assert cube.status_code == 200
    donnees = cube.json()
    assert {champ["code"] for champ in donnees["champs"]} == {"programme", "categorie_statutaire", "famille_emploi", "tranche_age_detail", "sexe"}
    assert sum(groupe["n"] for groupe in donnees["groupes"]) == donnees["total"]
    position = {champ["code"]: rang for rang, champ in enumerate(donnees["champs"])}
    tranches = {groupe["v"][position["tranche_age_detail"]] for groupe in donnees["groupes"]}
    assert tranches <= {"Moins de 25 ans", "25 à 34 ans", "35 à 44 ans", "45 à 54 ans", "55 à 59 ans", "60 ans et plus", "Non renseigné"}
    categories = {groupe["v"][position["categorie_statutaire"]] for groupe in donnees["groupes"]}
    assert categories <= {"Catégorie A", "Catégorie B", "Catégorie C", "Catégorie D", "Non renseigné", "Non classé"}

    corps = {
        "nom": "État du personnel",
        "modele": "etat-du-personnel",
        "configuration": {
            "titre": "État du personnel",
            "synthese": True,
            "blocs": [
                {
                    "id": "ages",
                    "redaction": "age",
                    "kicker": "GRAPHIQUE 3",
                    "titre_auto": True,
                    "commentaires": None,
                    "anneau": True,
                    "config": {
                        "source": "agents",
                        "lignes": ["tranche_age_detail"],
                        "colonnes": ["sexe"],
                        "graphique": {"forme": "pyramide", "couleurs": ["#14365d", "pas-une-couleur", "#2A9D8F"]},
                    },
                },
                {"id": "libre", "redaction": "inconnue", "commentaires": ["  Premier point  ", "", "Second point"], "config": {"source": "agents"}},
            ],
        },
    }
    cree = api.post("/api/v1/statistiques/etats/", corps, format="json", **auth)
    assert cree.status_code == 201
    identifiant = cree.json()["id"]
    assert cree.json()["mien"] is True
    blocs = cree.json()["configuration"]["blocs"]
    assert len(blocs) == 2
    assert blocs[0]["config"]["graphique"]["forme"] == "pyramide"
    assert blocs[0]["config"]["graphique"]["couleurs"] == ["#14365D", "#2A9D8F"]
    assert blocs[0]["anneau"] is True
    assert blocs[0]["commentaires"] is None
    assert blocs[1]["redaction"] == "libre"
    assert blocs[1]["commentaires"] == ["Premier point", "Second point"]
    assert blocs[1]["anneau"] is False

    assert api.post("/api/v1/statistiques/etats/", {**corps, "nom": " "}, format="json", **auth).status_code == 400
    sans_bloc = api.post("/api/v1/statistiques/etats/", {**corps, "configuration": {"blocs": []}}, format="json", **auth)
    assert sans_bloc.status_code == 400

    assert any(item["id"] == identifiant for item in api.get("/api/v1/statistiques/etats/", **auth).json())
    renomme = api.patch(f"/api/v1/statistiques/etats/{identifiant}/", {"nom": "Effectifs 2026"}, format="json", **auth)
    assert renomme.status_code == 200
    assert renomme.json()["nom"] == "Effectifs 2026"
    assert len(renomme.json()["configuration"]["blocs"]) == 2

    autre = api.post("/api/v1/auth/login/", {"matricule": "349812K", "password": "Sigrh-Dev-2026"}, format="json")
    auth_autre = {"HTTP_AUTHORIZATION": f"Token {autre.json()['token']}"}
    assert api.patch(f"/api/v1/statistiques/etats/{identifiant}/", {"nom": "Piraté"}, format="json", **auth_autre).status_code == 403
    assert api.delete(f"/api/v1/statistiques/etats/{identifiant}/", **auth_autre).status_code == 403
    assert EtatStatistique.objects.filter(pk=identifiant).exists()

    assert api.delete(f"/api/v1/statistiques/etats/{identifiant}/", **auth).status_code == 204
    assert not EtatStatistique.objects.filter(pk=identifiant).exists()


def test_planification_annuelle_des_conges(api):
    from datetime import date, timedelta

    from django.contrib.auth.models import User

    from personnel.models import CampagnePlanConge, Notification, PlanConge, Profil, Publication

    rh = _connexion(api, "411904C")
    drh = _connexion(api, "DRH-2018-044")
    agent_nom = "394812H"
    silencieux = "318490K"
    chef_nom = "349812K"
    chef_user = User.objects.get(username=chef_nom)
    Profil.objects.filter(user__username__in=[agent_nom, silencieux]).update(superieur=chef_user)
    from personnel.models import Agent

    Agent.objects.filter(matricule__in=[agent_nom, silencieux]).update(conges_acquis=30, conges_consommes=0)  # droit de référence : 30 jours
    # Le jour de l'application (fuseau du projet), pas celui de la machine qui lance les tests.
    aujourd_hui = timezone.localdate()
    corps = {
        "limite_agents": (aujourd_hui + timedelta(days=5)).isoformat(),
        "limite_hierarchie": (aujourd_hui + timedelta(days=12)).isoformat(),
        "limite_rh": (aujourd_hui + timedelta(days=20)).isoformat(),
        "limite_drh": (aujourd_hui + timedelta(days=30)).isoformat(),
        "delai": (aujourd_hui + timedelta(days=35)).isoformat(),
        "communique": "Chaque chef planifie les congés avec ses agents.",
        "exercice": 2026,
    }
    meme_jour = {**corps, "limite_hierarchie": corps["limite_agents"]}
    assert api.post("/api/v1/conges/planification/ouvrir/", meme_jour, format="json", **rh).status_code == 400
    hors_delai = {**corps, "limite_drh": (aujourd_hui + timedelta(days=40)).isoformat()}
    assert api.post("/api/v1/conges/planification/ouvrir/", hors_delai, format="json", **rh).status_code == 400

    ouvert = api.post("/api/v1/conges/planification/ouvrir/", corps, format="json", **rh)
    assert ouvert.status_code == 201
    assert ouvert.json()["campagne"]["statut"] == "accord"
    assert api.post("/api/v1/conges/planification/accorder/", **drh).status_code == 200
    assert Publication.objects.filter(reference="PLAN-CONGES-2026", statut="diffuse").exists()

    agent = _connexion(api, agent_nom)
    depose = api.post("/api/v1/conges/planification/deposer/", {"debut": "2026-07-06", "fin": "2026-08-04"}, format="json", **agent)
    assert depose.status_code == 200
    plan = PlanConge.objects.get(agent__username=agent_nom)
    assert plan.palier == "hierarchie" and plan.chez.username == chef_nom

    chef = _connexion(api, chef_nom)
    trop_tot = api.post(f"/api/v1/conges/planification/{plan.id}/transmettre/", {"debut": "2026-07-13", "fin": "2026-08-11", "motif": "Trop tôt."}, format="json", **chef)
    assert trop_tot.status_code == 409

    CampagnePlanConge.objects.filter(exercice=2026).update(limite_agents=aujourd_hui - timedelta(days=1))
    sans_motif = api.post(f"/api/v1/conges/planification/{plan.id}/transmettre/", {"debut": "2026-07-13", "fin": "2026-08-11"}, format="json", **chef)
    assert sans_motif.status_code == 400
    avec_motif = api.post(
        f"/api/v1/conges/planification/{plan.id}/transmettre/",
        {"debut": "2026-07-13", "fin": "2026-08-11", "motif": "Présence requise la première semaine de juillet."},
        format="json",
        **chef,
    )
    assert avec_motif.status_code == 200
    assert Notification.objects.filter(destinataire__username=agent_nom, titre="Vos congés ont été modifiés").exists()
    plan.refresh_from_db()
    assert plan.palier == "rh"

    assert api.post("/api/v1/conges/planification/deposer/", {"debut": "2026-08-03", "fin": "2026-09-01"}, format="json", **_connexion(api, silencieux)).status_code == 409
    fixe = api.post(
        "/api/v1/conges/planification/fixer/",
        {"matricule": silencieux, "debut": "2026-08-03", "fin": "2026-09-01"},
        format="json",
        **chef,
    )
    assert fixe.status_code == 200
    assert any(item["matricule"] == silencieux for item in fixe.json()["plans"])
    assert Notification.objects.filter(destinataire__username=silencieux, titre="Vos congés ont été fixés").exists()
    impose = PlanConge.objects.get(agent__username=silencieux)
    assert impose.origine == "chef" and impose.chez.username == chef_nom

    etat = api.get("/api/v1/conges/planification/export/", **rh)
    assert etat.status_code == 200
    assert etat["Content-Type"] == "application/pdf"
    assert etat.content.startswith(b"%PDF")
    assert agent_nom.encode() in etat.content


def test_surveillance_des_echeances_de_conges(api):
    from datetime import date, timedelta

    from django.contrib.auth.models import User

    from personnel.echeances import surveiller
    from personnel.models import CampagnePlanConge, Notification, Profil

    drh = _connexion(api, "DRH-2018-044")
    # Le jour de l'application (fuseau du projet), pas celui de la machine qui lance les tests.
    aujourd_hui = timezone.localdate()
    ouvert = api.post(
        "/api/v1/conges/planification/ouvrir/",
        {
            "limite_agents": (aujourd_hui + timedelta(days=3)).isoformat(),
            "limite_hierarchie": (aujourd_hui + timedelta(days=10)).isoformat(),
            "limite_rh": (aujourd_hui + timedelta(days=16)).isoformat(),
            "limite_drh": (aujourd_hui + timedelta(days=22)).isoformat(),
            "delai": (aujourd_hui + timedelta(days=28)).isoformat(),
            "communique": "Choisissez vos dates de congés.",
            "exercice": 2027,
        },
        format="json",
        **drh,
    )
    assert ouvert.status_code == 201
    assert surveiller() > 0
    assert Notification.objects.filter(destinataire__username="394812H", titre="Choisissez vos congés").exists()
    deja = Notification.objects.filter(titre="Choisissez vos congés").count()
    assert surveiller() == 0
    assert Notification.objects.filter(titre="Choisissez vos congés").count() == deja

    CampagnePlanConge.objects.filter(exercice=2027).update(
        limite_agents=aujourd_hui - timedelta(days=1),
        limite_hierarchie=aujourd_hui + timedelta(days=1),
    )
    Profil.objects.filter(user__username="394812H").update(superieur=User.objects.get(username="349812K"))
    assert surveiller() > 0
    assert Notification.objects.filter(destinataire__username="349812K", titre="Échéance de votre équipe").exists()

    CampagnePlanConge.objects.filter(exercice=2027).update(statut="soumis", limite_drh=aujourd_hui)
    assert surveiller() > 0
    assert Notification.objects.filter(destinataire__username="DRH-2018-044", titre="Échéance du DRH").exists()


def test_veille_du_retour_previent_l_agent_et_son_superieur(api):
    from datetime import date, timedelta

    from django.contrib.auth.models import User

    from personnel.models import Absence, Agent, InscriptionFormation, Notification, Profil, SessionFormation
    from personnel.retours import surveiller_retours

    # Le jour de l'application (fuseau du projet), pas celui de la machine qui lance les tests.
    aujourd_hui = timezone.localdate()
    agent = Agent.objects.get(matricule="394812H")
    chef = User.objects.get(username="349812K")
    Profil.objects.filter(user__username="394812H").update(superieur=chef)
    Absence.objects.create(
        agent=agent, nature="Congé de test de reprise", debut=aujourd_hui - timedelta(days=4), fin=aujourd_hui,
        jours=4, statut="Arrêté signé", instruction=Absence.Instruction.SIGNE,
    )
    Absence.objects.create(
        agent=agent, nature="Absence refusée de test", debut=aujourd_hui, fin=aujourd_hui,
        jours=1, statut="Invalidée", type_autorisation=Absence.TypeAutorisation.AUTORISATION,
        decision=Absence.Decision.INVALIDEE,
    )
    session = SessionFormation.objects.get(code="perf-donnees")
    session.date_fin = aujourd_hui
    session.annulee = False
    session.save(update_fields=["date_fin", "annulee"])
    InscriptionFormation.objects.filter(demande__agent__matricule="367215R", session=session).update(present=False)

    assert surveiller_retours() > 0
    assert Notification.objects.filter(
        destinataire__username="394812H", titre="Reprise de congé", message__contains="Congé de test de reprise",
    ).exists()
    assert Notification.objects.filter(
        destinataire=chef, titre="Reprise de congé dans votre équipe", message__contains="Congé de test de reprise",
    ).exists()
    assert Notification.objects.filter(
        destinataire__username="394812H", titre="Retour de formation", message__contains=session.libelle,
    ).exists()
    assert Notification.objects.filter(
        destinataire=chef, titre="Retour de formation dans votre équipe", message__contains=session.libelle,
    ).exists()
    assert not Notification.objects.filter(message__contains="Absence refusée de test").exists()
    assert not Notification.objects.filter(
        destinataire__username="367215R", titre="Retour de formation",
    ).exists()
    deja = Notification.objects.count()
    assert surveiller_retours() == 0
    assert Notification.objects.count() == deja

    Absence.objects.create(
        agent=agent, nature="Autorisation de test", debut=aujourd_hui, fin=aujourd_hui,
        jours=1, statut="Validée", type_autorisation=Absence.TypeAutorisation.AUTORISATION,
        decision=Absence.Decision.VALIDEE,
    )
    assert surveiller_retours() == 2
    assert Notification.objects.filter(destinataire__username="394812H", titre="Retour d'absence", message__contains="Autorisation de test").exists()
    assert Notification.objects.filter(destinataire=chef, titre="Retour d'absence dans votre équipe", message__contains="Autorisation de test").exists()


def test_sous_directeur_ne_voit_pas_les_pairs(api):
    from django.contrib.auth.models import User

    from personnel.models import Organisme, Profil

    org = Organisme.objects.get(code="dgpe")
    directeur = User.objects.create_user("DIR-PAIR", password="Sigrh-Dev-2026")
    Profil.objects.create(user=directeur, role="Directeur", fonction="Directeur", organisme=org)
    gauche = User.objects.create_user("SD-PAIR-1", password="Sigrh-Dev-2026")
    Profil.objects.create(
        user=gauche, role="Sous directeur", fonction="Sous-directeur", organisme=org, superieur=directeur,
    )
    droite = User.objects.create_user("SD-PAIR-2", password="Sigrh-Dev-2026")
    Profil.objects.create(
        user=droite, role="Sous directeur", fonction="Sous-directeur", organisme=org, superieur=directeur,
    )
    agent = User.objects.create_user("AG-PAIR", password="Sigrh-Dev-2026")
    Profil.objects.create(user=agent, role="Agent", fonction="Agent", organisme=org, superieur=gauche)

    jeton = api.post("/api/v1/auth/login/", {"matricule": "SD-PAIR-1", "password": "Sigrh-Dev-2026"}, format="json")
    assert jeton.status_code == 200
    liste = api.get("/api/v1/utilisateurs/", HTTP_AUTHORIZATION=f"Token {jeton.json()['token']}")
    assert liste.status_code == 200
    assert {item["matricule"] for item in liste.json()["utilisateurs"]} == {"SD-PAIR-1", "AG-PAIR"}


def test_chaque_utilisateur_change_son_mot_de_passe(api):
    from personnel.models import Notification

    connexion = api.post("/api/v1/auth/login/", {"matricule": "349812K", "password": "Sigrh-Dev-2026"}, format="json")
    assert connexion.status_code == 200
    ancien_jeton = connexion.json()["token"]
    auth = {"HTTP_AUTHORIZATION": f"Token {ancien_jeton}"}
    route = "/api/v1/me/mot-de-passe/"

    faux = api.post(route, {"actuel": "mauvais", "nouveau": "Ministere-Portefeuille-27", "confirmation": "Ministere-Portefeuille-27"}, format="json", **auth)
    assert faux.status_code == 400
    assert "actuel" in faux.json()["detail"]
    differente = api.post(route, {"actuel": "Sigrh-Dev-2026", "nouveau": "Ministere-Portefeuille-27", "confirmation": "Autre-chose-27"}, format="json", **auth)
    assert differente.status_code == 400
    faible = api.post(route, {"actuel": "Sigrh-Dev-2026", "nouveau": "12345678", "confirmation": "12345678"}, format="json", **auth)
    assert faible.status_code == 400

    change = api.post(route, {"actuel": "Sigrh-Dev-2026", "nouveau": "Ministere-Portefeuille-27", "confirmation": "Ministere-Portefeuille-27"}, format="json", **auth)
    assert change.status_code == 200
    nouveau_jeton = change.json()["token"]
    assert nouveau_jeton != ancien_jeton
    assert api.get("/api/v1/me/", **auth).status_code == 401
    assert api.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Token {nouveau_jeton}").status_code == 200
    assert Notification.objects.filter(destinataire__username="349812K", titre="Mot de passe modifié").exists()

    assert api.post("/api/v1/auth/login/", {"matricule": "349812K", "password": "Sigrh-Dev-2026"}, format="json").status_code == 401
    assert api.post("/api/v1/auth/login/", {"matricule": "349812K", "password": "Ministere-Portefeuille-27"}, format="json").status_code == 200


def _acte_pdf():
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("acte.pdf", b"%PDF-1.4 test", content_type="application/pdf")


def test_enfants_a_charge_ajout_et_retrait(api, tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    token = _token(api)
    auth = {"HTTP_AUTHORIZATION": f"Token {token}"}
    url = "/api/v1/agents/349812K/enfants/"
    incomplet = api.post(url, {"nom": "Koné", "prenoms": "Awa"}, format="json", **auth)
    assert incomplet.status_code == 400
    futur = api.post(url, {"nom": "Koné", "prenoms": "Awa", "sexe": "F", "date_naissance": "2999-01-01", "fichier": _acte_pdf()}, format="multipart", **auth)
    assert futur.status_code == 400
    complet = {"nom": "Koné", "prenoms": "Awa", "sexe": "F", "date_naissance": "2015-04-02", "lieu_naissance": "Bouaké"}
    sans_acte = api.post(url, complet, format="json", **auth)
    assert sans_acte.status_code == 400 and "acte de naissance" in sans_acte.json()["detail"]
    ajout = api.post(url, {**complet, "fichier": _acte_pdf()}, format="multipart", **auth)
    assert ajout.status_code == 201
    enfants = ajout.json()["famille"]["enfants"]
    assert enfants[0]["acte_naissance"]["intitule"].startswith("Acte de naissance d'un enfant")
    assert [(e["nom"], e["sexe"], e["date_naissance"], e["lieu_naissance"]) for e in enfants] == [("Koné", "Fille", "2015-04-02", "Bouaké")]
    retrait = api.delete(f"{url}{enfants[0]['id']}/", **auth)
    assert retrait.status_code == 200
    assert retrait.json()["famille"]["enfants"] == []


def test_deposer_document_du_dossier_numerique(api, tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    token = _token(api)
    auth = {"HTTP_AUTHORIZATION": f"Token {token}"}
    url = "/api/v1/agents/349812K/documents/"
    pdf = lambda: SimpleUploadedFile("acte.pdf", b"%PDF-1.4 test", content_type="application/pdf")  # noqa: E731

    assert api.post(url, {"rubrique": "inconnue", "type_document": "cv", "fichier": pdf()}, format="multipart", **auth).status_code == 400
    assert api.post(url, {"rubrique": "diplomes", "type_document": "acte_mariage", "fichier": pdf()}, format="multipart", **auth).status_code == 400
    assert api.post(url, {"rubrique": "diplomes", "type_document": "cv"}, format="multipart", **auth).status_code == 400
    mauvais = SimpleUploadedFile("virus.exe", b"MZ", content_type="application/octet-stream")
    assert api.post(url, {"rubrique": "diplomes", "type_document": "cv", "fichier": mauvais}, format="multipart", **auth).status_code == 400

    reponse = api.post(
        url,
        {"rubrique": "etat_civil", "type_document": "acte_naissance_enfant", "precision": "Awa", "date_expiration": "2030-01-31", "fichier": pdf()},
        format="multipart",
        **auth,
    )
    assert reponse.status_code == 201
    corps = reponse.json()
    piece = next(item for item in corps["pieces"] if item["intitule"] == "Acte de naissance d'un enfant — Awa")
    assert piece["categorie"] == "Actes d'état civil"
    assert piece["date_expiration"] == "2030-01-31"
    assert piece["fichier_url"]
    assert [rubrique["code"] for rubrique in corps["catalogue_documents"]] == ["etat_civil", "diplomes", "administratifs"]


def _jeton(api, matricule: str) -> dict:
    login = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json")
    assert login.status_code == 200, login.content
    return {"HTTP_AUTHORIZATION": f"Token {login.json()['token']}"}


def _secretaire(api) -> dict:
    """Compte au rôle « Secrétaire », rattaché à la structure du DRH."""
    from django.contrib.auth.models import User
    from personnel.models import Profil

    modele = User.objects.get(username="DRH-2018-044")
    compte = User.objects.create_user("SEC-TEST", password="Sigrh-Dev-2026", first_name="Awa", last_name="Kone")
    Profil.objects.create(user=compte, fonction="Secrétaire de direction", role="Secrétaire", organisme=modele.profil.organisme, structure=modele.profil.structure)
    # Le secrétariat suit les agents de sa structure : l'agent des tests y est rattaché.
    from personnel.models import Agent

    Agent.objects.filter(matricule="394812H").update(service="", sous_direction="", direction="", structure=modele.profil.structure.nom)
    return _jeton(api, "SEC-TEST")


def _verser_signe(api, secretaire: dict, reference: str):
    from django.core.files.uploadedfile import SimpleUploadedFile

    fichier = SimpleUploadedFile("signe.pdf", b"%PDF-1.4 signe", content_type="application/pdf")
    return api.post(f"/api/v1/secretariat/{reference}/signe/verser/", {"fichier": fichier}, format="multipart", **secretaire)


def test_demande_acte_parcours_complet(api):
    from datetime import date, timedelta

    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    depot = "/api/v1/agents/394812H/actes-demandes/"

    # Seul l'agent demande en son nom ; le formulaire est contrôlé.
    assert api.post("/api/v1/agents/349812K/actes-demandes/", {"type": "permission", "motif": "x"}, format="json", **agent).status_code == 403
    assert api.post(depot, {"type": "inconnu", "motif": "x"}, format="json", **agent).status_code == 400
    assert api.post(depot, {"type": "attestation-travail", "motif": ""}, format="json", **agent).status_code == 400
    demain = date.today() + timedelta(days=1)
    assert api.post(depot, {"type": "permission", "motif": "Décès", "debut": demain.isoformat()}, format="json", **agent).status_code == 400
    passe = (date.today() - timedelta(days=3)).isoformat()
    assert api.post(depot, {"type": "permission", "motif": "Décès", "debut": passe, "fin": demain.isoformat()}, format="json", **agent).status_code == 400

    reponse = api.post(depot, {"type": "attestation-travail", "motif": "Dossier de visa", "destinataire": "Ambassade"}, format="json", **agent)
    assert reponse.status_code == 201
    demande = next(item for item in reponse.json()["demandes"] if item["categorie"] == "acte")
    reference = demande["reference"]
    assert demande["etape"].startswith("Étape 2") and demande["destinataire"] == "Ambassade"
    assert [visa["avis"] for visa in demande["visas"]] == ["Déposée", "En attente", "En attente", "En attente"]

    # L'agent ne vise pas sa propre demande ; l'acte n'est pas encore délivré.
    assert api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "valider"}, format="json", **agent).status_code == 403
    assert api.get(f"/api/v1/demandes-actes/{reference}/document/", **agent).status_code == 409
    assert reference in [item["reference"] for item in api.get("/api/v1/demandes-actes/", **drh).json()["a_traiter"]]

    assert api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "refuser"}, format="json", **drh).status_code == 400
    for _ in range(2):
        assert api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "valider"}, format="json", **drh).status_code == 200
    final = api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "valider"}, format="json", **drh)
    assert final.status_code == 403

    # Validée de bout en bout, la demande attend le document signé : rien à télécharger avant que le secrétariat le verse.
    assert api.get(f"/api/v1/demandes-actes/{reference}/document/", **agent).status_code == 409
    secretaire = _secretaire(api)
    assert _verser_signe(api, secretaire, reference).status_code == 200
    pdf = api.get(f"/api/v1/demandes-actes/{reference}/document/", **agent)
    assert pdf.status_code == 200 and b"".join(pdf.streaming_content).startswith(b"%PDF")

    # Refus motivé : la demande est close, sans acte.
    autre = api.post(depot, {"type": "permission", "motif": "Mariage", "debut": demain.isoformat(), "fin": demain.isoformat()}, format="json", **agent)
    ref2 = [item for item in autre.json()["demandes"] if item["categorie"] == "acte" and item["type_acte"] == "permission"][0]["reference"]
    refus = api.post(f"/api/v1/demandes-actes/{ref2}/decision/", {"sens": "refuser", "motif": "Période de clôture"}, format="json", **drh)
    assert refus.status_code == 200
    assert api.get(f"/api/v1/demandes-actes/{ref2}/document/", **agent).status_code == 409
    assert api.post(f"/api/v1/demandes-actes/{ref2}/decision/", {"sens": "valider"}, format="json", **drh).status_code == 403


def test_permission_delivree_inscrite_aux_absences_et_quota(api):
    from datetime import date, timedelta

    from personnel.models import Absence

    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    depot = "/api/v1/agents/394812H/actes-demandes/"
    lundi = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)

    from django.core.files.uploadedfile import SimpleUploadedFile

    def justificatif():
        return SimpleUploadedFile("convocation.pdf", b"%PDF-1.4 test", content_type="application/pdf")

    # Sans justificatif, une autorisation spéciale n'est pas recevable.
    sans = api.post(depot, {"type": "autorisation-speciale", "motif": "x", "debut": lundi.isoformat(), "fin": (lundi + timedelta(days=1)).isoformat()}, format="multipart", **agent)
    assert sans.status_code == 400 and "justificatif" in sans.json()["detail"]

    # Le quota d'autorisations spéciales est contrôlé dès le dépôt.
    trop = api.post(depot, {"type": "autorisation-speciale", "motif": "x", "debut": lundi.isoformat(), "fin": (lundi + timedelta(days=27)).isoformat(), "justificatif": justificatif()}, format="multipart", **agent)
    assert trop.status_code == 400 and "dépasse" in trop.json()["detail"]

    lot = api.post(depot, {"type": "autorisation-speciale", "motif": "Mariage d'un frère", "debut": lundi.isoformat(), "fin": (lundi + timedelta(days=1)).isoformat(), "justificatif": justificatif()}, format="multipart", **agent)
    assert lot.status_code == 201
    reference = next(item for item in lot.json()["demandes"] if item["categorie"] == "acte")["reference"]
    assert not Absence.objects.filter(justificatif=f"Acte {reference}").exists()
    for _ in range(2):
        assert api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "valider"}, format="json", **drh).status_code == 200

    absence = Absence.objects.get(justificatif=f"Acte {reference}")
    assert absence.agent.matricule == "394812H"
    assert absence.type_autorisation == "autorisation-speciale" and absence.jours == 2
    assert absence.decision == "validee" and absence.debut == lundi
    dossier = api.get("/api/v1/agents/394812H/", **agent).json()
    assert dossier["conges"]["autorisations_restantes"] == dossier["conges"]["autorisations"] - sum(
        item["jours"] for item in dossier["absences"] if "autorisation" in item["nature"].lower() and item["debut"][:4] == str(date.today().year)
    )
    assert api.get(f"/api/v1/demandes-actes/{reference}/document/", **agent).status_code == 409


def test_modification_du_dossier_reservee_a_l_agent_et_aux_responsables(api, tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    simple = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    enfant = {"nom": "Koné", "prenoms": "Awa", "sexe": "F"}

    # Un agent ne touche pas au dossier d'un autre.
    assert api.post("/api/v1/agents/349812K/enfants/", enfant, format="multipart", **simple).status_code == 403
    assert api.post("/api/v1/agents/349812K/photo/", {}, format="multipart", **simple).status_code == 403
    assert api.post("/api/v1/agents/349812K/piece-identite/", {"type_piece": "cni", "numero": "1"}, format="multipart", **simple).status_code == 403
    assert api.post("/api/v1/agents/349812K/documents/", {"rubrique": "diplomes", "type_document": "cv"}, format="multipart", **simple).status_code == 403
    assert api.delete("/api/v1/agents/349812K/enfants/1/", **simple).status_code == 403

    # Il gère le sien, et le droit est annoncé au front.
    propre = api.post("/api/v1/agents/394812H/enfants/", {**enfant, "fichier": _acte_pdf()}, format="multipart", **simple)
    assert propre.status_code == 201 and propre.json()["modifiable"] is True
    assert api.get("/api/v1/agents/394812H/", **simple).json()["modifiable"] is True

    # Le DRH gère le dossier d'un agent de son périmètre.
    assert api.post("/api/v1/agents/394812H/enfants/", {**enfant, "fichier": _acte_pdf()}, format="multipart", **drh).status_code == 201


def test_justificatif_de_demande_visible_et_fichiers_lisibles_depuis_le_front(api, tmp_path, settings):
    from datetime import date, timedelta

    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    depot = "/api/v1/agents/394812H/actes-demandes/"
    jour = (date.today() + timedelta(days=3)).isoformat()
    base = {"type": "permission-speciale", "motif": "Décès", "debut": jour, "fin": jour}

    mauvais = SimpleUploadedFile("virus.exe", b"MZ")
    assert api.post(depot, {**base, "justificatif": mauvais}, format="multipart", **agent).status_code == 400

    pdf = SimpleUploadedFile("deces.pdf", b"%PDF-1.4 test", content_type="application/pdf")
    reponse = api.post(depot, {**base, "justificatif": pdf}, format="multipart", **agent)
    assert reponse.status_code == 201
    demande = next(item for item in reponse.json()["demandes"] if item["categorie"] == "acte")
    url = demande["justificatif_url"]
    assert url.startswith("/sigrh/media/justificatifs/")

    # Le responsable voit le justificatif dans sa file.
    file_drh = api.get("/api/v1/demandes-actes/", **drh).json()["a_traiter"]
    assert [item["justificatif_url"] for item in file_drh if item["reference"] == demande["reference"]] == [url]

    # Le fichier se lit depuis le front : accès croisé autorisé, et affichable dans la page de même origine.
    lecture = api.get(url, HTTP_ORIGIN="http://127.0.0.1:9100")
    assert lecture.status_code == 200
    assert lecture["Access-Control-Allow-Origin"] == "http://127.0.0.1:9100"
    assert lecture["X-Frame-Options"] == "SAMEORIGIN"


def test_actes_configurables_et_circuit_par_defaut_ou_attribue(api):
    from datetime import date, timedelta

    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    depot = "/api/v1/agents/394812H/actes-demandes/"

    # Les cinq actes d'origine alimentent la liste déroulante et se retrouvent dans la configuration.
    types = api.get("/api/v1/demandes-actes/", **agent).json()["types"]
    assert [item["libelle"] for item in types][:2] == ["Attestation de travail", "Attestation de présence au poste"]
    configuration = api.get("/api/v1/circuits/configuration/", **drh).json()
    assert len(configuration["elements"]["actes"]) == 6

    # Un nouvel acte se crée dans la configuration ; il apparaît aussitôt dans le choix de l'agent.
    cree = api.post("/api/v1/circuits/actes/", {"libelle": "Certificat de scolarité", "destinataire": True, "justificatif": "Joindre le livret"}, format="json", **drh)
    assert cree.status_code == 201
    acte = cree.json()
    assert acte["code"] == "certificat-de-scolarite" and acte["circuit_id"] is None
    assert api.post("/api/v1/circuits/actes/", {"libelle": "certificat de SCOLARITÉ"}, format="json", **drh).status_code == 400
    assert api.post("/api/v1/circuits/actes/", {"libelle": " "}, format="json", **drh).status_code == 400
    assert "Certificat de scolarité" in [item["libelle"] for item in api.get("/api/v1/demandes-actes/", **agent).json()["types"]]
    modifie = api.put(f"/api/v1/circuits/actes/{acte['id']}/", {"libelle": "Certificat de scolarité des enfants", "periode": False}, format="json", **drh)
    assert modifie.status_code == 200 and modifie.json()["code"] == "certificat-de-scolarite"

    # Sans circuit attribué : circuit par défaut (chef de service, DRH, délivrance).
    defaut = api.post(depot, {"type": acte["code"], "motif": "Inscription"}, format="json", **agent).json()
    visas = next(item for item in defaut["demandes"] if item["type_acte"] == acte["code"])["visas"]
    assert [visa["instance"] for visa in visas] == ["Requête déposée", "Visa du chef de service", "Visa DRH", "Acte délivré"]

    # Attribué à un circuit configuré : une seule étape, tenue par le Directeur.
    circuit = api.post(
        "/api/v1/circuits/configuration/",
        {"nom": "Circuit court", "etapes": [{"instance": "Directeur", "fonction": "DRH"}], "attributions": [{"famille": "acte", "code": "attestation-travail"}]},
        format="json",
        **drh,
    )
    assert circuit.status_code == 201
    assert circuit.json()["attributions"] == [{"famille": "acte", "code": "attestation-travail", "libelle": "Attestation de travail"}]
    assert api.post("/api/v1/circuits/configuration/", {"nom": "X", "etapes": [{"instance": "Directeur"}], "attributions": [{"famille": "acte", "code": "inconnu"}]}, format="json", **drh).status_code == 400

    court = api.post(depot, {"type": "attestation-travail", "motif": "Visa"}, format="json", **agent).json()
    demande = next(item for item in court["demandes"] if item["type_acte"] == "attestation-travail")
    assert [visa["instance"] for visa in demande["visas"]] == ["Requête déposée", "Directeur", "Acte délivré"]
    assert demande["etape"].startswith("Étape 2 : Directeur")
    decision = api.post(f"/api/v1/demandes-actes/{demande['reference']}/decision/", {"sens": "valider"}, format="json", **drh)
    assert decision.status_code == 200
    assert api.get(f"/api/v1/demandes-actes/{demande['reference']}/document/", **agent).status_code == 409

    # Un acte aux demandes en cours ne se retire pas ; une fois traitées, si.
    assert api.delete(f"/api/v1/circuits/actes/{acte['id']}/", **drh).status_code == 409
    ref = next(item for item in defaut["demandes"] if item["type_acte"] == acte["code"])["reference"]
    for _ in range(2):
        api.post(f"/api/v1/demandes-actes/{ref}/decision/", {"sens": "valider"}, format="json", **drh)
    # Validée, la demande attend encore le document signé : elle reste en cours jusqu'à son versement.
    assert api.delete(f"/api/v1/circuits/actes/{acte['id']}/", **drh).status_code == 409
    assert _verser_signe(api, _secretaire(api), ref).status_code == 200
    assert api.delete(f"/api/v1/circuits/actes/{acte['id']}/", **drh).status_code == 200
    assert acte["code"] not in [item["code"] for item in api.get("/api/v1/demandes-actes/", **agent).json()["types"]]


def test_sous_rubriques_d_actes_et_heritage_du_circuit(api):
    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    depot = "/api/v1/agents/394812H/actes-demandes/"

    # « Permission spéciale d'absence » est rangée sous « Permission », qui garde son propre sens.
    types = api.get("/api/v1/demandes-actes/", **agent).json()["types"]
    par_code = {item["code"]: item for item in types}
    assert par_code["permission-speciale"]["parent"] == "permission" and par_code["permission"]["parent"] == ""
    codes = [item["code"] for item in types]
    assert codes.index("permission-speciale") == codes.index("permission") + 1

    elements = {item["code"]: item for item in api.get("/api/v1/circuits/configuration/", **drh).json()["elements"]["actes"]}
    assert elements["permission-speciale"]["parent"] == "permission"
    permission_id, speciale_id = elements["permission"]["id"], elements["permission-speciale"]["id"]

    # Un seul niveau ; pas de boucle ; une rubrique qui a des sous-rubriques ne se retire pas.
    assert api.put(f"/api/v1/circuits/actes/{permission_id}/", {"libelle": "Permission", "parent": "permission-speciale"}, format="json", **drh).status_code == 400
    assert api.put(f"/api/v1/circuits/actes/{speciale_id}/", {"libelle": "Permission spéciale d'absence", "parent": "permission-speciale"}, format="json", **drh).status_code == 400
    assert api.post("/api/v1/circuits/actes/", {"libelle": "Sous-sous", "parent": "permission-speciale"}, format="json", **drh).status_code == 400
    assert api.post("/api/v1/circuits/actes/", {"libelle": "Autre", "parent": "inconnue"}, format="json", **drh).status_code == 400
    assert api.delete(f"/api/v1/circuits/actes/{permission_id}/", **drh).status_code == 409

    # Une sous-rubrique se crée sous une rubrique.
    mariage = api.post("/api/v1/circuits/actes/", {"libelle": "Permission de mariage", "parent": "permission", "periode": True}, format="json", **drh)
    assert mariage.status_code == 201 and mariage.json()["parent"] == "permission"

    # Sans circuit propre, une sous-rubrique suit le circuit de sa rubrique.
    api.post(
        "/api/v1/circuits/configuration/",
        {"nom": "Circuit permissions", "etapes": [{"instance": "Directeur", "fonction": "DRH"}], "attributions": [{"famille": "acte", "code": "permission"}]},
        format="json",
        **drh,
    )
    types = {item["code"]: item for item in api.get("/api/v1/demandes-actes/", **agent).json()["types"]}
    assert types["permission"]["circuit"] == ["Directeur"]
    assert types["permission-speciale"]["circuit"] == ["Directeur"]
    assert types["permission-de-mariage"]["circuit"] == ["Directeur"]
    assert types["autorisation-speciale"]["circuit"] == ["Visa du chef de service", "Visa DRH"]


def test_conges_et_absences_configurables_et_demandables_par_l_agent(api):
    from datetime import date, timedelta

    agent = _jeton(api, "394812H")
    autre = _jeton(api, "349812K")
    drh = _jeton(api, "DRH-2018-044")
    depot = "/api/v1/agents/394812H/conges/demande/"
    lundi = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
    periode = {"debut": lundi.isoformat(), "fin": (lundi + timedelta(days=3)).isoformat(), "interim": "Collègue"}

    # Congés : sous-rubriques d'un seul niveau, noms uniques, congé annuel protégé.
    elements = api.get("/api/v1/circuits/configuration/", **drh).json()["elements"]
    annuel = next(item for item in elements["conges"] if item["code"] == "conge-annuel")
    assert all("id" in item for item in elements["conges"] + elements["absences"])
    cree = api.post("/api/v1/circuits/elements/conge/", {"libelle": "Congé d'étude", "parent": ""}, format="json", **drh)
    assert cree.status_code == 201 and cree.json()["code"] == "conge-detude"
    assert api.post("/api/v1/circuits/elements/conge/", {"libelle": "CONGÉ d'étude"}, format="json", **drh).status_code == 400
    sous = api.post("/api/v1/circuits/elements/conge/", {"libelle": "Congé d'étude à l'étranger", "parent": "conge-detude"}, format="json", **drh)
    assert sous.status_code == 201 and sous.json()["parent"] == "conge-detude"
    assert api.post("/api/v1/circuits/elements/conge/", {"libelle": "Trop profond", "parent": sous.json()["code"]}, format="json", **drh).status_code == 400
    assert api.delete(f"/api/v1/circuits/elements/conge/{cree.json()['id']}/", **drh).status_code == 409
    assert api.delete(f"/api/v1/circuits/elements/conge/{annuel['id']}/", **drh).status_code == 409
    assert api.post("/api/v1/circuits/elements/inconnu/", {"libelle": "x"}, format="json", **drh).status_code == 400

    # Absences : renommer sans changer le code, créer, attribuer un circuit.
    absence = api.post("/api/v1/circuits/elements/absence/", {"libelle": "Absence pour concours"}, format="json", **drh).json()
    renomme = api.put(f"/api/v1/circuits/elements/absence/{absence['id']}/", {"libelle": "Absence pour concours professionnel"}, format="json", **drh)
    assert renomme.status_code == 200 and renomme.json()["code"] == absence["code"]
    api.post(
        "/api/v1/circuits/configuration/",
        {"nom": "Circuit concours", "etapes": [{"instance": "Directeur", "fonction": "DRH"}], "attributions": [{"famille": "absence", "code": absence["code"]}]},
        format="json",
        **drh,
    )

    # Ce que l'agent voit dans son espace suit la configuration.
    dossier = api.get("/api/v1/agents/394812H/", **agent).json()
    assert absence["code"] in [item["code"] for item in dossier["types_absences"]]
    assert "conge-detude" in [item["code"] for item in dossier["types_conges"]]

    # Il dépose une absence configurée : elle suit le circuit attribué.
    assert api.post("/api/v1/agents/349812K/conges/demande/", {"type": absence["code"], **periode}, format="json", **agent).status_code == 403
    reponse = api.post(depot, {"type": absence["code"], **periode}, format="json", **agent)
    assert reponse.status_code == 201
    demande = next(item for item in reponse.json()["demandes"] if item["nature"].startswith("Absence pour concours professionnel"))
    assert demande["etape"].startswith("Étape 2 : Directeur")
    assert [visa["instance"] for visa in demande["visas"]][:2] == ["Requête déposée", "Directeur"]
    assert api.post(depot, {"type": "inconnu", **periode}, format="json", **agent).status_code == 400

    # Une absence en cours ne se retire pas à la légère : sans demande de congé liée, elle se retire.
    assert api.delete(f"/api/v1/circuits/elements/absence/{absence['id']}/", **drh).status_code == 200
    assert api.delete(f"/api/v1/circuits/elements/conge/{sous.json()['id']}/", **drh).status_code == 200
    assert api.delete(f"/api/v1/circuits/elements/conge/{cree.json()['id']}/", **drh).status_code == 200
    assert autre  # le jeton d'un autre agent n'a servi qu'à vérifier le refus ci-dessus


def test_sous_rubrique_de_conge_suit_le_circuit_de_sa_rubrique(api):
    from datetime import date, timedelta

    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    lundi = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
    api.post(
        "/api/v1/circuits/configuration/",
        {"nom": "Circuit maladie", "etapes": [{"instance": "Directeur", "fonction": "DRH"}], "attributions": [{"famille": "conge", "code": "conge-maladie"}]},
        format="json",
        **drh,
    )
    reponse = api.post(
        "/api/v1/agents/394812H/conges/demande/",
        {"type": "maladie-courte", "debut": lundi.isoformat(), "fin": (lundi + timedelta(days=2)).isoformat(), "interim": "Collègue"},
        format="json",
        **agent,
    )
    assert reponse.status_code == 201
    demande = next(item for item in reponse.json()["demandes"] if item["nature"].startswith("Congé de maladie de courte durée"))
    assert [visa["instance"] for visa in demande["visas"]][:2] == ["Requête déposée", "Directeur"]


def test_parcours_academique_plusieurs_diplomes(api, tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    auth = {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}
    url = "/api/v1/agents/349812K/diplomes/"
    assert api.post(url, {"niveau_etude": "inconnu"}, format="json", **auth).status_code == 400
    avant = len(api.get("/api/v1/agents/349812K/", **auth).json()["parcours_academique"]["diplomes"])
    sans = api.post(url, {"niveau_etude": "licence", "libelle": "Licence de droit"}, format="json", **auth)
    assert sans.status_code == 400 and "Joignez le diplôme" in sans.json()["detail"]
    api.post(url, {"niveau_etude": "licence", "libelle": "Licence de droit", "domaine_formation": "Droit", "fichier": _acte_pdf()}, format="multipart", **auth)
    ajout = api.post(url, {"niveau_etude": "master", "libelle": "Master de gestion", "domaine_formation": "Gestion", "fichier": _acte_pdf()}, format="multipart", **auth)
    assert ajout.status_code == 201
    parcours = ajout.json()["parcours_academique"]
    assert len(parcours["diplomes"]) == avant + 2
    assert parcours["niveau_etude_code"] == "master"  # le diplôme le plus élevé alimente la fiche
    retrait = api.delete(f"{url}{parcours['diplomes'][-1]['id']}/", **auth)
    assert retrait.status_code == 200
    assert len(retrait.json()["parcours_academique"]["diplomes"]) == avant + 1


def test_profil_controle_telephone_et_noms(api):
    auth = {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}
    url = "/api/v1/agents/349812K/profil/"
    assert api.patch(url, {"telephone": "12345"}, format="json", **auth).status_code == 400
    assert api.patch(url, {"contact_urgence_telephone": "+33 6 12 34 56 78"}, format="json", **auth).status_code == 400
    assert api.patch(url, {"prenoms": "K0uassi"}, format="json", **auth).status_code == 400
    assert api.patch(url, {"courriel": "pas-un-courriel"}, format="json", **auth).status_code == 400
    ok = api.patch(url, {"telephone": "+225 07 08 09 10 11", "telephone_secondaire": "", "nom_jeune_fille": "N'Guessan"}, format="json", **auth)
    assert ok.status_code == 200


def test_position_en_formation_pendant_un_module(api):
    from datetime import timedelta

    from django.utils import timezone

    from personnel.models import Agent, InscriptionFormation
    from personnel.positions import synchroniser_situation

    agent = Agent.objects.get(matricule="349812K")
    inscription = InscriptionFormation.objects.filter(demande__agent=agent).first()
    assert inscription is not None
    jour = timezone.localdate()
    session = inscription.session
    session.date_debut, session.date_fin, session.cloturee_le, session.annulee = jour - timedelta(days=2), jour + timedelta(days=5), None, False
    session.save()
    agent.situation = "En activité"
    synchroniser_situation(agent)
    assert agent.situation == "En formation"
    # La session terminée, l'agent redevient en activité.
    session.date_fin = jour - timedelta(days=1)
    session.save()
    synchroniser_situation(agent)
    assert agent.situation == "En activité"


def test_diplome_relie_a_son_justificatif(api, tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    auth = {"HTTP_AUTHORIZATION": f"Token {_token(api)}"}
    url = "/api/v1/agents/349812K/diplomes/"
    pdf = lambda: SimpleUploadedFile("master.pdf", b"%PDF-1.4 test", content_type="application/pdf")  # noqa: E731

    # À l'ajout : le fichier est versé au coffre (rubrique Diplômes) et rattaché à la ligne.
    ajout = api.post(url, {"niveau_etude": "master", "libelle": "Master de gestion", "fichier": pdf()}, format="multipart", **auth)
    assert ajout.status_code == 201
    corps = ajout.json()
    ligne = next(d for d in corps["parcours_academique"]["diplomes"] if d["libelle"] == "Master de gestion")
    assert ligne["piece"]["intitule"].startswith("Diplôme")
    piece = next(p for p in corps["pieces"] if p["id"] == ligne["piece"]["id"])
    assert piece["categorie"] == "Diplômes & Certifications" and piece["diplome"] == "Master de gestion"

    # Un justificatif déjà versé, non rattaché, peut être choisi pour une autre ligne ; un fichier étranger est refusé.
    versee = api.post("/api/v1/agents/349812K/documents/", {"rubrique": "diplomes", "type_document": "diplome", "fichier": pdf()}, format="multipart", **auth)
    libre = versee.json()["parcours_academique"]["pieces_libres"][-1]
    assert api.post(url, {"niveau_etude": "licence", "libelle": "Licence de droit", "piece_id": "999999"}, format="json", **auth).status_code == 400
    lie = api.post(url, {"niveau_etude": "licence", "libelle": "Licence de droit", "piece_id": libre["id"]}, format="json", **auth)
    assert lie.status_code == 201
    cible = next(d for d in lie.json()["parcours_academique"]["diplomes"] if d["libelle"] == "Licence de droit")
    assert cible["piece"]["id"] == libre["id"]

    # Le diplôme est obligatoire : on ne détache pas le justificatif.
    detache = api.delete(f"{url}{cible['id']}/justificatif/", **auth)
    assert detache.status_code == 400


def test_conge_sans_remplacant_et_decompte_par_nature(api):
    auth = _auth(api)
    url = "/api/v1/agents/340188P/conges/demande/"
    autre = next(
        enfant["code"] for type_ in api.get("/api/v1/agents/340188P/", **auth).json()["types_conges"]
        for enfant in (type_["enfants"] or [{"code": type_["code"], "libelle": type_["libelle"]}])
        if "annuel" not in enfant["libelle"].lower()
    )
    # Du lundi 4 au lundi 18 mai 2026 : 14 jours calendaires, 10 jours ouvrables. Le remplaçant est facultatif.
    annuel = api.post(url, {"type": "conge-annuel", "debut": "2026-05-04", "fin": "2026-05-18"}, format="json", **auth)
    assert annuel.status_code == 201
    assert any(d["nature"] == "Congé annuel (14 j)" for d in annuel.json()["demandes"])
    ouvrable = api.post(url, {"type": autre, "debut": "2026-05-04", "fin": "2026-05-18"}, format="json", **auth)
    assert ouvrable.status_code == 201
    assert any(d["nature"].endswith("(10 j)") for d in ouvrable.json()["demandes"])


def test_conge_suit_le_circuit_de_validation_jusqu_a_la_cloture(api):
    from personnel.models import Agent

    auth = _auth(api)
    avant = Agent.objects.get(matricule="340188P").conges_consommes
    depot = api.post(
        "/api/v1/agents/340188P/conges/demande/",
        {"type": "conge-annuel", "debut": "2026-05-04", "fin": "2026-05-12"},
        format="json",
        **auth,
    )
    assert depot.status_code == 201
    demande = next(d for d in depot.json()["demandes"] if d["nature"] == "Congé annuel (8 j)")
    reference = demande["reference"]
    attendus = [v["instance"] for v in demande["visas"] if v["avis"] == "En attente" and not v["instance"].startswith("Scan")]
    assert attendus  # au moins un visa à apposer

    # L'approbateur retrouve la demande dans sa liste « à viser », puis la vise étape par étape.
    decision = f"/api/v1/demandes-actes/{reference}/decision/"
    for rang, instance in enumerate(attendus):
        a_viser = api.get("/api/v1/demandes-actes/", **auth).json()["a_traiter"]
        courante = next((d for d in a_viser if d["reference"] == reference), None)
        assert courante is not None, f"la demande devrait attendre le visa « {instance} »"
        assert courante["categorie"] == "conge"
        reponse = api.post(decision, {"sens": "valider"}, format="json", **auth)
        assert reponse.status_code == 200
        suivie = next(d for d in reponse.json()["demandes"] if d["reference"] == reference)
        if rang < len(attendus) - 1:
            assert not suivie["etape"].startswith("Clôturée")

    assert suivie["etape"] == "Clôturée : congé accordé"
    assert Agent.objects.get(matricule="340188P").conges_consommes == avant + 8
    assert api.post(decision, {"sens": "valider"}, format="json", **auth).status_code in {400, 403}  # plus rien à viser


def test_conge_refuse_clot_la_demande_sans_toucher_au_reliquat(api):
    from personnel.models import Agent

    auth = _auth(api)
    avant = Agent.objects.get(matricule="340188P").conges_consommes
    depot = api.post("/api/v1/agents/340188P/conges/demande/", {"type": "conge-annuel", "debut": "2026-06-01", "fin": "2026-06-08"}, format="json", **auth)
    reference = next(d for d in depot.json()["demandes"] if d["nature"] == "Congé annuel (7 j)")["reference"]
    decision = f"/api/v1/demandes-actes/{reference}/decision/"
    assert api.post(decision, {"sens": "refuser"}, format="json", **auth).status_code == 400  # motif exigé
    refus = api.post(decision, {"sens": "refuser", "motif": "Période de clôture des comptes"}, format="json", **auth)
    assert refus.status_code == 200
    assert next(d for d in refus.json()["demandes"] if d["reference"] == reference)["etape"] == "Clôturée : demande refusée"
    assert Agent.objects.get(matricule="340188P").conges_consommes == avant


def test_modules_ouverts_exposent_leurs_details_et_l_inscription_est_protegee(api):
    auth = _auth(api)
    module = next(m for m in api.get("/api/v1/agents/340188P/", **auth).json()["sessions_formations"] if m["code"] == "prep-redacteur")
    for champ in ("type_libelle", "lieu", "date_debut", "date_fin", "heures", "places", "places_restantes", "inscriptions_fin"):
        assert champ in module
    assert 0 <= module["places_restantes"] <= module["places"]
    # Un agent sans lien avec le dossier ne peut pas y déposer une candidature.
    autre = _jeton(api, "394812H")
    assert api.post("/api/v1/agents/340188P/formations/inscription/", {"code": "prep-redacteur"}, format="json", **autre).status_code == 403


def _autre_structure(matricule: str) -> int:
    from personnel.dotation_agents import structure_actuelle
    from personnel.models import Agent, EntiteTutelle

    actuelle = structure_actuelle(Agent.objects.get(matricule=matricule))
    return EntiteTutelle.objects.exclude(niveau="ministere").exclude(pk=actuelle.pk if actuelle else 0).order_by("id").first().pk


def test_mutation_demandee_par_l_agent_suit_le_circuit_puis_le_rattache(api):
    from personnel.models import Agent, EntiteTutelle, EtapeParcours, Mutation

    agent, drh = _jeton(api, "340188P"), _auth(api)
    cible = _autre_structure("340188P")
    url = "/api/v1/mobilite/mutations/"
    assert api.post(url, {"structure": cible}, format="json", **agent).status_code == 400  # motif exigé
    assert api.post(url, {"structure": 0, "motif": "Rapprochement"}, format="json", **agent).status_code == 400
    depot = api.post(url, {"structure": cible, "motif": "Rapprochement familial"}, format="json", **agent)
    assert depot.status_code == 201
    mutation = depot.json()
    assert mutation["pour_un_autre"] is False and mutation["statut"] == "en_cours"
    assert [v["avis"] for v in mutation["visas"]] == ["Déposée", "En attente", "En attente", "En attente"]
    assert api.post(url, {"structure": cible, "motif": "Encore"}, format="json", **agent).status_code == 400  # une seule demande en cours
    assert api.post(f"/api/v1/demandes-actes/{mutation['reference']}/decision/", {"sens": "valider"}, format="json", **agent).status_code == 403  # pas sa propre demande

    decision = f"/api/v1/demandes-actes/{mutation['reference']}/decision/"
    for _ in range(3):
        a_viser = api.get("/api/v1/demandes-actes/", **drh).json()["a_traiter"]
        assert any(d["reference"] == mutation["reference"] and d["categorie"] == "mutation" for d in a_viser)
        assert api.post(decision, {"sens": "valider"}, format="json", **drh).status_code == 200

    item = Mutation.objects.get(demande__reference=mutation["reference"])
    assert item.statut == "accordee"
    assert item.demande.etape == "Clôturée : mutation accordée"
    assert Agent.objects.get(matricule="340188P").structure == EntiteTutelle.objects.get(pk=cible).nom
    assert EtapeParcours.objects.filter(agent__matricule="340188P", type="mutation", reference_acte=mutation["reference"]).exists()


def test_mutation_demandee_par_la_hierarchie_notifie_l_agent(api):
    from personnel.models import Mutation, Notification

    drh = _auth(api)
    cible = _autre_structure("340188P")
    depot = api.post("/api/v1/mobilite/mutations/", {"matricule": "340188P", "structure": cible, "motif": "Besoin du service"}, format="json", **drh)
    assert depot.status_code == 201
    mutation = depot.json()
    assert mutation["pour_un_autre"] is True
    # La hiérarchie qui dépose a déjà donné ses visas ; l'agent est prévenu dès le dépôt.
    assert mutation["visas"][1]["avis"] == "Favorable"
    assert Notification.objects.filter(destinataire__username="340188P", titre="Demande de mutation vous concernant").exists()

    # Un refus clôt la demande, avec un motif, et prévient l'agent comme le demandeur.
    for cle in ("DRH-2018-044",):
        assert Mutation.objects.filter(demandeur__username=cle).exists()
    decision = f"/api/v1/demandes-actes/{mutation['reference']}/decision/"
    assert api.post(decision, {"sens": "refuser"}, format="json", **drh).status_code == 400
    assert api.post(decision, {"sens": "refuser", "motif": "Effectif insuffisant"}, format="json", **drh).status_code == 200
    assert Mutation.objects.get(demande__reference=mutation["reference"]).statut == "refusee"
    assert Notification.objects.filter(destinataire__username="340188P", titre="Mutation refusée").exists()


def test_mutation_d_un_autre_agent_reservee_a_sa_hierarchie(api):
    simple = _jeton(api, "394812H")
    cible = _autre_structure("340188P")
    refus = api.post("/api/v1/mobilite/mutations/", {"matricule": "340188P", "structure": cible, "motif": "Test"}, format="json", **simple)
    assert refus.status_code == 403


def test_mutation_avec_document_joint_facultatif(api, tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    agent, drh = _jeton(api, "340188P"), _auth(api)
    cible = _autre_structure("340188P")
    url = "/api/v1/mobilite/mutations/"
    mauvais = SimpleUploadedFile("lettre.exe", b"MZ", content_type="application/octet-stream")
    assert api.post(url, {"structure": cible, "motif": "Rapprochement", "justificatif": mauvais}, format="multipart", **agent).status_code == 400

    lettre = SimpleUploadedFile("lettre.pdf", b"%PDF-1.4 lettre", content_type="application/pdf")
    depot = api.post(url, {"structure": cible, "motif": "Rapprochement", "justificatif": lettre}, format="multipart", **agent)
    assert depot.status_code == 201
    mutation = depot.json()
    assert mutation["document_nom"].startswith("lettre") and mutation["document_url"]
    # L'approbateur retrouve le document dans sa liste « à viser ».
    ligne = next(d for d in api.get("/api/v1/demandes-actes/", **drh).json()["a_traiter"] if d["reference"] == mutation["reference"])
    assert ligne["justificatif_url"]


def test_etat_pdf_de_l_agent_reprend_toutes_les_informations_du_profil(api, monkeypatch, tmp_path, settings):
    settings.MEDIA_ROOT = tmp_path
    from personnel.rapports import documents

    auth = _auth(api)
    api.patch("/api/v1/agents/349812K/profil/", {"nom_jeune_fille": "Traoré", "telephone": "07 08 09 10 11", "adresse_residence": "Cocody Angré", "ville": "Abidjan"}, format="json", **auth)
    api.post("/api/v1/agents/349812K/enfants/", {"nom": "Koné", "prenoms": "Awa", "sexe": "F", "date_naissance": "2015-04-02", "lieu_naissance": "Bouaké", "fichier": _acte_pdf()}, format="multipart", **auth)
    api.post("/api/v1/agents/349812K/diplomes/", {"niveau_etude": "master", "libelle": "Master de gestion", "domaine_formation": "Gestion", "fichier": _acte_pdf()}, format="multipart", **auth)

    saisis = []
    original = documents._sections_profil
    monkeypatch.setattr(documents, "_sections_profil", lambda feuille, agent: saisis.append(original(feuille, agent)) or saisis[-1])
    reponse = api.get("/api/v1/agents/349812K/dossier/", **auth)
    assert reponse.status_code == 200 and reponse.content.startswith(b"%PDF")

    def textes(element):
        if hasattr(element, "_cellvalues"):
            for ligne in element._cellvalues:
                for cellule in ligne:
                    yield from textes(cellule)
        elif hasattr(element, "text"):
            yield element.text
        elif isinstance(element, (list, tuple)):
            for sous in element:
                yield from textes(sous)

    contenu = " ".join(textes(saisis[0])).casefold()  # les titres de section sont imprimés en capitales
    for attendu in ("État civil", "Coordonnées", "Famille", "Parcours académique", "Traoré", "Cocody Angré", "Koné Awa", "Bouaké", "Master de gestion"):
        assert attendu.casefold() in contenu, attendu


def test_l_agent_est_prevenu_quand_son_dossier_est_modifie_par_un_autre(api, tmp_path, settings):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel.models import Notification

    settings.MEDIA_ROOT = tmp_path

    drh = _auth(api)
    lui = _jeton(api, "349812K")
    mes = lambda: list(Notification.objects.filter(destinataire__username="349812K", categorie="dossier").values_list("titre", "message"))  # noqa: E731
    avant = len(mes())

    # Situation administrative : l'agent apprend quelles rubriques ont changé, avant → après.
    dossier = api.get("/api/v1/agents/349812K/", **drh).json()
    saisie = {**dossier["situation_saisie"], "grade": "A6", "fonction": "Sous-directeur"}
    assert api.patch("/api/v1/agents/349812K/", saisie, format="json", **drh).status_code == 200
    titre, message = mes()[-1] if len(mes()) > avant else ("", "")
    assert titre == "Votre situation administrative a été modifiée" and "Grade" in message and "A6" in message and "Fonction" in message

    # Une saisie sans changement ne prévient personne.
    nombre = len(mes())
    api.patch("/api/v1/agents/349812K/", {**dossier["situation_saisie"], "grade": "A6", "fonction": "Sous-directeur"}, format="json", **drh)
    assert len(mes()) == nombre

    # Positions administratives : ajout, modification, suppression.
    acte = SimpleUploadedFile("acte.pdf", b"%PDF-1.4 acte", content_type="application/pdf")
    ajout = api.post("/api/v1/agents/349812K/positions/", {"type": "disponibilite", "date_debut": "2030-01-01", "document": acte}, format="multipart", **drh)
    assert ajout.status_code == 201, ajout.content
    api.patch(f"/api/v1/agents/349812K/positions/{ajout.json()['id']}/", {"date_fin": "2030-12-31"}, format="json", **drh)
    api.delete(f"/api/v1/agents/349812K/positions/{ajout.json()['id']}/", **drh)
    titres = [t for t, _m in mes()]
    assert {"Position administrative ajoutée", "Position administrative modifiée", "Position administrative supprimée"} <= set(titres)

    # Parcours professionnel.
    etape = api.post("/api/v1/agents/349812K/parcours/", {"type": "promotion", "intitule": "Promotion au grade A6", "date_effet": "2026-01-01"}, format="json", **drh)
    assert etape.status_code == 201
    assert "Parcours professionnel : événement ajouté" in [t for t, _m in mes()]

    # Quand l'agent modifie lui-même son dossier, il n'est pas notifié de sa propre action.
    avant_soi = len(mes())
    api.patch("/api/v1/agents/349812K/profil/", {"ville": "Abidjan"}, format="json", **lui)
    assert len(mes()) == avant_soi


def test_le_compte_administrateur_indique_ses_conges_comme_un_agent_mais_pas_le_drh(api):
    from datetime import timedelta

    from django.contrib.auth.models import User
    from django.utils import timezone

    from personnel.models import Organisme, PlanConge, Profil

    rh = _connexion(api, "411904C")
    drh = _connexion(api, "DRH-2018-044")
    admin = User.objects.create_user(username="ADMIN-conges", password="Sigrh-Dev-2026")
    Profil.objects.create(user=admin, fonction="Administrateur", role="Administrateur", organisme=Organisme.objects.first(), administrateur=True)
    aujourd_hui = timezone.localdate()
    corps = {
        "limite_agents": (aujourd_hui + timedelta(days=5)).isoformat(), "limite_hierarchie": (aujourd_hui + timedelta(days=12)).isoformat(),
        "limite_rh": (aujourd_hui + timedelta(days=20)).isoformat(), "limite_drh": (aujourd_hui + timedelta(days=30)).isoformat(),
        "delai": (aujourd_hui + timedelta(days=35)).isoformat(), "communique": "Choisissez vos dates.", "exercice": 2026,
    }
    assert api.post("/api/v1/conges/planification/ouvrir/", corps, format="json", **rh).status_code == 201
    assert api.post("/api/v1/conges/planification/accorder/", **drh).status_code == 200

    compte = _connexion(api, "ADMIN-conges")
    assert api.get("/api/v1/conges/planification/", **compte).json()["campagne"]["formulaire"] is True
    assert api.get("/api/v1/conges/planification/", **drh).json()["campagne"]["formulaire"] is False
    assert api.post("/api/v1/conges/planification/deposer/", {"debut": "2026-07-06", "fin": "2026-08-04"}, format="json", **drh).status_code == 403
    assert api.post("/api/v1/conges/planification/deposer/", {"debut": "2026-07-06", "fin": "2026-08-04"}, format="json", **compte).status_code == 200
    assert PlanConge.objects.filter(agent__username="ADMIN-conges").exists()


def test_conges_pris_en_deux_temps(api):
    from datetime import timedelta

    from django.utils import timezone

    from personnel.models import PlanConge

    from personnel.models import Agent

    Agent.objects.filter(matricule__in=["394812H", "318490K", "523406L"]).update(conges_acquis=30, conges_consommes=0)  # droit de référence : 30 jours
    rh = _connexion(api, "411904C")
    drh = _connexion(api, "DRH-2018-044")
    agent = _connexion(api, "394812H")
    aujourd_hui = timezone.localdate()
    corps = {
        "limite_agents": (aujourd_hui + timedelta(days=5)).isoformat(), "limite_hierarchie": (aujourd_hui + timedelta(days=12)).isoformat(),
        "limite_rh": (aujourd_hui + timedelta(days=20)).isoformat(), "limite_drh": (aujourd_hui + timedelta(days=30)).isoformat(),
        "delai": (aujourd_hui + timedelta(days=35)).isoformat(), "communique": "Choisissez vos dates.", "exercice": 2026,
    }
    assert api.post("/api/v1/conges/planification/ouvrir/", corps, format="json", **rh).status_code == 201
    assert api.post("/api/v1/conges/planification/accorder/", **drh).status_code == 200
    url = "/api/v1/conges/planification/deposer/"

    # Une seconde période incomplète, ou qui chevauche la première, est refusée.
    assert api.post(url, {"debut": "2026-07-06", "fin": "2026-07-17", "debut2": "2026-12-14"}, format="json", **agent).status_code == 400
    assert api.post(url, {"debut": "2026-07-06", "fin": "2026-07-17", "debut2": "2026-07-15", "fin2": "2026-07-24"}, format="json", **agent).status_code == 400
    assert api.post(url, {"debut": "2026-07-06", "fin": "2026-07-17", "debut2": "2026-12-28", "fin2": "2026-12-20"}, format="json", **agent).status_code == 400

    # Deux temps, donnés dans le désordre : la période la plus proche passe en premier.
    ok = api.post(url, {"debut": "2026-12-14", "fin": "2026-12-28", "debut2": "2026-07-06", "fin2": "2026-07-20"}, format="json", **agent)
    assert ok.status_code == 200
    plan = PlanConge.objects.get(agent__username="394812H")
    assert (plan.debut.isoformat(), plan.fin.isoformat(), plan.debut2.isoformat(), plan.fin2.isoformat()) == ("2026-07-06", "2026-07-20", "2026-12-14", "2026-12-28")
    ligne = next(p for p in ok.json()["plans"] if p["moi"])
    assert ligne["debut2"] == "2026-12-14" and ligne["fin2"] == "2026-12-28"

    # Les deux temps réunis donnent le congé auquel l'agent a droit (30 jours) : ni plus, ni moins.
    trop_court = _connexion(api, "318490K")
    refus = api.post(url, {"debut": "2026-07-06", "fin": "2026-07-17", "debut2": "2026-12-14", "fin2": "2026-12-25"}, format="json", **trop_court)
    assert refus.status_code == 400 and "30 jours" in refus.json()["detail"] and "6 à placer" in refus.json()["detail"]
    trop_long = api.post(url, {"debut": "2026-07-06", "fin": "2026-07-25", "debut2": "2026-12-14", "fin2": "2026-12-25"}, format="json", **trop_court)
    assert trop_long.status_code == 400 and "de trop" in trop_long.json()["detail"]
    assert api.get("/api/v1/conges/planification/", **trop_court).json()["droit_moi"] == 30

    # Une seule période reste possible.
    seul = _connexion(api, "318490K")
    assert api.post(url, {"debut": "2026-08-03", "fin": "2026-09-01"}, format="json", **seul).status_code == 200
    assert PlanConge.objects.get(agent__username="318490K").debut2 is None


def test_conge_annuel_suit_les_dates_arretees_par_la_campagne(api):
    from datetime import date, timedelta

    from django.contrib.auth.models import User

    from personnel.models import CampagnePlanConge, PlanConge

    auth = _auth(api)
    url = "/api/v1/agents/340188P/conges/demande/"
    campagne = CampagnePlanConge.objects.create(
        exercice=2026, statut=CampagnePlanConge.Statut.PUBLIEE, delai=date(2026, 3, 1), limite_agents=date(2026, 1, 10),
        limite_hierarchie=date(2026, 1, 15), limite_rh=date(2026, 1, 20), limite_drh=date(2026, 1, 25), communique="Planification.",
    )

    # Sans plan arrêté, les dates restent libres.
    libre = api.post(url, {"type": "conge-annuel", "debut": "2026-05-04", "fin": "2026-05-09"}, format="json", **auth)
    assert libre.status_code == 201
    from personnel.models import Demande

    Demande.objects.filter(agent__matricule="340188P", categorie="conge").delete()

    PlanConge.objects.create(
        campagne=campagne, agent=User.objects.get(username="340188P"), debut=date(2026, 7, 6), fin=date(2026, 7, 10),
        debut2=date(2026, 12, 14), fin2=date(2026, 12, 18), palier=PlanConge.Palier.PUBLIE,
    )
    # D'autres dates que celles de la campagne sont refusées.
    assert api.post(url, {"type": "conge-annuel", "debut": "2026-05-04", "fin": "2026-05-09"}, format="json", **auth).status_code == 400
    # Chaque période de la campagne s'active une fois : le jour de reprise est le lendemain du dernier jour.
    premiere = api.post(url, {"type": "conge-annuel", "debut": "2026-07-06", "fin": "2026-07-11"}, format="json", **auth)
    assert premiere.status_code == 201
    assert any(d["nature"] == "Congé annuel (5 j)" and d["debut"] == "2026-07-06" for d in premiere.json()["demandes"])
    deja = api.post(url, {"type": "conge-annuel", "debut": "2026-07-06", "fin": "2026-07-11"}, format="json", **auth)
    assert deja.status_code == 400
    seconde = api.post(url, {"type": "conge-annuel", "debut": "2026-12-14", "fin": "2026-12-19"}, format="json", **auth)
    assert seconde.status_code == 201


def test_l_agent_voit_les_conges_choisis_par_ses_collegues_de_structure(api):
    from datetime import timedelta

    from django.utils import timezone

    from personnel.models import Agent

    Agent.objects.filter(matricule__in=["394812H", "318490K", "340188P"]).update(conges_acquis=30, conges_consommes=0)
    Agent.objects.filter(matricule__in=["394812H", "318490K"]).update(structure="Service test")
    Agent.objects.filter(matricule="340188P").update(structure="Autre service")
    rh = _connexion(api, "411904C")
    drh = _connexion(api, "DRH-2018-044")
    aujourd_hui = timezone.localdate()
    corps = {
        "limite_agents": (aujourd_hui + timedelta(days=5)).isoformat(), "limite_hierarchie": (aujourd_hui + timedelta(days=12)).isoformat(),
        "limite_rh": (aujourd_hui + timedelta(days=20)).isoformat(), "limite_drh": (aujourd_hui + timedelta(days=30)).isoformat(),
        "delai": (aujourd_hui + timedelta(days=35)).isoformat(), "communique": "Choisissez vos dates.", "exercice": 2026,
    }
    assert api.post("/api/v1/conges/planification/ouvrir/", corps, format="json", **rh).status_code == 201
    assert api.post("/api/v1/conges/planification/accorder/", **drh).status_code == 200

    marie, paul, autre = _connexion(api, "394812H"), _connexion(api, "318490K"), _connexion(api, "340188P")
    assert api.get("/api/v1/conges/planification/", **paul).json()["collegues"] == []
    # Marie choisit ses dates : Paul, de la même structure, les voit tout de suite, avant toute validation.
    assert api.post("/api/v1/conges/planification/deposer/", {"debut": "2026-07-06", "fin": "2026-08-04"}, format="json", **marie).status_code == 200
    vus = api.get("/api/v1/conges/planification/", **paul).json()["collegues"]
    assert [c["matricule"] for c in vus] == ["394812H"]
    assert vus[0]["debut"] == "2026-07-06" and vus[0]["fin"] == "2026-08-04" and vus[0]["palier"] in {"hierarchie", "rh"}
    # Un agent d'une autre structure ne les voit pas, et Marie ne se voit pas elle-même.
    assert api.get("/api/v1/conges/planification/", **autre).json()["collegues"] == []
    assert api.get("/api/v1/conges/planification/", **marie).json()["collegues"] == []


def test_la_communication_n_invente_aucune_donnee_en_production(api):
    from personnel.models import ConsultationFlash, Publication

    auth = _auth(api)
    Publication.objects.all().delete()
    ConsultationFlash.objects.all().delete()
    # Ouvrir l'écran, son compteur, ses exports ou la consultation ne recrée ni publications ni sondage d'exemple.
    for route in ("/api/v1/communication/", "/api/v1/communication/compteur/", "/api/v1/communication/consultation/", "/api/v1/communication/export/"):
        api.get(route, **auth)
    assert not Publication.objects.exists()
    assert not ConsultationFlash.objects.exists()


def test_secretariat_suit_imprime_et_verse_le_document_signe(api):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel.models import Notification

    agent = _jeton(api, "394812H")
    drh = _jeton(api, "DRH-2018-044")
    secretaire = _secretaire(api)
    depot = "/api/v1/agents/394812H/actes-demandes/"

    # Le secrétariat est fermé à l'agent, même pour sa propre demande.
    assert api.get("/api/v1/secretariat/", **agent).status_code == 403

    reponse = api.post(depot, {"type": "attestation-travail", "motif": "Dossier de visa"}, format="json", **agent)
    reference = next(item for item in reponse.json()["demandes"] if item["categorie"] == "acte")["reference"]
    ligne = next(item for item in api.get("/api/v1/secretariat/", **secretaire).json()["demandes"] if item["reference"] == reference)
    assert ligne["statut"] == "circuit" and ligne["fait"] == 0 and ligne["total"] == 2 and ligne["imprimable"] is False

    # Rien à imprimer ni à verser tant que la chaîne n'est pas complète.
    assert _verser_signe(api, secretaire, reference).status_code == 409
    api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "valider"}, format="json", **drh)
    ligne = next(item for item in api.get("/api/v1/secretariat/", **secretaire).json()["demandes"] if item["reference"] == reference)
    assert ligne["statut"] == "circuit" and ligne["fait"] == 1
    api.post(f"/api/v1/demandes-actes/{reference}/decision/", {"sens": "valider"}, format="json", **drh)
    ligne = next(item for item in api.get("/api/v1/secretariat/", **secretaire).json()["demandes"] if item["reference"] == reference)
    assert ligne["statut"] == "a_signer" and ligne["etape"].startswith("Validée")
    assert ligne["document"]["agent"]["matricule"] == "394812H" and ligne["document"]["conge"] is None
    assert Notification.objects.filter(destinataire__username="SEC-TEST", titre__startswith="Document à imprimer").exists()
    assert api.get(f"/api/v1/secretariat/{reference}/signe/", **secretaire).status_code == 409

    # Le document signé est contrôlé, puis l'intéressé est prévenu et peut le télécharger ; pas les autres.
    texte = SimpleUploadedFile("signe.exe", b"x", content_type="application/octet-stream")
    assert api.post(f"/api/v1/secretariat/{reference}/signe/verser/", {"fichier": texte}, format="multipart", **secretaire).status_code == 400
    assert api.post(f"/api/v1/secretariat/{reference}/signe/verser/", {}, format="multipart", **secretaire).status_code == 400
    assert api.post(f"/api/v1/secretariat/{reference}/signe/verser/", {"fichier": SimpleUploadedFile("signe.pdf", b"%PDF-1.4 signe")}, format="multipart", **agent).status_code == 403
    verse = _verser_signe(api, secretaire, reference)
    assert verse.status_code == 200 and verse.json()["statut"] == "signe" and verse.json()["signe_par"] == "Awa Kone"
    assert Notification.objects.filter(destinataire__username="394812H", titre="Votre document signé est disponible", message__contains="passez prendre").exists()

    dossier = api.get("/api/v1/agents/394812H/", **agent).json()
    demande = next(item for item in dossier["demandes"] if item["reference"] == reference)
    assert demande["document_signe"] is True and demande["etape"].startswith("Clôturée : acte délivré")
    telechargement = api.get(f"/api/v1/secretariat/{reference}/signe/", **agent)
    assert telechargement.status_code == 200 and b"".join(telechargement.streaming_content).startswith(b"%PDF")
    assert api.get(f"/api/v1/secretariat/{reference}/signe/", **_jeton(api, "349812K")).status_code == 403


def test_secretariat_reserve_a_l_administrateur_et_aux_secretaires_rattachees(api):
    from django.contrib.auth.models import User

    secretaire = _secretaire(api)
    assert api.get("/api/v1/secretariat/", **secretaire).status_code == 200
    assert api.get("/api/v1/me/", **secretaire).json()["secretariat"] is True
    assert api.get("/api/v1/me/", **_jeton(api, "394812H")).json()["secretariat"] is False

    # Sans structure de rattachement, une secrétaire n'entre pas dans l'espace.
    compte = User.objects.get(username="SEC-TEST")
    compte.profil.structure = None
    compte.profil.save(update_fields=["structure"])
    assert api.get("/api/v1/secretariat/", **secretaire).status_code == 403
    assert api.get("/api/v1/me/", **secretaire).json()["secretariat"] is False


def test_droits_de_conge_par_exercice_n_moins_un_d_abord_puis_le_plus_ancien(api):
    from datetime import date

    from personnel.droits_conges import consommer, detail, exercice_a_attribuer
    from personnel.import_droits_conges import _jours
    from personnel.models import Agent, DroitConge

    n = date.today().year
    assert [_jours("-"), _jours(None), _jours(30.0), _jours("15"), _jours("EPUISE")] == [0, 0, 30, 15, 0]
    agent = Agent.objects.get(matricule="394812H")
    DroitConge.objects.create(agent=agent, annee=n - 2, jours_dus=15)
    DroitConge.objects.create(agent=agent, annee=n - 1, jours_dus=30)
    # Le congé de la campagne relève de N-1 ; le reliquat plus ancien reste une exception choisie par l'agent.
    assert exercice_a_attribuer(agent) == n - 1
    # Sans exercice précisé, l'imputation reste du plus ancien au plus récent.
    consommer(agent, 20)
    assert [(item["annee"], item["restant"]) for item in detail(agent)] == [(n - 2, 0), (n - 1, 25)]
    assert exercice_a_attribuer(agent) == n - 1
    dossier = api.get("/api/v1/agents/394812H/", **_jeton(api, "394812H")).json()
    assert dossier["conges"]["exercice"] == n - 1 and [item["annee"] for item in dossier["conges"]["droits"]] == [n - 2, n - 1]
    assert [item["reliquat"] for item in dossier["conges"]["droits"]] == [True, False]


def test_secretariat_previsualisation_pour_la_secretaire_impression_libre_pour_l_admin(api):
    from django.contrib.auth.models import User
    from personnel.models import Profil

    agent = _jeton(api, "394812H")
    secretaire = _secretaire(api)
    modele = User.objects.get(username="DRH-2018-044")
    admin = User.objects.create_user("ADMIN-TEST", password="Sigrh-Dev-2026", first_name="Admin", last_name="Test")
    Profil.objects.create(user=admin, fonction="Administrateur", role="Administrateur", organisme=modele.profil.organisme, administrateur=True)
    jeton_admin = _jeton(api, "ADMIN-TEST")

    reponse = api.post("/api/v1/agents/394812H/actes-demandes/", {"type": "attestation-travail", "motif": "Dossier de visa"}, format="json", **agent)
    reference = next(item for item in reponse.json()["demandes"] if item["categorie"] == "acte")["reference"]

    # Circuit en cours : la secrétaire prévisualise sans pouvoir imprimer, l'administrateur imprime.
    ligne = next(item for item in api.get("/api/v1/secretariat/", **secretaire).json()["demandes"] if item["reference"] == reference)
    assert ligne["statut"] == "circuit" and ligne["imprimable"] is False and ligne["document"]["agent"]["matricule"] == "394812H"
    ligne = next(item for item in api.get("/api/v1/secretariat/", **jeton_admin).json()["demandes"] if item["reference"] == reference)
    assert ligne["statut"] == "circuit" and ligne["imprimable"] is True and ligne["document"] is not None
    # Le document signé ne se verse, lui, qu'une fois la chaîne complète : pas de raccourci pour l'administrateur.
    assert _verser_signe(api, jeton_admin, reference).status_code == 409


def test_creation_d_une_secretaire_rattachee_a_une_structure(api):
    auth = _auth(api)
    chef = {"matricule": "USR-2026-C1", "nom": "Bamba", "prenoms": "Awa", "fonction": "Cheffe de service", "role": "Chef de service", "structure": "sgpte", "superieur": "", "mot_de_passe": "Sigrh-Dev-2026", "confirmation": "Sigrh-Dev-2026"}
    assert api.post("/api/v1/utilisateurs/", chef, format="json", **auth).status_code == 201
    secretaire = {**chef, "matricule": "USR-2026-S1", "nom": "Kone", "fonction": "Secrétaire de service", "role": "Secrétaire", "superieur": "USR-2026-C1"}
    cree = api.post("/api/v1/utilisateurs/", secretaire, format="json", **auth)
    assert cree.status_code == 201 and cree.json()["role"] == "Secrétaire" and cree.json()["alerte"] == ""
    # Elle relève du premier responsable : son supérieur ne peut pas être un autre.
    autre = {**secretaire, "matricule": "USR-2026-S2", "superieur": "DRH-2018-044"}
    assert api.post("/api/v1/utilisateurs/", autre, format="json", **auth).status_code == 400
    # Elle n'est pas un second responsable : le service garde son chef, et une seconde secrétaire est possible.
    seconde = {**secretaire, "matricule": "USR-2026-S3", "nom": "Diallo"}
    assert api.post("/api/v1/utilisateurs/", seconde, format="json", **auth).status_code == 201


def test_tache_celery_des_echeances_et_planificateur(api):
    from config.celery import app
    from personnel.tasks import surveiller_echeances

    # La tâche exécute la même surveillance que la boucle interne, et beat la planifie toutes les six heures.
    assert isinstance(surveiller_echeances.run(), int)
    assert app.conf.beat_schedule["surveiller-echeances"]["task"] == "personnel.surveiller_echeances"
    assert "personnel.surveiller_echeances" in app.tasks


def test_traitements_longs_confies_a_celery_et_suivis_par_celui_qui_les_lance(api, settings, monkeypatch):
    from django.core.files.uploadedfile import SimpleUploadedFile

    from personnel import taches

    drh = _jeton(api, "DRH-2018-044")
    agent = _jeton(api, "394812H")
    # Sans worker, la vue répond comme avant, dans la requête.
    direct = api.get("/api/v1/avancements/export/", **drh)
    assert direct.status_code == 200 and direct["Content-Type"] == "application/pdf"

    # Avec un worker (ici exécuté sur place), la requête devient une tâche de fond.
    settings.CELERY_BROKER_URL = "memory://"
    settings.CELERY_TASK_ALWAYS_EAGER = True
    monkeypatch.setattr(taches, "worker_disponible", lambda: True)
    lancee = api.get("/api/v1/avancements/export/", **drh)
    assert lancee.status_code == 202
    identifiant = lancee.json()["tache"]
    suivi = api.get(f"/api/v1/taches/{identifiant}/", **drh).json()
    assert suivi["statut"] == "terminee" and suivi["progression"] == 100 and suivi["fichier"] is True and suivi["code"] == 200
    fichier = api.get(f"/api/v1/taches/{identifiant}/fichier/", **drh)
    assert fichier.status_code == 200 and b"".join(fichier.streaming_content).startswith(b"%PDF")
    # Seul celui qui l'a lancée la voit.
    assert api.get(f"/api/v1/taches/{identifiant}/", **agent).status_code == 404
    assert api.get(f"/api/v1/taches/{identifiant}/fichier/", **agent).status_code == 404
    assert identifiant in [item["id"] for item in api.get("/api/v1/taches/", **drh).json()["taches"]]

    # Un import refusé par la vue devient une tâche en échec, avec le message de la vue et le code HTTP d'origine.
    invalide = SimpleUploadedFile("agents.xlsx", b"pas un classeur", content_type="application/octet-stream")
    import_lance = api.post("/api/v1/agents/import/", {"fichier": invalide}, format="multipart", **drh)
    assert import_lance.status_code == 202
    echec = api.get(f"/api/v1/taches/{import_lance.json()['tache']}/", **drh).json()
    assert echec["statut"] == "echec" and echec["code"] == 400 and echec["resultat"]["detail"]

    # Le suivi garde son résultat un jour, puis la purge retire la tâche et son fichier.
    from datetime import timedelta

    from django.utils import timezone

    from personnel.models import TacheFond

    TacheFond.objects.filter(pk=identifiant).update(cree_le=timezone.now() - timedelta(hours=25))
    assert taches.purger_taches() == 1
    assert not TacheFond.objects.filter(pk=identifiant).exists()


def test_messagerie_medias_accuses_reponses_groupes_et_purge_de_48_heures(api, settings, tmp_path):
    from datetime import timedelta

    from django.contrib.auth.models import User
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.utils import timezone

    from personnel import messagerie
    from personnel.models import PieceMessage

    settings.MEDIA_ROOT = tmp_path
    alice, bob, chloe = _jeton(api, "394812H"), _jeton(api, "DRH-2018-044"), _jeton(api, "349812K")
    bob_id = User.objects.get(username="DRH-2018-044").id
    ouverte = api.post("/api/v1/messagerie/conversations/", {"destinataire": bob_id}, format="json", **alice)
    assert ouverte.status_code == 201
    conversation = ouverte.json()["id"]
    url = f"/api/v1/messagerie/conversations/{conversation}/messages/"

    # Une photo et un document accompagnent un message ; un exécutable est refusé.
    from io import BytesIO

    from PIL import Image

    tampon = BytesIO()
    Image.new("RGB", (900, 600), "teal").save(tampon, format="PNG")
    photo = SimpleUploadedFile("photo.png", tampon.getvalue(), content_type="image/png")
    note = SimpleUploadedFile("note.pdf", b"%PDF-1.4 note", content_type="application/pdf")
    interdit = SimpleUploadedFile("virus.exe", b"MZ", content_type="application/octet-stream")
    assert api.post(url, {"texte": "x", "fichiers": [interdit]}, format="multipart", **alice).status_code == 400
    envoye = api.post(url, {"texte": "Voici le dossier", "fichiers": [photo, note]}, format="multipart", **alice)
    assert envoye.status_code == 201
    corps = envoye.json()
    assert [piece["categorie"] for piece in corps["pieces"]] == ["image", "document"] and corps["pieces"][0]["apercu"] is True
    assert corps["statut"] == "envoye"

    # Le destinataire charge la conversation : « reçu », puis il l'ouvre : « lu ».
    lecture = api.get(url, **bob).json()
    def message(jeton, identifiant):
        return next(item for item in api.get(url, **jeton).json()["messages"] if item["id"] == identifiant)

    assert next(item for item in lecture["messages"] if item["id"] == corps["id"])["pieces"][1]["nom"] == "note.pdf"
    assert message(alice, corps["id"])["statut"] == "recu"
    assert api.post(f"/api/v1/messagerie/conversations/{conversation}/lu/", **bob).status_code == 200
    assert message(alice, corps["id"])["statut"] == "lu"

    # Les médias ne s'ouvrent que pour les participants ; la vignette est une image allégée.
    piece_id = corps["pieces"][0]["id"]
    assert api.get(f"/api/v1/messagerie/pieces/{piece_id}/", **chloe).status_code == 404
    vignette = api.get(f"/api/v1/messagerie/pieces/{piece_id}/?apercu=1", **bob)
    assert vignette.status_code == 200 and vignette["Content-Type"] == "image/jpeg"

    # Réponse citée, puis suppression pour tous : le texte et les médias disparaissent.
    reponse = api.post(url, {"texte": "Bien reçu", "reponse_a": corps["id"]}, format="json", **bob).json()
    assert reponse["reponse_a"]["id"] == corps["id"] and reponse["reponse_a"]["extrait"] == "Voici le dossier"
    assert api.delete(f"/api/v1/messagerie/messages/{corps['id']}/", **bob).status_code == 404
    assert api.delete(f"/api/v1/messagerie/messages/{corps['id']}/", **alice).status_code == 200
    efface = message(bob, corps["id"])
    assert efface["supprime"] is True and efface["texte"] == "" and efface["pieces"] == []
    assert api.get(f"/api/v1/messagerie/pieces/{piece_id}/", **bob).status_code == 410

    # Les médias d'un message se purgent au bout de 48 h ; le texte reste, le média est marqué expiré.
    nouveau = api.post(url, {"texte": "Une note vocale", "fichiers": [SimpleUploadedFile("voix.webm", b"audio", content_type="audio/webm")]}, format="multipart", **alice).json()
    element = PieceMessage.objects.get(pk=nouveau["pieces"][0]["id"])
    chemin = element.fichier.path
    assert messagerie.purger_medias() == 0
    PieceMessage.objects.filter(pk=element.pk).update(expire_le=timezone.now() - timedelta(minutes=1))
    assert messagerie.purger_medias() == 1
    element.refresh_from_db()
    assert element.expiree and not element.fichier
    import os

    assert not os.path.exists(chemin)
    apres = [m for m in api.get(url, **bob).json()["messages"] if m["id"] == nouveau["id"]][0]
    assert apres["texte"] == "Une note vocale" and apres["pieces"][0]["expiree"] is True
    assert api.get(f"/api/v1/messagerie/pieces/{element.pk}/", **bob).status_code == 410

    # Un groupe réunit au moins trois personnes et porte un nom.
    ids = [User.objects.get(username=m).id for m in ("DRH-2018-044", "349812K")]
    assert api.post("/api/v1/messagerie/conversations/", {"sujet": "", "participants": ids}, format="json", **alice).status_code == 400
    assert api.post("/api/v1/messagerie/conversations/", {"sujet": "Équipe", "participants": ids[:1]}, format="json", **alice).status_code == 400
    groupe = api.post("/api/v1/messagerie/conversations/", {"sujet": "Équipe", "participants": ids}, format="json", **alice)
    assert groupe.status_code == 201 and groupe.json()["groupe"] is True and groupe.json()["titre"] == "Équipe"


def test_export_excel_de_la_situation_administrative_par_position(api):
    import io
    import zipfile

    from personnel.models import Agent

    auth = _auth(api)
    agent = Agent.objects.exclude(matricule="DRH-2018-044").first()
    Agent.objects.filter(pk=agent.pk).update(situation="Détachement")

    def lire(position):
        reponse = api.get(f"/api/v1/situation/export/?position={position}", **auth)
        assert reponse.status_code == 200 and reponse["Content-Type"].endswith("spreadsheetml.sheet")
        assert f"situation-{position}-" in reponse["Content-Disposition"]
        with zipfile.ZipFile(io.BytesIO(reponse.content)) as classeur:
            return " ".join(classeur.read(nom).decode("utf-8", "ignore") for nom in classeur.namelist() if nom.endswith(("sharedStrings.xml", "sheet1.xml")))

    assert agent.matricule in lire("detachement")
    assert agent.matricule not in lire("activite")
    assert agent.matricule in lire("toutes")
    assert api.get("/api/v1/situation/export/?position=inconnue", **auth).status_code == 400


def test_detail_de_la_position_en_activite(api):
    from datetime import timedelta

    from django.utils import timezone

    from personnel.models import Agent, Demande
    from personnel.positions import details_activite, famille_position

    assert [famille_position(x) for x in ("En activité", "En formation", "En congé annuel", "Détachement", "Mise à disposition", "Disponibilité", "Hors cadre")] == [
        "activite", "activite", "activite", "detachement", "detachement", "disponibilite", "hors",
    ]
    jour = timezone.localdate()
    agent = Agent.objects.filter(situation="En activité").first()
    assert details_activite([agent])[agent.matricule] == "Présence au poste"
    Demande.objects.create(
        reference="CG-DET-1", agent=agent, nature="Congé de maternité (98 j)", categorie="conge", etape="Clôturée : congé accordé",
        responsable="DRH", echeance="", depose_le=jour, debut=jour - timedelta(days=2), fin=jour + timedelta(days=30),
    )
    assert details_activite([agent])[agent.matricule] == "Congé de maternité"
    Agent.objects.filter(pk=agent.pk).update(situation="Détachement")
    agent.refresh_from_db()
    assert details_activite([agent])[agent.matricule] == ""  # une autre position n'a pas de détail d'activité


def test_les_positions_suivent_les_dates_du_jour_par_tache_periodique(api):
    from datetime import timedelta

    from django.utils import timezone

    from personnel.models import Agent, PositionAdministrative
    from personnel.positions import en_activite
    from personnel.tasks import synchroniser_positions

    jour = timezone.localdate()
    agent = Agent.objects.filter(situation="En activité").first()
    # Un détachement qui a commencé hier : la tâche passe l'agent en détachement, et il sort de l'activité.
    PositionAdministrative.objects.create(
        agent=agent, type="detachement", structure_accueil="Ministère d'accueil", date_debut=jour - timedelta(days=1), date_fin=jour + timedelta(days=20),
    )
    assert synchroniser_positions() >= 1
    agent.refresh_from_db()
    assert agent.situation == "En détachement" and not en_activite(Agent.objects.filter(pk=agent.pk)).exists()
    # Le détachement est terminé : à la tâche suivante, l'agent redevient en activité.
    PositionAdministrative.objects.filter(agent=agent).update(date_fin=jour - timedelta(days=1))
    assert synchroniser_positions() >= 1
    agent.refresh_from_db()
    assert agent.situation == "En activité" and en_activite(Agent.objects.filter(pk=agent.pk)).exists()
    assert synchroniser_positions() == 0  # rien n'a changé depuis


def test_indicateurs_disciplinaires_decisions_par_degre_et_non_lieu(api):
    from django.utils import timezone

    from personnel.models import Agent, ProcedureDisciplinaire

    auth = _auth(api)
    jour = timezone.localdate()
    agents = list(Agent.objects.all()[:4])
    ProcedureDisciplinaire.objects.all().delete()

    def ouvrir(agent, ref, degre, avis):
        ProcedureDisciplinaire.objects.create(
            agent=agent, reference=ref, degre=degre, avis=avis, grief="Faute", description="Test", saisine=jour,
            date_decision=jour if avis in {"sanction", "classee"} else None,
        )

    ouvrir(agents[0], "DISC-T-1", 1, "instruction")
    ouvrir(agents[1], "DISC-T-2", 1, "sanction")
    ouvrir(agents[2], "DISC-T-3", 2, "sanction")
    ouvrir(agents[3], "DISC-T-4", 2, "classee")
    indicateurs = api.get("/api/v1/carrieres/discipline/", **auth).json()["indicateurs"]
    assert indicateurs["instruction"] == 1
    assert (indicateurs["decisions"], indicateurs["decisions_premier_degre"], indicateurs["decisions_second_degre"], indicateurs["non_lieu"]) == (3, 1, 1, 1)


def test_recherche_agents_sans_ordre_ni_casse(api):
    auth = _auth(api)
    tous = api.get("/api/v1/agents/", **auth).json()
    assert tous
    cible = tous[0]
    mots = f"{cible['prenoms']} {cible['nom']}".upper().split()
    trouves = api.get("/api/v1/agents/", {"q": " ".join(reversed(mots)).lower()}, **auth).json()
    assert cible["matricule"] in {item["matricule"] for item in trouves}


def test_le_circuit_configure_gouverne_chaque_visa_et_solde_le_registre(api):
    from datetime import date, timedelta

    from django.contrib.auth.models import User
    from personnel.models import Absence, Demande, Profil

    drh = _jeton(api, "DRH-2018-044")
    chef, agent = _jeton(api, "349812K"), _jeton(api, "394812H")
    Profil.objects.filter(user__username="394812H").update(superieur=User.objects.get(username="349812K"))
    lundi = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
    periode = {"debut": lundi.isoformat(), "fin": (lundi + timedelta(days=3)).isoformat()}

    # Une étape doit porter un rôle réel : sinon personne ne pourrait la viser.
    libre = {"nom": "Libre", "etapes": [{"instance": "Comité fantaisiste", "fonction": "x"}], "attributions": []}
    assert api.post("/api/v1/circuits/configuration/", libre, format="json", **drh).status_code == 400

    absence = api.post("/api/v1/circuits/elements/absence/", {"libelle": "Absence à deux visas"}, format="json", **drh).json()
    circuit = {
        "nom": "Deux visas",
        "etapes": [{"instance": "Chef de service", "fonction": "Supérieur"}, {"instance": "Directeur", "fonction": "DRH"}],
        "attributions": [{"famille": "absence", "code": absence["code"]}],
    }
    assert api.post("/api/v1/circuits/configuration/", circuit, format="json", **drh).status_code == 201
    depot = api.post("/api/v1/agents/394812H/conges/demande/", {"type": absence["code"], **periode}, format="json", **agent)
    demande = next(item for item in depot.json()["demandes"] if item["nature"].startswith("Absence à deux visas"))
    reference = demande["reference"]
    decision = f"/api/v1/demandes-actes/{reference}/decision/"
    assert [visa["instance"] for visa in demande["visas"]][1:3] == ["Chef de service", "Directeur"]

    # Chaque visa revient au rôle de son étape, dans l'ordre configuré.
    assert api.post(decision, {"sens": "valider"}, format="json", **drh).status_code == 403
    registre = Absence.objects.get(demande__reference=reference)
    assert api.post(f"/api/v1/absences/{registre.pk}/decision/", {"sens": "valider", "motif": "Raccourci"}, format="json", **drh).status_code == 409
    assert api.post(decision, {"sens": "valider"}, format="json", **chef).status_code == 200
    assert api.post(decision, {"sens": "valider"}, format="json", **chef).status_code == 403
    assert Absence.objects.get(pk=registre.pk).decision == "en_attente"
    assert api.post(decision, {"sens": "valider"}, format="json", **drh).status_code == 200

    # Le dernier visa clôt la demande et décide aussi l'absence au registre : pas de seconde validation.
    assert Demande.objects.get(reference=reference).etape.startswith("Clôturée")
    assert Absence.objects.get(pk=registre.pk).decision == "validee"


def test_onglets_ma_team_et_evenements_du_profil_agent(api):
    from django.contrib.auth.models import User
    from personnel.models import LecturePublication, Notification, Profil, Publication

    drh = _jeton(api, "DRH-2018-044")
    agent = _jeton(api, "394812H")
    chef = _jeton(api, "349812K")
    Profil.objects.filter(user__username="394812H").update(superieur=User.objects.get(username="349812K"))

    # L'équipe de communication rédige un événement, le DRH le vise : les agents le reçoivent sans habilitation de communication.
    cree = api.post(
        "/api/v1/communication/",
        {"nature": "evenement", "urgence": "important", "perimetre": "tous", "intitule": "Journée de la fonction publique", "corps": "Rendez-vous au siège le 23 juin.", "diffuser": "true"},
        format="json",
        **drh,
    )
    assert cree.status_code == 201
    identifiant = cree.json()["id"]
    assert identifiant not in {item["id"] for item in api.get("/api/v1/evenements/", **agent).json()["evenements"]}  # pas encore visé
    assert api.post(f"/api/v1/communication/{identifiant}/viser/", **drh).status_code == 200

    evenements = api.get("/api/v1/evenements/", **agent)
    assert evenements.status_code == 200
    ligne = next(item for item in evenements.json()["evenements"] if item["id"] == identifiant)
    assert ligne["nature_libelle"] == "Événement" and ligne["lue"] is False

    # La notification de la barre du haut conduit à l'onglet Événements du profil.
    notification = Notification.objects.get(destinataire__username="394812H", titre="Nouvel événement")
    assert notification.lien == f"/app/agents?onglet=evenements&evenement={identifiant}"
    assert not Notification.objects.filter(destinataire__username="DRH-2018-044", titre="Nouvel événement").exists()  # l'auteur du visa n'est pas notifié

    # L'ouverture du détail vaut accusé de lecture ; un brouillon ou une publication hors périmètre ne se lit pas.
    assert api.post(f"/api/v1/evenements/{identifiant}/lu/", **agent).status_code == 200
    assert LecturePublication.objects.filter(publication_id=identifiant, lecteur__username="394812H").exists()
    assert next(item for item in api.get("/api/v1/evenements/", **agent).json()["evenements"] if item["id"] == identifiant)["lue"] is True
    notification.refresh_from_db()
    assert notification.lue is True  # lire la publication éteint la notification qui l'annonçait
    brouillon = Publication.objects.create(reference="REF/TEST/B", nature="evenement", urgence="normal", intitule="Brouillon", corps="x", statut="brouillon")
    assert api.post(f"/api/v1/evenements/{brouillon.id}/lu/", **agent).status_code == 403
    assert brouillon.id not in {item["id"] for item in api.get("/api/v1/evenements/", **agent).json()["evenements"]}

    # Ma team : le supérieur voit l'agent rattaché, l'agent voit son supérieur ; chacun ne consulte que la sienne.
    equipe_chef = api.get("/api/v1/agents/349812K/equipe/", **chef)
    assert equipe_chef.status_code == 200
    membres = {item["matricule"]: item for item in equipe_chef.json()["membres"]}
    assert membres["394812H"]["relation"] in {"rattache", "service"} and membres["394812H"]["presence"]["badge"]
    assert "349812K" not in membres
    equipe_agent = {item["matricule"]: item for item in api.get("/api/v1/agents/394812H/equipe/", **agent).json()["membres"]}
    assert equipe_agent["349812K"]["relation"] == "superieur"
    assert api.get("/api/v1/agents/349812K/equipe/", **agent).status_code == 403


def test_module_dont_toutes_les_rubriques_sont_refusees_est_refuse_aussi_cote_serveur(api):
    from personnel.models import ModuleHabilitation, Profil

    drh = _jeton(api, "DRH-2018-044")
    modules = list(ModuleHabilitation.objects.all())
    rbac = next(item for item in modules if item.libelle == "Statistiques & RBAC")
    profil = Profil.objects.get(user__username="DRH-2018-044")
    profil.administrateur = False
    profil.habilitations = ["validation"] * len(modules)
    profil.precisions = {str(item.pk): "refus" for item in rbac.fonctions.all()}
    profil.save()

    # Le module garde son niveau dans la matrice, mais aucune rubrique n'est ouverte : il est refusé au compte.
    acces = api.get("/api/v1/me/", **drh).json()["acces"]
    assert acces["modules"]["Statistiques & RBAC"] == "refus"
    assert acces["modules"]["GPEC"] == "validation"

    # Le serveur refuse aussi ce que le menu cache.
    for route in ("/api/v1/dashboard/etats/", "/api/v1/statistiques/compositions/", "/api/v1/utilisateurs/", "/api/v1/communication/", "/api/v1/structures/", "/api/v1/grades/"):
        assert api.get(route, **drh).status_code == 403, route
    # Les routes que tout agent connecté utilise pour lui-même restent ouvertes.
    assert api.get("/api/v1/notifications/", **drh).status_code == 200
    assert api.get("/api/v1/formation/", **drh).status_code == 200

    # Rouvrir une seule rubrique rouvre ses routes, et elles seules.
    statistiques = rbac.fonctions.get(libelle="Statistiques")
    profil.precisions = {**profil.precisions, str(statistiques.pk): "lecture"}
    profil.save()
    assert api.get("/api/v1/me/", **drh).json()["acces"]["modules"]["Statistiques & RBAC"] == "validation"
    assert api.get("/api/v1/statistiques/compositions/", **drh).status_code == 200
    assert api.get("/api/v1/utilisateurs/", **drh).status_code == 403


def test_garde_des_rubriques_carrieres_besoins_et_dotation(api):
    from personnel.models import ModuleHabilitation, Profil

    drh = _jeton(api, "DRH-2018-044")
    modules = list(ModuleHabilitation.objects.all())
    profil = Profil.objects.get(user__username="DRH-2018-044")
    profil.administrateur = False
    profil.habilitations = ["validation"] * len(modules)
    # Seules ces rubriques sont refusées ; le reste du compte garde son niveau.
    refusees = {("Carrières & Actes", "Situation administrative"), ("GPEC", "Expression des besoins"), ("GPEC", "Recrutement")}
    profil.precisions = {str(f.pk): "refus" for m in modules for f in m.fonctions.all() if (m.libelle, f.libelle) in refusees}
    profil.save()

    for route in ("/api/v1/carrieres/", "/api/v1/carrieres/registres/", "/api/v1/avancements/export/", "/api/v1/besoins/", "/api/v1/dotation/", "/api/v1/dotation-agents/"):
        assert api.get(route, **drh).status_code == 403, route
    # Ce qui sert à chaque agent pour lui-même, ou à une autre rubrique, reste ouvert.
    for route in ("/api/v1/mobilite/", "/api/v1/besoins/mes-fiches/", "/api/v1/carrieres/absences/", "/api/v1/nomenclature/"):
        assert api.get(route, **drh).status_code == 200, route
