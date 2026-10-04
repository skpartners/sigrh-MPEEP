"""Grades et emplois de la fonction publique de Côte d'Ivoire.

Source : décret n° 2015-432 du 10 juin 2015 portant classification des grades
et emplois dans l'administration de l'État et dans les établissements publics
nationaux, dont l'annexe a été complétée par le décret n° 2020-532 du 24 juin
2020. L'emploi de médecin spécialiste de grade A4 est celui créé par décret en
2022. Les catégories A, B, C et D sont celles du statut général. Les grades A1
et A2 ne figurent plus dans cette grille : ils sont conservés pour les dossiers
déjà classés avant le décret de 2015.
"""

from django.utils.text import slugify

SOURCE = (
    "Décret n° 2015-432 du 10 juin 2015, annexe complétée par le décret n° 2020-532 "
    "du 24 juin 2020. Catégories du statut général de la fonction publique."
)

FAMILLES = (
    ("education", "Éducation et formation"),
    ("scientifique", "Scientifique et technique"),
    ("administratif", "Administratif et juridique"),
    ("financier", "Gestion économique et financière"),
    ("social", "Affaires sociales"),
    ("culturel", "Production littéraire et artistique"),
)

GRADES = (
    ("A7", "A", "Grade terminal de la catégorie A. Fonctions de conception, de direction et de supervision. Accès en général depuis le grade A6, avec six ans et un concours de promotion.", True),
    ("A6", "A", "Grade de chef de la catégorie A. Fonctions de conception et de direction. Accès depuis le grade A5.", True),
    ("A5", "A", "Grade principal de la catégorie A. Accès depuis le grade A4, en général après sept ans et un concours.", True),
    ("A4", "A", "Grade de conception de la catégorie A. Accès avec un master, un diplôme d'ingénieur de conception ou un doctorat d'État, selon l'emploi, puis un concours.", True),
    ("A3", "A", "Premier grade de la catégorie A. Accès avec une licence, un DEUG ou un diplôme d'ingénieur des techniques, selon l'emploi, puis un concours.", True),
    ("B3", "B", "Grade terminal de la catégorie B. Fonctions d'application. Accès en général avec le baccalauréat et un cycle de formation, ou par promotion.", True),
    ("B2", "B", "Grade intermédiaire de la catégorie B. Fonctions d'application.", True),
    ("B1", "B", "Premier grade de la catégorie B. Fonctions d'application. Accès avec un brevet de technicien ou un diplôme équivalent.", True),
    ("C3", "C", "Grade terminal de la catégorie C. Fonctions d'exécution. Accès en général avec le BEPC et une formation spécifique.", True),
    ("C2", "C", "Grade intermédiaire de la catégorie C. Fonctions d'exécution.", True),
    ("C1", "C", "Premier grade de la catégorie C. Fonctions d'exécution. Accès avec le BEPC ou un CAP, selon l'emploi.", True),
    ("D2", "D", "Grade supérieur de la catégorie D. Fonctions d'exécution. Accès avec le CEPE et un concours.", True),
    ("D1", "D", "Premier grade de la catégorie D. Fonctions d'exécution. Accès avec le CEPE et un concours.", True),
    ("A2", "A", "Ancien grade, antérieur au décret n° 2015-432. La grille en vigueur de la catégorie A commence au grade A3.", False),
    ("A1", "A", "Ancien grade, antérieur au décret n° 2015-432. La grille en vigueur de la catégorie A commence au grade A3.", False),
)

SPECIALITES_MEDECIN = (
    "santé publique",
    "imagerie médicale",
    "gynécologie-obstétrique",
    "psychiatrie",
    "pédiatrie",
    "pneumologie",
    "dermatologie",
    "neurologie",
    "ophtalmologie",
    "cardiologie",
    "ORL",
    "stomatologie et chirurgie maxillo-faciale",
    "médecine d'urgence",
    "néphrologie",
    "anesthésie-réanimation",
    "urologie",
    "biologie",
    "nutrition",
    "gastro-entérologie",
)

