"""Mise en page commune des actes et rapports officiels."""

from io import BytesIO

from django.utils import timezone
from reportlab.lib.colors import Color, white
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, HRFlowable, Image, Paragraph, Spacer, Table, TableStyle

from .papier import (
    ENCRE,
    FILET,
    FOND_ORANGE,
    FOND_VERT,
    ORANGE,
    VERT,
    armoiries,
    date_longue,
    document,
    fixer_colonne,
    largeur,
    paragraphe,
    relacher_colonne,
    styles,
    xml,
)


def _nu() -> list:
    return [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]


def en_tete(gabarit: str, feuille, edition: str, meta: dict) -> list:
    return {
        "note": _entete_note,
        "extrait": _entete_extrait,
        "bulletin": _entete_sous_bande,
        "pilotage": _entete_sous_bande,
        "social": _entete_sous_bande,
        "plan": _entete_sous_bande,
        "observatoire": _entete_sous_bande,
        "releve": _entete_releve,
        "registre": _entete_registre,
        "etat": _entete_etat,
        "assiduite": _entete_sous_bande,
        "consultation": _entete_consultation,
    }[gabarit](feuille, edition, meta)


def _entete_note(feuille, edition: str, meta: dict) -> list:
    large = largeur()
    bloc = Table([
        [armoiries(14 * mm, "CENTER")],
        [paragraphe("RÉPUBLIQUE DE CÔTE D'IVOIRE", feuille["centre_vert"])],
        [paragraphe("Union – Discipline – Travail", feuille["centre_italic"])],
        [paragraphe("Ministère du Portefeuille de l'État et des Entreprises Publiques", feuille["centre_doux"])],
        [paragraphe("Direction des ressources humaines", feuille["centre_doux"])],
    ], colWidths=[large])
    bloc.setStyle(TableStyle([*_nu(), ("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    marque = meta.get("badge", "")
    ligne = Table(
        [[
            paragraphe((meta.get("kicker") or "Publication").upper(), feuille["kicker_gauche"]),
            paragraphe("" if marque == "OFFICIEL" else marque, feuille["lieu"]),
        ]],
        colWidths=[large * 0.72, large * 0.28],
    )
    ligne.setStyle(TableStyle(_nu()))
    return [
        bloc,
        Spacer(1, 2 * mm),
        HRFlowable(width=large, thickness=0.7, color=VERT, spaceBefore=0, spaceAfter=0),
        Spacer(1, 4 * mm),
        ligne,
        paragraphe(meta["titre_affiche"], feuille["titre_gauche"]),
        Spacer(1, 1 * mm),
        paragraphe(meta.get("sous_titre", ""), feuille["sous_titre_gauche"]),
        Spacer(1, 1.2 * mm),
        paragraphe(f"Abidjan, le {edition}", feuille["lieu"]),
        Spacer(1, 4 * mm),
    ]


def _entete_extrait(feuille, edition: str, meta: dict) -> list:
    large = largeur()
    tete = Table([
        [armoiries(15 * mm, "CENTER")],
        [paragraphe("RÉPUBLIQUE DE CÔTE D'IVOIRE", feuille["centre_vert"])],
        [paragraphe("Union – Discipline – Travail", feuille["centre_italic"])],
        [paragraphe("MINISTÈRE DU PORTEFEUILLE DE L'ÉTAT", feuille["centre_ministere"])],
        [paragraphe("ET DES ENTREPRISES PUBLIQUES", feuille["centre_ministere"])],
        [paragraphe(meta.get("detail") or "", feuille["centre_doux"])],
    ], colWidths=[large])
    tete.setStyle(TableStyle([*_nu(), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 1), (-1, -1), 0.4 * mm)]))
    cartouche = Table([
        [paragraphe(meta["titre_affiche"], feuille["centre_titre"])],
        [paragraphe(meta.get("sous_titre", ""), feuille["centre_italic"])],
        [paragraphe(f"Réf. {meta.get('reference', '')}", feuille["centre_vert"])],
        [paragraphe(f"Abidjan, le {edition}", feuille["centre_doux"])],
    ], colWidths=[large * 0.78])
    cartouche.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 0.9, VERT),
        ("LINEABOVE", (0, 2), (-1, 2), 0.4, ORANGE),
        ("BACKGROUND", (0, 0), (-1, -1), FOND_VERT),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.4 * mm),
    ]))
    enveloppe = Table([[cartouche]], colWidths=[large])
    enveloppe.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), *_nu()]))
    return [tete, Spacer(1, 3 * mm), enveloppe, Spacer(1, 3 * mm)]


