from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0141_duree_sanction_reintegration"),
    ]

    operations = [
        migrations.AddField(model_name="campagneplanconge", name="cloturee_le", field=models.DateTimeField(blank=True, null=True)),
    ]
