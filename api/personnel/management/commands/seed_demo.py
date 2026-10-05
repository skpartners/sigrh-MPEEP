"""Jeu de démonstration du prototype SIGRH.

Toutes les personnes, références et montants sont fictifs. Les tirages utilisent un
générateur à graine fixe : le jeu est identique à chaque exécution.
"""

import random
from datetime import date, datetime, timedelta

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from personnel.structures import POLES, RATTACHEMENTS, STRUCTURES
from personnel.models import (
    Absence,
    Acte,
    Agent,
    AlerteReleve,
    Communication,
    Conversation,
    AlertePoste,
    BranchePlafond,
    CampagneBesoin,
    Demande,
    DemandeDotation,
    EntiteTutelle,
    PoleMinisteriel,
    EtapeCircuit,
    ExerciceDotation,
    FicheBesoin,
    FiliereBesoin,
    JournalEffectif,
    Passerelle,
    Evaluation,
    Formation,
    LigneAvancement,
    Message,
    ModuleHabilitation,
    MouvementStrategique,
    Notification,
    Organisme,
    ParcoursEtape,
    Participation,
    AyantDroit,
    DispositifSocial,
    EnveloppeSociale,
    PieceJointe,
    PrestationSociale,
    Profil,
    SituationSociale,
    RoleMatrice,
    SnapshotExercice,
    VisaDemande,
    VisaDossier,
    VisaEnAttente,
)

DEMO_PASSWORD = "Sigrh-Dev-2026"

DRH = ("Kouamé N'Dri", "Directeur des Ressources Humaines • MPEEP")

# Supérieur hiérarchique (N+1) par structure : sert aux évaluations et aux visas du dossier.
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


