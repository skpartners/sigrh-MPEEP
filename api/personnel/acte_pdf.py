"""Ancien générateur Helvetica. Les PDF officiels sont produits par personnel.rapports."""

from .models import Acte


def rendre(acte: Acte) -> bytes:
    lignes = _couper(f"{acte.agent.nom} {acte.agent.prenoms}  ·  {acte.agent.matricule}")
    corps = [
        "Ministère du Portefeuille de l'État et des Entreprises Publiques",
        "Acte mis à disposition de l'agent",
        "",
        *lignes,
        "",
        *_couper(f"Nature : {acte.nature}"),
        *_couper(f"Référence : {acte.reference}"),
        *_couper(f"Titre : {acte.titre}"),
        *_couper(f"Date d'effet : {acte.date_effet.strftime('%d/%m/%Y') if acte.date_effet else 'non renseignée'}"),
        *_couper(f"Enregistré le : {acte.date_enregistrement.strftime('%d/%m/%Y')}"),
        *_couper(f"Signataire : {acte.signataire or 'non renseigné'}"),
        "",
        *_couper(acte.resume or "Aucun résumé."),
    ]
    return _pdf(corps[:42])


def rendre_notations(agent) -> bytes:
    """Bulletin des notations versées au dossier de l'agent."""
    corps = [
        "Ministère du Portefeuille de l'État et des Entreprises Publiques",
        "Bulletin des notations",
        "",
        *_couper(f"{agent.nom} {agent.prenoms}  ·  {agent.matricule}"),
        *_couper(f"Grade {agent.grade}, échelon {agent.echelon}  ·  {agent.structure}"),
        "",
    ]
    for item in agent.evaluations.all():
        corps += [
            *_couper(f"Exercice {item.annee}  ·  {item.note} / 20  ·  {item.mention}  ·  {item.statut}"),
            *_couper(f"Évaluateur : {item.evaluateur} ({item.fonction_evaluateur})"),
            *_couper(item.appreciation),
            "",
        ]
    if len(corps) <= 6:
        corps.append("Aucune notation versée.")
    return _pdf(corps[:52])


def rendre_conges(agent) -> bytes:
    """Relevé des congés et absences versés au dossier de l'agent."""
    corps = [
        "Ministère du Portefeuille de l'État et des Entreprises Publiques",
        "Relevé des congés et absences",
        "",
        *_couper(f"{agent.nom} {agent.prenoms}  ·  {agent.matricule}"),
        *_couper(f"Grade {agent.grade}, échelon {agent.echelon}  ·  {agent.structure}"),
        "",
        *_couper(
            f"Droits acquis : {agent.conges_acquis} j   ·   Consommés : {agent.conges_consommes} j   ·   Reliquat : {agent.reliquat_conges} j"
        ),
        "",
    ]
    for item in agent.absences.all():
        corps += _couper(
            f"{item.debut.strftime('%d/%m/%Y')} – {item.fin.strftime('%d/%m/%Y')}  ·  {item.jours} j  ·  {item.nature}  ·  {item.statut}"
        )
    if not agent.absences.exists():
        corps.append("Aucune absence versée.")
    return _pdf(corps[:52])


def rendre_social(agent) -> bytes:
    """Rapport des prestations sociales versées au dossier de l'agent."""
    corps = [
        "Ministère du Portefeuille de l'État et des Entreprises Publiques",
        "Rapport des prestations sociales",
        "",
        *_couper(f"{agent.nom} {agent.prenoms}  ·  {agent.matricule}"),
        *_couper(f"Grade {agent.grade}, échelon {agent.echelon}  ·  {agent.structure}"),
        "",
    ]
    for item in agent.prestations.all():
        corps += [
            *_couper(
                f"{item.reference}  ·  {item.date_demande.strftime('%d/%m/%Y')}  ·  {item.montant} FCFA  ·  {item.statut}"
            ),
            *_couper(f"{item.nature} — {item.objet}"),
            "",
        ]
    if not agent.prestations.exists():
        corps.append("Aucune prestation versée.")
    return _pdf(corps[:52])


def _couper(texte: str, largeur: int = 86) -> list[str]:
    mots = texte.split()
    if not mots:
        return [""]
    lignes: list[str] = []
    courante = ""
    for mot in mots:
        candidat = f"{courante} {mot}".strip()
        if len(candidat) <= largeur:
            courante = candidat
        else:
            if courante:
                lignes.append(courante)
            courante = mot[:largeur]
    if courante:
        lignes.append(courante)
    return lignes


def rendre_document(titre: str, lignes: list[str]) -> bytes:
    """PDF d'une ou plusieurs pages, même typographie que les actes."""
    corps = [
        "Ministère du Portefeuille de l'État et des Entreprises Publiques",
        titre,
        "",
        *lignes,
    ]
    pages = [corps[index:index + 46] for index in range(0, len(corps), 46)] or [[]]
    return _pdf_pages(pages)


def _flux(lignes: list[str]) -> bytes:
    commandes = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"]
    for index, ligne in enumerate(lignes):
        if index:
            commandes.append("T*")
        taille = "13" if index < 2 else "11"
        commandes.append(f"/F1 {taille} Tf ({_echapper(ligne)}) Tj")
    commandes.append("ET")
    return "\n".join(commandes).encode("latin-1")


def _pdf(lignes: list[str]) -> bytes:
    return _pdf_pages([lignes])


def _pdf_pages(pages: list[list[str]]) -> bytes:
    flux_pages = [_flux(lignes) for lignes in pages]
    kids = " ".join(f"{4 + index * 2} 0 R" for index in range(len(flux_pages)))
    objets: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(flux_pages)} >>".encode("ascii"),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    for flux in flux_pages:
        numero_page = len(objets) + 1
        objets.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents {numero_page + 1} 0 R "
            f"/Resources << /Font << /F1 3 0 R >> >> >>".encode("ascii")
        )
        objets.append(b"<< /Length " + str(len(flux)).encode("ascii") + b" >>\nstream\n" + flux + b"\nendstream")
    morceaux = [b"%PDF-1.4\n"]
    offsets = [0]
    for numero, objet in enumerate(objets, start=1):
        offsets.append(sum(len(morceau) for morceau in morceaux))
        morceaux.append(f"{numero} 0 obj\n".encode("ascii") + objet + b"\nendobj\n")
    debut = sum(len(morceau) for morceau in morceaux)
    xref = [f"xref\n0 {len(objets) + 1}\n", "0000000000 65535 f \n"]
    xref += [f"{offset:010d} 00000 n \n" for offset in offsets[1:]]
    morceaux.append("".join(xref).encode("ascii"))
    morceaux.append(f"trailer\n<< /Size {len(objets) + 1} /Root 1 0 R >>\nstartxref\n{debut}\n%%EOF\n".encode("ascii"))
    return b"".join(morceaux)


def _echapper(texte: str) -> str:
    brut = texte.encode("cp1252", errors="replace")
    sortie = []
    for octet in brut:
        if octet in (ord("("), ord(")"), ord("\\")):
            sortie.append("\\" + chr(octet))
        elif 32 <= octet < 127:
            sortie.append(chr(octet))
        else:
            sortie.append(f"\\{octet:03o}")
    return "".join(sortie)
