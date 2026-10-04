// Contrat de l'API /api/v1/formation/ (sous-direction de la formation continue).

export type EtatSession = "a_planifier" | "planifiee" | "inscriptions_ouvertes" | "en_cours" | "terminee" | "annulee";
export type EtatCandidature = "avis_hierarchique" | "controle_sd" | "visa_drh" | "retenue" | "refusee";

export type TypeFormation = {
  code: string;
  libelle: string;
  ordre: number;
  publics: string[];
  piece_requise: boolean;
  piece_libelle: string;
  sessions: number;
};

export type Session = {
  code: string;
  libelle: string;
  objectif: string;
  cadre_budgetaire: string;
  type: string;
  type_libelle: string;
  etat: EtatSession;
  etat_libelle: string;
  ouverte: boolean;
  prestataire: { id: number; nom: string } | null;
  lieu: string;
  formateur: string;
  date_debut: string | null;
  date_fin: string | null;
  heures: number;
  places: number;
  cout_participant: number;
  motif_annulation: string;
  cloturee_le: string | null;
  candidatures: number;
  a_traiter: number;
  occupees: number;
  retenues: number;
  presents: number;
  emargement_complet: boolean;
  satisfaction: number | null;
  engage: number;
};

export type Candidature = {
  id: number;
  reference: string;
  etat: EtatCandidature;
  etat_libelle: string;
  etape: string;
  deposee_le: string;
  present: boolean | null;
  note_satisfaction: number | null;
  piece: boolean;
  session: { code: string; libelle: string };
  agent: { matricule: string; nom_complet: string; initiales: string; fonction: string; organisme: string };
};

export type Prestataire = {
  id: number;
  nom: string;
  categorie: "ecole" | "institut" | "cabinet" | "interne";
  categorie_libelle: string;
  specialites: string;
  ville: string;
  contact_nom: string;
  contact_email: string;
  contact_telephone: string;
  convention_debut: string | null;
  convention_fin: string | null;
  convention_valide: boolean;
  actif: boolean;
  sessions: number;
  heures: number;
};

export type Besoin = {
  id: number;
  intitule: string;
  effectif: number;
  priorite: "haute" | "moyenne" | "basse";
  priorite_libelle: string;
  statut: "exprime" | "retenu" | "couvert";
  statut_libelle: string;
  exprime_le: string;
  organisme: { code: string; nom: string };
  type: string;
  type_libelle: string;
  session: { code: string; libelle: string } | null;
};

export type TableauFormation = {
  exercice: number;
  plan: { annee: number; dotation: number; objectif_agents: number };
  indicateurs: {
    engage: number;
    formes: number;
    sessions: number;
    sessions_ouvertes: number;
    sessions_en_cours: number;
    candidatures_a_traiter: number;
    satisfaction: number | null;
    evaluations: number;
    prestataires_actifs: number;
  };
  budget_par_type: { type: string; libelle: string; montant: number }[];
  recensement: { type: string; libelle: string; besoins: number; structures: number; effectif: number; couverts: number }[];
  types: TypeFormation[];
  sessions: Session[];
  inscriptions: Candidature[];
  prestataires: Prestataire[];
  besoins: Besoin[];
  organismes: { code: string; nom: string }[];
};

export const CLE_FORMATION = ["formation"];
