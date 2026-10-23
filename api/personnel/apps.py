import os
import sys
import threading

from django.apps import AppConfig


class PersonnelConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "personnel"
    verbose_name = "Personnel SIGRH"

    def ready(self):
        # Branche les signaux de diffusion temps réel (messages, notifications).
        from . import temps_reel  # noqa: F401
        from django.apps import apps
        from django.db.models.signals import post_migrate

        from .connexion_admin import assurer_administrateur
        from .echeances import demarrer_si_serveur

        demarrer_si_serveur()

        # Pas de requête pendant l'initialisation : le compte administrateur est assuré
        # après chaque migration, et une fois les applications chargées avec le serveur.
        post_migrate.connect(
            lambda **_kw: assurer_administrateur(),
            dispatch_uid="personnel.assurer_administrateur",
        )
        if os.environ.get("RUN_MAIN") == "true" or "--noreload" in sys.argv or os.environ.get("SIGRH_SERVEUR") == "1":
            if "pytest" not in sys.modules:

                def _assurer():
                    apps.ready_event.wait()
                    assurer_administrateur()

                threading.Thread(target=_assurer, name="admin-initial", daemon=True).start()
