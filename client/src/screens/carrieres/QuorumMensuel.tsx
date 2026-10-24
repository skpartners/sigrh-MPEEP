import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";

export type EtatQuorum = {
  valeur: number;
  /** Vrai : le quorum est la moyenne de ceux que les responsables ont définis dans leurs structures. */
  automatique: boolean;
  moyenne_structures: number | null;
  structures_definies: number;
  valeur_fixee: number;
};

/**
 * Quorum mensuel du ministère. Par défaut, la moyenne des quorums définis par les responsables dans leurs structures ;
 * l'équipe RH peut fixer le sien, et revenir à la moyenne.
 */
export function QuorumMensuel({ quorum }: { quorum: EtatQuorum | undefined }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  if (!quorum) return null;
  const valeur = saisie ?? String(quorum.valeur);

  async function enregistrer(nouveau: number | null) {
    setEnCours(true);
    try {
      await feedback.run(
        nouveau === null ? "Retour à la moyenne des structures…" : "Enregistrement du quorum…",
        () => api("/api/v1/carrieres/conges/quorum/", { method: "PATCH", body: JSON.stringify({ quorum: nouveau }) }),
        { success: { title: nouveau === null ? "Quorum : moyenne des structures" : "Quorum enregistré", message: nouveau === null ? undefined : `${nouveau} % de présence minimale.` } },
      );
      setSaisie(null);
      await client.invalidateQueries({ queryKey: ["carrieres-conges"] });
    } catch (cause) {
      feedback.toast("Quorum non enregistré", cause instanceof ApiError ? cause.message : undefined, "error");
    } finally {
      setEnCours(false);
    }
  }

  const modifie = saisie !== null && Number(saisie) !== quorum.valeur;
  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 space-y-3" aria-labelledby="titre-quorum">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titre-quorum" className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface font-bold">
            <Icone nom="verified_user" className="text-xl text-primary" />Quorum mensuel de présence
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {quorum.automatique
              ? `Moyenne des quorums définis par les responsables dans leurs structures (${quorum.structures_definies} structure${quorum.structures_definies > 1 ? "s" : ""}).`
              : quorum.moyenne_structures != null
                ? `Fixé par l'équipe RH. La moyenne des ${quorum.structures_definies} structure${quorum.structures_definies > 1 ? "s" : ""} serait de ${quorum.moyenne_structures} %.`
                : "Aucun responsable n'a encore défini de quorum dans sa structure : la valeur du ministère s'applique."}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-bold ${quorum.automatique ? "bg-primary-fixed text-on-primary-fixed" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
          {quorum.automatique ? "Automatique" : "Fixé manuellement"}
        </span>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); const n = Number(valeur); if (Number.isInteger(n)) void enregistrer(n); }}>
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface font-semibold mb-1">Présence minimale (%)</span>
          <div className="flex items-center gap-2">
            <input
              className="h-10 w-28 rounded border border-outline-variant bg-surface-container-lowest px-3 font-code-num text-code-num font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              type="number" min={1} max={100} inputMode="numeric" value={valeur} onChange={(event) => setSaisie(event.target.value)} aria-label="Quorum mensuel en pourcentage"
            />
            <span className="font-body-md text-body-md text-on-surface-variant">%</span>
          </div>
        </label>
        <button type="submit" disabled={enCours || !modifie} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-label-md text-on-primary disabled:opacity-50">
          <Icone nom="save" className="text-lg" />Enregistrer
        </button>
        {!quorum.automatique && quorum.moyenne_structures != null ? (
          <button type="button" disabled={enCours} onClick={() => void enregistrer(null)} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-low disabled:opacity-50">
            <Icone nom="functions" className="text-lg" />Revenir à la moyenne ({quorum.moyenne_structures} %)
          </button>
        ) : null}
      </form>
    </section>
  );
}
