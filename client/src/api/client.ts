import { purgerLecture } from "../hors-ligne/lecture";
import { signalerCoupure } from "../hors-ligne/connexion";
import { RACINE, TOKEN_KEY, adresseApi, apiBaseUrl } from "./adresse";
import { attendreTache, type SuiviTache } from "./taches";

export { adresseApi, apiBaseUrl };

export function pageConnexion(): string {
  return `${RACINE}/connexion`;
}

/** Une URL média (`/sigrh/media/…`) suit l'origine de l'API. En production, c'est le même hôte. */
export function mediaUrl(path: string | undefined): string {
  if (!path) return "";
  return path.startsWith("http") ? path : adresseApi(path);
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}

/** `remember` : le jeton survit à la fermeture du navigateur (« Mémoriser sur ce terminal »). */
export function setToken(token: string | null, remember = false): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  // Plus de session : les écrans gardés pour le mode hors ligne deviennent illisibles (leur clé est détruite).
  else void purgerLecture();
}

/** Remplace le jeton de la session en cours (après un changement de mot de passe), sur le même stockage. */
export function remplacerToken(token: string): void {
  setToken(token, localStorage.getItem(TOKEN_KEY) !== null);
}

/** Ferme la session côté API (révocation du jeton) puis localement, même si l'API est injoignable. */
export async function logout(): Promise<void> {
  try {
    await api("/api/v1/auth/logout/", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export type ErreurLigne = { ligne: number; message: string };

export class ApiError extends Error {
  status: number;
  erreurs: ErreurLigne[];

  constructor(status: number, message: string, erreurs: ErreurLigne[] = []) {
    super(message);
    this.status = status;
    this.erreurs = erreurs;
  }
}

/** Le serveur n'a pas pu être joint (pas de réponse) : à distinguer d'un refus du serveur. */
export class ErreurReseau extends ApiError {
  constructor() {
    super(0, "Le serveur est injoignable : vous êtes hors ligne.");
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Token ${token}`);

  let response: Response;
  try {
    response = await fetch(adresseApi(path), { ...options, headers });
  } catch {
    signalerCoupure();
    throw new ErreurReseau();
  }
  // Jeton expiré ou révoqué : on repart de la connexion plutôt que de laisser l'écran en erreur.
  if (response.status === 401 && token && !path.startsWith("/api/v1/auth/")) {
    setToken(null);
    window.location.replace(pageConnexion());
  }
  if (!response.ok) {
    let detail = "La requête n'a pas abouti.";
    let erreurs: ErreurLigne[] = [];
    try {
      const payload = (await response.json()) as { detail?: string; erreurs?: ErreurLigne[] };
      if (payload.detail) detail = payload.detail;
      if (Array.isArray(payload.erreurs)) {
        erreurs = payload.erreurs.filter((item) => item && typeof item.ligne === "number" && typeof item.message === "string");
      }
    } catch {
      detail = response.statusText || detail;
    }
    throw new ApiError(response.status, detail, erreurs);
  }
  // 204 (suppression) : pas de corps à lire.
  if (response.status === 204) return undefined as T;
  const corps = (await response.json()) as T;
  // 202 : le serveur a confié le traitement à un worker ; on attend sa fin et on rend la réponse de la vue, comme avant.
  const tache = response.status === 202 ? (corps as { tache?: string; libelle?: string }) : null;
  if (tache?.tache) {
    const suivi = await attendreTache(tache.tache, tache.libelle ?? "Traitement", lireTache);
    if (suivi.statut === "echec") {
      const resultat = (suivi.resultat ?? {}) as { detail?: string; erreurs?: ErreurLigne[] };
      throw new ApiError(suivi.code || 500, resultat.detail || suivi.message || "Le traitement a échoué.", Array.isArray(resultat.erreurs) ? resultat.erreurs : []);
    }
    return suivi.resultat as T;
  }
  return corps;
}

const lireTache = (id: string) => api<SuiviTache>(`/api/v1/taches/${id}/`);

/** Télécharge un fichier binaire authentifié (archive ZIP, par exemple). */
export async function telecharger(path: string, nom: string): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Token ${token}`);
  const response = await fetch(adresseApi(path), { headers });
  if (response.status === 401 && token) {
    setToken(null);
    window.location.replace(pageConnexion());
  }
  if (!response.ok) {
    let detail = "La requête n'a pas abouti.";
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      detail = response.statusText || detail;
    }
    throw new ApiError(response.status, detail);
  }
  // 202 : fichier préparé par un worker. On attend la fin de la tâche, puis on récupère le fichier produit.
  if (response.status === 202 && (response.headers.get("Content-Type") ?? "").includes("json")) {
    const { tache, libelle } = (await response.json()) as { tache: string; libelle?: string };
    const suivi = await attendreTache(tache, libelle ?? nom, lireTache);
    if (suivi.statut === "echec") throw new ApiError(suivi.code || 500, ((suivi.resultat ?? {}) as { detail?: string }).detail || suivi.message || "Le traitement a échoué.");
    await telecharger(`/api/v1/taches/${tache}/fichier/`, suivi.nom_fichier || nom);
    return;
  }
  enregistrerFichier(await response.blob(), response.headers.get("Content-Disposition") ?? "", nom);
}

function enregistrerFichier(blob: Blob, disposition: string, nom: string) {
  const serveur = disposition.match(/filename="([^"]+)"/)?.[1];
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = serveur || nom;
  lien.click();
  URL.revokeObjectURL(url);
}

/** Récupère le fichier d'une tâche terminée (la liste de l'indicateur propose ce téléchargement). */
export async function telechargerTache(suivi: SuiviTache): Promise<void> {
  await telecharger(`/api/v1/taches/${suivi.id}/fichier/`, suivi.nom_fichier || "fichier");
}

/** Envoie un formulaire avec fichiers en suivant l'avancement de l'envoi (fetch ne le permet pas). */
export function televerser<T>(path: string, corps: FormData, onProgression?: (pourcentage: number) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const requete = new XMLHttpRequest();
    requete.open("POST", adresseApi(path));
    requete.setRequestHeader("Accept", "application/json");
    const token = getToken();
    if (token) requete.setRequestHeader("Authorization", `Token ${token}`);
    requete.upload.onprogress = (evenement) => {
      if (evenement.lengthComputable) onProgression?.(Math.round((evenement.loaded / evenement.total) * 100));
    };
    requete.onerror = () => reject(new ApiError(0, "La connexion au serveur a été interrompue."));
    requete.onload = () => {
      let donnees: unknown = null;
      try {
        donnees = JSON.parse(requete.responseText);
      } catch {
        donnees = null;
      }
      if (requete.status >= 200 && requete.status < 300) resolve(donnees as T);
      else reject(new ApiError(requete.status, (donnees as { detail?: string } | null)?.detail || "L'envoi n'a pas abouti."));
    };
    requete.send(corps);
  });
}

/** Récupère un fichier protégé (média de la messagerie) sous forme d'URL locale : une balise <img> n'envoie pas le jeton. */
export async function chargerMedia(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Token ${token}`);
  const reponse = await fetch(adresseApi(path), { headers });
  if (!reponse.ok) {
    let detail = "Le fichier n'a pas pu être chargé.";
    try {
      detail = ((await reponse.json()) as { detail?: string }).detail || detail;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(reponse.status, detail);
  }
  return reponse.blob();
}
