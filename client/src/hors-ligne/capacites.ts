/** Droits hors ligne d'un rôle. Module sans dépendance : il peut être importé de partout sans créer de cycle. */
export type Capacite = "lecture" | "notification" | "conge" | "acte" | "dossier" | "fichier";
export type Droits = { capacites: Capacite[] };

export const CLE_DROITS = ["hors-ligne-droits"] as const;
