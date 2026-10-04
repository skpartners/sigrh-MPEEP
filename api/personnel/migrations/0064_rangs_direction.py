from django.db import migrations, models


def reclasser(apps, schema_editor):
    Entite = apps.get_model("personnel", "EntiteTutelle")
    Pole = apps.get_model("personnel", "PoleMinisteriel")
    Role = apps.get_model("personnel", "RoleMatrice")
    Module = apps.get_model("personnel", "ModuleHabilitation")
    Pole.objects.filter(code="cabinet").update(nom="Cabinet")
    for item in Entite.objects.all():
        if item.niveau in {"direction", "cellule"}:
            item.niveau = "direction-centrale"
            item.save(update_fields=["niveau"])
    ordre = Entite.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0
    directions = {}
    for code, pole_code, nom in (
        ("cabinet", "cabinet", "Cabinet"),
        ("dgpe", "dgpe", "Direction Générale du Portefeuille de l'État"),
        ("dgpn", "dgpn", "DGPN"),
    ):
        pole = Pole.objects.filter(code=pole_code).first()
        if pole is None:
            continue
        actuelle = Entite.objects.filter(code=code).first()
        if actuelle is None:
            ordre += 1
            actuelle = Entite.objects.create(
                code=code, nom=nom, pole_id=pole.pk, niveau="direction-generale", ordre=ordre, parent_id=None,
            )
        else:
            actuelle.nom = nom
            actuelle.niveau = "direction-generale"
            actuelle.parent_id = None
            actuelle.pole_id = pole.pk
            actuelle.save()
        directions[pole_code] = actuelle
    precis = {
        "sdap": "dcrp",
        "sgpte": "dse",
        "smg-dgpe": "dchc",
        "ssi-dgpe": "dse",
        "sfmg": "dpc",
    }
    for item in Entite.objects.select_related("pole"):
        if item.niveau == "direction-generale" or item.parent_id:
            continue
        parent = None
        if item.code in precis:
            parent = Entite.objects.filter(code=precis[item.code]).first()
        elif item.niveau == "direction-centrale":
            parent = directions.get(item.pole.code)
        if parent is not None and parent.pk != item.pk:
            item.parent_id = parent.pk
            item.save(update_fields=["parent"])
    if not Role.objects.filter(role="Responsable de direction générale").exists():
        taille = Module.objects.count() or 6
        modele = Role.objects.filter(role="Responsable de direction").first()
        droits = list(modele.droits) if modele and modele.droits else ["lecture"] * taille
        while len(droits) < taille:
            droits.append("lecture")
        ordre_role = (Role.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        Role.objects.create(
            ordre=ordre_role,
            role="Responsable de direction générale",
            description="Premier responsable d'une direction générale",
            icone="account_balance",
            droits=droits[:taille],
            superieurs=["DRH"],
        )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0063_hierarchie_structures"),
    ]

    operations = [
        migrations.AlterField(
            model_name="entitetutelle",
            name="niveau",
            field=models.CharField(
                choices=[
                    ("direction-generale", "Direction générale"),
                    ("direction-centrale", "Direction centrale"),
                    ("sous-direction", "Sous-direction"),
                    ("service", "Service"),
                ],
                default="direction-centrale",
                max_length=20,
            ),
        ),
        migrations.RunPython(reclasser, migrations.RunPython.noop),
    ]
