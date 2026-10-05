import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError, api } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale as ModaleCommune, type ModaleProps } from "../../ui/Modale";
import type { EtatCandidature, EtatSession } from "./types";
import { Icone } from "../../ui/Icone";

export const CHAMP =
  "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-container-low disabled:text-on-surface-variant";
export const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline";
export { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE };
export const BOUTON_ICONE = "p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container disabled:opacity-40";

// --- États ---------------------------------------------------------------------

const TON_SESSION: Record<EtatSession, string> = {
  a_planifier: "bg-surface-container-high text-on-surface-variant",
  planifiee: "bg-surface-container text-primary",
  inscriptions_ouvertes: "bg-primary-fixed text-on-primary-fixed",
  en_cours: "bg-secondary-fixed text-on-secondary-fixed",
  terminee: "bg-surface-container-high text-on-surface",
  annulee: "bg-error-container text-on-error-container",
};
const TON_CANDIDATURE: Record<EtatCandidature, string> = {
  avis_hierarchique: "bg-surface-container text-on-surface-variant",
  controle_sd: "bg-secondary-fixed text-on-secondary-fixed",
  visa_drh: "bg-surface-container text-primary",
  retenue: "bg-primary-fixed text-on-primary-fixed",
  refusee: "bg-error-container text-on-error-container",
};

