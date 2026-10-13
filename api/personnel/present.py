from datetime import date

from .models import (
    Absence,
    Acte,
    Agent,
    AlerteReleve,
    Demande,
    DispositifSocial,
    EnveloppeSociale,
    LigneAvancement,
    MouvementStrategique,
    PrestationSociale,
    SituationSociale,
    TypeConge,
    TypeActe,
    SessionFormation,
    TypeFormation,
    VisaEnAttente,
)

# Règles de projection du prototype : un échelon tous les 2 ans ; limite d'âge 65 ans
# pour les grades A4 à A7, 60 ans pour les autres.
DUREE_ECHELON_ANS = 2
GRADES_65_ANS = {"A4", "A5", "A6", "A7"}


def agent_brief(agent: Agent) -> dict:
    return {
        "matricule": agent.matricule,
        "nom": agent.nom,
        "prenoms": agent.prenoms,
        "nom_complet": agent.nom_complet,
        "initiales": agent.initiales,
        "corps": agent.corps,
        "grade": agent.grade,
        "echelon": agent.echelon,
        "indice": agent.indice,
        "structure": agent.structure,
        "organisme": agent.organisme.nom,
        "organisme_sigle": agent.organisme.sigle,
        "situation": agent.situation,
        "categorie": agent.categorie,
        "photo_url": agent.photo.url if agent.photo else "",
    }


def _categorie_statutaire(grade: str, categorie: str) -> str:
    if categorie in {"A", "B", "C"}:
        return f"Catégorie {categorie}"
    if grade[:1] in {"A", "B", "C"}:
        return f"Catégorie {grade[0]}"
    return categorie


def _date_iso(valeur: str) -> bool:
    return len(valeur) == 10 and valeur[4] == "-" and valeur[7] == "-"


def _categorie_saisie(agent: Agent) -> str:
    if agent.categorie in {"A", "B", "C"}:
        return agent.categorie
    if agent.grade[:1] in {"A", "B", "C"}:
        return agent.grade[0]
    return agent.categorie


def _date_premiere_prise(agent: Agent) -> str:
    valeur = (agent.prise_service or "").strip()
    if _date_iso(valeur):
        return valeur
    emploi = agent.prise_service_emploi
    if emploi and valeur.isdigit() and emploi.year == int(valeur):
        return emploi.isoformat()
    return valeur


def situation_saisie(agent: Agent) -> dict:
    """Valeurs brutes du formulaire de modification, distinctes du libellé affiché."""
    return {
        "organisme": agent.organisme.code,
        "direction": agent.direction,
        "sous_direction": agent.sous_direction,
        "service": agent.service,
        "localisation": agent.localisation,
        "emploi": agent.emploi,
        "type_agent": agent.type_agent,
        "mode_recrutement": agent.mode_recrutement,
        "categorie": _categorie_saisie(agent),
        "grade": agent.grade,
        "echelon": agent.echelon,
        "prise_service": agent.prise_service,
        "prise_service_ministere": agent.prise_service_ministere.isoformat() if agent.prise_service_ministere else "",
        "prise_service_emploi": agent.prise_service_emploi.isoformat() if agent.prise_service_emploi else "",
        "fonction": agent.fonction,
        "prise_service_fonction": agent.prise_service_fonction.isoformat() if agent.prise_service_fonction else "",
        "situation": agent.situation,
    }


def situation_administrative(agent: Agent) -> list[dict]:
    """Les dix-sept rubriques de la situation administrative, dans l'ordre du dossier."""
    return [
        {"libelle": "Matricule", "valeur": agent.matricule},
        {"libelle": "Structure", "valeur": agent.organisme.nom},
        {"libelle": "Direction", "valeur": agent.direction},
        {"libelle": "Sous-Direction", "valeur": agent.sous_direction},
        {"libelle": "Service", "valeur": agent.service},
        {"libelle": "Lieu de Travail", "valeur": agent.localisation},
        {"libelle": "Emploi", "valeur": agent.emploi},
        {"libelle": "Type Agent", "valeur": agent.type_agent},
        {"libelle": "Mode Recrutement", "valeur": agent.mode_recrutement},
        {"libelle": "Catégorie", "valeur": _categorie_statutaire(agent.grade, agent.categorie)},
        {"libelle": "Grade", "valeur": f"{agent.grade}, échelon {agent.echelon}" if agent.echelon else agent.grade},
        {"libelle": "Date de première prise de service (Fonction Publique)", "valeur": _date_premiere_prise(agent)},
        {
            "libelle": "Date de prise de service dans le ministère",
            "valeur": agent.prise_service_ministere.isoformat() if agent.prise_service_ministere else "",
        },
        {
            "libelle": "Date de prise de service dans l'emploi",
            "valeur": agent.prise_service_emploi.isoformat() if agent.prise_service_emploi else "",
        },
        {"libelle": "Fonction", "valeur": agent.fonction},
        {
            "libelle": "Date de prise de service dans la fonction",
            "valeur": agent.prise_service_fonction.isoformat() if agent.prise_service_fonction else "",
        },
        {"libelle": "Positions", "valeur": agent.situation},
    ]


