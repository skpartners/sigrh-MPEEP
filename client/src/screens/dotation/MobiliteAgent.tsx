import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { dateCourte } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { usePagination } from "../../ui/Pagination";
import { BOUTON, BOUTON_LEGER, CHAMP, LIBELLE, LienDocument, Pastille, TableauListe, erreurDe, type AgentRef, type Disposition, type Redeploiement, type Structure } from "./commun";

type Mobilite = {
  agent: string;
  mes_dispositions: Disposition[];
  hierarchie: boolean;
  dispositions_equipe: Disposition[];
  redeploiements_equipe: Redeploiement[];
  a_connaitre: Redeploiement[];
  agents: { matricule: string; nom_complet: string; structure: string }[];
  structures: Structure[];
};

const CLE = ["mobilite"];
const CARTE = "bg-surface-container-lowest rounded-xl border border-hairline p-6";
const TITRE = "font-headline-sm text-headline-sm text-on-surface font-bold";

function tonDisposition(s: Disposition["statut"]) {
  return s === "constatee" ? "ok" : s === "rejetee" ? "refus" : "attente";
}

/** Onglet « Mobilité » du profil : ma mise à disposition, et ce que ma hiérarchie traite pour mon équipe. */
export function MobiliteAgent() {
  const requete = useQuery({ queryKey: CLE, queryFn: () => api<Mobilite>("/api/v1/mobilite/") });
  const [demande, setDemande] = useState(false);
  const [redeploiement, setRedeploiement] = useState(false);
  const d = requete.data;
  if (requete.isLoading) return <p className="text-on-surface-variant">Chargement…</p>;
  if (!d) return <p role="alert" className="text-error">Votre espace de mobilité n'a pas pu être chargé.</p>;
  const enCours = d.mes_dispositions.some((x) => x.statut === "en_attente" || x.statut === "acceptee");

  return (
    <div className="space-y-6">
      <section className={CARTE}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={TITRE}>Ma mise à disposition</h2>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Vous demandez à être mis à disposition d'une autre structure, avec l'avis favorable de la structure d'accueil. Votre hiérarchie accepte ou rejette, puis la DRH constate et suit.
            </p>
          </div>
          <button type="button" className={BOUTON} disabled={enCours} title={enCours ? "Une demande est déjà en cours." : undefined} onClick={() => setDemande(true)}>
            <Icone nom="add" className="text-lg" />Demander une mise à disposition
          </button>
        </div>
        <ul className="mt-4 divide-y divide-hairline font-body-sm text-body-sm">
          {d.mes_dispositions.length === 0 ? <li className="py-4 text-on-surface-variant">Vous n'avez fait aucune demande.</li> : d.mes_dispositions.map((x) => (
            <li key={x.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <span>
                <span className="font-semibold block">{x.structure_accueil}{x.ministere_accueil ? `, ${x.ministere_accueil}` : ""}</span>
                <span className="text-on-surface-variant">Du {dateCourte(x.date_debut)}{x.date_fin ? ` au ${dateCourte(x.date_fin)}` : ", sans terme fixé"} · déposée le {dateCourte(x.depose_le)}</span>
                {x.motif_decision ? <span className="block text-on-surface-variant">{x.decide_par} : {x.motif_decision}</span> : null}
              </span>
              <span className="text-right"><Pastille ton={tonDisposition(x.statut)}>{x.statut_libelle}</Pastille>{x.etat_libelle ? <span className="block mt-1 text-on-surface-variant">{x.etat_libelle}</span> : null}</span>
            </li>
          ))}
        </ul>
      </section>

      {d.hierarchie ? (
        <>
          <DemandesEquipe lignes={d.dispositions_equipe} />
          <section className={CARTE}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className={TITRE}>Redéploiements</h2>
                <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                  Vous envoyez un agent que vous encadrez dans une autre structure pour les besoins du service, en motivant. Votre propre hiérarchie en prend connaissance, la DRH le suit et l'agent est notifié.
                </p>
              </div>
              <button type="button" className={BOUTON} onClick={() => setRedeploiement(true)}><Icone nom="swap_horiz" className="text-lg" />Redéployer un agent</button>
            </div>
            {d.a_connaitre.length ? <AConnaitre lignes={d.a_connaitre} /> : null}
            <ul className="mt-4 divide-y divide-hairline font-body-sm text-body-sm">
              {d.redeploiements_equipe.length === 0 ? <li className="py-4 text-on-surface-variant">Aucun redéploiement n'a été engagé pour votre équipe.</li> : d.redeploiements_equipe.map((r) => (
                <li key={r.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                  <span>
                    <span className="font-semibold block">{r.agent.nom_complet} → {r.destination.nom}</span>
                    <span className="text-on-surface-variant">De {r.origine || "—"} · déclenché par {r.initiateur} le {dateCourte(r.depose_le)}</span>
                    <span className="block text-on-surface-variant">{r.motif}</span>
                  </span>
                  <Pastille ton={r.statut === "effectue" ? "ok" : r.statut === "connu" ? "neutre" : "attente"}>{r.statut_libelle}</Pastille>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {demande ? <FormulaireDemande onClose={() => setDemande(false)} /> : null}
      {redeploiement ? <FormulaireRedeploiement agents={d.agents} structures={d.structures} onClose={() => setRedeploiement(false)} /> : null}
    </div>
  );
}

function FormulaireDemande({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ ministere_accueil: "", structure_accueil: "", date_debut: "", date_fin: "", motif: "" });
  const [avis, setAvis] = useState<File | null>(null);
  const envoi = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      Object.entries(saisie).forEach(([cle, valeur]) => { if (valeur) corps.set(cle, valeur); });
      if (avis) corps.set("avis", avis);
      return api("/api/v1/mobilite/dispositions/", { method: "POST", body: corps });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast("Demande transmise à votre hiérarchie");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (e: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: e.target.value });
  return (
    <Modale titre="Demander une mise à disposition" sousTitre="Joignez l'avis favorable de la structure qui vous accueillerait." icone="handshake" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "La demande n'a pas été transmise.")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block"><span className={LIBELLE}>Structure d'accueil <span className="text-error">*</span></span><input className={CHAMP} required maxLength={200} value={saisie.structure_accueil} onChange={champ("structure_accueil")} /></label>
        <label className="block"><span className={LIBELLE}>Ministère d'accueil (vide : le même ministère)</span><input className={CHAMP} maxLength={200} value={saisie.ministere_accueil} onChange={champ("ministere_accueil")} /></label>
        <label className="block"><span className={LIBELLE}>Début souhaité <span className="text-error">*</span></span><input className={CHAMP} required type="date" value={saisie.date_debut} onChange={champ("date_debut")} /></label>
        <label className="block"><span className={LIBELLE}>Fin prévue</span><input className={CHAMP} type="date" min={saisie.date_debut || undefined} value={saisie.date_fin} onChange={champ("date_fin")} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Motif</span><input className={CHAMP} maxLength={240} value={saisie.motif} onChange={champ("motif")} /></label>
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Avis favorable de la structure d'accueil <span className="text-error">*</span></span>
          <input className={CHAMP} required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setAvis(e.target.files?.[0] ?? null)} />
        </label>
      </div>
    </Modale>
  );
}

