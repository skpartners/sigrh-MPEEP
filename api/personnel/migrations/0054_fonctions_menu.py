from django.db import migrations

AJOUTS = {
    "Carrières & Actes": ("Accueil",),
    "Social & Santé": ("Action sociale",),
    "Formations": ("Formation continue",),
    "Statistiques & RBAC": ("Habilitations",),
    "GPEC": ("GPEC",),
}


def semer(apps, schema_editor):
    Module = apps.get_model("personnel", "ModuleHabilitation")
    Fonction = apps.get_model("personnel", "FonctionHabilitation")
    for libelle_module, fonctions in AJOUTS.items():
        module = Module.objects.filter(libelle=libelle_module).first()
        if module is None:
            continue
        for libelle in fonctions:
            if module.fonctions.filter(libelle=libelle).exists():
                continue
            ordre = (module.fonctions.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
            Fonction.objects.create(module=module, ordre=ordre, libelle=libelle)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0053_module_gpec"),
    ]

    operations = [
        migrations.RunPython(semer, migrations.RunPython.noop),
    ]