def _entete_sous_bande(feuille, _edition: str, meta: dict) -> list:
    return [
        paragraphe(meta.get("sous_titre", ""), feuille["sous_titre_gauche"]),
        paragraphe(f"Réf. {meta.get('reference', '')}", feuille["reference"]),
        Spacer(1, 3.5 * mm),
    ]


def _entete_releve(feuille, edition: str, meta: dict) -> list:
    large = largeur()
    identite = [
        paragraphe(meta["titre_affiche"], feuille["titre_gauche"]),
        paragraphe(meta.get("sous_titre", ""), feuille["sous_titre_gauche"]),
        paragraphe(meta.get("detail") or "", feuille["service"]),
    ]
    ligne = Table(
        [[armoiries(12 * mm), identite, paragraphe(f"Abidjan, le {edition}", feuille["lieu"])]],
        colWidths=[16 * mm, large - 62 * mm, 46 * mm],
    )
    ligne.setStyle(TableStyle([*_nu(), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("RIGHTPADDING", (0, 0), (0, 0), 3 * mm)]))
    return [
        ligne,
        Spacer(1, 1.5 * mm),
        HRFlowable(width=large, thickness=1.3, color=ORANGE, spaceBefore=0, spaceAfter=0),
        Spacer(1, 3.5 * mm),
    ]


def _entete_registre(feuille, edition: str, meta: dict) -> list:
    large = largeur()
    ligne = Table(
        [[
            armoiries(11 * mm),
            [
                paragraphe(meta["titre_affiche"], feuille["titre_gauche"]),
                paragraphe(meta.get("sous_titre", ""), feuille["service"]),
            ],
            [
                paragraphe(meta.get("reference", ""), feuille["lieu"]),
                paragraphe(f"Abidjan, le {edition}", feuille["lieu"]),
            ],
        ]],
        colWidths=[14 * mm, large - 62 * mm, 48 * mm],
    )
    ligne.setStyle(TableStyle([*_nu(), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("RIGHTPADDING", (0, 0), (0, 0), 2 * mm)]))
    return [ligne, Spacer(1, 2 * mm)]


def _entete_etat(feuille, edition: str, meta: dict) -> list:
    large = largeur()
    gauche = [
        paragraphe("MINISTÈRE DU PORTEFEUILLE DE L'ÉTAT", feuille["ministere"]),
        paragraphe("ET DES ENTREPRISES PUBLIQUES", feuille["ministere"]),
        paragraphe(meta.get("detail") or "Direction des ressources humaines", feuille["service"]),
        Spacer(1, 2.4 * mm),
        paragraphe(meta["titre_affiche"], feuille["titre_gauche"]),
        paragraphe(meta.get("sous_titre", ""), feuille["sous_titre_gauche"]),
    ]
    droite = [
        armoiries(16 * mm, "RIGHT"),
        Spacer(1, 1 * mm),
        paragraphe(f"Réf. {meta.get('reference', '')}", feuille["lieu"]),
        paragraphe(f"Abidjan, le {edition}", feuille["lieu"]),
    ]
    ligne = Table([[gauche, droite]], colWidths=[large * 0.72, large * 0.28])
    ligne.setStyle(TableStyle([
        *_nu(),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, VERT),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
    ]))
    return [ligne, Spacer(1, 4 * mm)]


