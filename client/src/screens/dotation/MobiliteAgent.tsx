import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { dateCourte } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { BOUTON, CHAMP, LIBELLE, LienDocument, Pastille, erreurDe, type AgentRef, type Structure } from "./commun";
import { Select } from "../../ui/Select";

type Mutation = {
  id: number;
  reference: string;
  agent: { matricule: string; nom_complet: string };
  origine: string;
  destination: string;
  motif: string;
  demandeur: string;
  pour_un_autre: boolean;
  date_souhaitee: string;
  statut: "en_cours" | "accordee" | "refusee";
  statut_libelle: string;
  etape: string;
  depose_le: string;
  decidee_le: string;
  document_url: string;
  document_nom: string;
  visas: { ordre: number; instance: string; avis: string; titulaire: string; date: string; commentaire: string }[];
};

type Mobilite = {
  agent: string;
  mes_mutations: Mutation[];
  mutations_equipe: Mutation[];
  hierarchie: boolean;
  agents: { matricule: string; nom_complet: string; structure: string }[];
  structures: Structure[];
};

const CLE = ["mobilite"];
const CARTE = "bg-surface-container-lowest rounded-xl border border-hairline p-6";
const TITRE = "font-headline-sm text-headline-sm text-on-surface font-bold";

function tonMutation(s: Mutation["statut"]) {
  return s === "accordee" ? "ok" : s === "refusee" ? "refus" : "attente";
}

function tonVisa(avis: string) {
  return /favorable|d[ée]pos|accord/i.test(avis) ? "ok" : /refus|sans suite/i.test(avis) ? "refus" : "attente";
}

/** Une demande de mutation et son circuit de validation, visa par visa. */
function LigneMutation({ m, equipe }: { m: Mutation; equipe: boolean }) {
  return (
    <li className="py-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span>
          <span className="font-semibold block">
            {equipe ? `${m.agent.nom_complet} · ` : ""}{m.origine || "Structure actuelle"} → {m.destination}
          </span>
          <span className="text-on-surface-variant block">
            {m.reference} · déposée le {dateCourte(m.depose_le)}{m.pour_un_autre ? ` par ${m.demandeur}` : ""}
            {m.date_souhaitee ? ` · effet souhaité le ${dateCourte(m.date_souhaitee)}` : ""}
          </span>
          <span className="text-on-surface-variant block">Motif : {m.motif}</span>
          {m.document_url ? <span className="block mt-1"><LienDocument url={m.document_url} nom={m.document_nom} /></span> : null}
        </span>
        <span className="text-right">
          <Pastille ton={tonMutation(m.statut)}>{m.statut_libelle}</Pastille>
          {m.statut === "en_cours" ? <span className="block mt-1 text-on-surface-variant">{m.etape}</span> : null}
        </span>
      </div>
      <ol className="flex flex-wrap gap-2" aria-label={`Circuit de la demande ${m.reference}`}>
        {m.visas.map((v) => (
          <li key={v.ordre} className="rounded-lg bg-surface-container-low px-3 py-2 font-label-sm text-label-sm">
            <span className="block font-semibold text-on-surface">{v.ordre}. {v.instance}</span>
            <Pastille ton={tonVisa(v.avis)}>{v.avis}</Pastille>
            {v.titulaire ? <span className="block mt-1 text-on-surface-variant">{v.titulaire}{v.date ? ` · ${dateCourte(v.date)}` : ""}</span> : null}
          </li>
        ))}
      </ol>
    </li>
  );
}

