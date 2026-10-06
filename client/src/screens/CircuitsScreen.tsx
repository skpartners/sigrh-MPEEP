import { useQuery } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import type { Circuits } from "../api/types";
import { dateLongue } from "../ui/format";
import { Portrait } from "../ui/PhotoProfil";
import { Skeleton, useFlip } from "../ui/Motion";
import { Pagination, usePagination } from "../ui/Pagination";
import { useAction } from "../ui/useAction";
import { AppChrome } from "./AppChrome";
import { ConfigurerCircuits } from "./circuits/ConfigurerCircuits";
import { Icone } from "../ui/Icone";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";

const FLUX: { id: string; libelle: string }[] = [
  { id: "", libelle: "Tous les flux" },
  { id: "conge", libelle: "Congés" },
  { id: "social", libelle: "Prêts & aides sociales" },
  { id: "formation", libelle: "Formation" },
];

const ICONES_ETAPES = ["edit_note", "pending_actions", "policy", "draw", "mark_email_read"];

export function CircuitsScreen() {
  const { hash } = useLocation();
  const [flux, setFlux] = useState("");
  const { agir } = useAction();
  const circuits = useQuery({ queryKey: ["circuits"], queryFn: () => api<Circuits>("/api/v1/circuits/") });
  const data = circuits.data;
  if (hash === "#rbac") return <Navigate to="/app/habilitations" replace />;

  const aSigner = (data?.demandes ?? []).filter((demande) => demande.etape.startsWith("Étape 4") && !demande.etape.includes("papier")).length;
  const maxEtape = Math.max(1, ...(data?.etapes ?? []).slice(0, -1).map((etape) => Number(etape.compteur)));

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1">
        <div className="flex flex-col w-full space-y-8">
          {/* Bandeau et compteurs du circuit */}
          <div className={`${CARD} p-6 motion-rise`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                  Circuits de validation
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                  Suivi de la chaîne d'approbation, de la requête de l'agent jusqu'au visa du DRH.
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Décret n° 2024-412 · exercice {data?.exercice ?? 2026}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50"
                  type="button"
                  disabled={aSigner === 0}
                  onClick={() =>
                    agir<{ signees: number }>({
                      confirmation: `Apposer votre signature sur les ${aSigner} document${aSigner > 1 ? "s" : ""} en circulation ? Le papier à en-tête sera établi ensuite.`,
                      confirmLabel: "Signer le lot",
                      attente: "Signature électronique du lot…",
                      route: "/api/v1/demandes/signer-lot/",
                      succes: "Lot DRH signé",
                      detail: (r) => `${r.signees} demande${r.signees > 1 ? "s" : ""} notifiée${r.signees > 1 ? "s" : ""} aux agents.`,
                    })
                  }
                >
                  <Icone nom="fact_check" className="text-lg" />
                  <span>Signer le lot DRH ({aSigner})</span>
                </button>
              </div>
            </div>
            <ol className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
              {data
                ? data.etapes.map((etape, index) => {
                    const derniere = index === data.etapes.length - 1;
                    const attention = etape.ordre === 2;
                    return (
                      <li key={etape.ordre} className="motion-content p-3.5 rounded-lg bg-surface-container-low">
                        <div className={`flex items-center justify-between gap-2 ${attention ? "text-secondary" : "text-on-surface-variant"}`}>
                          <span className="font-label-sm text-label-sm font-semibold">{etape.ordre}. {etape.titre}</span>
                          <Icone nom={ICONES_ETAPES[index] ?? "radio_button_checked"} className="text-base" />
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          <span className={`font-headline-lg text-headline-lg font-bold ${derniere ? "text-primary" : attention ? "text-secondary" : "text-on-surface"}`}>{etape.compteur}</span>
                          <span className="font-code-num text-code-num text-on-surface-variant">{etape.detail}</span>
                        </div>
                        <div className="w-full bg-surface-container-high h-1 rounded-full mt-2 overflow-hidden" aria-hidden="true">
                          <div
                            className={`motion-fill h-full ${derniere ? "bg-primary" : attention ? "bg-secondary-container" : "bg-tertiary-container"}`}
                            style={{ width: derniere ? "100%" : `${(Number(etape.compteur) / maxEtape) * 100}%` }}
                          ></div>
                        </div>
                      </li>
                    );
                  })
                : [0, 1, 2, 3, 4].map((index) => <li key={index}><Skeleton className="h-24 rounded-lg" /></li>)}
            </ol>
          </div>

          {circuits.isError ? (
            <div className={`${CARD} p-6`} role="alert">
              <p className="font-label-lg text-label-lg text-error">Les circuits n'ont pas pu être chargés.</p>
              <button type="button" className="mt-3 h-8 px-3 rounded bg-primary-container text-on-primary font-label-md text-label-md hover:bg-primary" onClick={() => circuits.refetch()}>
                Réessayer
              </button>
            </div>
          ) : null}

          <ConfigurerCircuits />

          {/* Parcours d'une requête */}
          <section className="space-y-4 motion-rise" style={{ "--delay": "80ms" } as CSSProperties} aria-labelledby="titre-parcours">
            <div>
              <h2 id="titre-parcours" className="font-headline-md text-headline-md text-on-surface">Parcours d'une requête</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Cinq étapes, avec contrôle de légalité et retour possible à l'agent.</p>
            </div>
            <ol className={`${CARD} p-6 grid grid-cols-1 lg:grid-cols-5 gap-4`}>
              {data
                ? data.parcours.map((etape, index) => (
                    <li key={etape.ordre} className="motion-content relative rounded-lg p-4 bg-surface-container-low flex flex-col justify-between" style={{ "--delay": `${index * 60}ms` } as CSSProperties}>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-code-num text-code-num flex items-center justify-center font-bold">{etape.ordre}</span>
                          <Icone nom={ICONES_ETAPES[index] ?? "radio_button_checked"} className="text-primary text-xl" />
                        </div>
                        <div>
                          <p className="font-label-md text-label-md text-on-surface-variant font-bold">{etape.acteur}</p>
                          <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">{etape.titre}</h3>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{etape.texte}</p>
                      </div>
                      {etape.metas.map((meta) => (
                        <div key={meta.label} className="mt-4 bg-surface-container-lowest/80 -mx-4 -mb-4 p-3 rounded-b-lg flex items-center justify-between gap-2">
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{meta.label}</span>
                          <span className="font-code-num text-code-num text-on-surface font-semibold text-right">{meta.value}</span>
                        </div>
                      ))}
                      {index < data.parcours.length - 1 ? (
                        <Icone nom="arrow_forward" className="hidden lg:block absolute top-1/2 -right-[19px] -translate-y-1/2 z-10 text-primary text-2xl" />
                      ) : null}
                    </li>
                  ))
                : [0, 1, 2, 3, 4].map((index) => <li key={index}><Skeleton className="h-56 rounded-lg" /></li>)}
            </ol>
          </section>

          <RegistreDemandes demandes={data?.demandes} flux={flux} onFlux={setFlux} onActualiser={() => circuits.refetch()} />

        </div>
      </div>
    </AppChrome>
  );
}

