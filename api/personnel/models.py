from django.contrib.auth.models import User
from django.db import models


class Organisme(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    nom = models.CharField(max_length=220)
    sigle = models.CharField(max_length=40, blank=True)
    quorum_presence = models.PositiveSmallIntegerField(default=65)

    class Meta:
        ordering = ["nom"]
        verbose_name = "organisme"

    def __str__(self) -> str:
        return self.sigle or self.nom


class Profil(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profil")
    fonction = models.CharField(max_length=160)
    role = models.CharField(max_length=80, default="Agent")
    organisme = models.ForeignKey(Organisme, on_delete=models.PROTECT, related_name="profils")
    structure = models.ForeignKey(
        "EntiteTutelle", null=True, blank=True, on_delete=models.PROTECT, related_name="comptes",
    )
    superieur = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.PROTECT, related_name="subordonnes",
    )
    # Poste dont ce compte assure pleinement les fonctions : en l'absence du titulaire, ou si le poste n'est pas désigné.
    interim = models.ForeignKey(
        "EntiteTutelle", null=True, blank=True, on_delete=models.PROTECT, related_name="interimaires",
    )
    # Null : les droits du rôle s'appliquent. Une liste : délégation propre à ce compte.
    habilitations = models.JSONField(null=True, blank=True)
    # Exceptions par fonction, seulement si les habilitations sont personnalisées.
    precisions = models.JSONField(null=True, blank=True)
    signature = models.FileField(upload_to="signatures/%Y/%m", blank=True)

    def __str__(self) -> str:
        return self.user.get_full_name() or self.user.username


class Agent(models.Model):
    matricule = models.CharField(max_length=32, unique=True)
    nom = models.CharField(max_length=80)
    prenoms = models.CharField(max_length=120)
    initiales = models.CharField(max_length=4)
    corps = models.CharField(max_length=180)
    grade = models.CharField(max_length=40)
    echelon = models.CharField(max_length=20)
    indice = models.PositiveIntegerField(default=0)
    structure = models.CharField(max_length=240)
    direction = models.CharField(max_length=240, blank=True)
    sous_direction = models.CharField(max_length=240, blank=True)
    service = models.CharField(max_length=240, blank=True)
    emploi = models.CharField(max_length=240, blank=True)
    type_agent = models.CharField(max_length=80, blank=True)
    mode_recrutement = models.CharField(max_length=120, blank=True)
    fonction = models.CharField(max_length=180, blank=True)
    organisme = models.ForeignKey(Organisme, on_delete=models.PROTECT, related_name="agents")
    situation = models.CharField(max_length=80, default="En activité")
    anciennete = models.CharField(max_length=80, blank=True)
    prise_service = models.CharField(max_length=40, blank=True)
    prise_service_ministere = models.DateField(null=True, blank=True)
    prise_service_emploi = models.DateField(null=True, blank=True)
    prise_service_fonction = models.DateField(null=True, blank=True)
    visite_medicale = models.CharField(max_length=160, blank=True)
    affiliation_cgrae = models.CharField(max_length=160, blank=True)
    conges_acquis = models.PositiveSmallIntegerField(default=30)
    conges_consommes = models.PositiveSmallIntegerField(default=0)
    report_conges = models.PositiveSmallIntegerField(default=0)
    autorisations_acquises = models.PositiveSmallIntegerField(default=10)
    categorie = models.CharField(max_length=40, blank=True)
    sexe = models.CharField(max_length=1, choices=[("H", "Homme"), ("F", "Femme")], default="H")
    date_naissance = models.DateField(null=True, blank=True)
    telephone = models.CharField(max_length=40, blank=True)
    courriel = models.EmailField(blank=True)
    localisation = models.CharField(max_length=200, blank=True)
    habilitation = models.CharField(max_length=80, blank=True)
    photo = models.FileField(upload_to="portraits/%Y/%m", blank=True)

    class Meta:
        ordering = ["nom", "prenoms"]

    def __str__(self) -> str:
        return f"{self.nom} {self.prenoms}"

    @property
    def nom_complet(self) -> str:
        return f"{self.nom} {self.prenoms}".strip()

    @property
    def reliquat_conges(self) -> int:
        return self.conges_acquis - self.conges_consommes


class Acte(models.Model):
    class Domaine(models.TextChoices):
        CARRIERE = "carriere", "Carrière"
        SOCIAL = "social", "Action sociale"
        FORMATION = "formation", "Formation"
        CONGE = "conge", "Congé"

    class Statut(models.TextChoices):
        VALIDE = "valide", "Validé"
        ACCORDE = "accorde", "Accord acquis — papier à en-tête à établir"
        INSTRUCTION = "instruction", "En instruction"
        COMPLEMENT = "complement", "Complément requis"
        REJETE = "rejete", "Rejeté"

    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="actes")
    reference = models.CharField(max_length=80)
    nature = models.CharField(max_length=120)
    titre = models.CharField(max_length=240)
    resume = models.TextField(blank=True)
    domaine = models.CharField(max_length=20, choices=Domaine.choices)
    statut = models.CharField(max_length=20, choices=Statut.choices)
    date_effet = models.DateField(null=True, blank=True)
    date_enregistrement = models.DateField()
    signataire = models.CharField(max_length=180, blank=True)
    publie = models.BooleanField(default=False)
    scan = models.FileField(upload_to="entetes/%Y/%m", blank=True)

    class Meta:
        ordering = ["-date_enregistrement", "-id"]


class VisaEnAttente(models.Model):
    class Statut(models.TextChoices):
        EN_ATTENTE = "en_attente", "En attente"
        VISE = "vise", "Visé"
        COMPLEMENT = "complement", "Complément demandé"

    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="visas")
    acte = models.ForeignKey("Acte", on_delete=models.SET_NULL, null=True, blank=True, related_name="visas_drh")
    objet = models.CharField(max_length=280)
    echeance = models.CharField(max_length=120)
    visa_amont = models.CharField(max_length=180)
    categorie = models.CharField(max_length=40)
    urgent = models.BooleanField(default=False)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.EN_ATTENTE)
    traite_le = models.DateTimeField(null=True, blank=True)
    signature = models.FileField(upload_to="visas/%Y/%m", blank=True)

    class Meta:
        ordering = ["id"]


class LigneAvancement(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="avancements")
    emploi = models.CharField(max_length=180)
    structure = models.CharField(max_length=200)
    grade_echelon = models.CharField(max_length=80)
    anciennete = models.CharField(max_length=80)
    proposition = models.CharField(max_length=80)
    mode = models.CharField(max_length=80)
    note = models.CharField(max_length=16)
    avis = models.CharField(max_length=80)
    statut = models.CharField(max_length=80)

    class Meta:
        ordering = ["id"]


