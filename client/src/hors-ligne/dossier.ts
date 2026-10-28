import type { QueryClient } from "@tanstack/react-query";
import type { Dossier } from "../api/types";
import { apiHorsLigne } from "./envoi";
import type { Capacite } from "./capacites";
import type { ActionEnAttente } from "./outbox";

type Annonceur = {
  run<T>(label: string, task: () => Promise<T>, options?: { success?: { title: string; message?: string }; error?: string }): Promise<T>;
  toast(title: string, message?: string, tone?: "success" | "error" | "info"): void;
};

type Demande = {
  feedback: Annonceur;
  client: QueryClient;
  matricule: string;
  /** Texte de l'indicateur d'attente pendant l'envoi en ligne. */
  enCours: string;
  route: string;
  methode?: "POST" | "PUT" | "PATCH" | "DELETE";
  corps?: unknown | FormData;
  /** Texte montré dans la liste des actions en attente. */
  libelle: string;
  capacite: Capacite | Capacite[];
  /** Annonce après un envoi réussi. */
  succes: { title: string; message?: string };
};

/** Ce que chaque écran précise : le reste (annonceur, cache, texte d'attente) vient du contexte de l'écran. */
export type DemandeDossier = Omit<Demande, "feedback" | "client" | "matricule" | "enCours" | "succes">;

/** Vrai si l'action jointe à la file contient un fichier : il attend le retour du réseau pour être analysé. */
export const aUnFichier = (action: Pick<ActionEnAttente, "corps">): boolean =>
  action.corps?.type === "formulaire" && action.corps.champs.some((champ) => "fichier" in champ);

/** Annonce qu'une action est gardée sur l'appareil, et que ses fichiers attendront l'analyse antivirus du retour en ligne. */
export function annoncerAttente(feedback: Pick<Annonceur, "toast">, action: ActionEnAttente): void {
  feedback.toast(
    "Enregistré hors ligne",
    aUnFichier(action)
      ? "La modification et la pièce jointe sont gardées chiffrées sur cet appareil. Elles partiront au retour de la connexion, et la pièce sera alors analysée par l'antivirus."
      : "La modification est gardée chiffrée sur cet appareil. Elle partira au retour de la connexion.",
    "info",
  );
}

/**
 * Modifie le dossier d'un agent, en ligne ou hors ligne.
 *
 * En ligne, l'action part tout de suite et le dossier reçu remplace celui du cache. Sans connexion, elle est gardée
 * chiffrée sur l'appareil : les informations comme les fichiers partent au retour du réseau, et les fichiers passent
 * alors seulement par l'analyse antivirus du serveur. Rend `true` si l'action est partie, `false` si elle attend.
 * Une erreur du serveur (refus métier) est relancée à l'appelant.
 */
export async function modifierDossier({ feedback, client, matricule, enCours, route, methode = "POST", corps, libelle, capacite, succes }: Demande): Promise<boolean> {
  const resultat = await feedback.run(enCours, () => apiHorsLigne<Dossier>(route, { methode, corps, libelle, capacite }));
  if (resultat.enAttente) {
    annoncerAttente(feedback, resultat.action);
    // Hors ligne, le rechargement attendrait le retour du réseau : on ne bloque personne.
    void client.invalidateQueries({ queryKey: ["agent", matricule] });
    return false;
  }
  client.setQueryData(["agent", matricule], resultat.reponse);
  feedback.toast(succes.title, succes.message, "success");
  return true;
}