OPTIONS_SANTE = (
    "préparation et gestion en pharmacie",
    "biologie médicale",
    "hygiène et assainissement",
    "imagerie médicale",
    "biomédicale",
    "économie de la santé",
    "épidémiologie",
    "santé publique",
)

COMPLEMENTS_INGENIEUR = (
    "de l'agriculture",
    "de l'agronomie",
    "des recherches scientifiques",
    "de la construction",
    "des eaux et forêts",
    "du génie rural",
    "de la géologie",
    "de l'environnement",
    "de l'imprimerie",
    "de l'halieutique",
    "de la zootechnie",
    "de l'énergétique",
    "de l'informatique",
    "des médias",
    "des mines",
    "de la statistique et de l'économie",
    "des travaux publics",
    "des transports et de la logistique",
    "de l'électronique",
    "du contrôle qualité",
    "de l'électrotechnique",
    "de l'aviation civile",
)

OPTIONS_FINANCES = (
    "des douanes",
    "des finances générales",
    "des impôts",
    "de la santé",
    "du Trésor",
    "des banques",
    "des assurances",
    "du commerce",
)

OPTIONS_ADMIN = (
    "civil",
    "du travail et des lois sociales",
    "des affaires maritimes et portuaires",
    "des services pénitentiaires",
    "de la communication",
    "des ressources humaines",
)


