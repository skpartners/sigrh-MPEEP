import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { Dossier } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Pagination, usePagination } from "../../ui/Pagination";
import { CircuitDemande, absenceEnCours, demandeClose, jour, periode, pluriel, useDocumentAgent, type Absence } from "./commun";
import { Icone } from "../../ui/Icone";

function valeurs(agent: Dossier) {
  const { acquis, consommes, reliquat, report, autorisations, autorisations_restantes } = agent.conges;
  const part = acquis > 0 ? Math.round((consommes / acquis) * 100) : 0;
  const dernier = agent.absences[0];
  const presence = agent.presence;
  const respecte = presence.presents >= presence.quorum;
  const annees = agent.absences.map((item) => Number(item.debut.slice(0, 4)));
  const min = Math.min(...annees);
  const max = Math.max(...annees);
  return {
    reliquat,
    acquis,
    consommes,
    part,
    partBornee: Math.min(part, 100),
    reportTexte: report > 1 ? `+${report} jours` : `+${report} jour`,
    autorisations,
    resteTexte: pluriel(autorisations_restantes, "jour"),
    dernierePeriode: dernier ? periode(dernier.debut, dernier.fin) : "Aucune absence enregistrée",
    mois: presence.mois,
    service: presence.service,
    quorum: presence.quorum,
    presents: presence.presents,
    congesService: presence.conges,
    maladie: presence.maladie,
    regle: respecte ? "Règle de Présence Respectée" : "Quorum de présence non atteint",
    phraseQuorum: respecte
      ? `Le service compte ${presence.presents} % d'agents présents, au-dessus du quorum de ${presence.quorum} %.`
      : `Le service compte ${presence.presents} % d'agents présents, en dessous du quorum de ${presence.quorum} %.`,
    plage: annees.length === 0 ? String(new Date().getFullYear()) : min === max ? String(min) : `${min} - ${max}`,
    exercices: [...new Set(annees)].sort((a, b) => b - a),
  };
}

