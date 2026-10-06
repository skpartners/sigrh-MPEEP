import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { SessionUser } from "../api/types";
import { Icone } from "../ui/Icone";
import { AppChrome } from "./AppChrome";
import { destinationModule, moduleAutorise, NAV, sousMenus, type LienNav } from "./navigation";

const ACCENTS = [
  {
    barre: "from-primary to-primary-container",
    pastille: "bg-primary-fixed text-primary",
    badge: "bg-primary-fixed text-on-primary-fixed-variant",
    point: "bg-primary",
    action: "text-primary",
    titre: "group-hover:text-primary",
  },
  {
    barre: "from-secondary-container to-secondary",
    pastille: "bg-secondary-fixed text-secondary",
    badge: "bg-secondary-fixed text-on-secondary-fixed",
    point: "bg-secondary",
    action: "text-secondary",
    titre: "group-hover:text-secondary",
  },
  {
    barre: "from-surface-variant to-tertiary",
    pastille: "bg-surface-container text-tertiary",
    badge: "bg-surface-container-high text-on-tertiary-fixed",
    point: "bg-tertiary",
    action: "text-tertiary",
    titre: "group-hover:text-tertiary",
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

  let indexCarte = 0;

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 flex flex-col gap-8">
        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-label-md text-label-md text-on-surface-variant flex flex-wrap items-center gap-2">
              <Icone nom="verified_user" className="text-base text-primary" />
              {me.data ? (
                <span>
                  Session active : <strong className="text-on-surface font-semibold">{me.data.fonction} · {me.data.organisme_sigle}</strong>
                </span>
              ) : (
                <span>Ouverture de la session…</span>
              )}
            </p>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <h1 className="font-headline-lg text-headline-lg sm:text-headline-xl text-on-surface tracking-tight">
                Menu
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-2 max-w-2xl">
                Choisissez un module pour ouvrir son accueil. S'il contient des sous-menus, ils s'affichent alors dans la barre latérale.
              </p>
            </div>
            <div className="relative w-full sm:w-80">
              <label htmlFor={rechercheId} className="sr-only">Rechercher un module</label>
              <Icone nom="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none" />
              <input
                ref={champ}
                id={rechercheId}
                className="w-full pl-9 pr-16 py-2.5 rounded-lg bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm border border-hairline shadow-sm focus:outline-none focus:border-primary-container"
                placeholder="Rechercher un module…"
                type="search"
                value={filtre}
                onChange={(event) => setFiltre(event.target.value)}
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-hairline bg-surface-container font-code-num text-label-sm text-on-surface-variant" aria-hidden="true">
                Ctrl+K
              </kbd>
            </div>
          </div>
        </section>

        {liens.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            Aucun module ne correspond à « {filtre.trim()} ».
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
      <span className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${accent.barre}`} aria-hidden="true" />
      <div>
        <span className="flex items-start justify-between gap-2 mb-4">
          <span className={`w-12 h-12 rounded-lg flex items-center justify-center shadow-sm text-[26px] ${accent.pastille} ${autorise ? "group-hover:scale-105 transition-transform" : ""}`}>
            <Icone nom={lien.icone} />
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold ${accent.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${accent.point}`} aria-hidden="true" />
            {detail}
          </span>
        </span>
        <span className={`block font-headline-sm text-headline-sm text-on-surface ${autorise ? accent.titre : ""} transition-colors`}>
          {lien.libelle}
        </span>
        <span className="block font-body-md text-body-md text-on-surface-variant mt-2 leading-relaxed">
          {lien.resume}
        </span>
        {enfants.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1.5" aria-label={`Sous-menus de ${lien.libelle}`}>
            {enfants.map((enfant) => (
              <li key={enfant.to} className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
                <Icone nom={enfant.icone} className={`text-base shrink-0 ${accent.action}`} />
                <span>{enfant.libelle}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="pt-4 mt-4 flex items-center justify-between gap-3">
        <span className="font-label-md text-label-md text-on-surface-variant">
          {autorise ? "Ouvrir le module" : "Hors de votre habilitation"}
        </span>
        {autorise ? (
          <span className={`inline-flex items-center gap-1 font-label-lg text-label-lg font-bold ${accent.action} group-hover:translate-x-1 transition-transform`}>
            Ouvrir
            <Icone nom="arrow_forward" className="text-lg" />
          </span>
        ) : (
          <Icone nom="lock" className="text-lg text-outline" />
        )}
      </span>
    </>
  );

  const classe = "group relative flex flex-col justify-between p-6 rounded-xl bg-surface-container-lowest border border-hairline shadow-sm overflow-hidden min-h-64";
  if (!autorise) {
    return (
      <article aria-disabled="true" title="Hors de votre habilitation" className={`${classe} opacity-70`}>
        {corps}
      </article>
    );
  }
  return (
    <Link to={vers} className={`${classe} hover:shadow-lg transition-shadow`}>
      {corps}
    </Link>
  );
}
