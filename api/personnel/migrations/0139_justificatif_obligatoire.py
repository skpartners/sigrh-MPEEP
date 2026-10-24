from django.db import migrations, models

# Actes dont la demande n'est pas recevable sans pièce : un événement familial ou une autorisation spéciale se prouvent,
# et l'horaire d'allaitement suppose l'acte de naissance de l'enfant ou un certificat médical.
OBLIGATOIRES = ("permission-speciale", "autorisation-speciale", "autorisation-horaire-allaitement")


def amorcer(apps, _schema_editor):
    ActeDemandable = apps.get_model("personnel", "ActeDemandable")
    for acte in ActeDemandable.objects.filter(code__in=OBLIGATOIRES):
        acte.justificatif_obligatoire = True
        acte.justificatif = acte.justificatif.replace(" (facultatif)", "")
        acte.save(update_fields=["justificatif_obligatoire", "justificatif"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0138_gestionnaire_rh"),
    ]

    operations = [
        migrations.AddField(model_name="actedemandable", name="justificatif_obligatoire", field=models.BooleanField(default=False, help_text="La demande n'est pas recevable sans justificatif.")),
        migrations.RunPython(amorcer, migrations.RunPython.noop),
    ]
