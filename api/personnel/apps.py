from django.apps import AppConfig


class PersonnelConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "personnel"
    verbose_name = "Personnel SIGRH"

    def ready(self):
        # Branche les signaux de diffusion temps réel (messages, notifications).
        from . import temps_reel  # noqa: F401
        from .echeances import demarrer_si_serveur

        demarrer_si_serveur()
