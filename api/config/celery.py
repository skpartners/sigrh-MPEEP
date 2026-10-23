"""Application Celery de SIGRH (broker et résultats Redis).

Worker :  uv run celery -A config worker -l info --pool=solo   (Windows : --pool=solo)
Beat   :  uv run celery -A config beat -l info
En production, les deux tournent comme services NSSM : `make celery-installer`.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("sigrh")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
