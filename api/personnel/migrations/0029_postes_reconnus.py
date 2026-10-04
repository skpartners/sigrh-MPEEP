from django.db import migrations


# Intitulés libres du jeu de démonstration → emplois déjà reconnus sur les dossiers.
REMAP = {
    "Gestionnaire des effectifs": "Cadres des sociétés d'État",
    "Gestionnaires des effectifs": "Cadres des sociétés d'État",
    "Administrateur des systèmes d'information": "Ingénieurs informaticiens",
    "Analyste d'exploitation": "Ingénieurs informaticiens",
    "Chargé des moyens généraux": "Agents administratifs",
    "Contrôleurs financiers": "Corps des Administrateurs Financiers",
    "Chargés du capital humain": "Attachés d'administration",
}


def aligner(apps, schema_editor):
    Demande = apps.get_model("personnel", "DemandeDotation")
    Alerte = apps.get_model("personnel", "AlertePoste")
    for ancien, nouveau in REMAP.items():
        Demande.objects.filter(poste=ancien).update(poste=nouveau)
        Alerte.objects.filter(intitule=ancien).update(intitule=nouveau)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0028_structures_ministerielles"),
    ]

    operations = [
        migrations.RunPython(aligner, migrations.RunPython.noop),
    ]