function RegistreDemandes({
  demandes,
  flux,
  onFlux,
  onActualiser,
}: {
  demandes: Circuits["demandes"] | undefined;
  flux: string;
  onFlux: (flux: string) => void;
  onActualiser: () => void;
}) {
  const { agir } = useAction();
  const visibles = (demandes ?? []).filter((demande) => !flux || demande.categorie === flux);
  const pageDemandes = usePagination(visibles, `${flux}|${demandes?.length ?? 0}`);
  const compte = (id: string) => (demandes ?? []).filter((demande) => !id || demande.categorie === id).length;
  const corps = useFlip<HTMLTableSectionElement>(`${flux}|${demandes?.length ?? 0}`);

  return (
    <section className="space-y-4" aria-labelledby="titre-demandes">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 id="titre-demandes" className="font-headline-md text-headline-md text-on-surface">Demandes en circulation</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Dossiers en cours dans le circuit, avec leur étape et leur échéance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 bg-surface-container-low rounded-lg" role="group" aria-label="Type de flux">
            {FLUX.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={flux === item.id}
                onClick={() => onFlux(item.id)}
                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-colors ${flux === item.id ? "bg-surface-container-lowest text-primary shadow-sm font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                {item.libelle} {demandes ? <span className="font-code-num">({compte(item.id)})</span> : null}
              </button>
            ))}
          </div>
          <button className="p-2 rounded bg-surface-container-lowest border border-hairline text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" aria-label="Actualiser les demandes" type="button" onClick={onActualiser}>
            <Icone nom="sync" className="text-lg" />
          </button>
        </div>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md">
              <th className="py-3.5 px-4">Référence</th>
              <th className="py-3.5 px-4">Agent</th>
              <th className="py-3.5 px-4">Nature</th>
              <th className="py-3.5 px-4" data-min="">Étape & responsable</th>
              <th className="py-3.5 px-4">Échéance</th>
              <th className="py-3.5 px-4 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody ref={corps} className="font-body-sm text-body-sm">
            {demandes === undefined
              ? [0, 1, 2].map((index) => (
                  <tr key={index} className="border-t border-hairline">
                    <td className="py-3.5 px-4" colSpan={6}><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              : null}
            {pageDemandes.visibles.map((demande) => {
              const retour = /complément|retourn/i.test(`${demande.etape} ${demande.echeance}`);
              const cloture = demande.etape.startsWith("Étape 5");
              return (
                <tr key={demande.reference} data-flip={demande.reference} className="motion-content border-t border-hairline hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="font-code-num text-code-num font-bold text-primary">{demande.reference}</span>
                    <span className="block font-label-sm text-label-sm text-on-surface-variant">Déposée le {dateLongue(demande.depose_le)}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Portrait agent={demande.agent} className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md shrink-0" />
                      <div>
                        <p className="font-label-lg text-label-lg font-bold text-on-surface">{demande.agent.nom_complet}</p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant font-code-num">
                          Mle {demande.agent.matricule} · {demande.agent.organisme_sigle}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm">
                      <Icone nom={demande.icone} className="text-base text-primary" />
                      {demande.nature}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="flex items-center gap-2 font-label-md text-label-md text-on-surface font-semibold">
                      <span className={`w-2 h-2 rounded-full ${cloture ? "bg-primary" : retour ? "bg-error" : "bg-secondary-container"}`} aria-hidden="true"></span>
                      {demande.etape}
                    </span>
                    <span className={`font-label-sm text-label-sm ${retour ? "text-error" : "text-on-surface-variant"}`}>{demande.responsable}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-bold whitespace-nowrap ${cloture ? "bg-primary-fixed text-on-primary-fixed" : retour ? "bg-error-container text-on-error-container" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
                      <Icone nom="timer" className="text-sm" />
                      {demande.echeance}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <span className="inline-flex items-center justify-end gap-2">
                      {demande.categorie === "formation" && !demande.etape.startsWith("Étape 5") ? (
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors"
                          onClick={() =>
                            agir<{ etape: string; notifiee: boolean }>({
                              confirmation: `Valider l'étape en cours pour ${demande.agent.nom_complet} ?`,
                              confirmLabel: "Valider",
                              attente: "Visa de l'étape…",
                              route: `/api/v1/demandes/${encodeURIComponent(demande.reference)}/valider/`,
                              succes: (reponse) => (reponse.notifiee ? "Agent notifié" : "Étape validée"),
                              detail: (reponse) =>
                                reponse.notifiee
                                  ? `${demande.agent.nom_complet} a été notifié de sa prise en compte pour cette formation.`
                                  : reponse.etape,
                            })
                          }
                        >
                          Valider l'étape
                        </button>
                      ) : null}
                      <Link
                        to={`/app/dossiers/${encodeURIComponent(demande.agent.matricule)}`}
                        className="inline-block px-2.5 py-1 rounded bg-surface-container text-primary font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        Ouvrir le dossier
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
            {demandes && visibles.length === 0 ? (
              <tr className="border-t border-hairline">
                <td className="py-8 px-4 text-center text-on-surface-variant" colSpan={6}>Aucune demande en cours pour ce flux.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <Pagination page={pageDemandes.page} pages={pageDemandes.pages} total={pageDemandes.total} aller={pageDemandes.aller} libelle="demande" />
      </div>
    </section>
  );
}
