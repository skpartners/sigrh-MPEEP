import { useLayoutEffect, type RefObject } from "react";

/**
 * Publie la hauteur réelle d'une barre fixe (en-tête, pied) dans une variable CSS de <html>.
 * Selon le zoom, la police du navigateur ou la largeur, une barre passe sur deux lignes : ce qui se
 * cale dessus (marge du contenu, menu latéral, panneaux flottants) suit la mesure plutôt qu'une
 * valeur devinée. La variable retombe sur sa valeur d'app.css quand la barre disparaît.
 */
export function useHauteurFixe(barre: RefObject<HTMLElement | null>, variable: "--haut-entete" | "--haut-pied") {
  useLayoutEffect(() => {
    const element = barre.current;
    if (!element) return;
    const racine = document.documentElement.style;
    // Une barre rendue au fil de la page (pied sur écran très bas) ne masque rien : elle compte pour 0.
    const mesurer = () => {
      const fixe = getComputedStyle(element).position === "fixed";
      racine.setProperty(variable, `${fixe ? element.offsetHeight : 0}px`);
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    // Un changement de palier peut changer la position sans changer la taille.
    window.addEventListener("resize", mesurer);
    return () => {
      observateur.disconnect();
      window.removeEventListener("resize", mesurer);
      racine.removeProperty(variable);
    };
  }, [barre, variable]);
}
