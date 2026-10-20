import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { dateCourte, nombre } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { SelectEmploi, useNomenclature } from "../../ui/Nomenclature";
import { usePagination } from "../../ui/Pagination";
import { CHAMP as CHAMP_GRH, Kpi, LIBELLE as LIBELLE_GRH, PageGrh } from "../grh/ui";
import { BOUTON, BOUTON_LEGER, CHAMP, ICONE, LIBELLE, LienDocument, Pastille, Recherche, TableauListe, erreurDe, type AgentRef, type Disposition, type Mouvement, type Redeploiement, type Structure } from "./commun";
import { Select } from "../../ui/Select";

type Donnees = {
  affectations: Mouvement[];
  reaffectations: Mouvement[];
  redeploiements: Redeploiement[];
  dispositions: Disposition[];
  structures: Structure[];
  agents: { matricule: string; nom_complet: string; structure: string; affecte: boolean }[];
};

type Onglet = "affectations" | "reaffectations" | "redeploiements" | "dispositions";
const ONGLETS: { id: Onglet; libelle: string; icone: string }[] = [
  { id: "affectations", libelle: "Suivi des affectations", icone: "person_add" },
  { id: "reaffectations", libelle: "Suivi des réaffectations", icone: "school" },
  { id: "dispositions", libelle: "Suivi des mises à disposition", icone: "handshake" },
  { id: "redeploiements", libelle: "Suivi des redéploiements", icone: "swap_horiz" },
];
const CLE = ["dotation-agents"];

