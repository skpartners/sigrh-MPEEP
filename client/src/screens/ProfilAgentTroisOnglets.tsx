import { BesoinsResponsable, useMesBesoins } from "./BesoinsResponsable";
import { MobiliteAgent } from "./dotation/MobiliteAgent";
import { createContext, useContext, useState, type FormEvent, type ReactNode, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, mediaUrl, telecharger } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import type { Dossier } from "../api/types";
import { useSearchParams } from "react-router-dom";
import { DemandesActes } from "./DemandesActes";
import { DemandesConges } from "./DemandesConges";
import { DocumentsAgent } from "./DocumentsAgent";
import { CollecteAgent, pastilleCollecte } from "./formation/CollecteAgent";
import { Icone } from "../ui/Icone";
import { CHAMPS_PROFIL, controleNom, premiereErreur } from "../ui/validation";
import { EditeurPhoto, Portrait } from "../ui/PhotoProfil";
import { Select } from "../ui/Select";

type OngletProfil = "profil" | "documents" | "conges" | "demandes" | "formation" | "besoins" | "disposition";
const ONGLETS: OngletProfil[] = ["profil", "documents", "conges", "demandes", "formation", "besoins", "disposition"];

const ETAPES_DISCIPLINE: [string, string][] = [
  ["demande_explication", "Demande d’explication"],
  ["instruction_conseil", "Instruction devant le conseil de discipline"],
  ["decision_execution", "Décision et exécution"],
];

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";
const CARD = "bg-surface-container-lowest rounded-xl border border-hairline p-6";

type Brouillon = Record<string, string>;
const EditionContexte = createContext<{ edition: boolean; brouillon: Brouillon; maj: (cle: string, valeur: string) => void }>({
  edition: false, brouillon: {}, maj: () => undefined,
});

const OPTIONS_SEXE: [string, string][] = [["H", "Homme"], ["F", "Femme"]];
const OPTIONS_STATUT: [string, string][] = [["", "Non renseigné"], ["celibataire", "Célibataire"], ["marie", "Marié(e)"], ["veuf", "Veuf / veuve"], ["divorce", "Divorcé(e)"]];
const OPTIONS_NIVEAU: [string, string][] = [["", "Non renseigné"], ["cepe", "CEPE"], ["bepc", "BEPC"], ["bac", "BAC"], ["licence", "Licence"], ["master", "Master"], ["doctorat", "Doctorat"]];

function Champ({ label, value, nom, type = "text", options }: {
  label: string; value?: string | number | null; nom?: string; type?: "text" | "date" | "email" | "tel"; options?: [string, string][];
}) {
  const { edition, brouillon, maj } = useContext(EditionContexte);
  if (edition && nom) {
    const id = `profil-${nom}`;
    const valeur = brouillon[nom] ?? "";
    const regle = CHAMPS_PROFIL[nom];
    const probleme = regle?.controle?.(valeur) ?? null;
    return (
      <div className="py-3 border-b border-hairline min-w-0">
        <label htmlFor={id} className="font-label-sm text-label-sm text-on-surface-variant block">{label}</label>
        {options ? (
          <Select id={id} value={valeur} onChange={(e) => maj(nom, e.target.value)} className={`${CHAMP_FORM} mt-1`}>
            {options.map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
          </Select>
        ) : (
          <input id={id} type={type} value={valeur} onChange={(e) => maj(nom, e.target.value)} placeholder={regle?.placeholder}
            inputMode={type === "tel" ? "tel" : undefined} autoComplete={type === "tel" ? "tel" : type === "email" ? "email" : "off"}
            aria-invalid={probleme ? true : undefined} aria-describedby={probleme ? `${id}-erreur` : undefined}
            max={type === "date" ? new Date().toISOString().slice(0, 10) : undefined}
            className={`${CHAMP_FORM} mt-1 ${probleme ? "border-error focus:ring-error" : ""}`} />
        )}
        {probleme ? <p id={`${id}-erreur`} role="alert" className="mt-1 text-sm text-error">{probleme}</p> : null}
      </div>
    );
  }
  return (
    <div className="py-3 border-b border-hairline min-w-0">
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-body-md text-body-md text-on-surface font-semibold break-words">
        {value !== undefined && value !== null && String(value).trim() ? String(value) : <span className="font-normal text-on-surface-variant">Non renseigné</span>}
      </dd>
    </div>
  );
}

function GroupeEtatCivil({ titre, icone, children, grille = true }: { titre: string; icone: string; children: ReactNode; grille?: boolean }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface-container-low/50 p-5 transition-shadow duration-300 hover:shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--color-primary)_30%,transparent)]">
      <h3 className="mb-3 flex items-center gap-3 font-label-lg text-label-lg font-bold text-on-surface">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary" aria-hidden="true">
          <Icone nom={icone} className="text-xl" />
        </span>
        {titre}
      </h3>
      {grille ? <dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">{children}</dl> : children}
    </section>
  );
}

const TYPES_PIECE: [string, string][] = [
  ["cni", "Carte nationale d’identité (CNI)"],
  ["passeport", "Passeport"],
  ["attestation", "Attestation d’identité"],
  ["permis", "Permis de conduire"],
  ["consulaire", "Carte consulaire"],
];
const CHAMP_FORM = "w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface";

