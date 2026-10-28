import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SessionUser } from "../api/types";
import { Icone } from "../ui/Icone";
import { AppChrome } from "./AppChrome";
import { destinationModule, moduleAutorise, NAV, sousMenus, type EnfantNav, type LienNav } from "./navigation";

/** Sous-menus montrés sur une carte ; les autres se résument en « +N de plus ». */
const PUCES_VISIBLES = 3;

export const ACCENTS = [
  {
    // Principale — sombre & autoritaire
    barre: "from-primary via-primary/60 to-transparent",
    fond: "from-primary/10 to-transparent",
    tache: "bg-primary/10",
    icone: "bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-[0_4px_20px_-4px_var(--color-primary)]",
    badge: "bg-primary/10 text-primary border border-primary/20",
    puce: "bg-primary/10 text-on-surface border border-primary/20",
    titre: "group-hover:text-primary",
    cta: "group-hover:bg-primary group-hover:text-on-primary group-hover:border-primary/40",
  },
  {
    // Accent — la couleur d'accent du ministère
    barre: "from-secondary-container via-secondary-container/60 to-transparent",
    fond: "from-secondary-container/10 to-transparent",
    tache: "bg-secondary-container/15",
    icone: "bg-gradient-to-br from-secondary-container to-secondary-fixed-dim text-on-secondary-container shadow-[0_4px_20px_-4px_var(--color-secondary)]",
    badge: "bg-secondary-container/40 text-secondary border border-secondary/20",
    puce: "bg-secondary-container/10 text-on-surface border border-secondary-container/15",
    titre: "group-hover:text-secondary",
    cta: "group-hover:bg-secondary-container group-hover:text-on-secondary-container group-hover:border-secondary-container/40",
  },
  {
    // Aurore — de la principale vers l'accent
    barre: "from-primary via-primary-container to-secondary-container",
    fond: "from-primary/5 via-primary-container/5 to-transparent",
    tache: "bg-secondary/10",
    icone: "bg-gradient-to-br from-primary via-primary-container to-secondary-container text-on-primary shadow-[0_4px_20px_-4px_var(--color-primary-container)]",
    badge: "bg-secondary/10 text-secondary border border-secondary/20",
    puce: "bg-secondary/10 text-on-surface border border-secondary/15",
    titre: "group-hover:text-primary",
    cta: "group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-secondary-container group-hover:text-on-primary group-hover:border-transparent",
  },
] as const;