/** Dotation : la répartition des agents et contractuels mis à la disposition du ministère, suivie par la DRH. */
export function DotationScreen() {
  const requete = useQuery({ queryKey: CLE, queryFn: () => api<Donnees>("/api/v1/dotation-agents/"), retry: false });
  const [onglet, setOnglet] = useState<Onglet>("affectations");
  const d = requete.data;
  const compte = (id: Onglet) => (d ? d[id].length : 0);
  return (
    <PageGrh
      rubrique="Programmation des effectifs"
      titre="Dotation"
      resume="Répartition des agents et contractuels mis à la disposition du ministère : affectations, réaffectations, mises à disposition et redéploiements."
      chargement={requete.isLoading}
      erreur={requete.isError ? "La dotation est réservée à la direction des ressources humaines et à son équipe." : undefined}
    >
      {d ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="person_add" libelle="Affectations" valeur={nombre(d.affectations.length)} detail="Nouveaux agents répartis" />
            <Kpi icone="school" libelle="Réaffectations" valeur={nombre(d.reaffectations.length)} detail="Après concours professionnel" />
            <Kpi icone="handshake" libelle="Mises à disposition" valeur={nombre(d.dispositions.filter((x) => x.statut === "constatee").length)} detail={`${nombre(d.dispositions.filter((x) => x.statut === "acceptee").length)} à constater`} />
            <Kpi icone="swap_horiz" libelle="Redéploiements" valeur={nombre(d.redeploiements.filter((x) => x.statut === "effectue").length)} detail={`${nombre(d.redeploiements.filter((x) => x.statut === "connu").length)} à suivre`} />
          </section>
          <div className="bg-surface-container-lowest rounded-xl border border-hairline p-1 flex flex-wrap gap-1" role="tablist" aria-label="Rubriques de la dotation">
            {ONGLETS.map((o) => (
              <button key={o.id} type="button" role="tab" aria-selected={onglet === o.id} onClick={() => setOnglet(o.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-label-md text-label-md transition-colors ${onglet === o.id ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:bg-surface-container-low"}`}>
                <Icone nom={o.icone} className="text-lg" />{o.libelle}
                <span className="font-code-num text-code-num opacity-80">{compte(o.id)}</span>
              </button>
            ))}
          </div>
          <section className="rounded-xl bg-surface-container-lowest border border-hairline p-6">
            {onglet === "affectations" ? <Mouvements type="affectation" lignes={d.affectations} donnees={d} /> : null}
            {onglet === "reaffectations" ? <Mouvements type="reaffectation" lignes={d.reaffectations} donnees={d} /> : null}
            {onglet === "dispositions" ? <Dispositions lignes={d.dispositions} /> : null}
            {onglet === "redeploiements" ? <Redeploiements lignes={d.redeploiements} /> : null}
          </section>
        </>
      ) : null}
    </PageGrh>
  );
}

// --- Affectations et réaffectations ---------------------------------------------------------------

function Mouvements({ type, lignes, donnees }: { type: "affectation" | "reaffectation"; lignes: Mouvement[]; donnees: Donnees }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<Mouvement | "nouveau" | null>(null);
  const reaffectation = type === "reaffectation";
  const terme = recherche.trim().toLowerCase();
  const filtrees = useMemo(() => lignes.filter((l) => !terme || [l.agent.nom_complet, l.agent.matricule, l.structure.nom, l.precedente, l.emploi?.libelle ?? "", l.concours].some((v) => v.toLowerCase().includes(terme))), [lignes, terme]);
  const page = usePagination(filtrees, terme + type);

  async function retirer(l: Mouvement) {
    const message = reaffectation ? `Retirer la réaffectation de ${l.agent.nom_complet} ? Il retrouve sa structure précédente.` : `Retirer l'affectation de ${l.agent.nom_complet} ?`;
    if (!(await feedback.confirm(message, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/dotation-agents/mouvements/${l.id}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: CLE });
    }, { success: { title: "Mouvement retiré" }, error: "La suppression n'a pas abouti." });
  }

  const colonnes = reaffectation
    ? ["Agent", "Structure précédente", "Nouvelle structure", "Concours", "Date d'effet", "Acte", "Actions"]
    : ["Agent", "Catégorie", "Structure d'affectation", "Emploi", "Date d'effet", "Acte", "Actions"];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher un mouvement" placeholder="Agent, structure, emploi…" />
        <button type="button" className={BOUTON} onClick={() => setEdition("nouveau")}>
          <Icone nom="add" className="text-lg" />{reaffectation ? "Réaffecter un agent" : "Affecter un agent"}
        </button>
      </div>
      <TableauListe colonnes={colonnes} vide={filtrees.length ? null : lignes.length ? "Aucun mouvement ne correspond à cette recherche." : reaffectation ? "Aucune réaffectation enregistrée." : "Aucune affectation enregistrée."} page={{ ...page, libelle: "mouvement" }}>
        {page.visibles.map((l) => (
          <tr key={l.id} className="border-b border-hairline text-on-surface align-top">
            <td className="py-3 pr-4"><span className="font-semibold block">{l.agent.nom_complet}</span><span className="text-on-surface-variant">{l.agent.matricule}{l.agent.grade ? ` · ${l.agent.grade}` : ""}</span></td>
            {reaffectation ? (
              <>
                <td className="py-3 pr-4">{l.precedente || "—"}</td>
                <td className="py-3 pr-4 font-semibold">{l.structure.nom}{l.emploi ? <span className="block font-normal text-on-surface-variant">{l.emploi.libelle}</span> : null}</td>
                <td className="py-3 pr-4">{l.concours}</td>
              </>
            ) : (
              <>
                <td className="py-3 pr-4">{l.categorie_libelle}</td>
                <td className="py-3 pr-4 font-semibold">{l.structure.nom}</td>
                <td className="py-3 pr-4">{l.emploi?.libelle ?? "—"}</td>
              </>
            )}
            <td className="py-3 pr-4 whitespace-nowrap">{dateCourte(l.date_effet)}</td>
            <td className="py-3 pr-4">{l.reference_acte ? <span className="block">{l.reference_acte}</span> : null}<LienDocument url={l.document_url} nom={l.document_nom} /></td>
            <td className="py-3 text-right whitespace-nowrap">
              <button type="button" className={ICONE} aria-label={`Modifier le mouvement de ${l.agent.nom_complet}`} onClick={() => setEdition(l)}><Icone nom="edit" className="text-lg" /></button>
              <button type="button" className={ICONE} aria-label={`Supprimer le mouvement de ${l.agent.nom_complet}`} onClick={() => void retirer(l)}><Icone nom="delete" className="text-lg" /></button>
            </td>
          </tr>
        ))}
      </TableauListe>
      {edition ? <FormulaireMouvement type={type} mouvement={edition === "nouveau" ? null : edition} donnees={donnees} onClose={() => setEdition(null)} /> : null}
    </>
  );
}

