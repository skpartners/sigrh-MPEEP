import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { adresseApi } from "../api/adresse";

/**
 * État de la connexion au serveur SIGRH (pas seulement au réseau : un Wi-Fi sans accès au serveur est « hors ligne »).
 *
 * `navigator.onLine` ne fait que signaler les ruptures franches. L'état réel vient donc de trois sources :
 *  - les événements `online` / `offline` du navigateur ;
 *  - l'échec d'une requête (`signalerCoupure`, appelé par le client d'API) ;
 *  - un sondage de la route de santé, tant que l'on se croit hors ligne (retour de connexion) et au retour sur l'onglet.
 */

const SONDAGE_HORS_LIGNE_MS = 5_000;
const DELAI_SONDE_MS = 4_000;

let enLigne = typeof navigator === "undefined" ? true : navigator.onLine;
let sondage = 0;
const ecouteurs = new Set<() => void>();
const retours = new Set<() => void>();

export const etatConnexion = (): boolean => enLigne;

export function abonnerConnexion(ecouteur: () => void): () => void {
  ecouteurs.add(ecouteur);
  return () => ecouteurs.delete(ecouteur);
}

/** Appelé à chaque retour de la connexion (hors ligne → en ligne) : c'est le signal de la synchronisation. */
export function auRetourDeConnexion(ecouteur: () => void): () => void {
  retours.add(ecouteur);
  return () => retours.delete(ecouteur);
}

function definir(valeur: boolean) {
  if (valeur === enLigne) return;
  enLigne = valeur;
  onlineManager.setOnline(valeur);
  ecouteurs.forEach((ecouteur) => ecouteur());
  if (valeur) {
    window.clearInterval(sondage);
    sondage = 0;
    retours.forEach((ecouteur) => ecouteur());
  } else if (!sondage) {
    sondage = window.setInterval(() => void verifierConnexion(), SONDAGE_HORS_LIGNE_MS);
  }
}

/** Interroge la route de santé de l'API. Met l'état à jour et le rend. */
export async function verifierConnexion(): Promise<boolean> {
  const controle = new AbortController();
  const delai = window.setTimeout(() => controle.abort(), DELAI_SONDE_MS);
  try {
    const reponse = await fetch(`${adresseApi("/api/v1/health/")}?sonde=${Date.now()}`, { cache: "no-store", signal: controle.signal });
    definir(reponse.ok || reponse.status < 500);
  } catch {
    definir(false);
  } finally {
    window.clearTimeout(delai);
  }
  return enLigne;
}

/** Une requête vient d'échouer faute de réseau : l'état passe hors ligne et le sondage de retour démarre. */
export function signalerCoupure(): void {
  definir(false);
}

/** À appeler une fois, au démarrage de l'application. */
export function demarrerSurveillance(): () => void {
  const retourReseau = () => void verifierConnexion();
  const perteReseau = () => definir(false);
  const retourOnglet = () => {
    if (document.visibilityState === "visible") void verifierConnexion();
  };
  window.addEventListener("online", retourReseau);
  window.addEventListener("offline", perteReseau);
  document.addEventListener("visibilitychange", retourOnglet);
  onlineManager.setOnline(enLigne);
  // Application ouverte sans réseau : le sondage de retour démarre tout de suite.
  if (!enLigne && !sondage) sondage = window.setInterval(() => void verifierConnexion(), SONDAGE_HORS_LIGNE_MS);
  void verifierConnexion();
  return () => {
    window.removeEventListener("online", retourReseau);
    window.removeEventListener("offline", perteReseau);
    document.removeEventListener("visibilitychange", retourOnglet);
    window.clearInterval(sondage);
    sondage = 0;
  };
}

export function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerConnexion, etatConnexion, etatConnexion);
}
