import { Embleme, srcArmoiries, useLogo } from "./Logo";

/** Marque commune : page d'intro et barre du haut. Armoiries de la République d'abord, puis le logo de la structure s'il est déposé. */
export function MarqueSigrh({ compact = false }: { compact?: boolean }) {
  const logo = useLogo();
  const taille = compact ? "h-8 w-8 sm:h-10 sm:w-10" : "h-12 w-12";
  return (
    <span className={`flex items-center min-w-0 ${compact ? "gap-2 sm:gap-3" : "gap-space-md"}`}>
      <Embleme src={srcArmoiries()} alt="Armoiries de la République de Côte d'Ivoire" className={taille} />
      {logo.personnalise ? (
        <>
          <span className={`w-px shrink-0 bg-on-surface/20 ${compact ? "h-6 sm:h-8" : "h-9"}`} aria-hidden="true" />
          <Embleme src={logo.src} alt="Logo de la structure" className={taille} />
        </>
      ) : null}
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
