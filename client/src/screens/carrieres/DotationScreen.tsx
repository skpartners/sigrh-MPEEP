import { Chargement } from "../../ui/Chargement";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { DemandeDotation, Dotation, Passerelle } from "../../api/types";
import { dateCourte, nombre } from "../../ui/format";
import { ouvreAuClic } from "../../ui/clicLigne";
import { useFeedback } from "../../ui/Feedback";
import { Modale } from "../../ui/Modale";
import { useAction } from "../../ui/useAction";
import { AppChrome } from "../AppChrome";
import { optionsEntites } from "../../ui/Entites";
import { Icone } from "../../ui/Icone";
import { Select } from "../../ui/Select";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";
const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const PRIMAIRE = "inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md disabled:opacity-50";
const SECOND = "inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-low text-primary hover:bg-surface-container font-label-md text-label-md disabled:opacity-50";
const ACTION = "p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors";
const ACTION_DANGER = "p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors";
const TAILLE = 4;

const ONGLETS = [
  { id: "affectation", libelle: "Suivi des affectations", saisie: "Renseigner une affectation", icone: "person_add" },
  { id: "reaffectation", libelle: "Suivi des réaffectations", saisie: "Renseigner une réaffectation", icone: "school" },
  { id: "disposition", libelle: "Suivi des mises à disposition", saisie: "Renseigner une mise à disposition", icone: "handshake" },
  { id: "redeploiement", libelle: "Redéploiement", saisie: "Renseigner un redéploiement", icone: "swap_horiz" },
] as const;

const PLAN_VIDE = { entite: "", direction: "", poste: "", nature: "affectation", impact: "1", detail: "" };

function postesPour(tous: Dotation["postes"], code: string, actuel = "") {
  const lies = code ? tous.filter((item) => item.structures.includes(code)) : [];
  const base = lies.length ? lies : tous;
  if (actuel && tous.some((item) => item.libelle === actuel) && !base.some((item) => item.libelle === actuel)) {
    const garde = tous.find((item) => item.libelle === actuel);
    return garde ? [...base, garde] : base;
  }
  return base;
}

function posteAuto(tous: Dotation["postes"], code: string, actuel: string) {
  const liste = postesPour(tous, code, actuel);
  if (actuel && liste.some((item) => item.libelle === actuel)) return actuel;
  return liste.length === 1 ? liste[0].libelle : "";
}

function ton(statut: string): string {
  if (statut === "acte") return "bg-primary-fixed text-on-primary-fixed";
  if (statut === "rejet") return "bg-error-container text-on-error-container";
  return "bg-secondary-fixed text-on-secondary-fixed";
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "L'enregistrement n'a pas abouti.";
}

