"""Configuration des circuits de validation et de leur attribution."""

from django.db import transaction
from django.db.models import Q
from django.utils.text import slugify

from .models import (
    ActeDemandable,
    AttributionCircuit,
    CircuitValidation,
    Demande,
    EtapeValidation,
    RoleMatrice,
    TypeAbsence,
    TypeConge,
)

MAX_ETAPES = 8


def lister() -> dict:
    circuits = CircuitValidation.objects.prefetch_related("etapes", "attributions")
    return {
        "circuits": [_circuit(item) for item in circuits],
        "elements": {
            "conges": _elements("conge", TypeConge.objects.select_related("parent")),
            "absences": _elements("absence", TypeAbsence.objects.all()),
            "actes": _elements_actes(),
        },
        "roles": [
            {"role": item.role, "description": item.description}
            for item in RoleMatrice.objects.exclude(role__in=("Agent", "Secrétaire", "Gestionnaire RH"))  # ni l'agent, ni le secrétariat, ni le point focal RH ne visent
        ],
    }


def enregistrer(payload: dict, circuit: CircuitValidation | None = None) -> tuple[dict | None, str | None]:
    nom = " ".join(str(payload.get("nom") or "").split())
    if not nom:
        return None, "Indiquez le nom du circuit."
    if len(nom) > 120:
        return None, "Le nom du circuit est trop long."
    homonyme = CircuitValidation.objects.filter(nom__iexact=nom)
    if circuit is not None:
        homonyme = homonyme.exclude(pk=circuit.pk)
    if homonyme.exists():
        return None, "Un circuit porte déjà ce nom."

    etapes = _etapes(payload.get("etapes"))
    if isinstance(etapes, str):
        return None, etapes
    attributions = _attributions(payload.get("attributions"))
    if isinstance(attributions, str):
        return None, attributions

    with transaction.atomic():
        if circuit is None:
            circuit = CircuitValidation.objects.create(nom=nom)
        else:
            circuit.nom = nom
            circuit.save(update_fields=["nom"])
        circuit.etapes.all().delete()
        EtapeValidation.objects.bulk_create(
            [
                EtapeValidation(circuit=circuit, ordre=ordre, instance=instance, fonction=fonction)
                for ordre, (instance, fonction) in enumerate(etapes, start=1)
            ]
        )
        circuit.attributions.all().delete()
        if attributions:
            filtre = Q()
            for famille, code in attributions:
                filtre |= Q(famille=famille, code=code)
            AttributionCircuit.objects.filter(filtre).delete()
            AttributionCircuit.objects.bulk_create(
                [AttributionCircuit(circuit=circuit, famille=famille, code=code) for famille, code in attributions]
            )
    circuit = CircuitValidation.objects.prefetch_related("etapes", "attributions").get(pk=circuit.pk)
    return _circuit(circuit), None


def etapes_pour_absence(type_absence: TypeAbsence) -> list[tuple[str, str]] | None:
    """Étapes configurées pour cette absence, ou None si aucun circuit ne lui est attribué."""
    attribution = (
        AttributionCircuit.objects.filter(famille=AttributionCircuit.Famille.ABSENCE, code=type_absence.code)
        .select_related("circuit")
        .first()
    )
    if attribution is None:
        return None
    return [(etape.instance, etape.fonction) for etape in attribution.circuit.etapes.all()] or None


def etapes_pour_conge(type_conge: TypeConge) -> list[tuple[str, str]] | None:
    """Étapes configurées pour ce congé précis, ou None si aucun circuit ne lui est attribué."""
    codes = [type_conge.code] + ([type_conge.parent.code] if type_conge.parent_id else [])
    for code in codes:
        attribution = (
            AttributionCircuit.objects.filter(famille=AttributionCircuit.Famille.CONGE, code=code)
            .select_related("circuit")
            .first()
        )
        if attribution is not None:
            return [(etape.instance, etape.fonction) for etape in attribution.circuit.etapes.all()]
    return None


