"""Registre des communications et publications officielles de la DRH."""

from datetime import datetime
from pathlib import Path

from django.contrib.auth.models import User
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .communications import _interdit
from .models import Agent, ConsultationFlash, LecturePublication, Notification, Publication, ReponseSondage

EXTENSIONS = {".pdf", ".doc", ".docx", ".odt", ".png", ".jpg", ".jpeg", ".webp"}
TAILLE_MAX = 10 * 1024 * 1024
ETAPE_DRH = "Attente du visa du DRH"

NATURES = {item.value: item.label for item in Publication.Nature}
URGENCES = {item.value: item.label for item in Publication.Urgence}
STATUTS = {item.value: item.label for item in Publication.Statut}
PERIMETRES = {item.value: item.label for item in Publication.Perimetre}


def semer():
    Publication.objects.filter(
        statut=Publication.Statut.VISA,
        etape_visa__in=["", "Attente visa du contrôle financier", "Attente signature DGPE", "Transmis au circuit de visa"],
    ).update(etape_visa=ETAPE_DRH)
    if Publication.objects.exists():
        return
    auteur = User.objects.filter(username="DRH-2018-044").first()
    horodatage = timezone.make_aware
    lignes = [
        dict(
            reference="014/MPEEP/DRH",
            nature=Publication.Nature.CIRCULAIRE,
            urgence=Publication.Urgence.URGENT,
            intitule="Lancement officiel de la campagne de notation et d'évaluation annuelle des cadres et personnels 2026",
            corps="Fixation des quotas de notation, grilles indiciaires de performance et ouverture des fiches d'évaluation individuelles. Tout retard entraîne l'annulation des propositions d'avancement au titre de l'exercice suivant.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.DIFFUSE,
            accuse=True,
            echeance=datetime(2026, 6, 15).date(),
            signataire="Kouamé N'Dri (DRH)",
            visa="Visa DGPE N° 849/26",
            taux_lecture=94,
            publiee_le=horodatage(datetime(2026, 5, 18, 9, 30)),
        ),
        dict(
            reference="2026-08/DRH",
            nature=Publication.Nature.NOTE,
            urgence=Publication.Urgence.IMPORTANT,
            intitule="Calendrier des visites médicales périodiques obligatoires et bilan biologique annuel 2026",
            corps="Organisation des consultations au centre médical du Plateau et dans les centres conventionnés d'Abidjan, San Pedro et Yamoussoukro.",
            perimetre=Publication.Perimetre.TOUS,
            perimetre_detail="Sociétés portuaires et d'énergie",
            statut=Publication.Statut.DIFFUSE,
            accuse=True,
            signataire="Médecin chef et DRH",
            taux_lecture=93,
            publiee_le=horodatage(datetime(2026, 5, 12, 14, 15)),
        ),
        dict(
            reference="2026-031",
            nature=Publication.Nature.DECISION,
            urgence=Publication.Urgence.NORMAL,
            intitule="Modalités de souscription aux prêts d'équipement et allocations exceptionnelles de rentrée scolaire 2026-2027",
            corps="Ouverture des guichets de demande en ligne, avec bonification de taux conventionnée pour les fonctionnaires et agents contractuels du portefeuille.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.DIFFUSE,
            accuse=False,
            signataire="Direction du budget et DRH",
            taux_lecture=82,
            publiee_le=horodatage(datetime(2026, 5, 4, 11, 0)),
        ),
        dict(
            reference="2026-P09",
            nature=Publication.Nature.DECISION,
            urgence=Publication.Urgence.IMPORTANT,
            intitule="Cadre organique des emplois et redéploiement des effectifs à la SOGEPIE",
            corps="Projet d'arrêté soumis au contrôle financier avant diffusion.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.VISA,
            etape_visa=ETAPE_DRH,
            accuse=True,
        ),
        dict(
            reference="2026-C18",
            nature=Publication.Nature.CIRCULAIRE,
            urgence=Publication.Urgence.NORMAL,
            intitule="Barème des indemnités forfaitaires de mission à l'intérieur du territoire pour l'exercice 2026",
            corps="Projet de circulaire soumis à la signature de la DGPE.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.VISA,
            etape_visa=ETAPE_DRH,
            accuse=True,
        ),
    ]
    for ligne in lignes:
        Publication.objects.create(auteur=auteur, **ligne)
    _completer_exemples(auteur)
    if not ConsultationFlash.objects.exists():
        ConsultationFlash.objects.create(
            question="Évaluation des sessions de formation continue et digitalisation des demandes de congés",
            cloture=datetime(2026, 6, 30).date(),
            participants=0,
            options=[
                {"libelle": "Très satisfait", "part": 68},
                {"libelle": "Satisfait avec réserves", "part": 24},
                {"libelle": "Insatisfait", "part": 8},
            ],
        )


