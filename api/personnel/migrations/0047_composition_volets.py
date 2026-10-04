from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0046_composition_statistique"),
    ]

    operations = [
        migrations.AddField(
            model_name="compositionstatistique",
            name="volets",
            field=models.JSONField(default=list, help_text="Dossiers réunis dans la même composition."),
        ),
    ]
