from django.db import migrations, models


class Migration(migrations.Migration):
    """Autorisations d'absence instruites par le gestionnaire, et contenus de pilotage des écrans."""

    dependencies = [
        ("personnel", "0034_visademande_signature"),
    ]

    operations = [
        migrations.AddField(
            model_name="absence",
            name="type_autorisation",
            field=models.CharField(
                blank=True,
                choices=[
                    ("autorisation", "Autorisation d'absence"),
                    ("autorisation-speciale", "Autorisation spéciale d'absence"),
                    ("permission-speciale", "Permission spéciale d'absence"),
                ],
                max_length=40,
            ),
        ),
        migrations.AddField(model_name="absence", name="justificatif", field=models.CharField(blank=True, max_length=200)),
        migrations.AddField(
            model_name="absence",
            name="decision",
            field=models.CharField(
                blank=True,
                choices=[("en_attente", "En attente de décision"), ("validee", "Validée"), ("invalidee", "Invalidée")],
                max_length=20,
            ),
        ),
        migrations.AddField(model_name="absence", name="motif_decision", field=models.TextField(blank=True)),
        migrations.AddField(model_name="absence", name="decide_le", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="absence", name="impact_solde", field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name="absence", name="impact_detail", field=models.CharField(blank=True, max_length=120)),
        migrations.CreateModel(
            name="BlocEcran",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ecran", models.SlugField(max_length=40)),
                ("cle", models.SlugField(max_length=60)),
                ("contenu", models.JSONField(default=dict)),
            ],
            options={"ordering": ["ecran", "cle"], "unique_together": {("ecran", "cle")}},
        ),
    ]
