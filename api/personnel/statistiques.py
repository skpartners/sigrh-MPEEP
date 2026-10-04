"""Observatoire statistique : agrégats calculés, classeur, synthèse PDF et diaporama."""

import io
import zipfile
from datetime import date, datetime

from django.contrib.auth.models import User
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import ExtractYear
from django.utils import timezone

from .classeur import habiller
from .models import (
    Absence,
    Acte,
    Agent,
    AlertePoste,
    BranchePlafond,
    Demande,
    DemandeDotation,
    EntiteTutelle,
    Evaluation,
    DossierRetraite,
    FicheBesoin,
    InscriptionFormation,
    Passerelle,
    PoleMinisteriel,
    PosteSensible,
    ProcedureDisciplinaire,
    Profil,
    SanctionDisciplinaire,
)

CATEGORIES_DEMANDES = {"conge": "Congés", "social": "Action sociale", "formation": "Formation"}

REPARTITION = (
    ("a_sup", "Cadres supérieurs (catégorie A, grades A4 à A7)"),
    ("a_moy", "Cadres moyens (catégorie A, grades A1 à A3)"),
    ("b", "Maîtrise (catégorie B)"),
    ("cd", "Exécution (catégories C et D)"),
    ("autre", "Autres grades"),
)

AGES = ("Moins de 35 ans", "35 à 45 ans", "46 à 55 ans", "Plus de 55 ans", "Date de naissance non renseignée")

SEGMENTS = {"A", "B", "C"}


class FiltreInconnu(ValueError):
    pass


