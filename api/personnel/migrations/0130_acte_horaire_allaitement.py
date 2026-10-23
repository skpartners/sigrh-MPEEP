from django.db import migrations


def amorcer(apps, _schema_editor):
    modele = apps.get_model("personnel", "ActeDemandable")
    ordre = (modele.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    modele.objects.get_or_create(
        code="autorisation-horaire-allaitement",
        defaults={
            "libelle": "Autorisation d'horaire pour allaitement",
            "icone": "child_care",
            "periode": True,
            "destinataire": False,
            "justificatif": "Pièce justificative : acte de naissance de l'enfant ou certificat médical.",
            "ordre": ordre,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0129_signataire_documents"),
    ]

    operations = [
        migrations.RunPython(amorcer, migrations.RunPython.noop),
    ]