export function HubScreen() {
  const rechercheId = useId();
  const champ = useRef<HTMLInputElement>(null);
  const [filtre, setFiltre] = useState("");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const acces = me.data?.acces;
  const requete = filtre.trim().toLocaleLowerCase("fr");

  const liens = useMemo(
    () =>
      NAV.flatMap((section) => section.liens).filter((lien) => {
        if (lien.horsAccueil) return false;
        if (!requete) return true;
        const enfants = sousMenus(lien).map((enfant) => enfant.libelle).join(" ");
        return `${lien.libelle} ${lien.resume} ${enfants}`.toLocaleLowerCase("fr").includes(requete);
      }),
    [requete],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        champ.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const grilleRef = useRef<HTMLDivElement>(null);

  // Ajoute hub-card (opaque=0) avant le premier paint : pas de flash.
  useLayoutEffect(() => {
    const container = grilleRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cartes = Array.from(container.children) as HTMLElement[];
    cartes.forEach((el) => el.classList.add("hub-card"));
    return () => {
      cartes.forEach((el) => el.classList.remove("hub-card", "hub-card-in"));
    };
  }, [liens]);

  // IntersectionObserver bidirectionnel : entrée spring, sortie rapide.
  useEffect(() => {
    const container = grilleRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cartes = Array.from(container.children) as HTMLElement[];

    let entrants: HTMLElement[] = [];
    let frame = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          const el = target as HTMLElement;
          if (isIntersecting) {
            entrants.push(el);
          } else {
            // Sortie : retire hub-card-in → transition reverse (180ms ease-in)
            el.classList.remove("hub-card-in");
            el.style.removeProperty("--card-delay");
          }
        }
        // Regroupe les entrants en un seul frame pour calculer le stagger.
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          entrants
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            .forEach((el, i) => {
              el.style.setProperty("--card-delay", `${Math.min(i * 65, 260)}ms`);
              el.classList.add("hub-card-in");
            });
          entrants = [];
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" },
    );

    cartes.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [liens]);

  let indexCarte = 0;

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-3 pb-1 mx-auto flex-1 flex flex-col gap-4">
        <section className="flex flex-col gap-3">
          {/* Bannière héro */}
          <div className="relative overflow-hidden rounded-2xl motion-rise">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary-container" aria-hidden="true" />
            <div className="motion-float-1 absolute -right-10 -top-10 w-52 h-52 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" aria-hidden="true" />
            <div className="motion-float-2 absolute left-1/3 -bottom-8 w-44 h-44 rounded-full bg-secondary/15 blur-2xl pointer-events-none" aria-hidden="true" />
            <div className="motion-float-1 absolute right-1/4 bottom-0 w-24 h-24 rounded-full bg-secondary-container/10 blur-xl pointer-events-none" aria-hidden="true" style={{ animationDelay: "3.5s" }} />
            <div className="relative z-10 px-6 sm:px-8 py-4 court:py-3">
              <h1 className="font-headline-md text-headline-md sm:font-headline-lg sm:text-headline-lg text-on-primary tracking-tight">
                Menu principal
              </h1>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-secondary-container/40" aria-hidden="true" />
          </div>
          {/* Barre de recherche */}
          <div className="relative w-full sm:w-96">
            <label htmlFor={rechercheId} className="sr-only">Rechercher un module</label>
            <Icone nom="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none" />
            <input
              ref={champ}
              id={rechercheId}
              className="w-full pl-10 pr-16 py-2 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-md text-body-md border border-hairline shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary-container/40 focus:border-secondary-container"
              placeholder="Rechercher un module…"
              type="search"
              value={filtre}
              onChange={(event) => setFiltre(event.target.value)}
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-hairline bg-surface-container font-code-num text-label-sm text-on-surface-variant" aria-hidden="true">
              Ctrl+K
            </kbd>
          </div>
        </section>

        {liens.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            Aucun module ne correspond à « {filtre.trim()} ».
          </p>
        ) : (
          <div ref={grilleRef} data-no-reveal className="flex flex-wrap gap-4">
            {liens.map((lien) => {
              const accent = ACCENTS[indexCarte % ACCENTS.length];
              indexCarte += 1;
              return (
                <CarteModule
                  key={lien.to}
                  lien={lien}
                  accent={accent}
                  autorise={!lien.bientot && Boolean(acces) && moduleAutorise(acces, lien)}
                  vers={destinationModule(acces, lien)}
                  bientot={lien.bientot}
                  className="flex-1 min-w-full md:min-w-[calc((100%-1.25rem)/2)] xl:min-w-[calc((100%-2.5rem)/3)] max-w-full"
                />
              );
            })}
          </div>
        )}
      </div>
    </AppChrome>
  );
}

