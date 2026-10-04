import io
import zipfile

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.statistiques import _xlsx

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    call_command("seed_demo")
    return APIClient()


def _auth(api):
    jeton = api.post(
        "/api/v1/auth/login/",
        {"matricule": "DRH-2018-044", "password": "Sigrh-Dev-2026"},
        format="json",
    ).json()["token"]
    return {"HTTP_AUTHORIZATION": f"Token {jeton}"}


def _fichier(contenu: bytes):
    return SimpleUploadedFile(
        "structures.xlsx",
        contenu,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _poster(api, auth, feuilles):
    return api.post("/api/v1/structures/import/", {"fichier": _fichier(_xlsx(feuilles))}, **auth)


def test_import_structures_exige_une_session(api):
    assert api.get("/api/v1/structures/import/modele/").status_code == 401
    assert api.post("/api/v1/structures/import/", {}).status_code == 401


def test_modele_structures_decrit_les_feuilles(api):
    auth = _auth(api)
    modele = api.get("/api/v1/structures/import/modele/", **auth)
    assert modele.status_code == 200
    assert "modele-structures.xlsx" in modele["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(modele.content)) as archive:
        classeur = archive.read("xl/workbook.xml").decode()
    assert "Pôles" in classeur and "Structures" in classeur and "Grades" in classeur and "Emplois" in classeur
    vide = api.post("/api/v1/structures/import/", {"fichier": _fichier(modele.content)}, **auth)
    assert vide.status_code == 400
    assert "aucune donnée" in vide.json()["detail"]


def test_import_cree_un_referentiel_lie(api):
    from personnel.models import EmploiReferentiel, EntiteTutelle, GradeReferentiel, PoleMinisteriel

    auth = _auth(api)
    reponse = _poster(
        api,
        auth,
        {
            "Pôles": [["Nom"], ["Pôle de la transformation"]],
            "Structures": [["Nom", "Pôle"], ["Cellule du suivi des réformes", "Pôle de la transformation"]],
            "Grades": [["Code", "Catégorie", "Définition", "En vigueur"], ["Z9", "Catégorie A", "Grade de test", "non"]],
            "Emplois": [["Nom", "Famille", "Grade"], ["Chargé de la transformation", "Administratif et juridique", "Z9"]],
        },
    )
    assert reponse.status_code == 200, reponse.json()
    assert reponse.json()["crees"] == 4
    structure = EntiteTutelle.objects.get(nom="Cellule du suivi des réformes")
    assert structure.pole.nom == "Pôle de la transformation"
    assert structure.niveau == "direction-centrale"
    assert structure.parent_id is None
    assert PoleMinisteriel.objects.filter(nom="Pôle de la transformation").count() == 1
    grade = GradeReferentiel.objects.get(code="Z9")
    assert grade.categorie == "A"
    assert grade.en_vigueur is False
    emploi = EmploiReferentiel.objects.get(libelle="Chargé de la transformation")
    assert emploi.famille == "administratif"
    assert emploi.grade_id == grade.id


def test_import_met_a_jour_sans_ecraser_une_cellule_vide(api):
    from personnel.models import EntiteTutelle, GradeReferentiel

    auth = _auth(api)
    definition = GradeReferentiel.objects.get(code="A3").libelle
    reponse = _poster(
        api,
        auth,
        {
            "Structures": [["Nom", "Pôle"], ["Direction des Ressources Humaines", "DGPE"]],
            "Grades": [["Code", "Catégorie", "Définition"], ["A3", "", "Définition importée"]],
        },
    )
    assert reponse.status_code == 200, reponse.json()
    assert EntiteTutelle.objects.get(nom="Direction des Ressources Humaines").pole.code == "dgpe"
    grade = GradeReferentiel.objects.get(code="A3")
    assert grade.libelle == "Définition importée"
    assert grade.categorie == "A"
    assert grade.libelle != definition


def test_une_ligne_invalide_n_enregistre_rien(api):
    from personnel.models import PoleMinisteriel

    auth = _auth(api)
    avant = PoleMinisteriel.objects.count()
    reponse = _poster(
        api,
        auth,
        {
            "Pôles": [["Nom"], ["Pôle qui ne doit pas rester"]],
            "Grades": [["Code", "Catégorie", "Définition"], ["ZZ", "E", "Hors statut"]],
        },
    )
    assert reponse.status_code == 400
    assert "Aucune modification" in reponse.json()["detail"]
    assert any("ZZ" in item["message"] or "catégorie" in item["message"] for item in reponse.json()["erreurs"])
    assert PoleMinisteriel.objects.count() == avant


def test_pôle_inconnu_doublon_et_colonne_inconnue(api):
    auth = _auth(api)
    inconnu = _poster(api, auth, {"Structures": [["Nom", "Pôle"], ["Direction nouvelle", "Pôle fantôme"]]})
    assert inconnu.status_code == 400
    assert "Pôle fantôme" in inconnu.json()["erreurs"][0]["message"]

    doublon = _poster(
        api,
        auth,
        {"Pôles": [["Nom"], ["Pôle doublé"], ["Pôle doublé"]]},
    )
    assert doublon.status_code == 400
    assert "déjà présent" in doublon.json()["erreurs"][0]["message"]

    colonne = _poster(api, auth, {"Structures": [["Nom", "Commentaire"], ["Inspection Générale", "note"]]})
    assert colonne.status_code == 400
    assert "Commentaire" in colonne.json()["detail"]

    illisible = api.post("/api/v1/structures/import/", {"fichier": _fichier(b"pas un classeur")}, **auth)
    assert illisible.status_code == 400
