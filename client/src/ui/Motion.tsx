import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

// Blocs animés à l'apparition. Un bloc déjà inclus dans un bloc animé est ignoré.
const REVEAL_SELECTOR = "section, .grid > *, .rounded-xl, [data-reveal]";
const STAGGER_MS = 45;
const MAX_STAGGER_MS = 280;
// Délai de base pour les éléments déjà visibles au chargement
// (laisse le temps à motion-page de se terminer).
const INITIAL_DELAY_MS = 80;

export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fait apparaître les blocs de `root` au défilement, en cascade.
 *  Les éléments visibles au chargement sont aussi animés avec un délai de base. */
export function useAutoReveal(root: RefObject<HTMLElement | null>, actif = true) {
  const { pathname } = useLocation();

  useEffect(() => {
    const container = root.current;
    if (!actif || !container || reducedMotion() || !("IntersectionObserver" in window)) return;

    const targets = Array.from(container.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)).filter(
      (el) => !el.closest("header, aside, footer, nav") && !el.matches("[data-no-reveal]"),
    );

    const marked = new Set<HTMLElement>();
    const initiallyVisible = new Set<HTMLElement>();

    for (const el of targets) {
      let parent = el.parentElement;
      let nested = false;
      while (parent && parent !== container) {
        if (marked.has(parent)) { nested = true; break; }
        parent = parent.parentElement;
      }
      if (nested) continue;
      marked.add(el);
      if (el.getBoundingClientRect().top < window.innerHeight) {
        initiallyVisible.add(el);
      }
    }

    // Deux compteurs séparés : les éléments visibles au chargement
    // et les éléments révélés au défilement ne partagent pas le même batch.
    let batchInit = 0;
    let batchScroll = 0;
    let frame = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const isInit = initiallyVisible.has(el);
          const batch = isInit ? batchInit : batchScroll;
          const base = isInit ? INITIAL_DELAY_MS : 0;
          el.style.setProperty("--reveal-delay", `${base + Math.min(batch * STAGGER_MS, MAX_STAGGER_MS)}ms`);
          el.classList.add("is-revealed");
          observer.unobserve(el);
          if (isInit) batchInit += 1; else batchScroll += 1;
        }
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { batchScroll = 0; });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );

    for (const el of marked) {
      el.classList.add("reveal");
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const el of marked) {
        el.classList.remove("reveal", "is-revealed");
        el.style.removeProperty("--reveal-delay");
      }
    };
  }, [root, pathname, actif]);
}

/**
 * Contenu de page.
 * `reveal=true`  → animation des blocs au défilement (toutes les pages).
 * `reveal=false` → motion-page global uniquement (pages avec transitions propres).
 */
export function PageMotion({ children, className = "", reveal = true }: { children: ReactNode; className?: string; reveal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const cible = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (cible) cible.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    else window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  useAutoReveal(ref, reveal);

  return (
    <div ref={ref} key={pathname} className={`${className} motion-page`}>
      {children}
    </div>
  );
}

/** Fine barre de progression en haut de l'écran pendant les requêtes API. */
export function TopProgress() {
  const active = useIsFetching() + useIsMutating() > 0;
  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[80] h-0.5 pointer-events-none transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
      role="progressbar"
      aria-hidden={!active}
      aria-label="Chargement des données"
    >
      <div className="motion-indeterminate h-full w-full" />
    </div>
  );
}

/** Bloc de substitution animé pendant un chargement. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`motion-skeleton block rounded ${className}`} aria-hidden="true" />;
}

export type SlideDirection = "forward" | "back";

export function useSlideNavigate() {
  const navigate = useNavigate();
  return (to: string, direction: SlideDirection) => {
    if (typeof document.startViewTransition !== "function" || reducedMotion()) {
      navigate(to);
      return;
    }
    document.documentElement.dataset.slide = direction;
    const transition = document.startViewTransition(() => {
      flushSync(() => navigate(to));
    });
    transition.finished.finally(() => {
      delete document.documentElement.dataset.slide;
    });
  };
}

/**
 * Anime un nombre de 0 vers sa valeur au montage (quand `valeur` devient disponible).
 * Extrait le préfixe numérique de la chaîne : "1 247 agents" → compte jusqu'à 1247.
 * Respecte prefers-reduced-motion.
 */
export function useCounterOnReveal(valeur: string | undefined): string {
  const [affiche, setAffiche] = useState(valeur ?? "—");
  const rafRef = useRef(0);

  useEffect(() => {
    if (!valeur) { setAffiche("—"); return; }

    const match = valeur.match(/^([\d \s]+)(.*)/u);
    if (!match || reducedMotion()) { setAffiche(valeur); return; }

    const cible = parseInt(match[1].replace(/[ \s]/g, ""), 10);
    const suffixe = match[2];
    if (isNaN(cible) || cible <= 0) { setAffiche(valeur); return; }

    const duree = Math.min(900 + cible * 0.04, 1_600); // plus long pour les grands nombres
    let debut: number | null = null;

    const step = (t: number) => {
      if (!debut) debut = t;
      const progress = Math.min((t - debut) / duree, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const courant = Math.round(eased * cible);
      setAffiche(`${courant.toLocaleString("fr-FR")}${suffixe}`);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [valeur]);

  return affiche;
}

/**
 * Réarrangement animé (FLIP) des enfants directs portant `data-flip="<clé>"`.
 */
export function useFlip<T extends HTMLElement>(signature: unknown) {
  const ref = useRef<T>(null);
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const origine = container.getBoundingClientRect().top;
    const precedentes = positions.current;
    const suivantes = new Map<string, number>();
    const animer = precedentes.size > 0 && !reducedMotion();
    let entrees = 0;
    for (const el of Array.from(container.querySelectorAll<HTMLElement>(":scope > [data-flip]"))) {
      const cle = el.dataset.flip ?? "";
      const haut = el.getBoundingClientRect().top - origine;
      suivantes.set(cle, haut);
      if (!animer) continue;
      const avant = precedentes.get(cle);
      if (avant === undefined) {
        el.animate(
          [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
          { duration: 240, delay: Math.min(entrees++ * 30, 180), easing: EASE_OUT, fill: "backwards" },
        );
      } else if (Math.abs(avant - haut) > 1) {
        el.animate([{ transform: `translateY(${avant - haut}px)` }, { transform: "none" }], { duration: 320, easing: EASE_OUT });
      }
    }
    positions.current = suivantes;
  }, [signature]);

  return ref;
}
