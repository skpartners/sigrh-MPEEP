import pytest
from django.utils.timezone import localdate
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.models import FicheBesoin, SessionFormation, ValidationBesoin

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    call_command("seed_demo")
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def test_bilan_carriere_calcule_depuis_la_base(api):
    corps = api.get("/api/v1/grh/bilan-carriere/").json()
    assert corps["effectifs"]["total"] == sum(ligne["nombre"] for ligne in corps["effectifs"]["par_situation"])
    assert corps["effectifs"]["femmes"] + corps["effectifs"]["hommes"] == corps["effectifs"]["total"]
    assert {"mouvements", "discipline", "conges", "absences", "sorties"} <= set(corps)


def test_suivi_du_plan_regroupe_les_modules_par_cadre(api):
    session = SessionFormation.objects.first()
    corps = {"type": session.type_formation.code, "libelle": session.libelle, "places": session.places, "heures": session.heures, "cout_participant": session.cout_participant}
    reponse = api.patch(f"/api/v1/formation/sessions/{session.code}/", corps, format="json")
    assert reponse.status_code == 200, reponse.content
    session.refresh_from_db()
    assert session.cadre == "ci_ministere"
    suivi = api.get("/api/v1/grh/formation/suivi/").json()
    assert any(c["code"] == "ci_ministere" and c["modules"] >= 1 for c in suivi["cadres"])
    assert "ci_ministere" not in {c["code"] for c in suivi["cadres_externes"]}


def test_conference_puis_catalogue_puis_bilan(api):
    conf = "/api/v1/grh/programmation/conference/"
    cat = "/api/v1/grh/programmation/catalogue/"
    lignes = api.get(conf).json()["lignes"]
    # La décision se prend par emploi : chaque ligne est un emploi demandé, avec le décompte des structures qui le réclament.
    assert lignes and all(l["emploi"]["code"] and l["nombre_structures"] >= 1 for l in lignes)
    emploi = next(l for l in lignes if l["fonctionnaires"] >= 1 and l["contractuels"] >= 1)
    code = emploi["emploi"]["code"]
    assert sum(s["fonctionnaires"] for s in emploi["structures"]) == emploi["fonctionnaires"]

    # La Conférence examine les besoins une fois l'appel clôturé.
    assert api.get(conf).json()["ouverte"] is False
    assert api.post(conf, {"emploi": code, "maintenir": True}, format="json").status_code == 409
    assert api.post("/api/v1/besoins/campagne/cloturer/", {}, format="json").status_code == 200
    assert api.get(conf).json()["ouverte"] is True
    assert api.post(conf, {"emploi": "inconnu", "maintenir": True}, format="json").status_code == 404

    # Le catalogue ne reprend que les emplois retenus par la Conférence.
    assert api.post(cat, {"emploi": code, "maintenir": True}, format="json").status_code == 400
    # Maintenir reprend le nombre demandé pour l'emploi.
    ok = api.post(conf, {"emploi": code, "maintenir": True, "reference": "PV-1"}, format="json")
    assert ok.status_code == 201 and ok.json()["conference"]["decision"] == "maintenu"
    assert ok.json()["conference"]["fonctionnaires"] == emploi["fonctionnaires"] and ok.json()["conference"]["volume"] == emploi["volume"]
    # Modifier exige un motif ; des nombres identiques à la demande valent maintien.
    nouveaux = {"emploi": code, "fonctionnaires": emploi["fonctionnaires"] + 2, "contractuels": 0}
    assert api.post(conf, nouveaux, format="json").status_code == 400
    modif = api.post(conf, {**nouveaux, "observations": "Renfort décidé en séance"}, format="json")
    assert modif.status_code == 200 and modif.json()["conference"]["decision"] == "modifie"
    assert modif.json()["conference"]["volume"] == emploi["fonctionnaires"] + 2
    egal = api.post(conf, {"emploi": code, "fonctionnaires": emploi["fonctionnaires"], "contractuels": emploi["contractuels"]}, format="json")
    assert egal.json()["conference"]["decision"] == "maintenu"

    # Le décompte total est la somme des emplois retenus.
    total = api.get(conf).json()["totaux"]
    assert total["volume_valide"] == sum(l["conference"]["volume"] for l in api.get(conf).json()["lignes"] if l["conference"]) == emploi["volume"]

    # Le Catalogue est la décision de la Fonction publique : elle garde la trace de la demande et de la Conférence.
    assert api.post(cat, {"emploi": code, "fonctionnaires": 1, "contractuels": 0}, format="json").status_code == 400
    accord = api.post(cat, {"emploi": code, "fonctionnaires": 1, "contractuels": 0, "observations": "Accord partiel de la Fonction publique"}, format="json")
    assert accord.status_code == 201 and accord.json()["catalogue"]["decision"] == "modifie"
    assert accord.json()["volume"] == emploi["volume"] and accord.json()["conference"]["volume"] == emploi["volume"]
    suite = api.get(cat).json()
    assert suite["totaux"]["volume_conference"] == emploi["volume"] and suite["totaux"]["volume_valide"] == 1

    bilan = api.get("/api/v1/grh/programmation/bilan/").json()
    ligne = next(item for item in bilan["lignes"] if item["emploi"] == emploi["emploi"]["libelle"])
    assert ligne["catalogue"]["total"] == 1 and ligne["conference"]["total"] == emploi["volume"] and ligne["demande"]["total"] == emploi["volume"]
    assert ligne["demande"]["fonctionnaires"] == emploi["fonctionnaires"] and ligne["demande"]["contractuels"] == emploi["contractuels"]
    assert ligne["dote"]["total"] == 0 and ligne["ecart"] == -1 and ligne["taux"] == 0.0

    # Retirer la décision de la Conférence retire aussi celle du Catalogue.
    assert api.delete(f"{conf}{code}/").status_code == 204
    assert ValidationBesoin.objects.filter(emploi__code=code).count() == 0
    from rest_framework.test import APIClient

    assert APIClient().post(conf, {}, format="json").status_code == 401


def test_etape_inconnue(api):
    assert api.get("/api/v1/grh/programmation/autre/").status_code == 404


