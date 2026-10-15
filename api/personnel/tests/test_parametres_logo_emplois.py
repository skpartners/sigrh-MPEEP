import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from PIL import Image
from rest_framework.test import APIClient

from personnel.models import EmploiReferentiel, ParametresMinistere
from personnel.statistiques import _xlsx

pytestmark = pytest.mark.django_db


@pytest.fixture
def api():
    call_command("seed_demo")
    return APIClient()


def _auth(api, matricule="DRH-2018-044"):
    jeton = api.post("/api/v1/auth/login/", {"matricule": matricule, "password": "Sigrh-Dev-2026"}, format="json").json()["token"]
    return {"HTTP_AUTHORIZATION": f"Token {jeton}"}


def _png(couleur=(200, 30, 30)):
    tampon = io.BytesIO()
    Image.new("RGB", (64, 64), couleur).save(tampon, format="PNG")
    return SimpleUploadedFile("logo.png", tampon.getvalue(), content_type="image/png")


def test_le_logo_de_la_structure_se_change_et_se_retire(api, settings, tmp_path):
    settings.MEDIA_ROOT = str(tmp_path)
    auth = _auth(api)
    assert api.get("/api/v1/public/identite/").json() == {"logo_url": ""}
    faux = SimpleUploadedFile("logo.png", b"pas une image", content_type="image/png")
    assert api.post("/api/v1/parametres/logo/", {"fichier": faux}, **auth).status_code == 400
    assert api.post("/api/v1/parametres/logo/", {"fichier": SimpleUploadedFile("logo.gif", b"GIF89a", content_type="image/gif")}, **auth).status_code == 400
    assert api.post("/api/v1/parametres/logo/", {}, **auth).status_code == 400
    # Sans habilitation, aucun changement.
    assert api.post("/api/v1/parametres/logo/", {"fichier": _png()}, **_auth(api, "318490K")).status_code == 403

    depose = api.post("/api/v1/parametres/logo/", {"fichier": _png()}, **auth)
    assert depose.status_code == 200 and depose.json()["logo_url"]
    assert api.get("/api/v1/public/identite/").json()["logo_url"] == depose.json()["logo_url"]
    # Les documents officiels portent le nouveau logo.
    rapport = api.get("/api/v1/dashboard/rapport/", **auth)
    assert rapport.status_code == 200 and rapport.content.startswith(b"%PDF")

    remplace = api.post("/api/v1/parametres/logo/", {"fichier": _png((10, 10, 200))}, **auth)
    assert remplace.json()["logo_url"] != depose.json()["logo_url"] or remplace.json()["logo_url"]
    retire = api.delete("/api/v1/parametres/logo/retirer/", **auth)
    assert retire.status_code == 200 and retire.json()["logo_url"] == ""
    assert not ParametresMinistere.objects.get(pk=1).logo


def test_les_emplois_de_la_fonction_publique_se_chargent_comme_reference(api):
    auth = _auth(api)
    resume = api.get("/api/v1/parametres/", **auth).json()["referentiel"]
    assert resume["emplois_fonction_publique"] == EmploiReferentiel.objects.filter(source="fonction_publique").count() > 0
    modele = api.get("/api/v1/parametres/emplois/modele/", **auth)
    assert modele.status_code == 200 and "modele-emplois-fonction-publique" in modele["Content-Disposition"]
    vide = api.post("/api/v1/parametres/emplois/import/", {"fichier": SimpleUploadedFile("m.xlsx", modele.content)}, **auth)
    assert vide.status_code == 400

    classeur = _xlsx({
        "Grades": [["Code", "Catégorie", "Définition", "En vigueur"], ["A9", "A", "Grade de test", "oui"]],
        "Emplois": [["Nom", "Famille", "Grade"], ["Analyste de la dotation", "Administratif et juridique", "A9"]],
    })
    cree = api.post("/api/v1/parametres/emplois/import/", {"fichier": SimpleUploadedFile("emplois.xlsx", classeur)}, **auth)
    assert cree.status_code == 200 and cree.json()["crees"] == 2
    emploi = EmploiReferentiel.objects.get(libelle="Analyste de la dotation")
    assert emploi.source == "fonction_publique" and emploi.grade.code == "A9"
    # Les besoins s'expriment ensuite sur cet emploi.
    assert any(e["libelle"] == "Analyste de la dotation" for e in api.get("/api/v1/nomenclature/", **auth).json()["emplois"])
    # Tout ou rien : une ligne incorrecte n'enregistre rien.
    faux = _xlsx({"Emplois": [["Nom", "Famille", "Grade"], ["Emploi sans grade connu", "Administratif et juridique", "Z99"]]})
    refus = api.post("/api/v1/parametres/emplois/import/", {"fichier": SimpleUploadedFile("emplois.xlsx", faux)}, **auth)
    assert refus.status_code == 400 and refus.json()["erreurs"]
    assert not EmploiReferentiel.objects.filter(libelle="Emploi sans grade connu").exists()
    assert api.post("/api/v1/parametres/emplois/import/", {"fichier": SimpleUploadedFile("e.xlsx", classeur)}, **_auth(api, "318490K")).status_code == 403
    # Un emploi ajouté à la main reste distingué.
    manuel = api.post("/api/v1/emplois/", {"libelle": "Emploi maison", "famille": "administratif", "grade": "A9"}, format="json", **auth)
    assert manuel.status_code == 201 and manuel.json()["source"] == "ministere"
