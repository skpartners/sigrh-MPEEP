import { QuorumStructures } from "./QuorumStructures";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Dossier, SessionUser } from "../api/types";
import { Icone } from "../ui/Icone";
import { PlanificationConges } from "./carrieres/PlanificationConges";
import { CircuitDemande, demandeClose, pluriel } from "./dossier-onglets/commun";
import { FormulaireConge } from "./dossier-onglets/OngletConges";

/** Onglet « Demande de congé » du profil : solde, dépôt d'une demande et suivi de son circuit. */
export function DemandesConges({ agent }: { agent: Dossier }) {
  const [formulaire, setFormulaire] = useState(false);
  const modifiable = agent.modifiable !== false;
  // La campagne de planification concerne le compte connecté : elle ne s'affiche que sur son propre profil.
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const monProfil = me.data?.matricule === agent.matricule;
  const demandes = agent.demandes.filter((item) => item.categorie === "conge");
  const ouvertes = demandes.filter((item) => !demandeClose(item));
  const closes = demandes.filter(demandeClose);
  const { conges } = agent;
  // Les congés sont ceux de N-1 ; le reliquat, ceux de N-2 et des exercices plus anciens, tant qu'il en reste.
  const exerciceConges = new Date().getFullYear() - 1;
  const jourDe = (garde: (annee: number) => boolean) => conges.droits.filter((droit) => garde(droit.annee)).reduce((somme, droit) => somme + droit.restant, 0);
  // Sans détail par exercice, le reliquat est le report des exercices antérieurs enregistré pour l'agent.
  const reportAnterieur = Math.min(Math.max(conges.report, 0), conges.reliquat);
  const parExercice = conges.droits.length > 0;
  const congesRestants = parExercice ? jourDe((annee) => annee === exerciceConges) : conges.reliquat - reportAnterieur;
  const reliquatRestant = parExercice ? jourDe((annee) => annee < exerciceConges) : reportAnterieur;
  const exercicesReliquat = parExercice
    ? conges.droits.filter((droit) => droit.annee < exerciceConges && droit.restant > 0).map((droit) => `${droit.annee} : ${droit.restant} j`).join(" · ")
    : reportAnterieur > 0 ? "Report des exercices antérieurs" : "";

  return (
    <div className="space-y-6">
      {monProfil ? <PlanificationConges personnel /> : null}
      {monProfil ? <QuorumStructures /> : null}
      <section className="bg-surface-container-lowest rounded-xl border border-hairline p-6" aria-labelledby="titre-solde-conges">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="titre-solde-conges" className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-2">
              <Icone nom="event_available" className="text-primary text-xl" />Demande de congé
            </h2>
          </div>
          {modifiable ? (
            <button type="button" onClick={() => setFormulaire(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary">
              <Icone nom="add" />Nouvelle demande
            </button>
          ) : null}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Solde libelle={`Congés ${exerciceConges}`} valeur={pluriel(congesRestants, "jour")} detail="Aux dates de la campagne" fort />
          <Solde libelle="Reliquat" valeur={pluriel(reliquatRestant, "jour")} detail={exercicesReliquat || "Aucun reliquat"} />
          <Solde libelle="Droits annuels acquis" valeur={pluriel(conges.acquis, "jour")} />
          <Solde libelle="Jours consommés" valeur={pluriel(conges.consommes, "jour")} />
        </dl>
        {conges.droits.length ? (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Droits de congé annuel par exercice">
            {conges.droits.map((droit) => (
              <li key={droit.annee} className="rounded-full bg-surface-container-low px-3 py-1 font-label-sm text-label-sm text-on-surface-variant">
                Exercice {droit.annee}{droit.reliquat ? " · reliquat" : " · congés"} : {pluriel(droit.restant, "jour")} restant{droit.restant > 1 ? "s" : ""} sur {droit.dus}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="titre-demandes-conges">
        <h2 id="titre-demandes-conges" className="flex items-center gap-2 rounded-lg bg-primary-fixed px-4 py-2.5 font-headline-sm text-headline-sm font-bold text-on-primary-fixed">
          <Icone nom="pending_actions" className="text-xl" />Demandes en cours ({ouvertes.length})
        </h2>
        {ouvertes.length === 0
          ? <p className="font-body-sm text-on-surface-variant">Aucune demande de congé en cours.</p>
          : ouvertes.map((demande) => <CircuitDemande key={demande.reference} demande={demande} />)}
      </section>

      {closes.length ? (
        <section className="space-y-4" aria-labelledby="titre-demandes-closes">
          <h2 id="titre-demandes-closes" className="flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2.5 font-headline-sm text-headline-sm font-bold text-on-surface">
            <Icone nom="task_alt" className="text-xl" />Demandes traitées ({closes.length})
          </h2>
          {closes.map((demande) => <CircuitDemande key={demande.reference} demande={demande} clos />)}
        </section>
      ) : null}

      {formulaire ? <FormulaireConge agent={agent} onClose={() => setFormulaire(false)} /> : null}
    </div>
  );
}

function Solde({ libelle, valeur, detail, fort = false }: { libelle: string; valeur: string; detail?: string; fort?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${fort ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container-low"}`}>
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{libelle}</dt>
      <dd className="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">{valeur}</dd>
      {detail ? <dd className="mt-1 font-label-sm text-label-sm font-semibold">{detail}</dd> : null}
    </div>
  );
}
