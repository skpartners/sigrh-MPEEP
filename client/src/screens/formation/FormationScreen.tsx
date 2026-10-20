import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api, telecharger } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { Skeleton } from "../../ui/Motion";
import { AppChrome } from "../AppChrome";
import { Besoins } from "./Besoins";
import { Candidatures } from "./Candidatures";
import { Passeport } from "./Passeport";
import { Prestataires } from "./Prestataires";
import { Sessions } from "./Sessions";
import { CLE_FORMATION, type TableauFormation } from "./types";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, CARTE } from "./ui";
import { Icone } from "../../ui/Icone";

type Vue = "besoins" | "modules" | "candidatures" | "prestataires" | "passeport";
const VUES: Vue[] = ["besoins", "modules", "candidatures", "prestataires", "passeport"];

/** Accueil de la sous-direction de la formation continue : tout est calculé depuis la base. */
export function FormationScreen() {
  const [params, setParams] = useSearchParams();
  const demandee = params.get("vue") as Vue | null;
  // Sans choix explicite, c'est le premier onglet qui s'ouvre.
  const vue = demandee && VUES.includes(demandee) ? demandee : VUES[0];
  const feedback = useFeedback();
  const tableau = useQuery({ queryKey: CLE_FORMATION, queryFn: () => api<TableauFormation>("/api/v1/formation/") });
  const data = tableau.data;

  function choisir(id: Vue) {
    setParams(id === VUES[0] ? {} : { vue: id }, { replace: true });
  }

  async function exporter() {
    await feedback
      .run("Préparation du plan de formation…", () => telecharger("/api/v1/formation/plan/export/", `plan-formation-${data?.exercice ?? ""}.xlsx`), { error: "L'export n'a pas abouti" })
      .then(() => feedback.toast("Plan de formation exporté"))
      .catch(() => undefined);
  }

  const onglets: { id: Vue; libelle: string; icone: string; compteur?: number }[] = [
    { id: "besoins", libelle: "Besoins", icone: "analytics", compteur: data?.besoins.length },
    { id: "modules", libelle: "Modules", icone: "event_available", compteur: data?.indicateurs.sessions },
    { id: "candidatures", libelle: "Candidatures", icone: "fact_check", compteur: data?.indicateurs.candidatures_a_traiter },
    { id: "prestataires", libelle: "Prestataires", icone: "assured_workload", compteur: data?.indicateurs.prestataires_actifs },
    { id: "passeport", libelle: "Dossier de formation", icone: "workspace_premium" },
  ];

  return (
    <AppChrome>
      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6">
        <div className={`${CARTE} p-6 motion-rise`}>
          <div className="space-y-4">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Élaboration du plan de formation</h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Exercice {data?.exercice ?? ""}</p>
            </div>
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
              <button type="button" className={`${BOUTON_SECONDAIRE} shrink-0`} onClick={exporter} disabled={!data}>
                <Icone nom="download" className="text-lg" />
                Exporter le plan (XLSX)
              </button>
            </div>
          </div>
        </div>

        {tableau.isError ? (
          <div className={`${CARTE} p-6`} role="alert">
            <p className="font-label-lg text-label-lg text-error">Les données de la formation continue n'ont pas pu être chargées.</p>
            <button type="button" className={`${BOUTON_PRIMAIRE} mt-3`} onClick={() => tableau.refetch()}>Réessayer</button>
          </div>
        ) : null}

        <div className={CARTE}>
          <div role="tablist" aria-label="Rubriques de la formation continue" className="flex flex-wrap gap-1 p-1">
            {onglets.map((o) => {
              const actif = o.id === vue;
              return (
                <button
                  key={o.id}
                  role="tab"
                  type="button"
                  aria-selected={actif}
                  aria-controls="panneau-formation"
                  onClick={() => choisir(o.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded font-label-md text-label-md ${actif ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"}`}
                >
                  <Icone nom={o.icone} className="text-base" />
                  {o.libelle}
                  {o.compteur ? <span className={`px-1.5 rounded font-code-num text-label-sm ${actif ? "bg-on-primary/20" : "bg-surface-container-high text-on-surface"}`}>{o.compteur}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div id="panneau-formation" role="tabpanel" key={vue} className="motion-panel">
          {!data ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : vue === "modules" ? (
            <Sessions data={data} />
          ) : vue === "candidatures" ? (
            <Candidatures data={data} />
          ) : vue === "besoins" ? (
            <Besoins data={data} />
          ) : vue === "prestataires" ? (
            <Prestataires data={data} />
          ) : (
            <Passeport />
          )}
        </div>
      </div>
    </AppChrome>
  );
}
