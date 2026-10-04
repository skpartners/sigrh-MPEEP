from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import charger_absences

    charger_absences(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0035_autorisations_absence_blocs_ecran"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
