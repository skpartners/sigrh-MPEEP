import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { Dossier, SessionUser } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Pagination, usePagination } from "../../ui/Pagination";
import { CalendrierAnnuel, PERIODES_VIDES, type Collegue } from "../../ui/CalendrierAnnuel";
import { ApercuCertificat } from "./CertificatCessation";
import { CircuitDemande, absenceEnCours, demandeClose, jour, periode, pluriel, useDocumentAgent, type Absence } from "./commun";
import { Icone } from "../../ui/Icone";
import { Select } from "../../ui/Select";

function valeurs(agent: Dossier) {
  const { acquis, consommes, reliquat, report } = agent.conges;
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
    // D'où vient le solde : les jours qui restent, exercice par exercice.
    parExercice: agent.conges.droits.filter((droit) => droit.restant > 0),
  };
}

/** Droits de congé annuel par exercice. Un exercice antérieur à N-1 est un reliquat, que le DRH peut annuler. */
function DroitsParExercice({ agent }: { agent: Dossier }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const moi = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const droits = agent.conges.droits;
  if (droits.length === 0) return null;

  async function annuler(annee: number) {
    try {
      const dossier = await feedback.run(
        "Annulation du reliquat…",
        () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/droits-conges/${annee}/remise-a-zero/`, { method: "POST" }),
        { success: { title: "Reliquat annulé", message: `Le reliquat de ${annee} est remis à zéro.` }, error: "Le reliquat n'a pas pu être annulé." },
      );
      client.setQueryData(["agent", agent.matricule], dossier);
      setConfirmation(null);
    } catch {
      /* le toast d'erreur est déjà affiché */
    }
  }

  return (
    <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3" aria-labelledby="droits-exercice">
      <h2 id="droits-exercice" className="font-headline-sm text-headline-sm text-on-surface">Droits par exercice</h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Les congés (N-1) se prennent aux dates arrêtées par la campagne. Le reliquat (N-2 et plus ancien) se prend aux dates choisies par l'agent, en année courante ; le DRH peut l'annuler.
      </p>
      <ul className="divide-y divide-hairline">
        {droits.map((droit) => (
          <li key={droit.annee} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
            <span className="w-16 font-code-num text-code-num font-bold text-on-surface">{droit.annee}</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">{droit.pris} / {droit.dus} j pris · <strong className="text-on-surface">{droit.restant} j restants</strong></span>
            <span className={`rounded-full px-2 font-label-sm text-label-sm font-bold ${droit.reliquat ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-primary-fixed text-on-primary-fixed"}`}>
              {droit.reliquat ? "Reliquat" : "Congés"}
            </span>
            {droit.remis_a_zero_le ? <span className="font-label-sm text-label-sm text-on-surface-variant">Annulé le {jour(droit.remis_a_zero_le)}</span> : null}
            {moi.data?.drh && droit.reliquat && droit.restant > 0 ? (
              <span className="ml-auto flex items-center gap-2">
                {confirmation === droit.annee ? (
                  <>
                    <button type="button" className="rounded bg-error px-3 py-1.5 font-label-sm text-label-sm text-on-error" onClick={() => void annuler(droit.annee)}>
                      Confirmer : retirer {droit.restant} j
                    </button>
                    <button type="button" className="rounded px-3 py-1.5 font-label-sm text-label-sm text-on-surface-variant hover:bg-surface-container" onClick={() => setConfirmation(null)}>Garder</button>
                  </>
                ) : (
                  <button type="button" className="rounded border border-error px-3 py-1.5 font-label-sm text-label-sm text-error hover:bg-error-container/50" onClick={() => setConfirmation(droit.annee)}>
                    Remettre à zéro
                  </button>
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
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
              <span>Demander un congé</span>
            </button>
          </div>
        </div>
        {/* Section 1: Compteurs Statutaires de Droits */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Card 1: Solde Disponible Principal */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  Congés disponibles
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-headline-xl text-headline-xl text-primary font-bold">{v.reliquat}</span>
                  {" "}
                  <span className="font-label-lg text-label-lg text-on-surface-variant font-medium">jours ouvrables</span>
                </div>
                {v.parExercice.length ? (
                  <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Solde par exercice">
                    {v.parExercice.map((droit) => (
                      <li key={droit.annee} className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-semibold ${droit.reliquat ? "bg-secondary-fixed text-on-secondary-fixed" : "bg-primary-fixed text-on-primary-fixed"}`}>
                        {droit.annee} · {droit.restant} j{droit.reliquat ? " (reliquat)" : ""}
                      </li>
                    ))}
                  </ul>
                ) : agent.conges.report > 0 ? (
                  <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Reliquat">
                    <li className="rounded-full bg-secondary-fixed px-2.5 py-0.5 font-label-sm text-label-sm font-semibold text-on-secondary-fixed">Reliquat · {Math.min(agent.conges.report, agent.conges.reliquat)} j</li>
                  </ul>
                ) : null}
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
                <div className="motion-fill bg-primary h-full rounded-full" style={{ width: `${v.partBornee}%` }} />
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
        </div>
        <DroitsParExercice agent={agent} />
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
            <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune demande de congé n'est en cours pour ce dossier.</p>
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
                <Select aria-label="Exercice" className="h-9 px-3 pr-8 bg-surface-container-low text-on-surface font-label-sm text-label-sm rounded focus:outline-none appearance-none cursor-pointer" value={exercice} onChange={(event) => setExercice(event.target.value)}>
                  <option value="">Tous les exercices ({v.plage})</option>
                  {v.exercices.map((annee) => (
                    <option key={annee} value={annee}>Exercice {annee}</option>
                  ))}
                </Select>
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

/** Jours de congé annuel qu'on peut prendre au titre d'un seul exercice. */
const PLAFOND_EXERCICE = 30;

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

/** Le lendemain d'un jour « AAAA-MM-JJ » : le jour de reprise après un dernier jour de congé. */
function lendemain(iso: string): string {
  const jour = new Date(`${iso}T00:00:00`);
  jour.setDate(jour.getDate() + 1);
  return `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, "0")}-${String(jour.getDate()).padStart(2, "0")}`;
}

/** `fin` est le jour de reprise ; `dernier`, le dernier jour de congé. */
type PeriodeArretee = { debut: string; fin: string; dernier: string };
type PlanArrete = { moi: boolean; palier: string; debut: string; fin: string; debut2: string | null; fin2: string | null };

/** Jours entre le départ (inclus) et la reprise (exclue) : tous les jours pour le congé annuel, sinon les jours ouvrables. */
function joursDecomptes(debut: string, fin: string, annuel: boolean): number {
  const depart = new Date(`${debut}T00:00:00`);
  const retour = new Date(`${fin}T00:00:00`);
  if (Number.isNaN(depart.getTime()) || Number.isNaN(retour.getTime()) || retour <= depart) return 0;
  let compte = 0;
  for (const date = new Date(depart); date < retour; date.setDate(date.getDate() + 1)) {
    const semaine = date.getDay();
    if (annuel || (semaine !== 0 && semaine !== 6)) compte += 1;
  }
  return compte;
}

export function FormulaireConge({ agent, onClose }: { agent: Dossier; onClose: () => void }) {
  const feedback = useFeedback();
  const client = useQueryClient();
  const collegues = agent.presence.membres.filter((item) => !item.vous);
  const premierType = agent.types_conges[0] ? (agent.types_conges[0].enfants[0]?.code ?? agent.types_conges[0].code) : "";
  const initiale: Saisie = { type: premierType, debut: "", fin: "", interim: "", observations: "" };
  const [saisie, setSaisie] = useState<Saisie>(() => {
    const brouillon = lireBrouillon(agent.matricule);
    if (!brouillon) return initiale;
    return { ...brouillon, interim: collegues.some((item) => item.nom === brouillon.interim) ? brouillon.interim : "" };
  });
  const [enCours, setEnCours] = useState(false);
  // Seuls les exercices qui donnent droit à un congé sont proposés. En principe N-1, aux dates de la campagne ;
  // un exercice plus ancien est un reliquat, dont l'agent choisit lui-même le départ en année N.
  const droitsOuverts = agent.conges.droits.filter((droit) => droit.restant > 0);
  const anneeCourante = new Date().getFullYear();
  const exerciceNormal = anneeCourante - 1;
  const [exerciceDemande, setExerciceDemande] = useState<number | null>(null);
  // N-1 par défaut ; un exercice plus ancien n'est proposé que s'il reste des jours (le DRH peut les annuler).
  const exercicesProposes = [exerciceNormal, ...droitsOuverts.map((droit) => droit.annee).filter((annee) => annee < exerciceNormal)].sort((a, b) => b - a);
  const exerciceChoisi = exerciceDemande !== null && exercicesProposes.includes(exerciceDemande) ? exerciceDemande : exerciceNormal;
  const droitChoisi = agent.conges.droits.find((droit) => droit.annee === exerciceChoisi);
  // Les dates du congé annuel sont celles que la campagne de planification a arrêtées : l'agent active une période.
  const planification = useQuery({ queryKey: ["planification-conges"], queryFn: () => api<{ plans: PlanArrete[]; collegues?: Collegue[] }>("/api/v1/conges/planification/") });
  const collegues_conges = planification.data?.collegues ?? [];
  const annuel = saisie.type === "conge-annuel" || agent.types_conges.some((type) => type.enfants.some((enfant) => enfant.code === saisie.type && /annuel/i.test(enfant.libelle)));
  const monPlan = planification.data?.plans.find((plan) => plan.moi && plan.palier === "publie");
  const arretees: PeriodeArretee[] = monPlan
    ? [{ debut: monPlan.debut, fin: lendemain(monPlan.fin), dernier: monPlan.fin }, ...(monPlan.debut2 && monPlan.fin2 ? [{ debut: monPlan.debut2, fin: lendemain(monPlan.fin2), dernier: monPlan.fin2 }] : [])]
    : [];
  const dejaDemandee = (periodeChoisie: PeriodeArretee) =>
    agent.demandes.some((demande) => demande.categorie === "conge" && demande.debut === periodeChoisie.debut && demande.fin === periodeChoisie.fin && !/refus/i.test(demande.etape));
  const reliquat = annuel && Boolean(droitChoisi?.reliquat);
  const verrouille = annuel && !reliquat && arretees.length > 0;
  const disponibles = arretees.filter((item) => !dejaDemandee(item));
  // Deux tranches : la plus ancienne se demande d'abord.
  const prochaine = disponibles[0];
  // Verrouillé : la période choisie est l'une des périodes encore à demander, la première par défaut.
  useEffect(() => {
    if (!verrouille) return;
    const valide = disponibles.some((item) => item.debut === saisie.debut && item.fin === saisie.fin);
    if (!valide) setSaisie((actuelle) => ({ ...actuelle, debut: disponibles[0]?.debut ?? "", fin: disponibles[0]?.fin ?? "" }));
  }, [verrouille, saisie.debut, saisie.fin, disponibles.map((item) => item.debut).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  // Passage au reliquat : les dates de la campagne ne s'appliquent plus, l'agent choisit les siennes.
  useEffect(() => {
    if (reliquat && arretees.some((item) => item.debut === saisie.debut && item.fin === saisie.fin)) setSaisie((actuelle) => ({ ...actuelle, debut: "", fin: "" }));
  }, [reliquat]); // eslint-disable-line react-hooks/exhaustive-deps
  const jours = joursDecomptes(saisie.debut, saisie.fin, annuel);
  const solde = Math.max((droitChoisi ? droitChoisi.restant : agent.conges.reliquat) - jours, 0);
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
      feedback.toast("Période invalide", "La reprise doit suivre le début et compter au moins un jour décompté.", "info");
      return;
    }
    if (annuel && jours > PLAFOND_EXERCICE) {
      feedback.toast("Plus de 30 jours", `On ne prend pas plus de ${PLAFOND_EXERCICE} jours au titre d'un seul exercice : déposez une demande par exercice.`, "info");
      return;
    }
    if (annuel && droitChoisi && jours > droitChoisi.restant) {
      feedback.toast("Droits insuffisants", `Il reste ${droitChoisi.restant} j au titre de ${droitChoisi.annee} : la demande en compte ${jours}.`, "info");
      return;
    }
    if (reliquat && saisie.debut.slice(0, 4) !== String(anneeCourante)) {
      feedback.toast("Départ en " + anneeCourante, `Les jours de ${exerciceChoisi} se prennent en ${anneeCourante} : choisissez un départ en ${anneeCourante}.`, "info");
      return;
    }
    setEnCours(true);
    try {
      await feedback.run(
        "Transmission au circuit de visa…",
        () =>
          api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/conges/demande/`, {
            method: "POST",
            body: JSON.stringify({ type: saisie.type, debut: saisie.debut, fin: saisie.fin, interim: saisie.interim.trim(), observations: saisie.observations, ...(annuel && exerciceChoisi ? { exercice: exerciceChoisi } : {}) }),
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
      titre="Demande de congés"
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
              Nature du congé <span className="text-error">*</span>
            </span>
          </span>
          <Select className={`${CHAMP} cursor-pointer`} value={saisie.type} onChange={champ("type")} required>
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
          </Select>
        </label>
        {verrouille ? (
          <fieldset className="space-y-2">
            <legend className={LIBELLE}>Période de congé arrêtée par la campagne</legend>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Vos dates sont déjà arrêtées par la campagne{exerciceChoisi ? ` (congé de ${exerciceChoisi})` : ""} et ne peuvent pas être modifiées.
              {arretees.length > 1 ? " La tranche la plus ancienne se demande d'abord." : ""}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Période de congé">
              {arretees.map((item, rang) => {
                const deja = dejaDemandee(item);
                const enAttente = !deja && item !== prochaine;
                const choisie = saisie.debut === item.debut && saisie.fin === item.fin;
                const nombre = joursDecomptes(item.debut, item.fin, true);
                return (
                  <button
                    key={item.debut}
                    type="button"
                    role="radio"
                    aria-checked={choisie}
                    disabled={deja || enAttente}
                    onClick={() => setSaisie((actuelle) => ({ ...actuelle, debut: item.debut, fin: item.fin }))}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${choisie ? "border-primary bg-primary-fixed/50" : "border-hairline bg-surface-container-low hover:bg-surface-container"}`}
                  >
                    <Icone nom={deja ? "check_circle" : choisie ? "radio_button_checked" : "radio_button_unchecked"} className={`text-2xl ${choisie ? "text-primary" : "text-on-surface-variant"}`} />
                    <span className="min-w-0">
                      <span className="block font-label-md text-label-md font-bold text-on-surface">{arretees.length > 1 ? `Période ${rang + 1}` : "Votre période"}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant">
                        {periode(item.debut, item.dernier)} · {pluriel(nombre, "jour")}
                      </span>
                      {deja ? <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 font-label-sm text-label-sm font-bold text-primary">Déjà demandée</span> : null}
                      {enAttente ? <span className="mt-1 inline-block rounded-full bg-surface-container-high px-2 font-label-sm text-label-sm font-bold text-on-surface-variant">À demander après la première période</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {disponibles.length === 0 ? <p className="font-body-sm text-body-sm text-on-surface-variant">Toutes vos périodes de congé annuel ont déjà été demandées.</p> : null}
          </fieldset>
        ) : (
          <>
            {reliquat ? (
              <p className="rounded-lg border border-secondary bg-secondary-fixed/40 p-3 font-body-sm text-body-sm text-on-surface">
                Reliquat de {exerciceChoisi} ({droitChoisi?.restant} j) : vous choisissez vous-même vos dates de départ, en {anneeCourante}.
                Le DRH peut annuler ce reliquat.
              </p>
            ) : annuel ? (
              <p className="rounded-lg bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant">
                Aucune période n'est encore arrêtée pour vous par la campagne de planification : indiquez vos dates.
              </p>
            ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className={LIBELLE}>
              Date de début (incluse) <span className="text-error">*</span>
            </span>
            <input className={CHAMP} type="date" value={saisie.debut} min={reliquat ? `${anneeCourante}-01-01` : undefined} max={reliquat ? `${anneeCourante}-12-31` : undefined} onChange={champ("debut")} required />
          </label>
          <label className="block space-y-1.5">
            <span className={LIBELLE}>
              Date de reprise effective <span className="text-error">*</span>
            </span>
            <input className={CHAMP} type="date" value={saisie.fin} min={saisie.debut || undefined} onChange={champ("fin")} required />
          </label>
        </div>
          </>
        )}
        {collegues_conges.length > 0 ? (
          // Les plages déjà prises par les collègues de la structure : à consulter avant de choisir un départ.
          <details open={reliquat || undefined} className="group rounded-xl border border-hairline p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-label-lg text-label-lg font-bold text-on-surface">
              <Icone nom="expand_more" className="text-xl transition-transform group-open:rotate-180" />
              Congés déjà pris par vos collègues ({collegues_conges.length})
            </summary>
            <div className="mt-3">
              <CalendrierAnnuel annee={Number(saisie.debut.slice(0, 4)) || anneeCourante} valeur={PERIODES_VIDES} onChange={() => undefined} lecture collegues={collegues_conges} />
            </div>
          </details>
        ) : null}
        <div className="p-3.5 rounded bg-surface-container flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icone nom="calculate" className="text-primary text-xl" />
            <div>
              <p className="font-label-md text-label-md text-on-surface font-semibold">{annuel ? "Décompte des jours de congé annuel" : "Décompte des jours ouvrables légaux"}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{annuel ? "Samedis et dimanches compris" : "Exclut samedis et dimanches"}</p>
            </div>
          </div>
          <div className="text-right" aria-live="polite">
            <span className="font-headline-sm text-headline-sm text-primary font-bold">{pluriel(jours, "jour")}</span>
            {annuel ? <span className={`block font-label-sm text-label-sm ${jours > PLAFOND_EXERCICE ? "text-error font-bold" : "text-on-surface-variant"}`}>{jours > PLAFOND_EXERCICE ? `Plafond : ${PLAFOND_EXERCICE} jours par exercice` : `Nouveau solde prévu : ${String(solde).padStart(2, "0")}j`}</span> : null}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className={LIBELLE}>
            Remplaçant désigné (Continuité du Service Public) <span className="font-normal text-on-surface-variant">— facultatif</span>
          </span>
          <Select className={`${CHAMP} cursor-pointer`} value={saisie.interim} onChange={champ("interim")}>
            <option value="">{collegues.length ? "Aucun remplaçant désigné" : "Aucun collègue n'est versé dans ce service."}</option>
            {collegues.map((item) => (
              <option key={item.nom} value={item.nom}>{item.nom}</option>
            ))}
          </Select>
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
        <ApercuCertificat
          entree={{
            agent,
            type: saisie.type,
            libelle: agent.types_conges.flatMap((item) => (item.enfants.length ? item.enfants : [item])).find((item) => item.code === saisie.type)?.libelle,
            debut: saisie.debut,
            fin: saisie.fin,
            jours,
            annuel,
            exercice: annuel ? exerciceChoisi : agent.conges.exercice,
            exercices: exercicesProposes,
            rang: Math.max(arretees.findIndex((item) => item.debut === saisie.debut), 0),
            periodes: arretees.length,
          }}
          onExercice={setExerciceDemande}
        />
      </div>
    </Modale>
  );
}
