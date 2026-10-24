import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { FilVisas, type VisaFil } from "../../ui/FilVisas";
import { Pagination, usePagination } from "../../ui/Pagination";
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
type Statut = "traitement" | "validee" | "accordee" | "refusee";
type ElementSuivi = {
  source: "demande" | "absence";
  reference: string;
  agent: AgentBrief & { fonction: string };
  structure: string;
  type: TypeAutorisation;
  type_libelle: string;
  intitule: string;
  motif: string;
  debut: string;
  fin: string;
  depose_le: string;
  statut: Statut;
  etape: string;
  responsable: string;
  visas: VisaFil[];
  /** Autorisation inscrite au registre des absences, quand il y en a une : elle porte la décision du gestionnaire. */
  absence: Autorisation | null;
};
type Registre = {
  exercice: number;
  presenteisme: { taux: number | null; evolution: number | null; objectif: number | null };
  indicateurs: { accordees: number; en_traitement: number; validees: number };
  types: { code: TypeAutorisation; libelle: string }[];
  suivi: ElementSuivi[];
};

const ROUTE = "/api/v1/carrieres/absences/";
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const LIBELLE_STATUT: Record<Statut, string> = { traitement: "En traitement", validee: "Validée", accordee: "Accordée", refusee: "Refusée" };
const TON_STATUT: Record<Statut, string> = {
  traitement: "bg-secondary-fixed text-on-secondary-fixed",
  validee: "bg-primary-fixed text-on-primary-fixed",
  accordee: "bg-[#16a34a]/15 text-[#166534]",
  refusee: "bg-error-container text-on-error-container",
};
const FILTRE = "px-3 py-1.5 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none focus:ring-1 focus:ring-primary";

