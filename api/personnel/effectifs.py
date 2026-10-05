"""Dotation en personnel et expression des besoins : lecture, décisions, exports."""

from datetime import date

from django.db import transaction
from django.db.models import Count, Max
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .classeur import habiller
from .nomenclature import FAMILLES, SOURCE
from .models import (
    Agent,
    AlertePoste,
    BranchePlafond,
    CampagneBesoin,
    DemandeDotation,
    EmploiReferentiel,
    EntiteTutelle,
    GradeReferentiel,
    PoleMinisteriel,
    ExerciceDotation,
    FicheBesoin,
    FiliereBesoin,
    JournalEffectif,
    Notification,
    Passerelle,
)

OUVERTS = {DemandeDotation.Statut.ARBITRAGE, DemandeDotation.Statut.VISA_CF}


def _auteur(user) -> str:
    profil = getattr(user, "profil", None)
    nom = user.get_full_name() or user.username
    fonction = getattr(profil, "fonction", "")
    return f"{nom} ({fonction})" if fonction else nom


def _notifier(user, titre: str, message: str, lien: str) -> None:
    Notification.objects.create(
        destinataire=user,
        categorie=Notification.Categorie.SYSTEME,
        titre=titre[:160],
        message=message[:280],
        lien=lien,
        creee_le=timezone.now(),
    )


def _journal(user, titre: str) -> None:
    annee = timezone.localdate().year
    prefixe = f"JRN-{annee}-"
    dernier = JournalEffectif.objects.filter(reference__startswith=prefixe).order_by("-reference").first()
    numero = int(dernier.reference.rsplit("-", 1)[-1]) + 1 if dernier else 1
    JournalEffectif.objects.create(
        reference=f"{prefixe}{numero:04d}",
        titre=titre[:200],
        auteur=_auteur(user)[:180],
        cree_le=timezone.now(),
    )


def _reference(prefixe: str, modele, annee: int) -> str:
    racine = f"{prefixe}-{annee}-"
    dernier = modele.objects.filter(reference__startswith=racine).order_by("-reference").first()
    numero = int(dernier.reference.rsplit("-", 1)[-1]) + 1 if dernier else 1
    return f"{racine}{numero:03d}"


def _choix(data, cle: str, choices, libelle: str):
    valeur = str(data.get(cle) or "").strip()
    if valeur not in {code for code, _label in choices}:
        return None, f"{libelle} : choisissez une valeur de la liste."
    return valeur, None


def _texte(data, cle: str, libelle: str, max_len: int, obligatoire: bool = True):
    valeur = str(data.get(cle) or "").strip()
    if obligatoire and not valeur:
        return None, f"{libelle} est obligatoire."
    if len(valeur) > max_len:
        return None, f"{libelle} dépasse {max_len} caractères."
    return valeur, None


def _entier(data, cle: str, libelle: str, minimum: int, maximum: int):
    try:
        valeur = int(data.get(cle))
    except (TypeError, ValueError):
        return None, f"{libelle} : indiquez un nombre entier."
    if valeur < minimum or valeur > maximum:
        return None, f"{libelle} : indiquez un nombre entre {minimum} et {maximum}."
    return valeur, None


def _entite(data):
    code = str(data.get("entite") or "").strip()
    entite = EntiteTutelle.objects.filter(code=code).first()
    if entite is None:
        return None, "Choisissez une structure."
    return entite, None


def _options(choices):
    return [{"code": code, "libelle": libelle} for code, libelle in choices]


def _entites():
    return [
        _ligne_structure(item)
        for item in EntiteTutelle.objects.select_related("pole", "parent")
    ]


def _impact(valeur: int) -> str:
    if valeur == 0:
        return "Isopérimètre"
    unite = "poste" if abs(valeur) == 1 else "postes"
    signe = "+" if valeur > 0 else ""
    return f"{signe}{valeur} {unite}"


def _demande(item: DemandeDotation) -> dict:
    return {
        "reference": item.reference,
        "entite": item.entite.nom,
        "entite_code": item.entite.code,
        "direction": item.direction,
        "poste": item.poste,
        "nature": item.nature,
        "nature_libelle": item.get_nature_display(),
        "impact": item.impact,
        "impact_libelle": _impact(item.impact),
        "statut": item.statut,
        "statut_libelle": item.get_statut_display(),
        "visa": item.visa,
        "detail": item.detail,
        "recu_le": item.recu_le.isoformat(),
        "notifiee": item.notifiee,
    }


def _fiche(item: FicheBesoin) -> dict:
    moment = timezone.localtime(item.depose_le)
    return {
        "reference": item.reference,
        "entite": item.entite.nom,
        "entite_code": item.entite.code,
        "direction": item.direction,
        "profil": item.profil,
        "grade": item.grade,
        "specialite": item.specialite,
        "volume": item.volume,
        "motif": item.motif,
        "nature": item.nature,
        "nature_libelle": item.get_nature_display(),
        "statut": item.statut,
        "statut_libelle": item.get_statut_display(),
        "arbitrage": item.arbitrage,
        "visa": item.visa,
        "detail": item.detail,
        "critique": item.critique,
        "postes_accordes": item.postes_accordes,
        "depose_le": moment.date().isoformat(),
        "heure": moment.strftime("%H:%M"),
    }