function FormulaireMouvement({ type, mouvement, donnees, onClose }: { type: "affectation" | "reaffectation"; mouvement: Mouvement | null; donnees: Donnees; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const nomenclature = useNomenclature();
  const reaffectation = type === "reaffectation";
  const [saisie, setSaisie] = useState({
    matricule: mouvement?.agent.matricule ?? "",
    categorie: mouvement?.categorie ?? "fonctionnaire",
    structure: String(mouvement?.structure.id ?? ""),
    emploi: mouvement?.emploi?.code ?? "",
    concours: mouvement?.concours ?? "",
    date_effet: mouvement?.date_effet ?? "",
    reference_acte: mouvement?.reference_acte ?? "",
    observation: mouvement?.observation ?? "",
    precedente: "",
  });
  const [fichier, setFichier] = useState<File | null>(null);
  const agent = donnees.agents.find((a) => a.matricule === saisie.matricule);
  const emplois = nomenclature.data?.emplois ?? [];
  const choisis = donnees.agents.filter((a) => (reaffectation ? a.affecte : !a.affecte) || a.matricule === saisie.matricule);
  const envoi = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      corps.set("type", type);
      Object.entries(saisie).forEach(([cle, valeur]) => { if (valeur !== "") corps.set(cle, valeur); });
      if (fichier) corps.set("document", fichier);
      return api(mouvement ? `/api/v1/dotation-agents/mouvements/${mouvement.id}/` : "/api/v1/dotation-agents/mouvements/", { method: mouvement ? "PATCH" : "POST", body: corps });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast(mouvement ? "Mouvement mis à jour" : reaffectation ? "Réaffectation enregistrée" : "Affectation enregistrée");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (e: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: e.target.value });
  return (
    <Modale titre={mouvement ? "Modifier le mouvement" : reaffectation ? "Réaffecter un agent" : "Affecter un agent"} sousTitre={reaffectation ? "Fonctionnaire ayant réussi un concours professionnel : sa structure précédente est conservée." : "Nouvel agent ou contractuel mis à la disposition du ministère."} icone={reaffectation ? "school" : "person_add"} taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "Le mouvement n'a pas été enregistré.")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Agent <span className="text-error">*</span></span>
          <Select className={CHAMP} required disabled={Boolean(mouvement)} value={saisie.matricule} onChange={champ("matricule")}>
            <option value="">Choisir un agent…</option>
            {choisis.map((a) => <option key={a.matricule} value={a.matricule}>{a.nom_complet} · {a.matricule}{a.affecte ? ` · ${a.structure}` : " · sans structure"}</option>)}
          </Select>
        </label>
        {reaffectation && !mouvement ? (
          <div className="md:col-span-2 rounded bg-surface-container-low px-3 py-2 font-body-sm text-body-sm">
            <span className="font-semibold">Structure précédente (conservée) : </span>{agent?.affecte ? agent.structure : agent ? "non reconnue dans les paramètres" : "—"}
            {agent && !agent.affecte ? <input className={`${CHAMP} mt-2`} placeholder="Indiquez-la" value={saisie.precedente} onChange={champ("precedente")} aria-label="Structure précédente" /> : null}
          </div>
        ) : null}
        <label className="block">
          <span className={LIBELLE}>{reaffectation ? "Nouvelle structure" : "Structure d'affectation"} <span className="text-error">*</span></span>
          <Select className={CHAMP} required value={saisie.structure} onChange={champ("structure")}>
            <option value="">Choisir une structure…</option>
            {donnees.structures.map((s) => <option key={s.id} value={s.id}>{s.nom} ({s.niveau_libelle})</option>)}
          </Select>
        </label>
        <label className="block">
          <span className={LIBELLE}>Emploi</span>
          <SelectEmploi className={CHAMP} valeur={emplois.find((e) => e.code === saisie.emploi)?.libelle ?? ""} emplois={emplois} onChange={(libelle) => setSaisie({ ...saisie, emploi: emplois.find((e) => e.libelle === libelle)?.code ?? "" })} />
        </label>
        {reaffectation ? (
          <label className="block md:col-span-2"><span className={LIBELLE}>Concours professionnel réussi <span className="text-error">*</span></span><input className={CHAMP} required maxLength={200} value={saisie.concours} onChange={champ("concours")} /></label>
        ) : (
          <label className="block">
            <span className={LIBELLE}>Catégorie</span>
            <Select className={CHAMP} value={saisie.categorie} onChange={champ("categorie")}>
              <option value="fonctionnaire">Fonctionnaire</option>
              <option value="contractuel">Contractuel</option>
            </Select>
          </label>
        )}
        <label className="block"><span className={LIBELLE}>Date d'effet <span className="text-error">*</span></span><input className={CHAMP} required type="date" value={saisie.date_effet} onChange={champ("date_effet")} /></label>
        <label className="block"><span className={LIBELLE}>Référence de l'acte</span><input className={CHAMP} maxLength={120} value={saisie.reference_acte} onChange={champ("reference_acte")} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Acte (PDF ou image, 5 Mo)</span><input className={CHAMP_GRH} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE_GRH}>Observation</span><input className={CHAMP} maxLength={240} value={saisie.observation} onChange={champ("observation")} /></label>
      </div>
    </Modale>
  );
}