class EtapeCircuit(models.Model):
    ordre = models.PositiveSmallIntegerField(unique=True)
    titre = models.CharField(max_length=80)
    compteur = models.CharField(max_length=16)
    detail = models.CharField(max_length=80)

    class Meta:
        ordering = ["ordre"]


class ParcoursEtape(models.Model):
    ordre = models.PositiveSmallIntegerField(unique=True)
    acteur = models.CharField(max_length=80)
    titre = models.CharField(max_length=120)
    texte = models.TextField()
    metas = models.JSONField(default=list)

    class Meta:
        ordering = ["ordre"]


class Demande(models.Model):
    reference = models.CharField(max_length=32, unique=True)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="demandes")
    nature = models.CharField(max_length=140)
    icone = models.CharField(max_length=40, default="edit_note")
    etape = models.CharField(max_length=140)
    responsable = models.CharField(max_length=140)
    echeance = models.CharField(max_length=80)
    depose_le = models.DateField()
    categorie = models.CharField(max_length=40)

    class Meta:
        ordering = ["-depose_le"]


class VisaDemande(models.Model):
    """Visa d'une étape du circuit, avec le commentaire laissé par la hiérarchie."""

    demande = models.ForeignKey(Demande, on_delete=models.CASCADE, related_name="visas")
    ordre = models.PositiveSmallIntegerField()
    instance = models.CharField(max_length=120)
    titulaire = models.CharField(max_length=120, blank=True)
    fonction = models.CharField(max_length=160, blank=True)
    avis = models.CharField(max_length=40)
    commentaire = models.TextField(blank=True)
    date = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=80, blank=True)
    signature = models.FileField(upload_to="visas/%Y/%m", blank=True)

    class Meta:
        ordering = ["ordre"]
        unique_together = [("demande", "ordre")]


class RoleMatrice(models.Model):
    ordre = models.PositiveSmallIntegerField(unique=True)
    role = models.CharField(max_length=80)
    description = models.CharField(max_length=180)
    icone = models.CharField(max_length=40)
    droits = models.JSONField(default=list)
    superieurs = models.JSONField(default=list)
    # Exceptions par fonction : clé = id de fonction, valeur = lecture, saisie, validation ou refus.
    precisions = models.JSONField(default=dict)

    class Meta:
        ordering = ["ordre"]


class ModuleHabilitation(models.Model):
    """Colonne de la matrice : un module dont chaque rôle reçoit un niveau d'accès."""

    ordre = models.PositiveSmallIntegerField(unique=True)
    libelle = models.CharField(max_length=80, unique=True)

    class Meta:
        ordering = ["ordre"]
        verbose_name = "module d'habilitation"


class FonctionHabilitation(models.Model):
    """Fonction précise d'un module. Sans exception, elle suit le droit du module."""

    module = models.ForeignKey(ModuleHabilitation, on_delete=models.CASCADE, related_name="fonctions")
    ordre = models.PositiveSmallIntegerField()
    libelle = models.CharField(max_length=80)

    class Meta:
        ordering = ["module__ordre", "ordre"]
        constraints = [
            models.UniqueConstraint(fields=["module", "ordre"], name="fonction_habilitation_ordre"),
            models.UniqueConstraint(fields=["module", "libelle"], name="fonction_habilitation_libelle"),
        ]
        verbose_name = "fonction d'habilitation"


class SnapshotExercice(models.Model):
    annee = models.PositiveIntegerField(unique=True)
    accueil = models.JSONField(default=dict)
    dashboard = models.JSONField(default=dict)
    carriere = models.JSONField(default=dict)
    modules = models.JSONField(default=dict)


# --- Onglets du dossier agent -------------------------------------------------


class Evaluation(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="evaluations")
    annee = models.PositiveSmallIntegerField()
    note = models.DecimalField(max_digits=4, decimal_places=2)
    mention = models.CharField(max_length=40)
    appreciation = models.TextField()
    evaluateur = models.CharField(max_length=120)
    fonction_evaluateur = models.CharField(max_length=160)
    statut = models.CharField(max_length=40, default="Notifiée")
    # Circuit de la notation : visa du DRH, puis notification à l'agent.
    avis_drh = models.TextField(blank=True)
    vise_le = models.DateTimeField(null=True, blank=True)
    notifiee_le = models.DateTimeField(null=True, blank=True)
    observation_agent = models.TextField(blank=True)

    class Meta:
        ordering = ["-annee"]


class ObjectifEvaluation(models.Model):
    """Objectif individuel du contrat de l'agent, noté par le supérieur hiérarchique."""

    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="objectifs")
    ordre = models.PositiveSmallIntegerField()
    intitule = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    note = models.DecimalField(max_digits=4, decimal_places=2)
    ponderation = models.PositiveSmallIntegerField(help_text="En %")
    taux_atteinte = models.PositiveSmallIntegerField(help_text="En %")
    mention = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["ordre"]


class CritereEvaluation(models.Model):
    """Critère statutaire (compétence, encadrement, assiduité, éthique) noté sur 20."""

    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="criteres")
    ordre = models.PositiveSmallIntegerField()
    libelle = models.CharField(max_length=120)
    note = models.DecimalField(max_digits=4, decimal_places=2)
    commentaire = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["ordre"]


class TypeConge(models.Model):
    """Référentiel des congés : une famille peut regrouper des durées."""

    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=80)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="enfants")
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class TypeAbsence(models.Model):
    """Autorisations et absences distinctes des congés statutaires."""

    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=120)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class CircuitValidation(models.Model):
    """Chaîne de visas, attribuée ensuite à un congé ou à une absence précis."""

    nom = models.CharField(max_length=120)

    class Meta:
        ordering = ["nom"]

    def __str__(self) -> str:
        return self.nom


class EtapeValidation(models.Model):
    circuit = models.ForeignKey(CircuitValidation, on_delete=models.CASCADE, related_name="etapes")
    ordre = models.PositiveSmallIntegerField()
    instance = models.CharField(max_length=120)
    fonction = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ["ordre"]
        unique_together = [("circuit", "ordre")]


class AttributionCircuit(models.Model):
    """Un élément (congé ou absence) ne suit qu'un seul circuit."""

    class Famille(models.TextChoices):
        CONGE = "conge", "Congé"
        ABSENCE = "absence", "Absence"

    circuit = models.ForeignKey(CircuitValidation, on_delete=models.CASCADE, related_name="attributions")
    famille = models.CharField(max_length=20, choices=Famille.choices)
    code = models.SlugField(max_length=40)

    class Meta:
        unique_together = [("famille", "code")]


