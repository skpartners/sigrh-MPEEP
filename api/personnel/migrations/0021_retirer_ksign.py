from django.db import migrations


def retirer_mention_ksign(apps, schema_editor):
    for nom in ("VisaDemande", "VisaDossier"):
        Modele = apps.get_model("personnel", nom)
        for ligne in Modele.objects.filter(reference__startswith="KSign "):
            ligne.reference = ligne.reference.removeprefix("KSign ")
            ligne.save(update_fields=["reference"])
    EtapeCircuit = apps.get_model("personnel", "EtapeCircuit")
    EtapeCircuit.objects.filter(detail="SMS et KSign").update(detail="Notifiées")
    EtapeCircuit.objects.filter(detail="Sceau requis").update(detail="Visa du DRH")
    Snapshot = apps.get_model("personnel", "SnapshotExercice")
    for snap in Snapshot.objects.all():
        accueil = snap.accueil or {}
        chiffres = accueil.get("chiffres") or []
        touche = False
        for item in chiffres:
            if isinstance(item, dict) and "ANSSI" in str(item.get("detail") or ""):
                item["detail"] = "Chiffre de démonstration"
                touche = True
        if touche:
            accueil["chiffres"] = chiffres
            snap.accueil = accueil
            snap.save(update_fields=["accueil"])


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0020_modules_formation"),
    ]

    operations = [
        migrations.RunPython(retirer_mention_ksign, migrations.RunPython.noop),
    ]
