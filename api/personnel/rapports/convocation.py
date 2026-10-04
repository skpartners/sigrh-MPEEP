"""Convocation devant le conseil de discipline."""

from dataclasses import dataclass
from datetime import date

from django.utils import timezone
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Image, Paragraph, Spacer, Table, TableStyle

from .papier import (
    COLONNE,
    FILET,
    FOND_ORANGE,
    FOND_VERT,
    ORANGE,
    VERT,
    armoiries,
    date_heure,
    date_longue,
    document,
    paragraphe,
    styles,
)

RANGS = {1: "1er degré", 2: "2e degré", 3: "3e degré"}


@dataclass
class Signataire:
    """Personne dont la signature électronique ferme la convocation."""

    nom: str
    qualite: str
    precision: str
    image: bytes | None


def rendre_convocation(procedure, echeance: date, delai: int, degre: dict | None, seance=None, signataire: Signataire | None = None) -> bytes:
    """PDF de la convocation : notification des griefs et délai du contradictoire."""
    from io import BytesIO

    edition = date_longue(timezone.localdate())
    tampon = BytesIO()
    doc = document(
        tampon,
        procedure.reference,
        edition,
        titre=f"Convocation {procedure.reference}",
        sujet="Convocation devant le conseil de discipline",
        mention="dossier disciplinaire confidentiel",
        suite="Convocation",
        gabarit="lettre",
        bandeau="CONVOCATION",
    )
    feuille = styles()
    histoire = [
        *_entete(feuille, edition),
        Spacer(1, 3.5 * mm),
        *_titre(feuille, procedure.reference),
        Spacer(1, 3.2 * mm),
        *_lettre(feuille, procedure, echeance, delai),
        Spacer(1, 3 * mm),
        _section(feuille, "Personne convoquée"),
        Spacer(1, 1.2 * mm),
        _identite(feuille, procedure.agent),
        Spacer(1, 3 * mm),
        _section(feuille, "Dossier d'instruction"),
        Spacer(1, 1.2 * mm),
        _dossier(feuille, procedure, echeance, delai, degre),
    ]
    if seance is not None:
        histoire += [Spacer(1, 2.2 * mm), _seance(feuille, seance, procedure.agent.sexe)]
    histoire += [Spacer(1, 2.4 * mm), _cloture(feuille, edition, degre, signataire)]
    doc.build(histoire)
    return tampon.getvalue()


def _entete(feuille: dict[str, ParagraphStyle], edition: str) -> list:
    identite = [
        paragraphe("RÉPUBLIQUE DE CÔTE D'IVOIRE", feuille["republique"]),
        paragraphe("Union – Discipline – Travail", feuille["devise"]),
    ]
    bloc_gauche = Table([[armoiries(), identite]], colWidths=[18 * mm, 102 * mm])
    bloc_gauche.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 2 * mm),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    ministere = [
        paragraphe("MINISTÈRE DU PORTEFEUILLE DE L'ÉTAT", feuille["ministere"]),
        paragraphe("ET DES ENTREPRISES PUBLIQUES", feuille["ministere"]),
        Spacer(1, 1.2 * mm),
        paragraphe("Direction des ressources humaines", feuille["service"]),
        paragraphe("Sous-direction de la gestion des carrières", feuille["service"]),
    ]
    droite = paragraphe(f"Abidjan, le {edition}", feuille["lieu"])
    bandeau = Table(
        [[ [bloc_gauche, Spacer(1, 2.2 * mm), *ministere], droite ]],
        colWidths=[COLONNE * 0.68, COLONNE * 0.32],
    )
    bandeau.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ("LINEBELOW", (0, 0), (-1, -1), 0.8, VERT),
    ]))
    return [bandeau]


def _titre(feuille: dict[str, ParagraphStyle], reference: str) -> list:
    badge = Table([[paragraphe("CONFIDENTIEL", feuille["badge"])]], colWidths=[32 * mm])
    badge.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, ORANGE),
        ("BACKGROUND", (0, 0), (-1, -1), FOND_ORANGE),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8 * mm),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    ligne = Table(
        [[paragraphe(f"Réf. {reference}", feuille["reference"]), badge]],
        colWidths=[COLONNE - 34 * mm, 34 * mm],
    )
    ligne.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [
        paragraphe("CONSEIL DE DISCIPLINE", feuille["kicker"]),
        Spacer(1, 1 * mm),
        paragraphe("CONVOCATION", feuille["titre"]),
        Spacer(1, 0.8 * mm),
        paragraphe("Notification des griefs et exercice des droits de la défense", feuille["sous_titre"]),
        Spacer(1, 2.2 * mm),
        ligne,
    ]