class Command(BaseCommand):
    help = "Charge le jeu de démonstration du prototype SIGRH (données fictives)."

    @transaction.atomic
    def handle(self, *args, **options):
        self.rng = random.Random(2026)
        organismes = self._organismes()
        agents = self._agents(organismes)
        drh = self._user(organismes["dgpe"])
        self._actes(agents)
        self._situation(agents)
        self._dossiers(agents)
        self._visas(agents)
        self._avancements(agents)
        self._circuits(agents)
        self._carrieres(agents, organismes)
        self._snapshot()
        self._notifications(drh)
        self._messagerie(drh, self._comptes_agents(agents))
        # Après _circuits (qui recrée les demandes) : sessions planifiées, candidatures, besoins.
        from personnel import models as modeles
        from personnel.demo_formation import charger as charger_formation

        charger_formation(lambda nom: getattr(modeles, nom))
        from personnel import demo_ecrans

        demo_ecrans.charger_tout(lambda nom: getattr(modeles, nom))
        self._effectifs(drh)
        self._communications(drh)
        self._nomenclature()
        from personnel.habilitations_defaut import appliquer

        appliquer()
        self.stdout.write(self.style.SUCCESS("Jeu de démonstration SIGRH chargé."))

    # --- Référentiels --------------------------------------------------------

    def _organismes(self) -> dict[str, Organisme]:
        rows = [
            ("dgpe", "DGPE", "Direction Générale du Portefeuille de l'État"),
            ("cabinet", "CAB", "Cabinet du Ministre du Portefeuille de l'État"),
            ("petroci", "PETROCI", "PETROCI Holding"),
            ("ci-energies", "CI-ENERGIES", "Côte d'Ivoire Énergies"),
            ("sogepie", "SOGEPIE", "Société de Gestion du Patrimoine Immobilier de l'État"),
            ("paa", "PAA", "Port Autonome d'Abidjan"),
            ("ansut", "ANSUT", "Agence Nationale du Service Universel des Télécommunications"),
            ("bnetd", "BNETD", "Bureau National d'Études Techniques et de Développement"),
            ("sndi", "SNDI", "Société Nationale de Développement Informatique"),
        ]
        found = {}
        for code, sigle, nom in rows:
            item, _created = Organisme.objects.update_or_create(code=code, defaults={"sigle": sigle, "nom": nom})
            found[code] = item
        return found

    def _user(self, organisme: Organisme) -> User:
        user, _created = User.objects.get_or_create(username="DRH-2018-044")
        user.first_name = "Kouamé"
        user.last_name = "N'Dri"
        user.email = "drh@portefeuille.gouv.ci"
        user.set_password(DEMO_PASSWORD)
        user.save()
        Profil.objects.update_or_create(
            user=user,
            defaults={"fonction": "Directeur des Ressources Humaines", "organisme": organisme, "role": "Directeur"},
        )
        return user

    def _agents(self, organismes: dict[str, Organisme]) -> dict[str, Agent]:
        # (matricule, nom, prénoms, sexe, naissance, corps, grade, échelon, indice, structure, organisme,
        #  prise de service, congés consommés 2026, localisation, habilitation)
        rows = [
            ("349812K", "KOFFI", "Yao Christian", "H", date(1978, 6, 14), "Corps des Administrateurs Financiers", "A4", "3", 1845,
             "Sous-Direction du Suivi des Sociétés d'État", "dgpe", 2015, 12, "Immeuble SCIAM, 14e étage, Plateau, Abidjan", "Secret administratif (niveau 2)"),
            ("318490K", "KONÉ", "Amadou Bakary", "H", date(1969, 2, 3), "Corps des Administrateurs Civils", "A4", "2", 1720,
             "Direction Générale du Portefeuille de l'État", "dgpe", 1996, 8, "Immeuble SCIAM, 15e étage, Plateau, Abidjan", "Secret administratif (niveau 2)"),
            ("394812H", "KOUASSI", "Jean-Baptiste", "H", date(1984, 11, 22), "Administrateurs des Services Financiers", "A4", "3", 820,
             "Direction des Participations Financières", "dgpe", 2012, 5, "Immeuble SCIAM, 13e étage, Plateau, Abidjan", "Confidentiel (niveau 1)"),
            ("411904C", "YAO", "Constant Sylvain", "H", date(1981, 4, 9), "Cadres des sociétés d'État", "A3", "2", 1100,
             "Direction des Ressources Humaines", "petroci", 2010, 14, "Immeuble Les Hévéas, Plateau, Abidjan", "Confidentiel (niveau 1)"),
            ("288103A", "BAMBA", "Aïcha épouse DIABY", "F", date(1975, 8, 30), "Administrateurs du patrimoine", "A2", "4", 980,
             "Direction du Patrimoine Immobilier", "sogepie", 2003, 0, "Tour SOGEPIE, Cocody, Abidjan", "Confidentiel (niveau 1)"),
            ("340188P", "ADJOUMANI", "Kouadio", "H", date(1986, 1, 17), "Corps des Administrateurs Civils", "A3", "1", 940,
             "Direction Générale du Portefeuille de l'État", "dgpe", 2016, 6, "Immeuble SCIAM, 14e étage, Plateau, Abidjan", "Diffusion restreinte"),
            ("402771K", "TRAORÉ", "Brahima", "H", date(1979, 9, 5), "Cadres pétroliers", "B1", "3", 640,
             "Direction de l'Exploitation", "petroci", 2006, 10, "Base logistique de Vridi, Abidjan", "Diffusion restreinte"),
            ("509231M", "BROU", "Estelle", "F", date(1990, 3, 12), "Gestionnaires du patrimoine", "A1", "2", 760,
             "Secrétariat Général", "sogepie", 2017, 4, "Tour SOGEPIE, Cocody, Abidjan", "Diffusion restreinte"),
            ("418902X", "KOUADIO", "Aya Marcelle", "F", date(1988, 12, 1), "Ingénieurs de l'énergie", "A3", "1", 700,
             "Direction de l'Exploitation", "ci-energies", 2014, 9, "Siège CI-ENERGIES, Treichville, Abidjan", "Diffusion restreinte"),
            ("392104D", "TRAORÉ", "Bakary", "H", date(1972, 7, 19), "Agents d'exécution portuaire", "B1", "2", 520,
             "Service des Moyens Généraux", "paa", 1998, 15, "Zone portuaire, Treichville, Abidjan", "Public"),
            ("501229K", "N'GUESSAN", "Éric Yao", "H", date(1963, 5, 28), "Ingénieurs généraux des travaux publics", "A7", "1", 2100,
             "Direction Technique", "bnetd", 1991, 3, "Siège BNETD, Cocody, Abidjan", "Secret administratif (niveau 2)"),
            ("476112P", "SORO", "Karidja", "F", date(1992, 10, 8), "Agents administratifs", "B2", "3", 480,
             "Service de l'Action Sociale", "dgpe", 2018, 7, "Immeuble SCIAM, 11e étage, Plateau, Abidjan", "Public"),
            ("455870T", "TRAORÉ", "Mariam épouse CISSÉ", "F", date(1977, 2, 25), "Corps des Administrateurs Financiers", "A5", "2", 1980,
             "Direction Financière", "petroci", 2001, 11, "Immeuble Les Hévéas, Plateau, Abidjan", "Secret administratif (niveau 2)"),
            ("289043B", "YAO", "Kouassi Florent", "H", date(1966, 9, 14), "Corps des Inspecteurs du Trésor", "A6", "1", 2010,
             "Inspection Générale", "dgpe", 1993, 2, "Immeuble SCIAM, 16e étage, Plateau, Abidjan", "Secret administratif (niveau 2)"),
            ("367215R", "OUATTARA", "Ibrahim", "H", date(1983, 6, 2), "Ingénieurs informaticiens", "A3", "3", 1030,
             "Direction des Systèmes d'Information", "sndi", 2009, 12, "Siège SNDI, Plateau, Abidjan", "Confidentiel (niveau 1)"),
            ("523406L", "GBAGBO", "Adjoua Laetitia", "F", date(1994, 4, 21), "Attachés d'administration", "A2", "1", 650,
             "Direction des Programmes", "ansut", 2020, 5, "Siège ANSUT, Cocody, Abidjan", "Diffusion restreinte"),
        ]
        found = {}
        for (matricule, nom, prenoms, sexe, naissance, corps, grade, echelon, indice, structure, org,
             prise, consommes, localisation, habilitation) in rows:
            debut = date(prise, 1, 1)
            mois = (date(2026, 10, 1).year - debut.year) * 12
            annees, reste = divmod(mois + self.rng.randint(0, 11), 12)
            prenom_courriel = prenoms.split()[0].lower().replace("ï", "i").replace("é", "e").replace("'", "")
            nom_courriel = nom.lower().replace("é", "e").replace("'", "")
            direction, sous_direction, service = self._rattachement(structure)
            agent, _created = Agent.objects.update_or_create(
                matricule=matricule,
                defaults={
                    "nom": nom,
                    "prenoms": prenoms,
                    "initiales": f"{nom[0]}{prenoms[0]}",
                    "corps": corps,
                    "grade": grade,
                    "echelon": echelon,
                    "indice": indice,
                    "structure": structure,
                    "direction": direction,
                    "sous_direction": sous_direction,
                    "service": service,
                    "emploi": corps,
                    "type_agent": "Fonctionnaire",
                    "organisme": organismes[org],
                    "situation": "En activité",
                    "categorie": grade,
                    "sexe": sexe,
                    "date_naissance": naissance,
                    "anciennete": f"{annees} ans {reste} mois" if reste else f"{annees} ans",
                    "prise_service": str(prise),
                    "visite_medicale": f"À jour (visite du {self._date_fr(date(2025, self.rng.randint(1, 12), self.rng.randint(1, 28)))})",
                    "affiliation_cgrae": f"N° {self.rng.randint(100, 999)}-{self.rng.randint(100, 999)} en règle",
                    "conges_acquis": 30,
                    "conges_consommes": consommes,
                    "telephone": f"+225 27 20 {self.rng.randint(10, 99)} {self.rng.randint(10, 99)} {self.rng.randint(10, 99)}",
                    "courriel": f"{prenom_courriel}.{nom_courriel}@{org.replace('-', '')}.ci",
                    "localisation": localisation,
                    "habilitation": habilitation,
                },
            )
            found[matricule] = agent
        # Un agent en disponibilité, pour que la situation varie dans l'annuaire.
        Agent.objects.filter(matricule="509231M").update(situation="Disponibilité demandée")
        found["509231M"].refresh_from_db()
        return found

    @staticmethod
    def _rattachement(libelle: str) -> tuple[str, str, str]:
        if libelle.startswith("Sous-Direction") or libelle.startswith("Sous-direction"):
            return "", libelle, ""
        if libelle.startswith("Service"):
            return "", "", libelle
        return libelle, "", ""

    @staticmethod
    def _date_fr(jour: date) -> str:
        mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
                "septembre", "octobre", "novembre", "décembre"]
        return f"{jour.day} {mois[jour.month - 1]} {jour.year}"

    # --- Actes administratifs -------------------------------------------------

    def _actes(self, agents: dict[str, Agent]) -> None:
        Acte.objects.all().delete()
        M = "Ministre du Portefeuille de l'État"
        D = "Directeur des Ressources Humaines"
        rows = [
            # Carrière
            ("349812K", "2024-0418/MPEEP", "Arrêté d'avancement", "Avancement d'échelon au choix (grade A4, échelon 3)",
             "Passage de l'indice 1 720 à 1 845 après inscription au tableau d'avancement.", "carriere", "valide", date(2024, 1, 1), date(2024, 1, 12), M, False),
            ("349812K", "2022-119/PR", "Décret de nomination", "Nomination en qualité de chef de cellule de contrôle financier",
             "Affecté à la Sous-Direction du Suivi des Sociétés d'État avec prérogatives d'audit.", "carriere", "valide", date(2022, 3, 15), date(2022, 3, 15), "Président de la République", False),
            ("349812K", "1892/DGPE", "Décision de mutation", "Mutation de la DRH du Trésor vers la DGPE",
             "Redéploiement pour la consolidation du suivi budgétaire des participations de l'État.", "carriere", "valide", date(2018, 10, 1), date(2018, 9, 12), "Directeur Général du Portefeuille de l'État", False),
            ("349812K", "2015-0042/MFPMA", "Arrêté d'intégration", "Intégration et titularisation dans le corps des Administrateurs Financiers",
             "Admis au concours direct (promotion 2013-2014).", "carriere", "valide", date(2015, 1, 12), date(2015, 1, 12), "Ministre de la Fonction Publique", False),
            ("340188P", "2026-0214/MPEEP", "Arrêté d'avancement", "Avancement d'échelon (indice 940)",
             "Acte exécutoire visé par la DRH.", "carriere", "valide", date(2026, 2, 1), date(2026, 2, 26), D, True),
            ("318490K", "2024-0377/MPEEP", "Arrêté d'avancement", "Avancement d'échelon à l'ancienneté (grade A4, échelon 2)",
             "Inscription au tableau d'avancement 2024.", "carriere", "valide", date(2024, 1, 1), date(2024, 1, 20), M, False),
            ("394812H", "2026-0231/MPEEP", "Arrêté d'avancement", "Avancement d'échelon réglementaire (échelon 3 vers 4)",
             "Projet d'arrêté en attente du visa DRH.", "carriere", "instruction", date(2026, 3, 1), date(2026, 2, 27), "", False),
            ("509231M", "2026-0172/MPEEP", "Décision de disponibilité", "Mise en disponibilité pour convenances personnelles",
             "Avis du directeur général de SOGEPIE manquant.", "carriere", "complement", None, date(2026, 2, 20), "", False),
            ("455870T", "2026-0156/MPEEP", "Arrêté de nomination", "Nomination en qualité de Directrice Financière, PETROCI Holding",
             "Prise de fonction au 1er mars 2026.", "carriere", "valide", date(2026, 3, 1), date(2026, 2, 16), M, True),
            ("367215R", "2026-0149/MPEEP", "Décision de mutation", "Mutation de la SNDI vers la DGPE (cellule numérique)",
             "Mutation dans l'intérêt du service.", "carriere", "instruction", date(2026, 4, 1), date(2026, 2, 12), "", False),
            ("501229K", "2025-0911/MPEEP", "Arrêté de reclassement", "Reclassement au grade A7 après validation des acquis",
             "Reclassement exécutoire.", "carriere", "valide", date(2025, 12, 1), date(2025, 12, 8), M, False),
            ("289043B", "2025-0874/MPEEP", "Décision de mise à la retraite", "Préavis de départ à la retraite (limite d'âge)",
             "Départ prévu à la limite d'âge, passation à organiser.", "carriere", "instruction", date(2031, 9, 14), date(2025, 11, 21), "", False),
            ("0894", "0894/MPEEP", "Arrêté", "Campagne triennale des avancements d'échelon 2026-2028",
             "Lancement officiel de la campagne statutaire.", "carriere", "valide", date(2026, 2, 12), date(2026, 2, 12), M, True),
            # Action sociale
            ("402771K", "2026-0188/MPEEP", "Prêt social", "Prêt social pour accession à la propriété",
             "Dossier en instruction à la sous-direction de l'action sociale.", "social", "instruction", None, date(2026, 2, 25), "", False),
            ("411904C", "2026-0193/MPEEP", "Prêt social", "Prêt bonifié d'acquisition immobilière (8 500 000 FCFA)",
             "Accord de la commission sociale n° 26-11.", "social", "instruction", None, date(2026, 2, 26), "", False),
            ("476112P", "2026-0161/MPEEP", "Secours exceptionnel", "Secours médical d'urgence",
             "Facture normalisée manquante.", "social", "complement", None, date(2026, 2, 18), "", False),
            ("392104D", "2026-0098/MPEEP", "Prêt d'équipement", "Prêt d'équipement ménager (1 200 000 FCFA)",
             "Versé sur le compte de l'agent.", "social", "valide", date(2026, 1, 20), date(2026, 1, 14), D, False),
            ("523406L", "2025-0932/MPEEP", "Allocation", "Allocation de rentrée scolaire",
             "Versement groupé de décembre.", "social", "valide", date(2025, 12, 15), date(2025, 12, 10), D, False),
            ("288103A", "2026-0201/MPEEP", "Secours exceptionnel", "Aide exceptionnelle suite à sinistre",
             "Demande rejetée : sinistre couvert par l'assurance.", "social", "rejete", None, date(2026, 2, 28), "", False),
            # Formation
            ("501229K", "2026-0122/MPEEP", "Décision de formation", "Cycle des dirigeants d'entreprises publiques",
             "Session de mars à juin 2026.", "formation", "instruction", date(2026, 3, 16), date(2026, 2, 9), "", False),
            ("418902X", "2026-0104/MPEEP", "Décision de formation", "Certification en gestion de projets énergétiques",
             "Prise en charge de la formation.", "formation", "valide", date(2026, 2, 2), date(2026, 1, 22), D, True),
            ("349812K", "2025-0890/MPEEP", "Décision de formation", "Droit OHADA des sociétés commerciales",
             "Formation certifiante.", "formation", "valide", date(2025, 11, 3), date(2025, 10, 20), D, False),
            ("509231M", "2026-0177/MPEEP", "Décision de formation", "Gestion locative et fiscalité immobilière",
             "Dossier de prise en charge à compléter.", "formation", "complement", None, date(2026, 2, 21), "", False),
            # Congés
            ("288103A", "2026-0209/MPEEP", "Titre de congé", "Titre de congé annuel (30 jours, intérim assuré)",
             "Prise d'effet au 10 mars 2026.", "conge", "instruction", date(2026, 3, 10), date(2026, 3, 2), "", False),
            ("418902X", "2026-0215/MPEEP", "Titre de congé", "Congé annuel (21 jours)",
             "Avis hiérarchique attendu.", "conge", "instruction", date(2026, 4, 6), date(2026, 3, 14), "", False),
        ]
        for matricule, reference, nature, titre, resume, domaine, statut, effet, enregistrement, signataire, publie in rows:
            Acte.objects.create(
                agent=agents.get(matricule, agents["349812K"]),
                reference=reference,
                nature=nature,
                titre=titre,
                resume=resume,
                domaine=domaine,
                statut=statut,
                date_effet=effet,
                date_enregistrement=enregistrement,
                signataire=signataire,
                publie=publie,
            )

    def _situation(self, agents: dict[str, Agent]) -> None:
        from personnel.situation import completer

        for agent in agents.values():
            champs = completer(agent, list(agent.actes.all()))
            if champs:
                agent.save(update_fields=champs)

    # --- Onglets du dossier ----------------------------------------------------

    def _dossiers(self, agents: dict[str, Agent]) -> None:
        for model in (
            Evaluation, Absence, PrestationSociale, Formation, PieceJointe, VisaDossier,
            SituationSociale, AyantDroit, EnveloppeSociale,
        ):
            model.objects.all().delete()
        for agent in agents.values():
            superieur = SUPERIEURS.get(agent.organisme.code, SUPERIEURS["dgpe"])
            self._evaluations(agent, superieur)
            self._absences(agent)
            self._prestations(agent)
            self._formations(agent)
            self._pieces(agent)
            self._visas_dossier(agent, superieur)
        self._action_sociale(agents)

    APPRECIATIONS = [
        "Agent rigoureux, maîtrise pointue des dossiers de gouvernance financière. Avis très favorable à une promotion.",
        "Excellente capacité d'analyse et grande disponibilité. Doit déléguer davantage.",
        "Travail régulier et de qualité. Sens du service public affirmé.",
        "Bonne intégration dans l'équipe ; progrès notables sur la tenue des délais.",
        "Fiable et méthodique. Formation complémentaire souhaitable en management.",
        "Résultats conformes aux objectifs fixés. Initiative à encourager.",
    ]

    def _evaluations(self, agent: Agent, superieur: tuple[str, str]) -> None:
        for annee in (2025, 2024, 2023):
            note = round(self.rng.uniform(14.5, 19.5) * 4) / 4
            mention = "Excellent" if note >= 18 else "Très bien" if note >= 16 else "Bien"
            Evaluation.objects.create(
                agent=agent,
                annee=annee,
                note=note,
                mention=mention,
                appreciation=self.rng.choice(self.APPRECIATIONS),
                evaluateur=superieur[0],
                fonction_evaluateur=superieur[1],
                statut="Notifiée" if annee < 2025 else self.rng.choice(["Notifiée", "Signée par l'agent"]),
            )

    def _absences(self, agent: Agent) -> None:
        # Les congés annuels 2026 totalisent exactement les jours consommés de l'agent.
        reste = agent.conges_consommes
        debut = date(2026, 1, 12)
        while reste > 0:
            jours = min(reste, self.rng.choice([3, 5, 7, 10]))
            Absence.objects.create(
                agent=agent, nature="Congé annuel", debut=debut, fin=debut + timedelta(days=jours + jours // 5 * 2 - 1),
                jours=jours, statut="Pris", interim="Assuré par le service",
            )
            reste -= jours
            debut += timedelta(days=self.rng.randint(40, 75))
        Absence.objects.create(
            agent=agent, nature="Congé annuel 2025", debut=date(2025, 8, 4), fin=date(2025, 9, 12),
            jours=30, statut="Pris", interim="Assuré par le service",
        )
        if self.rng.random() < 0.6:
            jour = date(2025, self.rng.randint(2, 11), self.rng.randint(1, 25))
            Absence.objects.create(
                agent=agent, nature=self.rng.choice(["Autorisation d'absence (événement familial)", "Congé de maladie"]),
                debut=jour, fin=jour + timedelta(days=2), jours=3, statut="Justifiée",
            )
        if agent.matricule == "288103A":
            Absence.objects.create(
                agent=agent, nature="Congé annuel 2026 (titre en cours)", debut=date(2026, 3, 10), fin=date(2026, 4, 20),
                jours=30, statut="En attente du visa DRH", interim="M. KOUAKOU Hervé, chef de service",
            )

    PRESTATIONS = [
        ("Prêt social", "Prêt bonifié pour acquisition immobilière", 8_500_000, "Remboursement sur 60 mois"),
        ("Prêt d'équipement", "Équipement ménager", 1_200_000, "Remboursement sur 24 mois"),
        ("Allocation", "Allocation de rentrée scolaire", 150_000, ""),
        ("Secours exceptionnel", "Prise en charge de frais médicaux", 450_000, ""),
        ("Prêt social", "Prêt pour véhicule personnel", 3_000_000, "Remboursement sur 36 mois"),
        ("Aide", "Aide aux obsèques d'un ascendant", 300_000, ""),
    ]

    def _prestations(self, agent: Agent) -> None:
        for index, (nature, objet, montant, echeancier) in enumerate(self.rng.sample(self.PRESTATIONS, self.rng.randint(0, 3))):
            jour = date(self.rng.choice([2024, 2025, 2026]), self.rng.randint(1, 12 if index else 2), self.rng.randint(1, 28))
            PrestationSociale.objects.create(
                agent=agent,
                reference=f"AS-{jour.year}-{self.rng.randint(100, 999)}",
                nature=nature,
                objet=objet,
                montant=montant,
                date_demande=jour,
                statut="En instruction" if jour.year == 2026 else self.rng.choice(["Versé", "Accordé", "Soldé"]),
                echeancier=echeancier,
            )

    DISPOSITIFS = [
        ("secours-deces", "Plafond : 1 500 000 FCFA", "Plafond : 1 500 000 FCFA"),
        ("hospitalisation", "Prise en charge : jusqu'à 80%", "Prise en charge : jusqu'à 80%"),
        ("allocation-rentree", "150 000 FCFA / enfant", "150 000 FCFA / enfant"),
        ("taux-bonifie", "Taux Bonifié 3.5%", "Taux Bonifié 3.5%"),
        ("pret-immobilier", "25 000 000 FCFA", "25 000 000 FCFA"),
        ("pret-mensualites", "180 mensualités", "180 mensualités"),
        ("avance", "3 000 000 FCFA", "3 000 000 FCFA"),
        ("avance-duree", "24 mois (taux 0%)", "24 mois (taux 0%)"),
    ]

    PRENOMS_AYANTS = {
        "F": ["Ahou", "Akissi", "Amenan", "Affoué", "Mariam", "Adjoua", "Aya", "Bintou"],
        "M": ["Kouadio", "Kouassi", "Yao", "Konan", "Serge", "Armand", "Jean", "Hermann"],
    }

    def _action_sociale(self, agents: dict[str, Agent], remplacer: bool = True) -> None:
        """Barème, ayants droit, enveloppe et plafonds. `remplacer=False` ne complète que les manques."""
        for code, ancre, valeur in self.DISPOSITIFS:
            DispositifSocial.objects.update_or_create(code=code, defaults={"ancre": ancre, "valeur": valeur})
        vus: dict[int, Organisme] = {}
        for agent in agents.values():
            vus[agent.organisme_id] = agent.organisme
            if remplacer or not SituationSociale.objects.filter(agent=agent).exists():
                self._situation_sociale(agent)
                self._ayants(agent)
        for organisme in vus.values():
            if remplacer or not EnveloppeSociale.objects.filter(organisme=organisme, exercice=2026).exists():
                self._enveloppe(organisme)

    def _situation_sociale(self, agent: Agent) -> None:
        indice = max(agent.indice or 800, 400)
        brut = int(round(indice * 1120 / 100) * 100)
        cotisations = int(round(brut * 0.20 / 100) * 100)
        engagements = int(round(brut * self.rng.uniform(0.05, 0.12) / 100) * 100)
        SituationSociale.objects.update_or_create(
            agent=agent,
            defaults={
                "numero_cmu": (
                    f"CI-{self.rng.randint(1, 999):03d}-{self.rng.randint(2020, 2026)}-"
                    f"{self.rng.randint(1000, 9999)}-{self.rng.randint(1, 99):02d}"
                ),
                "traitement_brut": brut,
                "cotisations": cotisations,
                "engagements": engagements,
                "taux_quotite": 33,
            },
        )

    def _ayants(self, agent: Agent) -> None:
        agent.ayants_droit.all().delete()
        if self.rng.random() < 0.72:
            sexe = self.rng.choice(["F", "M"])
            prenom = self.rng.choice(self.PRENOMS_AYANTS[sexe])
            self._ayant(agent, f"{agent.nom} {prenom}", "Conjoint", self._cmu(), "Certifié")
        for _ in range(self.rng.randint(0, 3)):
            sexe = self.rng.choice(["F", "M"])
            prenom = self.rng.choice(self.PRENOMS_AYANTS[sexe])
            age = self.rng.randint(3, 20)
            ecole = self.rng.choice([
                "Lycée Classique Cocody", "Collège Moderne Plateau", "EPP Williamsville 1", "Groupe scolaire Riviera",
            ])
            self._ayant(agent, f"{agent.nom} {prenom} ({age} ans)", "Enfant", f"{ecole} • CMU Active", "Scolarisé" if age >= 6 else "À charge")

    def _ayant(self, agent: Agent, nom: str, lien: str, detail: str, statut: str) -> None:
        mots = [mot for mot in nom.replace("(", " ").split() if mot[:1].isalpha()]
        AyantDroit.objects.create(
            agent=agent, nom=nom, lien=lien, detail=detail, statut=statut,
            initiales="".join(mot[0] for mot in mots[:2]).upper(),
        )

    def _cmu(self) -> str:
        return (
            f"CMU: CI-{self.rng.randint(1, 999):03d}-{self.rng.randint(2020, 2026)}-"
            f"{self.rng.randint(1000, 9999)}-{self.rng.randint(1, 99):02d}"
        )

    def _enveloppe(self, organisme: Organisme) -> None:
        if organisme.code == "dgpe":
            allouee, engagee, ligne, session, jour = 120_000_000, 72_800_000, "7412-Action-Soc", 4, date(2026, 3, 19)
            contact = "Mme A. Bakayoko (Poste 4410)"
        else:
            allouee = self.rng.randrange(40, 160) * 1_000_000
            engagee = int(round(allouee * self.rng.uniform(0.35, 0.8) / 1_000_000) * 1_000_000)
            ligne = f"{self.rng.randint(7000, 7999)}-Action-Soc"
            session = self.rng.randint(1, 6)
            jour = date(2026, self.rng.randint(1, 12), self.rng.randint(1, 28))
            contact = "Assistant social de la structure"
        EnveloppeSociale.objects.update_or_create(
            organisme=organisme,
            exercice=2026,
            defaults={
                "ligne": ligne,
                "allouee": allouee,
                "engagee": engagee,
                "session_numero": session,
                "session_date": jour,
                "contact": contact,
            },
        )

    FORMATIONS = [
        ("Gouvernance des entreprises publiques", "Direction de la formation continue", 60, "Attestation"),
        ("Droit OHADA des sociétés commerciales", "Centre de formation au droit des affaires", 40, "Certificat de formation"),
        ("Contrôle de gestion et pilotage de la performance", "Institut supérieur de gestion publique", 80, "Certificat de formation"),
        ("Passation des marchés publics", "Centre de formation aux marchés publics", 24, "Attestation de formation"),
        ("Tableaux de bord et analyse de données", "Cabinet Performance & Données", 30, ""),
        ("Management d'équipe et conduite du changement", "Centre de perfectionnement des cadres de l'administration", 35, "Attestation de formation"),
        ("Audit interne des organismes publics", "Institut régional des métiers de l'audit", 45, "Certificat de formation"),
    ]

    def _formations(self, agent: Agent) -> None:
        for intitule, organisme, heures, certification in self.rng.sample(self.FORMATIONS, self.rng.randint(1, 3)):
            debut = date(self.rng.choice([2023, 2024, 2025, 2026]), self.rng.randint(1, 11), self.rng.randint(1, 20))
            fin = debut + timedelta(days=max(2, heures // 6))
            statut = "Planifiée" if debut > date(2026, 10, 1) else "En cours" if fin >= date(2026, 10, 1) else "Terminée"
            if debut.year == 2026 and self.rng.random() < 0.5:
                statut = "Planifiée"
                debut, fin = date(2026, 11, 3), date(2026, 11, 3) + timedelta(days=max(2, heures // 6))
            Formation.objects.create(
                agent=agent, intitule=intitule, organisme=organisme, debut=debut, fin=fin, heures=heures,
                statut=statut, certification=certification if statut == "Terminée" else "",
            )

    PIECES = [
        ("Extrait d'acte de naissance", "État civil"),
        ("Carte nationale d'identité", "État civil"),
        ("Diplôme le plus élevé", "Diplômes"),
        ("Arrêté d'intégration ou contrat", "Actes de carrière"),
        ("Certificat de première prise de service", "Actes de carrière"),
        ("Dernier arrêté d'avancement", "Actes de carrière"),
        ("Relevé d'identité bancaire", "Administratif"),
        ("Certificat médical d'aptitude", "Santé"),
    ]

    def _pieces(self, agent: Agent) -> None:
        for index, (intitule, categorie) in enumerate(self.rng.sample(self.PIECES, self.rng.randint(5, 8))):
            PieceJointe.objects.create(
                agent=agent,
                intitule=intitule,
                categorie=categorie,
                date_depot=date(self.rng.randint(2019, 2026), self.rng.randint(1, 9), self.rng.randint(1, 28)),
                taille_ko=self.rng.randint(180, 2400),
                verifiee=index != 0 or self.rng.random() < 0.6,
            )

    def _visas_dossier(self, agent: Agent, superieur: tuple[str, str]) -> None:
        favorable = self.rng.random() < 0.8
        VisaDossier.objects.create(
            agent=agent, ordre=1, instance="Supérieur hiérarchique (N+1)", titulaire=superieur[0], fonction=superieur[1],
            avis="Favorable" if favorable else "Réservé",
            commentaire=self.rng.choice(self.APPRECIATIONS) if favorable else "Objectifs partiellement atteints ; à revoir lors de la prochaine campagne.",
            date=date(2025, 11, self.rng.randint(3, 28)),
        )
        en_attente = agent.matricule in {"394812H", "411904C", "288103A"}
        VisaDossier.objects.create(
            agent=agent, ordre=2, instance="Direction des Ressources Humaines", titulaire=DRH[0], fonction=DRH[1],
            avis="En attente" if en_attente else "Visa apposé",
            date=None if en_attente else date(2026, 1, self.rng.randint(5, 28)),
            reference="" if en_attente else f"MPEEP-2026-DRH-{self.rng.randint(100, 999):05d}",
        )
        VisaDossier.objects.create(
            agent=agent, ordre=3, instance="Bureau des effectifs", titulaire="Direction des Ressources Humaines",
            fonction="Contrôle des plafonds d'emplois",
            avis="En attente" if en_attente else "Conforme",
            commentaire="" if en_attente else "Conformité au plafond d'emplois attestée pour l'exercice 2026.",
            date=None if en_attente else date(2026, 1, self.rng.randint(5, 28)),
        )

    # --- Tableau de bord, carrières, circuits ----------------------------------

    def _visas(self, agents: dict[str, Agent]) -> None:
        VisaEnAttente.objects.all().delete()
        rows = [
            ("394812H", "Avancement d'échelon réglementaire : grade A4, échelon 3 vers échelon 4 (indice 820)",
             "Délai de rigueur : J-2 (28 février 2026)", "Visa SD Carrières OK", "carriere", True),
            ("411904C", "Action sociale : prêt bonifié d'acquisition immobilière (8 500 000 FCFA)",
             "Délai de rigueur : J-2 (solde de mars)", "Accord commission sociale n° 26-11", "social", True),
            ("288103A", "Titre de congé annuel : 30 jours, intérim assuré",
             "Prise d'effet : 10 mars 2026", "Visa DGA SOGEPIE validé", "conge", True),
            ("367215R", "Mutation de la SNDI vers la DGPE (cellule numérique)",
             "Prise d'effet : 1er avril 2026", "Avis favorable des deux directions", "carriere", False),
            ("501229K", "Formation : cycle des dirigeants (mars à juin 2026)",
             "Session : 16 mars 2026", "Visa SD Formation OK", "formation", False),
            ("476112P", "Secours médical d'urgence (450 000 FCFA)",
             "Pièce manquante : facture normalisée", "Retour à l'agent", "social", False),
        ]
        # Chaque visa porte sur un acte en instruction : apposer le visa rend l'acte exécutoire.
        actes = {
            "394812H": "2026-0231/MPEEP", "411904C": "2026-0193/MPEEP", "288103A": "2026-0209/MPEEP",
            "367215R": "2026-0149/MPEEP", "501229K": "2026-0122/MPEEP", "476112P": "2026-0161/MPEEP",
        }
        for matricule, objet, echeance, amont, categorie, urgent in rows:
            VisaEnAttente.objects.create(
                agent=agents[matricule], acte=Acte.objects.filter(reference=actes.get(matricule)).first(), objet=objet, echeance=echeance, visa_amont=amont, categorie=categorie, urgent=urgent,
            )

    def _avancements(self, agents: dict[str, Agent]) -> None:
        LigneAvancement.objects.all().delete()
        rows = [
            ("318490K", "Administrateur civil général", "DG Portefeuille de l'État", "A4 · éch. 2", "2 ans 11 mois", "Échelon 3", "Au choix", "18.75", "Favorable", "Calcul certifié"),
            ("455870T", "Directrice financière", "PETROCI Holding", "A5 · éch. 2", "2 ans 4 mois", "Échelon 3", "Au choix", "19.00", "Favorable", "Calcul certifié"),
            ("394812H", "Chargé d'études financières", "DGPE", "A4 · éch. 3", "2 ans 1 mois", "Échelon 4", "Ancienneté", "16.50", "Favorable", "Visa DRH en attente"),
            ("289043B", "Inspecteur du Trésor", "Inspection Générale", "A6 · éch. 1", "3 ans 2 mois", "Échelon 2", "Ancienneté", "17.25", "Favorable", "Calcul certifié"),
            ("367215R", "Ingénieur informaticien", "SNDI", "A3 · éch. 3", "2 ans 0 mois", "Échelon 4", "Ancienneté", "15.75", "Réservé", "Avis à compléter"),
            ("411904C", "Responsable RH", "PETROCI Holding", "A3 · éch. 2", "2 ans 6 mois", "Échelon 3", "Au choix", "17.50", "Favorable", "Calcul certifié"),
            ("288103A", "Gestionnaire du patrimoine", "SOGEPIE", "A2 · éch. 4", "3 ans 1 mois", "Grade A3", "Au choix", "18.25", "Favorable", "Commission paritaire"),
            ("418902X", "Ingénieure d'exploitation", "CI-ENERGIES", "A3 · éch. 1", "2 ans 2 mois", "Échelon 2", "Ancienneté", "16.00", "Favorable", "Calcul certifié"),
            ("402771K", "Technicien supérieur", "PETROCI Holding", "B1 · éch. 3", "2 ans 8 mois", "Échelon 4", "Ancienneté", "14.75", "Réservé", "Avis à compléter"),
            ("523406L", "Attachée d'administration", "ANSUT", "A2 · éch. 1", "2 ans 3 mois", "Échelon 2", "Ancienneté", "15.50", "Favorable", "Calcul certifié"),
        ]
        for matricule, emploi, structure, grade, anciennete, proposition, mode, note, avis, statut in rows:
            LigneAvancement.objects.create(
                agent=agents[matricule], emploi=emploi, structure=structure, grade_echelon=grade, anciennete=anciennete,
                proposition=proposition, mode=mode, note=note, avis=avis, statut=statut,
            )

    def _carrieres(self, agents: dict[str, Agent], organismes: dict[str, Organisme]) -> None:
        MouvementStrategique.objects.all().delete()
        AlerteReleve.objects.all().delete()
        for poste, org, matricule, nature, statut, effet in [
            ("Directeur d'Exploitation Portuaire", "paa", "392104D", "Nomination", "Projet d'arrêté au visa DRH", date(2026, 4, 1)),
            ("Conseiller technique gouvernance", "cabinet", "349812K", "Détachement", "Avis du Cabinet favorable", date(2026, 5, 1)),
            ("Directrice Financière", "petroci", "455870T", "Nomination", "Arrêté signé", date(2026, 3, 1)),
            ("Chef de la cellule numérique", "dgpe", "367215R", "Mutation", "En instruction", date(2026, 4, 1)),
        ]:
            MouvementStrategique.objects.create(
                poste=poste, organisme=organismes[org], agent=agents[matricule], nature=nature, statut=statut, date_effet=effet,
            )
        for poste, org, matricule, depart, vivier, risque in [
            ("Directeur Technique", "bnetd", "501229K", date(2028, 5, 28), 1, "eleve"),
            ("Inspecteur général du Trésor", "dgpe", "289043B", date(2031, 9, 14), 2, "modere"),
            ("Directeur Général du Portefeuille (adjoint)", "dgpe", "318490K", date(2034, 2, 3), 3, "faible"),
        ]:
            AlerteReleve.objects.create(
                poste=poste, organisme=organismes[org], titulaire=agents[matricule], depart=depart, vivier=vivier, vivier_cible=3, risque=risque,
            )

    def _circuits(self, agents: dict[str, Agent]) -> None:
        EtapeCircuit.objects.all().delete()
        for ordre, titre, compteur, detail in [
            (1, "Requêtes agents", "34", "Flux initial"),
            (2, "Chefs de service", "12", "3 en J-3"),
            (3, "Contrôle SD métier", "08", "2 retours"),
            (4, "Bureau du DRH", "05", "Visa du DRH"),
            (5, "Notifiées / clôturées", "142", "Notifiées"),
        ]:
            EtapeCircuit.objects.create(ordre=ordre, titre=titre, compteur=compteur, detail=detail)

        ParcoursEtape.objects.all().delete()
        for ordre, acteur, titre, texte, metas in [
            (1, "Agent", "Dépôt de la requête", "Téléversement des pièces et formalisation de la demande.", [{"label": "Canal", "value": "Portail SIGRH"}]),
            (2, "Hiérarchie N+1", "Avis du chef de service", "Évaluation d'opportunité. Délai de 72 h, relance automatique à J-3.", [{"label": "En instance", "value": "12 dossiers"}]),
            (3, "Sous-direction métier", "Contrôle de légalité", "Vérification des droits statutaires ; rejet ou demande de complément possible.", [{"label": "SD assignée", "value": "Selon la nature"}]),
            (4, "Direction centrale", "Visa DRH", "La signature est apposée sur le document qui circule. L'accord acquis autorise l'édition du papier à en-tête.", [{"label": "Signature", "value": "Image du responsable"}]),
            (5, "Exécution", "Scan du papier à en-tête", "Le papier validé est scanné et versé au dossier : c'est ce versement qui ouvre le droit de l'agent.", [{"label": "Effet", "value": "Droit ouvert"}]),
        ]:
            ParcoursEtape.objects.create(ordre=ordre, acteur=acteur, titre=titre, texte=texte, metas=metas)

        Demande.objects.all().delete()
        for reference, matricule, nature, icone, etape, responsable, echeance, depose, categorie in [
            ("DM-2026-0891", "418902X", "Congé annuel (21 j)", "calendar_month", "Étape 2 : chef de service Exploitation", "Avis hiérarchique attendu", "J-1 avant relance", date(2026, 3, 14), "conge"),
            ("DM-2026-0874", "392104D", "Prêt d'équipement ménager", "volunteer_activism", "Étape 3 : SD Action Sociale", "Calcul de la quotité cessible", "Conforme sous 48 h", date(2026, 3, 11), "social"),
            ("DM-2026-0869", "501229K", "Cycle des dirigeants", "school", "Étape 4 : signature DRH", "Visa préalable SD Formation OK", "Priorité haute", date(2026, 3, 9), "formation"),
            ("DM-2026-0852", "476112P", "Secours médical urgent", "local_hospital", "Étape 3 : complément requis", "Facture normalisée manquante", "Retournée à l'agent", date(2026, 3, 8), "social"),
            ("DM-2026-0847", "288103A", "Congé annuel (30 j)", "calendar_month", "Étape 4 : signature DRH", "Intérim validé par la DGA", "Prise d'effet le 10 mars", date(2026, 3, 2), "conge"),
            ("DM-2026-0838", "523406L", "Formation tableaux de bord", "school", "Étape 2 : chef de service", "Avis hiérarchique attendu", "J-3 avant relance", date(2026, 3, 1), "formation"),
            ("DM-2026-0831", "402771K", "Prêt social immobilier", "volunteer_activism", "Étape 3 : SD Action Sociale", "Commission sociale du 12 mars", "Dans les délais", date(2026, 2, 25), "social"),
            ("DM-2026-0826", "340188P", "Autorisation d'absence (3 j)", "event_busy", "Étape 5 : notifiée", "Clôturée", "Traitée en 26 h", date(2026, 2, 24), "conge"),
            ("DM-2026-0819", "455870T", "Certification audit interne", "school", "Étape 3 : SD Formation", "Vérification de la prise en charge", "Dans les délais", date(2026, 2, 20), "formation"),
        ]:
            Demande.objects.create(
                reference=reference, agent=agents[matricule], nature=nature, icone=icone, etape=etape, responsable=responsable,
                echeance=echeance, depose_le=depose, categorie=categorie,
            )
        for demande in Demande.objects.select_related("agent", "agent__organisme"):
            self._visas_demande(demande)

        RoleMatrice.objects.all().delete()
        taille = ModuleHabilitation.objects.count() or 6

        def _droits(base: list[str], remplissage: str) -> list[str]:
            valeurs = list(base)
            while len(valeurs) < taille:
                valeurs.append(remplissage)
            return valeurs[:taille]

        for ordre, role, description, icone, droits, superieurs in [
            (1, "Agent", "Usager de l'administration", "person", _droits(["lecture", "lecture", "saisie", "saisie", "refus", "refus"], "refus"), ["Chef de service"]),
            (2, "Chef de service", "Premier responsable d'un service", "supervisor_account", _droits(["lecture", "lecture", "lecture", "lecture", "validation", "lecture"], "lecture"), ["Sous directeur"]),
            (3, "Sous directeur", "Premier responsable d'une sous-direction", "badge", _droits(["saisie", "validation", "lecture", "lecture", "lecture", "saisie"], "lecture"), ["Directeur"]),
            (4, "Directeur", "Premier responsable d'une direction centrale", "account_balance", _droits(["lecture", "lecture", "lecture", "lecture", "validation", "lecture"], "lecture"), ["Directeur général"]),
            (5, "Directeur général", "Premier responsable d'une direction générale", "admin_panel_settings", _droits(["validation"] * taille, "validation"), ["Ministre"]),
            (6, "Ministre", "Au sommet de la chaîne hiérarchique", "assured_workload", _droits(["validation"] * taille, "validation"), []),
        ]:
            RoleMatrice.objects.create(ordre=ordre, role=role, description=description, icone=icone, droits=droits, superieurs=superieurs)

    def _visas_demande(self, demande: Demande) -> None:
        """Les cinq visas du circuit, avec le commentaire déjà laissé par la hiérarchie."""
        etape = demande.etape.lower().replace("é", "e").replace("ô", "o")
        courant = next((int(mot) for mot in etape.split() if mot.isdigit()), 1)
        clos = "etape 5" in etape or "notifiee" in etape or "clotur" in etape
        complement = "complement" in etape
        accord = "accord acquis" in etape or "papier" in etape
        agent = demande.agent
        superieur = SUPERIEURS.get(agent.organisme.code, ("Chef de service", "Supérieur hiérarchique"))
        sous_direction = {
            "conge": ("SD Carrières et Actes", "Gestion statutaire et mouvements"),
            "social": ("SD Action Sociale", "Fonds de solidarité et santé"),
            "formation": ("SD Formation Continue", "Plans sectoriels et stages"),
        }.get(demande.categorie, ("Sous-direction métier", "Contrôle de la demande"))
        etapes = [
            ("Requête déposée", agent.nom_complet, agent.fonction or "Agent demandeur", "Demande déposée sur le portail, pièces reçues."),
            ("Visa du chef de service", superieur[0], superieur[1], "Avis favorable du chef de service."),
            ("Visa de la sous-direction", sous_direction[0], sous_direction[1], "Contrôle de légalité conforme."),
            ("Visa DRH", DRH[0], DRH[1], "Visa du directeur des ressources humaines apposé."),
            ("Scan versé", "Bureau du DRH", "Versement du papier à en-tête", "Papier à en-tête versé, droit ouvert et notifié à l'agent."),
        ]
        for ordre, (instance, titulaire, fonction, fait) in enumerate(etapes, start=1):
            if clos or ordre < courant:
                avis, commentaire, jour = ("Déposée" if ordre == 1 else "Favorable"), fait, demande.depose_le
            elif accord and ordre == 4:
                avis, commentaire, jour = "Accord acquis", "Les visas sont apposés. Le papier à en-tête peut être établi.", demande.depose_le
            elif ordre == courant and complement:
                avis, commentaire, jour = "Complément requis", demande.responsable, None
            elif ordre == courant:
                avis, commentaire, jour = "En attente", "", None
            else:
                avis, commentaire, jour = "En attente", "", None
            reference = ""
            if ordre == 4 and jour is not None and avis != "Complément requis":
                reference = f"MPEEP-{demande.depose_le.year}-DRH-{demande.pk:05d}"
            VisaDemande.objects.create(
                demande=demande, ordre=ordre, instance=instance, titulaire=titulaire, fonction=fonction,
                avis=avis, commentaire=commentaire, date=jour, reference=reference,
            )

    def _snapshot(self) -> None:
        SnapshotExercice.objects.update_or_create(
            annee=2026,
            defaults={
                "accueil": {
                    "titre": "Système intégré de gestion des ressources humaines du Portefeuille de l'État",
                    "chapo": (
                        "Le socle numérique unifié pour le pilotage des carrières, le suivi des actes "
                        "administratifs, l'action sociale et le développement des compétences des agents "
                        "des sociétés d'État."
                    ),
                    "chiffres": [
                        {"valeur": "4 826", "libelle": "Agents et cadres sous tutelle directe", "detail": "Ministère et sociétés d'État rattachées", "icone": "groups"},
                        {"valeur": "84", "libelle": "Sociétés d'État et établissements publics", "detail": "PETROCI, CI-ENERGIES, SOGEPIE, BNETD, PAA", "icone": "corporate_fare"},
                        {"valeur": "100 %", "libelle": "Dématérialisation des actes et décrets", "detail": "Procédure zéro papier ministérielle", "icone": "task_alt"},
                        {"valeur": "99,98 %", "libelle": "Disponibilité de la plateforme", "detail": "Chiffre de démonstration", "icone": "security"},
                    ],
                    "piliers": [
                        {
                            "code": "SD-01",
                            "titre": "Sous-direction de la gestion des carrières",
                            "texte": "Cycle statutaire de l'agent, de l'affectation à la liquidation des droits à pension.",
                            "points": ["Référentiel matriculaire unique", "Avancements d'échelon et reclassements", "Départs à la retraite (GPEEC)", "Mutations inter-entreprises"],
                            "lien": "/app/carrieres",
                            "indicateur": "342 décrets en visa",
                        },
                        {
                            "code": "SD-02",
                            "titre": "Sous-direction de l'action sociale",
                            "texte": "Prévoyance, santé et soutien matériel aux agents du portefeuille public.",
                            "points": ["Aides exceptionnelles et secours", "Prêts d'équipement et logement", "Médecine du travail", "Évacuations sanitaires"],
                            "lien": "/app/action-sociale",
                            "indicateur": "Guichet ouvert — exercice 2026",
                        },
                        {
                            "code": "SD-03",
                            "titre": "Sous-direction de la formation continue",
                            "texte": "Compétences managériales et certifications des dirigeants d'entreprises publiques.",
                            "points": ["Besoins sectoriels annuels", "Cycles de formation et pôle OHADA", "Passeport numérique de compétences", "Arbitrage des plans de formation"],
                            "lien": "/app/formation",
                            "indicateur": "48 modules homologués",
                        },
                    ],
                },
                "dashboard": {
                    "campagne": {"libelle": "Campagne de notation", "cloture": "2026-03-31"},
                    "kpis": [
                        {
                            "libelle": "Effectif global supervisé", "valeur": "4 826", "unite": "", "icone": "groups", "ton": "primary",
                            "badge": "+3,2 %", "badge_ton": "positif", "detail": "Fonctionnaires et contractuels de l'État",
                            "tendance": "+3,2 %",
                            "jauge": {"pourcentage": 58, "gauche": "58 % sociétés d'État (2 799)", "droite": "42 % administration (2 027)"},
                        },
                        {
                            "libelle": "Visas DRH en attente", "valeur": "34", "unite": "", "icone": "pending_actions", "ton": "secondary",
                            "badge": "12 urgents (J-2)", "badge_ton": "alerte", "detail": "Requêtes nécessitant le contreseing du DRH",
                            "tendance": "12 urgents",
                            "repartition": ["18 congés", "9 prêts", "7 carrières"],
                        },
                        {
                            "libelle": "Avancement et évaluations", "valeur": "91,4 %", "unite": "", "icone": "fact_check", "ton": "primary",
                            "badge": "Campagne 2026", "badge_ton": "neutre", "detail": "Taux de dossiers notés et calculés",
                            "tendance": "Campagne 2026",
                            "jauge": {"pourcentage": 91.4, "gauche": "4 411 dossiers traités", "droite": "415 restants"},
                        },
                        {
                            "libelle": "Action sociale et prêts", "valeur": "72,8 M", "unite": "FCFA", "icone": "account_balance_wallet", "ton": "secondary",
                            "badge": "", "badge_ton": "neutre", "detail": "Engagés sur une dotation de 120 M FCFA",
                            "tendance": "",
                            "jauge": {"pourcentage": 60.6, "gauche": "Consommé : 60,6 %", "droite": "Solde : 47,2 M"},
                        },
                    ],
                    "charges": [
                        {"titre": "SD Carrières & Actes", "volume": "18 actes", "detail": "12 avancements de grade, 6 mutations d'office ou de convenance.", "icone": "assignment_ind", "ton": "primary", "pourcentage": 78},
                        {"titre": "SD Action Sociale", "volume": "9 aides", "detail": "5 secours exceptionnels santé, 4 prêts d'équipement.", "icone": "health_and_safety", "ton": "secondary", "pourcentage": 52},
                        {"titre": "SD Formation Continue", "volume": "7 sessions", "detail": "Plans certifiants OHADA et gouvernance financière.", "icone": "school", "ton": "tertiary", "pourcentage": 35},
                    ],
                },
                "carriere": {
                    "titre": "Sous-direction de la gestion des carrières",
                    "chapo": "Pilotage des actes, des avancements et des mouvements du portefeuille de l'État.",
                    "compteurs": [
                        {"libelle": "Avancements automatiques", "valeur": "142", "detail": "100 % calculés", "icone": "trending_up", "pourcentage": 100},
                        {"libelle": "Projets d'arrêtés de mutation", "valeur": "28", "detail": "Visa DRH en suspens", "icone": "swap_horiz", "pourcentage": 64},
                        {"libelle": "Congés et autorisations", "valeur": "67", "detail": "9 disponibilités à statuer", "icone": "event_available", "pourcentage": 86},
                        {"libelle": "Éligibles à la retraite (12 mois)", "valeur": "14", "detail": "Dont 6 postes de direction", "icone": "elderly", "pourcentage": 43},
                    ],
                    "pyramide": [
                        {"tranche": "60 ans et +", "hommes": 214, "femmes": 96},
                        {"tranche": "50-59 ans", "hommes": 702, "femmes": 412},
                        {"tranche": "40-49 ans", "hommes": 905, "femmes": 688},
                        {"tranche": "30-39 ans", "hommes": 674, "femmes": 621},
                        {"tranche": "Moins de 30 ans", "hommes": 304, "femmes": 210},
                    ],
                    "departs": {"nombre": 14, "postes_direction": 6, "detail": "Départs à la limite d'âge d'ici octobre 2027, dont 6 postes de direction sans successeur désigné."},
                },
                "modules": {
                    "social": {"titre": "Sous-direction de l'action sociale", "chapo": "Aides, prêts et secours des agents du portefeuille."},
                    "formation": {"titre": "Sous-direction de la formation continue", "chapo": "Plans de formation et certifications."},
                    "carriere": {"titre": "Actes de carrière", "chapo": "Arrêtés, mutations et disponibilités."},
                },
            },
        )

    def _communications(self, auteur: User) -> None:
        from datetime import date as jour

        from personnel.communications import ANNONCES_INITIALES

        Communication.objects.all().delete()
        for annonce in ANNONCES_INITIALES:
            Communication.objects.create(
                titre=annonce["titre"],
                texte=annonce["texte"],
                rubrique=annonce["rubrique"],
                publie=True,
                publie_le=jour.fromisoformat(annonce["publie_le"]),
                auteur=auteur,
            )

    def _notifications(self, drh: User) -> None:
        """Notifications du DRH, datées par rapport au chargement pour rester « récentes »."""
        Notification.objects.filter(destinataire=drh).delete()
        maintenant = timezone.now()
        for minutes, categorie, titre, message, lien, urgente, lue in [
            (8, "systeme", "Mettre à jour les informations publiques", "Les annonces de la DRH affichées sur la page d'accueil sont à revoir.", "/app/communication#informations-publiques", False, False),
            (12, "visa", "Visa urgent : avancement d'échelon", "KOUASSI Jean-Baptiste · échelon 3 vers 4. Délai de rigueur à J-2.", "/app/tableau-de-bord", True, False),
            (47, "visa", "Visa urgent : prêt immobilier", "YAO Constant Sylvain · prêt bonifié de 8 500 000 FCFA, accord de la commission sociale.", "/app/tableau-de-bord", True, False),
            (95, "demande", "Titre de congé à signer", "BAMBA Aïcha épouse DIABY · 30 jours à compter du 10 mars, intérim validé.", "/app/circuits", True, False),
            (180, "demande", "Complément requis", "SORO Karidja · secours médical : facture normalisée manquante.", "/app/dossiers/476112P", False, False),
            (60 * 5, "releve", "Relève à préparer", "Directeur Technique (BNETD) : vivier interne de 1 candidat pour un départ en 2028.", "/app/carrieres", False, False),
            (60 * 26, "dossier", "Nomination signée", "TRAORÉ Mariam épouse CISSÉ nommée Directrice Financière, PETROCI Holding.", "/app/dossiers/455870T", False, True),
            (60 * 30, "demande", "Formation à viser", "N'GUESSAN Éric Yao · cycle des dirigeants, visa SD Formation obtenu.", "/app/circuits", False, True),
            (60 * 50, "systeme", "Campagne de notation ouverte", "La campagne de notation 2026 est ouverte jusqu'au 31 mars.", "/app/carrieres", False, True),
        ]:
            Notification.objects.create(
                destinataire=drh, categorie=categorie, titre=titre, message=message, lien=lien,
                urgente=urgente, lue=lue, creee_le=maintenant - timedelta(minutes=minutes),
            )

    # --- Messagerie interne ------------------------------------------------------

    COMPTES = [
        ("349812K", "Chef de cellule contrôle financier", "Chef de service"),
        ("318490K", "Administrateur civil général", "Agent"),
        ("394812H", "Chargé d'études financières", "Agent"),
        ("476112P", "Assistante, service de l'action sociale", "Sous directeur"),
        ("289043B", "Inspecteur général du Trésor", "Agent"),
        ("340188P", "Administrateur civil", "Agent"),
        ("411904C", "Responsable RH, PETROCI Holding", "Sous directeur"),
        ("455870T", "Directrice Financière, PETROCI Holding", "Chef de service"),
    ]

    def _comptes_agents(self, agents: dict[str, Agent]) -> dict[str, User]:
        """Comptes de démonstration (même mot de passe que le DRH) pour échanger par messagerie."""
        comptes = {}
        for matricule, fonction, role in self.COMPTES:
            agent = agents[matricule]
            user, _created = User.objects.get_or_create(username=matricule)
            user.first_name = agent.prenoms
            user.last_name = agent.nom
            user.set_password(DEMO_PASSWORD)
            user.save()
            Profil.objects.update_or_create(user=user, defaults={"fonction": fonction, "role": role, "organisme": agent.organisme})
            comptes[matricule] = user
        return comptes

    def _messagerie(self, drh: User, comptes: dict[str, User]) -> None:
        Conversation.objects.all().delete()
        maintenant = timezone.now()

        def conversation(participants: list[User], messages: list[tuple[User, int, str]], lu_drh_il_y_a: int, sujet: str = "") -> None:
            fil = Conversation.objects.create(sujet=sujet, mise_a_jour=maintenant - timedelta(minutes=messages[-1][1]))
            for user in participants:
                # Les agents ont tout lu ; le DRH a lu jusqu'à « lu_drh_il_y_a » minutes.
                lu = maintenant - timedelta(minutes=lu_drh_il_y_a) if user == drh else maintenant
                Participation.objects.create(conversation=fil, utilisateur=user, lu_jusqu_a=lu)
            for auteur, il_y_a, texte in messages:
                Message.objects.create(conversation=fil, auteur=auteur, texte=texte, envoye_le=maintenant - timedelta(minutes=il_y_a))

        kouassi, soro, koffi, kone, traore = (comptes[m] for m in ("394812H", "476112P", "349812K", "318490K", "455870T"))
        conversation([drh, kouassi], [
            (kouassi, 130, "Bonjour Monsieur le Directeur, mon projet d'arrêté d'avancement attend votre visa depuis le 27 février. Manque-t-il une pièce ?"),
            (drh, 110, "Bonjour M. Kouassi, le dossier est complet. Je le vise dans la journée."),
            (kouassi, 25, "Merci beaucoup, c'est noté."),
        ], lu_drh_il_y_a=110)
        conversation([drh, soro], [
            (soro, 180, "Bonjour, j'ai déposé ce matin au service de l'action sociale la facture normalisée demandée pour mon secours médical."),
        ], lu_drh_il_y_a=600)
        conversation([drh, koffi, kone], [
            (kone, 60 * 22, "Le tableau d'avancement 2026 est prêt pour relecture."),
            (koffi, 60 * 21, "J'ai vérifié les dix lignes : deux avis restent réservés (SNDI et PETROCI)."),
            (drh, 60 * 20, "Merci. Relancez les supérieurs pour les avis manquants avant vendredi."),
        ], lu_drh_il_y_a=60 * 20, sujet="Cellule visas & actes")
        conversation([drh, traore], [
            (traore, 60 * 50, "Merci pour la confiance accordée. Je prends mes fonctions de Directrice Financière le 1er mars."),
            (drh, 60 * 49, "Félicitations, Madame. Excellente prise de fonction."),
        ], lu_drh_il_y_a=60 * 49)

    def _nomenclature(self) -> None:
        from personnel.models import EmploiReferentiel, GradeReferentiel
        from personnel.nomenclature import charger

        if GradeReferentiel.objects.filter(code="A7").exists():
            return
        charger(GradeReferentiel, EmploiReferentiel)

    def _effectifs(self, drh: User) -> None:
        for modele in (
            FicheBesoin, DemandeDotation, AlertePoste, Passerelle, JournalEffectif,
            FiliereBesoin, BranchePlafond, CampagneBesoin, ExerciceDotation,
        ):
            modele.objects.all().delete()
        entites = {}
        Profil.objects.update(structure=None)
        EntiteTutelle.objects.update(parent=None)
        EntiteTutelle.objects.all().delete()
        PoleMinisteriel.objects.all().delete()
        poles = {}
        for ordre, (code, nom) in enumerate(POLES, start=1):
            poles[code] = PoleMinisteriel.objects.create(code=code, nom=nom, ordre=ordre)
        for ordre, (code, pole, nom, niveau, parent) in enumerate(STRUCTURES, start=1):
            entites[code] = EntiteTutelle.objects.create(
                code=code, nom=nom, pole=poles[pole], ordre=ordre, niveau=niveau,
                parent=entites[parent] if parent else None,
            )
        for ordre, (code, parent, nom, niveau) in enumerate(RATTACHEMENTS, start=len(STRUCTURES) + 1):
            entites[code] = EntiteTutelle.objects.create(
                code=code, nom=nom, pole=entites[parent].pole, parent=entites[parent], ordre=ordre, niveau=niveau,
            )
        drh.profil.structure = entites["drh"]
        drh.profil.role = "Directeur"
        drh.profil.habilitations = ["validation"] * (ModuleHabilitation.objects.count() or 6)
        drh.profil.save(update_fields=["structure", "role", "habilitations"])

        ExerciceDotation.objects.create(
            annee=2026,
            intitule="Plafonds d'emplois autorisés",
            fondement="Décret n° 2024-118",
        )
        for ordre, code, libelle, entites_texte, icone, effectif, plafond, note in (
            (1, "cabinet", "Structures rattachées au Cabinet", "Inspection générale, DRH, DAF, DSI", "account_balance", 820, 900, "Directions, cellules et service du cabinet"),
            (2, "dgpe", "DGPE", "Portefeuille, affaires juridiques, capital humain", "corporate_fare", 2100, 2200, "Directions et services de la DGPE"),
            (3, "dgpn", "DGPN", "Performance, audit, informatique, personnel", "monitoring", 1906, 1950, "Directions et services de la DGPN"),
        ):
            BranchePlafond.objects.create(
                code=code, libelle=libelle, entites=entites_texte, icone=icone,
                effectif=effectif, plafond=plafond, note=note, ordre=ordre,
            )
        demandes = (
            ("REC-2026-088", "drh", "Direction des Ressources Humaines", "Cadres des sociétés d'État", "affectation", 1, "visa_cf", "Contrôle des emplois en cours", "Vérification du plafond de la direction", date(2026, 2, 14), False),
            ("REC-2026-074", "dsi", "Direction des Systèmes d'Information", "Ingénieurs informaticiens", "reaffectation", 3, "acte", "Avis favorable de la DRH", "Poste couvert par le plafond 2026", date(2026, 2, 8), False),
            ("REC-2026-061", "smg-dgpe", "Service des Moyens Généraux (DGPE)", "Agents administratifs", "redeploiement", 0, "acte", "Avis favorable de la DRH", "Redéploiement à effectif constant", date(2026, 2, 1), True),
            ("REC-2026-055", "dinfo", "Direction de l'Informatique", "Ingénieurs informaticiens", "disposition", 1, "arbitrage", "Avis de la DRH en attente", "Transmis pour arbitrage des emplois", date(2026, 1, 27), False),
        )
        for reference, code, direction, poste, nature, impact, statut, visa, detail, recu, notifiee in demandes:
            DemandeDotation.objects.create(
                reference=reference, entite=entites[code], direction=direction, poste=poste,
                nature=nature, impact=impact, statut=statut, visa=visa, detail=detail,
                recu_le=recu, notifiee=notifiee,
            )
        for code, intitule, detail, postes, jours, piste in (
            ("drh", "Cadres des sociétés d'État", "Postes vacants à la direction des ressources humaines.", 4, 74, "Recrutement ou mobilité interne"),
            ("daf", "Corps des Administrateurs Financiers", "Postes vacants à la direction des affaires financières.", 2, 60, "Cadres de la direction des affaires financières"),
            ("dchc", "Attachés d'administration", "Postes suivis par la direction du capital humain.", 3, 45, "Appel entre structures de la DGPE"),
        ):
            AlertePoste.objects.create(
                entite=entites[code], intitule=intitule, detail=detail, postes=postes, jours=jours, piste=piste,
            )
        for cedant, recepteur, profil, effectif in (
            ("Direction des Systèmes d'Information", "Service des Systèmes d'Information (DGPE)", "Administrateurs de systèmes", 5),
            ("Service des Moyens Généraux (DGPE)", "Service Financier et des Moyens Généraux", "Gestionnaires des moyens généraux", 8),
            ("Cellule de Passation des Marchés Publics", "Cellule de Gestion et d'Attribution des Marchés", "Juristes des marchés publics", 3),
        ):
            Passerelle.objects.create(
                cedant=cedant, recepteur=recepteur, profil=profil, effectif=effectif,
                statut=Passerelle.Statut.ACTEE,
            )
        auteur = f"{drh.get_full_name()} (Directeur des Ressources Humaines)"
        maintenant = timezone.now()
        for reference, titre, quand in (
            ("JRN-2026-0003", "Avis favorable pour la Direction des Systèmes d'Information", maintenant),
            ("JRN-2026-0002", "Plafond de la DGPE notifié aux directions", maintenant - timedelta(days=1)),
            ("JRN-2026-0001", "Annexe des plafonds enregistrée pour l'exercice 2026", timezone.make_aware(datetime(2026, 2, 12, 9, 12))),
        ):
            JournalEffectif.objects.create(reference=reference, titre=titre, auteur=auteur, cree_le=quand)

        CampagneBesoin.objects.create(
            exercice=2026,
            ouverte=True,
            cadrage="Cadrage des plafonds d'emplois validé",
            pea_max=5050,
            volume_precedent=14,
        )
        for ordre, code, libelle, icone, requis, couverts in (
            (1, "petrole", "Ingénierie pétrolière et transition énergétique", "oil_barrel", 54, 39),
            (2, "numerique", "Gouvernance numérique et protection des données", "security", 32, 21),
            (3, "audit", "Audit, contrôle de gestion et trésorerie", "account_balance", 40, 32),
            (4, "juridique", "Marchés publics et contentieux", "gavel", 18, 14),
        ):
            FiliereBesoin.objects.create(
                code=code, libelle=libelle, icone=icone, requis=requis, couverts=couverts, ordre=ordre,
            )

        def moment(jour, heure, minute):
            return timezone.make_aware(datetime(2026, 2, jour, heure, minute))

        fiches = (
            ("BES-2026-042", "drh", "Direction des Ressources Humaines", "Gestionnaire des carrières", "A3", "Effectifs", 3, "Départs en retraite et tenue des dossiers", "creation", "favorable", "Favorable : 2 postes", "Avis favorable de la DRH", "Marge du plafond : 4 emplois", True, 2, moment(18, 10, 42)),
            ("BES-2026-039", "dsi", "Direction des Systèmes d'Information", "Administrateur du système d'information", "A4", "Systèmes d'information", 5, "Sécurisation du système d'information du ministère", "creation", "instruction", "Instruction technique en cours", "Instruction en cours", "5 postes demandés au titre du plafond", True, 0, moment(17, 15, 15)),
            ("BES-2026-031", "daj-dgpe", "Direction des Affaires Juridiques (DGPE)", "Juriste des sociétés d'État", "A4", "Droit des sociétés", 2, "Contentieux des participations de l'État", "creation", "favorable", "Favorable : 2 postes", "Avis favorable", "Dans le plafond de la DGPE", False, 2, moment(14, 9, 30)),
            ("BES-2026-027", "smg-dgpe", "Service des Moyens Généraux (DGPE)", "Gestionnaire des moyens généraux", "B3", "Logistique", 4, "Renfort du service des moyens généraux", "mobilite", "rejet", "Reconversion interne exigée", "Plafond d'emplois dépassé", "Vivier interne disponible", False, 0, moment(11, 16, 48)),
            ("BES-2026-022", "dspq", "Direction du Suivi de la Performance et de la Qualité", "Chargé du suivi de la performance", "A5", "Performance", 2, "Suivi des indicateurs des directions", "renfort", "complement", "Renvoyé pour évaluation", "Volume compatible avec le plafond", "Dans le plafond de la DGPN", False, 0, moment(8, 11, 20)),
        )
        for reference, code, direction, profil, grade, specialite, volume, motif, nature, statut, arbitrage, visa, detail, critique, accordes, depose in fiches:
            FicheBesoin.objects.create(
                reference=reference, entite=entites[code], direction=direction, profil=profil,
                grade=grade, specialite=specialite, volume=volume, motif=motif, nature=nature,
                statut=statut, arbitrage=arbitrage, visa=visa, detail=detail,
                critique=critique, postes_accordes=accordes, depose_le=depose,
            )
