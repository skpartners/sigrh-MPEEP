export type CommunicationPublique = {
  id: number;
  source?: string;
  titre: string;
  texte: string;
  rubrique: string;
  rubrique_libelle: string;
  publie: boolean;
  publie_le: string | null;
};

export type Chiffre = {
  valeur: string;
  libelle: string;
  detail: string;
  icone: string;
};

export type Pilier = {
  code: string;
  titre: string;
  texte: string;
  points: string[];
  lien: string;
  indicateur: string;
};

export type AgentBrief = {
  matricule: string;
  nom: string;
  prenoms: string;
  nom_complet: string;
  initiales: string;
  corps: string;
  grade: string;
  echelon: string;
  indice: number;
  structure: string;
  organisme: string;
  organisme_sigle: string;
  situation: string;
  categorie: string;
  photo_url: string;
};

export type Acte = {
  id: number;
  reference: string;
  nature: string;
  titre: string;
  resume: string;
  domaine: string;
  statut: "valide" | "accorde" | "instruction" | "complement" | "rejete";
  statut_libelle: string;
  date_effet: string | null;
  date_enregistrement: string;
  signataire: string;
  agent: AgentBrief;
  structure: string;
  organisme: string;
  scan_url: string;
  signatures: { objet: string; signataire: string; date: string | null; signature_url: string }[];
};

export type Accueil = {
  exercice: number;
  marque: { sigle: string; ministere: string; devise: string };
  photo_ministre_url: string;
  ministre: { civilite: string; nom: string };
  titre: string;
  chapo: string;
  chiffres: Chiffre[];
  piliers: Pilier[];
  actes_recents: Acte[];
};

export type SessionUser = {
  matricule: string;
  nom: string;
  prenoms: string;
  nom_complet: string;
  fonction: string;
  organisme: string;
  organisme_sigle: string;
  signature_url: string;
  photo_url: string;
  administrateur?: boolean;
  acces?: { modules: Record<string, string>; fonctions: Record<string, string> };
};

export type Organisme = { code: string; nom: string; sigle: string };

export type Ton = "primary" | "secondary" | "tertiary";

export type Kpi = {
  libelle: string;
  valeur: string;
  unite: string;
  icone: string;
  ton: Ton;
  badge: string;
  badge_ton: "positif" | "alerte" | "neutre";
  detail: string;
  tendance: string;
  jauge?: { pourcentage: number; gauche: string; droite: string };
  repartition?: string[];
};

export type ModuleActivite = {
  cle: string;
  libelle: string;
  valeur: string;
  detail: string;
  icone: string;
  lien: string;
};

export type LigneEffectif = { libelle: string; total: number; femmes: number; hommes: number };
export type LigneCompte = { libelle: string; total: number };

/** États lus en direct dans les registres, dans le périmètre de l'utilisateur. */
export type EtatsTableauDeBord = {
  perimetre: boolean;
  effectifs: {
    total: number;
    femmes: number;
    hommes: number;
    axes: { code: string; libelle: string; modalites: number; lignes: LigneEffectif[]; toutes: LigneEffectif[] }[];
  };
  dotations: {
    effectif: number;
    plafond: number;
    occupation: number;
    branches: { libelle: string; effectif: number; plafond: number; occupation: number }[];
    demandes: number;
    ouvertes: number;
    impact_ouvert: number;
    par_statut: LigneCompte[];
    par_nature: LigneCompte[];
  };
  absences: {
    absents: number;
    en_cours: LigneCompte[];
    a_decider: number;
    annee: { absences: number; jours: number; par_nature: (LigneCompte & { jours: number })[]; toutes_natures: (LigneCompte & { jours: number })[] };
    conges: { a_instruire: number; signes: number; acquis: number; consommes: number; reliquat: number; consommation: number };
  };
  formation: {
    sessions_ouvertes: number;
    sessions_en_cours: number;
    agents_en_cours: number;
    inscrits: number;
    presents: number;
    agents_formes: number;
    heures: number;
    par_type: LigneCompte[];
    prochaines: { libelle: string; debut: string | null; lieu: string; inscrits: number; places: number }[];
  };
};