_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def _date_titre(jour: date) -> str:
    return f"{_JOURS[jour.weekday()].capitalize()} {jour.day} {_MOIS[jour.month - 1].capitalize()} {jour.year}"


def social_agent(agent: Agent) -> dict:
    """Barème, ayants droit, enveloppe et plafonds servis à l'onglet action sociale."""
    try:
        situation = agent.situation_sociale
    except SituationSociale.DoesNotExist:
        situation = None
    enveloppe = EnveloppeSociale.objects.filter(organisme=agent.organisme, exercice=2026).first()
    demandes = PrestationSociale.objects.filter(agent__organisme=agent.organisme, statut__icontains="instruction").count()
    return {
        "cmu": situation.numero_cmu if situation else "",
        "traitement_brut": situation.traitement_brut if situation else 0,
        "cotisations": situation.cotisations if situation else 0,
        "solde_nette": situation.solde_nette if situation else 0,
        "engagements": situation.engagements if situation else 0,
        "taux_quotite": float(situation.taux_quotite) if situation else 0,
        "quotite": situation.quotite if situation else 0,
        "marge": situation.marge if situation else 0,
        "part_engagements": round(situation.engagements / situation.solde_nette * 100, 1) if situation and situation.solde_nette else 0,
        "part_quotite": round(situation.engagements / situation.quotite * 100, 1) if situation and situation.quotite else 0,
        "ayants_droit": [
            {"initiales": item.initiales, "nom": item.nom, "lien": item.lien, "detail": item.detail, "statut": item.statut}
            for item in agent.ayants_droit.all()
        ],
        "enveloppe": None
        if enveloppe is None
        else {
            "exercice": enveloppe.exercice,
            "ligne": enveloppe.ligne,
            "allouee": enveloppe.allouee,
            "engagee": enveloppe.engagee,
            "reliquat": enveloppe.reliquat,
            "taux_execution": round(enveloppe.engagee / enveloppe.allouee * 100, 1) if enveloppe.allouee else 0,
            "session": enveloppe.session_numero,
            "session_date": _date_titre(enveloppe.session_date),
            "demandes": demandes,
            "contact": enveloppe.contact,
        },
        "dispositifs": [{"code": item.code, "ancre": item.ancre, "valeur": item.valeur} for item in DispositifSocial.objects.all()],
    }


def types_actes() -> list[dict]:
    return [{"code": item.code, "libelle": item.libelle} for item in TypeActe.objects.all()]


def sessions_formations() -> list[dict]:
    """Modules ouverts par la direction de la formation continue."""
    sessions = SessionFormation.objects.filter(ouverte=True).select_related("type_formation")
    return [
        {
            "code": item.code,
            "libelle": item.libelle,
            "type": item.type_formation.code,
            "cadre": item.cadre_budgetaire,
            "objectif": item.objectif,
        }
        for item in sessions
    ]


def types_formations() -> list[dict]:
    types = TypeFormation.objects.prefetch_related("publics")
    return [
        {
            "code": item.code,
            "libelle": item.libelle,
            "publics": [public.libelle for public in item.publics.all()],
            "piece_requise": item.piece_requise,
            "piece_libelle": item.piece_libelle,
        }
        for item in types
    ]


def types_conges() -> list[dict]:
    racines = TypeConge.objects.filter(parent__isnull=True).prefetch_related("enfants")
    return [
        {
            "code": item.code,
            "libelle": item.libelle,
            "enfants": [{"code": enfant.code, "libelle": enfant.libelle} for enfant in item.enfants.all()],
        }
        for item in racines
    ]


def conges_agent(agent: Agent) -> dict:
    annee = date.today().year
    prises = sum(
        item.jours
        for item in agent.absences.all()
        if item.debut.year == annee and "autorisation" in item.nature.lower()
    )
    return {
        "acquis": agent.conges_acquis,
        "consommes": agent.conges_consommes,
        "reliquat": agent.reliquat_conges,
        "report": agent.report_conges,
        "autorisations": agent.autorisations_acquises,
        "autorisations_restantes": max(0, agent.autorisations_acquises - prises),
    }


