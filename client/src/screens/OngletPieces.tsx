import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ApiError, api, mediaUrl, telecharger } from "../api/client";
import type { Dossier } from "../api/types";
import { dateCourte } from "../ui/format";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { TitreOnglet } from "./dossier-onglets/TitreOnglet";

const QUOTA_KO = 50 * 1024;
const PAR_PAGE = 8;
const ICONE: Record<string, string> = {
  "État civil": "badge",
  "Diplômes": "school",
  "Actes de carrière": "policy",
  "Solde": "payments",
  "Santé": "medical_information",
  "Autre": "description",
};
const CHAMP = "w-full h-10 px-3 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";

type Piece = Dossier["pieces"][number];

export function OngletPieces({ agent }: { agent: Dossier }) {
  const queryClient = useQueryClient();
  const [versementOuvert, setVersementOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState("toutes");
  const [page, setPage] = useState(1);
  const [exportErreur, setExportErreur] = useState("");
  const [exportEnCours, setExportEnCours] = useState(false);

  const occupe = agent.pieces.reduce((somme, piece) => somme + piece.taille_ko, 0);
  const part = Math.min(100, (occupe / QUOTA_KO) * 100);
  const verifiees = agent.pieces.filter((piece) => piece.verifiee).length;
  const enAttente = agent.pieces.length - verifiees;
  const partVerifiee = agent.pieces.length === 0 ? 0 : Math.round((verifiees / agent.pieces.length) * 100);

  const compteurs = useMemo(() => {
    const nombres = new Map<string, number>();
    for (const piece of agent.pieces) nombres.set(piece.categorie, (nombres.get(piece.categorie) ?? 0) + 1);
    return nombres;
  }, [agent.pieces]);

  const filtre = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr");
    return agent.pieces.filter((piece) => {
      if (categorie !== "toutes" && piece.categorie !== categorie && piece.intitule !== categorie) return false;
      if (!terme) return true;
      return `${piece.intitule} ${piece.categorie}`.toLocaleLowerCase("fr").includes(terme);
    });
  }, [agent.pieces, categorie, recherche]);

  const pages = Math.max(1, Math.ceil(filtre.length / PAR_PAGE));
  const courante = Math.min(page, pages);
  const debut = (courante - 1) * PAR_PAGE;
  const vue = filtre.slice(debut, debut + PAR_PAGE);
  const recentes = [...agent.pieces].sort((a, b) => b.date_depot.localeCompare(a.date_depot)).slice(0, 3);

  async function exporter() {
    setExportErreur("");
    setExportEnCours(true);
    try {
      await telecharger(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/pieces/archive/`, `pieces-${agent.matricule}.zip`);
    } catch (error) {
      setExportErreur(error instanceof ApiError ? error.message : "L'archive n'a pas pu être préparée.");
    } finally {
      setExportEnCours(false);
    }
  }

  function choisirCategorie(valeur: string) {
    setCategorie(valeur);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <TitreOnglet titre="Gestion des Pièces Jointes & Actes Numérisés" />
      <section className="bg-surface-container-lowest rounded-xl border border-hairline p-6" aria-labelledby="titre-pieces">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 id="titre-pieces" className="font-headline-sm text-headline-sm text-on-surface font-bold">Coffre du dossier</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Pièces de {agent.nom_complet}, dans la limite de 50 Mo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-5 shrink-0">
            <div className="bg-surface-container-low p-3.5 rounded-lg w-full sm:w-56 space-y-2">
              <div className="flex items-center justify-between gap-3 font-label-sm text-label-sm">
                <span className="text-on-surface-variant font-medium">Espace utilisé</span>
                <span className="font-code-num text-primary font-bold">{taille(occupe)} / 50 Mo</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={50} aria-valuenow={Number((occupe / 1024).toFixed(1))} aria-label="Espace utilisé">
                <div className="h-full bg-primary-container rounded-full" style={{ width: `${part}%` }} />
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant block text-right">
                {part.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % alloué · {agent.pieces.length} pièce{agent.pieces.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => setVersementOuvert(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">cloud_upload</span>
                Téléverser une pièce
              </button>
              <button type="button" onClick={exporter} disabled={exportEnCours || agent.pieces.length === 0} className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">inventory_2</span>
                {exportEnCours ? "Préparation…" : "Exporter les pièces"}
              </button>
              <button type="button" className="p-2.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title="Calculer l'empreinte du coffre" data-soon={`Le calcul d'empreinte du coffre de ${agent.nom_complet} arrive dans une prochaine version.`}>
                <span className="material-symbols-outlined text-xl" aria-hidden="true">fingerprint</span>
                <span className="sr-only">Calculer l'empreinte du coffre</span>
              </button>
            </div>
          </div>
        </div>
        {exportErreur ? <p className="mt-4 font-body-sm text-body-sm text-error" role="alert">{exportErreur}</p> : null}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Synthese icone="verified_user" ton="text-primary" libelle="Pièces vérifiées" valeur={String(verifiees)} detail={agent.pieces.length === 0 ? "Le coffre est vide" : `${partVerifiee} % du coffre`} />
        <Synthese icone="gavel" ton="text-primary" libelle="En attente de vérification" valeur={String(enAttente)} detail={enAttente === 0 ? "Aucune pièce en attente" : "Contrôle encore ouvert"} badge={enAttente === 0 ? "Néant" : undefined} />
        <Synthese icone="enhanced_encryption" ton="text-secondary" libelle="Volume versé" valeur={taille(occupe)} detail={`${part.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % de 50 Mo`} />
        <Synthese icone="schedule" ton="text-secondary" libelle="Visite médicale" valeur={agent.visite_medicale || "Non renseignée"} detail="Suivi indiqué au dossier" compact />
      </div>

      <section className="bg-surface-container-lowest p-4 rounded-xl border border-hairline space-y-4" aria-label="Recherche dans le coffre">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl pointer-events-none" aria-hidden="true">search</span>
          <input
            className="w-full pl-11 pr-4 py-2.5 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Rechercher par intitulé ou catégorie…"
            aria-label="Rechercher une pièce"
            type="search"
            value={recherche}
            onChange={(event) => {
              setRecherche(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pt-1" role="group" aria-label="Catégories">
          <Puce actif={categorie === "toutes"} onClick={() => choisirCategorie("toutes")}>Tous les actes ({agent.pieces.length})</Puce>
          {agent.types_actes.map((type) => {
            const nombre = agent.pieces.filter((piece) => piece.intitule === type.libelle || piece.categorie === type.libelle).length;
            if (nombre === 0) return null;
            return <Puce key={type.code} actif={categorie === type.libelle} onClick={() => choisirCategorie(type.libelle)}>{type.libelle} ({nombre})</Puce>;
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 space-y-6">
          <section className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden" aria-labelledby="titre-inventaire">
            <div className="px-6 py-4 bg-surface-container-low flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-primary text-xl shrink-0" aria-hidden="true">folder_managed</span>
                <h3 id="titre-inventaire" className="font-headline-sm text-headline-sm font-bold text-on-surface">Inventaire des pièces</h3>
              </div>
              <span className="font-code-num text-label-sm text-on-surface-variant shrink-0">{vue.length} sur {filtre.length}</span>
            </div>
            {vue.length === 0 ? (
              <p className="p-8 text-center font-body-md text-body-md text-on-surface-variant">
                {agent.pieces.length === 0 ? (
                  <>
                    Aucune pièce dans ce dossier.{" "}
                    <button type="button" className="text-primary underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setVersementOuvert(true)}>
                      Versez le premier document.
                    </button>
                  </>
                ) : "Aucune pièce ne correspond à cette recherche."}
              </p>
            ) : (
              <ul className="divide-y divide-surface-container">
                {vue.map((piece) => <LignePiece key={piece.id} piece={piece} />)}
              </ul>
            )}
            <div className="p-4 bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3 font-label-sm text-label-sm text-on-surface-variant">
              <span>
                {filtre.length === 0 ? "Aucune pièce à afficher" : `Affichage de ${debut + 1} à ${debut + vue.length} sur ${filtre.length}`}
              </span>
              {pages > 1 ? (
                <div className="flex items-center gap-1">
                  {Array.from({ length: pages }, (_, index) => index + 1).map((numero) => (
                    <button key={numero} type="button" onClick={() => setPage(numero)} className={`px-3 py-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${numero === courante ? "bg-surface-container font-semibold text-primary" : "hover:bg-surface-container text-on-surface"}`} aria-current={numero === courante ? "page" : undefined}>
                      {numero}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

        </div>

        <aside className="xl:col-span-4 space-y-6" aria-label="Synthèse du coffre">
          <section className="bg-surface-container-lowest p-6 rounded-xl border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Répartition</h3>
              <span className="p-1 rounded bg-primary/10 text-primary" aria-hidden="true">
                <span className="material-symbols-outlined text-xl">folder_zip</span>
              </span>
            </div>
            {compteurs.size === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune catégorie versée.</p>
            ) : (
              <ul className="space-y-2 font-code-num text-label-sm">
                {[...compteurs.entries()].map(([nom, nombre]) => (
                  <li key={nom} className="flex justify-between gap-3 py-1 bg-surface-container-low px-3 rounded">
                    <span className="text-on-surface-variant">{nom}</span>
                    <span className="font-bold text-primary">{nombre}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-surface-container-lowest p-6 rounded-xl border border-hairline space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">policy</span>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Derniers versements</h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Les pièces les plus récemment déposées dans ce coffre.</p>
            {recentes.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun versement.</p>
            ) : (
              <ul className="space-y-3">
                {recentes.map((piece) => (
                  <li key={piece.id} className="p-3 rounded-lg bg-surface-container-low space-y-1">
                    <div className="flex items-center justify-between gap-2 font-label-sm text-label-sm">
                      <span className="font-bold text-on-surface">{piece.categorie}</span>
                      <span className="font-code-num text-on-surface-variant">{dateCourte(piece.date_depot)}</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface">{piece.intitule}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-surface-container-lowest p-5 rounded-xl border border-hairline space-y-3">
            <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Contact de l'agent</h3>
            <p className="font-label-md text-label-md font-bold text-on-surface">{agent.nom_complet}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{agent.situation_saisie.fonction || agent.structure}</p>
            <div className="pt-1 flex flex-col gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">mail</span>
                {agent.coordonnees.courriel || "Courriel non renseigné"}
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">phone</span>
                {agent.coordonnees.telephone || "Téléphone non renseigné"}
              </span>
            </div>
          </section>
        </aside>
      </div>
      {versementOuvert ? (
        <DepotPiece
          agent={agent}
          onClose={() => setVersementOuvert(false)}
          onEnregistre={(dossier) => queryClient.setQueryData(["agent", agent.matricule], dossier)}
        />
      ) : null}
    </div>
  );
}

function Synthese({ icone, ton, libelle, valeur, detail, badge, compact }: {
  icone: string;
  ton: string;
  libelle: string;
  valeur: string;
  detail: string;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <section className="bg-surface-container-lowest p-5 rounded-xl border border-hairline flex items-start gap-4">
      <div className={`w-12 h-12 rounded-lg bg-surface-container-low ${ton} flex items-center justify-center shrink-0`} aria-hidden="true">
        <span className="material-symbols-outlined text-2xl">{icone}</span>
      </div>
      <div className="space-y-1 min-w-0">
        <h3 className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">{libelle}</h3>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`${compact ? "font-label-lg text-label-lg" : "font-headline-sm text-headline-sm"} font-bold text-on-surface`}>{valeur}</p>
          {badge ? <span className="px-2 py-0.5 rounded font-label-sm text-label-sm font-bold bg-surface-container text-primary">{badge}</span> : null}
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{detail}</p>
      </div>
    </section>
  );
}

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif} className={`px-3.5 py-1.5 rounded-full font-label-sm text-label-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${actif ? "bg-primary text-on-primary font-semibold" : "bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-medium"}`}>
      {children}
    </button>
  );
}

function LignePiece({ piece }: { piece: Piece }) {
  const href = mediaUrl(piece.fichier_url);
  return (
    <li className="p-5 hover:bg-surface-container-low/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <div className="w-11 h-11 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0" aria-hidden="true">
          <span className="material-symbols-outlined text-2xl">{ICONE[piece.categorie] ?? "description"}</span>
        </div>
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-label-md text-label-md font-bold text-on-surface break-words">{piece.intitule}</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${piece.verifiee ? "bg-primary/10 text-primary" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${piece.verifiee ? "bg-primary" : "bg-secondary"}`} aria-hidden="true" />
              {piece.verifiee ? "Certifié et conforme" : "En attente"}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-num text-label-sm">{piece.categorie}</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-label-sm text-label-sm text-on-surface-variant font-code-num">
            <span>Versée le {dateCourte(piece.date_depot)}</span>
            <span aria-hidden="true">·</span>
            <span>{taille(piece.taille_ko)}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
        {href ? (
          <a className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={href} target="_blank" rel="noreferrer" title="Ouvrir la pièce">
            <span className="material-symbols-outlined text-xl" aria-hidden="true">visibility</span>
            <span className="sr-only">Ouvrir {piece.intitule}</span>
          </a>
        ) : (
          <button type="button" className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title="Aperçu" data-soon="Le scan de cette pièce n'est pas encore versé au coffre.">
            <span className="material-symbols-outlined text-xl" aria-hidden="true">visibility</span>
            <span className="sr-only">Aperçu de {piece.intitule}</span>
          </button>
        )}
        {href ? (
          <a className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={href} download title="Télécharger la pièce">
            <span className="material-symbols-outlined text-xl" aria-hidden="true">download</span>
            <span className="sr-only">Télécharger {piece.intitule}</span>
          </a>
        ) : (
          <button type="button" className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title="Télécharger" data-soon="Le fichier n'est pas joint. L'archive ZIP contient la fiche de la pièce.">
            <span className="material-symbols-outlined text-xl" aria-hidden="true">download</span>
            <span className="sr-only">Télécharger {piece.intitule}</span>
          </button>
        )}
        <button type="button" className="p-2 rounded hover:bg-surface-container text-on-surface-variant hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title="Contrôler l'empreinte" data-soon="Le contrôle d'empreinte de cette pièce arrive dans une prochaine version.">
          <span className="material-symbols-outlined text-xl" aria-hidden="true">verified</span>
          <span className="sr-only">Contrôler l'empreinte de {piece.intitule}</span>
        </button>
      </div>
    </li>
  );
}

function DepotPiece({ agent, onClose, onEnregistre }: {
  agent: Dossier;
  onClose: () => void;
  onEnregistre: (dossier: Dossier) => void;
}) {
  const fichierRef = useRef<HTMLInputElement>(null);
  const [acte, setActe] = useState(agent.types_actes[0]?.libelle ?? "");
  const [fichier, setFichier] = useState<File | null>(null);
  const [survole, setSurvole] = useState(false);
  const depot = useMutation({
    mutationFn: async () => {
      const corps = new FormData();
      corps.set("intitule", acte);
      corps.set("categorie", acte);
      if (fichier) corps.set("fichier", fichier);
      return api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/pieces/`, { method: "POST", body: corps });
    },
    onSuccess: (dossier) => {
      onEnregistre(dossier);
      onClose();
    },
  });
  const erreur = depot.error instanceof ApiError ? depot.error.message : depot.isError ? "Le téléversement n'a pas abouti." : "";

  function prendre(choisi: File | null) {
    setFichier(choisi);
  }

  function deposerFichier(event: DragEvent) {
    event.preventDefault();
    setSurvole(false);
    prendre(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <Modale
      titre="Versement d'une pièce"
      sousTitre={`Le document est enregistré au coffre de ${agent.nom_complet}.`}
      icone="upload_file"
      taille="xl"
      onClose={onClose}
      onSubmit={() => depot.mutate()}
      enCours={depot.isPending}
      erreur={erreur || undefined}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose} disabled={depot.isPending}>
            Annuler
          </button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={depot.isPending || !fichier || !acte}>
            <span className={`material-symbols-outlined text-lg ${depot.isPending ? "motion-spin" : ""}`} aria-hidden="true">{depot.isPending ? "progress_activity" : "verified"}</span>
            {depot.isPending ? "Versement…" : "Verser au coffre"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="space-y-1.5 block max-w-xl">
          <span className="block font-label-md text-label-md text-on-surface font-semibold">Acte <span className="text-error">*</span></span>
          <select className={CHAMP} value={acte} onChange={(event) => setActe(event.target.value)} required>
            {agent.types_actes.map((type) => <option key={type.code} value={type.libelle}>{type.libelle}</option>)}
          </select>
        </label>
        <div
          className={`p-8 rounded-xl text-center space-y-3 ${survole ? "bg-surface-container" : "bg-surface-container-low"}`}
          onDragOver={(event) => {
            event.preventDefault();
            setSurvole(true);
          }}
          onDragLeave={() => setSurvole(false)}
          onDrop={deposerFichier}
        >
          <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-lowest text-primary flex items-center justify-center" aria-hidden="true">
            <span className="material-symbols-outlined text-3xl">cloud_upload</span>
          </div>
          <p className="font-label-lg text-label-lg font-bold text-on-surface">
            Glissez le document, ou{" "}
            <button type="button" className="text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded" onClick={() => fichierRef.current?.click()}>
              parcourez vos fichiers
            </button>
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">PDF, PNG, JPG ou WEBP · 15 Mo par document</p>
          {fichier ? <p className="font-label-md text-label-md text-primary font-semibold">{fichier.name}</p> : null}
          <input
            ref={fichierRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => prendre(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="p-4 rounded-lg bg-surface-container flex items-start gap-3">
          <span className="material-symbols-outlined text-secondary text-xl shrink-0" aria-hidden="true">warning</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Le déposant répond de l'authenticité du scan versé au dossier de {agent.nom_complet}.
          </p>
        </div>
      </div>
    </Modale>
  );
}

function taille(ko: number): string {
  if (ko < 1024) return `${ko.toLocaleString("fr-FR")} Ko`;
  return `${(ko / 1024).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mo`;
}
