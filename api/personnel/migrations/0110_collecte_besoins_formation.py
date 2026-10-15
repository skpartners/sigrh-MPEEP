from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("personnel", "0109_categorie_ministere"),
    ]

    operations = [
        migrations.AddField(
            model_name="sessionformation",
            name="inscriptions_fin",
            field=models.DateField(blank=True, help_text="Dernier jour des inscriptions", null=True),
        ),
        migrations.CreateModel(
            name="CollecteBesoinFormation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("annee", models.PositiveSmallIntegerField()),
                ("date_limite", models.DateField()),
                ("communique", models.CharField(blank=True, max_length=280)),
                ("lancee_le", models.DateTimeField()),
                ("cloturee_le", models.DateTimeField(blank=True, null=True)),
                (
                    "lancee_par",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="collectes_formation",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-lancee_le"]},
        ),
        migrations.CreateModel(
            name="CollecteReponseFormation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ras", models.BooleanField(default=False)),
                ("repondu_le", models.DateTimeField()),
                (
                    "agent",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reponses_collecte_formation",
                        to="personnel.agent",
                    ),
                ),
                (
                    "collecte",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="reponses",
                        to="personnel.collectebesoinformation",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="collectereponseformation",
            constraint=models.UniqueConstraint(fields=("collecte", "agent"), name="collecte_reponse_agent_unique"),
        ),
        migrations.AddField(
            model_name="besoinformation",
            name="agent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="besoins_formation",
                to="personnel.agent",
            ),
        ),
        migrations.AddField(
            model_name="besoinformation",
            name="collecte",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="besoins",
                to="personnel.collectebesoinformation",
            ),
        ),
        migrations.AlterField(
            model_name="besoinformation",
            name="statut",
            field=models.CharField(
                choices=[("exprime", "Exprimé"), ("retenu", "Formulé au plan"), ("couvert", "Couvert par un module")],
                default="exprime",
                max_length=10,
            ),
        ),
    ]
