from django.db import migrations, models


def semer_fonction(apps, schema_editor):
    Module = apps.get_model("personnel", "ModuleHabilitation")
    Fonction = apps.get_model("personnel", "FonctionHabilitation")
    module = Module.objects.filter(libelle="Statistiques & RBAC").first()
    if module is None or module.fonctions.filter(libelle="Paramètres").exists():
        return
    ordre = (module.fonctions.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    Fonction.objects.create(module=module, ordre=ordre, libelle="Paramètres")


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0073_rappel_retour"),
    ]

    operations = [
        migrations.CreateModel(
            name="ParametresMinistere",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("photo", models.FileField(blank=True, upload_to="ministere")),
            ],
            options={
                "verbose_name": "paramètres du ministère",
                "verbose_name_plural": "paramètres du ministère",
            },
        ),
        migrations.RunPython(semer_fonction, migrations.RunPython.noop),
    ]