def calculer(organisme: str = "", segment: str = "", exercice: str = "") -> dict:
    code = (organisme or "").strip()
    tranche = (segment or "").strip().upper()
    if code and not EntiteTutelle.objects.filter(code=code).exists():
        raise FiltreInconnu("Cette structure n'est pas connue.")
    if tranche and tranche not in SEGMENTS:
        raise FiltreInconnu("Le segment doit être A, B ou C.")

    jour = timezone.localdate()
    annee = _annee_demandee(exercice, jour)
    annee_suivante = annee + 1
    qs = Agent.objects.all()
    if code:
        nom_structure = EntiteTutelle.objects.get(code=code).nom
        qs = qs.filter(Q(structure=nom_structure) | Q(direction=nom_structure))
    if tranche == "A":
        qs = qs.filter(grade__istartswith="A")
    elif tranche == "B":
        qs = qs.filter(grade__istartswith="B")
    elif tranche == "C":
        qs = qs.filter(Q(grade__istartswith="C") | Q(grade__istartswith="D"))

    dossiers = list(
        qs.values(
            "id",
            "structure",
            "direction",
            "grade",
            "sexe",
            "date_naissance",
            "corps",
            "situation",
            "conges_acquis",
            "conges_consommes",
        )
    )
    ids = [item["id"] for item in dossiers]
    femmes = sum(1 for item in dossiers if item["sexe"] == "F")
    hommes = sum(1 for item in dossiers if item["sexe"] == "H")
    departs = sum(1 for item in dossiers if _depart(item["date_naissance"], annee_suivante))
    plus55 = sum(1 for item in dossiers if (_age(item["date_naissance"], jour) or 0) > 55)

    actes_annee = Acte.objects.filter(agent_id__in=ids, date_enregistrement__year=annee) if ids else Acte.objects.none()
    actes_carriere = actes_annee.filter(domaine=Acte.Domaine.CARRIERE).count()
    actes_valides = actes_annee.filter(domaine=Acte.Domaine.CARRIERE, statut=Acte.Statut.VALIDE).count()
    absents = (
        Absence.objects.filter(agent_id__in=ids, debut__lte=jour, fin__gte=jour).values("agent_id").distinct().count()
        if ids
        else 0
    )

    branches = [
        {
            "code": item.code,
            "libelle": item.libelle,
            "effectif": item.effectif,
            "plafond": item.plafond,
            "occupation": _pct(item.effectif, item.plafond),
        }
        for item in BranchePlafond.objects.all()
    ]
    effectif = sum(item["effectif"] for item in branches)
    plafond = sum(item["plafond"] for item in branches)
    filtre = bool(code or tranche)
    total = len(dossiers)

    payload = {
        "exercice": annee,
        "filtre": filtre,
        "agents": Agent.objects.count(),
        "comptes": Profil.objects.count(),
        "comptes_actifs": User.objects.filter(is_active=True, profil__isnull=False).count(),
        "structures": EntiteTutelle.objects.count(),
        "poles": PoleMinisteriel.objects.count(),
        "demandes": Demande.objects.count(),
        "dotations": DemandeDotation.objects.count(),
        "besoins": FicheBesoin.objects.count(),
        "effectif": effectif,
        "plafond": plafond,
        "par_categorie": [
            {"code": item["categorie"], "libelle": CATEGORIES_DEMANDES.get(item["categorie"], item["categorie"]), "total": item["total"]}
            for item in Demande.objects.values("categorie").annotate(total=Count("id")).order_by("-total")
        ],
        "par_pole": [
            {"code": item.code, "nom": item.nom, "structures": item.structures.count()}
            for item in PoleMinisteriel.objects.all()
        ],
        "perimetre": [
            {"code": item.code, "nom": item.nom, "pole": item.pole.code, "pole_libelle": item.pole.nom}
            for item in EntiteTutelle.objects.select_related("pole")
        ],
        "kpi": {
            "dossiers": total,
            "effectif_officiel": None if filtre else effectif,
            "plafond": None if filtre else plafond,
            "occupation": None if filtre else _pct(effectif, plafond),
            "actes_carriere": actes_carriere,
            "actes_valides": actes_valides,
            "femmes": femmes,
            "hommes": hommes,
            "parite": _pct(femmes, total),
            "postes_signales": AlertePoste.objects.filter(traitee=False).aggregate(total=Sum("postes"))["total"] or 0,
            "vacance": None if filtre or not plafond else _pct(max(plafond - effectif, 0), plafond),
            "disponibilite": _pct(max(total - absents, 0), total) if total else 0,
            "absents": absents,
            "departs": departs,
            "encadrement": _pct(
                sum(1 for item in dossiers if _seau(item["grade"]) in ("a_sup", "a_moy")),
                total,
            ),
        },
        "repartition": _repartition(dossiers),
        "ages": _ages(dossiers, jour),
        "mobilites": [
            {"code": code_nature, "libelle": libelle, "total": DemandeDotation.objects.filter(nature=code_nature).count()}
            for code_nature, libelle in DemandeDotation.Nature.choices
        ],
        "passerelles": [
            {
                "cedant": item.cedant,
                "recepteur": item.recepteur,
                "effectif": item.effectif,
                "statut": item.get_statut_display(),
            }
            for item in Passerelle.objects.all()
        ],
        "absences": _grouper(
            Absence.objects.filter(agent_id__in=ids, debut__year=annee) if ids else Absence.objects.none(),
            "nature",
        ),
        "branches": branches,
        "lignes": _lignes(code, dossiers, jour, annee_suivante),
        "domaines": [
            {"code": code_domaine, "libelle": libelle, "total": actes_annee.filter(domaine=code_domaine).count()}
            for code_domaine, libelle in Acte.Domaine.choices
        ],
        "statuts_actes": [
            {"code": code_statut, "libelle": libelle, "total": actes_annee.filter(statut=code_statut).count()}
            for code_statut, libelle in Acte.Statut.choices
        ],
        "circuits": _grouper(
            Demande.objects.filter(agent_id__in=ids, depose_le__year=annee) if ids else Demande.objects.none(),
            "categorie",
            CATEGORIES_DEMANDES,
        ),
        "corps": _compter_texte(dossiers, "corps"),
        "situations": _compter_texte(dossiers, "situation"),
        "mentions": _grouper(
            Evaluation.objects.filter(agent_id__in=ids, annee=annee) if ids else Evaluation.objects.none(),
            "mention",
        ),
        "sanctions_nature": [
            {
                "code": code_nature,
                "libelle": libelle,
                "total": (
                    SanctionDisciplinaire.objects.filter(agent_id__in=ids, prononcee_le__year=annee, nature=code_nature).count()
                    if ids else 0
                ),
            }
            for code_nature, libelle in SanctionDisciplinaire.Nature.choices
        ],
        "retraites": [
            {
                "code": code_statut,
                "libelle": libelle,
                "total": DossierRetraite.objects.filter(agent_id__in=ids, statut=code_statut).count() if ids else 0,
            }
            for code_statut, libelle in DossierRetraite.Statut.choices
        ],
        "conges": {
            "acquis": sum(item["conges_acquis"] for item in dossiers),
            "consommes": sum(item["conges_consommes"] for item in dossiers),
            "reliquat_moyen": round(
                sum(item["conges_acquis"] - item["conges_consommes"] for item in dossiers) / total,
                1,
            ) if total else 0,
        },
    }
    comparaison, exercices = _comparaison(ids, annee)
    payload["comparaison"] = comparaison
    payload["exercices"] = exercices
    payload["flux"] = {serie["code"]: serie["ecart"] for serie in comparaison}
    return payload


