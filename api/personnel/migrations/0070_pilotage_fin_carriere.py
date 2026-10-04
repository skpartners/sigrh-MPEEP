from django.db import migrations, models


def charger(apps, schema_editor):
    from personnel.demo_ecrans import verser_pilotage_fin_carriere

    verser_pilotage_fin_carriere(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    dependencies = [
        ("personnel", "0069_entete_fin_carriere"),
    ]

    operations = [
        migrations.CreateModel(
            name="PilotageFinCarriere",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("fil", models.JSONField(default=list)),
                ("titre", models.CharField(blank=True, max_length=240)),
                ("chapeau", models.TextField(blank=True)),
                ("reference", models.CharField(blank=True, max_length=80)),
                ("etat_passerelle", models.CharField(blank=True, max_length=180)),
                ("taux_cgrae", models.DecimalField(decimal_places=1, default=0, max_digits=5)),
                ("detail_cgrae", models.CharField(blank=True, max_length=180)),
                ("renouvellement", models.CharField(blank=True, max_length=180)),
                ("programme_titre", models.CharField(blank=True, max_length=200)),
                ("programme_texte", models.TextField(blank=True)),
            ],
            options={"verbose_name": "pilotage de fin de carrière"},
        ),
        migrations.CreateModel(
            name="ActionAccompagnement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("titre", models.CharField(max_length=160)),
                ("detail", models.CharField(blank=True, max_length=200)),
                ("quand", models.CharField(blank=True, max_length=120)),
                ("valeur", models.CharField(blank=True, max_length=80)),
                ("ordre", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ["ordre", "id"], "verbose_name": "action d'accompagnement"},
        ),
        migrations.CreateModel(
            name="DistinctionCarriere",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("rang", models.CharField(max_length=12)),
                ("titre", models.CharField(max_length=200)),
                ("detail", models.CharField(blank=True, max_length=240)),
                ("etat", models.CharField(blank=True, max_length=80)),
                ("ordre", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ["ordre", "id"], "verbose_name": "distinction"},
        ),
        migrations.RunPython(charger, migrations.RunPython.noop),
    ]
