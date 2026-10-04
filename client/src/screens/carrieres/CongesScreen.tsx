import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { Pagination, usePagination } from "../../ui/Pagination";
import { AppChrome } from "../AppChrome";
import { PlanificationConges } from "./PlanificationConges";

type Instruction = "pret_signature" | "approbation_auto" | "remplacement" | "conflit_quorum" | "signe" | "rejete" | "decale";
type DemandeConge = {
  id: number;
  agent: AgentBrief & { fonction: string };
  nature: string;
  debut: string;
  fin: string;
  jours: number;
  interim: string;
  interim_detail: string;
  instruction: Instruction;
  instruction_libelle: string;
  motif: string;
};
type Ton = "neutre" | "attention" | "sobre";
type Registre = {
  exercice: number;
  volume: { effectifs: number; acquis: number; consommes: number; reliquats: number; alertes_reliquat: number };
  campagne: { reference?: string; seuil?: number };
  presence: { taux?: number; seuil?: number };
  trimestres: { titre: string; departs: number; texte: string; etat: string; ton: Ton }[];
  mensuel: number[];
  quorums: { entite: string; presence: number; detail: string }[];
  reliquats: { echeance?: string; circulaire?: string; options?: { titre: string; texte: string; jours: number; part: number; ton: Ton }[] };
  en_attente: number;
  instructions: { code: Instruction; libelle: string }[];
  demandes: DemandeConge[];
};
type Action = "signer" | "rejeter" | "decaler";

const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const FILTRE = "w-full h-9 px-2.5 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded focus:outline-none focus:ring-1 focus:ring-primary";
const PASTILLE: Record<Instruction, string> = {
  pret_signature: "bg-primary-fixed text-on-primary-fixed",
  approbation_auto: "bg-surface-container-high text-on-surface",
  remplacement: "bg-primary-fixed text-on-primary-fixed",
  conflit_quorum: "bg-secondary-fixed text-on-secondary-fixed",
  signe: "bg-primary text-on-primary",
  rejete: "bg-error-container text-on-error-container",
  decale: "bg-secondary-fixed text-on-secondary-fixed",
};

function nombre(valeur: number): string {
  return valeur.toLocaleString("fr-FR");
}

