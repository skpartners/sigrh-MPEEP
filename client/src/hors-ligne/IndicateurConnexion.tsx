import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { SessionUser } from "../api/types";
import { Icone } from "../ui/Icone";
import { useEnLigne } from "./connexion";
import { abonnerActions, lireActions } from "./outbox";

/** Événement qui demande l'ouverture du panneau de synchronisation (écouté par `HorsLigne`). */
export const OUVRIR_SYNCHRO = "sigrh:ouvrir-synchro";

/**
 * Mode de fonctionnement, toujours visible dans la barre du haut : « En ligne » ou « Hors ligne », avec le nombre
 * d'actions en attente d'envoi. Un clic ouvre le détail de la synchronisation.
 */
export function IndicateurConnexion() {
  const enLigne = useEnLigne();
  const actions = useSyncExternalStore(abonnerActions, lireActions, lireActions);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const matricule = me.data?.matricule;

  const mesActions = actions.filter((action) => !matricule || action.matricule === matricule);
  const echecs = mesActions.filter((action) => action.statut === "echec").length;
  const enAttente = mesActions.length - echecs;

  const [libelle, ton, point] = !enLigne
    ? [enAttente > 0 ? `Hors ligne · ${enAttente}` : "Hors ligne", "bg-secondary-fixed text-secondary", "bg-secondary"]
    : echecs > 0
      ? [`${echecs} à vérifier`, "bg-error-container text-on-error-container", "bg-error"]
      : enAttente > 0
        ? [`Synchronisation · ${enAttente}`, "bg-primary text-on-primary", "bg-on-primary"]
        : ["En ligne", "bg-surface-container-high text-on-surface-variant", "bg-[#2e7d32]"];
  const detail = !enLigne
    ? "Hors ligne : vos saisies sont conservées et partiront au retour de la connexion."
    : mesActions.length > 0
      ? "Connecté. Des actions sont en cours d'envoi ou à vérifier."
      : "Connecté au serveur.";

  return (
    <button
      type="button"
      role="status"
      title={detail}
      aria-label={`${libelle}. ${detail}`}
      onClick={() => window.dispatchEvent(new Event(OUVRIR_SYNCHRO))}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-label-md text-label-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3 ${ton}`}
    >
      {enLigne && echecs === 0 && enAttente === 0 ? (
        <span className={`h-2 w-2 rounded-full ${point}`} aria-hidden="true" />
      ) : (
        <Icone nom={!enLigne ? "cloud_off" : echecs > 0 ? "warning" : "sync"} className={`text-base ${enLigne && echecs === 0 ? "motion-spin" : ""}`} />
      )}
      <span className="hidden sm:inline">{libelle}</span>
      {!enLigne || echecs > 0 || enAttente > 0 ? <span className="sm:hidden">{mesActions.length || ""}</span> : null}
    </button>
  );
}
