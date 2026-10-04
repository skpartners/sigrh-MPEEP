from django.db import migrations, models


LIBELLES = (
    ("cabinet", "Structures rattachées au Cabinet"),
    ("dgpe", "DGPE"),
    ("dgpn", "DGPN"),
)


def semer(apps, schema_editor):
    Pole = apps.get_model("personnel", "PoleMinisteriel")
    Entite = apps.get_model("personnel", "EntiteTutelle")
    presents = []
    for ordre, (code, nom) in enumerate(LIBELLES, start=1):
        Pole.objects.update_or_create(code=code, defaults={"nom": nom, "ordre": ordre})
        presents.append(code)
    ordre = len(presents) + 1
    for code in Entite.objects.values_list("pole", flat=True).distinct():
        if code and code not in presents:
            Pole.objects.get_or_create(code=code, defaults={"nom": code, "ordre": ordre})
            ordre += 1


def lier(apps, schema_editor):
    Pole = apps.get_model("personnel", "PoleMinisteriel")
    Entite = apps.get_model("personnel", "EntiteTutelle")
    for item in Entite.objects.all():
        item.rattachement_id = Pole.objects.get(code=item.pole).pk
        item.save(update_fields=["rattachement"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0032_superieur_hierarchique"),
    ]

    operations = [
        migrations.CreateModel(
            name="PoleMinisteriel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.SlugField(max_length=40, unique=True)),
                ("nom", models.CharField(max_length=180)),
                ("ordre", models.PositiveSmallIntegerField(default=0)),
            ],
            options={"ordering": ["ordre", "nom"], "verbose_name": "pôle"},
        ),
        migrations.RunPython(semer, migrations.RunPython.noop),
        migrations.AddField(
            model_name="entitetutelle",
            name="rattachement",
            field=models.ForeignKey(
                null=True,
                on_delete=models.PROTECT,
                related_name="structures",
                to="personnel.poleministeriel",
            ),
        ),
        migrations.RunPython(lier, migrations.RunPython.noop),
        migrations.RemoveField(model_name="entitetutelle", name="pole"),
        migrations.RenameField(model_name="entitetutelle", old_name="rattachement", new_name="pole"),
        migrations.AlterField(
            model_name="entitetutelle",
            name="pole",
            field=models.ForeignKey(
                on_delete=models.PROTECT,
                related_name="structures",
                to="personnel.poleministeriel",
            ),
        ),
    ]
