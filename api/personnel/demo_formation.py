"""Données de démonstration de la sous-direction de la formation continue.

Appelé par la migration de données (base existante) et par seed_demo (rechargement complet).
`modele(nom)` renvoie la classe du modèle : apps.get_model dans une migration, l'import direct ailleurs.
Les dates sont relatives au jour du chargement, pour que chaque état (à venir, en cours, terminé)
reste représenté. Prestataires et formateurs sont fictifs.
"""

from datetime import date, timedelta

PLAN = {"annee": 2026, "dotation": 120_000_000, "objectif_agents": 60}

PRESTATAIRES = [
    # nom, catégorie, spécialités, ville, contact, téléphone, début convention (jours), fin (jours), actif
    ("Centre de perfectionnement des cadres de l'administration", "ecole", "Management public, pilotage, préparation aux concours", "Abidjan-Plateau", "Mme Aya KOUAMÉ", "+225 27 20 31 44 10", -640, 450, True),
    ("Institut supérieur de gestion publique", "institut", "Contrôle de gestion, finances publiques, audit interne", "Yamoussoukro", "M. Lacina DIOMANDÉ", "+225 27 30 64 12 08", -270, 820, True),
    ("Cabinet Performance & Données", "cabinet", "Analyse de données, tableaux de bord, conduite du changement", "Abidjan-Cocody", "M. Serge ABOA", "+225 07 08 41 22 63", -280, 90, True),
    ("Pool des formateurs internes du ministère", "interne", "Prise de fonction, procédures administratives, déontologie", "Abidjan-Plateau", "Sous-direction de la formation continue", "+225 27 20 25 41 70", None, None, True),
    ("Institut régional des métiers de l'audit", "institut", "Audit des marchés publics", "Bouaké", "M. Daniel KOFFI", "+225 27 31 63 02 11", -900, -170, False),
]

# code du module : (prestataire, lieu, formateur, début, fin (jours), heures, places, coût, ouverte, clôturé depuis (jours))
PLANIFICATION = {
    "prep-admin": (0, "Salle de conférence, Plateau", "M. Bertrand YAPO", 20, 60, 120, 30, 450_000, True, None),
    "prep-redacteur": (0, "Salle de conférence, Plateau", "Mme Clarisse N'GORAN", 35, 65, 80, 25, 300_000, True, None),
    "carr-fonction": (3, "Immeuble SCIAM, 16e étage", "Formateurs internes", -3, 2, 24, 15, 150_000, False, None),
    "carr-admis": (3, "Immeuble SCIAM, 16e étage", "Formateurs internes", 50, 54, 30, 20, 200_000, False, None),
    "categ-corps": (0, "Centre de perfectionnement, Plateau", "M. Bertrand YAPO", -60, -55, 35, 20, 250_000, False, 50),
    "perf-pilotage": (1, "Campus de Yamoussoukro", "Dr Mariam SANOGO", 14, 18, 35, 20, 650_000, True, None),
    "perf-donnees": (2, "Cocody, Abidjan", "M. Serge ABOA", -40, -36, 30, 15, 500_000, False, 30),
    "spec-controle": (1, "", "", None, None, 60, 20, 900_000, False, None),
}

# matricule, module, état (2, 3, 4, « retenue », « refusee »), présent, note, motif, déposée (jours)
CANDIDATURES = [
    ("340188P", "categ-corps", "retenue", True, 5, "", -80),
    ("523406L", "categ-corps", "retenue", True, 4, "", -79),
    ("476112P", "categ-corps", "retenue", False, None, "", -78),
    ("394812H", "perf-donnees", "retenue", True, 4, "", -55),
    ("367215R", "perf-donnees", "retenue", True, 5, "", -54),
    ("455870T", "carr-fonction", "retenue", None, None, "", -20),
    ("349812K", "carr-fonction", "retenue", True, None, "", -19),
    ("318490K", "perf-pilotage", 3, None, None, "", -6),
    ("411904C", "perf-pilotage", 3, None, None, "", -5),
    ("289043B", "perf-pilotage", 4, None, None, "", -8),
    ("402771K", "perf-pilotage", 2, None, None, "", -2),
    ("509231M", "prep-admin", 3, None, None, "", -4),
    ("418902X", "prep-admin", 2, None, None, "", -1),
    ("392104D", "prep-redacteur", "refusee", None, None, "Conditions d'ancienneté dans le grade non remplies.", -9),
]

# structure, cycle, besoin, effectif, priorité, statut, module couvrant
BESOINS = [
    ("dgpe", "PREP", "Préparation au concours d'administrateur civil", 18, "haute", "couvert", "prep-admin"),
    ("dgpe", "PERF", "Pilotage par les indicateurs de performance", 12, "haute", "couvert", "perf-pilotage"),
    ("petroci", "SPEC", "Contrôle de gestion des filiales", 8, "haute", "retenu", None),
    ("ci-energies", "PERF", "Management des équipes d'exploitation", 9, "haute", "exprime", None),
    ("sndi", "PERF", "Analyse de données et tableaux de bord", 10, "moyenne", "couvert", "perf-donnees"),
    ("sogepie", "CARR", "Prise de fonction des chefs de service", 6, "moyenne", "couvert", "carr-fonction"),
    ("paa", "PREP", "Préparation au concours de rédacteur", 14, "moyenne", "couvert", "prep-redacteur"),
    ("ansut", "CATEG", "Fondamentaux du corps des attachés", 4, "basse", "couvert", "categ-corps"),
    ("bnetd", "SPEC", "Audit des marchés de travaux", 5, "basse", "exprime", None),
]

