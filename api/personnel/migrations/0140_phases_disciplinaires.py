from django.db import migrations, models

# Les trois phases de suivi d'une procédure disciplinaire : instruction, audience, décision.
ANCIENNES = {"demande_explication": "instruction", "instruction_conseil": "audience", "decision_execution": "decision"}


def convertir(apps, _schema_editor):
    Procedure = apps.get_model("personnel", "ProcedureDisciplinaire")
    for ancienne, nouvelle in ANCIENNES.items():
        Procedure.objects.filter(phase=ancienne).update(phase=nouvelle)


def reconvertir(apps, _schema_editor):
    Procedure = apps.get_model("personnel", "ProcedureDisciplinaire")
    for ancienne, nouvelle in ANCIENNES.items():
        Procedure.objects.filter(phase=nouvelle).update(phase=ancienne)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0139_justificatif_obligatoire"),
    ]

    operations = [
        migrations.AlterField(
            model_name="proceduredisciplinaire",
            name="phase",
            field=models.CharField(choices=[("instruction", "Instruction"), ("audience", "Audience"), ("decision", "Décision")], default="instruction", max_length=20),
        ),
        migrations.AlterField(
            model_name="proceduredisciplinaire",
            name="degre",
            field=models.PositiveSmallIntegerField(default=1, help_text="Degré de sanction encouru (1 ou 2) ; 0 : non-lieu"),
        ),
        migrations.RunPython(convertir, reconvertir),
    ]
