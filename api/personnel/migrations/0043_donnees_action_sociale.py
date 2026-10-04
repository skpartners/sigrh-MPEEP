from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import charger_action_sociale

    charger_action_sociale(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0042_requetes_sociales"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
