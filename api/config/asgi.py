import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
# Initialise Django avant d'importer le code qui touche aux modèles.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402
from django.urls import path  # noqa: E402

from personnel.temps_reel import TempsReelConsumer  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Seules les origines du front (SIGRH_SPA_ORIGINS) peuvent ouvrir un WebSocket.
        "websocket": OriginValidator(URLRouter([path("ws/", TempsReelConsumer.as_asgi())]), settings.SPA_ORIGINS),
    }
)