export function DotationScreen({ ongletInitial = "affectation" }: { ongletInitial?: (typeof ONGLETS)[number]["id"] }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const { agir } = useAction();
  const dotation = useQuery({ queryKey: ["dotation"], queryFn: () => api<Dotation>("/api/v1/dotation/") });
  const [filtre, setFiltre] = useState("");
  const [entite, setEntite] = useState("");
  const [statut, setStatut] = useState("");
  const [onglet, setOnglet] = useState<(typeof ONGLETS)[number]["id"]>(ongletInitial);
  const [page, setPage] = useState(1);
  const [panneau, setPanneau] = useState<string | null>(null);
  const [demande, setDemande] = useState<DemandeDotation | null>(null);
  const [passerelle, setPasserelle] = useState<Passerelle | null>(null);
  const [plan, setPlan] = useState(PLAN_VIDE);
  const [instruction, setInstruction] = useState({ statut: "acte", visa: "", motif: "" });
  const [pont, setPont] = useState({ cedant: "", recepteur: "", profil: "", effectif: "1", note: "" });
  const [decisionPont, setDecisionPont] = useState({ id: "", statut: "actee", note: "" });

  const data = dotation.data;
  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return (data?.demandes ?? []).filter((item) => {
      const texte = `${item.reference} ${item.poste} ${item.entite} ${item.direction}`.toLowerCase();
      return (!q || texte.includes(q)) && (!entite || item.entite_code === entite) && (!statut || item.statut === statut) && item.nature === onglet;
    });
  }, [data, filtre, entite, statut, onglet]);
  const pages = Math.max(1, Math.ceil(visibles.length / TAILLE));
  const courante = Math.min(page, pages);
  const lignes = visibles.slice((courante - 1) * TAILLE, courante * TAILLE);
  const ongletActif = ONGLETS.find((item) => item.id === onglet) ?? ONGLETS[0];

  function ouvrirSaisie(item?: DemandeDotation) {
    if (item) {
      setDemande(item);
      setPlan({
        entite: item.entite_code,
        direction: item.direction,
        poste: item.poste,
        nature: item.nature,
        impact: String(item.impact),
        detail: item.detail,
      });
      setPanneau("modifier");
      return;
    }
    setDemande(null);
    setPlan({ ...PLAN_VIDE, nature: onglet });
    setPanneau("plan");
  }

  function fermer() {
    setPanneau(null);
  }

  function rafraichir() {
    return client.invalidateQueries({ queryKey: ["dotation"] });
  }

  const corpsSaisie = () => JSON.stringify({ ...plan, nature: onglet, impact: Number(plan.impact) });
  const creer = useMutation({
    mutationFn: () => api("/api/v1/dotation/plans/", { method: "POST", body: corpsSaisie() }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Demande enregistrée");
      fermer();
    },
  });
  const modifier = useMutation({
    mutationFn: () => api(`/api/v1/dotation/demandes/${demande?.reference}/modifier/`, { method: "POST", body: corpsSaisie() }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Demande mise à jour");
      fermer();
    },
  });
  const instruire = useMutation({
    mutationFn: () => api(`/api/v1/dotation/demandes/${demande?.reference}/instruire/`, { method: "POST", body: JSON.stringify(instruction) }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Décision enregistrée");
      fermer();
    },
  });
  const creerPont = useMutation({
    mutationFn: () => api("/api/v1/dotation/passerelles/", {
      method: "POST",
      body: JSON.stringify({ ...pont, effectif: Number(pont.effectif) }),
    }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Passerelle actée");
      fermer();
    },
  });
  const deciderPont = useMutation({
    mutationFn: () => api(`/api/v1/dotation/passerelles/${decisionPont.id}/decision/`, {
      method: "POST",
      body: JSON.stringify({ statut: decisionPont.statut, note: decisionPont.note }),
    }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Arbitrage enregistré");
      fermer();
    },
  });

  async function exporter() {
    await feedback.run("Export du registre…", () => telecharger("/api/v1/dotation/export/", "registre-dotation.xlsx"), {
      success: { title: "Registre exporté" },
      error: "L'export n'a pas abouti",
    });
  }

  async function exporterPdf() {
    await feedback.run("Export de la gestion…", () => telecharger("/api/v1/dotation/export/pdf/", "gestion-dotation.pdf"), {
      success: { title: "Gestion exportée" },
      error: "L'export n'a pas abouti",
    });
  }

  if (dotation.isLoading) {
    return <AppChrome><div className={PAGE}><Chargement libelle="Chargement de la dotation…" /></div></AppChrome>;
  }
  if (!data) {
    return <AppChrome><p className={`${PAGE} text-error`}>La dotation n'a pas pu être chargée.</p></AppChrome>;
  }

  return (
    <AppChrome>
      <div className={PAGE}>
        <section className={`${CARTE} p-6`}>
          <p className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            <span>GPEC</span>
            <Icone nom="chevron_right" className="text-xs" />
            <span className="font-bold text-primary">Recrutement</span>
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Dotation en personnel et plafonds d'emplois</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={SECOND} onClick={() => void exporter()}>
                <Icone nom="download" className="text-lg" />
                Exporter le registre
              </button>
              <button type="button" className={SECOND} onClick={() => void exporterPdf()}>
                <Icone nom="picture_as_pdf" className="text-lg" />
                Gestion (PDF)
              </button>
              <button type="button" className={SECOND} onClick={() => setPanneau("historique")}>
                <Icone nom="history" className="text-lg" />
                Historique
              </button>
            </div>
          </div>
        </section>

        <section className={`${CARTE} overflow-hidden`}>
          <div
            role="tablist"
            aria-label="Types de mouvement de personnel"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-1 p-1.5 bg-surface-container-low border-b border-hairline"
          >
            {ONGLETS.map((item) => {
              const actif = item.id === onglet;
              const compte = (data.demandes ?? []).filter((demande) => demande.nature === item.id).length;
              return (
                <button
                  key={item.id}
                  id={`onglet-dotation-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={actif}
                  aria-controls="panneau-dotation"
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 font-label-md text-label-md cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${actif ? "bg-primary font-semibold text-on-primary shadow-sm" : "text-on-surface hover:bg-surface-container-lowest"}`}
                  onClick={() => { setOnglet(item.id); setPage(1); }}
                >
                  <Icone nom={item.icone} className="text-lg" />
                  <span>{item.libelle}</span>
                  <span className={`rounded px-1.5 font-code-num text-label-sm ${actif ? "bg-on-primary/20 text-on-primary" : "bg-surface-container-highest text-on-surface"}`}>{compte}</span>
                </button>
              );
            })}
          </div>
          <div id="panneau-dotation" className="flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between" role="tabpanel" aria-labelledby={`onglet-dotation-${onglet}`}>
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">{ONGLETS.find((item) => item.id === onglet)?.libelle}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{nombre(visibles.length)} demande{visibles.length > 1 ? "s" : ""} dans cet onglet.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={PRIMAIRE} onClick={() => ouvrirSaisie()}>
                <Icone nom="add_circle" className="text-lg" />
                {ongletActif.saisie}
              </button>
            </div>
          </div>
          <div className="grid gap-3 px-6 pb-4 md:grid-cols-3">
            <input className={CHAMP} value={filtre} placeholder="Référence, poste, entité…" onChange={(event) => { setFiltre(event.target.value); setPage(1); }} />
            <Select className={CHAMP} value={entite} onChange={(event) => { setEntite(event.target.value); setPage(1); }}>
              <option value="">Toutes les entités</option>
              {optionsEntites(data.entites)}
            </Select>
            <Select className={CHAMP} value={statut} onChange={(event) => { setStatut(event.target.value); setPage(1); }}>
              <option value="">Tous les statuts</option>
              {data.statuts.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
            </Select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[55rem] text-left">
              <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Référence</th>
                  <th className="px-4 py-3">Entité</th>
                  <th className="px-4 py-3">Poste</th>
                  <th className="px-4 py-3">Impact</th>
                  <th className="px-4 py-3" data-min="">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-on-surface-variant">Aucune demande dans cet onglet.</td></tr>
                ) : lignes.map((item) => (
                  <tr key={item.reference} title={`Modifier ${item.reference}`} onClick={ouvreAuClic(() => ouvrirSaisie(item))} className="cursor-pointer border-t border-hairline hover:bg-surface-container-low/70">
                    <td className="px-4 py-3">
                      <p className="font-label-md text-label-md text-on-surface">{item.reference}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{dateCourte(item.recu_le)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{item.entite}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.direction}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{item.poste}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.nature_libelle}</p>
                    </td>
                    <td className="px-4 py-3 text-on-surface">{item.impact_libelle}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-1 font-label-sm text-label-sm ${ton(item.statut)}`}>{item.statut_libelle}</span>
                      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{item.visa}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {(item.statut === "arbitrage" || item.statut === "visa_cf") && (
                          <button type="button" className={ACTION} title="Instruire" aria-label={`Instruire ${item.reference}`} onClick={() => { setDemande(item); setInstruction({ statut: item.statut, visa: item.visa, motif: "" }); setPanneau("instruire"); }}>
                            <Icone nom="gavel" className="text-lg" />
                          </button>
                        )}
                        {item.statut === "acte" && !item.notifiee && (
                          <button type="button" className={ACTION} title="Notifier" aria-label={`Notifier ${item.reference}`} onClick={() => agir({
                            confirmation: `Notifier ${item.reference} à l'entité concernée ?`,
                            confirmLabel: "Notifier",
                            attente: "Notification…",
                            route: `/api/v1/dotation/demandes/${item.reference}/notifier/`,
                            succes: "Demande notifiée",
                          })}>
                            <Icone nom="send" className="text-lg" />
                          </button>
                        )}
                        {item.notifiee ? <span className="self-center font-label-sm text-label-sm text-primary" title="Notifiée">Notifiée</span> : null}
                        <button type="button" className={ACTION} title="Modifier" aria-label={`Modifier ${item.reference}`} onClick={() => ouvrirSaisie(item)}>
                          <Icone nom="edit" className="text-lg" />
                        </button>
                        <button type="button" className={ACTION_DANGER} title="Supprimer" aria-label={`Supprimer ${item.reference}`} onClick={() => agir({
                          confirmation: `Retirer ${item.reference} de cet onglet ?`,
                          confirmLabel: "Supprimer",
                          attente: "Suppression…",
                          route: `/api/v1/dotation/demandes/${item.reference}/supprimer/`,
                          succes: "Demande retirée",
                        })}>
                          <Icone nom="delete" className="text-lg" />
                        </button>
                        <button type="button" className={ACTION} title="Consulter" aria-label={`Consulter ${item.reference}`} onClick={() => { setDemande(item); setPanneau("consulter"); }}>
                          <Icone nom="visibility" className="text-lg" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {visibles.length === 0 ? "0 demande" : `${(courante - 1) * TAILLE + 1} à ${Math.min(courante * TAILLE, visibles.length)} sur ${visibles.length}`}
            </p>
            <div className="flex gap-1">
              <button type="button" className={SECOND} disabled={courante <= 1} onClick={() => setPage(courante - 1)}>Précédent</button>
              <button type="button" className={SECOND} disabled={courante >= pages} onClick={() => setPage(courante + 1)}>Suivant</button>
            </div>
          </div>
        </section>

        <section className={`${CARTE} p-6`}>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Plafonds par branche</h2>
          </div>
          <div className="mt-4 space-y-4">
            {data.branches.map((branche) => (
              <div key={branche.code}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-label-lg text-label-lg text-on-surface">
                    <Icone nom={branche.icone} className="mr-1 align-middle text-lg text-primary" />
                    {branche.libelle}
                  </p>
                  <p className="font-code-num text-code-num text-on-surface">{nombre(branche.effectif)} / {nombre(branche.plafond)} · {nombre(branche.taux, 1)} %</p>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{branche.entites} · {nombre(branche.besoins)} poste{branche.besoins > 1 ? "s" : ""} exprimé{branche.besoins > 1 ? "s" : ""} · {branche.note}</p>
                <div className="mt-1 h-2 overflow-hidden rounded bg-surface-container">
                  <div className={`h-full ${branche.taux >= 97 ? "bg-secondary" : "bg-primary"}`} style={{ width: `${Math.min(100, branche.taux)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">
            Taux de vacance du portefeuille : {nombre(data.plafond ? (100 * data.vacants) / data.plafond : 0, 2)} %.
          </p>
        </section>

        {onglet === "redeploiement" ? <section className={`${CARTE} p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Redéploiements entre entités</h2>
            </div>
            <button type="button" className={PRIMAIRE} onClick={() => { setPont({ cedant: "", recepteur: "", profil: "", effectif: "1", note: "" }); setPanneau("pont"); }}>
              Acter une passerelle
            </button>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {data.passerelles.map((item) => (
              <article key={item.id} className="rounded-lg bg-surface-container-low p-4">
                <p className="font-label-md text-label-md text-on-surface">{item.cedant}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">vers {item.recepteur}</p>
                <p className="mt-2 text-on-surface">{item.effectif} · {item.profil}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{item.statut_libelle}</p>
                <button type="button" className={`${SECOND} mt-3`} onClick={() => { setPasserelle(item); setPanneau("voir-pont"); }}>Consulter</button>
              </article>
            ))}
          </div>
        </section> : null}
      </div>

      {panneau === "plan" || panneau === "modifier" ? (
        <Modale titre={panneau === "modifier" ? `Modifier ${demande?.reference ?? ""}` : ongletActif.saisie} onClose={fermer} large>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); (panneau === "modifier" ? modifier : creer).mutate(); }}>
            <label className="block sm:col-span-2">Entité
              <Select className={`${CHAMP} mt-1`} required value={plan.entite} onChange={(event) => {
                const code = event.target.value;
                const choisi = data.entites.find((item) => item.code === code);
                setPlan({ ...plan, entite: code, direction: choisi?.nom ?? "", poste: posteAuto(data.postes, code, plan.poste) });
              }}>
                <option value="">Choisir</option>
                {optionsEntites(data.entites)}
              </Select>
            </label>
            <label className="block">Direction
              <input className={`${CHAMP} mt-1`} required value={plan.direction} onChange={(event) => setPlan({ ...plan, direction: event.target.value })} />
            </label>
            <label className="block">Poste
              <Select className={`${CHAMP} mt-1`} required value={plan.poste} onChange={(event) => setPlan({ ...plan, poste: event.target.value })}>
                <option value="">Choisir</option>
                {postesPour(data.postes, plan.entite, plan.poste).map((item) => (
                  <option key={item.libelle} value={item.libelle}>{item.libelle}</option>
                ))}
              </Select>
            </label>
            <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">
              Onglet : {ONGLETS.find((item) => item.id === onglet)?.libelle}
            </p>
            <label className="block">Postes demandés
              <input className={`${CHAMP} mt-1`} required type="number" min={0} value={plan.impact} onChange={(event) => setPlan({ ...plan, impact: event.target.value })} />
            </label>
            <label className="block sm:col-span-2">Motif
              <textarea className={`${CHAMP} mt-1 h-24 py-2`} value={plan.detail} onChange={(event) => setPlan({ ...plan, detail: event.target.value })} />
            </label>
            {(panneau === "modifier" ? modifier : creer).isError ? <p className="sm:col-span-2 text-error">{message((panneau === "modifier" ? modifier : creer).error)}</p> : null}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" className={SECOND} onClick={fermer}>Annuler</button>
              <button type="submit" className={PRIMAIRE} disabled={creer.isPending || modifier.isPending}>Enregistrer</button>
            </div>
          </form>
        </Modale>
      ) : null}

      {panneau === "instruire" && demande ? (
        <Modale titre={`Instruire ${demande.reference}`} onClose={fermer}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); instruire.mutate(); }}>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{demande.entite} · {demande.poste}</p>
            <label className="block">Décision
              <Select className={`${CHAMP} mt-1`} value={instruction.statut} onChange={(event) => setInstruction({ ...instruction, statut: event.target.value })}>
                {data.statuts.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </Select>
            </label>
            <label className="block">Référence de visa
              <input className={`${CHAMP} mt-1`} value={instruction.visa} onChange={(event) => setInstruction({ ...instruction, visa: event.target.value })} />
            </label>
            <label className="block">Motif
              <textarea className={`${CHAMP} mt-1 h-24 py-2`} required value={instruction.motif} onChange={(event) => setInstruction({ ...instruction, motif: event.target.value })} />
            </label>
            {instruire.isError ? <p className="text-error">{message(instruire.error)}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECOND} onClick={fermer}>Annuler</button>
              <button type="submit" className={PRIMAIRE} disabled={instruire.isPending}>Enregistrer</button>
            </div>
          </form>
        </Modale>
      ) : null}

      {panneau === "consulter" && demande ? (
        <Modale titre={demande.reference} onClose={fermer}>
          <dl className="space-y-2 font-body-md text-body-md">
            <Ligne k="Entité" v={`${demande.entite} · ${demande.direction}`} />
            <Ligne k="Poste" v={`${demande.poste} · ${demande.nature_libelle}`} />
            <Ligne k="Impact" v={demande.impact_libelle} />
            <Ligne k="Statut" v={demande.statut_libelle} />
            <Ligne k="Visa" v={demande.visa || "—"} />
            <Ligne k="Motif" v={demande.detail || "—"} />
            <Ligne k="Reçue le" v={dateCourte(demande.recu_le)} />
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={SECOND} onClick={fermer}>Fermer</button>
            <button type="button" className={PRIMAIRE} onClick={() => { setInstruction({ statut: demande.statut, visa: demande.visa, motif: demande.detail }); setPanneau("instruire"); }}>Reprendre l'instruction</button>
          </div>
        </Modale>
      ) : null}

      {panneau === "historique" ? (
        <Modale titre="Historique des arbitrages" onClose={fermer} large>
          <ul className="space-y-3">
            {data.journal.length === 0 ? <li className="text-on-surface-variant">Aucune écriture.</li> : data.journal.map((item) => (
              <li key={item.reference} className="rounded-lg bg-surface-container-low p-3">
                <p className="font-label-md text-label-md text-on-surface">{item.titre}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{item.reference} · {dateCourte(item.cree_le)} · {item.auteur}</p>
              </li>
            ))}
          </ul>
        </Modale>
      ) : null}

      {panneau === "pont" ? (
        <Modale titre="Nouvelle passerelle" onClose={fermer}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); creerPont.mutate(); }}>
            <label className="block">Programme cédant
              <input className={`${CHAMP} mt-1`} required value={pont.cedant} onChange={(event) => setPont({ ...pont, cedant: event.target.value })} />
            </label>
            <label className="block">Programme récepteur
              <input className={`${CHAMP} mt-1`} required value={pont.recepteur} onChange={(event) => setPont({ ...pont, recepteur: event.target.value })} />
            </label>
            <label className="block">Profil
              <input className={`${CHAMP} mt-1`} required value={pont.profil} onChange={(event) => setPont({ ...pont, profil: event.target.value })} />
            </label>
            <label className="block">Effectif
              <input className={`${CHAMP} mt-1`} required type="number" min={1} value={pont.effectif} onChange={(event) => setPont({ ...pont, effectif: event.target.value })} />
            </label>
            <label className="block">Motif
              <textarea className={`${CHAMP} mt-1 h-24 py-2`} required value={pont.note} onChange={(event) => setPont({ ...pont, note: event.target.value })} />
            </label>
            {creerPont.isError ? <p className="text-error">{message(creerPont.error)}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECOND} onClick={fermer}>Annuler</button>
              <button type="submit" className={PRIMAIRE} disabled={creerPont.isPending}>Enregistrer</button>
            </div>
          </form>
        </Modale>
      ) : null}

      {panneau === "arbitrer" ? (
        <Modale titre="Arbitrer un redéploiement" onClose={fermer}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); deciderPont.mutate(); }}>
            <label className="block">Passerelle
              <Select className={`${CHAMP} mt-1`} required value={decisionPont.id} onChange={(event) => setDecisionPont({ ...decisionPont, id: event.target.value })}>
                <option value="">Choisir</option>
                {data.passerelles.map((item) => <option key={item.id} value={item.id}>{item.cedant} vers {item.recepteur}</option>)}
              </Select>
            </label>
            <label className="block">Décision
              <Select className={`${CHAMP} mt-1`} value={decisionPont.statut} onChange={(event) => setDecisionPont({ ...decisionPont, statut: event.target.value })}>
                <option value="actee">Actée</option>
                <option value="proposee">Laisser en proposition</option>
              </Select>
            </label>
            <label className="block">Motif
              <textarea className={`${CHAMP} mt-1 h-24 py-2`} required value={decisionPont.note} onChange={(event) => setDecisionPont({ ...decisionPont, note: event.target.value })} />
            </label>
            {deciderPont.isError ? <p className="text-error">{message(deciderPont.error)}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECOND} onClick={fermer}>Annuler</button>
              <button type="submit" className={PRIMAIRE} disabled={deciderPont.isPending || !decisionPont.id}>Enregistrer</button>
            </div>
          </form>
        </Modale>
      ) : null}

      {panneau === "voir-pont" && passerelle ? (
        <Modale titre="Passerelle" onClose={fermer}>
          <dl className="space-y-2 font-body-md text-body-md">
            <Ligne k="Cédant" v={passerelle.cedant} />
            <Ligne k="Récepteur" v={passerelle.recepteur} />
            <Ligne k="Profil" v={passerelle.profil} />
            <Ligne k="Effectif" v={nombre(passerelle.effectif)} />
            <Ligne k="Statut" v={passerelle.statut_libelle} />
            <Ligne k="Motif" v={passerelle.note || "—"} />
          </dl>
          <div className="mt-4 flex justify-end">
            <button type="button" className={PRIMAIRE} onClick={() => { setDecisionPont({ id: String(passerelle.id), statut: passerelle.statut, note: passerelle.note }); setPanneau("arbitrer"); }}>Arbitrer</button>
          </div>
        </Modale>
      ) : null}
    </AppChrome>
  );
}

function Ligne({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{k}</dt>
      <dd className="text-on-surface">{v}</dd>
    </div>
  );
}
