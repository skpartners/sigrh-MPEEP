"""Classeurs Excel colorés partagés par les exports et les modèles d'import."""

import io
import zipfile
from datetime import date, datetime
from decimal import Decimal

_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def habiller(feuilles: list[dict]) -> bytes:
    rendus = {}
    for index, feuille in enumerate(feuilles):
        rendus[feuille["nom"]] = _feuille(feuille, premiere=index == 0)
    return _assembler(rendus)


def _feuille(feuille: dict, *, premiere: bool) -> str:
    lignes = feuille["lignes"]
    entete = ["" if cellule is None else cellule for cellule in lignes[0]]
    corps = lignes[1:]
    saisies = int(feuille.get("saisies") or 0)
    largeur = max((len(ligne) for ligne in lignes), default=len(entete))
    largeur = max(largeur, 1)
    entete = _pad(entete, largeur)
    onglet = feuille.get("onglet") or "FF004428"
    derniere = _lettre(largeur)

    colonnes = []
    for indice in range(largeur):
        valeurs = [ligne[indice] if indice < len(ligne) else "" for ligne in corps]
        colonnes.append(_largeur(entete[indice], valeurs))

    lignes_xml = [
        _ligne(1, 28, [_texte("A", 1, feuille["titre"], 1)]),
        _ligne(2, 18, [_texte("A", 2, feuille["sous_titre"], 2)]),
        _ligne(3, _hauteur(feuille["notice"], sum(colonnes), plancher=18), [_texte("A", 3, feuille["notice"], 3)]),
        _ligne(4, _hauteur_ligne(entete, colonnes, plancher=18), [_texte(_lettre(i + 1), 4, _afficher(cellule), 4) for i, cellule in enumerate(entete)]),
    ]
    for rang, ligne in enumerate(corps, start=5):
        alterne = (rang - 5) % 2 == 1
        lignes_xml.append(_ligne(rang, _hauteur_ligne(_pad(ligne, largeur), colonnes, plancher=18), _cellules(ligne, rang, largeur, alterne)))
    depart = 5 + len(corps)
    for rang in range(depart, depart + saisies):
        alterne = (rang - 5) % 2 == 1
        lignes_xml.append(_ligne(rang, 18, _cellules([""] * largeur, rang, largeur, alterne)))

    fin = max(4, depart + saisies - 1)
    cols = "".join(
        f'<col min="{i}" max="{i}" width="{taille}" customWidth="1"/>' for i, taille in enumerate(colonnes, start=1)
    )
    vue = '<sheetView workbookViewId="0"'
    if premiere:
        vue += ' tabSelected="1"'
    vue += '><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView>'
    fusion = f'<mergeCells count="3"><mergeCell ref="A1:{derniere}1"/><mergeCell ref="A2:{derniere}2"/><mergeCell ref="A3:{derniere}3"/></mergeCells>'
    page = '<pageSetup paperSize="9" fitToWidth="1" fitToHeight="0"'
    if feuille.get("paysage"):
        page += ' orientation="landscape"'
    page += "/>"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{_NS}">'
        f'<sheetPr><tabColor rgb="{onglet}"/><pageSetUpPr fitToPage="1"/></sheetPr>'
        f"<sheetViews>{vue}</sheetViews>"
        f"<cols>{cols}</cols><sheetData>{''.join(lignes_xml)}</sheetData>"
        f'<autoFilter ref="A4:{derniere}{fin}"/>'
        f"{fusion}"
        '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
        f"{page}</worksheet>"
    )


def _cellules(ligne: list, rang: int, largeur: int, alterne: bool) -> list[str]:
    cellules = []
    for indice in range(largeur):
        valeur = ligne[indice] if indice < len(ligne) else ""
        cellules.append(_valeur(_lettre(indice + 1), rang, valeur, alterne))
    return cellules


def _valeur(colonne: str, rang: int, valeur, alterne: bool) -> str:
    ref = f"{colonne}{rang}"
    if valeur is None or valeur == "":
        return f'<c r="{ref}" s="{6 if alterne else 5}"/>'
    if isinstance(valeur, datetime):
        valeur = valeur.date().isoformat()
    elif isinstance(valeur, date):
        valeur = valeur.isoformat()
    if isinstance(valeur, Decimal):
        valeur = float(valeur)
    if isinstance(valeur, bool):
        valeur = "oui" if valeur else "non"
    if isinstance(valeur, int):
        return f'<c r="{ref}" s="{8 if alterne else 7}"><v>{valeur}</v></c>'
    if isinstance(valeur, float):
        if valeur.is_integer():
            return f'<c r="{ref}" s="{8 if alterne else 7}"><v>{int(valeur)}</v></c>'
        return f'<c r="{ref}" s="{10 if alterne else 9}"><v>{valeur}</v></c>'
    return _texte(colonne, rang, _afficher(valeur), 6 if alterne else 5)


def _texte(colonne: str, rang: int, texte: str, style: int) -> str:
    ref = f"{colonne}{rang}"
    if texte == "":
        return f'<c r="{ref}" s="{style}"/>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{_echapper(texte)}</t></is></c>'


def _ligne(rang: int, hauteur: int, cellules: list[str]) -> str:
    return f'<row r="{rang}" ht="{hauteur}" customHeight="1">{"".join(cellules)}</row>'


def _hauteur(texte: str, capacite: int, *, plancher: int = 16) -> int:
    return _depuis_lignes(_compte(texte, capacite), plancher)