def _completer_exemples(auteur=None) -> None:
    """Ajoute les exemples manquants sans écraser une communication déjà enregistrée."""
    if auteur is None:
        auteur = User.objects.filter(username="DRH-2018-044").first()
    horodatage = timezone.make_aware
    exemples = [
        dict(
            reference="2026-COM-014",
            nature=Publication.Nature.COMMUNIQUE,
            urgence=Publication.Urgence.NORMAL,
            intitule="Horaires du secrétariat de la Direction des ressources humaines",
            corps="Les attestations de présence et les relevés de carrière se retirent à l'Immeuble SCIAM, Plateau, du lundi au vendredi, de 7 h 30 à 16 h 30. Le matricule et une pièce d'identité sont demandés.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.DIFFUSE,
            accuse=False,
            signataire="Direction des ressources humaines",
            publiee_le=horodatage(datetime(2026, 9, 22, 8, 0)),
        ),
        dict(
            reference="2026-COM-018",
            nature=Publication.Nature.FLASH,
            urgence=Publication.Urgence.URGENT,
            intitule="Fermeture exceptionnelle du guichet des actes le vendredi 10 octobre",
            corps="Le secrétariat de la DRH sera fermé le vendredi 10 octobre. Les retraits d'actes reprennent le lundi 13 octobre à 7 h 30.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.DIFFUSE,
            accuse=True,
            echeance=datetime(2026, 10, 10).date(),
            signataire="Direction des ressources humaines",
            publiee_le=horodatage(datetime(2026, 10, 2, 16, 40)),
        ),
        dict(
            reference="2026-COM-021",
            nature=Publication.Nature.NOTE,
            urgence=Publication.Urgence.IMPORTANT,
            intitule="Mise à jour des personnes à charge pour l'exercice 2026",
            corps="Les agents qui déclarent ou mettent à jour une personne à charge déposent l'acte de naissance et, le cas échéant, le certificat de scolarité au service de l'action sociale.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.DIFFUSE,
            accuse=True,
            echeance=datetime(2026, 10, 31).date(),
            signataire="Service de l'action sociale",
            publiee_le=horodatage(datetime(2026, 10, 1, 9, 15)),
        ),
        dict(
            reference="2026-COM-009",
            nature=Publication.Nature.NOTE,
            urgence=Publication.Urgence.NORMAL,
            intitule="Rappel aux cadres dirigeants : déclaration des mandats dans les conseils d'administration",
            corps="Les cadres qui siègent dans un conseil d'une société du portefeuille transmettent la liste de leurs mandats à la DRH avant la fin du mois.",
            perimetre=Publication.Perimetre.CADRES,
            statut=Publication.Statut.DIFFUSE,
            accuse=True,
            signataire="Direction des ressources humaines",
            publiee_le=horodatage(datetime(2026, 9, 8, 11, 20)),
        ),
        dict(
            reference="2026-COM-024",
            nature=Publication.Nature.COMMUNIQUE,
            urgence=Publication.Urgence.IMPORTANT,
            intitule="Point mensuel des gestionnaires RH des sociétés du portefeuille",
            corps="Le point d'octobre porte sur les dossiers de retraite à constituer avant décembre et sur les pièces encore manquantes.",
            perimetre=Publication.Perimetre.DRH,
            statut=Publication.Statut.VISA,
            etape_visa=ETAPE_DRH,
            accuse=True,
        ),
        dict(
            reference="2026-COM-027",
            nature=Publication.Nature.NOTE,
            urgence=Publication.Urgence.NORMAL,
            intitule="Projet de note sur le report des congés non pris en 2026",
            corps="Brouillon en cours de relecture. Le texte n'est pas encore diffusé aux agents.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.BROUILLON,
            accuse=False,
        ),
        dict(
            reference="2025-COM-044",
            nature=Publication.Nature.CIRCULAIRE,
            urgence=Publication.Urgence.NORMAL,
            intitule="Campagne de notation 2025, close et versée aux archives",
            corps="La campagne est terminée. La circulaire reste consultable dans les archives de la DRH.",
            perimetre=Publication.Perimetre.TOUS,
            statut=Publication.Statut.CLOTURE,
            accuse=False,
            signataire="Direction des ressources humaines",
            publiee_le=horodatage(datetime(2025, 12, 18, 17, 0)),
        ),
    ]
    for ligne in exemples:
        if Publication.objects.filter(reference=ligne["reference"]).exists():
            continue
        Publication.objects.create(auteur=auteur, taux_lecture=0, **ligne)


