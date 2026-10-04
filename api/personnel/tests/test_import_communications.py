import io
import zipfile
from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.statistiques import _xlsx

pytestmark = pytest.mark.django_db

ENTETES = ["Intitulé", "Corps", "Nature", "Urgence", "Destinataires", "Accusé de lecture", "Échéance", "Soumettre"]


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
        "communications.xlsx",
        contenu,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _poster(api, auth, lignes):
    return api.post("/api/v1/communication/import/", {"fichier": _fichier(_xlsx({"Communications": [ENTETES, *lignes]}))}, **auth)


def test_import_communications_exige_une_session(api):
    assert api.get("/api/v1/communication/import/modele/").status_code == 401
    assert api.post("/api/v1/communication/import/", {}).status_code == 401


def test_modele_communications(api):
    auth = _auth(api)
    modele = api.get("/api/v1/communication/import/modele/", **auth)
    assert modele.status_code == 200
    assert "modele-communications.xlsx" in modele["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(modele.content)) as archive:
        classeur = archive.read("xl/workbook.xml").decode()
        feuille = archive.read("xl/worksheets/sheet1.xml").decode()
    assert "Communications" in classeur and "Listes" in classeur
    assert "Intitulé" in feuille and "Soumettre" in feuille
    vide = api.post("/api/v1/communication/import/", {"fichier": _fichier(modele.content)}, **auth)
    assert vide.status_code == 400
    assert "aucune communication" in vide.json()["detail"]


def test_import_cree_brouillon_et_visa(api):
    from personnel.models import Publication

    auth = _auth(api)
    reponse = _poster(
        api,
        auth,
        [
            [
                "Horaires d'octobre",
                "Le secrétariat reçoit du lundi au vendredi.",
                "Note de service",
                "Important",
                "Cadres dirigeants et hors catégorie",
                "oui",
                "15/06/2026",
                "non",
            ],
            [
                "Alerte de fermeture",
                "Le guichet sera fermé vendredi.",
                "flash",
                "urgent",
                "tous",
                "non",
                "",
                "oui",
            ],
        ],
    )
    assert reponse.status_code == 200, reponse.json()
    assert reponse.json()["crees"] == 2
    brouillon = Publication.objects.get(intitule="Horaires d'octobre")
    assert brouillon.statut == Publication.Statut.BROUILLON
    assert brouillon.nature == "note"
    assert brouillon.urgence == "important"
    assert brouillon.perimetre == "cadres"
    assert brouillon.accuse is True
    assert brouillon.echeance == date(2026, 6, 15)
    assert brouillon.reference.startswith("REF/MPEEP/DRH/")
    alerte = Publication.objects.get(intitule="Alerte de fermeture")
    assert alerte.statut == Publication.Statut.VISA
    assert alerte.etape_visa
    assert alerte.accuse is False
    assert alerte.reference != brouillon.reference


def test_import_met_a_jour_un_brouillon_sans_toucher_une_cellule_vide(api):
    from personnel.models import Publication

    auth = _auth(api)
    avant = Publication.objects.create(
        reference="TEST-BROUILLON",
        nature="note",
        urgence="normal",
        intitule="Brouillon à compléter",
        corps="Ancien texte",
        perimetre="tous",
        statut=Publication.Statut.BROUILLON,
        accuse=False,
    )
    reponse = _poster(api, auth, [["Brouillon à compléter", "Texte relu et prêt pour le visa.", "", "", "", "", "", ""]])
    assert reponse.status_code == 200, reponse.json()
    assert reponse.json()["mis_a_jour"] == 1
    avant.refresh_from_db()
    assert avant.corps == "Texte relu et prêt pour le visa."
    assert avant.nature == "note"
    assert avant.statut == Publication.Statut.BROUILLON
    assert avant.accuse is False


def test_une_communication_deja_diffusee_bloque_tout_l_import(api):
    from personnel.models import Publication

    auth = _auth(api)
    Publication.objects.create(
        reference="TEST-DIFFUSEE",
        nature="note",
        urgence="normal",
        intitule="Note déjà diffusée",
        corps="Texte publié.",
        perimetre="tous",
        statut=Publication.Statut.DIFFUSE,
    )
    avant = Publication.objects.count()
    reponse = _poster(
        api,
        auth,
        [
            ["Note toute neuve", "Un texte qui ne doit pas être créé.", "note", "normal", "tous", "oui", "", "non"],
            ["Note déjà diffusée", "Texte modifié par erreur.", "note", "normal", "tous", "oui", "", "non"],
        ],
    )
    assert reponse.status_code == 400
    assert "Aucune modification" in reponse.json()["detail"]
    assert "déjà transmise ou diffusée" in reponse.json()["erreurs"][0]["message"]
    assert Publication.objects.count() == avant
    assert Publication.objects.get(intitule="Note déjà diffusée").corps == "Texte publié."


def test_colonne_inconnue_et_nature_inconnue(api):
    auth = _auth(api)
    colonne = api.post(
        "/api/v1/communication/import/",
        {"fichier": _fichier(_xlsx({"Communications": [["Intitulé", "Commentaire"], ["Titre", "note"]]}))},
        **auth,
    )
    assert colonne.status_code == 400
    assert "Commentaire" in colonne.json()["detail"]

    nature = _poster(api, auth, [["Autre note", "Corps du texte.", "Télégramme", "normal", "tous", "oui", "", "non"]])
    assert nature.status_code == 400
    assert "Télégramme" in nature.json()["erreurs"][0]["message"]
