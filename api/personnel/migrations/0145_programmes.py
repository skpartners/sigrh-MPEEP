from django.db import migrations

# Les pôles deviennent des programmes. Le programme « Administration générale » contient le Cabinet : le pôle « Cabinet »,
# qui le séparait, disparaît et ses structures (le ministère, le cabinet, les directions qui en relèvent) y sont rattachées.


def reorganiser(apps, _schema_editor):
    Pole = apps.get_model("personnel", "PoleMinisteriel")
    Entite = apps.get_model("personnel", "EntiteTutelle")
    cabinet = Pole.objects.filter(code="cabinet").first()
    if cabinet is None:
        return
    programme = Pole.objects.filter(code="administration-generale").first()
    if programme is None:
        programme = Pole.objects.create(code="administration-generale", nom="Administration générale", ordre=cabinet.ordre)
    Entite.objects.filter(pole=cabinet).update(pole=programme)
    if not Entite.objects.filter(pole=cabinet).exists():
        cabinet.delete()
    # L'administration générale passe en tête de liste, avant les programmes de portefeuille.
    programme.ordre = 0
    programme.save(update_fields=["ordre"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0144_statuts_retraite"),
    ]

    operations = [migrations.RunPython(reorganiser, migrations.RunPython.noop)]
