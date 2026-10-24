import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Pagination, usePagination } from "../../ui/Pagination";
import { Icone } from "../../ui/Icone";
import { CalendrierAnnuel, PERIODES_VIDES, resumePeriodes, totalJours, type Collegue, type Periodes } from "../../ui/CalendrierAnnuel";

type Mouvement = { auteur: string; action: string; motif: string; debut: string | null; fin: string | null; debut2?: string | null; fin2?: string | null; quand: string };
type Plan = {
  id: number;
  matricule: string;
  nom: string;
  fonction: string;
  debut: string;
  fin: string;
  debut2: string | null;
  fin2: string | null;
  origine: string;
  origine_libelle: string;
  echeance: string | null;
  palier: string;
  palier_libelle: string;
  chez: string;
  moi: boolean;
  droit: number | null;
  traitable: boolean;
  blocage: string;
  mouvements: Mouvement[];
};
type AgentSansDate = { matricule: string; nom: string; fonction: string; droit: number | null };
type Reprise = { id: number; plan: number; agent: string; demandeur: string; debut: string; fin: string; debut2: string | null; fin2: string | null; motif: string; palier: string; traitable: boolean };
type Limite = { niveau: string; libelle: string; date: string };
type Campagne = {
  id: number;
  exercice: number;
  /** Arrêté publié, ou clôturée par l'équipe RH. */
  cloturee?: boolean;
  statut: string;
  statut_libelle: string;
  phase: string;
  delai: string;
  limites: Limite[];
  communique: string;
  formulaire: boolean;
  sans_dates: AgentSansDate[];
  en_attente_hierarchie: number;
  chez_rh: number;
  participants: number;
};
type Tableau = { role: "drh" | "rh" | "chef" | "agent"; droit_moi: number | null; collegues: Collegue[]; campagne: Campagne | null; plans: Plan[]; reprises: Reprise[] };

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const CLE = ["planification-conges"];

