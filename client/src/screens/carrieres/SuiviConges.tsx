import { useMemo, useState } from "react";
import type { AgentBrief } from "../../api/types";
import { FilVisas, type VisaFil } from "../../ui/FilVisas";
import { Icone } from "../../ui/Icone";
import { Pagination, usePagination } from "../../ui/Pagination";
import { Select } from "../../ui/Select";
import { Skeleton } from "../../ui/Motion";

export type ElementSuivi = {
  source: "demande" | "plan";
  reference: string;
  agent: (AgentBrief & { fonction: string }) | null;
  structure: string;
  intitule: string;
  debut: string;
  fin: string;
  depose_le: string;
  etape: string;
  responsable: string;
  clos: boolean;
  refuse: boolean;
  ordre_actuel: number | null;
  visas: (VisaFil & { etat?: "ok" | "refus" | "attente"; signature_url?: string })[];
};

export type ElementArbitrage = {
  id: number;
  agent: AgentBrief & { fonction: string };
  structure: string;
  nature: string;
  debut: string;
  fin: string;
  jours: number;
  interim: string;
  interim_detail: string;
  instruction: string;
  instruction_libelle: string;
  motif: string;
};
export type ActionArbitrage = "signer" | "rejeter" | "decaler";

/** Une ligne du registre : ce qu'un agent a déposé, et où en est son circuit. */
type Ligne = {
  cle: string;
  type: "Demande de congé" | "Dates de la campagne" | "Arbitrage RH";
  reference: string;
  agent: ElementArbitrage["agent"] | null;
  structure: string;
  intitule: string;
  periode: string;
  etat: "en_cours" | "valide" | "refuse";
  etatLibelle: string;
  visas: VisaFil[];
  ordreActuel: number | null;
  libelleActuel: string;
  responsable: string;
  arbitrage?: ElementArbitrage;
};

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const FILTRE = "w-full h-9 px-2.5 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded focus:outline-none focus:ring-1 focus:ring-primary";
const OUVERTES = ["conflit_quorum", "pret_signature", "remplacement"];

