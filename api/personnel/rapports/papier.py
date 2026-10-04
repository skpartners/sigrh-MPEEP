"""Papier à en-tête du ministère, commun aux rapports ReportLab."""

from contextvars import ContextVar
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from .auteur import auteur_courant

from reportlab.lib.colors import Color, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageTemplate, Paragraph

LOGO = Path(__file__).resolve().parents[3] / "client" / "public" / "logo.png"

LARGEUR, HAUTEUR = A4
MARGE_X = 16 * mm
MARGE_HAUT = 12 * mm
MARGE_BAS = 14.5 * mm
COLONNE = LARGEUR - 2 * MARGE_X
_COLONNE_ACTIVE: ContextVar[float] = ContextVar("colonne_pdf", default=COLONNE)
_LOGO_PAGE: bytes | None = None

GABARITS = {
    "lettre": {"pagesize": A4, "marge_x": 16 * mm, "marge_haut": 12 * mm, "marge_bas": 14.5 * mm},
    "note": {"pagesize": A4, "marge_x": 20 * mm, "marge_haut": 16 * mm, "marge_bas": 18 * mm},
    "extrait": {"pagesize": A4, "marge_x": 18 * mm, "marge_haut": 16 * mm, "marge_bas": 18 * mm},
    "bulletin": {"pagesize": A4, "marge_x": 16 * mm, "marge_haut": 26 * mm, "marge_bas": 16 * mm},
    "releve": {"pagesize": A4, "marge_x": 14 * mm, "marge_haut": 14 * mm, "marge_bas": 16 * mm},
    "social": {"pagesize": A4, "marge_x": 16 * mm, "marge_haut": 24 * mm, "marge_bas": 16 * mm},
    "consultation": {"pagesize": A4, "marge_x": 18 * mm, "marge_haut": 18 * mm, "marge_bas": 16 * mm},
    "etat": {"pagesize": A4, "marge_x": 18 * mm, "marge_haut": 14 * mm, "marge_bas": 16 * mm},
    "assiduite": {"pagesize": A4, "marge_x": 16 * mm, "marge_haut": 26 * mm, "marge_bas": 16 * mm},
    "registre": {"pagesize": landscape(A4), "marge_x": 12 * mm, "marge_haut": 14 * mm, "marge_bas": 14 * mm},
    "plan": {"pagesize": landscape(A4), "marge_x": 12 * mm, "marge_haut": 22 * mm, "marge_bas": 14 * mm},
    "observatoire": {"pagesize": landscape(A4), "marge_x": 12 * mm, "marge_haut": 24 * mm, "marge_bas": 14 * mm},
    "pilotage": {"pagesize": A4, "marge_x": 16 * mm, "marge_haut": 28 * mm, "marge_bas": 16 * mm},
}

VERT = Color(0, 68 / 255, 40 / 255)
VERT_DOUX = Color(10 / 255, 94 / 255, 58 / 255)
VERT_DRAPEAU = Color(0, 154 / 255, 68 / 255)
ORANGE = Color(158 / 255, 67 / 255, 0)
ORANGE_DRAPEAU = Color(1, 130 / 255, 0)
ENCRE = Color(11 / 255, 28 / 255, 48 / 255)
ENCRE_DOUCE = Color(63 / 255, 73 / 255, 66 / 255)
FILET = Color(197 / 255, 208 / 255, 200 / 255)
FOND_VERT = Color(244 / 255, 248 / 255, 245 / 255)
FOND_ORANGE = Color(255 / 255, 248 / 255, 243 / 255)

MOIS = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)
JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


def date_longue(quand: date) -> str:
    return f"{quand.day} {MOIS[quand.month - 1]} {quand.year}"


def date_heure(quand) -> str:
    """Date et heure en toutes lettres, à partir d'un datetime déjà local."""
    heure = f"{quand.hour}\u00a0h\u00a0{quand.minute:02d}"
    return f"{JOURS[quand.weekday()]} {quand.day} {MOIS[quand.month - 1]} {quand.year}, à {heure}"


