"""Ce qu'un rôle peut faire sans connexion.

Le catalogue est volontairement court : seules les actions réellement rejouables au retour du réseau y figurent. Il ne
dépend d'aucun modèle (le modèle `RoleMatrice` s'en sert pour sa valeur par défaut).
"""

from __future__ import annotations

LECTURE = "lecture"
NOTIFICATION = "notification"
CONGE = "conge"
ACTE = "acte"
DOSSIER = "dossier"
FICHIER = "fichier"

# (code, libellé, explication montrée dans les paramètres). L'ordre est celui des colonnes.
CAPACITES: tuple[tuple[str, str, str], ...] = (
    (LECTURE, "Consulter", "Garde sur l'appareil, chiffrée, une copie des écrans déjà ouverts. Sans cette case, rien n'est conservé."),
    (NOTIFICATION, "Notifications", "Marquer des notifications comme lues."),
    (CONGE, "Congés", "Déposer une demande de congé."),
    (ACTE, "Actes", "Demander un acte administratif (attestation, certificat…)."),
    (DOSSIER, "Dossier", "Mettre à jour les informations du dossier : profil, enfants, diplômes."),
    (
        FICHIER,
        "Pièces jointes",
        "Joindre un fichier (pièce, diplôme, photo). Il reste chiffré sur l'appareil et n'est envoyé, puis analysé par l'antivirus, qu'au retour de la connexion.",
    ),
)

CODES = tuple(code for code, _libelle, _aide in CAPACITES)


def capacites_defaut() -> list[str]:
    """Tout est permis par défaut : le retrait se décide dans les paramètres, rôle par rôle."""
    return list(CODES)


def normaliser(capacites) -> list[str]:
    """Garde uniquement les capacités connues, dans l'ordre du catalogue et sans doublon."""
    voulues = set(capacites or [])
    return [code for code in CODES if code in voulues]
