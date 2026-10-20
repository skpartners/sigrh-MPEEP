import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

const TOAST_TONE: Record<ToastTon, { icon: string; badge: string; bordure: string; barre: string }> = {
  success: { icon: "check_circle", badge: "bg-succes-container text-succes", bordure: "border-l-succes", barre: "bg-succes" },
  error: { icon: "error", badge: "bg-error-container text-on-error-container", bordure: "border-l-error", barre: "bg-error" },
  warning: { icon: "warning", badge: "bg-attention/15 text-attention", bordure: "border-l-attention", barre: "bg-attention" },
  info: { icon: "info", badge: "bg-info-container text-info", bordure: "border-l-info", barre: "bg-info" },
  message: { icon: "chat", badge: "bg-primary-fixed text-primary", bordure: "border-l-primary", barre: "bg-primary" },
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
      className={`${sortie ? "toast-sortie" : "motion-toast"} pointer-events-auto relative flex w-[23rem] max-w-full items-start gap-3 overflow-hidden rounded-xl border border-hairline border-l-4 bg-surface-container-lowest p-4 pr-11 shadow-xl ${ton.bordure}`}
      onPointerEnter={() => setSurvol(true)}
      onPointerLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)}
      onBlur={() => setSurvol(false)}
    >
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${ton.badge}`}>
        <Icone nom={ton.icon} className="text-xl" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-label-lg text-label-lg font-bold text-on-surface">{item.title}</p>
        {item.message ? <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">{item.message}</p> : null}
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
        className={`toast-progression ${ton.barre}`}
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
  useEffect(() => {
    const minuteur = setTimeout(() => setLongue(true), 8000);
    return () => clearTimeout(minuteur);
  }, []);
  return (
    <Modale role="alertdialog" titre={label} sousTitre={detail} taille="sm" sansFermeture centre onClose={() => undefined}>
      <div className="flex flex-col items-center pt-2 text-center" aria-busy="true" role="status">
        <div className="relative h-20 w-20">
          <svg className="motion-spin absolute inset-0" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-surface-container-high)" strokeWidth="5" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="60 154" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-secondary-container)" strokeWidth="5" strokeLinecap="round" strokeDasharray="22 192" strokeDashoffset="-90" />
          </svg>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="motion-breathe absolute inset-0 m-auto h-11 w-11 object-contain" />
        </div>
        <div className="motion-indeterminate mt-5 h-1 w-full overflow-hidden rounded-full bg-surface-container" />
        {longue ? (
          <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Cela prend un peu plus de temps que prévu. Merci de patienter, ne fermez pas cette page.</p>
        ) : null}
      </div>
    </Modale>
  );
}
