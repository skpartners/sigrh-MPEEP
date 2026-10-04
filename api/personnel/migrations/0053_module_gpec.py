from django.db import migrations

COMPLEMENT = {
    "Agent": "refus",
    "Chef de service": "lecture",
    "SD Carrières et Actes": "saisie",
    "SD Action Sociale": "refus",
    "SD Formation Continue": "refus",
    "DRH": "validation",
}


def semer(apps, schema_editor):
    Module = apps.get_model("personnel", "ModuleHabilitation")
    Fonction = apps.get_model("personnel", "FonctionHabilitation")
    Role = apps.get_model("personnel", "RoleMatrice")
    module = Module.objects.filter(libelle="GPEC").first()
    if module is None:
        ordre = (Module.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        module = Module.objects.create(ordre=ordre, libelle="GPEC")
    for index, libelle in enumerate(("Expression des besoins", "Recrutement"), start=1):
        if not module.fonctions.filter(libelle=libelle).exists():
            suivant = (module.fonctions.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
            Fonction.objects.create(module=module, ordre=max(suivant, index), libelle=libelle)
    stats = Module.objects.filter(libelle="Statistiques & RBAC").first()
    if stats is not None and not stats.fonctions.filter(libelle="Vue d'ensemble").exists():
        suivant = (stats.fonctions.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        Fonction.objects.create(module=stats, ordre=suivant, libelle="Vue d'ensemble")
    taille = Module.objects.count()
    for role in Role.objects.all():
        droits = list(role.droits or [])
        while len(droits) < taille:
            droits.append(COMPLEMENT.get(role.role, "refus"))
        if droits != list(role.droits or []):
            role.droits = droits
            role.save(update_fields=["droits"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0052_precisions_compte"),
    ]

    operations = [
        migrations.RunPython(semer, migrations.RunPython.noop),
    ]