def _annee_demandee(exercice: str, jour: date) -> int:
    texte = (exercice or "").strip()
    if not texte:
        return jour.year
    if not texte.isdigit() or not 1990 <= int(texte) <= 2100:
        raise FiltreInconnu("L'exercice doit être une année entre 1990 et 2100.")
    return int(texte)


def _comparaison(ids: list[int], annee: int) -> tuple[list[dict], list[int]]:
    if ids:
        actes = _compte_annees(Acte.objects.filter(agent_id__in=ids), "date_enregistrement")
        carriere = _compte_annees(
            Acte.objects.filter(agent_id__in=ids, domaine=Acte.Domaine.CARRIERE),
            "date_enregistrement",
        )
        absences = _compte_annees(Absence.objects.filter(agent_id__in=ids), "debut")
        jours = _somme_annees(Absence.objects.filter(agent_id__in=ids), "debut", "jours")
        demandes = _compte_annees(Demande.objects.filter(agent_id__in=ids), "depose_le")
        notations = _compte_champ(Evaluation.objects.filter(agent_id__in=ids), "annee")
        notes = _moyenne_annee(Evaluation.objects.filter(agent_id__in=ids))
        sanctions = _compte_annees(SanctionDisciplinaire.objects.filter(agent_id__in=ids), "prononcee_le")
        procedures = _compte_annees(ProcedureDisciplinaire.objects.filter(agent_id__in=ids), "saisine")
        inscriptions = _compte_annees(
            InscriptionFormation.objects.filter(demande__agent_id__in=ids),
            "session__date_debut",
        )
        prises = _compte_annees(
            Agent.objects.filter(id__in=ids).exclude(prise_service_ministere=None),
            "prise_service_ministere",
        )
        postes = _compte_annees(PosteSensible.objects.filter(titulaire_id__in=ids), "depart")
    else:
        actes = carriere = absences = jours = demandes = notations = notes = {}
        sanctions = procedures = inscriptions = prises = postes = {}
    annees = _fenetre(
        actes, carriere, absences, jours, demandes, notations, notes,
        sanctions, procedures, inscriptions, prises, postes, annee=annee,
    )
    series = [
        _serie("actes", "Actes enregistrés", actes, annees, annee),
        _serie("actes_carriere", "Actes de carrière", carriere, annees, annee),
        _serie("absences", "Absences ouvertes", absences, annees, annee),
        _serie("jours_absence", "Jours d'absence", jours, annees, annee),
        _serie("demandes", "Demandes déposées", demandes, annees, annee),
        _serie("notations", "Notations", notations, annees, annee),
        _serie("note_moyenne", "Note moyenne", notes, annees, annee, "note"),
        _serie("sanctions", "Sanctions prononcées", sanctions, annees, annee),
        _serie("procedures", "Procédures disciplinaires", procedures, annees, annee),
        _serie("inscriptions", "Inscriptions en formation", inscriptions, annees, annee),
        _serie("prises_service", "Prises de service au ministère", prises, annees, annee),
        _serie("postes_sensibles", "Départs de postes sensibles", postes, annees, annee),
    ]
    return series, list(reversed(annees))


def _compte_annees(qs, champ: str) -> dict:
    return {
        row["y"]: row["n"]
        for row in qs.annotate(y=ExtractYear(champ)).values("y").annotate(n=Count("id"))
        if row["y"]
    }


