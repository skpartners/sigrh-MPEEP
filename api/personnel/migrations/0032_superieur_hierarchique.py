from django.db import migrations, models


LIENS = {
    "Agent": ["Chef de service"],
    "Chef de service": ["DRH"],
    "SD Carrières et Actes": ["DRH"],
    "SD Action Sociale": ["DRH"],
    "SD Formation Continue": ["DRH"],
    "DRH": [],
}


def renseigner(apps, schema_editor):
    Role = apps.get_model("personnel", "RoleMatrice")
    for role, superieurs in LIENS.items():
        Role.objects.filter(role=role).update(superieurs=superieurs)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0031_profil_structure"),
    ]

    operations = [
        migrations.AddField(
            model_name="rolematrice",
            name="superieurs",
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name="profil",
            name="superieur",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.PROTECT,
                related_name="subordonnes",
                to="auth.user",
            ),
        ),
        migrations.RunPython(renseigner, migrations.RunPython.noop),
    ]
