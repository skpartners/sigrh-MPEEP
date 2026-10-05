import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { Pagination, usePagination } from "../../ui/Pagination";
import { AppChrome } from "../AppChrome";
import { Icone } from "../../ui/Icone";

type Statut = "visite" | "quittance" | "arrete" | "transmis" | "notifie";
type Dossier = {
  id: number;
  automatique: boolean;
  motif: { id: number; code: string; libelle: string } | null;
  agent: AgentBrief & { fonction: string };
  anciennete: string;
  date_limite: string | null;
  age_limite: number;
  age_statutaire: number;
  decret: string;
  date_decret: string | null;
  date_cessation: string | null;
  idr: number;
  pension: number;
  statut: Statut;
  statut_libelle: string;
  statut_detail: string;
  entree_service: string | null;
};
type Tableau = {
  exercice: number;
  effectif: number;
  indicateurs: { departs: number; departs_cadres: number; postes: number; binomes: number; idr: number; idr_liquidees: number };
  pyramide: { code: string; libelle: string; effectif: number; part: number; hommes: number; femmes: number; cadres: number }[];
  dossiers: Dossier[];
  postes: { id: number; intitule: string; titulaire: AgentBrief; depart: string; successeur: string; progression: number; commentaire: string }[];
  motifs: { id: number; code: string; libelle: string; automatique: boolean }[];
  statuts: { code: Statut; libelle: string }[];
  agents: { matricule: string; nom_complet: string; organisme_sigle: string }[];
  entete: { fil?: string[]; titre?: string; chapeau?: string };
  passerelle: { reference?: string; modele?: string; etat?: string };
  cgrae: { taux?: number; detail?: string };
  renouvellement: { texte?: string };
  accompagnement: { titre?: string; texte?: string; actions?: { id: number; titre: string; detail: string; quand: string; valeur: string }[] };
  distinctions: { id: number; rang: string; titre: string; detail: string; etat: string }[];
};

type AgentChoix = Tableau["agents"][number];
type Poste = Tableau["postes"][number];
type Motif = Tableau["motifs"][number];
type Distinction = Tableau["distinctions"][number];
type ActionRetraite = NonNullable<Tableau["accompagnement"]["actions"]>[number];
type Panneau =
  | { genre: "cadre" }
  | { genre: "dossier"; dossier?: Dossier }
  | { genre: "poste"; poste?: Poste }
  | { genre: "motif"; motif?: Motif }
  | { genre: "distinction"; distinction?: Distinction }
  | { genre: "action"; action?: ActionRetraite };

const ROUTE = "/api/v1/carrieres/fin-de-carriere/";
const ICONE = "p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const PASTILLE: Record<Statut, string> = {
  visite: "bg-secondary-fixed text-on-secondary-fixed",
  quittance: "bg-surface-container-high text-on-surface",
  arrete: "bg-primary/10 text-primary",
  transmis: "bg-primary-fixed text-on-primary-fixed",
  notifie: "bg-primary-fixed text-on-primary-fixed",
};
const COULEUR_TRANCHE: Record<string, { texte: string; barre: string }> = {
  "60+": { texte: "text-secondary", barre: "bg-secondary-container" },
  "55-59": { texte: "text-primary", barre: "bg-primary" },
  "40-54": { texte: "text-on-surface", barre: "bg-surface-tint" },
  "-40": { texte: "text-on-surface", barre: "bg-surface-container-highest" },
};

