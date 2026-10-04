import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api, telecharger } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { fcfa, nombre, pluriel } from "../../ui/format";
import { Skeleton } from "../../ui/Motion";
import { AppChrome } from "../AppChrome";
import { Besoins } from "./Besoins";
import { Candidatures } from "./Candidatures";
import { Catalogue } from "./Catalogue";
import { Passeport } from "./Passeport";
import { Prestataires } from "./Prestataires";
import { Sessions } from "./Sessions";
import { CLE_FORMATION, type TableauFormation } from "./types";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, CARTE, EnTeteSection, Modale, Nombre, Vide, messageErreur, useEnregistrement } from "./ui";

type Vue = "pilotage" | "modules" | "candidatures" | "besoins" | "catalogue" | "prestataires" | "passeport";

/** Accueil de la sous-direction de la formation continue : tout est calculé depuis la base. */
export function FormationScreen() {
  const [params, setParams] = useSearchParams();
  const vue = (params.get("vue") as Vue | null) ?? "pilotage";
  const [plan, setPlan] = useState(false);
  const feedback = useFeedback();
  const tableau = useQuery({ queryKey: CLE_FORMATION, queryFn: () => api<TableauFormation>("/api/v1/formation/") });
  const data = tableau.data;

  function choisir(id: Vue) {
    setParams(id === "pilotage" ? {} : { vue: id }, { replace: true });
  }

  async function exporter() {
    await feedback
      .run("Préparation du plan de formation…", () => telecharger("/api/v1/formation/plan/export/", `plan-formation-${data?.exercice ?? ""}.xlsx`), { error: "L'export n'a pas abouti" })
      .then(() => feedback.toast("Plan de formation exporté"))
      .catch(() => undefined);
  }

  const onglets: { id: Vue; libelle: string; icone: string; compteur?: number }[] = [
    { id: "pilotage", libelle: "Pilotage", icone: "monitoring" },
    { id: "modules", libelle: "Modules", icone: "event_available", compteur: data?.indicateurs.sessions },
    { id: "candidatures", libelle: "Candidatures", icone: "fact_check", compteur: data?.indicateurs.candidatures_a_traiter },
    { id: "besoins", libelle: "Besoins", icone: "analytics", compteur: data?.besoins.length },
    { id: "catalogue", libelle: "Catalogue", icone: "menu_book", compteur: data?.types.length },
    { id: "prestataires", libelle: "Prestataires", icone: "assured_workload", compteur: data?.indicateurs.prestataires_actifs },
    { id: "passeport", libelle: "Passeport", icone: "workspace_premium" },
  ];

  return (
    <AppChrome>
      <div className="w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex-1 space-y-6">
        <div className={`${CARTE} p-6`}>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Formation continue</h1>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-3xl">
                Plan de formation, planification des modules, arbitrage des candidatures et suivi des acquis des agents du portefeuille de l'État.
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Exercice {data?.exercice ?? ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setPlan(true)} disabled={!data}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">tune</span>
                Paramètres du plan
              </button>
              <button type="button" className={BOUTON_SECONDAIRE} onClick={exporter} disabled={!data}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">download</span>
                Exporter le plan (XLSX)
              </button>
              <button type="button" className={BOUTON_PRIMAIRE} onClick={() => choisir("modules")}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">event_available</span>
                Gérer les modules
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

        <Indicateurs data={data} onCandidatures={() => choisir("candidatures")} />

        <div className={`${CARTE} overflow-x-auto`}>
          <div role="tablist" aria-label="Rubriques de la formation continue" className="flex min-w-max gap-1 p-1">
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
                  <span className="material-symbols-outlined text-base" aria-hidden="true">{o.icone}</span>
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
          ) : vue === "catalogue" ? (
            <Catalogue data={data} />
          ) : vue === "prestataires" ? (
            <Prestataires data={data} />
          ) : vue === "passeport" ? (
            <Passeport />
          ) : (
            <Pilotage data={data} onVue={choisir} />
          )}
        </div>
      </div>
      {plan && data ? <ParametresPlan data={data} onClose={() => setPlan(false)} /> : null}
    </AppChrome>
  );
}