function jourMois(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return `${String(jour).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function periode(debut: string, fin: string): string {
  if (!debut) return "";
  if (debut === fin || !fin) return jourMois(debut);
  return `${jourMois(debut).replace(/ \d{4}$/, "")} au ${jourMois(fin)}`;
}

function deuxChiffres(nombre: number): string {
  return String(nombre).padStart(2, "0");
}

function part(nombre: number, total: number): string {
  return `${total ? Math.round((nombre * 100) / total) : 0}%`;
}

/** Circuit d'une permission : les visas de la demande, puis la signature et la délivrance de l'acte. */
function circuit(item: ElementSuivi): { visas: VisaFil[]; ordreActuel: number | null | undefined } {
  if (item.source === "absence") {
    const decision = item.absence?.decision ?? "en_attente";
    return {
      visas: [
        { ordre: 1, instance: "Demande déposée", avis: "Déposée", titulaire: item.agent.nom_complet, date: "", etat: "ok" },
        {
          ordre: 2, instance: "Décision de la gestion des absences", titulaire: "", date: "",
          avis: decision === "validee" ? "Validée" : decision === "invalidee" ? "Invalidée" : "En attente",
          etat: decision === "validee" ? "ok" : decision === "invalidee" ? "refus" : "attente",
        },
      ],
      ordreActuel: decision === "en_attente" ? 2 : null,
    };
  }
  const dernier = item.visas.length + 1;
  const visas: VisaFil[] = [
    ...item.visas,
    {
      ordre: dernier, instance: "Signature et délivrance de l'acte", titulaire: "", date: "",
      avis: item.statut === "accordee" ? "Délivré" : item.statut === "validee" ? "En signature" : "En attente",
      etat: item.statut === "accordee" ? "ok" : "attente",
    },
  ];
  // Visas obtenus mais acte pas encore délivré : l'étape en cours est la signature. En traitement : la première étape en attente.
  return { visas, ordreActuel: item.statut === "validee" ? dernier : item.statut === "traitement" ? undefined : null };
}

/** Suivi des permissions : statutaires et générales, telles que les agents les demandent depuis leur profil. */
export function AbsencesScreen() {
  const feedback = useFeedback();
  const registre = useQuery({ queryKey: ["carrieres-absences"], queryFn: () => api<Registre>(ROUTE) });
  const [cible, setCible] = useState<{ autorisation: Autorisation; sens: Sens } | null>(null);
  const [detail, setDetail] = useState<Autorisation | null>(null);
  const [recherche, setRecherche] = useState("");
  const [entite, setEntite] = useState("");
  const [type, setType] = useState("");
  const [statut, setStatut] = useState("");
  const donnees = registre.data;
  const suivi = donnees?.suivi ?? [];
  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return suivi.filter(
      (item) =>
        (!entite || item.structure === entite) && (!type || item.type === type) && (!statut || item.statut === statut)
        && (!q || `${item.agent.nom_complet} ${item.agent.matricule} ${item.structure} ${item.reference} ${item.motif}`.toLowerCase().includes(q)),
    );
  }, [suivi, recherche, entite, type, statut]);
  const pageSuivi = usePagination(filtrees, `${recherche}|${entite}|${type}|${statut}`, 4);
  const entites = [...new Set(suivi.map((item) => item.structure))].sort();
  const total = suivi.length;
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
          {/* En-tête */}
          <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm relative overflow-hidden motion-rise">
            <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                  <span>SD Gestion des Carrières</span>
                  <Icone nom="chevron_right" className="text-xs" />
                  <span>{"Temps de Service & Suivi"}</span>
                  <Icone nom="chevron_right" className="text-xs" />
                  <span className="text-primary font-bold">Suivi des absences</span>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Suivi des absences</h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Permissions statutaires et permissions que les agents demandent depuis leur profil.</p>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container text-primary font-label-md text-label-md hover:bg-surface-container-high transition-colors" type="button" onClick={() => void exporterAssiduite()}>
                  <Icone nom="picture_as_pdf" className="text-lg" />
                  <span>Rapport d'Assiduité Mensuel (PDF)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Indicateurs : les demandes, puis le taux de présence en dernier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Indicateur index={0} titre="Demandes accordées" icone="task_alt" valeur={donnees?.indicateurs.accordees} unite="actes délivrés" detail="Acte signé et délivré à l'agent" part={part(donnees?.indicateurs.accordees ?? 0, total)} ton="neutre" />
            <Indicateur index={1} titre="Demandes en traitement" icone="hourglass_top" valeur={donnees?.indicateurs.en_traitement} unite="dans le circuit" detail="En attente d'un visa" part={part(donnees?.indicateurs.en_traitement ?? 0, total)} ton="attention" />
            <Indicateur index={2} titre="Demandes validées" icone="fact_check" valeur={donnees?.indicateurs.validees} unite="en signature" detail="Tous les visas obtenus" part={part(donnees?.indicateurs.validees ?? 0, total)} ton="neutre" />
            <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden motion-card-appear" style={{ "--delay": "320ms" } as CSSProperties}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-label-md text-label-md text-on-surface-variant uppercase font-semibold">Taux de présence</span>
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
                <span>Quorum minimal</span>
                <span className="font-bold text-primary">{presence?.objectif != null ? `≥ ${presence.objectif.toFixed(1)}%` : "—"}</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2 overflow-hidden">
                <div className="motion-fill bg-primary h-full rounded-full" style={{ width: `${presence?.taux ?? 0}%` }} />
              </div>
            </div>
          </div>

          {/* Registre : chaque demande est un circuit */}
          <section className="bg-surface-container-lowest rounded-xl shadow-sm space-y-4 p-6" aria-labelledby="titre-suivi-absences">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 id="titre-suivi-absences" className="font-headline-sm text-headline-sm text-on-surface">Demandes de permission</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{total} demande{total > 1 ? "s" : ""} dans votre périmètre, avec l'avancement de chaque circuit.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input type="search" aria-label="Rechercher une demande" className={`${FILTRE} w-48`} placeholder="Agent, matricule…" value={recherche} onChange={(event) => setRecherche(event.target.value)} />
                <Select aria-label="Filtrer par structure" className={FILTRE} value={entite} onChange={(event) => setEntite(event.target.value)}>
                  <option value="">Toutes les structures</option>
                  {entites.map((sigle) => <option key={sigle} value={sigle}>{sigle}</option>)}
                </Select>
                <Select aria-label="Filtrer par type de permission" className={FILTRE} value={type} onChange={(event) => setType(event.target.value)}>
                  <option value="">Toutes les permissions</option>
                  {(donnees?.types ?? []).map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
                </Select>
                <Select aria-label="Filtrer par avancement" className={FILTRE} value={statut} onChange={(event) => setStatut(event.target.value)}>
                  <option value="">Tous les états</option>
                  {(Object.keys(LIBELLE_STATUT) as Statut[]).map((code) => <option key={code} value={code}>{LIBELLE_STATUT[code]}</option>)}
                </Select>
              </div>
            </div>

            {registre.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : registre.isError ? (
              <p className="py-4 text-error">Le suivi des absences n'a pas pu être chargé.</p>
            ) : filtrees.length === 0 ? (
              <p className="py-4 text-on-surface-variant">Aucune demande ne correspond à ces filtres.</p>
            ) : (
              <ul className="space-y-4">
                {pageSuivi.visibles.map((item) => {
                  const { visas, ordreActuel } = circuit(item);
                  return (
                    <li key={`${item.source}-${item.reference}`} className="rounded-xl border border-hairline p-5 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-10 h-10 rounded-full bg-primary-fixed text-primary flex items-center justify-center font-bold text-sm shrink-0">{item.agent.initiales}</span>
                          <div className="min-w-0">
                            <p className="font-label-lg text-label-lg font-bold text-on-surface">{item.agent.nom_complet}</p>
                            <p className="font-code-num text-code-num text-on-surface-variant flex flex-wrap items-center gap-2">
                              <span>Mat. {item.agent.matricule}</span>
                              <span aria-hidden="true">•</span>
                              <span className="px-1.5 rounded bg-surface-container text-on-surface text-[0.6875rem] font-semibold">{item.structure}</span>
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-label-sm text-label-sm font-bold ${TON_STATUT[item.statut]}`}>{LIBELLE_STATUT[item.statut]}</span>
                          <p className="font-label-sm text-label-sm text-on-surface-variant">{item.reference}</p>
                        </div>
                      </div>
                      <p className="font-label-md text-label-md text-on-surface">
                        <span className="font-bold">{item.type_libelle}</span>
                        {item.debut ? <span className="ml-2 font-code-num text-code-num text-on-surface-variant">{periode(item.debut, item.fin)}</span> : null}
                      </p>
                      {item.motif ? <p className="font-body-sm text-body-sm text-on-surface-variant">Motif : {item.motif}</p> : null}
                      <FilVisas visas={visas} enCours={item.statut === "traitement" || item.statut === "validee"} ordreActuel={ordreActuel} libelleActuel={item.statut === "validee" ? "À signer" : "À viser"} libelle={`Circuit ${item.reference}`} />
                      {item.absence ? (
                        <div className="border-t border-hairline pt-3">
                          <ActionsDecision autorisation={item.absence} onChoisir={(sens) => setCible({ autorisation: item.absence as Autorisation, sens })} onDetail={() => setDetail(item.absence as Autorisation)} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <Pagination page={pageSuivi.page} pages={pageSuivi.pages} total={pageSuivi.total} aller={pageSuivi.aller} libelle="demande" />
          </section>
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
