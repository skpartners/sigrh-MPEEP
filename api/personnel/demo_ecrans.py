"""Données de démonstration des écrans Carrières et Action sociale.

Appelé par les migrations de données (base existante) et par seed_demo (rechargement complet).
`modele(nom)` renvoie la classe du modèle : apps.get_model dans une migration, l'import direct ailleurs.
Les registres sont rattachés aux agents fictifs déjà versés ; les dates sont relatives au jour du
chargement, pour que chaque état (en attente, en cours, clos) reste représenté.
"""

from datetime import date, timedelta


def jours_ouvres(debut: date, fin: date) -> int:
    """Jours ouvrés entre deux dates incluses (samedis et dimanches exclus)."""
    compte = 0
    jour = debut
    while jour <= fin:
        if jour.weekday() < 5:
            compte += 1
        jour += timedelta(days=1)
    return max(compte, 1)


def _bloc(modele, ecran: str, cle: str, contenu) -> None:
    modele("BlocEcran").objects.update_or_create(ecran=ecran, cle=cle, defaults={"contenu": contenu})


# --- Absences -------------------------------------------------------------------------------------

# matricule, type, justificatif, début (jours depuis aujourd'hui), durée (jours), décision, motif, impact, détail
AUTORISATIONS = [
    ("394812H", "autorisation", "Ordre de mission ministériel validé n° 049/MPEEP", -31, 5, "validee",
     "Pièce conforme à l'ordre de service.", "Maintien intégral", "Prise en charge per diem"),
    ("455870T", "autorisation-speciale", "Certificat médical d'un centre hospitalier agréé", -6, 6, "en_attente",
     "", "Plein traitement", "Tranche 1 (1er au 3e mois)"),
    ("418902X", "permission-speciale", "Naissance au foyer (acte d'état civil certifié)", -2, 2, "en_attente",
     "", "Solde intégrale", "Quota légal annuel (10 j max)"),
    ("392104D", "autorisation", "Mise en demeure transmise sans retour", -9, 6, "invalidee",
     "Justificatif absent à l'échéance du délai de 48 h.", "Retenue 6/30e émise", "Transmission au Trésor actée"),
    ("509231M", "permission-speciale", "Mariage de l'agent (acte de mariage)", -45, 4, "validee",
     "Acte d'état civil versé au dossier.", "Solde intégrale", "Quota légal annuel (10 j max)"),
    ("367215R", "autorisation", "Convocation à un jury d'examen", -20, 2, "validee",
     "Convocation officielle jointe.", "Maintien intégral", "Service fait reconnu"),
    ("523406L", "autorisation-speciale", "Hospitalisation d'un enfant (bulletin d'admission)", -4, 3, "en_attente",
     "", "Plein traitement", "Tranche 1 (1er au 3e mois)"),
    ("411904C", "autorisation", "Convenance personnelle (demande écrite)", -15, 1, "validee",
     "Absence imputée sur le quota annuel.", "Maintien intégral", "Imputée sur le quota"),
    ("476112P", "permission-speciale", "Décès d'un ascendant (acte de décès)", -60, 3, "validee",
     "Acte de décès versé au dossier.", "Solde intégrale", "Quota légal annuel (10 j max)"),
    ("402771K", "autorisation", "Absence sans pièce à l'appui", -12, 2, "invalidee",
     "Aucune pièce produite après relance du chef de service.", "Retenue 2/30e émise", "Transmission au Trésor actée"),
    ("340188P", "autorisation-speciale", "Examen médical spécialisé (convocation)", 3, 1, "en_attente",
     "", "Plein traitement", "Absence programmée"),
    ("289043B", "autorisation", "Mission d'inspection d'une société d'État (ordre de mission)", -75, 4, "validee",
     "Ordre de mission visé par la direction.", "Maintien intégral", "Prise en charge per diem"),
]

LIBELLES_AUTORISATION = {
    "autorisation": "Autorisation d'absence",
    "autorisation-speciale": "Autorisation spéciale d'absence",
    "permission-speciale": "Permission spéciale d'absence",
}


def charger_absences(modele) -> None:
    Agent = modele("Agent")
    Absence = modele("Absence")
    aujourd_hui = date.today()
    Absence.objects.exclude(type_autorisation="").delete()
    for matricule, type_code, justificatif, decalage, duree, decision, motif, impact, detail in AUTORISATIONS:
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is None:
            continue
        debut = aujourd_hui + timedelta(days=decalage)
        fin = debut + timedelta(days=duree - 1)
        Absence.objects.create(
            agent=agent,
            nature=LIBELLES_AUTORISATION[type_code],
            debut=debut,
            fin=fin,
            jours=jours_ouvres(debut, fin),
            statut={"validee": "Justifiée", "invalidee": "Injustifiée", "en_attente": "En instruction"}[decision],
            type_autorisation=type_code,
            justificatif=justificatif,
            decision=decision,
            motif_decision=motif,
            decide_le=aujourd_hui + timedelta(days=min(decalage + duree, 0)) if decision != "en_attente" else None,
            impact_solde=impact,
            impact_detail=detail,
        )
    # Le taux de présentéisme provient du pointage, qui n'est pas encore relié à la base.
    _bloc(modele, "absences", "presenteisme", {"taux": 97.4, "evolution": 0.8, "objectif": 96.0})