function jour(iso: string): string {
  if (!iso) return "";
  const [annee, mois, jourMois] = iso.split("-").map(Number);
  return `${String(jourMois).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function periode(debut: string, fin: string): string {
  return debut && fin && debut !== fin ? `${jour(debut)} → ${jour(fin)}` : jour(debut);
}

function ligneDeSuivi(item: ElementSuivi): Ligne {
  const visas: VisaFil[] = item.visas.map((visa) => ({
    ...visa,
    etat: visa.etat ?? (/refus|sans suite/i.test(visa.avis) ? "refus" : item.clos || (item.ordre_actuel != null && visa.ordre < item.ordre_actuel) ? "ok" : "attente"),
  }));
  const etat = item.refuse ? "refuse" : item.clos ? "valide" : "en_cours";
  return {
    cle: `${item.source}-${item.reference}`,
    type: item.source === "plan" ? "Dates de la campagne" : "Demande de congé",
    reference: item.reference,
    agent: item.agent,
    structure: item.structure,
    intitule: item.intitule,
    periode: item.source === "plan" ? "" : periode(item.debut, item.fin),
    etat,
    etatLibelle: etat === "refuse" ? "Refusée" : etat === "valide" ? (item.source === "plan" ? "Arrêtée" : "Accordée") : "En cours",
    visas,
    ordreActuel: item.ordre_actuel,
    libelleActuel: "En cours",
    responsable: item.responsable,
  };
}

/** Circuit d'une demande d'arbitrage : dépôt, arbitrage de l'équipe RH, puis arrêté. */
function ligneArbitrage(demande: ElementArbitrage): Ligne {
  const signe = demande.instruction === "signe";
  const auto = demande.instruction === "approbation_auto";
  const refus = demande.instruction === "rejete" || demande.instruction === "decale";
  const prete = demande.instruction === "pret_signature" || demande.instruction === "remplacement";
  const clos = signe || auto || refus;
  const visas: VisaFil[] = [
    { ordre: 1, instance: "Demande déposée", avis: "Déposée", titulaire: demande.agent.nom_complet, date: "", etat: "ok" },
    {
      ordre: 2, instance: "Arbitrage de l'équipe RH", avis: demande.instruction_libelle, titulaire: "", date: "",
      detail: demande.interim ? `${demande.interim}${demande.interim_detail ? ` · ${demande.interim_detail}` : ""}` : undefined,
      etat: refus ? "refus" : signe || auto || prete ? "ok" : "attente",
    },
    { ordre: 3, instance: auto ? "Notification" : "Arrêté du DRH", avis: signe ? "Signé" : auto ? "Notification émise" : "En attente", titulaire: "", date: "", etat: signe || auto ? "ok" : "attente" },
  ];
  return {
    cle: `arbitrage-${demande.id}`,
    type: "Arbitrage RH",
    reference: `ARB-${demande.id}`,
    agent: demande.agent,
    structure: demande.structure,
    intitule: demande.nature,
    periode: periode(demande.debut, demande.fin),
    etat: refus ? "refuse" : clos ? "valide" : "en_cours",
    etatLibelle: demande.instruction_libelle,
    visas,
    ordreActuel: clos ? null : prete ? 3 : 2,
    libelleActuel: demande.instruction === "conflit_quorum" ? "Conflit de quorum" : prete ? "À signer" : "À arbitrer",
    responsable: "",
    arbitrage: demande,
  };
}

/** Registre des congés déposés par les agents : chaque dépôt est un circuit, pas une ligne de tableau. */
export function SuiviConges({
  suivi, arbitrage, enAttente, chargement, erreur, onAction,
}: {
  suivi: ElementSuivi[];
  arbitrage: ElementArbitrage[];
  enAttente: number;
  chargement: boolean;
  erreur: boolean;
  onAction: (demande: ElementArbitrage, action: ActionArbitrage) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [type, setType] = useState("");
  const [etat, setEtat] = useState("");
  const lignes = useMemo(() => [...arbitrage.map(ligneArbitrage), ...suivi.map(ligneDeSuivi)], [suivi, arbitrage]);
  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter(
      (ligne) =>
        (!type || ligne.type === type) && (!etat || ligne.etat === etat)
        && (!q || `${ligne.agent?.nom_complet ?? ""} ${ligne.agent?.matricule ?? ""} ${ligne.structure} ${ligne.intitule} ${ligne.reference}`.toLowerCase().includes(q)),
    );
  }, [lignes, recherche, type, etat]);
  const page = usePagination(filtrees, `${recherche}|${type}|${etat}`, 5);

  return (
    <section className="p-5 bg-surface-container-lowest rounded-lg shadow-sm space-y-4" aria-labelledby="titre-registre-conges">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 id="titre-registre-conges" className="font-headline-sm text-headline-sm text-on-surface">Registre des demandes de congé</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Ce que les agents ont déposé depuis leur espace, avec l'avancement de chaque circuit.</p>
        </div>
        <span className="font-code-num text-code-num font-bold text-primary px-2 py-0.5 bg-surface-container rounded whitespace-nowrap">
          {enAttente} dossier{enAttente > 1 ? "s" : ""} en attente d'arbitrage
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-container-low rounded">
        <label className="block">
          <span className="block font-label-sm text-label-sm text-on-surface font-semibold mb-1">Rechercher</span>
          <input type="search" className={FILTRE} value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Agent, matricule, structure…" />
        </label>
        <label className="block">
          <span className="block font-label-sm text-label-sm text-on-surface font-semibold mb-1">Nature du dépôt</span>
          <Select className={FILTRE} value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Tous les dépôts</option>
            <option value="Demande de congé">Demandes de congé</option>
            <option value="Dates de la campagne">Dates de la campagne</option>
            <option value="Arbitrage RH">Arbitrages RH</option>
          </Select>
        </label>
        <label className="block">
          <span className="block font-label-sm text-label-sm text-on-surface font-semibold mb-1">Avancement</span>
          <Select className={FILTRE} value={etat} onChange={(event) => setEtat(event.target.value)}>
            <option value="">Tous les états</option>
            <option value="en_cours">En cours</option>
            <option value="valide">Accordés</option>
            <option value="refuse">Refusés</option>
          </Select>
        </label>
      </div>

      {chargement ? (
        <Skeleton className="h-40 w-full" />
      ) : erreur ? (
        <p className="py-4 text-error">Le registre des congés n'a pas pu être chargé.</p>
      ) : filtrees.length === 0 ? (
        <p className="py-4 text-on-surface-variant">Aucun dépôt ne correspond à ces filtres.</p>
      ) : (
        <ul className="space-y-4">
          {page.visibles.map((ligne) => (
            <li key={ligne.cle} className="rounded-xl border border-hairline bg-surface-container-lowest p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-full bg-surface-container text-primary flex items-center justify-center font-label-md text-label-md font-bold shrink-0">{ligne.agent?.initiales ?? "?"}</span>
                  <div className="min-w-0">
                    <p className="font-label-lg text-label-lg font-bold text-on-surface">{ligne.agent?.nom_complet ?? "Agent inconnu"}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{ligne.agent?.fonction || ligne.agent?.corps} • <strong className="text-on-surface">{ligne.structure}</strong></p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">{ligne.type} · {ligne.reference}</span>
                  <span className={`mt-1 flex items-center justify-end gap-1.5 font-label-sm text-label-sm font-bold ${ligne.etat === "refuse" ? "text-error" : ligne.etat === "valide" ? "text-[#166534]" : "text-primary"}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{ligne.etatLibelle}
                  </span>
                </div>
              </div>
              <p className="font-label-md text-label-md text-on-surface">
                {ligne.intitule}
                {ligne.periode ? <span className="ml-2 font-code-num text-code-num text-on-surface-variant">{ligne.periode}</span> : null}
              </p>
              {ligne.arbitrage?.motif ? <p className="font-body-sm text-body-sm text-on-surface-variant">Motif : {ligne.arbitrage.motif}</p> : null}
              <FilVisas visas={ligne.visas} enCours={ligne.etat === "en_cours"} ordreActuel={ligne.ordreActuel} libelleActuel={ligne.libelleActuel} libelle={`Circuit ${ligne.reference}`} />
              {ligne.arbitrage && OUVERTES.includes(ligne.arbitrage.instruction) ? (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline pt-3">
                  {ligne.arbitrage.instruction === "conflit_quorum" ? (
                    <button type="button" className="inline-flex items-center gap-1.5 rounded bg-secondary px-3 py-1.5 font-label-md text-label-md font-bold text-on-secondary" onClick={() => onAction(ligne.arbitrage as ElementArbitrage, "decaler")}>
                      <Icone nom="event_repeat" className="text-base" />Avis défavorable / décaler
                    </button>
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-label-md text-label-md font-semibold text-on-primary" onClick={() => onAction(ligne.arbitrage as ElementArbitrage, "signer")}>
                      <Icone nom="draw" className="text-base" />{ligne.arbitrage.instruction === "remplacement" ? "Signer l'arrêté" : "Signer"}
                    </button>
                  )}
                  <button type="button" className="inline-flex items-center gap-1.5 rounded border border-outline-variant px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-low" onClick={() => onAction(ligne.arbitrage as ElementArbitrage, "rejeter")}>
                    <Icone nom="close" className="text-base" />Rejeter
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="dépôt" />
    </section>
  );
}