def _choix_sondage(sondage: ConsultationFlash) -> list[str]:
    libelles = []
    for option in sondage.options or []:
        libelle = str(option.get("libelle") if isinstance(option, dict) else option).strip()
        if libelle and libelle not in libelles:
            libelles.append(libelle)
    return libelles


def _bilan_sondage(sondage: ConsultationFlash, user=None) -> dict:
    libelles = _choix_sondage(sondage)
    comptes = {libelle: 0 for libelle in libelles}
    mienne = ""
    total = 0
    for reponse in sondage.reponses.all():
        total += 1
        if reponse.choix in comptes:
            comptes[reponse.choix] += 1
        if user is not None and reponse.lecteur_id == user.pk:
            mienne = reponse.choix
    return {
        "id": sondage.pk,
        "question": sondage.question,
        "cloture": sondage.cloture.isoformat(),
        "ouverte": sondage.cloture >= timezone.localdate(),
        "participants": total,
        "perimetre": "Ensemble des agents",
        "ma_reponse": mienne,
        "options": [
            {
                "libelle": libelle,
                "voix": voix,
                "part": round(100 * voix / total, 1) if total else 0,
            }
            for libelle, voix in comptes.items()
        ],
    }


def _ouvrir_sondage(user, question: str, cloture, options: list[str]) -> ConsultationFlash:
    sondage = ConsultationFlash.objects.create(
        question=question[:240],
        cloture=cloture,
        participants=0,
        options=[{"libelle": libelle} for libelle in options],
    )
    maintenant = timezone.now()
    message = question[:280]
    for destinataire in User.objects.filter(profil__isnull=False).exclude(pk=user.pk):
        Notification.objects.create(
            destinataire=destinataire,
            categorie=Notification.Categorie.SYSTEME,
            titre="Sondage de la DRH",
            message=message,
            lien="/app/sondage",
            creee_le=maintenant,
        )
    return sondage


def _destinataires() -> dict[str, set[str]]:
    """Matricules ou identifiants des personnes visées par chaque périmètre."""
    tous = set(Agent.objects.values_list("matricule", flat=True))
    cadres = set(Agent.objects.filter(categorie__istartswith="A").values_list("matricule", flat=True)) or tous
    drh = set(User.objects.filter(profil__fonction__icontains="ressource").values_list("username", flat=True)) or tous
    return {
        Publication.Perimetre.TOUS: tous,
        Publication.Perimetre.CADRES: cadres,
        Publication.Perimetre.DRH: drh,
    }


def _lectures() -> dict[int, set[str]]:
    groupes: dict[int, set[str]] = {}
    for publication_id, username in LecturePublication.objects.values_list("publication_id", "lecteur__username"):
        groupes.setdefault(publication_id, set()).add(username)
    return groupes


def _effectif(perimetre: str) -> int:
    return len(_destinataires()[perimetre])


def _quand(moment) -> str:
    if moment is None:
        return ""
    local = timezone.localtime(moment)
    return local.strftime("%d/%m/%Y à %H:%M")


def _ligne(publication: Publication, effectifs: dict[str, int], destinataires: dict[str, set[str]] | None = None, lectures: dict[int, set[str]] | None = None) -> dict:
    cible = effectifs[publication.perimetre]
    suivie = publication.accuse and publication.statut in {Publication.Statut.DIFFUSE, Publication.Statut.CLOTURE}
    if suivie:
        connus = (destinataires or _destinataires())[publication.perimetre]
        lus = (lectures if lectures is not None else _lectures()).get(publication.id, set())
        emargements = len(lus & connus)
    else:
        emargements = 0
    taux = round(100 * emargements / cible) if cible and suivie else 0
    return {
        "id": publication.id,
        "reference": publication.reference,
        "nature": publication.nature,
        "nature_libelle": NATURES[publication.nature],
        "urgence": publication.urgence,
        "urgence_libelle": URGENCES[publication.urgence],
        "intitule": publication.intitule,
        "corps": publication.corps,
        "perimetre": publication.perimetre,
        "perimetre_libelle": publication.perimetre_detail or PERIMETRES[publication.perimetre],
        "statut": publication.statut,
        "statut_libelle": STATUTS[publication.statut],
        "accuse": publication.accuse,
        "echeance": publication.echeance.isoformat() if publication.echeance else None,
        "signataire": publication.signataire,
        "visa": publication.visa,
        "etape_visa": publication.etape_visa,
        "taux": taux,
        "cible": cible,
        "emargements": emargements,
        "en_attente": max(0, cible - emargements) if publication.accuse else 0,
        "publiee_le": _quand(publication.publiee_le or publication.creee_le),
        "publique": publication.publique,
        "piece_nom": Path(publication.piece.name).name if publication.piece else "",
    }