def test_distinction_classee_par_famille(api):
    cree = api.post("/api/v1/carrieres/fin-de-carriere/distinctions/", {"rang": "PE", "titre": "Prix 2026", "famille": "prix_excellence"}, format="json")
    assert cree.status_code == 201 and cree.json()["famille"] == "prix_excellence"
    # Une modification sans famille garde celle de la distinction.
    modifiee = api.patch(f"/api/v1/carrieres/fin-de-carriere/distinctions/{cree.json()['id']}/", {"rang": "PE", "titre": "Prix 2026 bis"}, format="json")
    assert modifiee.json()["famille"] == "prix_excellence"
    inconnue = api.post("/api/v1/carrieres/fin-de-carriere/distinctions/", {"rang": "X", "titre": "Autre", "famille": "bidon"}, format="json")
    assert inconnue.json()["famille"] == "autre"


def _client(matricule):
    client = APIClient()
    token = client.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def test_parcours_crud_par_le_gestionnaire_et_lecture_par_l_agent(api):
    base = "/api/v1/agents/318490K/parcours/"
    cree = api.post(base, {"type": "promotion", "intitule": "Promotion au grade A4", "date_effet": "2025-03-01", "reference_acte": "ARR-12"}, format="json")
    assert cree.status_code == 201
    pk = cree.json()["id"]
    assert api.post(base, {"type": "inconnu", "intitule": "x", "date_effet": "2025-03-01"}, format="json").status_code == 400
    assert api.post(base, {"type": "mutation", "intitule": "x", "date_effet": "pas-une-date"}, format="json").status_code == 400
    assert api.patch(f"{base}{pk}/", {"intitule": "Promotion au grade A5"}, format="json").json()["intitule"] == "Promotion au grade A5"

    agent = _client("318490K")
    detail = agent.get("/api/v1/agents/318490K/").json()
    assert [e["intitule"] for e in detail["parcours"]] == ["Promotion au grade A5"]
    # L'agent observe son parcours mais ne le modifie pas.
    assert agent.post(base, {"type": "mutation", "intitule": "Auto-mutation", "date_effet": "2025-04-01"}, format="json").status_code == 403
    assert agent.delete(f"{base}{pk}/").status_code == 403

    assert api.delete(f"{base}{pk}/").status_code == 204
    assert api.get(base).json() == []


def test_procedure_disciplinaire_suivie_par_l_agent(api):
    ouverte = api.post("/api/v1/carrieres/discipline/", {
        "matricule": "318490K", "grief": "Absences injustifiées", "description": "Trois absences", "degre": 1, "rapporteur": "349812K",
    }, format="json")
    assert ouverte.status_code == 201, ouverte.content
    pk = ouverte.json()["id"]
    assert ouverte.json()["phase"] == "instruction"

    agent = _client("318490K")
    assert agent.get("/api/v1/agents/318490K/").json()["discipline"][0]["phase"] == "instruction"
    assert agent.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "decision"}, format="json").status_code == 403

    conseil = api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "audience"}, format="json")
    assert conseil.status_code == 200 and conseil.json()["avis"] == "delibere" and conseil.json()["stade"] == "Audience"
    # Une décision exige son contenu et sa date, jamais dans le futur.
    assert api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "decision"}, format="json").status_code == 400
    futur = api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "decision", "decision": "Blâme", "date_decision": "2999-01-01"}, format="json")
    assert futur.status_code == 400

    from datetime import date

    from personnel.models import SanctionDisciplinaire

    decision = api.patch(f"/api/v1/carrieres/discipline/{pk}/", {
        "phase": "decision", "decision": "Blâme notifié", "sanction_nature": "blame", "date_decision": localdate().isoformat(),
    }, format="json")
    assert decision.status_code == 200 and decision.json()["avis"] == "sanction"
    # Une décision sans sanction ni non-lieu est refusée ; le non-lieu (degré 0) classe la procédure sans sanction.
    sans = api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "decision", "decision": "Rien", "sanction_nature": "", "date_decision": localdate().isoformat()}, format="json")
    assert sans.status_code == 400 and "non-lieu" in sans.json()["detail"]
    ni_audience = api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "audience", "degre": 0}, format="json")
    assert ni_audience.status_code == 400 and "phase Décision" in ni_audience.json()["detail"]
    nonlieu = api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "decision", "degre": 0, "decision": "Non-lieu prononcé", "date_decision": localdate().isoformat()}, format="json")
    assert nonlieu.status_code == 200 and nonlieu.json()["avis"] == "classee"
    assert SanctionDisciplinaire.objects.filter(procedure_id=pk).count() == 0
    api.patch(f"/api/v1/carrieres/discipline/{pk}/", {
        "phase": "decision", "degre": 1, "decision": "Blâme notifié", "sanction_nature": "blame", "date_decision": localdate().isoformat(),
    }, format="json")
    assert SanctionDisciplinaire.objects.filter(procedure_id=pk, nature="blame").count() == 1
    vue = agent.get("/api/v1/agents/318490K/").json()["discipline"][0]
    assert vue["phase"] == "decision" and vue["sanction_libelle"] == "Blâme" and "rapporteur" not in vue

    # Revenir en arrière retire la sanction du registre.
    api.patch(f"/api/v1/carrieres/discipline/{pk}/", {"phase": "audience"}, format="json")
    assert SanctionDisciplinaire.objects.filter(procedure_id=pk).count() == 0

    assert api.delete(f"/api/v1/carrieres/discipline/{pk}/").status_code == 204
    assert agent.get("/api/v1/agents/318490K/").json()["discipline"] == []