/** Congés & absences de l'agent : soldes, circuit, présence du service et registre. */
export function OngletConges({ agent }: { agent: Dossier }) {
  const v = valeurs(agent);
  const telecharger = useDocumentAgent(agent.matricule);
  const [formulaire, setFormulaire] = useState(false);
  const [exercice, setExercice] = useState("");
  const [filtre, setFiltre] = useState("");
  const enCircuit = [...agent.demandes.filter((item) => item.categorie === "conge" && !demandeClose(item))];
  const pendantes = agent.absences.filter(absenceEnCours);
  const registre = agent.absences.filter((item) => !filtre || item.debut.startsWith(filtre));
  const pageRegistre = usePagination(registre, filtre);
  return (
    <>
      <div className="px-6 py-6 lg:px-8 space-y-8 mx-auto w-full">
        {/* Top Sovereign Sub-header & Module Navigation */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-primary-container bg-primary-fixed font-label-sm text-label-sm uppercase tracking-wider font-bold">
                Régime Statutaire Général
              </span>
              {" "}
              <span className="text-on-surface-variant font-label-sm text-label-sm">
                • Statut Général des Fonctionnaires (Loi n°2023-892)
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              {"Gestion des Congés, Absences & Présences"}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Direction des Ressources Humaines • Direction Générale du Portefeuille de l'État (DGPE)
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="px-3 py-2 rounded bg-surface-container-high text-on-surface font-label-md text-label-md flex items-center gap-2 hover:bg-surface-variant transition-colors shadow-sm" type="button" onClick={() => telecharger("releve")}>
              <Icone nom="print" className="text-base" />
              {" "}
              <span>Bilan Trimestriel</span>
            </button>
            <button className="px-4 py-2 rounded bg-primary text-on-primary font-label-md text-label-md flex items-center gap-2 hover:bg-primary-container transition-colors shadow-sm" onClick={() => setFormulaire(true)} type="button">
              <Icone nom="add_circle" className="text-base" />
              {" "}
              <span>Déclarer un congé ou une absence</span>
            </button>
          </div>
        </div>
        {/* Section 1: Compteurs Statutaires de Droits */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {/* Card 1: Solde Disponible Principal */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Solde Disponible Immédiat
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-primary font-bold">{v.reliquat}</span>
                  {" "}
                  <span className="font-label-lg text-label-lg text-on-surface-variant font-medium">jours ouvrables</span>
                </div>
              </div>
              <div className="p-2.5 rounded bg-primary-fixed text-primary flex items-center justify-center">
                <Icone nom="account_balance_wallet" className="text-2xl" />
              </div>
            </div>
            <div className="space-y-2 mt-4 pt-3 bg-surface-container-low/60 -mx-5 -mb-5 px-5 py-3">
              <div className="flex justify-between items-center font-label-sm text-label-sm">
                <span className="text-on-surface-variant">Consommation annuelle</span>
                {" "}
                <span className="font-code-num text-on-surface font-bold">{v.consommes} / {v.acquis} j ({v.part}%)</span>
              </div>
              <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: `${v.partBornee}%` }} />
              </div>
            </div>
          </div>
          {/* Card 2: Droits Annuels Légaux Acquis */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Droits Annuels Acquis
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-on-surface font-bold">{v.acquis}</span>
                  {" "}
                  <span className="font-label-lg text-label-lg text-on-surface-variant font-medium">jours / an</span>
                </div>
              </div>
              <div className="p-2.5 rounded bg-surface-container-high text-on-surface-variant flex items-center justify-center">
                <Icone nom="gavel" className="text-2xl" />
              </div>
            </div>
            <div className="mt-4 pt-3 flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm bg-surface-container-low/60 -mx-5 -mb-5 px-5 py-3">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Report N-1 validé DRH</span>
              {" "}
              <span className="font-code-num text-primary font-bold">{v.reportTexte}</span>
            </div>
          </div>
          {/* Card 3: Jours Consommés */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Jours Déjà Consommés
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-secondary font-bold">{v.consommes}</span>
                  {" "}
                  <span className="font-label-lg text-label-lg text-on-surface-variant font-medium">jours décomptés</span>
                </div>
              </div>
              <div className="p-2.5 rounded bg-secondary-fixed text-secondary flex items-center justify-center">
                <Icone nom="event_busy" className="text-2xl" />
              </div>
            </div>
            <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm bg-surface-container-low/60 -mx-5 -mb-5 px-5 py-3">
              <span className="text-on-surface-variant">Dernier congé pris</span>
              {" "}
              <span className="font-code-num text-on-surface font-semibold">{v.dernierePeriode}</span>
            </div>
          </div>
          {/* Card 4: Autorisations Spéciales d'Absence */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Autorisations Spéciales
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-tertiary font-bold">{v.autorisations}</span>
                  {" "}
                  <span className="font-label-lg text-label-lg text-on-surface-variant font-medium">jours maxi / an</span>
                </div>
              </div>
              <div className="p-2.5 rounded bg-tertiary-fixed text-tertiary flex items-center justify-center">
                <Icone nom="favorite" className="text-2xl" />
              </div>
            </div>
            <div className="mt-4 pt-3 flex items-center justify-between font-label-sm text-label-sm bg-surface-container-low/60 -mx-5 -mb-5 px-5 py-3">
              <span className="text-on-surface-variant">Événements familiaux restants</span>
              {" "}
              <span className="font-code-num text-primary font-bold">{v.resteTexte}</span>
            </div>
          </div>
        </div>
        {enCircuit.length || pendantes.length ? (
          <div className="space-y-4">
            {enCircuit.map((demande) => <CircuitDemande key={demande.reference} demande={demande} />)}
            {pendantes.map((absence) => <AbsenceEnCours key={absence.id} absence={absence} />)}
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-surface-container-high" />
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Circuit d'Ordonnancement</h2>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune demande de congé ou d'absence n'est en cours pour ce dossier.</p>
          </div>
        )}
        {/* Main Grid: Section 2 (Formulaire) + Section 4 (Planning Présence) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Section 4: Calendrier / Planning de Présence & Continuité du Service Public */}
          <div className="lg:col-span-12 bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-2">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">
                  Continuité de Service
                </span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Planning de la Sous-Direction</h2>
              </div>
              <span className="font-label-sm text-label-sm px-2.5 py-1 rounded bg-primary-fixed text-primary font-bold">
                {v.mois}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Quorum de présence minimum exigé au sein de {v.service} :{" "}
              <strong className="text-on-surface">{v.quorum}%</strong>
              .
            </p>
            {/* Current Team Status List */}
            <div className="space-y-3">{agent.presence.membres.map((membre) => <Membre key={membre.nom} membre={membre} />)}</div>
            {/* Inline SVG Visualization: Jauge de Continuité et Taux de Disponibilité */}
            <div className="p-4 rounded-lg bg-surface-container space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface uppercase font-bold">
                  Capacité Opérationnelle du Service
                </span>
                {" "}
                <span className="font-code-num text-code-num text-primary font-bold">{v.presents}% Actif</span>
              </div>
              <div className="w-full bg-surface-container-lowest h-3 rounded-full overflow-hidden flex">
                <div className="bg-primary h-full" style={{ width: `${v.presents}%` }} title="Présents / Suppléants" />
                <div className="bg-secondary-container h-full" style={{ width: `${v.congesService}%` }} title="Congés Annuels" />
                <div className="bg-error h-full" style={{ width: `${v.maladie}%` }} title="Congés Maladie" />
              </div>
              <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                  {" "}Présents ({v.presents}%)
                </span>
                {" "}
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary-container inline-block" />
                  {" "}Congés ({v.congesService}%)
                </span>
                {" "}
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-error inline-block" />
                  {" "}Maladie ({v.maladie}%)
                </span>
              </div>
            </div>
            {/* Alerte Continuité Régalienne */}
            <div className="p-3.5 rounded bg-primary-fixed/40 flex items-start gap-3">
              <Icone nom="verified_user" className="text-primary text-xl shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-label-md text-label-md text-on-surface font-bold">{v.regle}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{v.phraseQuorum}</p>
              </div>
            </div>
          </div>
        </div>
        {/* Section 5: Historique Certifié des Congés (3 Dernières Années) */}
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Icone nom="folder_managed" className="text-primary text-xl" />
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Registre Historique des Actes Individuels de Congé ({v.plage})
                </h2>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Chaque congé validé dispose d'un arrêté ministériel signé avec cachet électronique souverain.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select aria-label="Exercice" className="h-9 px-3 pr-8 bg-surface-container-low text-on-surface font-label-sm text-label-sm rounded focus:outline-none appearance-none cursor-pointer" value={exercice} onChange={(event) => setExercice(event.target.value)}>
                  <option value="">Tous les exercices ({v.plage})</option>
                  {v.exercices.map((annee) => (
                    <option key={annee} value={annee}>Exercice {annee}</option>
                  ))}
                </select>
                {" "}
                <Icone nom="expand_more" className="absolute right-2 top-2 pointer-events-none text-on-surface-variant text-sm" />
              </div>
              <button className="px-3 py-1.5 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm flex items-center gap-1.5 hover:bg-surface-variant transition-colors" type="button" onClick={() => setFiltre(exercice)}>
                <Icone nom="filter_list" className="text-sm" />
                {" "}
                <span>Filtrer</span>
              </button>
            </div>
          </div>
          {/* Tabular Historical Archive */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l">{"Référence & Type d'Acte"}</th>
                  <th className="py-3 px-4">Période d'Effet</th>
                  <th className="py-3 px-4">Durée</th>
                  <th className="py-3 px-4">Remplaçant Intérimaire</th>
                  <th className="py-3 px-4" data-min="">Statut Légal</th>
                  <th className="py-3 px-4 text-right rounded-r">Arrêté</th>
                </tr>
              </thead>
              <tbody className="divide-y-0">{registre.length ? (
                  pageRegistre.visibles.map((absence) => <LigneAbsence key={absence.id} absence={absence} />)
                ) : (
                  <tr>
                    <td className="py-6 px-4 text-on-surface-variant" colSpan={6}>Aucune absence n'est enregistrée pour cette période.</td>
                  </tr>
                )}</tbody>
            </table>
            <Pagination page={pageRegistre.page} pages={pageRegistre.pages} total={pageRegistre.total} aller={pageRegistre.aller} libelle="absence" />
          </div>
          {/* Historical Footer Info */}
          <div className="p-4 rounded-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface-variant font-label-sm text-label-sm">
            <div className="flex items-center gap-2">
              <Icone nom="lock" className="text-base text-primary" />
              {" "}
              <span>
                Les arrêtés archivés portent le sceau officiel de la République de Côte d'Ivoire et font foi auprès du Trésor Public.
              </span>
            </div>
            <button className="text-primary font-bold hover:underline flex items-center gap-1" type="button" onClick={() => telecharger("releve")}>
              <span>Exporter le relevé statutaire 3 ans</span>
              {" "}
              <Icone nom="arrow_forward" className="text-sm" />
            </button>
          </div>
        </div>
        {/* Sovereign Bottom Guarantee Seal */}
        <div className="p-4 rounded-xl bg-surface-container-high/60 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-3">
            <Icone nom="policy" className="text-2xl text-primary" />
            <div className="space-y-0.5">
              <p className="font-label-md text-label-md text-on-surface font-bold">Sécurisation Régalienne des Actes RH</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Conforme aux règles d'accès de la plateforme.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-code-num text-code-num px-3 py-1 rounded bg-surface-container-lowest text-on-surface font-semibold shadow-sm">
              Horodatage : 2026-03-02 14:48:22 UTC
            </span>
          </div>
        </div>
      </div>
      {formulaire ? <FormulaireConge agent={agent} onClose={() => setFormulaire(false)} /> : null}
    </>
  );
}

function Membre({ membre }: { membre: Dossier["presence"]["membres"][number] }) {
  const pastille = membre.vous ? "bg-primary-fixed text-primary" : "bg-surface-container-high text-on-surface";
  const detail = membre.ton === "maladie" ? "text-error" : membre.ton === "present" ? "text-primary" : "text-secondary";
  const badge =
    membre.ton === "maladie"
      ? "bg-error-container text-on-error-container"
      : membre.ton === "present"
        ? "bg-primary-fixed text-on-primary-fixed-variant"
        : "bg-secondary-fixed text-on-secondary-fixed-variant";
  return (
    <div className="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-full ${pastille} font-bold flex items-center justify-center font-label-sm text-label-sm shrink-0`}>{membre.initiales}</div>
        <div className="min-w-0">
          <p className="font-label-md text-label-md text-on-surface font-bold truncate">{membre.vous ? `${membre.nom} (vous)` : membre.nom}</p>
          <p className={`font-body-sm text-body-sm ${detail} font-medium`}>{membre.libelle}</p>
        </div>
      </div>
      <span className={`px-2 py-0.5 rounded ${badge} font-label-sm text-label-sm font-semibold shrink-0`}>{membre.badge}</span>
    </div>
  );
}

function AbsenceEnCours({ absence }: { absence: Absence }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary-container" />
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{absence.nature}</h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {jour(absence.debut)} au {jour(absence.fin)} · {pluriel(absence.jours, "jour")}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-bold">{absence.statut}</span>
      </div>
      {absence.interim ? <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">Intérim : {absence.interim}</p> : null}
    </div>
  );
}

function iconeAbsence(nature: string): string {
  if (/maladie/i.test(nature)) return "medical_services";
  if (/famil|autorisation|permission/i.test(nature)) return "family_restroom";
  if (/perfect|form/i.test(nature)) return "school";
  return "beach_access";
}

function LigneAbsence({ absence }: { absence: Absence }) {
  return (
    <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-primary-fixed text-primary">
            <Icone nom={iconeAbsence(absence.nature)} className="text-base" />
          </div>
          <div>
            <span className="font-code-num text-on-surface font-bold block">{absence.nature}</span>
            <span className="text-on-surface-variant font-body-sm text-body-sm">{absence.statut}</span>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-4 font-code-num text-on-surface">
        {jour(absence.debut)} au {jour(absence.fin)}
      </td>
      <td className="py-3.5 px-4">
        <span className="px-2 py-0.5 rounded bg-surface-container font-code-num text-code-num font-bold text-on-surface">{pluriel(absence.jours, "jour")}</span>
      </td>
      <td className="py-3.5 px-4 text-on-surface-variant">{absence.interim || "Assuré par le service"}</td>
      <td className="py-3.5 px-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" /> {absence.statut}
        </span>
      </td>
      <td className="py-3.5 px-4 text-right">
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-high text-primary hover:bg-primary hover:text-on-primary font-label-sm text-label-sm transition-colors shadow-sm" type="button" data-soon="Ce document n'est pas encore servi par le dossier.">
          <Icone nom="download" className="text-sm" />
          <span>PDF</span>
        </button>
      </td>
    </tr>
  );
}

// --- Formulaire de demande ------------------------------------------------------------------

type Saisie = { type: string; debut: string; fin: string; interim: string; observations: string };

const CHAMP = "w-full h-11 px-3 bg-surface-container-low text-on-surface font-body-md text-body-md rounded focus:outline-none focus:ring-1 focus:ring-primary";
const LIBELLE = "font-label-lg text-label-lg text-on-surface font-semibold";

function cleBrouillon(matricule: string): string {
  return `sigrh-brouillon-conge-${matricule}`;
}

function lireBrouillon(matricule: string): Saisie | null {
  try {
    const brut = localStorage.getItem(cleBrouillon(matricule));
    return brut ? (JSON.parse(brut) as Saisie) : null;
  } catch {
    return null;
  }
}

function ecrireBrouillon(matricule: string, saisie: Saisie | null) {
  try {
    if (saisie) localStorage.setItem(cleBrouillon(matricule), JSON.stringify(saisie));
    else localStorage.removeItem(cleBrouillon(matricule));
  } catch {
    /* stockage indisponible : le brouillon n'est simplement pas conservé */
  }
}

/** Jours ouvrables entre le départ (inclus) et la reprise (exclue). */
function joursOuvrables(debut: string, fin: string): number {
  const depart = new Date(`${debut}T00:00:00`);
  const retour = new Date(`${fin}T00:00:00`);
  if (Number.isNaN(depart.getTime()) || Number.isNaN(retour.getTime()) || retour <= depart) return 0;
  let compte = 0;
  for (const date = new Date(depart); date < retour; date.setDate(date.getDate() + 1)) {
    const semaine = date.getDay();
    if (semaine !== 0 && semaine !== 6) compte += 1;
  }
  return compte;
}

function FormulaireConge({ agent, onClose }: { agent: Dossier; onClose: () => void }) {
  const feedback = useFeedback();
  const client = useQueryClient();
  const collegues = agent.presence.membres.filter((item) => !item.vous);
  const premierType = agent.types_conges[0] ? (agent.types_conges[0].enfants[0]?.code ?? agent.types_conges[0].code) : "";
  const initiale: Saisie = { type: premierType, debut: "", fin: "", interim: collegues[0]?.nom ?? "", observations: "" };
  const [saisie, setSaisie] = useState<Saisie>(() => {
    const brouillon = lireBrouillon(agent.matricule);
    if (!brouillon) return initiale;
    return { ...brouillon, interim: collegues.some((item) => item.nom === brouillon.interim) ? brouillon.interim : initiale.interim };
  });
  const [enCours, setEnCours] = useState(false);
  const jours = joursOuvrables(saisie.debut, saisie.fin);
  const solde = saisie.type === "conge-annuel" ? Math.max(agent.conges.reliquat - jours, 0) : agent.conges.reliquat;
  const champ = (cle: keyof Saisie) => (event: { target: { value: string } }) => setSaisie((actuelle) => ({ ...actuelle, [cle]: event.target.value }));

  function brouillon() {
    if (!saisie.type || !saisie.debut || !saisie.fin) {
      feedback.toast("Brouillon incomplet", "Indiquez la nature de la demande et les deux dates.", "info");
      return;
    }
    ecrireBrouillon(agent.matricule, saisie);
    feedback.toast("Brouillon enregistré", "Il sera rétabli à la prochaine ouverture de ce formulaire.", "success");
  }

  function reinitialiser() {
    setSaisie(initiale);
    ecrireBrouillon(agent.matricule, null);
    feedback.toast("Formulaire réinitialisé", "Les champs sont revenus à leur valeur initiale.", "info");
  }

  async function transmettre() {
    if (!saisie.type || !saisie.debut || !saisie.fin) {
      feedback.toast("Demande incomplète", "Indiquez la nature de la demande et les deux dates.", "info");
      return;
    }
    if (jours <= 0) {
      feedback.toast("Période invalide", "La reprise doit suivre le début et compter au moins un jour ouvrable.", "info");
      return;
    }
    if (!saisie.interim.trim()) {
      feedback.toast("Remplaçant manquant", "Désignez la personne qui assure la continuité du service.", "info");
      return;
    }
    setEnCours(true);
    try {
      await feedback.run(
        "Transmission au circuit de visa…",
        () =>
          api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/conges/demande/`, {
            method: "POST",
            body: JSON.stringify({ type: saisie.type, debut: saisie.debut, fin: saisie.fin, interim: saisie.interim.trim(), observations: saisie.observations }),
          }),
        {
          success: { title: "Demande transmise", message: "Elle est entrée dans le circuit, au visa du chef de service." },
          error: "La demande n'a pas été transmise.",
        },
      );
      ecrireBrouillon(agent.matricule, null);
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
      titre="Demande d'absence ou congé statutaire"
      sousTitre="Formalité administrative · Décret d'application n°2023-892"
      icone="event_available"
      taille="xl"
      onClose={onClose}
      onSubmit={() => void transmettre()}
      enCours={enCours}
      pied={
        <>
          <button type="button" className="mr-auto px-4 py-2.5 rounded text-on-surface-variant hover:bg-surface-container font-label-md text-label-md transition-colors" onClick={reinitialiser} disabled={enCours}>
            Réinitialiser
          </button>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={brouillon} disabled={enCours}>
            Enregistrer en brouillon
          </button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours}>
            <Icone nom={enCours ? "progress_activity" : "send"} className={`text-lg ${enCours ? "motion-spin" : ""}`} />
            Transmettre pour visa
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className={`${LIBELLE} flex items-center justify-between`}>
            <span>
              Nature de la demande statutaire <span className="text-error">*</span>
            </span>
          </span>
          <select className={`${CHAMP} cursor-pointer`} value={saisie.type} onChange={champ("type")} required>
            {agent.types_conges.map((type) =>
              type.enfants.length ? (
                <optgroup key={type.code} label={type.libelle}>
                  {type.enfants.map((enfant) => (
                    <option key={enfant.code} value={enfant.code}>{enfant.libelle}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={type.code} value={type.code}>{type.libelle}</option>
              ),
            )}
          </select>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className={LIBELLE}>
              Date de début (incluse) <span className="text-error">*</span>
            </span>
            <input className={CHAMP} type="date" value={saisie.debut} onChange={champ("debut")} required />
          </label>
          <label className="block space-y-1.5">
            <span className={LIBELLE}>
              Date de reprise effective <span className="text-error">*</span>
            </span>
            <input className={CHAMP} type="date" value={saisie.fin} min={saisie.debut || undefined} onChange={champ("fin")} required />
          </label>
        </div>
        <div className="p-3.5 rounded bg-surface-container flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icone nom="calculate" className="text-primary text-xl" />
            <div>
              <p className="font-label-md text-label-md text-on-surface font-semibold">Décompte des jours ouvrables légaux</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Exclut samedis et dimanches</p>
            </div>
          </div>
          <div className="text-right" aria-live="polite">
            <span className="font-headline-sm text-headline-sm text-primary font-bold">{pluriel(jours, "jour")}</span>
            <span className="block font-label-sm text-label-sm text-on-surface-variant">Nouveau solde prévu : {String(solde).padStart(2, "0")}j</span>
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className={LIBELLE}>
            Remplaçant désigné (Continuité du Service Public) <span className="text-error">*</span>
          </span>
          <select className={`${CHAMP} cursor-pointer`} value={saisie.interim} onChange={champ("interim")} required>
            {collegues.length ? (
              collegues.map((item) => (
                <option key={item.nom} value={item.nom}>{item.nom}</option>
              ))
            ) : (
              <option value="">Aucun collègue n'est versé dans ce service.</option>
            )}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className={LIBELLE}>Observations ou adresse de séjour durant le congé</span>
          <textarea
            className="w-full px-3 py-2 bg-surface-container-low text-on-surface font-body-md text-body-md rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder="Résidence durant la période, contact joignable d'urgence..."
            rows={2}
            value={saisie.observations}
            onChange={champ("observations")}
          />
        </label>
      </div>
    </Modale>
  );
}