def _lignes() -> list[tuple[str, str, str]]:
    lignes: list[tuple[str, str, str]] = []

    def ajouter(libelle: str, famille: str, grade: str) -> None:
        lignes.append((libelle, famille, grade))

    def serie(titres: dict[str, str], famille: str, complements: tuple[str, ...]) -> None:
        for grade, titre in titres.items():
            for complement in complements:
                ajouter(f"{titre} {complement}".replace("  ", " "), famille, grade)

    ajouter("Professeur d'université", "education", "A7")
    ajouter("Professeur de l'enseignement supérieur technique et professionnel", "education", "A7")
    for option in (
        "de l'éducation et de la formation",
        "de l'enseignement artistique et culturel",
        "de l'enseignement technique et de la formation professionnelle",
    ):
        ajouter(f"Inspecteur général {option}", "education", "A7")
    ajouter("Maître de conférences", "education", "A6")
    ajouter("Maître de conférences de l'enseignement supérieur technique et professionnel", "education", "A6")
    for option in (
        "de l'éducation et de la formation",
        "de l'enseignement artistique et culturel",
        "de l'enseignement technique et de la formation professionnelle",
        "de la jeunesse et des sports",
    ):
        ajouter(f"Inspecteur en chef {option}", "education", "A6")
    ajouter("Maître-assistant", "education", "A5")
    ajouter("Maître-assistant de l'enseignement supérieur technique et professionnel", "education", "A5")
    for option in (
        "de l'éducation, de l'enseignement préscolaire et primaire",
        "de l'enseignement artistique et culturel",
        "de l'enseignement technique et de la formation professionnelle",
        "de la jeunesse et des sports",
    ):
        ajouter(f"Inspecteur principal {option}", "education", "A5")
    ajouter("Inspecteur pédagogique principal", "education", "A5")
    for option in (
        "d'éducation permanente",
        "d'éducation physique et sportive",
        "d'enseignement préscolaire",
        "d'enseignement général",
        "d'enseignement technique et de formation professionnelle",
        "de sport",
    ):
        ajouter(f"Professeur agrégé {option}", "education", "A5")
    ajouter("Assistant de l'enseignement supérieur", "education", "A4")
    for option in (
        "d'éducation permanente",
        "d'éducation physique et sportive",
        "d'enseignement général",
        "d'enseignement technique et de formation professionnelle",
        "de sport",
        "d'enseignement artistique et culturel",
    ):
        ajouter(f"Professeur de lycée {option}", "education", "A4")
    ajouter("Inspecteur pédagogique", "education", "A4")
    ajouter("Inspecteur de l'éducation", "education", "A4")
    for option in (
        "d'éducation physique et sportive",
        "d'enseignement artistique et culturel",
        "d'enseignement général",
        "d'enseignement technique et de formation professionnelle",
    ):
        ajouter(f"Professeur de collège {option}", "education", "A3")
    for option in (
        "d'animation sportive",
        "d'éducation permanente",
        "d'éducation préscolaire et primaire",
        "d'éducation physique et sportive",
        "extrascolaire",
        "pédagogique du préscolaire et du primaire",
    ):
        ajouter(f"Conseiller {option}", "education", "A3")
    ajouter("Éducateur", "education", "A3")
    ajouter("Professeur de CAFOP", "education", "A3")
    for libelle in (
        "Instituteur",
        "Animateur sportif",
        "Éducateur préscolaire",
        "Instructeur de formation professionnelle de base",
        "Maître d'éducation permanente",
        "Maître d'éducation physique et sportive",
    ):
        ajouter(libelle, "education", "B3")
    for libelle in (
        "Éducateur préscolaire adjoint",
        "Instructeur adjoint de formation professionnelle de base",
        "Instituteur adjoint",
        "Maître adjoint d'éducation permanente",
        "Maître adjoint d'éducation physique et sportive",
    ):
        ajouter(libelle, "education", "C3")

    ajouter("Directeur de recherche", "scientifique", "A7")
    serie(
        {"A7": "Ingénieur général", "A6": "Ingénieur en chef", "A5": "Ingénieur principal", "A4": "Ingénieur"},
        "scientifique",
        COMPLEMENTS_INGENIEUR,
    )
    serie(
        {"A3": "Ingénieur des techniques"},
        "scientifique",
        tuple(item for item in COMPLEMENTS_INGENIEUR if item != "de l'imprimerie"),
    )
    ajouter("Ingénieur des techniques d'imprimerie", "scientifique", "A3")
    for grade, titre in (("A7", "général"), ("A6", "en chef"), ("A5", "principal")):
        ajouter(f"Architecte {titre}".replace("général", "d'État") if grade == "A7" else f"Architecte {titre}", "scientifique", grade)
        ajouter(f"Urbaniste {titre}".replace("général", "d'État") if grade == "A7" else f"Urbaniste {titre}", "scientifique", grade)
        ajouter(f"Démographe {titre}", "scientifique", grade)
        ajouter(f"Vétérinaire {titre}".replace("général", "d'État") if grade == "A7" else f"Vétérinaire {titre}", "scientifique", grade)
    ajouter("Architecte", "scientifique", "A4")
    ajouter("Urbaniste", "scientifique", "A4")
    ajouter("Démographe", "scientifique", "A4")
    ajouter("Vétérinaire", "scientifique", "A4")
    ajouter("Urbaniste assistant", "scientifique", "A3")
    ajouter("Démographe assistant", "scientifique", "A3")
    ajouter("Contrôleur général de la protection civile", "scientifique", "A7")
    ajouter("Maître de recherches", "scientifique", "A6")
    ajouter("Chargé de recherche", "scientifique", "A5")
    ajouter("Attaché de recherche", "scientifique", "A4")
    ajouter("Chef de site de 1re classe", "scientifique", "A6")
    ajouter("Chef de site de 2e classe", "scientifique", "A5")
    ajouter("Chef de colonne de 1re classe", "scientifique", "A4")
    ajouter("Chef de colonne de 2e classe", "scientifique", "A3")
    for grade, titre in (("A7", "général"), ("A6", "en chef"), ("A5", "principal"), ("A4", "généraliste")):
        ajouter(f"Médecin {titre}", "scientifique", grade)
        if grade != "A4":
            for specialite in SPECIALITES_MEDECIN:
                ajouter(f"Médecin {titre} spécialiste en {specialite}", "scientifique", grade)
        ajouter(f"Pharmacien {titre}", "scientifique", grade)
        ajouter(f"Chirurgien-dentiste {titre}", "scientifique", grade)
    ajouter("Médecin spécialiste", "scientifique", "A4")
    for specialite in ("biologie", "santé publique", "pharmacie clinique"):
        for grade, titre in (("A7", "général"), ("A6", "en chef"), ("A5", "principal")):
            ajouter(f"Pharmacien {titre} spécialisé en {specialite}", "scientifique", grade)
    for grade, titre in (("A7", "général"), ("A6", "en chef"), ("A5", "principal")):
        ajouter(f"Chirurgien-dentiste {titre} spécialiste en santé publique", "scientifique", grade)
        for option in OPTIONS_SANTE:
            ajouter(f"Ingénieur {titre} des services de santé en {option}", "scientifique", grade)
    for option in OPTIONS_SANTE:
        ajouter(f"Ingénieur des services de santé en {option}", "scientifique", "A4")
        if option not in ("économie de la santé", "épidémiologie", "santé publique"):
            ajouter(f"Ingénieur des techniques sanitaires en {option}", "scientifique", "A3")
            ajouter(f"Technicien supérieur de la santé en {option}", "scientifique", "B3")
    ajouter("Inspecteur général de soins infirmiers", "scientifique", "A7")
    ajouter("Inspecteur en chef de soins infirmiers", "scientifique", "A6")
    ajouter("Inspecteur principal de soins infirmiers", "scientifique", "A5")
    ajouter("Inspecteur de soins infirmiers", "scientifique", "A4")
    for option in (
        "anesthésie-réanimation",
        "ophtalmologie",
        "ORL",
        "dermato-léprologie",
        "instrumentation",
        "psychiatrie",
        "cardiologie",
    ):
        ajouter(f"Infirmier spécialiste en {option}", "scientifique", "A3")
    ajouter("Puériculteur", "scientifique", "A3")
    ajouter("Surveillant d'unité de soins", "scientifique", "A3")
    for libelle in (
        "Technicien supérieur de recherche scientifique",
        "Technicien supérieur de chimie",
        "Technicien supérieur des transports et de la logistique",
        "Technicien supérieur d'électronique",
        "Technicien supérieur de l'aviation civile",
        "Technicien supérieur des travaux publics",
        "Technicien supérieur d'informatique",
        "Technicien supérieur d'imprimerie",
        "Adjoint technique de la statistique",
        "Assistant des productions végétales et animales",
        "Contrôleur des techniques des médias",
        "Technicien supérieur de l'environnement",
        "Technicien supérieur du contrôle qualité",
        "Technicien supérieur d'électrotechnique",
        "Chef de garde de 2e classe",
        "Infirmier diplômé d'État",
        "Sage-femme diplômée d'État",
        "Maïeuticien diplômé d'État",
        "Diététicien",
        "Assistant dentaire",
    ):
        ajouter(libelle, "scientifique", "B3")
    ajouter("Aide-géologue", "scientifique", "B2")
    ajouter("Prospecteur et adjoint technique des mines", "scientifique", "B2")
    ajouter("Chef d'agrès de 1re classe", "scientifique", "B2")
    ajouter("Technicien des travaux publics", "scientifique", "B1")
    ajouter("Technicien de l'informatique", "scientifique", "B1")
    ajouter("Chef d'agrès de 2e classe", "scientifique", "B1")
    for libelle in (
        "Opérateur technique des médias",
        "Agent servant",
        "Agent technique d'imprimerie",
        "Auxiliaire de soins infirmiers",
        "Auxiliaire de soins obstétricaux",
        "Auxiliaire des techniques sanitaires en pharmacie",
        "Auxiliaire des techniques sanitaires de laboratoire",
        "Auxiliaire des techniques sanitaires d'hygiène et d'assainissement",
        "Auxiliaire des techniques sanitaires d'imagerie médicale",
    ):
        ajouter(libelle, "scientifique", "C3")
    for libelle in (
        "Agent de maîtrise des travaux publics",
        "Agent technique de la statistique",
        "Aide-conducteur d'agriculture",
        "Moniteur des productions végétales et animales",
        "Prospecteur adjoint et contremaître de la géologie et des mines",
        "Agent technique de l'informatique",
    ):
        ajouter(libelle, "scientifique", "C2")
    for libelle in ("Dessinateur", "Aide-soignant", "Agent d'hygiène spécialisé"):
        ajouter(libelle, "scientifique", "C1")
    ajouter("Moniteur de la géologie et des mines", "scientifique", "D2")
    for libelle in (
        "Commis de la statistique",
        "Aide-dessinateur",
        "Moniteur adjoint d'agriculture",
        "Préposé des eaux et forêts",
        "Agent spécialisé des travaux publics",
        "Agent d'hygiène",
    ):
        ajouter(libelle, "scientifique", "D1")

    serie(
        {"A7": "Administrateur général", "A6": "Administrateur en chef", "A5": "Administrateur principal", "A4": "Administrateur"},
        "administratif",
        OPTIONS_ADMIN,
    )
    for option, grade_titre in (
        ("administratif", "Attaché"),
        ("du travail et des affaires sociales", "Attaché"),
        ("des affaires maritimes et portuaires", "Attaché"),
        ("des ressources humaines", "Attaché"),
        ("des services pénitentiaires", "Attaché"),
        ("de communication", "Attaché"),
    ):
        ajouter(f"{grade_titre} {option}", "administratif", "A3")
    ajouter("Attaché de direction", "administratif", "A3")
    for libelle in (
        "Secrétaire administratif",
        "Secrétaire des ressources humaines",
        "Contrôleur des affaires maritimes et portuaires",
        "Contrôleur du travail",
        "Secrétaire de direction",
        "Secrétaire médical",
        "Technicien supérieur de la communication",
        "Contrôleur des établissements pénitentiaires",
    ):
        ajouter(libelle, "administratif", "B3")
    for libelle in (
        "Secrétaire assistant administratif",
        "Secrétaire assistant de direction",
        "Secrétaire assistant comptable",
    ):
        ajouter(libelle, "administratif", "B1")
    ajouter("Agent de police de navigation, des pêches et des ports", "administratif", "C3")
    ajouter("Agent d'encadrement des établissements pénitentiaires", "administratif", "C3")
    ajouter("Secrétaire comptable", "administratif", "C2")
    ajouter("Adjoint administratif", "administratif", "C1")
    for libelle in (
        "Agent de bureau",
        "Préposé interministériel",
        "Huissier",
        "Agent de sûreté",
        "Garde de sous-préfecture",
    ):
        ajouter(libelle, "administratif", "D1")

    serie(
        {
            "A7": "Administrateur général des services financiers",
            "A6": "Administrateur en chef des services financiers",
            "A5": "Administrateur principal des services financiers",
            "A4": "Administrateur des services financiers",
        },
        "financier",
        OPTIONS_FINANCES,
    )
    for libelle in (
        "Attaché des finances",
        "Inspecteur des douanes",
        "Inspecteur des impôts",
        "Inspecteur du Trésor",
        "Inspecteur des assurances",
        "Inspecteur du commerce",
        "Inspecteur des banques",
    ):
        ajouter(libelle, "financier", "A3")
    for libelle in (
        "Contrôleur des douanes",
        "Contrôleur des impôts",
        "Contrôleur du Trésor",
        "Contrôleur du commerce",
        "Contrôleur des assurances",
        "Contrôleur des banques",
        "Secrétaire des finances",
        "Technicien supérieur du commerce",
        "Assistant comptable",
    ):
        ajouter(libelle, "financier", "B3")
    ajouter("Secrétaire assistant des finances", "financier", "B1")
    for libelle in (
        "Agent d'encadrement des douanes",
        "Agent de constatation des impôts",
        "Commis des finances",
        "Commis du Trésor",
    ):
        ajouter(libelle, "financier", "C1")
    ajouter("Préposé des douanes", "financier", "D1")
    ajouter("Garde-frontière et matelot des douanes", "financier", "D1")

    ajouter("Administrateur général social", "social", "A7")
    ajouter("Administrateur en chef social", "social", "A6")
    ajouter("Administrateur principal social", "social", "A5")
    ajouter("Administrateur social", "social", "A4")
    for grade, titre in (("A7", "général"), ("A6", "en chef"), ("A5", "principal"), ("A4", "")):
        for option in ("de l'éducation surveillée", "de l'éducation spécialisée", "de l'orientation"):
            ajouter(f"Inspecteur {titre} {option}".replace("  ", " "), "social", grade)
    for libelle in ("Éducateur spécialisé", "Conseiller d'orientation", "Conseiller d'éducation surveillée", "Attaché social"):
        ajouter(libelle, "social", "A3")
    for libelle in ("Maître d'éducation surveillée", "Maître d'éducation spécialisée", "Assistant social"):
        ajouter(libelle, "social", "B3")
    ajouter("Assistant social adjoint", "social", "C3")
    ajouter("Auxiliaire social", "social", "D1")

    for grade, titre in (("A7", "d'État"), ("A6", "en chef"), ("A5", "principal"), ("A4", "")):
        ajouter(f"Journaliste {titre}".strip(), "culturel", grade)
        ajouter(f"Producteur {titre}".strip(), "culturel", grade)
        for option in ("des archives", "des bibliothèques", "des musées"):
            ajouter(f"Conservateur {titre} {option}".replace("  ", " "), "culturel", grade)
        ajouter(f"Conseiller {titre} d'action culturelle".replace("  ", " "), "culturel", grade)
        ajouter(f"Documentaliste {titre}".strip(), "culturel", grade)
        ajouter(f"Conseiller {titre} du tourisme".replace("  ", " "), "culturel", grade)
    for libelle in (
        "Chargé de rédaction",
        "Chargé de production",
        "Assistant conservateur de musée",
        "Assistant conservateur des archives",
        "Assistant conservateur de bibliothèque",
        "Assistant de documentation",
        "Conseiller adjoint d'action culturelle",
        "Conseiller adjoint du tourisme",
    ):
        ajouter(libelle, "culturel", "A3")
    for libelle in (
        "Archiviste",
        "Bibliothécaire",
        "Assistant-documentaliste",
        "Technicien de musée",
        "Animateur culturel",
        "Assistant de production",
        "Technicien supérieur du tourisme",
    ):
        ajouter(libelle, "culturel", "B3")
    ajouter("Technicien du tourisme", "culturel", "B1")
    ajouter("Aide-assistant de production", "culturel", "C3")
    ajouter("Adjoint technique du tourisme", "culturel", "C2")
    return lignes


