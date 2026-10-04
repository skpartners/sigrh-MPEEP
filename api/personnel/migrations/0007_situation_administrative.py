from django.db import migrations, models


def renseigner(apps, schema_editor):
    from personnel.situation import completer

    Agent = apps.get_model("personnel", "Agent")
    for agent in Agent.objects.all():
        champs = completer(agent, list(agent.actes.all()))
        if champs:
            agent.save(update_fields=champs)


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0006_messagerie"),
    ]

    operations = [
        migrations.AddField(model_name="agent", name="direction", field=models.CharField(blank=True, max_length=240)),
        migrations.AddField(model_name="agent", name="sous_direction", field=models.CharField(blank=True, max_length=240)),
        migrations.AddField(model_name="agent", name="service", field=models.CharField(blank=True, max_length=240)),
        migrations.AddField(model_name="agent", name="emploi", field=models.CharField(blank=True, max_length=240)),
        migrations.AddField(model_name="agent", name="type_agent", field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name="agent", name="mode_recrutement", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="agent", name="fonction", field=models.CharField(blank=True, max_length=180)),
        migrations.AddField(model_name="agent", name="prise_service_ministere", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="agent", name="prise_service_emploi", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="agent", name="prise_service_fonction", field=models.DateField(blank=True, null=True)),
        migrations.RunPython(renseigner, migrations.RunPython.noop),
    ]