// --- Redéploiements -------------------------------------------------------------------------------

function Redeploiements({ lignes }: { lignes: Redeploiement[] }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [recherche, setRecherche] = useState("");
  const [cible, setCible] = useState<Redeploiement | null>(null);
  const terme = recherche.trim().toLowerCase();
  const filtrees = useMemo(() => lignes.filter((l) => !terme || [l.agent.nom_complet, l.agent.matricule, l.origine, l.destination.nom, l.motif, l.initiateur].some((v) => v.toLowerCase().includes(terme))), [lignes, terme]);
  const page = usePagination(filtrees, terme);

  async function retirer(l: Redeploiement) {
    if (!(await feedback.confirm(`Retirer le redéploiement de ${l.agent.nom_complet} ?`, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/dotation-agents/redeploiements/${l.id}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: CLE });
    }, { success: { title: "Redéploiement retiré" }, error: "La suppression n'a pas abouti." });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher un redéploiement" placeholder="Agent, structure, motif…" />
        <p className="font-body-sm text-body-sm text-on-surface-variant">La hiérarchie déclenche le redéploiement depuis le profil de ses agents. La DRH le suit ici.</p>
      </div>
      <TableauListe colonnes={["Agent", "Origine → Destination", "Motif", "Déclenché par", "Suivi", "Actions"]} vide={filtrees.length ? null : lignes.length ? "Aucun redéploiement ne correspond à cette recherche." : "Aucun redéploiement n'a été déclenché."} page={{ ...page, libelle: "redéploiement" }}>
        {page.visibles.map((l) => (
          <tr key={l.id} className="border-b border-hairline text-on-surface align-top">
            <td className="py-3 pr-4"><span className="font-semibold block">{l.agent.nom_complet}</span><span className="text-on-surface-variant">{l.agent.matricule}</span></td>
            <td className="py-3 pr-4">{l.origine || "—"} <Icone nom="arrow_forward" className="text-base align-middle" /> <span className="font-semibold">{l.destination.nom}</span></td>
            <td className="py-3 pr-4 max-w-xs">{l.motif}</td>
            <td className="py-3 pr-4">{l.initiateur}<span className="block text-on-surface-variant">{dateCourte(l.depose_le)}</span></td>
            <td className="py-3 pr-4">
              <Pastille ton={l.statut === "effectue" ? "ok" : l.statut === "connu" ? "neutre" : "attente"}>{l.statut_libelle}</Pastille>
              {l.connaissance_par ? <span className="block mt-1 text-on-surface-variant">Connu de {l.connaissance_par} le {dateCourte(l.connaissance_le)}</span> : null}
              {l.effectue_le ? <span className="block text-on-surface-variant">Effectif le {dateCourte(l.date_effet || l.effectue_le)}{l.reference_acte ? ` · ${l.reference_acte}` : ""}</span> : null}
            </td>
            <td className="py-3 text-right whitespace-nowrap">
              {l.statut === "connu" ? <button type="button" className={BOUTON_LEGER} onClick={() => setCible(l)}><Icone nom="task_alt" className="text-sm" />Constater l'effet</button> : null}
              {l.statut !== "effectue" ? <button type="button" className={ICONE} aria-label={`Supprimer le redéploiement de ${l.agent.nom_complet}`} onClick={() => void retirer(l)}><Icone nom="delete" className="text-lg" /></button> : null}
            </td>
          </tr>
        ))}
      </TableauListe>
      {cible ? <ModaleEffet redeploiement={cible} onClose={() => setCible(null)} /> : null}
    </>
  );
}

