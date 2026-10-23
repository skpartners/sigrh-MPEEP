from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from personnel.import_droits_conges import appliquer, lire


class Command(BaseCommand):
    help = "Charge les droits de congé annuel (2024 et 2025) depuis le classeur de la DAAF. Simulation par défaut."

    def add_arguments(self, parser):
        parser.add_argument("fichier", help="Classeur .xlsx des congés annuels du personnel")
        parser.add_argument("--ecrire", action="store_true", help="Enregistre les droits (sans cette option : simulation)")

    def handle(self, *args, **options):
        chemin = Path(options["fichier"])
        if not chemin.is_file():
            raise CommandError(f"Fichier introuvable : {chemin}")
        lignes = lire(chemin.read_bytes())
        bilan = appliquer(lignes, ecrire=options["ecrire"])
        self.stdout.write(f"Lignes lues : {bilan['lues']} · agents rapprochés : {bilan['appliquees']} · sans droit : {bilan['sans_droit']}")
        self.stdout.write(f"Jours dus au titre de 2024 : {bilan['jours_2024']} · au titre de 2025 : {bilan['jours_2025']}")
        for inconnu in bilan["inconnus"]:
            self.stdout.write(self.style.WARNING(f"Matricule inconnu : {inconnu}"))
        self.stdout.write(self.style.SUCCESS("Droits enregistrés." if options["ecrire"] else "Simulation : rien n'a été écrit (--ecrire pour enregistrer)."))