def _est_drh(user) -> bool:
    profil = getattr(user, "profil", None)
    if profil is None:
        return False
    if profil.role == "DRH":
        return True
    return profil.role == "Directeur" and getattr(profil.structure, "code", "") == "drh"


def _oui(valeur, defaut: bool) -> bool:
    if valeur is None or valeur == "":
        return defaut
    if isinstance(valeur, bool):
        return valeur
    return str(valeur).strip().lower() in {"1", "true", "on", "oui", "yes"}


def _piece(request):
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return None
    if Path(fichier.name).suffix.lower() not in EXTENSIONS:
        return Response({"detail": "Joignez un PDF, un document bureautique ou une image."}, status=400)
    if fichier.size > TAILLE_MAX:
        return Response({"detail": "La pièce jointe dépasse 10 Mo."}, status=400)
    return fichier


def _apercu(publication: Publication) -> dict:
    return {
        "id": publication.id,
        "reference": publication.reference,
        "intitule": publication.intitule,
        "nature_libelle": NATURES[publication.nature],
        "etape_visa": publication.etape_visa,
    }


def _non_lues(user):
    lues = LecturePublication.objects.filter(lecteur=user).values_list("publication_id", flat=True)
    return Publication.objects.filter(statut=Publication.Statut.DIFFUSE).exclude(pk__in=lues)


def _tableau() -> dict:
    semer()
    _completer_exemples()
    publications = list(Publication.objects.all())
    destinataires = _destinataires()
    lectures = _lectures()
    effectifs = {code: len(destinataires[code]) for code in PERIMETRES}
    lignes = [_ligne(item, effectifs, destinataires, lectures) for item in publications]
    diffusees = [item for item in lignes if item["statut"] == Publication.Statut.DIFFUSE]
    visas = [item for item in lignes if item["statut"] == Publication.Statut.VISA]
    agents = effectifs[Publication.Perimetre.TOUS]
    suivies = [item for item in diffusees if item["accuse"]]
    signes = sum(item["emargements"] for item in suivies)
    cibles = sum(item["cible"] for item in suivies) or agents
    taux = round(100 * signes / cibles, 1) if cibles and suivies else 0
    mois = timezone.localdate().month
    ce_mois = sum(1 for item in publications if item.publiee_le and timezone.localtime(item.publiee_le).month == mois)
    flashs = [item for item in diffusees if item["nature"] == Publication.Nature.FLASH or item["urgence"] == Publication.Urgence.URGENT]
    consultation = ConsultationFlash.objects.order_by("-id").first()
    dernier = next((item["publiee_le"] for item in diffusees if item["publiee_le"]), "")
    return {
        "reference_suivante": _reference(),
        "indicateurs": {
            "actives": len(diffusees),
            "notes": sum(1 for item in diffusees if item["nature"] == "note"),
            "circulaires": sum(1 for item in diffusees if item["nature"] == "circulaire"),
            "communiques": sum(1 for item in diffusees if item["nature"] == "communique"),
            "decisions": sum(1 for item in diffusees if item["nature"] == "decision"),
            "flashs": sum(1 for item in diffusees if item["nature"] == "flash"),
            "ce_mois": ce_mois,
            "taux_lecture": taux,
            "objectif": 90,
            "signes": signes,
            "agents": cibles,
            "en_attente": max(0, cibles - signes),
            "urgences": len(flashs),
            "urgence_detail": flashs[0]["intitule"] if flashs else "",
            "echeance": flashs[0]["echeance"] if flashs else None,
        },
        "natures": [{"code": code, "libelle": libelle} for code, libelle in NATURES.items()],
        "urgences": [{"code": code, "libelle": libelle} for code, libelle in URGENCES.items()],
        "perimetres": [{"code": code, "libelle": libelle} for code, libelle in PERIMETRES.items()],
        "statuts": [{"code": code, "libelle": libelle} for code, libelle in STATUTS.items()],
        "publications": diffusees + [item for item in lignes if item["statut"] == Publication.Statut.CLOTURE],
        "visas": visas,
        "brouillons": [item for item in lignes if item["statut"] == Publication.Statut.BROUILLON],
        "consultation": None if consultation is None else _bilan_sondage(consultation),
        "sceau": {"dernier": dernier, "certificat": "CA-GOUV-CI-R01"},
    }