def _somme_annees(qs, champ: str, somme: str) -> dict:
    return {
        row["y"]: row["n"] or 0
        for row in qs.annotate(y=ExtractYear(champ)).values("y").annotate(n=Sum(somme))
        if row["y"]
    }


def _compte_champ(qs, champ: str) -> dict:
    return {row[champ]: row["n"] for row in qs.values(champ).annotate(n=Count("id"))}


def _moyenne_annee(qs) -> dict:
    return {
        row["annee"]: round(float(row["moyenne"]), 2)
        for row in qs.values("annee").annotate(moyenne=Avg("note"))
        if row["moyenne"] is not None
    }


def _fenetre(*cartes, annee: int) -> list[int]:
    presentes = {annee, annee - 1}
    for carte in cartes:
        presentes.update(int(cle) for cle in carte if cle)
    return list(range(min(presentes), max(presentes) + 1))


def _serie(code: str, libelle: str, carte: dict, annees: list[int], annee: int, unite: str = "nombre") -> dict:
    vide = 0 if unite == "nombre" else None
    valeurs = [{"annee": an, "total": carte.get(an, vide)} for an in annees]
    courant = carte.get(annee, vide)
    precedent = carte.get(annee - 1, vide)
    if courant is None or precedent is None:
        ecart = None
    elif unite == "note":
        ecart = round(courant - precedent, 2)
    else:
        ecart = courant - precedent
    return {
        "code": code,
        "libelle": libelle,
        "unite": unite,
        "valeurs": valeurs,
        "ecart": {"total": courant, "precedent": precedent, "ecart": ecart},
    }


def _grouper(qs, champ: str, libelles: dict | None = None) -> list[dict]:
    libelles = libelles or {}
    return [
        {
            "code": item[champ],
            "libelle": libelles.get(item[champ], item[champ] or "Non renseigné"),
            "total": item["total"],
        }
        for item in qs.values(champ).annotate(total=Count("id")).order_by("-total")
    ]


def _compter_texte(dossiers: list[dict], champ: str) -> list[dict]:
    comptes: dict[str, int] = {}
    for item in dossiers:
        cle = (item[champ] or "").strip() or "Non renseigné"
        comptes[cle] = comptes.get(cle, 0) + 1
    return [
        {"libelle": cle, "total": total}
        for cle, total in sorted(comptes.items(), key=lambda couple: (-couple[1], couple[0]))
    ]


def classeur(corps: dict) -> bytes:
    matrice = [[
        "Structure",
        "Pôle",
        "Effectif réel",
        "Cadres A",
        "Part cadres A (%)",
        "Départs à 60 ans (N+1)",
        "Femmes",
        "Hommes",
        "Parité femmes (%)",
        "Risque relève",
    ]]
    for ligne in corps["lignes"]:
        matrice.append([
            ligne["nom"],
            ligne["pole_libelle"],
            ligne["effectif"],
            ligne["cadres"],
            ligne["part_cadres"],
            ligne["departs"],
            ligne["femmes"],
            ligne["hommes"],
            ligne["parite"],
            ligne["risque"],
        ])
    series = [["Série", "Libellé", "Total"]]
    for item in corps["repartition"]:
        series.append(["Catégorie", item["libelle"], item["total"]])
    for item in corps["ages"]:
        series.append(["Âge", item["libelle"], item["total"]])
    for item in corps["mobilites"]:
        series.append(["Dotation", item["libelle"], item["total"]])
    for item in corps["absences"]:
        series.append(["Absence", item["libelle"], item["total"]])
    for item in corps["branches"]:
        series.append(["Plafond", item["libelle"], f"{item['effectif']} / {item['plafond']}"])
    for item in corps["corps"]:
        series.append(["Corps", item["libelle"], item["total"]])
    for item in corps["domaines"]:
        series.append(["Domaine d'acte", item["libelle"], item["total"]])
    annees = [point["annee"] for point in corps["comparaison"][0]["valeurs"]] if corps["comparaison"] else []
    tableau = [["Indicateur", *[str(annee) for annee in annees], f"Écart {corps['exercice']}"]]
    for serie in corps["comparaison"]:
        tableau.append([
            serie["libelle"],
            *["" if point["total"] is None else point["total"] for point in serie["valeurs"]],
            "" if serie["ecart"]["ecart"] is None else serie["ecart"]["ecart"],
        ])
    return habiller([
        {
            "nom": "Effectifs",
            "titre": f"SIGRH  ·  Statistiques {corps['exercice']}",
            "sous_titre": "Effectifs, cadres, parité et risque de relève, par structure.",
            "notice": "Les parts sont en pourcentage. Le risque de relève reprend le niveau calculé pour la structure.",
            "lignes": matrice,
            "paysage": True,
        },
        {
            "nom": "Répartitions",
            "titre": f"SIGRH  ·  Répartitions {corps['exercice']}",
            "sous_titre": "Catégories, âges, dotations, absences, plafonds, corps et domaines d'actes.",
            "notice": "Chaque bloc est identifié par la colonne Série.",
            "lignes": series,
            "onglet": "FF0A5E3A",
        },
        {
            "nom": "Comparaison",
            "titre": f"SIGRH  ·  Comparaison pluriannuelle",
            "sous_titre": f"Écart calculé pour l'exercice {corps['exercice']}.",
            "notice": "Une cellule vide signifie que l'indicateur n'est pas disponible pour l'année.",
            "lignes": tableau,
            "onglet": "FF9E4300",
            "paysage": True,
        },
    ])


