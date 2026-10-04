"""Remplace les noms d'institutions réelles de l'historique de formation par des organismes fictifs."""

from django.db import migrations

ORGANISMES = {
    "ERSUMA": "Centre de formation au droit des affaires",
    "CESAG": "Institut supérieur de gestion publique",
    "ANRMP": "Centre de formation aux marchés publics",
    "AGEROUTE Formation": "Cabinet Performance & Données",
    "Institut de Management Public": "Centre de perfectionnement des cadres de l'administration",
    "IIA Côte d'Ivoire": "Institut régional des métiers de l'audit",
}
CERTIFICATIONS = {
    "Certificat ERSUMA": "Certificat de formation",
    "Certificat CESAG": "Certificat de formation",
    "Certificat IIA": "Certificat de formation",
    "Attestation ANRMP": "Attestation de formation",
    "Attestation IMP": "Attestation de formation",
}


def remplacer(apps, schema_editor):
    Formation = apps.get_model("personnel", "Formation")
    Acte = apps.get_model("personnel", "Acte")
    for ancien, nouveau in ORGANISMES.items():
        Formation.objects.filter(organisme=ancien).update(organisme=nouveau)
    for ancien, nouveau in CERTIFICATIONS.items():
        Formation.objects.filter(certification=ancien).update(certification=nouveau)
    Acte.objects.filter(resume="Formation certifiante ERSUMA.").update(resume="Formation certifiante.")


class Migration(migrations.Migration):
    dependencies = [("personnel", "0025_donnees_formation_continue")]
    operations = [migrations.RunPython(remplacer, migrations.RunPython.noop)]