def test_positions_administratives_pilotent_la_situation(api, settings, tmp_path):
    from datetime import date, timedelta

    from django.core.files.uploadedfile import SimpleUploadedFile

    settings.MEDIA_ROOT = tmp_path

    def acte(nom="arrete.pdf", contenu=b"%PDF-1.4 acte"):
        return SimpleUploadedFile(nom, contenu, content_type="application/pdf")

    from personnel.models import Agent

    base = "/api/v1/agents/318490K/positions/"
    hier, demain = localdate() - timedelta(days=1), localdate() + timedelta(days=30)
    # Un détachement exige sa structure d'accueil ; la fin ne précède pas le début.
    assert api.post(base, {"type": "detachement", "date_debut": hier.isoformat(), "document": acte()}, format="multipart").status_code == 400
    assert api.post(base, {"type": "disponibilite", "date_debut": demain.isoformat(), "date_fin": hier.isoformat(), "document": acte()}, format="multipart").status_code == 400
    assert api.post(base, {"type": "inconnu", "date_debut": hier.isoformat(), "document": acte()}, format="multipart").status_code == 400
    # Chaque position exige son acte, au bon format.
    sans_acte = api.post(base, {"type": "disponibilite", "date_debut": hier.isoformat()}, format="multipart")
    assert sans_acte.status_code == 400 and "acte" in sans_acte.json()["detail"]
    assert api.post(base, {"type": "disponibilite", "date_debut": hier.isoformat(), "document": acte("virus.exe")}, format="multipart").status_code == 400

    cree = api.post(base, {"type": "detachement", "structure_accueil": "SIR", "date_debut": hier.isoformat(), "date_fin": demain.isoformat(), "reference_acte": "ARR-9", "document": acte()}, format="multipart")
    assert cree.status_code == 201 and cree.json()["etat"] == "en_cours"
    assert cree.json()["document_nom"].startswith("arrete") and cree.json()["document_url"]
    pk = cree.json()["id"]
    assert Agent.objects.get(matricule="318490K").situation == "En détachement"

    # Pas de chevauchement.
    assert api.post(base, {"type": "disponibilite", "date_debut": localdate().isoformat(), "document": acte()}, format="multipart").status_code == 400

    # Le registre et le profil de l'agent le montrent ; le parcours reprend la période.
    registre = {a["matricule"]: a for a in api.get("/api/v1/agents/").json()}
    assert registre["318490K"]["situation"] == "En détachement"
    agent = _client("318490K")
    detail = agent.get("/api/v1/agents/318490K/").json()
    assert any(e["origine"] == "position" and "SIR" in e["intitule"] and e["document_url"] for e in detail["parcours"])
    assert agent.post(base, {"type": "disponibilite", "date_debut": demain.isoformat(), "document": acte()}, format="multipart").status_code == 403

    # Corriger sans renvoyer l'acte conserve celui qui est joint ; on peut aussi le remplacer.
    garde = api.patch(f"{base}{pk}/", {"motif": "Mission"}, format="json")
    assert garde.status_code == 200 and garde.json()["document_nom"].startswith("arrete")
    remplace = api.patch(f"{base}{pk}/", {"document": acte("nouvel-arrete.pdf")}, format="multipart")
    assert remplace.status_code == 200 and remplace.json()["document_nom"].startswith("nouvel-arrete")

    # Une période terminée ramène l'agent en activité.
    api.patch(f"{base}{pk}/", {"date_debut": (hier - timedelta(days=20)).isoformat(), "date_fin": hier.isoformat()}, format="json")
    assert Agent.objects.get(matricule="318490K").situation == "En activité"

    api.patch(f"{base}{pk}/", {"date_debut": hier.isoformat(), "date_fin": ""}, format="json")
    assert Agent.objects.get(matricule="318490K").situation == "En détachement"
    assert api.delete(f"{base}{pk}/").status_code == 204
    assert Agent.objects.get(matricule="318490K").situation == "En activité"


def test_l_administrateur_lance_la_campagne_des_conges(api):
    from django.contrib.auth.models import User

    from personnel.models import Profil

    drh = Profil.objects.get(user__username="DRH-2018-044")
    admin = User.objects.create_user("admin-test", password="x")
    Profil.objects.create(user=admin, fonction="Administrateur", role="Administrateur", organisme=drh.organisme, administrateur=True)
    client = APIClient()
    client.force_authenticate(admin)
    assert client.get("/api/v1/conges/planification/").json()["role"] == "drh"
    corps = {
        "exercice": 2026, "delai": "2026-12-31", "limite_agents": "2026-11-15", "limite_hierarchie": "2026-11-30",
        "limite_rh": "2026-12-10", "limite_drh": "2026-12-20", "communique": "Ouverture de la campagne.",
    }
    lancement = client.post("/api/v1/conges/planification/ouvrir/", corps, format="json")
    assert lancement.status_code == 201, lancement.content


def test_quorums_calcules_par_structure_des_parametres(api):
    from personnel.models import EntiteTutelle

    corps = api.get("/api/v1/carrieres/conges/").json()
    noms = {e.nom for e in EntiteTutelle.objects.all()}
    # Seules les structures des paramètres sont listées, avec le seuil commun de la campagne.
    assert corps["quorums"] and {q["entite"] for q in corps["quorums"]} <= noms
    for quorum in corps["quorums"]:
        assert 0 <= quorum["presence"] <= 100 and quorum["absents"] <= quorum["effectif"] and quorum["seuil"] > 0
    # Les structures les plus proches de leur seuil viennent en premier.
    marges = [q["presence"] - q["seuil"] for q in corps["quorums"]]
    assert marges == sorted(marges)
    # Les agents dont la structure est inconnue des paramètres sont comptés à part, pas perdus.
    assert corps["quorums_non_rattaches"] + sum(q["effectif"] for q in corps["quorums"]) <= corps["volume"]["effectifs"]
    assert corps["quorums_non_rattaches"] >= 0


def test_radar_des_departs_calcule_sur_les_conges_reels(api):
    from datetime import date

    from personnel.models import Absence, Agent

    annee = localdate().year
    Absence.objects.all().delete()
    base = api.get("/api/v1/carrieres/conges/").json()
    assert len(base["mensuel"]) == 12 and len(base["trimestres"]) == 4
    assert set(base["mensuel"]) == {100} and all(t["departs"] == 0 for t in base["trimestres"])

    # Un congé de juillet fait baisser juillet, compte un départ au T3 et laisse les autres trimestres intacts.
    agent = Agent.objects.exclude(matricule="DRH-2018-044").first()
    Absence.objects.create(agent=agent, nature="Congé annuel", debut=date(annee, 7, 6), fin=date(annee, 7, 17), jours=10, statut="Validé")
    corps = api.get("/api/v1/carrieres/conges/").json()
    assert corps["mensuel"][6] < 100 and corps["mensuel"][5] == 100
    assert [t["departs"] for t in corps["trimestres"]] == [0, 0, 1, 0]
    assert "1 agent" in corps["trimestres"][2]["texte"]
    assert corps["presence"]["seuil"] > 0


