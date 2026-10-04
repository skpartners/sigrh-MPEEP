from django.db import migrations, models
import django.db.models.deletion


def marquer_admission(apps, schema_editor):
    TypeFinCarriere = apps.get_model("personnel", "TypeFinCarriere")
    TypeFinCarriere.objects.filter(code="retraite").update(automatique=True)
    motif = TypeFinCarriere.objects.filter(code="retraite").first()
    if motif is None:
        return
    Dossier = apps.get_model("personnel", "DossierRetraite")
    Dossier.objects.filter(motif__isnull=True).update(motif=motif)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0070_pilotage_fin_carriere"),
    ]

    operations = [
        migrations.AddField(
            model_name="typefincarriere",
            name="automatique",
            field=models.BooleanField(default=False, help_text="L'admission à la retraite s'ouvre seule, à la limite d'âge."),
        ),
        migrations.AddField(
            model_name="dossierretraite",
            name="motif",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="dossiers", to="personnel.typefincarriere"),
        ),
        migrations.AddField(
            model_name="dossierretraite",
            name="date_cessation",
            field=models.DateField(blank=True, help_text="Date d'effet des cessations saisies (démission, décès…).", null=True),
        ),
        migrations.AddField(
            model_name="dossierretraite",
            name="decret",
            field=models.CharField(blank=True, help_text="Référence du décret présidentiel qui reporte la retraite.", max_length=80),
        ),
        migrations.AddField(
            model_name="dossierretraite",
            name="date_decret",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(marquer_admission, migrations.RunPython.noop),
    ]