function ModaleEffet({ redeploiement, onClose }: { redeploiement: Redeploiement; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ date_effet: redeploiement.date_effet || new Date().toISOString().slice(0, 10), reference_acte: "", observation: "" });
  const envoi = useMutation({
    mutationFn: () => api(`/api/v1/dotation-agents/redeploiements/${redeploiement.id}/effectuer/`, { method: "POST", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast("Redéploiement effectif : l'agent est notifié");
      onClose();
    },
  });
  return (
    <Modale titre="Constater le redéploiement" sousTitre={`${redeploiement.agent.nom_complet} → ${redeploiement.destination.nom}. Son rattachement change et il en est notifié.`} icone="task_alt" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "Le constat n'a pas abouti.")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className={LIBELLE}>Date d'effet</span><input className={CHAMP} required type="date" value={saisie.date_effet} onChange={(e) => setSaisie({ ...saisie, date_effet: e.target.value })} /></label>
        <label className="block"><span className={LIBELLE}>Référence de l'acte</span><input className={CHAMP} maxLength={120} value={saisie.reference_acte} onChange={(e) => setSaisie({ ...saisie, reference_acte: e.target.value })} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Observation</span><input className={CHAMP} maxLength={240} value={saisie.observation} onChange={(e) => setSaisie({ ...saisie, observation: e.target.value })} /></label>
      </div>
    </Modale>
  );
}

// --- Mises à disposition --------------------------------------------------------------------------

function Dispositions({ lignes }: { lignes: Disposition[] }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("");
  const [cible, setCible] = useState<{ ligne: Disposition; constat: boolean } | null>(null);
  const terme = recherche.trim().toLowerCase();
  const filtrees = useMemo(() => lignes.filter((l) => (!filtre || l.statut === filtre) && (!terme || [l.agent.nom_complet, l.agent.matricule, l.structure_accueil, l.ministere_accueil].some((v) => v.toLowerCase().includes(terme)))), [lignes, terme, filtre]);
  const page = usePagination(filtrees, `${terme}|${filtre}`);

  async function retirer(l: Disposition) {
    if (!(await feedback.confirm(`Retirer la mise à disposition de ${l.agent.nom_complet} ?`, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/dotation-agents/dispositions/${l.id}/retirer/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: CLE });
    }, { success: { title: "Mise à disposition retirée" }, error: "La suppression n'a pas abouti." });
  }

  const ton = (s: Disposition["statut"]) => (s === "constatee" ? "ok" : s === "rejetee" ? "refus" : "attente");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher une mise à disposition" placeholder="Agent, structure d'accueil, ministère…" />
        <Select aria-label="Filtrer par état" className={`${CHAMP} w-auto`} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
          <option value="">Tous les états</option>
          <option value="en_attente">En attente de la hiérarchie</option>
          <option value="acceptee">À constater</option>
          <option value="constatee">Constatées</option>
          <option value="rejetee">Rejetées</option>
        </Select>
        <p className="font-body-sm text-body-sm text-on-surface-variant">L'agent demande depuis son profil, sa hiérarchie décide, la DRH constate et suit.</p>
      </div>
      <TableauListe colonnes={["Agent", "Structure d'accueil", "Période", "Avis d'accueil", "Décision de la hiérarchie", "Suivi DRH", "Actions"]} vide={filtrees.length ? null : lignes.length ? "Aucune mise à disposition ne correspond à ces critères." : "Aucune demande de mise à disposition."} page={{ ...page, libelle: "mise à disposition" }}>
        {page.visibles.map((l) => (
          <tr key={l.id} className="border-b border-hairline text-on-surface align-top">
            <td className="py-3 pr-4"><span className="font-semibold block">{l.agent.nom_complet}</span><span className="text-on-surface-variant">{l.agent.matricule}</span></td>
            <td className="py-3 pr-4"><span className="font-semibold block">{l.structure_accueil}</span><span className="text-on-surface-variant">{l.ministere_accueil || "Même ministère"}</span></td>
            <td className="py-3 pr-4 whitespace-nowrap">{dateCourte(l.date_debut)} → {l.date_fin ? dateCourte(l.date_fin) : "sans terme"}</td>
            <td className="py-3 pr-4"><LienDocument url={l.avis_url} nom={l.avis_nom} /></td>
            <td className="py-3 pr-4">
              <Pastille ton={ton(l.statut)}>{l.statut_libelle}</Pastille>
              {l.decide_par ? <span className="block mt-1 text-on-surface-variant">{l.decide_par} · {dateCourte(l.decide_le)}</span> : null}
              {l.motif_decision ? <span className="block text-on-surface-variant">{l.motif_decision}</span> : null}
            </td>
            <td className="py-3 pr-4 text-on-surface-variant">
              {l.statut === "constatee" ? <>{l.etat_libelle ? <Pastille ton={l.etat === "terminee" ? "neutre" : "ok"}>{l.etat_libelle}</Pastille> : null}<span className="block mt-1">Constatée le {dateCourte(l.constate_le)}{l.reference_acte ? ` · ${l.reference_acte}` : ""}</span>{l.observation ? <span className="block">{l.observation}</span> : null}</> : "—"}
            </td>
            <td className="py-3 text-right whitespace-nowrap">
              {l.statut === "acceptee" ? <button type="button" className={BOUTON_LEGER} onClick={() => setCible({ ligne: l, constat: true })}><Icone nom="task_alt" className="text-sm" />Constater</button> : null}
              {l.statut === "constatee" ? <button type="button" className={ICONE} aria-label={`Modifier le suivi de ${l.agent.nom_complet}`} onClick={() => setCible({ ligne: l, constat: false })}><Icone nom="edit" className="text-lg" /></button> : null}
              <button type="button" className={ICONE} aria-label={`Supprimer la mise à disposition de ${l.agent.nom_complet}`} onClick={() => void retirer(l)}><Icone nom="delete" className="text-lg" /></button>
            </td>
          </tr>
        ))}
      </TableauListe>
      {cible ? <ModaleSuiviDisposition ligne={cible.ligne} constat={cible.constat} onClose={() => setCible(null)} /> : null}
    </>
  );
}

