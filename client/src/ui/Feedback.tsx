import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Orbite, PointsAttente } from "./Chargement";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "./Modale";
import { Icone } from "./Icone";

// Délai avant affichage : une action plus rapide ne fait pas clignoter l'overlay.
const SHOW_DELAY_MS = 180;
// Une fois visible, l'overlay reste assez longtemps pour être lu.
const MIN_VISIBLE_MS = 600;
// Durée d'affichage selon la gravité : une erreur reste plus longtemps, le temps d'être lue.
const DUREE_TOAST: Record<ToastTon, number> = { success: 4500, info: 5000, message: 5000, warning: 7500, error: 9000 };
// Au-delà, les plus anciens partent : l'écran ne doit pas se couvrir de notifications.
const TOASTS_VISIBLES = 4;

type ToastTon = "success" | "error" | "warning" | "info" | "message";
type Toast = { id: number; title: string; message?: string; tone: ToastTon; duree: number };

type ConfirmRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
};

type RunOptions = {
  detail?: string;
  success?: { title: string; message?: string };
  error?: string;
};

type FeedbackApi = {
  run<T>(label: string, task: () => Promise<T>, options?: RunOptions): Promise<T>;
  toast(title: string, message?: string, tone?: Toast["tone"]): void;
  /** Demande confirmation avant une action irréversible (signature, publication…). */
  confirm(title: string, options?: { message?: string; confirmLabel?: string }): Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback doit être utilisé sous <FeedbackProvider>.");
  return value;
}

/** Simule un traitement serveur tant que les exports ne sont pas branchés sur l'API. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState<{ id: number; label: string; detail?: string } | null>(null);
  const busyId = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(0);

  const toast = useCallback((title: string, message?: string, tone: Toast["tone"] = "success") => {
    const id = ++nextId.current;
    // Un message long se lit plus lentement : on ajoute un peu de temps, sans dépasser quatre secondes.
    const duree = DUREE_TOAST[tone] + Math.min(4000, (message?.length ?? 0) * 25);
    setToasts((list) => [...list, { id, title, message, tone, duree }].slice(-TOASTS_VISIBLES));
  }, []);

  const fermerToast = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);

  const confirm = useCallback(
    (title: string, options: { message?: string; confirmLabel?: string } = {}) =>
      new Promise<boolean>((resolve) => setPendingConfirm({ title, ...options, resolve })),
    [],
  );

  const run = useCallback(
    async <T,>(label: string, task: () => Promise<T>, options: RunOptions = {}): Promise<T> => {
      let shownAt = 0;
      const id = ++busyId.current;
      const timer = setTimeout(() => {
        shownAt = Date.now();
        setBusy({ id, label, detail: options.detail });
      }, SHOW_DELAY_MS);
      try {
        const result = await task();
        if (options.success) toast(options.success.title, options.success.message);
        return result;
      } catch (cause) {
        if (options.error) toast(options.error, cause instanceof Error ? cause.message : undefined, "error");
        throw cause;
      } finally {
        clearTimeout(timer);
        if (shownAt) {
          await wait(Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt)));
          setBusy((current) => (current?.id === id ? null : current));
        }
      }
    },
    [toast],
  );

  // Contrôles déclaratifs, gérés ici une seule fois :
  // - data-soon : fonction pas encore livrée ; le clic l'annonce au lieu de ne rien faire.
  // - data-long-action="Génération…" data-long-action-done="PDF prêt" : traitement long (simulé
  //   tant que l'API ne sert pas ces exports), précédé d'une confirmation si data-confirm est présent.
  useEffect(() => {
    async function onClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const soon = target?.closest<HTMLElement>("[data-soon]");
      if (soon) {
        event.preventDefault();
        toast("Bientôt disponible", soon.dataset.soon || "Cette fonction arrive dans une prochaine version.", "info");
        return;
      }
      const trigger = target?.closest<HTMLElement>("[data-long-action]");
      if (!trigger || trigger.getAttribute("aria-disabled") === "true") return;
      event.preventDefault();
      if (trigger.dataset.confirm && !(await confirm(trigger.dataset.confirm, { confirmLabel: "Confirmer" }))) return;
      const label = trigger.dataset.longAction || "Traitement en cours…";
      const done = trigger.dataset.longActionDone || "Opération terminée";
      void run(label, () => wait(1400), {
        detail: "Merci de patienter, ne fermez pas cette page.",
        success: { title: done, message: "Mode démonstration : action non encore reliée à l'API." },
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [run, toast, confirm]);

  const closeConfirm = useCallback(
    (ok: boolean) => {
      pendingConfirm?.resolve(ok);
      setPendingConfirm(null);
    },
    [pendingConfirm],
  );

  return (
    <FeedbackContext.Provider value={{ run, toast, confirm }}>
      {children}
      {busy ? <BusyOverlay label={busy.label} detail={busy.detail} /> : null}
      {pendingConfirm ? (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          onClose={closeConfirm}
        />
      ) : null}
      {createPortal(
        <div
          className="pointer-events-none fixed bottom-[calc(var(--haut-pied)+5.5rem)] left-4 right-4 z-[90] flex flex-col items-end gap-3 sm:left-auto sm:right-6"
          aria-live="polite"
          aria-relevant="additions"
        >
          {toasts.map((item) => (
            <ToastItem key={item.id} item={item} onClose={fermerToast} />
          ))}
        </div>,
        document.body,
      )}
    </FeedbackContext.Provider>
  );
}

/** Teinte de chaque type de message : elle alimente le lavis, le médaillon et la barre de temps (--ton). */
const TOAST_TONE: Record<ToastTon, { icon: string; ton: string; label: string }> = {
  success: { icon: "check_circle", ton: "var(--color-succes)", label: "Réussi" },
  error: { icon: "error", ton: "var(--color-error)", label: "Erreur" },
  warning: { icon: "warning", ton: "var(--color-attention)", label: "Attention" },
  info: { icon: "info", ton: "var(--color-info)", label: "Information" },
  message: { icon: "chat", ton: "var(--color-primary)", label: "Message" },
};