def _entete_consultation(feuille, edition: str, meta: dict) -> list:
    large = largeur()
    ligne = Table(
        [[
            [
                paragraphe("COMPTE RENDU", feuille["kicker_gauche"]),
                paragraphe(meta["titre_affiche"], feuille["titre_gauche"]),
                paragraphe(meta.get("sous_titre", ""), feuille["sous_titre_gauche"]),
            ],
            armoiries(14 * mm, "RIGHT"),
        ]],
        colWidths=[large - 22 * mm, 22 * mm],
    )
    ligne.setStyle(TableStyle([*_nu(), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return [
        ligne,
        Spacer(1, 2 * mm),
        paragraphe(f"Abidjan, le {edition} · réf. {meta.get('reference', '')}", feuille["service"]),
        Spacer(1, 4 * mm),
    ]


def section(feuille, titre: str) -> list:
    return [paragraphe(titre.upper(), feuille["section"]), Spacer(1, 1.4 * mm)]


def texte(feuille, contenu: str) -> list:
    return [paragraphe(contenu, feuille["corps"]), Spacer(1, 2 * mm)]


def fiche(feuille, lignes: list[tuple[str, str]], large: float | None = None) -> Table:
    utile = largeur() if large is None else large
    visibles = [(libelle, valeur) for libelle, valeur in lignes if valeur]
    donnees = [
        [paragraphe(libelle, feuille["label"]), paragraphe(str(valeur), feuille["valeur"])]
        for libelle, valeur in visibles
    ] or [[paragraphe("—", feuille["valeur"]), paragraphe("", feuille["valeur"])]]
    tableau = Table(donnees, colWidths=[42 * mm, max(utile - 42 * mm, 20 * mm)])
    commandes = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 2 * mm),
        ("LEFTPADDING", (1, 0), (1, -1), 0),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1.15 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.15 * mm),
    ]
    if len(donnees) > 1:
        commandes.append(("LINEBELOW", (0, 0), (-1, -2), 0.25, FILET))
    tableau.setStyle(TableStyle(commandes))
    return tableau


def metriques(feuille, cases: list[tuple[str, str]]) -> Table:
    cellules = []
    for libelle, valeur in cases:
        cellules.append([
            paragraphe(libelle, feuille["label"]),
            Spacer(1, 0.3 * mm),
            paragraphe(valeur or "—", feuille["valeur_forte"]),
        ])
    while len(cellules) % 3:
        cellules.append("")
    lignes = [cellules[index:index + 3] for index in range(0, len(cellules), 3)]
    part = largeur() / 3
    tableau = Table(lignes, colWidths=[part, part, part])
    tableau.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), FOND_VERT),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.8 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8 * mm),
        ("LINEBEFORE", (1, 0), (-1, -1), 0.3, FILET),
    ]))
    return tableau


def tableau(feuille, entetes: list[str], lignes: list[list[str]], largeurs: list[float] | None = None, compact: bool = False) -> Table:
    from reportlab.lib.colors import white
    from reportlab.lib.styles import ParagraphStyle

    taille = 7 if compact else 8
    tete_style = ParagraphStyle("tete_tableau", fontName="Times-Bold", fontSize=taille, leading=taille + 2, textColor=white)
    corps_style = ParagraphStyle(
        "corps_tableau", fontName="Times-Roman", fontSize=taille, leading=taille + 2.4, textColor=ENCRE,
    ) if compact else feuille["valeur"]
    tete = [Paragraph(xml(item), tete_style) for item in entetes]
    corps = [[paragraphe(str(cellule), corps_style) for cellule in ligne] for ligne in lignes]
    if not corps:
        corps = [[paragraphe("Aucune ligne.", corps_style)] + [""] * (len(entetes) - 1)]
    donnees = [tete, *corps]
    parts = largeurs or [1] * len(entetes)
    total = sum(parts) or 1
    colonnes = [largeur() * (part / total) for part in parts]
    resultat = Table(donnees, colWidths=colonnes, repeatRows=1)
    resultat.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), VERT),
        ("TEXTCOLOR", (0, 0), (-1, 0), FOND_VERT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.6 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.4 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.3 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.3 * mm),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [FOND_VERT, white]),
    ] + ([("LINEBELOW", (0, 1), (-1, -2), 0.2, FILET)] if len(donnees) > 2 else [])))
    return resultat