def test_registre_des_conges_n_affiche_que_des_structures_des_parametres(api):
    from personnel.models import EntiteTutelle

    corps = api.get("/api/v1/carrieres/conges/").json()
    noms = {e.nom for e in EntiteTutelle.objects.all()}
    assert corps["demandes"]
    for demande in corps["demandes"]:
        # La structure du registre est celle des paramètres, jamais la société employeuse.
        assert demande["structure"] in noms, demande["structure"]
    assert "reliquats" not in corps and corps["campagne"] is None  # aucune campagne ouverte, aucun texte figé


def test_le_quorum_de_presence_est_un_parametre(api):
    assert api.get("/api/v1/carrieres/conges/").json()["presence"]["seuil"] == 65
    refuse = api.post("/api/v1/parametres/delais/", {"visa_acte_jours": 2, "validation_hierarchie_jours": 3, "quorum_presence_pourcent": 150}, format="json")
    assert refuse.status_code == 400
    ok = api.post("/api/v1/parametres/delais/", {"visa_acte_jours": 2, "validation_hierarchie_jours": 3, "quorum_presence_pourcent": 70}, format="json")
    assert ok.status_code == 200 and ok.json()["delais"]["quorum_presence_pourcent"] == 70
    corps = api.get("/api/v1/carrieres/conges/").json()
    assert corps["presence"]["seuil"] == 70 and all(q["seuil"] == 70 for q in corps["quorums"])


def test_conflit_de_quorum_se_deduit_de_la_presence_reelle(api):
    from datetime import date, timedelta

    from personnel.models import Absence, Agent

    Absence.objects.all().delete()
    # Trois agents dans une même structure des paramètres : deux absents en même temps font tomber la présence à 33 %.
    structure = "Direction du Portefeuille des Secteurs Primaire et Secondaire"
    for matricule in ("402771K", "418902X", "288103A"):
        Agent.objects.filter(matricule=matricule).update(direction=structure, sous_direction="", service="", structure=structure)
    debut = localdate() + timedelta(days=10)

    def demande(matricule):
        return Absence.objects.create(
            agent=Agent.objects.get(matricule=matricule), nature="Congé annuel", debut=debut, fin=debut + timedelta(days=4),
            jours=5, statut="En instruction", instruction="pret_signature", interim="Intérim désigné",
        )

    premiere = demande("402771K")

    def vue(absence):
        return next(d for d in api.get("/api/v1/carrieres/conges/").json()["demandes"] if d["id"] == absence.id)

    # Un seul absent sur trois (67 %) respecte le quorum de 65 %.
    assert vue(premiere)["instruction"] == "pret_signature"
    seconde = demande("418902X")
    conflit = vue(premiere)
    assert conflit["instruction"] == "conflit_quorum" and "33 %" in conflit["interim_detail"] and vue(seconde)["instruction"] == "conflit_quorum"
    # Abaisser le quorum dans les paramètres lève le conflit : rien n'est saisi à la main.
    api.post("/api/v1/parametres/delais/", {"visa_acte_jours": 2, "validation_hierarchie_jours": 3, "quorum_presence_pourcent": 30}, format="json")
    assert vue(premiere)["instruction"] == "pret_signature"
    # L'état enregistré en base n'a pas bougé : c'est une valeur calculée à la lecture.
    premiere.refresh_from_db()
    assert premiere.instruction == "pret_signature"


def test_un_quorum_sans_sens_pour_une_structure_trop_petite_ne_bloque_pas(api):
    from datetime import date, timedelta

    from personnel.models import Absence, Agent

    Absence.objects.all().delete()
    # DGPE ne compte que deux agents dans la graine : une absence isolée ne peut pas respecter 65 %, le quorum n'y est pas évaluable.
    debut = localdate() + timedelta(days=10)
    absence = Absence.objects.create(
        agent=Agent.objects.get(matricule="318490K"), nature="Congé annuel", debut=debut, fin=debut + timedelta(days=4),
        jours=5, statut="En instruction", instruction="pret_signature",
    )
    vue = next(d for d in api.get("/api/v1/carrieres/conges/").json()["demandes"] if d["id"] == absence.id)
    assert vue["instruction"] == "pret_signature"


def test_indicateurs_calcules_plus_aucun_bloc_fige(api):
    from personnel.models import BlocEcran

    absences = api.get("/api/v1/carrieres/absences/").json()["presenteisme"]
    assert 0 <= absences["taux"] <= 100 and absences["objectif"] == 65
    discipline = api.get("/api/v1/carrieres/discipline/").json()["regularite"]
    assert discipline["taux"] is None or 0 <= discipline["taux"] <= 100
    fin = api.get("/api/v1/carrieres/fin-de-carriere/").json()
    assert fin["indicateurs"]["transmis"] <= fin["indicateurs"]["dossiers"]
    # Les blocs d'indicateurs qui étaient saisis en dur ne sont plus versés.
    assert not BlocEcran.objects.filter(ecran="absences", cle="presenteisme").exists()
    assert not BlocEcran.objects.filter(ecran="discipline", cle="regularite").exists()


def _compte_responsable(identifiant, structure_code, role):
    from django.contrib.auth.models import User

    from personnel.models import EntiteTutelle, Profil

    drh = Profil.objects.get(user__username="DRH-2018-044")
    utilisateur = User.objects.create_user(identifiant, password="x")
    Profil.objects.create(
        user=utilisateur, fonction=role, role=role, organisme=drh.organisme, structure=EntiteTutelle.objects.get(code=structure_code),
    )
    client = APIClient()
    client.force_authenticate(utilisateur)
    return client


