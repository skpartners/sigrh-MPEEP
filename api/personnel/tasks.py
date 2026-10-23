"""Tâches planifiées de SIGRH, exécutées par Celery (worker) et déclenchées par Celery beat."""

from celery import shared_task

from .taches import executer_vue, purger_taches  # noqa: F401 : tâches enregistrées auprès de Celery


@shared_task(name="personnel.purger_medias", ignore_result=True)
def purger_medias() -> int:
    """Supprime les médias de la messagerie de plus de 48 h : le disque ne doit pas se remplir."""
    from .messagerie import purger_medias as purger

    return purger()


@shared_task(name="personnel.surveiller_echeances")
def surveiller_echeances() -> int:
    """Rappels d'échéances de la campagne de congés et veille des retours. Retourne le nombre de rappels créés."""
    from .echeances import surveiller

    return surveiller()