export type Dashboard = {
  exercice: number;
  campagne: { libelle: string; cloture: string };
  modules: ModuleActivite[];
  kpis: Kpi[];
  etats: EtatsTableauDeBord;
  visas: {
    id: number;
    objet: string;
    echeance: string;
    visa_amont: string;
    categorie: string;
    urgent: boolean;
    agent: AgentBrief;
  }[];
};

export type Dossier = AgentBrief & {
  anciennete: string;
  prise_service: string;
  situation_administrative: { libelle: string; valeur: string }[];
  situation_saisie: {
    organisme: string;
    direction: string;
    sous_direction: string;
    service: string;
    localisation: string;
    emploi: string;
    type_agent: string;
    mode_recrutement: string;
    categorie: string;
    grade: string;
    echelon: string;
    prise_service: string;
    prise_service_ministere: string;
    prise_service_emploi: string;
    fonction: string;
    prise_service_fonction: string;
    situation: string;
  };
  visite_medicale: string;
  affiliation_cgrae: string;
  conges: {
    acquis: number;
    consommes: number;
    reliquat: number;
    report: number;
    autorisations: number;
    autorisations_restantes: number;
  };
  types_conges: { code: string; libelle: string; enfants: { code: string; libelle: string }[] }[];
  types_formations: { code: string; libelle: string; publics: string[]; piece_requise: boolean; piece_libelle: string }[];
  sessions_formations: { code: string; libelle: string; type: string; cadre: string; objectif: string }[];
  types_actes: { code: string; libelle: string }[];
  presence: {
    mois: string;
    service: string;
    quorum: number;
    membres: { initiales: string; nom: string; vous: boolean; libelle: string; badge: string; ton: string }[];
    presents: number;
    conges: number;
    maladie: number;
  };
  actes: Acte[];
  date_naissance: string | null;
  coordonnees: { telephone: string; courriel: string; localisation: string; habilitation: string };
  projection: {
    prochain_echelon: number | null;
    date_prochain_echelon: string;
    progression: number;
    age_limite: number;
    date_radiation: string;
    service_restant: string;
  } | null;
  evaluations: {
    id: number;
    annee: number;
    note: number;
    mention: string;
    appreciation: string;
    evaluateur: string;
    fonction_evaluateur: string;
    statut: string;
    avis_drh: string;
    vise_le: string | null;
    notifiee_le: string | null;
    observation_agent: string;
    objectifs: { ordre: number; intitule: string; description: string; note: number; ponderation: number; taux_atteinte: number; mention: string }[];
    criteres: { libelle: string; note: number; commentaire: string }[];
  }[];
  absences: { id: number; nature: string; debut: string; fin: string; jours: number; statut: string; interim: string }[];
  prestations: {
    id: number;
    reference: string;
    nature: string;
    objet: string;
    montant: number;
    date_demande: string;
    statut: string;
    echeancier: string;
  }[];
  social: {
    cmu: string;
    traitement_brut: number;
    cotisations: number;
    solde_nette: number;
    engagements: number;
    taux_quotite: number;
    quotite: number;
    marge: number;
    part_engagements: number;
    part_quotite: number;
    ayants_droit: { initiales: string; nom: string; lien: string; detail: string; statut: string }[];
    enveloppe: {
      exercice: number;
      ligne: string;
      allouee: number;
      engagee: number;
      reliquat: number;
      taux_execution: number;
      session: number;
      session_date: string;
      demandes: number;
      contact: string;
    } | null;
    dispositifs: { code: string; ancre: string; valeur: string }[];
  };
  formations: {
    id: number;
    intitule: string;
    organisme: string;
    debut: string;
    fin: string;
    heures: number;
    statut: string;
    certification: string;
  }[];
  pieces: { id: number; intitule: string; categorie: string; date_depot: string; taille_ko: number; verifiee: boolean; fichier_url: string }[];
  demandes: {
    reference: string;
    nature: string;
    icone: string;
    etape: string;
    responsable: string;
    echeance: string;
    depose_le: string;
    categorie: string;
    visas: {
      ordre: number;
      instance: string;
      titulaire: string;
      fonction: string;
      avis: string;
      commentaire: string;
      date: string | null;
      reference: string;
      signature_url: string;
    }[];
  }[];
  visas: {
    instance: string;
    titulaire: string;
    fonction: string;
    avis: string;
    commentaire: string;
    date: string | null;
    reference: string;
  }[];
};

