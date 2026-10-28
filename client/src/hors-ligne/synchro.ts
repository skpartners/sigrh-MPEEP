import { ApiError, ErreurReseau, api } from "../api/client";
import { champsVersFormulaire } from "./coffre";
import { auRetourDeConnexion, etatConnexion } from "./connexion";
import { entetesRejeu } from "./entetes";
import { ajouterAction, lireActions, mettreAJourAction, nouvelIdentifiant, retirerAction, type ActionEnAttente } from "./outbox";
import { queryClient } from "./queryClient";

/**
 * Synchronisation : envoie, dans l'ordre de saisie, les actions gardées hors ligne.
 *
 * - Déclenchée au retour de la connexion, quand une action vient d'être mise en file, au retour sur l'onglet et
 *   toutes les 30 s tant qu'il reste des actions à envoyer.
 * - Un seul onglet à la fois (Web Locks) : deux onglets ouverts n'envoient pas les mêmes actions.
 * - Chaque action porte sa clé d'idempotence : un renvoi après une coupure ne la fait pas deux fois.
 * - Refus du serveur (règle métier, saisie trop ancienne…) : l'action passe en « à vérifier » avec la raison ; les
 *   suivantes continuent. Panne réseau ou serveur : l'envoi s'arrête et reprendra plus tard.
 */

export const EVENEMENT_SYNCHRO = "sigrh:synchro";

export type EvenementSynchro =
  | { type: "envoyee"; libelle: string }
  | { type: "refusee"; libelle: string; message: string }
  | { type: "terminee"; envoyees: number; refusees: number };

const REPRISE_MS = 30_000;
const TENTATIVES_MAX = 5;

let enCours = false;
let minuteur = 0;

function annoncer(detail: EvenementSynchro) {
  window.dispatchEvent(new CustomEvent<EvenementSynchro>(EVENEMENT_SYNCHRO, { detail }));
}

function corpsDe(action: ActionEnAttente): BodyInit | undefined {
  if (!action.corps) return undefined;
  return action.corps.type === "json" ? action.corps.json : champsVersFormulaire(action.corps.champs);
}

export function enAttenteDEnvoi(): ActionEnAttente[] {
  return lireActions().filter((action) => action.statut === "en_attente");
}

/** Le résultat d'un envoi : on continue, on s'arrête (réseau, serveur) ou on ressaie plus tard. */
type Issue = "envoyee" | "refusee" | "arret";

async function envoyer(action: ActionEnAttente): Promise<Issue> {
  await mettreAJourAction(action.id, { statut: "envoi" });
  try {
    await api(action.route, {
      method: action.methode,
      body: corpsDe(action),
      headers: entetesRejeu(action.id, action.saisieLe, true),
    });
    await retirerAction(action.id);
    annoncer({ type: "envoyee", libelle: action.libelle });
    return "envoyee";
  } catch (cause) {
    if (cause instanceof ErreurReseau) {
      await mettreAJourAction(action.id, { statut: "en_attente" });
      return "arret";
    }
    if (cause instanceof ApiError) {
      // Le serveur travaille encore sur la même clé : on réessaiera.
      if (cause.status === 409) {
        await mettreAJourAction(action.id, { statut: "en_attente" });
        return "arret";
      }
      // Panne du serveur : plusieurs essais, puis l'action est signalée à l'utilisateur.
      if (cause.status >= 500) {
        const tentatives = action.tentatives + 1;
        if (tentatives >= TENTATIVES_MAX) {
          await mettreAJourAction(action.id, { statut: "echec", tentatives, erreur: "Le serveur n'a pas pu traiter cette action. Réessayez plus tard." });
          annoncer({ type: "refusee", libelle: action.libelle, message: "Le serveur n'a pas pu traiter cette action." });
          return "refusee";
        }
        await mettreAJourAction(action.id, { statut: "en_attente", tentatives });
        return "arret";
      }
      await mettreAJourAction(action.id, { statut: "echec", erreur: cause.message });
      annoncer({ type: "refusee", libelle: action.libelle, message: cause.message });
      return "refusee";
    }
    await mettreAJourAction(action.id, { statut: "en_attente" });
    return "arret";
  }
}

async function parcourir(matricule: string | null): Promise<void> {
  let envoyees = 0;
  let refusees = 0;
  for (const action of enAttenteDEnvoi()) {
    if (matricule && action.matricule !== matricule) continue;
    if (!etatConnexion()) break;
    const issue = await envoyer(action);
    if (issue === "arret") break;
    if (issue === "envoyee") envoyees += 1;
    else refusees += 1;
  }
  if (envoyees + refusees > 0) {
    // Les écrans se rechargent : la demande envoyée apparaît dans le dossier, le solde est à jour.
    await queryClient.invalidateQueries();
    annoncer({ type: "terminee", envoyees, refusees });
  }
}

/** Lance la synchronisation si rien ne l'empêche. Sans effet si elle tourne déjà (ici ou dans un autre onglet). */
export async function synchroniser(matricule: string | null = null): Promise<void> {
  if (enCours || !etatConnexion() || enAttenteDEnvoi().length === 0) return;
  enCours = true;
  try {
    if (navigator.locks) await navigator.locks.request("sigrh-synchro", { ifAvailable: true }, async (verrou) => verrou && parcourir(matricule));
    else await parcourir(matricule);
  } finally {
    enCours = false;
    programmerReprise(matricule);
  }
}

function programmerReprise(matricule: string | null) {
  window.clearTimeout(minuteur);
  if (enAttenteDEnvoi().length > 0) minuteur = window.setTimeout(() => void synchroniser(matricule), REPRISE_MS);
}

/**
 * Renvoie une action refusée. Le serveur a mémorisé son refus sous la clé d'origine : l'action repart donc sous une
 * nouvelle clé, avec sa date de saisie d'origine.
 */
export async function reessayerAction(id: string): Promise<void> {
  const action = lireActions().find((item) => item.id === id);
  if (!action) return;
  await ajouterAction({ ...action, id: nouvelIdentifiant(), statut: "en_attente", tentatives: 0, erreur: undefined });
  await retirerAction(id);
  demanderSynchronisation();
}

/** Renonce à une action : elle n'est jamais envoyée. */
export const abandonnerAction = (id: string): Promise<void> => retirerAction(id);

let matriculeCourant: string | null = null;

/** Une action vient d'être mise en file : on tente l'envoi (sans effet tant que la connexion n'est pas revenue). */
export function demanderSynchronisation(): void {
  void synchroniser(matriculeCourant);
}

/** Branche les déclencheurs pour la session d'un utilisateur. Rend la fonction qui les débranche. */
export function demarrerSynchronisation(matricule: string): () => void {
  matriculeCourant = matricule;
  const retourOnglet = () => {
    if (document.visibilityState === "visible") void synchroniser(matricule);
  };
  const desabonner = auRetourDeConnexion(() => void synchroniser(matricule));
  document.addEventListener("visibilitychange", retourOnglet);
  void synchroniser(matricule);
  return () => {
    matriculeCourant = null;
    desabonner();
    document.removeEventListener("visibilitychange", retourOnglet);
    window.clearTimeout(minuteur);
  };
}