# --- Congés (arbitrage de la sous-direction des carrières) --------------------------------

# matricule, nature, début (jours), durée (jours calendaires), intérim, détail, instruction
ARBITRAGES = [
    ("455870T", "Congé annuel (reliquat N-1)", 7, 19, "M. YAO Constant Sylvain", "Intérim validé par le chef de service", "pret_signature"),
    ("349812K", "Congé annuel principal", 12, 16, "Mme SORO Karidja", "Intérim désigné par la direction", "pret_signature"),
    ("367215R", "Congé de paternité", 2, 3, "Permanence du service assurée", "Équipe d'astreinte du service", "approbation_auto"),
    ("523406L", "Congé de maternité", 20, 98, "Certificat médical homologué", "Remplacement par intérim acté", "remplacement"),
    ("392104D", "Congé annuel principal", 5, 31, "Quorum du service sous 60 %", "Trois agents du service déjà en congé", "conflit_quorum"),
    ("501229K", "Congé annuel principal", -20, 12, "M. YAO Kouassi Florent", "Intérim assuré", "signe"),
]

CONGES = {
    "campagne": {"reference": "ARRET-MPEEP/DRH/{annee}-T1", "synchronisation": "Validée à 08:30 GMT", "seuil": 65},
    "presence": {"taux": 81.6, "seuil": 65.0},
    "trimestres": [
        {"titre": "T2 • Pâques / Avril", "departs": 18, "texte": "Congés courts et reliquats N-1. Impact opérationnel maîtrisé.", "etat": "Continuité assurée (82 % de présence)", "ton": "neutre"},
        {"titre": "T3 • Trêve estivale (juillet-août)", "departs": 34, "texte": "Pic majeur de l'année. Arbitrage des binômes stratégiques requis.", "etat": "Optimisation des intérims en cours", "ton": "attention"},
        {"titre": "T4 • Fin d'année (décembre)", "departs": 28, "texte": "Clôture budgétaire et arrêtés collectifs programmés.", "etat": "Quorum prévu à 72 % (conforme)", "ton": "neutre"},
    ],
    "mensuel": [88, 86, 81, 82, 89, 84, 66, 67, 85, 87, 88, 72],
    "quorums": [
        {"entite": "PETROCI Holding", "presence": 84, "detail": "48 départs au T1"},
        {"entite": "CI-ENERGIES", "presence": 79, "detail": "72 départs au T1"},
        {"entite": "BNETD", "presence": 88, "detail": "24 départs au T1"},
        {"entite": "SOGEPIE", "presence": 68, "detail": "Seuil critique approché"},
        {"entite": "Port Autonome d'Abidjan", "presence": 82, "detail": "115 départs au T1"},
    ],
    "reliquats": {
        "echeance": "30 avril",
        "options": [
            {"titre": "1. Consommation immédiate", "texte": "Départ programmé avant l'échéance avec accord exprès du supérieur hiérarchique.", "jours": 2480, "part": 60, "ton": "neutre"},
            {"titre": "2. Compte épargne-temps (CET)", "texte": "Versement automatique sous réserve du plafond réglementaire de 10 jours.", "jours": 1140, "part": 28, "ton": "sobre"},
            {"titre": "3. Indemnisation dérogatoire", "texte": "Nécessité impérieuse de service attestée par arrêté du ministre de tutelle.", "jours": 500, "part": 12, "ton": "attention"},
        ],
        "circulaire": "Circulaire ministérielle n° 0042/MPEEP/DRH",
    },
}


RELIQUATS = {"455870T": 8, "349812K": 5, "392104D": 12, "289043B": 6, "418902X": 3}


def charger_conges(modele) -> None:
    Agent = modele("Agent")
    Absence = modele("Absence")
    aujourd_hui = date.today()
    Absence.objects.exclude(instruction="").delete()
    for matricule, nature, decalage, duree, interim, detail, instruction in ARBITRAGES:
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is None:
            continue
        debut = aujourd_hui + timedelta(days=decalage)
        fin = debut + timedelta(days=duree - 1)
        maternite = "maternité" in nature
        Absence.objects.create(
            agent=agent,
            nature=nature,
            debut=debut,
            fin=fin,
            jours=duree if maternite else jours_ouvres(debut, fin),
            statut="Arrêté signé" if instruction == "signe" else "En instruction",
            interim=interim,
            interim_detail=detail,
            instruction=instruction,
            decide_le=aujourd_hui + timedelta(days=decalage - 5) if instruction == "signe" else None,
        )
    # Reliquats N-1 de quelques agents, à apurer avant l'échéance de la campagne.
    for matricule, report in RELIQUATS.items():
        Agent.objects.filter(matricule=matricule).update(report_conges=report)
    for cle, contenu in CONGES.items():
        _bloc(modele, "conges", cle, contenu)


