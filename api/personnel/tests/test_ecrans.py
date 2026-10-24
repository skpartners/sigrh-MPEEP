"""Écrans Carrières et Action sociale servis par la base."""

from datetime import date, timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient


@pytest.fixture
def api(db):
    call_command("seed_demo")
    return APIClient()


def _auth(api) -> dict:
    reponse = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026", "organisme": "dgpe"},
        format="json",
    )
    return {"HTTP_AUTHORIZATION": f"Token {reponse.json()['token']}"}


# --- Absences ------------------------------------------------------------------------------


def test_suivi_des_permissions_et_indicateurs_calcules(api):
    auth = _auth(api)
    donnees = api.get("/api/v1/carrieres/absences/", **auth).json()
    suivi = donnees["suivi"]
    # Seules les permissions demandées depuis le profil de l'agent : statutaires (permission spéciale) et générales.
    assert {item["type"] for item in suivi} <= {"permission-speciale", "autorisation"}
    assert {item["type_libelle"] for item in suivi} <= {"Permission statutaire", "Permission"}
    indicateurs = donnees["indicateurs"]
    assert set(indicateurs) == {"accordees", "en_traitement", "validees"}
    refusees = sum(1 for item in suivi if item["statut"] == "refusee")
    assert indicateurs["accordees"] + indicateurs["en_traitement"] + indicateurs["validees"] + refusees == len(suivi)
    assert 0 <= donnees["presenteisme"]["taux"] <= 100 and donnees["presenteisme"]["objectif"] > 0
    assert all(item["agent"]["matricule"] for item in suivi)
    rapport = api.get("/api/v1/carrieres/absences/export/", **auth)
    assert rapport.status_code == 200
    assert rapport["Content-Type"] == "application/pdf"
    assert rapport.content.startswith(b"%PDF")
    assert "rapport-assiduite-" in rapport["Content-Disposition"]


def test_decider_une_autorisation_exige_un_motif(api):
    from personnel.models import Absence

    auth = _auth(api)
    ligne = Absence.objects.exclude(type_autorisation="").filter(decision="en_attente").first()
    assert ligne is not None
    route = f"/api/v1/absences/{ligne.id}/decision/"
    assert api.post(route, {"sens": "valider", "motif": "  "}, format="json", **auth).status_code == 400
    reponse = api.post(route, {"sens": "invalider", "motif": "Pièce illisible."}, format="json", **auth)
    assert reponse.status_code == 200
    assert reponse.json()["decision"] == "invalidee"
    assert api.post(route, {"sens": "valider", "motif": "Revu."}, format="json", **auth).status_code == 409


def test_la_permission_demandee_par_l_agent_apparait_au_suivi_avec_son_circuit(api):
    from datetime import date, timedelta

    from django.core.files.uploadedfile import SimpleUploadedFile

    auth = _auth(api)
    agent = {"HTTP_AUTHORIZATION": api.post("/api/v1/auth/login/", {"matricule": "394812H", "password": "Sigrh-Dev-2026"}, format="json").json()["token"]}
    agent = {"HTTP_AUTHORIZATION": f"Token {agent['HTTP_AUTHORIZATION']}"}
    avant = api.get("/api/v1/carrieres/absences/", **auth).json()["indicateurs"]["en_traitement"]
    lundi = date.today() + timedelta(days=(7 - date.today().weekday()) % 7 or 7)
    depot = api.post(
        "/api/v1/agents/394812H/actes-demandes/",
        {"type": "permission-speciale", "motif": "Décès d'un parent", "debut": lundi.isoformat(), "fin": (lundi + timedelta(days=1)).isoformat(),
         "justificatif": SimpleUploadedFile("deces.pdf", b"%PDF-1.4 test", content_type="application/pdf")},
        format="multipart", **agent,
    )
    assert depot.status_code == 201, depot.content
    apres = api.get("/api/v1/carrieres/absences/", **auth).json()
    assert apres["indicateurs"]["en_traitement"] == avant + 1
    ligne = next(item for item in apres["suivi"] if item["agent"]["matricule"] == "394812H" and item["motif"] == "Décès d'un parent")
    assert ligne["type"] == "permission-speciale" and ligne["type_libelle"] == "Permission statutaire" and ligne["statut"] == "traitement"
    assert ligne["visas"], "le circuit de la demande accompagne la ligne"
    # Plus de saisie directe par le gestionnaire.
    assert api.post("/api/v1/carrieres/absences/", {"matricule": "394812H", "type": "autorisation", "debut": "2026-10-05", "fin": "2026-10-06"}, format="json", **auth).status_code == 405


