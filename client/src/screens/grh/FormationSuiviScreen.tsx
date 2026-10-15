import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../../api/client";
import { dateCourte, fcfa, nombre } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { Pagination, usePagination } from "../../ui/Pagination";
import { CARTE, CHAMP, Kpi, LIBELLE, pourcent, PageGrh, Section } from "./ui";

type Externe = {
  id: number;
  agent: { matricule: string; nom_complet: string };
  intitule: string;
  cadre: string;
  cadre_libelle: string;
  zone_libelle: string;
  dispensateur: string;
  lieu: string;
  date_debut: string;
  date_fin: string | null;
  observation: string;
  etat: "a_venir" | "en_cours" | "terminee";
  etat_libelle: string;
};
type LigneSuivi = {
  id: number;
  reference: string;
  agent: { matricule: string; nom_complet: string; initiales: string; fonction: string; structure: string };
  session: { code: string; libelle: string; zone_libelle: string; cadre_libelle: string; lieu: string; etat: string; date_debut: string | null; date_fin: string | null };
  position: string;
  position_libelle: string;
  present: boolean | null;
  note_satisfaction: number | null;
  issue: string;
  observation: string;
  modifiable: boolean;
};

type Cadre = {
  code: string;
  libelle: string;
  modules: number;
  termines: number;
  places: number;
  retenus: number;
  formes: number;
  engage: number;
  satisfaction: number | null;
  sessions: { code: string; libelle: string; type_libelle: string; etat: string; etat_libelle: string; lieu: string; date_debut: string | null; date_fin: string | null; retenues: number; places: number; engage: number }[];
};
type Suivi = {
  exercice: number;
  plan: { dotation: number; objectif_agents: number };
  cadres: Cadre[];
  agents: LigneSuivi[];
  externes: Externe[];
  agents_choix: { matricule: string; nom_complet: string }[];
  cadres_externes: { code: string; libelle: string; zone_libelle: string }[];
  positions: { code: string; libelle: string; nombre: number }[];
  issues: { code: string; libelle: string }[];
  bilan: {
    modules: number; annules: number; engage: number; execution_budget: number | null; formes: number; realisation_objectif: number | null;
    satisfaction: number | null; besoins: number; besoins_couverts: number; couverture_besoins: number | null;
  };
};

const GROUPES = [
  { titre: "Formation hors Côte d'Ivoire", codes: ["hors_ci_courte", "hors_ci_longue"] },
  { titre: "Formation en Côte d'Ivoire", codes: ["ci_ministere", "ci_concours", "ci_partenaires"] },
  { titre: "Cadre à préciser", codes: [""] },
];

function useSuivi() {
  return useQuery({ queryKey: ["grh-formation-suivi"], queryFn: () => api<Suivi>("/api/v1/grh/formation/suivi/") });
}

