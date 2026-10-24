import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { AppChrome } from "../AppChrome";
import { GestionCampagnes } from "./GestionCampagnes";
import { QuorumMensuel, type EtatQuorum } from "./QuorumMensuel";
import { SuiviConges, type ElementSuivi } from "./SuiviConges";
import { Icone } from "../../ui/Icone";

type Instruction = "pret_signature" | "approbation_auto" | "remplacement" | "conflit_quorum" | "signe" | "rejete" | "decale";
type DemandeConge = {
  id: number;
  agent: AgentBrief & { fonction: string };
  structure: string;
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
  campagne: { exercice: number; statut: string; statut_libelle: string; delai: string } | null;
  presence: { taux: number | null; seuil: number };
  quorum: EtatQuorum;
  /** Ce que les agents ont déposé depuis leur espace : demandes de congé et dates de la campagne, avec leur circuit. */
  suivi: ElementSuivi[];
  trimestres: { titre: string; departs: number; texte: string; etat: string; ton: Ton }[];
  mensuel: number[];
  quorums_non_rattaches: number;
  quorums: { code: string; quorum_propre: number | null; peut_modifier: boolean; entite: string; nom: string; effectif: number; absents: number; presence: number; seuil: number; detail: string }[];
  en_attente: number;
  instructions: { code: Instruction; libelle: string }[];
  demandes: DemandeConge[];
};
type Action = "signer" | "rejeter" | "decaler";

const MOIS_COURTS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function nombre(valeur: number): string {
  return valeur.toLocaleString("fr-FR");
}

