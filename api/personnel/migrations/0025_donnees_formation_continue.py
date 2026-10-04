from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_formation import charger as charger_demo

    charger_demo(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0024_effectifs_et_besoins"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
