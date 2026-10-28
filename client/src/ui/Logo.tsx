import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "../api/client";

export function srcArmoiries(): string {
  return `${import.meta.env.BASE_URL}logo.png`;
}

/** Le logo de la structure déposé dans les paramètres, sinon les armoiries par défaut. */
export function useLogo(): { src: string; personnalise: boolean } {
  const identite = useQuery({
    queryKey: ["logo"],
    queryFn: () => api<{ logo_url: string }>("/api/v1/public/identite/"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const url = identite.data?.logo_url ?? "";
  return { src: url ? mediaUrl(url) : srcArmoiries(), personnalise: Boolean(url) };
}

/** Sceau rond : logo de la structure ou armoiries. */
export function Embleme({ src, alt, className = "h-12 w-12" }: { src: string; alt: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-lowest ring-1 ring-hairline ${className}`}>
      <img src={src} alt={alt} className="h-full w-full object-contain p-[10%]" />
    </span>
  );
}

export function LogoMinistere({ alt = "", className }: { alt?: string; className?: string }) {
  const logo = useLogo();
  return <Embleme src={logo.src} alt={alt ? (logo.personnalise ? "Logo de la structure" : alt) : ""} className={className ?? "h-12 w-12"} />;
}

/** Page de connexion : logo de la structure à gauche, armoiries à droite. */
export function LogoAvecArmoiries({ className }: { className?: string }) {
  const logo = useLogo();
  const taille = className ?? "h-16 w-16 court:h-12 court:w-12 tres-court:h-10 tres-court:w-10";
  if (!logo.personnalise) {
    return (
      <span className="mx-auto inline-flex">
        <Embleme src={srcArmoiries()} alt="Armoiries de la République de Côte d'Ivoire" className={taille} />
      </span>
    );
  }
  return (
    <div className="flex items-center justify-center gap-5 court:gap-4">
      <Embleme src={logo.src} alt="Logo de la structure" className={taille} />
      <span className="h-12 court:h-9 tres-court:h-8 w-px bg-on-surface/20" aria-hidden="true" />
      <Embleme src={srcArmoiries()} alt="Armoiries de la République de Côte d'Ivoire" className={taille} />
    </div>
  );
}
