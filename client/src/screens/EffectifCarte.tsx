import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type CSSProperties } from "react";
import { ApiError, api, telecharger } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../ui/Modale";

type Reglages = {
  peut_modifier: boolean;
  effectif: { agents: number; donnees_factices: boolean };
};
type ResultatEffectif = { detail: string; crees: number; mis_a_jour: number; comptes_crees: number; supprimes: Record<string, number> };

const CARTE = "motion-rise rounded-xl border border-hairline bg-surface-container-lowest p-6";

/** Chargement de l'effectif réel en un bloc, à la place de la saisie dossier par dossier. */
export function CarteEffectif({ reglages }: { reglages: Reglages | undefined }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [fichier, setFichier] = useState<File | null>(null);
  const [remplacer, setRemplacer] = useState(true);
  const [erreur, setErreur] = useState("");
  const [lignes, setLignes] = useState<{ ligne: number; message: string }[]>([]);
  const [resultat, setResultat] = useState<ResultatEffectif | null>(null);
  const [enCours, setEnCours] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  const factices = Boolean(reglages?.effectif.donnees_factices);

  async function modele() {
    try {
      await telecharger("/api/v1/parametres/effectif/modele/", "modele-agents-du-ministere.xlsx");
    } catch (cause) {
      feedback.toast("Modèle indisponible", cause instanceof ApiError ? cause.message : "Le téléchargement n'a pas abouti.", "error");
    }
  }

  async function charger() {
    setErreur("");
    setLignes([]);
    setResultat(null);
    if (!fichier) { setErreur("Choisissez le classeur renseigné (.xlsx)."); return; }
    if (!fichier.name.toLowerCase().endsWith(".xlsx")) { setErreur("Le fichier doit être un classeur Excel au format .xlsx."); return; }
    const purge = factices && remplacer;
    if (purge && !(await feedback.confirm("Toutes les données de démonstration (agents fictifs, demandes, actes, formations, besoins, comptes de test…) vont être supprimées et remplacées par le contenu du classeur. Cette opération est définitive.", { confirmLabel: "Charger et remplacer" }))) return;
    setEnCours(true);
    const corps = new FormData();
    corps.set("fichier", fichier);
    corps.set("remplacer", purge ? "true" : "false");
    try {
      const reponse = await feedback.run("Chargement de l'effectif…", () => api<ResultatEffectif>("/api/v1/parametres/effectif/import/", { method: "POST", body: corps }), { success: { title: "Effectif chargé" } });
      setResultat(reponse);
      setFichier(null);
      if (entree.current) entree.current.value = "";
      await client.invalidateQueries();
    } catch (cause) {
      if (cause instanceof ApiError) { setErreur(cause.message); setLignes(cause.erreurs); } else setErreur("Le chargement n'a pas abouti.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className={CARTE} style={{ "--delay": "100ms" } as CSSProperties} aria-labelledby="titre-effectif">
      <h2 id="titre-effectif" className="font-headline-sm text-headline-sm text-on-surface">Effectif du ministère</h2>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
        Chargez les agents en un bloc, à la place de la saisie dossier par dossier. Chaque agent est rattaché à sa structure et reçoit un compte : son matricule est l'identifiant, <strong>matricule@2026</strong> le mot de passe initial, et un message l'invite à le modifier.
      </p>
      <ol className="mt-4 list-decimal pl-5 space-y-1 font-body-sm text-body-sm text-on-surface">
        <li>Téléchargez le classeur modèle : il décrit chaque colonne et liste les structures, grades et emplois à utiliser.</li>
        <li>Renseignez la feuille « Agents » avec les informations dont vous disposez.</li>
        <li>Chargez le classeur : une ligne incorrecte annule tout et vous indique les lignes à corriger.</li>
      </ol>
      <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">
        {reglages ? `${reglages.effectif.agents.toLocaleString("fr-FR")} agent${reglages.effectif.agents > 1 ? "s" : ""} enregistré${reglages.effectif.agents > 1 ? "s" : ""}. ` : ""}
        {factices ? "L'application contient encore des données de démonstration." : "Les données de démonstration ont été remplacées par l'effectif réel."}
      </p>
      {reglages?.peut_modifier ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BOUTON_SECONDAIRE} onClick={() => void modele()}><Icone nom="download" className="text-lg" />Télécharger le modèle</button>
            <input ref={entree} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Classeur de l'effectif" className="text-sm file:mr-3 file:h-9 file:rounded file:border-0 file:bg-primary-fixed file:px-3 file:font-label-md file:text-on-primary-fixed" onChange={(e) => { setFichier(e.target.files?.[0] ?? null); setErreur(""); setLignes([]); }} />
            <button type="button" className={BOUTON_PRIMAIRE} disabled={!fichier || enCours} onClick={() => void charger()}><Icone nom="upload_file" className="text-lg" />Charger l'effectif</button>
          </div>
          {factices ? (
            <label className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface">
              <input type="checkbox" className="mt-1" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} />
              <span>Remplacer les données de démonstration par le contenu du classeur. Les agents, demandes, actes, formations, besoins et comptes de test disparaissent ; les structures, grades, emplois et paramètres sont conservés, ainsi que votre compte.</span>
            </label>
          ) : null}
          {erreur ? <p role="alert" className="font-body-sm text-body-sm text-error">{erreur}</p> : null}
          {lignes.length ? (
            <ul className="max-h-48 overflow-auto rounded-lg bg-error-container/50 px-3 py-2 space-y-1" aria-label="Lignes incorrectes">
              {lignes.slice(0, 40).map((l) => <li key={`${l.ligne}-${l.message}`} className="font-body-sm text-body-sm text-on-error-container">Ligne {l.ligne} : {l.message}</li>)}
              {lignes.length > 40 ? <li className="font-body-sm text-body-sm text-on-error-container">et {lignes.length - 40} autres lignes</li> : null}
            </ul>
          ) : null}
          {resultat ? (
            <p role="status" className="rounded-lg bg-primary-fixed/50 px-3 py-2 font-body-sm text-body-sm text-on-surface">
              {resultat.detail}
              {Object.keys(resultat.supprimes).length ? ` Supprimé : ${Object.entries(resultat.supprimes).map(([cle, n]) => `${n} ${cle}`).join(", ")}.` : ""}
            </p>
          ) : null}
        </div>
      ) : <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Vous n'avez pas l'habilitation pour charger l'effectif.</p>}
    </section>
  );
}
