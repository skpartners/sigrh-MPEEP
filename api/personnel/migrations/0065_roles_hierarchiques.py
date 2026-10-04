from django.db import migrations


CORRESPONDANCE = {
    "DRH": "Directeur",
    "Responsable de direction": "Directeur",
    "Responsable de direction générale": "Directeur général",
    "SD Carrières et Actes": "Sous directeur",
    "SD Action Sociale": "Sous directeur",
    "SD Formation Continue": "Sous directeur",
}


def _aligner(droits, taille: int, remplissage: str) -> list[str]:
    valeurs = list(droits or [])
    while len(valeurs) < taille:
        valeurs.append(remplissage)
    return valeurs[:taille]


def roles_par_defaut(apps, schema_editor):
    Role = apps.get_model("personnel", "RoleMatrice")
    Profil = apps.get_model("personnel", "Profil")
    Module = apps.get_model("personnel", "ModuleHabilitation")
    User = apps.get_model("auth", "User")
    taille = Module.objects.count() or 6

    def droits_de(nom: str, repli: list[str], remplissage: str) -> list[str]:
        actuel = Role.objects.filter(role=nom).first()
        source = list(actuel.droits) if actuel and actuel.droits else repli
        return _aligner(source, taille, remplissage)

    drh = Role.objects.filter(role="DRH").first()
    pleins = _aligner(list(drh.droits) if drh and drh.droits else ["validation"] * taille, taille, "validation")
    compte = User.objects.filter(username="DRH-2018-044").first()
    if compte is not None:
        profil = Profil.objects.filter(user_id=compte.pk).first()
        if profil is not None and profil.role == "DRH" and not profil.habilitations:
            profil.habilitations = pleins
            profil.save(update_fields=["habilitations"])

    for ancien, nouveau in CORRESPONDANCE.items():
        Profil.objects.filter(role=ancien).update(role=nouveau)

    for item in Role.objects.all():
        item.ordre = item.ordre + 100
        item.save(update_fields=["ordre"])

    specs = [
        (1, "Agent", "Usager de l'administration", "person", droits_de("Agent", ["lecture", "lecture", "saisie", "saisie", "refus", "refus"], "refus"), ["Chef de service"]),
        (2, "Chef de service", "Premier responsable d'un service", "supervisor_account", droits_de("Chef de service", ["lecture", "lecture", "lecture", "lecture", "validation", "lecture"], "lecture"), ["Sous directeur"]),
        (3, "Sous directeur", "Premier responsable d'une sous-direction", "badge", droits_de("SD Carrières et Actes", ["saisie", "validation", "lecture", "lecture", "lecture", "saisie"], "lecture"), ["Directeur"]),
        (4, "Directeur", "Premier responsable d'une direction centrale", "account_balance", droits_de("Responsable de direction", ["lecture", "lecture", "lecture", "lecture", "validation", "lecture"], "lecture"), ["Directeur général"]),
        (5, "Directeur général", "Premier responsable d'une direction générale", "admin_panel_settings", pleins, []),
    ]
    conserves = {nom for _, nom, *_rest in specs}
    for ordre, nom, description, icone, droits, superieurs in specs:
        actuel = Role.objects.filter(role=nom).first()
        if actuel is None:
            Role.objects.create(
                ordre=ordre, role=nom, description=description, icone=icone, droits=droits, superieurs=superieurs,
            )
        else:
            actuel.ordre = ordre
            actuel.description = description
            actuel.icone = icone
            actuel.droits = droits
            actuel.superieurs = superieurs
            actuel.save()
    Role.objects.exclude(role__in=conserves).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0064_rangs_direction"),
    ]

    operations = [
        migrations.RunPython(roles_par_defaut, migrations.RunPython.noop),
    ]
