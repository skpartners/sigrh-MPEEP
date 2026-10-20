from django.db import migrations, models


def sans_visite(apps, schema_editor):
    """La visite médicale de sortie ne relève pas de la gestion des ressources humaines : ces dossiers passent à l'étape suivante."""
    apps.get_model("personnel", "DossierRetraite").objects.filter(statut="visite").update(statut="quittance")


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0125_conges_en_deux_temps"),
    ]

    operations = [
        migrations.RunPython(sans_visite, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="dossierretraite",
            name="statut",
            field=models.CharField(
                choices=[
                    ("quittance", "Quittance de fin de gestion"),
                    ("arrete", "Arrêté signé"),
                    ("transmis", "Transmis à la CGRAE"),
                    ("notifie", "CGRAE notifiée"),
                ],
                default="quittance",
                max_length=20,
            ),
        ),
    ]