# --- Congés ---------------------------------------------------------------------------------


def test_registre_des_conges_calcule_les_volumes(api):
    from django.db.models import Sum

    from personnel.models import Agent

    auth = _auth(api)
    donnees = api.get("/api/v1/carrieres/conges/", **auth).json()
    assert donnees["volume"]["effectifs"] == Agent.objects.count()
    assert donnees["volume"]["acquis"] == Agent.objects.aggregate(total=Sum("conges_acquis"))["total"]
    assert len(donnees["mensuel"]) == 12 and donnees["quorums"]
    assert donnees["en_attente"] == sum(1 for item in donnees["demandes"] if item["instruction"] in {"pret_signature", "remplacement", "conflit_quorum"})


def test_signer_un_conge_exige_la_signature_electronique(api, tmp_path, settings):
    import base64

    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path
    auth = _auth(api)
    demandes = api.get("/api/v1/carrieres/conges/", **auth).json()["demandes"]
    pret = next(item for item in demandes if item["instruction"] == "pret_signature")
    # Un conflit de quorum se déduit de la présence : trois agents d'une même structure, deux absents en même temps.
    from datetime import date, timedelta

    from personnel.models import Absence, Agent

    structure = "Direction du Portefeuille des Secteurs Primaire et Secondaire"
    for matricule in ("402771K", "418902X", "288103A"):
        Agent.objects.filter(matricule=matricule).update(direction=structure, sous_direction="", service="", structure=structure)
    debut = date.today() + timedelta(days=40)
    for matricule in ("402771K", "418902X"):
        Absence.objects.create(
            agent=Agent.objects.get(matricule=matricule), nature="Congé annuel", debut=debut, fin=debut + timedelta(days=4),
            jours=5, statut="En instruction", instruction="pret_signature",
        )
    demandes = api.get("/api/v1/carrieres/conges/", **auth).json()["demandes"]
    conflit = next(item for item in demandes if item["instruction"] == "conflit_quorum")
    route = f"/api/v1/conges/{pret['id']}/instruction/"
    assert api.post(route, {"action": "signer"}, format="json", **auth).status_code == 409
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    api.post("/api/v1/me/signature/", {"fichier": SimpleUploadedFile("signature.png", png, content_type="image/png")}, format="multipart", **auth)
    signe = api.post(route, {"action": "signer"}, format="json", **auth)
    assert signe.status_code == 200 and signe.json()["instruction"] == "signe"
    assert api.post(route, {"action": "rejeter", "motif": "Trop tard."}, format="json", **auth).status_code == 409
    # Un conflit de quorum ne se signe pas : on décale, motif à l'appui.
    route_conflit = f"/api/v1/conges/{conflit['id']}/instruction/"
    assert api.post(route_conflit, {"action": "signer"}, format="json", **auth).status_code == 409
    assert api.post(route_conflit, {"action": "decaler"}, format="json", **auth).status_code == 400
    assert api.post(route_conflit, {"action": "decaler", "motif": "Départ après le 15."}, format="json", **auth).json()["instruction"] == "decale"


# --- Procédures disciplinaires ---------------------------------------------------------------


