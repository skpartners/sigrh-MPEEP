import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

// Blocs animés à l'apparition. Un bloc déjà inclus dans un bloc animé est ignoré,
// sinon les translations s'additionnent.
const REVEAL_SELECTOR = "section, .grid > *, .rounded-xl, [data-reveal]";
const STAGGER_MS = 40;
const MAX_STAGGER_MS = 200;

export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Fait apparaître les blocs de `root` au défilement, en cascade. Relancé à chaque changement de page. */
export function useAutoReveal(root: RefObject<HTMLElement | null>, actif = true) {
  const { pathname } = useLocation();

  useEffect(() => {
    const container = root.current;
    if (!actif || !container || reducedMotion() || !("IntersectionObserver" in window)) return;

    const targets = Array.from(container.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)).filter(
      (el) => !el.closest("header, aside, footer, nav") && !el.matches("[data-no-reveal]"),
    );
    const marked = new Set<HTMLElement>();
    const skipped = new Set<HTMLElement>();
    for (const el of targets) {
      let parent = el.parentElement;
      let nested = false;
      while (parent && parent !== container) {
        if (marked.has(parent) || skipped.has(parent)) {
          nested = true;
          break;
        }
        parent = parent.parentElement;
      }
      // Déjà visible au chargement : on l'affiche tel quel, sans animation.
      if (!nested && el.getBoundingClientRect().top < window.innerHeight) {
        skipped.add(el);
        continue;
      }
      if (!nested) marked.add(el);
    }

    let batch = 0;
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.setProperty("--reveal-delay", `${Math.min(batch * STAGGER_MS, MAX_STAGGER_MS)}ms`);
          el.classList.add("is-revealed");
          observer.unobserve(el);
          batch += 1;
        }
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => (batch = 0));
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
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
 * Contenu de page. `reveal` : apparition des blocs au défilement, réservée aux pages publiques ;
 * dans l'application (outil de travail), le contenu est là sans chorégraphie.
 */
export function PageMotion({ children, className = "", reveal = true }: { children: ReactNode; className?: string; reveal?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname, hash } = useLocation();

  // Avant useAutoReveal : la mesure des blocs visibles suppose la page en haut.
  // Avec une ancre (#rbac), on descend jusqu'à la section visée.
  useEffect(() => {
    const cible = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (cible) cible.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    else window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  useAutoReveal(ref, reveal);

  return (
    <div ref={ref} key={pathname} className={className}>
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

/**
 * Navigation avec glissement latéral (View Transitions API).
 * L'option `viewTransition` de React Router n'agit qu'avec un routeur « data » ;
 * avec <BrowserRouter useTransitions={false}>, on lance la transition nous-mêmes
 * et flushSync rend la nouvelle page dans le rappel.
 */
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
 * Réarrangement animé (FLIP) des enfants directs portant `data-flip="<clé>"`.
 * Quand `signature` change (filtre, page…), une ligne conservée glisse de son ancienne
 * position vers la nouvelle et une ligne nouvelle apparaît en fondu, en léger décalé.
 * Le premier rendu n'est pas animé : le contenu arrive avec .motion-content.
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
