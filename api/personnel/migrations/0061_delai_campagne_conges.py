from django.db import migrations, models


def reprendre_le_delai(apps, schema_editor):
    Campagne = apps.get_model("personnel", "CampagnePlanConge")
    for campagne in Campagne.objects.all():
        campagne.delai = campagne.limite_drh
        campagne.save(update_fields=["delai"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0060_echeances_planification_conges"),
    ]

    operations = [
        migrations.AddField(model_name="campagneplanconge", name="delai", field=models.DateField(null=True)),
        migrations.RunPython(reprendre_le_delai, migrations.RunPython.noop),
        migrations.AlterField(model_name="campagneplanconge", name="delai", field=models.DateField()),
    ]
