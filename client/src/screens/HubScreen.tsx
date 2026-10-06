import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SessionUser } from "../api/types";
import { Icone } from "../ui/Icone";
import { AppChrome } from "./AppChrome";
import { destinationModule, moduleAutorise, NAV, sousMenus, type LienNav } from "./navigation";

const ACCENTS = [
  {
    // Violet Profond — sombre & autoritaire
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
    // Violet Lumineux — vivid accent
    barre: "from-secondary-container via-secondary-container/60 to-transparent",
    fond: "from-secondary-container/10 to-transparent",
    tache: "bg-secondary-container/15",
    icone: "bg-gradient-to-br from-secondary-container to-secondary text-on-primary shadow-[0_4px_20px_-4px_var(--color-secondary-container)]",
    badge: "bg-secondary-container/10 text-secondary-container border border-secondary-container/25",
    puce: "bg-secondary-container/10 text-on-surface border border-secondary-container/15",
    titre: "group-hover:text-secondary-container",
    cta: "group-hover:bg-secondary-container group-hover:text-on-primary group-hover:border-secondary-container/40",
  },
  {
    // Aurora Violette — dégradé toxique → vivid
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
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 flex flex-col gap-8">
        <section className="flex flex-col gap-5">
          {/* Bannière héro */}
          <div className="relative overflow-hidden rounded-2xl motion-rise">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary-container" aria-hidden="true" />
            <div className="motion-float-1 absolute -right-10 -top-10 w-52 h-52 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" aria-hidden="true" />
            <div className="motion-float-2 absolute left-1/3 -bottom-8 w-44 h-44 rounded-full bg-secondary/15 blur-2xl pointer-events-none" aria-hidden="true" />
            <div className="motion-float-1 absolute right-1/4 bottom-0 w-24 h-24 rounded-full bg-secondary-container/10 blur-xl pointer-events-none" aria-hidden="true" style={{ animationDelay: "3.5s" }} />
            <div className="relative z-10 px-6 sm:px-8 py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary-container/15 border border-secondary-container/30 text-secondary-container font-label-sm text-label-sm font-semibold">
                    <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
                      <span className="motion-pulse-dot absolute inset-0 rounded-full bg-secondary-container" aria-hidden="true" />
                      <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-secondary-container" />
                    </span>
                    Session active
                  </span>
                  {me.data ? (
                    <span className="font-label-sm text-label-sm text-on-primary/60">
                      {me.data.fonction}
                      {" · "}
                      <strong className="text-on-primary/85 font-semibold">{me.data.organisme_sigle}</strong>
                    </span>
                  ) : null}
                </div>
                <h1 className="font-headline-lg text-headline-lg sm:font-headline-xl sm:text-headline-xl text-on-primary tracking-tight">
                  Menu principal
                </h1>
                <p className="font-body-md text-body-md text-on-primary/60 mt-1.5 max-w-lg">
                  Sélectionnez un module pour accéder à ses fonctionnalités.
                </p>
              </div>
              <img
                alt=""
                className="hidden sm:block h-20 w-20 object-contain opacity-20 shrink-0"
                src={`${import.meta.env.BASE_URL}logo.png`}
                aria-hidden="true"
              />
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
              className="w-full pl-10 pr-16 py-3 rounded-xl bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-md text-body-md border border-hairline shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary-container/40 focus:border-secondary-container"
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
          <div ref={grilleRef} data-no-reveal className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {liens.map((lien) => {
              const accent = ACCENTS[indexCarte % ACCENTS.length];
              indexCarte += 1;
              return (
                <CarteModule
                  key={lien.to}
                  lien={lien}
                  accent={accent}
                  autorise={Boolean(acces) && moduleAutorise(acces, lien)}
                  vers={destinationModule(acces, lien)}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppChrome>
  );
}

function CarteModule({
  lien,
  accent,
  autorise,
  vers,
}: {
  lien: LienNav;
  accent: (typeof ACCENTS)[number];
  autorise: boolean;
  vers: string;
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
      <div className="relative z-10 flex flex-col flex-1 gap-4">

        {/* Ligne 1 : icône + badge */}
        <div className="flex items-start justify-between gap-3">
          <span
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-[30px] shrink-0 ${accent.icone} ${autorise ? "group-hover:scale-105 group-hover:-rotate-3 transition-[transform,box-shadow] duration-300" : ""}`}
            aria-hidden="true"
          >
            <Icone nom={lien.icone} />
          </span>
          <span className={`mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold ${accent.badge}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
            {detail}
          </span>
        </div>

        {/* Titre + description */}
        <div className="space-y-1.5">
          <span className={`block font-headline-sm text-headline-sm font-bold text-on-surface leading-snug ${autorise ? accent.titre : ""} transition-colors`}>
            {lien.libelle}
          </span>
          <span className="block font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            {lien.resume}
          </span>
        </div>

        {/* Sous-menus en chips */}
        {enfants.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="list" aria-label={`Sous-menus de ${lien.libelle}`}>
            {enfants.map((enfant) => (
              <span
                key={enfant.to}
                role="listitem"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label-sm text-label-sm ${accent.puce}`}
              >
                <Icone nom={enfant.icone} className="text-xs opacity-60 shrink-0" />
                {enfant.libelle}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* CTA pleine largeur */}
      <div className="relative z-10 mt-auto pt-4">
        <div className="border-t border-hairline/60 mb-3" />
        {autorise ? (
          <span className={`btn-ripple flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl font-label-lg text-label-lg font-semibold bg-surface-container border border-hairline text-on-surface-variant transition-[background-color,color,border-color,box-shadow] duration-300 ${accent.cta} group-hover:shadow-sm`}>
            <span>Ouvrir le module</span>
            <Icone nom="arrow_forward" className="text-lg shrink-0 group-hover:translate-x-1 transition-transform duration-250" />
          </span>
        ) : (
          <span className="flex items-center justify-between gap-2 w-full px-4 py-2.5 rounded-xl font-label-md text-label-md bg-surface-container/50 text-on-surface-variant border border-hairline/40">
            <span>Hors de votre habilitation</span>
            <Icone nom="lock" className="text-base opacity-50 shrink-0" />
          </span>
        )}
      </div>
    </>
  );

  const classe = "group relative flex flex-col rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/50 shadow-[0_4px_24px_rgba(61,0,122,0.12)] overflow-hidden min-h-72 p-5";

  if (!autorise) {
    return (
      <article aria-disabled="true" title="Hors de votre habilitation" className={`${classe} opacity-60`}>
        {corps}
      </article>
    );
  }
  return (
    <Link to={vers} className={`${classe} hover:shadow-[0_16px_48px_rgba(61,0,122,0.20)] hover:border-white/70 hover:bg-white/90 transition-[box-shadow,border-color,background-color] duration-300`}>
      {corps}
    </Link>
  );
}