function jour(iso: string): string {
  const [annee, mois, jourMois] = iso.split("-").map(Number);
  return `${String(jourMois).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function duree(demande: DemandeConge): string {
  if (/maternit/i.test(demande.nature) && demande.jours >= 28) return `${Math.round(demande.jours / 7)} semaines`;
  return `${demande.jours} jour${demande.jours > 1 ? "s" : ""}`;
}

/** Congés : soldes de l'exercice, présence, quorums et arbitrage des demandes. */
export function CongesScreen() {
  const feedback = useFeedback();
  const registre = useQuery({ queryKey: ["carrieres-conges"], queryFn: () => api<Registre>("/api/v1/carrieres/conges/") });
  const [entite, setEntite] = useState("");
  const [nature, setNature] = useState("");
  const [instruction, setInstruction] = useState("");
  const [action, setAction] = useState<{ demande: DemandeConge; action: Action } | null>(null);
  const donnees = registre.data;
  const demandes = donnees?.demandes ?? [];
  const filtrees = useMemo(
    () =>
      demandes.filter(
        (item) => (!entite || item.agent.organisme_sigle === entite) && (!nature || item.nature === nature) && (!instruction || item.instruction === instruction),
      ),
    [demandes, entite, nature, instruction],
  );
  const pageDemandes = usePagination(filtrees, `${entite}|${nature}|${instruction}`);
  const entites = [...new Set(demandes.map((item) => item.agent.organisme_sigle))].sort();
  const natures = [...new Set(demandes.map((item) => item.nature))].sort();
  const volume = donnees?.volume;
  const partConsommee = volume && volume.acquis ? Math.round((volume.consommes / volume.acquis) * 1000) / 10 : 0;
  const seuil = donnees?.presence.seuil ?? donnees?.campagne.seuil ?? 65;
  const presence = donnees?.presence.taux;
  const exercice = donnees?.exercice ?? "";

  async function exporterEtat() {
    await feedback.run(
      "Préparation de l'état…",
      () => telecharger("/api/v1/conges/planification/export/", `etat-conges-${exercice || new Date().getFullYear()}.pdf`),
      { success: { title: "État des congés exporté" }, error: "L'export n'a pas abouti" },
    );
  }

  return (
    <AppChrome>
      <div className="flex flex-col w-full">
        <div className="px-6 py-6 md:px-8 max-w-[1600px] w-full mx-auto space-y-6">
          {/* Fil d'Ariane & titre */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <nav className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                <span>SD GESTION DES CARRIÈRES</span>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span>TEMPS DE SERVICE & CONGÉS</span>
                <span className="material-symbols-outlined text-xs">chevron_right</span>
                <span className="text-primary font-bold">PLANIFICATION ANNUELLE DES CONGÉS</span>
              </nav>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Supervision & planification des congés annuels</h1>
                <span className="px-2.5 py-0.5 rounded bg-primary-container text-on-primary font-label-sm text-label-sm uppercase font-semibold tracking-wider">
                  Exercice {exercice} actif
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">
                Consolidation des plans de congés, arbitrage des départs, suivi des reliquats et maintien du quorum de continuité du service public (seuil minimal de {seuil} %).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button className="flex items-center gap-2 px-3.5 py-2 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors shadow-sm" type="button" onClick={() => void exporterEtat()}>
                <span className="material-symbols-outlined text-lg">download</span>
                <span>Exporter l'état des congés</span>
              </button>
            </div>
          </div>

          <PlanificationConges />

          {/* Ruban de campagne */}
          <div className="p-3 bg-surface-container-lowest rounded-lg shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                <span className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wide">Campagne {exercice} active</span>
              </div>
              {presence != null ? (
                <>
                  <div className="hidden md:block w-px h-4 bg-outline-variant" />
                  <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
                    <span className="material-symbols-outlined text-base text-secondary">verified_user</span>
                    <span>
                      Continuité de service : <strong className="text-primary font-bold">quorum global {presence.toFixed(1)} %</strong>
                    </span>
                  </div>
                </>
              ) : null}
            </div>
            {donnees?.campagne.reference ? (
              <div className="flex items-center gap-2 text-on-surface-variant font-code-num text-code-num bg-surface-container-low px-2 py-1 rounded">
                <span>RÉF : {donnees.campagne.reference}</span>
              </div>
            ) : null}
          </div>

          {/* Indicateurs calculés sur les agents */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Carte titre={`Volume global acquis ${exercice}`} icone="calendar_month" teinte="text-primary">
              <div className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                {volume ? nombre(volume.acquis) : "—"} <span className="font-label-md text-label-md text-on-surface-variant">jours</span>
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Droits annuels cumulés • <strong>{volume ? nombre(volume.effectifs) : "—"}</strong> agents en activité
              </div>
              <Barre part={100} couleur="bg-primary" />
            </Carte>
            <Carte titre="Jours consommés" icone="event_available" teinte="text-secondary">
              <div className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                {volume ? nombre(volume.consommes) : "—"} <span className="font-label-md text-label-md text-on-surface-variant">jours</span>
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                <strong>{partConsommee.toLocaleString("fr-FR")} %</strong> du volume annuel
              </div>
              <Barre part={partConsommee} couleur="bg-secondary-container" />
            </Carte>
            <Carte titre="Reliquats N-1 à apurer" icone="history_toggle_off" teinte="text-on-secondary-fixed" fond="bg-secondary-fixed" titreCouleur="text-secondary">
              <div className="font-headline-lg text-headline-lg text-secondary tracking-tight">
                {volume ? nombre(volume.reliquats) : "—"} <span className="font-label-md text-label-md text-on-surface-variant">jours</span>
              </div>
              <div className="font-body-sm text-body-sm text-secondary mt-1 font-medium">
                {donnees?.reliquats.echeance ? `À apurer avant le ${donnees.reliquats.echeance} • ` : ""}
                {volume ? `${volume.alertes_reliquat} agent${volume.alertes_reliquat > 1 ? "s" : ""} concerné${volume.alertes_reliquat > 1 ? "s" : ""}` : ""}
              </div>
            </Carte>
            <Carte titre="Taux de présence de service" icone="groups" teinte="text-primary">
              <div className="font-headline-lg text-headline-lg text-primary tracking-tight">{presence != null ? `${presence.toFixed(1)} %` : "—"}</div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Seuil légal (<strong>≥ {seuil.toFixed(1)} %</strong>) sur l'ensemble du portefeuille
              </div>
              <Barre part={presence ?? 0} couleur="bg-primary" />
            </Carte>
          </div>

          {/* Radar annuel et quorums */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 p-5 bg-surface-container-lowest rounded-lg shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Radar annuel des départs & périodes critiques</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Modélisation prévisionnelle des départs simultanés pour l'exercice {exercice}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {registre.isPending
                  ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-28 w-full" />)
                  : (donnees?.trimestres ?? []).map((trimestre) => (
                      <div key={trimestre.titre} className="p-3 rounded bg-surface-container-low flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-label-md text-label-md font-bold ${trimestre.ton === "attention" ? "text-secondary" : "text-on-surface"}`}>{trimestre.titre}</span>
                          <span className={`px-2 py-0.5 rounded font-code-num text-code-num font-semibold whitespace-nowrap ${trimestre.ton === "attention" ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-primary-fixed text-on-primary-fixed"}`}>
                            {trimestre.departs} % départs
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{trimestre.texte}</p>
                        <div className={`flex items-center gap-2 pt-1 font-label-sm text-label-sm font-medium ${trimestre.ton === "attention" ? "text-secondary" : "text-primary"}`}>
                          <span className="material-symbols-outlined text-sm">{trimestre.ton === "attention" ? "warning" : "check_circle"}</span>
                          <span>{trimestre.etat}</span>
                        </div>
                      </div>
                    ))}
              </div>
              <div className="p-4 rounded bg-surface-container-lowest shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-on-surface">
                  <span className="font-label-md text-label-md font-semibold">Taux de présence mensuel projeté (%)</span>
                  <div className="flex items-center gap-4 font-label-sm text-label-sm">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 bg-primary rounded-full" />
                      Présence prévue
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-1.5 bg-secondary rounded-full" />
                      Proche du seuil ({seuil} %)
                    </span>
                  </div>
                </div>
                <div className="w-full h-36 flex items-end gap-1 sm:gap-2 pt-4 px-1 sm:px-2">
                  {(donnees?.mensuel ?? []).map((taux, index) => {
                    const critique = taux < seuil + 5;
                    const courant = index === new Date().getMonth();
                    return (
                      <div key={MOIS_COURTS[index]} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
                        <span className={`hidden sm:inline font-code-num text-code-num ${critique ? "text-secondary font-bold" : courant ? "text-primary font-bold" : "text-on-surface-variant"}`}>{taux}%</span>
                        <div
                          className={`w-full rounded-t ${critique ? "bg-secondary shadow-sm" : courant ? "bg-primary shadow-sm" : "bg-primary/20 hover:bg-primary transition-colors"}`}
                          style={{ height: `${taux}%` }}
                          title={`${MOIS_COURTS[index]} : ${taux} %`}
                        />
                        <span className={`font-label-sm text-label-sm ${critique ? "text-secondary font-bold" : courant ? "text-primary font-bold" : "text-on-surface-variant"}`}>{MOIS_COURTS[index]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 p-5 bg-surface-container-lowest rounded-lg shadow-sm space-y-4 flex flex-col">
              <div>
                <div className="flex items-center justify-between pb-2">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Quorums par société</h2>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Seuil : {seuil} %</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant pb-3">Contrôle de la permanence des services publics sous tutelle.</p>
                <div className="space-y-3">
                  {(donnees?.quorums ?? []).map((quorum) => {
                    const attention = quorum.presence < seuil + 5;
                    return (
                      <div key={quorum.entite} className="p-2.5 rounded bg-surface-container-low flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`font-label-md text-label-md font-bold truncate ${attention ? "text-secondary" : "text-on-surface"}`}>{quorum.entite}</p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            {quorum.presence} % présence • {quorum.detail}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${attention ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-primary-fixed text-on-primary-fixed"}`}>
                          {attention ? "Attention" : "Conforme"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Registre d'arbitrage */}
          <div className="p-5 bg-surface-container-lowest rounded-lg shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Registre d'arbitrage & visa des demandes de congé</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Demandes soumises à la sous-direction des carrières : l'arrêté est signé avec la signature électronique du DRH.</p>
              </div>
              <span className="font-code-num text-code-num font-bold text-primary px-2 py-0.5 bg-surface-container rounded whitespace-nowrap">
                {donnees ? `${donnees.en_attente} dossier${donnees.en_attente > 1 ? "s" : ""} en attente d'arbitrage` : "…"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-container-low rounded">
              <label className="block">
                <span className="block font-label-sm text-label-sm text-on-surface font-semibold mb-1">Société d'État</span>
                <select className={FILTRE} value={entite} onChange={(event) => setEntite(event.target.value)}>
                  <option value="">Toutes les entités</option>
                  {entites.map((sigle) => (
                    <option key={sigle} value={sigle}>{sigle}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block font-label-sm text-label-sm text-on-surface font-semibold mb-1">Type de congé</span>
                <select className={FILTRE} value={nature} onChange={(event) => setNature(event.target.value)}>
                  <option value="">Tous les régimes de congé</option>
                  {natures.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block font-label-sm text-label-sm text-on-surface font-semibold mb-1">Statut d'instruction</span>
                <select className={FILTRE} value={instruction} onChange={(event) => setInstruction(event.target.value)}>
                  <option value="">Tous les statuts</option>
                  {(donnees?.instructions ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.libelle}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md">
                    <th className="py-3 px-4">Agent & entreprise</th>
                    <th className="py-3 px-3">Type & période</th>
                    <th className="py-3 px-3">Durée</th>
                    <th className="py-3 px-3">Continuité / intérim</th>
                    <th className="py-3 px-3">Statut d'instruction</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registre.isPending ? (
                    <tr>
                      <td colSpan={6} className="py-4 px-4">
                        <Skeleton className="h-10 w-full" />
                      </td>
                    </tr>
                  ) : registre.isError ? (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-error">Le registre des congés n'a pas pu être chargé.</td>
                    </tr>
                  ) : filtrees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-on-surface-variant">Aucune demande ne correspond à ces filtres.</td>
                    </tr>
                  ) : (
                    pageDemandes.visibles.map((demande) => <LigneConge key={demande.id} demande={demande} onAction={(choix) => setAction({ demande, action: choix })} />)
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={pageDemandes.page} pages={pageDemandes.pages} total={pageDemandes.total} aller={pageDemandes.aller} libelle="demande" />
          </div>

          {/* Dispositif d'apurement des reliquats */}
          {donnees?.reliquats.options?.length ? (
            <div className="p-5 bg-surface-container-lowest rounded-lg shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-secondary text-xl">gavel</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Dispositif réglementaire d'apurement des reliquats N-1</h2>
                </div>
                {donnees.reliquats.echeance ? (
                  <span className="font-label-sm text-label-sm px-2.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-bold">
                    Échéance : {donnees.reliquats.echeance} {exercice}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {donnees.reliquats.options.map((option) => (
                  <div key={option.titre} className="p-3.5 rounded bg-surface-container-low flex flex-col justify-between space-y-2">
                    <div>
                      <div className={`font-label-md text-label-md font-bold ${option.ton === "attention" ? "text-secondary" : "text-on-surface"}`}>{option.titre}</div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{option.texte}</p>
                    </div>
                    <div className={`font-code-num text-code-num font-bold ${option.ton === "attention" ? "text-secondary" : option.ton === "neutre" ? "text-primary" : "text-on-surface"}`}>
                      {nombre(option.jours)} jours ({option.part} %)
                    </div>
                  </div>
                ))}
              </div>
              {donnees.reliquats.circulaire ? (
                <p className="pt-2 flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-base text-primary">security</span>
                  Référence : {donnees.reliquats.circulaire}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <ModaleArbitrage demande={action.demande} action={action.action} onClose={() => setAction(null)} /> : null}
    </AppChrome>
  );
}

function Carte({ titre, icone, teinte, fond = "bg-surface-container-low", titreCouleur = "text-on-surface-variant", children }: { titre: string; icone: string; teinte: string; fond?: string; titreCouleur?: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-surface-container-lowest rounded-lg shadow-sm flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`font-label-sm text-label-sm uppercase font-semibold ${titreCouleur}`}>{titre}</span>
        <div className={`w-8 h-8 rounded ${fond} ${teinte} flex items-center justify-center shrink-0`}>
          <span className="material-symbols-outlined text-lg">{icone}</span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Barre({ part, couleur }: { part: number; couleur: string }) {
  return (
    <div className="mt-3 h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
      <div className={`h-full ${couleur} rounded-full`} style={{ width: `${Math.min(part, 100)}%` }} />
    </div>
  );
}

function LigneConge({ demande, onAction }: { demande: DemandeConge; onAction: (action: Action) => void }) {
  const conflit = demande.instruction === "conflit_quorum";
  const close = ["signe", "rejete", "decale", "approbation_auto"].includes(demande.instruction);
  return (
    <tr className={`hover:bg-surface-container-low/60 transition-colors ${conflit ? "bg-secondary-fixed/10" : ""}`}>
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-label-md text-label-md font-bold shrink-0 ${conflit ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-surface-container text-primary"}`}>
            {demande.agent.initiales}
          </div>
          <div>
            <div className="font-label-md text-label-md font-bold text-on-surface">{demande.agent.nom_complet}</div>
            <div className="font-body-sm text-body-sm text-on-surface-variant">
              {demande.agent.fonction || demande.agent.corps} • <strong className="text-on-surface">{demande.agent.organisme_sigle}</strong>
            </div>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-3">
        <div className={`font-label-md text-label-md ${conflit ? "text-secondary font-bold" : "text-on-surface"}`}>{demande.nature}</div>
        <div className="font-code-num text-code-num text-on-surface-variant">
          {jour(demande.debut)} → {jour(demande.fin)}
        </div>
      </td>
      <td className="py-3.5 px-3 font-code-num text-code-num font-bold text-on-surface whitespace-nowrap">{duree(demande)}</td>
      <td className="py-3.5 px-3">
        <div className={`flex items-center gap-1.5 font-label-sm text-label-sm ${conflit ? "text-secondary font-medium" : "text-on-surface"}`}>
          <span className={`material-symbols-outlined text-sm ${conflit ? "" : "text-primary"}`}>{conflit ? "warning" : "person_check"}</span>
          <span>{demande.interim}</span>
        </div>
        <span className={`font-label-sm text-label-sm ${conflit ? "text-secondary" : "text-primary font-medium"}`}>{demande.interim_detail}</span>
      </td>
      <td className="py-3.5 px-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold ${PASTILLE[demande.instruction]}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
          {demande.instruction_libelle}
        </span>
        {demande.motif ? <p className="mt-1 text-xs text-on-surface-variant max-w-[220px]">Motif : {demande.motif}</p> : null}
      </td>
      <td className="py-3.5 px-4 text-right">
        {close ? (
          <span className="font-label-sm text-label-sm text-on-surface-variant inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-primary">{demande.instruction === "approbation_auto" ? "mark_email_read" : "task_alt"}</span>
            {demande.instruction === "approbation_auto" ? "Notification émise" : "Arbitrée"}
          </span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            {conflit ? (
              <button className="px-2.5 py-1.5 rounded bg-secondary text-on-secondary hover:bg-secondary/90 font-label-sm text-label-sm font-bold transition-colors flex items-center gap-1" type="button" onClick={() => onAction("decaler")}>
                <span className="material-symbols-outlined text-sm">event_repeat</span>
                <span>Avis défavorable / décaler</span>
              </button>
            ) : (
              <button className="px-2.5 py-1.5 rounded bg-primary text-on-primary hover:bg-primary/90 font-label-sm text-label-sm font-semibold transition-colors flex items-center gap-1" type="button" onClick={() => onAction("signer")}>
                <span className="material-symbols-outlined text-sm">draw</span>
                <span>{demande.instruction === "remplacement" ? "Signer l'arrêté" : "Signer"}</span>
              </button>
            )}
            <button className="p-1.5 rounded hover:bg-surface-container-high text-on-surface-variant transition-colors" title="Rejeter la demande" aria-label={`Rejeter la demande de ${demande.agent.nom_complet}`} type="button" onClick={() => onAction("rejeter")}>
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

const TITRES: Record<Action, { titre: string; icone: string; bouton: string; succes: string }> = {
  signer: { titre: "Signer l'arrêté de congé", icone: "draw", bouton: "Signer l'arrêté", succes: "Arrêté signé" },
  rejeter: { titre: "Rejeter la demande", icone: "block", bouton: "Rejeter", succes: "Demande rejetée" },
  decaler: { titre: "Avis défavorable : décaler le départ", icone: "event_repeat", bouton: "Notifier l'avis", succes: "Avis défavorable notifié" },
};

function ModaleArbitrage({ demande, action, onClose }: { demande: DemandeConge; action: Action; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [motif, setMotif] = useState("");
  const [manquant, setManquant] = useState(false);
  const titre = TITRES[action];
  const envoi = useMutation({
    mutationFn: () => api<DemandeConge>(`/api/v1/conges/${demande.id}/instruction/`, { method: "POST", body: JSON.stringify({ action, motif: motif.trim() }) }),
    onSuccess: async () => {
      await client.invalidateQueries();
      feedback.toast(titre.succes, `${demande.agent.nom_complet} · ${demande.nature}`);
      onClose();
    },
  });
  const erreur = manquant ? "Le motif est obligatoire." : envoi.error instanceof ApiError ? envoi.error.message : envoi.isError ? "L'arbitrage n'a pas été enregistré." : undefined;
  return (
    <Modale
      titre={titre.titre}
      sousTitre={`${demande.agent.nom_complet} · ${demande.nature}, du ${jour(demande.debut)} au ${jour(demande.fin)}`}
      icone={titre.icone}
      ton={action === "signer" ? "neutre" : action === "rejeter" ? "danger" : "attention"}
      taille="md"
      onClose={onClose}
      onSubmit={() => (action !== "signer" && !motif.trim() ? setManquant(true) : envoi.mutate())}
      enCours={envoi.isPending}
      erreur={erreur}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={envoi.isPending}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={envoi.isPending}>
            {envoi.isPending ? <span className="material-symbols-outlined text-lg motion-spin" aria-hidden="true">progress_activity</span> : null}
            {titre.bouton}
          </button>
        </>
      }
    >
      {action === "signer" ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Votre signature électronique est apposée sur l'arrêté. Intérim : {demande.interim} ({demande.interim_detail}).
        </p>
      ) : (
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
            Motif <span className="text-error">*</span>
          </span>
          <textarea
            className="w-full p-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
            value={motif}
            placeholder={action === "decaler" ? "Indiquez la période proposée et la raison (quorum, continuité du service…)." : "Indiquez la raison du rejet."}
            onChange={(event) => {
              setMotif(event.target.value);
              setManquant(false);
            }}
          />
        </label>
      )}
    </Modale>
  );
}
