/**
 * Coffre local : IndexedDB + chiffrement AES-GCM.
 *
 * Rien de ce qui est gardé pour le mode hors ligne n'est écrit en clair sur l'appareil. Les clés sont des `CryptoKey`
 * non exportables : le navigateur les garde sans jamais permettre d'en lire la valeur, et supprimer la clé rend les
 * données illisibles (« effacement par destruction de clé »).
 *
 * - `lecture` : clé unique du cache des écrans consultés ; détruite à la déconnexion.
 * - `outbox:<matricule>` : clé des actions en attente d'un utilisateur ; conservée tant qu'il en reste.
 *
 * Sans contexte sécurisé (HTTPS ou localhost) ou sans WebCrypto, le coffre est indisponible et le mode hors ligne
 * ne garde rien : il n'y a pas de repli en clair.
 */

const BASE = "sigrh-hors-ligne";
const VERSION_BASE = 1;
export type Magasin = "cles" | "lecture" | "outbox";
const MAGASINS: Magasin[] = ["cles", "lecture", "outbox"];

export const CLE_LECTURE = "lecture";
export const cleOutbox = (matricule: string) => `outbox:${matricule}`;

export function coffreDisponible(): boolean {
  return typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && Boolean(crypto.subtle) && window.isSecureContext;
}

let ouverture: Promise<IDBDatabase> | null = null;

function ouvrir(): Promise<IDBDatabase> {
  ouverture ??= new Promise<IDBDatabase>((resolve, reject) => {
    const requete = indexedDB.open(BASE, VERSION_BASE);
    requete.onupgradeneeded = () => {
      for (const nom of MAGASINS) if (!requete.result.objectStoreNames.contains(nom)) requete.result.createObjectStore(nom);
    };
    requete.onsuccess = () => {
      requete.result.onversionchange = () => {
        requete.result.close();
        ouverture = null;
      };
      resolve(requete.result);
    };
    requete.onerror = () => {
      ouverture = null;
      reject(requete.error);
    };
  });
  return ouverture;
}

async function transaction<T>(magasin: Magasin, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const base = await ouvrir();
  return new Promise<T>((resolve, reject) => {
    const tx = base.transaction(magasin, mode);
    const requete = action(tx.objectStore(magasin));
    tx.oncomplete = () => resolve(requete.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const lire = <T>(magasin: Magasin, cle: string) => transaction<T | undefined>(magasin, "readonly", (store) => store.get(cle));
export const ecrire = (magasin: Magasin, cle: string, valeur: unknown) => transaction(magasin, "readwrite", (store) => store.put(valeur, cle));
export const supprimer = (magasin: Magasin, cle: string) => transaction(magasin, "readwrite", (store) => store.delete(cle));
export const viderMagasin = (magasin: Magasin) => transaction(magasin, "readwrite", (store) => store.clear());

export async function toutes<T>(magasin: Magasin): Promise<T[]> {
  return transaction<T[]>(magasin, "readonly", (store) => store.getAll());
}

// --- Chiffrement ---------------------------------------------------------------------

export type Enveloppe = { iv: Uint8Array<ArrayBuffer>; donnees: ArrayBuffer };

async function cle(nom: string, creer: boolean): Promise<CryptoKey | null> {
  const existante = await lire<CryptoKey>("cles", nom);
  if (existante) return existante;
  if (!creer) return null;
  const nouvelle = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await ecrire("cles", nom, nouvelle);
  return nouvelle;
}

export async function detruireCle(nom: string): Promise<void> {
  await supprimer("cles", nom);
}

export async function chiffrer(nom: string, valeur: unknown): Promise<Enveloppe> {
  const secret = await cle(nom, true);
  if (!secret) throw new Error("Clé locale indisponible.");
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const clair = new TextEncoder().encode(JSON.stringify(valeur));
  return { iv, donnees: await crypto.subtle.encrypt({ name: "AES-GCM", iv }, secret, clair) };
}

/** Rend `null` si la clé a disparu ou si les données ont été altérées : l'appelant les ignore. */
export async function dechiffrer<T>(nom: string, enveloppe: Enveloppe): Promise<T | null> {
  try {
    const secret = await cle(nom, false);
    if (!secret) return null;
    const clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: enveloppe.iv }, secret, enveloppe.donnees);
    return JSON.parse(new TextDecoder().decode(clair)) as T;
  } catch {
    return null;
  }
}

// --- Fichiers dans une file (FormData) ------------------------------------------------

export type ChampFormulaire =
  | { nom: string; texte: string }
  | { nom: string; fichier: { nom: string; type: string; base64: string } };

function versBase64(octets: Uint8Array): string {
  let sortie = "";
  const PAS = 0x8000;
  for (let i = 0; i < octets.length; i += PAS) sortie += String.fromCharCode(...octets.subarray(i, i + PAS));
  return btoa(sortie);
}

function depuisBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export async function formulaireVersChamps(formulaire: FormData): Promise<ChampFormulaire[]> {
  const champs: ChampFormulaire[] = [];
  for (const [nom, valeur] of formulaire.entries()) {
    if (typeof valeur === "string") champs.push({ nom, texte: valeur });
    else champs.push({ nom, fichier: { nom: valeur.name, type: valeur.type, base64: versBase64(new Uint8Array(await valeur.arrayBuffer())) } });
  }
  return champs;
}

export function champsVersFormulaire(champs: ChampFormulaire[]): FormData {
  const formulaire = new FormData();
  for (const champ of champs) {
    if ("texte" in champ) formulaire.append(champ.nom, champ.texte);
    else formulaire.append(champ.nom, new File([depuisBase64(champ.fichier.base64).buffer as ArrayBuffer], champ.fichier.nom, { type: champ.fichier.type }));
  }
  return formulaire;
}
