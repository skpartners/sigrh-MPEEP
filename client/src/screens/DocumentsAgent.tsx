import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../api/client";
import type { Dossier } from "../api/types";
import { dateCourte } from "../ui/format";
import { Icone } from "../ui/Icone";
import { ApercuFichier, telechargerFichier } from "../ui/ApercuFichier";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";

type Piece = Dossier["pieces"][number];
type Rubrique = Dossier["catalogue_documents"][number];

const CHAMP = "w-full h-10 px-3 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";
const ICONES: Record<string, string> = { etat_civil: "badge", diplomes: "school", administratifs: "policy" };
const SEUIL_ALERTE_JOURS = 90;

type Validite = { libelle: string; ton: "ok" | "alerte" | "expire" | "neutre" };

/** Indicateur de validité : valide, bientôt périmée, périmée, ou sans échéance. */
function validite(piece: Piece): Validite {
  if (!piece.date_expiration) return { libelle: "Sans échéance", ton: "neutre" };
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const echeance = new Date(`${piece.date_expiration}T00:00:00`);
  const jours = Math.round((echeance.getTime() - aujourdhui.getTime()) / 86_400_000);
  if (jours < 0) return { libelle: `Périmée depuis le ${dateCourte(piece.date_expiration)}`, ton: "expire" };
  if (jours <= SEUIL_ALERTE_JOURS) return { libelle: jours === 0 ? "Expire aujourd’hui" : `Expire dans ${jours} jour${jours > 1 ? "s" : ""}`, ton: "alerte" };
  return { libelle: `Valide jusqu’au ${dateCourte(piece.date_expiration)}`, ton: "ok" };
}

const TON_VALIDITE: Record<Validite["ton"], string> = {
  ok: "bg-primary/10 text-primary",
  alerte: "bg-secondary-fixed text-on-secondary-fixed",
  expire: "bg-error-container text-on-error-container",
  neutre: "bg-surface-container text-on-surface-variant",
};

function taille(ko: number): string {
  if (ko < 1024) return `${ko.toLocaleString("fr-FR")} Ko`;
  return `${(ko / 1024).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
}

function typeDe(piece: Piece, rubrique: Rubrique) {
  return rubrique.types.find((type) => piece.intitule === type.libelle || piece.intitule.startsWith(`${type.libelle} — `));
}

/** Onglet « Mes documents » : dossier personnel numérique en trois rubriques. */
export function DocumentsAgent({ agent, edition = true }: { agent: Dossier; edition?: boolean }) {
  const modifiable = agent.modifiable !== false && edition;
  const [depot, setDepot] = useState<{ rubrique: string; type: string } | null>(null);
  const [apercu, setApercu] = useState<Piece | null>(null);

  return (
    <div className="space-y-6">
      <p className="font-body-sm text-on-surface-variant">
        Dossier personnel numérique de {agent.nom_complet}. Téléversez vos pièces justificatives, prévisualisez-les, téléchargez-les et suivez leur validité.
      </p>
      {agent.catalogue_documents.map((rubrique) => {
        const pieces = agent.pieces.filter((piece) => piece.categorie === rubrique.libelle);
        const autres = pieces.filter((piece) => !typeDe(piece, rubrique));
        return (
          <section key={rubrique.code} className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden" aria-labelledby={`rubrique-${rubrique.code}`}>
            <div className="px-6 py-4 bg-surface-container-low flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Icone nom={ICONES[rubrique.code] ?? "folder_open"} className="text-primary text-xl shrink-0" />
                <h2 id={`rubrique-${rubrique.code}`} className="font-headline-sm text-headline-sm font-bold text-on-surface">{rubrique.libelle}</h2>
                <span className="font-code-num text-label-sm text-on-surface-variant">{pieces.length} pièce{pieces.length > 1 ? "s" : ""}</span>
              </div>
              {modifiable ? <button type="button" onClick={() => setDepot({ rubrique: rubrique.code, type: rubrique.types[0]?.code ?? "" })}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                <Icone nom="cloud_upload" className="text-lg" />
                Téléverser
              </button> : null}
            </div>
            <ul className="divide-y divide-surface-container">
              {rubrique.types.map((type) => {
                const versees = pieces.filter((piece) => typeDe(piece, rubrique)?.code === type.code);
                return (
                  <li key={type.code} className="px-6 py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-label-md text-label-md font-bold text-on-surface">{type.libelle}</p>
                      {versees.length === 0 && modifiable ? (
                        <button type="button" onClick={() => setDepot({ rubrique: rubrique.code, type: type.code })}
                          className="inline-flex items-center gap-1.5 text-primary font-label-sm text-label-sm underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          <Icone nom="add" className="text-base" />Ajouter
                        </button>
                      ) : null}
                    </div>
                    {versees.length === 0
                      ? <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun document versé.</p>
                      : <ul className="space-y-2">{versees.map((piece) => <LigneDocument key={piece.id} piece={piece} onApercu={() => setApercu(piece)} />)}</ul>}
                  </li>
                );
              })}
              {autres.length ? (
                <li className="px-6 py-4 space-y-3">
                  <p className="font-label-md text-label-md font-bold text-on-surface">Autres pièces</p>
                  <ul className="space-y-2">{autres.map((piece) => <LigneDocument key={piece.id} piece={piece} onApercu={() => setApercu(piece)} />)}</ul>
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
      {depot ? <DepotDocument agent={agent} initial={depot} onClose={() => setDepot(null)} /> : null}
      {apercu ? <ApercuDocument piece={apercu} onClose={() => setApercu(null)} /> : null}
    </div>
  );
}

function LigneDocument({ piece, onApercu }: { piece: Piece; onApercu: () => void }) {
  const etat = validite(piece);
  const disponible = Boolean(piece.fichier_url);
  return (
    <li className="p-3 rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-body-md text-body-md text-on-surface font-semibold break-words">{piece.intitule}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-label-sm text-label-sm text-on-surface-variant font-code-num">
          <span>Versée le {dateCourte(piece.date_depot)}</span>
          <span aria-hidden="true">·</span>
          <span>{taille(piece.taille_ko)}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${TON_VALIDITE[etat.ton]}`}>{etat.libelle}</span>
          <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${piece.verifiee ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant"}`}>
            {piece.verifiee ? "Vérifiée" : "En attente de vérification"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
        <button type="button" onClick={onApercu} disabled={!disponible} title="Prévisualiser" aria-label={`Prévisualiser ${piece.intitule}`}
          className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Icone nom="visibility" className="text-xl" />
        </button>
        <button type="button" onClick={() => void telechargerFichier(piece.fichier_url, piece.intitule)} disabled={!disponible} title="Télécharger" aria-label={`Télécharger ${piece.intitule}`}
          className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Icone nom="download" className="text-xl" />
        </button>
      </div>
    </li>
  );
}

