import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0058_reponses_sondage"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CampagnePlanConge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("exercice", models.PositiveSmallIntegerField(unique=True)),
                ("limite", models.DateField()),
                ("defaut_debut", models.DateField()),
                ("defaut_fin", models.DateField()),
                ("communique", models.TextField()),
                ("statut", models.CharField(choices=[("accord", "En attente de l'accord du DRH"), ("ouverte", "Ouverte aux agents"), ("remontee", "Remontée hiérarchique"), ("soumis", "Soumise au DRH"), ("publiee", "Arrêté publié")], default="accord", max_length=20)),
                ("creee_le", models.DateTimeField(auto_now_add=True)),
                ("accordee_par", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="campagnes_conges_accordees", to=settings.AUTH_USER_MODEL)),
                ("ouverte_par", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="campagnes_conges_ouvertes", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "campagne de planification des congés", "ordering": ["-exercice"]},
        ),
        migrations.CreateModel(
            name="PlanConge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("debut", models.DateField()),
                ("fin", models.DateField()),
                ("origine", models.CharField(choices=[("saisie", "Choix de l'agent"), ("defaut", "Date retenue d'office")], default="saisie", max_length=20)),
                ("palier", models.CharField(choices=[("agent", "Chez l'agent"), ("hierarchie", "Chez le supérieur"), ("rh", "Équipe RH"), ("drh", "DRH"), ("publie", "Arrêté publié")], default="agent", max_length=20)),
                ("agent", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plans_conges", to=settings.AUTH_USER_MODEL)),
                ("campagne", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="plans", to="personnel.campagneplanconge")),
                ("chez", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="plans_conges_a_voir", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "plan de congé", "ordering": ["agent__last_name", "agent__first_name"]},
        ),
        migrations.AddConstraint(
            model_name="planconge",
            constraint=models.UniqueConstraint(fields=("campagne", "agent"), name="plan_conge_agent_unique"),
        ),
        migrations.CreateModel(
            name="MouvementPlanConge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=20)),
                ("motif", models.TextField(blank=True)),
                ("debut", models.DateField(blank=True, null=True)),
                ("fin", models.DateField(blank=True, null=True)),
                ("cree_le", models.DateTimeField(auto_now_add=True)),
                ("auteur", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="mouvements_plans_conges", to=settings.AUTH_USER_MODEL)),
                ("plan", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="mouvements", to="personnel.planconge")),
            ],
            options={"verbose_name": "mouvement de plan de congé", "ordering": ["-cree_le", "-id"]},
        ),
        migrations.CreateModel(
            name="RepriseConge",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("debut", models.DateField()),
                ("fin", models.DateField()),
                ("motif", models.TextField()),
                ("palier", models.CharField(choices=[("hierarchie", "Chez le supérieur"), ("rh", "Équipe RH"), ("drh", "DRH"), ("acceptee", "Acceptée"), ("refusee", "Refusée")], default="hierarchie", max_length=20)),
                ("creee_le", models.DateTimeField(auto_now_add=True)),
                ("chez", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reprises_conges_a_voir", to=settings.AUTH_USER_MODEL)),
                ("demandeur", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reprises_conges", to=settings.AUTH_USER_MODEL)),
                ("plan", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reprises", to="personnel.planconge")),
            ],
            options={"verbose_name": "reprise de congé", "ordering": ["-creee_le"]},
        ),
    ]
