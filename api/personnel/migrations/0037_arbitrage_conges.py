from django.db import migrations, models


def charger(apps, schema_editor):
    from personnel.demo_ecrans import charger_conges

    charger_conges(lambda nom: apps.get_model("personnel", nom))


class Migration(migrations.Migration):
    """Congés soumis à l'arbitrage de la sous-direction des carrières, et leur jeu de démonstration."""

    dependencies = [
        ("personnel", "0036_donnees_absences"),
    ]

    operations = [
        migrations.AddField(
            model_name="absence",
            name="instruction",
            field=models.CharField(
                blank=True,
                choices=[
                    ("pret_signature", "Prêt pour signature de l'arrêté DRH"),
                    ("approbation_auto", "Approbation automatique"),
                    ("remplacement", "Remplacement temporaire acté"),
                    ("conflit_quorum", "Conflit de quorum de service"),
                    ("signe", "Arrêté signé"),
                    ("rejete", "Demande rejetée"),
                    ("decale", "Avis défavorable : départ à décaler"),
                ],
                max_length=20,
            ),
        ),
        migrations.AddField(model_name="absence", name="interim_detail", field=models.CharField(blank=True, max_length=120)),
        migrations.RunPython(charger, migrations.RunPython.noop),
    ]
