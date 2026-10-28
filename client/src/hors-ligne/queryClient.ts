import { QueryClient } from "@tanstack/react-query";

/**
 * Client de données unique de l'application. Créé ici (et non dans App.tsx) pour que le démarrage puisse recharger
 * les écrans gardés hors ligne avant le premier rendu, et que la synchronisation puisse relire la session.
 *
 * - `gcTime` long : un écran consulté reste en mémoire (et donc dans la copie hors ligne) plusieurs heures.
 * - `networkMode: "always"` pour les mutations : hors ligne, une action échoue tout de suite avec un message clair
 *   (ou part dans la file d'attente quand elle le permet) au lieu de rester suspendue pendant des heures.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, gcTime: 6 * 3600 * 1000 },
    mutations: { networkMode: "always" },
  },
});
