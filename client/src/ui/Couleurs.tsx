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

/* ---- Lisibilité garantie ----
   Les deux teintes choisies dans Paramètres peuvent être n'importe lesquelles. Les jetons qui portent du
   texte (ou qui servent de fond à du texte) sont donc recalculés ici avec un contraste vérifié, au lieu
   de rester de simples mélanges CSS : un jaune ou un blanc choisi comme couleur principale ne rend plus
   les titres, les liens ni les boutons illisibles. Les teintes déjà assez foncées ne bougent pas. */
const SURFACE_TEXTE = "#E8ECED";
const SURFACE_PIRE = "#D1D8D9";
const BLANC = "#FFFFFF";
const NOIR = "#000000";

/** Part minimale de `vers` à mélanger dans `couleur` pour atteindre le contraste demandé contre `fond`. */
function rapprocher(couleur: string, vers: string, fond: string, ratio: number): string {
  if (contraste(couleur, fond) >= ratio) return couleur;
  if (contraste(vers, fond) < ratio) return vers;
  let bas = 0;
  let haut = 1;
  for (let tour = 0; tour < 14; tour += 1) {
    const milieu = (bas + haut) / 2;
    if (contraste(melanger(couleur, vers, milieu), fond) >= ratio) haut = milieu;
    else bas = milieu;
  }
  return melanger(couleur, vers, haut);
}

/** Assombrit la couleur jusqu'à ce qu'elle se lise sur `fond` (texte, lien, bouton plein). */
function assombrir(couleur: string, fond: string, ratio: number): string {
  return rapprocher(couleur, NOIR, fond, ratio);
}

/** Encre qui se lit sur `fond` : la teinte préférée si elle suffit, sinon poussée vers le blanc ou le noir. */
function encre(fond: string, preferee: string, ratio: number): string {
  if (contraste(preferee, fond) >= ratio) return preferee;
  return rapprocher(preferee, contraste(fond, BLANC) >= contraste(fond, ENCRE_SOMBRE) ? BLANC : NOIR, fond, ratio);
}

/** Couleur principale réellement employée par l'interface : celle choisie, assombrie si elle ne se lit pas. */
export function principaleEffective(principale: string): string {
  return couleurValide(principale) ? assombrir(principale.toUpperCase(), SURFACE_TEXTE, 5) : principale;
}

/** Vrai quand la couleur principale choisie doit être assombrie pour rester lisible. */
export function principaleAjustee(principale: string): boolean {
  return couleurValide(principale) && principaleEffective(principale) !== principale.toUpperCase();
}

/** Jetons de couleur à contraste vérifié, dérivés des deux teintes de la marque. */
export function paletteLisible({ principale, accent }: Couleurs): Record<string, string> {
  const p = principaleEffective(principale);
  const surP = encreSur(p);
  const sombre = melanger(p, NOIR, 0.2);

  // Survol des boutons pleins : reste assez foncé pour porter l'encre claire.
  const pc = assombrir(melanger(p, accent, 0.18), BLANC, 4.7);
  const s = assombrir(melanger(p, accent, 0.25), SURFACE_TEXTE, 4.5);
  const t = assombrir(melanger(p, accent, 0.35), SURFACE_TEXTE, 4.5);
  const tc = melanger(accent, BLANC, 0.3);
  const pf = melanger(accent, BLANC, 0.55);
  const pfd = melanger(accent, BLANC, 0.3);
  const sf = melanger(accent, BLANC, 0.7);
  const sfd = melanger(accent, BLANC, 0.4);
  const tf = melanger(accent, BLANC, 0.75);
  const tfd = melanger(accent, BLANC, 0.55);
  const sv = melanger(accent, "#F3F5F6", 0.7);
  const inverse = sombre;

  // Texte courant : la teinte de marque, assez sombre pour tenir sur toutes les surfaces claires.
  const surface = assombrir(melanger(principale, "#101414", 0.55), SURFACE_PIRE, 9);
  const surfaceVariante = assombrir(assombrir(melanger(principale, "#4A5254", 0.65), SURFACE_PIRE, 5), sv, 5);
  const surFixe = encre(pf, sombre, 7);
  const surFixeVariante = encre(pf, p, 4.5);

  return {
    "--color-primary": p,
    "--color-on-primary": surP,
    "--color-primary-container": pc,
    "--color-on-primary-container": encre(pc, melanger(accent, surP, 0.6), 4.5),
    "--color-inverse-primary": encre(inverse, accent, 4.5),
    "--color-primary-fixed": pf,
    "--color-primary-fixed-dim": pfd,
    "--color-on-primary-fixed": surFixe,
    "--color-on-primary-fixed-variant": surFixeVariante,
    "--color-secondary": s,
    "--color-on-secondary": encreSur(s),
    "--color-secondary-container": accent,
    "--color-on-secondary-container": encreSur(accent),
    "--color-secondary-fixed": sf,
    "--color-secondary-fixed-dim": sfd,
    "--color-on-secondary-fixed": encre(sf, sombre, 7),
    "--color-on-secondary-fixed-variant": encre(sf, p, 4.5),
    "--color-tertiary": t,
    "--color-on-tertiary": encreSur(t),
    "--color-tertiary-container": tc,
    "--color-on-tertiary-container": encre(tc, sombre, 7),
    "--color-tertiary-fixed": tf,
    "--color-tertiary-fixed-dim": tfd,
    "--color-on-tertiary-fixed": encre(tf, sombre, 7),
    "--color-on-tertiary-fixed-variant": encre(tf, p, 4.5),
    "--color-surface-tint": s,
    "--color-surface-variant": sv,
    "--color-on-surface": surface,
    "--color-on-surface-variant": surfaceVariante,
    "--color-on-background": surface,
    "--color-outline": assombrir(melanger(principale, "#7A8486", 0.65), "#F0F3F4", 3),
    "--color-inverse-surface": inverse,
    "--color-inverse-on-surface": encre(inverse, melanger(accent, BLANC, 0.6), 7),
  };
}

export function appliquerCouleurs(couleurs: Couleurs) {
  const valides = couleurValide(couleurs.principale) && couleurValide(couleurs.accent) ? couleurs : COULEURS_DEFAUT;
  const racine = document.documentElement.style;
  const effective = principaleEffective(valides.principale);
  racine.setProperty("--brand-1", effective);
  racine.setProperty("--brand-2", valides.accent);
  racine.setProperty("--on-brand-1", encreSur(effective));
  racine.setProperty("--on-brand-2", encreSur(valides.accent));
  for (const [nom, valeur] of Object.entries(paletteLisible(valides))) racine.setProperty(nom, valeur);
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