def _lettre(feuille, procedure, echeance: date, delai: int) -> list:
    agent = procedure.agent
    civilite = "Madame" if agent.sexe == "F" else "Monsieur"
    mis = "mis" if agent.sexe == "H" else "mise"
    qualite = _qualite(agent)
    saisine = date_longue(procedure.saisine)
    terme = date_longue(echeance)
    jours = "jour" if delai == 1 else "jours"
    return [
        paragraphe(f"{civilite} {agent.nom_complet},", feuille["corps"]),
        Spacer(1, 1.6 * mm),
        paragraphe(
            f"La Direction des ressources humaines vous convoque devant le conseil de discipline, "
            f"dans le cadre de la procédure {procedure.reference}. "
            f"Vous êtes {mis} en cause au titre de l'emploi suivant\u00a0: {qualite}. "
            f"Vous disposez de {delai} {jours} à compter de la saisine du {saisine}, soit jusqu'au {terme}, "
            f"pour consulter le dossier et présenter vos observations écrites. "
            f"Le conseil statue en application de l'ordonnance n°\u00a02023-892 ; passé cette échéance, "
            f"il examinera les pièces versées au dossier.",
            feuille["corps"],
        ),
    ]


def _identite(feuille, agent) -> Table:
    organisme = agent.organisme.nom
    if agent.organisme.sigle:
        organisme = f"{organisme} ({agent.organisme.sigle})"
    affectation = " — ".join(part for part in (agent.direction, agent.service, agent.fonction) if part)
    cases = [
        ("Nom", agent.nom_complet),
        ("Matricule", agent.matricule),
        ("Organisme", organisme),
        ("Corps", agent.corps),
        ("Grade", _grade(agent)),
        ("Affectation", affectation),
    ]
    largeur = COLONNE / 3
    donnees = []
    for debut in range(0, len(cases), 3):
        donnees.append([_case(feuille, libelle, valeur) for libelle, valeur in cases[debut:debut + 3]])
    tableau = Table(donnees, colWidths=[largeur, largeur, largeur])
    tableau.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), FOND_VERT),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.8 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8 * mm),
        ("LINEBEFORE", (1, 0), (1, -1), 0.3, FILET),
        ("LINEBEFORE", (2, 0), (2, -1), 0.3, FILET),
        ("LINEBELOW", (0, 0), (-1, 0), 0.3, FILET),
    ]))
    return tableau


def _case(feuille, libelle: str, valeur: str) -> list:
    return [
        paragraphe(libelle, feuille["label"]),
        Spacer(1, 0.4 * mm),
        paragraphe(valeur or "—", feuille["valeur"]),
    ]


def _dossier(feuille, procedure, echeance: date, delai: int, degre: dict | None) -> Table:
    jours = "jour" if delai == 1 else "jours"
    stade = procedure.stade
    if procedure.stade_detail:
        stade = f"{stade} — {procedure.stade_detail}"
    mesures = [
        ("Degré encouru", _libelle_degre(procedure.degre, degre)),
        ("Échéance", f"{date_longue(echeance)} ({delai} {jours})"),
        ("Rapporteur", procedure.rapporteur),
        ("Autorité", (degre or {}).get("autorite") or "—"),
        ("Saisine", date_longue(procedure.saisine)),
        ("État du dossier", f"{stade} · {procedure.get_avis_display()}"),
    ]
    largeur = (COLONNE - 8 * mm) / 3
    grille = [[_case(feuille, libelle, valeur) for libelle, valeur in mesures[debut:debut + 3]] for debut in (0, 3)]
    metrique = Table(grille, colWidths=[largeur, largeur, largeur])
    metrique.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.4 * mm),
        ("LINEABOVE", (0, 1), (-1, 1), 0.25, FILET),
    ]))
    contenu = [
        paragraphe("Grief", feuille["label"]),
        paragraphe(procedure.grief, feuille["valeur_forte"]),
        Spacer(1, 1.4 * mm),
        paragraphe("Faits reprochés", feuille["label"]),
        paragraphe(procedure.description, feuille["valeur"]),
        Spacer(1, 1.6 * mm),
        metrique,
    ]
    tableau = Table([[contenu]], colWidths=[COLONNE])
    tableau.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FOND_VERT),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, VERT),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tableau


