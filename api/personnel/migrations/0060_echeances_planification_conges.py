from datetime import timedelta

from django.db import migrations, models


def reporter_echeances(apps, schema_editor):
    Campagne = apps.get_model("personnel", "CampagnePlanConge")
    for campagne in Campagne.objects.all():
        base = campagne.limite
        campagne.limite_agents = base
        campagne.limite_hierarchie = base + timedelta(days=14)
        campagne.limite_rh = base + timedelta(days=28)
        campagne.limite_drh = base + timedelta(days=42)
        campagne.save(update_fields=["limite_agents", "limite_hierarchie", "limite_rh", "limite_drh"])
    Plan = apps.get_model("personnel", "PlanConge")
    Plan.objects.filter(origine="defaut").update(origine="chef")


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0059_planification_conges"),
    ]

    operations = [
        migrations.AddField(model_name="campagneplanconge", name="limite_agents", field=models.DateField(null=True)),
        migrations.AddField(model_name="campagneplanconge", name="limite_hierarchie", field=models.DateField(null=True)),
        migrations.AddField(model_name="campagneplanconge", name="limite_rh", field=models.DateField(null=True)),
        migrations.AddField(model_name="campagneplanconge", name="limite_drh", field=models.DateField(null=True)),
        migrations.RunPython(reporter_echeances, migrations.RunPython.noop),
        migrations.AlterField(model_name="campagneplanconge", name="limite_agents", field=models.DateField()),
        migrations.AlterField(model_name="campagneplanconge", name="limite_hierarchie", field=models.DateField()),
        migrations.AlterField(model_name="campagneplanconge", name="limite_rh", field=models.DateField()),
        migrations.AlterField(model_name="campagneplanconge", name="limite_drh", field=models.DateField()),
        migrations.RemoveField(model_name="campagneplanconge", name="limite"),
        migrations.RemoveField(model_name="campagneplanconge", name="defaut_debut"),
        migrations.RemoveField(model_name="campagneplanconge", name="defaut_fin"),
        migrations.AddField(model_name="planconge", name="echeance", field=models.DateField(blank=True, null=True)),
        migrations.AlterField(
            model_name="campagneplanconge",
            name="statut",
            field=models.CharField(
                choices=[
                    ("accord", "En attente de l'accord du DRH"),
                    ("ouverte", "Ouverte aux agents"),
                    ("remontee", "Chez les responsables hiérarchiques"),
                    ("soumis", "Soumise au DRH"),
                    ("publiee", "Arrêté publié"),
                ],
                default="accord",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="planconge",
            name="origine",
            field=models.CharField(
                choices=[("saisie", "Choix de l'agent"), ("chef", "Fixé par le responsable")],
                default="saisie",
                max_length=20,
            ),
        ),
    ]
