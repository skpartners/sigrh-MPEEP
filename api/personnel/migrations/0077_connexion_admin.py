from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0076_identite_ministre"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="admin_matricule",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="parametresministere",
            name="connexion_active",
            field=models.BooleanField(default=False),
        ),
    ]