export type Carrieres = {
  titre: string;
  chapo: string;
  compteurs: { libelle: string; valeur: string; detail: string; icone: string; pourcentage: number }[];
  pyramide: { tranche: string; hommes: number; femmes: number }[];
  departs: { nombre: number; postes_direction: number; detail: string };
  mouvements: {
    id: number;
    poste: string;
    organisme: string;
    nature: string;
    statut: string;
    date_effet: string;
    agent: AgentBrief;
  }[];
  alertes: {
    id: number;
    poste: string;
    organisme: string;
    depart: string;
    vivier: number;
    vivier_cible: number;
    risque: "eleve" | "modere" | "faible";
    risque_libelle: string;
    titulaire: AgentBrief;
  }[];
  lignes: {
    id: number;
    emploi: string;
    structure: string;
    grade_echelon: string;
    anciennete: string;
    proposition: string;
    mode: string;
    note: string;
    avis: string;
    statut: string;
    agent: AgentBrief;
  }[];
};

export type RegistreAgent = AgentBrief & {
  anciennete: string;
  date_naissance: string | null;
  conges: { acquis: number; consommes: number; reliquat: number };
  radiation: { age_limite: number; date_radiation: string; service_restant: string } | null;
};

export type RegistreAbsence = {
  id: number;
  nature: string;
  debut: string;
  fin: string;
  jours: number;
  statut: string;
  interim: string;
  agent: AgentBrief;
};

export type CarrieresRegistres = {
  agents: RegistreAgent[];
  absences: RegistreAbsence[];
  actes: Acte[];
};

export type ElementCircuit = {
  code: string;
  libelle: string;
  parent: string;
  ordre: number;
  circuit_id: number | null;
};

export type CircuitConfigure = {
  id: number;
  nom: string;
  etapes: { ordre: number; instance: string; fonction: string }[];
  attributions: { famille: "conge" | "absence"; code: string; libelle: string }[];
};

export type ConfigurationCircuits = {
  circuits: CircuitConfigure[];
  elements: { conges: ElementCircuit[]; absences: ElementCircuit[] };
  roles: { role: string; description: string }[];
};

export type Circuits = {
  exercice: number;
  etapes: { ordre: number; titre: string; compteur: string; detail: string }[];
  parcours: { ordre: number; acteur: string; titre: string; texte: string; metas: { label: string; value: string }[] }[];
  demandes: {
    reference: string;
    nature: string;
    icone: string;
    etape: string;
    responsable: string;
    echeance: string;
    depose_le: string;
    categorie: string;
    agent: AgentBrief;
  }[];
  matrice: {
    colonnes: string[];
    fonctions: { id: number; libelle: string }[][];
    disponibles: string[][];
    roles: { id: number; role: string; description: string; icone: string; droits: string[]; precisions: Record<string, string> }[];
  };
};

export type ModulePageData = {
  titre: string;
  chapo: string;
  domaine: string;
  actes: Acte[];
};

export type NotificationItem = {
  id: number;
  categorie: "visa" | "demande" | "releve" | "dossier" | "systeme";
  titre: string;
  message: string;
  lien: string;
  urgente: boolean;
  lue: boolean;
  creee_le: string;
};

export type Notifications = { non_lues: number; notifications: NotificationItem[] };

export type Personne = {
  id: number;
  matricule: string;
  nom_complet: string;
  initiales: string;
  fonction: string;
  organisme: string;
};

export type MessageItem = {
  id: number;
  texte: string;
  envoye_le: string;
  auteur: Personne;
  de_moi: boolean;
  /** Côté client seulement : message optimiste en cours d'envoi. */
  envoi?: boolean;
};

export type ConversationItem = {
  id: number;
  titre: string;
  groupe: boolean;
  interlocuteurs: Personne[];
  dernier_message: MessageItem | null;
  non_lus: number;
  mise_a_jour: string;
};

export type Conversations = { non_lus: number; conversations: ConversationItem[] };
export type Fil = { conversation: ConversationItem; messages: MessageItem[] };

