import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, telechargerTache } from "../api/client";
import { abonnerTaches, enCours, lireTaches, reprendreTaches, retirerTache, type SuiviTache } from "../api/taches";
import { useFeedback } from "./Feedback";
import { Icone } from "./Icone";

const GARDE_TERMINEE_MS = 60_000;

/**
 * Indicateur des traitements longs lancés par l'utilisateur connecté : import, export, génération de document.
 * Visible depuis n'importe quel écran, il montre l'avancement, puis propose le fichier produit. Les tâches encore
 * actives sont reprises après un rechargement de la page.
 */
export function IndicateurTaches() {
  const taches = useSyncExternalStore(abonnerTaches, lireTaches, lireTaches);
  const feedback = useFeedback();
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  // Tâches lancées avant un rechargement : on reprend leur suivi et on prévient à leur fin.
  useEffect(() => {
    let actif = true;
    void api<{ taches: SuiviTache[] }>("/api/v1/taches/")
      .then((reponse) =>
        reprendreTaches(
          reponse.taches,
          (id) => api<SuiviTache>(`/api/v1/taches/${id}/`),
          (suivi) => {
            if (!actif) return;
            if (suivi.statut === "echec") feedback.toast(`${suivi.libelle} : échec`, suivi.message, "error");
            else feedback.toast(`${suivi.libelle} : terminé`, suivi.fichier ? "Le fichier est prêt : ouvrez l'indicateur pour le télécharger." : undefined);
          },
        ),
      )
      .catch(() => undefined);
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Une tâche réussie s'efface d'elle-même ; une tâche en échec reste jusqu'à ce qu'on la ferme.
  useEffect(() => {
    const minuteurs = taches
      .filter((tache) => tache.statut === "terminee")
      .map((tache) => window.setTimeout(() => retirerTache(tache.id), GARDE_TERMINEE_MS));
    return () => minuteurs.forEach((minuteur) => window.clearTimeout(minuteur));
  }, [taches]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (event: MouseEvent) => {
      if (!conteneur.current?.contains(event.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  if (taches.length === 0) return null;
  const actives = taches.filter(enCours);
  const enEchec = taches.some((tache) => tache.statut === "echec");

  return (
    <div ref={conteneur} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((valeur) => !valeur)}
        aria-expanded={ouvert}
        aria-label={actives.length ? `${actives.length} traitement${actives.length > 1 ? "s" : ""} en cours` : "Traitements terminés"}
        title="Traitements en cours"
        className="relative inline-flex items-center gap-1.5 rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Icone nom={actives.length ? "progress_activity" : enEchec ? "error" : "task_alt"} className={`text-xl ${actives.length ? "motion-spin text-primary" : enEchec ? "text-error" : "text-primary"}`} />
        {actives.length ? <span className="font-code-num text-code-num font-bold text-primary">{actives.length}</span> : null}
      </button>
      {ouvert ? (
        <div role="dialog" aria-label="Traitements" className="menu-flottant motion-overlay-card absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] space-y-2 rounded-lg border p-3 shadow-xl">
          <p className="font-label-lg text-label-lg font-bold text-on-surface">Traitements</p>
          <ul className="space-y-3">
            {taches.map((tache) => (
              <LigneTache key={tache.id} tache={tache} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LigneTache({ tache }: { tache: SuiviTache }) {
  const feedback = useFeedback();
  const active = enCours(tache);
  return (
    <li className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-label-md text-label-md font-semibold text-on-surface">{tache.libelle}</p>
        {!active ? (
          <button type="button" aria-label="Fermer" className="shrink-0 text-on-surface-variant hover:text-on-surface" onClick={() => retirerTache(tache.id)}>
            <Icone nom="close" className="text-base" />
          </button>
        ) : null}
      </div>
      {active ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tache.progression || undefined} aria-label={tache.libelle}>
          <div className={`h-full rounded-full bg-primary ${tache.progression ? "transition-[width]" : "w-1/3 motion-indeterminee"}`} style={tache.progression ? { width: `${tache.progression}%` } : undefined} />
        </div>
      ) : null}
      <p className={`font-body-sm text-body-sm ${tache.statut === "echec" ? "text-error" : "text-on-surface-variant"}`}>
        {active ? tache.message || (tache.statut === "attente" ? "En attente d'un worker…" : "En cours…") : tache.message || (tache.statut === "echec" ? "Échec" : "Terminé")}
        {active && tache.progression ? ` · ${tache.progression} %` : ""}
      </p>
      {tache.statut === "terminee" && tache.fichier ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-label-md text-label-md font-semibold text-primary hover:underline"
          onClick={() => void telechargerTache(tache).catch((erreur) => feedback.toast("Téléchargement impossible", erreur instanceof Error ? erreur.message : undefined, "error"))}
        >
          <Icone nom="download" className="text-base" />Télécharger {tache.nom_fichier}
        </button>
      ) : null}
    </li>
  );
}