function ApercuDocument({ piece, onClose }: { piece: Piece; onClose: () => void }) {
  return <ApercuFichier chemin={piece.fichier_url} titre={piece.intitule} sousTitre={`Versée le ${dateCourte(piece.date_depot)}`} onClose={onClose} />;
}

function DepotDocument({ agent, initial, onClose }: { agent: Dossier; initial: { rubrique: string; type: string }; onClose: () => void }) {
  const client = useQueryClient();
  const [rubrique, setRubrique] = useState(initial.rubrique);
  const [type, setType] = useState(initial.type);
  const [precision, setPrecision] = useState("");
  const [expiration, setExpiration] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreurLocale, setErreurLocale] = useState("");
  const groupe = agent.catalogue_documents.find((item) => item.code === rubrique);

  const depot = useMutation({
    mutationFn: async () => {
      const corps = new FormData();
      corps.set("rubrique", rubrique);
      corps.set("type_document", type);
      corps.set("precision", precision);
      corps.set("date_expiration", expiration);
      if (fichier) corps.set("fichier", fichier);
      return api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/documents/`, { method: "POST", body: corps });
    },
    onSuccess: (dossier) => {
      client.setQueryData(["agent", agent.matricule], dossier);
      onClose();
    },
  });
  const erreur = erreurLocale || (depot.error instanceof ApiError ? depot.error.message : depot.isError ? "Le téléversement n’a pas abouti." : "");

  function changerRubrique(code: string) {
    setRubrique(code);
    setType(agent.catalogue_documents.find((item) => item.code === code)?.types[0]?.code ?? "");
  }

  function choisir(choisi: File | null) {
    setErreurLocale("");
    if (choisi && choisi.size > 15 * 1024 * 1024) {
      setErreurLocale("Le fichier dépasse 15 Mo.");
      return;
    }
    setFichier(choisi);
  }

  return (
    <Modale titre="Téléverser un document" sousTitre={`Dossier personnel numérique de ${agent.nom_complet}.`} icone="upload_file" taille="lg" onClose={onClose}
      onSubmit={() => depot.mutate()} enCours={depot.isPending} erreur={erreur || undefined}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={depot.isPending}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={depot.isPending || !fichier || !type}>
            <Icone nom={depot.isPending ? "progress_activity" : "cloud_upload"} className={`text-lg ${depot.isPending ? "motion-spin" : ""}`} />
            {depot.isPending ? "Téléversement…" : "Téléverser"}
          </button>
        </>
      }>
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="block font-label-md text-label-md text-on-surface font-semibold">Rubrique</span>
          <select className={CHAMP} value={rubrique} onChange={(event) => changerRubrique(event.target.value)}>
            {agent.catalogue_documents.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block font-label-md text-label-md text-on-surface font-semibold">Type de document <span className="text-error">*</span></span>
          <select className={CHAMP} value={type} onChange={(event) => setType(event.target.value)} required>
            {groupe?.types.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="block font-label-md text-label-md text-on-surface font-semibold">Précision (facultatif)</span>
          <input className={CHAMP} value={precision} onChange={(event) => setPrecision(event.target.value)} maxLength={80} placeholder="Par exemple le prénom de l’enfant, ou l’intitulé du diplôme" />
        </label>
        <label className="block space-y-1.5">
          <span className="block font-label-md text-label-md text-on-surface font-semibold">Date d’expiration (facultatif)</span>
          <input className={CHAMP} type="date" value={expiration} onChange={(event) => setExpiration(event.target.value)} />
          <span className="block font-body-sm text-body-sm text-on-surface-variant">À renseigner pour les pièces qui se périment ; elle alimente l’indicateur de validité.</span>
        </label>
        <label className="block space-y-1.5">
          <span className="block font-label-md text-label-md text-on-surface font-semibold">Document <span className="text-error">*</span></span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => choisir(event.target.files?.[0] ?? null)}
            className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary" />
          <span className="block font-body-sm text-body-sm text-on-surface-variant">PDF, PNG, JPG ou WEBP · 15 Mo maximum</span>
        </label>
      </div>
    </Modale>
  );
}
