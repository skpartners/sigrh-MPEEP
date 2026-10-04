import io
import zipfile
from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APIClient

from personnel.statistiques import _xlsx

pytestmark = pytest.mark.django_db

ENTETES = [
    "Matricule",
    "Structure",
    "Direction",
    "Grade",
    "Échelon",
    "Catégorie",
    "Positions",
    "Fonction",
    "Date de prise de service dans le ministère",
]


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


def _fichier(contenu: bytes, nom="dossiers.xlsx"):
    return SimpleUploadedFile(
        nom,
        contenu,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def test_import_exige_une_session(api):
    assert api.get("/api/v1/agents/import/modele/").status_code == 401
    assert api.post("/api/v1/agents/import/", {}).status_code == 401


def test_modele_decrit_les_colonnes_et_les_structures(api):
    auth = _auth(api)
    modele = api.get("/api/v1/agents/import/modele/", **auth)
    assert modele.status_code == 200
    assert modele["Content-Type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert "modele-dossiers-agents.xlsx" in modele["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(modele.content)) as archive:
        classeur = archive.read("xl/workbook.xml").decode()
        agents = archive.read("xl/worksheets/sheet1.xml").decode()
    assert "Agents" in classeur and "Consignes" in classeur and "Structures" in classeur
    assert "Matricule" in agents
    assert "Date de prise de service dans la fonction" in agents

    vide = api.post("/api/v1/agents/import/", {"fichier": _fichier(modele.content)}, **auth)
    assert vide.status_code == 400
    assert "aucune donnée" in vide.json()["detail"]


def test_import_met_a_jour_plusieurs_agents_sans_ecraser_les_cellules_vides(api):
    from personnel.models import Agent

    auth = _auth(api)
    koffi = Agent.objects.get(matricule="349812K")
    fonction = koffi.fonction
    contenu = _xlsx(
        {
            "Agents": [
                ENTETES,
                ["349812K", "DGPE", "Direction des Ressources Humaines", "A3", 2, "Catégorie B", "Détachement", "", "01/10/2018"],
                ["288103A", "dgpe", "Direction du Budget", "A4", "1", "A", "En activité", "Chargé d'études", 43374],
            ]
        }
    )
    reponse = api.post("/api/v1/agents/import/", {"fichier": _fichier(contenu)}, **auth)
    assert reponse.status_code == 200
    assert reponse.json()["mis_a_jour"] == 2

    koffi.refresh_from_db()
    assert koffi.direction == "Direction des Ressources Humaines"
    assert koffi.grade == "A3"
    assert koffi.echelon == "2"
    assert koffi.categorie == "B"
    assert koffi.situation == "Détachement"
    assert koffi.fonction == fonction
    assert koffi.organisme.code == "dgpe"
    assert koffi.prise_service_ministere == date(2018, 10, 1)

    autre = Agent.objects.get(matricule="288103A")
    assert autre.direction == "Direction du Budget"
    assert autre.fonction == "Chargé d'études"
    assert autre.prise_service_ministere == date(2018, 10, 1)


def test_une_ligne_invalide_n_enregistre_rien(api):
    from personnel.models import Agent

    auth = _auth(api)
    avant = Agent.objects.get(matricule="349812K").situation
    contenu = _xlsx(
        {
            "Agents": [
                ["Matricule", "Positions", "Grade"],
                ["349812K", "Disponibilité", "A2"],
                ["288103A", "En activité", "X" * 41],
            ]
        }
    )
    reponse = api.post("/api/v1/agents/import/", {"fichier": _fichier(contenu)}, **auth)
    assert reponse.status_code == 400
    corps = reponse.json()
    assert "Aucune modification" in corps["detail"]
    assert corps["erreurs"][0]["ligne"] == 3
    assert Agent.objects.get(matricule="349812K").situation == avant


def test_matricule_inconnu_structure_inconnue_et_doublon(api):
    auth = _auth(api)
    contenu = _xlsx(
        {
            "Agents": [
                ["Matricule", "Structure", "Positions"],
                ["INCONNU", "DGPE", "En activité"],
                ["349812K", "STRUCTURE-ABSENTE", "En activité"],
                ["349812K", "DGPE", "Détachement"],
            ]
        }
    )
    reponse = api.post("/api/v1/agents/import/", {"fichier": _fichier(contenu)}, **auth)
    assert reponse.status_code == 400
    messages = [item["message"] for item in reponse.json()["erreurs"]]
    assert any("INCONNU" in message for message in messages)
    assert any("STRUCTURE-ABSENTE" in message for message in messages)
    assert any("déjà présent" in message for message in messages)


def test_colonne_inconnue_et_fichier_illisible(api):
    auth = _auth(api)
    inconnu = api.post(
        "/api/v1/agents/import/",
        {"fichier": _fichier(_xlsx({"Agents": [["Matricule", "Commentaire"], ["349812K", "note"]]}))},
        **auth,
    )
    assert inconnu.status_code == 400
    assert "Commentaire" in inconnu.json()["detail"]

    illisible = api.post("/api/v1/agents/import/", {"fichier": _fichier(b"pas un classeur")}, **auth)
    assert illisible.status_code == 400
    assert "xlsx" in illisible.json()["detail"]


def test_chaines_partagees_comme_un_classeur_excel(api):
    from personnel.models import Agent

    auth = _auth(api)
    contenu = _classeur_chaines_partagees(
        [
            ["Matricule", "Direction"],
            ["349812K", "Direction des Systèmes d'Information"],
        ]
    )
    reponse = api.post("/api/v1/agents/import/", {"fichier": _fichier(contenu)}, **auth)
    assert reponse.status_code == 200
    assert Agent.objects.get(matricule="349812K").direction == "Direction des Systèmes d'Information"


def _classeur_chaines_partagees(lignes: list[list[str]]) -> bytes:
    chaines: list[str] = []
    index: dict[str, int] = {}

    def identifiant(texte: str) -> int:
        if texte not in index:
            index[texte] = len(chaines)
            chaines.append(texte)
        return index[texte]

    rows = []
    for y, ligne in enumerate(lignes, start=1):
        cellules = []
        for x, valeur in enumerate(ligne, start=1):
            ref = f"{chr(64 + x)}{y}"
            cellules.append(f'<c r="{ref}" t="s"><v>{identifiant(valeur)}</v></c>')
        rows.append(f'<row r="{y}">{"".join(cellules)}</row>')
    feuille = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(rows)}</sheetData></worksheet>'
    )
    partage = "".join(f"<si><t>{texte}</t></si>" for texte in chaines)
    sst = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"{partage}</sst>"
    )
    fichiers = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Agents" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            "</Relationships>"
        ),
        "xl/worksheets/sheet1.xml": feuille,
        "xl/sharedStrings.xml": sst,
    }
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as archive:
        for nom, contenu in fichiers.items():
            archive.writestr(nom, contenu)
    return tampon.getvalue()
