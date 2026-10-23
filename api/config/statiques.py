"""Service des fichiers du front construit (client/dist) par WhiteNoise.

Les fichiers hachés de /sigrh/assets/ (empreinte dans leur nom : ils ne changent jamais sous la même adresse, voir
WHITENOISE_IMMUTABLE_FILE_TEST dans settings.py) sont servis avec une validité d'un an (`immutable`), et en version compressée
(.br ou .gz) quand le navigateur l'accepte et que la compression a été faite au build (client/scripts/compresser-dist.mjs).
Le serveur applicatif n'a donc plus à lire ni à envoyer le front à chaque visite : avec plusieurs utilisateurs
connectés, il se consacre à l'API. index.html reste servi par la vue `application_front`, sans mise en cache.
"""

from django.conf import settings
from whitenoise.middleware import WhiteNoiseMiddleware

DIST = settings.BASE_DIR.parent / "client" / "dist"
PREFIXE = "/sigrh/"


class WhiteNoiseFront(WhiteNoiseMiddleware):
    def __init__(self, get_response=None, settings=settings):
        super().__init__(get_response, settings)
        if DIST.is_dir():
            self.add_files(str(DIST), prefix=PREFIXE)
