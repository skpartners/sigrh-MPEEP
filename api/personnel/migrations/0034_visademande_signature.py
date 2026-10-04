from django.db import migrations, models


class Migration(migrations.Migration):
    """Chaque visa d'étape garde l'image de signature apposée par le responsable."""

    dependencies = [
        ("personnel", "0033_poles_ministeriels"),
    ]

    operations = [
        migrations.AddField(
            model_name="visademande",
            name="signature",
            field=models.FileField(blank=True, upload_to="visas/%Y/%m"),
        ),
    ]
