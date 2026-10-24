import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";

type StructureQuorum = { code: string; nom: string; niveau_libelle: string; principale: boolean; parent: string; propre: number | null; valeur: number; herite: boolean };
type Reponse = { quorum_ministere: number; structures: StructureQuorum[] };

const CLE = ["mes-quorums"];

/**
 * Quorum de présence des structures dont la personne est responsable : c'est elle qui le définit, depuis son profil.
 * La moyenne de ces quorums devient, par défaut, le quorum du ministère.
 */
export function QuorumStructures() {
  const requete = useQuery({ queryKey: CLE, queryFn: () => api<Reponse>("/api/v1/conges/mes-quorums/") });
  if (!requete.data || requete.data.structures.length === 0) return null;
  const { structures, quorum_ministere: ministere } = requete.data;
  return (
    <section className="bg-surface-container-lowest rounded-xl border border-hairline p-6 space-y-4" aria-labelledby="titre-quorum-structure">
      <div>
        <h2 id="titre-quorum-structure" className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface font-bold">
          <Icone nom="verified_user" className="text-xl text-primary" />Quorum de présence de {structures.filter((s) => s.principale).length > 1 ? "vos structures" : "votre structure"}
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Part minimale des agents présents pour assurer la continuité du service. Au-dessous, un congé qui retire un agent entre en conflit de quorum.
          Sans quorum défini, la structure reprend celui de la structure qui la contient, puis celui du ministère ({ministere} %).
        </p>
      </div>
      <ul className="divide-y divide-hairline">
        {structures.map((structure) => <LigneQuorum key={structure.code} structure={structure} />)}
      </ul>
    </section>
  );
}

function LigneQuorum({ structure }: { structure: StructureQuorum }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const valeur = saisie ?? (structure.propre != null ? String(structure.propre) : "");

  async function enregistrer(nouveau: number | null) {
    setEnCours(true);
    try {
      await feedback.run(
        "Enregistrement du quorum…",
        () => api(`/api/v1/structures/${encodeURIComponent(structure.code)}/quorum/`, { method: "PATCH", body: JSON.stringify({ quorum_presence_pourcent: nouveau }) }),
        { success: { title: nouveau === null ? "Quorum hérité" : "Quorum enregistré", message: nouveau === null ? `${structure.nom} reprend le quorum de la structure qui la contient.` : `${structure.nom} : ${nouveau} % de présence minimale.` } },
      );
      setSaisie(null);
      await client.invalidateQueries({ queryKey: CLE });
      await client.invalidateQueries({ queryKey: ["carrieres-conges"] });
    } catch (cause) {
      feedback.toast("Quorum non enregistré", cause instanceof ApiError ? cause.message : undefined, "error");
    } finally {
      setEnCours(false);
    }
  }

  const modifie = saisie !== null && saisie !== (structure.propre != null ? String(structure.propre) : "");
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${structure.principale ? "" : "pl-4"}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-label-lg text-label-lg font-semibold text-on-surface">{structure.nom}</p>
        <p className="font-label-sm text-label-sm text-on-surface-variant">{structure.niveau_libelle}{structure.parent && !structure.principale ? ` · ${structure.parent}` : ""}</p>
      </div>
      <span className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-bold ${structure.herite ? "bg-surface-container text-on-surface-variant" : "bg-primary-fixed text-on-primary-fixed"}`}>
        {structure.valeur} % · {structure.herite ? "hérité" : "défini"}
      </span>
      <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); const n = Number(valeur); if (Number.isInteger(n) && valeur !== "") void enregistrer(n); }}>
        <input
          className="h-9 w-20 rounded border border-outline-variant bg-surface-container-lowest px-2 font-code-num text-code-num font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          type="number" min={1} max={100} inputMode="numeric" placeholder={String(structure.valeur)} value={valeur}
          onChange={(event) => setSaisie(event.target.value)} aria-label={`Quorum de ${structure.nom} en pourcentage`}
        />
        <span className="font-body-sm text-body-sm text-on-surface-variant">%</span>
        <button type="submit" disabled={enCours || !modifie || valeur === ""} className="inline-flex h-9 items-center gap-1.5 rounded bg-primary px-3 font-label-md text-label-md text-on-primary disabled:opacity-50">
          <Icone nom="save" className="text-base" />Enregistrer
        </button>
        {structure.propre != null ? (
          <button type="button" disabled={enCours} onClick={() => void enregistrer(null)} className="inline-flex h-9 items-center gap-1.5 rounded border border-outline-variant px-3 font-label-md text-label-md text-on-surface hover:bg-surface-container-low disabled:opacity-50" title="Reprendre le quorum de la structure qui la contient">
            <Icone nom="undo" className="text-base" />Hériter
          </button>
        ) : null}
      </form>
    </li>
  );
}
