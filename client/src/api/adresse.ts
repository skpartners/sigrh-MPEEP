export const RACINE = "/sigrh";

const BASE = (import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8101")
  : (import.meta.env.VITE_API_BASE_URL || "")
).replace(/\/$/, "");

export function apiBaseUrl(): string {
  return BASE;
}

export function adresseApi(path: string): string {
  const chemin = path.startsWith(RACINE) ? path : `${RACINE}${path.startsWith("/") ? path : `/${path}`}`;
  return `${BASE}${chemin}`;
}

export const TOKEN_KEY = "sigrh_token";

/** Une session est ouverte sur cet appareil (jeton de l'onglet, ou jeton mémorisé sur le terminal). */
export function jetonPresent(): boolean {
  return Boolean(sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY));
}