def presence_service(agent: Agent) -> dict:
    """Présence du jour pour l'agent et ses collègues du même organisme."""
    jour = date.today()
    autres = list(
        Agent.objects.filter(organisme_id=agent.organisme_id).exclude(pk=agent.pk).order_by("nom", "prenoms")[:5]
    )
    equipe = [agent, *autres]
    couvertes = {
        item.agent_id: item
        for item in Absence.objects.filter(agent_id__in=[personne.pk for personne in equipe], debut__lte=jour, fin__gte=jour)
    }
    membres = []
    comptes = {"present": 0, "conge": 0, "maladie": 0}
    for personne in equipe:
        absence = couvertes.get(personne.pk)
        if absence and "maladie" in absence.nature.lower():
            ton, badge = "maladie", "Arrêt maladie"
            libelle = f"{absence.nature} : jusqu'au {_jour_court(absence.fin)}"
        elif absence:
            ton, badge = "conge", "En congé"
            libelle = f"{absence.nature} : jusqu'au {_jour_court(absence.fin)}"
        else:
            ton, badge = "present", "Disponible"
            libelle = "Présent"
        comptes[ton] += 1
        membres.append(
            {
                "initiales": personne.initiales,
                "nom": personne.nom_complet,
                "vous": personne.pk == agent.pk,
                "libelle": libelle,
                "badge": badge,
                "ton": ton,
            }
        )
    total = len(equipe) or 1
    presents, conges, maladie = _parts([comptes["present"], comptes["conge"], comptes["maladie"]], total)
    return {
        "mois": f"{_MOIS[jour.month - 1].capitalize()} {jour.year}",
        "service": agent.structure or agent.organisme.nom,
        "quorum": agent.organisme.quorum_presence,
        "membres": membres,
        "presents": presents,
        "conges": conges,
        "maladie": maladie,
    }


def _jour_court(jour: date) -> str:
    return f"{jour.day} {_MOIS[jour.month - 1]} {jour.year}"


def _parts(comptes: list[int], total: int) -> tuple[int, int, int]:
    brut = [compte * 100 / total for compte in comptes]
    entiers = [int(valeur) for valeur in brut]
    reste = 100 - sum(entiers)
    ordre = sorted(range(len(brut)), key=lambda index: brut[index] - entiers[index], reverse=True)
    for index in range(reste):
        entiers[ordre[index % len(ordre)]] += 1
    return entiers[0], entiers[1], entiers[2]


