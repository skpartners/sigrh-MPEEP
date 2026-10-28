from django.db import migrations


def repartition(apps, schema_editor):
    from personnel.habilitations_defaut import repartir

    Profil = apps.get_model("personnel", "Profil")
    repartir(
        Role=apps.get_model("personnel", "RoleMatrice"),
        Fonction=apps.get_model("personnel", "FonctionHabilitation"),
        Module=apps.get_model("personnel", "ModuleHabilitation"),
    )
    # Les délégations personnelles recopiaient l'ancienne matrice, qui ouvrait presque tout le menu.
    Profil.objects.filter(administrateur=False).exclude(habilitations=None).update(habilitations=None, precisions=None)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0146_etat_statistique"),
    ]

    operations = [
        migrations.RunPython(repartition, migrations.RunPython.noop),
    ]