function dateLongue(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${String(jour).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function moisAnnee(iso: string): string {
  const [annee, mois] = iso.split("-").map(Number);
  return `${MOIS_COURTS[mois - 1]} ${annee}`;
}

function fcfa(valeur: number): string {
  return valeur.toLocaleString("fr-FR");
}

/** Fin de carrière : départs, relève des postes sensibles, pyramide des âges et liquidation des droits. */
export function FinCarriereScreen() {
  const tableau = useQuery({ queryKey: ["carrieres-fin-carriere"], queryFn: () => api<Tableau>("/api/v1/carrieres/fin-de-carriere/") });
  const [entite, setEntite] = useState("");
  const [statut, setStatut] = useState("");
  const [panneau, setPanneau] = useState<Panneau | null>(null);
  const retirer = useRetrait();
  const donnees = tableau.data;
  const indicateurs = donnees?.indicateurs;
  const dossiers = donnees?.dossiers ?? [];
  const filtres = useMemo(() => dossiers.filter((item) => (!entite || item.agent.organisme_sigle === entite) && (!statut || item.statut === statut)), [dossiers, entite, statut]);
  const pageDossiers = usePagination(filtres, `${entite}|${statut}`);
  const entites = [...new Set(dossiers.map((item) => item.agent.organisme_sigle))].sort();
  const statuts = [...new Map(dossiers.map((item) => [item.statut, item.statut_libelle])).entries()];
  const plusGrande = Math.max(1, ...(donnees?.pyramide ?? []).map((tranche) => tranche.effectif));

  return (
    <AppChrome>
      <div className="flex flex-col w-full">
        <div className="px-6 lg:px-8 py-6 space-y-8 mx-auto w-full">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <nav className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {(donnees?.entete.fil ?? []).map((etape, index, fil) => (
                  <Fragment key={etape}>
                    {index > 0 ? <Icone nom="chevron_right" className="text-xs" /> : null}
                    <span className={index === fil.length - 1 ? "text-primary font-bold" : undefined}>{etape}</span>
                  </Fragment>
                ))}
              </nav>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{donnees?.entete.titre}</h1>
                {donnees?.exercice ? (
                  <span className="px-2.5 py-0.5 rounded bg-primary-container text-on-primary font-label-sm text-label-sm uppercase font-semibold tracking-wider">
                    Exercice {donnees.exercice}
                  </span>
                ) : null}
                {donnees?.passerelle.reference ? (
                  <span className="px-2.5 py-0.5 rounded bg-surface-container text-primary font-code-num text-code-num font-bold">{donnees.passerelle.reference}</span>
                ) : null}
              </div>
              {donnees?.entete.chapeau ? (
                <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">{donnees.entete.chapeau}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button className="inline-flex items-center gap-2 px-3 py-2 rounded bg-surface-container-lowest text-primary font-label-md text-label-md font-semibold shadow-sm hover:bg-surface-container" type="button" onClick={() => setPanneau({ genre: "cadre" })}>
                <Icone nom="edit" className="text-lg" />
                Modifier le cadre
              </button>
            </div>
          </div>
          {/* Indicateurs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Indicateur titre="Départs sous douze mois" icone="event_busy" liseret="bg-primary" teinte="bg-surface-container-low text-primary" valeur={indicateurs ? String(indicateurs.departs) : "—"} unite="agents" gauche="Limite d'âge atteinte" droite={indicateurs ? `dont ${indicateurs.departs_cadres} cadre${indicateurs.departs_cadres > 1 ? "s" : ""} A` : ""} />
            <Indicateur titre="Postes clés & sensibles" titreCouleur="text-secondary" icone="crisis_alert" liseret="bg-secondary-container" teinte="bg-secondary-fixed text-on-secondary-fixed" valeur={indicateurs ? String(indicateurs.postes) : "—"} valeurCouleur="text-secondary" unite="postes à relever" gauche="Relève à sécuriser" droite={indicateurs ? `${indicateurs.binomes} binôme${indicateurs.binomes > 1 ? "s" : ""} formé${indicateurs.binomes > 1 ? "s" : ""}` : ""} />
            <Indicateur titre="IDR engagées" icone="receipt_long" liseret="bg-tertiary" teinte="bg-surface-container text-tertiary" valeur={indicateurs ? fcfa(indicateurs.idr) : "—"} unite="FCFA" petite gauche="Ordonnancement DAAF" droite={indicateurs ? `${indicateurs.idr_liquidees} % liquidées` : ""} />
            <Indicateur titre="Continuité de solde CGRAE" icone="task_alt" liseret="bg-primary" teinte="bg-surface-container-low text-primary" valeur={donnees?.cgrae.taux != null ? `${donnees.cgrae.taux}%` : "—"} valeurCouleur="text-primary" unite="taux d'arrimage" gauche={donnees?.cgrae.detail ?? ""} droite="" />
          </div>

          {/* Pyramide et relève */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-surface-container-lowest p-6 rounded shadow-sm flex flex-col justify-between">
              <div className="pb-4">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Pyramide des âges & départs prévisionnels</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Répartition par âge des {donnees?.effectif ?? "…"} agents suivis, calculée sur leurs dates de naissance</p>
              </div>
              <div className="py-4 space-y-3.5">
                {tableau.isPending
                  ? [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-8 w-full" />)
                  : (donnees?.pyramide ?? []).map((tranche) => {
                      const couleur = COULEUR_TRANCHE[tranche.code] ?? COULEUR_TRANCHE["-40"];
                      return (
                        <div key={tranche.code}>
                          <div className="flex justify-between items-center gap-3 mb-1 text-label-sm font-label-sm">
                            <span className={`font-bold flex items-center gap-1.5 ${couleur.texte}`}>
                              <span className={`w-2 h-2 rounded-full ${couleur.barre}`} />
                              {tranche.libelle}
                            </span>
                            <span className={`font-code-num text-code-num font-bold whitespace-nowrap ${couleur.texte}`}>
                              {tranche.effectif} agent{tranche.effectif > 1 ? "s" : ""} • {tranche.part.toLocaleString("fr-FR")} %
                            </span>
                          </div>
                          <div className="w-full h-3 bg-surface-container rounded-full overflow-hidden flex">
                            <div className={`${couleur.barre} h-full rounded-full transition-all duration-500`} style={{ width: `${(tranche.effectif / plusGrande) * 100}%` }} />
                          </div>
                          <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant mt-1">
                            <span>Hommes : {tranche.hommes} • Femmes : {tranche.femmes}</span>
                            <span>Cadres A : {tranche.cadres}</span>
                          </div>
                        </div>
                      );
                    })}
              </div>
              {donnees?.renouvellement.texte ? (
                <div className="pt-4 bg-surface-container-low p-3 rounded flex items-center gap-2 text-body-sm font-body-sm text-on-surface">
                  <Icone nom="crisis_alert" className="text-secondary text-lg" />
                  <span className="font-medium">
                    Ratio de renouvellement : <strong>{donnees.renouvellement.texte}</strong>
                  </span>
                </div>
              ) : null}
            </div>
            <div className="lg:col-span-5 bg-surface-container-lowest p-6 rounded shadow-sm">
              <div className="flex items-center justify-between gap-2 pb-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Relève & compétences sensibles</h2>
                <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold" type="button" onClick={() => setPanneau({ genre: "poste" })}>
                  <Icone nom="add" className="text-sm" />
                  Ajouter
                </button>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Binômes de transmission des compétences avant le départ du titulaire.</p>
              <div className="space-y-3">
                {(donnees?.postes ?? []).map((poste) => {
                  const forme = Boolean(poste.successeur);
                  return (
                    <div key={poste.id} className="p-3 bg-surface-container-low rounded flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-label-md text-label-md font-bold text-on-surface truncate">{poste.intitule}</span>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${forme ? "bg-primary" : "bg-secondary"}`} title={forme ? "Binôme formé" : "Successeur à désigner"} />
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          Titulaire : <span className="font-semibold text-on-surface">{poste.titulaire.nom_complet}</span> (départ : {moisAnnee(poste.depart)})
                        </p>
                        <p className={`font-label-sm text-label-sm mt-1 flex items-center gap-1 ${forme ? "text-primary" : "text-secondary"}`}>
                          <Icone nom={forme ? "groups" : "warning"} className="text-sm" />
                          {forme ? `Successeur : ${poste.successeur} (tutorat à ${poste.progression} %)` : poste.commentaire}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${forme ? "bg-primary-fixed text-on-primary-fixed" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
                          {forme ? "Conforme" : "Alerte RH"}
                        </span>
                        <span className="flex">
                          <button className={ICONE} type="button" aria-label={`Modifier ${poste.intitule}`} onClick={() => setPanneau({ genre: "poste", poste })}><Icone nom="edit" className="text-lg" /></button>
                          <button className={ICONE} type="button" aria-label={`Supprimer ${poste.intitule}`} onClick={() => void retirer(`${ROUTE}postes/${poste.id}/`, `Retirer le poste « ${poste.intitule} » ?`)}><Icone nom="delete" className="text-lg" /></button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Registre des départs */}
          <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden">
            <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Registre d'instruction des départs à la retraite</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-code-num text-code-num">{dossiers.length} dossiers actifs</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">L'admission à la retraite s'ouvre à la limite d'âge. Un report se fait par décret présidentiel. Les autres cessations se saisissent.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold" type="button" onClick={() => setPanneau({ genre: "dossier" })}>
                  <Icone nom="add" className="text-sm" />
                  Enregistrer une cessation
                </button>
                <select aria-label="Filtrer par établissement" className="px-3 py-1.5 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded border-0 focus:ring-1 focus:ring-primary cursor-pointer" value={entite} onChange={(event) => setEntite(event.target.value)}>
                  <option value="">Tous les établissements</option>
                  {entites.map((sigle) => (
                    <option key={sigle} value={sigle}>{sigle}</option>
                  ))}
                </select>
                <select aria-label="Filtrer par statut" className="px-3 py-1.5 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded border-0 focus:ring-1 focus:ring-primary cursor-pointer" value={statut} onChange={(event) => setStatut(event.target.value)}>
                  <option value="">Statut : tout afficher</option>
                  {statuts.map(([code, libelle]) => (
                    <option key={code} value={code}>{libelle}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                    <th className="py-3 px-6 font-bold">Agent & matricule</th>
                    <th className="py-3 px-4 font-bold">Société / direction</th>
                    <th className="py-3 px-4 font-bold">Grade & ancienneté</th>
                    <th className="py-3 px-4 font-bold">Date limite / âge</th>
                    <th className="py-3 px-4 font-bold">IDR & pension prov.</th>
                    <th className="py-3 px-4 font-bold" data-min="">Statut réglementaire</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                  {tableau.isPending ? (
                    <tr>
                      <td colSpan={7} className="py-4 px-6"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ) : filtres.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 px-6 text-on-surface-variant">{tableau.isError ? "Le registre n'a pas pu être chargé." : "Aucun dossier ne correspond à ces filtres."}</td>
                    </tr>
                  ) : (
                    pageDossiers.visibles.map((dossier) => (
                      <tr key={dossier.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-full shrink-0 bg-primary-fixed text-on-primary-fixed inline-flex items-center justify-center font-bold text-label-md" aria-hidden="true">{dossier.agent.initiales}</span>
                            <div className="min-w-0">
                              <p className="font-label-md text-label-md font-bold text-on-surface truncate">{dossier.agent.nom_complet}</p>
                              <span className="font-code-num text-code-num text-on-surface-variant">{dossier.agent.matricule}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-medium text-on-surface block">{dossier.agent.organisme_sigle}</span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">{dossier.agent.fonction || dossier.agent.structure}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="px-2 py-0.5 rounded bg-surface-container text-primary font-code-num text-code-num font-bold">Grade {dossier.agent.grade}</span>
                          <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">{dossier.anciennete}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-semibold text-on-surface font-code-num text-code-num block">{dossier.date_limite ? dateLongue(dossier.date_limite) : "—"}</span>
                          {dossier.automatique ? (
                            <span className="font-label-sm text-label-sm text-secondary font-bold">{dossier.decret ? `Report · décret ${dossier.decret}` : `Limite ${dossier.age_limite} ans révolus`}</span>
                          ) : (
                            <span className="font-label-sm text-label-sm text-secondary font-bold">{dossier.motif?.libelle}</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-bold text-on-surface font-code-num text-code-num block">{fcfa(dossier.idr)} FCFA</span>
                          <span className="font-label-sm text-label-sm text-primary">Pension : {fcfa(dossier.pension)} F/mois</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-label-sm text-label-sm font-bold ${PASTILLE[dossier.statut]}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                            {dossier.statut_libelle}
                          </span>
                          <span className="block font-label-sm text-label-sm text-on-surface-variant mt-1">{dossier.statut_detail}</span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button className={ICONE} type="button" aria-label={`Modifier le dossier de ${dossier.agent.nom_complet}`} onClick={() => setPanneau({ genre: "dossier", dossier })}><Icone nom="edit" className="text-lg" /></button>
                          {dossier.automatique ? null : (
                            <button className={ICONE} type="button" aria-label={`Supprimer le dossier de ${dossier.agent.nom_complet}`} onClick={() => void retirer(`${ROUTE}dossiers/${dossier.id}/`, `Retirer le dossier de ${dossier.agent.nom_complet} ?`)}><Icone nom="delete" className="text-lg" /></button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={pageDossiers.page} pages={pageDossiers.pages} total={pageDossiers.total} aller={pageDossiers.aller} libelle="dossier" />
            <div className="p-4 bg-surface-container-low/70 flex items-center gap-2 text-body-sm font-body-sm text-on-surface-variant">
              <Icone nom="verified_user" className="text-primary text-base" />
              <span>Liquidation conforme au Code général de la fonction publique et aux conventions des entreprises publiques.</span>
            </div>
          </div>

          {/* Accompagnement et distinctions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {donnees ? (
              <div className="bg-surface-container-lowest p-6 rounded shadow-sm relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-primary/5 rounded-full pointer-events-none" />
                <div className="flex items-center gap-2 pb-3">
                  <span className="p-2 rounded bg-primary/10 text-primary">
                    <Icone nom="volunteer_activism" className="text-lg" />
                  </span>
                  <div>
                    <span className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">SD Action sociale</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">{donnees.accompagnement.titre}</h3>
                    <button className="mt-1 inline-flex items-center gap-1 text-primary font-label-sm text-label-sm font-semibold" type="button" onClick={() => setPanneau({ genre: "action" })}>
                      <Icone nom="add" className="text-sm" />
                      Ajouter une action
                    </button>
                  </div>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 leading-relaxed">{donnees.accompagnement.texte}</p>
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(donnees.accompagnement.actions ?? []).map((action) => (
                    <div key={action.id} className="p-3 bg-surface-container-low rounded">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-bold block">{action.titre}</span>
                        <span className="flex shrink-0">
                          <button className={ICONE} type="button" aria-label={`Modifier ${action.titre}`} onClick={() => setPanneau({ genre: "action", action })}><Icone nom="edit" className="text-base" /></button>
                          <button className={ICONE} type="button" aria-label={`Supprimer ${action.titre}`} onClick={() => void retirer(`${ROUTE}actions/${action.id}/`, `Retirer l'action « ${action.titre} » ?`)}><Icone nom="delete" className="text-base" /></button>
                        </span>
                      </div>
                      <p className="font-label-md text-label-md text-on-surface font-semibold mt-1">{action.detail}</p>
                      <div className="flex items-center justify-between gap-2 text-label-sm font-label-sm mt-2 text-primary">
                        <span>{action.quand}</span>
                        <span className="font-bold">{action.valeur}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {donnees ? (
              <div className="bg-surface-container-lowest p-6 rounded shadow-sm relative overflow-hidden">
                <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-secondary-container/5 rounded-full pointer-events-none" />
                <div className="flex items-center gap-2 pb-3">
                  <span className="p-2 rounded bg-secondary-fixed text-on-secondary-fixed">
                    <Icone nom="military_tech" className="text-lg" />
                  </span>
                  <div>
                    <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">Reconnaissance républicaine</span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">Médailles d'honneur & décorations</h3>
                    <button className="mt-1 inline-flex items-center gap-1 text-secondary font-label-sm text-label-sm font-semibold" type="button" onClick={() => setPanneau({ genre: "distinction" })}>
                      <Icone nom="add" className="text-sm" />
                      Ajouter
                    </button>
                  </div>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 leading-relaxed">Requêtes de décoration pour loyaux services, instruites avant la radiation des cadres.</p>
                <div className="mt-5 space-y-2.5">
                  {donnees.distinctions.map((distinction, index) => (
                    <div key={distinction.id} className="p-2.5 bg-surface-container-low rounded flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded flex items-center justify-center font-bold text-label-sm font-label-sm shrink-0 ${index === 0 ? "bg-secondary-container/20 text-secondary" : "bg-surface-container text-tertiary"}`}>{distinction.rang}</span>
                        <div>
                          <span className="font-label-md text-label-md font-bold text-on-surface block">{distinction.titre}</span>
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{distinction.detail}</span>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 shrink-0">
                        <span className={`px-2 py-0.5 rounded font-code-num text-code-num font-bold whitespace-nowrap ${index === 0 ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant"}`}>{distinction.etat}</span>
                        <button className={ICONE} type="button" aria-label={`Modifier ${distinction.titre}`} onClick={() => setPanneau({ genre: "distinction", distinction })}><Icone nom="edit" className="text-base" /></button>
                        <button className={ICONE} type="button" aria-label={`Supprimer ${distinction.titre}`} onClick={() => void retirer(`${ROUTE}distinctions/${distinction.id}/`, `Retirer « ${distinction.titre} » ?`)}><Icone nom="delete" className="text-base" /></button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Motifs de cessation */}
          <div className="bg-surface-container-lowest p-6 rounded shadow-sm">
            <div className="pb-4">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded bg-surface-container-low text-tertiary">
                  <Icone nom="gavel" className="text-base" />
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Motifs de cessation d'activité</h3>
                <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold" type="button" onClick={() => setPanneau({ genre: "motif" })}>
                  <Icone nom="add" className="text-sm" />
                  Ajouter
                </button>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">L'admission à la retraite est automatique. Les autres motifs se créent, se modifient et se retirent.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {(donnees?.motifs ?? []).map((motif) => (
                <div key={motif.id} className="p-4 bg-surface-container-low rounded flex items-start justify-between gap-2">
                  <h4 className="font-label-lg text-label-lg font-bold text-on-surface">{motif.libelle}</h4>
                  {motif.automatique ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold shrink-0">
                      <Icone nom="lock" className="text-sm" />
                      Automatique
                    </span>
                  ) : (
                    <span className="flex shrink-0">
                      <button className={ICONE} type="button" aria-label={`Modifier ${motif.libelle}`} onClick={() => setPanneau({ genre: "motif", motif })}><Icone nom="edit" className="text-lg" /></button>
                      <button className={ICONE} type="button" aria-label={`Supprimer ${motif.libelle}`} onClick={() => void retirer(`${ROUTE}motifs/${motif.id}/`, `Retirer le motif « ${motif.libelle} » ?`)}><Icone nom="delete" className="text-lg" /></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {panneau && donnees ? (
        <Editeur panneau={panneau} donnees={donnees} onClose={() => setPanneau(null)} />
      ) : null}
    </AppChrome>
  );
}

function Indicateur({ titre, titreCouleur = "text-on-surface-variant", icone, liseret, teinte, valeur, valeurCouleur = "text-on-surface", unite, petite = false, gauche, droite }: {
  titre: string; titreCouleur?: string; icone: string; liseret: string; teinte: string; valeur: string; valeurCouleur?: string; unite: string; petite?: boolean; gauche: string; droite: string;
}) {
  return (
    <div className="bg-surface-container-lowest p-5 rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${liseret}`} />
      <div className="flex items-start justify-between gap-2">
        <span className={`font-label-sm text-label-sm font-bold uppercase tracking-wider ${titreCouleur}`}>{titre}</span>
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${teinte}`}>
          <Icone nom={icone} className="text-lg" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className={`${petite ? "font-headline-md text-headline-md font-code-num" : "font-headline-xl text-headline-xl"} font-bold ${valeurCouleur}`}>{valeur}</span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{unite}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
        <span className="text-primary font-semibold">{gauche}</span>
        <span className="font-code-num text-code-num">{droite}</span>
      </div>
    </div>
  );
}

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";

function useRetrait() {
  const client = useQueryClient();
  const feedback = useFeedback();
  return async (chemin: string, titre: string) => {
    if (!(await feedback.confirm(titre, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(chemin, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
    }, { success: { title: "Enregistrement retiré" }, error: "La suppression n'a pas abouti." });
  };
}

function erreurDe(error: unknown, repli: string): string | undefined {
  if (error instanceof ApiError) return error.message;
  if (error) return repli;
  return undefined;
}

function Editeur({ panneau, donnees, onClose }: { panneau: Panneau; donnees: Tableau; onClose: () => void }) {
  if (panneau.genre === "cadre") return <FormulaireCadre donnees={donnees} onClose={onClose} />;
  if (panneau.genre === "dossier") return <FormulaireDossier dossier={panneau.dossier} agents={donnees.agents} occupes={donnees.dossiers.map((item) => item.agent.matricule)} statuts={donnees.statuts} motifs={donnees.motifs} onClose={onClose} />;
  if (panneau.genre === "poste") return <FormulairePoste poste={panneau.poste} agents={donnees.agents} onClose={onClose} />;
  if (panneau.genre === "motif") return <FormulaireMotif motif={panneau.motif} onClose={onClose} />;
  if (panneau.genre === "distinction") return <FormulaireDistinction distinction={panneau.distinction} onClose={onClose} />;
  return <FormulaireAction action={panneau.action} onClose={onClose} />;
}

function FormulaireCadre({ donnees, onClose }: { donnees: Tableau; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const fil = donnees.entete.fil ?? [];
  const [saisie, setSaisie] = useState({
    fil: [fil[0] ?? "", fil[1] ?? "", fil[2] ?? ""],
    titre: donnees.entete.titre ?? "",
    chapeau: donnees.entete.chapeau ?? "",
    reference: donnees.passerelle.modele ?? donnees.passerelle.reference ?? "",
    taux_cgrae: donnees.cgrae.taux != null ? String(donnees.cgrae.taux) : "",
    detail_cgrae: donnees.cgrae.detail ?? "",
    renouvellement: donnees.renouvellement.texte ?? "",
    programme_titre: donnees.accompagnement.titre ?? "",
    programme_texte: donnees.accompagnement.texte ?? "",
  });
  const envoi = useMutation({
    mutationFn: () => api(`${ROUTE}pilotage/`, { method: "PATCH", body: JSON.stringify({ ...saisie, fil: saisie.fil.map((etape) => etape.trim()).filter(Boolean), taux_cgrae: Number(saisie.taux_cgrae) }) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast("Cadre enregistré");
      onClose();
    },
  });
  const champ = (cle: Exclude<keyof typeof saisie, "fil">) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre="Cadre de la page" sousTitre="En-tête, passerelle, taux CGRAE et programme d'accompagnement." icone="edit" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "L'enregistrement n'a pas abouti.")}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {saisie.fil.map((etape, index) => (
            <label key={index} className="block">
              <span className={LIBELLE}>Fil d'Ariane {index + 1}</span>
              <input className={CHAMP} value={etape} onChange={(event) => setSaisie({ ...saisie, fil: saisie.fil.map((item, i) => i === index ? event.target.value : item) })} />
            </label>
          ))}
        </div>
        <label className="block"><span className={LIBELLE}>Titre <span className="text-error">*</span></span><input className={CHAMP} required value={saisie.titre} onChange={champ("titre")} /></label>
        <label className="block"><span className={LIBELLE}>Texte d'introduction</span><textarea className={`${CHAMP} h-auto py-2`} rows={3} value={saisie.chapeau} onChange={champ("chapeau")} /></label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className={LIBELLE}>Référence de la passerelle</span><input className={CHAMP} value={saisie.reference} onChange={champ("reference")} /></label>
          <label className="block"><span className={LIBELLE}>Taux CGRAE (%)</span><input className={CHAMP} required type="number" min={0} max={100} step="0.1" value={saisie.taux_cgrae} onChange={champ("taux_cgrae")} /></label>
          <label className="block"><span className={LIBELLE}>Détail CGRAE</span><input className={CHAMP} value={saisie.detail_cgrae} onChange={champ("detail_cgrae")} /></label>
        </div>
        <label className="block"><span className={LIBELLE}>Ratio de renouvellement</span><input className={CHAMP} value={saisie.renouvellement} onChange={champ("renouvellement")} /></label>
        <label className="block"><span className={LIBELLE}>Programme d'accompagnement</span><input className={CHAMP} value={saisie.programme_titre} onChange={champ("programme_titre")} /></label>
        <label className="block"><span className={LIBELLE}>Texte du programme</span><textarea className={`${CHAMP} h-auto py-2`} rows={3} value={saisie.programme_texte} onChange={champ("programme_texte")} /></label>
      </div>
    </Modale>
  );
}

function ListeAgents({ agents, value, onChange, requis = false, disabled = false }: { agents: AgentChoix[]; value: string; onChange: (valeur: string) => void; requis?: boolean; disabled?: boolean }) {
  return (
    <select className={CHAMP} required={requis} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{requis ? "Choisir un agent…" : "Aucun"}</option>
      {agents.map((agent) => (
        <option key={agent.matricule} value={agent.matricule}>{agent.nom_complet} · {agent.organisme_sigle}</option>
      ))}
    </select>
  );
}

function FormulaireDossier({ dossier, agents, occupes, statuts, motifs, onClose }: { dossier?: Dossier; agents: AgentChoix[]; occupes: string[]; statuts: Tableau["statuts"]; motifs: Motif[]; onClose: () => void }) {
  if (dossier?.automatique) return <FormulaireAdmission dossier={dossier} statuts={statuts} onClose={onClose} />;
  return <FormulaireCessation dossier={dossier} agents={agents} occupes={occupes} motifs={motifs.filter((item) => !item.automatique)} onClose={onClose} />;
}

function FormulaireAdmission({ dossier, statuts, onClose }: { dossier: Dossier; statuts: Tableau["statuts"]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    entree_service: dossier.entree_service ?? "",
    idr: String(dossier.idr),
    pension: String(dossier.pension),
    statut: dossier.statut,
    statut_detail: dossier.statut_detail,
    age: "",
    decret: "",
    date_decret: "",
  });
  const envoi = useMutation({
    mutationFn: () => {
      const corps: Record<string, unknown> = {
        entree_service: saisie.entree_service,
        idr: Number(saisie.idr),
        pension: Number(saisie.pension),
        statut: saisie.statut,
        statut_detail: saisie.statut_detail,
      };
      if (saisie.age) {
        corps.age_limite = Number(saisie.age);
        corps.decret = saisie.decret;
        corps.date_decret = saisie.date_decret;
      }
      return api(`${ROUTE}dossiers/${dossier.id}/`, { method: "PATCH", body: JSON.stringify(corps) });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast("Dossier mis à jour");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre="Dossier d'admission à la retraite" sousTitre={`${dossier.agent.nom_complet} · limite statutaire ${dossier.age_statutaire} ans`} icone="elderly" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} libelleValider="Enregistrer" enCours={envoi.isPending} erreur={erreurDe(envoi.error, "Le dossier n'a pas été enregistré.")}>
      <div className="space-y-4">
        <p className="font-body-sm text-body-sm text-on-surface-variant">Âge retenu : {dossier.age_limite} ans{dossier.decret ? ` · décret ${dossier.decret}${dossier.date_decret ? ` du ${dateLongue(dossier.date_decret)}` : ""}` : ""}. L'admission est automatique. Pour repousser la limite, citez le décret présidentiel.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className={LIBELLE}>Entrée en service</span><input className={CHAMP} type="date" value={saisie.entree_service} onChange={champ("entree_service")} /></label>
          <label className="block"><span className={LIBELLE}>IDR (FCFA)</span><input className={CHAMP} required type="number" min={0} value={saisie.idr} onChange={champ("idr")} /></label>
          <label className="block"><span className={LIBELLE}>Pension mensuelle (FCFA)</span><input className={CHAMP} required type="number" min={0} value={saisie.pension} onChange={champ("pension")} /></label>
          <label className="block">
            <span className={LIBELLE}>Statut</span>
            <select className={CHAMP} value={saisie.statut} onChange={champ("statut")}>
              {statuts.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
            </select>
          </label>
        </div>
        <label className="block"><span className={LIBELLE}>Précision</span><input className={CHAMP} maxLength={160} value={saisie.statut_detail} onChange={champ("statut_detail")} /></label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block"><span className={LIBELLE}>Nouvel âge (report)</span><input className={CHAMP} type="number" min={dossier.age_statutaire + 1} max={75} value={saisie.age} onChange={champ("age")} placeholder={`${dossier.age_statutaire + 1} à 75`} /></label>
          <label className="block"><span className={LIBELLE}>Décret présidentiel</span><input className={CHAMP} maxLength={80} value={saisie.decret} onChange={champ("decret")} placeholder="2026-000/PR" required={Boolean(saisie.age)} /></label>
          <label className="block"><span className={LIBELLE}>Date du décret</span><input className={CHAMP} type="date" value={saisie.date_decret} onChange={champ("date_decret")} required={Boolean(saisie.age)} /></label>
        </div>
      </div>
    </Modale>
  );
}

function FormulaireCessation({ dossier, agents, occupes, motifs, onClose }: { dossier?: Dossier; agents: AgentChoix[]; occupes: string[]; motifs: Motif[]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    motif: String(dossier?.motif?.id ?? motifs[0]?.id ?? ""),
    matricule: dossier?.agent.matricule ?? "",
    date_cessation: dossier?.date_cessation ?? "",
    statut_detail: dossier?.statut_detail ?? "",
  });
  const envoi = useMutation({
    mutationFn: () => api(dossier ? `${ROUTE}dossiers/${dossier.id}/` : `${ROUTE}dossiers/`, {
      method: dossier ? "PATCH" : "POST",
      body: JSON.stringify({ ...saisie, motif: Number(saisie.motif) }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast(dossier ? "Cessation mise à jour" : "Cessation enregistrée");
      onClose();
    },
  });
  const choix = agents.filter((agent) => agent.matricule === saisie.matricule || !occupes.includes(agent.matricule));
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre={dossier ? "Modifier la cessation" : "Enregistrer une cessation"} sousTitre="Démission, licenciement, révocation, décès et les autres motifs saisis." icone="gavel" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} libelleValider="Enregistrer" enCours={envoi.isPending} erreur={erreurDe(envoi.error, "La cessation n'a pas été enregistrée.")}>
      <div className="space-y-4">
        <label className="block">
          <span className={LIBELLE}>Motif <span className="text-error">*</span></span>
          <select className={CHAMP} required value={saisie.motif} onChange={champ("motif")}>
            {motifs.map((item) => <option key={item.id} value={item.id}>{item.libelle}</option>)}
          </select>
        </label>
        <label className="block"><span className={LIBELLE}>Agent <span className="text-error">*</span></span><ListeAgents agents={choix} value={saisie.matricule} onChange={(valeur) => setSaisie({ ...saisie, matricule: valeur })} requis disabled={Boolean(dossier)} /></label>
        <label className="block"><span className={LIBELLE}>Date d'effet <span className="text-error">*</span></span><input className={CHAMP} required type="date" value={saisie.date_cessation} onChange={champ("date_cessation")} /></label>
        <label className="block"><span className={LIBELLE}>Précision</span><input className={CHAMP} maxLength={160} value={saisie.statut_detail} onChange={champ("statut_detail")} /></label>
      </div>
    </Modale>
  );
}

function FormulairePoste({ poste, agents, onClose }: { poste?: Poste; agents: AgentChoix[]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    intitule: poste?.intitule ?? "",
    matricule: poste?.titulaire.matricule ?? "",
    depart: poste?.depart ?? "",
    successeur: agents.find((agent) => agent.nom_complet === poste?.successeur)?.matricule ?? "",
    progression: String(poste?.progression ?? 0),
    commentaire: poste?.commentaire ?? "",
  });
  const envoi = useMutation({
    mutationFn: () => {
      const corps: Record<string, unknown> = { intitule: saisie.intitule, matricule: saisie.matricule, depart: saisie.depart, progression: Number(saisie.progression), commentaire: saisie.commentaire };
      if (saisie.successeur) corps.successeur = saisie.successeur;
      return api(poste ? `${ROUTE}postes/${poste.id}/` : `${ROUTE}postes/`, { method: poste ? "PATCH" : "POST", body: JSON.stringify(corps) });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast(poste ? "Poste mis à jour" : "Poste ajouté");
      onClose();
    },
  });
  const champ = (cle: "intitule" | "depart" | "progression" | "commentaire") => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre={poste ? "Modifier le poste" : "Ajouter un poste sensible"} sousTitre="Le titulaire et le successeur sont des agents du système." icone="crisis_alert" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "Le poste n'a pas été enregistré.")}>
      <div className="space-y-4">
        <label className="block"><span className={LIBELLE}>Intitulé <span className="text-error">*</span></span><input className={CHAMP} required maxLength={160} value={saisie.intitule} onChange={champ("intitule")} /></label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className={LIBELLE}>Titulaire <span className="text-error">*</span></span><ListeAgents agents={agents} value={saisie.matricule} onChange={(valeur) => setSaisie({ ...saisie, matricule: valeur, successeur: valeur === saisie.successeur ? "" : saisie.successeur })} requis /></label>
          <label className="block"><span className={LIBELLE}>Départ <span className="text-error">*</span></span><input className={CHAMP} required type="date" value={saisie.depart} onChange={champ("depart")} /></label>
          <label className="block"><span className={LIBELLE}>Successeur</span><ListeAgents agents={agents.filter((agent) => agent.matricule !== saisie.matricule)} value={saisie.successeur} onChange={(valeur) => setSaisie({ ...saisie, successeur: valeur })} /></label>
          <label className="block"><span className={LIBELLE}>Tutorat (%)</span><input className={CHAMP} required type="number" min={0} max={100} value={saisie.progression} onChange={champ("progression")} /></label>
        </div>
        <label className="block"><span className={LIBELLE}>Commentaire</span><input className={CHAMP} maxLength={200} value={saisie.commentaire} onChange={champ("commentaire")} /></label>
      </div>
    </Modale>
  );
}

function FormulaireMotif({ motif, onClose }: { motif?: Motif; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [libelle, setLibelle] = useState(motif?.libelle ?? "");
  const envoi = useMutation({
    mutationFn: () => api(motif ? `${ROUTE}motifs/${motif.id}/` : `${ROUTE}motifs/`, { method: motif ? "PATCH" : "POST", body: JSON.stringify({ libelle }) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast(motif ? "Motif mis à jour" : "Motif ajouté");
      onClose();
    },
  });
  return (
    <Modale titre={motif ? "Modifier le motif" : "Ajouter un motif"} icone="gavel" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "Le motif n'a pas été enregistré.")}>
      <label className="block"><span className={LIBELLE}>Libellé <span className="text-error">*</span></span><input className={CHAMP} required maxLength={80} value={libelle} onChange={(event) => setLibelle(event.target.value)} /></label>
    </Modale>
  );
}

function FormulaireDistinction({ distinction, onClose }: { distinction?: Distinction; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ rang: distinction?.rang ?? "", titre: distinction?.titre ?? "", detail: distinction?.detail ?? "", etat: distinction?.etat ?? "" });
  const envoi = useMutation({
    mutationFn: () => api(distinction ? `${ROUTE}distinctions/${distinction.id}/` : `${ROUTE}distinctions/`, { method: distinction ? "PATCH" : "POST", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast(distinction ? "Distinction mise à jour" : "Distinction ajoutée");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre={distinction ? "Modifier la distinction" : "Ajouter une distinction"} icone="military_tech" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "La distinction n'a pas été enregistrée.")}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className={LIBELLE}>Rang <span className="text-error">*</span></span><input className={CHAMP} required maxLength={12} value={saisie.rang} onChange={champ("rang")} placeholder="OR" /></label>
          <label className="block"><span className={LIBELLE}>État</span><input className={CHAMP} maxLength={80} value={saisie.etat} onChange={champ("etat")} /></label>
        </div>
        <label className="block"><span className={LIBELLE}>Intitulé <span className="text-error">*</span></span><input className={CHAMP} required maxLength={200} value={saisie.titre} onChange={champ("titre")} /></label>
        <label className="block"><span className={LIBELLE}>Détail</span><input className={CHAMP} maxLength={240} value={saisie.detail} onChange={champ("detail")} /></label>
      </div>
    </Modale>
  );
}

function FormulaireAction({ action, onClose }: { action?: ActionRetraite; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ titre: action?.titre ?? "", detail: action?.detail ?? "", quand: action?.quand ?? "", valeur: action?.valeur ?? "" });
  const envoi = useMutation({
    mutationFn: () => api(action ? `${ROUTE}actions/${action.id}/` : `${ROUTE}actions/`, { method: action ? "PATCH" : "POST", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast(action ? "Action mise à jour" : "Action ajoutée");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre={action ? "Modifier l'action" : "Ajouter une action"} icone="volunteer_activism" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "L'action n'a pas été enregistrée.")}>
      <div className="space-y-4">
        <label className="block"><span className={LIBELLE}>Intitulé <span className="text-error">*</span></span><input className={CHAMP} required maxLength={160} value={saisie.titre} onChange={champ("titre")} /></label>
        <label className="block"><span className={LIBELLE}>Détail</span><input className={CHAMP} maxLength={200} value={saisie.detail} onChange={champ("detail")} /></label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className={LIBELLE}>Échéance</span><input className={CHAMP} maxLength={120} value={saisie.quand} onChange={champ("quand")} /></label>
          <label className="block"><span className={LIBELLE}>Indicateur</span><input className={CHAMP} maxLength={80} value={saisie.valeur} onChange={champ("valeur")} /></label>
        </div>
      </div>
    </Modale>
  );
}
