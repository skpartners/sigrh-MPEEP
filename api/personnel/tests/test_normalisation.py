import pytest
from django.contrib.auth.models import User
from django.core.management import call_command

from personnel.models import Agent
from personnel.normalisation import espaces, nom_majuscules, nom_structure, normaliser_identite, prenoms_titre


def test_espaces_et_unicode():
    assert espaces("  ADJE   Aka  ") == "ADJE Aka"
    assert espaces("Sébastien") == "Sébastien"


@pytest.mark.parametrize("brut, attendu", [
    ("jean-marie", "Jean-Marie"),
    ("N'GUESSAN sylvain", "N'Guessan Sylvain"),
    ("m'pa  florent", "M'Pa Florent"),
    ("Sosthène", "Sosthène"),
])
def test_prenoms_titre(brut, attendu):
    assert prenoms_titre(brut) == attendu


def test_nom_majuscules():
    assert nom_majuscules(" Kone  ") == "KONE"


def test_nom_de_naissance_separe():
    identite = normaliser_identite("ACHIEPO NEE GUEDE", "Guededa Flora")
    assert (identite.nom, identite.nom_jeune_fille, identite.prenoms) == ("ACHIEPO", "GUEDE", "Guededa Flora")
    assert identite.douteux == []


def test_nom_compose_apres_nee():
    identite = normaliser_identite("DIOMANDE NEE N'GORAN", "Allou Ninon")
    assert (identite.nom, identite.nom_jeune_fille) == ("DIOMANDE", "N'GORAN")


def test_epouse_dans_les_prenoms():
    identite = normaliser_identite("KONE", "Miyala Annick Epse Bassole")
    assert (identite.nom, identite.nom_jeune_fille, identite.prenoms) == ("BASSOLE", "KONE", "Miyala Annick")
    assert identite.douteux  # à faire valider


def test_nom_compose_signale_sans_etre_modifie():
    identite = normaliser_identite("ADJE", "Aka Tanoh Orphelia Carmel Olinda")
    assert identite.nom == "ADJE"
    assert identite.douteux


@pytest.mark.parametrize("nom, prenoms, njf", [
    ("ACHIEPO NEE GUEDE", "Guededa Flora", ""),
    ("KONE", "Miyala Annick Epse Bassole", ""),
    ("ADJE", "aka tanoh", ""),
])
def test_idempotent(nom, prenoms, njf):
    une = normaliser_identite(nom, prenoms, njf)
    deux = normaliser_identite(une.nom, une.prenoms, une.nom_jeune_fille)
    assert (deux.nom, deux.prenoms, deux.nom_jeune_fille) == (une.nom, une.prenoms, une.nom_jeune_fille)


@pytest.mark.django_db
def test_commande_apercu_puis_application(tmp_path, capsys):
    from personnel.models import Organisme
    organisme = Organisme.objects.create(code="mpeep", nom="Ministère", sigle="MPEEP")
    champs = dict(corps="x", grade="", echelon="", structure="s", organisme=organisme)
    agent = Agent.objects.create(matricule="1A", nom="X", prenoms="Y", initiales="AG", **champs)
    Agent.objects.filter(pk=agent.pk).update(nom="ACHIEPO NEE GUEDE", prenoms="guededa  flora")  # données antérieures à la mise en forme à l'enregistrement
    agent.refresh_from_db()
    User.objects.create_user(username="1A", last_name="ACHIEPO NEE GUEDE", first_name="guededa  flora")
    rapport = tmp_path / "r.csv"

    call_command("normaliser_identites", rapport=str(rapport))
    agent.refresh_from_db()
    assert agent.nom == "ACHIEPO NEE GUEDE"  # aperçu : rien n'est écrit
    assert "1A" in rapport.read_text(encoding="utf-8-sig")

    call_command("normaliser_identites", "--appliquer", rapport=str(rapport))
    agent.refresh_from_db()
    assert (agent.nom, agent.nom_jeune_fille, agent.prenoms) == ("ACHIEPO", "GUEDE", "Guededa Flora")
    assert User.objects.get(username="1A").last_name == "ACHIEPO"

    call_command("normaliser_identites", "--appliquer", rapport=str(rapport))  # idempotent
    assert rapport.read_text(encoding="utf-8-sig").strip().count("\n") == 0  # en-tête seul


@pytest.mark.parametrize("brut, attendu", [
    ("DIRECTION DES AFFAIRES JURIDIQUES", "Direction des Affaires Juridiques"),
    ("Direction des Affaires Juridiques (DGPE)", "Direction des Affaires Juridiques (DGPE)"),
    ("SOUS DIRECTION TECHNOLOGIE ,TELECOMMUNICATION , POSTE, ET FINANCES", "Sous-direction Technologie, Télécommunication, Poste et Finances"),
    ("SOUS-DIRECTION SSTÈME INFORMATIQUE", "Sous-direction Système Informatique"),
    ("Sous-Direction du Portefeuillle Electricité, Hydrocabures, Eau et Assainissement", "Sous-direction du Portefeuille Électricité, Hydrocarbures, Eau et Assainissement"),
    ("SERVICETECHNOLOGIE ,TELECOMMUNICATION ET POSTE", "Service Technologie, Télécommunication et Poste"),
    ("SERVICE RATTACHE A LA DIRECTION GENRALE", "Service Rattaché à la Direction Générale"),
    ("DIRECTION DE L'EXPERTISE", "Direction de l'Expertise"),
    ("SD Carrières et Actes", "Sous-direction Carrières et Actes"),
    ("Chef de service gestion des projets( avec rang de sous-directeur)", "Chef de Service Gestion des Projets (avec rang de sous-directeur)"),
])
def test_nom_structure(brut, attendu):
    assert nom_structure(brut) == attendu
    assert nom_structure(attendu) == attendu  # idempotent


@pytest.mark.django_db
def test_la_saisie_est_formatee_a_l_enregistrement():
    from personnel.models import EntiteTutelle, Organisme, PoleMinisteriel
    organisme = Organisme.objects.create(code="mpeep", nom="Ministère", sigle="MPEEP")
    agent = Agent.objects.create(
        matricule="2B", nom="kone nee traore", prenoms="MARIAM  aminata", initiales="KM", corps="x", grade="", echelon="",
        structure="DIRECTION DES RESSOURCES HUMAINES", service="service du courrier", organisme=organisme,
    )
    assert (agent.nom, agent.nom_jeune_fille, agent.prenoms) == ("KONE", "TRAORE", "Mariam Aminata")
    assert (agent.structure, agent.service) == ("Direction des Ressources Humaines", "Service du Courrier")
    pole = PoleMinisteriel.objects.create(code="p", nom="Pôle", ordre=1) if PoleMinisteriel._meta.get_field("ordre") else None
    entite = EntiteTutelle.objects.create(code="e1", nom="MOYENS GENERAUX", pole=pole, niveau="service")
    assert entite.nom == "Moyens Généraux"


def test_sigle_de_structure_ecrit_en_toutes_lettres():
    from personnel.normalisation import nom_complet_structure

    assert nom_complet_structure("DAAF") == "Direction des Affaires Administratives et Financières"
    assert nom_complet_structure("Service du Budget") == "Service du Budget"
    assert nom_complet_structure("") == ""
