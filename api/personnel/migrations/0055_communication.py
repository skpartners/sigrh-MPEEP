from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def semer_fonction(apps, schema_editor):
    Module = apps.get_model("personnel", "ModuleHabilitation")
    Fonction = apps.get_model("personnel", "FonctionHabilitation")
    module = Module.objects.filter(libelle="Statistiques & RBAC").first()
    if module is None or module.fonctions.filter(libelle="Communication").exists():
        return
    ordre = (module.fonctions.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
    Fonction.objects.create(module=module, ordre=ordre, libelle="Communication")


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("personnel", "0054_fonctions_menu"),
    ]

    operations = [
        migrations.CreateModel(
            name="Publication",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference", models.CharField(max_length=48, unique=True)),
                ("nature", models.CharField(max_length=20, choices=[("circulaire", "Circulaire ministérielle"), ("note", "Note de service"), ("communique", "Communiqué général"), ("decision", "Décision"), ("flash", "Alerte flash")])),
                ("urgence", models.CharField(default="normal", max_length=20, choices=[("normal", "Standard"), ("important", "Important"), ("urgent", "Urgent")])),
                ("intitule", models.CharField(max_length=240)),
                ("corps", models.TextField()),
                ("perimetre", models.CharField(default="tous", max_length=20, choices=[("tous", "Ensemble des agents du portefeuille"), ("cadres", "Cadres dirigeants et hors catégorie"), ("drh", "Gestionnaires RH des entreprises publiques")])),
                ("perimetre_detail", models.CharField(blank=True, max_length=200)),
                ("statut", models.CharField(default="brouillon", max_length=20, choices=[("brouillon", "Brouillon"), ("visa", "En attente de visa"), ("diffuse", "Diffusé"), ("cloture", "Archivé")])),
                ("accuse", models.BooleanField(default=True)),
                ("echeance", models.DateField(blank=True, null=True)),
                ("signataire", models.CharField(blank=True, max_length=180)),
                ("visa", models.CharField(blank=True, max_length=120)),
                ("etape_visa", models.CharField(blank=True, max_length=120)),
                ("taux_lecture", models.PositiveSmallIntegerField(default=0)),
                ("creee_le", models.DateTimeField(auto_now_add=True)),
                ("publiee_le", models.DateTimeField(blank=True, null=True)),
                ("auteur", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="publications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "publication", "ordering": ["-publiee_le", "-creee_le", "-id"]},
        ),
        migrations.CreateModel(
            name="ConsultationFlash",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("question", models.CharField(max_length=240)),
                ("cloture", models.DateField()),
                ("participants", models.PositiveIntegerField(default=0)),
                ("options", models.JSONField(default=list)),
            ],
            options={"verbose_name": "consultation flash"},
        ),
        migrations.RunPython(semer_fonction, migrations.RunPython.noop),
    ]
