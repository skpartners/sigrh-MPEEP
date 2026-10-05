import { Icone } from "./Icone";
/** Signale une fonction annoncée mais pas encore livrée. */
export function SoonBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold whitespace-nowrap ${className}`}
    >
      <Icone nom="schedule" className="text-[14px]" />
      Bientôt disponible
    </span>
  );
}
