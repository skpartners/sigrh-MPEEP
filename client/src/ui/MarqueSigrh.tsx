import { LogoMinistere } from "./Logo";

/** Marque commune : page d'intro et barre du haut des pages applicatives. */
export function MarqueSigrh({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`flex items-center min-w-0 ${compact ? "gap-2 sm:gap-3" : "gap-space-md"}`}>
      <LogoMinistere
        alt="Armoiries de la République de Côte d'Ivoire"
        className={compact ? "h-8 w-8 sm:h-10 sm:w-10 shrink-0 object-contain" : "h-12 w-12 shrink-0 object-contain"}
      />
      <span className={`flex min-w-0 flex-col ${compact ? "hidden sm:flex" : ""}`}>
        <span className="truncate font-label-lg text-label-lg uppercase tracking-tight text-primary">
          SIGRH-PORTEFEUILLE
        </span>
        <span
          className="max-w-xl truncate font-label-sm text-label-sm text-on-surface-variant"
          title="Ministère du Portefeuille de l'État et des Entreprises Publiques"
        >
          Ministère du Portefeuille de l'État et des Entreprises Publiques
        </span>
      </span>
    </span>
  );
}
