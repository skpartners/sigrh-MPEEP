import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0061_delai_campagne_conges"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="RappelEcheance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("cle", models.CharField(max_length=80)),
                ("cree_le", models.DateTimeField(auto_now_add=True)),
                (
                    "campagne",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rappels",
                        to="personnel.campagneplanconge",
                    ),
                ),
                (
                    "destinataire",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rappels_echeances",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "rappel d'échéance",
                "constraints": [
                    models.UniqueConstraint(fields=("campagne", "destinataire", "cle"), name="rappel_echeance_unique"),
                ],
            },
        ),
    ]
