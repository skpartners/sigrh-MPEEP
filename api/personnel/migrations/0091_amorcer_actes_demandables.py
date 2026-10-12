from django.db import migrations

ACTES = [
    ("attestation-travail", "Attestation de travail", "work", False, True, "Pièce justificative (facultatif) : par exemple la demande de l'organisme destinataire."),
    ("attestation-presence", "Attestation de présence au poste", "how_to_reg", False, True, "Pièce justificative (facultatif) : par exemple la demande de l'organisme destinataire."),
    ("permission-speciale", "Permission spéciale d'absence", "event_available", True, False, "Pièce justificative (facultatif) : acte de décès, de mariage, convocation, certificat médical…"),
    ("autorisation-speciale", "Autorisation spéciale d'absence", "event_note", True, False, "Pièce justificative (facultatif) : acte de décès, de mariage, convocation, certificat médical…"),
    ("permission", "Permission", "free_cancellation", True, False, "Pièce justificative (facultatif) : acte de décès, de mariage, convocation, certificat médical…"),
]


def amorcer(apps, _schema_editor):
    modele = apps.get_model("personnel", "ActeDemandable")
    for ordre, (code, libelle, icone, periode, destinataire, justificatif) in enumerate(ACTES, start=1):
        modele.objects.get_or_create(
            code=code,
            defaults={"libelle": libelle, "icone": icone, "periode": periode, "destinataire": destinataire, "justificatif": justificatif, "ordre": ordre},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0090_actedemandable_alter_attributioncircuit_famille"),
    ]

    operations = [
        migrations.RunPython(amorcer, migrations.RunPython.noop),
    ]