def emplois() -> list[tuple[str, str, str, str]]:
    """(code, libellé, famille, grade), sans doublon."""
    vus: dict[str, tuple[str, str, str]] = {}
    for libelle, famille, grade in _lignes():
        propre = " ".join(libelle.split())
        if propre.casefold() in {valeur[0].casefold() for valeur in vus.values()}:
            continue
        base = (slugify(propre) or "emploi")[:90].strip("-")
        code = base
        rang = 2
        while code in vus:
            suffixe = f"-{rang}"
            code = f"{base[:90 - len(suffixe)].strip('-')}{suffixe}"
            rang += 1
        vus[code] = (propre, famille, grade)
    return [(code, *valeur) for code, valeur in vus.items()]


def charger(grade_model, emploi_model) -> None:
    grades = {}
    for ordre, (code, categorie, libelle, vigueur) in enumerate(GRADES, start=1):
        grade, _ = grade_model.objects.update_or_create(
            code=code,
            defaults={"categorie": categorie, "libelle": libelle, "ordre": ordre, "en_vigueur": vigueur},
        )
        grades[code] = grade
    for ordre, (code, libelle, famille, grade_code) in enumerate(emplois(), start=1):
        emploi_model.objects.update_or_create(
            code=code,
            defaults={"libelle": libelle, "famille": famille, "grade": grades[grade_code], "ordre": ordre},
        )
