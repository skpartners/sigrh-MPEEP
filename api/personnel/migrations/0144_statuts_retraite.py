from django.db import migrations, models

# Les trois étapes d'un dossier de départ à la retraite : agent notifié, réception des dossiers, transmission à la CGRAE.
CORRESPONDANCE = {"quittance": "notifie", "arrete": "reception", "notifie": "transmis", "transmis": "transmis"}


def convertir(apps, _schema_editor):
    Dossier = apps.get_model("personnel", "DossierRetraite")
    for dossier in Dossier.objects.all():
        nouveau = CORRESPONDANCE.get(dossier.statut, "notifie")
        if nouveau != dossier.statut:
            dossier.statut = nouveau
            dossier.save(update_fields=["statut"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0143_quorum_automatique"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dossierretraite",
            name="statut",
            field=models.CharField(
                choices=[("notifie", "Agent notifié"), ("reception", "Réception des dossiers"), ("transmis", "Transmission à la CGRAE")],
                default="notifie", max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="notification",
            name="categorie",
            field=models.CharField(
                choices=[("visa", "Visa à apposer"), ("demande", "Demande en circuit"), ("releve", "Avis et mouvements"), ("dossier", "Dossier agent"), ("systeme", "Système")],
                max_length=20,
            ),
        ),
        migrations.RunPython(convertir, migrations.RunPython.noop),
    ]