class TypeFinCarriere(models.Model):
    """Motifs de sortie des cadres retenus pour la fin de carrière."""

    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=80)
    ordre = models.PositiveSmallIntegerField(default=0)
    automatique = models.BooleanField(default=False, help_text="L'admission à la retraite s'ouvre seule, à la limite d'âge.")

    class Meta:
        ordering = ["ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class TypeFormation(models.Model):
    """Cycles de formation retenus, avec les fonctionnaires concernés."""

    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=160)
    ordre = models.PositiveSmallIntegerField(default=0)
    piece_requise = models.BooleanField(default=False)
    piece_libelle = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ["ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class TypeActe(models.Model):
    """Actes et pièces que la plateforme gère pour le moment."""

    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=160)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class PublicFormation(models.Model):
    type_formation = models.ForeignKey(TypeFormation, on_delete=models.CASCADE, related_name="publics")
    libelle = models.CharField(max_length=160)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class Prestataire(models.Model):
    """Organisme qui dispense les modules (école publique, institut, cabinet agréé, formateurs internes)."""

    class Categorie(models.TextChoices):
        ECOLE = "ecole", "École publique de formation"
        INSTITUT = "institut", "Institut ou université"
        CABINET = "cabinet", "Cabinet privé agréé"
        INTERNE = "interne", "Formateurs internes"

    nom = models.CharField(max_length=160, unique=True)
    categorie = models.CharField(max_length=20, choices=Categorie.choices)
    specialites = models.CharField(max_length=240, blank=True)
    ville = models.CharField(max_length=80, blank=True)
    contact_nom = models.CharField(max_length=120, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_telephone = models.CharField(max_length=40, blank=True)
    convention_debut = models.DateField(null=True, blank=True)
    convention_fin = models.DateField(null=True, blank=True)
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self) -> str:
        return self.nom


class SessionFormation(models.Model):
    """Module ouvert par la direction de la formation continue pour un type de formation.

    La planification (dates, lieu, places, coût) est saisie par la sous-direction ; l'état
    (planifiée, inscriptions ouvertes, en cours, terminée, annulée) en découle.
    """

    code = models.SlugField(max_length=40, unique=True)
    type_formation = models.ForeignKey(TypeFormation, on_delete=models.PROTECT, related_name="sessions")
    libelle = models.CharField(max_length=160, default="")
    cadre_budgetaire = models.CharField(max_length=160, default="")
    objectif = models.CharField(max_length=240, default="")
    ouverte = models.BooleanField(default=False)
    ouverte_le = models.DateField(null=True, blank=True)
    prestataire = models.ForeignKey(Prestataire, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions")
    lieu = models.CharField(max_length=160, blank=True)
    formateur = models.CharField(max_length=160, blank=True)
    date_debut = models.DateField(null=True, blank=True)
    date_fin = models.DateField(null=True, blank=True)
    heures = models.PositiveSmallIntegerField(default=0)
    places = models.PositiveSmallIntegerField(default=20)
    cout_participant = models.PositiveIntegerField(default=0, help_text="Coût par participant, en FCFA")
    annulee = models.BooleanField(default=False)
    motif_annulation = models.CharField(max_length=240, blank=True)
    cloturee_le = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["type_formation__ordre", "libelle"]

    def __str__(self) -> str:
        return self.libelle


class InscriptionFormation(models.Model):
    """Candidature d'un agent à un module, avec la pièce exigée par le type le cas échéant."""

    demande = models.OneToOneField(Demande, on_delete=models.CASCADE, related_name="inscription_formation")
    session = models.ForeignKey(SessionFormation, on_delete=models.PROTECT, related_name="inscriptions")
    fichier = models.FileField(upload_to="inscriptions/%Y/%m", blank=True)
    # Émargement et évaluation à chaud, saisis par la sous-direction pendant la session.
    present = models.BooleanField(null=True, blank=True)
    note_satisfaction = models.PositiveSmallIntegerField(null=True, blank=True, help_text="De 1 à 5")


class PlanFormation(models.Model):
    """Plan annuel de formation : dotation budgétaire et objectif d'agents à former."""

    annee = models.PositiveSmallIntegerField(unique=True)
    dotation = models.PositiveBigIntegerField(default=0, help_text="En FCFA")
    objectif_agents = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-annee"]


class BesoinFormation(models.Model):
    """Besoin exprimé par une structure, à couvrir par une session du plan."""

    class Priorite(models.TextChoices):
        HAUTE = "haute", "Haute"
        MOYENNE = "moyenne", "Moyenne"
        BASSE = "basse", "Basse"

    class Statut(models.TextChoices):
        EXPRIME = "exprime", "Exprimé"
        RETENU = "retenu", "Retenu au plan"
        COUVERT = "couvert", "Couvert par une session"

    annee = models.PositiveSmallIntegerField()
    organisme = models.ForeignKey(Organisme, on_delete=models.PROTECT, related_name="besoins_formation")
    type_formation = models.ForeignKey(TypeFormation, on_delete=models.PROTECT, related_name="besoins")
    intitule = models.CharField(max_length=200)
    effectif = models.PositiveSmallIntegerField(default=1)
    priorite = models.CharField(max_length=10, choices=Priorite.choices, default=Priorite.MOYENNE)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.EXPRIME)
    session = models.ForeignKey(SessionFormation, on_delete=models.SET_NULL, null=True, blank=True, related_name="besoins")
    exprime_le = models.DateField()

    class Meta:
        ordering = ["-annee", "statut", "-exprime_le"]


