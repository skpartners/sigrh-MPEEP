"""Configuration des circuits de validation et de leur attribution."""

from django.db import transaction
from django.db.models import Q

from .models import AttributionCircuit, CircuitValidation, EtapeValidation, RoleMatrice, TypeAbsence, TypeConge

MAX_ETAPES = 8


def lister() -> dict:
    circuits = CircuitValidation.objects.prefetch_related("etapes", "attributions")
    return {
        "circuits": [_circuit(item) for item in circuits],
        "elements": {
            "conges": _elements("conge", TypeConge.objects.select_related("parent")),
            "absences": _elements("absence", TypeAbsence.objects.all()),
        },
        "roles": [
            {"role": item.role, "description": item.description}
            for item in RoleMatrice.objects.exclude(role="Agent")
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


def etapes_pour_conge(type_conge: TypeConge) -> list[tuple[str, str]] | None:
    """Étapes configurées pour ce congé précis, ou None si aucun circuit ne lui est attribué."""
    attribution = (
        AttributionCircuit.objects.filter(famille=AttributionCircuit.Famille.CONGE, code=type_conge.code)
        .select_related("circuit")
        .first()
    )
    if attribution is None:
        return None
    return [(etape.instance, etape.fonction) for etape in attribution.circuit.etapes.all()]


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
            return "Chaque attribution désigne un congé ou une absence."
        famille = str(item.get("famille") or "").strip()
        code = str(item.get("code") or "").strip()
        if famille not in {AttributionCircuit.Famille.CONGE, AttributionCircuit.Famille.ABSENCE} or not code:
            return "Chaque attribution désigne un congé ou une absence."
        if (famille, code) in vus:
            continue
        if not _existe(famille, code):
            return "Cet élément ne figure pas dans le référentiel."
        vus.append((famille, code))
    return vus


def _existe(famille: str, code: str) -> bool:
    if famille == AttributionCircuit.Famille.CONGE:
        return TypeConge.objects.filter(code=code).exists()
    return TypeAbsence.objects.filter(code=code).exists()


def _elements(famille: str, queryset) -> list[dict]:
    liens = {
        item.code: item.circuit_id
        for item in AttributionCircuit.objects.filter(famille=famille)
    }
    return [
        {
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
    return {**conges, **absences}
