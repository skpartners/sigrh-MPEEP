import { FilVisas } from "../ui/FilVisas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFeedback } from "../ui/Feedback";
import { useState } from "react";
import { ApiError, api, telecharger } from "../api/client";
import type { Dossier, SessionUser } from "../api/types";
import { apiHorsLigne } from "../hors-ligne/envoi";
import { dateCourte } from "../ui/format";
import { Icone } from "../ui/Icone";
import { ApercuFichier, telechargerFichier } from "../ui/ApercuFichier";
import { DocumentSigne } from "./dossier-onglets/commun";
import { ApercuActe, aModeleActe } from "./dossier-onglets/ModelesActes";
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

type TypeActe = { code: string; parent: string; groupe: string; libelle: string; icone: string; periode: boolean; destinataire: boolean; justificatif: string; justificatif_obligatoire: boolean; circuit: string[] };
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
  const [formulaire, setFormulaire] = useState(false);

  return (
    <div className="space-y-6">
      {estMoi ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-container-lowest p-6" aria-labelledby="titre-nouvelle-demande">
          <h2 id="titre-nouvelle-demande" className="flex items-center gap-2 font-headline-sm text-headline-sm font-bold text-on-surface">
            <Icone nom="description" className="text-xl text-primary" />Demande d’actes administratifs
          </h2>
          <button type="button" onClick={() => setFormulaire(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary">
            <Icone nom="add" />Nouvelle demande
          </button>
        </section>
      ) : null}
      {formulaire ? <FormulaireDemande agent={agent} types={types} onClose={() => setFormulaire(false)} /> : null}
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

/** Fenêtre de demande d'un acte : saisie, aperçu du document, puis transmission au circuit. */
function FormulaireDemande({ agent, types, onClose }: { agent: Dossier; types: TypeActe[]; onClose: () => void }) {
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [motif, setMotif] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [erreurFichier, setErreurFichier] = useState("");
  const [champFichier, setChampFichier] = useState(0);
  const type = types.find((item) => item.code === code);

  const feedback = useFeedback();
  const [enCours, setEnCours] = useState(false);
  const [erreurServeur, setErreurServeur] = useState("");

  /** Transmet la demande sous l'indicateur d'attente, puis recharge le dossier et ramène l'agent à sa liste. */
  async function transmettre() {
    setEnCours(true);
    setErreurServeur("");
    try {
      const corps = new FormData();
      corps.set("type", code);
      corps.set("motif", motif);
      corps.set("debut", debut);
      corps.set("fin", fin);
      if (justificatif) corps.set("justificatif", justificatif);
      // Hors ligne, la demande (justificatif compris) est gardée chiffrée sur l'appareil et part au retour de la connexion.
      const resultat = await feedback.run(
        "Transmission de la demande…",
        () => apiHorsLigne<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/actes-demandes/`, { capacite: "acte", corps, libelle: `Demande d’acte : ${(type?.libelle ?? "acte administratif").toLowerCase()}` }),
        { error: "La demande n’a pas été transmise." },
      );
      if (resultat.enAttente) {
        feedback.toast("Demande enregistrée hors ligne", "Elle sera transmise au circuit dès le retour de la connexion.", "info");
      } else {
        feedback.toast("Demande transmise", "Elle est entrée dans le circuit, au visa de votre chef de service.");
        client.setQueryData(["agent", agent.matricule], resultat.reponse);
      }
      void client.invalidateQueries({ queryKey: ["agent", agent.matricule] });
      void client.invalidateQueries({ queryKey: ["demandes-actes"] });
      setCode("");
      setMotif("");
      setDebut("");
      setFin("");
      setJustificatif(null);
      setChampFichier((cle) => cle + 1);
      onClose();
      // La fenêtre se ferme : la nouvelle demande figure en tête de « Mes demandes d'actes », où l'on amène l'agent.
      window.setTimeout(() => document.getElementById("titre-mes-demandes")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (cause) {
      setErreurServeur(cause instanceof ApiError ? cause.message : "La demande n’a pas pu être transmise.");
    } finally {
      setEnCours(false);
    }
  }
  const erreur = erreurFichier || erreurServeur;

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

  // Pourquoi « Transmettre la demande » est désactivé ; vide quand la demande est complète.
  const raison = enCours
    ? "Transmission en cours."
    : !code
      ? "Choisissez d’abord l’acte demandé."
      : type?.periode && (!debut || !fin)
        ? "Indiquez la date de début et la date de fin."
        : !motif.trim()
          ? "Précisez le motif de votre demande."
          : type?.justificatif_obligatoire && !justificatif
            ? "Joignez le justificatif : il est obligatoire pour cet acte."
            : "";

  return (
    <Modale
      titre="Demande d’actes administratifs"
      sousTitre="Choisissez l’acte, relisez le document, puis transmettez."
      icone="description"
      taille="xl"
      onClose={onClose}
      onSubmit={() => { if (!raison) void transmettre(); }}
      enCours={enCours}
      erreur={erreur || undefined}
      pied={
        <>
          {raison && !enCours && code ? <span id="raison-transmission" className="mr-auto font-body-sm text-body-sm text-on-surface-variant">{raison}</span> : null}
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={enCours}>Annuler</button>
          <span title={raison || undefined} className={raison ? "cursor-not-allowed" : undefined}>
            <button type="submit" disabled={Boolean(raison)} aria-describedby={raison ? "raison-transmission" : undefined} className={BOUTON_PRIMAIRE}>
              <Icone nom={enCours ? "progress_activity" : "send"} className={`text-lg ${enCours ? "motion-spin" : ""}`} />{enCours ? "Transmission…" : "Transmettre la demande"}
            </button>
          </span>
        </>
      }
    >
      <div className="space-y-5">
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
        <div>
          <label htmlFor="motif-demande" className="block font-label-md text-on-surface mb-2">Motif / précisions</label>
          <textarea id="motif-demande" rows={4} value={motif} onChange={(e) => setMotif(e.target.value)} required maxLength={600} placeholder="Précisez l’objet de votre demande…" className={CHAMP} />
        </div>
        {type ? (
          <div>
            <label htmlFor="justificatif-demande" className="block font-label-md text-on-surface mb-2">
              Justificatif <span className={type.justificatif_obligatoire ? "text-error" : "font-normal text-on-surface-variant"}>{type.justificatif_obligatoire ? "(obligatoire)" : "(facultatif)"}</span>
            </label>
            <input key={champFichier} id="justificatif-demande" type="file" required={type.justificatif_obligatoire} accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => choisirJustificatif(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary" />
          </div>
        ) : null}
        {/* Le document se relit en bas de la fenêtre, juste avant de transmettre. */}
      {code && aModeleActe(code) ? (
        <div className="mx-auto mt-2 w-full max-w-[44rem]">
          <ApercuActe agent={agent} code={code} debut={debut} fin={fin} />
        </div>
      ) : null}
      {code && !aModeleActe(code) ? (
        <p role="status" className="mx-auto mt-2 flex w-full max-w-[44rem] items-start gap-2 rounded-lg border border-error bg-error-container p-4 text-sm font-medium text-on-error-container">
          <Icone nom="error" className="text-xl text-error" />
          <span>Le modèle de document de cet acte n’est pas encore disponible : aucun aperçu ne peut être affiché. Votre demande suit son circuit normalement, et le document sera établi dès que le ministère aura fourni son exemplaire.</span>
        </p>
      ) : null}

      </div>
    </Modale>
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
      <FilVisas visas={demande.visas} enCours={etat.libelle === "En cours"} libelle={`Circuit de la demande ${demande.reference}`} />
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
