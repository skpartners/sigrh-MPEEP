import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, api, telecharger } from "../api/client";
import type { Dossier, SessionUser } from "../api/types";
import { dateCourte } from "../ui/format";
import { Icone } from "../ui/Icone";
import { ApercuFichier, telechargerFichier } from "../ui/ApercuFichier";
import { DocumentSigne } from "./dossier-onglets/commun";
import { ApercuActe } from "./dossier-onglets/ModelesActes";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { Select } from "../ui/Select";

type Demande = Dossier["demandes"][number];
type EntreeListe = { type: TypeActe; libelle: string } | { type: null; groupe: string; membres: TypeActe[] };

/**
 * Liste déroulante des actes : un choix simple par acte, et un groupe pour les actes qui en déclarent un
 * (ou, à défaut, pour les sous-rubriques d'une rubrique). Une rubrique qui a des sous-rubriques reste un choix général.
 */
function entreesListe(types: TypeActe[]): EntreeListe[] {
  const entrees: EntreeListe[] = [];
  for (const type of types) {
    const groupe = type.groupe || (type.parent ? types.find((item) => item.code === type.parent)?.libelle ?? "" : "");
    if (!groupe) {
      const general = types.some((item) => item.parent === type.code);
      entrees.push({ type, libelle: general ? `${type.libelle} (général)` : type.libelle });
      continue;
    }
    const existant = entrees.find((entree): entree is Extract<EntreeListe, { type: null }> => entree.type === null && entree.groupe === groupe);
    if (existant) existant.membres.push(type);
    else entrees.push({ type: null, groupe, membres: [type] });
  }
  return entrees;
}

type TypeActe = { code: string; parent: string; groupe: string; libelle: string; icone: string; periode: boolean; destinataire: boolean; justificatif: string; circuit: string[] };
type ATraiter = {
  reference: string;
  nature: string;
  categorie: string;
  agent: { matricule: string; nom_complet: string };
  motif: string;
  debut: string;
  fin: string;
  destinataire: string;
  justificatif_url: string;
  etape: string;
  depose_le: string;
};
type Catalogue = { types: TypeActe[]; a_traiter: ATraiter[] };

const CHAMP = "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface";
const AVIS_TON: Record<string, string> = {
  Déposée: "bg-primary/10 text-primary",
  Favorable: "bg-primary/10 text-primary",
  Délivré: "bg-primary/10 text-primary",
  "En attente": "bg-surface-container text-on-surface-variant",
  Refusée: "bg-error-container text-on-error-container",
  "Sans suite": "bg-surface-container text-on-surface-variant",
};

function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

function statut(demande: Demande): { libelle: string; ton: string } {
  if (demande.etape.startsWith("Clôturée : acte délivré")) return { libelle: "Acte délivré", ton: "bg-primary/10 text-primary" };
  if (demande.etape.startsWith("Validée")) return { libelle: "En cours de signature", ton: "bg-tertiary-fixed text-on-tertiary-fixed-variant" };
  if (demande.etape.startsWith("Clôturée")) return { libelle: "Refusée", ton: "bg-error-container text-on-error-container" };
  return { libelle: "En cours", ton: "bg-secondary-fixed text-on-secondary-fixed" };
}

function periode(debut: string, fin: string): string {
  if (!debut) return "";
  return debut === fin ? `le ${dateCourte(debut)}` : `du ${dateCourte(debut)} au ${dateCourte(fin)}`;
}

/** Onglet « Demande d'actes » : dépôt, suivi du circuit, téléchargement, et visas à apposer. */
export function DemandesActes({ agent }: { agent: Dossier }) {
  const moi = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const catalogue = useQuery({ queryKey: ["demandes-actes"], queryFn: () => api<Catalogue>("/api/v1/demandes-actes/") });
  const estMoi = moi.data?.matricule === agent.matricule;
  const demandes = agent.demandes.filter((item) => item.categorie === "acte");
  const types = catalogue.data?.types ?? [];
  const aTraiter = catalogue.data?.a_traiter ?? [];

  return (
    <div className="space-y-6">
      {estMoi ? <FormulaireDemande agent={agent} types={types} /> : null}
      {aTraiter.length ? <DemandesAViser demandes={aTraiter} /> : null}
      <section className="bg-surface-container-lowest rounded-xl border border-hairline p-6" aria-labelledby="titre-mes-demandes">
        <h2 id="titre-mes-demandes" className="font-headline-sm text-headline-sm text-on-surface font-bold mb-4 flex items-center gap-2">
          <Icone nom="history" className="text-primary text-xl" />
          {estMoi ? "Mes demandes d’actes" : `Demandes d’actes de ${agent.nom_complet}`} ({demandes.length})
        </h2>
        {demandes.length === 0
          ? <p className="font-body-sm text-on-surface-variant">Aucune demande d’acte pour l’instant.</p>
          : <ul className="space-y-4">{demandes.map((demande) => <CarteDemande key={demande.reference} demande={demande} />)}</ul>}
      </section>
    </div>
  );
}

