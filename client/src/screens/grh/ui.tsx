import { Chargement } from "../../ui/Chargement";
import type { ReactNode } from "react";
import { Icone } from "../../ui/Icone";
import { nombre } from "../../ui/format";
import { AppChrome } from "../AppChrome";

export const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";
export const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline";
export const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
export const LIBELLE = "block mb-1 font-label-md text-label-md text-on-surface";
export const PRIMAIRE = "inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md disabled:opacity-50";
export const SECOND = "inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-low text-primary hover:bg-surface-container font-label-md text-label-md disabled:opacity-50";

/** Cadre commun des écrans GRH : fil d'Ariane, titre, résumé, actions. */
export function PageGrh({ rubrique, titre, resume, actions, children, chargement, erreur }: {
  rubrique: string;
  titre: string;
  resume?: string;
  actions?: ReactNode;
  children?: ReactNode;
  chargement?: boolean;
  erreur?: string;
}) {
  return (
    <AppChrome>
      <div className={PAGE}>
        <section className={`${CARTE} p-6 motion-rise`}>
          <p className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            <span>GRH</span>
            <Icone nom="chevron_right" className="text-xs" />
            <span className="font-bold text-primary">{rubrique}</span>
          </p>
          <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">{titre}</h1>
              {resume ? <p className="mt-2 max-w-3xl font-body-md text-body-md text-on-surface-variant">{resume}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
        </section>
        {chargement ? <Chargement libelle="Chargement…" /> : erreur ? <p role="alert" className="text-error">{erreur}</p> : children}
      </div>
    </AppChrome>
  );
}

export function Kpi({ libelle, valeur, detail, icone }: { libelle: string; valeur: string; detail?: string; icone?: string }) {
  return (
    <div className={`${CARTE} p-5`}>
      <p className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
        {icone ? <Icone nom={icone} className="text-base text-primary" /> : null}{libelle}
      </p>
      <p className="mt-2 font-headline-lg text-headline-lg text-on-surface font-bold">{valeur}</p>
      {detail ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{detail}</p> : null}
    </div>
  );
}

export function Section({ titre, icone, children, className = "" }: { titre: string; icone?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARTE} p-6 ${className}`}>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-4 flex items-center gap-2">
        {icone ? <Icone nom={icone} className="text-primary text-xl" /> : null}{titre}
      </h2>
      {children}
    </section>
  );
}

/** Liste de barres horizontales : libellé, effectif et part. */
export function Repartition({ lignes, vide = "Aucune donnée pour cet exercice." }: { lignes: { libelle: string; nombre: number; part: number }[]; vide?: string }) {
  if (!lignes.length) return <p className="font-body-sm text-on-surface-variant">{vide}</p>;
  return (
    <ul className="space-y-3">
      {lignes.map((ligne) => (
        <li key={ligne.libelle}>
          <div className="flex items-baseline justify-between gap-3 font-body-sm text-body-sm">
            <span className="text-on-surface">{ligne.libelle}</span>
            <span className="text-on-surface-variant whitespace-nowrap"><strong className="text-on-surface">{nombre(ligne.nombre)}</strong> · {nombre(ligne.part, 1)} %</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-container" role="presentation">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(ligne.part, 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function pourcent(valeur: number | null | undefined): string {
  return valeur === null || valeur === undefined ? "—" : `${nombre(valeur, 1)} %`;
}