def synthese(corps: dict) -> bytes:
    from .rapports.documents import rendre_synthese

    return rendre_synthese(corps)


def diaporama(corps: dict) -> bytes:
    kpi = corps["kpi"]
    titre = f"Observatoire statistique {corps['exercice']}"
    faits = [
        f"Dossiers : {kpi['dossiers']}",
        f"Actes de carrière : {kpi['actes_carriere']} ({kpi['actes_valides']} validés)",
        f"Parité femmes : {kpi['parite']} %",
        f"Disponibilité : {kpi['disponibilite']} %",
        f"Départs à 60 ans en {corps['exercice'] + 1} : {kpi['departs']}",
        f"Postes signalés : {kpi['postes_signales']}",
    ]
    if kpi["effectif_officiel"] is not None:
        faits.insert(0, f"Effectif au plafond : {kpi['effectif_officiel']} / {kpi['plafond']} ({kpi['occupation']} %)")
    detail = [
        f"{ligne['nom']} ({ligne['pole_libelle']}) — {ligne['effectif']} dossiers, cadres {ligne['part_cadres']} %, "
        f"départs {ligne['departs']}, parité {ligne['parite']} %, {ligne['risque']}"
        for ligne in corps["lignes"]
    ] or ["Aucun dossier pour ce filtre."]
    comparatif = [
        f"{serie['libelle']} : {serie['ecart']['total'] if serie['ecart']['total'] is not None else '—'} "
        f"contre {serie['ecart']['precedent'] if serie['ecart']['precedent'] is not None else '—'} en {corps['exercice'] - 1}"
        for serie in corps["comparaison"]
        if serie["unite"] == "nombre"
    ]
    return _pptx([
        (titre, faits),
        (f"Comparaison {corps['exercice']} / {corps['exercice'] - 1}", comparatif[:18]),
        ("Matrice par structure", detail[:18]),
    ])


def _lignes(code: str, dossiers: list[dict], jour: date, annee_suivante: int) -> list[dict]:
    entites = list(EntiteTutelle.objects.select_related("pole").order_by("pole__ordre", "ordre", "nom"))
    if code:
        entites = [item for item in entites if item.code == code]
    par_nom = {item.nom: item.code for item in entites}
    groupes: dict[str, list[dict]] = {item.code: [] for item in entites}
    places: set[int] = set()
    for item in dossiers:
        for champ in ("structure", "direction"):
            rattache = par_nom.get((item.get(champ) or "").strip())
            if rattache and item["id"] not in places:
                groupes[rattache].append(item)
                places.add(item["id"])
                break
    lignes = []
    for entite in entites:
        agents = groupes[entite.code]
        total = len(agents)
        cadres = sum(1 for item in agents if _seau(item["grade"]) in ("a_sup", "a_moy"))
        femmes = sum(1 for item in agents if item["sexe"] == "F")
        hommes = sum(1 for item in agents if item["sexe"] == "H")
        departs = sum(1 for item in agents if _depart(item["date_naissance"], annee_suivante))
        plus55 = sum(1 for item in agents if (_age(item["date_naissance"], jour) or 0) > 55)
        lignes.append({
            "code": entite.code,
            "nom": entite.nom,
            "pole": entite.pole.code,
            "pole_libelle": entite.pole.nom,
            "effectif": total,
            "cadres": cadres,
            "part_cadres": _pct(cadres, total),
            "departs": departs,
            "femmes": femmes,
            "hommes": hommes,
            "parite": _pct(femmes, total),
            "risque": _risque(total, plus55),
        })
    return lignes