def agent_detail(agent: Agent) -> dict:
    payload = agent_brief(agent)
    payload.update(
        {
            "anciennete": agent.anciennete,
            "prise_service": agent.prise_service,
            "situation_administrative": situation_administrative(agent),
            "situation_saisie": situation_saisie(agent),
            "visite_medicale": agent.visite_medicale,
            "affiliation_cgrae": agent.affiliation_cgrae,
            "conges": conges_agent(agent),
            "types_conges": types_conges(),
            "types_formations": types_formations(),
            "sessions_formations": sessions_formations(),
            "types_actes": types_actes(),
            "presence": presence_service(agent),
            "actes": [acte_row(acte) for acte in agent.actes.all()],
            "coordonnees": {
                "telephone": agent.telephone,
                "courriel": agent.courriel,
                "localisation": agent.localisation,
                "habilitation": agent.habilitation,
            },
            "date_naissance": agent.date_naissance.isoformat() if agent.date_naissance else None,
            "projection": projection(agent),
            "evaluations": [
                {
                    "id": item.id,
                    "annee": item.annee,
                    "note": float(item.note),
                    "mention": item.mention,
                    "appreciation": item.appreciation,
                    "evaluateur": item.evaluateur,
                    "fonction_evaluateur": item.fonction_evaluateur,
                    "statut": item.statut,
                    "avis_drh": item.avis_drh,
                    "vise_le": item.vise_le.isoformat() if item.vise_le else None,
                    "notifiee_le": item.notifiee_le.isoformat() if item.notifiee_le else None,
                    "observation_agent": item.observation_agent,
                    "objectifs": [
                        {
                            "ordre": objectif.ordre,
                            "intitule": objectif.intitule,
                            "description": objectif.description,
                            "note": float(objectif.note),
                            "ponderation": objectif.ponderation,
                            "taux_atteinte": objectif.taux_atteinte,
                            "mention": objectif.mention,
                        }
                        for objectif in item.objectifs.all()
                    ],
                    "criteres": [
                        {"libelle": critere.libelle, "note": float(critere.note), "commentaire": critere.commentaire}
                        for critere in item.criteres.all()
                    ],
                }
                for item in agent.evaluations.all()
            ],
            "absences": [
                {
                    "id": item.id,
                    "nature": item.nature,
                    "debut": item.debut.isoformat(),
                    "fin": item.fin.isoformat(),
                    "jours": item.jours,
                    "statut": item.statut,
                    "interim": item.interim,
                }
                for item in agent.absences.all()
            ],
            "prestations": [
                {
                    "id": item.id,
                    "reference": item.reference,
                    "nature": item.nature,
                    "objet": item.objet,
                    "montant": item.montant,
                    "date_demande": item.date_demande.isoformat(),
                    "statut": item.statut,
                    "echeancier": item.echeancier,
                }
                for item in agent.prestations.all()
            ],
            "social": social_agent(agent),
            "formations": [
                {
                    "id": item.id,
                    "intitule": item.intitule,
                    "organisme": item.organisme,
                    "debut": item.debut.isoformat(),
                    "fin": item.fin.isoformat(),
                    "heures": item.heures,
                    "statut": item.statut,
                    "certification": item.certification,
                }
                for item in agent.formations.all()
            ],
            "pieces": [
                {
                    "id": item.id,
                    "intitule": item.intitule,
                    "categorie": item.categorie,
                    "date_depot": item.date_depot.isoformat(),
                    "taille_ko": item.taille_ko,
                    "verifiee": item.verifiee,
                    "fichier_url": item.fichier.url if item.fichier else "",
                }
                for item in agent.pieces.all()
            ],
            "demandes": [
                {
                    "reference": item.reference,
                    "nature": item.nature,
                    "icone": item.icone,
                    "etape": item.etape,
                    "responsable": item.responsable,
                    "echeance": item.echeance,
                    "depose_le": item.depose_le.isoformat(),
                    "categorie": item.categorie,
                    "visas": [
                        {
                            "ordre": visa.ordre,
                            "instance": visa.instance,
                            "titulaire": visa.titulaire,
                            "fonction": visa.fonction,
                            "avis": visa.avis,
                            "commentaire": visa.commentaire,
                            "date": visa.date.isoformat() if visa.date else None,
                            "reference": visa.reference,
                            "signature_url": visa.signature.url if visa.signature else "",
                        }
                        for visa in item.visas.all()
                    ],
                }
                for item in agent.demandes.all()
            ],
            "visas": [
                {
                    "instance": item.instance,
                    "titulaire": item.titulaire,
                    "fonction": item.fonction,
                    "avis": item.avis,
                    "commentaire": item.commentaire,
                    "date": item.date.isoformat() if item.date else None,
                    "reference": item.reference,
                }
                for item in agent.visas_dossier.all()
            ],
        }
    )
    return payload


def _ajoute_annees(jour: date, annees: int) -> date:
    try:
        return jour.replace(year=jour.year + annees)
    except ValueError:  # 29 février
        return jour.replace(year=jour.year + annees, day=28)


def _duree(debut: date, fin: date) -> str:
    mois = max(0, (fin.year - debut.year) * 12 + fin.month - debut.month)
    annees, reste = divmod(mois, 12)
    morceaux = []
    if annees:
        morceaux.append(f"{annees} an{'s' if annees > 1 else ''}")
    if reste:
        morceaux.append(f"{reste} mois")
    return " ".join(morceaux) or "moins d'un mois"


def projection(agent: Agent, aujourd_hui: date | None = None) -> dict | None:
    """Projection indicative : prochain échelon et radiation des cadres (limite d'âge)."""
    aujourd_hui = aujourd_hui or date.today()
    avancements = [
        acte.date_effet
        for acte in agent.actes.all()
        if acte.date_effet and "avancement" in acte.nature.lower() and acte.statut == Acte.Statut.VALIDE
    ]
    depart = max(avancements) if avancements else None
    if depart is None and _date_iso(agent.prise_service):
        depart = date.fromisoformat(agent.prise_service)
    elif depart is None and agent.prise_service.isdigit():
        depart = date(int(agent.prise_service), 1, 1)
    if depart is None or agent.date_naissance is None:
        return None
    precedent, prochain = depart, _ajoute_annees(depart, DUREE_ECHELON_ANS)
    while prochain <= aujourd_hui:
        precedent, prochain = prochain, _ajoute_annees(prochain, DUREE_ECHELON_ANS)
    ecoule = (aujourd_hui - precedent).days / (prochain - precedent).days
    age_limite = 65 if agent.grade in GRADES_65_ANS else 60
    radiation = _ajoute_annees(agent.date_naissance, age_limite)
    echelon = int(agent.echelon) + 1 if agent.echelon.isdigit() else None
    return {
        "prochain_echelon": echelon,
        "date_prochain_echelon": prochain.isoformat(),
        "progression": round(100 * ecoule),
        "age_limite": age_limite,
        "date_radiation": radiation.isoformat(),
        "service_restant": _duree(aujourd_hui, radiation) if radiation > aujourd_hui else "Limite d'âge atteinte",
    }


