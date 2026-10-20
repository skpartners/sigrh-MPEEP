"""Dépôt et archive des pièces jointes d'un dossier agent."""

import io
import zipfile
from datetime import date
from pathlib import Path

from django.db import transaction

from .classeur import habiller
from .models import Agent, PieceJointe, TypeActe

QUOTA_KO = 50 * 1024
TAILLE_MAX = 15 * 1024 * 1024
EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}


def deposer(agent: Agent, fichier, intitule: str, _categorie: str) -> str | None:
    """Enregistre une pièce. Retourne un message d'erreur, ou None."""
    if fichier is None:
        return "Choisissez un fichier à téléverser."
    nom = Path(getattr(fichier, "name", "") or "").name
    extension = Path(nom).suffix.lower()
    if extension not in EXTENSIONS:
        return "Le fichier doit être un PDF ou une image (PNG, JPG, WEBP)."
    if fichier.size > TAILLE_MAX:
        return "Le fichier dépasse 15 Mo."
    intitule = (intitule or "").strip()
    acte = TypeActe.objects.filter(libelle=intitule).first()
    if acte is None:
        return "Cet acte n'est pas géré par la plateforme."
    intitule = acte.libelle
    categorie = acte.libelle
    taille_ko = max(1, (fichier.size + 1023) // 1024)
    occupe = sum(agent.pieces.values_list("taille_ko", flat=True))
    if occupe + taille_ko > QUOTA_KO:
        return "La capacité scellée de 50 Mo est atteinte."
    with transaction.atomic():
        PieceJointe.objects.create(
            agent=agent,
            intitule=intitule,
            categorie=categorie,
            date_depot=date.today(),
            taille_ko=taille_ko,
            verifiee=True,
            fichier=fichier,
        )
    return None


# Dossier personnel numérique : trois rubriques et les pièces attendues dans chacune.
CATALOGUE_DOCUMENTS = [
    {
        "code": "etat_civil",
        "libelle": "Actes d'état civil",
        "types": [
            {"code": "acte_naissance", "libelle": "Copie d'acte de naissance de l'agent"},
            {"code": "acte_mariage", "libelle": "Acte de mariage"},
            {"code": "acte_naissance_enfant", "libelle": "Acte de naissance d'un enfant"},
        ],
    },
    {
        "code": "diplomes",
        "libelle": "Diplômes & Certifications",
        "types": [
            {"code": "diplome", "libelle": "Diplôme"},
            {"code": "cv", "libelle": "CV"},
        ],
    },
    {
        "code": "administratifs",
        "libelle": "Actes administratifs",
        "types": [
            {"code": "arrete_nomination", "libelle": "Arrêté de nomination"},
            {"code": "decision", "libelle": "Décision"},
            {"code": "certificat", "libelle": "Certificat"},
            {"code": "attestation", "libelle": "Attestation"},
            {"code": "note_service", "libelle": "Note de service"},
        ],
    },
]


def deposer_document(agent: Agent, fichier, rubrique: str, type_code: str, precision: str, expiration: str) -> str | None:
    """Verse une pièce du dossier personnel numérique. Retourne un message d'erreur, ou None."""
    groupe = next((item for item in CATALOGUE_DOCUMENTS if item["code"] == rubrique), None)
    if groupe is None:
        return "Choisissez la rubrique du document."
    type_piece = next((item for item in groupe["types"] if item["code"] == type_code), None)
    if type_piece is None:
        return "Choisissez le type de document."
    echeance = None
    if expiration:
        try:
            echeance = date.fromisoformat(expiration)
        except ValueError:
            return "La date d'expiration n'est pas valide."
    erreur = _controler_fichier(agent, fichier)
    if erreur:
        return erreur
    precision = (precision or "").strip()[:80]
    intitule = f"{type_piece['libelle']} — {precision}" if precision else type_piece["libelle"]
    PieceJointe.objects.create(
        agent=agent,
        intitule=intitule,
        categorie=groupe["libelle"],
        date_depot=date.today(),
        taille_ko=max(1, (fichier.size + 1023) // 1024),
        verifiee=False,
        date_expiration=echeance,
        fichier=fichier,
    )
    return None


RUBRIQUE_DIPLOMES = "Diplômes & Certifications"


def verser_justificatif_diplome(agent: Agent, fichier, libelle: str) -> tuple[PieceJointe | None, str | None]:
    """Verse le justificatif d'un diplôme dans le dossier numérique. Retourne la pièce créée, ou un message d'erreur."""
    erreur = deposer_document(agent, fichier, "diplomes", "diplome", libelle, "")
    if erreur:
        return None, erreur
    return agent.pieces.order_by("-id").first(), None


def _controler_fichier(agent: Agent, fichier) -> str | None:
    if fichier is None:
        return "Choisissez un fichier à téléverser."
    if Path(getattr(fichier, "name", "") or "").suffix.lower() not in EXTENSIONS:
        return "Le fichier doit être un PDF ou une image (PNG, JPG, WEBP)."
    if fichier.size > TAILLE_MAX:
        return "Le fichier dépasse 15 Mo."
    taille_ko = max(1, (fichier.size + 1023) // 1024)
    if sum(agent.pieces.values_list("taille_ko", flat=True)) + taille_ko > QUOTA_KO:
        return "La capacité scellée de 50 Mo est atteinte."
    return None


def archive(agent: Agent) -> tuple[bytes, str]:
    """Archive ZIP des pièces du dossier. Les pièces sans fichier y figurent en fiche."""
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as zipf:
        lignes = [["Intitulé", "Catégorie", "Date", "Taille (Ko)", "Fichier"]]
        for index, piece in enumerate(agent.pieces.all(), start=1):
            nom = _nom(piece, index)
            if piece.fichier:
                try:
                    zipf.writestr(nom, piece.fichier.read())
                except (OSError, ValueError):
                    nom = _nom(piece, index, ".txt")
                    zipf.writestr(nom, _fiche(piece))
            else:
                nom = _nom(piece, index, ".txt")
                zipf.writestr(nom, _fiche(piece))
            lignes.append([piece.intitule, piece.categorie, piece.date_depot.isoformat(), piece.taille_ko, nom])
        zipf.writestr("manifeste.xlsx", habiller([{
            "nom": "Pièces",
            "titre": f"SIGRH  ·  Pièces de {agent.matricule}",
            "sous_titre": "Inventaire des fichiers joints à cette archive.",
            "notice": "Chaque ligne correspond à une pièce du dossier. Le nom de fichier est celui présent dans l'archive.",
            "lignes": lignes,
            "paysage": True,
        }]))
    return tampon.getvalue(), f"pieces-{agent.matricule}.zip"


def _nom(piece: PieceJointe, index: int, extension: str | None = None) -> str:
    brut = "".join(caractere if caractere.isalnum() or caractere in " _-" else "-" for caractere in piece.intitule)
    base = "-".join(brut.split())[:80] or "piece"
    if extension is None:
        extension = Path(piece.fichier.name).suffix.lower() if piece.fichier else ".txt"
        if extension not in EXTENSIONS:
            extension = ""
    return f"{index:02d}-{base}{extension}"


def _fiche(piece: PieceJointe) -> bytes:
    return (
        f"{piece.intitule}\n"
        f"Catégorie : {piece.categorie}\n"
        f"Déposée le : {piece.date_depot.isoformat()}\n"
        f"Taille déclarée : {piece.taille_ko} Ko\n"
        "Fichier non joint au dossier numérique.\n"
    ).encode("utf-8")