def _repartition(dossiers: list[dict]) -> list[dict]:
    comptes = {code: 0 for code, _libelle in REPARTITION}
    for item in dossiers:
        comptes[_seau(item["grade"])] += 1
    return [{"code": code, "libelle": libelle, "total": comptes[code]} for code, libelle in REPARTITION if comptes[code] or code != "autre"]


def _ages(dossiers: list[dict], jour: date) -> list[dict]:
    comptes = {libelle: 0 for libelle in AGES}
    for item in dossiers:
        comptes[_bande(_age(item["date_naissance"], jour))] += 1
    return [{"libelle": libelle, "total": comptes[libelle]} for libelle in AGES if comptes[libelle] or libelle != AGES[-1]]


def _seau(grade: str) -> str:
    texte = (grade or "").strip().upper()
    if not texte:
        return "autre"
    lettre = texte[0]
    if lettre == "A":
        chiffres = "".join(caractere for caractere in texte if caractere.isdigit())
        return "a_sup" if chiffres and int(chiffres) >= 4 else "a_moy"
    if lettre == "B":
        return "b"
    if lettre in "CD":
        return "cd"
    return "autre"


def _age(naissance: date | None, jour: date) -> int | None:
    if not naissance:
        return None
    return jour.year - naissance.year - ((jour.month, jour.day) < (naissance.month, naissance.day))


def _bande(age: int | None) -> str:
    if age is None:
        return AGES[-1]
    if age < 35:
        return AGES[0]
    if age <= 45:
        return AGES[1]
    if age <= 55:
        return AGES[2]
    return AGES[3]


def _depart(naissance: date | None, annee: int) -> bool:
    return bool(naissance) and naissance.year + 60 == annee


def _risque(effectif: int, plus55: int) -> str:
    if not effectif:
        return "—"
    part = plus55 / effectif
    if part >= 0.25:
        return "Élevé"
    if part >= 0.10:
        return "Modéré"
    return "Faible"


def _pct(part: int, total: int) -> float:
    if not total:
        return 0.0
    return round(100 * part / total, 1)