def registre_agent(agent: Agent) -> dict:
    payload = agent_brief(agent)
    proj = projection(agent)
    payload.update(
        {
            "anciennete": agent.anciennete,
            "date_naissance": agent.date_naissance.isoformat() if agent.date_naissance else None,
            "conges": {
                "acquis": agent.conges_acquis,
                "consommes": agent.conges_consommes,
                "reliquat": agent.reliquat_conges,
            },
            "radiation": None
            if proj is None
            else {
                "age_limite": proj["age_limite"],
                "date_radiation": proj["date_radiation"],
                "service_restant": proj["service_restant"],
            },
        }
    )
    return payload


def absence_row(item) -> dict:
    return {
        "id": item.id,
        "nature": item.nature,
        "debut": item.debut.isoformat(),
        "fin": item.fin.isoformat(),
        "jours": item.jours,
        "statut": item.statut,
        "interim": item.interim,
        "agent": agent_brief(item.agent),
    }


def acte_row(acte: Acte) -> dict:
    return {
        "id": acte.id,
        "reference": acte.reference,
        "nature": acte.nature,
        "titre": acte.titre,
        "resume": acte.resume,
        "domaine": acte.domaine,
        "statut": acte.statut,
        "statut_libelle": acte.get_statut_display(),
        "date_effet": acte.date_effet.isoformat() if acte.date_effet else None,
        "date_enregistrement": acte.date_enregistrement.isoformat(),
        "signataire": acte.signataire,
        "agent": agent_brief(acte.agent),
        "structure": acte.agent.structure,
        "organisme": acte.agent.organisme.sigle or acte.agent.organisme.nom,
        "scan_url": acte.scan.url if acte.scan else "",
        "signatures": [
            {
                "objet": visa.objet,
                "signataire": acte.signataire,
                "date": visa.traite_le.date().isoformat() if visa.traite_le else None,
                "signature_url": visa.signature.url,
            }
            for visa in acte.visas_drh.all()
            if visa.statut == VisaEnAttente.Statut.VISE and visa.signature
        ],
    }


def visa_row(visa: VisaEnAttente) -> dict:
    agent = visa.agent
    return {
        "id": visa.id,
        "objet": visa.objet,
        "echeance": visa.echeance,
        "visa_amont": visa.visa_amont,
        "categorie": visa.categorie,
        "urgent": visa.urgent,
        "agent": agent_brief(agent),
    }


def avancement_row(ligne: LigneAvancement) -> dict:
    return {
        "id": ligne.id,
        "emploi": ligne.emploi,
        "structure": ligne.structure,
        "grade_echelon": ligne.grade_echelon,
        "anciennete": ligne.anciennete,
        "proposition": ligne.proposition,
        "mode": ligne.mode,
        "note": ligne.note,
        "avis": ligne.avis,
        "statut": ligne.statut,
        "agent": agent_brief(ligne.agent),
    }


def demande_row(demande: Demande) -> dict:
    return {
        "reference": demande.reference,
        "nature": demande.nature,
        "icone": demande.icone,
        "etape": demande.etape,
        "responsable": demande.responsable,
        "echeance": demande.echeance,
        "depose_le": demande.depose_le.isoformat(),
        "categorie": demande.categorie,
        "agent": agent_brief(demande.agent),
    }


def mouvement_row(item: MouvementStrategique) -> dict:
    return {
        "id": item.id,
        "poste": item.poste,
        "organisme": item.organisme.sigle or item.organisme.nom,
        "nature": item.nature,
        "statut": item.statut,
        "date_effet": item.date_effet.isoformat(),
        "agent": agent_brief(item.agent),
    }


def alerte_row(item: AlerteReleve) -> dict:
    return {
        "id": item.id,
        "poste": item.poste,
        "organisme": item.organisme.sigle or item.organisme.nom,
        "depart": item.depart.isoformat(),
        "vivier": item.vivier,
        "vivier_cible": item.vivier_cible,
        "risque": item.risque,
        "risque_libelle": item.get_risque_display(),
        "titulaire": agent_brief(item.titulaire),
    }


def notification_row(item) -> dict:
    return {
        "id": item.id,
        "categorie": item.categorie,
        "titre": item.titre,
        "message": item.message,
        "lien": item.lien,
        "urgente": item.urgente,
        "lue": item.lue,
        "creee_le": item.creee_le.isoformat(),
    }
