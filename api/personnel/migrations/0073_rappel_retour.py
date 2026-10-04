from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("personnel", "0072_publication_publique"),
    ]

    operations = [
        migrations.CreateModel(
            name="RappelRetour",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cle", models.CharField(max_length=80)),
                ("cree_le", models.DateTimeField(auto_now_add=True)),
                (
                    "destinataire",
                    models.ForeignKey(on_delete=models.CASCADE, related_name="rappels_retours", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={"verbose_name": "rappel de retour"},
        ),
        migrations.AddConstraint(
            model_name="rappelretour",
            constraint=models.UniqueConstraint(fields=("destinataire", "cle"), name="rappel_retour_unique"),
        ),
    ]
