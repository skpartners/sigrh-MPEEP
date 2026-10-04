"""Informations publiées par la DRH sur la page d'accueil."""

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Communication, Publication
from .utilisateurs import RANG, acces_menu

MODULE = "Statistiques & RBAC"
FONCTION = "Communication"

ANNONCES_INITIALES = (
    {
        "rubrique": "campagne",
        "titre": "Mise à jour des personnes à charge",
        "texte": (
            "Les agents qui souhaitent déclarer ou mettre à jour une personne à charge déposent "
            "l'acte de naissance et, le cas échéant, le certificat de scolarité au service de l'action sociale."
        ),
        "publie_le": "2026-10-01",
    },
    {
        "rubrique": "avis",
        "titre": "Retrait des attestations et relevés de carrière",
        "texte": (
            "Les attestations de présence et les relevés de carrière se retirent au secrétariat de la DRH, "
            "Immeuble SCIAM, Plateau, du lundi au vendredi, de 7 h 30 à 16 h 30. "
            "Prévoir le matricule et une pièce d'identité."
        ),
        "publie_le": "2026-09-22",
    },
    {
        "rubrique": "information",
        "titre": "Vérification des coordonnées personnelles",
        "texte": (
            "La Direction des ressources humaines demande à chaque agent de vérifier son numéro de téléphone "
            "et son adresse de messagerie. Les corrections se transmettent au gestionnaire de son service."
        ),
        "publie_le": "2026-09-15",
    },
)

RUBRIQUES = {code for code, _libelle in Communication.Rubrique.choices}


def _ligne(item: Communication) -> dict:
    return {
        "id": item.pk,
        "titre": item.titre,
        "texte": item.texte,
        "rubrique": item.rubrique,
        "rubrique_libelle": item.get_rubrique_display(),
        "publie": item.publie,
        "publie_le": item.publie_le.isoformat() if item.publie_le else None,
    }


def _droit(user) -> str:
    acces = acces_menu(user.profil)
    return acces["fonctions"].get(f"{MODULE}|{FONCTION}") or acces["modules"].get(MODULE, "refus")


def _interdit(user, minimum: str):
    if RANG.get(_droit(user), 0) < RANG[minimum]:
        return Response({"detail": "Cette action est hors de votre habilitation."}, status=403)
    return None


def _lire(data) -> tuple[dict | None, Response | None]:
    titre = str(data.get("titre") or "").strip()
    texte = str(data.get("texte") or "").strip()
    rubrique = str(data.get("rubrique") or "").strip()
    if not titre:
        return None, Response({"detail": "Indiquez le titre."}, status=400)
    if len(titre) > 200:
        return None, Response({"detail": "Le titre dépasse 200 caractères."}, status=400)
    if not texte:
        return None, Response({"detail": "Indiquez le texte à publier."}, status=400)
    if rubrique not in RUBRIQUES:
        return None, Response({"detail": "Choisissez une rubrique."}, status=400)
    publie = bool(data.get("publie"))
    return {"titre": titre, "texte": texte, "rubrique": rubrique, "publie": publie}, None


def _appliquer(item: Communication, saisie: dict) -> None:
    item.titre = saisie["titre"]
    item.texte = saisie["texte"]
    item.rubrique = saisie["rubrique"]
    item.publie = saisie["publie"]
    if saisie["publie"] and item.publie_le is None:
        item.publie_le = timezone.localdate()
    item.save()


@api_view(["GET"])
@permission_classes([AllowAny])
def publiques(_request):
    """Page d'accueil : annonces publiées et communications que le DRH a rendues publiques."""
    lignes = [_ligne(item) for item in Communication.objects.filter(publie=True)]
    for item in Publication.objects.filter(statut=Publication.Statut.DIFFUSE, publique=True):
        lignes.append(
            {
                "id": item.pk,
                "source": "publication",
                "titre": item.intitule,
                "texte": item.corps,
                "rubrique": item.nature,
                "rubrique_libelle": item.get_nature_display(),
                "publie": True,
                "publie_le": timezone.localtime(item.publiee_le).date().isoformat() if item.publiee_le else None,
            }
        )
    for ligne in lignes:
        ligne.setdefault("source", "communication")
    lignes.sort(key=lambda ligne: ligne["publie_le"] or "", reverse=True)
    return Response(lignes)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def communications(request):
    if request.method == "GET":
        refus = _interdit(request.user, "lecture")
        if refus:
            return refus
        return Response([_ligne(item) for item in Communication.objects.all()])
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    saisie, erreur = _lire(request.data)
    if erreur:
        return erreur
    item = Communication(auteur=request.user)
    _appliquer(item, saisie)
    return Response(_ligne(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def communication_detail(request, pk: int):
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    item = Communication.objects.filter(pk=pk).first()
    if item is None:
        return Response({"detail": "Information introuvable."}, status=404)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    saisie, erreur = _lire(request.data)
    if erreur:
        return erreur
    _appliquer(item, saisie)
    return Response(_ligne(item))
