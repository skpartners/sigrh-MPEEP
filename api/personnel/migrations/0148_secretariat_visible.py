from django.db import migrations


def secretariat(apps, schema_editor):
    from personnel.habilitations_defaut import repartir

    repartir(
        Role=apps.get_model("personnel", "RoleMatrice"),
        Fonction=apps.get_model("personnel", "FonctionHabilitation"),
        Module=apps.get_model("personnel", "ModuleHabilitation"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0147_repartition_habilitations"),
    ]

    operations = [
        migrations.RunPython(secretariat, migrations.RunPython.noop),
    ]