# --- Procédures disciplinaires --------------------------------------------------------------

# référence (suffixe), matricule, saisine (jours), grief, description, degré, rapporteur, stade, détail, avis
PROCEDURES = [
    ("019", "402771K", -24, "Manquement au secret professionnel",
     "Divulgation non autorisée d'un rapport préliminaire d'audit financier.", 2, "Mme KOUASSI Éléonore",
     "Mémoire en défense déposé", "Confrontation prévue", "delibere"),
    ("021", "392104D", -16, "Insubordination hiérarchique",
     "Refus répété d'exécuter un ordre de service relatif à l'audit de sécurité des installations.", 2, "Dr YAO N'Goran",
     "Audition fixée", "Défenseur syndical mandaté", "recevable"),
    ("024", "476112P", -8, "Abandon de poste",
     "Absence continue de plus de 15 jours sans justificatif ni autorisation administrative.", 2, "M. CISSÉ Bakary",
     "Mise en demeure adressée", "Accusé de réception reçu", "attente_reponse"),
    ("027", "411904C", -3, "Négligence de contrôle",
     "Omission du visa de régularité budgétaire sur un protocole d'acquisition d'actifs.", 1, "Mme KONÉ Fatoumata",
     "Instruction ouverte", "Consultation du dossier autorisée", "visa_rapporteur"),
    ("012", "509231M", -70, "Retards répétés",
     "Retards répétés constatés par le chef de service sur le trimestre.", 1, "M. AKA Serge",
     "Instruction close", "Avertissement notifié", "sanction"),
]

# matricule, nature, degré, prononcée il y a (jours)
SANCTIONS = [
    ("509231M", "avertissement", 1, 20), ("289043B", "blame", 1, 75), ("367215R", "avertissement", 1, 130),
    ("340188P", "blame", 1, 160), ("455870T", "avertissement", 1, 200), ("418902X", "avertissement", 1, 240),
    # Prononcées il y a près de trois ans : effacement imminent.
    ("394812H", "blame", 1, 3 * 365 - 12), ("523406L", "avertissement", 1, 3 * 365 - 26), ("402771K", "avertissement", 1, 3 * 365 - 36),
    ("392104D", "exclusion", 2, 900),
]

SESSIONS = [
    ("S1", "Session ordinaire", 9, "09:30", "convoquee", ["019", "021"],
     "Examen des mémoires en défense, confrontation des rapporteurs et audition des agents mis en cause.",
     ["Présidence de tutelle (SG-MPEEP)", "Collège des directeurs généraux", "Délégation syndicale"]),
    ("SX", "Session extraordinaire", 21, "14:00", "a_confirmer", [],
     "Recours gracieux et demandes de réhabilitation après sanction.",
     ["Représentant de l'Inspection générale", "Délégués du personnel"]),
]


def charger_discipline(modele) -> None:
    from datetime import datetime, time

    from django.utils import timezone

    Agent = modele("Agent")
    Procedure = modele("ProcedureDisciplinaire")
    Sanction = modele("SanctionDisciplinaire")
    Session = modele("SessionParitaire")
    aujourd_hui = date.today()
    annee = aujourd_hui.year
    Procedure.objects.all().delete()
    Sanction.objects.all().delete()
    Session.objects.all().delete()
    for suffixe, matricule, decalage, grief, description, degre, rapporteur, stade, detail, avis in PROCEDURES:
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is None:
            continue
        Procedure.objects.create(
            reference=f"DISC-{annee}-{suffixe}", agent=agent, saisine=aujourd_hui + timedelta(days=decalage), grief=grief,
            description=description, degre=degre, rapporteur=rapporteur, stade=stade, stade_detail=detail, avis=avis,
        )
    for matricule, nature, degre, anciennete in SANCTIONS:
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is not None:
            Sanction.objects.create(agent=agent, nature=nature, degre=degre, prononcee_le=aujourd_hui - timedelta(days=anciennete))
    for numero, (suffixe, intitule, decalage, heure, etat, procedures, description, composition) in enumerate(SESSIONS, start=1):
        heures, minutes = map(int, heure.split(":"))
        quand = timezone.make_aware(datetime.combine(aujourd_hui + timedelta(days=decalage), time(heures, minutes)))
        references = [f"DISC-{annee}-{item}" for item in procedures]
        Session.objects.create(
            code=f"{str(annee)[2:]}-{suffixe}", intitule=intitule, date=quand, etat=etat,
            ordre_du_jour=f"Instruction des dossiers {' et '.join(references)}" if references else "Recours gracieux et demandes de réhabilitation",
            description=description, composition=composition, lieu="Salle du conseil • DGPE",
        )
    _bloc(modele, "discipline", "regularite", {"taux": 100, "detail": "Zéro vice de forme", "controle": "Communication des pièces", "visa": "Visa"})
    verser_cadre_discipline(modele)


