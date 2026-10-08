import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { Circuits } from "../api/types";
import { Skeleton } from "../ui/Motion";
import { AppChrome } from "./AppChrome";
import { ConfigurerCircuits } from "./circuits/ConfigurerCircuits";
import { Icone } from "../ui/Icone";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";

const ICONES_ETAPES = ["edit_note", "pending_actions", "policy", "draw", "mark_email_read"];

export function CircuitsScreen() {
  const { hash } = useLocation();
  const circuits = useQuery({ queryKey: ["circuits"], queryFn: () => api<Circuits>("/api/v1/circuits/") });
  const data = circuits.data;
  if (hash === "#rbac") return <Navigate to="/app/habilitations" replace />;

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1">
        <div className="flex flex-col w-full space-y-8">
          {circuits.isError ? (
            <div className={`${CARD} p-6`} role="alert">
              <p className="font-label-lg text-label-lg text-error">Les circuits n'ont pas pu être chargés.</p>
              <button type="button" className="mt-3 h-8 px-3 rounded bg-primary-container text-on-primary font-label-md text-label-md hover:bg-primary" onClick={() => circuits.refetch()}>
                Réessayer
              </button>
            </div>
          ) : null}

          <ConfigurerCircuits />

          <section className="space-y-4 motion-rise" style={{ "--delay": "80ms" } as CSSProperties} aria-labelledby="titre-parcours">
            <div>
              <h2 id="titre-parcours" className="font-headline-md text-headline-md text-on-surface">Parcours d'une requête par défaut</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Circuit appliqué par défaut, en cinq étapes, avec contrôle de légalité et retour possible à l'agent.</p>
            </div>
            <ol className={`${CARD} p-6 grid grid-cols-1 lg:grid-cols-5 gap-4`}>
              {data
                ? data.parcours.map((etape, index) => (
                    <li key={etape.ordre} className="motion-content relative rounded-lg p-4 bg-surface-container-low flex flex-col justify-between" style={{ "--delay": `${index * 60}ms` } as CSSProperties}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-code-num text-code-num flex items-center justify-center font-bold">{etape.ordre}</span>
                          <Icone nom={ICONES_ETAPES[index] ?? "radio_button_checked"} className="text-primary text-xl" />
                        </div>
                        <div>
                          <p className="font-label-md text-label-md text-on-surface-variant font-bold">{etape.acteur}</p>
                          <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">{etape.titre}</h3>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{etape.texte}</p>
                      </div>
                      {etape.metas.map((meta) => (
                        <div key={meta.label} className="mt-4 bg-surface-container-lowest/80 -mx-4 -mb-4 p-3 rounded-b-lg flex items-center justify-between gap-2">
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{meta.label}</span>
                          <span className="font-code-num text-code-num text-on-surface font-semibold text-right">{meta.value}</span>
                        </div>
                      ))}
                      {index < data.parcours.length - 1 ? (
                        <Icone nom="arrow_forward" className="hidden lg:block absolute top-1/2 -right-[1.1875rem] -translate-y-1/2 z-10 text-primary text-2xl" />
                      ) : null}
                    </li>
                  ))
                : [0, 1, 2, 3, 4].map((index) => <li key={index}><Skeleton className="h-56 rounded-lg" /></li>)}
            </ol>
          </section>
        </div>
      </div>
    </AppChrome>
  );
}
