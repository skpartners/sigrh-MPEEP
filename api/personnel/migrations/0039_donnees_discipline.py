from django.db import migrations


def charger(apps, schema_editor):
    from personnel.demo_ecrans import charger_discipline

    charger_discipline(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0038_procedures_disciplinaires"),
    ]

    operations = [migrations.RunPython(charger, migrations.RunPython.noop)]
