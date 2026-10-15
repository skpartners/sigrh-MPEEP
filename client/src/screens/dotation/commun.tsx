import type { ReactNode } from "react";
import { ApiError, mediaUrl } from "../../api/client";
import { Icone } from "../../ui/Icone";
import { Pagination } from "../../ui/Pagination";

export const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
export const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";
export const BOUTON = "inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50";
export const BOUTON_LEGER = "inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold disabled:opacity-50";
export const ICONE = "p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-40";

export type Structure = { id: number; nom: string; niveau_libelle: string };
export type AgentRef = { matricule: string; nom_complet: string; grade?: string };

export type Mouvement = {
  id: number; reference: string; type: "affectation" | "reaffectation"; categorie: string; categorie_libelle: string;
  agent: AgentRef; structure: { id: number; nom: string }; precedente: string; emploi: { code: string; libelle: string } | null;
  concours: string; date_effet: string; reference_acte: string; document_url: string; document_nom: string; observation: string;
};
export type Redeploiement = {
  id: number; reference: string; agent: AgentRef; origine: string; destination: { id: number; nom: string }; motif: string; initiateur: string;
  date_effet: string; statut: "declenche" | "connu" | "effectue"; statut_libelle: string; connaissance_par: string; connaissance_le: string;
  observation_connaissance: string; effectue_le: string; reference_acte: string; observation: string; depose_le: string;
};
export type Disposition = {
  id: number; agent: AgentRef; ministere_accueil: string; structure_accueil: string; date_debut: string; date_fin: string; motif: string;
  avis_url: string; avis_nom: string; statut: "en_attente" | "acceptee" | "rejetee" | "constatee"; statut_libelle: string; motif_decision: string;
  decide_par: string; decide_le: string; constate_le: string; reference_acte: string; observation: string; etat: string; etat_libelle: string; depose_le: string;
};

export function erreurDe(erreur: unknown, repli: string): string | undefined {
  if (erreur instanceof ApiError) return erreur.message;
  return erreur ? repli : undefined;
}

export function Pastille({ ton, children }: { ton: "ok" | "attente" | "refus" | "neutre"; children: ReactNode }) {
  const classes = {
    ok: "bg-primary-fixed text-on-primary-fixed",
    attente: "bg-secondary-fixed text-on-secondary-fixed",
    refus: "bg-error-container text-on-error-container",
    neutre: "bg-surface-container-high text-on-surface",
  }[ton];
  return <span className={`inline-flex px-2.5 py-1 rounded font-label-sm text-label-sm font-bold ${classes}`}>{children}</span>;
}

export function Recherche({ valeur, onChange, placeholder, libelle }: { valeur: string; onChange: (v: string) => void; placeholder: string; libelle: string }) {
  return (
    <div className="relative w-full max-w-md">
      <Icone nom="search" className="text-lg absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
      <input type="search" aria-label={libelle} placeholder={placeholder} className={`${CHAMP} pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden`} value={valeur} onChange={(e) => onChange(e.target.value)} />
      {valeur ? (
        <button type="button" aria-label="Effacer la recherche" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-on-surface-variant hover:text-primary" onClick={() => onChange("")}>
          <Icone nom="close" className="text-base" />
        </button>
      ) : null}
    </div>
  );
}

/** Tableau paginé : les colonnes, les lignes déjà filtrées et la page courante sont fournis par l'appelant. */
export function TableauListe({ colonnes, vide, children, page }: {
  colonnes: string[];
  vide: string | null;
  children: ReactNode;
  page: { page: number; pages: number; total: number; aller: (p: number) => void; libelle: string };
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
              {colonnes.map((c, i) => <th key={c} className={`py-2 pr-4 font-medium ${i === colonnes.length - 1 && c === "Actions" ? "text-right pr-0" : ""}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {vide ? <tr><td colSpan={colonnes.length} className="py-6 text-on-surface-variant">{vide}</td></tr> : children}
          </tbody>
        </table>
      </div>
      <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle={page.libelle} />
    </>
  );
}

export function LienDocument({ url, nom }: { url: string; nom: string }) {
  if (!url) return <span className="text-on-surface-variant">—</span>;
  return (
    <a className="inline-flex items-center gap-1 text-primary font-semibold hover:underline" href={mediaUrl(url)} target="_blank" rel="noreferrer">
      <Icone nom="description" className="text-base" />{nom || "Document"}
    </a>
  );
}
