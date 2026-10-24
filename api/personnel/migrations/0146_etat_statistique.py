import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("personnel", "0145_programmes"),
    ]

    operations = [
        migrations.CreateModel(
            name="EtatStatistique",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom", models.CharField(max_length=160)),
                ("modele", models.SlugField(blank=True, help_text="Composition prête dont l'état est parti (état du personnel…).", max_length=40)),
                ("configuration", models.JSONField(blank=True, default=dict)),
                ("creee_le", models.DateTimeField(auto_now_add=True)),
                ("modifiee_le", models.DateTimeField(auto_now=True)),
                ("auteur", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="etats_statistiques", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "état statistique composé", "verbose_name_plural": "états statistiques composés", "ordering": ["-modifiee_le", "-id"]},
        ),
    ]
