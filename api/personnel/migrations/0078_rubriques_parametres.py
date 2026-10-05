from django.db import migrations


def rubriques(apps, schema_editor):
    from personnel.habilitations_defaut import appliquer

    appliquer(
        Role=apps.get_model("personnel", "RoleMatrice"),
        Fonction=apps.get_model("personnel", "FonctionHabilitation"),
        Compte=apps.get_model("personnel", "Profil"),
        Utilisateur=apps.get_model("auth", "User"),
    )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0077_connexion_admin"),
    ]

    operations = [
        migrations.RunPython(rubriques, migrations.RunPython.noop),
    ]