def test_chaque_utilisateur_ne_voit_que_les_agents_de_sa_supervision(api):
    from datetime import date, timedelta

    from personnel.models import Absence, Agent, ProcedureDisciplinaire

    # Agents placés dans la hiérarchie des paramètres : DGPE (N+2) > Direction du Portefeuille du Secteur Tertiaire (N+1).
    place = {
        "318490K": "Direction du Portefeuille du Secteur Tertiaire",  # X : sous le N+1
        "340188P": "Direction Générale du Portefeuille de l'État",  # Y : rattaché directement au N+2
        "402771K": "Direction du Portefeuille des Secteurs Primaire et Secondaire",  # Z : pair du N+1
    }
    for matricule, structure in place.items():
        Agent.objects.filter(matricule=matricule).update(direction=structure, sous_direction="", service="", structure=structure)
    debut = localdate() + timedelta(days=20)
    for matricule in place:
        agent = Agent.objects.get(matricule=matricule)
        Absence.objects.create(agent=agent, nature="Congé annuel", debut=debut, fin=debut + timedelta(days=4), jours=5, statut="En instruction", instruction="pret_signature")

    n2 = _compte_responsable("n2-test", "dgpe", "Directeur général")
    n1 = _compte_responsable("n1-test", "dpst", "Directeur")

    def matricules(client, url="/api/v1/agents/"):
        return {a["matricule"] for a in client.get(url).json()} & set(place)

    # Le N+2 voit toute la chaîne descendante ; le N+1 ne voit que sa propre structure.
    assert matricules(n2) == {"318490K", "340188P", "402771K"}
    assert matricules(n1) == {"318490K"}
    # Le DRH (racine) voit tout.
    assert matricules(api) == {"318490K", "340188P", "402771K"}

    # Dossier : 404 hors périmètre, ouvert dans le périmètre.
    assert n1.get("/api/v1/agents/318490K/").status_code == 200
    assert n1.get("/api/v1/agents/340188P/").status_code == 404
    assert n1.get("/api/v1/agents/402771K/").status_code == 404
    assert n2.get("/api/v1/agents/402771K/").status_code == 200
    for sous_route in ("parcours/", "positions/"):
        assert n1.get(f"/api/v1/agents/340188P/{sous_route}").status_code == 404

    # Tables et indicateurs : les mêmes règles partout.
    demandes = {d["agent"]["matricule"] for d in n1.get("/api/v1/carrieres/conges/").json()["demandes"]} & set(place)
    assert demandes == {"318490K"}
    assert {d["agent"]["matricule"] for d in n2.get("/api/v1/carrieres/conges/").json()["demandes"]} >= {"318490K", "340188P", "402771K"}
    assert {a["matricule"] for a in n1.get("/api/v1/carrieres/discipline/").json()["agents"]} & set(place) == {"318490K"}
    assert {a["agent"]["matricule"] for a in n1.get("/api/v1/carrieres/absences/").json()["suivi"]} <= {"318490K"}
    assert {a["matricule"] for a in n1.get("/api/v1/carrieres/fin-de-carriere/").json()["agents"]} & set(place) == {"318490K"}
    assert {a["matricule"] for a in n1.get("/api/v1/action-sociale/").json()["agents"]} & set(place) == {"318490K"}
    assert n1.get("/api/v1/grh/bilan-carriere/").json()["effectifs"]["total"] < api.get("/api/v1/grh/bilan-carriere/").json()["effectifs"]["total"]
    assert n1.get("/api/v1/statistiques/").json()["agents"] < api.get("/api/v1/statistiques/").json()["agents"]

    # Les quorums ne montrent que les structures supervisées.
    assert {q["entite"] for q in n1.get("/api/v1/carrieres/conges/").json()["quorums"]} <= {"Direction du Portefeuille du Secteur Tertiaire"}

    # Agir sur un agent hors périmètre est refusé.
    hors = Absence.objects.get(agent__matricule="340188P", debut=debut, instruction="pret_signature")
    assert n1.post(f"/api/v1/conges/{hors.id}/instruction/", {"action": "rejeter", "motif": "Non"}, format="json").status_code == 404
    refus = n1.post("/api/v1/carrieres/discipline/", {"matricule": "340188P", "grief": "x", "description": "y", "rapporteur": "318490K"}, format="json")
    assert refus.status_code in (400, 403, 404) and not ProcedureDisciplinaire.objects.filter(agent__matricule="340188P").exists()


def test_l_administrateur_voit_tout_comme_le_drh(api):
    from django.contrib.auth.models import User

    from personnel.models import Agent, Profil

    drh = Profil.objects.get(user__username="DRH-2018-044")
    admin = User.objects.create_user("admin-perimetre", password="x")
    Profil.objects.create(user=admin, fonction="Administrateur", role="Administrateur", organisme=drh.organisme, administrateur=True)
    client = APIClient()
    client.force_authenticate(admin)
    routes = (
        "/api/v1/agents/", "/api/v1/carrieres/conges/", "/api/v1/carrieres/absences/", "/api/v1/carrieres/discipline/",
        "/api/v1/carrieres/fin-de-carriere/", "/api/v1/action-sociale/", "/api/v1/grh/bilan-carriere/",
    )
    for route in routes:
        assert client.get(route).json() == api.get(route).json() or route == "/api/v1/agents/", route
    assert len(client.get("/api/v1/agents/").json()) == len(api.get("/api/v1/agents/").json())
    # Tous les dossiers s'ouvrent, quel que soit le rattachement de l'agent.
    assert all(client.get(f"/api/v1/agents/{m}/").status_code == 200 for m in Agent.objects.values_list("matricule", flat=True))


