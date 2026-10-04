from django.db import migrations, models

DRH = ("Kouamé N'Dri", "Directeur des Ressources Humaines • MPEEP")
SUPERIEURS = {
    "dgpe": ("Mme KONÉ Fatoumata", "Sous-Directrice du Suivi des Sociétés d'État"),
    "petroci": ("M. AKA Jean-Marc", "Directeur des Ressources Humaines, PETROCI Holding"),
    "sogepie": ("Mme DIABATÉ Mariam", "Directrice Générale Adjointe, SOGEPIE"),
    "ci-energies": ("M. KOUAMÉ Serge", "Directeur de l'Exploitation, CI-ENERGIES"),
    "paa": ("M. GNAGNE Patrice", "Chef du Service Moyens Généraux, PAA"),
    "bnetd": ("M. TANOH Alexis", "Directeur Technique, BNETD"),
    "ansut": ("Mme OUATTARA Nadia", "Directrice des Programmes, ANSUT"),
    "sndi": ("M. YEO Lassina", "Directeur des Systèmes, SNDI"),
}
SOUS_DIRECTIONS = {
    "conge": ("SD Carrières et Actes", "Gestion statutaire et mouvements"),
    "social": ("SD Action Sociale", "Fonds de solidarité et santé"),
    "formation": ("SD Formation Continue", "Plans sectoriels et stages"),
}


def renseigner(apps, schema_editor):
    VisaDemande = apps.get_model("personnel", "VisaDemande")
    for visa in VisaDemande.objects.select_related("demande", "demande__agent", "demande__agent__organisme"):
        demande = visa.demande
        agent = demande.agent
        code = agent.organisme.code if agent.organisme_id else ""
        superieur = SUPERIEURS.get(code, ("Chef de service", "Supérieur hiérarchique"))
        sous_direction = SOUS_DIRECTIONS.get(demande.categorie, ("Sous-direction métier", "Contrôle de la demande"))
        acteurs = {
            1: (agent.nom_complet if hasattr(agent, "nom_complet") else f"{agent.nom} {agent.prenoms}".strip(), agent.fonction or "Agent demandeur"),
            2: superieur,
            3: sous_direction,
            4: DRH,
            5: ("Bureau du DRH", "Versement du papier à en-tête"),
        }
        titulaire, fonction = acteurs.get(visa.ordre, ("", ""))
        reference = ""
        if visa.ordre == 4 and visa.date and visa.avis != "Complément requis":
            reference = f"KSign MPEEP-{demande.depose_le.year}-DRH-{demande.pk:05d}"
        visa.titulaire = titulaire
        visa.fonction = fonction
        visa.reference = reference
        visa.save(update_fields=["titulaire", "fonction", "reference"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0010_visademande"),
    ]

    operations = [
        migrations.AddField(model_name="visademande", name="titulaire", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="visademande", name="fonction", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="visademande", name="reference", field=models.CharField(blank=True, max_length=80)),
        migrations.RunPython(renseigner, migrations.RunPython.noop),
    ]
