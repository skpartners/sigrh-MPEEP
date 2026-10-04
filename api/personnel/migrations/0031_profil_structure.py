from django.db import migrations, models


def rattacher_drh(apps, schema_editor):
    Profil = apps.get_model("personnel", "Profil")
    Entite = apps.get_model("personnel", "EntiteTutelle")
    structure = Entite.objects.filter(code="drh").first()
    if structure is None:
        return
    Profil.objects.filter(user__username="DRH-2018-044", structure__isnull=True).update(structure=structure)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0030_profil_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="profil",
            name="structure",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.PROTECT,
                related_name="comptes",
                to="personnel.entitetutelle",
            ),
        ),
        migrations.RunPython(rattacher_drh, migrations.RunPython.noop),
    ]