function DemandesEquipe({ lignes }: { lignes: Disposition[] }) {
  const [cible, setCible] = useState<{ ligne: Disposition; sens: "accepter" | "rejeter" } | null>(null);
  const page = usePagination(lignes, String(lignes.length));
  return (
    <section className={CARTE}>
      <h2 className={TITRE}>Demandes de mise à disposition de mon équipe</h2>
      <p className="mt-1 mb-4 font-body-sm text-body-sm text-on-surface-variant">Vous prenez connaissance de la demande et de l'avis de la structure d'accueil, puis vous acceptez ou rejetez en motivant.</p>
      <TableauListe colonnes={["Agent", "Structure d'accueil", "Période", "Avis d'accueil", "Décision", "Actions"]} vide={lignes.length ? null : "Aucune demande dans votre équipe."} page={{ ...page, libelle: "demande" }}>
        {page.visibles.map((l) => (
          <tr key={l.id} className="border-b border-hairline text-on-surface align-top">
            <td className="py-3 pr-4"><span className="font-semibold block">{l.agent.nom_complet}</span><span className="text-on-surface-variant">{l.agent.matricule}</span></td>
            <td className="py-3 pr-4"><span className="font-semibold block">{l.structure_accueil}</span><span className="text-on-surface-variant">{l.ministere_accueil || "Même ministère"}</span>{l.motif ? <span className="block text-on-surface-variant">{l.motif}</span> : null}</td>
            <td className="py-3 pr-4 whitespace-nowrap">{dateCourte(l.date_debut)} → {l.date_fin ? dateCourte(l.date_fin) : "sans terme"}</td>
            <td className="py-3 pr-4"><LienDocument url={l.avis_url} nom={l.avis_nom} /></td>
            <td className="py-3 pr-4"><Pastille ton={tonDisposition(l.statut)}>{l.statut_libelle}</Pastille>{l.motif_decision ? <span className="block mt-1 text-on-surface-variant">{l.motif_decision}</span> : null}</td>
            <td className="py-3 text-right whitespace-nowrap">
              {l.statut === "en_attente" ? (
                <>
                  <button type="button" className={BOUTON_LEGER} onClick={() => setCible({ ligne: l, sens: "accepter" })}><Icone nom="check" className="text-sm" />Accepter</button>
                  <button type="button" className={`${BOUTON_LEGER} ml-1 !text-error`} onClick={() => setCible({ ligne: l, sens: "rejeter" })}><Icone nom="block" className="text-sm" />Rejeter</button>
                </>
              ) : null}
            </td>
          </tr>
        ))}
      </TableauListe>
      {cible ? <ModaleDecision ligne={cible.ligne} sens={cible.sens} onClose={() => setCible(null)} /> : null}
    </section>
  );
}