class Absence(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="absences")
    nature = models.CharField(max_length=120)
    debut = models.DateField()
    fin = models.DateField()
    jours = models.PositiveSmallIntegerField()
    statut = models.CharField(max_length=40)
    interim = models.CharField(max_length=160, blank=True)

    # Autorisations instruites par le gestionnaire (écran Carrières · Absences).
    class TypeAutorisation(models.TextChoices):
        AUTORISATION = "autorisation", "Autorisation d'absence"
        SPECIALE = "autorisation-speciale", "Autorisation spéciale d'absence"
        PERMISSION = "permission-speciale", "Permission spéciale d'absence"

    class Decision(models.TextChoices):
        EN_ATTENTE = "en_attente", "En attente de décision"
        VALIDEE = "validee", "Validée"
        INVALIDEE = "invalidee", "Invalidée"

    type_autorisation = models.CharField(max_length=40, choices=TypeAutorisation.choices, blank=True)
    justificatif = models.CharField(max_length=200, blank=True)
    decision = models.CharField(max_length=20, choices=Decision.choices, blank=True)
    motif_decision = models.TextField(blank=True)
    decide_le = models.DateField(null=True, blank=True)
    impact_solde = models.CharField(max_length=80, blank=True)
    impact_detail = models.CharField(max_length=120, blank=True)

    # Congés soumis à l'arbitrage de la sous-direction des carrières (écran Carrières · Congés).
    class Instruction(models.TextChoices):
        PRET_SIGNATURE = "pret_signature", "Prêt pour signature de l'arrêté DRH"
        APPROBATION_AUTO = "approbation_auto", "Approbation automatique"
        REMPLACEMENT = "remplacement", "Remplacement temporaire acté"
        CONFLIT_QUORUM = "conflit_quorum", "Conflit de quorum de service"
        SIGNE = "signe", "Arrêté signé"
        REJETE = "rejete", "Demande rejetée"
        DECALE = "decale", "Avis défavorable : départ à décaler"

    instruction = models.CharField(max_length=20, choices=Instruction.choices, blank=True)
    interim_detail = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["-debut"]


class BlocEcran(models.Model):
    """Contenu de pilotage d'un écran sans source dans la base (indicateur externe, calendrier, référentiel affiché).

    Modifiable dans l'administration ; les registres, eux, sont des modèles à part entière.
    """

    ecran = models.SlugField(max_length=40)
    cle = models.SlugField(max_length=60)
    contenu = models.JSONField(default=dict)

    class Meta:
        unique_together = [("ecran", "cle")]
        ordering = ["ecran", "cle"]

    def __str__(self) -> str:
        return f"{self.ecran} · {self.cle}"


class PrestationSociale(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="prestations")
    reference = models.CharField(max_length=40)
    nature = models.CharField(max_length=120)
    objet = models.CharField(max_length=240)
    montant = models.PositiveIntegerField(help_text="Montant en FCFA")
    date_demande = models.DateField()
    statut = models.CharField(max_length=40)
    echeancier = models.CharField(max_length=160, blank=True)

    # Requêtes instruites par la sous-direction de l'action sociale (écran Action sociale).
    class Etat(models.TextChoices):
        COMMISSION = "commission", "Avis de la commission attendu"
        CONFORME = "conforme", "Conforme pour ordonnancement"
        RESERVE = "reserve", "Pièces manquantes"
        MANDATEE = "mandatee", "Mandatée"

    etat = models.CharField(max_length=20, choices=Etat.choices, blank=True)
    ayant_droit = models.CharField(max_length=160, blank=True)
    pieces = models.CharField(max_length=200, blank=True)
    avis_commission = models.CharField(max_length=160, blank=True)
    urgent = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date_demande"]


class SituationSociale(models.Model):
    """Barème de quotité cessible de l'agent, servi à l'onglet action sociale."""

    agent = models.OneToOneField(Agent, on_delete=models.CASCADE, related_name="situation_sociale")
    numero_cmu = models.CharField(max_length=40, blank=True)
    traitement_brut = models.PositiveIntegerField(help_text="FCFA")
    cotisations = models.PositiveIntegerField(help_text="FCFA")
    engagements = models.PositiveIntegerField(default=0, help_text="Prélèvements en cours, FCFA")
    taux_quotite = models.DecimalField(max_digits=5, decimal_places=2, default=33)

    @property
    def solde_nette(self) -> int:
        return self.traitement_brut - self.cotisations

    @property
    def quotite(self) -> int:
        return round(self.solde_nette * float(self.taux_quotite) / 100)

    @property
    def marge(self) -> int:
        return self.quotite - self.engagements


class AyantDroit(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="ayants_droit")
    nom = models.CharField(max_length=160)
    lien = models.CharField(max_length=40)
    detail = models.CharField(max_length=160, blank=True)
    statut = models.CharField(max_length=40)
    initiales = models.CharField(max_length=4)

    class Meta:
        ordering = ["lien", "nom"]


class EnveloppeSociale(models.Model):
    """Dotation d'action sociale d'un organisme pour un exercice."""

    organisme = models.ForeignKey(Organisme, on_delete=models.CASCADE, related_name="enveloppes_sociales")
    exercice = models.PositiveSmallIntegerField()
    ligne = models.CharField(max_length=80)
    allouee = models.PositiveIntegerField()
    engagee = models.PositiveIntegerField()
    session_numero = models.PositiveSmallIntegerField(default=1)
    session_date = models.DateField()
    contact = models.CharField(max_length=120, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organisme", "exercice"], name="enveloppe_sociale_unique")]

    @property
    def reliquat(self) -> int:
        return self.allouee - self.engagee


class DispositifSocial(models.Model):
    """Plafond ou taux d'un secours ou d'un prêt, commun à tous les dossiers."""

    code = models.SlugField(max_length=40, unique=True)
    ancre = models.CharField(max_length=80)
    valeur = models.CharField(max_length=80)

    class Meta:
        ordering = ["code"]


class Formation(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="formations")
    intitule = models.CharField(max_length=200)
    organisme = models.CharField(max_length=160)
    debut = models.DateField()
    fin = models.DateField()
    heures = models.PositiveSmallIntegerField()
    statut = models.CharField(max_length=40)
    certification = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ["-debut"]


class PieceJointe(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="pieces")
    intitule = models.CharField(max_length=200)
    categorie = models.CharField(max_length=80)
    date_depot = models.DateField()
    taille_ko = models.PositiveIntegerField()
    verifiee = models.BooleanField(default=True)
    fichier = models.FileField(upload_to="pieces/%Y/%m", blank=True)

    class Meta:
        ordering = ["categorie", "-date_depot"]


class VisaDossier(models.Model):
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="visas_dossier")
    ordre = models.PositiveSmallIntegerField()
    instance = models.CharField(max_length=120)
    titulaire = models.CharField(max_length=120)
    fonction = models.CharField(max_length=160)
    avis = models.CharField(max_length=40)
    commentaire = models.TextField(blank=True)
    date = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["ordre"]


# --- Sous-direction des carrières ----------------------------------------------


class MouvementStrategique(models.Model):
    poste = models.CharField(max_length=180)
    organisme = models.ForeignKey(Organisme, on_delete=models.PROTECT, related_name="mouvements")
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="mouvements")
    nature = models.CharField(max_length=80)
    statut = models.CharField(max_length=80)
    date_effet = models.DateField()

    class Meta:
        ordering = ["date_effet"]