def test_chaque_structure_definit_son_quorum_et_les_services_heritent(api):
    structures = {s["code"]: s for s in api.get("/api/v1/structures/").json()["structures"]}
    # Sans valeur propre, une structure reprend le quorum par défaut des paramètres.
    assert structures["svc-actes"]["quorum_presence_pourcent"] is None
    assert structures["svc-actes"]["quorum_effectif"] == 65 and structures["svc-actes"]["quorum_herite"] is True

    def corps(code, quorum):
        s = structures[code]
        return {"nom": s["nom"], "pole": s["pole"], "niveau": s["niveau"], "parent": s["parent"], "quorum_presence_pourcent": quorum}

    # Valeurs refusées.
    for mauvais in (0, 101, "abc"):
        assert api.patch("/api/v1/structures/drh/", corps("drh", mauvais), format="json").status_code == 400
    # La DRH définit 80 % : ses sous-structures qui n'ont pas le leur l'héritent.
    ok = api.patch("/api/v1/structures/drh/", corps("drh", 80), format="json")
    assert ok.status_code == 200 and ok.json()["quorum_presence_pourcent"] == 80 and ok.json()["quorum_herite"] is False
    apres = {s["code"]: s for s in api.get("/api/v1/structures/").json()["structures"]}
    assert apres["svc-actes"]["quorum_effectif"] == 80 and apres["svc-actes"]["quorum_herite"] is True
    # Le service définit le sien : il prime sur celui de la direction.
    api.patch("/api/v1/structures/svc-actes/", corps("svc-actes", 50), format="json")
    apres = {s["code"]: s for s in api.get("/api/v1/structures/").json()["structures"]}
    assert apres["svc-actes"]["quorum_effectif"] == 50 and apres["svc-actes"]["quorum_herite"] is False
    assert apres["svc-courrier"]["quorum_effectif"] == 80
    # Vider le champ rend l'héritage.
    api.patch("/api/v1/structures/svc-actes/", corps("svc-actes", ""), format="json")
    assert {s["code"]: s for s in api.get("/api/v1/structures/").json()["structures"]}["svc-actes"]["quorum_effectif"] == 80


def test_le_conflit_de_quorum_utilise_le_seuil_de_la_plus_petite_structure(api):
    from datetime import date, timedelta

    from personnel.models import Absence, Agent, EntiteTutelle

    Absence.objects.all().delete()
    # Trois agents dans un même service ; le service définit 30 %, sa direction 60 %.
    service = EntiteTutelle.objects.get(code="svc-actes")
    EntiteTutelle.objects.filter(code="drh").update(quorum_presence_pourcent=60)
    EntiteTutelle.objects.filter(pk=service.pk).update(quorum_presence_pourcent=30)
    for matricule in ("402771K", "418902X", "288103A"):
        Agent.objects.filter(matricule=matricule).update(direction="", sous_direction="", service=service.nom, structure=service.nom)
    debut = localdate() + timedelta(days=10)
    absences = [
        Absence.objects.create(
            agent=Agent.objects.get(matricule=m), nature="Congé annuel", debut=debut, fin=debut + timedelta(days=4), jours=5,
            statut="En instruction", instruction="pret_signature", interim="Intérim désigné",
        )
        for m in ("402771K", "418902X")
    ]
    corps = api.get("/api/v1/carrieres/conges/").json()
    # Deux absents sur trois : 33 % de présence. Le seuil du service (30 %) est respecté, pas celui de la direction (90 %).
    mes = [(d["instruction"], d["interim_detail"]) for d in corps["demandes"] if d["id"] in {a.id for a in absences}]
    assert all(i == "pret_signature" for i, _ in mes), mes
    ligne = next(q for q in corps["quorums"] if q["nom"] == service.nom)
    assert ligne["seuil"] == 30
    # Si le service reprend celui de la direction (60 %), les mêmes demandes sont en conflit.
    EntiteTutelle.objects.filter(pk=service.pk).update(quorum_presence_pourcent=None)
    corps = api.get("/api/v1/carrieres/conges/").json()
    demandes = [d for d in corps["demandes"] if d["id"] in {a.id for a in absences}]
    assert all(d["instruction"] == "conflit_quorum" and "quorum 60 %" in d["interim_detail"] for d in demandes)


def test_presence_du_service_dans_la_fiche_suit_la_structure_et_son_quorum(api):
    from personnel.models import EntiteTutelle

    # ADJOUMANI (340188P) et KONÉ (318490K) sont tous deux à la DGPE : ce sont ses collègues, avec le quorum de cette structure.
    dgpe = EntiteTutelle.objects.get(code="dgpe")
    EntiteTutelle.objects.filter(pk=dgpe.pk).update(quorum_presence_pourcent=55)
    presence = api.get("/api/v1/agents/340188P/").json()["presence"]
    assert presence["service"] == dgpe.nom and presence["quorum"] == 55
    assert [m["nom"].split()[0] for m in presence["membres"]] == ["ADJOUMANI", "KONÉ"]
    # Un collègue d'une autre société mais de la même structure compte ; un homonyme de société n'en fait plus partie.
    from personnel.models import Organisme

    assert not hasattr(Organisme, "quorum_presence")


