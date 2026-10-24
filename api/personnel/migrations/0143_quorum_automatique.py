from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0142_campagne_conges_cloture"),
    ]

    operations = [
        migrations.AddField(model_name="parametresministere", name="quorum_automatique", field=models.BooleanField(default=True)),
    ]
