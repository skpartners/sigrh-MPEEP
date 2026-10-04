import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function texteVisible(cellule: Element): string {
  const copie = cellule.cloneNode(true) as HTMLElement;
  copie.querySelectorAll(".material-symbols-outlined, .sr-only").forEach((noeud) => noeud.remove());
  return (copie.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Recopie l'en-tête sur les cellules utiles, pour l'affichage en carte. */
function etiqueter() {
  document.querySelectorAll<HTMLTableElement>("table:not(.tableau-fixe)").forEach((table) => {
    const entete = table.tHead?.rows[0];
    if (!entete) return;
    const libelles: string[] = [];
    for (const cellule of entete.cells) {
      const texte = (cellule.textContent ?? "").replace(/\s+/g, " ").trim();
      for (let i = 0; i < (cellule.colSpan || 1); i += 1) libelles.push(texte);
    }
    table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((ligne) => {
      let index = 0;
      for (const cellule of ligne.cells) {
        const largeur = cellule.colSpan || 1;
        if (cellule instanceof HTMLElement) {
          if (largeur === 1 && index > 0 && libelles[index] && texteVisible(cellule)) cellule.dataset.label = libelles[index];
          else delete cellule.dataset.label;
        }
        index += largeur;
      }
    });
  });
}

export function EtiquettesTableaux() {
  const { pathname } = useLocation();

  useEffect(() => {
    let frame = 0;
    const planifier = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(etiqueter);
    };
    planifier();
    const observateur = new MutationObserver(planifier);
    observateur.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observateur.disconnect();
    };
  }, [pathname]);

  return null;
}