def test_modifier_le_quorum_depuis_le_tableau_des_quorums(api):
    from datetime import date, timedelta

    from personnel.models import Absence, Agent, EntiteTutelle

    Absence.objects.all().delete()
    # Un agent à la DPST (sous la DGPE) : sa structure apparaît dans le tableau des quorums du N+1 comme du N+2 et du DRH.
    Agent.objects.filter(matricule="318490K").update(direction="Direction du Portefeuille du Secteur Tertiaire", sous_direction="", service="", structure="Direction du Portefeuille du Secteur Tertiaire")
    debut = localdate()
    Absence.objects.create(agent=Agent.objects.get(matricule="318490K"), nature="Congé annuel", debut=debut, fin=debut + timedelta(days=2), jours=3, statut="Validé", instruction="signe")
    n2 = _compte_responsable("n2-quorum", "dgpe", "Directeur général")
    n1 = _compte_responsable("n1-quorum", "dpst", "Directeur")
    pair = _compte_responsable("pair-quorum", "dppss", "Directeur")

    def ligne(client):
        return next(q for q in client.get("/api/v1/carrieres/conges/").json()["quorums"] if q["code"] == "dpst")

    # Qui peut modifier : le DRH (racine), le responsable de la structure et ses supérieurs ; pas un pair.
    assert ligne(api)["peut_modifier"] is True and ligne(n1)["peut_modifier"] is True and ligne(n2)["peut_modifier"] is True
    route = "/api/v1/structures/dpst/quorum/"
    assert pair.patch(route, {"quorum_presence_pourcent": 10}, format="json").status_code == 403
    assert n1.patch(route, {"quorum_presence_pourcent": 0}, format="json").status_code == 400
    assert n1.patch(route, {"quorum_presence_pourcent": 101}, format="json").status_code == 400
    ok = n1.patch(route, {"quorum_presence_pourcent": 40}, format="json")
    assert ok.status_code == 200 and ok.json()["quorum_presence_pourcent"] == 40
    # Le tableau reflète le nouveau seuil, propre à la structure.
    modifiee = ligne(n2)
    assert modifiee["seuil"] == 40 and modifiee["quorum_propre"] == 40
    # Vider le champ rend l'héritage (le quorum par défaut).
    assert n1.patch(route, {"quorum_presence_pourcent": ""}, format="json").status_code == 200
    rendue = ligne(n1)
    assert rendue["quorum_propre"] is None and rendue["seuil"] == 65
    # Structure inconnue.
    assert api.patch("/api/v1/structures/inconnue/quorum/", {"quorum_presence_pourcent": 50}, format="json").status_code == 404
    assert EntiteTutelle.objects.get(code="dpst").quorum_presence_pourcent is None


def test_demande_d_absence_de_l_agent_de_bout_en_bout(api):
    """L'agent demande depuis son profil ; le gestionnaire statue dans le suivi des absences ; l'agent voit l'issue."""
    agent = _client("318490K")
    depot = agent.post(
        "/api/v1/agents/318490K/conges/demande/",
        {"type": "evenement-familial", "debut": "2026-11-02", "fin": "2026-11-05", "interim": "Mme SORO Karidja"},
        format="json",
    )
    assert depot.status_code == 201, depot.content

    registre = api.get("/api/v1/carrieres/absences/").json()
    ligne = next(a for a in registre["suivi"] if a["agent"]["matricule"] == "318490K" and a["statut"] == "traitement" and a["absence"])
    absence = ligne["absence"]
    # La structure affichée est celle des paramètres, jamais la société.
    from personnel.models import EntiteTutelle

    assert ligne["structure"] in {e.nom for e in EntiteTutelle.objects.all()}
    assert registre["indicateurs"]["en_traitement"] >= 1
    demande = next(d for d in agent.get("/api/v1/agents/318490K/").json()["demandes"] if d["reference"] == absence["demande"])
    assert not demande["etape"].startswith("Clôturée")

    # Les boutons d'action : le motif est obligatoire, la décision n'est prise qu'une fois.
    route = f"/api/v1/absences/{absence['id']}/decision/"
    assert api.post(route, {"sens": "valider"}, format="json").status_code == 400
    assert api.post(route, {"sens": "inconnu", "motif": "x"}, format="json").status_code == 400
    ok = api.post(route, {"sens": "valider", "motif": "Pièce vérifiée."}, format="json")
    assert ok.status_code == 200 and ok.json()["decision"] == "validee"
    assert api.post(route, {"sens": "invalider", "motif": "Revu."}, format="json").status_code == 409

    # L'agent voit l'issue de sa demande dans son profil.
    demande = next(d for d in agent.get("/api/v1/agents/318490K/").json()["demandes"] if d["reference"] == absence["demande"])
    assert demande["etape"] == "Clôturée : autorisation accordée"


def test_suivi_des_agents_en_formation_par_position_et_modifiable(api):
    suivi = api.get("/api/v1/grh/formation/suivi/").json()
    assert suivi["agents"] and sum(p["nombre"] for p in suivi["positions"]) == len(suivi["agents"])
    en_cours = next(a for a in suivi["agents"] if a["position"] == "candidature")
    assert en_cours["modifiable"] is False
    assert api.patch(f"/api/v1/grh/formation/suivi/{en_cours['id']}/", {"present": True}, format="json").status_code == 409
    retenu = next(a for a in suivi["agents"] if a["modifiable"])
    route = f"/api/v1/grh/formation/suivi/{retenu['id']}/"
    assert api.patch(route, {"note_satisfaction": 9}, format="json").status_code == 400
    assert api.patch(route, {"issue": "inconnue"}, format="json").status_code == 400
    ok = api.patch(route, {"issue": "abandon", "observation": "Mutation en cours de module."}, format="json")
    assert ok.status_code == 200 and ok.json()["position"] == "abandon" and ok.json()["observation"] == "Mutation en cours de module."
    retour = api.patch(route, {"issue": "", "present": True, "note_satisfaction": 4}, format="json").json()
    assert retour["position"] in {"formee", "en_formation", "a_venir"} and retour["note_satisfaction"] == 4


def test_formation_hors_plan_suivie_avec_perimetre(api):
    suivi = api.get("/api/v1/grh/formation/suivi/").json()
    assert suivi["agents_choix"] and {c["code"] for c in suivi["cadres_externes"]} >= {"hors_ci_courte", "ci_partenaires"}
    matricule = suivi["agents_choix"][0]["matricule"]
    corps = {"matricule": matricule, "intitule": "Gestion des archives", "cadre": "hors_ci_courte", "dispensateur": "ENA Paris", "lieu": "Paris, France", "date_debut": "2026-11-02", "date_fin": "2026-11-13"}
    assert api.post("/api/v1/grh/formation/externes/", {**corps, "cadre": ""}, format="json").status_code == 400
    assert api.post("/api/v1/grh/formation/externes/", {**corps, "date_fin": "2026-10-01"}, format="json").status_code == 400
    cree = api.post("/api/v1/grh/formation/externes/", corps, format="json")
    assert cree.status_code == 201 and cree.json()["zone_libelle"] == "Formation hors Côte d'Ivoire"
    route = f"/api/v1/grh/formation/externes/{cree.json()['id']}/"
    assert api.patch(route, {**corps, "lieu": "Lyon, France"}, format="json").json()["lieu"] == "Lyon, France"
    assert any(e["id"] == cree.json()["id"] for e in api.get("/api/v1/grh/formation/suivi/").json()["externes"])
    assert api.delete(route).status_code == 204


