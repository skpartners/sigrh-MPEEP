/**
 * Suivi des traitements longs confiés à Celery (voir api/personnel/taches.py).
 *
 * `api()` et `telecharger()` attendent seuls la fin d'une tâche quand le serveur répond 202 : les écrans n'ont rien
 * à changer. Ce module tient la liste des tâches de la session, que l'indicateur de l'en-tête affiche.
 */

export type StatutTache = "attente" | "en_cours" | "terminee" | "echec";

export type SuiviTache = {
  id: string;
  libelle: string;
  statut: StatutTache;
  progression: number;
  message: string;
  code: number;
  fichier: boolean;
  nom_fichier: string;
  /** Réponse JSON de la vue, une fois la tâche terminée. */
  resultat?: unknown;
};

type Lecteur = (id: string) => Promise<SuiviTache>;

const taches = new Map<string, SuiviTache>();
const ecouteurs = new Set<() => void>();
let instantane: SuiviTache[] = [];

function notifier() {
  instantane = [...taches.values()];
  ecouteurs.forEach((ecouteur) => ecouteur());
}

export function abonnerTaches(ecouteur: () => void): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

export function lireTaches(): SuiviTache[] {
  return instantane;
}

export function retirerTache(id: string) {
  if (taches.delete(id)) notifier();
}

export function enCours(tache: SuiviTache): boolean {
  return tache.statut === "attente" || tache.statut === "en_cours";
}

/** Enregistre (ou met à jour) une tâche dans la liste de la session. */
export function noterTache(tache: SuiviTache) {
  taches.set(tache.id, { ...taches.get(tache.id), ...tache });
  notifier();
}

const attendues = new Set<string>();

/** Interroge la tâche jusqu'à sa fin, en mettant la liste à jour ; rend son suivi final. */
export async function attendreTache(id: string, libelle: string, lire: Lecteur): Promise<SuiviTache> {
  attendues.add(id);
  noterTache({ id, libelle, statut: "attente", progression: 0, message: "", code: 0, fichier: false, nom_fichier: "" });
  const debut = Date.now();
  let echecs = 0;
  try {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, Date.now() - debut < 30_000 ? 800 : 2_500));
      try {
        const suivi = await lire(id);
        echecs = 0;
        noterTache(suivi);
        if (!enCours(suivi)) return suivi;
      } catch (erreur) {
        // Une coupure passagère (redéploiement, réseau) ne perd pas la tâche : elle continue côté serveur.
        echecs += 1;
        if (echecs > 40) throw erreur;
      }
    }
  } finally {
    attendues.delete(id);
  }
}

/** Reprend le suivi des tâches encore actives (page rechargée, ou lancées depuis un autre onglet). */
export async function reprendreTaches(liste: SuiviTache[], lire: Lecteur, finie: (tache: SuiviTache) => void) {
  for (const tache of liste) {
    if (!enCours(tache) || attendues.has(tache.id) || taches.has(tache.id)) continue;
    void attendreTache(tache.id, tache.libelle, lire).then(finie, () => retirerTache(tache.id));
  }
}
