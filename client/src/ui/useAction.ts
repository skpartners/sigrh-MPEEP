import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useFeedback } from "./Feedback";

type Action<T> = {
  /** Question posée avant d'agir ; sans elle, l'action part directement. */
  confirmation?: string;
  confirmLabel?: string;
  /** Libellé de l'overlay pendant l'appel. */
  attente: string;
  /** Route POST de l'API, et corps éventuel. */
  route: string;
  /** POST par défaut ; DELETE pour une suppression, PUT ou PATCH pour une mise à jour. */
  methode?: "POST" | "PUT" | "PATCH" | "DELETE";
  corps?: unknown;
  /** Toast de réussite, éventuellement calculé à partir de la réponse. */
  succes: string | ((reponse: T) => string);
  detail?: string | ((reponse: T) => string);
  /** false : l'appelant rafraîchit lui-même les données (après une animation de sortie, par exemple). */
  rafraichir?: boolean;
};

/**
 * Exécute une action du DRH : confirmation, overlay, appel API, toast, puis rafraîchissement
 * de toutes les données (écrans et cloche de notification). Renvoie null si l'action est
 * annulée ou refusée ; le message d'erreur de l'API est alors affiché en toast.
 */
export function useAction() {
  const feedback = useFeedback();
  const client = useQueryClient();

  async function agir<T>(action: Action<T>): Promise<T | null> {
    if (action.confirmation && !(await feedback.confirm(action.confirmation, { confirmLabel: action.confirmLabel }))) {
      return null;
    }
    try {
      const reponse = await feedback.run(
        action.attente,
        () => api<T>(action.route, { method: action.methode ?? "POST", body: action.corps === undefined ? undefined : JSON.stringify(action.corps) }),
        { error: "L'action n'a pas abouti" },
      );
      if (action.rafraichir !== false) await client.invalidateQueries();
      const titre = typeof action.succes === "function" ? action.succes(reponse) : action.succes;
      const detail = typeof action.detail === "function" ? action.detail(reponse) : action.detail;
      feedback.toast(titre, detail);
      return reponse;
    } catch {
      return null;
    }
  }

  return { agir, rafraichir: () => client.invalidateQueries() };
}