FOND_REPORT = Color(226 / 255, 236 / 255, 228 / 255)


def _formater_somme(valeur: float) -> str:
    if abs(valeur - round(valeur)) < 1e-6:
        texte = f"{int(round(valeur)):,}"
    else:
        texte = f"{valeur:,.1f}"
    return texte.replace(",", "\u00a0").replace(".", ",")


def _ajouter(cumul: list, nombres: list[list]) -> list:
    sortie = list(cumul)
    for ligne in nombres:
        for indice, valeur in enumerate(ligne):
            if valeur is None or sortie[indice] is None:
                continue
            sortie[indice] += float(valeur)
    return sortie


class _TableauAvecReport(Flowable):
    """Tableau coupé en pages, avec total à reporter et rappel du report."""

    def __init__(self, feuille, entetes, lignes, largeurs, nombres, cumul=None, suite=False, compact=False):
        super().__init__()
        self.feuille = feuille
        self.entetes = entetes
        self.lignes = lignes
        self.nombres = nombres
        self.compact = compact
        self.suite = suite
        self.cumul = cumul if cumul is not None else self._cumul_vide()
        parts = largeurs or [1] * len(entetes)
        total = sum(parts) or 1
        self.colonnes = [largeur() * (part / total) for part in parts]
        self.droite = {indice for indice, valeur in enumerate(self.cumul) if valeur is not None}
        self._styles = None
        self._dessin = None

    def _cumul_vide(self) -> list:
        if not self.nombres:
            return []
        return [
            0.0 if any(ligne[indice] is not None for ligne in self.nombres) else None
            for indice in range(len(self.nombres[0]))
        ]

    def _styles_prets(self) -> dict:
        if self._styles is not None:
            return self._styles
        from reportlab.lib.styles import ParagraphStyle

        taille = 7 if self.compact else 8
        interligne = taille + 2.2

        def style(nom, police, couleur, alignement):
            return ParagraphStyle(
                nom, fontName=police, fontSize=taille, leading=interligne, textColor=couleur, alignment=alignement,
            )

        self._styles = {
            "tete_gauche": style("tete_report_g", "Times-Bold", white, TA_LEFT),
            "tete_droite": style("tete_report_d", "Times-Bold", white, TA_RIGHT),
            "corps_gauche": style("corps_report_g", "Times-Roman", ENCRE, TA_LEFT),
            "corps_droite": style("corps_report_d", "Times-Roman", ENCRE, TA_RIGHT),
            "somme_gauche": style("somme_report_g", "Times-Bold", ENCRE, TA_LEFT),
            "somme_droite": style("somme_report_d", "Times-Bold", ENCRE, TA_RIGHT),
            "final_gauche": style("final_report_g", "Times-Bold", white, TA_LEFT),
            "final_droite": style("final_report_d", "Times-Bold", white, TA_RIGHT),
        }
        return self._styles

    def _cellules(self, textes: list[str], genre: str) -> list:
        styles = self._styles_prets()
        return [
            paragraphe(texte, styles[f"{genre}_droite"] if indice in self.droite else styles[f"{genre}_gauche"])
            for indice, texte in enumerate(textes)
        ]

    def _ligne_somme(self, libelle: str, cumul: list) -> list[str]:
        textes = []
        for indice, valeur in enumerate(cumul):
            if indice == 0:
                textes.append(libelle)
            elif valeur is None:
                textes.append("")
            else:
                textes.append(_formater_somme(valeur))
        return textes

    def _fabriquer(self, fin: int, cloture: str) -> Table:
        donnees = [self._cellules(self.entetes, "tete")]
        if self.suite:
            donnees.append(self._cellules(self._ligne_somme("Report", self.cumul), "somme"))
        for ligne in self.lignes[:fin]:
            donnees.append(self._cellules([str(cellule) for cellule in ligne], "corps"))
        if cloture == "reporter":
            cumul = _ajouter(self.cumul, self.nombres[:fin])
            donnees.append(self._cellules(self._ligne_somme("Total à reporter", cumul), "somme"))
        elif cloture == "general":
            cumul = _ajouter(self.cumul, self.nombres[:fin])
            donnees.append(self._cellules(self._ligne_somme("Total général", cumul), "final"))
        resultat = Table(donnees, colWidths=self.colonnes, repeatRows=0)
        debut = 1 + (1 if self.suite else 0)
        commandes = [
            ("BACKGROUND", (0, 0), (-1, 0), VERT),
            ("TEXTCOLOR", (0, 0), (-1, 0), white),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 1.6 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 1.4 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 1.15 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.15 * mm),
        ]
        for decalage, ligne in enumerate(range(debut, debut + fin)):
            if decalage % 2 == 0:
                commandes.append(("BACKGROUND", (0, ligne), (-1, ligne), FOND_VERT))
            if decalage < fin - 1:
                commandes.append(("LINEBELOW", (0, ligne), (-1, ligne), 0.2, FILET))
        if self.suite:
            commandes.append(("BACKGROUND", (0, 1), (-1, 1), FOND_REPORT))
            commandes.append(("LINEBELOW", (0, 1), (-1, 1), 0.4, VERT))
        if cloture == "reporter":
            commandes.append(("BACKGROUND", (0, -1), (-1, -1), FOND_ORANGE))
            commandes.append(("LINEABOVE", (0, -1), (-1, -1), 0.6, ORANGE))
        elif cloture == "general":
            commandes.append(("BACKGROUND", (0, -1), (-1, -1), VERT))
            commandes.append(("LINEABOVE", (0, -1), (-1, -1), 0.6, VERT))
        resultat.setStyle(TableStyle(commandes))
        resultat.hAlign = "LEFT"
        return resultat

    def _mesure(self, fin: int, cloture: str) -> tuple[float, Table]:
        tableau = self._fabriquer(fin, cloture)
        _, hauteur = tableau.wrap(sum(self.colonnes), 10**6)
        return hauteur, tableau

    def wrap(self, aw, ah):
        self.aw = aw
        self._dessin = self._fabriquer(len(self.lignes), "general")
        self.width, self.height = self._dessin.wrap(aw, 10**6)
        return self.width, self.height

    def draw(self):
        self._dessin.drawOn(self.canv, 0, 0)

    def split(self, aw, ah):
        self.aw = aw
        total = len(self.lignes)
        if total == 0:
            return []
        hauteur, complet = self._mesure(total, "general")
        if hauteur <= ah + 0.5:
            return [complet]
        retenu = None
        coupe = 0
        for fin in range(1, total + 1):
            hauteur_page, candidat = self._mesure(fin, "reporter")
            if hauteur_page <= ah - 2:
                retenu = candidat
                coupe = fin
            else:
                break
        if retenu is None:
            return []
        if coupe >= total:
            return [self._mesure(total, "general")[1]]
        suite = _TableauAvecReport(
            self.feuille,
            self.entetes,
            self.lignes[coupe:],
            None,
            self.nombres[coupe:],
            cumul=_ajouter(self.cumul, self.nombres[:coupe]),
            suite=True,
            compact=self.compact,
        )
        suite.colonnes = list(self.colonnes)
        suite.droite = set(self.droite)
        return [retenu, suite]