export function CarteModule({
  lien,
  accent,
  autorise,
  vers,
  bientot,
  className = "",
}: {
  lien: LienNav;
  accent: (typeof ACCENTS)[number];
  autorise: boolean;
  vers: string;
  bientot?: boolean;
  className?: string;
}) {
  const enfants = sousMenus(lien);
  const detail = enfants.length > 0
    ? `${enfants.length} sous-menu${enfants.length > 1 ? "s" : ""}`
    : "Accès direct";

  const corps = (
    <>
      {/* Barre de couleur en haut */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${accent.barre}`} aria-hidden="true" />

      {/* Fond teinté par variante */}
      <div className={`absolute inset-0 bg-gradient-to-br ${accent.fond} pointer-events-none`} aria-hidden="true" />

      {/* Tache décorative flottante */}
      <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full ${accent.tache} blur-3xl pointer-events-none`} aria-hidden="true" />

      {/* Contenu principal */}
      <div className={`relative z-10 flex flex-col flex-1 gap-3 ${autorise ? "" : "opacity-60"}`}>

        {/* Ligne 1 : icône + badge */}
        <div className="flex items-start justify-between gap-3">
          <span
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-[1.625rem] shrink-0 ${accent.icone} ${autorise ? "group-hover:scale-105 group-hover:-rotate-3 transition-[transform,box-shadow] duration-300" : ""}`}
            aria-hidden="true"
          >
            <Icone nom={lien.icone} />
          </span>
          <span className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold ${accent.badge}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
            {detail}
          </span>
        </div>

        {/* Titre */}
        <div className="space-y-1.5">
          <span className={`block font-headline-sm text-headline-sm font-bold text-on-surface leading-snug ${autorise ? accent.titre : ""} transition-colors`}>
            {lien.libelle}
          </span>
        </div>

        {/* Sous-menus en chips */}
        {enfants.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="list" aria-label={`Sous-menus de ${lien.libelle}`}>
            {enfants.slice(0, PUCES_VISIBLES).map((enfant) => (
              <span
                key={enfant.to}
                role="listitem"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm ${accent.puce}`}
              >
                <Icone nom={enfant.icone} className="text-xs opacity-60 shrink-0" />
                {enfant.libelle}
              </span>
            ))}
            {enfants.length > PUCES_VISIBLES ? <PuceSuite enfants={enfants.slice(PUCES_VISIBLES)} classe={accent.puce} /> : null}
          </div>
        ) : null}
      </div>

      {/* Statut des cartes non accessibles */}
      {!autorise ? (
        <div className="relative z-10 mt-auto pt-4">
          <div className="border-t border-hairline/60 mb-3" />
          <span className={`flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl font-label-md text-label-md font-semibold border ${bientot ? "bg-surface-container/50 text-on-surface-variant border-hairline/40" : "bg-error-container text-error border-error/40"}`}>
            <span>{bientot ? "Bientôt disponible" : "Hors de votre habilitation"}</span>
            <Icone nom={bientot ? "construction" : "lock"} className={`text-base shrink-0 ${bientot ? "opacity-50" : ""}`} />
          </span>
        </div>
      ) : null}
    </>
  );

  const classe = `group relative flex flex-col rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/50 shadow-[0_4px_24px_color-mix(in_oklab,var(--color-primary)_12%,transparent)] overflow-hidden min-h-44 p-4 ${className}`;

  if (!autorise) {
    return (
      <article aria-disabled="true" title={bientot ? "Bientôt disponible" : "Hors de votre habilitation"} className={classe}>
        {corps}
      </article>
    );
  }
  return (
    <Link to={vers} className={`${classe} hover:shadow-[0_16px_48px_color-mix(in_oklab,var(--color-primary)_20%,transparent)] hover:border-white/70 hover:bg-white/90 hover:z-10 focus-visible:z-10 hover:scale-[1.06] focus-visible:scale-[1.06] motion-reduce:hover:scale-100 motion-reduce:focus-visible:scale-100 transition-[transform,box-shadow,border-color,background-color] duration-700 ease-[linear(0,0.027,0.096,0.192,0.303,0.42,0.535,0.643,0.74,0.825,0.895,0.952,0.997,1.029,1.052,1.065,1.072,1.073,1.071,1.065,1.058,1.049,1.041,1.032,1.025,1.018,1.012,1.007,1.003,1,0.997,0.996,0.995,0.995,0.995,0.995,1)]`}>
      {corps}
    </Link>
  );
}

/** « +N de plus » : une infobulle liste les sous-menus masqués. Rendue hors de la carte, qui rogne son contenu. */
function PuceSuite({ enfants, classe }: { enfants: EnfantNav[]; classe: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const id = useId();

  function montrer() {
    const boite = ref.current?.getBoundingClientRect();
    if (boite) setPosition({ x: Math.min(boite.left, window.innerWidth - 280), y: boite.bottom + 6 });
  }

  return (
    <>
      <span
        ref={ref}
        role="listitem"
        tabIndex={0}
        aria-describedby={position ? id : undefined}
        onMouseEnter={montrer}
        onMouseLeave={() => setPosition(null)}
        onFocus={montrer}
        onBlur={() => setPosition(null)}
        className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-label-sm font-semibold cursor-help ${classe}`}
      >
        +{enfants.length} de plus
      </span>
      {position
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              style={{ left: position.x, top: position.y }}
              className="fixed z-[80] w-64 rounded-xl border border-hairline bg-surface-container-lowest p-3 shadow-[0_12px_32px_color-mix(in_oklab,var(--color-primary)_22%,transparent)] pointer-events-none"
            >
              <ul className="space-y-1.5">
                {enfants.map((enfant) => (
                  <li key={enfant.to} className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface">
                    <Icone nom={enfant.icone} className="text-sm text-primary shrink-0" />
                    {enfant.libelle}
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
