import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * `?integre=1` : la page est affichée dans un cadre (parcours d'adhésion). Elle masque son en-tête et son pied
 * de page, et les barres fixes comptent pour 0 dans la mise en page.
 */
export function useModeIntegre(): boolean {
  const integre = useSearchParams()[0].get("integre") === "1";
  useEffect(() => {
    if (!integre) return;
    document.documentElement.dataset.integre = "1";
    return () => {
      delete document.documentElement.dataset.integre;
    };
  }, [integre]);
  return integre;
}