# Textes et barème affichés par l'écran : modifiables dans la base, plus dans le composant.
CADRE_DISCIPLINE = {
    "entete": {
        "fil": ["SD Gestion des carrières", "Contentieux & déontologie", "Procédures disciplinaires"],
        "titre": "Conseil de discipline & procédures contentieuses",
        "chapeau": (
            "Instance de régulation administrative et déontologique des personnels de direction, "
            "cadres et agents contractuels sous tutelle du Ministère du Portefeuille de l’État et des Entreprises Publiques."
        ),
    },
    "regles": {
        "delai_jours": 30,
        "effacement_ans": 3,
        "horizon_jours": 120,
        "stade_ouverture": "Instruction ouverte",
        "detail_ouverture": "Communication du dossier à l'agent",
    },
    "echelle": {
        "titre": "Échelle Réglementaire des Sanctions Statutaires",
        "reference": "Application stricte de l’Ordonnance n° 2023-892 et des Accords d'Établissement des Sociétés d’État",
        "principe": "Principe d'indépendance de l'action publique",
        "degres": [
            {
                "degre": 1,
                "rang": "1er Degré",
                "teinte": "primary",
                "autorite": "Directeur Général / DRH",
                "intitule": "Avertissement & Blâme",
                "description": (
                    "Sanctions morales sans incidence immédiate sur le traitement de base. "
                    "Inscription au fascicule individuel de l’agent avec droit de réponse consigné sous 8 jours."
                ),
                "pied": "Amnistiable :",
                "pied_valeur": "3 ans sans récidive",
                "option": "1er degré : avertissement, blâme",
            },
            {
                "degre": 2,
                "rang": "2ème Degré",
                "teinte": "secondary",
                "autorite": "Avis Conseil Obligatoire",
                "intitule": "Déplacement, Rétrogradation, Exclusion",
                "description": (
                    "Déplacement d'office aux frais de l’agent, rétrogradation d'un ou deux échelons, "
                    "ou exclusion temporaire de fonctions avec privation de salaire (jusqu'à 6 mois)."
                ),
                "pied": "Procédure :",
                "pied_valeur": "Rapporteur + Audition",
                "option": "2e degré : déplacement, rétrogradation, exclusion",
            },
            {
                "degre": 3,
                "rang": "3ème Degré",
                "teinte": "error",
                "autorite": "Arrêté Ministériel",
                "intitule": "Révocation Définitive",
                "description": (
                    "Révocation du cadre ou rupture de contrat pour faute lourde, avec ou sans suspension "
                    "des droits à pension d’ancienneté selon la gravité de l'atteinte aux fonds publics."
                ),
                "pied": "Notification :",
                "pied_valeur": "Notification au Trésor & CGRAE",
                "option": "3e degré : révocation",
            },
        ],
    },
    "registre": {
        "titre": "Registre décisionnel des dossiers en cours",
        "texte": "Surveillance du contradictoire et avis sous l'autorité du conseil de discipline.",
    },
    "calendrier": {
        "titre": "Calendrier des sessions paritaires",
        "texte": "Commission mixte ministérielle (tutelle, directions générales, représentants du personnel)",
    },
    "amnistie": {
        "titre": "Amnistie & réhabilitation",
        "sous_titre": "Effacement automatique des sanctions du 1er degré",
        "regle": "Règle des trois ans révolus",
        "texte": (
            "Toute sanction du premier degré (avertissement, blâme) est effacée de plein droit "
            "du dossier de l'agent après trois années sans nouvelle infraction."
        ),
        "mention": "Automatique SIGRH",
        "vide": "Aucun effacement dans les quatre prochains mois.",
    },
    "suivi": {
        "titre": "Suivi des actes",
        "texte": (
            "Les procès-verbaux de séance, notifications de sanction et mémoires en défense sont versés au dossier. "
            "Tout acte disciplinaire frappé de nullité juridique est immédiatement signalé au Contrôle d'État."
        ),
    },
}


def verser_cadre_discipline(modele) -> None:
    """Verse le barème, les règles et les textes de l'écran, sans toucher aux dossiers déjà saisis."""
    for cle, contenu in CADRE_DISCIPLINE.items():
        _bloc(modele, "discipline", cle, contenu)
    bloc = modele("BlocEcran").objects.filter(ecran="discipline", cle="regularite").first()
    if bloc is not None and "visa" not in (bloc.contenu or {}):
        bloc.contenu = {**(bloc.contenu or {}), "visa": "Visa"}
        bloc.save(update_fields=["contenu"])


