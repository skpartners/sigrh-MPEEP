from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0075_tableau_de_bord"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="civilite",
            field=models.CharField(
                blank=True,
                choices=[("Madame", "Madame"), ("Monsieur", "Monsieur")],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="parametresministere",
            name="nom",
            field=models.CharField(blank=True, max_length=160),
        ),
    ]