ETAPES = {
    2: ("Étape 2 : chef de service", "Avis hiérarchique attendu", "J-3 avant relance"),
    3: ("Étape 3 : SD Formation Continue", "Contrôle de la direction de la formation continue", "Dans les délais"),
    4: ("Étape 4 : signature DRH", "Visa du directeur des ressources humaines", "Priorité courante"),
    "retenue": ("Étape 5 : notifiée", "Prise en compte notifiée à l'agent", "Clôturée"),
}


def charger(modele, aujourd_hui: date | None = None) -> None:
    aujourd_hui = aujourd_hui or date.today()
    jour = lambda n: aujourd_hui + timedelta(days=n) if n is not None else None  # noqa: E731

    modele("PlanFormation").objects.update_or_create(annee=PLAN["annee"], defaults=PLAN)

    Prestataire = modele("Prestataire")
    prestataires = []
    for nom, categorie, specialites, ville, contact, telephone, debut, fin, actif in PRESTATAIRES:
        item, _ = Prestataire.objects.update_or_create(
            nom=nom,
            defaults={
                "categorie": categorie, "specialites": specialites, "ville": ville, "contact_nom": contact,
                "contact_telephone": telephone, "convention_debut": jour(debut), "convention_fin": jour(fin), "actif": actif,
            },
        )
        prestataires.append(item)

    SessionFormation = modele("SessionFormation")
    sessions = {}
    for code, (p, lieu, formateur, debut, fin, heures, places, cout, ouverte, cloture) in PLANIFICATION.items():
        session = SessionFormation.objects.filter(code=code).first()
        if session is None:
            continue
        session.prestataire = prestataires[p]
        session.lieu, session.formateur = lieu, formateur
        session.date_debut, session.date_fin = jour(debut), jour(fin)
        session.heures, session.places, session.cout_participant = heures, places, cout
        session.ouverte = ouverte
        session.ouverte_le = jour(-30) if ouverte else session.ouverte_le
        session.annulee, session.motif_annulation = False, ""
        session.cloturee_le = jour(-cloture) if cloture else None
        session.save()
        sessions[code] = session

    _candidatures(modele, sessions, prestataires, jour)

    Organisme, TypeFormation, BesoinFormation = modele("Organisme"), modele("TypeFormation"), modele("BesoinFormation")
    BesoinFormation.objects.filter(annee=PLAN["annee"]).delete()
    for index, (org, cycle, intitule, effectif, priorite, statut, module) in enumerate(BESOINS):
        organisme = Organisme.objects.filter(code=org).first()
        type_formation = TypeFormation.objects.filter(code=cycle).first()
        if organisme is None or type_formation is None:
            continue
        BesoinFormation.objects.create(
            annee=PLAN["annee"], organisme=organisme, type_formation=type_formation, intitule=intitule, effectif=effectif,
            priorite=priorite, statut=statut, session=sessions.get(module), exprime_le=jour(-120 + index * 5),
        )


def _candidatures(modele, sessions, prestataires, jour) -> None:
    Agent, Demande, VisaDemande = modele("Agent"), modele("Demande"), modele("VisaDemande")
    InscriptionFormation, Formation = modele("InscriptionFormation"), modele("Formation")
    for numero, (matricule, code, etat, present, note, motif, depose) in enumerate(CANDIDATURES, start=901):
        agent, session = Agent.objects.filter(matricule=matricule).first(), sessions.get(code)
        if agent is None or session is None:
            continue
        reference = f"DM-2026-{numero:04d}"
        Demande.objects.filter(reference=reference).delete()
        etape = ("Rejetée : SD Formation Continue", motif, "Clôturée") if etat == "refusee" else ETAPES[etat]
        demande = Demande.objects.create(
            reference=reference, agent=agent, nature=session.libelle, icone="school", etape=etape[0], responsable=etape[1],
            echeance=etape[2], depose_le=jour(depose), categorie="formation",
        )
        InscriptionFormation.objects.create(demande=demande, session=session, present=present, note_satisfaction=note)
        rang = 5 if etat == "retenue" else 3 if etat == "refusee" else etat
        visas = [
            (1, "Requête déposée", agent.nom + " " + agent.prenoms, "Agent", "Déposée", "Inscription déposée par l'agent.", jour(depose)),
            (2, "Visa du chef de service", "", "Supérieur hiérarchique", "Favorable" if rang > 2 else "En attente", "Avis favorable." if rang > 2 else "", jour(depose + 1) if rang > 2 else None),
            (3, "Direction de la formation continue", "", "Sous-direction de la formation continue",
             "Défavorable" if etat == "refusee" else "Favorable" if rang > 3 else "En attente", motif or ("Étape validée." if rang > 3 else ""), jour(depose + 2) if rang > 3 or etat == "refusee" else None),
            (4, "Visa DRH", "", "Direction des Ressources Humaines", "Favorable" if etat == "retenue" else "Sans objet" if etat == "refusee" else "En attente", "", jour(depose + 3) if etat == "retenue" else None),
            (5, "Notification à l'agent", "", "Prise en compte", "Notifiée" if etat == "retenue" else "Sans objet" if etat == "refusee" else "En attente", "", jour(depose + 3) if etat == "retenue" else None),
        ]
        VisaDemande.objects.bulk_create(
            [VisaDemande(demande=demande, ordre=o, instance=i, titulaire=t, fonction=f, avis=a, commentaire=c, date=d) for o, i, t, f, a, c, d in visas]
        )
        # Module terminé : la formation suivie figure déjà dans le dossier de l'agent présent.
        if session.cloturee_le and present:
            Formation.objects.get_or_create(
                agent=agent, intitule=session.libelle,
                defaults={
                    "organisme": session.prestataire.nom if session.prestataire else "Direction de la formation continue",
                    "debut": session.date_debut, "fin": session.date_fin, "heures": session.heures, "statut": "Terminée",
                    "certification": f"Attestation de formation {session.code.upper()}",
                },
            )
