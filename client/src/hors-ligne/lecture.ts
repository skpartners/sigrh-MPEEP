import { dehydrate, hydrate, type DehydratedState, type Query, type QueryClient } from "@tanstack/react-query";
import { jetonPresent } from "../api/adresse";
import { CLE_DROITS, type Droits } from "./capacites";
import { CLE_LECTURE, chiffrer, coffreDisponible, dechiffrer, detruireCle, ecrire, lire, supprimer, viderMagasin, type Enveloppe } from "./coffre";

/**
 * Lecture hors ligne : les écrans déjà consultés restent disponibles sans connexion.
 *
 * Le cache de données (React Query) est enregistré chiffré dans IndexedDB, puis rechargé au démarrage. Il ne vit
 * qu'avec la session : à la déconnexion, au refus du jeton ou au démarrage sans jeton, la clé est détruite et les
 * données deviennent illisibles. Un instantané est refusé s'il vient d'une autre version de l'application (la forme
 * des données a pu changer) ou s'il a plus de `DUREE_MAX_MS`.
 */

const CLE_INSTANTANE = "instantane";
const DUREE_MAX_MS = 7 * 24 * 3600 * 1000;
const DELAI_ECRITURE_MS = 2_500;
/** Au-delà, une réponse n'est pas gardée (listes énormes, exports) : elle se recharge en ligne. */
const TAILLE_MAX_REPONSE = 1_500_000;
/** Données qui ne quittent pas la mémoire de la page : échanges privés et comptes des utilisateurs. */
const EXCLUS = new Set(["messagerie", "utilisateurs", "taches"]);

type Instantane = { version: string; ecritLe: number; etat: unknown };

export const versionInstantane = () => `${__VERSION_APPLICATION__}`;

function conserver(requete: Query): boolean {
  if (requete.state.status !== "success") return false;
  const [racine] = requete.queryKey;
  if (typeof racine === "string" && EXCLUS.has(racine)) return false;
  try {
    return JSON.stringify(requete.state.data).length <= TAILLE_MAX_REPONSE;
  } catch {
    return false;
  }
}

// Incrémenté à chaque purge : une écriture commencée avant la déconnexion ne doit pas ressusciter des données effacées.
let generation = 0;

// Vrai quand le rôle n'a pas (ou plus) le droit de consulter hors ligne : la copie est déjà effacée, inutile de recommencer.
let interdit = false;

async function enregistrer(client: QueryClient): Promise<void> {
  if (!jetonPresent()) return;
  // Le droit de garder une copie se règle par rôle dans les paramètres. Tant qu'il n'est pas connu, on n'écrit rien ;
  // s'il est retiré, la copie existante est détruite avec sa clé.
  const droits = client.getQueryData<Droits>(CLE_DROITS);
  if (!droits) return;
  if (!droits.capacites.includes("lecture")) {
    if (!interdit) {
      interdit = true;
      await purgerLecture();
    }
    return;
  }
  interdit = false;
  const courante = generation;
  const etat = dehydrate(client, { shouldDehydrateQuery: conserver });
  const instantane: Instantane = { version: versionInstantane(), ecritLe: Date.now(), etat };
  const enveloppe = await chiffrer(CLE_LECTURE, instantane);
  if (courante !== generation || !jetonPresent()) return;
  await ecrire("lecture", CLE_INSTANTANE, enveloppe);
}

/** Recharge le cache enregistré. Sans effet si rien n'est gardé, si c'est trop ancien ou d'une autre version. */
export async function restaurerLecture(client: QueryClient): Promise<boolean> {
  if (!coffreDisponible()) return false;
  try {
    const enveloppe = await lire<Enveloppe>("lecture", CLE_INSTANTANE);
    if (!enveloppe) return false;
    const instantane = await dechiffrer<Instantane>(CLE_LECTURE, enveloppe);
    if (!instantane || instantane.version !== versionInstantane() || Date.now() - instantane.ecritLe > DUREE_MAX_MS) {
      await purgerLecture();
      return false;
    }
    hydrate(client, instantane.etat as DehydratedState);
    return true;
  } catch {
    return false;
  }
}

/** Enregistre le cache à chaque changement, au plus une fois par `DELAI_ECRITURE_MS`. */
export function brancherEnregistrement(client: QueryClient): () => void {
  if (!coffreDisponible()) return () => undefined;
  let minuteur = 0;
  const planifier = () => {
    if (minuteur) return;
    minuteur = window.setTimeout(() => {
      minuteur = 0;
      void enregistrer(client).catch(() => undefined);
    }, DELAI_ECRITURE_MS);
  };
  const desabonner = client.getQueryCache().subscribe((evenement) => {
    if (evenement.type === "updated" || evenement.type === "removed") planifier();
  });
  // Un onglet qui se ferme ne doit pas perdre les dernières lectures.
  const fermeture = () => void enregistrer(client).catch(() => undefined);
  window.addEventListener("pagehide", fermeture);
  return () => {
    window.clearTimeout(minuteur);
    desabonner();
    window.removeEventListener("pagehide", fermeture);
  };
}

/** Efface les écrans gardés : les données sont supprimées et la clé détruite. */
export async function purgerLecture(): Promise<void> {
  generation += 1;
  if (!coffreDisponible()) return;
  try {
    await supprimer("lecture", CLE_INSTANTANE);
    await viderMagasin("lecture");
    await detruireCle(CLE_LECTURE);
  } catch {
    /* rien à effacer */
  }
}
