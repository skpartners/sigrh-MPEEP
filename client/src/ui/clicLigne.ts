import type { MouseEvent } from "react";

/** Ouvre la modification au clic sur la ligne, sans intercepter un bouton, un lien ou un champ. */
export function ouvreAuClic(action: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    const cible = event.target instanceof Element ? event.target : null;
    if (cible?.closest("button, a, input, select, textarea, label")) return;
    action();
  };
}
