import type { ReactNode } from "react";
import { mediaUrl } from "../api/client";
import { dateCourte } from "./format";

/*
 * Circuit de validation animé : une ligne de progression qui se remplit d'étape en étape, des bornes qui apparaissent en cascade,
 * une coche (ou une croix) qui se dessine, et un anneau qui pulse sur l'étape en attente. Horizontal sur grand écran, vertical sur mobile.
 * Les animations sont dans app.css (classes `fil-*`) et se réduisent à un simple fondu si l'utilisateur demande moins de mouvement.
 */

export type VisaFil = {
  ordre: number;
  instance: string;
  avis: string;
  titulaire: string;
  date: string | null;
  commentaire?: string;
  /** Imposé par l'appelant quand l'avis seul ne suffit pas à dire où en est l'étape. */
  etat?: "ok" | "refus" | "attente";
  fonction?: string;
  signature_url?: string;
  /** Texte libre sous l'étape (appréciation, observation…). */
  detail?: ReactNode;
};

type Etat = "ok" | "refus" | "actuel" | "attente" | "modele";

function etatDuVisa(visa: VisaFil): "ok" | "refus" | "attente" {
  if (visa.etat) return visa.etat;
  if (/favorable|d[ée]pos|d[ée]livr|accord|sign[ée]|vis[ée]|notifi[ée]|termin|valid/i.test(visa.avis)) return "ok";
  if (/refus|sans suite/i.test(visa.avis)) return "refus";
  return "attente";
}

const COULEURS: Record<Etat, { noeud: string; texte: string; pastille: string }> = {
  modele: { noeud: "bg-primary text-on-primary border-primary", texte: "text-on-surface", pastille: "" },
  ok: { noeud: "bg-[#16a34a] text-white border-[#16a34a]", texte: "text-on-surface", pastille: "bg-[#16a34a]/15 text-[#166534]" },
  refus: { noeud: "bg-error text-on-error border-error", texte: "text-on-surface", pastille: "bg-error-container text-on-error-container" },
  actuel: { noeud: "bg-surface-container-lowest text-primary border-primary", texte: "text-on-surface", pastille: "bg-primary-fixed text-on-primary-fixed" },
  attente: { noeud: "bg-surface-container-lowest text-on-surface-variant border-outline-variant", texte: "text-on-surface-variant", pastille: "bg-surface-container text-on-surface-variant" },
};

function Coche() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="fil-trace" d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
    </svg>
  );
}

function Croix() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path className="fil-trace" d="M6 6l12 12" pathLength={1} />
      <path className="fil-trace fil-trace-2" d="M18 6L6 18" pathLength={1} />
    </svg>
  );
}

/**
 * `enCours` : la demande n'est pas encore décidée, la première étape en attente est alors l'étape actuelle ; `ordreActuel` la désigne
 * directement (null : aucune). `modele` : circuit configuré, sans avancement. `libelleActuel` : mot affiché sur l'étape actuelle.
 */
export function FilVisas({ visas, enCours, libelle, ordreActuel, modele = false, libelleActuel = "À valider" }: {
  visas: VisaFil[]; enCours: boolean; libelle: string; ordreActuel?: number | null; modele?: boolean; libelleActuel?: string;
}) {
  const etats = visas.map((visa) => etatDuVisa(visa));
  const rangActuel = modele ? -1 : ordreActuel !== undefined ? visas.findIndex((visa) => visa.ordre === ordreActuel) : enCours ? etats.findIndex((etat) => etat === "attente") : -1;
  const valides = modele ? visas.length : etats.filter((etat) => etat === "ok").length;
  const refuse = etats.includes("refus");
  const part = visas.length ? Math.round((valides / visas.length) * 100) : 0;

  return (
    <div className="space-y-3">
      {modele ? null : <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={part} aria-label={`Avancement du circuit : ${valides} étape${valides > 1 ? "s" : ""} validée${valides > 1 ? "s" : ""} sur ${visas.length}`}>
          <div className={`fil-progression h-full rounded-full ${refuse ? "bg-error" : "bg-[#16a34a]"}`} style={{ width: `${part}%` }} />
        </div>
        <span className="font-label-sm text-label-sm font-bold text-on-surface-variant tabular-nums">{valides} / {visas.length}</span>
      </div>}

      <ol className="flex flex-col lg:flex-row" aria-label={libelle}>
        {visas.map((visa, rang) => {
          const etat: Etat = modele ? "modele" : rang === rangActuel ? "actuel" : etats[rang];
          const couleurs = COULEURS[etat];
          const dernier = rang === visas.length - 1;
          // Le trait qui suit une étape validée se remplit ; les autres restent vides.
          const rempli = modele || etats[rang] === "ok";
          return (
            <li key={visa.ordre} className="fil-etape relative flex flex-1 gap-3 pb-5 lg:flex-col lg:items-start lg:gap-2 lg:pb-0 lg:pr-3" style={{ ["--i" as string]: rang }}>
              <div className="relative flex shrink-0 flex-col items-center lg:w-full lg:flex-row">
                <span
                  className={`fil-noeud relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-label-md text-label-md font-bold ${couleurs.noeud} ${etat === "actuel" ? "fil-actuel" : ""}`}
                  aria-hidden="true"
                >
                  {etat === "ok" ? <Coche /> : etat === "refus" ? <Croix /> : visa.ordre}
                </span>
                {dernier ? null : (
                  <span className="mt-1 h-full min-h-6 w-0.5 flex-1 overflow-hidden rounded-full bg-surface-container-high lg:mx-2 lg:mt-0 lg:h-0.5 lg:min-h-0 lg:w-auto" aria-hidden="true">
                    <span className={`fil-trait block h-full w-full bg-[#16a34a] ${rempli ? "fil-trait-plein" : ""}`} />
                  </span>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <p className={`font-label-md text-label-md font-semibold leading-snug ${couleurs.texte}`}>{visa.instance}</p>
                {modele ? null : <span className={`inline-block rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-bold ${couleurs.pastille}`}>{etat === "actuel" ? libelleActuel : visa.avis}</span>}
                {visa.titulaire ? <p className="font-body-sm text-body-sm text-on-surface-variant">{visa.titulaire}{visa.date ? ` · ${dateCourte(visa.date)}` : ""}</p> : null}
                {visa.fonction && !modele ? <p className="font-label-sm text-label-sm text-on-surface-variant">{visa.fonction}</p> : null}
                {visa.detail ? <div className="font-body-sm text-body-sm text-on-surface-variant">{visa.detail}</div> : null}
                {visa.commentaire ? <p className="font-body-sm text-body-sm italic text-on-surface-variant">« {visa.commentaire} »</p> : null}
                {visa.signature_url ? (
                  <div className="flex h-12 w-32 items-center justify-center rounded bg-white px-2">
                    <img src={mediaUrl(visa.signature_url)} alt={`Signature de ${visa.titulaire || visa.instance}`} className="max-h-10 max-w-full object-contain" />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
