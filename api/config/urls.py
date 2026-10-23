from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponseNotFound
from django.urls import include, path, re_path
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.static import serve

DIST = settings.BASE_DIR.parent / "client" / "dist"


@xframe_options_sameorigin
def application_front(request, chemin=""):
    """Sert le front construit : les fichiers réels, puis index.html pour les routes de l'écran. Cadre autorisé depuis la même origine
    seulement (parcours d'adhésion : les documents juridiques s'affichent dans la page).
    """
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
    # La page d'entrée change à chaque déploiement : le navigateur la redemande toujours (voir NouvelleVersion côté front).
    reponse = FileResponse(index.open("rb"))
    reponse["Cache-Control"] = "no-cache"
    return reponse


# Dossiers dont les fichiers ne sortent que par une route authentifiée (messagerie, résultats de tâches, documents signés).
DOSSIERS_PROTEGES = ("messagerie/", "taches/", "documents-signes/")


@xframe_options_sameorigin
def media(request, path):
    """Sert les fichiers déposés ; le dossier est lu à chaque requête, pas au chargement des routes."""
    if path.replace("\\", "/").lstrip("/").startswith(DOSSIERS_PROTEGES):
        return HttpResponseNotFound("Fichier introuvable.")
    reponse = serve(request, path, document_root=settings.MEDIA_ROOT)
    # Un fichier déposé garde son nom : le navigateur peut le garder une heure, sans le redemander à chaque page.
    reponse["Cache-Control"] = "public, max-age=3600"
    return reponse


urlpatterns = [
    path("sigrh/admin/", admin.site.urls),
    path("sigrh/api/v1/", include("personnel.urls")),
    re_path(r"^sigrh/media/(?P<path>.*)$", media),
    re_path(r"^sigrh(?:/(?P<chemin>.*))?$", application_front),
]