class AlerteReleve(models.Model):
    poste = models.CharField(max_length=180)
    organisme = models.ForeignKey(Organisme, on_delete=models.PROTECT, related_name="alertes")
    titulaire = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="alertes")
    depart = models.DateField()
    vivier = models.PositiveSmallIntegerField(help_text="Candidats internes éligibles")
    vivier_cible = models.PositiveSmallIntegerField(default=3)
    risque = models.CharField(max_length=20, choices=[("eleve", "Élevé"), ("modere", "Modéré"), ("faible", "Faible")])

    class Meta:
        ordering = ["depart"]


class Notification(models.Model):
    class Categorie(models.TextChoices):
        VISA = "visa", "Visa à apposer"
        DEMANDE = "demande", "Demande en circuit"
        RELEVE = "releve", "Relève des postes clés"
        DOSSIER = "dossier", "Dossier agent"
        SYSTEME = "systeme", "Système"

    destinataire = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    categorie = models.CharField(max_length=20, choices=Categorie.choices)
    titre = models.CharField(max_length=160)
    message = models.CharField(max_length=280)
    lien = models.CharField(max_length=200, blank=True, help_text="Route du front ouverte au clic")
    urgente = models.BooleanField(default=False)
    lue = models.BooleanField(default=False)
    creee_le = models.DateTimeField()

    class Meta:
        ordering = ["lue", "-creee_le"]


# --- Messagerie interne -------------------------------------------------------


class Conversation(models.Model):
    sujet = models.CharField(max_length=160, blank=True, help_text="Vide pour un échange à deux")
    participants = models.ManyToManyField(User, through="Participation", related_name="conversations")
    mise_a_jour = models.DateTimeField(help_text="Date du dernier message, pour le tri")

    class Meta:
        ordering = ["-mise_a_jour"]


class Participation(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="participations")
    utilisateur = models.ForeignKey(User, on_delete=models.CASCADE, related_name="participations")
    lu_jusqu_a = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("conversation", "utilisateur")]


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    auteur = models.ForeignKey(User, on_delete=models.CASCADE, related_name="messages_envoyes")
    texte = models.TextField(max_length=2000)
    envoye_le = models.DateTimeField()

    class Meta:
        ordering = ["envoye_le", "id"]


# --- Dotation et expression des besoins --------------------------------------


class PoleMinisteriel(models.Model):
    """Pôle du ministère auquel se rattachent les structures."""

    code = models.SlugField(max_length=40, unique=True)
    nom = models.CharField(max_length=180)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "nom"]
        verbose_name = "pôle"

    def __str__(self) -> str:
        return self.nom


class EntiteTutelle(models.Model):
    """Direction générale, direction centrale, sous-direction ou service du ministère."""

    class Niveau(models.TextChoices):
        DIRECTION_GENERALE = "direction-generale", "Direction générale"
        DIRECTION_CENTRALE = "direction-centrale", "Direction centrale"
        SOUS_DIRECTION = "sous-direction", "Sous-direction"
        SERVICE = "service", "Service"

    code = models.SlugField(max_length=40, unique=True)
    nom = models.CharField(max_length=220)
    pole = models.ForeignKey(PoleMinisteriel, on_delete=models.PROTECT, related_name="structures")
    niveau = models.CharField(max_length=20, choices=Niveau.choices, default=Niveau.DIRECTION_CENTRALE)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="enfants",
    )
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "nom"]
        verbose_name = "structure"

    def __str__(self) -> str:
        return self.nom


class ExerciceDotation(models.Model):
    annee = models.PositiveSmallIntegerField(unique=True)
    intitule = models.CharField(max_length=180)
    fondement = models.CharField(max_length=180)
    masse_salariale = models.BigIntegerField(default=0)
    ratio_masse = models.DecimalField(max_digits=4, decimal_places=1, default=0)
    seuil_ratio = models.DecimalField(max_digits=4, decimal_places=1, default=35)

    class Meta:
        ordering = ["-annee"]


class BranchePlafond(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=180)
    entites = models.CharField(max_length=240)
    icone = models.CharField(max_length=40)
    effectif = models.PositiveIntegerField()
    plafond = models.PositiveIntegerField()
    note = models.CharField(max_length=200, blank=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]


class DemandeDotation(models.Model):
    class Nature(models.TextChoices):
        AFFECTATION = "affectation", "Affectation (Nouveau fonctionnaire)"
        DISPOSITION = "disposition", "Mise à disposition"
        REDEPLOIEMENT = "redeploiement", "Redéploiement"
        REAFFECTATION = "reaffectation", "Réaffectation après concours professionnel"

    class Statut(models.TextChoices):
        ARBITRAGE = "arbitrage", "En arbitrage DGPE"
        VISA_CF = "visa_cf", "Contrôle des emplois"
        ACTE = "acte", "Avis favorable / acté"
        REJET = "rejet", "Rejet / plafond atteint"

    reference = models.CharField(max_length=32, unique=True)
    entite = models.ForeignKey(EntiteTutelle, on_delete=models.PROTECT, related_name="demandes_dotation")
    direction = models.CharField(max_length=180)
    poste = models.CharField(max_length=200)
    nature = models.CharField(max_length=20, choices=Nature.choices)
    impact = models.IntegerField(default=0)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.ARBITRAGE)
    visa = models.CharField(max_length=180, blank=True)
    detail = models.CharField(max_length=240, blank=True)
    recu_le = models.DateField()
    notifiee = models.BooleanField(default=False)

    class Meta:
        ordering = ["-recu_le", "-id"]


class AlertePoste(models.Model):
    entite = models.ForeignKey(EntiteTutelle, on_delete=models.PROTECT, related_name="alertes_postes")
    intitule = models.CharField(max_length=200)
    detail = models.CharField(max_length=280)
    postes = models.PositiveSmallIntegerField()
    jours = models.PositiveSmallIntegerField(default=0)
    piste = models.CharField(max_length=200)
    traitee = models.BooleanField(default=False)

    class Meta:
        ordering = ["-jours", "id"]


class Passerelle(models.Model):
    class Statut(models.TextChoices):
        PROPOSEE = "proposee", "Proposée"
        ACTEE = "actee", "Actée"

    cedant = models.CharField(max_length=180)
    recepteur = models.CharField(max_length=180)
    profil = models.CharField(max_length=200)
    effectif = models.PositiveSmallIntegerField()
    economie = models.BigIntegerField(default=0)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.PROPOSEE)
    note = models.CharField(max_length=240, blank=True)

    class Meta:
        ordering = ["id"]


