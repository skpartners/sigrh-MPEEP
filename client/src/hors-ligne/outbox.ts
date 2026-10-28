import {
  chiffrer,
  cleOutbox,
  coffreDisponible,
  dechiffrer,
  detruireCle,
  ecrire,
  supprimer,
  toutes,
  type ChampFormulaire,
  type Enveloppe,
} from "./coffre";

/**
 * File des actions saisies hors ligne (« outbox »).
 *
 * Chaque action est chiffrée sur l'appareil avec la clé de son utilisateur, puis envoyée au retour de la connexion
 * (voir `synchro.ts`). L'identifiant de l'action sert de clé d'idempotence côté serveur : une action envoyée deux fois
 * (coupure après l'envoi) ne s'exécute qu'une fois. La clé de l'utilisateur est détruite quand sa file se vide.
 */

export type StatutAction = "en_attente" | "envoi" | "echec";

export type CorpsAction = { type: "json"; json: string } | { type: "formulaire"; champs: ChampFormulaire[] };

export type ActionEnAttente = {
  /** UUID : sert aussi de clé d'idempotence. */
  id: string;
  matricule: string;
  /** Texte montré à l'utilisateur (« Demande de congé annuel du 4 au 18 mai »). */
  libelle: string;
  route: string;
  methode: "POST" | "PUT" | "PATCH" | "DELETE";
  corps: CorpsAction | null;
  /** Instant de la validation par l'utilisateur : c'est la date qui fait foi (en-tête X-Saisi-Le). */
  saisieLe: string;
  statut: StatutAction;
  tentatives: number;
  /** Raison du dernier refus (statut « echec »). */
  erreur?: string;
};

type Enregistrement = { id: string; ordre: number; matricule: string; enveloppe: Enveloppe };

/** Une action qui n'a pas pu être envoyée dans ce délai est abandonnée : le serveur la refuserait de toute façon. */
export const DUREE_MAX_ATTENTE_MS = 30 * 24 * 3600 * 1000;

let actions: ActionEnAttente[] = [];
const ecouteurs = new Set<() => void>();

export const lireActions = (): ActionEnAttente[] => actions;

export function abonnerActions(ecouteur: () => void): () => void {
  ecouteurs.add(ecouteur);
  return () => ecouteurs.delete(ecouteur);
}

function publier(suivantes: ActionEnAttente[]) {
  actions = suivantes;
  ecouteurs.forEach((ecouteur) => ecouteur());
}

export function nouvelIdentifiant(): string {
  return crypto.randomUUID();
}

async function persister(action: ActionEnAttente): Promise<void> {
  const enveloppe = await chiffrer(cleOutbox(action.matricule), action);
  const enregistrement: Enregistrement = { id: action.id, ordre: Date.parse(action.saisieLe), matricule: action.matricule, enveloppe };
  await ecrire("outbox", action.id, enregistrement);
}

/** Ajoute une action à la file. Lève une erreur si l'appareil ne peut pas la garder chiffrée : on ne l'écrit jamais en clair. */
export async function ajouterAction(action: ActionEnAttente): Promise<void> {
  if (!coffreDisponible()) throw new Error("Cet appareil ne peut pas garder l'action hors ligne : connectez-vous à Internet pour l'envoyer.");
  await persister(action);
  publier([...actions, action].sort((a, b) => Date.parse(a.saisieLe) - Date.parse(b.saisieLe)));
}

export async function mettreAJourAction(id: string, modifications: Partial<ActionEnAttente>): Promise<void> {
  const courante = actions.find((action) => action.id === id);
  if (!courante) return;
  const mise = { ...courante, ...modifications };
  publier(actions.map((action) => (action.id === id ? mise : action)));
  // Le statut « envoi » n'est pas gardé : après un plantage, l'action repart en attente.
  await persister({ ...mise, statut: mise.statut === "envoi" ? "en_attente" : mise.statut }).catch(() => undefined);
}

export async function retirerAction(id: string): Promise<void> {
  const retiree = actions.find((action) => action.id === id);
  publier(actions.filter((action) => action.id !== id));
  await supprimer("outbox", id).catch(() => undefined);
  if (retiree && !actions.some((action) => action.matricule === retiree.matricule)) await detruireCle(cleOutbox(retiree.matricule)).catch(() => undefined);
}

/** Recharge la file d'un utilisateur au démarrage de sa session. Les actions trop anciennes sont écartées. */
export async function chargerActions(matricule: string): Promise<void> {
  if (!coffreDisponible()) return;
  const enregistrements = await toutes<Enregistrement>("outbox").catch(() => []);
  const lues: ActionEnAttente[] = [];
  for (const enregistrement of enregistrements) {
    if (enregistrement.matricule !== matricule) continue;
    const action = await dechiffrer<ActionEnAttente>(cleOutbox(matricule), enregistrement.enveloppe);
    if (!action) {
      await supprimer("outbox", enregistrement.id).catch(() => undefined);
      continue;
    }
    if (Date.now() - Date.parse(action.saisieLe) > DUREE_MAX_ATTENTE_MS) {
      await supprimer("outbox", action.id).catch(() => undefined);
      continue;
    }
    lues.push({ ...action, statut: action.statut === "envoi" ? "en_attente" : action.statut });
  }
  lues.sort((a, b) => Date.parse(a.saisieLe) - Date.parse(b.saisieLe));
  publier(lues);
  if (lues.length === 0) await detruireCle(cleOutbox(matricule)).catch(() => undefined);
}

/** Vide la vue mémoire (changement d'utilisateur). Les actions restent chiffrées sur l'appareil. */
export function oublierActionsEnMemoire(): void {
  publier([]);
}
