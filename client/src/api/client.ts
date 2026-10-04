const RACINE = "/sigrh";
const BASE = (import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8101")
  : (import.meta.env.VITE_API_BASE_URL || "")
).replace(/\/$/, "");

const TOKEN_KEY = "sigrh_token";

export function apiBaseUrl(): string {
  return BASE;
}

function adresseApi(path: string): string {
  const chemin = path.startsWith(RACINE) ? path : `${RACINE}${path.startsWith("/") ? path : `/${path}`}`;
  return `${BASE}${chemin}`;
}

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

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Token ${token}`);

  const response = await fetch(adresseApi(path), { ...options, headers });
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
  return (await response.json()) as T;
}

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
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const serveur = disposition.match(/filename="([^"]+)"/)?.[1];
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = serveur || nom;
  lien.click();
  URL.revokeObjectURL(url);
}