# --- Fin de carrière -------------------------------------------------------------------------------

# matricule, âge limite, entrée en service, IDR, pension mensuelle, statut, détail
RETRAITES = [
    ("289043B", 60, date(1991, 3, 1), 18_450_000, 940_000, "notifie", "Livret de pension généré"),
    ("392104D", 55, date(1997, 10, 6), 11_350_000, 620_000, "quittance", "Audit de clôture en cours"),
    ("501229K", 65, date(1990, 9, 3), 24_800_000, 1_250_000, "arrete", "Visa du contrôle financier accordé"),
    ("318490K", 60, date(1995, 1, 9), 14_200_000, 815_000, "visite", "Convocation à la médecine du travail"),
]

# intitulé, titulaire, successeur, progression du tutorat (%), commentaire
POSTES_SENSIBLES = [
    ("Direction du portefeuille • DGPE", "289043B", "M. KOFFI Yao Christian", 80, "Tutorat avancé"),
    ("Direction des études techniques • BNETD", "501229K", "", 0, "Appel à candidature interne ouvert"),
    ("Cellule de contrôle financier • DGPE", "318490K", "M. KOUASSI Jean-Baptiste", 55, "Immersion en cours"),
]

FIN_CARRIERE = {
    "entete": {
        "fil": ["SD Gestion des carrières", "Fin de carrière, départs & anticipation", "GPEEC"],
        "titre": "Pilotage des fins de carrière, départs à la retraite & cessations d'activité",
        "chapeau": (
            "Liquidation des droits statutaires, arbitrage des radiations, calcul des indemnités de départ (IDR) "
            "et sécurisation de la relève des postes sensibles."
        ),
    },
    "passerelle": {"reference": "EXERCICE-{annee}-REG-09", "etat": "Passerelle CGRAE / CNPS synchronisée"},
    "cgrae": {"taux": 98.2, "detail": "Zéro rupture de solde à M+1"},
    "renouvellement": {"texte": "1 agent entrant pour 1,15 sortant"},
    "accompagnement": {
        "titre": "Programme « Retraite active & sérénité »",
        "texte": "Sessions de préparation à la transition : gestion du patrimoine, entrepreneuriat après la carrière, couverture santé complémentaire.",
        "actions": [
            {"titre": "Séminaire de reconversion", "detail": "Session 3 : Abidjan-Plateau", "quand": "12 - 14 novembre", "valeur": "42 inscrits / 50"},
            {"titre": "Bilan de santé de fin de carrière", "detail": "Centre médical des agents de l'État", "quand": "Prise en charge par l'État", "valeur": "96 % exécuté"},
        ],
    },
    "distinctions": [
        {"rang": "OR", "titre": "Médaille Grand Or (35 ans de service et plus)", "detail": "8 cadres éligibles validés en conseil de l'Ordre", "etat": "Décret prêt"},
        {"rang": "ARG", "titre": "Médaille Vermeil / Argent (25 à 30 ans)", "detail": "29 récipiendaires pour la promotion de la fête nationale", "etat": "En visa"},
    ],
}


def charger_fin_carriere(modele) -> None:
    Agent = modele("Agent")
    Dossier = modele("DossierRetraite")
    Poste = modele("PosteSensible")
    Dossier.objects.all().delete()
    Poste.objects.all().delete()
    limites = {}
    for matricule, age, entree, idr, pension, statut, detail in RETRAITES:
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is None:
            continue
        champs = {"agent": agent, "age_limite": age, "entree_service": entree, "idr": idr, "pension": pension, "statut": statut, "statut_detail": detail}
        if any(champ.name == "motif" for champ in Dossier._meta.fields):
            retraite = _classe(modele, "TypeFinCarriere")
            motif = retraite.objects.filter(code="retraite").first() if retraite is not None else None
            if motif is not None:
                champs["motif"] = motif
        Dossier.objects.create(**champs)
        if agent.date_naissance:
            naissance = agent.date_naissance
            limites[matricule] = naissance.replace(year=naissance.year + age, day=min(naissance.day, 28))
    for intitule, matricule, successeur, progression, commentaire in POSTES_SENSIBLES:
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is not None and matricule in limites:
            Poste.objects.create(intitule=intitule, titulaire=agent, depart=limites[matricule], successeur=successeur, progression=progression, commentaire=commentaire)
    for cle, contenu in FIN_CARRIERE.items():
        _bloc(modele, "fin-carriere", cle, contenu)
    verser_pilotage_fin_carriere(modele, remplacer=True)


def _classe(modele, nom):
    try:
        return modele(nom)
    except (LookupError, AttributeError):
        return None


