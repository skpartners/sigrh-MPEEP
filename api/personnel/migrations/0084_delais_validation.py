from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0083_tableau_croise_dynamique"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="delai_visa_acte_jours",
            field=models.PositiveSmallIntegerField(default=2),
        ),
        migrations.AddField(
            model_name="parametresministere",
            name="delai_validation_hierarchie_jours",
            field=models.PositiveSmallIntegerField(default=3),
        ),
    ]