function FormulaireDemande({ agent, types }: { agent: Dossier; types: TypeActe[] }) {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [motif, setMotif] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [destinataire, setDestinataire] = useState("");
  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [erreurFichier, setErreurFichier] = useState("");
  const [champFichier, setChampFichier] = useState(0);
  const type = types.find((item) => item.code === code);

  const depot = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      corps.set("type", code);
      corps.set("motif", motif);
      corps.set("debut", debut);
      corps.set("fin", fin);
      corps.set("destinataire", destinataire);
      if (justificatif) corps.set("justificatif", justificatif);
      return api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/actes-demandes/`, { method: "POST", body: corps });
    },
    onSuccess: (dossier) => {
      client.setQueryData(["agent", agent.matricule], dossier);
      setCode("");
      setMotif("");
      setDebut("");
      setFin("");
      setDestinataire("");
      setJustificatif(null);
      setChampFichier((cle) => cle + 1);
    },
  });
  const erreur = erreurFichier || (depot.error instanceof ApiError ? depot.error.message : depot.isError ? "La demande n’a pas pu être transmise." : "");

  function choisirJustificatif(choisi: File | null) {
    setErreurFichier("");
    if (choisi && choisi.size > 5 * 1024 * 1024) {
      setErreurFichier("Le justificatif dépasse 5 Mo.");
      setJustificatif(null);
      setChampFichier((cle) => cle + 1);
      return;
    }
    setJustificatif(choisi);
  }

  function envoyer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    depot.mutate();
  }

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-hairline p-6" aria-labelledby="titre-nouvelle-demande">
      <h2 id="titre-nouvelle-demande" className="font-headline-sm text-headline-sm text-on-surface font-bold mb-1 flex items-center gap-2">
        <Icone nom="description" className="text-primary text-xl" />Demande d’actes administratifs
      </h2>
      <form onSubmit={envoyer} className="space-y-5 max-w-3xl">
        <div>
          <label htmlFor="type-demande" className="block font-label-md text-on-surface mb-2">Acte demandé</label>
          <Select id="type-demande" value={code} onChange={(e) => setCode(e.target.value)} required className={CHAMP}>
            <option value="">Choisir l’acte…</option>
            {entreesListe(types).map((entree) => entree.type ? (
              <option key={entree.type.code} value={entree.type.code}>{entree.libelle}</option>
            ) : (
              <optgroup key={entree.groupe} label={entree.groupe}>
                {entree.membres.map((membre) => <option key={membre.code} value={membre.code}>{membre.libelle}</option>)}
              </optgroup>
            ))}
          </Select>
          {type ? <p className="mt-1 text-sm text-on-surface-variant">Visas : {type.circuit.join(" → ")}.</p> : null}
        </div>
        {type?.periode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="date-debut" className="block font-label-md text-on-surface mb-2">Date de début</label>
              <input id="date-debut" type="date" min={aujourdhui()} value={debut} onChange={(e) => setDebut(e.target.value)} required className={CHAMP} />
            </div>
            <div>
              <label htmlFor="date-fin" className="block font-label-md text-on-surface mb-2">Date de fin</label>
              <input id="date-fin" type="date" min={debut || aujourdhui()} value={fin} onChange={(e) => setFin(e.target.value)} required className={CHAMP} />
            </div>
          </div>
        ) : null}
        {type?.destinataire ? (
          <div>
            <label htmlFor="destinataire-demande" className="block font-label-md text-on-surface mb-2">À l’attention de (facultatif)</label>
            <input id="destinataire-demande" value={destinataire} onChange={(e) => setDestinataire(e.target.value)} maxLength={160} placeholder="Organisme ou personne destinataire de l’attestation" className={CHAMP} />
          </div>
        ) : null}
        <div>
          <label htmlFor="motif-demande" className="block font-label-md text-on-surface mb-2">Motif / précisions</label>
          <textarea id="motif-demande" rows={4} value={motif} onChange={(e) => setMotif(e.target.value)} required maxLength={600} placeholder="Précisez l’objet de votre demande…" className={CHAMP} />
        </div>
        {type ? (
          <div>
            <label htmlFor="justificatif-demande" className="block font-label-md text-on-surface mb-2">Justificatif</label>
            <input key={champFichier} id="justificatif-demande" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => choisirJustificatif(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary" />
            <p className="mt-1 text-sm text-on-surface-variant">{type.justificatif} PDF, PNG, JPG ou WEBP, 5 Mo au plus.</p>
          </div>
        ) : null}
        {erreur ? <p role="alert" className="text-sm text-error">{erreur}</p> : null}
        {depot.isSuccess ? <p role="status" className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">Votre demande a été transmise à votre chef de service.</p> : null}
        <button type="submit" disabled={depot.isPending || !code} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary disabled:opacity-60">
          <Icone nom="send" />{depot.isPending ? "Transmission…" : "Transmettre la demande"}
        </button>
      </form>
      {code ? (
        <div className="mx-auto mt-8 w-full max-w-[44rem]">
          <ApercuActe agent={agent} code={code} debut={debut} fin={fin} />
        </div>
      ) : null}
    </section>
  );
}

function CarteDemande({ demande }: { demande: Demande }) {
  const etat = statut(demande);
  const [erreur, setErreur] = useState("");
  const [apercu, setApercu] = useState(false);
  const refus = demande.visas.find((visa) => visa.avis === "Refusée");

  async function telechargerActe() {
    setErreur("");
    try {
      await telecharger(`/api/v1/demandes-actes/${encodeURIComponent(demande.reference)}/document/`, `${demande.reference}.pdf`);
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "L’acte n’a pas pu être téléchargé.");
    }
  }

  return (
    <li className="rounded-xl border border-hairline p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-label-md text-label-md text-on-surface font-bold flex items-center gap-2">
            <Icone nom={demande.icone || "description"} className="text-primary text-lg" />{demande.nature}
          </p>
          <p className="font-code-num text-label-sm text-on-surface-variant mt-0.5">
            {demande.reference} · déposée le {dateCourte(demande.depose_le)}
            {demande.debut ? ` · ${periode(demande.debut, demande.fin)}` : ""}
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-bold ${etat.ton}`}>{etat.libelle}</span>
      </div>
      {demande.motif ? <p className="font-body-sm text-on-surface-variant">Motif : {demande.motif}</p> : null}
      {demande.destinataire ? <p className="font-body-sm text-on-surface-variant">À l’attention de : {demande.destinataire}</p> : null}
      {demande.justificatif_url ? <LienJustificatif chemin={demande.justificatif_url} nom={`Justificatif ${demande.reference}`} onApercu={() => setApercu(true)} /> : null}
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Circuit de la demande">
        {demande.visas.map((visa) => (
          <li key={visa.ordre} className="rounded-lg bg-surface-container-low p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-label-sm text-label-sm font-bold text-on-surface">{visa.instance}</span>
              <span className={`px-1.5 py-0.5 rounded font-label-sm text-label-sm font-bold ${AVIS_TON[visa.avis] ?? "bg-surface-container text-on-surface-variant"}`}>{visa.avis}</span>
            </div>
            {visa.titulaire ? <p className="font-body-sm text-body-sm text-on-surface-variant">{visa.titulaire}{visa.date ? ` · ${dateCourte(visa.date)}` : ""}</p> : null}
          </li>
        ))}
      </ol>
      {refus ? <p role="note" className="rounded-lg bg-error-container text-on-error-container p-3 text-sm">Motif du refus : {refus.commentaire}</p> : null}
      <DocumentSigne demande={demande} />
      {etat.libelle === "Acte délivré" && !demande.document_signe ? (
        <button type="button" onClick={() => void telechargerActe()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary">
          <Icone nom="download" />Télécharger l’acte (PDF)
        </button>
      ) : null}
      {erreur ? <p role="alert" className="text-sm text-error">{erreur}</p> : null}
      {apercu ? <ApercuFichier chemin={demande.justificatif_url} titre={`Justificatif ${demande.reference}`} sousTitre={demande.nature} onClose={() => setApercu(false)} /> : null}
    </li>
  );
}