/** Onglet « Demande de mutation » du profil : ma mutation et celles de mon équipe. */
export function MobiliteAgent() {
  const requete = useQuery({ queryKey: CLE, queryFn: () => api<Mobilite>("/api/v1/mobilite/") });
  const [mutation, setMutation] = useState<string | null>(null);
  const d = requete.data;
  if (requete.isLoading) return <p className="text-on-surface-variant">Chargement…</p>;
  if (!d) return <p role="alert" className="text-error">Votre espace de demande de mutation n'a pas pu être chargé.</p>;
  const mutationEnCours = d.mes_mutations.some((m) => m.statut === "en_cours");

  return (
    <div className="space-y-6">
      <section className={CARTE}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={TITRE}>Ma demande de mutation</h2>
          </div>
          <button type="button" className={BOUTON} disabled={mutationEnCours} title={mutationEnCours ? "Une demande est déjà en cours." : undefined} onClick={() => setMutation("")}>
            <Icone nom="add" className="text-lg" />Demander ma mutation
          </button>
        </div>
        <ul className="mt-4 divide-y divide-hairline font-body-sm text-body-sm">
          {d.mes_mutations.length === 0 ? <li className="py-4 text-on-surface-variant">Vous n'avez fait aucune demande de mutation.</li> : d.mes_mutations.map((m) => <LigneMutation key={m.id} m={m} equipe={false} />)}
        </ul>
      </section>

      {d.hierarchie ? (
        <section className={CARTE}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={TITRE}>Mutations de mon équipe</h2>
            </div>
            <button type="button" className={BOUTON} onClick={() => setMutation("equipe")}>
              <Icone nom="swap_horiz" className="text-lg" />Demander la mutation d'un agent
            </button>
          </div>
          <ul className="mt-4 divide-y divide-hairline font-body-sm text-body-sm">
            {d.mutations_equipe.length === 0 ? <li className="py-4 text-on-surface-variant">Aucune demande de mutation dans votre équipe.</li> : d.mutations_equipe.map((m) => <LigneMutation key={m.id} m={m} equipe />)}
          </ul>
        </section>
      ) : null}

      {mutation !== null ? <FormulaireMutation pourEquipe={mutation === "equipe"} agents={d.agents} structures={d.structures} onClose={() => setMutation(null)} /> : null}
    </div>
  );
}

function FormulaireMutation({ pourEquipe, agents, structures, onClose }: { pourEquipe: boolean; agents: Mobilite["agents"]; structures: Structure[]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ matricule: "", structure: "", motif: "", date_souhaitee: "" });
  const [document, setDocument] = useState<File | null>(null);
  const envoi = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      corps.set("structure", saisie.structure);
      corps.set("motif", saisie.motif);
      if (pourEquipe) corps.set("matricule", saisie.matricule);
      if (saisie.date_souhaitee) corps.set("date_souhaitee", saisie.date_souhaitee);
      if (document) corps.set("justificatif", document);
      return api("/api/v1/mobilite/mutations/", { method: "POST", body: corps });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE });
      await client.invalidateQueries({ queryKey: ["demandes-actes"] });
      feedback.toast(pourEquipe ? "Demande transmise : l'agent est notifié" : "Demande de mutation transmise à votre hiérarchie");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (e: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: e.target.value });
  return (
    <Modale
      titre={pourEquipe ? "Demander la mutation d'un agent" : "Demander ma mutation"}
      sousTitre="La demande suit le circuit de validation jusqu'au DRH."
      icone="swap_horiz"
      taille="lg"
      onClose={onClose}
      onSubmit={() => envoi.mutate()}
      enCours={envoi.isPending}
      erreur={erreurDe(envoi.error, "La demande n'a pas été transmise.")}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pourEquipe ? (
          <label className="block md:col-span-2">
            <span className={LIBELLE}>Agent <span className="text-error">*</span></span>
            <Select className={CHAMP} required value={saisie.matricule} onChange={champ("matricule")}>
              <option value="">Choisir un agent…</option>
              {agents.map((a) => <option key={a.matricule} value={a.matricule}>{a.nom_complet} · {a.matricule}{a.structure ? ` · ${a.structure}` : ""}</option>)}
            </Select>
          </label>
        ) : null}
        <label className="block">
          <span className={LIBELLE}>Structure demandée <span className="text-error">*</span></span>
          <Select className={CHAMP} required value={saisie.structure} onChange={champ("structure")}>
            <option value="">Choisir une structure…</option>
            {structures.map((s) => <option key={s.id} value={s.id}>{s.nom} ({s.niveau_libelle})</option>)}
          </Select>
        </label>
        <label className="block">
          <span className={LIBELLE}>Date souhaitée</span>
          <input className={CHAMP} type="date" min={new Date().toISOString().slice(0, 10)} value={saisie.date_souhaitee} onChange={champ("date_souhaitee")} />
        </label>
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Motif <span className="text-error">*</span></span>
          <input className={CHAMP} required maxLength={500} placeholder="Ex. : rapprochement familial, besoin du service, adéquation du poste avec mon profil" value={saisie.motif} onChange={champ("motif")} />
        </label>
        <label className="block md:col-span-2">
          <span className={LIBELLE}>Document joint (facultatif)</span>
          <input className={CHAMP} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setDocument(e.target.files?.[0] ?? null)} />
          <span className="block mt-1 font-body-sm text-body-sm text-on-surface-variant">Lettre de demande, avis de la structure d'accueil… PDF ou image, 5 Mo au plus.</span>
        </label>
      </div>
    </Modale>
  );
}

export type { AgentRef };