def _seance(feuille, seance, sexe: str) -> Table:
    quand = date_heure(timezone.localtime(seance.date))
    lieu = f", {seance.lieu}" if seance.lieu else ""
    convoque = "convoqué" if sexe == "H" else "convoquée"
    composition = ", ".join(seance.composition) if seance.composition else ""
    contenu = [
        paragraphe("Comparution devant la commission paritaire", feuille["section"]),
        Spacer(1, 1.4 * mm),
        paragraphe(
            f"Vous êtes {convoque} à la séance « {seance.intitule} » ({seance.code}), "
            f"le {quand}{lieu}.",
            feuille["corps"],
        ),
    ]
    if seance.ordre_du_jour:
        contenu += [Spacer(1, 1.2 * mm), paragraphe(f"Ordre du jour\u00a0: {seance.ordre_du_jour}.", feuille["corps"])]
    if composition:
        contenu += [Spacer(1, 1.2 * mm), paragraphe(f"Composition\u00a0: {composition}.", feuille["corps"])]
    bloc = Table([[contenu]], colWidths=[COLONNE])
    bloc.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FOND_VERT),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, VERT),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]))
    return bloc


def _droits(feuille, degre: dict | None, largeur: float) -> Table:
    complement = ""
    numero = int((degre or {}).get("degre") or 0)
    if numero == 1:
        complement = " S'agissant d'une sanction du premier degré, votre droit de réponse est consigné sous huit jours."
    elif numero >= 2:
        complement = " La sanction encourue appelle l'avis du conseil et votre audition."
    contenu = [
        paragraphe("Droits de la défense", feuille["appel_titre"]),
        Spacer(1, 1.4 * mm),
        paragraphe(
            "Avant l'échéance, vous pouvez consulter les pièces du dossier, produire un mémoire en défense "
            "et vous faire assister par une personne de votre choix. Les observations versées au dossier "
            f"sont examinées avant tout avis.{complement}",
            feuille["appel"],
        ),
    ]
    bloc = Table([[contenu]], colWidths=[largeur])
    bloc.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FOND_ORANGE),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, ORANGE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]))
    return bloc


def _cloture(feuille, edition: str, degre: dict | None, signataire: Signataire | None) -> Table:
    """Les droits de la défense et la signature tiennent sur la même ligne."""
    gauche = COLONNE * 0.63
    ecart = 4 * mm
    droite = COLONNE - gauche - ecart
    signature = [
        paragraphe(f"Fait à Abidjan, le {edition}.", feuille["signature_date"]),
        Spacer(1, 2.2 * mm),
        paragraphe("Pour le Ministre,", feuille["signature"]),
    ]
    vignette = _vignette_signature(signataire.image, droite) if signataire and signataire.image else None
    if vignette is not None:
        signature += [Spacer(1, 1 * mm), vignette, Spacer(1, 0.4 * mm)]
    else:
        signature.append(Spacer(1, 8 * mm))
    signature.append(HRFlowable(width=droite - 2 * mm, thickness=0.4, color=VERT, hAlign="RIGHT", spaceBefore=0, spaceAfter=0))
    if signataire and signataire.nom:
        signature.append(paragraphe(signataire.nom, feuille["signature_forte"]))
    signature.append(paragraphe(
        signataire.qualite if signataire else "Le Directeur des ressources humaines",
        feuille["signature"],
    ))
    if signataire and signataire.precision:
        signature.append(paragraphe(signataire.precision, feuille["signature_date"]))
    tableau = Table([[_droits(feuille, degre, gauche), "", signature]], colWidths=[gauche, ecart, droite])
    tableau.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tableau


def _vignette_signature(contenu: bytes, largeur: float) -> Image | None:
    """Réduit la signature pour qu'elle tienne à droite, fond transparent conservé."""
    from io import BytesIO

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


def _section(feuille, titre: str) -> Paragraph:
    return paragraphe(titre.upper(), feuille["section"])


def _qualite(agent) -> str:
    morceaux = [agent.corps]
    if agent.fonction:
        morceaux.append(agent.fonction)
    organisme = agent.organisme.sigle or agent.organisme.nom
    morceaux.append(organisme)
    return ", ".join(morceau for morceau in morceaux if morceau)


def _grade(agent) -> str:
    morceaux = []
    if agent.grade:
        morceaux.append(f"grade {agent.grade}")
    if agent.echelon:
        morceaux.append(f"échelon {agent.echelon}")
    if agent.indice:
        morceaux.append(f"indice {agent.indice}")
    return ", ".join(morceaux)


def _libelle_degre(numero: int, degre: dict | None) -> str:
    rang = (degre or {}).get("rang") or RANGS.get(numero) or f"degré {numero}"
    intitule = (degre or {}).get("intitule") or ""
    if intitule:
        return f"{rang} — {intitule}"
    return str(rang)