def test_formation_hors_plan_refuse_la_categorie_du_ministere(api):
    matricule = api.get("/api/v1/grh/formation/suivi/").json()["agents_choix"][0]["matricule"]
    corps = {"matricule": matricule, "intitule": "Stage", "cadre": "ci_ministere", "date_debut": "2026-11-02"}
    assert api.post("/api/v1/grh/formation/externes/", corps, format="json").status_code == 400


def test_retirer_un_agent_d_un_module_du_plan(api):
    suivi = api.get("/api/v1/grh/formation/suivi/").json()
    ligne = next(a for a in suivi["agents"] if not a["modifiable"])
    avant = len(suivi["agents"])
    assert api.delete(f"/api/v1/grh/formation/suivi/{ligne['id']}/").status_code == 204
    assert len(api.get("/api/v1/grh/formation/suivi/").json()["agents"]) == avant - 1


def test_bilan_compte_les_agents_affectes_par_emploi_et_par_categorie(api):
    from datetime import date

    from personnel.models import Agent, EmploiReferentiel, EntiteTutelle, MouvementAgent

    api.post("/api/v1/besoins/campagne/cloturer/", {}, format="json")
    emploi = api.get("/api/v1/grh/programmation/conference/").json()["lignes"][0]
    code = emploi["emploi"]["code"]
    assert api.post("/api/v1/grh/programmation/conference/", {"emploi": code, "maintenir": True}, format="json").status_code == 201
    assert api.post("/api/v1/grh/programmation/catalogue/", {"emploi": code, "maintenir": True}, format="json").status_code == 201
    agents = list(Agent.objects.all()[:2])
    structure = EntiteTutelle.objects.exclude(niveau="ministere").first()
    modele = EmploiReferentiel.objects.get(code=code)
    for agent, categorie in zip(agents, ("fonctionnaire", "contractuel")):
        MouvementAgent.objects.create(
            reference=f"MVT-T-{agent.pk}", type="affectation", categorie=categorie, agent=agent, structure=structure, emploi=modele, date_effet=date.today(),
        )
    bilan = api.get("/api/v1/grh/programmation/bilan/").json()
    ligne = next(l for l in bilan["lignes"] if l["emploi"] == modele.libelle)
    assert ligne["dote"] == {"fonctionnaires": 1, "contractuels": 1, "total": 2}
    assert ligne["ecart"] == 2 - ligne["catalogue"]["total"]
    assert bilan["totaux"]["dote"]["total"] >= 2


def test_exclusion_temporaire_duree_alertes_et_reintegration(api):
    from datetime import timedelta

    from django.utils.timezone import localdate

    from personnel.discipline import surveiller_reintegrations
    from personnel.models import Agent, Notification, PositionAdministrative, ProcedureDisciplinaire

    jour = localdate()
    ouverte = api.post("/api/v1/carrieres/discipline/", {"matricule": "318490K", "grief": "Abandon de poste", "description": "Absent", "degre": 2}, format="json")
    assert ouverte.status_code == 201, ouverte.content
    pk = ouverte.json()["id"]
    route = f"/api/v1/carrieres/discipline/{pk}/"
    ProcedureDisciplinaire.objects.filter(pk=pk).update(saisine=jour - timedelta(days=30))  # ouverte il y a un mois

    # Une durée trop longue ou invalide est refusée ; une exclusion de 10 jours à partir de la décision est enregistrée.
    base = {"phase": "decision", "degre": 2, "decision": "Exclusion de 10 jours", "sanction_nature": "exclusion", "date_decision": (jour - timedelta(days=4)).isoformat()}
    assert api.patch(route, {**base, "duree_jours": 99999}, format="json").status_code == 400
    decide = api.patch(route, {**base, "duree_jours": 10}, format="json")
    assert decide.status_code == 200, decide.content
    corps = decide.json()
    assert corps["duree_jours"] == 10 and corps["exclusion_en_cours"] is True and corps["jours_avant_reprise"] == 6
    agent = Agent.objects.get(matricule="318490K")
    assert agent.situation == "Exclu temporairement"
    position = PositionAdministrative.objects.get(procedure_id=pk)
    assert position.date_fin == jour - timedelta(days=4) + timedelta(days=9)

    # À 6 jours de la reprise, l'équipe RH est alertée (une seule fois), l'agent reste exclu.
    envois = surveiller_reintegrations(jour)
    assert envois >= 1 and Notification.objects.filter(titre__startswith="Réintégration dans 6 jours").exists()
    assert surveiller_reintegrations(jour) == 0

    # La veille : alerte urgente. Le jour de la reprise : réintégration automatique et alerte.
    surveiller_reintegrations(jour + timedelta(days=5))
    assert Notification.objects.filter(titre__startswith="Réintégration demain", urgente=True).exists()
    surveiller_reintegrations(jour + timedelta(days=6))
    item = ProcedureDisciplinaire.objects.get(pk=pk)
    assert item.reintegre_le == jour + timedelta(days=6)
    assert Notification.objects.filter(titre__startswith="Agent réintégré").exists()

    # Réintégration manuelle d'une exclusion sans durée : le bouton lève l'exclusion tout de suite.
    item.positions.all().delete()
    ProcedureDisciplinaire.objects.filter(pk=pk).update(reintegre_le=None)
    redecide = api.patch(route, {**base, "date_decision": jour.isoformat(), "duree_jours": None}, format="json")
    assert redecide.status_code == 200 and redecide.json()["exclusion_en_cours"] is True and redecide.json()["reprise_le"] == ""
    reintegre = api.post(f"{route}reintegrer/")
    assert reintegre.status_code == 200 and reintegre.json()["exclusion_en_cours"] is False and reintegre.json()["reintegre_le"] == jour.isoformat()
    agent.refresh_from_db()
    assert agent.situation == "En activité"
    assert api.post(f"{route}reintegrer/").status_code == 409  # plus d'exclusion à lever
