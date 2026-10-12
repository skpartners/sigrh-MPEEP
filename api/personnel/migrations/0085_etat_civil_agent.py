from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0084_delais_validation"),
    ]

    operations = [
        migrations.AddField(model_name="agent", name="adresse_residence", field=models.CharField(blank=True, max_length=240)),
        migrations.AddField(model_name="agent", name="contact_urgence_nom", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="agent", name="contact_urgence_telephone", field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name="agent", name="date_mariage", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="agent", name="lieu_naissance", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="agent", name="nom_jeune_fille", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="agent", name="numero_cni", field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(
            model_name="agent",
            name="statut_matrimonial",
            field=models.CharField(
                blank=True,
                choices=[("celibataire", "Célibataire"), ("marie", "Marié(e)"), ("veuf", "Veuf / veuve"), ("divorce", "Divorcé(e)")],
                max_length=12,
            ),
        ),
        migrations.AddField(model_name="agent", name="telephone_secondaire", field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name="agent", name="ville", field=models.CharField(blank=True, max_length=120)),
    ]