function iso(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

function lire(valeur: string): { annee: number; mois: number } {
  const [annee, mois] = valeur.split("-").map(Number);
  return { annee, mois: mois - 1 };
}

function libelle(valeur: string): string {
  const date = lire(valeur);
  const jour = Number(valeur.slice(8, 10));
  return `${jour} ${MOIS[date.mois]} ${date.annee}`;
}

function couvre(jourIso: string, debut: string, fin: string): boolean {
  return Boolean(debut && fin && jourIso >= debut && jourIso <= fin);
}

function message(erreur: unknown): string {
  return erreur instanceof ApiError ? erreur.message : "L'opération n'a pas abouti.";
}

/**
 * Calendrier de la campagne annuelle : choix de l'agent, puis relecture à chaque niveau.
 * `personnel` : la version de l'espace de l'agent (échéances, choix de ses dates, état de ses dates), sans la gestion.
 */
export function PlanificationConges({ personnel = false }: { personnel?: boolean }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const page = useQuery({ queryKey: CLE, queryFn: () => api<Tableau>("/api/v1/conges/planification/") });
  const donnees = page.data;
  const campagne = donnees?.campagne ?? null;
  const maintenant = new Date();
  const [mois, setMois] = useState({ annee: maintenant.getFullYear(), mois: maintenant.getMonth() });
  const [periodes, setPeriodes] = useState<Periodes>(PERIODES_VIDES);
  const { debut, fin } = periodes;
  const [ouvrir, setOuvrir] = useState(false);
  const [choix, setChoix] = useState<Plan | null>(null);
  const [manquant, setManquant] = useState<AgentSansDate | null>(null);
  const [motif, setMotif] = useState("");
  const [reprise, setReprise] = useState(false);
  const [texte, setTexte] = useState({ delai: "", limite_agents: "", limite_hierarchie: "", limite_rh: "", limite_drh: "", communique: "" });

  const invalider = () => void client.invalidateQueries({ queryKey: CLE });
  const deposer = useMutation({
    mutationFn: () => api("/api/v1/conges/planification/deposer/", { method: "POST", body: JSON.stringify(periodes) }),
    onSuccess: () => { feedback.toast("Dates transmises à votre supérieur"); setPeriodes(PERIODES_VIDES); invalider(); },
  });
  const fixer = useMutation({
    mutationFn: () => api("/api/v1/conges/planification/fixer/", { method: "POST", body: JSON.stringify({ matricule: manquant?.matricule, ...periodes }) }),
    onSuccess: () => { feedback.toast("Dates fixées, l'agent est notifié"); setManquant(null); setPeriodes(PERIODES_VIDES); invalider(); },
  });
  const lancer = useMutation({
    mutationFn: () => api("/api/v1/conges/planification/ouvrir/", { method: "POST", body: JSON.stringify({ ...texte, exercice: new Date().getFullYear() }) }),
    onSuccess: () => { feedback.toast(donnees?.role === "drh" ? "Campagne lancée" : "Lancement soumis à l'accord du DRH"); setOuvrir(false); invalider(); },
  });
  const accorder = useMutation({
    mutationFn: () => api("/api/v1/conges/planification/accorder/", { method: "POST" }),
    onSuccess: () => { feedback.toast("Campagne ouverte, le communiqué est publié"); invalider(); },
  });
  const soumettre = useMutation({
    mutationFn: () => api("/api/v1/conges/planification/soumettre/", { method: "POST" }),
    onSuccess: () => { feedback.toast("Ensemble soumis au DRH"); invalider(); },
  });
  const publier = useMutation({
    mutationFn: () => api("/api/v1/conges/planification/publier/", { method: "POST" }),
    onSuccess: () => { feedback.toast("Congés arrêtés et notifiés"); invalider(); },
  });
  const transmettre = useMutation({
    mutationFn: (plan: Plan) => api(`/api/v1/conges/planification/${plan.id}/transmettre/`, { method: "POST", body: JSON.stringify({ ...periodes, debut: debut || plan.debut, fin: fin || plan.fin, motif }) }),
    onSuccess: () => { feedback.toast("Plan transmis"); setChoix(null); setMotif(""); invalider(); },
  });
  const renvoyer = useMutation({
    mutationFn: (plan: Plan) => api(`/api/v1/conges/planification/${plan.id}/renvoyer/`, { method: "POST", body: JSON.stringify({ ...periodes, debut: debut || plan.debut, fin: fin || plan.fin, motif }) }),
    onSuccess: () => { feedback.toast("Plan renvoyé à l'équipe RH"); setChoix(null); setMotif(""); invalider(); },
  });
  const demander = useMutation({
    mutationFn: (plan: Plan) => api(`/api/v1/conges/planification/${plan.id}/reprise/`, { method: "POST", body: JSON.stringify({ ...periodes, motif }) }),
    onSuccess: () => { feedback.toast("Demande transmise à votre hiérarchie"); setReprise(false); setMotif(""); invalider(); },
  });
  const suivre = useMutation({
    mutationFn: ({ id, sens }: { id: number; sens: string }) => api(`/api/v1/conges/planification/reprises/${id}/`, { method: "POST", body: JSON.stringify({ sens, motif }) }),
    onSuccess: () => { feedback.toast("Demande traitée"); setMotif(""); invalider(); },
  });

  const plans = donnees?.plans ?? [];
  const pages = usePagination(plans, `${mois.annee}-${mois.mois}`, 6);
  const longueur = useMemo(() => new Date(mois.annee, mois.mois + 1, 0).getDate(), [mois]);

  function ouvrirPlan(plan: Plan) {
    setManquant(null);
    setChoix(plan);
    setPeriodes({ debut: plan.debut, fin: plan.fin, debut2: plan.debut2 ?? "", fin2: plan.fin2 ?? "" });
    setMotif("");
    setMois(lire(plan.debut));
  }

  function ouvrirManquant(agent: AgentSansDate) {
    setChoix(null);
    setManquant(agent);
    setPeriodes(PERIODES_VIDES);
    setMotif("");
  }

  if (page.isLoading) return null;
  if (!donnees) return null;
  // Dans l'espace de l'agent, la planification n'existe que pendant une campagne : elle disparaît dès qu'elle est clôturée
  // (arrêté publié) et n'apparaît pas tant qu'aucune n'est lancée. Ses dates arrêtées restent proposées dans sa demande de congé.
  // L'équipe RH et le DRH, eux, gardent la campagne et son arrêté.
  if (personnel && (!donnees.campagne || donnees.campagne.statut === "publiee" || donnees.campagne.cloturee)) return null;
  // Pourquoi « Valider mes congés » est désactivé ; vide quand le bouton est actif.
  const droitMoi = donnees.droit_moi;
  const joursChoisis = totalJours(periodes);
  const raisonValidation = deposer.isPending
    ? "Envoi de vos dates en cours."
    : !debut || !fin
      ? "Choisissez d'abord vos dates sur le calendrier : cliquez sur le premier jour, puis sur le dernier."
      : droitMoi && joursChoisis < droitMoi
        ? `Il reste ${droitMoi - joursChoisis} jour${droitMoi - joursChoisis > 1 ? "s" : ""} à placer : vos congés doivent couvrir exactement vos ${droitMoi} jours de droit (en deux temps si besoin).`
        : droitMoi && joursChoisis > droitMoi
          ? `Vous dépassez votre droit de ${joursChoisis - droitMoi} jour${joursChoisis - droitMoi > 1 ? "s" : ""} : réduisez vos périodes à ${droitMoi} jours au total.`
          : "";
  const moi = donnees.plans.find((plan) => plan.moi);
  // Dans son espace, l'agent ne voit la campagne que si elle le concerne.
  if (personnel && (!campagne || (campagne.statut === "publiee" && !moi))) return null;
  const peutLancer = (donnees.role === "rh" || donnees.role === "drh") && (!campagne || campagne.statut === "publiee");

  return (
    <section className="rounded-xl border border-hairline bg-surface-container-lowest p-5 space-y-4" aria-labelledby="titre-planification">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 id="titre-planification" className="font-headline-sm text-headline-sm text-on-surface">Planification annuelle des congés</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-3xl">
            {campagne ? phrase(campagne) : "L'équipe RH ouvre la campagne en début d'exercice. Le DRH donne son accord, puis chacun choisit ses dates."}
          </p>
        </div>
        {personnel ? null : <div className="flex flex-wrap gap-2">
          {peutLancer ? <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setOuvrir(true)}>Lancer la campagne des congés</button> : null}
          {donnees.role === "drh" && campagne?.statut === "accord" ? <button type="button" className={BOUTON_PRIMAIRE} onClick={() => accorder.mutate()}>Accorder l'ouverture</button> : null}
          {donnees.role === "rh" && campagne && (campagne.statut === "ouverte" || campagne.statut === "remontee") ? (
            <button type="button" className={BOUTON_PRIMAIRE} disabled={soumettre.isPending} onClick={() => soumettre.mutate()}>Soumettre l'ensemble au DRH</button>
          ) : null}
          {donnees.role === "drh" && campagne?.statut === "soumis" ? (
            <button type="button" className={BOUTON_PRIMAIRE} disabled={publier.isPending} onClick={() => publier.mutate()}>Viser et publier l'arrêté</button>
          ) : null}
        </div>}
      </div>
      {campagne && campagne.statut !== "publiee" ? (
        <div className="space-y-2">
          <p className="font-label-md text-label-md text-on-surface">Délai de la campagne · {libelle(campagne.delai)}</p>
          <Echeances limites={campagne.limites} phase={campagne.phase} />
        </div>
      ) : null}
      {campagne?.communique && campagne.statut !== "publiee" ? <p className="font-body-sm text-body-sm text-on-surface">{campagne.communique}</p> : null}
      {(deposer.isError || fixer.isError || lancer.isError || soumettre.isError || transmettre.isError || renvoyer.isError || demander.isError) ? (
        <p className="text-error font-body-sm text-body-sm" role="alert">{message(deposer.error || fixer.error || lancer.error || soumettre.error || transmettre.error || renvoyer.error || demander.error)}</p>
      ) : null}

      {campagne?.formulaire ? (
        <div className="space-y-3">
          {/* Plié par défaut : le calendrier est grand, on ne l'ouvre que pour choisir ses dates. */}
          <details className="group rounded-xl border border-hairline p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-label-lg text-label-lg font-bold text-on-surface">
              <Icone nom="expand_more" className="text-xl transition-transform group-open:rotate-180" />
              Calendrier de la campagne {campagne.exercice} · choisir mes dates
              <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">{resumePeriodes(periodes) || "Aucune période choisie"}</span>
            </summary>
            <div className="mt-3 space-y-3">
              <p className="font-label-md text-label-md text-on-surface">Choisissez le premier jour, puis le dernier. Vous pouvez prendre vos congés en deux temps.</p>
              <CalendrierAnnuel annee={campagne.exercice} valeur={periodes} onChange={setPeriodes} droit={donnees.droit_moi} collegues={donnees.collegues} />
            </div>
          </details>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* L'infobulle est portée par l'enveloppe : un bouton désactivé ne reçoit pas le survol. */}
            <span title={raisonValidation} className={raisonValidation ? "cursor-not-allowed" : undefined}>
              <button type="button" className={BOUTON_PRIMAIRE} disabled={Boolean(raisonValidation)} aria-describedby={raisonValidation ? "raison-validation" : undefined} onClick={() => deposer.mutate()}>Valider mes congés</button>
            </span>
            {raisonValidation ? <span id="raison-validation" className="sr-only">{raisonValidation}</span> : null}
          </div>
        </div>
      ) : null}

      {personnel && campagne && !campagne.formulaire && donnees.collegues.length > 0 ? (
        <details open className="rounded-xl border border-hairline p-3">
          <summary className="cursor-pointer font-label-lg text-label-lg font-bold text-on-surface">Calendrier de ma structure</summary>
          <div className="mt-3">
            <CalendrierAnnuel
              annee={campagne.exercice}
              valeur={moi ? { debut: moi.debut, fin: moi.fin, debut2: moi.debut2 ?? "", fin2: moi.fin2 ?? "" } : PERIODES_VIDES}
              onChange={() => undefined}
              lecture
              collegues={donnees.collegues}
            />
          </div>
        </details>
      ) : null}

      {personnel ? (
        moi ? (
          <div className="rounded-lg bg-surface-container-low p-4 font-body-sm text-body-sm text-on-surface">
            <span className="font-label-md text-label-md font-bold">Vos congés {campagne?.exercice}</span> : {resumePeriodes({ debut: moi.debut, fin: moi.fin, debut2: moi.debut2 ?? "", fin2: moi.fin2 ?? "" })} · {moi.palier_libelle}{moi.chez ? ` (chez ${moi.chez})` : ""}.
          </div>
        ) : campagne && !campagne.formulaire ? (
          <p className="rounded-lg bg-surface-container-low p-4 font-body-sm text-body-sm text-on-surface-variant">
            Vous n'avez pas indiqué vos dates : la date limite des agents est passée, votre responsable les fixera.
          </p>
        ) : null
      ) : null}

      {!personnel && campagne && campagne.sans_dates.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-label-lg text-label-lg text-on-surface">Agents sans dates</h3>
          <ul className="flex flex-wrap gap-2">
            {campagne.sans_dates.map((agent) => (
              <li key={agent.matricule}>
                <button type="button" className={manquant?.matricule === agent.matricule ? BOUTON_PRIMAIRE : BOUTON_SECONDAIRE} onClick={() => ouvrirManquant(agent)}>{agent.nom}</button>
              </li>
            ))}
          </ul>
          {manquant ? (
            <div className="space-y-3">
              <CalendrierAnnuel annee={campagne?.exercice ?? mois.annee} valeur={periodes} onChange={setPeriodes} droit={manquant.droit} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-body-sm text-body-sm text-on-surface-variant">{debut && fin ? `${manquant.nom} · ${resumePeriodes(periodes)}` : `Choisissez la période de ${manquant.nom}.`}</p>
                <button type="button" className={BOUTON_PRIMAIRE} disabled={!debut || !fin || (Boolean(manquant.droit) && totalJours(periodes) !== manquant.droit) || fixer.isPending} onClick={() => fixer.mutate()}>Fixer ces congés</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!personnel && plans.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-label-lg text-label-lg text-on-surface">Calendrier {MOIS[mois.mois]} {mois.annee}</h3>
            <Mois mois={mois} setMois={setMois} />
          </div>
          <div className="overflow-x-auto">
            <table className="tableau-fixe w-full border-separate border-spacing-0.5 text-center">
              <thead>
                <tr>
                  <th className="text-left font-label-sm text-label-sm text-on-surface-variant px-2">Agent</th>
                  {Array.from({ length: longueur }, (_, index) => (
                    <th key={index} className="font-label-sm text-label-sm text-on-surface-variant w-6">{index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pages.visibles.map((plan) => (
                  <tr key={plan.id}>
                    <th className="text-left font-body-sm text-body-sm text-on-surface font-medium px-2 whitespace-nowrap">
                      <button type="button" className="hover:underline" onClick={() => ouvrirPlan(plan)}>{plan.nom}</button>
                    </th>
                    {Array.from({ length: longueur }, (_, index) => {
                      const jour = iso(mois.annee, mois.mois, index + 1);
                      const actif = couvre(jour, plan.debut, plan.fin) || Boolean(plan.debut2 && plan.fin2 && couvre(jour, plan.debut2, plan.fin2));
                      return <td key={jour} className={`h-6 rounded-sm ${actif ? "bg-primary" : "bg-surface-container-low"}`} title={actif ? plan.nom : undefined} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pages.page} pages={pages.pages} total={pages.total} aller={pages.aller} libelle="plan" />
        </div>
      ) : null}

      {choix ? (
        <div className="rounded-lg border border-hairline p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">{choix.nom}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{choix.fonction} · {choix.palier_libelle}{choix.chez ? ` · ${choix.chez}` : ""}{choix.origine === "chef" ? ` · ${choix.origine_libelle}` : ""}{choix.echeance && choix.traitable ? ` · avant le ${libelle(choix.echeance)}` : ""}</p>
            </div>
            <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setChoix(null)}>Fermer</button>
          </div>
          <CalendrierAnnuel annee={campagne?.exercice ?? mois.annee} valeur={periodes} onChange={setPeriodes} droit={choix.droit} lecture={!(choix.traitable || choix.palier === "publie")} />
          {choix.mouvements.length > 0 ? (
            <ul className="space-y-1">
              {choix.mouvements.map((item) => (
                <li key={`${item.quand}-${item.action}`} className="font-body-sm text-body-sm text-on-surface-variant">
                  {item.quand} · {item.auteur} · {item.action}{item.motif ? ` — ${item.motif}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {choix.blocage ? <p className="font-body-sm text-body-sm text-on-surface-variant">{choix.blocage}</p> : null}
          {choix.traitable ? (
            <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
              Explication, obligatoire si les dates changent
              <textarea className="h-20 px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md" value={motif} onChange={(event) => setMotif(event.target.value)} />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {choix.traitable && choix.palier === "hierarchie" ? <button type="button" className={BOUTON_PRIMAIRE} onClick={() => transmettre.mutate(choix)}>Transmettre au niveau suivant</button> : null}
            {choix.traitable && (choix.palier === "rh" || choix.palier === "drh") ? <button type="button" className={BOUTON_PRIMAIRE} onClick={() => transmettre.mutate(choix)}>Enregistrer la modification</button> : null}
            {choix.traitable && choix.palier === "drh" ? <button type="button" className={BOUTON_SECONDAIRE} onClick={() => renvoyer.mutate(choix)}>Renvoyer à l'équipe RH</button> : null}
            {choix.palier === "publie" && (choix.moi || donnees.role === "rh") ? <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setReprise(true)}>Demander une modification</button> : null}
          </div>
        </div>
      ) : null}

      {donnees.reprises.length > 0 ? (
        <ul className="space-y-2">
          {donnees.reprises.map((item) => (
            <li key={item.id} className="rounded-lg bg-surface-container-low p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="font-body-sm text-body-sm text-on-surface">{item.agent} demande {resumePeriodes({ debut: item.debut, fin: item.fin, debut2: item.debut2 ?? "", fin2: item.fin2 ?? "" })}. {item.motif}</p>
              {item.traitable ? (
                <span className="flex gap-2">
                  <button type="button" className={BOUTON_SECONDAIRE} onClick={() => suivre.mutate({ id: item.id, sens: "transmettre" })}>Transmettre</button>
                  {donnees.role === "drh" ? <button type="button" className={BOUTON_PRIMAIRE} onClick={() => suivre.mutate({ id: item.id, sens: "accepter" })}>Accepter</button> : null}
                  {donnees.role === "drh" ? <button type="button" className={BOUTON_SECONDAIRE} onClick={() => suivre.mutate({ id: item.id, sens: "refuser" })}>Refuser</button> : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {ouvrir ? (
        <Modale titre="Lancer la campagne des congés" sousTitre="L'équipe RH fixe le délai de la campagne, puis l'échéance de chaque niveau à l'intérieur de ce délai. Le communiqué part dès l'accord du DRH." icone="calendar_month" taille="lg" onClose={() => setOuvrir(false)} onSubmit={() => lancer.mutate()} enCours={lancer.isPending} erreur={lancer.isError ? message(lancer.error) : undefined} libelleValider="Lancer">
          <label className="flex flex-col gap-1 font-label-md text-label-md">Délai de la campagne<input className={CHAMP} type="date" required value={texte.delai} onChange={(event) => setTexte({ ...texte, delai: event.target.value })} /></label>
          <p className="mt-3 font-label-md text-label-md text-on-surface">Échéances par niveau</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 font-label-md text-label-md">Agents<input className={CHAMP} type="date" required max={texte.delai} value={texte.limite_agents} onChange={(event) => setTexte({ ...texte, limite_agents: event.target.value })} /></label>
            <label className="flex flex-col gap-1 font-label-md text-label-md">Responsables<input className={CHAMP} type="date" required min={texte.limite_agents} max={texte.delai} value={texte.limite_hierarchie} onChange={(event) => setTexte({ ...texte, limite_hierarchie: event.target.value })} /></label>
            <label className="flex flex-col gap-1 font-label-md text-label-md">Équipe RH<input className={CHAMP} type="date" required min={texte.limite_hierarchie} max={texte.delai} value={texte.limite_rh} onChange={(event) => setTexte({ ...texte, limite_rh: event.target.value })} /></label>
            <label className="flex flex-col gap-1 font-label-md text-label-md">DRH<input className={CHAMP} type="date" required min={texte.limite_rh} max={texte.delai} value={texte.limite_drh} onChange={(event) => setTexte({ ...texte, limite_drh: event.target.value })} /></label>
          </div>
          <label className="mt-3 flex flex-col gap-1 font-label-md text-label-md">Communiqué<textarea className={`${CHAMP} h-28 py-2`} required value={texte.communique} onChange={(event) => setTexte({ ...texte, communique: event.target.value })} /></label>
        </Modale>
      ) : null}
      {reprise && choix ? (
        <Modale titre="Demander une modification" sousTitre="La demande remonte votre hiérarchie jusqu'au DRH." icone="edit_calendar" onClose={() => setReprise(false)} onSubmit={() => demander.mutate(choix)} enCours={demander.isPending} erreur={demander.isError ? message(demander.error) : undefined} libelleValider="Transmettre">
          <p className="font-body-sm text-body-sm text-on-surface-variant">{resumePeriodes(periodes) || "Aucune période choisie"}. Choisissez les jours sur le calendrier avant d'ouvrir cette fenêtre, ou indiquez le motif.</p>
          <label className="mt-3 flex flex-col gap-1 font-label-md text-label-md">Motif<textarea className={`${CHAMP} h-24 py-2`} required value={motif} onChange={(event) => setMotif(event.target.value)} /></label>
        </Modale>
      ) : null}
    </section>
  );
}

const CHAMP = "h-10 w-full px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface";

function phrase(campagne: Campagne): string {
  const dateDe = (niveau: string) => {
    const trouvee = campagne.limites.find((item) => item.niveau === niveau);
    return trouvee ? libelle(trouvee.date) : "";
  };
  if (campagne.phase === "accord") return "En attente de l'accord du DRH. Le calendrier s'ouvrira ensuite pour les agents.";
  if (campagne.phase === "agents") return `Les agents choisissent leurs dates jusqu'au ${dateDe("agents")}. Les responsables centraliseront ensuite, jusqu'au ${dateDe("hierarchie")}.`;
  if (campagne.phase === "hierarchie") return `Les responsables visent les dates, ou fixent celles qui manquent, jusqu'au ${dateDe("hierarchie")}. Chaque niveau suivant dispose ensuite de son propre délai.`;
  if (campagne.phase === "rh") return `L'équipe RH rassemble l'ensemble jusqu'au ${dateDe("rh")}, puis le soumet au DRH.`;
  if (campagne.phase === "drh") return `Le DRH vise l'ensemble jusqu'au ${dateDe("drh")}, puis publie l'arrêté.`;
  return campagne.statut_libelle;
}

function Echeances({ limites, phase }: { limites: Limite[]; phase: string }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {limites.map((item) => (
        <li key={item.niveau} className={`rounded-full px-3 py-1 font-label-sm text-label-sm ${item.niveau === phase ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface"}`}>
          {item.libelle} · {libelle(item.date)}
        </li>
      ))}
    </ol>
  );
}

function Mois({ mois, setMois }: { mois: { annee: number; mois: number }; setMois: (valeur: { annee: number; mois: number }) => void }) {
  function aller(delta: number) {
    const date = new Date(mois.annee, mois.mois + delta, 1);
    setMois({ annee: date.getFullYear(), mois: date.getMonth() });
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={BOUTON_SECONDAIRE} onClick={() => aller(-1)} aria-label="Mois précédent">‹</button>
      <span className="font-label-md text-label-md text-on-surface capitalize min-w-36 text-center">{MOIS[mois.mois]} {mois.annee}</span>
      <button type="button" className={BOUTON_SECONDAIRE} onClick={() => aller(1)} aria-label="Mois suivant">›</button>
    </div>
  );
}
