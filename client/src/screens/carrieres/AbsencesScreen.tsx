import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { AppChrome } from "../AppChrome";

type Sens = "valider" | "invalider";
type TypeAutorisation = "autorisation" | "autorisation-speciale" | "permission-speciale";
type Autorisation = {
  id: number;
  agent: AgentBrief & { fonction: string };
  type: TypeAutorisation;
  type_libelle: string;
  justificatif: string;
  debut: string;
  fin: string;
  jours: number;
  decision: "en_attente" | "validee" | "invalidee";
  motif_decision: string;
  impact_solde: string;
  impact_detail: string;
};
type Registre = {
  exercice: number;
  presenteisme: { taux: number | null; evolution: number | null; objectif: number | null };
  indicateurs: { total: number; en_attente: number; validee: number; invalidee: number };
  ventilation: { code: TypeAutorisation; libelle: string; nombre: number; part: number }[];
  types: { code: TypeAutorisation; libelle: string }[];
  autorisations: Autorisation[];
  agents: { matricule: string; nom_complet: string; organisme_sigle: string; structure: string }[];
};

const ROUTE = "/api/v1/carrieres/absences/";
const PAR_PAGE = 4;
const COULEUR_TYPE: Record<TypeAutorisation, string> = {
  autorisation: "bg-primary-container",
  "autorisation-speciale": "bg-surface-tint",
  "permission-speciale": "bg-secondary-container",
};
const ICONE_TYPE: Record<TypeAutorisation, string> = {
  autorisation: "description",
  "autorisation-speciale": "local_hospital",
  "permission-speciale": "diversity_1",
};
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function jourMois(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${String(jour).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function periode(debut: string, fin: string): string {
  if (debut === fin) return jourMois(debut);
  return `${jourMois(debut).replace(/ \d{4}$/, "")} au ${jourMois(fin)}`;
}

function deuxChiffres(nombre: number): string {
  return String(nombre).padStart(2, "0");
}

function part(nombre: number, total: number): string {
  return `${total ? Math.round((nombre * 100) / total) : 0}%`;
}

/** Absences : ventilation des motifs, autorisations à statuer et régularisation des justificatifs. */
export function AbsencesScreen() {
  const feedback = useFeedback();
  const registre = useQuery({ queryKey: ["carrieres-absences"], queryFn: () => api<Registre>(ROUTE) });
  const [cible, setCible] = useState<{ autorisation: Autorisation; sens: Sens } | null>(null);
  const [entite, setEntite] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const donnees = registre.data;
  const filtrees = useMemo(
    () => (donnees?.autorisations ?? []).filter((item) => (!entite || item.agent.organisme_sigle === entite) && (!type || item.type === type)),
    [donnees, entite, type],
  );
  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages);
  const visibles = filtrees.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);
  const entites = [...new Set((donnees?.autorisations ?? []).map((item) => item.agent.organisme_sigle))].sort();
  const total = donnees?.indicateurs.total ?? 0;
  const presence = donnees?.presenteisme;

  async function exporterAssiduite() {
    const annee = donnees?.exercice ?? new Date().getFullYear();
    const mois = String(new Date().getMonth() + 1).padStart(2, "0");
    await feedback.run(
      "Préparation du rapport…",
      () => telecharger("/api/v1/carrieres/absences/export/", `rapport-assiduite-${annee}-${mois}.pdf`),
      { success: { title: "Rapport d'assiduité exporté" }, error: "L'export n'a pas abouti" },
    );
  }

  return (
    <AppChrome>
      <div className="flex flex-col w-full">
        <div className="px-6 py-6 max-w-[1600px] w-full mx-auto space-y-6">
          {/* En-tête de section régalienne */}
          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                {/* Fil d'Ariane formel */}
                <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                  <span className="hover:text-primary transition-colors">SD Gestion des Carrières</span>
                  {" "}
                  <span className="material-symbols-outlined text-xs">chevron_right</span>
                  {" "}
                  <span className="hover:text-primary transition-colors">{"Temps de Service & Suivi"}</span>
                  {" "}
                  <span className="material-symbols-outlined text-xs">chevron_right</span>
                  {" "}
                  <span className="text-primary font-bold">Validation des autorisations</span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                  Validation des autorisations d'absence
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                  Page du gestionnaire. Chaque demande d'autorisation se valide ou s'invalide, avec un motif à l'appui.
                </p>
              </div>
              {/* Actions rapides de haut de page */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-surface-container text-primary font-label-lg text-label-lg hover:bg-surface-container-high transition-colors" type="button" onClick={() => void exporterAssiduite()}>
                  <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                  {" "}
                  <span>Rapport d'Assiduité Mensuel (PDF)</span>
                </button>
              </div>
            </div>
          </div>
          {/* KPIs Métriques d'Assiduité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* KPI 1 : le présentéisme provient du pointage (indicateur de pilotage) */}
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase font-semibold">Taux de Présentéisme Global</span>
                <span className="w-8 h-8 rounded bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">how_to_reg</span>
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">{presence?.taux != null ? `${presence.taux.toFixed(1)}%` : "—"}</span>
                {presence?.evolution != null ? (
                  <span className={`inline-flex items-center text-xs font-semibold ${presence.evolution >= 0 ? "text-primary" : "text-error"}`}>
                    <span className="material-symbols-outlined text-sm">{presence.evolution >= 0 ? "trending_up" : "trending_down"}</span>
                    {presence.evolution >= 0 ? "+" : ""}
                    {presence.evolution.toFixed(1)}%
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                <span>Objectif ministériel</span>
                <span className="font-bold text-primary">{presence?.objectif != null ? `≥ ${presence.objectif.toFixed(1)}%` : "—"}</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: `${presence?.taux ?? 0}%` }} />
              </div>
            </div>
            <Indicateur
              titre="Autorisations validées"
              icone="assignment_turned_in"
              valeur={donnees?.indicateurs.validee}
              unite="dossiers justifiés"
              detail="Autorisations d'absence, autorisations spéciales et permissions spéciales"
              part={part(donnees?.indicateurs.validee ?? 0, total)}
              ton="neutre"
            />
            <Indicateur
              titre="En attente de décision"
              icone="alarm"
              valeur={donnees?.indicateurs.en_attente}
              unite="à statuer"
              detail="Justificatif à examiner sous 48 h"
              part={part(donnees?.indicateurs.en_attente ?? 0, total)}
              ton="attention"
            />
            <Indicateur
              titre="Retenues sur solde (tantièmes)"
              icone="gavel"
              valeur={donnees?.indicateurs.invalidee}
              unite="autorisations invalidées"
              detail="Retenue au 1/30e par jour d'absence"
              part={part(donnees?.indicateurs.invalidee ?? 0, total)}
              ton="erreur"
            />
          </div>
          {/* Section analytique: Grille Bento (Ventilation + Cadre Juridique Art. 38) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Ventilation des Motifs de l'Exercice */}
            <div className="lg:col-span-8 bg-surface-container-lowest p-6 rounded-xl shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Ventilation Statutaire des Motifs d'Absence</h2>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    Exercice {donnees?.exercice ?? ""} - Ensemble des entités sous tutelle
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded bg-surface-container text-on-surface font-code-num text-code-num font-bold whitespace-nowrap">
                  Total : {total} cas déclarés
                </span>
              </div>
              <div className="space-y-4 pt-2">
                {registre.isPending
                  ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-8 w-full" />)
                  : (donnees?.ventilation ?? []).map((ligne) => (
                      <div key={ligne.code} className="space-y-1.5">
                        <div className="flex justify-between gap-3 font-label-md text-label-md">
                          <span className="text-on-surface font-semibold flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${COULEUR_TYPE[ligne.code]} inline-block`} />
                            {ligne.libelle}
                          </span>
                          <span className="font-code-num text-code-num text-on-surface font-bold whitespace-nowrap">
                            {ligne.part}% ({ligne.nombre} cas)
                          </span>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                          <div className={`${COULEUR_TYPE[ligne.code]} h-full rounded-full`} style={{ width: `${ligne.part}%` }} />
                        </div>
                      </div>
                    ))}
              </div>
              <div className="pt-4 flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm bg-surface-container-low p-3 rounded-lg">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-primary">verified</span>
                  {" "}Toutes les autorisations de plus de 72h requièrent le visa du Directeur des Ressources Humaines.
                </span>
                {" "}
                <button type="button" className="text-primary font-bold hover:underline">Exporter le registre exhaustif</button>
              </div>
            </div>
            {/* Bloc Alerte & Règle du Service Fait (Article 38) */}
            <div className="lg:col-span-4 bg-surface-container-low p-6 rounded-xl shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-secondary">
                  <span className="material-symbols-outlined text-2xl">policy</span>
                  {" "}
                  <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Règle du Service Fait</span>
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-code-num text-code-num font-bold">
                  {"Art. 38 - Statut Général & Dir. Paie"}
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  « Toute absence non légalement autorisée ou non justifiée dans un délai impératif de quarante-huit (48) heures entraîne de plein droit une retenue sur traitement calculée au trentième indivisible (1/30ème) par jour d'interruption de service. »
                </p>
                <div className="bg-surface-container-lowest p-3 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                    <span>Constat d'abandon de poste :</span>
                    {" "}
                    <span className="font-bold text-error">À compter de J+15</span>
                  </div>
                  <div className="flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                    <span>Délai légal de transmission solde :</span>
                    {" "}
                    <span className="font-bold text-primary">Le 20 du mois M</span>
                  </div>
                  <div className="flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                    <span>Organe compétent :</span>
                    {" "}
                    <span className="font-bold text-on-surface">Direction du Contrôle Financier</span>
                  </div>
                </div>
              </div>
              <div className="pt-4">
                <button className="w-full py-2 px-3 rounded bg-secondary-container text-on-secondary-container font-label-md text-label-md font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity" type="button">
                  <span className="material-symbols-outlined text-base">warning</span>
                  {" "}Émettre un Avis d'Avertissement Solde
                </button>
              </div>
            </div>
          </div>
          {/* Registre Général d'Instruction des Déclarations d'Absence */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Autorisations à statuer</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Le gestionnaire valide ou invalide la demande. Le motif est consigné avec la décision.
                </p>
              </div>
              {/* Filtres rapides */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filtrer par entité"
                  className="px-3 py-1.5 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={entite}
                  onChange={(event) => {
                    setEntite(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Toutes les entités</option>
                  {entites.map((sigle) => (
                    <option key={sigle} value={sigle}>{sigle}</option>
                  ))}
                </select>
                <select
                  aria-label="Filtrer par type d'absence"
                  className="px-3 py-1.5 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Tous les types</option>
                  {(donnees?.types ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.libelle}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Tableau Administratif Conforme */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-3 px-4 rounded-l">{"Agent Public & Matricule"}</th>
                    <th className="py-3 px-4">{"Motif & Justificatif Règlementaire"}</th>
                    <th className="py-3 px-4">{"Période & Durée"}</th>
                    <th className="py-3 px-4">État de Conformité</th>
                    <th className="py-3 px-4">Impact Solde</th>
                    <th className="py-3 px-4 text-right rounded-r">Décision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {registre.isPending ? (
                    <tr>
                      <td colSpan={6} className="py-4 px-4">
                        <Skeleton className="h-10 w-full" />
                      </td>
                    </tr>
                  ) : registre.isError ? (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-error">Le registre des autorisations n'a pas pu être chargé.</td>
                    </tr>
                  ) : visibles.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-on-surface-variant">Aucune autorisation ne correspond à ces filtres.</td>
                    </tr>
                  ) : (
                    visibles.map((item) => <LigneAutorisation key={item.id} autorisation={item} onChoisir={(sens) => setCible({ autorisation: item, sens })} />)
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 text-on-surface-variant font-label-sm text-label-sm">
              <div>
                {filtrees.length
                  ? `Affichage de ${(pageCourante - 1) * PAR_PAGE + 1} à ${Math.min(pageCourante * PAR_PAGE, filtrees.length)} sur ${filtrees.length} autorisations enregistrées pour l'exercice en cours`
                  : "Aucune autorisation affichée"}
              </div>
              <div className="flex items-center gap-1">
                <button className="px-3 py-1 rounded bg-surface-container-low text-on-surface hover:bg-surface-container font-semibold disabled:opacity-50" disabled={pageCourante <= 1} type="button" onClick={() => setPage(pageCourante - 1)}>
                  Précédent
                </button>
                {Array.from({ length: pages }, (_, index) => index + 1).map((numero) => (
                  <button
                    key={numero}
                    type="button"
                    aria-current={numero === pageCourante ? "page" : undefined}
                    className={`px-3 py-1 rounded font-semibold ${numero === pageCourante ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface hover:bg-surface-container"}`}
                    onClick={() => setPage(numero)}
                  >
                    {numero}
                  </button>
                ))}
                <button className="px-3 py-1 rounded bg-surface-container-low text-on-surface hover:bg-surface-container font-semibold disabled:opacity-50" disabled={pageCourante >= pages} type="button" onClick={() => setPage(pageCourante + 1)}>
                  Suivant
                </button>
              </div>
            </div>
          </div>
          {/* Section Bi-partite: Saisie Directe de Régularisation & Journal d'Audit Biométrique */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Formulaire d'Enregistrement Rapide / Régularisation de Justificatif */}
            <div className="lg:col-span-7 bg-surface-container-lowest p-6 rounded-xl shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded bg-primary text-on-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-base">cloud_upload</span>
                  </span>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">
                      {"Régularisation & Téléversement de Pièce Certifiée"}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Instruction directe du certificat ou de l'ordre de mission officiel
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded bg-surface-container text-on-surface">Transmission</span>
              </div>
              <FormulaireRegularisation agents={donnees?.agents ?? []} types={donnees?.types ?? []} />
            </div>
            {/* Contrôle biométrique reporté à une version ultérieure */}
            <div className="lg:col-span-5 bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded bg-surface-container-high text-on-surface flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">history</span>
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">{"Contrôle Biométrique & Écarts"}</h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{"Liaison bornes physiques & pointage SIGRH"}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold whitespace-nowrap shrink-0">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  {" "}Version ultérieure
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Le recoupement des bornes biométriques et du pointage sera livré dans une version ultérieure.
              </p>
            </div>
          </div>
        </div>
      </div>
      {cible ? <ModaleDecision autorisation={cible.autorisation} sens={cible.sens} onClose={() => setCible(null)} /> : null}
    </AppChrome>
  );
}

function Indicateur({ titre, icone, valeur, unite, detail, part, ton }: { titre: string; icone: string; valeur: number | undefined; unite: string; detail: string; part: string; ton: "neutre" | "attention" | "erreur" }) {
  const couleurs = {
    neutre: { titre: "text-on-surface-variant", pastille: "bg-surface-container-high text-on-surface", valeur: "text-on-surface", barre: "bg-surface-tint" },
    attention: { titre: "text-secondary", pastille: "bg-secondary-fixed text-on-secondary-fixed", valeur: "text-secondary", barre: "bg-secondary-container" },
    erreur: { titre: "text-error", pastille: "bg-error-container text-on-error-container", valeur: "text-error", barre: "bg-error" },
  }[ton];
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between relative">
      <div className="flex items-center justify-between mb-3">
        <span className={`font-label-md text-label-md ${couleurs.titre} uppercase font-semibold`}>{titre}</span>
        <span className={`w-8 h-8 rounded ${couleurs.pastille} flex items-center justify-center`}>
          <span className="material-symbols-outlined text-lg">{icone}</span>
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-headline-xl text-headline-xl ${couleurs.valeur} font-bold`}>{valeur === undefined ? "—" : deuxChiffres(valeur)}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{unite}</span>
      </div>
      <div className="mt-3 font-label-sm text-label-sm text-on-surface-variant line-clamp-1">{detail}</div>
      <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
        <div className={`${couleurs.barre} h-full rounded-full`} style={{ width: part }} />
      </div>
    </div>
  );
}

function LigneAutorisation({ autorisation, onChoisir }: { autorisation: Autorisation; onChoisir: (sens: Sens) => void }) {
  const { agent } = autorisation;
  return (
    <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-sm shrink-0">{agent.initiales}</div>
          <div>
            <div className="font-label-lg text-label-lg font-bold text-on-surface">{agent.nom_complet}</div>
            <div className="font-code-num text-code-num text-on-surface-variant flex flex-wrap items-center gap-2">
              <span>Mat. {agent.matricule}</span>
              <span aria-hidden="true">•</span>
              <span>Grade {agent.grade}</span>
              <span aria-hidden="true">•</span>
              <span className="px-1.5 py-0.2 rounded bg-surface-container text-on-surface text-[11px] font-semibold">{agent.organisme_sigle}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="font-semibold text-on-surface">{autorisation.type_libelle}</div>
        <div className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
          <span className="material-symbols-outlined text-xs text-primary" aria-hidden="true">{ICONE_TYPE[autorisation.type]}</span>
          {autorisation.justificatif}
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="font-code-num text-code-num font-semibold text-on-surface">{periode(autorisation.debut, autorisation.fin)}</div>
        <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-surface-container text-primary font-code-num text-code-num">
          {autorisation.jours} jour{autorisation.jours > 1 ? "s" : ""} ouvré{autorisation.jours > 1 ? "s" : ""}
        </span>
      </td>
      <td className="py-4 px-4">
        <EtatDecision decision={autorisation.decision} />
      </td>
      <td className="py-4 px-4">
        <div className={`font-semibold ${autorisation.decision === "invalidee" ? "text-error" : "text-primary"}`}>{autorisation.impact_solde}</div>
        <div className="text-xs text-on-surface-variant">{autorisation.impact_detail}</div>
      </td>
      <td className="py-4 px-4 text-right">
        <ActionsDecision autorisation={autorisation} onChoisir={onChoisir} />
      </td>
    </tr>
  );
}

function EtatDecision({ decision }: { decision: Autorisation["decision"] }) {
  if (decision === "validee") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
        Conforme & approuvée
      </span>
    );
  }
  if (decision === "invalidee") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-error" />
        Invalidée
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
      En attente de décision
    </span>
  );
}

function ActionsDecision({ autorisation, onChoisir }: { autorisation: Autorisation; onChoisir: (sens: Sens) => void }) {
  if (autorisation.decision !== "en_attente") {
    const valide = autorisation.decision === "validee";
    return (
      <div className="text-right">
        <span className={`inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold ${valide ? "text-primary" : "text-error"}`}>
          <span className="material-symbols-outlined text-base" aria-hidden="true">{valide ? "check_circle" : "cancel"}</span>
          {valide ? "Validée" : "Invalidée"}
        </span>
        <p className="text-xs text-on-surface-variant mt-1 max-w-[220px] ml-auto">Motif : {autorisation.motif_decision}</p>
      </div>
    );
  }
  const nom = autorisation.agent.nom_complet;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button className="px-2.5 py-1 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container" type="button" aria-label={`Valider : ${nom}`} onClick={() => onChoisir("valider")}>
        Valider
      </button>
      <button className="px-2.5 py-1 rounded bg-error text-on-error text-xs font-semibold hover:bg-error/90" type="button" aria-label={`Invalider : ${nom}`} onClick={() => onChoisir("invalider")}>
        Invalider
      </button>
    </div>
  );
}

/** Le motif est exigé avant d'enregistrer la validation ou l'invalidation. */
function ModaleDecision({ autorisation, sens, onClose }: { autorisation: Autorisation; sens: Sens; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [motif, setMotif] = useState("");
  const [manquant, setManquant] = useState(false);
  const valider = sens === "valider";
  const decision = useMutation({
    mutationFn: () => api<Autorisation>(`/api/v1/absences/${autorisation.id}/decision/`, { method: "POST", body: JSON.stringify({ sens, motif: motif.trim() }) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-absences"] });
      feedback.toast(valider ? "Autorisation validée" : "Autorisation invalidée", `${autorisation.agent.nom_complet} · ${autorisation.type_libelle}`);
      onClose();
    },
  });
  const erreur = manquant ? "Le motif est obligatoire." : decision.error instanceof ApiError ? decision.error.message : decision.isError ? "La décision n'a pas été enregistrée." : undefined;
  return (
    <Modale
      titre={valider ? "Valider l'autorisation" : "Invalider l'autorisation"}
      sousTitre={`${autorisation.agent.nom_complet} · ${autorisation.type_libelle}`}
      icone={valider ? "task_alt" : "block"}
      ton={valider ? "neutre" : "danger"}
      taille="md"
      onClose={onClose}
      onSubmit={() => (motif.trim() ? decision.mutate() : setManquant(true))}
      enCours={decision.isPending}
      erreur={erreur}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={decision.isPending}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={decision.isPending}>
            {decision.isPending ? <span className="material-symbols-outlined text-lg motion-spin" aria-hidden="true">progress_activity</span> : null}
            Enregistrer la décision
          </button>
        </>
      }
    >
      <label className="block">
        <span className="block font-label-md text-label-md text-on-surface font-semibold mb-1">
          Motif de la décision <span className="text-error">*</span>
        </span>
        <textarea
          className="w-full p-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
          value={motif}
          placeholder="Indiquez le motif qui justifie la validation ou l'invalidation."
          onChange={(event) => {
            setMotif(event.target.value);
            setManquant(false);
          }}
        />
      </label>
    </Modale>
  );
}

const CHAMP = "w-full h-10 px-3 rounded bg-surface-container-low text-on-surface text-body-sm focus:outline-none focus:ring-1 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold";

/** Le gestionnaire verse une autorisation avec sa pièce : elle entre au registre, en attente de décision. */
function FormulaireRegularisation({ agents, types }: { agents: Registre["agents"]; types: Registre["types"] }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const vide = { matricule: "", type: "", debut: "", fin: "", notifier: true };
  const [saisie, setSaisie] = useState(vide);
  const [fichier, setFichier] = useState<File | null>(null);
  const [cle, setCle] = useState(0);
  const agent = agents.find((item) => item.matricule.toLowerCase() === saisie.matricule.trim().toLowerCase());
  const envoi = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      corps.set("matricule", saisie.matricule.trim());
      corps.set("type", saisie.type);
      corps.set("debut", saisie.debut);
      corps.set("fin", saisie.fin);
      corps.set("notifier", saisie.notifier ? "1" : "0");
      if (fichier) corps.set("fichier", fichier);
      return api<Autorisation>(ROUTE, { method: "POST", body: corps });
    },
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ["carrieres-absences"] });
      feedback.toast("Autorisation versée au registre", `${item.agent.nom_complet} · en attente de décision.`);
      setSaisie(vide);
      setFichier(null);
      setCle((valeur) => valeur + 1);
    },
  });

  function soumettre(event: FormEvent) {
    event.preventDefault();
    envoi.mutate();
  }

  return (
    <form className="space-y-4" onSubmit={soumettre}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-1 block">
          <span className={LIBELLE}>
            Matricule de l'agent <span className="text-error">*</span>
          </span>
          <input className={CHAMP} list="agents-absences" placeholder="Ex : 394812H" required type="text" value={saisie.matricule} onChange={(event) => setSaisie({ ...saisie, matricule: event.target.value })} />
          <datalist id="agents-absences">
            {agents.map((item) => (
              <option key={item.matricule} value={item.matricule}>{item.nom_complet}</option>
            ))}
          </datalist>
        </label>
        <label className="space-y-1 block">
          <span className={LIBELLE}>
            Type d'autorisation réglementaire <span className="text-error">*</span>
          </span>
          <select className={CHAMP} required value={saisie.type} onChange={(event) => setSaisie({ ...saisie, type: event.target.value })}>
            <option value="">Sélectionner un type d'absence…</option>
            {types.map((item) => (
              <option key={item.code} value={item.code}>{item.libelle}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="space-y-1 block">
          <span className={LIBELLE}>
            Date de début <span className="text-error">*</span>
          </span>
          <input className={CHAMP} required type="date" value={saisie.debut} onChange={(event) => setSaisie({ ...saisie, debut: event.target.value })} />
        </label>
        <label className="space-y-1 block">
          <span className={LIBELLE}>
            Date de fin (incluse) <span className="text-error">*</span>
          </span>
          <input className={CHAMP} required type="date" min={saisie.debut || undefined} value={saisie.fin} onChange={(event) => setSaisie({ ...saisie, fin: event.target.value })} />
        </label>
        <label className="space-y-1 block">
          <span className={LIBELLE}>Entité d'affectation</span>
          <input className={CHAMP} readOnly type="text" value={agent ? `${agent.organisme_sigle} · ${agent.structure}` : ""} placeholder="Selon le matricule" />
        </label>
      </div>
      {agent ? <p className="font-label-md text-label-md text-primary font-semibold">{agent.nom_complet}</p> : null}
      {/* Pièce justificative */}
      <label className="block p-4 rounded-xl bg-surface-container-low text-center space-y-2 cursor-pointer hover:bg-surface-container transition-colors">
        <span className="material-symbols-outlined text-3xl text-primary" aria-hidden="true">note_add</span>
        <span className="block font-label-lg text-label-lg font-semibold text-on-surface">{fichier ? fichier.name : "Déposez le document probant"}</span>
        <span className="block font-body-sm text-body-sm text-on-surface-variant">PDF ou image : certificat médical, ordre de mission ou acte d'état civil</span>
        <input key={cle} className="sr-only" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFichier(event.target.files?.[0] ?? null)} />
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container text-primary font-label-sm text-label-sm font-semibold">
          <span className="material-symbols-outlined text-base" aria-hidden="true">attach_file</span>
          Parcourir les fichiers
        </span>
      </label>
      {envoi.isError ? (
        <p className="font-body-sm text-body-sm text-error" role="alert">
          {envoi.error instanceof ApiError ? envoi.error.message : "L'autorisation n'a pas été versée."}
        </p>
      ) : null}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <label className="flex items-center gap-2 cursor-pointer font-body-sm text-body-sm text-on-surface">
          <input checked={saisie.notifier} className="rounded text-primary focus:ring-primary" type="checkbox" onChange={(event) => setSaisie({ ...saisie, notifier: event.target.checked })} />
          Notifier le gestionnaire chargé de statuer
        </label>
        <button className="px-5 py-2.5 rounded bg-primary text-on-primary font-label-lg text-label-lg font-bold shadow hover:bg-primary-container transition-colors disabled:opacity-60" type="submit" disabled={envoi.isPending}>
          {envoi.isPending ? "Versement…" : "Soumettre la régularisation"}
        </button>
      </div>
    </form>
  );
}
