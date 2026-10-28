from django.db import migrations, models


def verser_le_ministre(apps, schema_editor):
    from personnel.models import ParametresMinistere
    from personnel.parametres import assurer_compte_ministre

    objet = ParametresMinistere.objects.filter(pk=1).first()
    if objet is None or not (objet.nom or "").strip():
        return
    if not (objet.ministre_matricule or "").strip():
        objet.ministre_matricule = "MINISTRE"
        objet.save(update_fields=["ministre_matricule"])
    assurer_compte_ministre(objet)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0149_secretariat_secretaire"),
    ]

    operations = [
        migrations.AddField(
            model_name="parametresministere",
            name="ministre_matricule",
            field=models.CharField(
                blank=True,
                help_text="Matricule du compte ministre, renseigné depuis les paramètres. Provisoire tant que le matricule définitif n'est pas connu.",
                max_length=150,
            ),
        ),
        migrations.RunPython(verser_le_ministre, migrations.RunPython.noop),
    ]