class JournalEffectif(models.Model):
    reference = models.CharField(max_length=40)
    titre = models.CharField(max_length=200)
    auteur = models.CharField(max_length=180)
    cree_le = models.DateTimeField()

    class Meta:
        ordering = ["-cree_le", "-id"]


class CampagneBesoin(models.Model):
    exercice = models.PositiveSmallIntegerField(unique=True)
    ouverte = models.BooleanField(default=True)
    cadrage = models.CharField(max_length=180)
    pea_max = models.PositiveIntegerField()
    volume_precedent = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-exercice"]


class FiliereBesoin(models.Model):
    code = models.SlugField(max_length=40, unique=True)
    libelle = models.CharField(max_length=200)
    icone = models.CharField(max_length=40)
    requis = models.PositiveIntegerField()
    couverts = models.PositiveIntegerField()
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]


class FicheBesoin(models.Model):
    class Nature(models.TextChoices):
        CREATION = "creation", "Création nette de poste"
        REMPLACEMENT = "remplacement", "Remplacement départ retraite"
        MOBILITE = "mobilite", "Mobilité inter-entreprises"
        RENFORT = "renfort", "Renfort stratégique provisoire"

    class Statut(models.TextChoices):
        FAVORABLE = "favorable", "Arbitré favorable DGPE"
        INSTRUCTION = "instruction", "En attente d'avis technique"
        COMPLEMENT = "complement", "Renvoyé pour complément"
        REJET = "rejet", "Rejeté (contrainte PEA)"

    reference = models.CharField(max_length=32, unique=True)
    entite = models.ForeignKey(EntiteTutelle, on_delete=models.PROTECT, related_name="fiches_besoin")
    direction = models.CharField(max_length=180)
    profil = models.CharField(max_length=200)
    grade = models.CharField(max_length=40, blank=True)
    specialite = models.CharField(max_length=120, blank=True)
    volume = models.PositiveSmallIntegerField()
    motif = models.CharField(max_length=240)
    nature = models.CharField(max_length=20, choices=Nature.choices)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.INSTRUCTION)
    arbitrage = models.CharField(max_length=180, blank=True)
    visa = models.CharField(max_length=180, blank=True)
    detail = models.CharField(max_length=240, blank=True)
    cout_annuel = models.BigIntegerField(default=0)
    critique = models.BooleanField(default=False)
    postes_accordes = models.PositiveSmallIntegerField(default=0)
    depose_le = models.DateTimeField()

    class Meta:
        ordering = ["-depose_le", "-id"]


class ProcedureDisciplinaire(models.Model):
    """Procédure ouverte devant la commission paritaire (écran Carrières · Procédures disciplinaires)."""

    class Avis(models.TextChoices):
        INSTRUCTION = "instruction", "Instruction ouverte"
        RECEVABLE = "recevable", "Recevabilité validée"
        ATTENTE_REPONSE = "attente_reponse", "En attente de réponse"
        VISA_RAPPORTEUR = "visa_rapporteur", "Visa du rapporteur"
        DELIBERE = "delibere", "En délibéré paritaire"
        SANCTION = "sanction", "Sanction prononcée"
        CLASSEE = "classee", "Classée sans suite"

    reference = models.CharField(max_length=40, unique=True)
    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="procedures")
    saisine = models.DateField()
    grief = models.CharField(max_length=160)
    description = models.TextField()
    degre = models.PositiveSmallIntegerField(default=1, help_text="Degré de sanction encouru (1 à 3)")
    rapporteur = models.CharField(max_length=120)
    stade = models.CharField(max_length=120)
    stade_detail = models.CharField(max_length=160, blank=True)
    avis = models.CharField(max_length=20, choices=Avis.choices, default=Avis.INSTRUCTION)

    class Meta:
        ordering = ["saisine", "reference"]


class SanctionDisciplinaire(models.Model):
    """Sanction prononcée ; celles du 1er degré s'effacent après trois ans sans récidive."""

    class Nature(models.TextChoices):
        AVERTISSEMENT = "avertissement", "Avertissement"
        BLAME = "blame", "Blâme"
        DEPLACEMENT = "deplacement", "Déplacement d'office"
        RETROGRADATION = "retrogradation", "Rétrogradation"
        EXCLUSION = "exclusion", "Exclusion temporaire"
        REVOCATION = "revocation", "Révocation"

    agent = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="sanctions")
    nature = models.CharField(max_length=20, choices=Nature.choices)
    degre = models.PositiveSmallIntegerField(default=1)
    prononcee_le = models.DateField()

    class Meta:
        ordering = ["-prononcee_le"]


class SessionParitaire(models.Model):
    """Séance de la commission mixte paritaire."""

    class Etat(models.TextChoices):
        CONVOQUEE = "convoquee", "Convocation notifiée"
        A_CONFIRMER = "a_confirmer", "En cours de confirmation"
        TENUE = "tenue", "Séance tenue"

    code = models.CharField(max_length=40, unique=True)
    intitule = models.CharField(max_length=120)
    date = models.DateTimeField()
    etat = models.CharField(max_length=20, choices=Etat.choices, default=Etat.A_CONFIRMER)
    ordre_du_jour = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    composition = models.JSONField(default=list)
    lieu = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["date"]


class DossierRetraite(models.Model):
    """Dossier de départ à la retraite instruit par la sous-direction des carrières."""

    class Statut(models.TextChoices):
        VISITE = "visite", "Visite médicale de sortie"
        QUITTANCE = "quittance", "Quittance de fin de gestion"
        ARRETE = "arrete", "Arrêté signé"
        TRANSMIS = "transmis", "Transmis à la CGRAE"
        NOTIFIE = "notifie", "CGRAE notifiée"

    agent = models.OneToOneField(Agent, on_delete=models.CASCADE, related_name="dossier_retraite")
    motif = models.ForeignKey(TypeFinCarriere, null=True, blank=True, on_delete=models.PROTECT, related_name="dossiers")
    age_limite = models.PositiveSmallIntegerField(default=60)
    entree_service = models.DateField(null=True, blank=True)
    date_cessation = models.DateField(null=True, blank=True, help_text="Date d'effet des cessations saisies (démission, décès…).")
    decret = models.CharField(max_length=80, blank=True, help_text="Référence du décret présidentiel qui reporte la retraite.")
    date_decret = models.DateField(null=True, blank=True)
    idr = models.PositiveIntegerField(default=0, help_text="Indemnité de départ à la retraite, en FCFA")
    pension = models.PositiveIntegerField(default=0, help_text="Pension mensuelle provisoire, en FCFA")
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.VISITE)
    statut_detail = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ["agent__date_naissance"]


