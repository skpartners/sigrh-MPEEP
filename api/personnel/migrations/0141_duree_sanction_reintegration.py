import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0140_phases_disciplinaires"),
    ]

    operations = [
        migrations.AddField(model_name="proceduredisciplinaire", name="duree_jours", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="proceduredisciplinaire", name="reintegre_le", field=models.DateField(blank=True, null=True)),
        migrations.AddField(
            model_name="positionadministrative",
            name="procedure",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="positions", to="personnel.proceduredisciplinaire"),
        ),
        migrations.AlterField(
            model_name="positionadministrative",
            name="type",
            field=models.CharField(
                choices=[
                    ("detachement", "Détachement"), ("mise_a_disposition", "Mise à disposition"), ("disponibilite", "Disponibilité"),
                    ("hors_cadre", "Position hors-cadre"), ("exclusion", "Exclusion temporaire"),
                ],
                max_length=20,
            ),
        ),
    ]
