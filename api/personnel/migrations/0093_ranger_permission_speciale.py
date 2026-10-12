from django.db import migrations


def ranger(apps, _schema_editor):
    """« Permission spéciale d'absence » devient une sous-rubrique de « Permission »."""
    modele = apps.get_model("personnel", "ActeDemandable")
    permission = modele.objects.filter(code="permission").first()
    speciale = modele.objects.filter(code="permission-speciale").first()
    if permission is not None and speciale is not None and speciale.parent_id is None:
        speciale.parent = permission
        speciale.save(update_fields=["parent"])


def defaire(apps, _schema_editor):
    apps.get_model("personnel", "ActeDemandable").objects.filter(code="permission-speciale").update(parent=None)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0092_actedemandable_parent"),
    ]

    operations = [
        migrations.RunPython(ranger, defaire),
    ]
