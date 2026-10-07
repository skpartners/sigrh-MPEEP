import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "./Modale";
import { Icone } from "./Icone";

// Délai avant affichage : une action plus rapide ne fait pas clignoter l'overlay.
const SHOW_DELAY_MS = 180;
// Une fois visible, l'overlay reste assez longtemps pour être lu.
const MIN_VISIBLE_MS = 600;
const TOAST_MS = 4200;

type Toast = { id: number; title: string; message?: string; tone: "success" | "error" | "info" | "message" };

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
    setToasts((list) => [...list, { id, title, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), TOAST_MS);
  }, []);

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
        <div className="fixed bottom-[calc(var(--haut-pied)+5.5rem)] right-6 z-[90] flex flex-col items-end gap-3" aria-live="polite">
          {toasts.map((item) => (
            <div
              key={item.id}
              role="status"
              className="motion-toast bg-surface-container-lowest shadow-xl rounded-lg p-4 w-[22rem] max-w-[calc(100vw-3rem)] flex items-start gap-3"
            >
              <div className={`p-2 rounded shrink-0 ${TOAST_TONE[item.tone].className}`}>
                <Icone nom={TOAST_TONE[item.tone].icon} className="text-xl" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-label-lg text-label-lg text-on-surface font-bold">{item.title}</p>
                {item.message ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{item.message}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </FeedbackContext.Provider>
  );
}

const TOAST_TONE: Record<Toast["tone"], { icon: string; className: string }> = {
  success: { icon: "download_done", className: "bg-primary-fixed text-primary" },
  error: { icon: "error", className: "bg-error-container text-on-error-container" },
  info: { icon: "schedule", className: "bg-surface-container text-on-surface-variant" },
  message: { icon: "chat", className: "bg-primary-fixed text-primary" },
};

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
  return (
    <Modale role="alertdialog" titre={label} sousTitre={detail} taille="sm" sansFermeture centre onClose={() => undefined}>
      <div className="flex flex-col items-center pt-2 text-center" aria-busy="true">
        <div className="relative h-20 w-20">
          <svg className="motion-spin absolute inset-0" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-surface-container-high)" strokeWidth="5" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="60 154" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-secondary-container)" strokeWidth="5" strokeLinecap="round" strokeDasharray="22 192" strokeDashoffset="-90" />
          </svg>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="motion-breathe absolute inset-0 m-auto h-11 w-11 object-contain" />
        </div>
        <div className="motion-indeterminate mt-5 h-1 w-full overflow-hidden rounded-full bg-surface-container" />
      </div>
    </Modale>
  );
}
