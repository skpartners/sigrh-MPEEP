from django.core.management.base import BaseCommand

from personnel.echeances import surveiller


class Command(BaseCommand):
    help = "Surveille les échéances de congés et les retours de congé, de formation et d'absence."

    def handle(self, *args, **options):
        nombre = surveiller()
        self.stdout.write(self.style.SUCCESS(f"{nombre} rappel(s) d'échéance envoyé(s)."))
