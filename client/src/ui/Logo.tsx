import { useQuery } from "@tanstack/react-query";
import type { ImgHTMLAttributes } from "react";
import { api, mediaUrl } from "../api/client";

/** Le logo de la structure déposé dans les paramètres, sinon les armoiries par défaut. */
export function useLogo(): { src: string; personnalise: boolean } {
  const identite = useQuery({
    queryKey: ["logo"],
    queryFn: () => api<{ logo_url: string }>("/api/v1/public/identite/"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const url = identite.data?.logo_url ?? "";
  return { src: url ? mediaUrl(url) : `${import.meta.env.BASE_URL}logo.png`, personnalise: Boolean(url) };
}

export function LogoMinistere({ alt, ...reste }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  const logo = useLogo();
  return <img {...reste} alt={alt ? (logo.personnalise ? "Logo de la structure" : alt) : alt} src={logo.src} />;
}