/** Suivi du plan de formation : les modules regroupés selon le lieu et la nature de la formation. */
export function FormationSuiviScreen() {
  const suivi = useSuivi();
  const s = suivi.data;
  return (
    <PageGrh
      rubrique="Formation continue"
      titre="Suivi du plan de formation"
      resume={s ? `Exercice ${s.exercice} : exécution du plan, module par module.` : undefined}
      chargement={suivi.isLoading}
      erreur={suivi.isError ? "Le suivi n'a pas pu être chargé." : undefined}
      actions={<Link to="/app/formation" className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-low text-primary font-label-md text-label-md">Planifier un module</Link>}
    >
      {s ? (
        <>
          {s.cadres.some((c) => c.code === "") ? (
            <p className={`${CARTE} px-6 py-4 font-body-md text-body-md text-on-surface`}>
              Des modules n'ont pas encore de cadre. Précisez-le dans « Élaboration du plan de formation » (modifier le module).
            </p>
          ) : null}
          {GROUPES.map((groupe) => {
            const cadres = s.cadres.filter((c) => groupe.codes.includes(c.code));
            if (!cadres.length && groupe.codes[0] === "") return null;
            return (
              <Section key={groupe.titre} titre={groupe.titre} icone={groupe.codes[0].startsWith("hors") ? "flight_takeoff" : "location_city"}>
                <div className="grid gap-6 grid-cols-1">
                  {(groupe.codes[0] === "" ? cadres : groupe.codes.map((code) => cadres.find((c) => c.code === code) ?? vide(code))).map((c) => (
                    <CarteCadre key={c.code} cadre={c} suivi={s} />
                  ))}
                </div>
              </Section>
            );
          })}
        </>
      ) : null}
    </PageGrh>
  );
}

const TON_POSITION: Record<string, string> = {
  candidature: "bg-surface-container-high text-on-surface",
  a_venir: "bg-primary-fixed text-on-primary-fixed",
  en_formation: "bg-primary text-on-primary",
  a_emarger: "bg-secondary-fixed text-on-secondary-fixed",
  formee: "bg-primary/10 text-primary",
  absente: "bg-error-container text-on-error-container",
  abandon: "bg-error-container text-on-error-container",
  reportee: "bg-secondary-fixed text-on-secondary-fixed",
  annulee: "bg-surface-container-high text-on-surface-variant",
  refusee: "bg-error-container text-on-error-container",
};

function ModaleExterne({ suivi, externe, cadreInitial, onClose }: { suivi: Suivi; externe: Externe | null; cadreInitial: string; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    matricule: externe?.agent.matricule ?? "",
    intitule: externe?.intitule ?? "",
    cadre: externe?.cadre ?? cadreInitial,
    dispensateur: externe?.dispensateur ?? "",
    lieu: externe?.lieu ?? "",
    date_debut: externe?.date_debut ?? "",
    date_fin: externe?.date_fin ?? "",
    observation: externe?.observation ?? "",
  });
  const envoi = useMutation({
    mutationFn: () => api(externe ? `/api/v1/grh/formation/externes/${externe.id}/` : "/api/v1/grh/formation/externes/", { method: externe ? "PATCH" : "POST", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["grh-formation-suivi"] });
      feedback.toast(externe ? "Formation mise à jour" : "Formation ajoutée au suivi");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (e: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: e.target.value });
  return (
    <Modale titre={externe ? "Modifier la formation suivie" : "Suivre une formation hors plan"} sousTitre="Formation non organisée par le ministère : on collecte ce qui concerne l'agent." icone="travel_explore" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.error ? "L'enregistrement n'a pas abouti." : undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Agent <span className="text-error">*</span></span>
          <select className={CHAMP} required value={saisie.matricule} onChange={champ("matricule")}>
            <option value="">Choisir un agent…</option>
            {suivi.agents_choix.map((a) => <option key={a.matricule} value={a.matricule}>{a.nom_complet} · {a.matricule}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Formation <span className="text-error">*</span></span><input className={CHAMP} required maxLength={200} value={saisie.intitule} onChange={champ("intitule")} /></label>
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Lieu et catégorie <span className="text-error">*</span></span>
          <select className={CHAMP} required value={saisie.cadre} onChange={champ("cadre")}>
            <option value="">Choisir…</option>
            {suivi.cadres_externes.map((c) => <option key={c.code} value={c.code}>{c.zone_libelle} · {c.libelle}</option>)}
          </select>
        </label>
        <label className="block"><span className={LIBELLE}>Dispensateur</span><input className={CHAMP} maxLength={200} value={saisie.dispensateur} onChange={champ("dispensateur")} placeholder="Établissement, partenaire…" /></label>
        <label className="block"><span className={LIBELLE}>Lieu (ville, pays)</span><input className={CHAMP} maxLength={160} value={saisie.lieu} onChange={champ("lieu")} /></label>
        <label className="block"><span className={LIBELLE}>Début <span className="text-error">*</span></span><input className={CHAMP} required type="date" value={saisie.date_debut} onChange={champ("date_debut")} /></label>
        <label className="block"><span className={LIBELLE}>Fin</span><input className={CHAMP} type="date" min={saisie.date_debut || undefined} value={saisie.date_fin} onChange={champ("date_fin")} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Observation</span><input className={CHAMP} maxLength={240} value={saisie.observation} onChange={champ("observation")} /></label>
      </div>
    </Modale>
  );
}

function ModaleInscription({ suivi, modules, onClose }: { suivi: Suivi; modules: Cadre["sessions"]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [module, setModule] = useState(modules[0]?.code ?? "");
  const [matricule, setMatricule] = useState("");
  const envoi = useMutation({
    mutationFn: async () => {
      const reponse = await api<{ resultats: { ok: boolean; message: string }[] }>(`/api/v1/formation/sessions/${module}/inscrire/`, { method: "POST", body: JSON.stringify({ matricules: [matricule] }) });
      const premier = reponse.resultats[0];
      if (!premier?.ok) throw new Error(premier?.message ?? "L'inscription n'a pas abouti.");
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["grh-formation-suivi"] });
      feedback.toast("Agent inscrit : sa candidature entre dans le circuit");
      onClose();
    },
  });
  return (
    <Modale titre="Inscrire un agent" sousTitre="Seuls les modules ouverts aux inscriptions sont proposés." icone="how_to_reg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={envoi.error instanceof Error ? envoi.error.message : undefined}>
      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className={LIBELLE}>Module <span className="text-error">*</span></span>
          <select className={CHAMP} required value={module} onChange={(e) => setModule(e.target.value)}>
            {modules.length === 0 ? <option value="">Aucun module ouvert aux inscriptions</option> : null}
            {modules.map((m) => <option key={m.code} value={m.code}>{m.libelle}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LIBELLE}>Agent <span className="text-error">*</span></span>
          <select className={CHAMP} required value={matricule} onChange={(e) => setMatricule(e.target.value)}>
            <option value="">Choisir un agent…</option>
            {suivi.agents_choix.map((a) => <option key={a.matricule} value={a.matricule}>{a.nom_complet} · {a.matricule}</option>)}
          </select>
        </label>
      </div>
    </Modale>
  );
}

function ModaleSuivi({ ligne, issues, onClose }: { ligne: LigneSuivi; issues: Suivi["issues"]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    present: ligne.present === null ? "" : ligne.present ? "oui" : "non",
    note: ligne.note_satisfaction ? String(ligne.note_satisfaction) : "",
    issue: ligne.issue,
    observation: ligne.observation,
  });
  const envoi = useMutation({
    mutationFn: () => api(`/api/v1/grh/formation/suivi/${ligne.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        present: saisie.present === "" ? null : saisie.present === "oui",
        note_satisfaction: saisie.note ? Number(saisie.note) : null,
        issue: saisie.issue,
        observation: saisie.observation,
      }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["grh-formation-suivi"] });
      feedback.toast("Suivi mis à jour");
      onClose();
    },
  });
  return (
    <Modale titre="Suivi de l'agent" sousTitre={`${ligne.agent.nom_complet} · ${ligne.session.libelle}`} icone="how_to_reg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.error ? "Le suivi n'a pas été enregistré." : undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className={LIBELLE}>Présence</span>
          <select className={CHAMP} value={saisie.present} onChange={(e) => setSaisie({ ...saisie, present: e.target.value })}>
            <option value="">Non renseignée</option>
            <option value="oui">Présent</option>
            <option value="non">Absent</option>
          </select>
        </label>
        <label className="block">
          <span className={LIBELLE}>Note de satisfaction</span>
          <select className={CHAMP} value={saisie.note} onChange={(e) => setSaisie({ ...saisie, note: e.target.value })}>
            <option value="">Aucune</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Issue particulière</span>
          <select className={CHAMP} value={saisie.issue} onChange={(e) => setSaisie({ ...saisie, issue: e.target.value })}>
            <option value="">Aucune : la position suit le module</option>
            {issues.map((i) => <option key={i.code} value={i.code}>{i.libelle}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Observation</span>
          <input className={CHAMP} maxLength={240} value={saisie.observation} onChange={(e) => setSaisie({ ...saisie, observation: e.target.value })} />
        </label>
      </div>
    </Modale>
  );
}

function vide(code: string): Cadre {
  const libelles: Record<string, string> = {
    hors_ci_courte: "Courte durée",
    hors_ci_longue: "Longue durée",
    ci_ministere: "Dispensées par le ministère",
    ci_concours: "Après concours professionnel",
    ci_partenaires: "Dispensées par des partenaires techniques",
  };
  return { code, libelle: libelles[code] ?? code, modules: 0, termines: 0, places: 0, retenus: 0, formes: 0, engage: 0, satisfaction: null, sessions: [] };
}

function CarteCadre({ cadre, suivi }: { cadre: Cadre; suivi: Suivi }) {
  return cadre.code === "ci_ministere" ? <CarteMinistere cadre={cadre} suivi={suivi} /> : <CarteHorsPlan cadre={cadre} suivi={suivi} />;
}

function CarteHorsPlan({ cadre, suivi }: { cadre: Cadre; suivi: Suivi }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [externe, setExterne] = useState<Externe | "nouvelle" | null>(null);
  const horsPlan = suivi.externes.filter((e) => e.cadre === cadre.code);
  const page = usePagination(horsPlan, cadre.code);

  async function retirer(e: Externe) {
    if (!(await feedback.confirm(`Retirer la formation « ${e.intitule} » de ${e.agent.nom_complet} ?`, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/grh/formation/externes/${e.id}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["grh-formation-suivi"] });
    }, { success: { title: "Formation retirée du suivi" }, error: "La suppression n'a pas abouti." });
  }

return (
    <div className="rounded-lg border border-hairline p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-label-md text-label-md text-primary font-bold uppercase tracking-wide">{cadre.libelle} · {horsPlan.length}</h3>
        <button type="button" className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold" onClick={() => setExterne("nouvelle")}>
          <Icone nom="add" className="text-sm" />
          Ajouter
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
              <th className="py-2 pr-4 font-medium">Agent</th>
              <th className="py-2 pr-4 font-medium">Formation</th>
              <th className="py-2 pr-4 font-medium">Dispensateur</th>
              <th className="py-2 pr-4 font-medium">Lieu</th>
              <th className="py-2 pr-4 font-medium">Période</th>
              <th className="py-2 pr-4 font-medium">État</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {horsPlan.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-on-surface-variant">Aucun agent n'est suivi dans cette catégorie.</td></tr>
            ) : page.visibles.map((e) => (
              <tr key={e.id} className="border-b border-hairline text-on-surface align-top">
                <td className="py-3 pr-4"><span className="font-semibold block">{e.agent.nom_complet}</span><span className="text-on-surface-variant">{e.agent.matricule}</span></td>
                <td className="py-3 pr-4">
                  <span className="block">{e.intitule}</span>
                  {e.observation ? <span className="block text-on-surface-variant">{e.observation}</span> : null}
                </td>
                <td className="py-3 pr-4">{e.dispensateur || "—"}</td>
                <td className="py-3 pr-4">{e.lieu || "—"}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{dateCourte(e.date_debut)} → {dateCourte(e.date_fin)}</td>
                <td className="py-3 pr-4"><span className="inline-flex px-2.5 py-1 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold">{e.etat_libelle}</span></td>
                <td className="py-3 text-right whitespace-nowrap">
                  <button type="button" aria-label={`Modifier la formation de ${e.agent.nom_complet}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => setExterne(e)}><Icone nom="edit" className="text-lg" /></button>
                  <button type="button" aria-label={`Supprimer la formation de ${e.agent.nom_complet}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => void retirer(e)}><Icone nom="delete" className="text-lg" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="formation" />
      {externe ? <ModaleExterne suivi={suivi} externe={externe === "nouvelle" ? null : externe} cadreInitial={cadre.code} onClose={() => setExterne(null)} /> : null}
    </div>
  );
}

function CarteMinistere({ cadre, suivi }: { cadre: Cadre; suivi: Suivi }) {
  const { agents, issues } = suivi;
  const client = useQueryClient();
  const feedback = useFeedback();
  const [edition, setEdition] = useState<LigneSuivi | null>(null);
  const [ajout, setAjout] = useState(false);
  const lignes = agents.filter((l) => cadre.sessions.some((m) => m.code === l.session.code));
  const page = usePagination(lignes, cadre.code);

  async function retirerInscrit(l: LigneSuivi) {
    if (!(await feedback.confirm(`Retirer ${l.agent.nom_complet} du module « ${l.session.libelle} » ?`, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/grh/formation/suivi/${l.id}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: ["grh-formation-suivi"] });
    }, { success: { title: "Agent retiré du module" }, error: "La suppression n'a pas abouti." });
  }

  return (
    <div className="rounded-lg border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-label-md text-label-md text-primary font-bold uppercase tracking-wide">{cadre.libelle} · {lignes.length}</h3>
        <span className="flex flex-wrap gap-2">
          <Link to="/app/formation" className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-sm text-label-sm font-semibold">
            <Icone nom="edit_calendar" className="text-sm" />
            Élaborer dans le plan
          </Link>
          <button type="button" className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold" onClick={() => setAjout(true)}>
            <Icone nom="add" className="text-sm" />
            Inscrire un agent
          </button>
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
              <th className="py-2 pr-4 font-medium">Agent</th>
              <th className="py-2 pr-4 font-medium">Module</th>
              <th className="py-2 pr-4 font-medium">Lieu</th>
              <th className="py-2 pr-4 font-medium">Période</th>
              <th className="py-2 pr-4 font-medium">Position</th>
              <th className="py-2 pr-4 font-medium">Suivi</th>
              <th className="py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-on-surface-variant">Aucun agent n'est inscrit aux modules du plan de formation.</td></tr>
            ) : page.visibles.map((l) => (
              <tr key={l.id} className="border-b border-hairline text-on-surface align-top">
                <td className="py-3 pr-4"><span className="font-semibold block">{l.agent.nom_complet}</span><span className="text-on-surface-variant">{l.agent.matricule}</span></td>
                <td className="py-3 pr-4">{l.session.libelle}</td>
                <td className="py-3 pr-4">{l.session.lieu || "—"}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{dateCourte(l.session.date_debut)} → {dateCourte(l.session.date_fin)}</td>
                <td className="py-3 pr-4"><span className={`inline-flex px-2.5 py-1 rounded font-label-sm text-label-sm font-bold ${TON_POSITION[l.position] ?? ""}`}>{l.position_libelle}</span></td>
                <td className="py-3 pr-4 text-on-surface-variant">
                  {l.modifiable ? (
                    <>
                      <span className="block">{l.present === null ? "Présence non renseignée" : l.present ? "Présent" : "Absent"}{l.note_satisfaction ? ` · note ${l.note_satisfaction}/5` : ""}</span>
                      {l.observation ? <span className="block">{l.observation}</span> : null}
                    </>
                  ) : "Suit son circuit de validation"}
                </td>
                <td className="py-3 text-right whitespace-nowrap">
                  {l.modifiable ? (
                    <button type="button" aria-label={`Modifier le suivi de ${l.agent.nom_complet}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => setEdition(l)}><Icone nom="edit" className="text-lg" /></button>
                  ) : null}
                  <button type="button" aria-label={`Retirer ${l.agent.nom_complet} du module`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => void retirerInscrit(l)}><Icone nom="delete" className="text-lg" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="agent" />
      {ajout ? <ModaleInscription suivi={suivi} modules={cadre.sessions.filter((m) => m.etat === "inscriptions_ouvertes")} onClose={() => setAjout(false)} /> : null}
      {edition ? <ModaleSuivi ligne={edition} issues={issues} onClose={() => setEdition(null)} /> : null}
    </div>
  );
}

/** Bilan de la formation continue : budget, objectif, satisfaction et couverture des besoins. */
export function FormationBilanScreen() {
  const suivi = useSuivi();
  const s = suivi.data;
  return (
    <PageGrh
      rubrique="Formation continue"
      titre="Bilan de la formation"
      resume={s ? `Exercice ${s.exercice} : ce que le plan de formation a produit.` : undefined}
      chargement={suivi.isLoading}
      erreur={suivi.isError ? "Le bilan n'a pas pu être chargé." : undefined}
    >
      {s ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="payments" libelle="Budget engagé" valeur={pourcent(s.bilan.execution_budget)} detail={`${fcfa(s.bilan.engage)} sur ${fcfa(s.plan.dotation)} FCFA`} />
            <Kpi icone="groups" libelle="Objectif d'agents formés" valeur={pourcent(s.bilan.realisation_objectif)} detail={`${nombre(s.bilan.formes)} formés sur ${nombre(s.plan.objectif_agents)}`} />
            <Kpi icone="rate_review" libelle="Satisfaction moyenne" valeur={s.bilan.satisfaction === null ? "—" : `${nombre(s.bilan.satisfaction, 2)} / 5`} detail="Notée à l'émargement" />
            <Kpi icone="fact_check" libelle="Besoins couverts" valeur={pourcent(s.bilan.couverture_besoins)} detail={`${nombre(s.bilan.besoins_couverts)} sur ${nombre(s.bilan.besoins)} besoins recensés`} />
          </section>
          <Section titre="Résultats par cadre de formation" icone="table_chart">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
                    <th className="py-2 pr-4 font-medium">Cadre</th>
                    <th className="py-2 pr-4 font-medium text-right">Modules</th>
                    <th className="py-2 pr-4 font-medium text-right">Terminés</th>
                    <th className="py-2 pr-4 font-medium text-right">Agents formés</th>
                    <th className="py-2 pr-4 font-medium text-right">Engagé (FCFA)</th>
                    <th className="py-2 font-medium text-right">Satisfaction</th>
                  </tr>
                </thead>
                <tbody>
                  {s.cadres.map((c) => (
                    <tr key={c.code} className="border-b border-hairline text-on-surface">
                      <td className="py-2 pr-4 font-semibold">{c.libelle}</td>
                      <td className="py-2 pr-4 text-right">{nombre(c.modules)}</td>
                      <td className="py-2 pr-4 text-right">{nombre(c.termines)}</td>
                      <td className="py-2 pr-4 text-right">{nombre(c.formes)}</td>
                      <td className="py-2 pr-4 text-right">{fcfa(c.engage)}</td>
                      <td className="py-2 text-right">{c.satisfaction === null ? "—" : `${nombre(c.satisfaction, 2)} / 5`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.bilan.annules ? <p className="mt-3 font-body-sm text-on-surface-variant">{nombre(s.bilan.annules)} module{s.bilan.annules > 1 ? "s" : ""} annulé{s.bilan.annules > 1 ? "s" : ""}, non compté{s.bilan.annules > 1 ? "s" : ""} ci-dessus.</p> : null}
          </Section>
        </>
      ) : null}
    </PageGrh>
  );
}
