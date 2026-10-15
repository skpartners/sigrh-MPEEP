import unicodedata

from django.db import migrations
from django.utils.text import slugify


def _norme(texte: str) -> str:
    texte = unicodedata.normalize("NFKD", texte or "").encode("ascii", "ignore").decode()
    return " ".join(texte.lower().split())


def rattacher_les_besoins_a_un_emploi(apps, schema_editor):
    """Chaque besoin collecté doit viser un emploi : celui de la nomenclature qui porte son libellé, sinon un emploi ajouté."""
    Fiche = apps.get_model("personnel", "FicheBesoin")
    Emploi = apps.get_model("personnel", "EmploiReferentiel")
    Grade = apps.get_model("personnel", "GradeReferentiel")
    connus = {_norme(e.libelle): e for e in Emploi.objects.all()}
    for fiche in Fiche.objects.filter(emploi__isnull=True):
        emploi = connus.get(_norme(fiche.profil))
        if emploi is None:
            grade = Grade.objects.filter(code=fiche.grade).first() or Grade.objects.order_by("ordre", "code").first()
            if grade is None:
                continue
            base = slugify(fiche.profil)[:90] or "emploi"
            code, numero = base, 2
            while Emploi.objects.filter(code=code).exists():
                code, numero = f"{base}-{numero}", numero + 1
            ordre = (Emploi.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
            emploi = Emploi.objects.create(code=code, libelle=fiche.profil[:220], famille="administratif", grade=grade, ordre=ordre)
            connus[_norme(emploi.libelle)] = emploi
        fiche.emploi = emploi
        fiche.save(update_fields=["emploi"])


class Migration(migrations.Migration):
    dependencies = [("personnel", "0115_decisions_par_emploi")]

    operations = [migrations.RunPython(rattacher_les_besoins_a_un_emploi, migrations.RunPython.noop)]
