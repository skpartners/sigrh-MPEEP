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

# Transport : en production tout passe par HTTPS (tunnel Cloudflare). Les données qui voyagent, y compris les actions
# rejouées après une coupure, ne sont donc lisibles par aucun intermédiaire. HSTS interdit ensuite au navigateur de
# retomber en HTTP. Désactivable avec SIGRH_HTTPS=false (réseau interne sans TLS uniquement).
HTTPS_ACTIF = _env("SIGRH_HTTPS", "false" if DEBUG else "true").lower() in {"1", "true", "yes"}
if HTTPS_ACTIF:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = 31_536_000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Antivirus : chaque fichier reçu par l'API est analysé par ClamAV (service Windows ClamAV-Daemon, 127.0.0.1:3310)
# avant d'être conservé. Actif en production, inactif en développement ; SIGRH_CLAMAV=true|false force le choix.
# Démon injoignable : l'envoi est refusé (503) plutôt qu'accepté sans analyse (voir personnel/antivirus.py).
CLAMAV_ACTIF = _env("SIGRH_CLAMAV", "false" if DEBUG else "true").lower() in {"1", "true", "yes"}
CLAMAV_HOTE = _env("SIGRH_CLAMAV_HOTE", "127.0.0.1")
CLAMAV_PORT = int(_env("SIGRH_CLAMAV_PORT", "3310"))
CLAMAV_DELAI = float(_env("SIGRH_CLAMAV_DELAI", "60"))
FILE_UPLOAD_HANDLERS = [
    "personnel.antivirus.AnalyseAntivirus",
    "django.core.files.uploadhandler.MemoryFileUploadHandler",
    "django.core.files.uploadhandler.TemporaryFileUploadHandler",
]

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
    "config.statiques.WhiteNoiseFront",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "personnel.authentification.AuteurPdfMiddleware",
    "personnel.hors_ligne.SaisieHorsLigneMiddleware",
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

# Base de données. SQLite par défaut, réglée pour plusieurs processus (WAL : les lectures ne bloquent pas l'écriture, le
# délai d'attente évite les erreurs « database is locked »). Pour une forte charge, PostgreSQL : SIGRH_DB_ENGINE=postgres
# avec SIGRH_DB_NAME, SIGRH_DB_USER, SIGRH_DB_PASSWORD, SIGRH_DB_HOST et SIGRH_DB_PORT (voir README, « Passer à PostgreSQL »).
if _env("SIGRH_DB_ENGINE").lower() in {"postgres", "postgresql"}:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": _env("SIGRH_DB_NAME", "sigrh"),
            "USER": _env("SIGRH_DB_USER", "sigrh"),
            "PASSWORD": _env("SIGRH_DB_PASSWORD"),
            "HOST": _env("SIGRH_DB_HOST", "127.0.0.1"),
            "PORT": _env("SIGRH_DB_PORT", "5432"),
            # Chaque requête s'exécute dans son propre fil, donc avec sa propre connexion : sans réserve de connexions, des
            # dizaines de requêtes simultanées épuisent le serveur PostgreSQL, qui sert aussi d'autres projets. Chaque processus
            # garde donc au plus SIGRH_DB_POOL_MAX connexions, et les requêtes en trop patientent au lieu d'échouer.
            "CONN_MAX_AGE": 0,
            "OPTIONS": {"pool": {"min_size": 2, "max_size": int(_env("SIGRH_DB_POOL_MAX", "8")), "timeout": 20}},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
            "OPTIONS": {
                "timeout": 30,
                "transaction_mode": "IMMEDIATE",
                "init_command": "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=30000",
            },
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
# Fichiers hachés du front : validité d'un an (voir config/statiques.py).
WHITENOISE_IMMUTABLE_FILE_TEST = r"^/sigrh/assets/"
WHITENOISE_MAX_AGE = 300
WHITENOISE_INDEX_FILE = False
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
    # Actions saisies hors ligne : voir personnel/hors_ligne.py.
    "idempotency-key",
    "x-saisi-le",
    "x-hors-ligne",
]
CORS_EXPOSE_HEADERS = ["idempotent-replayed"]

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

# Cache partagé entre les processus (Redis) : avancement des tâches de fond, réponses courtes des écrans lourds.
# Sans CACHE_REDIS_URL, cache en mémoire du processus (développement, tests).
_CACHE_REDIS_URL = _env("CACHE_REDIS_URL")
CACHES = {
    "default": (
        {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": _CACHE_REDIS_URL, "KEY_PREFIX": "sigrh", "TIMEOUT": 300}
        if _CACHE_REDIS_URL
        else {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    )
}

# Tâches planifiées (Celery + Redis). Sans CELERY_BROKER_URL, rien n'est branché : le serveur garde sa boucle interne
# (personnel/echeances.py). Avec un broker, le worker et beat prennent le relais (services SIGRH-Celery et SIGRH-Celery-Beat).
CELERY_BROKER_URL = _env("CELERY_BROKER_URL")
CELERY_RESULT_BACKEND = _env("CELERY_RESULT_BACKEND") or CELERY_BROKER_URL or None
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_IGNORE_RESULT = True
CELERY_BEAT_SCHEDULE = {
    # Toutes les six heures, comme la boucle interne qu'il remplace.
    "surveiller-echeances": {"task": "personnel.surveiller_echeances", "schedule": 6 * 3600},
    # Les positions suivent les dates du jour (début et fin d'un détachement, d'une disponibilité, d'une formation) : relevé toutes les 30 minutes.
    "synchroniser-positions": {"task": "personnel.synchroniser_positions", "schedule": 1800},
    # Résultats de tâches de fond et fichiers de la messagerie : jamais conservés au-delà de leur durée.
    "purger-taches": {"task": "personnel.purger_taches", "schedule": 3600},
    "purger-medias": {"task": "personnel.purger_medias", "schedule": 1800},
}
# Un worker traite plusieurs tâches à la fois (threads) : un long import ne bloque pas les rappels ni les autres exports.
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ACKS_LATE = True

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
    "EXCEPTION_HANDLER": "personnel.antivirus.gestionnaire_erreurs",
}
