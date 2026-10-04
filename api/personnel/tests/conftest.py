import pytest
from rest_framework.test import APIClient

# Les routes publiques sont sous /sigrh ; les tests continuent d'écrire /api/v1/…
_generique = APIClient.generic


def _avec_racine(self, method, path, *args, **kwargs):
    if isinstance(path, str) and path.startswith("/") and not path.startswith("/sigrh/") and path != "/sigrh":
        path = "/sigrh" + path
    return _generique(self, method, path, *args, **kwargs)


APIClient.generic = _avec_racine


@pytest.fixture(autouse=True)
def hachage_rapide(settings):
    """seed_demo crée neuf comptes à chaque test : un hachage rapide, réservé aux tests, évite une minute d'attente."""
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
