from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0007_situation_administrative"),
    ]

    operations = [
        migrations.AddField(
            model_name="piecejointe",
            name="fichier",
            field=models.FileField(blank=True, upload_to="pieces/%Y/%m"),
        ),
    ]
