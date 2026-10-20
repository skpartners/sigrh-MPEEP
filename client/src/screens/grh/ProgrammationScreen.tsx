import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { dateCourte, nombre } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { Pagination, usePagination } from "../../ui/Pagination";
import { CHAMP, Kpi, LIBELLE, PageGrh, Section } from "./ui";
import { LIBELLE_ETAT, type CampagneBesoins } from "../gpec/besoinsCommun";
import { Select } from "../../ui/Select";

type Etape = "conference" | "catalogue";
type Decision = "maintenu" | "modifie";
type Validation = {
  decision: Decision; decision_libelle: string; fonctionnaires: number; contractuels: number; volume: number;
  reference: string; observations: string; valide_le: string;
} | null;
type Ligne = {
  reference: string; emploi: { code: string; libelle: string }; grade: string;
  structures: { nom: string; fonctionnaires: number; contractuels: number }[]; nombre_structures: number;
  fonctionnaires: number; contractuels: number; volume: number;
  conference: Validation; catalogue: Validation;
};
type Programmation = {
  etape: Etape; libelle: string; campagne: CampagneBesoins | null; ouverte: boolean; peut_decider: boolean; lignes: Ligne[];
  totaux: {
    soumis: number; examines: number; maintenus: number; modifies: number;
    fonctionnaires_soumis: number; contractuels_soumis: number; fonctionnaires_valides: number; contractuels_valides: number;
    fonctionnaires_conference: number; contractuels_conference: number; volume_conference: number;
    volume_soumis: number; volume_valide: number;
  };
};

const TEXTES: Record<Etape, { titre: string; resume: string; reference: string; demande: string; vide: string; attente: string }> = {
  conference: {
    titre: "Besoins validés par la Conférence de programmation",
    resume: "La Conférence se prononce emploi par emploi sur les besoins collectés : elle maintient le nombre demandé ou le modifie. Le total est le décompte des emplois retenus.",
    reference: "Procès-verbal de la Conférence",
    demande: "Demandé",
    vide: "Aucun emploi n'a été demandé. Lancez d'abord l'appel dans « Besoins exprimés ».",
    attente: "L'appel est encore ouvert. La Conférence examine les besoins une fois la collecte clôturée.",
  },
  catalogue: {
    titre: "Catalogue des mesures nouvelles",
    resume: "Décision du ministère de la Fonction publique, après arbitrage : les effectifs qu'elle retient pour le ministère, emploi par emploi. On garde ce qui a été demandé, retenu en Conférence puis retenu au Catalogue ; le total est le décompte des emplois.",
    reference: "Référence du Catalogue des mesures nouvelles",
    demande: "Demandé",
    vide: "Aucun emploi n'a encore été retenu par la Conférence de programmation.",
    attente: "",
  },
};

const TON: Record<Decision, string> = {
  maintenu: "bg-primary-fixed text-on-primary-fixed",
  modifie: "bg-secondary-fixed text-on-secondary-fixed",
};

function message(erreur: unknown): string {
  return erreur instanceof ApiError ? erreur.message : "L'enregistrement n'a pas abouti.";
}

