from django.db import migrations


def renommer(apps, schema_editor):
    Fonction = apps.get_model("personnel", "FonctionHabilitation")
    Fonction.objects.filter(libelle="Vue d'ensemble").update(libelle="Tableau de bord")


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0074_photo_ministre"),
    ]

    operations = [
        migrations.RunPython(renommer, migrations.RunPython.noop),
    ]