def etapes_pour_acte(code: str) -> list[tuple[str, str]] | None:
    """Étapes configurées pour cet acte, ou None : l'acte suit alors le circuit par défaut."""
    acte = ActeDemandable.objects.filter(code=code).select_related("parent").first()
    # Une sous-rubrique sans circuit propre suit celui de sa rubrique.
    codes = [code] + ([acte.parent.code] if acte is not None and acte.parent_id else [])
    for candidat in codes:
        attribution = (
            AttributionCircuit.objects.filter(famille=AttributionCircuit.Famille.ACTE, code=candidat)
            .select_related("circuit")
            .first()
        )
        if attribution is not None:
            etapes = [(etape.instance, etape.fonction) for etape in attribution.circuit.etapes.all()]
            if etapes:
                return etapes
    return None


def enregistrer_acte(payload: dict, acte: ActeDemandable | None = None) -> tuple[dict | None, str | None]:
    """Crée ou modifie un acte que l'agent peut demander."""
    libelle = " ".join(str(payload.get("libelle") or "").split())
    if not libelle:
        return None, "Indiquez le nom de l'acte."
    if len(libelle) > 160:
        return None, "Le nom de l'acte est trop long."
    autres = ActeDemandable.objects.exclude(pk=acte.pk) if acte is not None else ActeDemandable.objects.all()
    if any(item.libelle.casefold() == libelle.casefold() for item in autres):
        return None, "Un acte porte déjà ce nom."
    parent, erreur_parent = _rubrique_parente(payload.get("parent"), acte)
    if erreur_parent:
        return None, erreur_parent
    aide = " ".join(str(payload.get("justificatif") or "").split())[:200]
    periode = bool(payload.get("periode"))
    destinataire = bool(payload.get("destinataire"))
    with transaction.atomic():
        if acte is None:
            acte = ActeDemandable(code=_code_acte(libelle), ordre=_ordre_suivant())
        acte.libelle, acte.periode, acte.destinataire, acte.justificatif = libelle, periode, destinataire, aide
        acte.justificatif_obligatoire = bool(payload.get("justificatif_obligatoire"))
        acte.parent = parent
        acte.icone = "event_available" if periode else "description"
        acte.save()
    return _acte(acte), None


def supprimer_acte(acte: ActeDemandable) -> str | None:
    """Retire l'acte du choix de l'agent. Refusé tant que des demandes sont en cours."""
    if acte.enfants.exists():
        return "Cet acte a des sous-rubriques : retirez-les d'abord."
    en_cours = (
        Demande.objects.filter(categorie="acte", type_acte=acte.code).exclude(etape__startswith="Clôturée").count()
    )
    if en_cours:
        return f"{en_cours} demande(s) sont en cours pour cet acte : traitez-les avant de le retirer."
    with transaction.atomic():
        AttributionCircuit.objects.filter(famille=AttributionCircuit.Famille.ACTE, code=acte.code).delete()
        acte.delete()
    return None


def _rubrique_parente(code, acte: ActeDemandable | None) -> tuple[ActeDemandable | None, str | None]:
    """Rubrique sous laquelle l'acte est rangé : un seul niveau de sous-rubriques."""
    code = str(code or "").strip()
    if not code:
        return None, None
    parent = ActeDemandable.objects.filter(code=code).first()
    if parent is None:
        return None, "La rubrique choisie n'existe pas."
    if acte is not None and parent.pk == acte.pk:
        return None, "Un acte ne peut pas être sa propre rubrique."
    if parent.parent_id:
        return None, "Une sous-rubrique ne peut pas elle-même avoir de sous-rubriques."
    if acte is not None and acte.enfants.exists():
        return None, "Cet acte a des sous-rubriques : il ne peut pas devenir une sous-rubrique."
    return parent, None


LIMITE_LIBELLE = {"conge": 80, "absence": 120}
CONGE_INDISPENSABLE = "conge-annuel"


def _modele(famille: str):
    return {"conge": TypeConge, "absence": TypeAbsence}.get(famille)