def _hauteur_ligne(cellules: list, largeurs: list[int], *, plancher: int = 16) -> int:
    n = 1
    for valeur, largeur in zip(cellules, largeurs):
        n = max(n, _compte(_afficher(valeur), largeur))
    return _depuis_lignes(n, plancher)


def _compte(texte: str, capacite: int) -> int:
    capacite = max(10, int(capacite * 1.15))
    return sum(max(1, (len(morceau) + capacite - 1) // capacite) for morceau in str(texte).split("\n")) or 1


def _depuis_lignes(n: int, plancher: int) -> int:
    return max(plancher, 18 + (n - 1) * 15)


def _afficher(valeur) -> str:
    if valeur is None:
        return ""
    return str(valeur)


def _pad(ligne: list, largeur: int) -> list:
    return [*ligne, *[""] * (largeur - len(ligne))]


def _largeur(entete, valeurs: list) -> int:
    textes = [str(entete)]
    for valeur in valeurs:
        if valeur not in (None, ""):
            textes.append(str(valeur))
    plus = max(len(texte) for texte in textes)
    # Le bouton de filtre couvre la fin d'un libellé trop juste.
    return min(52, max(len(str(entete)) + 8, plus + 2, 16))


def _lettre(indice: int) -> str:
    nom = ""
    while indice:
        indice, reste = divmod(indice - 1, 26)
        nom = chr(65 + reste) + nom
    return nom


def _echapper(valeur: str) -> str:
    return str(valeur).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _assembler(feuilles: dict[str, str]) -> bytes:
    rels = []
    sheets = []
    fichiers = {"xl/styles.xml": _styles()}
    for index, (nom, contenu) in enumerate(feuilles.items(), start=1):
        fichiers[f"xl/worksheets/sheet{index}.xml"] = contenu
        rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
        sheets.append(f'<sheet name="{_echapper(nom)}" sheetId="{index}" r:id="rId{index}"/>')
    rels.append(
        f'<Relationship Id="rId{len(feuilles) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    fichiers["xl/workbook.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheets)}</sheets></workbook>'
    )
    fichiers["xl/_rels/workbook.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels)}</Relationships>'
    )
    feuilles_xml = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, len(feuilles) + 1)
    )
    fichiers["[Content_Types].xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        f"{feuilles_xml}</Types>"
    )
    fichiers["_rels/.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    return _zipper(fichiers)


def _styles() -> str:
    police = "Arial"

    def fonte(taille, *, gras=False, italique=False, couleur="FF0B1C30"):
        marque = "<b/>" if gras else ""
        inclin = "<i/>" if italique else ""
        return f'<font>{marque}{inclin}<sz val="{taille}"/><color rgb="{couleur}"/><name val="{police}"/></font>'

    fonts = "".join([
        fonte(11),
        fonte(18, gras=True, couleur="FFFFFFFF"),
        fonte(11, couleur="FFFFFFFF"),
        fonte(10, italique=True, couleur="FF0B1C30"),
        fonte(10, gras=True, couleur="FFFFFFFF"),
        fonte(10),
    ])

    def aplat(couleur):
        return f'<fill><patternFill patternType="solid"><fgColor rgb="{couleur}"/><bgColor indexed="64"/></patternFill></fill>'

    fills = (
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        + aplat("FF004428") + aplat("FF0A5E3A") + aplat("FFE7F6EE") + aplat("FFF7FBFA")
    )
    trait = (
        '<left style="thin"><color rgb="FFD5E5DC"/></left>'
        '<right style="thin"><color rgb="FFD5E5DC"/></right>'
        '<top style="thin"><color rgb="FFD5E5DC"/></top>'
        '<bottom style="thin"><color rgb="FFD5E5DC"/></bottom>'
    )
    borders = f"<border/>{''.join(f'<border>{trait}</border>' for _ in range(2))}"

    def xf(fonte_id, fill, border=0, horizontal="left", wrap=False, num="0"):
        retour = ' wrapText="1"' if wrap else ""
        nombre = ' applyNumberFormat="1"' if num != "0" else ""
        return (
            f'<xf numFmtId="{num}" fontId="{fonte_id}" fillId="{fill}" borderId="{border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"{nombre}>'
            f'<alignment horizontal="{horizontal}" vertical="center"{retour}/></xf>'
        )

    xfs = "".join([
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        xf(1, 2),
        xf(2, 3),
        xf(3, 4, wrap=True),
        xf(4, 2, 1, "left"),
        xf(5, 0, 1, wrap=True),
        xf(5, 5, 1, wrap=True),
        xf(5, 0, 1, "right", num="164"),
        xf(5, 5, 1, "right", num="164"),
        xf(5, 0, 1, "right", num="165"),
        xf(5, 5, 1, "right", num="165"),
    ])
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<styleSheet xmlns="{_NS}">'
        '<numFmts count="2">'
        '<numFmt numFmtId="164" formatCode="#,##0"/>'
        '<numFmt numFmtId="165" formatCode="#,##0.00"/>'
        "</numFmts>"
        f'<fonts count="6">{fonts}</fonts>'
        f'<fills count="6">{fills}</fills>'
        f'<borders count="3">{borders}</borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        f'<cellXfs count="11">{xfs}</cellXfs>'
        "</styleSheet>"
    )


def _zipper(fichiers: dict[str, str]) -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for nom, contenu in fichiers.items():
            archive.writestr(nom, contenu.encode("utf-8"))
    return tampon.getvalue()
