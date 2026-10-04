from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0071_admission_automatique"),
    ]

    operations = [
        migrations.AddField(
            model_name="publication",
            name="publique",
            field=models.BooleanField(default=False, help_text="Visible sur la page d'accueil, sans connexion."),
        ),
    ]