def xml(texte: str) -> str:
    return escape(texte or "").replace("\n", "<br/>")


def paragraphe(texte: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(xml(texte), style)


def styles() -> dict[str, ParagraphStyle]:
    base = dict(fontName="Times-Roman", textColor=ENCRE)
    return {
        "republique": ParagraphStyle(
            "republique", fontName="Times-Bold", fontSize=11, leading=13, textColor=VERT,
        ),
        "devise": ParagraphStyle(
            "devise", fontName="Times-Italic", fontSize=8, leading=10, textColor=ENCRE_DOUCE,
        ),
        "ministere": ParagraphStyle(
            "ministere", fontName="Times-Bold", fontSize=8.5, leading=11, textColor=ENCRE,
        ),
        "service": ParagraphStyle(
            "service", fontName="Times-Roman", fontSize=8, leading=10.5, textColor=ENCRE_DOUCE,
        ),
        "lieu": ParagraphStyle(
            "lieu", fontName="Times-Italic", fontSize=10, leading=13, textColor=ENCRE, alignment=TA_RIGHT,
        ),
        "kicker": ParagraphStyle(
            "kicker", fontName="Times-Bold", fontSize=8, leading=10, textColor=ORANGE,
            alignment=TA_CENTER,
        ),
        "titre": ParagraphStyle(
            "titre", fontName="Times-Bold", fontSize=16, leading=18, textColor=VERT, alignment=TA_CENTER,
        ),
        "sous_titre": ParagraphStyle(
            "sous_titre", fontName="Times-Italic", fontSize=10, leading=13, textColor=ENCRE_DOUCE, alignment=TA_CENTER,
        ),
        "sous_titre_gauche": ParagraphStyle(
            "sous_titre_gauche", fontName="Times-Italic", fontSize=10, leading=13, textColor=ENCRE_DOUCE, alignment=TA_LEFT,
        ),
        "centre_vert": ParagraphStyle(
            "centre_vert", fontName="Times-Bold", fontSize=11, leading=13, textColor=VERT, alignment=TA_CENTER,
        ),
        "centre_ministere": ParagraphStyle(
            "centre_ministere", fontName="Times-Bold", fontSize=8, leading=10.5, textColor=ENCRE, alignment=TA_CENTER,
        ),
        "centre_doux": ParagraphStyle(
            "centre_doux", fontName="Times-Roman", fontSize=8, leading=10.5, textColor=ENCRE_DOUCE, alignment=TA_CENTER,
        ),
        "centre_italic": ParagraphStyle(
            "centre_italic", fontName="Times-Italic", fontSize=8, leading=10.5, textColor=ENCRE_DOUCE, alignment=TA_CENTER,
        ),
        "centre_titre": ParagraphStyle(
            "centre_titre", fontName="Times-Bold", fontSize=16, leading=19, textColor=VERT, alignment=TA_CENTER,
        ),
        "titre_gauche": ParagraphStyle(
            "titre_gauche", fontName="Times-Bold", fontSize=15, leading=18, textColor=VERT, alignment=TA_LEFT,
        ),
        "kicker_gauche": ParagraphStyle(
            "kicker_gauche", fontName="Times-Bold", fontSize=8, leading=10, textColor=ORANGE, alignment=TA_LEFT,
        ),
        "reference": ParagraphStyle(
            "reference", fontName="Times-Bold", fontSize=10, leading=13, textColor=VERT,
        ),
        "badge": ParagraphStyle(
            "badge", fontName="Times-Bold", fontSize=7.5, leading=9, textColor=ORANGE, alignment=TA_CENTER,
        ),
        "corps": ParagraphStyle("corps", **base, fontSize=10, leading=13.2, alignment=TA_JUSTIFY),
        "label": ParagraphStyle(
            "label", fontName="Times-Bold", fontSize=8, leading=10, textColor=VERT_DOUX,
        ),
        "valeur": ParagraphStyle("valeur", **base, fontSize=10, leading=13),
        "valeur_forte": ParagraphStyle(
            "valeur_forte", fontName="Times-Bold", fontSize=11, leading=14, textColor=ENCRE,
        ),
        "section": ParagraphStyle(
            "section", fontName="Times-Bold", fontSize=9, leading=12, textColor=VERT,
        ),
        "appel_titre": ParagraphStyle(
            "appel_titre", fontName="Times-Bold", fontSize=9, leading=12, textColor=ORANGE,
        ),
        "appel": ParagraphStyle("appel", **base, fontSize=9.5, leading=12.5, alignment=TA_JUSTIFY),
        "signature_date": ParagraphStyle(
            "signature_date", fontName="Times-Italic", fontSize=10, leading=13, alignment=TA_RIGHT, textColor=ENCRE,
        ),
        "signature": ParagraphStyle(
            "signature", fontName="Times-Roman", fontSize=10, leading=13, alignment=TA_RIGHT, textColor=ENCRE,
        ),
        "signature_forte": ParagraphStyle(
            "signature_forte", fontName="Times-Bold", fontSize=10, leading=13, alignment=TA_RIGHT, textColor=VERT,
        ),
        "pied": ParagraphStyle(
            "pied", fontName="Times-Roman", fontSize=7.5, leading=9, textColor=ENCRE_DOUCE,
        ),
        "pied_droit": ParagraphStyle(
            "pied_droit", fontName="Times-Roman", fontSize=7.5, leading=9, textColor=ENCRE_DOUCE, alignment=TA_RIGHT,
        ),
    }


def largeur() -> float:
    return _COLONNE_ACTIVE.get()


def fixer_colonne(valeur: float):
    return _COLONNE_ACTIVE.set(valeur)


def relacher_colonne(jeton) -> None:
    _COLONNE_ACTIVE.reset(jeton)


def armoiries(cote: float = 16 * mm, align: str = "LEFT") -> Image:
    """Armoiries de la République, le logo servi par l'application."""
    from io import BytesIO

    from PIL import Image as ImagePIL

    source = ImagePIL.open(LOGO).convert("RGBA")
    source.thumbnail((360, 360), ImagePIL.Resampling.LANCZOS)
    tampon = BytesIO()
    source.save(tampon, format="PNG")
    tampon.seek(0)
    return Image(tampon, width=cote, height=cote, kind="proportional", mask="auto", hAlign=align, lazy=0)


def _logo_page(canvas, x: float, y: float, cote: float) -> None:
    from io import BytesIO

    from PIL import Image as ImagePIL
    from reportlab.lib.utils import ImageReader

    global _LOGO_PAGE
    if _LOGO_PAGE is None:
        source = ImagePIL.open(LOGO).convert("RGBA")
        source.thumbnail((240, 240), ImagePIL.Resampling.LANCZOS)
        tampon = BytesIO()
        source.save(tampon, format="PNG")
        _LOGO_PAGE = tampon.getvalue()
    canvas.drawImage(
        ImageReader(BytesIO(_LOGO_PAGE)), x, y, cote, cote,
        mask="auto", preserveAspectRatio=True, anchor="c",
    )


def _pied(canvas, doc) -> None:
    largeur_page, _hauteur = doc.pagesize
    colonne = doc.colonne
    mention = getattr(doc, "mention", "document officiel")
    reference = getattr(doc, "reference", "")
    edition = getattr(doc, "edition", "")
    auteur = auteur_courant()
    texte_gauche = f"SIGRH · MPEEP · {xml(mention)}"
    if auteur:
        texte_gauche += f"<br/><font name='Times-Italic' size='6.5'>Compte {xml(auteur)}</font>"
    gauche = Paragraph(texte_gauche, styles()["pied"])
    droite = Paragraph(f"{xml(reference)} · {xml(edition)} · page {doc.page}", styles()["pied_droit"])
    largeur_gauche = colonne * 0.62
    _largeur, hauteur = gauche.wrap(largeur_gauche, 10 * mm)
    _largeur_droite, hauteur_droite = droite.wrap(colonne * 0.38, 8 * mm)
    filet = 16 * mm if doc.gabarit == "extrait" else 12 * mm
    bas = max(filet - 1.3 * mm - hauteur, 3.4 * mm)
    gauche.drawOn(canvas, doc.marge_x, bas)
    droite.drawOn(canvas, doc.marge_x + largeur_gauche, bas + hauteur - hauteur_droite)
    canvas.setStrokeColor(VERT)
    canvas.setLineWidth(0.5)
    canvas.line(doc.marge_x, filet, largeur_page - doc.marge_x, filet)


def _suite(canvas, doc) -> None:
    if doc.page < 2 or doc.gabarit != "lettre":
        return
    colonne = doc.colonne
    suite = Paragraph(f"{xml(doc.suite)} {xml(doc.reference)} — suite", styles()["service"])
    suite.wrap(colonne, 8 * mm)
    suite.drawOn(canvas, doc.marge_x, doc.pagesize[1] - doc.marge_haut + 1 * mm)


def _bandeau(canvas, doc, fond, filet, encre=white) -> None:
    largeur_page, hauteur = doc.pagesize
    bande = 16 * mm
    canvas.setFillColor(fond)
    canvas.rect(0, hauteur - bande, largeur_page, bande, stroke=0, fill=1)
    canvas.setFillColor(filet)
    canvas.rect(0, hauteur - bande - 1.6 * mm, largeur_page, 1.6 * mm, stroke=0, fill=1)
    _logo_page(canvas, doc.marge_x, hauteur - bande + 2.6 * mm, 11 * mm)
    canvas.setFillColor(encre)
    canvas.setFont("Times-Bold", 12)
    canvas.drawString(doc.marge_x + 14 * mm, hauteur - 8 * mm, doc.bandeau or doc.suite)
    canvas.setFont("Times-Italic", 8)
    canvas.drawRightString(largeur_page - doc.marge_x, hauteur - 8 * mm, doc.edition)
    if doc.page > 1:
        canvas.setFont("Times-Roman", 8)
        canvas.drawString(doc.marge_x + 14 * mm, hauteur - 13 * mm, "suite")


def _dessiner_page(canvas, doc) -> None:
    canvas.saveState()
    largeur_page, hauteur = doc.pagesize
    gabarit = doc.gabarit
    if gabarit == "lettre":
        canvas.setFillColor(ORANGE_DRAPEAU)
        canvas.rect(0, hauteur - 3.2 * mm, largeur_page, 3.2 * mm, stroke=0, fill=1)
        canvas.setFillColor(VERT_DRAPEAU)
        canvas.rect(0, hauteur - 5 * mm, largeur_page, 1.4 * mm, stroke=0, fill=1)
        canvas.setFillColor(ORANGE)
        canvas.rect(0, 0, 3 * mm, hauteur, stroke=0, fill=1)
    elif gabarit == "note":
        canvas.setFillColor(ORANGE_DRAPEAU)
        canvas.rect(0, hauteur - 18 * mm, 3 * mm, 18 * mm, stroke=0, fill=1)
        canvas.setFillColor(VERT_DRAPEAU)
        canvas.rect(3 * mm, hauteur - 18 * mm, 1.3 * mm, 18 * mm, stroke=0, fill=1)
    elif gabarit == "extrait":
        inset = 8 * mm
        canvas.setStrokeColor(VERT)
        canvas.setLineWidth(1.15)
        canvas.rect(inset, inset, largeur_page - 2 * inset, hauteur - 2 * inset, stroke=1, fill=0)
        canvas.setStrokeColor(ORANGE_DRAPEAU)
        canvas.setLineWidth(0.45)
        canvas.rect(inset + 1.5 * mm, inset + 1.5 * mm, largeur_page - 2 * inset - 3 * mm, hauteur - 2 * inset - 3 * mm, stroke=1, fill=0)
    elif gabarit == "bulletin":
        _bandeau(canvas, doc, VERT, ORANGE_DRAPEAU)
    elif gabarit == "pilotage":
        _bandeau(canvas, doc, VERT, ORANGE_DRAPEAU)
    elif gabarit == "social":
        _bandeau(canvas, doc, ORANGE, VERT)
    elif gabarit == "plan":
        _bandeau(canvas, doc, ORANGE_DRAPEAU, VERT, ENCRE)
    elif gabarit == "observatoire":
        _bandeau(canvas, doc, VERT, white)
    elif gabarit == "assiduite":
        _bandeau(canvas, doc, VERT_DOUX, ORANGE_DRAPEAU)
    elif gabarit == "releve":
        canvas.setFillColor(ORANGE_DRAPEAU)
        canvas.rect(0, hauteur - 2.2 * mm, largeur_page, 2.2 * mm, stroke=0, fill=1)
        canvas.setFillColor(VERT)
        canvas.rect(0, 0, largeur_page, 4 * mm, stroke=0, fill=1)
    elif gabarit == "registre":
        canvas.setFillColor(VERT)
        canvas.rect(0, hauteur - 3 * mm, largeur_page, 3 * mm, stroke=0, fill=1)
        canvas.setFillColor(FOND_VERT)
        canvas.rect(0, 0, largeur_page, 11 * mm, stroke=0, fill=1)
    elif gabarit == "etat":
        canvas.setFillColor(VERT)
        canvas.rect(0, 0, 7 * mm, hauteur, stroke=0, fill=1)
        canvas.setFillColor(ORANGE_DRAPEAU)
        canvas.rect(7 * mm, 0, 1.2 * mm, hauteur, stroke=0, fill=1)
        canvas.saveState()
        canvas.setFillColor(white)
        canvas.setFont("Times-Bold", 8)
        canvas.translate(4.6 * mm, 16 * mm)
        canvas.rotate(90)
        canvas.drawString(0, 0, doc.bandeau or "RAPPORT")
        canvas.restoreState()
    elif gabarit == "consultation":
        canvas.setStrokeColor(VERT)
        canvas.setLineWidth(1.6)
        canvas.line(doc.marge_x, hauteur - 10 * mm, largeur_page - doc.marge_x, hauteur - 10 * mm)
        canvas.setStrokeColor(ORANGE_DRAPEAU)
        canvas.setLineWidth(0.8)
        canvas.line(doc.marge_x, hauteur - 12 * mm, doc.marge_x + 42 * mm, hauteur - 12 * mm)
    _suite(canvas, doc)
    _pied(canvas, doc)
    canvas.restoreState()


def document(
    tampon,
    reference: str,
    edition: str,
    *,
    titre: str = "",
    sujet: str = "",
    mention: str = "document officiel",
    suite: str = "Document",
    gabarit: str = "lettre",
    bandeau: str = "",
) -> BaseDocTemplate:
    regle = GABARITS[gabarit]
    largeur_page, hauteur = regle["pagesize"]
    colonne = largeur_page - 2 * regle["marge_x"]
    cadre = Frame(
        regle["marge_x"], regle["marge_bas"], colonne, hauteur - regle["marge_haut"] - regle["marge_bas"],
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, showBoundary=0,
    )
    doc = BaseDocTemplate(
        tampon,
        pagesize=regle["pagesize"],
        title=titre or reference,
        author="SIGRH — Ministère du Portefeuille de l'État et des Entreprises Publiques",
        subject=sujet or titre or reference,
    )
    doc.reference = reference
    doc.edition = edition
    doc.mention = mention
    doc.suite = suite
    doc.gabarit = gabarit
    doc.bandeau = bandeau
    doc.colonne = colonne
    doc.marge_x = regle["marge_x"]
    doc.marge_haut = regle["marge_haut"]
    doc.pageCompression = 0
    doc.addPageTemplates([PageTemplate(id=gabarit, frames=[cadre], onPage=_dessiner_page)])
    return doc