def enregistrer_element(famille: str, payload: dict, objet=None) -> tuple[dict | None, str | None]:
    """Crée ou modifie un congé (avec sous-rubriques) ou une absence."""
    modele = _modele(famille)
    if modele is None:
        return None, "Famille inconnue."
    libelle = " ".join(str(payload.get("libelle") or "").split())
    if not libelle:
        return None, "Indiquez le nom."
    if len(libelle) > LIMITE_LIBELLE[famille]:
        return None, "Le nom est trop long."
    autres = modele.objects.exclude(pk=objet.pk) if objet is not None else modele.objects.all()
    if any(item.libelle.casefold() == libelle.casefold() for item in autres):
        return None, "Un élément porte déjà ce nom."
    parent = None
    if famille == "conge":
        parent, erreur = _rubrique_conge(payload.get("parent"), objet)
        if erreur:
            return None, erreur
    with transaction.atomic():
        if objet is None:
            dernier = modele.objects.order_by("-ordre").values_list("ordre", flat=True).first()
            objet = modele(code=_code_unique(modele, libelle), ordre=(dernier or 0) + 1)
        objet.libelle = libelle
        if famille == "conge":
            objet.parent = parent
        objet.save()
    attribution = AttributionCircuit.objects.filter(famille=famille, code=objet.code).first()
    return {
        "id": objet.pk,
        "code": objet.code,
        "libelle": objet.libelle,
        "parent": getattr(getattr(objet, "parent", None), "code", "") or "",
        "ordre": objet.ordre,
        "circuit_id": attribution.circuit_id if attribution else None,
    }, None


def supprimer_element(famille: str, objet) -> str | None:
    """Retire un congé ou une absence du choix de l'agent."""
    if famille == "conge":
        if objet.code == CONGE_INDISPENSABLE:
            return "Le congé annuel est indispensable au décompte du reliquat : il ne peut pas être retiré."
        if objet.enfants.exists():
            return "Ce congé a des sous-rubriques : retirez-les d'abord."
        from .depot_conge import _close

        en_cours = [
            item for item in Demande.objects.filter(categorie="conge", nature__startswith=f"{objet.libelle} (") if not _close(item.etape)
        ]
        if en_cours:
            return f"{len(en_cours)} demande(s) sont en cours pour ce congé : traitez-les avant de le retirer."
    with transaction.atomic():
        AttributionCircuit.objects.filter(famille=famille, code=objet.code).delete()
        objet.delete()
    return None


def _rubrique_conge(code, objet) -> tuple[TypeConge | None, str | None]:
    code = str(code or "").strip()
    if not code:
        return None, None
    parent = TypeConge.objects.filter(code=code).first()
    if parent is None:
        return None, "La rubrique choisie n'existe pas."
    if objet is not None and parent.pk == objet.pk:
        return None, "Un congé ne peut pas être sa propre rubrique."
    if parent.parent_id:
        return None, "Une sous-rubrique ne peut pas elle-même avoir de sous-rubriques."
    if objet is not None and objet.enfants.exists():
        return None, "Ce congé a des sous-rubriques : il ne peut pas devenir une sous-rubrique."
    return parent, None


def _code_unique(modele, libelle: str) -> str:
    base = (slugify(libelle) or "element")[:34]
    code, numero = base, 2
    while modele.objects.filter(code=code).exists():
        code = f"{base}-{numero}"
        numero += 1
    return code


def _code_acte(libelle: str) -> str:
    base = (slugify(libelle) or "acte")[:34]
    code, numero = base, 2
    while ActeDemandable.objects.filter(code=code).exists():
        code = f"{base}-{numero}"
        numero += 1
    return code


def _ordre_suivant() -> int:
    dernier = ActeDemandable.objects.order_by("-ordre").values_list("ordre", flat=True).first()
    return (dernier or 0) + 1