def _reference() -> str:
    annee = timezone.localdate().year
    nombre = Publication.objects.filter(reference__contains=f"{annee}-COM-").count() + 1
    return f"REF/MPEEP/DRH/{annee}-COM-{nombre:03d}"


def _lire(corps: dict) -> dict:
    nature = str(corps.get("nature") or "")
    urgence = str(corps.get("urgence") or "")
    perimetre = str(corps.get("perimetre") or "")
    intitule = str(corps.get("intitule") or "").strip()
    texte = str(corps.get("corps") or "").strip()
    if nature not in NATURES or urgence not in URGENCES or perimetre not in PERIMETRES:
        return {}
    if not intitule or not texte:
        return {}
    echeance = corps.get("echeance") or None
    if echeance == "":
        echeance = None
    return {
        "nature": nature,
        "urgence": urgence,
        "perimetre": perimetre,
        "intitule": intitule[:240],
        "corps": texte,
        "accuse": _oui(corps.get("accuse"), True),
        "echeance": echeance,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tableau(request):
    refus = _interdit(request.user, "saisie" if request.method == "POST" else "lecture")
    if refus:
        return refus
    if request.method == "GET":
        corps = _tableau()
        corps["peut_viser"] = _est_drh(request.user)
        return Response(corps)
    saisie = _lire(request.data)
    if not saisie:
        return Response({"detail": "Indiquez la nature, l'urgence, le périmètre, l'intitulé et le corps du texte."}, status=400)
    piece = _piece(request)
    if isinstance(piece, Response):
        return piece
    diffuser = _oui(request.data.get("diffuser"), False)
    publication = Publication.objects.create(
        reference=_reference(),
        statut=Publication.Statut.VISA if diffuser else Publication.Statut.BROUILLON,
        etape_visa=ETAPE_DRH if diffuser else "",
        signataire=request.user.get_full_name() or request.user.username,
        auteur=request.user,
        piece=piece or "",
        **saisie,
    )
    return Response(_ligne(publication, {code: _effectif(code) for code in PERIMETRES}), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def viser(request, pk: int):
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    if not _est_drh(request.user):
        return Response({"detail": "Seul le directeur des ressources humaines vise une publication."}, status=403)
    publication = get_object_or_404(Publication, pk=pk, statut=Publication.Statut.VISA)
    publication.statut = Publication.Statut.DIFFUSE
    publication.publiee_le = timezone.now()
    publication.visa = f"Visé par {request.user.get_full_name() or request.user.username}"
    publication.etape_visa = ""
    publication.save(update_fields=["statut", "publiee_le", "visa", "etape_visa"])
    LecturePublication.objects.get_or_create(publication=publication, lecteur=request.user)
    return Response(_tableau())


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rendre_public(request, pk: int):
    """Le DRH affiche une communication déjà visée sur la page d'accueil, ou l'en retire."""
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    if not _est_drh(request.user):
        return Response({"detail": "Seul le directeur des ressources humaines rend une communication publique."}, status=403)
    publication = get_object_or_404(Publication, pk=pk, statut=Publication.Statut.DIFFUSE)
    publication.publique = not publication.publique
    publication.save(update_fields=["publique"])
    return Response(_ligne(publication, {code: _effectif(code) for code in PERIMETRES}))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def relancer(request, pk: int):
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    publication = get_object_or_404(Publication, pk=pk, statut=Publication.Statut.DIFFUSE)
    ligne = _ligne(publication, {code: _effectif(code) for code in PERIMETRES})
    return Response({"detail": f"Relance préparée pour {ligne['en_attente']} destinataire(s) qui n'ont pas encore ouvert la publication.", "en_attente": ligne["en_attente"]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter(request):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    semer()
    from .rapports.documents import rendre_registre

    contenu = rendre_registre(list(Publication.objects.exclude(statut=Publication.Statut.BROUILLON)))
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = 'attachment; filename="registre-communications.pdf"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_publication(request, pk: int):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    publication = get_object_or_404(Publication, pk=pk)
    from .rapports.documents import rendre_publication

    contenu = rendre_publication(publication)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="publication-{publication.id}.pdf"'
    return reponse


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def consultation(request):
    from datetime import date

    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    question = str(request.data.get("question") or "").strip()
    if not question:
        return Response({"detail": "Indiquez la question du sondage."}, status=400)
    bruts = request.data.get("options") or []
    options = []
    for item in bruts:
        libelle = str(item.get("libelle") if isinstance(item, dict) else item).strip()
        if libelle and libelle not in options:
            options.append(libelle[:160])
    if len(options) < 2:
        return Response({"detail": "Indiquez au moins deux réponses possibles."}, status=400)
    try:
        cloture = date.fromisoformat(str(request.data.get("cloture") or ""))
    except ValueError:
        return Response({"detail": "Indiquez la date de clôture."}, status=400)
    if cloture < timezone.localdate():
        return Response({"detail": "La date de clôture est déjà passée."}, status=400)
    _ouvrir_sondage(request.user, question, cloture, options)
    return Response(_tableau(), status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def sondage_courant(request):
    sondage = ConsultationFlash.objects.order_by("-id").first()
    if sondage is None:
        return Response(None)
    return Response(_bilan_sondage(sondage, request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def repondre_sondage(request):
    sondage = ConsultationFlash.objects.order_by("-id").first()
    if sondage is None or sondage.cloture < timezone.localdate():
        return Response({"detail": "Aucun sondage n'est ouvert."}, status=400)
    choix = str(request.data.get("choix") or "").strip()
    if choix not in _choix_sondage(sondage):
        return Response({"detail": "Choisissez une des réponses proposées."}, status=400)
    if ReponseSondage.objects.filter(sondage=sondage, lecteur=request.user).exists():
        return Response({"detail": "Vous avez déjà répondu à ce sondage."}, status=400)
    ReponseSondage.objects.create(sondage=sondage, lecteur=request.user, choix=choix)
    return Response(_bilan_sondage(sondage, request.user), status=201)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_consultation(request):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    semer()
    from .rapports.documents import rendre_consultation

    sondage = ConsultationFlash.objects.order_by("-id").first()
    contenu = rendre_consultation(_bilan_sondage(sondage) if sondage else None)
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = 'attachment; filename="consultation-flash.pdf"'
    return reponse


def _compteur(user) -> dict:
    semer()
    drh = _est_drh(user)
    visas = list(Publication.objects.filter(statut=Publication.Statut.VISA).order_by("-id")[:8]) if drh else []
    non_lues = list(_non_lues(user).order_by("-publiee_le", "-id")[:8])
    attente = Publication.objects.filter(statut=Publication.Statut.VISA).count() if drh else 0
    return {
        "decompte": attente + _non_lues(user).count(),
        "peut_viser": drh,
        "visas": [_apercu(item) for item in visas],
        "non_lues": [_apercu(item) for item in non_lues],
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def compteur(request):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    return Response(_compteur(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def marquer_lues(request):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    identifiants = request.data.get("ids") or []
    lignes = Publication.objects.filter(statut=Publication.Statut.DIFFUSE)
    if identifiants:
        lignes = lignes.filter(pk__in=identifiants)
    for publication in lignes:
        LecturePublication.objects.get_or_create(publication=publication, lecteur=request.user)
    return Response(_compteur(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def soumettre(request, pk: int):
    refus = _interdit(request.user, "saisie")
    if refus:
        return refus
    publication = get_object_or_404(Publication, pk=pk, statut=Publication.Statut.BROUILLON)
    publication.statut = Publication.Statut.VISA
    publication.etape_visa = ETAPE_DRH
    publication.save(update_fields=["statut", "etape_visa"])
    return Response(_ligne(publication, {code: _effectif(code) for code in PERIMETRES}))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def piece(request, pk: int):
    refus = _interdit(request.user, "lecture")
    if refus:
        return refus
    publication = get_object_or_404(Publication, pk=pk)
    if not publication.piece:
        return Response({"detail": "Cette publication n'a pas de pièce jointe."}, status=404)
    nom = Path(publication.piece.name).name
    return FileResponse(publication.piece.open("rb"), as_attachment=True, filename=nom)
