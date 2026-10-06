import { useEffect, useId, useLayoutEffect, useRef, type FormEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icone } from "./Icone";

/**
 * Fenêtre modale unique de l'application.
 *
 * - Entrée : le voile apparaît en fondu, la fenêtre monte en grandissant légèrement ;
 *   sur mobile, elle glisse depuis le bas comme une feuille.
 * - Sortie : animée même quand le parent démonte la modale (enregistrement réussi…) :
 *   une copie figée joue l'animation de sortie, puis disparaît.
 * - Pile : Échap ne ferme que la modale du dessus ; le défilement de la page reste
 *   bloqué tant qu'une modale est ouverte ; le focus reste dans la modale, puis
 *   revient à l'élément qui l'a ouverte.
 */

export const BOUTON_PRIMAIRE =
  "inline-flex items-center justify-center gap-2 h-8 px-3 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container disabled:opacity-60";
export const BOUTON_SECONDAIRE =
  "inline-flex items-center justify-center gap-2 h-8 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-label-md text-label-md hover:bg-surface-container-low disabled:opacity-60";
export const BOUTON_DANGER =
  "inline-flex items-center justify-center gap-2 h-8 px-3 rounded bg-error text-on-error font-label-md text-label-md hover:opacity-90 disabled:opacity-60";

type Taille = "sm" | "md" | "lg" | "xl" | "2xl";
const LARGEUR: Record<Taille, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
  "2xl": "sm:max-w-4xl",
};
const TON = {
  neutre: "bg-primary-fixed text-primary",
  danger: "bg-error-container text-on-error-container",
  attention: "bg-secondary-fixed text-secondary",
};
const DUREE_SORTIE_MS = 200;
const FOCALISABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// --- Pile des modales ouvertes -----------------------------------------------------

const pile: string[] = [];
let debordementInitial = "";

function empiler(id: string) {
  if (pile.length === 0) {
    debordementInitial = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  pile.push(id);
}

function depiler(id: string) {
  const index = pile.lastIndexOf(id);
  if (index >= 0) pile.splice(index, 1);
  if (pile.length === 0) document.body.style.overflow = debordementInitial;
}

export function estAuDessus(id: string): boolean {
  return pile[pile.length - 1] === id;
}

function reduireMouvement(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Copie figée de la modale qui joue l'animation de sortie après le démontage. */
function animerSortie(voile: HTMLElement) {
  const fantome = voile.cloneNode(true) as HTMLElement;
  // cloneNode ne recopie pas la saisie en cours : on la reporte pour éviter un champ qui se vide.
  const sources = voile.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  fantome.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select").forEach((champ, i) => {
    const source = sources[i];
    // Un champ fichier n'accepte pas de valeur affectée par script : on le laisse vide.
    if (!source || (champ instanceof HTMLInputElement && champ.type === "file")) return;
    if (champ instanceof HTMLInputElement && (champ.type === "checkbox" || champ.type === "radio")) champ.checked = (source as HTMLInputElement).checked;
    else champ.value = source.value;
  });
  fantome.setAttribute("aria-hidden", "true");
  fantome.setAttribute("inert", "");
  fantome.classList.add("modale-sortie");
  document.body.appendChild(fantome);
  window.setTimeout(() => fantome.remove(), DUREE_SORTIE_MS + 40);
}

// --- Composant ----------------------------------------------------------------------

export type ModaleProps = {
  titre: string;
  sousTitre?: ReactNode;
  /** Icône Material affichée à gauche du titre. */
  icone?: string;
  ton?: keyof typeof TON;
  taille?: Taille;
  /** Compatibilité : équivaut à taille « xl ». */
  large?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pied de fenêtre (boutons). Avec onSubmit et sans pied : Annuler + bouton de validation. */
  pied?: ReactNode;
  /** Fait de la fenêtre un formulaire : Entrée ou le bouton de validation appellent onSubmit. */
  onSubmit?: () => void;
  libelleValider?: string;
  libelleAnnuler?: string;
  /** Pendant un enregistrement : la fenêtre ne se ferme pas et le bouton de validation patiente. */
  enCours?: boolean;
  erreur?: ReactNode;
  role?: "dialog" | "alertdialog";
  /** Élément focalisé à l'ouverture (sinon le premier champ, sinon le bouton de fermeture). */
  focusInitial?: RefObject<HTMLElement | null>;
  /** Cache le bouton de fermeture (attente non interruptible). */
  sansFermeture?: boolean;
  /** Titre et sous-titre centrés. */
  centre?: boolean;
};