def test_discipline_registre_sessions_et_effacements(api, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    auth = _auth(api)
    donnees = api.get("/api/v1/carrieres/discipline/", **auth).json()
    assert donnees["indicateurs"]["instruction"] == sum(1 for item in donnees["procedures"] if item["avis"] not in {"sanction", "classee"})
    assert donnees["sessions"] and donnees["effacements"]
    assert donnees["entete"]["titre"] and [degre["degre"] for degre in donnees["echelle"]["degres"]] == [1, 2]  # deux degrés seulement
    assert donnees["regles"]["delai_jours"] and donnees["amnistie"]["texte"] and donnees["suivi"]["texte"]
    assert all(item["agent"]["matricule"] for item in donnees["procedures"])
    avant = len(donnees["procedures"])
    rapporteur = next(item for item in donnees["agents"] if item["matricule"] != "394812H")
    assert api.post("/api/v1/carrieres/discipline/", {"matricule": "394812H", "grief": "Retards"}, format="json", **auth).status_code == 400
    assert api.post(
        "/api/v1/carrieres/discipline/",
        {"matricule": "394812H", "grief": "Retards répétés", "description": "Constatés sur le mois.", "degre": 1, "rapporteur": "M. AKA"},
        format="json",
        **auth,
    ).status_code == 400
    import base64

    from django.core.files.base import ContentFile
    from django.core.files.uploadedfile import SimpleUploadedFile

    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    assert api.post(
        "/api/v1/me/signature/",
        {"fichier": SimpleUploadedFile("signature.png", png, content_type="image/png")},
        format="multipart",
        **auth,
    ).status_code == 200
    cree = api.post(
        "/api/v1/carrieres/discipline/",
        {"matricule": "394812H", "grief": "Retards répétés", "description": "Constatés sur le mois.", "degre": 1, "rapporteur": rapporteur["matricule"]},
        format="json",
        **auth,
    )
    assert cree.status_code == 201 and cree.json()["reference"].startswith("DISC-")
    assert cree.json()["rapporteur"] == rapporteur["nom_complet"]
    assert len(api.get("/api/v1/carrieres/discipline/", **auth).json()["procedures"]) == avant + 1
    from personnel.models import PieceJointe

    piece = PieceJointe.objects.get(agent__matricule="394812H", intitule=f"Convocation disciplinaire {cree.json()['reference']}")
    contenu_piece = piece.fichier.read()
    assert piece.verifiee and contenu_piece.startswith(b"%PDF") and b"/Subtype /Image" in contenu_piece
    agent = api.post(
        "/api/v1/auth/login/",
        {"matricule": "394812H", "password": "Sigrh-Dev-2026", "organisme": "dgpe"},
        format="json",
    )
    jeton = {"HTTP_AUTHORIZATION": f"Token {agent.json()['token']}"}
    urgente = next(
        item for item in api.get("/api/v1/notifications/", **jeton).json()["notifications"]
        if item["urgente"] and item["titre"].startswith("Convocation")
    )
    assert urgente["lien"].endswith("?onglet=pieces") and not urgente["lue"]
    dossier = api.get("/api/v1/agents/394812H/", **jeton).json()
    assert any(item["id"] == piece.id and item["fichier_url"] for item in dossier["pieces"])
    pdf = api.get(f"/api/v1/carrieres/discipline/{cree.json()['id']}/convocation/", **auth)
    assert pdf.status_code == 200 and pdf["Content-Type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF") and b"ReportLab" in pdf.content
    assert f"convocation-{cree.json()['reference']}.pdf" in pdf["Content-Disposition"]
    assert api.get("/api/v1/carrieres/discipline/999999/convocation/", **auth).status_code == 404
    assert api.post("/api/v1/carrieres/discipline/sessions/", {"intitule": "Session"}, format="json", **auth).status_code == 400
    seances = len(donnees["sessions"])
    cree_seance = api.post(
        "/api/v1/carrieres/discipline/sessions/",
        {
            "intitule": "Session ordinaire",
            "date": (timezone.localdate() + timedelta(days=40)).isoformat(),
            "heure": "10:00",
            "lieu": "Salle du conseil",
            "ordre_du_jour": f"Audition du dossier {cree.json()['reference']}",
            "description": "Examen des mémoires.",
            "composition": [rapporteur["matricule"]],
        },
        format="json",
        **auth,
    )
    assert cree_seance.status_code == 201 and cree_seance.json()["code"]
    assert rapporteur["nom_complet"] in cree_seance.json()["composition"][0]
    assert len(api.get("/api/v1/carrieres/discipline/", **auth).json()["sessions"]) == seances + 1
    avec_seance = api.get(f"/api/v1/carrieres/discipline/{cree.json()['id']}/convocation/", **auth)
    assert avec_seance.status_code == 200 and avec_seance.content.startswith(b"%PDF")
    from django.contrib.auth.models import User

    from personnel.discipline import resoudre_signataire
    from personnel.models import Profil

    drh = User.objects.select_related("profil", "profil__structure").get(username="DRH-2018-044")
    assert resoudre_signataire().qualite == "Le Directeur des ressources humaines"
    drh.profil.signature.delete(save=True)
    remplacant = Profil.objects.select_related("user").get(user__username="349812K")
    remplacant.interim = drh.profil.structure
    remplacant.signature.save("signature.png", ContentFile(png), save=True)
    signe = resoudre_signataire()
    assert signe.qualite.startswith("Remplaçant") and "N'Dri" in signe.precision and signe.image
    drh.profil.structure = None
    drh.profil.save(update_fields=["structure"])
    from personnel.models import EntiteTutelle

    remplacant.interim = EntiteTutelle.objects.get(code="drh")
    remplacant.save(update_fields=["interim"])
    assert resoudre_signataire().qualite.startswith("Intérimaire")


# --- Fin de carrière ---------------------------------------------------------------------------


def test_fin_de_carriere_pyramide_et_dossiers(api):
    from personnel.models import Agent

    auth = _auth(api)
    donnees = api.get("/api/v1/carrieres/fin-de-carriere/", **auth).json()
    assert sum(tranche["effectif"] for tranche in donnees["pyramide"]) == Agent.objects.exclude(date_naissance=None).count()
    assert donnees["dossiers"] and all(ligne["date_limite"] for ligne in donnees["dossiers"])
    assert donnees["indicateurs"]["dossiers"] == len(donnees["dossiers"])
    assert "idr" not in donnees["dossiers"][0] and "pension" not in donnees["dossiers"][0]
    assert "postes" not in donnees and donnees["motifs"]
    # Quatre indicateurs : départs de l'année, agents notifiés, réception des dossiers, transmission à la CGRAE.
    assert set(donnees["indicateurs"]) == {"departs_annee", "notifies", "receptions", "transmis", "dossiers"}
    assert [statut["code"] for statut in donnees["statuts"]] == ["notifie", "reception", "transmis"]
    assert donnees["indicateurs"]["notifies"] + donnees["indicateurs"]["receptions"] + donnees["indicateurs"]["transmis"] == donnees["indicateurs"]["dossiers"]
    assert donnees["distinctions"] and donnees["accompagnement"]["actions"]
    retraite = next(item for item in donnees["motifs"] if item["automatique"])
    assert retraite["libelle"] == "Admission à la retraite"
    assert api.patch(f"/api/v1/carrieres/fin-de-carriere/motifs/{retraite['id']}/", {"libelle": "Autre"}, format="json", **auth).status_code == 409
    assert api.delete(f"/api/v1/carrieres/fin-de-carriere/motifs/{retraite['id']}/", **auth).status_code == 409
    dossier = next(item for item in donnees["dossiers"] if item["automatique"])
    assert api.delete(f"/api/v1/carrieres/fin-de-carriere/dossiers/{dossier['id']}/", **auth).status_code == 409
    sans_decret = {"age_limite": dossier["age_statutaire"] + 2, "statut": dossier["statut"]}
    assert api.patch(f"/api/v1/carrieres/fin-de-carriere/dossiers/{dossier['id']}/", sans_decret, format="json", **auth).status_code == 400
    reporte = api.patch(
        f"/api/v1/carrieres/fin-de-carriere/dossiers/{dossier['id']}/",
        {**sans_decret, "decret": "2026-014/PR", "date_decret": "2026-10-01"},
        format="json",
        **auth,
    )
    assert reporte.status_code == 200 and reporte.json()["decret"] == "2026-014/PR"
    assert reporte.json()["age_limite"] == dossier["age_statutaire"] + 2
    assert api.post("/api/v1/carrieres/fin-de-carriere/dossiers/", {"motif": retraite["id"], "matricule": dossier["agent"]["matricule"], "date_cessation": "2026-11-01"}, format="json", **auth).status_code == 409
    libre = next(item["matricule"] for item in donnees["agents"] if item["matricule"] not in {ligne["agent"]["matricule"] for ligne in donnees["dossiers"]})
    autre = next(item for item in donnees["motifs"] if not item["automatique"])
    cree = api.post(
        "/api/v1/carrieres/fin-de-carriere/dossiers/",
        {"motif": autre["id"], "matricule": libre, "date_cessation": "2026-11-01", "statut_detail": "Courrier reçu"},
        format="json",
        **auth,
    )
    assert cree.status_code == 201 and cree.json()["automatique"] is False
    assert api.patch(f"/api/v1/carrieres/fin-de-carriere/dossiers/{cree.json()['id']}/", {"date_cessation": "2026-11-15"}, format="json", **auth).json()["date_cessation"] == "2026-11-15"
    assert api.delete(f"/api/v1/carrieres/fin-de-carriere/dossiers/{cree.json()['id']}/", **auth).status_code == 204
    motif = api.post("/api/v1/carrieres/fin-de-carriere/motifs/", {"libelle": "Disponibilité"}, format="json", **auth)
    assert motif.status_code == 201 and motif.json()["automatique"] is False
    assert api.delete(f"/api/v1/carrieres/fin-de-carriere/motifs/{motif.json()['id']}/", **auth).status_code == 204


# --- Action sociale ------------------------------------------------------------------------------


def test_action_sociale_budget_registre_et_mandatement(api):
    auth = _auth(api)
    donnees = api.get("/api/v1/action-sociale/", **auth).json()
    assert donnees["budget"]["allouee"] > 0 and donnees["guichets"]
    conforme = next(item for item in donnees["requetes"] if item["etat"] == "conforme")
    reserve = next(item for item in donnees["requetes"] if item["etat"] == "reserve")
    engagee = donnees["budget"]["engagee"]
    mandat = api.post(f"/api/v1/action-sociale/requetes/{conforme['id']}/mandater/", **auth)
    assert mandat.status_code == 200 and mandat.json()["etat"] == "mandatee"
    assert api.get("/api/v1/action-sociale/", **auth).json()["budget"]["engagee"] == engagee + conforme["montant"]
    assert api.post(f"/api/v1/action-sociale/requetes/{reserve['id']}/mandater/", **auth).status_code == 409
    assert api.post(f"/api/v1/action-sociale/requetes/{reserve['id']}/relancer/", **auth).status_code == 200
    cree = api.post(
        "/api/v1/action-sociale/",
        {"matricule": "394812H", "nature": "Évacuation sanitaire", "montant": 500000, "ayant_droit": "Conjoint"},
        format="json",
        **auth,
    )
    assert cree.status_code == 201 and cree.json()["etat"] == "commission"


def test_discipline_le_rapporteur_est_facultatif_a_l_ouverture(api):
    auth = _auth(api)
    donnees = api.get("/api/v1/carrieres/discipline/", **auth).json()
    avant = len(donnees["procedures"])
    sans = api.post(
        "/api/v1/carrieres/discipline/",
        {"matricule": "394812H", "grief": "Retards répétés", "description": "Constatés sur le mois.", "degre": 1},
        format="json",
        **auth,
    )
    assert sans.status_code == 201 and sans.json()["rapporteur"] == ""
    assert len(api.get("/api/v1/carrieres/discipline/", **auth).json()["procedures"]) == avant + 1
    # Un rapporteur indiqué mais inconnu, ou l'agent lui-même, reste refusé.
    inconnu = api.post("/api/v1/carrieres/discipline/", {"matricule": "394812H", "grief": "Retards", "description": "Faits.", "rapporteur": "XXXX"}, format="json", **auth)
    assert inconnu.status_code == 400
    soi = api.post("/api/v1/carrieres/discipline/", {"matricule": "394812H", "grief": "Retards", "description": "Faits.", "rapporteur": "394812H"}, format="json", **auth)
    assert soi.status_code == 400


def test_la_configuration_du_graphique_conserve_couleurs_et_forage():
    from personnel.statistiques_dynamiques import valider_configuration

    brut = {
        "source": "agents", "lignes": ["tranche_age"],
        "graphique": {"forme": "barre", "couleurs": ["#2563eb", "rouge", "#16A34A", 12], "niveau": 1, "focus": ["DAAF", "SD Budget"]},
    }
    propre = valider_configuration(brut)["graphique"]
    # Les couleurs invalides sont écartées, les valides passent en majuscules ; le niveau et le chemin du forage sont conservés.
    assert propre["couleurs"] == ["#2563EB", "#16A34A"]
    assert propre["niveau"] == 1 and propre["focus"] == ["DAAF", "SD Budget"]
    defaut = valider_configuration({"source": "agents"})["graphique"]
    assert defaut["couleurs"] == [] and defaut["niveau"] is None and defaut["focus"] == []
    assert valider_configuration({"source": "agents", "graphique": {"niveau": 99}})["graphique"]["niveau"] is None
