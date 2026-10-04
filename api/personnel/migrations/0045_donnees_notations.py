from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import charger_notations

    charger_notations(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0044_objectifs_evaluation"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