function Indicateurs({ data, onCandidatures }: { data: TableauFormation | undefined; onCandidatures: () => void }) {
  if (!data) return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>;
  const { indicateurs: k, plan } = data;
  const execution = plan.objectif_agents ? Math.round((100 * k.formes) / plan.objectif_agents) : 0;
  const consommation = plan.dotation ? Math.round((100 * k.engage) / plan.dotation) : 0;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
      <Indicateur icone="trending_up" libelle="Exécution du plan" valeur={plan.objectif_agents ? `${execution} %` : "—"} jauge={execution}>
        {plan.objectif_agents ? `${pluriel(k.formes, "agent formé", "agents formés")} sur un objectif de ${nombre(plan.objectif_agents)}` : "Fixez l'objectif dans les paramètres du plan"}
      </Indicateur>
      <Indicateur icone="account_balance_wallet" libelle="Budget engagé" valeur={fcfa(k.engage)} jauge={consommation} alerte={consommation > 100}>
        {plan.dotation ? `${consommation} % d'une dotation de ${fcfa(plan.dotation)}` : "Dotation non renseignée"}
      </Indicateur>
      <Indicateur icone="pending_actions" libelle="Candidatures à contrôler" valeur={nombre(k.candidatures_a_traiter)} action={k.candidatures_a_traiter ? { libelle: "Traiter", onClick: onCandidatures } : undefined}>
        {k.candidatures_a_traiter ? "En attente du contrôle de la sous-direction" : "Aucune candidature en attente"}
      </Indicateur>
      <Indicateur icone="sentiment_satisfied" libelle="Satisfaction des participants" valeur={k.satisfaction ? `${nombre(k.satisfaction, 1)} / 5` : "—"} jauge={k.satisfaction ? (k.satisfaction / 5) * 100 : undefined}>
        {k.evaluations ? `Moyenne de ${pluriel(k.evaluations, "évaluation")} à chaud` : "Pas encore d'évaluation"}
      </Indicateur>
    </div>
  );
}