class PosteSensible(models.Model):
    """Poste clé dont le titulaire part : la relève se prépare en binôme."""

    intitule = models.CharField(max_length=160)
    titulaire = models.ForeignKey(Agent, on_delete=models.CASCADE, related_name="postes_sensibles")
    depart = models.DateField()
    successeur = models.CharField(max_length=160, blank=True)
    progression = models.PositiveSmallIntegerField(default=0, help_text="Avancement du tutorat, en %")
    commentaire = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["depart"]


class PilotageFinCarriere(models.Model):
    """Textes et indicateurs de l'écran Fin de carrière. Une seule ligne, modifiable."""

    fil = models.JSONField(default=list)
    titre = models.CharField(max_length=240, blank=True)
    chapeau = models.TextField(blank=True)
    reference = models.CharField(max_length=80, blank=True)
    etat_passerelle = models.CharField(max_length=180, blank=True)
    taux_cgrae = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    detail_cgrae = models.CharField(max_length=180, blank=True)
    renouvellement = models.CharField(max_length=180, blank=True)
    programme_titre = models.CharField(max_length=200, blank=True)
    programme_texte = models.TextField(blank=True)

    class Meta:
        verbose_name = "pilotage de fin de carrière"


class ActionAccompagnement(models.Model):
    """Action du programme de préparation à la retraite."""

    titre = models.CharField(max_length=160)
    detail = models.CharField(max_length=200, blank=True)
    quand = models.CharField(max_length=120, blank=True)
    valeur = models.CharField(max_length=80, blank=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "id"]
        verbose_name = "action d'accompagnement"


class DistinctionCarriere(models.Model):
    """Décoration instruite avant la radiation des cadres."""

    rang = models.CharField(max_length=12)
    titre = models.CharField(max_length=200)
    detail = models.CharField(max_length=240, blank=True)
    etat = models.CharField(max_length=80, blank=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "id"]
        verbose_name = "distinction"


class CompositionStatistique(models.Model):
    """Statistique composée par un utilisateur et rejouée à l'ouverture de l'écran."""

    nom = models.CharField(max_length=160)
    auteur = models.ForeignKey(User, on_delete=models.CASCADE, related_name="compositions_statistiques")
    sujet = models.SlugField(max_length=40)
    mesure = models.SlugField(max_length=40)
    axe_lignes = models.SlugField(max_length=40)
    axe_colonnes = models.SlugField(max_length=40, blank=True)
    filtres = models.JSONField(default=list)
    volets = models.JSONField(default=list, help_text="Dossiers réunis dans la même composition.")
    creee_le = models.DateTimeField(auto_now_add=True)
    modifiee_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-modifiee_le", "-id"]
        verbose_name = "composition statistique"
        verbose_name_plural = "compositions statistiques"

    def __str__(self) -> str:
        return self.nom


class GradeReferentiel(models.Model):
    """Grade de la fonction publique, liste de référence du ministère."""

    code = models.CharField(max_length=8, unique=True)
    categorie = models.CharField(max_length=1)
    libelle = models.CharField(max_length=320)
    ordre = models.PositiveSmallIntegerField(default=0)
    en_vigueur = models.BooleanField(default=True)

    class Meta:
        ordering = ["ordre", "code"]
        verbose_name = "grade"

    def __str__(self) -> str:
        return self.code


class Communication(models.Model):
    """Information que la DRH choisit de montrer sur la page d'accueil."""

    class Rubrique(models.TextChoices):
        INFORMATION = "information", "Information"
        AVIS = "avis", "Avis"
        CAMPAGNE = "campagne", "Campagne"
        NOTE = "note", "Note de service"

    titre = models.CharField(max_length=200)
    texte = models.TextField()
    rubrique = models.CharField(max_length=20, choices=Rubrique.choices, default=Rubrique.INFORMATION)
    publie = models.BooleanField(default=False)
    publie_le = models.DateField(null=True, blank=True)
    auteur = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="communications",
    )
    cree_le = models.DateTimeField(auto_now_add=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-publie_le", "-modifie_le", "-id"]
        verbose_name = "communication"

    def __str__(self) -> str:
        return self.titre


class EmploiReferentiel(models.Model):
    """Emploi classé par le décret de 2015, ou ajouté par le ministère."""

    code = models.SlugField(max_length=96, unique=True)
    libelle = models.CharField(max_length=220)
    famille = models.CharField(max_length=40)
    grade = models.ForeignKey(GradeReferentiel, on_delete=models.PROTECT, related_name="emplois")
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "libelle"]
        verbose_name = "emploi"

    def __str__(self) -> str:
        return self.libelle


class Publication(models.Model):
    """Note, circulaire ou communiqué diffusé par la DRH."""

    class Nature(models.TextChoices):
        CIRCULAIRE = "circulaire", "Circulaire ministérielle"
        NOTE = "note", "Note de service"
        COMMUNIQUE = "communique", "Communiqué général"
        DECISION = "decision", "Décision"
        FLASH = "flash", "Alerte flash"

    class Urgence(models.TextChoices):
        NORMAL = "normal", "Standard"
        IMPORTANT = "important", "Important"
        URGENT = "urgent", "Urgent"

    class Statut(models.TextChoices):
        BROUILLON = "brouillon", "Brouillon"
        VISA = "visa", "En attente de visa"
        DIFFUSE = "diffuse", "Diffusé"
        CLOTURE = "cloture", "Archivé"

    class Perimetre(models.TextChoices):
        TOUS = "tous", "Ensemble des agents du portefeuille"
        CADRES = "cadres", "Cadres dirigeants et hors catégorie"
        DRH = "drh", "Gestionnaires RH des entreprises publiques"

    reference = models.CharField(max_length=48, unique=True)
    nature = models.CharField(max_length=20, choices=Nature.choices)
    urgence = models.CharField(max_length=20, choices=Urgence.choices, default=Urgence.NORMAL)
    intitule = models.CharField(max_length=240)
    corps = models.TextField()
    perimetre = models.CharField(max_length=20, choices=Perimetre.choices, default=Perimetre.TOUS)
    perimetre_detail = models.CharField(max_length=200, blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.BROUILLON)
    publique = models.BooleanField(default=False, help_text="Visible sur la page d'accueil, sans connexion.")
    accuse = models.BooleanField(default=True)
    echeance = models.DateField(null=True, blank=True)
    signataire = models.CharField(max_length=180, blank=True)
    visa = models.CharField(max_length=120, blank=True)
    etape_visa = models.CharField(max_length=120, blank=True)
    taux_lecture = models.PositiveSmallIntegerField(default=0)
    piece = models.FileField(upload_to="communications/%Y/%m", blank=True)
    auteur = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="publications")
    creee_le = models.DateTimeField(auto_now_add=True)
    publiee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-publiee_le", "-creee_le", "-id"]
        verbose_name = "publication"

    def __str__(self) -> str:
        return self.reference


