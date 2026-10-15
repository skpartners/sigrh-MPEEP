import django.db.models.deletion
from django.db import migrations, models


def regrouper_par_emploi(apps, schema_editor):
    """Les décisions prises fiche par fiche sont additionnées par emploi."""
    Validation = apps.get_model("personnel", "ValidationBesoin")
    cumuls: dict = {}
    for validation in Validation.objects.select_related("fiche"):
        fiche = validation.fiche
        if fiche is None or fiche.emploi_id is None or fiche.campagne_id is None:
            continue
        cle = (fiche.campagne_id, fiche.emploi_id, validation.etape)
        ligne = cumuls.setdefault(cle, {"f": 0, "c": 0, "reference": "", "observations": "", "date": validation.valide_le})
        ligne["f"] += validation.fonctionnaires
        ligne["c"] += validation.contractuels
        ligne["reference"] = ligne["reference"] or validation.reference
        ligne["observations"] = ligne["observations"] or validation.observations
    Validation.objects.all().delete()
    for (campagne, emploi, etape), ligne in cumuls.items():
        Validation.objects.create(
            campagne_id=campagne, emploi_id=emploi, etape=etape, decision="modifie", fonctionnaires=ligne["f"],
            contractuels=ligne["c"], volume=ligne["f"] + ligne["c"], reference=ligne["reference"],
            observations=ligne["observations"], valide_le=ligne["date"],
        )


class Migration(migrations.Migration):
    dependencies = [("personnel", "0114_conference_maintenir_ou_modifier")]

    operations = [
        migrations.RemoveConstraint(model_name="validationbesoin", name="validation_unique_par_etape"),
        migrations.AlterField(
            model_name="validationbesoin", name="fiche",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="validations", to="personnel.fichebesoin"),
        ),
        migrations.AddField(
            model_name="validationbesoin", name="campagne",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="validations", to="personnel.campagnebesoin"),
        ),
        migrations.AddField(
            model_name="validationbesoin", name="emploi",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="validations_besoin", to="personnel.emploireferentiel"),
        ),
        migrations.RunPython(regrouper_par_emploi, migrations.RunPython.noop),
        migrations.RemoveField(model_name="validationbesoin", name="fiche"),
        migrations.AlterField(
            model_name="validationbesoin", name="campagne",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="validations", to="personnel.campagnebesoin"),
        ),
        migrations.AlterField(
            model_name="validationbesoin", name="emploi",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="validations_besoin", to="personnel.emploireferentiel"),
        ),
        migrations.AddConstraint(
            model_name="validationbesoin",
            constraint=models.UniqueConstraint(fields=("campagne", "emploi", "etape"), name="validation_unique_par_emploi_et_etape"),
        ),
    ]