def tableau_reporte(
    feuille,
    entetes: list[str],
    lignes: list[list[str]],
    largeurs: list[float] | None = None,
    nombres: list[list] | None = None,
    compact: bool = False,
):
    """Tableau avec total général, ou total à reporter si la page ne suffit pas."""
    if not lignes or not nombres:
        return tableau(feuille, entetes, lignes, largeurs, compact)
    return _TableauAvecReport(feuille, entetes, lignes, largeurs, nombres, compact=compact)



def encadre(feuille, titre: str, contenu: str) -> Table:
    bloc = [
        paragraphe(titre, feuille["appel_titre"]),
        Spacer(1, 1 * mm),
        paragraphe(contenu, feuille["appel"]),
    ]
    resultat = Table([[bloc]], colWidths=[largeur()])
    resultat.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FOND_ORANGE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, ORANGE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.4 * mm),
    ]))
    return resultat


def vignette_signature(contenu: bytes, largeur: float) -> Image | None:
    from PIL import Image as ImagePIL

    try:
        source = ImagePIL.open(BytesIO(contenu))
        source.thumbnail((720, 280), ImagePIL.Resampling.LANCZOS)
        if source.mode not in {"RGB", "RGBA"}:
            source = source.convert("RGBA")
    except OSError:
        return None
    tampon = BytesIO()
    source.save(tampon, format="PNG")
    tampon.seek(0)
    return Image(tampon, width=largeur, height=11 * mm, kind="proportional", mask="auto", hAlign="RIGHT", lazy=0)


