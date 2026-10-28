import { useSyncExternalStore } from "react";
import { Icone } from "../ui/Icone";
import { useEnLigne } from "./connexion";
import { aUnFichier } from "./dossier";
import { abonnerActions, lireActions } from "./outbox";
import { OUVRIR_SYNCHRO } from "./IndicateurConnexion";

/**
 * Sur le dossier d'un agent : ce qui a été enregistré sur l'appareil et n'est pas encore parti. Les informations comme
 * les pièces jointes attendent le retour du réseau ; les pièces passent alors par l'analyse antivirus du serveur.
 */
export function BandeauAttente({ matricule }: { matricule: string }) {
  const enLigne = useEnLigne();
  const actions = useSyncExternalStore(abonnerActions, lireActions, lireActions);
  const chemin = `/agents/${encodeURIComponent(matricule)}/`;
  const miennes = actions.filter((action) => action.route.includes(chemin));
  if (miennes.length === 0) return null;

  const fichiers = miennes.filter(aUnFichier).length;
  const refusees = miennes.filter((action) => action.statut === "echec").length;
  const enAttente = miennes.length - refusees;

  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 font-body-sm text-body-sm ${refusees > 0 ? "border-error bg-error-container text-on-error-container" : "border-outline-variant bg-secondary-fixed text-secondary"}`}
    >
      <Icone nom={refusees > 0 ? "warning" : enLigne ? "sync" : "cloud_off"} className="text-xl" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">
          {enAttente > 0 ? `${enAttente} modification${enAttente > 1 ? "s" : ""} en attente d'envoi` : null}
          {enAttente > 0 && refusees > 0 ? " · " : null}
          {refusees > 0 ? `${refusees} refusée${refusees > 1 ? "s" : ""} par le serveur` : null}
        </strong>
        {" "}
        {enLigne ? "Envoi en cours." : "Gardées chiffrées sur cet appareil, elles partiront au retour de la connexion."}
        {fichiers > 0 ? ` ${fichiers > 1 ? `${fichiers} pièces jointes seront analysées` : "Une pièce jointe sera analysée"} par l'antivirus à l'envoi.` : ""}
      </p>
      <button
        type="button"
        className="rounded-full border border-current px-3 py-1 font-label-md text-label-md font-semibold"
        onClick={() => window.dispatchEvent(new Event(OUVRIR_SYNCHRO))}
      >
        Voir le détail
      </button>
    </div>
  );
}
