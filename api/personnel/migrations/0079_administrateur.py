from django.db import migrations, models


def detacher_administrateur(apps, schema_editor):
    Profil = apps.get_model("personnel", "Profil")
    User = apps.get_model("auth", "User")
    Parametres = apps.get_model("personnel", "ParametresMinistere")
    matricules = set(User.objects.filter(is_staff=True).values_list("username", flat=True))
    params = Parametres.objects.filter(pk=1).first()
    if params and params.admin_matricule:
        matricules.add(params.admin_matricule)
    if not matricules:
        return
    Profil.objects.filter(user__username__in=list(matricules)).update(
        administrateur=True,
        structure=None,
        superieur=None,
        interim=None,
        habilitations=None,
        precisions=None,
        role="Administrateur",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0078_rubriques_parametres"),
    ]

    operations = [
        migrations.AddField(
            model_name="profil",
            name="administrateur",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(detacher_administrateur, migrations.RunPython.noop),
    ]