class LecturePublication(models.Model):
    """Publication déjà ouverte par un utilisateur."""

    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="lectures")
    lecteur = models.ForeignKey(User, on_delete=models.CASCADE, related_name="lectures_publications")
    lue_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["publication", "lecteur"], name="lecture_publication_unique"),
        ]
        verbose_name = "lecture de publication"

    def __str__(self) -> str:
        return f"{self.lecteur_id} · {self.publication_id}"


class ReponseSondage(models.Model):
    """Voix d'un agent sur un sondage ouvert à l'ensemble des comptes."""

    sondage = models.ForeignKey("ConsultationFlash", on_delete=models.CASCADE, related_name="reponses")
    lecteur = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reponses_sondages")
    choix = models.CharField(max_length=160)
    repondu_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["sondage", "lecteur"], name="reponse_sondage_unique"),
        ]
        verbose_name = "réponse à un sondage"

    def __str__(self) -> str:
        return self.choix


class ConsultationFlash(models.Model):
    """Sondage proposé à l'ensemble des agents."""

    question = models.CharField(max_length=240)
    cloture = models.DateField()
    participants = models.PositiveIntegerField(default=0)
    options = models.JSONField(default=list)

    class Meta:
        verbose_name = "consultation flash"

    def __str__(self) -> str:
        return self.question


class CampagnePlanConge(models.Model):
    """Ouverture annuelle de la planification des congés, visée par le DRH."""

    class Statut(models.TextChoices):
        ACCORD = "accord", "En attente de l'accord du DRH"
        OUVERTE = "ouverte", "Ouverte aux agents"
        REMONTEE = "remontee", "Chez les responsables hiérarchiques"
        SOUMIS = "soumis", "Soumise au DRH"
        PUBLIEE = "publiee", "Arrêté publié"

    exercice = models.PositiveSmallIntegerField(unique=True)
    delai = models.DateField()
    limite_agents = models.DateField()
    limite_hierarchie = models.DateField()
    limite_rh = models.DateField()
    limite_drh = models.DateField()
    communique = models.TextField()
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.ACCORD)
    ouverte_par = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="campagnes_conges_ouvertes",
    )
    accordee_par = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="campagnes_conges_accordees",
    )
    creee_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-exercice"]
        verbose_name = "campagne de planification des congés"

    def __str__(self) -> str:
        return f"Planification {self.exercice}"


class PlanConge(models.Model):
    """Dates de congé d'un agent pour une campagne, au fil de la hiérarchie."""

    class Origine(models.TextChoices):
        SAISIE = "saisie", "Choix de l'agent"
        CHEF = "chef", "Fixé par le responsable"

    class Palier(models.TextChoices):
        AGENT = "agent", "Chez l'agent"
        HIERARCHIE = "hierarchie", "Chez le supérieur"
        RH = "rh", "Équipe RH"
        DRH = "drh", "DRH"
        PUBLIE = "publie", "Arrêté publié"

    campagne = models.ForeignKey(CampagnePlanConge, on_delete=models.CASCADE, related_name="plans")
    agent = models.ForeignKey(User, on_delete=models.CASCADE, related_name="plans_conges")
    debut = models.DateField()
    fin = models.DateField()
    origine = models.CharField(max_length=20, choices=Origine.choices, default=Origine.SAISIE)
    palier = models.CharField(max_length=20, choices=Palier.choices, default=Palier.AGENT)
    echeance = models.DateField(null=True, blank=True)
    chez = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="plans_conges_a_voir",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["campagne", "agent"], name="plan_conge_agent_unique"),
        ]
        ordering = ["agent__last_name", "agent__first_name"]
        verbose_name = "plan de congé"

    def __str__(self) -> str:
        return f"{self.agent_id} · {self.debut} – {self.fin}"


class MouvementPlanConge(models.Model):
    """Trace d'une validation ou d'une modification, avec son motif."""

    plan = models.ForeignKey(PlanConge, on_delete=models.CASCADE, related_name="mouvements")
    auteur = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="mouvements_plans_conges")
    action = models.CharField(max_length=20)
    motif = models.TextField(blank=True)
    debut = models.DateField(null=True, blank=True)
    fin = models.DateField(null=True, blank=True)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-cree_le", "-id"]
        verbose_name = "mouvement de plan de congé"


class RepriseConge(models.Model):
    """Demande ultérieure de changement, qui remonte la hiérarchie jusqu'au DRH."""

    class Palier(models.TextChoices):
        HIERARCHIE = "hierarchie", "Chez le supérieur"
        RH = "rh", "Équipe RH"
        DRH = "drh", "DRH"
        ACCEPTEE = "acceptee", "Acceptée"
        REFUSEE = "refusee", "Refusée"

    plan = models.ForeignKey(PlanConge, on_delete=models.CASCADE, related_name="reprises")
    demandeur = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reprises_conges")
    debut = models.DateField()
    fin = models.DateField()
    motif = models.TextField()
    palier = models.CharField(max_length=20, choices=Palier.choices, default=Palier.HIERARCHIE)
    chez = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="reprises_conges_a_voir",
    )
    creee_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-creee_le"]
        verbose_name = "reprise de congé"


class RappelEcheance(models.Model):
    """Rappel déjà envoyé pour une échéance, afin de ne prévenir qu'une fois."""

    campagne = models.ForeignKey(CampagnePlanConge, on_delete=models.CASCADE, related_name="rappels")
    destinataire = models.ForeignKey(User, on_delete=models.CASCADE, related_name="rappels_echeances")
    cle = models.CharField(max_length=80)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["campagne", "destinataire", "cle"], name="rappel_echeance_unique"),
        ]
        verbose_name = "rappel d'échéance"


class RappelRetour(models.Model):
    """Rappel déjà envoyé la veille d'un retour, afin de ne prévenir qu'une fois."""

    destinataire = models.ForeignKey(User, on_delete=models.CASCADE, related_name="rappels_retours")
    cle = models.CharField(max_length=80)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["destinataire", "cle"], name="rappel_retour_unique"),
        ]
        verbose_name = "rappel de retour"
