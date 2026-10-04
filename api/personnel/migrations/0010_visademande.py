from django.db import migrations, models
import django.db.models.deletion


def renseigner(apps, schema_editor):
    Demande = apps.get_model("personnel", "Demande")
    VisaDemande = apps.get_model("personnel", "VisaDemande")
    instances = [
        "Requête déposée",
        "Visa du chef de service",
        "Visa de la sous-direction",
        "Visa DRH",
        "Scan versé",
    ]
    faits = [
        "Demande déposée sur le portail, pièces reçues.",
        "Avis favorable du chef de service.",
        "Contrôle de légalité conforme.",
        "Visa du directeur des ressources humaines apposé.",
        "Papier à en-tête versé, droit ouvert et notifié à l'agent.",
    ]
    for demande in Demande.objects.all():
        if VisaDemande.objects.filter(demande=demande).exists():
            continue
        etape = demande.etape.lower().replace("é", "e").replace("ô", "o")
        courant = next((int(mot) for mot in etape.split() if mot.isdigit()), 1)
        clos = "etape 5" in etape or "notifiee" in etape or "clotur" in etape
        complement = "complement" in etape
        accord = "accord acquis" in etape or "papier" in etape
        for ordre, instance in enumerate(instances, start=1):
            if clos or ordre < courant:
                avis, commentaire, jour = ("Déposée" if ordre == 1 else "Favorable"), faits[ordre - 1], demande.depose_le
            elif accord and ordre == 4:
                avis, commentaire, jour = "Accord acquis", "Les visas sont apposés. Le papier à en-tête peut être établi.", demande.depose_le
            elif ordre == courant and complement:
                avis, commentaire, jour = "Complément requis", demande.responsable, None
            elif ordre == courant:
                avis, commentaire, jour = "En attente", "", None
            else:
                avis, commentaire, jour = "En attente", "", None
            VisaDemande.objects.create(
                demande=demande, ordre=ordre, instance=instance, avis=avis, commentaire=commentaire, date=jour,
            )


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0009_signature_et_scan_entete"),
    ]

    operations = [
        migrations.CreateModel(
            name="VisaDemande",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ordre", models.PositiveSmallIntegerField()),
                ("instance", models.CharField(max_length=120)),
                ("avis", models.CharField(max_length=40)),
                ("commentaire", models.TextField(blank=True)),
                ("date", models.DateField(blank=True, null=True)),
                ("demande", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="visas", to="personnel.demande")),
            ],
            options={
                "ordering": ["ordre"],
                "unique_together": {("demande", "ordre")},
            },
        ),
        migrations.RunPython(renseigner, migrations.RunPython.noop),
    ]