/** Une notification : s'arrête au survol et quand l'onglet est caché, se ferme à la croix, sort en douceur. */
function ToastItem({ item, onClose }: { item: Toast; onClose: (id: number) => void }) {
  const ton = TOAST_TONE[item.tone];
  const [survol, setSurvol] = useState(false);
  const [cache, setCache] = useState(() => document.hidden);
  const [sortie, setSortie] = useState(false);
  const reste = useRef(item.duree);
  const pause = survol || cache;

  useEffect(() => {
    const suivre = () => setCache(document.hidden);
    document.addEventListener("visibilitychange", suivre);
    return () => document.removeEventListener("visibilitychange", suivre);
  }, []);

  // Le temps restant se conserve d'une pause à l'autre : le compte à rebours reprend où il s'était arrêté.
  useEffect(() => {
    if (pause || sortie) return;
    const debut = Date.now();
    const minuteur = setTimeout(() => setSortie(true), reste.current);
    return () => {
      clearTimeout(minuteur);
      reste.current = Math.max(0, reste.current - (Date.now() - debut));
    };
  }, [pause, sortie]);

  useEffect(() => {
    if (!sortie) return;
    const minuteur = setTimeout(() => onClose(item.id), 220);
    return () => clearTimeout(minuteur);
  }, [sortie, item.id, onClose]);

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className={`toast ${sortie ? "toast-sortie" : "motion-toast"} pointer-events-auto relative flex w-[24rem] max-w-full items-start gap-3.5 overflow-hidden rounded-2xl border border-hairline p-4 pb-5 pr-11`}
      style={{ "--ton": ton.ton } as CSSProperties}
      onPointerEnter={() => setSurvol(true)}
      onPointerLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)}
      onBlur={() => setSurvol(false)}
    >
      <div className="toast-medaillon flex size-10 shrink-0 items-center justify-center rounded-xl" aria-hidden="true">
        {item.tone === "success" ? (
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path className="toast-trace" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <Icone nom={ton.icon} className="text-2xl" />
        )}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="sr-only">{ton.label} : </p>
        <p className="font-headline-sm text-[0.95rem] leading-snug text-on-surface">{item.title}</p>
        {item.message ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{item.message}</p> : null}
      </div>
      <button
        type="button"
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        aria-label="Fermer la notification"
        onClick={() => setSortie(true)}
      >
        <Icone nom="close" className="text-base" />
      </button>
      <span
        className="toast-progression bg-[var(--ton)]"
        style={{ animationDuration: `${item.duree}ms`, animationPlayState: pause ? "paused" : "running" }}
        aria-hidden="true"
      />
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirmer", onClose }: { title: string; message?: string; confirmLabel?: string; onClose: (ok: boolean) => void }) {
  // Focus sur « Annuler » : une validation involontaire au clavier reste impossible. Échap annule.
  const annuler = useRef<HTMLButtonElement>(null);
  return (
    <Modale
      role="alertdialog"
      titre={title}
      sousTitre={message}
      icone="help"
      taille="sm"
      onClose={() => onClose(false)}
      focusInitial={annuler}
      pied={
        <>
          <button ref={annuler} type="button" className={BOUTON_SECONDAIRE} onClick={() => onClose(false)}>
            Annuler
          </button>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => onClose(true)}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {null}
    </Modale>
  );
}

function BusyOverlay({ label, detail }: { label: string; detail?: string }) {
  // Au-delà de quelques secondes, on rassure : l'attente est normale, la page n'est pas figée.
  const [longue, setLongue] = useState(false);
  const carte = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const minuteur = setTimeout(() => setLongue(true), 8000);
    return () => clearTimeout(minuteur);
  }, []);
  // Attente non interruptible : le focus reste sur la carte, Tab et Échap n'atteignent rien derrière.
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    carte.current?.focus();
    function bloquer(event: KeyboardEvent) {
      if (event.key !== "Tab" && event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      carte.current?.focus();
    }
    document.addEventListener("keydown", bloquer, true);
    return () => {
      document.removeEventListener("keydown", bloquer, true);
      if (precedent?.isConnected) precedent.focus?.();
    };
  }, []);
  const titre = label.replace(/[….]+$/, "");
  return createPortal(
    <div className="motion-overlay fixed inset-0 z-[75] flex items-center justify-center bg-inverse-surface/45 p-6 backdrop-blur-[3px]">
      <div
        ref={carte}
        role="alertdialog"
        aria-modal="true"
        aria-busy="true"
        aria-label={label}
        tabIndex={-1}
        className="motion-overlay-card flex w-full max-w-xs flex-col items-center rounded-3xl border border-hairline bg-surface-container-lowest px-8 pb-8 pt-9 text-center shadow-[0_2px_6px_-2px_rgb(11_28_48/0.1),0_32px_64px_-20px_rgb(11_28_48/0.45)] outline-none"
      >
        <Orbite taille="6rem" />
        <p className="mt-7 font-headline-md text-headline-md text-on-surface" role="status">
          {titre}
          <PointsAttente />
        </p>
        {detail ? <p className="mt-1.5 font-body-sm text-body-sm text-on-surface-variant">{detail}</p> : null}
        <div className="attente-piste mt-6 w-full max-w-[13rem]" aria-hidden="true" />
        {longue ? (
          <p className="mt-5 font-body-sm text-body-sm text-on-surface-variant">Cela prend un peu plus de temps que prévu. Merci de patienter, ne fermez pas cette page.</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}