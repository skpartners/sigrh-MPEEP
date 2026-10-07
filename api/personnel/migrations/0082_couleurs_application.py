from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0081_inactivite_session"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="couleur_principale",
            field=models.CharField(default="#042F32", max_length=7),
        ),
        migrations.AddField(
            model_name="parametresministere",
            name="couleur_accent",
            field=models.CharField(default="#D6FFCB", max_length=7),
        ),
    ]
