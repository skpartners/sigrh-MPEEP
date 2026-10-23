from django.db import migrations, models


def amorcer(apps, _schema_editor):
    from personnel.habilitations_defaut import appliquer_secretariat

    appliquer_secretariat(
        Module=apps.get_model("personnel", "ModuleHabilitation"),
        Fonction=apps.get_model("personnel", "FonctionHabilitation"),
        Role=apps.get_model("personnel", "RoleMatrice"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0130_acte_horaire_allaitement"),
    ]

    operations = [
        migrations.AddField(model_name="demande", name="document_signe", field=models.FileField(blank=True, upload_to="documents-signes/%Y/%m")),
        migrations.AddField(model_name="demande", name="signe_le", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="demande", name="signe_par", field=models.CharField(blank=True, max_length=120)),
        migrations.RunPython(amorcer, migrations.RunPython.noop),
    ]