def verser_pilotage_fin_carriere(modele, remplacer=False) -> None:
    """Verse le pilotage, les actions et les distinctions. Sans effet si les tables n'existent pas encore."""
    Pilotage = _classe(modele, "PilotageFinCarriere")
    if Pilotage is None:
        return
    Action = modele("ActionAccompagnement")
    Distinction = modele("DistinctionCarriere")
    if not remplacer and Pilotage.objects.exists():
        return
    if remplacer:
        Action.objects.all().delete()
        Distinction.objects.all().delete()
        Pilotage.objects.all().delete()
    source = FIN_CARRIERE if remplacer else _source_fin_carriere(modele)
    entete = source["entete"]
    passerelle = source["passerelle"]
    cgrae = source["cgrae"]
    accompagnement = source["accompagnement"]
    Pilotage.objects.create(
        fil=entete.get("fil") or [],
        titre=entete.get("titre") or "",
        chapeau=entete.get("chapeau") or "",
        reference=passerelle.get("reference") or "",
        etat_passerelle=passerelle.get("etat") or "",
        taux_cgrae=cgrae.get("taux") or 0,
        detail_cgrae=cgrae.get("detail") or "",
        renouvellement=(source.get("renouvellement") or {}).get("texte") or "",
        programme_titre=accompagnement.get("titre") or "",
        programme_texte=accompagnement.get("texte") or "",
    )
    for ordre, action in enumerate(accompagnement.get("actions") or []):
        Action.objects.create(
            ordre=ordre, titre=action.get("titre") or "", detail=action.get("detail") or "",
            quand=action.get("quand") or "", valeur=action.get("valeur") or "",
        )
    for ordre, item in enumerate(source.get("distinctions") or []):
        Distinction.objects.create(
            ordre=ordre, rang=item.get("rang") or "", titre=item.get("titre") or "",
            detail=item.get("detail") or "", etat=item.get("etat") or "",
        )


def _source_fin_carriere(modele) -> dict:
    Bloc = _classe(modele, "BlocEcran")
    if Bloc is None:
        return FIN_CARRIERE
    blocs = {bloc.cle: bloc.contenu for bloc in Bloc.objects.filter(ecran="fin-carriere")}
    if not blocs:
        return FIN_CARRIERE
    return {
        "entete": blocs.get("entete") or FIN_CARRIERE["entete"],
        "passerelle": blocs.get("passerelle") or FIN_CARRIERE["passerelle"],
        "cgrae": blocs.get("cgrae") or FIN_CARRIERE["cgrae"],
        "renouvellement": blocs.get("renouvellement") or FIN_CARRIERE["renouvellement"],
        "accompagnement": blocs.get("accompagnement") or FIN_CARRIERE["accompagnement"],
        "distinctions": blocs.get("distinctions") or FIN_CARRIERE["distinctions"],
    }


def verser_entete_fin_carriere(modele) -> None:
    """Ajoute l'en-tête de l'écran sans recharger les dossiers déjà saisis."""
    _bloc(modele, "fin-carriere", "entete", FIN_CARRIERE["entete"])


# --- Action sociale -----------------------------------------------------------------------------------

# matricule, nature, objet, ayant droit, montant, pièces, avis de la commission, urgent, état, jours écoulés
REQUETES = [
    ("418902X", "Évacuation sanitaire", "Hospitalisation d'un enfant en clinique conventionnée", "Enfant (8 ans)", 1_850_000,
     "Certificat médical (conforme)", "Accord favorable sous 24 h", True, "conforme", 2),
    ("455870T", "Frais d'obsèques (ascendant)", "Décès du père de l'agent", "Acte de notoriété légalisé", 1_200_000,
     "Extrait d'acte de décès certifié", "Vérification de la DAAF en cours", False, "commission", 5),
    ("509231M", "Avance à 0 % : rentrée scolaire", "Scolarité de trois enfants", "3 enfants scolarisés", 600_000,
     "Certificats de scolarité (3)", "Quotité cessible vérifiée (18 %)", False, "conforme", 9),
    ("476112P", "Dotation de matériel inclusif", "Écran grossissant et clavier braille", "Agent", 920_000,
     "Avis du médecin du travail", "Approuvé par la commission handicap", False, "conforme", 12),
    ("392104D", "Secours sinistre (inondation)", "Relogement provisoire urgent", "Foyer de l'agent", 1_500_000,
     "Constat d'huissier en attente", "Sous réserve du constat", True, "reserve", 3),
    ("367215R", "Secours décès (conjoint)", "Frais funéraires", "Conjoint", 1_500_000,
     "Acte de décès certifié", "Accord de la commission", False, "mandatee", 30),
]

