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


def en_tetes_hors_ligne(en_tetes, chemin, url):
    """Le service worker et le manifeste ne se gardent jamais : le navigateur doit voir tout de suite un nouveau déploiement.

    Un service worker servi avec une validité de plusieurs minutes retarderait d'autant la mise à jour du mode hors ligne
    (et donc de l'application). Étendue autorisée : tout /sigrh/.
    """
    nom = url.rsplit("/", 1)[-1]
    if nom in {"sw.js", "registerSW.js", "manifest.webmanifest"}:
        en_tetes["Cache-Control"] = "no-cache"
    if nom == "sw.js":
        en_tetes["Service-Worker-Allowed"] = PREFIXE


class WhiteNoiseFront(WhiteNoiseMiddleware):
    def __init__(self, get_response=None, settings=settings):
        super().__init__(get_response, settings)
        self.add_headers_function = en_tetes_hors_ligne
        if DIST.is_dir():
            self.add_files(str(DIST), prefix=PREFIXE)
