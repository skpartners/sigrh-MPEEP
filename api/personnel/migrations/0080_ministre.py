from django.db import migrations


def placer_le_ministre(apps, schema_editor):
    Pole = apps.get_model("personnel", "PoleMinisteriel")
    Structure = apps.get_model("personnel", "EntiteTutelle")
    Role = apps.get_model("personnel", "RoleMatrice")
    Module = apps.get_model("personnel", "ModuleHabilitation")
    pole = Pole.objects.filter(code="cabinet").first()
    if pole is not None:
        ministere = Structure.objects.filter(code="ministere").first()
        if ministere is None:
            ministere = Structure.objects.create(
                code="ministere",
                nom="Ministère",
                pole_id=pole.pk,
                niveau="ministere",
                ordre=0,
            )
        else:
            ministere.niveau = "ministere"
            ministere.parent_id = None
            ministere.save(update_fields=["niveau", "parent"])
        Structure.objects.filter(code__in=["cabinet", "dgpe", "dgpn"], parent__isnull=True).update(parent_id=ministere.pk)
    taille = Module.objects.count() or 6
    directeur = Role.objects.filter(role="Directeur général").first()
    if directeur is not None:
        directeur.superieurs = ["Ministre"]
        directeur.save(update_fields=["superieurs"])
    if not Role.objects.filter(role="Ministre").exists():
        Role.objects.create(
            ordre=6,
            role="Ministre",
            description="Au sommet de la chaîne hiérarchique",
            icone="assured_workload",
            droits=["validation"] * taille,
            superieurs=[],
        )
    from personnel.habilitations_defaut import appliquer

    appliquer()


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0079_administrateur"),
    ]

    operations = [
        migrations.RunPython(placer_le_ministre, migrations.RunPython.noop),
    ]