ACTION_SOCIALE = {
    "entete": {"arrete": "Arrêté MPEEP/CAB/SDAS-019", "synchronisation": "CNAM / CGRAE synchronisés", "satisfaction": 94.2},
    "guichets": [
        {"icone": "church", "titre": "Secours décès & obsèques", "plafond": "Plafond 1 500 000 F", "texte": "Prise en charge des frais mortuaires des agents, conjoints et enfants légaux. Décaissement express.", "consomme": 18_500_000, "dotation": 30_000_000, "pied": "Délai moyen de virement", "valeur": "36 heures"},
        {"icone": "emergency", "titre": "Hospitalisation & évacuation", "plafond": "Plafond 2 500 000 F", "texte": "Accompagnement vers les plateaux techniques du réseau de cliniques conventionnées.", "consomme": 24_800_000, "dotation": 35_000_000, "pied": "Réseau conventionné", "valeur": "14 établissements"},
        {"icone": "backpack", "titre": "Rentrée scolaire des pupilles", "plafond": "150 000 F / enfant", "texte": "Allocation directe aux orphelins des agents décédés en activité.", "consomme": 16_200_000, "dotation": 25_000_000, "pied": "Pupilles indemnisés", "valeur": "108 bénéficiaires"},
        {"icone": "handshake", "titre": "Secours sinistres & cas sociaux", "plafond": "Commission MPEEP", "texte": "Incendies, inondations, invalidité temporaire majeure non couverte par la prévoyance de base.", "consomme": 13_300_000, "dotation": 30_000_000, "pied": "Avis consultatif", "valeur": "Visa DRH requis"},
    ],
    "partenaires": [
        {"organisme": "Banque conventionnée", "badge": "Taux bonifié 4,8 %", "titre": "Prêt accession logement", "texte": "Financement jusqu'à 45 000 000 FCFA sur 20 ans pour la résidence principale.", "gauche": "74 agents bénéficiaires", "droite": "Convention 2024-2027"},
        {"organisme": "CMU / CNAM", "badge": "100 % immatriculés", "titre": "Couverture maladie universelle", "texte": "Enrôlement obligatoire et rattachement des ayants droit (conjoints, enfants jusqu'à 21 ans).", "gauche": "3 890 cartes distribuées", "droite": "Flux mensuel actif"},
        {"organisme": "CGRAE", "badge": "Anticipation 12 mois", "titre": "Passerelle retraite & droits", "texte": "Constitution anticipée des dossiers de pension, sans rupture de traitement au premier mois.", "gauche": "Départs de l'exercice", "droite": "Pré-validés"},
        {"organisme": "Régie MPEEP", "badge": "Taux 0 %", "titre": "Avances & micro-équipements", "texte": "Équipements informatiques et motocycles pour cadres itinérants, remboursés sur solde en 12 à 24 mois.", "gauche": "88 dossiers en cours", "droite": "Disponibilité immédiate"},
    ],
    "medecine": {"couverture": 86, "vus": 4150, "effectif": 4820, "relances": 670, "aptes": 3912, "amenagements": 198, "inaptitudes": 40},
    "handicap": {"agents": 34, "postes": 28, "postes_detail": "Fauteuils orthopédiques, logiciels vocaux pour malvoyants.", "transport": "Navette adaptée pour les agents à mobilité réduite.", "referent": "Dr KOFFI Marc"},
    "retraites": {"seminaire": "Séminaire « Nouvelle vie & retraite active »", "date": "18 avril", "texte": "Ateliers de gestion patrimoniale, santé des seniors et mutuelle complémentaire des retraités."},
    "activites": [
        {"quand": "Août", "lieu": "Assinie & Yamoussoukro", "titre": "Colonie de vacances des pupilles", "texte": "Séjour éducatif et civique pour 120 orphelins du ministère et des sociétés d'État partenaires.", "jauge": "Budget mobilisé : 18 000 000 F", "part": 85},
        {"quand": "Mai - juin", "lieu": "Complexe sportif d'Abidjan", "titre": "Olympiades & tournoi de la fraternité", "texte": "Compétitions sportives (football, basket, cross) réunissant les sociétés d'État du portefeuille.", "jauge": "Inscriptions : 14/16 sociétés", "part": 90},
        {"quand": "Décembre", "lieu": "Abidjan", "titre": "Arbre de Noël du ministère", "texte": "Cadeaux et spectacles pour 1 800 enfants d'agents répertoriés.", "jauge": "Recensement : 1 640 enfants saisis", "part": 91},
    ],
    "ecoute": {"ligne": "800 00 225 (gratuit)", "responsable": "Mme YAO Florence", "horaires": "Du lundi au vendredi (8 h - 17 h)"},
}


