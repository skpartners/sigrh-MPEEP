import pytest


@pytest.fixture(autouse=True)
def hachage_rapide(settings):
    """seed_demo crée neuf comptes à chaque test : un hachage rapide, réservé aux tests, évite une minute d'attente."""
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
