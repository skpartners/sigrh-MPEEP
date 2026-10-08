from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path
from django.views.static import serve

DIST = settings.BASE_DIR.parent / "client" / "dist"


def application_front(request, chemin=""):
    """Sert le front construit : les fichiers réels, puis index.html pour les routes de l'écran."""
    if not DIST.is_dir():
        return HttpResponseNotFound("Le front n'est pas construit.")
    relatif = chemin.replace("\\", "/").lstrip("/")
    if relatif:
        fichier = (DIST / relatif).resolve()
        racine = DIST.resolve()
        if fichier.is_file() and (fichier == racine or racine in fichier.parents):
            return FileResponse(fichier.open("rb"))
    index = DIST / "index.html"
    if not index.is_file():
        return HttpResponseNotFound("Le front n'est pas construit.")
    return FileResponse(index.open("rb"))


def media(request, path):
    """Sert les fichiers déposés ; le dossier est lu à chaque requête, pas au chargement des routes."""
    return serve(request, path, document_root=settings.MEDIA_ROOT)


urlpatterns = [
    path("sigrh/admin/", admin.site.urls),
    path("sigrh/api/v1/", include("personnel.urls")),
    re_path(r"^sigrh/media/(?P<path>.*)$", media),
    re_path(r"^sigrh(?:/(?P<chemin>.*))?$", application_front),
]
