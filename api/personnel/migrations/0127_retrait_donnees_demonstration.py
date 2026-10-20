from django.db import migrations


def retirer(apps, schema_editor):
    """Retire les chiffres et exemples de démonstration : tout indicateur est désormais lu dans les registres."""
    def modele(nom):
        return apps.get_model("personnel", nom)

    modele("BlocEcran").objects.filter(ecran__in=["action-sociale", "fin-carriere"]).delete()
    for nom in ("EtapeCircuit", "DispositifSocial", "ActionAccompagnement", "DistinctionCarriere", "PilotageFinCarriere", "SessionParitaire"):
        modele(nom).objects.all().delete()
    # L'effectif d'une branche se compte dans le registre des agents ; l'ancienne valeur saisie n'a plus d'usage.
    modele("BranchePlafond").objects.update(effectif=0, plafond=0)
    modele("ExerciceDotation").objects.filter(fondement="Décret n° 2024-118").update(fondement="")
    for etape in modele("ParcoursEtape").objects.all():
        metas = [meta for meta in (etape.metas or []) if meta.get("value") != "12 dossiers"]
        if metas != (etape.metas or []):
            etape.metas = metas
            etape.save(update_fields=["metas"])
    for instantane in modele("SnapshotExercice").objects.all():
        accueil = dict(instantane.accueil or {})
        accueil.pop("chiffres", None)
        accueil["piliers"] = [{cle: valeur for cle, valeur in pilier.items() if cle != "indicateur"} for pilier in accueil.get("piliers", [])]
        instantane.accueil = accueil
        instantane.dashboard = {}
        instantane.carriere = {cle: valeur for cle, valeur in (instantane.carriere or {}).items() if cle in ("titre", "chapo")}
        instantane.save(update_fields=["accueil", "dashboard", "carriere"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0126_retraite_sans_visite_medicale"),
    ]

    operations = [migrations.RunPython(retirer, migrations.RunPython.noop)]
