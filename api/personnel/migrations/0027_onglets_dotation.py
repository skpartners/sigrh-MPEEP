from django.db import migrations, models


CORRESPONDANCE = {
    "cadre": "affectation",
    "derogatoire": "disposition",
    "mobilite": "redeploiement",
    "concours": "reaffectation",
}


def reclasser(apps, schema_editor):
    Demande = apps.get_model("personnel", "DemandeDotation")
    for ancien, nouveau in CORRESPONDANCE.items():
        Demande.objects.filter(nature=ancien).update(nature=nouveau)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0026_organismes_formation_fictifs"),
    ]

    operations = [
        migrations.AlterField(
            model_name="demandedotation",
            name="nature",
            field=models.CharField(
                choices=[
                    ("affectation", "Affectation (Nouveau fonctionnaire)"),
                    ("disposition", "Mise à disposition"),
                    ("redeploiement", "Redéploiement"),
                    ("reaffectation", "Réaffectation après concours professionnel"),
                ],
                max_length=20,
            ),
        ),
        migrations.RunPython(reclasser, migrations.RunPython.noop),
    ]
