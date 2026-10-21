import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { api, getToken } from "../api/client";
import type { SessionUser } from "../api/types";

/**
 * Réserve une page aux comptes connectés. Tant qu'un compte n'a pas accepté les documents juridiques en vigueur
 * (CGU, confidentialité, protection des données), il est conduit au parcours d'adhésion.
 * `sansAdhesion` : la page du parcours lui-même.
 */
export function RequireAuth({ children, sansAdhesion = false }: { children: ReactNode; sansAdhesion?: boolean }) {
  const connecte = Boolean(getToken());
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity, enabled: connecte });
  if (!connecte) return <Navigate to="/connexion" replace />;
  if (sansAdhesion) return children;
  if (me.isPending) return null;
  if (me.data?.adhesion_complete === false) return <Navigate to="/app/adhesion" replace />;
  return children;
}