/** Le type de pièce est renseigné d’abord ; le document ne se charge qu’ensuite. */
function PieceIdentite({ agent }: { agent: Dossier }) {
  const { edition } = useContext(EditionContexte);
  const modifiable = agent.modifiable !== false && edition;
  const client = useQueryClient();
  const feedback = useFeedback();
  const ec = agent.etat_civil;
  const [type, setType] = useState(ec.type_piece_identite);
  const [numero, setNumero] = useState(ec.numero_piece_identite);
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const lien = mediaUrl(ec.piece_identite_url);

  function choisir(event: ChangeEvent<HTMLInputElement>) {
    const choisi = event.target.files?.[0] ?? null;
    setErreur("");
    if (choisi && choisi.size > 5 * 1024 * 1024) {
      setErreur("Le document dépasse 5 Mo.");
      event.target.value = "";
      return;
    }
    setFichier(choisi);
  }

  async function enregistrer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreur("");
    setEnCours(true);
    const corps = new FormData();
    corps.set("type_piece", type);
    corps.set("numero", numero);
    if (fichier) corps.set("fichier", fichier);
    try {
      const dossier = await feedback.run(
        "Enregistrement de la pièce d’identité…",
        () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/piece-identite/`, { method: "POST", body: corps }),
        { success: { title: "Pièce d’identité enregistrée", message: `Elle figure sur le dossier de ${agent.nom_complet}.` } },
      );
      client.setQueryData(["agent", agent.matricule], dossier);
      setFichier(null);
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La pièce d’identité n’a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
    }
  }

  if (!modifiable) {
    return (
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
        <Champ label="Type de pièce" value={ec.type_piece_identite_libelle} />
        <Champ label="Numéro de la pièce" value={ec.numero_piece_identite} />
        <Champ label="Document" value={lien ? ec.piece_identite_nom || "Document chargé" : ""} />
      </dl>
    );
  }

  return (
    <form onSubmit={enregistrer} className="mt-3 space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="type-piece-identite" className="block font-label-md text-on-surface mb-2">Type de pièce</label>
          <Select id="type-piece-identite" value={type} onChange={(e) => setType(e.target.value)} required className={CHAMP_FORM}>
            <option value="">Choisir le type de pièce…</option>
            {TYPES_PIECE.map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="numero-piece-identite" className="block font-label-md text-on-surface mb-2">Numéro de la pièce</label>
          <input id="numero-piece-identite" value={numero} onChange={(e) => setNumero(e.target.value)} disabled={!type} required maxLength={40}
            placeholder={type ? "Numéro inscrit sur la pièce" : "Choisissez d’abord le type"} className={`${CHAMP_FORM} disabled:opacity-60`} />
        </div>
      </div>
      <div>
        <label htmlFor="document-piece-identite" className="block font-label-md text-on-surface mb-2">Document (PDF, PNG, JPG ou WEBP, 5 Mo maximum)</label>
        <input id="document-piece-identite" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={choisir} disabled={!type || !numero.trim()}
          className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary disabled:opacity-60" />
        {!type || !numero.trim() ? <p className="mt-1 text-sm text-on-surface-variant">Renseignez le type et le numéro pour charger le document.</p> : null}
        {lien ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            Document actuel : <a href={lien} target="_blank" rel="noreferrer" className="text-primary underline">{ec.piece_identite_nom || "Voir le document"}</a>
            {ec.type_piece_identite_libelle ? ` · ${ec.type_piece_identite_libelle}` : ""}
          </p>
        ) : <p className="mt-2 text-sm text-on-surface-variant">Aucun document chargé.</p>}
      </div>
      {erreur ? <p role="alert" className="text-sm text-error">{erreur}</p> : null}
      <button type="submit" disabled={enCours || !type || !numero.trim() || (!fichier && !lien)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary disabled:opacity-60">
        <Icone nom="upload_file" />{enCours ? "Enregistrement…" : "Enregistrer la pièce"}
      </button>
    </form>
  );
}

/** Liste des enfants, avec déclaration et retrait. */
function EnfantsACharge({ agent }: { agent: Dossier }) {
  const { edition } = useContext(EditionContexte);
  const modifiable = agent.modifiable !== false && edition;
  const client = useQueryClient();
  const feedback = useFeedback();
  const vide = { nom: "", prenoms: "", sexe: "", date_naissance: "", lieu_naissance: "" };
  const [formulaire, setFormulaire] = useState(vide);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const base = `/api/v1/agents/${encodeURIComponent(agent.matricule)}/enfants/`;

  function maj(cle: keyof typeof vide, valeur: string) {
    setFormulaire((courant) => ({ ...courant, [cle]: valeur }));
  }

  async function appliquer(action: () => Promise<Dossier>, titre: string) {
    setErreur("");
    setEnCours(true);
    try {
      const dossier = await feedback.run("Mise à jour des enfants…", action, {
        success: { title: titre, message: `Le dossier de ${agent.nom_complet} est à jour.` },
      });
      client.setQueryData(["agent", agent.matricule], dossier);
      return true;
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La modification n’a pas pu être enregistrée.");
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function ajouter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fautif = controleNom(formulaire.nom) ?? controleNom(formulaire.prenoms);
    if (fautif) {
      setErreur(fautif);
      return;
    }
    const corps = { ...formulaire, date_naissance: formulaire.date_naissance || null };
    if (await appliquer(() => api<Dossier>(base, { method: "POST", body: JSON.stringify(corps) }), "Enfant ajouté")) {
      setFormulaire(vide);
    }
  }

  return (
    <div className="space-y-5">
      {agent.famille.enfants.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agent.famille.enfants.map((enfant) => (
            <li key={enfant.id} className="group relative flex flex-col gap-3 rounded-xl border border-hairline bg-surface-container-low/50 p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-14px_color-mix(in_oklab,var(--color-primary)_40%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 !flex-row items-start">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary" aria-hidden="true">
                <Icone nom={enfant.sexe === "Fille" ? "girl" : "boy"} className="text-3xl" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-label-lg text-label-lg font-bold text-on-surface">{enfant.nom} {enfant.prenoms}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {enfant.sexe}
                  {enfant.date_naissance ? ` · né${enfant.sexe === "Fille" ? "e" : ""} le ${dateFr(enfant.date_naissance)}${ageDe(enfant.date_naissance)}` : ""}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{enfant.lieu_naissance || "Lieu de naissance non renseigné"}</p>
              </div>
              {modifiable ? <button
                type="button"
                disabled={enCours}
                aria-label={`Retirer ${enfant.prenoms} ${enfant.nom}`}
                onClick={() => void appliquer(() => api<Dossier>(`${base}${enfant.id}/`, { method: "DELETE" }), "Enfant retiré")}
                className="-mr-2 -mt-1 rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-error-container/60 hover:text-error disabled:opacity-60"
              >
                <Icone nom="delete" className="text-lg" />
              </button> : null}
            </li>
          ))}
        </ul>
      ) : <p className="font-body-sm text-on-surface-variant">Aucun enfant déclaré.</p>}

      {modifiable ? <form onSubmit={ajouter} className="space-y-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest/60 p-5">
        <h3 className="flex items-center gap-2 font-label-lg text-label-lg font-bold text-on-surface"><Icone nom="person_add" className="text-xl text-primary" />Ajouter un enfant</h3>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-3">
            <label htmlFor="enfant-nom" className="block font-label-md text-on-surface mb-2">Nom</label>
            <input id="enfant-nom" value={formulaire.nom} onChange={(e) => maj("nom", e.target.value)} required maxLength={120} placeholder="Ex. : KOUASSI" className={CHAMP_FORM} />
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="enfant-prenoms" className="block font-label-md text-on-surface mb-2">Prénoms</label>
            <input id="enfant-prenoms" value={formulaire.prenoms} onChange={(e) => maj("prenoms", e.target.value)} required maxLength={160} placeholder="Ex. : Kouadio Paul" className={CHAMP_FORM} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="enfant-sexe" className="block font-label-md text-on-surface mb-2">Sexe</label>
            <Select id="enfant-sexe" value={formulaire.sexe} onChange={(e) => maj("sexe", e.target.value)} required className={CHAMP_FORM}>
              <option value="">Choisir…</option>
              <option value="H">Garçon</option>
              <option value="F">Fille</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="enfant-naissance" className="block font-label-md text-on-surface mb-2">Date de naissance</label>
            <input id="enfant-naissance" type="date" max={new Date().toISOString().slice(0, 10)} value={formulaire.date_naissance} onChange={(e) => maj("date_naissance", e.target.value)} className={CHAMP_FORM} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="enfant-lieu" className="block font-label-md text-on-surface mb-2">Lieu de naissance</label>
            <input id="enfant-lieu" value={formulaire.lieu_naissance} onChange={(e) => maj("lieu_naissance", e.target.value)} maxLength={160} placeholder="Ex. : Abidjan" className={CHAMP_FORM} />
          </div>
        </div>
        {erreur ? <p role="alert" className="text-sm text-error">{erreur}</p> : null}
        <button type="submit" disabled={enCours} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary disabled:opacity-60">
          <Icone nom="person_add" />{enCours ? "Enregistrement…" : "Ajouter l’enfant"}
        </button>
      </form> : null}
    </div>
  );
}

/** Parcours académique : autant de lignes que de diplômes, avec ajout et retrait. */
function ParcoursAcademique({ agent }: { agent: Dossier }) {
  const { edition } = useContext(EditionContexte);
  const modifiable = agent.modifiable !== false && edition;
  const client = useQueryClient();
  const feedback = useFeedback();
  const vide = { niveau_etude: "", libelle: "", domaine_formation: "" };
  const [formulaire, setFormulaire] = useState(vide);
  const [fichier, setFichier] = useState<File | null>(null);
  const [pieceId, setPieceId] = useState("");
  const [cleFichier, setCleFichier] = useState(0);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const base = `/api/v1/agents/${encodeURIComponent(agent.matricule)}/diplomes/`;
  const diplomes = agent.parcours_academique.diplomes ?? [];
  const piecesLibres = agent.parcours_academique.pieces_libres ?? [];

  /** Rattache un justificatif (fichier ou pièce déjà versée) à une ligne existante. */
  function joindre(id: number, fichierChoisi: File | null, piece: string) {
    const corps = new FormData();
    if (fichierChoisi) corps.set("fichier", fichierChoisi);
    if (piece) corps.set("piece_id", piece);
    return appliquer(() => api<Dossier>(`${base}${id}/justificatif/`, { method: "POST", body: corps }), "Justificatif rattaché");
  }

  function maj(cle: keyof typeof vide, valeur: string) {
    setFormulaire((courant) => ({ ...courant, [cle]: valeur }));
  }

  async function appliquer(action: () => Promise<Dossier>, titre: string) {
    setErreur("");
    setEnCours(true);
    try {
      const dossier = await feedback.run("Mise à jour du parcours académique…", action, {
        success: { title: titre, message: `Le dossier de ${agent.nom_complet} est à jour.` },
      });
      client.setQueryData(["agent", agent.matricule], dossier);
      return true;
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La modification n’a pas pu être enregistrée.");
      return false;
    } finally {
      setEnCours(false);
    }
  }

  async function ajouter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const corps = new FormData();
    for (const [cle, valeur] of Object.entries(formulaire)) corps.set(cle, valeur);
    if (fichier) corps.set("fichier", fichier);
    else if (pieceId) corps.set("piece_id", pieceId);
    if (await appliquer(() => api<Dossier>(base, { method: "POST", body: corps }), "Diplôme ajouté")) {
      setFormulaire(vide);
      setFichier(null);
      setPieceId("");
      setCleFichier((n) => n + 1);
    }
  }

  return (
    <div className="space-y-5">
      {diplomes.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {diplomes.map((diplome) => (
            <li key={diplome.id} className="group relative flex flex-col gap-3 rounded-xl border border-hairline bg-surface-container-low/50 p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-14px_color-mix(in_oklab,var(--color-primary)_40%,transparent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-3 py-1 font-label-sm text-label-sm font-bold text-on-primary-fixed">
                  <Icone nom="school" className="text-base" />{diplome.niveau_etude}
                </span>
                {modifiable ? <button
                  type="button"
                  disabled={enCours}
                  aria-label={`Retirer le diplôme ${diplome.libelle || diplome.niveau_etude}`}
                  onClick={() => void appliquer(() => api<Dossier>(`${base}${diplome.id}/`, { method: "DELETE" }), "Diplôme retiré")}
                  className="-mr-2 -mt-1 rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-error-container/60 hover:text-error disabled:opacity-60"
                >
                  <Icone nom="delete" className="text-lg" />
                </button> : null}
              </div>
              <div>
                <p className="font-label-lg text-label-lg font-bold text-on-surface">{diplome.libelle || "Diplôme non précisé"}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{diplome.domaine_formation || "Domaine non renseigné"}</p>
              </div>
              <div className="mt-auto border-t border-hairline pt-3 font-body-sm text-body-sm">
                    {diplome.piece ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <a href={mediaUrl(diplome.piece.fichier_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                          <Icone nom="description" className="text-base" />Voir le justificatif
                        </a>
                        {modifiable ? <button type="button" disabled={enCours} onClick={() => void appliquer(() => api<Dossier>(`${base}${diplome.id}/justificatif/`, { method: "DELETE" }), "Justificatif détaché")}
                          className="text-on-surface-variant underline hover:text-error disabled:opacity-60">Détacher</button> : null}
                      </span>
                    ) : modifiable ? (
                      <span className="flex flex-col gap-1.5 min-w-48">
                        <label className="inline-flex w-fit cursor-pointer items-center gap-1 text-primary underline">
                          <Icone nom="upload_file" className="text-base" />Joindre un fichier
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" disabled={enCours}
                            onChange={(e) => { const choisi = e.target.files?.[0]; if (choisi) void joindre(diplome.id, choisi, ""); e.target.value = ""; }} />
                        </label>
                        {piecesLibres.length ? (
                          <Select aria-label={`Rattacher un document déjà versé au diplôme ${diplome.libelle || diplome.niveau_etude}`} value="" disabled={enCours}
                            onChange={(e) => { if (e.target.value) void joindre(diplome.id, null, e.target.value); }} className={`${CHAMP_FORM} py-1 text-sm`}>
                            <option value="">Ou choisir un document versé…</option>
                            {piecesLibres.map((piece) => <option key={piece.id} value={piece.id}>{piece.intitule}</option>)}
                          </Select>
                        ) : null}
                      </span>
                    ) : <span className="text-on-surface-variant">Non versé</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="font-body-sm text-on-surface-variant">Aucun diplôme déclaré.</p>}

      {modifiable ? <form onSubmit={ajouter} className="space-y-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest/60 p-5">
        <h3 className="flex items-center gap-2 font-label-lg text-label-lg font-bold text-on-surface"><Icone nom="add_circle" className="text-xl text-primary" />Ajouter un diplôme</h3>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="diplome-niveau" className="block font-label-md text-on-surface mb-2">Niveau d’étude</label>
            <Select id="diplome-niveau" value={formulaire.niveau_etude} onChange={(e) => maj("niveau_etude", e.target.value)} required className={CHAMP_FORM}>
              {OPTIONS_NIVEAU.map(([code, libelle]) => <option key={code} value={code}>{code ? libelle : "Choisir…"}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-4">
            <label htmlFor="diplome-libelle" className="block font-label-md text-on-surface mb-2">Libellé du diplôme</label>
            <input id="diplome-libelle" value={formulaire.libelle} onChange={(e) => maj("libelle", e.target.value)} maxLength={240} placeholder="Ex. : Master en gestion des ressources humaines" className={CHAMP_FORM} />
          </div>
          <div className="sm:col-span-6">
            <label htmlFor="diplome-domaine" className="block font-label-md text-on-surface mb-2">Domaine de formation</label>
            <input id="diplome-domaine" value={formulaire.domaine_formation} onChange={(e) => maj("domaine_formation", e.target.value)} maxLength={160} placeholder="Ex. : Gestion, droit, informatique…" className={CHAMP_FORM} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-3">
            <label htmlFor="diplome-fichier" className="block font-label-md text-on-surface mb-2">Justificatif (facultatif)</label>
            <input key={cleFichier} id="diplome-fichier" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={Boolean(pieceId)}
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary disabled:opacity-60" />
            <p className="mt-1 text-sm text-on-surface-variant">PDF ou image, 15 Mo maximum. Il est classé dans Mes documents.</p>
          </div>
          {piecesLibres.length ? (
            <div className="sm:col-span-3">
              <label htmlFor="diplome-piece" className="block font-label-md text-on-surface mb-2">Ou un document déjà versé</label>
              <Select id="diplome-piece" value={pieceId} onChange={(e) => setPieceId(e.target.value)} disabled={Boolean(fichier)} className={`${CHAMP_FORM} disabled:opacity-60`}>
                <option value="">Aucun</option>
                {piecesLibres.map((piece) => <option key={piece.id} value={piece.id}>{piece.intitule}</option>)}
              </Select>
            </div>
          ) : null}
        </div>
        {erreur ? <p role="alert" className="text-sm text-error">{erreur}</p> : null}
        <button type="submit" disabled={enCours} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary disabled:opacity-60">
          <Icone nom="add" />{enCours ? "Enregistrement…" : "Ajouter le diplôme"}
        </button>
      </form> : null}
    </div>
  );
}

/** Acte de mariage du dossier numérique : la pièce qui justifie la situation du conjoint, versée depuis Mes documents ou d'ici. */
function JustificatifMariage({ agent }: { agent: Dossier }) {
  const { edition } = useContext(EditionContexte);
  const modifiable = agent.modifiable !== false && edition;
  const client = useQueryClient();
  const feedback = useFeedback();
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const actes = agent.pieces.filter((piece) => piece.categorie === "Actes d'état civil" && piece.intitule.startsWith("Acte de mariage"));

  async function verser(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    event.target.value = "";
    if (!fichier) return;
    const corps = new FormData();
    corps.set("rubrique", "etat_civil");
    corps.set("type_document", "acte_mariage");
    corps.set("fichier", fichier);
    setErreur("");
    setEnCours(true);
    try {
      const dossier = await feedback.run(
        "Versement de l’acte de mariage…",
        () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/documents/`, { method: "POST", body: corps }),
        { success: { title: "Acte de mariage versé", message: "Il est classé dans Mes documents, rubrique Actes d’état civil." } },
      );
      client.setQueryData(["agent", agent.matricule], dossier);
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "L’acte de mariage n’a pas pu être versé.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-hairline bg-surface-container-low/50 p-5 lg:col-span-2">
      <h3 className="mb-1 flex items-center gap-3 font-label-lg text-label-lg font-bold text-on-surface">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary" aria-hidden="true">
          <Icone nom="description" className="text-xl" />
        </span>
        Acte de mariage
      </h3>
      {actes.length ? (
        <ul className="space-y-1">
          {actes.map((piece) => (
            <li key={piece.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body-sm text-body-sm">
              {piece.fichier_url ? (
                <a href={mediaUrl(piece.fichier_url)} target="_blank" rel="noreferrer" className="text-primary underline">{piece.intitule}</a>
              ) : <span>{piece.intitule}</span>}
              <span className="text-on-surface-variant">versé le {dateFr(piece.date_depot)}</span>
              <span className={`px-2 py-0.5 rounded font-label-sm font-bold ${piece.verifiee ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant"}`}>
                {piece.verifiee ? "Vérifié" : "En attente de vérification"}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun acte de mariage versé dans Mes documents.</p>}
      {modifiable ? (
        <label className="inline-flex w-fit cursor-pointer items-center gap-1 font-body-sm text-body-sm text-primary underline">
          <Icone nom="upload_file" className="text-base" />{enCours ? "Versement…" : actes.length ? "Verser un autre acte" : "Verser l’acte de mariage"}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" disabled={enCours} onChange={(e) => void verser(e)} />
        </label>
      ) : null}
      {erreur ? <p role="alert" className="text-sm text-error">{erreur}</p> : null}
    </section>
  );
}

/** Rubriques de la situation administrative regroupées en cartes ; ce qui n'y figure pas va dans « Autres informations ». */
const GROUPES_ADMIN: { titre: string; icone: string; libelles: string[] }[] = [
  { titre: "Identification administrative", icone: "badge", libelles: ["Matricule", "Type Agent", "Mode Recrutement", "Positions"] },
  { titre: "Affectation", icone: "account_tree", libelles: ["Structure", "Direction", "Sous-Direction", "Service", "Lieu de Travail"] },
  { titre: "Emploi, fonction et grade", icone: "work", libelles: ["Emploi", "Fonction", "Catégorie", "Grade"] },
  {
    titre: "Prises de service",
    icone: "event_available",
    libelles: [
      "Date de première prise de service (Fonction Publique)",
      "Date de prise de service dans le ministère",
      "Date de prise de service dans l'emploi",
      "Date de prise de service dans la fonction",
    ],
  },
];

function valeurAdmin(valeur: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? dateFr(valeur) : valeur;
}

/** « (8 ans) » à la suite de la date de naissance ; vide si la date est illisible. */
function ageDe(iso: string): string {
  const naissance = new Date(iso);
  if (Number.isNaN(naissance.getTime())) return "";
  const aujourdhui = new Date();
  let ans = aujourdhui.getFullYear() - naissance.getFullYear();
  if (aujourdhui < new Date(aujourdhui.getFullYear(), naissance.getMonth(), naissance.getDate())) ans -= 1;
  if (ans < 0) return "";
  return ans === 0 ? " (moins d’un an)" : ` (${ans} an${ans > 1 ? "s" : ""})`;
}

function dateFr(iso?: string) {
  if (!iso) return "";
  const [annee, mois, jour] = iso.split("-");
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : iso;
}

function Bloc({ titre, icone, children }: { titre: string; icone: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-4 flex items-center gap-2">
        <Icone nom={icone} className="text-primary text-xl" />{titre}
      </h2>
      {children}
    </section>
  );
}

export function ProfilAgentTroisOnglets({ agent }: { agent: Dossier }) {
  const mesBesoins = useMesBesoins(agent.modifiable !== false);
  const responsable = mesBesoins.data?.responsable === true;
  const besoinsAttendus = mesBesoins.data?.responsable === true && Boolean(mesBesoins.data.campagne?.ouverte) && mesBesoins.data.fiches.length === 0;
  const [params] = useSearchParams();
  const demande = params.get("onglet") as OngletProfil | null;
  const [onglet, setOnglet] = useState<OngletProfil>(demande && ONGLETS.includes(demande) ? demande : "profil");
  const [photoOuverte, setPhotoOuverte] = useState(false);
  const modifiable = agent.modifiable !== false;
  const client = useQueryClient();
  const feedback = useFeedback();
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState<Brouillon>({});
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  function brouillonDe(a: Dossier): Brouillon {
    const e = a.etat_civil;
    return {
      nom: e.nom, prenoms: e.prenoms, nom_jeune_fille: e.nom_jeune_fille, sexe: e.sexe_code,
      date_naissance: e.date_naissance, lieu_naissance: e.lieu_naissance,
      statut_matrimonial: e.statut_matrimonial_code, date_mariage: e.date_mariage,
      adresse_residence: e.adresse_residence, ville: e.ville, telephone: e.telephone,
      telephone_secondaire: e.telephone_secondaire, courriel: e.courriel,
      contact_urgence_nom: e.contact_urgence_nom, contact_urgence_telephone: e.contact_urgence_telephone,
      conjoint_nom: a.famille.conjoint.nom, conjoint_prenoms: a.famille.conjoint.prenoms,
      conjoint_telephone: a.famille.conjoint.telephone, conjoint_courriel: a.famille.conjoint.courriel,
    };
  }

  function ouvrirEdition() {
    setBrouillon(brouillonDe(agent));
    setErreur("");
    setEdition(true);
  }

  async function enregistrerProfil() {
    const fautif = premiereErreur(brouillon);
    if (fautif) {
      setErreur(fautif.message);
      document.getElementById(`profil-${fautif.champ}`)?.focus();
      return;
    }
    setErreur("");
    setEnCours(true);
    try {
      const dossier = await feedback.run(
        "Enregistrement de vos informations…",
        () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/profil/`, { method: "PATCH", body: JSON.stringify(brouillon) }),
        { success: { title: "Informations mises à jour", message: `Le dossier de ${agent.nom_complet} est à jour.` } },
      );
      client.setQueryData(["agent", agent.matricule], dossier);
      setEdition(false);
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Les informations n’ont pas pu être enregistrées.");
    } finally {
      setEnCours(false);
    }
  }

  async function imprimerEtat() {
    await feedback.run(
      "Préparation de l’état de l’agent…",
      () => telecharger(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/dossier/`, `etat-agent-${agent.matricule}.pdf`),
      { success: { title: "État de l’agent prêt", message: "Le PDF est téléchargé : vous pouvez l’imprimer." }, error: "L’état n’a pas pu être préparé." },
    );
  }

  const lignesAdmin = agent.situation_administrative ?? [];
  const ec = agent.etat_civil;


  return (
    <EditionContexte.Provider value={{ edition, brouillon, maj: (cle, valeur) => setBrouillon((b) => ({ ...b, [cle]: valeur })) }}>
    <div className={PAGE}>
      <div className="motion-content flex flex-col w-full">
        <div className={`${CARD} mb-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {modifiable && edition ? (
            <button
              type="button"
              onClick={() => setPhotoOuverte(true)}
              className="relative shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={`Modifier la photo de profil de ${agent.nom_complet}`}
            >
              <Portrait agent={agent} className="w-24 h-24 rounded-xl bg-primary-fixed text-on-primary-fixed font-headline-lg text-headline-lg" />
              <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center ring-2 ring-surface-container-lowest" aria-hidden="true">
                <Icone nom="photo_camera" className="text-base" />
              </span>
            </button>
            ) : (
              <div className="shrink-0">
  <Portrait agent={agent} className="w-24 h-24 rounded-xl bg-primary-fixed text-on-primary-fixed font-headline-lg text-headline-lg" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-label-sm text-on-surface-variant">Dossier individuel de l’agent</p>
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold">{agent.nom_complet}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2.5 py-1 rounded bg-primary-fixed text-on-primary-fixed font-label-sm">Matricule : {agent.matricule}</span>
                <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm">Emploi : {agent.situation_saisie?.emploi || "Non renseigné"}</span>
                <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm">Fonction : {agent.situation_saisie?.fonction || "Non renseignée"}</span>
                <span className={`px-2.5 py-1 rounded font-label-sm font-semibold ${!agent.situation || agent.situation === "En activité" ? "bg-surface-container-low text-on-surface-variant" : "bg-secondary-container text-on-secondary-container"}`}>Position : {agent.situation || "Non renseignée"}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            <button type="button" onClick={() => void imprimerEtat()}
              className="bouton-action bouton-action--secondaire font-label-md text-label-md">
              <Icone nom="print" className="bouton-icone text-xl" />Imprimer l’état (PDF)
            </button>
            {modifiable ? (
              <>
              {edition ? (
                <>
                  <button type="button" onClick={() => void enregistrerProfil()} disabled={enCours}
                    className="bouton-action bouton-action--principal font-label-md text-label-md">
                    <Icone nom={enCours ? "progress_activity" : "save"} className={`bouton-icone text-xl ${enCours ? "motion-spin" : ""}`} />{enCours ? "Enregistrement…" : "Enregistrer"}
                  </button>
                  <button type="button" onClick={() => { setEdition(false); setErreur(""); }} disabled={enCours}
                    className="bouton-action bouton-action--discret font-label-md text-label-md">
                    <Icone nom="close" className="bouton-icone text-xl" />Annuler
                  </button>
                </>
              ) : (
                <button type="button" onClick={ouvrirEdition}
                  className="bouton-action bouton-action--principal font-label-md text-label-md">
                  <Icone nom="edit" className="bouton-icone text-xl" />Mettre à jour mes informations
                </button>
              )}
              </>
            ) : null}
          </div>
          {erreur ? <p role="alert" className="mt-3 text-sm text-error">{erreur}</p> : null}
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-hairline mb-6 p-1 flex flex-wrap gap-1" role="tablist" aria-label="Sections du profil agent">
          {([
            ["profil", "person", "Mon profil"],
            ["documents", "folder_open", "Mes documents"],
            ["conges", "event_available", "Demande de congé"],
            ["demandes", "description", "Demande d’actes"],
            ["formation", "school", "Formation"],
            ...(responsable ? [["besoins", "post_add", "Besoins RH"]] : []),
            ...(modifiable ? [["disposition", "swap_horiz", "Demande de mutation"]] : []),
          ] as [OngletProfil, string, string][]).map(([id, icone, libelle]) => (
            <button key={id} id={`profil-tab-${id}`} role="tab" aria-selected={onglet === id} aria-controls="profil-tab-panel"
              type="button" onClick={() => setOnglet(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 font-label-md text-label-md transition-colors ${onglet === id ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:bg-surface-container-low"}`}>
              <Icone nom={icone} className="text-lg" />{libelle}
              {(id === "formation" && pastilleCollecte(agent)) || (id === "besoins" && besoinsAttendus) ? (
                <span className="relative flex h-2 w-2" aria-label="Collecte en attente">
                  <span className="absolute inset-0 rounded-full bg-secondary-container motion-pulse-dot" />
                  <span className="relative h-2 w-2 rounded-full bg-secondary-container" />
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div id="profil-tab-panel" role="tabpanel" aria-labelledby={`profil-tab-${onglet}`} className="space-y-6">
          {onglet === "profil" && (
            <div className="space-y-6">
              <Bloc titre="État civil" icone="badge">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <GroupeEtatCivil titre="Identification" icone="person">
                    <Champ label="Nom" value={ec.nom} nom="nom" />
                    <Champ label="Prénoms" value={ec.prenoms} nom="prenoms" />
                    <Champ label="Sexe" value={ec.sexe} nom="sexe" options={OPTIONS_SEXE} />
                    <Champ label="Nom de jeune fille (le cas échéant)" value={ec.nom_jeune_fille} nom="nom_jeune_fille" />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Naissance" icone="cake">
                    <Champ label="Date de naissance" value={dateFr(ec.date_naissance)} nom="date_naissance" type="date" />
                    <Champ label="Lieu de naissance" value={ec.lieu_naissance} nom="lieu_naissance" />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Situation matrimoniale" icone="favorite">
                    <Champ label="Statut matrimonial" value={ec.statut_matrimonial} nom="statut_matrimonial" options={OPTIONS_STATUT} />
                    <Champ label="Date du mariage" value={dateFr(ec.date_mariage)} nom="date_mariage" type="date" />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Pièce d’identité" icone="id_card" grille={false}>
                    <PieceIdentite agent={agent} />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Coordonnées" icone="call">
                    <Champ label="Adresse de résidence" value={ec.adresse_residence} nom="adresse_residence" />
                    <Champ label="Ville / commune" value={ec.ville} nom="ville" />
                    <Champ label="Téléphone principal" value={ec.telephone} nom="telephone" type="tel" />
                    <Champ label="Téléphone secondaire" value={ec.telephone_secondaire} nom="telephone_secondaire" type="tel" />
                    <Champ label="Adresse e-mail" value={ec.courriel} nom="courriel" type="email" />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Personne à contacter en cas d’urgence" icone="emergency">
                    <Champ label="Nom et prénoms" value={ec.contact_urgence_nom} nom="contact_urgence_nom" />
                    <Champ label="Téléphone" value={ec.contact_urgence_telephone} nom="contact_urgence_telephone" type="tel" />
                  </GroupeEtatCivil>
                </div>
              </Bloc>

              <Bloc titre="Situation administrative" icone="account_tree">
                <div className="flex flex-wrap gap-3 mb-4">
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Grade : </span><strong>{agent.grade || "Non renseigné"}</strong></span>
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Catégorie : </span><strong>{agent.categorie || "Non renseignée"}</strong></span>
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Structure : </span><strong>{[agent.situation_saisie?.direction, agent.situation_saisie?.sous_direction, agent.situation_saisie?.service].filter(Boolean).join(" › ") || agent.structure || "Non renseignée"}</strong></span>
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {[
                    ...GROUPES_ADMIN.map((groupe) => ({ ...groupe, lignes: lignesAdmin.filter((ligne) => groupe.libelles.includes(ligne.libelle)) })),
                    { titre: "Autres informations", icone: "info", lignes: lignesAdmin.filter((ligne) => !GROUPES_ADMIN.some((groupe) => groupe.libelles.includes(ligne.libelle))) },
                  ].filter((groupe) => groupe.lignes.length > 0).map((groupe) => (
                    <GroupeEtatCivil key={groupe.titre} titre={groupe.titre} icone={groupe.icone}>
                      {groupe.lignes.map((ligne) => <Champ key={ligne.libelle} label={ligne.libelle} value={valeurAdmin(ligne.valeur)} />)}
                    </GroupeEtatCivil>
                  ))}
                </div>
              </Bloc>

              <Bloc titre="Parcours professionnel" icone="timeline">
                {agent.parcours.length === 0 ? (
                  <p className="font-body-sm text-on-surface-variant">Aucun événement de carrière enregistré pour le moment.</p>
                ) : (
                  <ol className="space-y-3">
                    {agent.parcours.map((etape) => (
                      <li key={`${etape.origine}-${etape.id}`} className="border-l-2 border-primary pl-4">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm">{etape.type_libelle}</span>
                          <span className="font-label-sm text-on-surface-variant">{dateFr(etape.date_effet)}</span>
                        </p>
                        <p className="mt-1 font-body-md text-on-surface font-semibold">{etape.intitule}</p>
                        {etape.reference_acte ? <p className="font-body-sm text-on-surface-variant">{etape.reference_acte}</p> : null}
                        {etape.detail ? <p className="font-body-sm text-on-surface-variant">{etape.detail}</p> : null}
                        {etape.document_url ? (
                          <a href={mediaUrl(etape.document_url)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-label-sm text-primary underline">
                            <Icone nom="attach_file" className="text-sm" />Voir l’acte
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </Bloc>

              <Bloc titre="Suivi disciplinaire" icone="gavel">
                {agent.discipline.length === 0 ? (
                  <p className="font-body-sm text-on-surface-variant">Aucune procédure disciplinaire.</p>
                ) : (
                  <ul className="space-y-4">
                    {agent.discipline.map((procedure) => (
                      <li key={procedure.reference} className="rounded-lg border border-hairline p-4">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-code-num font-bold text-primary">{procedure.reference}</span>
                          <span className="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm">{procedure.degre === 1 ? "1er" : `${procedure.degre}e`} degré</span>
                          <span className="font-label-sm text-on-surface-variant">Ouverte le {dateFr(procedure.saisine)}</span>
                        </p>
                        <p className="mt-2 font-body-md text-on-surface font-semibold">{procedure.grief}</p>
                        <p className="font-body-sm text-on-surface-variant whitespace-pre-wrap">{procedure.description}</p>
                        <ol className="mt-3 flex flex-wrap gap-2" aria-label="Étapes de la procédure">
                          {ETAPES_DISCIPLINE.map(([code, libelle]) => {
                            const rang = ETAPES_DISCIPLINE.findIndex(([c]) => c === procedure.phase);
                            const atteinte = ETAPES_DISCIPLINE.findIndex(([c]) => c === code) <= rang;
                            return (
                              <li key={code} aria-current={code === procedure.phase ? "step" : undefined}
                                className={`px-2.5 py-1 rounded-full font-label-sm ${code === procedure.phase ? "bg-primary text-on-primary" : atteinte ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container text-on-surface-variant"}`}>
                                {libelle}
                              </li>
                            );
                          })}
                        </ol>
                        {procedure.decision ? (
                          <p className="mt-3 font-body-sm text-on-surface">
                            <strong>Décision du {dateFr(procedure.date_decision)} :</strong> {procedure.decision}
                            {procedure.sanction_libelle ? ` (${procedure.sanction_libelle})` : ""}
                            {procedure.executee_le ? ` · exécutée le ${dateFr(procedure.executee_le)}` : " · en attente d’exécution"}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Bloc>

              <Bloc titre="Parcours académique" icone="school">
                <ParcoursAcademique agent={agent} />
              </Bloc>

              <Bloc titre="Conjoint" icone="favorite">
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <GroupeEtatCivil titre="Identité du conjoint" icone="person">
                    <Champ label="Nom" value={agent.famille.conjoint.nom} nom="conjoint_nom" />
                    <Champ label="Prénoms" value={agent.famille.conjoint.prenoms} nom="conjoint_prenoms" />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Contacts du conjoint" icone="call">
                    <Champ label="Téléphone" value={agent.famille.conjoint.telephone} nom="conjoint_telephone" type="tel" />
                    <Champ label="Adresse e-mail" value={agent.famille.conjoint.courriel} nom="conjoint_courriel" type="email" />
                  </GroupeEtatCivil>
                  <JustificatifMariage agent={agent} />
                </div>
              </Bloc>

              <Bloc titre={`Enfants (${agent.famille.enfants.length})`} icone="child_care">
                <EnfantsACharge agent={agent} />
              </Bloc>
            </div>
          )}

          {onglet === "documents" && (
            <div className="space-y-4">
              <Bloc titre="Dossier personnel numérique" icone="folder_open">
                <DocumentsAgent agent={agent} edition={edition} />
              </Bloc>
            </div>
          )}

          {onglet === "conges" && <DemandesConges agent={agent} />}

          {onglet === "demandes" && <DemandesActes agent={agent} />}

          {onglet === "formation" && <CollecteAgent agent={agent} />}

          {onglet === "besoins" && responsable && <BesoinsResponsable />}

          {onglet === "disposition" && modifiable && <MobiliteAgent />}
        </div>
      </div>
      {photoOuverte ? <EditeurPhoto agent={agent} onClose={() => setPhotoOuverte(false)} /> : null}
    </div>
    </EditionContexte.Provider>
  );
}
