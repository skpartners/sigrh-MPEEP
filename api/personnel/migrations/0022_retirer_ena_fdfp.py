import json

from django.db import migrations

PAIRES = (
    ("École Nationale d'Administration (ENA)", "Direction de la formation continue"),
    ("Admis au concours direct de l'ENA (promotion 2013-2014).", "Admis au concours direct (promotion 2013-2014)."),
    ("Cycle ENA des dirigeants d'entreprises publiques", "Cycle des dirigeants d'entreprises publiques"),
    ("Formation : cycle ENA des dirigeants", "Formation : cycle des dirigeants"),
    ("cycle ENA des dirigeants", "cycle des dirigeants"),
    ("Cycle ENA des dirigeants", "Cycle des dirigeants"),
    ("Attestation ENA", "Attestation"),
    ("Prise en charge FDFP.", "Prise en charge de la formation."),
    ("Vérification de la prise en charge FDFP", "Vérification de la prise en charge"),
    ("Cycles ENA et pôle OHADA", "Cycles de formation et pôle OHADA"),
    ("Arbitrage FDFP / MPEEP", "Arbitrage des plans de formation"),
    ("cycles ENA et certifications.", "certifications."),
    ("Dotation FDFP ministérielle, exercice 2026", "Dotation ministérielle, exercice 2026"),
    ("Dotation FDFP Ministérielle Exercice 2026", "Dotation ministérielle, exercice 2026"),
)

TEXTES = {
    "Acte": ("titre", "resume", "nature"),
    "Demande": ("nature", "responsable", "echeance"),
    "Formation": ("intitule", "organisme", "certification"),
    "Notification": ("titre", "message"),
    "SessionFormation": ("libelle", "cadre_budgetaire", "objectif"),
    "Message": ("texte",),
    "ParcoursEtape": ("titre", "texte"),
    "PieceJointe": ("intitule", "categorie"),
    "VisaDemande": ("commentaire",),
    "VisaDossier": ("commentaire",),
}
JSONS = {
    "SnapshotExercice": ("accueil", "dashboard", "carriere", "modules"),
}


def _remplacer(valeur: str) -> str:
    for ancien, nouveau in PAIRES:
        valeur = valeur.replace(ancien, nouveau)
    return valeur


def retirer_ena_fdfp(apps, schema_editor):
    for nom, champs in TEXTES.items():
        Modele = apps.get_model("personnel", nom)
        for ligne in Modele.objects.all():
            touche = False
            for champ in champs:
                valeur = getattr(ligne, champ) or ""
                nouveau = _remplacer(valeur)
                if nouveau != valeur:
                    setattr(ligne, champ, nouveau)
                    touche = True
            if touche:
                ligne.save(update_fields=list(champs))
    for nom, champs in JSONS.items():
        Modele = apps.get_model("personnel", nom)
        for ligne in Modele.objects.all():
            touche = False
            for champ in champs:
                valeur = getattr(ligne, champ) or {}
                brut = json.dumps(valeur, ensure_ascii=False)
                nouveau = _remplacer(brut)
                if nouveau != brut:
                    setattr(ligne, champ, json.loads(nouveau))
                    touche = True
            if touche:
                ligne.save(update_fields=list(champs))


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0021_retirer_ksign"),
    ]

    operations = [
        migrations.RunPython(retirer_ena_fdfp, migrations.RunPython.noop),
    ]
