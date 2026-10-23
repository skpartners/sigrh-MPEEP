from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0128_adhesion_juridique"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="signataire_matricule",
            field=models.CharField(blank=True, help_text="Matricule de l'agent qui signe les documents finaux", max_length=32),
        ),
    ]