def charger_action_sociale(modele) -> None:
    Agent = modele("Agent")
    Prestation = modele("PrestationSociale")
    aujourd_hui = date.today()
    libelles = {"commission": "Avis de la commission attendu", "conforme": "Conforme pour ordonnancement", "reserve": "Pièces manquantes", "mandatee": "Mandatée"}
    Prestation.objects.exclude(etat="").delete()
    for numero, (matricule, nature, objet, ayant, montant, pieces, avis, urgent, etat, jours) in enumerate(REQUETES, start=1):
        agent = Agent.objects.filter(matricule=matricule).first()
        if agent is None:
            continue
        Prestation.objects.create(
            agent=agent, reference=f"SDAS-{aujourd_hui.year}-{800 + numero:04d}", nature=nature, objet=objet, montant=montant,
            date_demande=aujourd_hui - timedelta(days=jours), statut=libelles[etat], etat=etat, ayant_droit=ayant,
            pieces=pieces, avis_commission=avis, urgent=urgent,
        )
    for cle, contenu in ACTION_SOCIALE.items():
        _bloc(modele, "action-sociale", cle, contenu)


# --- Notations : objectifs et critères de chaque évaluation -----------------------------------------

OBJECTIFS = [
    ("Supervision des dossiers de la structure", "Instruction des dossiers dans les délais et qualité des notes de synthèse."),
    ("Réduction des délais d'instruction des actes", "Passer d'un délai moyen de 15 jours à 7 jours ouvrés."),
    ("Mise en œuvre du programme de travail annuel", "Exécution des activités inscrites au plan de travail de la direction."),
    ("Déploiement des outils numériques du service", "Appropriation du SIGRH par les équipes et fiabilité des données saisies."),
    ("Assiduité, déontologie et secret professionnel", "Respect des règles de confidentialité et exemplarité dans le service."),
]
MENTIONS_OBJECTIF = [
    "Maîtrise exemplaire des procédures et des délais",
    "Objectif dépassé, résultats mesurés au-delà de la cible",
    "Conduite rigoureuse et bonne adhésion des équipes",
    "Résultats conformes aux attentes du service",
]
CRITERES = [
    ("Compétence & expertise", "Maîtrise des dossiers techniques de la structure."),
    ("Encadrement & leadership", "Capacité d'animation et sens du collectif."),
    ("Ponctualité & présence effective", "Assiduité constatée sur l'exercice."),
    ("Sens du service public & éthique", "Intégrité et sens de l'intérêt général."),
]
AVIS_DRH = [
    "Avis du supérieur hiérarchique entériné sans réserve.",
    "Avis entériné. Inscription proposée au tableau d'avancement de l'exercice suivant.",
    "Avis entériné, avec recommandation d'une formation de perfectionnement.",
]


def charger_notations(modele) -> None:
    import random
    from datetime import datetime, time

    from django.utils import timezone

    Evaluation = modele("Evaluation")
    Objectif = modele("ObjectifEvaluation")
    Critere = modele("CritereEvaluation")
    Objectif.objects.all().delete()
    Critere.objects.all().delete()

    def borne(valeur: float) -> float:
        return max(10.0, min(20.0, round(valeur * 4) / 4))

    for evaluation in Evaluation.objects.select_related("agent"):
        hasard = random.Random(f"{evaluation.agent.matricule}-{evaluation.annee}")
        note = float(evaluation.note)
        for ordre, ((intitule, description), ponderation) in enumerate(zip(hasard.sample(OBJECTIFS, 4), (30, 25, 25, 20)), start=1):
            valeur = borne(note + hasard.uniform(-0.75, 0.75))
            Objectif.objects.create(
                evaluation=evaluation, ordre=ordre, intitule=intitule, description=description, note=valeur,
                ponderation=ponderation, taux_atteinte=int(min(110, 70 + valeur * 2)), mention=hasard.choice(MENTIONS_OBJECTIF),
            )
        for ordre, (libelle, commentaire) in enumerate(CRITERES, start=1):
            Critere.objects.create(evaluation=evaluation, ordre=ordre, libelle=libelle, note=borne(note + hasard.uniform(-1, 1)), commentaire=commentaire)
        suivante = evaluation.annee + 1
        evaluation.avis_drh = hasard.choice(AVIS_DRH)
        evaluation.vise_le = timezone.make_aware(datetime.combine(date(suivante, 1, 12), time(16, 15)))
        evaluation.notifiee_le = timezone.make_aware(datetime.combine(date(suivante, 1, 14), time(9, 30)))
        evaluation.observation_agent = (
            "Pris connaissance de ma fiche d'évaluation et de ma notation sans réserve."
            if evaluation.statut == "Signée par l'agent" or evaluation.annee < 2025
            else ""
        )
        evaluation.save(update_fields=["avis_drh", "vise_le", "notifiee_le", "observation_agent"])


def charger_tout(modele) -> None:
    """Rechargement complet (seed_demo) : tous les écrans."""
    charger_absences(modele)
    charger_conges(modele)
    charger_discipline(modele)
    charger_fin_carriere(modele)
    charger_action_sociale(modele)
    charger_notations(modele)
