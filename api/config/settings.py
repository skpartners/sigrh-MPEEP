import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
_HOTES_LOCAUX = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def _lire_fichier_env(path: Path) -> None:
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _completer_admin_local(path: Path) -> None:
    """Le développement local ne charge pas tout le .env : seulement le compte administrateur."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("SIGRH_ADMIN_"):
            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


_fichier_env = os.environ.get("SIGRH_ENV_FILE", "").strip()
if _fichier_env:
    _chemin_env = Path(_fichier_env)
    if not _chemin_env.is_file():
        raise ImproperlyConfigured(f"Fichier d'environnement introuvable : {_chemin_env}")
    _lire_fichier_env(_chemin_env)
else:
    _completer_admin_local(BASE_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _hote(valeur: str) -> str:
    return valeur.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0].strip().lower()


def _publics(valeurs: list[str]) -> list[str]:
    if DEBUG:
        return valeurs
    return [valeur for valeur in valeurs if _hote(valeur) not in _HOTES_LOCAUX]


SECRET_KEY = _env("DJANGO_SECRET_KEY", "sigrh-dev-only-not-for-production")
# Compte qui ouvre la connexion. Vide : la page de connexion reste fermée.
ADMIN_MATRICULE = _env("SIGRH_ADMIN_MATRICULE")
ADMIN_MOT_DE_PASSE = _env("SIGRH_ADMIN_MOT_DE_PASSE")
ADMIN_NOM = _env("SIGRH_ADMIN_NOM")
ADMIN_PRENOMS = _env("SIGRH_ADMIN_PRENOMS")
ADMIN_FONCTION = _env("SIGRH_ADMIN_FONCTION", "Administrateur")
ADMIN_ORGANISME = _env("SIGRH_ADMIN_ORGANISME", "dgpe")
# Réservé aux tests : ouvre la connexion sans les variables d'environnement.
CONNEXION_OUVERTE = False
DEBUG = _env("DJANGO_DEBUG", "true").lower() in {"1", "true", "yes"}
ALLOWED_HOSTS = _publics([
    h.strip()
    for h in _env("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")
    if h.strip()
])
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS ne contient aucun hôte public.")

# Préfixe public : le tunnel Cloudflare publie l'application sous /sigrh.
ROOT_PATH = "/sigrh"

INSTALLED_APPS = [
    # daphne en tête : `runserver` sert alors l'application ASGI (HTTP + WebSocket).
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "channels",
    "personnel",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "personnel.authentification.AuteurPdfMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Abidjan"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/sigrh/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SPA_ORIGINS = _publics([
    origin.strip()
    for origin in _env(
        "SIGRH_SPA_ORIGINS",
        "http://127.0.0.1:9100,http://localhost:9100",
    ).split(",")
    if origin.strip()
])
CORS_ALLOWED_ORIGINS = SPA_ORIGINS
CSRF_TRUSTED_ORIGINS = [origin for origin in SPA_ORIGINS if origin.startswith("https://")]
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "origin",
]

# Temps réel (WebSocket). En mémoire : un seul processus, suffisant en développement.
# En production multi-processus : channels_redis avec CHANNEL_LAYERS_REDIS_URL.
_REDIS_URL = _env("CHANNEL_LAYERS_REDIS_URL")
CHANNEL_LAYERS = {
    "default": (
        {"BACKEND": "channels_redis.core.RedisChannelLayer", "CONFIG": {"hosts": [_REDIS_URL]}}
        if _REDIS_URL
        else {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    )
}

MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL = "/sigrh/media/"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "personnel.authentification.JetonSigrh",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "UNAUTHENTICATED_USER": None,
}