def signature(feuille, signataire, edition: str) -> Table:
    droite = largeur() * 0.42
    bloc = [
        paragraphe(f"Fait à Abidjan, le {edition}.", feuille["signature_date"]),
        Spacer(1, 2.2 * mm),
        paragraphe("Pour le Ministre,", feuille["signature"]),
    ]
    image = vignette_signature(signataire.image, droite) if signataire and signataire.image else None
    if image is not None:
        bloc += [Spacer(1, 1 * mm), image, Spacer(1, 0.4 * mm)]
    else:
        bloc.append(Spacer(1, 8 * mm))
    bloc.append(HRFlowable(width=droite - 2 * mm, thickness=0.4, color=VERT, hAlign="RIGHT", spaceBefore=0, spaceAfter=0))
    if signataire and signataire.nom:
        bloc.append(paragraphe(signataire.nom, feuille["signature_forte"]))
    bloc.append(paragraphe(
        signataire.qualite if signataire else "Le Directeur des ressources humaines",
        feuille["signature"],
    ))
    if signataire and signataire.precision:
        bloc.append(paragraphe(signataire.precision, feuille["signature_date"]))
    tableau = Table([["", bloc]], colWidths=[largeur() - droite, droite])
    tableau.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tableau


def assembler(tampon_meta: dict, construire, signataire=None) -> bytes:
    """Compose un PDF selon le gabarit du document."""
    edition = date_longue(timezone.localdate())
    tampon = BytesIO()
    gabarit = tampon_meta.get("gabarit", "etat")
    doc = document(
        tampon,
        tampon_meta.get("reference", ""),
        edition,
        titre=tampon_meta.get("titre", ""),
        sujet=tampon_meta.get("sujet", ""),
        mention=tampon_meta.get("mention", "document officiel"),
        suite=tampon_meta.get("suite", "Document"),
        gabarit=gabarit,
        bandeau=tampon_meta.get("bandeau") or tampon_meta.get("titre_affiche", ""),
    )
    jeton = fixer_colonne(doc.colonne)
    try:
        feuille = styles()
        histoire = [
            *en_tete(gabarit, feuille, edition, tampon_meta),
            *construire(feuille),
            Spacer(1, 6 * mm),
            signature(feuille, signataire, edition),
        ]
        doc.build(histoire)
    finally:
        relacher_colonne(jeton)
    return tampon.getvalue()
