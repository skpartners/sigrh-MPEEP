import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "../api/client";
import type { SessionUser } from "../api/types";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";
import { auRetourDeConnexion, useEnLigne } from "./connexion";
import { aUnFichier } from "./dossier";
import { CLE_DROITS, chargerDroits } from "./droits";
import { abonnerActions, chargerActions, lireActions, oublierActionsEnMemoire, type ActionEnAttente } from "./outbox";
import { OUVRIR_SYNCHRO } from "./IndicateurConnexion";
import { queryClient } from "./queryClient";
import { EVENEMENT_SYNCHRO, abandonnerAction, demarrerSynchronisation, reessayerAction, synchroniser, type EvenementSynchro } from "./synchro";

const FORMAT_SAISIE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Mode hors ligne, côté interface : charge la file de l'utilisateur, lance la synchronisation, annonce chaque envoi
 * et affiche l'état de la connexion avec la liste des actions en attente. Monté une seule fois, session ouverte.
 */
export function HorsLigne({ actif }: { actif: boolean }) {
  const feedback = useFeedback();
  const enLigne = useEnLigne();
  const actions = useSyncExternalStore(abonnerActions, lireActions, lireActions);
  const [ouvert, setOuvert] = useState(false);
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity, enabled: actif });
  const matricule = me.data?.matricule;

  // Droits hors ligne du rôle : relus à chaque retour du réseau, pour qu'un retrait décidé entre-temps s'applique.
  useQuery({ queryKey: CLE_DROITS, queryFn: chargerDroits, staleTime: 5 * 60_000, enabled: actif });
  useEffect(() => auRetourDeConnexion(() => void queryClient.invalidateQueries({ queryKey: CLE_DROITS })), []);

  useEffect(() => {
    if (!actif || !matricule) return;
    let arret: (() => void) | null = null;
    let annule = false;
    void chargerActions(matricule).then(() => {
      if (!annule) arret = demarrerSynchronisation(matricule);
    });
    return () => {
      annule = true;
      arret?.();
      oublierActionsEnMemoire();
    };
  }, [actif, matricule]);

  useEffect(() => {
    function annoncer(evenement: Event) {
      const detail = (evenement as CustomEvent<EvenementSynchro>).detail;
      if (detail.type === "envoyee") feedback.toast("Action synchronisée", detail.libelle, "success");
      else if (detail.type === "refusee") feedback.toast("Action refusée", `${detail.libelle} — ${detail.message}`, "error");
    }
    window.addEventListener(EVENEMENT_SYNCHRO, annoncer);
    return () => window.removeEventListener(EVENEMENT_SYNCHRO, annoncer);
  }, [feedback]);

  useEffect(() => {
    const ouvrir = () => setOuvert(true);
    window.addEventListener(OUVRIR_SYNCHRO, ouvrir);
    return () => window.removeEventListener(OUVRIR_SYNCHRO, ouvrir);
  }, []);

  const mesActions = actions.filter((action) => !matricule || action.matricule === matricule);
  const echecs = mesActions.filter((action) => action.statut === "echec").length;
  const aEnvoyer = mesActions.length - echecs;
  const fermer = () => setOuvert(false);

  if (!actif) return null;
  // Le mode (en ligne / hors ligne) est toujours affiché dans la barre du haut. La pastille flottante ne sert que
  // lorsqu'il y a des actions à suivre ; le panneau, lui, s'ouvre aussi depuis la barre.
  if (mesActions.length === 0) return ouvert ? <PanneauActions actions={mesActions} enLigne={enLigne} onClose={fermer} /> : null;

  const [icone, texte, ton] = !enLigne
    ? ["cloud_off", aEnvoyer > 0 ? `Hors ligne · ${aEnvoyer} en attente` : "Hors ligne", "bg-secondary-fixed text-secondary"]
    : echecs > 0
      ? ["warning", `${echecs} action${echecs > 1 ? "s" : ""} à vérifier`, "bg-error-container text-on-error-container"]
      : ["sync", `Synchronisation · ${aEnvoyer}`, "bg-primary text-on-primary"];

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={`fixed bottom-4 left-4 z-[390] flex items-center gap-2 rounded-full px-4 py-2 font-label-md text-label-md font-semibold shadow-lg ${ton}`}
        aria-label={`${texte}. Ouvrir le détail.`}
        role="status"
      >
        <Icone nom={icone} className={`text-lg ${icone === "sync" ? "motion-spin" : ""}`} />
        {texte}
      </button>
      {ouvert ? <PanneauActions actions={mesActions} enLigne={enLigne} onClose={fermer} /> : null}
    </>
  );
}

function PanneauActions({ actions, enLigne, onClose }: { actions: ActionEnAttente[]; enLigne: boolean; onClose: () => void }) {
  const feedback = useFeedback();
  return (
    <Modale
      titre="Synchronisation"
      sousTitre={enLigne ? "Connecté au serveur" : "Hors ligne : vos actions partiront au retour de la connexion"}
      icone={enLigne ? "sync" : "cloud_off"}
      taille="lg"
      onClose={onClose}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>
            Fermer
          </button>
          <button type="button" className={BOUTON_PRIMAIRE} disabled={!enLigne} onClick={() => void synchroniser()}>
            <Icone nom="sync" className="text-lg" />
            Envoyer maintenant
          </button>
        </>
      }
    >
      {actions.length === 0 ? (
        <p className="font-body-sm text-on-surface-variant">Aucune action en attente.</p>
      ) : (
        <ul className="space-y-3">
          {actions.map((action) => (
            <li key={action.id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
              <div className="flex items-start gap-3">
                <Icone nom={action.statut === "echec" ? "warning" : action.statut === "envoi" ? "sync" : "schedule"} className={`mt-0.5 text-xl ${action.statut === "echec" ? "text-error" : "text-secondary"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-label-lg text-label-lg font-semibold text-on-surface">{action.libelle}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Saisie le {FORMAT_SAISIE.format(new Date(action.saisieLe))} ·{" "}
                    {action.statut === "echec" ? "Refusée par le serveur" : action.statut === "envoi" ? "Envoi en cours…" : "En attente d'envoi"}
                  </p>
                  {aUnFichier(action) ? (
                    <p className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">
                      <Icone nom="attach_file" className="text-base" />
                      Pièce jointe : analysée par l'antivirus à l'envoi
                    </p>
                  ) : null}
                  {action.erreur ? <p className="mt-1 font-body-sm text-body-sm text-error">{action.erreur}</p> : null}
                </div>
                {action.statut === "echec" ? (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className={BOUTON_SECONDAIRE} disabled={!enLigne} onClick={() => void reessayerAction(action.id)}>
                      Réessayer
                    </button>
                    <button
                      type="button"
                      className={BOUTON_SECONDAIRE}
                      onClick={async () => {
                        if (await feedback.confirm("Abandonner cette action ?", { message: "Elle ne sera jamais envoyée.", confirmLabel: "Abandonner" })) void abandonnerAction(action.id);
                      }}
                    >
                      Abandonner
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modale>
  );
}
