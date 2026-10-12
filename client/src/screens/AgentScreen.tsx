import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { Dossier, SessionUser } from "../api/types";
import { Skeleton } from "../ui/Motion";
import { AppChrome } from "./AppChrome";
import { ProfilAgentTroisOnglets } from "./ProfilAgentTroisOnglets";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";
const CARD = "bg-surface-container-lowest rounded-xl border border-hairline p-6";

export function AgentScreen() {
  const { matricule } = useParams();
  return <AppChrome sansSidebar>{matricule ? <ProfilAgent matricule={matricule} /> : <VersMonProfil />}</AppChrome>;
}

function VersMonProfil() {
  const { search } = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  if (me.isError) {
    return (
      <div className={PAGE}>
        <p className="font-body-md text-body-md text-error" role="alert">Votre profil n'a pas pu être ouvert.</p>
      </div>
    );
  }
  if (!me.data) return <DossierSquelette />;
  return <Navigate to={`/app/agents/${encodeURIComponent(me.data.matricule)}${search}`} replace />;
}

function ProfilAgent({ matricule }: { matricule: string }) {
  const dossier = useQuery({
    queryKey: ["agent", matricule],
    queryFn: () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(matricule)}/`),
  });

  if (dossier.isPending) return <DossierSquelette />;
  if (dossier.isError) {
    const introuvable = dossier.error instanceof ApiError && dossier.error.status === 404;
    return (
      <div className={PAGE}>
        <div className={`${CARD} max-w-2xl`} role="alert">
          <h1 className="font-headline-md text-headline-md text-on-surface">{introuvable ? "Agent introuvable" : "Le dossier n'a pas pu être chargé"}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            {introuvable
              ? `Aucun dossier ne correspond au matricule « ${matricule} ».`
              : "Vérifiez votre connexion au réseau ministériel, puis réessayez."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {introuvable ? null : (
              <button type="button" className="h-8 px-3 rounded bg-primary-container text-on-primary font-label-md text-label-md hover:bg-primary" onClick={() => dossier.refetch()}>
                Réessayer
              </button>
            )}
            <Link to="/app/agents" className="h-8 px-3 inline-flex items-center rounded border border-outline-variant font-label-md text-label-md text-on-surface hover:bg-surface-container-low">
              Mon profil
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <ProfilAgentTroisOnglets agent={dossier.data} />;
}

function DossierSquelette() {
  return (
    <div className={PAGE} aria-busy="true" aria-label="Chargement du dossier">
      <div className={`${CARD} mb-8 flex items-center gap-6`}>
        <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-14 w-full rounded-xl mb-8" />
      <div className="space-y-8">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
