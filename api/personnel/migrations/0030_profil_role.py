from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0029_postes_reconnus"),
    ]

    operations = [
        migrations.AddField(
            model_name="profil",
            name="role",
            field=models.CharField(default="Agent", max_length=80),
        ),
    ]
