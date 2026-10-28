import { ApiError, api } from "../api/client";
import { CLE_DROITS, type Capacite, type Droits } from "./capacites";
import { queryClient } from "./queryClient";

export { CLE_DROITS };
export type { Capacite, Droits };

/**
 * Ce que le rôle de l'utilisateur peut faire sans connexion. Le réglage vient des paramètres (par rôle) ; le serveur le
 * rappelle au rejeu, donc ce contrôle sert surtout à ne rien garder ni mettre en file qui serait refusé.
 */
export const chargerDroits = () => api<Droits>("/api/v1/hors-ligne/droits/");

/** `undefined` tant que les droits n'ont jamais été reçus (premier démarrage, ou session sans réseau). */
export function droitsConnus(): Capacite[] | undefined {
  return queryClient.getQueryData<Droits>(CLE_DROITS)?.capacites;
}

/** Sans droits connus, rien n'est permis : mieux vaut refuser que garder des données hors du cadre fixé. */
export function autorise(capacite: Capacite): boolean {
  return droitsConnus()?.includes(capacite) ?? false;
}

export const LIBELLE_CAPACITE: Record<Capacite, string> = {
  lecture: "consulter",
  notification: "gérer les notifications",
  conge: "déposer une demande de congé",
  acte: "demander un acte",
  dossier: "modifier le dossier",
  fichier: "joindre un fichier",
};

/** Action refusée avant même l'envoi : le rôle n'a pas le droit de la faire hors ligne. */
export class ErreurHorsLigneInterdite extends ApiError {
  constructor(capacite: Capacite) {
    super(403, `Votre rôle n'est pas autorisé à ${LIBELLE_CAPACITE[capacite]} hors ligne. Reconnectez-vous pour le faire.`);
  }
}