function Indicateur({ icone, libelle, valeur, jauge, alerte, action, children }: { icone: string; libelle: string; valeur: string; jauge?: number; alerte?: boolean; action?: { libelle: string; onClick: () => void }; children: ReactNode }) {
  return (
    <div className={`${CARTE} motion-content p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-md text-label-md text-on-surface-variant">{libelle}</span>
        <span className="p-2 rounded bg-surface-container text-primary"><span className="material-symbols-outlined text-xl" aria-hidden="true">{icone}</span></span>
      </div>
      <p className="font-headline-lg text-headline-lg text-on-surface font-bold">{valeur}</p>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{children}</p>
      {jauge !== undefined ? (
        <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden mt-auto" aria-hidden="true">
          <div className={`motion-fill h-full rounded-full ${alerte ? "bg-error" : "bg-primary"}`} style={{ width: `${Math.min(100, jauge)}%` }}></div>
        </div>
      ) : null}
      {action ? (
        <button type="button" className="mt-auto self-start inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline rounded" onClick={action.onClick}>
          {action.libelle}
          <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
        </button>
      ) : null}
    </div>
  );
}

function Pilotage({ data, onVue }: { data: TableauFormation; onVue: (v: Vue) => void }) {
  const totalBudget = data.budget_par_type.reduce((s, t) => s + t.montant, 0);
  const evaluees = data.sessions.filter((s) => s.satisfaction !== null);
  const prochains = data.sessions.filter((s) => s.etat === "inscriptions_ouvertes" || s.etat === "en_cours").slice(0, 4);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      <section className={`${CARTE} p-5 xl:col-span-7`} aria-labelledby="titre-recensement">
        <EnTeteSection icone="analytics" titre="Couverture des besoins par cycle" sousTitre="Besoins exprimés par les structures et part déjà couverte par un module" />
        {data.recensement.length === 0 ? (
          <Vide icone="analytics" titre="Aucun besoin recensé" texte="Enregistrez les besoins des structures pour mesurer leur couverture." action={<button type="button" className={BOUTON_PRIMAIRE} onClick={() => onVue("besoins")}>Recenser</button>} />
        ) : (
          <ul className="space-y-4">
            {data.recensement.map((r) => {
              const taux = r.besoins ? Math.round((100 * r.couverts) / r.besoins) : 0;
              return (
                <li key={r.type}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-label-lg text-label-lg text-on-surface">{r.libelle}</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{r.couverts} / {r.besoins} besoins couverts · {pluriel(r.structures, "structure")} · {pluriel(r.effectif, "agent")}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
                    <div className="motion-fill h-full rounded-full bg-primary" style={{ width: `${taux}%` }}></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${CARTE} p-5 xl:col-span-5`} aria-labelledby="titre-budget">
        <EnTeteSection icone="payments" titre="Budget engagé par cycle" sousTitre={`${fcfa(totalBudget)} engagés sur les places attribuées`} />
        {data.budget_par_type.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune place attribuée pour l'instant.</p>
        ) : (
          <ul className="space-y-3">
            {data.budget_par_type.map((t) => {
              const part = totalBudget ? (100 * t.montant) / totalBudget : 0;
              return (
                <li key={t.type}>
                  <div className="flex items-baseline justify-between gap-2 font-body-sm text-body-sm">
                    <span className="text-on-surface">{t.libelle}</span>
                    <span className="font-code-num text-code-num text-on-surface whitespace-nowrap">{fcfa(t.montant)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
                    <div className="motion-fill h-full rounded-full bg-secondary-container" style={{ width: `${part}%` }}></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${CARTE} p-5 xl:col-span-7`} aria-labelledby="titre-evaluations">
        <EnTeteSection icone="rate_review" titre="Évaluations des modules" sousTitre="Satisfaction moyenne des participants, notée à l'émargement" />
        {evaluees.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun module évalué pour l'instant : la satisfaction se saisit dans la liste des participants.</p>
        ) : (
          <ul className="space-y-3">
            {evaluees.map((s) => (
              <li key={s.code}>
                <div className="flex items-baseline justify-between gap-2 font-body-sm text-body-sm">
                  <span className="text-on-surface">{s.libelle}</span>
                  <span className="font-label-md text-label-md text-on-surface whitespace-nowrap">{nombre(s.satisfaction ?? 0, 1)} / 5</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
                  <div className="motion-fill h-full rounded-full bg-primary" style={{ width: `${((s.satisfaction ?? 0) / 5) * 100}%` }}></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${CARTE} p-5 xl:col-span-5`} aria-labelledby="titre-prochains">
        <EnTeteSection icone="event_upcoming" titre="Modules en cours et ouverts" />
        {prochains.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun module en cours ni ouvert aux inscriptions.</p>
        ) : (
          <ul className="divide-y divide-surface-container-high">
            {prochains.map((s) => (
              <li key={s.code} className="py-2.5">
                <p className="font-label-lg text-label-lg text-on-surface">{s.libelle}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{s.etat_libelle} · {s.occupees} / {s.places} places{s.a_traiter ? ` · ${pluriel(s.a_traiter, "candidature")} à contrôler` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="mt-3 inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline rounded" onClick={() => onVue("modules")}>
          Tous les modules
          <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
        </button>
      </section>
    </div>
  );
}

function ParametresPlan({ data, onClose }: { data: TableauFormation; onClose: () => void }) {
  const [dotation, setDotation] = useState(String(data.plan.dotation || ""));
  const [objectif, setObjectif] = useState(String(data.plan.objectif_agents || ""));
  const enregistrer = useEnregistrement(onClose, "Plan de formation mis à jour");
  return (
    <Modale
      titre={`Plan de formation ${data.exercice}`}
      sousTitre="La dotation et l'objectif servent au calcul des indicateurs d'exécution."
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: "/api/v1/formation/plan/", methode: "PUT", corps: { dotation, objectif_agents: objectif } })}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
      largeur="max-w-lg"
    >
      <div className="grid grid-cols-1 gap-4">
        <Nombre libelle="Dotation budgétaire" obligatoire valeur={dotation} onChange={setDotation} unite="FCFA" />
        <Nombre libelle="Objectif d'agents à former" obligatoire valeur={objectif} onChange={setObjectif} unite="agents" />
      </div>
    </Modale>
  );
}
