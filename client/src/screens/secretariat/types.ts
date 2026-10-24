import type { AgentDocument } from "../../ui/DocumentOfficiel";

/** Une demande de congé ou d'acte suivie par le secrétariat. */
export type LigneSecretariat = {
  reference: string;
  categorie: "acte" | "conge";
  type_acte: string;
  nature: string;
  agent: { matricule: string; nom_complet: string; structure: string };
  depose_le: string;
  debut: string;
  fin: string;
  etape: string;
  responsable: string;
  /** circuit : encore en validation ; a_signer : validée de bout en bout ; signe : document signé versé. */
  statut: "circuit" | "a_signer" | "signe" | "refusee";
  fait: number;
  total: number;
  visas: { ordre: number; instance: string; titulaire: string; avis: string; date: string }[];
  signe_le: string;
  signe_par: string;
  /** Impression permise : circuit entièrement validé, ou administrateur. Sinon, simple prévisualisation. */
  imprimable: boolean;
  document: {
    agent: AgentDocument;
    conge: { exercice: number | null; exercices: number[]; type: string; libelle: string; annuel: boolean; jours: number; rang: number; periodes: number } | null;
  } | null;
};

export const CLE_SECRETARIAT = ["secretariat"] as const;
