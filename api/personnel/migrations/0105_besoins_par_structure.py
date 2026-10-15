import django.db.models.deletion
from django.db import migrations, models


def rattacher(apps, schema_editor):
    Besoin = apps.get_model("personnel", "BesoinFormation")
    Entite = apps.get_model("personnel", "EntiteTutelle")
    structures = list(Entite.objects.exclude(niveau="ministere").order_by("id"))
    if not structures:
        Besoin.objects.all().delete()
        return
    for index, besoin in enumerate(Besoin.objects.order_by("id")):
        besoin.structure = structures[index % len(structures)]
        besoin.save(update_fields=["structure"])


class Migration(migrations.Migration):
    dependencies = [("personnel", "0104_retire_idr_pension_traitement")]

    operations = [
        migrations.AddField(
            model_name="besoinformation", name="structure",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name="besoins_formation_tmp", to="personnel.entitetutelle"),
        ),
        migrations.RunPython(rattacher, migrations.RunPython.noop),
        migrations.RemoveField(model_name="besoinformation", name="organisme"),
        migrations.AlterField(
            model_name="besoinformation", name="structure",
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="besoins_formation", to="personnel.entitetutelle"),
        ),
    ]
