import type { SessionUser } from "../api/types";
import { ErreurReseau, api } from "../api/client";
import { etatConnexion } from "./connexion";
import { ErreurHorsLigneInterdite, autorise, type Capacite } from "./droits";
import { formulaireVersChamps } from "./coffre";
import { ajouterAction, nouvelIdentifiant, type ActionEnAttente, type CorpsAction } from "./outbox";
import { queryClient } from "./queryClient";
import { entetesRejeu } from "./entetes";
import { demanderSynchronisation } from "./synchro";

export type ResultatHorsLigne<T> = { enAttente: false; reponse: T } | { enAttente: true; action: ActionEnAttente };

type Options = {
  methode?: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Corps JSON (objet) ou formulaire avec fichiers. */
  corps?: unknown | FormData;
  /** Texte montré dans la liste des actions en attente. */
  libelle: string;
  /** Droit(s) hors ligne que le rôle doit avoir (réglés dans les paramètres) pour que l'action puisse être mise en file. */
  capacite: Capacite | Capacite[];
};

async function corpsEnregistrable(corps: unknown): Promise<CorpsAction | null> {
  if (corps === undefined || corps === null) return null;
  if (corps instanceof FormData) return { type: "formulaire", champs: await formulaireVersChamps(corps) };
  return { type: "json", json: JSON.stringify(corps) };
}

/**
 * Envoie une action qui peut se faire hors ligne. En ligne, elle part tout de suite ; sans connexion (ou si la connexion
 * tombe pendant l'envoi), elle est gardée chiffrée sur l'appareil et partira seule au retour du réseau.
 *
 * La même clé d'idempotence sert à l'envoi immédiat et à l'envoi différé : si la réponse s'est perdue alors que le
 * serveur avait traité l'action, le rejeu ne la fait pas deux fois.
 */
export async function apiHorsLigne<T>(path: string, { methode = "POST", corps, libelle, capacite }: Options): Promise<ResultatHorsLigne<T>> {
  const id = nouvelIdentifiant();
  const saisieLe = new Date().toISOString();

  const mettreEnFile = async (): Promise<ResultatHorsLigne<T>> => {
    const manquante = [capacite].flat().find((code) => !autorise(code));
    if (manquante) throw new ErreurHorsLigneInterdite(manquante);
    const matricule = queryClient.getQueryData<SessionUser>(["me"])?.matricule;
    if (!matricule) throw new ErreurReseau();
    const action: ActionEnAttente = {
      id,
      matricule,
      libelle,
      route: path,
      methode,
      corps: await corpsEnregistrable(corps),
      saisieLe,
      statut: "en_attente",
      tentatives: 0,
    };
    await ajouterAction(action);
    demanderSynchronisation();
    return { enAttente: true, action };
  };

  if (!etatConnexion()) return mettreEnFile();
  try {
    const reponse = await api<T>(path, {
      method: methode,
      body: corps === undefined ? undefined : corps instanceof FormData ? corps : JSON.stringify(corps),
      headers: entetesRejeu(id, saisieLe),
    });
    return { enAttente: false, reponse };
  } catch (cause) {
    if (cause instanceof ErreurReseau) return mettreEnFile();
    throw cause;
  }
}
