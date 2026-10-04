from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import verser_cadre_discipline

    verser_cadre_discipline(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0067_cadre_discipline"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
