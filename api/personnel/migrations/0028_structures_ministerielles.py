from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0027_onglets_dotation"),
    ]

    operations = [
        migrations.AddField(
            model_name="entitetutelle",
            name="pole",
            field=models.CharField(
                choices=[
                    ("cabinet", "Structures rattachées au Cabinet"),
                    ("dgpe", "DGPE"),
                    ("dgpn", "DGPN"),
                ],
                default="dgpe",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="entitetutelle",
            name="ordre",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name="entitetutelle",
            options={"ordering": ["ordre", "nom"], "verbose_name": "structure"},
        ),
    ]
