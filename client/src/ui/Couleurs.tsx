import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "../api/client";

/**
 * Couleurs de l'application choisies dans les paramètres. Les deux teintes posent
 * --brand-1 et --brand-2 sur <html> ; app.css en dérive toute la palette.
 */
export type Couleurs = { principale: string; accent: string };

export const COULEURS_DEFAUT: Couleurs = { principale: "#042F32", accent: "#D6FFCB" };

const CLE = "sigrh_couleurs";
const HEX = /^#[0-9a-f]{6}$/i;
const ENCRE_CLAIRE = "#FFFFFF";
const ENCRE_SOMBRE = "#0B1416";

let courantes: Couleurs = COULEURS_DEFAUT;
const abonnes = new Set<() => void>();

export function couleurValide(valeur: string): boolean {
  return HEX.test(valeur);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [claire, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (claire + 0.05) / (sombre + 0.05);
}

/** Encre lisible sur la couleur donnée : blanc ou presque noir, selon le meilleur contraste. */
export function encreSur(fond: string): string {
  return contraste(fond, ENCRE_CLAIRE) >= contraste(fond, ENCRE_SOMBRE) ? ENCRE_CLAIRE : ENCRE_SOMBRE;
}

/** Mélange sRGB de deux couleurs : part = 0 rend a, part = 1 rend b. */
export function melanger(a: string, b: string, part: number): string {
  const [ra, ga, ba] = rgb(a);
  const [rb, gb, bb] = rgb(b);
  const canal = (x: number, y: number) => Math.round(x + (y - x) * part).toString(16).padStart(2, "0");
  return `#${canal(ra, rb)}${canal(ga, gb)}${canal(ba, bb)}`.toUpperCase();
}

export function appliquerCouleurs(couleurs: Couleurs) {
  const valides = couleurValide(couleurs.principale) && couleurValide(couleurs.accent) ? couleurs : COULEURS_DEFAUT;
  const racine = document.documentElement.style;
  racine.setProperty("--brand-1", valides.principale);
  racine.setProperty("--brand-2", valides.accent);
  racine.setProperty("--on-brand-1", encreSur(valides.principale));
  racine.setProperty("--on-brand-2", encreSur(valides.accent));
  if (valides.principale !== courantes.principale || valides.accent !== courantes.accent) {
    courantes = valides;
    abonnes.forEach((abonne) => abonne());
  }
}

/** Dernières couleurs connues, appliquées avant le premier rendu pour éviter un flash. */
export function appliquerCouleursMemorisees() {
  try {
    const brut = window.localStorage.getItem(CLE);
    const lues = brut ? (JSON.parse(brut) as Partial<Couleurs>) : null;
    if (lues && typeof lues.principale === "string" && typeof lues.accent === "string") {
      appliquerCouleurs({ principale: lues.principale, accent: lues.accent });
      return;
    }
  } catch {
    // Stockage indisponible : la palette par défaut d'app.css s'applique.
  }
  appliquerCouleurs(COULEURS_DEFAUT);
}

function memoriser(couleurs: Couleurs) {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(couleurs));
  } catch {
    // Sans stockage, les couleurs sont relues au prochain chargement.
  }
}

export function couleursCourantes(): Couleurs {
  return courantes;
}

export function useCouleurs(): Couleurs {
  return useSyncExternalStore(
    (abonne) => {
      abonnes.add(abonne);
      return () => abonnes.delete(abonne);
    },
    () => courantes,
  );
}

export const CLE_COULEURS = ["couleurs"] as const;

export function useCouleursEnregistrees() {
  return useQuery({
    queryKey: CLE_COULEURS,
    queryFn: () => api<Couleurs>("/api/v1/public/couleurs/"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Applique les couleurs enregistrées du ministère, sur le portail comme dans l'application. */
export function CouleursApplication() {
  const { data } = useCouleursEnregistrees();
  useEffect(() => {
    if (!data) return;
    appliquerCouleurs(data);
    memoriser(data);
  }, [data]);
  return null;
}

/** Suite de teintes pour les graphiques : de la couleur principale vers l'accent, assez soutenues pour un fond clair. */
export function paletteGraphique({ principale, accent }: Couleurs): string[] {
  return [0, 0.45, 0.7, 0.2, 0.82, 0.32, 0.58].map((part) => melanger(principale, accent, part));
}
