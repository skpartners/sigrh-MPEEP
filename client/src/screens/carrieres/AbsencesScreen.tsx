import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { AppChrome } from "../AppChrome";
import { Icone } from "../../ui/Icone";
import { Select } from "../../ui/Select";

type Sens = "valider" | "invalider";
type TypeAutorisation = "autorisation" | "autorisation-speciale" | "permission-speciale";
type Autorisation = {
  structure: string;
  demande: string;
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
};
type Registre = {
  exercice: number;
  presenteisme: { taux: number | null; evolution: number | null; objectif: number | null };
  indicateurs: { total: number; en_attente: number; validee: number; invalidee: number };
  ventilation: { code: TypeAutorisation; libelle: string; nombre: number; part: number }[];
  types: { code: TypeAutorisation; libelle: string }[];
  jours: { validee: number; en_attente: number; invalidee: number };
  autorisations: Autorisation[];
};

const ROUTE = "/api/v1/carrieres/absences/";
const PAR_PAGE = 4;
const COULEUR_TYPE: Record<TypeAutorisation, string> = {
  autorisation: "bg-primary-container",
  "autorisation-speciale": "bg-surface-tint",
  "permission-speciale": "bg-secondary-container",
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
  const [detail, setDetail] = useState<Autorisation | null>(null);
  const [entite, setEntite] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const donnees = registre.data;
  const filtrees = useMemo(
    () => (donnees?.autorisations ?? []).filter((item) => (!entite || item.structure === entite) && (!type || item.type === type)),
    [donnees, entite, type],
  );
  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages);
  const visibles = filtrees.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);
  const entites = [...new Set((donnees?.autorisations ?? []).map((item) => item.structure))].sort();
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
        <div className="px-6 py-6 w-full mx-auto space-y-6">
          {/* En-tête de section régalienne */}
          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm relative overflow-hidden motion-rise">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                {/* Fil d'Ariane formel */}
                <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                  <span className="hover:text-primary transition-colors">SD Gestion des Carrières</span>
                  {" "}
                  <Icone nom="chevron_right" className="text-xs" />
                  {" "}
                  <span className="hover:text-primary transition-colors">{"Temps de Service & Suivi"}</span>
                  {" "}
                  <Icone nom="chevron_right" className="text-xs" />
                  {" "}
                  <span className="text-primary font-bold">Gestion des autorisations</span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                  Gestion des autorisations d'absences
                </h1>
              </div>
              {/* Actions rapides de haut de page */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors" type="button" onClick={() => void exporterAssiduite()}>
                  <Icone nom="picture_as_pdf" className="text-lg" />
                  {" "}
                  <span>Rapport d'Assiduité Mensuel (PDF)</span>
                </button>
              </div>
            </div>
          </div>
          {/* KPIs Métriques d'Assiduité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* KPI 1 : le présentéisme provient du pointage (indicateur de pilotage) */}
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden motion-card-appear" style={{ "--delay": "80ms" } as CSSProperties}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase font-semibold">Taux de Présentéisme Global</span>
                <span className="w-8 h-8 rounded bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
                  <Icone nom="how_to_reg" className="text-lg" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">{presence?.taux != null ? `${presence.taux.toFixed(1)}%` : "—"}</span>
                {presence?.evolution != null ? (
                  <span className={`inline-flex items-center text-xs font-semibold ${presence.evolution >= 0 ? "text-primary" : "text-error"}`}>
                    <Icone nom={presence.evolution >= 0 ? "trending_up" : "trending_down"} className="text-sm" />
                    {presence.evolution >= 0 ? "+" : ""}
                    {presence.evolution.toFixed(1)}%
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                <span>Quorum minimal (paramètre)</span>
                <span className="font-bold text-primary">{presence?.objectif != null ? `≥ ${presence.objectif.toFixed(1)}%` : "—"}</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="motion-fill bg-primary h-full rounded-full" style={{ width: `${presence?.taux ?? 0}%` }} />
              </div>
            </div>
            <Indicateur
              index={0}
              titre="Autorisations validées"
              icone="assignment_turned_in"
              valeur={donnees?.indicateurs.validee}
              unite="dossiers justifiés"
              detail={`${donnees?.jours.validee ?? 0} jour${(donnees?.jours.validee ?? 0) > 1 ? "s" : ""} accordé${(donnees?.jours.validee ?? 0) > 1 ? "s" : ""}`}
              part={part(donnees?.indicateurs.validee ?? 0, total)}
              ton="neutre"
            />
            <Indicateur
              index={1}
              titre="En attente de décision"
              icone="alarm"
              valeur={donnees?.indicateurs.en_attente}
              unite="à statuer"
              detail={`${donnees?.jours.en_attente ?? 0} jour${(donnees?.jours.en_attente ?? 0) > 1 ? "s" : ""} demandé${(donnees?.jours.en_attente ?? 0) > 1 ? "s" : ""}`}
              part={part(donnees?.indicateurs.en_attente ?? 0, total)}
              ton="attention"
            />
            <Indicateur
              index={2}
              titre="Autorisations invalidées"
              icone="gavel"
              valeur={donnees?.indicateurs.invalidee}
              unite="dossiers refusés"
              detail={`${donnees?.jours.invalidee ?? 0} jour${(donnees?.jours.invalidee ?? 0) > 1 ? "s" : ""} refusé${(donnees?.jours.invalidee ?? 0) > 1 ? "s" : ""}`}
              part={part(donnees?.indicateurs.invalidee ?? 0, total)}
              ton="erreur"
            />
          </div>
          {/* Ventilation des autorisations de l'exercice */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Ventilation des Motifs de l'Exercice */}
            <div className="lg:col-span-12 bg-surface-container-lowest p-6 rounded-xl shadow-sm space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Ventilation Statutaire des Motifs d'Absence</h2>
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
                          <div className={`motion-fill ${COULEUR_TYPE[ligne.code]} h-full rounded-full`} style={{ width: `${ligne.part}%` }} />
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          </div>
          {/* Registre Général d'Instruction des Déclarations d'Absence */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Autorisations à statuer</h2>
              </div>
              {/* Filtres rapides */}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Filtrer par structure"
                  className="px-3 py-1.5 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  value={entite}
                  onChange={(event) => {
                    setEntite(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Toutes les structures</option>
                  {entites.map((sigle) => (
                    <option key={sigle} value={sigle}>{sigle}</option>
                  ))}
                </Select>
                <Select
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
                </Select>
              </div>
            </div>
            {/* Tableau Administratif Conforme */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                    <th className="py-3 px-4 rounded-l">{"Agent Public & Matricule"}</th>
                    <th className="py-3 px-4">{"Période & Durée"}</th>
                    <th className="py-3 px-4" data-min="">État de Conformité</th>
                    <th className="py-3 px-4 text-right rounded-r">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {registre.isPending ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-4">
                        <Skeleton className="h-10 w-full" />
                      </td>
                    </tr>
                  ) : registre.isError ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-4 text-error">Le registre des autorisations n'a pas pu être chargé.</td>
                    </tr>
                  ) : visibles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 px-4 text-on-surface-variant">Aucune autorisation ne correspond à ces filtres.</td>
                    </tr>
                  ) : (
                    visibles.map((item) => <LigneAutorisation key={item.id} autorisation={item} onChoisir={(sens) => setCible({ autorisation: item, sens })} onDetail={() => setDetail(item)} />)
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
        </div>
      </div>
      {detail ? <ModaleDetail autorisation={detail} onClose={() => setDetail(null)} /> : null}
      {cible ? <ModaleDecision autorisation={cible.autorisation} sens={cible.sens} onClose={() => setCible(null)} /> : null}
    </AppChrome>
  );
}

function Indicateur({ titre, icone, valeur, unite, detail, part, ton, index = 0 }: { titre: string; icone: string; valeur: number | undefined; unite: string; detail: string; part: string; ton: "neutre" | "attention" | "erreur"; index?: number }) {
  const couleurs = {
    neutre: { titre: "text-on-surface-variant", pastille: "bg-surface-container-high text-on-surface", valeur: "text-on-surface", barre: "bg-surface-tint" },
    attention: { titre: "text-secondary", pastille: "bg-secondary-fixed text-on-secondary-fixed", valeur: "text-secondary", barre: "bg-secondary-container" },
    erreur: { titre: "text-error", pastille: "bg-error-container text-on-error-container", valeur: "text-error", barre: "bg-error" },
  }[ton];
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between relative motion-card-appear" style={{ "--delay": `${(index + 1) * 80}ms` } as CSSProperties}>
      <div className="flex items-center justify-between mb-3">
        <span className={`font-label-md text-label-md ${couleurs.titre} uppercase font-semibold`}>{titre}</span>
        <span className={`w-8 h-8 rounded ${couleurs.pastille} flex items-center justify-center`}>
          <Icone nom={icone} className="text-lg" />
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-headline-xl text-headline-xl ${couleurs.valeur} font-bold`}>{valeur === undefined ? "—" : deuxChiffres(valeur)}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{unite}</span>
      </div>
      <div className="mt-3 font-label-sm text-label-sm text-on-surface-variant line-clamp-1">{detail}</div>
      <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
        <div className={`motion-fill ${couleurs.barre} h-full rounded-full`} style={{ width: part }} />
      </div>
    </div>
  );
}

function LigneAutorisation({ autorisation, onChoisir, onDetail }: { autorisation: Autorisation; onChoisir: (sens: Sens) => void; onDetail: () => void }) {
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
              <span className="px-1.5 py-0.2 rounded bg-surface-container text-on-surface text-[0.6875rem] font-semibold">{autorisation.structure}</span>
            </div>
          </div>
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
      <td className="py-4 px-4 text-right">
        <ActionsDecision autorisation={autorisation} onChoisir={onChoisir} onDetail={onDetail} />
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

const BOUTON_DETAIL = "px-2.5 py-1 rounded bg-surface-container text-primary text-xs font-semibold hover:bg-surface-container-high inline-flex items-center gap-1";

function ActionsDecision({ autorisation, onChoisir, onDetail }: { autorisation: Autorisation; onChoisir: (sens: Sens) => void; onDetail: () => void }) {
  if (autorisation.decision !== "en_attente") {
    const valide = autorisation.decision === "validee";
    return (
      <div className="flex items-center justify-end gap-2">
        <span className={`inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold ${valide ? "text-primary" : "text-error"}`}>
          <Icone nom={valide ? "check_circle" : "cancel"} className="text-base" />
          {valide ? "Validée" : "Invalidée"}
        </span>
        <button className={BOUTON_DETAIL} type="button" aria-label={`Détail : ${autorisation.agent.nom_complet}`} onClick={onDetail}>
          <Icone nom="visibility" className="text-sm" />Détail
        </button>
      </div>
    );
  }
  const nom = autorisation.agent.nom_complet;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button className={BOUTON_DETAIL} type="button" aria-label={`Détail : ${nom}`} onClick={onDetail}>
        <Icone nom="visibility" className="text-sm" />Détail
      </button>
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
      await client.invalidateQueries({ queryKey: ["agent", autorisation.agent.matricule] });
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
            {decision.isPending ? <Icone nom="progress_activity" className="text-lg motion-spin" /> : null}
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

const ETAT_LIBELLE: Record<Autorisation["decision"], string> = {
  en_attente: "En attente de décision",
  validee: "Validée",
  invalidee: "Invalidée",
};

/** Tout ce qui accompagne l'autorisation : nature, justificatif, décision et demande de l'agent. */
function ModaleDetail({ autorisation, onClose }: { autorisation: Autorisation; onClose: () => void }) {
  const { agent } = autorisation;
  const lignes: [string, string][] = [
    ["Agent", `${agent.nom_complet} · matricule ${agent.matricule}`],
    ["Structure", autorisation.structure],
    ["Nature", autorisation.type_libelle],
    ["Période", `${periode(autorisation.debut, autorisation.fin)} · ${autorisation.jours} jour${autorisation.jours > 1 ? "s" : ""} ouvré${autorisation.jours > 1 ? "s" : ""}`],
    ["Justificatif", autorisation.justificatif || "Aucun"],
    ["État", ETAT_LIBELLE[autorisation.decision]],
    ...(autorisation.motif_decision ? [["Motif de la décision", autorisation.motif_decision] as [string, string]] : []),
    ...(autorisation.demande ? [["Demande de l'agent", autorisation.demande] as [string, string]] : []),
  ];
  return (
    <Modale
      titre="Détail de l'autorisation"
      sousTitre={`${agent.nom_complet} · ${autorisation.type_libelle}`}
      icone="description"
      taille="md"
      onClose={onClose}
      pied={<button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>}
    >
      <dl className="space-y-3">
        {lignes.map(([libelle, valeur]) => (
          <div key={libelle} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-1 sm:gap-3">
            <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">{libelle}</dt>
            <dd className="font-body-sm text-body-sm text-on-surface">{valeur}</dd>
          </div>
        ))}
      </dl>
    </Modale>
  );
}
