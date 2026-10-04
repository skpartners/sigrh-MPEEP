import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { Dossier } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { Pagination, usePagination } from "../../ui/Pagination";
import { CLE_FORMATION, type TableauFormation } from "../formation/types";
import { CircuitDemande, RubriqueVide, demandeClose, etapeCourante, type Demande } from "./commun";

/** Formation & parcours de l'agent : catalogue des types, arbitrages en cours et candidature. */
export function OngletFormation({ agent }: { agent: Dossier }) {
  const feedback = useFeedback();
  const client = useQueryClient();
  // null : fermée ; "" : ouverte sans type choisi ; sinon le type présélectionné.
  const [inscription, setInscription] = useState<string | null>(null);
  const types = agent.types_formations ?? [];
  const pageTypes = usePagination(types, String(types.length));
  const pageFormations = usePagination(agent.formations, String(agent.formations.length));
  const sessions = agent.sessions_formations ?? [];
  const demandes = agent.demandes.filter((item) => item.categorie === "formation");
  const v = {
    nom: agent.nom_complet,
    matricule: agent.matricule,
    initiales: agent.initiales,
    grade: agent.grade,
    corps: agent.corps,
    sigle: agent.organisme_sigle,
    structure: agent.structure,
    nbTypes: types.length,
    arbitragesOuverts: demandes.filter((item) => !demandeClose(item)).length,
  };

  // Indicateurs et sessions : ceux de la sous-direction de la formation continue.
  const formation = useQuery({ queryKey: CLE_FORMATION, queryFn: () => api<TableauFormation>("/api/v1/formation/") });
  const k = formation.data?.indicateurs;
  const plan = formation.data?.plan;
  const execution = plan?.objectif_agents ? Math.round(((k?.formes ?? 0) / plan.objectif_agents) * 100) : 0;
  const prestataires = (formation.data?.prestataires ?? []).filter((item) => item.actif);
  const prochaines = (formation.data?.sessions ?? [])
    .filter((item) => (item.etat === "planifiee" || item.etat === "inscriptions_ouvertes") && item.date_debut)
    .sort((a, b) => (a.date_debut ?? "").localeCompare(b.date_debut ?? ""));

  function viser(reference: string) {
    void feedback
      .run("Visa de la SD Formation…", () => api<{ etape: string; notifiee: boolean }>(`/api/v1/demandes/${encodeURIComponent(reference)}/valider/`, { method: "POST" }), {
        success: { title: "Étape validée", message: "La demande de formation avance dans le circuit." },
        error: "Le visa n'a pas été apposé.",
      })
      .then(() => client.invalidateQueries({ queryKey: ["agent", agent.matricule] }))
      .catch(() => undefined);
  }

  return (
    <>
      <div className="p-6 max-w-[1600px] w-full mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-primary-container bg-primary-fixed font-label-sm text-label-sm uppercase tracking-wider font-bold">
                Régime Statutaire Général
              </span>
              {" "}
              <span className="text-on-surface-variant font-label-sm text-label-sm">
                • Statut Général des Fonctionnaires (Loi n°2023-892)
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              {"Gestion des Formations & Certifications"}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Direction des Ressources Humaines • Direction Générale du Portefeuille de l'État (DGPE)
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-surface-container-low text-primary font-label-lg text-label-lg hover:bg-surface-container transition-colors" type="button" data-soon="Ce document n'est pas encore servi par le dossier.">
              <span className="material-symbols-outlined text-lg">description</span>
              {" "}
              <span>Télécharger le bilan (PDF)</span>
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg font-semibold hover:bg-primary-container shadow-sm transition-all" onClick={() => setInscription("")} type="button">
              <span className="material-symbols-outlined text-lg">person_add</span>
              {" "}
              <span>S'inscrire</span>
            </button>
          </div>
        </div>
        {/* Indicateurs de la formation continue (calculés par la sous-direction) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="font-label-md text-label-md text-on-surface-variant font-medium uppercase tracking-wider block">Exécution du plan annuel</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-primary font-bold">{k ? `${execution} %` : "—"}</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">plan {formation.data?.exercice ?? ""}</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">query_stats</span>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between font-label-sm text-label-sm">
                <span className="text-on-surface-variant">{k ? `${k.formes} agents formés` : ""}</span>
                <span className="font-code-num text-code-num text-primary font-bold">{plan ? `${plan.objectif_agents} prévus` : ""}</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(execution, 100)}%` }} />
              </div>
            </div>
          </div>
          <div className="p-5 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="font-label-md text-label-md text-on-surface-variant font-medium uppercase tracking-wider block">Engagement mobilisé</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-headline-xl text-headline-xl text-on-surface font-bold">{k ? millions(k.engage) : "—"}</span>
                  <span className="font-label-lg text-label-lg text-secondary font-bold">MFCFA</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded bg-secondary-container/20 text-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
              </div>
            </div>
            <div className="mt-4 pt-3 bg-surface-container-low p-2 rounded flex items-center justify-between gap-2 font-label-sm text-label-sm">
              <span className="text-on-surface-variant">Dotation du plan :</span>
              <span className="font-code-num text-code-num text-on-surface font-semibold">
                {plan ? `${millions(plan.dotation)} MFCFA (${plan.dotation ? Math.round(((k?.engage ?? 0) / plan.dotation) * 1000) / 10 : 0} %)` : "—"}
              </span>
            </div>
          </div>
          <div className="p-5 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="font-label-md text-label-md text-on-surface-variant font-medium uppercase tracking-wider block">Prestataires actifs</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-on-surface font-bold">{k ? k.prestataires_actifs : "—"}</span>
                  <span className="font-label-sm text-label-sm text-primary font-semibold">conventions en cours</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">hub</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {prestataires.slice(0, 2).map((prestataire) => (
                <span key={prestataire.id} className="px-2 py-0.5 rounded bg-surface-container-low font-label-sm text-label-sm text-primary font-bold truncate max-w-full">{prestataire.nom}</span>
              ))}
              {prestataires.length > 2 ? <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-num text-code-num">+{prestataires.length - 2}</span> : null}
            </div>
          </div>
          <div className="p-5 rounded bg-surface-container-lowest shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="font-label-md text-label-md text-on-surface-variant font-medium uppercase tracking-wider block">Satisfaction des participants</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-headline-xl text-headline-xl text-primary font-bold">{k?.satisfaction ? k.satisfaction.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}</span>
                  <span className="font-label-lg text-label-lg text-primary font-semibold">/ 5</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">verified</span>
              </div>
            </div>
            <div className="mt-4 font-label-sm text-label-sm text-on-surface-variant">
              {k ? `${k.evaluations} évaluation${k.evaluations > 1 ? "s" : ""} saisie${k.evaluations > 1 ? "s" : ""} en fin de session` : ""}
            </div>
          </div>
        </div>
        {/* Colonne Droite : Circuit de Validation & Demandes en Attente (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Demandes d'inscription en attente d'arbitrage */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 bg-surface-container-low p-3 rounded">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-xl">pending_actions</span>
                {" "}
                <span className="font-headline-sm text-headline-sm text-on-surface">Demande de formation en cours</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-code-num text-code-num font-bold">
                {v.arbitragesOuverts}
              </span>
            </div>
            <div className="space-y-4">
              {demandes.length ? (
                demandes.map((demande) => <CarteArbitrage key={demande.reference} demande={demande} onViser={viser} />)
              ) : (
                <RubriqueVide>Aucune demande de formation n'est en cours pour ce dossier.</RubriqueVide>
              )}
              {/* Convention Inter-Entreprises Focus */}
            </div>
          </div>
        </div>
        {/* Grille Principale Métier : Sessions en Cours & Demandes en Attente */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Colonne Gauche : Sessions Clés Programmées ce Trimestre */}
          <div className="lg:col-span-12 space-y-6">
            {/* Prochaines sessions planifiées par la sous-direction */}
            <div className="bg-surface-container-lowest rounded shadow-sm p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 bg-surface-container-low px-4 py-3 rounded gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">event_available</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface">Prochaines sessions programmées</span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-lowest px-2.5 py-1 rounded font-medium">
                  {prochaines.length} session{prochaines.length > 1 ? "s" : ""} à venir
                </span>
              </div>
              {formation.isPending ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((index) => <Skeleton key={index} className="h-48 w-full" />)}
                </div>
              ) : prochaines.length === 0 ? (
                <RubriqueVide>Aucune session n'est programmée pour l'instant.</RubriqueVide>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {prochaines.slice(0, 3).map((session) => {
                    const complet = session.places > 0 && session.occupees >= session.places;
                    return (
                      <div key={session.code} className="rounded p-4 bg-surface-container-low flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-label-sm text-label-sm font-bold uppercase truncate">{session.type_libelle}</span>
                            <span className="font-code-num text-code-num text-on-surface-variant whitespace-nowrap shrink-0">{session.heures} h</span>
                          </div>
                          <h2 className="font-headline-sm text-headline-sm text-on-surface leading-snug">{session.libelle}</h2>
                          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">{session.objectif}</p>
                        </div>
                        <div className="space-y-3 pt-3 bg-surface-container-lowest p-3 rounded">
                          <div className="flex items-center justify-between gap-2 font-label-sm text-label-sm">
                            <span className="text-on-surface-variant truncate">
                              Lieu : <strong>{session.lieu || "à préciser"}</strong>
                            </span>
                            <span className={`font-bold whitespace-nowrap ${complet ? "text-secondary" : "text-primary"}`}>
                              {session.occupees}/{session.places}
                              {complet ? " (complet)" : " inscrits"}
                            </span>
                          </div>
                          <div className="w-full bg-surface-container rounded-full h-1.5">
                            <div className={`h-full rounded-full ${complet ? "bg-secondary" : "bg-primary"}`} style={{ width: `${session.places ? Math.min(100, (session.occupees / session.places) * 100) : 0}%` }} />
                          </div>
                          <span className="block font-code-num text-code-num text-on-surface-variant">{periodeSession(session.date_debut, session.date_fin)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {/* Catalogue & Filtrage des Modules de Compétences */}
            <div className="bg-surface-container-lowest rounded shadow-sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Modules Agréés</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Sélectionnez une thématique pour inscrire les fonctionnaires et contractuels de l'État
                  </p>
                </div>
                {/* Filtres rapides sous forme de pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="px-3 py-1.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold shrink-0">
                    Tous ({v.nbTypes})
                  </span>
                </div>
              </div>
              {/* Tableau du Catalogue */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-body-sm">
                  <thead className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4 rounded-l">Réf. Module</th>
                      <th className="py-3 px-4">{"Intitulé & Organisme Partenaire"}</th>
                      <th className="py-3 px-4">Cible Statutaire</th>
                      <th className="py-3 px-4">Crédits</th>
                      <th className="py-3 px-4" data-min="">Statut Session</th>
                      <th className="py-3 px-4 text-right rounded-r">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-0">{pageTypes.visibles.map((type) => (
                  <LigneType key={type.code} type={type} ouverte={sessions.some((session) => session.type === type.code)} onInscrire={() => setInscription(type.code)} />
                ))}</tbody>
                </table>
                <Pagination page={pageTypes.page} pages={pageTypes.pages} total={pageTypes.total} aller={pageTypes.aller} libelle="module" />
              </div>
            </div>
          </div>
        </div>
        {/* Section Basse : Passeport Individuel de Compétences de l'Agent Sélectionné */}
        <div className="bg-surface-container-lowest rounded shadow-sm p-6 space-y-6">
          {/* En-tête Dossier Spécifique Agent */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 bg-surface-container-low p-4 rounded gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/20 text-primary flex items-center justify-center font-headline-sm text-headline-sm font-bold shadow-inner">
                {v.initiales}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-3">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{v.nom}</h2>
                  <span className="px-2.5 py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold">
                    Grade {v.grade} • {v.corps}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 font-body-sm text-body-sm text-on-surface-variant">
                  <span>
                    Matricule Civil :{" "}
                    <strong className="font-code-num text-code-num text-on-surface">{v.matricule}</strong>
                  </span>
                  {" "}
                  <span>
                    Affectation :{" "}
                    <strong>{v.sigle} / {v.structure}</strong>
                  </span>
                  {" "}
                  <span>
                    Passeport Numérique :{" "}
                    <strong className="text-primary font-code-num text-code-num">SIGRH-{v.matricule}</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start lg:self-auto">
              <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-surface-container text-primary font-label-sm text-label-sm font-bold hover:bg-primary hover:text-on-primary transition-colors" type="button" data-soon="Ce document n'est pas encore servi par le dossier.">
                <span className="material-symbols-outlined text-base">verified_user</span>
                {" "}
                <span>Générer Passeport Certifié</span>
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-surface-container text-on-surface font-label-sm text-label-sm font-bold hover:bg-surface-container-high transition-colors" type="button">
                <span className="material-symbols-outlined text-base">history_edu</span>
                {" "}
                <span>Historique Évaluations</span>
              </button>
            </div>
          </div>
          {/* Tableau du Parcours Individuel Certifié */}
          <div className="space-y-3">
            <div className="flex flex-col items-start gap-1.5">
              <h3 className="font-headline-sm text-headline-sm text-on-surface flex items-start gap-2">
                <span className="material-symbols-outlined text-primary shrink-0">workspace_premium</span>
                {" "}
                <span>{"Parcours Professionnel Certifié & Évaluations Régaliennes"}</span>
              </h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant leading-relaxed">
                Les attestations sont versées au dossier
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 rounded-l">Intitulé & période</th>
                    <th className="py-3 px-4">Organisme</th>
                    <th className="py-3 px-4">Volume horaire</th>
                    <th className="py-3 px-4" data-min="">Statut</th>
                    <th className="py-3 px-4 rounded-r">Attestation</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.formations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-4 text-on-surface-variant">Aucune formation n'est versée au parcours de cet agent.</td>
                    </tr>
                  ) : (
                    pageFormations.visibles.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-on-surface">
                          {item.intitule}
                          <span className="block font-label-sm text-label-sm text-on-surface-variant font-normal">{periodeSession(item.debut, item.fin)}</span>
                        </td>
                        <td className="py-3.5 px-4">{item.organisme}</td>
                        <td className="py-3.5 px-4 font-code-num text-code-num text-on-surface">{item.heures} heures</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm text-label-sm font-bold">{item.statut}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          {item.certification ? (
                            <span className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary font-medium">
                              <span className="material-symbols-outlined text-base">verified</span>
                              {item.certification}
                            </span>
                          ) : (
                            <span className="font-label-sm text-label-sm text-on-surface-variant">Sans attestation</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <Pagination page={pageFormations.page} pages={pageFormations.pages} total={pageFormations.total} aller={pageFormations.aller} libelle="formation" />
            </div>
          </div>
        </div>
        {/* Modal Interactive : Proposer une Candidature / S'inscrire */}
      </div>
      {inscription !== null ? <Inscription agent={agent} typeInitial={inscription} onClose={() => setInscription(null)} /> : null}
    </>
  );
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function jourMois(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${String(jour).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function periodeSession(debut: string | null, fin: string | null): string {
  if (!debut) return "Dates à fixer";
  if (!fin || fin === debut) return jourMois(debut);
  return `${jourMois(debut).replace(/ d{4}$/, "")} - ${jourMois(fin)}`;
}

function millions(montant: number): string {
  return (montant / 1_000_000).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function LigneType({ type, ouverte, onInscrire }: { type: Dossier["types_formations"][number]; ouverte: boolean; onInscrire: () => void }) {
  return (
    <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-3.5 px-4 font-code-num text-code-num text-primary font-bold">{type.code}</td>
      <td className="py-3.5 px-4">
        <p className="font-label-md text-label-md text-on-surface font-semibold">{type.libelle}</p>
      </td>
      <td className="py-3.5 px-4">
        <div className="flex flex-col gap-1 items-start">
          {type.publics.map((publicConcerne) => (
            <span key={publicConcerne} className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm">{publicConcerne}</span>
          ))}
        </div>
      </td>
      <td className="py-3.5 px-4 font-code-num text-code-num text-on-surface-variant">—</td>
      <td className="py-3.5 px-4 text-on-surface-variant">—</td>
      <td className="py-3.5 px-4 text-right">
        {ouverte ? (
          <button className="px-3 py-1.5 rounded bg-surface-container text-primary font-label-sm text-label-sm font-bold hover:bg-primary hover:text-on-primary transition-all" type="button" onClick={onInscrire}>
            S'inscrire
          </button>
        ) : (
          <span className="font-label-sm text-label-sm text-on-surface-variant">Non ouverte</span>
        )}
      </td>
    </tr>
  );
}

function CarteArbitrage({ demande, onViser }: { demande: Demande; onViser: (reference: string) => void }) {
  const close = demandeClose(demande);
  const courant = etapeCourante(demande);
  const bouton = "px-4 py-2 rounded font-label-sm text-label-sm font-bold transition-colors";
  const suite = close ? null : (
    <div className="flex items-center gap-2">
      {courant === 3 ? (
        <button className={`${bouton} bg-primary text-on-primary hover:bg-primary-container`} type="button" onClick={() => onViser(demande.reference)}>
          Valider Visa SD
        </button>
      ) : (
        <button className={`${bouton} bg-primary text-on-primary hover:bg-primary-container`} type="button" data-soon={`Le visa de la SD Formation interviendra à l'étape 3. La demande est à l'étape ${courant}.`}>
          Valider Visa SD
        </button>
      )}
      <button className={`${bouton} bg-surface-container text-error hover:bg-error-container`} type="button" data-soon="L'ajournement de cette demande sera versé au circuit.">
        Ajourner
      </button>
    </div>
  );
  return <CircuitDemande demande={demande} clos={close} suite={suite} />;
}

const CHAMP = "w-full h-10 px-3 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary";
const LECTURE = "w-full min-h-10 px-3 py-2 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold";

/** Candidature à un module : type, module ouvert, pièce exigée, puis versement au circuit. */
function Inscription({ agent, typeInitial, onClose }: { agent: Dossier; typeInitial: string; onClose: () => void }) {
  const feedback = useFeedback();
  const client = useQueryClient();
  const sessions = agent.sessions_formations ?? [];
  const types = (agent.types_formations ?? []).filter((type) => sessions.some((session) => session.type === type.code));
  const [type, setType] = useState(types.some((item) => item.code === typeInitial) ? typeInitial : (types[0]?.code ?? ""));
  const modules = sessions.filter((session) => session.type === type);
  const [module, setModule] = useState(modules[0]?.code ?? "");
  const [fichier, setFichier] = useState<File | null>(null);
  const [enCours, setEnCours] = useState(false);
  const choisi = modules.find((session) => session.code === module) ?? modules[0];
  const piece = types.find((item) => item.code === type)?.piece_libelle ?? "";

  function changerType(code: string) {
    setType(code);
    setModule(sessions.find((session) => session.type === code)?.code ?? "");
    setFichier(null);
  }

  async function transmettre() {
    if (!choisi) return;
    if (piece && !fichier) {
      feedback.toast("Document requis", "Joignez le document demandé avant de transmettre la candidature.", "error");
      return;
    }
    const corps = new FormData();
    corps.set("code", choisi.code);
    if (fichier) corps.set("fichier", fichier);
    setEnCours(true);
    try {
      await feedback.run(
        "Versement de l'inscription au circuit…",
        () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/formations/inscription/`, { method: "POST", body: corps }),
        {
          success: { title: "Inscription versée", message: `${choisi.libelle} est entré dans le circuit de validation.` },
          error: "L'inscription n'a pas été versée.",
        },
      );
      await client.invalidateQueries({ queryKey: ["agent", agent.matricule] });
      onClose();
    } catch {
      /* le toast d'erreur est déjà affiché */
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      titre="Dépôt de candidature à un module agréé"
      sousTitre="Circuit d'ordonnancement officiel de la Sous-Direction de la Formation"
      icone="assignment_ind"
      taille="lg"
      onClose={onClose}
      onSubmit={() => void transmettre()}
      enCours={enCours}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours || !choisi}>
            {enCours ? <span className="material-symbols-outlined text-lg motion-spin" aria-hidden="true">progress_activity</span> : null}
            Transmettre la candidature
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1 block">
            <span className={LIBELLE}>Agent bénéficiaire</span>
            <input className={CHAMP} readOnly type="text" value={`${agent.matricule} - ${agent.nom_complet}`} />
          </label>
          <label className="space-y-1 block">
            <span className={LIBELLE}>
              Type de formation sollicité <span className="text-error">*</span>
            </span>
            <select className={CHAMP} value={type} onChange={(event) => changerType(event.target.value)} required>
              {types.length ? (
                types.map((item) => (
                  <option key={item.code} value={item.code}>{item.libelle}</option>
                ))
              ) : (
                <option value="">Aucun type n'est ouvert par la direction de la formation continue.</option>
              )}
            </select>
          </label>
        </div>
        <label className="space-y-1 block">
          <span className={LIBELLE}>
            Module <span className="text-error">*</span>
          </span>
          <select className={CHAMP} value={choisi?.code ?? ""} onChange={(event) => setModule(event.target.value)} required>
            {modules.length ? (
              modules.map((session) => (
                <option key={session.code} value={session.code}>{session.libelle}</option>
              ))
            ) : (
              <option value="">Aucun module n'est ouvert pour ce type.</option>
            )}
          </select>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className={LIBELLE}>Cadre d'imputation budgétaire</span>
            <p className={LECTURE}>{choisi?.cadre || "—"}</p>
          </div>
          <div className="space-y-1">
            <span className={LIBELLE}>Objectif d'évaluation post-stage</span>
            <p className={LECTURE}>{choisi?.objectif || "—"}</p>
          </div>
        </div>
        {piece ? (
          <label className="space-y-1 block">
            <span className={LIBELLE}>
              {piece} <span className="text-error">*</span>
            </span>
            <input className="w-full px-3 py-2 rounded bg-surface-container-low text-on-surface font-body-sm text-body-sm" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => setFichier(event.target.files?.[0] ?? null)} />
            <span className="block font-body-sm text-body-sm text-on-surface-variant">Ce document est exigé pour ce type avant la transmission au circuit. Les autres types se vérifient dans le dossier.</span>
          </label>
        ) : null}
        <div className="p-3 bg-surface-container-low rounded space-y-2">
          <span className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider block">Circuit automatique d'ordonnancement</span>
          <div className="flex flex-wrap items-center justify-between gap-2 text-on-surface-variant font-label-sm text-label-sm">
            <span>1. Chef de Service (Validé)</span>
            <span aria-hidden="true">→</span>
            <span>2. SD Formation Continue (Instruction)</span>
            <span aria-hidden="true">→</span>
            <span>3. DRH Ministérielle (Arrêté)</span>
          </div>
        </div>
      </div>
    </Modale>
  );
}