export type OptionCode = { code: string; libelle: string };
export type EntiteTutelle = {
  code: string;
  nom: string;
  pole: string;
  pole_libelle: string;
  niveau?: string;
  niveau_libelle?: string;
  parent?: string;
  parent_nom?: string;
};

export type BranchePlafond = {
  code: string;
  libelle: string;
  entites: string;
  icone: string;
  effectif: number;
  plafond: number;
  vacants: number;
  taux: number;
  note: string;
};

export type DemandeDotation = {
  reference: string;
  entite: string;
  entite_code: string;
  direction: string;
  poste: string;
  nature: string;
  nature_libelle: string;
  impact: number;
  impact_libelle: string;
  statut: string;
  statut_libelle: string;
  visa: string;
  detail: string;
  recu_le: string;
  notifiee: boolean;
};

export type AlertePoste = {
  id: number;
  entite: string;
  entite_code: string;
  intitule: string;
  detail: string;
  postes: number;
  jours: number;
  piste: string;
  traitee: boolean;
};

export type Passerelle = {
  id: number;
  cedant: string;
  recepteur: string;
  profil: string;
  effectif: number;
  statut: string;
  statut_libelle: string;
  note: string;
};

export type JournalEffectif = { reference: string; titre: string; auteur: string; cree_le: string };

export type Dotation = {
  annee: number;
  intitule: string;
  fondement: string;
  effectif: number;
  plafond: number;
  vacants: number;
  taux_occupation: number;
  campagnes_ouvertes: number;
  repartition: { nature: string; libelle: string; total: number }[];
  branches: BranchePlafond[];
  alertes: AlertePoste[];
  demandes: DemandeDotation[];
  passerelles: Passerelle[];
  journal: JournalEffectif[];
  entites: EntiteTutelle[];
  postes: { libelle: string; structures: string[] }[];
  natures: OptionCode[];
  statuts: OptionCode[];
};

export type FiliereBesoin = {
  code: string;
  libelle: string;
  icone: string;
  requis: number;
  couverts: number;
  taux: number;
};

export type FicheBesoin = {
  reference: string;
  entite: string;
  entite_code: string;
  direction: string;
  profil: string;
  grade: string;
  specialite: string;
  volume: number;
  motif: string;
  nature: string;
  nature_libelle: string;
  statut: string;
  statut_libelle: string;
  arbitrage: string;
  visa: string;
  detail: string;
  critique: boolean;
  postes_accordes: number;
  depose_le: string;
  heure: string;
};

export type Besoins = {
  exercice: number;
  ouverte: boolean;
  cadrage: string;
  pea_max: number;
  volume: number;
  entites: number;
  variation: number | null;
  favorables: number;
  postes_favorables: number;
  taux_favorable: number;
  critiques: number;
  alerte_retraites: number;
  agents_repositionnes: number;
  filieres: FiliereBesoin[];
  fiches: FicheBesoin[];
  entites_liste: EntiteTutelle[];
  natures: OptionCode[];
  statuts: OptionCode[];
};

export type CompteUtilisateur = {
  matricule: string;
  nom: string;
  prenoms: string;
  nom_complet: string;
  courriel: string;
  fonction: string;
  role: string;
  organisme: string;
  organisme_nom: string;
  organisme_sigle: string;
  structure: string;
  structure_nom: string;
  pole: string;
  pole_libelle: string;
  superieur: string;
  superieur_nom: string;
  alerte: string;
  interim: string;
  interimaire: string;
  interimaire_nom: string;
  interimaire_texte: string;
  actif: boolean;
  moi: boolean;
  personnalisees: boolean;
  habilitations: string[];
  precisions: Record<string, string>;
};

export type AnnuaireUtilisateurs = {
  utilisateurs: CompteUtilisateur[];
  modules: { libelle: string; fonctions: { id: number; libelle: string }[] }[];
  mes_droits: string[];
  mes_precisions: Record<string, string>;
  roles: { role: string; description: string; superieurs: string[]; droits: string[]; precisions: Record<string, string> }[];
  structures: EntiteTutelle[];
  organismes: Organisme[];
  administrateur?: boolean;
};