function jour(iso: string): string {
  const [annee, mois, jourMois] = iso.split("-").map(Number);
  return `${String(jourMois).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

/** Congés : soldes de l'exercice, présence, quorums et arbitrage des demandes. */
export function CongesScreen() {
  const feedback = useFeedback();
  const registre = useQuery({ queryKey: ["carrieres-conges"], queryFn: () => api<Registre>("/api/v1/carrieres/conges/") });
  const [action, setAction] = useState<{ demande: DemandeConge; action: Action } | null>(null);
  const donnees = registre.data;
  const demandes = donnees?.demandes ?? [];
  const volume = donnees?.volume;
  const partConsommee = volume && volume.acquis ? Math.round((volume.consommes / volume.acquis) * 1000) / 10 : 0;
  const seuil = donnees?.presence.seuil;
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
        <div className="px-6 py-6 md:px-8 w-full mx-auto space-y-6">
          {/* Fil d'Ariane & titre */}
          <section className="bg-surface-container-lowest p-6 rounded-xl relative overflow-hidden flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <nav className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                <span>SD GESTION DES CARRIÈRES</span>
                <Icone nom="chevron_right" className="text-xs" />
                <span>TEMPS DE SERVICE & CONGÉS</span>
                <Icone nom="chevron_right" className="text-xs" />
                <span className="text-primary font-bold">PLANIFICATION ANNUELLE DES CONGÉS</span>
              </nav>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Supervision & planification des congés annuels</h1>
                <span className="px-2.5 py-0.5 rounded bg-primary-container text-on-primary font-label-sm text-label-sm uppercase font-semibold tracking-wider">
                  Exercice {exercice} actif
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-container text-on-surface font-label-md text-label-md transition-colors" type="button" onClick={() => void exporterEtat()}>
                <Icone nom="download" className="text-lg" />
                <span>Exporter l'état des congés</span>
              </button>
            </div>
          </section>

          <GestionCampagnes />

          {/* Ruban de campagne */}
          <div className="p-3 bg-surface-container-lowest rounded-lg shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${donnees?.campagne && donnees.campagne.statut !== "publiee" ? "bg-primary animate-pulse" : "bg-outline-variant"}`} />
                <span className="font-label-sm text-label-sm text-on-surface font-semibold uppercase tracking-wide">
                  {donnees?.campagne ? `Campagne ${donnees.campagne.exercice} · ${donnees.campagne.statut_libelle}` : "Aucune campagne de planification ouverte"}
                </span>
              </div>
              {presence != null ? (
                <>
                  <div className="hidden md:block w-px h-4 bg-outline-variant" />
                  <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
                    <Icone nom="verified_user" className="text-base text-secondary" />
                    <span>
                      Continuité de service : <strong className="text-primary font-bold">quorum global {presence.toFixed(1)} %</strong>
                    </span>
                  </div>
                </>
              ) : null}
            </div>
            {donnees?.campagne && donnees.campagne.statut !== "publiee" ? (
              <div className="flex items-center gap-2 text-on-surface-variant font-code-num text-code-num bg-surface-container-low px-2 py-1 rounded">
                <span>Délai : {jour(donnees.campagne.delai)}</span>
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
                {volume ? `${volume.alertes_reliquat} agent${volume.alertes_reliquat > 1 ? "s" : ""} concerné${volume.alertes_reliquat > 1 ? "s" : ""}` : ""}
              </div>
            </Carte>
            <Carte titre="Taux de présence de service" icone="groups" teinte="text-primary">
              <div className="font-headline-lg text-headline-lg text-primary tracking-tight">{presence != null ? `${presence.toFixed(1)} %` : "—"}</div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Quorum minimal : <strong>{seuil != null ? `≥ ${seuil} %` : "—"}</strong> (paramètre du ministère)
              </div>
              <Barre part={presence ?? 0} couleur="bg-primary" />
            </Carte>
          </div>

          <QuorumMensuel quorum={donnees?.quorum} />

          {/* Radar annuel des congés */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 p-5 bg-surface-container-lowest rounded-lg shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Radar annuel des congés & périodes critiques</h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {registre.isPending
                  ? [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-28 w-full" />)
                  : (donnees?.trimestres ?? []).map((trimestre) => (
                      <div key={trimestre.titre} className="p-3 rounded bg-surface-container-low flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-label-md text-label-md font-bold ${trimestre.ton === "attention" ? "text-secondary" : "text-on-surface"}`}>{trimestre.titre}</span>
                          <span className={`px-2 py-0.5 rounded font-code-num text-code-num font-semibold whitespace-nowrap ${trimestre.ton === "attention" ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-primary-fixed text-on-primary-fixed"}`}>
                            {trimestre.departs} agent{trimestre.departs > 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{trimestre.texte}</p>
                        <div className={`flex items-center gap-2 pt-1 font-label-sm text-label-sm font-medium ${trimestre.ton === "attention" ? "text-secondary" : "text-primary"}`}>
                          <Icone nom={trimestre.ton === "attention" ? "warning" : "check_circle"} className="text-sm" />
                          <span>{trimestre.etat}</span>
                        </div>
                      </div>
                    ))}
              </div>
              <div className="p-4 rounded bg-surface-container-lowest shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-on-surface">
                  <span className="font-label-md text-label-md font-semibold">Taux de présence mensuel (%)</span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-label-sm text-label-sm">
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-primary/70" aria-hidden="true" />
                      Conforme
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-attention" aria-hidden="true" />
                      Proche du seuil{seuil != null ? ` (${seuil} % à ${seuil + 5} %)` : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-error" aria-hidden="true" />
                      Sous le seuil{seuil != null ? ` (< ${seuil} %)` : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm bg-primary ring-2 ring-primary ring-offset-1" aria-hidden="true" />
                      Mois en cours
                    </span>
                  </div>
                </div>
                <div className="w-full h-36 flex items-end gap-1 sm:gap-2 pt-4 px-1 sm:px-2">
                  {(donnees?.mensuel ?? []).map((taux, index) => {
                    // Trois niveaux, trois couleurs franches : le mois en cours se repère à son contour et à son libellé.
                    const niveau = seuil == null ? "ok" : taux < seuil ? "sous" : taux < seuil + 5 ? "proche" : "ok";
                    const couleur = niveau === "sous" ? "bg-error" : niveau === "proche" ? "bg-attention" : "bg-primary/70";
                    const texte = niveau === "sous" ? "text-error" : niveau === "proche" ? "text-attention" : "text-on-surface-variant";
                    const courant = index === new Date().getMonth();
                    return (
                      <div key={MOIS_COURTS[index]} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
                        <span className={`hidden sm:inline font-code-num text-code-num ${niveau === "ok" ? (courant ? "text-primary font-bold" : "text-on-surface-variant") : `${texte} font-bold`}`}>{taux}%</span>
                        <div
                          className={`w-full rounded-t transition-[filter] duration-200 hover:brightness-110 ${couleur} ${courant ? "ring-2 ring-primary ring-offset-1" : ""}`}
                          style={{ height: `${taux}%` }}
                          title={`${MOIS_COURTS[index]} : ${taux} %${niveau === "sous" ? " (sous le seuil)" : niveau === "proche" ? " (proche du seuil)" : ""}`}
                        />
                        <span className={`font-label-sm text-label-sm ${courant ? "text-primary font-bold underline underline-offset-2" : niveau === "ok" ? "text-on-surface-variant" : `${texte} font-bold`}`}>{MOIS_COURTS[index]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Registre d'arbitrage */}
          <SuiviConges
            suivi={donnees?.suivi ?? []}
            arbitrage={demandes}
            enAttente={donnees?.en_attente ?? 0}
            chargement={registre.isPending}
            erreur={registre.isError}
            onAction={(demande, choix) => setAction({ demande: demande as DemandeConge, action: choix })}
          />

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
          <Icone nom={icone} className="text-lg" />
        </div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Barre({ part, couleur }: { part: number; couleur: string }) {
  return (
    <div className="mt-3 h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
      <div className={`motion-fill h-full ${couleur} rounded-full`} style={{ width: `${Math.min(part, 100)}%` }} />
    </div>
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
            {envoi.isPending ? <Icone nom="progress_activity" className="text-lg motion-spin" /> : null}
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
