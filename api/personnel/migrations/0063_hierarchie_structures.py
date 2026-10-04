from django.db import migrations, models
import django.db.models.deletion


def _niveau(nom: str) -> str:
    texte = nom.casefold().replace("é", "e").replace("è", "e")
    if texte.startswith("sous-direction") or texte.startswith("sous direction") or texte.startswith("sd "):
        return "sous-direction"
    if texte.startswith("cellule"):
        return "cellule"
    if texte.startswith("service"):
        return "service"
    return "direction"


def classer(apps, schema_editor):
    Entite = apps.get_model("personnel", "EntiteTutelle")
    for item in Entite.objects.all():
        item.niveau = _niveau(item.nom)
        item.save(update_fields=["niveau"])
    drh = Entite.objects.filter(code="drh").first()
    if drh is None:
        return
    ordre = Entite.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0
    for code, nom, niveau in (
        ("sd-carrieres", "SD Carrières et Actes", "sous-direction"),
        ("sd-social", "SD Action Sociale", "sous-direction"),
        ("sd-formation", "SD Formation Continue", "sous-direction"),
        ("svc-actes", "Service des actes", "service"),
        ("svc-courrier", "Service du courrier", "service"),
    ):
        if Entite.objects.filter(code=code).exists():
            continue
        ordre += 1
        Entite.objects.create(
            code=code, nom=nom, pole_id=drh.pole_id, parent_id=drh.pk, ordre=ordre, niveau=niveau,
        )


def role_de_direction(apps, schema_editor):
    Role = apps.get_model("personnel", "RoleMatrice")
    Module = apps.get_model("personnel", "ModuleHabilitation")
    if Role.objects.filter(role="Responsable de direction").exists():
        return
    taille = Module.objects.count() or 6
    chef = Role.objects.filter(role="Chef de service").first()
    droits = list(chef.droits) if chef and chef.droits else ["lecture"] * taille
    while len(droits) < taille:
        droits.append("lecture")
    ordre = (Role.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    Role.objects.create(
        ordre=ordre,
        role="Responsable de direction",
        description="Premier responsable d'une direction",
        icone="account_balance",
        droits=droits[:taille],
        superieurs=["DRH"],
    )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0062_rappels_echeances"),
    ]

    operations = [
        migrations.AddField(
            model_name="entitetutelle",
            name="niveau",
            field=models.CharField(
                choices=[
                    ("direction", "Direction"),
                    ("sous-direction", "Sous-direction"),
                    ("service", "Service"),
                    ("cellule", "Cellule"),
                ],
                default="direction",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="entitetutelle",
            name="parent",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="enfants",
                to="personnel.entitetutelle",
            ),
        ),
        migrations.RunPython(classer, migrations.RunPython.noop),
        migrations.RunPython(role_de_direction, migrations.RunPython.noop),
    ]
