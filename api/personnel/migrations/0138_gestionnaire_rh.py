from django.db import migrations


def amorcer(apps, _schema_editor):
    from personnel.habilitations_defaut import appliquer_gestionnaire_rh

    appliquer_gestionnaire_rh(apps.get_model("personnel", "RoleMatrice"))


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0137_droit_conge_remise_a_zero"),
    ]

    operations = [migrations.RunPython(amorcer, migrations.RunPython.noop)]
