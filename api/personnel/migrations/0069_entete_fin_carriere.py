from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import verser_entete_fin_carriere

    verser_entete_fin_carriere(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0068_fil_discipline"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
