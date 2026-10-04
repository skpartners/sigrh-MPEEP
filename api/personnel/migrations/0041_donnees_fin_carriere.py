from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import charger_fin_carriere

    charger_fin_carriere(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0040_dossiers_retraite"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
