import { useQuery } from "@tanstack/react-query";
import type { ImgHTMLAttributes } from "react";
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

export function LogoMinistere({ alt, ...reste }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const logo = useLogo();
  return <img {...reste} alt={alt ? (logo.personnalise ? "Logo de la structure" : alt) : alt} src={logo.src} />;
}

/** Page de connexion : logo de la structure à gauche, armoiries à droite. */
export function LogoAvecArmoiries({ className }: { className?: string }) {
  const logo = useLogo();
  const taille = className ?? "h-16 w-16 court:h-12 court:w-12 tres-court:h-10 tres-court:w-10 object-contain";
  if (!logo.personnalise) {
    return <img src={srcArmoiries()} alt="Armoiries de la République de Côte d'Ivoire" className={`mx-auto ${taille}`} />;
  }
  return (
    <div className="flex items-center justify-center gap-5 court:gap-4">
      <img src={logo.src} alt="Logo de la structure" className={taille} />
      <span className="h-12 court:h-9 tres-court:h-8 w-px bg-on-surface/20" aria-hidden="true" />
      <img src={srcArmoiries()} alt="Armoiries de la République de Côte d'Ivoire" className={taille} />
    </div>
  );
}