export function Modale({
  titre,
  sousTitre,
  icone,
  ton = "neutre",
  taille,
  large = false,
  onClose,
  children,
  pied,
  onSubmit,
  libelleValider = "Enregistrer",
  libelleAnnuler = "Annuler",
  enCours = false,
  erreur,
  role = "dialog",
  focusInitial,
  sansFermeture = false,
  centre = false,
}: ModaleProps) {
  const id = useId();
  const voile = useRef<HTMLDivElement>(null);
  const carte = useRef<HTMLElement>(null);
  // Références stables : les effets ne se relancent pas à chaque rendu du parent.
  const fermer = useRef(onClose);
  const occupe = useRef(enCours);
  fermer.current = onClose;
  occupe.current = enCours;

  useLayoutEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    const ouverture = performance.now();
    empiler(id);
    const element = voile.current;
    return () => {
      depiler(id);
      // StrictMode démonte et remonte aussitôt en développement : pas d'animation dans ce cas.
      if (element && performance.now() - ouverture > 80 && !reduireMouvement()) animerSortie(element);
      if (precedent?.isConnected) precedent.focus?.();
    };
  }, [id]);

  useEffect(() => {
    const cible =
      focusInitial?.current ??
      [...(carte.current?.querySelectorAll<HTMLElement>(".modale-contenu " + FOCALISABLES.split(", ").join(", .modale-contenu ")) ?? [])].find((e) => !e.hasAttribute("readonly")) ??
      carte.current?.querySelector<HTMLElement>(FOCALISABLES);
    cible?.focus();

    function clavier(event: KeyboardEvent) {
      if (!estAuDessus(id)) return;
      if (event.key === "Escape" && !occupe.current && !sansFermeture) {
        event.stopPropagation();
        fermer.current();
      }
      // Tabulation prisonnière de la modale.
      if (event.key === "Tab" && carte.current) {
        const elements = [...carte.current.querySelectorAll<HTMLElement>(FOCALISABLES)].filter((e) => e.getClientRects().length);
        if (elements.length === 0) return;
        const premier = elements[0];
        const dernier = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === premier) {
          event.preventDefault();
          dernier.focus();
        } else if (!event.shiftKey && document.activeElement === dernier) {
          event.preventDefault();
          premier.focus();
        }
      }
    }
    document.addEventListener("keydown", clavier);
    return () => document.removeEventListener("keydown", clavier);
  }, [id, focusInitial, sansFermeture]);

  function soumettre(event: FormEvent) {
    event.preventDefault();
    if (!enCours) onSubmit?.();
  }

  const piedEffectif =
    pied ??
    (onSubmit ? (
      <>
        <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={enCours}>
          {libelleAnnuler}
        </button>
        <button type="submit" className={ton === "danger" ? BOUTON_DANGER : BOUTON_PRIMAIRE} disabled={enCours}>
          {enCours ? <Icone nom="progress_activity" className="text-lg motion-spin" /> : null}
          {enCours ? "Enregistrement…" : libelleValider}
        </button>
      </>
    ) : null);

  const contenu = (
    <>
      <div className="flex h-1 w-full shrink-0" aria-hidden="true">
        <span className="w-1/3 bg-secondary-container" />
        <span className="w-1/3 bg-surface-container" />
        <span className="w-1/3 bg-primary-container" />
      </div>
      <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-outline-variant sm:hidden" aria-hidden="true" />
      <header className={`flex shrink-0 gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-5 ${centre ? "flex-col items-center text-center" : "items-start"}`}>
        {icone ? (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TON[ton]}`} aria-hidden="true">
            <Icone nom={icone} className="text-xl" />
          </span>
        ) : null}
        <div className={`min-w-0 pt-0.5 ${centre ? "w-full" : "flex-1"}`}>
          <h2 id={`${id}-titre`} className="font-headline-sm text-headline-sm text-on-surface font-bold">{titre}</h2>
          {sousTitre ? <div id={`${id}-description`} className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{sousTitre}</div> : null}
        </div>
        {sansFermeture ? null : (
          <button
            type="button"
            className="-mr-1 -mt-1 rounded-full p-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
            aria-label="Fermer"
            onClick={onClose}
            disabled={enCours}
          >
            <Icone nom="close" className="text-xl" />
          </button>
        )}
      </header>
      <div className="modale-contenu min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
      {erreur ? (
        <p className="mx-5 mb-4 flex shrink-0 items-start gap-2 rounded-lg bg-error-container/70 px-3 py-2.5 font-body-sm text-body-sm text-on-error-container sm:mx-6" role="alert">
          <Icone nom="error" className="text-lg" />
          <span>{erreur}</span>
        </p>
      ) : null}
      {piedEffectif ? (
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-hairline bg-surface-container-low/60 px-5 py-4 sm:px-6">{piedEffectif}</footer>
      ) : null}
    </>
  );

  const classes = `modale-carte relative flex w-full ${LARGEUR[taille ?? (large ? "xl" : "md")]} max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border border-hairline bg-surface-container-lowest shadow-[0_24px_64px_-16px_rgb(11_28_48/0.4)] sm:max-h-[min(90dvh,56rem)] sm:rounded-xl`;
  const accessibilite = {
    role,
    "aria-modal": true,
    "aria-labelledby": `${id}-titre`,
    "aria-describedby": sousTitre ? `${id}-description` : undefined,
  };

  return createPortal(
    <div
      ref={voile}
      className="modale-voile fixed inset-0 z-[70] flex items-end justify-center bg-inverse-surface/45 backdrop-blur-[3px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !enCours && !sansFermeture && estAuDessus(id)) onClose();
      }}
    >
      {onSubmit ? (
        <form ref={carte as RefObject<HTMLFormElement>} {...accessibilite} className={classes} onSubmit={soumettre}>
          {contenu}
        </form>
      ) : (
        <section ref={carte as RefObject<HTMLElement>} {...accessibilite} className={classes}>
          {contenu}
        </section>
      )}
    </div>,
    document.body,
  );
}