function ModaleDecision({ ligne, sens, onClose }: { ligne: Disposition; sens: "accepter" | "rejeter"; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [motif, setMotif] = useState("");
  const envoi = useMutation({
    mutationFn: () => api(`/api/v1/mobilite/dispositions/${ligne.id}/decision/`, { method: "POST", body: JSON.stringify({ sens, motif }) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast(sens === "accepter" ? "Demande acceptée : la DRH la constatera" : "Demande rejetée : l'agent est notifié");
      onClose();
    },
  });
  const rejet = sens === "rejeter";
  return (
    <Modale titre={rejet ? "Rejeter la demande" : "Accepter la demande"} sousTitre={`${ligne.agent.nom_complet} · ${ligne.structure_accueil}`} icone={rejet ? "block" : "check"} onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "La décision n'a pas été enregistrée.")}>
      <label className="block">
        <span className={LIBELLE}>{rejet ? "Motif du rejet" : "Observation"}{rejet ? <span className="text-error"> *</span> : null}</span>
        <input className={CHAMP} required={rejet} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
      </label>
    </Modale>
  );
}

function FormulaireRedeploiement({ agents, structures, onClose }: { agents: Mobilite["agents"]; structures: Structure[]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ matricule: "", structure: "", motif: "", date_effet: "" });
  const envoi = useMutation({
    mutationFn: () => api("/api/v1/mobilite/redeploiements/", { method: "POST", body: JSON.stringify({ ...saisie, structure: Number(saisie.structure) }) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast("Redéploiement engagé : l'agent et votre hiérarchie sont prévenus");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (e: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: e.target.value });
  return (
    <Modale titre="Redéployer un agent" sousTitre="Pour les besoins du service : la structure de départ est celle de l'agent." icone="swap_horiz" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={erreurDe(envoi.error, "Le redéploiement n'a pas été engagé.")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Agent <span className="text-error">*</span></span>
          <select className={CHAMP} required value={saisie.matricule} onChange={champ("matricule")}>
            <option value="">Choisir un agent…</option>
            {agents.map((a) => <option key={a.matricule} value={a.matricule}>{a.nom_complet} · {a.matricule}{a.structure ? ` · ${a.structure}` : ""}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LIBELLE}>Structure de destination <span className="text-error">*</span></span>
          <select className={CHAMP} required value={saisie.structure} onChange={champ("structure")}>
            <option value="">Choisir une structure…</option>
            {structures.map((s) => <option key={s.id} value={s.id}>{s.nom} ({s.niveau_libelle})</option>)}
          </select>
        </label>
        <label className="block"><span className={LIBELLE}>Date d'effet prévue</span><input className={CHAMP} type="date" value={saisie.date_effet} onChange={champ("date_effet")} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Motif : le besoin du service <span className="text-error">*</span></span><input className={CHAMP} required maxLength={500} value={saisie.motif} onChange={champ("motif")} /></label>
      </div>
    </Modale>
  );
}

function AConnaitre({ lignes }: { lignes: Redeploiement[] }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const connaitre = useMutation({
    mutationFn: (r: Redeploiement) => api(`/api/v1/mobilite/redeploiements/${r.id}/connaissance/`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      feedback.toast("Vous avez pris connaissance du redéploiement");
    },
  });
  return (
    <div className="mt-4 rounded-lg bg-secondary-fixed/40 p-4">
      <h3 className="font-label-lg text-label-lg font-bold text-on-surface">À prendre en connaissance</h3>
      <ul className="mt-2 divide-y divide-hairline font-body-sm text-body-sm">
        {lignes.map((r) => (
          <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
            <span><span className="font-semibold">{r.agent.nom_complet} → {r.destination.nom}</span><span className="block text-on-surface-variant">Déclenché par {r.initiateur} : {r.motif}</span></span>
            <button type="button" className={BOUTON_LEGER} disabled={connaitre.isPending} onClick={() => connaitre.mutate(r)}><Icone nom="visibility" className="text-sm" />Prendre connaissance</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { AgentRef };