/** Une étape de la programmation : les besoins collectés, examinés un à un. */
export function ProgrammationScreen({ etape }: { etape: Etape }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const texte = TEXTES[etape];
  const donnees = useQuery({ queryKey: ["grh-programmation", etape], queryFn: () => api<Programmation>(`/api/v1/grh/programmation/${etape}/`) });
  const [cible, setCible] = useState<Ligne | null>(null);
  const [saisie, setSaisie] = useState({ fonctionnaires: "0", contractuels: "0", reference: "", observations: "" });
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("");
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const d = donnees.data;

  const plafond = (ligne: Ligne) => (etape === "conference" ? { f: ligne.fonctionnaires, c: ligne.contractuels } : { f: ligne.conference?.fonctionnaires ?? 0, c: ligne.conference?.contractuels ?? 0 });
  const decisionDe = (ligne: Ligne) => ligne[etape];

  const terme = recherche.trim().toLowerCase();
  const lignes = useMemo(() => (d?.lignes ?? []).filter((l) => {
    const v = l[etape];
    const etat = v ? v.decision : "attente";
    return (!filtre || etat === filtre) && (!terme || [l.emploi.libelle, l.grade, ...l.structures.map((s) => s.nom)].some((t) => t.toLowerCase().includes(terme)));
  }), [d?.lignes, etape, filtre, terme]);
  const page = usePagination(lignes, `${filtre}|${terme}|${etape}`);

  function ouvrir(ligne: Ligne) {
    const actuelle = decisionDe(ligne);
    const p = plafond(ligne);
    setSaisie({
      fonctionnaires: String(actuelle?.fonctionnaires ?? p.f),
      contractuels: String(actuelle?.contractuels ?? p.c),
      reference: actuelle?.reference ?? "",
      observations: actuelle?.observations ?? "",
    });
    setCible(ligne);
  }

  async function maintenir(ligne: Ligne) {
    await feedback.run("Enregistrement…", async () => {
      await api(`/api/v1/grh/programmation/${etape}/`, { method: "POST", body: JSON.stringify({ emploi: ligne.reference, maintenir: true }) });
      await client.invalidateQueries({ queryKey: ["grh-programmation"] });
    }, { success: { title: "Nombre maintenu" }, error: "L'enregistrement n'a pas abouti." });
  }

  const valider = useMutation({
    mutationFn: () => api(`/api/v1/grh/programmation/${etape}/`, {
      method: "POST",
      body: JSON.stringify({
        emploi: cible?.reference,
        fonctionnaires: Number(saisie.fonctionnaires), contractuels: Number(saisie.contractuels),
        reference: saisie.reference, observations: saisie.observations,
      }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["grh-programmation"] });
      feedback.toast(etape === "conference" ? "Décision de la Conférence enregistrée" : "Mesure nouvelle enregistrée");
      setCible(null);
    },
  });

  async function retirer(ligne: Ligne) {
    if (!(await feedback.confirm(`Retirer la décision pour l'emploi « ${ligne.emploi.libelle} » ?`, { confirmLabel: "Retirer" }))) return;
    await feedback.run("Retrait…", async () => {
      await api(`/api/v1/grh/programmation/${etape}/${ligne.reference}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["grh-programmation"] });
    }, { success: { title: "Décision retirée" }, error: "Le retrait n'a pas abouti." });
  }

  const peutDecider = Boolean(d?.peut_decider);
  const verrouille = Boolean(d && !d.ouverte);
  const raison = verrouille ? "Clôturez d'abord l'appel dans « Besoins exprimés »." : undefined;
  return (
    <PageGrh
      rubrique="Programmation des effectifs"
      titre={texte.titre}
      resume={texte.resume}
      chargement={donnees.isLoading}
      erreur={donnees.isError ? "Les besoins n'ont pas pu être chargés." : undefined}
    >
      {d ? (
        <>
          {etape === "conference" && !d.ouverte ? (
            <p role="status" className="rounded-xl border border-hairline bg-secondary-fixed px-6 py-4 font-body-md text-body-md text-on-secondary-fixed">{texte.attente}</p>
          ) : null}
          {d.campagne ? <p className="font-body-sm text-body-sm text-on-surface-variant">Collecte {d.campagne.exercice} · {LIBELLE_ETAT(d.campagne)}</p> : null}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="list_alt" libelle={etape === "catalogue" ? "Emplois retenus en Conférence" : "Emplois demandés"} valeur={nombre(d.totaux.soumis)} detail={`${nombre(d.totaux.examines)} examiné${d.totaux.examines > 1 ? "s" : ""}`} />
            <Kpi icone="task_alt" libelle="Maintenus" valeur={nombre(d.totaux.maintenus)} detail={`${nombre(d.totaux.modifies)} modifié${d.totaux.modifies > 1 ? "s" : ""}`} />
            <Kpi icone="badge" libelle={etape === "catalogue" ? "Fonctionnaires retenus au Catalogue" : "Fonctionnaires retenus"} valeur={`${nombre(d.totaux.fonctionnaires_valides)} / ${nombre(etape === "catalogue" ? d.totaux.fonctionnaires_conference : d.totaux.fonctionnaires_soumis)}`} detail={etape === "catalogue" ? "retenus au Catalogue / retenus en Conférence" : "retenus / demandés"} />
            <Kpi icone="assignment_ind" libelle={etape === "catalogue" ? "Contractuels retenus au Catalogue" : "Contractuels retenus"} valeur={`${nombre(d.totaux.contractuels_valides)} / ${nombre(etape === "catalogue" ? d.totaux.contractuels_conference : d.totaux.contractuels_soumis)}`} detail={etape === "catalogue" ? "retenus au Catalogue / retenus en Conférence" : "retenus / demandés"} />
          </section>
          <Section titre="Emplois à examiner" icone="how_to_vote">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative w-full max-w-md">
                <Icone nom="search" className="text-lg absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                <input type="search" aria-label="Rechercher un emploi" placeholder="Emploi, grade, structure…" className={`${CHAMP} pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden`} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
                {recherche ? (
                  <button type="button" aria-label="Effacer la recherche" className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-on-surface-variant hover:text-primary" onClick={() => setRecherche("")}>
                    <Icone nom="close" className="text-base" />
                  </button>
                ) : null}
              </div>
              <Select aria-label="Filtrer par décision" className={`${CHAMP} w-auto`} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
                <option value="">Toutes les décisions</option>
                <option value="attente">À examiner</option>
                <option value="maintenu">Maintenus</option>
                <option value="modifie">Modifiés</option>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
                    <th className="py-2 pr-4 font-medium">Emploi</th>
                    <th className="py-2 pr-4 font-medium text-right">Demandé</th>
                    {etape === "catalogue" ? <th className="py-2 pr-4 font-medium">Retenu en Conférence</th> : null}
                    <th className="py-2 pr-4 font-medium">{etape === "catalogue" ? "Retenu au Catalogue des mesures nouvelles" : "Décision de la Conférence"}</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.length === 0 ? (
                    <tr><td colSpan={etape === "catalogue" ? 5 : 4} className="py-6 text-on-surface-variant">{d.lignes.length ? "Aucun emploi ne correspond à ces critères." : d.campagne && etape === "conference" ? `Aucun emploi n'a été demandé lors de l'appel ${d.campagne.exercice}.` : texte.vide}{etape === "catalogue" && !d.lignes.length ? <> <Link to="/app/grh/programmation/conference" className="text-primary font-semibold underline">Ouvrir la Conférence de programmation</Link></> : null}</td></tr>
                  ) : page.visibles.map((ligne) => {
                    const v = decisionDe(ligne);
                    const ouvert = ouverts.has(ligne.reference);
                    return (
                      <Fragment key={ligne.reference}>
                        <tr className="border-b border-hairline text-on-surface align-top">
                          <td className="py-3 pr-4">
                            <button type="button" aria-expanded={ouvert} aria-label={`Détail des structures pour ${ligne.emploi.libelle}`} className="inline-flex items-start gap-1.5 text-left" onClick={() => setOuverts((actuel) => { const suivant = new Set(actuel); if (!suivant.delete(ligne.reference)) suivant.add(ligne.reference); return suivant; })}>
                              <Icone nom={ouvert ? "expand_more" : "chevron_right"} className="text-lg mt-px" />
                              <span><span className="font-semibold block">{ligne.emploi.libelle}</span><span className="text-on-surface-variant">{ligne.grade} · {ligne.nombre_structures} structure{ligne.nombre_structures > 1 ? "s" : ""}</span></span>
                            </button>
                          </td>
                          <td className="py-3 pr-4 text-right whitespace-nowrap">{nombre(ligne.fonctionnaires)} fonct.<span className="block">{nombre(ligne.contractuels)} contr.</span></td>
                          {etape === "catalogue" ? (
                            <td className="py-3 pr-4 whitespace-nowrap">
                              {ligne.conference ? <>{nombre(ligne.conference.fonctionnaires)} fonct.<span className="block">{nombre(ligne.conference.contractuels)} contr.</span><span className={`mt-1 inline-flex px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${TON[ligne.conference.decision]}`}>{ligne.conference.decision_libelle}</span></> : "—"}
                            </td>
                          ) : null}
                          <td className="py-3 pr-4">
                            {v ? (
                              <span>
                                <span className={`inline-flex px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${TON[v.decision]}`}>{v.decision_libelle}</span>
                                <span className="block mt-1">{nombre(v.fonctionnaires)} fonct. · {nombre(v.contractuels)} contr.</span>
                                <span className="block text-on-surface-variant">{dateCourte(v.valide_le)}{v.reference ? ` · ${v.reference}` : ""}</span>
                                {v.observations ? <span className="block text-on-surface-variant">{v.observations}</span> : null}
                              </span>
                            ) : <span className="text-on-surface-variant">{etape === "catalogue" ? "Décision attendue" : "À examiner"}</span>}
                          </td>
                          <td className="py-3 text-right whitespace-nowrap">
                            {peutDecider ? (
                              <>
                                <button type="button" className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold disabled:opacity-50" disabled={verrouille || v?.decision === "maintenu"} title={raison} onClick={() => void maintenir(ligne)}>
                                  <Icone nom="check" className="text-sm" />{etape === "catalogue" ? "Maintenir" : "Maintenir"}
                                </button>
                                <button type="button" className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold disabled:opacity-50" disabled={verrouille} title={raison} onClick={() => ouvrir(ligne)}>
                                  <Icone nom="edit" className="text-sm" />Modifier
                                </button>
                                {v ? (
                                  <button type="button" aria-label={`Retirer la décision pour ${ligne.emploi.libelle}`} className="ml-1 p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container-low disabled:opacity-40" disabled={verrouille} title={raison} onClick={() => void retirer(ligne)}>
                                    <Icone nom="delete" className="text-lg" />
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                          </td>
                        </tr>
                        {ouvert ? (
                          <tr className="border-b border-hairline bg-surface-container-low/50">
                            <td colSpan={etape === "catalogue" ? 5 : 4} className="py-2 pl-9 pr-4">
                              <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3 text-on-surface-variant">
                                {ligne.structures.map((st) => <li key={st.nom} className="flex justify-between gap-3"><span>{st.nom}</span><span className="whitespace-nowrap">{st.fonctionnaires} fonct. · {st.contractuels} contr.</span></li>)}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
                {d.lignes.length ? (
                  <tfoot>
                    <tr className="font-bold text-on-surface">
                      <td className="py-3 pr-4">Décompte · {nombre(d.totaux.soumis)} emploi{d.totaux.soumis > 1 ? "s" : ""}</td>
                      <td className="py-3 pr-4 text-right whitespace-nowrap">{nombre(d.totaux.fonctionnaires_soumis)} fonct.<span className="block">{nombre(d.totaux.contractuels_soumis)} contr.</span></td>
                      {etape === "catalogue" ? <td className="py-3 pr-4 whitespace-nowrap">{nombre(d.totaux.fonctionnaires_conference)} fonct.<span className="block">{nombre(d.totaux.contractuels_conference)} contr.</span></td> : null}
                      <td className="py-3 pr-4 whitespace-nowrap">{nombre(d.totaux.fonctionnaires_valides)} fonct.<span className="block">{nombre(d.totaux.contractuels_valides)} contr. · {nombre(d.totaux.volume_valide)} agents</span></td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="emploi" />
          </Section>
        </>
      ) : null}

      {cible ? (
        <Modale
          titre={`${etape === "conference" ? "Décision de la Conférence" : "Retenue au Catalogue"} · ${cible.emploi.libelle}`}
          sousTitre={`${cible.nombre_structures} structure${cible.nombre_structures > 1 ? "s" : ""} · demandé : ${cible.fonctionnaires} fonct., ${cible.contractuels} contr.${etape === "catalogue" && cible.conference ? ` · retenu en Conférence : ${cible.conference.fonctionnaires} fonct., ${cible.conference.contractuels} contr.` : ""}`}
          icone="how_to_vote"
          onClose={() => setCible(null)}
          onSubmit={() => valider.mutate()}
          enCours={valider.isPending}
          erreur={valider.isError ? message(valider.error) : undefined}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className={LIBELLE}>Fonctionnaires{etape === "catalogue" ? " retenus au Catalogue" : " retenus"}</span>
              <input className={CHAMP} type="number" min={0} max={500} required value={saisie.fonctionnaires} onChange={(e) => setSaisie({ ...saisie, fonctionnaires: e.target.value })} />
            </label>
            <label className="block">
              <span className={LIBELLE}>Contractuels{etape === "catalogue" ? " retenus au Catalogue" : " retenus"}</span>
              <input className={CHAMP} type="number" min={0} max={500} required value={saisie.contractuels} onChange={(e) => setSaisie({ ...saisie, contractuels: e.target.value })} />
            </label>
            <label className="block md:col-span-2">
              <span className={LIBELLE}>{texte.reference}</span>
              <input className={CHAMP} maxLength={80} value={saisie.reference} onChange={(e) => setSaisie({ ...saisie, reference: e.target.value })} />
            </label>
            <label className="block md:col-span-2">
              <span className={LIBELLE}>Motif de la modification</span>
              <input className={CHAMP} maxLength={240} value={saisie.observations} onChange={(e) => setSaisie({ ...saisie, observations: e.target.value })} placeholder="Obligatoire si les nombres diffèrent" />
            </label>
          </div>
        </Modale>
      ) : null}
    </PageGrh>
  );
}