def _classeur(nom: str, titre: str, sous_titre: str, notice: str, entetes: list[str], lignes: list[list], *, paysage: bool = False) -> HttpResponse:
    contenu = habiller([{
        "nom": "Données",
        "titre": titre,
        "sous_titre": sous_titre,
        "notice": notice,
        "lignes": [entetes, *lignes],
        "paysage": paysage,
    }])
    reponse = HttpResponse(contenu, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dotation(_request):
    branches = list(BranchePlafond.objects.all())
    effectif = sum(item.effectif for item in branches)
    plafond = sum(item.plafond for item in branches)
    demandes = DemandeDotation.objects.select_related("entite")
    ouvertes = demandes.filter(statut__in=OUVERTS)
    exercice = ExerciceDotation.objects.order_by("-annee").first()
    annee = exercice.annee if exercice else timezone.localdate().year
    return Response({
        "annee": annee,
        "intitule": exercice.intitule if exercice else "Dotation en personnel",
        "fondement": exercice.fondement if exercice else "",
        "effectif": effectif,
        "plafond": plafond,
        "vacants": max(0, plafond - effectif),
        "taux_occupation": round(1000 * effectif / plafond) / 10 if plafond else 0,
        "campagnes_ouvertes": ouvertes.count(),
        "repartition": [
            {"nature": code, "libelle": libelle, "total": ouvertes.filter(nature=code).count()}
            for code, libelle in DemandeDotation.Nature.choices
            if ouvertes.filter(nature=code).exists()
        ],
        "branches": [
            {
                "code": item.code,
                "libelle": item.libelle,
                "entites": item.entites,
                "icone": item.icone,
                "effectif": item.effectif,
                "plafond": item.plafond,
                "vacants": max(0, item.plafond - item.effectif),
                "taux": round(1000 * item.effectif / item.plafond) / 10 if item.plafond else 0,
                "note": item.note,
            }
            for item in branches
        ],
        "alertes": [_alerte(item) for item in AlertePoste.objects.select_related("entite")],
        "demandes": [_demande(item) for item in demandes],
        "passerelles": [
            {
                "id": item.id,
                "cedant": item.cedant,
                "recepteur": item.recepteur,
                "profil": item.profil,
                "effectif": item.effectif,
                "statut": item.statut,
                "statut_libelle": item.get_statut_display(),
                "note": item.note,
            }
            for item in Passerelle.objects.all()
        ],
        "journal": [
            {
                "reference": item.reference,
                "titre": item.titre,
                "auteur": item.auteur,
                "cree_le": timezone.localtime(item.cree_le).isoformat(),
            }
            for item in JournalEffectif.objects.all()[:12]
        ],
        "entites": _entites(),
        "postes": _postes_reconnus(),
        "natures": _options(DemandeDotation.Nature.choices),
        "statuts": _options(DemandeDotation.Statut.choices),
    })


def _postes_reconnus():
    """Emplois déjà portés par un dossier d'agent : postes reconnus par l'administration."""
    noms = {item.nom: item.code for item in EntiteTutelle.objects.all()}
    rattaches: dict[str, set[str]] = {}
    for emploi, direction, structure in Agent.objects.exclude(emploi="").values_list("emploi", "direction", "structure"):
        codes = rattaches.setdefault(emploi, set())
        for lieu in (direction, structure):
            code = noms.get(lieu)
            if code:
                codes.add(code)
    return [
        {"libelle": libelle, "structures": sorted(codes)}
        for libelle, codes in sorted(rattaches.items(), key=lambda item: item[0])
    ]


def _poste_reconnu(libelle: str):
    connu = next((item for item in _postes_reconnus() if item["libelle"] == libelle), None)
    if connu is None:
        return None, "Choisissez un poste reconnu par l'administration."
    return connu["libelle"], None


def _lire_demande(data):
    entite, erreur = _entite(data)
    if erreur:
        return None, erreur
    direction, erreur = _texte(data, "direction", "La direction", 180)
    if erreur:
        return None, erreur
    poste, erreur = _texte(data, "poste", "L'intitulé du poste", 200)
    if erreur:
        return None, erreur
    poste, erreur = _poste_reconnu(poste)
    if erreur:
        return None, erreur
    nature, erreur = _choix(data, "nature", DemandeDotation.Nature.choices, "La nature du mouvement")
    if erreur:
        return None, erreur
    impact, erreur = _entier(data, "impact", "L'impact sur le plafond", 0, 500)
    if erreur:
        return None, erreur
    detail, erreur = _texte(data, "detail", "Le motif", 240, obligatoire=False)
    if erreur:
        return None, erreur
    return {"entite": entite, "direction": direction, "poste": poste, "nature": nature, "impact": impact, "detail": detail}, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_plan(request):
    champs, erreur = _lire_demande(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        annee = timezone.localdate().year
        item = DemandeDotation.objects.create(
            reference=_reference("REC", DemandeDotation, annee),
            recu_le=timezone.localdate(),
            **champs,
        )
        _journal(request.user, f"{item.get_nature_display()} · {item.reference} · {item.entite.nom}")
        _notifier(
            request.user,
            f"{item.get_nature_display()} enregistrée",
            f"{item.reference} · {item.poste} · {item.entite.nom}",
            "/app/gpec/recrutement",
        )
    return Response(_demande(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def modifier_dotation(request, reference: str):
    champs, erreur = _lire_demande(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = get_object_or_404(DemandeDotation.objects.select_for_update(), reference=reference)
        for cle, valeur in champs.items():
            setattr(item, cle, valeur)
        item.save(update_fields=["entite", "direction", "poste", "nature", "impact", "detail"])
        _journal(request.user, f"{item.reference} modifié · {item.get_nature_display()}")
    return Response(_demande(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def supprimer_dotation(request, reference: str):
    with transaction.atomic():
        item = get_object_or_404(DemandeDotation.objects.select_for_update().select_related("entite"), reference=reference)
        libelle = f"{item.reference} · {item.get_nature_display()} · {item.entite.nom}"
        item.delete()
        _journal(request.user, f"Retrait du registre · {libelle}")
    return Response({"reference": reference})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def instruire_dotation(request, reference: str):
    statut, erreur = _choix(request.data, "statut", DemandeDotation.Statut.choices, "La décision")
    if erreur:
        return Response({"detail": erreur}, status=400)
    motif, erreur = _texte(request.data, "motif", "Le motif", 240)
    if erreur:
        return Response({"detail": erreur}, status=400)
    visa, erreur = _texte(request.data, "visa", "La référence de visa", 180, obligatoire=False)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = get_object_or_404(DemandeDotation.objects.select_for_update().select_related("entite"), reference=reference)
        item.statut = statut
        item.detail = motif
        item.visa = visa
        if statut != DemandeDotation.Statut.ACTE:
            item.notifiee = False
        item.save(update_fields=["statut", "detail", "visa", "notifiee"])
        _journal(request.user, f"Instruction {item.reference} · {item.get_statut_display()}")
    return Response(_demande(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notifier_dotation(request, reference: str):
    with transaction.atomic():
        item = get_object_or_404(DemandeDotation.objects.select_for_update().select_related("entite"), reference=reference)
        if item.statut != DemandeDotation.Statut.ACTE:
            return Response({"detail": "Seule une demande actée peut être notifiée."}, status=409)
        if item.notifiee:
            return Response({"detail": "Cette demande a déjà été notifiée."}, status=409)
        item.notifiee = True
        item.save(update_fields=["notifiee"])
        _journal(request.user, f"Notification {item.reference} · {item.entite.nom}")
        _notifier(
            request.user,
            "Demande de dotation notifiée",
            f"{item.reference} · {item.poste}",
            "/app/gpec/recrutement",
        )
    return Response(_demande(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ajuster_plafond(request, code: str):
    plafond, erreur = _entier(request.data, "plafond", "Le plafond", 0, 100000)
    if erreur:
        return Response({"detail": erreur}, status=400)
    motif, erreur = _texte(request.data, "motif", "Le motif", 200)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        branche = get_object_or_404(BranchePlafond.objects.select_for_update(), code=code)
        if plafond < branche.effectif:
            return Response(
                {"detail": f"Le plafond ne peut pas être inférieur à l'effectif en poste ({branche.effectif})."},
                status=400,
            )
        branche.plafond = plafond
        branche.note = motif
        branche.save(update_fields=["plafond", "note"])
        _journal(request.user, f"Plafond {branche.libelle} ajusté à {plafond}")
    return Response({"code": branche.code, "plafond": branche.plafond, "note": branche.note})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_passerelle(request):
    cedant, erreur = _texte(request.data, "cedant", "Le pôle cédant", 180)
    if erreur:
        return Response({"detail": erreur}, status=400)
    recepteur, erreur = _texte(request.data, "recepteur", "Le pôle récepteur", 180)
    if erreur:
        return Response({"detail": erreur}, status=400)
    profil, erreur = _texte(request.data, "profil", "Le profil", 200)
    if erreur:
        return Response({"detail": erreur}, status=400)
    effectif, erreur = _entier(request.data, "effectif", "L'effectif", 1, 500)
    if erreur:
        return Response({"detail": erreur}, status=400)
    note, erreur = _texte(request.data, "note", "Le motif", 240)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = Passerelle.objects.create(
            cedant=cedant, recepteur=recepteur, profil=profil, effectif=effectif,
            statut=Passerelle.Statut.ACTEE, note=note,
        )
        _journal(request.user, f"Passerelle actée · {cedant} vers {recepteur}")
    return Response({"id": item.id, "statut": item.statut}, status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def decider_passerelle(request, pk: int):
    statut, erreur = _choix(request.data, "statut", Passerelle.Statut.choices, "La décision")
    if erreur:
        return Response({"detail": erreur}, status=400)
    note, erreur = _texte(request.data, "note", "Le motif", 240)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = get_object_or_404(Passerelle.objects.select_for_update(), pk=pk)
        item.statut = statut
        item.note = note
        item.save(update_fields=["statut", "note"])
        verbe = "actée" if statut == Passerelle.Statut.ACTEE else "laissée en proposition"
        _journal(request.user, f"Passerelle {verbe} · {item.cedant} vers {item.recepteur}")
    return Response({"id": item.id, "statut": item.statut, "statut_libelle": item.get_statut_display(), "note": item.note})


def _alerte(item: AlertePoste) -> dict:
    return {
        "id": item.id,
        "entite": item.entite.nom,
        "entite_code": item.entite.code,
        "intitule": item.intitule,
        "detail": item.detail,
        "postes": item.postes,
        "jours": item.jours,
        "piste": item.piste,
        "traitee": item.traitee,
    }


def _lire_alerte(data):
    entite, erreur = _entite(data)
    if erreur:
        return None, erreur
    intitule, erreur = _texte(data, "intitule", "L'intitulé du poste", 200)
    if erreur:
        return None, erreur
    intitule, erreur = _poste_reconnu(intitule)
    if erreur:
        return None, erreur
    detail, erreur = _texte(data, "detail", "La situation", 280)
    if erreur:
        return None, erreur
    postes, erreur = _entier(data, "postes", "Le nombre de postes", 1, 500)
    if erreur:
        return None, erreur
    jours, erreur = _entier(data, "jours", "L'ancienneté de la vacance", 0, 3650)
    if erreur:
        return None, erreur
    piste, erreur = _texte(data, "piste", "La piste", 200)
    if erreur:
        return None, erreur
    return {
        "entite": entite,
        "intitule": intitule,
        "detail": detail,
        "postes": postes,
        "jours": jours,
        "piste": piste,
    }, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_alerte(request):
    champs, erreur = _lire_alerte(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = AlertePoste.objects.create(**champs)
        _journal(request.user, f"Alerte enregistrée · {item.entite.nom} · {item.intitule}")
    return Response(_alerte(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def modifier_alerte(request, pk: int):
    champs, erreur = _lire_alerte(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = get_object_or_404(AlertePoste.objects.select_for_update().select_related("entite"), pk=pk)
        for cle, valeur in champs.items():
            setattr(item, cle, valeur)
        item.save(update_fields=["entite", "intitule", "detail", "postes", "jours", "piste"])
        _journal(request.user, f"Alerte modifiée · {item.entite.nom} · {item.intitule}")
    return Response(_alerte(item))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def supprimer_alerte(request, pk: int):
    with transaction.atomic():
        item = get_object_or_404(AlertePoste.objects.select_for_update().select_related("entite"), pk=pk)
        libelle = f"{item.entite.nom} · {item.intitule}"
        item.delete()
        _journal(request.user, f"Alerte retirée · {libelle}")
    return Response({"id": pk})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def lancer_appel(request):
    with transaction.atomic():
        alertes = list(AlertePoste.objects.select_for_update().select_related("entite").filter(traitee=False))
        if not alertes:
            return Response({"detail": "Aucune alerte de poste n'est ouverte."}, status=409)
        annee = timezone.localdate().year
        reconnus = _postes_reconnus()
        par_libelle = {item["libelle"] for item in reconnus}
        resolutions = []
        for alerte in alertes:
            if alerte.intitule in par_libelle:
                poste = alerte.intitule
            else:
                lies = [item["libelle"] for item in reconnus if alerte.entite.code in item["structures"]]
                poste = lies[0] if len(lies) == 1 else ""
            if not poste:
                return Response(
                    {"detail": f"Le poste « {alerte.intitule} » n'est pas reconnu par l'administration."},
                    status=400,
                )
            resolutions.append(poste)
        creees = []
        for alerte, poste in zip(alertes, resolutions):
            item = DemandeDotation.objects.create(
                reference=_reference("REC", DemandeDotation, annee),
                entite=alerte.entite,
                direction=alerte.entite.nom,
                poste=poste,
                nature=DemandeDotation.Nature.AFFECTATION,
                impact=alerte.postes,
                statut=DemandeDotation.Statut.ARBITRAGE,
                detail=alerte.piste,
                recu_le=timezone.localdate(),
            )
            alerte.traitee = True
            alerte.save(update_fields=["traitee"])
            creees.append(item.reference)
        _journal(request.user, f"Appel à candidatures · {len(creees)} plan(s)")
        _notifier(
            request.user,
            "Appel à candidatures ouvert",
            ", ".join(creees),
            "/app/gpec/recrutement",
        )
    return Response({"creees": creees, "total": len(creees)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_dotation_pdf(_request):
    from .rapports.documents import rendre_dotation

    branches = list(BranchePlafond.objects.all())
    demandes = list(DemandeDotation.objects.select_related("entite"))
    ouvertes = [item for item in demandes if item.statut in OUVERTS]
    exercice = ExerciceDotation.objects.order_by("-annee").first()
    annee = exercice.annee if exercice else timezone.localdate().year
    contenu = rendre_dotation({
        "annee": annee,
        "intitule": exercice.intitule if exercice else "Dotation en personnel",
        "fondement": exercice.fondement if exercice else "",
        "effectif": sum(item.effectif for item in branches),
        "plafond": sum(item.plafond for item in branches),
        "campagnes": len(ouvertes),
        "branches": branches,
        "demandes": demandes,
        "repartition": [
            {"libelle": libelle, "total": sum(1 for item in ouvertes if item.nature == code)}
            for code, libelle in DemandeDotation.Nature.choices
            if any(item.nature == code for item in ouvertes)
        ],
        "alertes": list(AlertePoste.objects.select_related("entite")),
        "passerelles": list(Passerelle.objects.all()),
        "journal": list(JournalEffectif.objects.all()),
    })
    nom = f"gestion-dotation-{annee}.pdf"
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_dotation(_request):
    lignes = [
        [
            item.reference,
            item.recu_le.isoformat(),
            item.entite.nom,
            item.direction,
            item.poste,
            item.get_nature_display(),
            item.impact,
            item.get_statut_display(),
            item.visa,
            item.detail,
        ]
        for item in DemandeDotation.objects.select_related("entite")
    ]
    jour = timezone.localdate()
    return _classeur(
        f"registre-dotation-{jour.isoformat()}.xlsx",
        "SIGRH  ·  Registre de dotation",
        f"Demandes enregistrées au {jour.strftime('%d/%m/%Y')}.",
        "Une ligne par demande : référence, entité, poste, nature, impact et visa.",
        ["Référence", "Reçu le", "Entité", "Direction", "Poste", "Nature", "Impact", "Statut", "Visa", "Motif"],
        lignes,
        paysage=True,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def besoins(_request):
    fiches = list(FicheBesoin.objects.select_related("entite"))
    volume = sum(item.volume for item in fiches)
    favorables = [item for item in fiches if item.statut == FicheBesoin.Statut.FAVORABLE]
    postes_favorables = sum(item.postes_accordes for item in favorables)
    critiques = sum(item.volume for item in fiches if item.critique)
    campagne = CampagneBesoin.objects.order_by("-exercice").first()
    precedent = campagne.volume_precedent if campagne else 0
    variation = round(1000 * (volume - precedent) / precedent) / 10 if precedent else None
    remplacements = sum(1 for item in fiches if item.nature == FicheBesoin.Nature.REMPLACEMENT or "retraite" in item.motif.lower())
    actees = Passerelle.objects.filter(statut=Passerelle.Statut.ACTEE)
    return Response({
        "exercice": campagne.exercice if campagne else timezone.localdate().year,
        "ouverte": campagne.ouverte if campagne else False,
        "cadrage": campagne.cadrage if campagne else "",
        "pea_max": campagne.pea_max if campagne else 0,
        "volume": volume,
        "entites": len({item.entite_id for item in fiches}),
        "variation": variation,
        "favorables": len(favorables),
        "postes_favorables": postes_favorables,
        "taux_favorable": round(1000 * len(favorables) / len(fiches)) / 10 if fiches else 0,
        "critiques": critiques,
        "alerte_retraites": remplacements,
        "agents_repositionnes": sum(item.effectif for item in actees),
        "filieres": [
            {
                "code": item.code,
                "libelle": item.libelle,
                "icone": item.icone,
                "requis": item.requis,
                "couverts": item.couverts,
                "taux": round(100 * item.couverts / item.requis) if item.requis else 0,
            }
            for item in FiliereBesoin.objects.all()
        ],
        "fiches": [_fiche(item) for item in fiches],
        "entites_liste": _entites(),
        "natures": _options(FicheBesoin.Nature.choices),
        "statuts": _options(FicheBesoin.Statut.choices),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_fiche(request):
    entite, erreur = _entite(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    direction, erreur = _texte(request.data, "direction", "La direction", 180)
    if erreur:
        return Response({"detail": erreur}, status=400)
    profil, erreur = _texte(request.data, "profil", "Le profil", 200)
    if erreur:
        return Response({"detail": erreur}, status=400)
    grade, erreur = _texte(request.data, "grade", "Le grade", 40, obligatoire=False)
    if erreur:
        return Response({"detail": erreur}, status=400)
    specialite, erreur = _texte(request.data, "specialite", "La spécialité", 120, obligatoire=False)
    if erreur:
        return Response({"detail": erreur}, status=400)
    volume, erreur = _entier(request.data, "volume", "Le volume", 1, 500)
    if erreur:
        return Response({"detail": erreur}, status=400)
    motif, erreur = _texte(request.data, "motif", "Le motif", 240)
    if erreur:
        return Response({"detail": erreur}, status=400)
    nature, erreur = _choix(request.data, "nature", FicheBesoin.Nature.choices, "Le type de mouvement")
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        annee = timezone.localdate().year
        item = FicheBesoin.objects.create(
            reference=_reference("BES", FicheBesoin, annee),
            entite=entite,
            direction=direction,
            profil=profil,
            grade=grade,
            specialite=specialite,
            volume=volume,
            motif=motif,
            nature=nature,
            critique=bool(request.data.get("critique")),
            depose_le=timezone.now(),
        )
        _journal(request.user, f"Fiche de besoin {item.reference} déposée · {entite.nom}")
        _notifier(
            request.user,
            "Fiche d'expression déposée",
            f"{item.reference} · {profil}",
            "/app/gpec/expression-des-besoins",
        )
    return Response(_fiche(item), status=201)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def instruire_fiche(request, reference: str):
    statut, erreur = _choix(request.data, "statut", FicheBesoin.Statut.choices, "La décision")
    if erreur:
        return Response({"detail": erreur}, status=400)
    motif, erreur = _texte(request.data, "motif", "Le motif", 240)
    if erreur:
        return Response({"detail": erreur}, status=400)
    visa, erreur = _texte(request.data, "visa", "Le visa", 180, obligatoire=False)
    if erreur:
        return Response({"detail": erreur}, status=400)
    accordes, erreur = _entier(request.data, "postes_accordes", "Les postes accordés", 0, 500)
    if erreur:
        return Response({"detail": erreur}, status=400)
    with transaction.atomic():
        item = get_object_or_404(FicheBesoin.objects.select_for_update().select_related("entite"), reference=reference)
        if accordes > item.volume:
            return Response({"detail": "Les postes accordés ne peuvent pas dépasser le volume demandé."}, status=400)
        item.statut = statut
        item.detail = motif
        item.visa = visa
        item.postes_accordes = accordes if statut == FicheBesoin.Statut.FAVORABLE else 0
        if statut == FicheBesoin.Statut.FAVORABLE:
            mobilite = "dont mobilité" if item.nature == FicheBesoin.Nature.MOBILITE else "postes"
            item.arbitrage = f"Favorable : {item.postes_accordes} {mobilite}"
        else:
            item.arbitrage = item.get_statut_display()
        item.save(update_fields=["statut", "detail", "visa", "postes_accordes", "arbitrage"])
        _journal(request.user, f"Arbitrage {item.reference} · {item.get_statut_display()}")
    return Response(_fiche(item))


def _saisie_structure(data, actuelle=None):
    from .structures import ALIAS_NIVEAUX, NIVEAUX, niveau_depuis_nom

    nom, erreur = _texte(data, "nom", "Le nom de la structure", 220)
    if erreur:
        return None, erreur
    pole = PoleMinisteriel.objects.filter(code=str(data.get("pole") or "").strip()).first()
    if pole is None:
        return None, "Choisissez un pôle."
    conflit = EntiteTutelle.objects.filter(nom__iexact=nom)
    if actuelle is not None:
        conflit = conflit.exclude(pk=actuelle.pk)
    if conflit.exists():
        return None, "Cette structure existe déjà."
    niveaux = {code for code, _libelle in NIVEAUX}
    niveau = ALIAS_NIVEAUX.get(str(data.get("niveau") or "").strip(), str(data.get("niveau") or "").strip()) or niveau_depuis_nom(nom)
    if niveau not in niveaux:
        return None, "Choisissez le niveau de la structure."
    parent = None
    parent_code = str(data.get("parent") or "").strip()
    if niveau == "ministere":
        if parent_code:
            return None, "Le ministère est au sommet de la chaîne : il ne se rattache pas."
    elif parent_code or niveau == "direction-generale":
        if not parent_code:
            return None, "Une direction générale se rattache au ministère."
        parent = EntiteTutelle.objects.select_related("pole", "parent").filter(code=parent_code).first()
        if parent is None:
            return None, "Choisissez la structure de rattachement."
        if actuelle is not None and parent.pk == actuelle.pk:
            return None, "Une structure ne peut pas se rattacher à elle-même."
        if niveau == "direction-generale":
            if parent.niveau != "ministere":
                return None, "Une direction générale se rattache au ministère."
        else:
            if parent.pole_id != pole.pk:
                return None, "La structure de rattachement appartient à un autre pôle."
            if niveau == "direction-centrale" and parent.niveau != "direction-generale":
                return None, "Une direction centrale se rattache à une direction générale."
            if niveau == "sous-direction" and parent.niveau != "direction-centrale":
                return None, "Une sous-direction se rattache à une direction centrale."
            if niveau == "service" and parent.niveau not in {"sous-direction", "direction-centrale"}:
                return None, "Un service se rattache à une sous-direction ou, à défaut, à une direction centrale."
        if actuelle is not None and _remonte_a(parent, actuelle.pk):
            return None, "Ce rattachement formerait une boucle."
    return {"nom": nom, "pole": pole, "niveau": niveau, "parent": parent}, None


def _remonte_a(structure, identifiant: int) -> bool:
    vus = set()
    curseur = structure
    while curseur is not None:
        if curseur.pk == identifiant or curseur.pk in vus:
            return True
        vus.add(curseur.pk)
        curseur = curseur.parent
    return False


def _ligne_structure(item):
    from .structures import NIVEAUX

    libelles = dict(NIVEAUX)
    return {
        "code": item.code,
        "nom": item.nom,
        "pole": item.pole.code,
        "pole_libelle": item.pole.nom,
        "niveau": item.niveau,
        "niveau_libelle": libelles.get(item.niveau, item.niveau),
        "parent": item.parent.code if item.parent_id else "",
        "parent_nom": item.parent.nom if item.parent_id else "",
    }


def _ligne_pole(item):
    return {"code": item.code, "nom": item.nom, "libelle": item.nom}


def _code_libre(nom: str, modele, repli: str) -> str:
    base = (slugify(nom) or repli)[:40].strip("-")
    code = base
    rang = 2
    while modele.objects.filter(code=code).exists():
        suffixe = f"-{rang}"
        code = f"{base[:40 - len(suffixe)].strip('-')}{suffixe}"
        rang += 1
    return code


CATEGORIES = {"A", "B", "C", "D"}
FAMILLES_CODES = {code for code, _libelle in FAMILLES}


def _ligne_grade(item, nombre: int | None = None) -> dict:
    return {
        "code": item.code,
        "categorie": item.categorie,
        "libelle": item.libelle,
        "ordre": item.ordre,
        "en_vigueur": item.en_vigueur,
        "emplois": item.emplois.count() if nombre is None else nombre,
    }


def _ligne_emploi(item) -> dict:
    return {
        "code": item.code,
        "libelle": item.libelle,
        "famille": item.famille,
        "famille_libelle": dict(FAMILLES).get(item.famille, item.famille),
        "grade": item.grade.code,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def nomenclature(_request):
    grades = GradeReferentiel.objects.annotate(nombre=Count("emplois"))
    return Response({
        "source": SOURCE,
        "familles": [{"code": code, "libelle": libelle} for code, libelle in FAMILLES],
        "grades": [_ligne_grade(item, item.nombre) for item in grades],
        "emplois": [_ligne_emploi(item) for item in EmploiReferentiel.objects.select_related("grade")],
    })


def _saisie_grade(data, actuel=None):
    libelle, erreur = _texte(data, "libelle", "La définition", 320)
    if erreur:
        return None, erreur
    categorie = str(data.get("categorie") or "").strip().upper()
    if categorie not in CATEGORIES:
        return None, "La catégorie est A, B, C ou D."
    if actuel is None:
        code = str(data.get("code") or "").strip().upper()
        if not code or len(code) > 8 or not code.replace("-", "").isalnum():
            return None, "Indiquez un code de grade, par exemple A4."
        if GradeReferentiel.objects.filter(code__iexact=code).exists():
            return None, "Ce grade existe déjà."
        return {"code": code, "categorie": categorie, "libelle": libelle, "en_vigueur": bool(data.get("en_vigueur", True))}, None
    return {"categorie": categorie, "libelle": libelle, "en_vigueur": bool(data.get("en_vigueur", actuel.en_vigueur))}, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_grade(request):
    saisie, erreur = _saisie_grade(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    ordre = (GradeReferentiel.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0) + 1
    item = GradeReferentiel.objects.create(ordre=ordre, **saisie)
    return Response(_ligne_grade(item, 0), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def grade(request, code: str):
    item = GradeReferentiel.objects.filter(code__iexact=code).first()
    if item is None:
        return Response({"detail": "Grade introuvable."}, status=404)
    if request.method == "DELETE":
        if item.emplois.exists():
            return Response({"detail": "Ce grade classe encore des emplois. Déplacez-les ou supprimez-les avant."}, status=400)
        item.delete()
        return Response(status=204)
    saisie, erreur = _saisie_grade(request.data, item)
    if erreur:
        return Response({"detail": erreur}, status=400)
    item.categorie = saisie["categorie"]
    item.libelle = saisie["libelle"]
    item.en_vigueur = saisie["en_vigueur"]
    item.save(update_fields=["categorie", "libelle", "en_vigueur"])
    return Response(_ligne_grade(item))


def _saisie_emploi(data, actuel=None):
    libelle, erreur = _texte(data, "libelle", "Le nom de l'emploi", 220)
    if erreur:
        return None, erreur
    famille = str(data.get("famille") or "").strip()
    if famille not in FAMILLES_CODES:
        return None, "Choisissez une famille d'emplois."
    grade_code = str(data.get("grade") or "").strip()
    grade_item = GradeReferentiel.objects.filter(code__iexact=grade_code).first()
    if grade_item is None:
        return None, "Choisissez un grade."
    conflit = EmploiReferentiel.objects.filter(libelle__iexact=libelle)
    if actuel is not None:
        conflit = conflit.exclude(pk=actuel.pk)
    if conflit.exists():
        return None, "Cet emploi existe déjà."
    return {"libelle": libelle, "famille": famille, "grade": grade_item}, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_emploi(request):
    saisie, erreur = _saisie_emploi(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    ordre = (EmploiReferentiel.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0) + 1
    item = EmploiReferentiel.objects.create(code=_code_libre(saisie["libelle"], EmploiReferentiel, "emploi"), ordre=ordre, **saisie)
    return Response(_ligne_emploi(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def emploi(request, code: str):
    item = EmploiReferentiel.objects.select_related("grade").filter(code=code).first()
    if item is None:
        return Response({"detail": "Emploi introuvable."}, status=404)
    if request.method == "DELETE":
        item.delete()
        return Response(status=204)
    saisie, erreur = _saisie_emploi(request.data, item)
    if erreur:
        return Response({"detail": erreur}, status=400)
    item.libelle = saisie["libelle"]
    item.famille = saisie["famille"]
    item.grade = saisie["grade"]
    item.save(update_fields=["libelle", "famille", "grade"])
    return Response(_ligne_emploi(item))


def _blocage_structure(item) -> str | None:
    usages = []
    if item.comptes.exists():
        usages.append("des comptes")
    if item.demandes_dotation.exists():
        usages.append("des demandes de dotation")
    if item.alertes_postes.exists():
        usages.append("des alertes de postes")
    if item.fiches_besoin.exists():
        usages.append("des fiches de besoins")
    if item.enfants.exists():
        usages.append("des structures rattachées")
    if not usages:
        return None
    return f"Cette structure est encore rattachée à {', '.join(usages)}. Retirez ces rattachements avant de la supprimer."


def _code_structure(nom: str) -> str:
    return _code_libre(nom, EntiteTutelle, "structure")


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def structures(request):
    if request.method == "GET":
        return Response({
            "structures": _entites(),
            "poles": [_ligne_pole(item) for item in PoleMinisteriel.objects.all()],
        })
    saisie, erreur = _saisie_structure(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    ordre = (EntiteTutelle.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0) + 1
    item = EntiteTutelle.objects.create(code=_code_structure(saisie["nom"]), ordre=ordre, **saisie)
    return Response(_ligne_structure(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def structure(request, code: str):
    item = EntiteTutelle.objects.select_related("pole", "parent").filter(code=code).first()
    if item is None:
        return Response({"detail": "Structure introuvable."}, status=404)
    if request.method == "DELETE":
        blocage = _blocage_structure(item)
        if blocage:
            return Response({"detail": blocage}, status=400)
        item.delete()
        return Response(status=204)
    saisie, erreur = _saisie_structure(request.data, item)
    if erreur:
        return Response({"detail": erreur}, status=400)
    item.nom = saisie["nom"]
    item.pole = saisie["pole"]
    item.niveau = saisie["niveau"]
    item.parent = saisie["parent"]
    item.save(update_fields=["nom", "pole", "niveau", "parent"])
    return Response(_ligne_structure(item))


def _saisie_pole(data, actuel=None):
    nom, erreur = _texte(data, "nom", "Le nom du pôle", 180)
    if erreur:
        return None, erreur
    conflit = PoleMinisteriel.objects.filter(nom__iexact=nom)
    if actuel is not None:
        conflit = conflit.exclude(pk=actuel.pk)
    if conflit.exists():
        return None, "Ce pôle existe déjà."
    return nom, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creer_pole(request):
    nom, erreur = _saisie_pole(request.data)
    if erreur:
        return Response({"detail": erreur}, status=400)
    ordre = (PoleMinisteriel.objects.aggregate(dernier=Max("ordre"))["dernier"] or 0) + 1
    item = PoleMinisteriel.objects.create(code=_code_libre(nom, PoleMinisteriel, "pole"), nom=nom, ordre=ordre)
    return Response(_ligne_pole(item), status=201)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def pole(request, code: str):
    item = PoleMinisteriel.objects.filter(code=code).first()
    if item is None:
        return Response({"detail": "Pôle introuvable."}, status=404)
    if request.method == "DELETE":
        if item.structures.exists():
            return Response(
                {"detail": "Ce pôle contient encore des structures. Déplacez-les ou supprimez-les avant."},
                status=400,
            )
        item.delete()
        return Response(status=204)
    nom, erreur = _saisie_pole(request.data, item)
    if erreur:
        return Response({"detail": erreur}, status=400)
    item.nom = nom
    item.save(update_fields=["nom"])
    return Response(_ligne_pole(item))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def exporter_besoins(_request):
    from .rapports.documents import rendre_plan_besoins

    fiches = list(FicheBesoin.objects.select_related("entite"))
    contenu = rendre_plan_besoins(fiches)
    nom = f"plan-besoins-{date.today().isoformat()}.pdf"
    reponse = HttpResponse(contenu, content_type="application/pdf")
    reponse["Content-Disposition"] = f'attachment; filename="{nom}"'
    return reponse
