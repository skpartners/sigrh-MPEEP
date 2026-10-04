"""Jeton d'API, et mémoire du compte pour les documents qu'il génère."""

from rest_framework.authentication import TokenAuthentication

from .rapports.auteur import noter_auteur, oublier_auteur


class JetonSigrh(TokenAuthentication):
    def authenticate(self, request):
        resultat = super().authenticate(request)
        if resultat is not None:
            noter_auteur(resultat[0])
        return resultat


class AuteurPdfMiddleware:
    """Oublie le compte à la fin de la requête, pour ne pas le prêter à la suivante."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            return self.get_response(request)
        finally:
            oublier_auteur()