def _xml(valeur) -> str:
    return (
        str(valeur)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _colonne(indice: int) -> str:
    lettres = ""
    while indice:
        indice, reste = divmod(indice - 1, 26)
        lettres = chr(65 + reste) + lettres
    return lettres


def _feuille(lignes: list[list]) -> str:
    lignes_xml = []
    for y, ligne in enumerate(lignes, start=1):
        cellules = []
        for x, valeur in enumerate(ligne, start=1):
            ref = f"{_colonne(x)}{y}"
            if isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
                cellules.append(f'<c r="{ref}"><v>{valeur}</v></c>')
            else:
                cellules.append(f'<c r="{ref}" t="inlineStr"><is><t>{_xml(valeur)}</t></is></c>')
        lignes_xml.append(f'<row r="{y}">{"".join(cellules)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(lignes_xml)}</sheetData></worksheet>'
    )


def _xlsx(feuilles: dict[str, list[list]]) -> bytes:
    noms = list(feuilles)
    overrides = [
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    ]
    rels = []
    sheets = []
    fichiers = {"xl/workbook.xml": "", "xl/_rels/workbook.xml.rels": ""}
    for index, nom in enumerate(noms, start=1):
        chemin = f"xl/worksheets/sheet{index}.xml"
        fichiers[chemin] = _feuille(feuilles[nom])
        overrides.append(
            f'<Override PartName="/{chemin}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
        rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
        sheets.append(f'<sheet name="{_xml(nom)}" sheetId="{index}" r:id="rId{index}"/>')
    fichiers["xl/workbook.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheets)}</sheets></workbook>'
    )
    fichiers["xl/_rels/workbook.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels)}</Relationships>'
    )
    fichiers["[Content_Types].xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}</Types>'
    )
    fichiers["_rels/.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    return _zip(fichiers)


def _boite(ident: int, y: int, hauteur: int, lignes: list[str], taille: int, gras: bool) -> str:
    paragraphes = "".join(
        f'<a:p><a:r><a:rPr lang="fr-FR" sz="{taille}" b="{"1" if gras else "0"}"/><a:t>{_xml(ligne)}</a:t></a:r></a:p>'
        for ligne in lignes
    )
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{ident}" name="Texte {ident}"/>'
        '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>'
        f'<a:xfrm><a:off x="457200" y="{y}"/><a:ext cx="11277600" cy="{hauteur}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
        f'<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>{paragraphes}</p:txBody></p:sp>'
    )


def _slide(titre: str, lignes: list[str]) -> str:
    contenu = _boite(2, 365760, 640080, [titre], 3200, True) + _boite(3, 1097280, 5303520, lignes, 2000, False)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>'
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>'
        f"{contenu}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>"
    )


def _pptx(slides: list[tuple[str, list[str]]]) -> bytes:
    fichiers: dict[str, str] = {}
    overrides = [
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    ]
    rels_pres = [
        '<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    ]
    identifiants = []
    for index, (titre, lignes) in enumerate(slides, start=1):
        fichiers[f"ppt/slides/slide{index}.xml"] = _slide(titre, lignes)
        fichiers[f"ppt/slides/_rels/slide{index}.xml.rels"] = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
            "</Relationships>"
        )
        overrides.append(
            f'<Override PartName="/ppt/slides/slide{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        )
        rels_pres.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{index}.xml"/>'
        )
        identifiants.append(f'<p:sldId id="{255 + index}" r:id="rId{index}"/>')
    fichiers["ppt/presentation.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst>'
        f'<p:sldIdLst>{"".join(identifiants)}</p:sldIdLst>'
        '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
    )
    fichiers["ppt/_rels/presentation.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels_pres)}</Relationships>'
    )
    fichiers["ppt/slideLayouts/slideLayout1.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">'
        '<p:cSld name="Vide"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/>'
        '<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>'
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    )
    fichiers["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        "</Relationships>"
    )
    fichiers["ppt/slideMasters/slideMaster1.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld name="Vide"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/>'
        '<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>'
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" '
        'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'
    )
    fichiers["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
        "</Relationships>"
    )
    fichiers["ppt/theme/theme1.xml"] = _theme()
    fichiers["[Content_Types].xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{"".join(overrides)}</Types>'
    )
    fichiers["_rels/.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        "</Relationships>"
    )
    return _zip(fichiers)


def _theme() -> str:
    couleurs = {
        "dk1": "0B1C30",
        "lt1": "FFFFFF",
        "dk2": "004428",
        "lt2": "F8F9FF",
        "accent1": "0A5E3A",
        "accent2": "9E4300",
        "accent3": "495167",
        "accent4": "8CD6A9",
        "accent5": "FE7B28",
        "accent6": "333A4F",
        "hlink": "0A5E3A",
        "folHlink": "9E4300",
    }
    scheme = "".join(f'<a:{nom}><a:srgbClr val="{valeur}"/></a:{nom}>' for nom, valeur in couleurs.items())
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="SIGRH">'
        f'<a:themeElements><a:clrScheme name="SIGRH">{scheme}</a:clrScheme>'
        '<a:fontScheme name="SIGRH"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont>'
        '<a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>'
        '<a:fmtScheme name="SIGRH"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
        '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
        '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
        '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
    )


def _zip(fichiers: dict[str, str]) -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for nom, contenu in fichiers.items():
            archive.writestr(nom, contenu.encode("utf-8"))
    return tampon.getvalue()


def lire_echeance(valeur: str) -> date:
    try:
        return datetime.strptime(valeur, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise FiltreInconnu("Indiquez une date au format AAAA-MM-JJ.") from exc