export function Badge({ children, ton }: { children: ReactNode; ton: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold whitespace-nowrap ${ton}`}>{children}</span>;
}

export function BadgeSession({ etat, libelle }: { etat: EtatSession; libelle: string }) {
  return <Badge ton={TON_SESSION[etat]}>{libelle}</Badge>;
}

export function BadgeCandidature({ etat, libelle }: { etat: EtatCandidature; libelle: string }) {
  return <Badge ton={TON_CANDIDATURE[etat]}>{libelle}</Badge>;
}

// --- Mise en page ----------------------------------------------------------------

export function EnTeteSection({ icone, titre, sousTitre, action }: { icone: string; titre: string; sousTitre?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-2">
          <Icone nom={icone} className="text-primary text-xl" />
          {titre}
        </h2>
        {sousTitre ? <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{sousTitre}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Vide({ icone, titre, texte, action }: { icone: string; titre: string; texte: string; action?: ReactNode }) {
  return (
    <div className="motion-content rounded-xl border border-dashed border-outline-variant p-8 text-center">
      <Icone nom={icone} className="text-3xl text-on-surface-variant" />
      <p className="font-label-lg text-label-lg text-on-surface mt-2">{titre}</p>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-md mx-auto">{texte}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

// --- Champs ----------------------------------------------------------------------

type ChampProps = { libelle: string; obligatoire?: boolean; aide?: string; className?: string };

function Libelle({ libelle, obligatoire, children, aide, className = "" }: ChampProps & { children: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="block font-label-md text-label-md text-on-surface mb-1">
        {libelle}
        {obligatoire ? <span className="text-error"> *</span> : null}
      </span>
      {children}
      {aide ? <span className="block mt-1 font-label-sm text-label-sm text-on-surface-variant">{aide}</span> : null}
    </label>
  );
}

export function Texte({ valeur, onChange, max, placeholder, ...props }: ChampProps & { valeur: string; onChange: (v: string) => void; max?: number; placeholder?: string }) {
  return (
    <Libelle {...props}>
      <input className={CHAMP} value={valeur} maxLength={max} placeholder={placeholder} required={props.obligatoire} onChange={(e) => onChange(e.target.value)} />
    </Libelle>
  );
}

export function Nombre({ valeur, onChange, min = 0, max, unite, ...props }: ChampProps & { valeur: string; onChange: (v: string) => void; min?: number; max?: number; unite?: string }) {
  return (
    <Libelle {...props}>
      <span className="relative block">
        <input className={`${CHAMP} ${unite ? "pr-16" : ""}`} type="number" inputMode="numeric" min={min} max={max} value={valeur} required={props.obligatoire} onChange={(e) => onChange(e.target.value)} />
        {unite ? <span className="absolute right-3 top-1/2 -translate-y-1/2 font-label-sm text-label-sm text-on-surface-variant pointer-events-none">{unite}</span> : null}
      </span>
    </Libelle>
  );
}

export function DateChamp({ valeur, onChange, min, ...props }: ChampProps & { valeur: string; onChange: (v: string) => void; min?: string }) {
  return (
    <Libelle {...props}>
      <input className={CHAMP} type="date" value={valeur} min={min} required={props.obligatoire} onChange={(e) => onChange(e.target.value)} />
    </Libelle>
  );
}

export function Liste({ valeur, onChange, options, vide, ...props }: ChampProps & { valeur: string; onChange: (v: string) => void; options: { valeur: string; libelle: string }[]; vide?: string }) {
  return (
    <Libelle {...props}>
      <select className={CHAMP} value={valeur} required={props.obligatoire} onChange={(e) => onChange(e.target.value)}>
        {vide !== undefined ? <option value="">{vide}</option> : null}
        {options.map((o) => (
          <option key={o.valeur} value={o.valeur}>{o.libelle}</option>
        ))}
      </select>
    </Libelle>
  );
}

export function Zone({ valeur, onChange, max, lignes = 3, ...props }: ChampProps & { valeur: string; onChange: (v: string) => void; max?: number; lignes?: number }) {
  return (
    <Libelle {...props}>
      <textarea
        className={`${CHAMP} h-auto py-2 resize-y`}
        rows={lignes}
        maxLength={max}
        value={valeur}
        required={props.obligatoire}
        onChange={(e) => onChange(e.target.value)}
      />
    </Libelle>
  );
}

export function Case({ libelle, coche, onChange, aide }: { libelle: string; coche: boolean; onChange: (v: boolean) => void; aide?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={coche} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-label-md text-label-md text-on-surface">{libelle}</span>
        {aide ? <span className="block font-label-sm text-label-sm text-on-surface-variant">{aide}</span> : null}
      </span>
    </label>
  );
}

// --- Modale de formulaire ----------------------------------------------------------

/**
 * Enregistre un formulaire auprès de l'API : en cas de refus, le message du serveur s'affiche
 * dans la modale (la saisie est conservée) ; en cas de succès, toutes les données se rafraîchissent.
 */
export function useEnregistrement<T>(onSucces: (reponse: T) => void, succes: string) {
  const client = useQueryClient();
  const feedback = useFeedback();
  return useMutation({
    mutationFn: ({ route, methode, corps }: { route: string; methode: "POST" | "PATCH" | "PUT"; corps: unknown }) =>
      api<T>(route, { method: methode, body: JSON.stringify(corps) }),
    onSuccess: async (reponse) => {
      await client.invalidateQueries();
      feedback.toast(succes);
      onSucces(reponse);
    },
  });
}

export function messageErreur(erreur: unknown): string {
  if (!erreur) return "";
  return erreur instanceof ApiError ? erreur.message : "L'enregistrement n'a pas abouti. Vérifiez votre connexion.";
}

const TAILLES: Record<string, ModaleProps["taille"]> = {
  "max-w-md": "sm",
  "max-w-lg": "md",
  "max-w-xl": "lg",
  "max-w-2xl": "lg",
  "max-w-3xl": "xl",
  "max-w-4xl": "2xl",
};

/** Modale des écrans de formation : la fenêtre commune, avec Annuler/Valider (ou Fermer) en pied. */
export function Modale({
  titre,
  sousTitre,
  onClose,
  onSubmit,
  enCours = false,
  erreur,
  libelleValider = "Enregistrer",
  largeur = "max-w-2xl",
  children,
  pied,
}: {
  titre: string;
  sousTitre?: string;
  onClose: () => void;
  onSubmit?: () => void;
  enCours?: boolean;
  erreur?: string;
  libelleValider?: string;
  largeur?: string;
  children: ReactNode;
  pied?: ReactNode;
}) {
  return (
    <ModaleCommune
      titre={titre}
      sousTitre={sousTitre}
      onClose={onClose}
      onSubmit={onSubmit}
      enCours={enCours}
      erreur={erreur || undefined}
      taille={TAILLES[largeur] ?? "lg"}
      pied={
        <>
          {pied}
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={enCours}>
            {onSubmit ? "Annuler" : "Fermer"}
          </button>
          {onSubmit ? (
            <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours}>
              {enCours ? <Icone nom="progress_activity" className="text-lg motion-spin" /> : null}
              {enCours ? "Enregistrement…" : libelleValider}
            </button>
          ) : null}
        </>
      }
    >
      {children}
    </ModaleCommune>
  );
}