/** Le justificatif joint à une demande : visualisable et téléchargeable. */
function LienJustificatif({ chemin, nom, onApercu }: { chemin: string; nom: string; onApercu: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 font-body-sm text-on-surface-variant">
      <Icone nom="attach_file" className="text-lg text-primary" />
      <span>Justificatif joint</span>
      <button type="button" onClick={onApercu} className="inline-flex items-center gap-1 rounded px-2 py-1 text-primary hover:bg-surface-container-low">
        <Icone nom="visibility" className="text-base" />Voir
      </button>
      <button type="button" onClick={() => void telechargerFichier(chemin, nom)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-primary hover:bg-surface-container-low">
        <Icone nom="download" className="text-base" />Télécharger
      </button>
    </div>
  );
}

function DemandesAViser({ demandes }: { demandes: ATraiter[] }) {
  const client = useQueryClient();
  const [refus, setRefus] = useState<ATraiter | null>(null);
  const [justificatif, setJustificatif] = useState<ATraiter | null>(null);
  const [erreur, setErreur] = useState("");

  const decision = useMutation({
    mutationFn: ({ reference, sens, motif }: { reference: string; sens: "valider" | "refuser"; motif?: string }) =>
      api<Dossier>(`/api/v1/demandes-actes/${encodeURIComponent(reference)}/decision/`, { method: "POST", body: JSON.stringify({ sens, motif }) }),
    onSuccess: (dossier) => {
      client.setQueryData(["agent", dossier.matricule], dossier);
      void client.invalidateQueries({ queryKey: ["demandes-actes"] });
      setRefus(null);
      setErreur("");
    },
    onError: (cause) => setErreur(cause instanceof ApiError ? cause.message : "La décision n’a pas pu être enregistrée."),
  });

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-primary/30 p-6" aria-labelledby="titre-a-viser">
      <h2 id="titre-a-viser" className="font-headline-sm text-headline-sm text-on-surface font-bold mb-4 flex items-center gap-2">
        <Icone nom="rule" className="text-primary text-xl" />Demandes à viser ({demandes.length})
      </h2>
      <ul className="space-y-3">
        {demandes.map((item) => (
          <li key={item.reference} className="rounded-lg bg-surface-container-low p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-label-md text-label-md text-on-surface font-bold">
                {item.categorie === "conge" || item.categorie === "mutation" ? (
                  <span className="mr-2 rounded bg-secondary-container px-2 py-0.5 font-label-sm text-on-secondary-container">{item.categorie === "conge" ? "Congé" : "Mutation"}</span>
                ) : null}
                {item.nature} · {item.agent.nom_complet}
              </p>
              <p className="font-code-num text-label-sm text-on-surface-variant">
                {item.reference} · {item.etape}{item.debut ? ` · ${periode(item.debut, item.fin)}` : ""}
              </p>
              <p className="font-body-sm text-on-surface-variant">Motif : {item.motif}</p>
              {item.justificatif_url ? <LienJustificatif chemin={item.justificatif_url} nom={`Justificatif ${item.reference}`} onApercu={() => setJustificatif(item)} /> : null}
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" disabled={decision.isPending} onClick={() => decision.mutate({ reference: item.reference, sens: "valider" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 font-label-md text-on-primary disabled:opacity-60">
                <Icone nom="check" className="text-lg" />Viser
              </button>
              <button type="button" disabled={decision.isPending} onClick={() => { setErreur(""); setRefus(item); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3.5 py-2 font-label-md text-on-surface disabled:opacity-60">
                <Icone nom="close" className="text-lg" />Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
      {justificatif ? <ApercuFichier chemin={justificatif.justificatif_url} titre={`Justificatif ${justificatif.reference}`} sousTitre={`${justificatif.nature} · ${justificatif.agent.nom_complet}`} onClose={() => setJustificatif(null)} /> : null}
      {erreur && !refus ? <p role="alert" className="mt-3 text-sm text-error">{erreur}</p> : null}
      {refus ? <ModaleRefus demande={refus} enCours={decision.isPending} erreur={erreur} onClose={() => setRefus(null)}
        onConfirmer={(motif) => decision.mutate({ reference: refus.reference, sens: "refuser", motif })} /> : null}
    </section>
  );
}

function ModaleRefus({ demande, enCours, erreur, onClose, onConfirmer }: {
  demande: ATraiter;
  enCours: boolean;
  erreur: string;
  onClose: () => void;
  onConfirmer: (motif: string) => void;
}) {
  const [motif, setMotif] = useState("");
  return (
    <Modale titre="Refuser la demande" sousTitre={`${demande.nature} · ${demande.agent.nom_complet}`} icone="block" ton="danger" taille="md"
      onClose={onClose} onSubmit={() => onConfirmer(motif)} enCours={enCours} erreur={erreur || undefined}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours || !motif.trim()}>Refuser la demande</button>
        </>
      }>
      <label className="block space-y-1.5">
        <span className="block font-label-md text-label-md text-on-surface font-semibold">Motif du refus <span className="text-error">*</span></span>
        <textarea rows={4} value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={600} required className={CHAMP} />
        <span className="block font-body-sm text-body-sm text-on-surface-variant">L’agent en est informé avec ce motif.</span>
      </label>
    </Modale>
  );
}