def _acte(acte: ActeDemandable, circuit_id: int | None = None) -> dict:
    return {
        "id": acte.pk,
        "code": acte.code,
        "libelle": acte.libelle,
        "parent": acte.parent.code if acte.parent_id else "",
        "ordre": acte.ordre,
        "circuit_id": circuit_id,
        "periode": acte.periode,
        "destinataire": acte.destinataire,
        "justificatif": acte.justificatif,
        "justificatif_obligatoire": acte.justificatif_obligatoire,
    }


def _elements_actes() -> list[dict]:
    liens = {
        item.code: item.circuit_id
        for item in AttributionCircuit.objects.filter(famille=AttributionCircuit.Famille.ACTE)
    }
    return [_acte(acte, liens.get(acte.code)) for acte in ActeDemandable.objects.select_related("parent")]


def _etapes(brut) -> list[tuple[str, str]] | str:
    if not isinstance(brut, list):
        return "Ajoutez au moins une étape de validation."
    etapes = []
    for item in brut:
        if not isinstance(item, dict):
            continue
        instance = " ".join(str(item.get("instance") or "").split())
        fonction = " ".join(str(item.get("fonction") or "").split())
        if not instance:
            continue
        if len(instance) > 120 or len(fonction) > 160:
            return "Le libellé d'une étape est trop long."
        etapes.append((instance, fonction))
    if not etapes:
        return "Ajoutez au moins une étape de validation."
    if len(etapes) > MAX_ETAPES:
        return f"Un circuit compte au plus {MAX_ETAPES} étapes."
    return etapes


def _attributions(brut) -> list[tuple[str, str]] | str:
    if brut is None:
        return []
    if not isinstance(brut, list):
        return "Les attributions du circuit sont illisibles."
    vus: list[tuple[str, str]] = []
    for item in brut:
        if not isinstance(item, dict):
            return "Chaque attribution désigne un congé, une absence ou un acte."
        famille = str(item.get("famille") or "").strip()
        code = str(item.get("code") or "").strip()
        if famille not in set(AttributionCircuit.Famille.values) or not code:
            return "Chaque attribution désigne un congé, une absence ou un acte."
        if (famille, code) in vus:
            continue
        if not _existe(famille, code):
            return "Cet élément ne figure pas dans le référentiel."
        vus.append((famille, code))
    return vus


def _existe(famille: str, code: str) -> bool:
    if famille == AttributionCircuit.Famille.CONGE:
        return TypeConge.objects.filter(code=code).exists()
    if famille == AttributionCircuit.Famille.ACTE:
        return ActeDemandable.objects.filter(code=code).exists()
    return TypeAbsence.objects.filter(code=code).exists()


def _elements(famille: str, queryset) -> list[dict]:
    liens = {
        item.code: item.circuit_id
        for item in AttributionCircuit.objects.filter(famille=famille)
    }
    return [
        {
            "id": item.pk,
            "code": item.code,
            "libelle": item.libelle,
            "parent": getattr(getattr(item, "parent", None), "code", "") or "",
            "ordre": item.ordre,
            "circuit_id": liens.get(item.code),
        }
        for item in queryset
    ]


def _circuit(circuit: CircuitValidation) -> dict:
    libelles = _libelles()
    return {
        "id": circuit.pk,
        "nom": circuit.nom,
        "etapes": [
            {"ordre": etape.ordre, "instance": etape.instance, "fonction": etape.fonction}
            for etape in circuit.etapes.all()
        ],
        "attributions": [
            {
                "famille": item.famille,
                "code": item.code,
                "libelle": libelles.get((item.famille, item.code), item.code),
            }
            for item in circuit.attributions.all()
        ],
    }


def _libelles() -> dict[tuple[str, str], str]:
    conges = {(AttributionCircuit.Famille.CONGE, item.code): item.libelle for item in TypeConge.objects.all()}
    absences = {(AttributionCircuit.Famille.ABSENCE, item.code): item.libelle for item in TypeAbsence.objects.all()}
    actes = {(AttributionCircuit.Famille.ACTE, item.code): item.libelle for item in ActeDemandable.objects.all()}
    return {**conges, **absences, **actes}