function ModaleSuiviDisposition({ ligne, constat, onClose }: { ligne: Disposition; constat: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ date_debut: ligne.date_debut, date_fin: ligne.date_fin, reference_acte: ligne.reference_acte, observation: ligne.observation });
  const envoi = useMutation({
    mutationFn: () => api(`/api/v1/dotation-agents/dispositions/${ligne.id}/`, { method: constat ? "POST" : "PATCH", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast(constat ? "Mise à disposition constatée" : "Suivi mis à jour");
      onClose();
    },
  });
  return (
    <Modale titre={constat ? "Constater la mise à disposition" : "Suivi de la mise à disposition"} sousTitre={`${ligne.agent.nom_complet} · ${ligne.structure_accueil}${ligne.ministere_accueil ? `, ${ligne.ministere_accueil}` : ""}`} icone="handshake" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "L'enregistrement n'a pas abouti.")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className={LIBELLE}>Début</span><input className={CHAMP} required type="date" value={saisie.date_debut} onChange={(e) => setSaisie({ ...saisie, date_debut: e.target.value })} /></label>
        <label className="block"><span className={LIBELLE}>Fin (vide : sans terme fixé)</span><input className={CHAMP} type="date" min={saisie.date_debut || undefined} value={saisie.date_fin} onChange={(e) => setSaisie({ ...saisie, date_fin: e.target.value })} /></label>
        <label className="block"><span className={LIBELLE}>Référence de l'acte</span><input className={CHAMP} maxLength={120} value={saisie.reference_acte} onChange={(e) => setSaisie({ ...saisie, reference_acte: e.target.value })} /></label>
        <label className="block"><span className={LIBELLE}>Observation</span><input className={CHAMP} maxLength={240} value={saisie.observation} onChange={(e) => setSaisie({ ...saisie, observation: e.target.value })} /></label>
      </div>
    </Modale>
  );
}

export type { AgentRef };
