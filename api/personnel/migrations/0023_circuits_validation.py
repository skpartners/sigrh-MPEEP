import django.db.models.deletion
from django.db import migrations, models


ABSENCES = [
    ("evenement-familial", "Autorisation d'absence (événement familial)", 1),
    ("convenance-personnelle", "Autorisation d'absence (convenance personnelle)", 2),
    ("mission", "Absence pour mission de service", 3),
    ("formation", "Absence pour formation", 4),
]


def charger_absences(apps, schema_editor):
    TypeAbsence = apps.get_model("personnel", "TypeAbsence")
    for code, libelle, ordre in ABSENCES:
        TypeAbsence.objects.update_or_create(code=code, defaults={"libelle": libelle, "ordre": ordre})


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0022_retirer_ena_fdfp"),
    ]

    operations = [
        migrations.CreateModel(
            name="TypeAbsence",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.SlugField(max_length=40, unique=True)),
                ("libelle", models.CharField(max_length=120)),
                ("ordre", models.PositiveSmallIntegerField(default=0)),
            ],
            options={
                "ordering": ["ordre", "libelle"],
            },
        ),
        migrations.CreateModel(
            name="CircuitValidation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom", models.CharField(max_length=120)),
            ],
            options={
                "ordering": ["nom"],
            },
        ),
        migrations.CreateModel(
            name="EtapeValidation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ordre", models.PositiveSmallIntegerField()),
                ("instance", models.CharField(max_length=120)),
                ("fonction", models.CharField(blank=True, max_length=160)),
                (
                    "circuit",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="etapes",
                        to="personnel.circuitvalidation",
                    ),
                ),
            ],
            options={
                "ordering": ["ordre"],
                "unique_together": {("circuit", "ordre")},
            },
        ),
        migrations.CreateModel(
            name="AttributionCircuit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "famille",
                    models.CharField(choices=[("conge", "Congé"), ("absence", "Absence")], max_length=20),
                ),
                ("code", models.SlugField(max_length=40)),
                (
                    "circuit",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attributions",
                        to="personnel.circuitvalidation",
                    ),
                ),
            ],
            options={
                "unique_together": {("famille", "code")},
            },
        ),
        migrations.RunPython(charger_absences, migrations.RunPython.noop),
    ]
