from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0080_ministre"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="inactivite_minutes",
            field=models.PositiveSmallIntegerField(default=15),
        ),
    ]
