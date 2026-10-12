import { useState, type FormEvent, type ReactNode, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, mediaUrl } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import type { Dossier } from "../api/types";
import { useSearchParams } from "react-router-dom";
import { DemandesActes } from "./DemandesActes";
import { DemandesConges } from "./DemandesConges";
import { DocumentsAgent } from "./DocumentsAgent";
import { Icone } from "../ui/Icone";
import { EditeurPhoto, Portrait } from "../ui/PhotoProfil";

type OngletProfil = "profil" | "documents" | "conges" | "demandes";
const ONGLETS: OngletProfil[] = ["profil", "documents", "conges", "demandes"];

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";
const CARD = "bg-surface-container-lowest rounded-xl border border-hairline p-6";

function Champ({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="py-3 border-b border-hairline min-w-0">
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-body-md text-body-md text-on-surface font-semibold break-words">
        {value !== undefined && value !== null && String(value).trim() ? String(value) : <span className="font-normal text-on-surface-variant">Non renseigné</span>}
      </dd>
    </div>
  );
}

function GroupeEtatCivil({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-label-md text-label-md text-primary font-bold uppercase tracking-wide">{titre}</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">{children}</dl>
    </div>
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
  const modifiable = agent.modifiable !== false;
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
          <select id="type-piece-identite" value={type} onChange={(e) => setType(e.target.value)} required className={CHAMP_FORM}>
            <option value="">Choisir le type de pièce…</option>
            {TYPES_PIECE.map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
          </select>
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

/** Liste des enfants à charge, avec déclaration et retrait. */
function EnfantsACharge({ agent }: { agent: Dossier }) {
  const modifiable = agent.modifiable !== false;
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
      const dossier = await feedback.run("Mise à jour des enfants à charge…", action, {
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
    const corps = { ...formulaire, date_naissance: formulaire.date_naissance || null };
    if (await appliquer(() => api<Dossier>(base, { method: "POST", body: JSON.stringify(corps) }), "Enfant ajouté")) {
      setFormulaire(vide);
    }
  }

  return (
    <div className="space-y-5">
      {agent.famille.enfants.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body-sm text-body-sm">
            <thead>
              <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
                <th className="py-2 pr-4 font-medium">Nom</th>
                <th className="py-2 pr-4 font-medium">Prénoms</th>
                <th className="py-2 pr-4 font-medium">Sexe</th>
                <th className="py-2 pr-4 font-medium">Date de naissance</th>
                <th className="py-2 pr-4 font-medium">Lieu de naissance</th>
                <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {agent.famille.enfants.map((enfant) => (
                <tr key={enfant.id} className="border-b border-hairline text-on-surface">
                  <td className="py-2 pr-4 font-semibold">{enfant.nom}</td>
                  <td className="py-2 pr-4">{enfant.prenoms}</td>
                  <td className="py-2 pr-4">{enfant.sexe}</td>
                  <td className="py-2 pr-4">{dateFr(enfant.date_naissance) || "Non renseignée"}</td>
                  <td className="py-2 pr-4">{enfant.lieu_naissance || "Non renseigné"}</td>
                  <td className="py-2 text-right">
                    {modifiable ? <button
                      type="button"
                      disabled={enCours}
                      aria-label={`Retirer ${enfant.prenoms} ${enfant.nom}`}
                      onClick={() => void appliquer(() => api<Dossier>(`${base}${enfant.id}/`, { method: "DELETE" }), "Enfant retiré")}
                      className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container-low disabled:opacity-60"
                    >
                      <Icone nom="delete" className="text-lg" />
                    </button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="font-body-sm text-on-surface-variant">Aucun enfant à charge déclaré.</p>}

      {modifiable ? <form onSubmit={ajouter} className="space-y-4 max-w-3xl border-t border-hairline pt-5">
        <h3 className="font-label-md text-label-md text-primary font-bold uppercase tracking-wide">Ajouter un enfant</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="enfant-nom" className="block font-label-md text-on-surface mb-2">Nom</label>
            <input id="enfant-nom" value={formulaire.nom} onChange={(e) => maj("nom", e.target.value)} required maxLength={120} className={CHAMP_FORM} />
          </div>
          <div>
            <label htmlFor="enfant-prenoms" className="block font-label-md text-on-surface mb-2">Prénoms</label>
            <input id="enfant-prenoms" value={formulaire.prenoms} onChange={(e) => maj("prenoms", e.target.value)} required maxLength={160} className={CHAMP_FORM} />
          </div>
          <div>
            <label htmlFor="enfant-sexe" className="block font-label-md text-on-surface mb-2">Sexe</label>
            <select id="enfant-sexe" value={formulaire.sexe} onChange={(e) => maj("sexe", e.target.value)} required className={CHAMP_FORM}>
              <option value="">Choisir…</option>
              <option value="H">Garçon</option>
              <option value="F">Fille</option>
            </select>
          </div>
          <div>
            <label htmlFor="enfant-naissance" className="block font-label-md text-on-surface mb-2">Date de naissance</label>
            <input id="enfant-naissance" type="date" max={new Date().toISOString().slice(0, 10)} value={formulaire.date_naissance} onChange={(e) => maj("date_naissance", e.target.value)} className={CHAMP_FORM} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="enfant-lieu" className="block font-label-md text-on-surface mb-2">Lieu de naissance</label>
            <input id="enfant-lieu" value={formulaire.lieu_naissance} onChange={(e) => maj("lieu_naissance", e.target.value)} maxLength={160} className={CHAMP_FORM} />
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
  const [params] = useSearchParams();
  const demande = params.get("onglet") as OngletProfil | null;
  const [onglet, setOnglet] = useState<OngletProfil>(demande && ONGLETS.includes(demande) ? demande : "profil");
  const [photoOuverte, setPhotoOuverte] = useState(false);
  const modifiable = agent.modifiable !== false;

  const lignesAdmin = agent.situation_administrative ?? [];
  const ec = agent.etat_civil;


  return (
    <div className={PAGE}>
      <div className="motion-content flex flex-col w-full">
        <div className={`${CARD} mb-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {modifiable ? (
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
                <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm">Corps : {agent.corps || "Non renseigné"}</span>
                <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm">Situation : {agent.situation || "Non renseignée"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-hairline mb-6 p-1 flex flex-wrap gap-1" role="tablist" aria-label="Sections du profil agent">
          {([
            ["profil", "person", "Mon profil"],
            ["documents", "folder_open", "Mes documents"],
            ["conges", "event_available", "Demande de congé"],
            ["demandes", "description", "Demande d’actes"],
          ] as const).map(([id, icone, libelle]) => (
            <button key={id} id={`profil-tab-${id}`} role="tab" aria-selected={onglet === id} aria-controls="profil-tab-panel"
              type="button" onClick={() => setOnglet(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 font-label-md text-label-md transition-colors ${onglet === id ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:bg-surface-container-low"}`}>
              <Icone nom={icone} className="text-lg" />{libelle}
            </button>
          ))}
        </div>

        <div id="profil-tab-panel" role="tabpanel" aria-labelledby={`profil-tab-${onglet}`} className="space-y-6">
          {onglet === "profil" && (
            <div className="space-y-6">
              <Bloc titre="État civil" icone="badge">
                <div className="space-y-6">
                  <GroupeEtatCivil titre="Identification">
                    <Champ label="Nom" value={ec.nom} />
                    <Champ label="Prénoms" value={ec.prenoms} />
                    <Champ label="Nom de jeune fille" value={ec.nom_jeune_fille} />
                    <Champ label="Sexe" value={ec.sexe} />
                    <Champ label="Date de naissance" value={dateFr(ec.date_naissance)} />
                    <Champ label="Lieu de naissance" value={ec.lieu_naissance} />
                  </GroupeEtatCivil>
                  <GroupeEtatCivil titre="Situation matrimoniale">
                    <Champ label="Statut matrimonial" value={ec.statut_matrimonial} />
                    <Champ label="Date du mariage" value={dateFr(ec.date_mariage)} />
                  </GroupeEtatCivil>
                  <section>
                    <h3 className="font-label-md text-label-md text-primary font-bold uppercase tracking-wide">Pièce d’identité</h3>
                    <PieceIdentite agent={agent} />
                  </section>
                  <GroupeEtatCivil titre="Coordonnées">
                    <Champ label="Adresse de résidence" value={ec.adresse_residence} />
                    <Champ label="Ville / commune" value={ec.ville} />
                    <Champ label="Téléphone principal" value={ec.telephone} />
                    <Champ label="Téléphone secondaire" value={ec.telephone_secondaire} />
                    <Champ label="Adresse e-mail" value={ec.courriel} />
                    <Champ label="Personne à contacter en cas d’urgence" value={ec.contact_urgence_nom} />
                    <Champ label="Téléphone de la personne à contacter" value={ec.contact_urgence_telephone} />
                  </GroupeEtatCivil>
                </div>
              </Bloc>

              <Bloc titre="Situation administrative" icone="account_tree">
                <div className="flex flex-wrap gap-3 mb-4">
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Grade : </span><strong>{agent.grade || "Non renseigné"}</strong></span>
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Catégorie : </span><strong>{agent.categorie || "Non renseignée"}</strong></span>
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Structure : </span><strong>{agent.structure || "Non renseignée"}</strong></span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                  {lignesAdmin.map((ligne) =>
                    <Champ key={ligne.libelle} label={ligne.libelle} value={ligne.valeur} />
                  )}
                </dl>
              </Bloc>

              <Bloc titre="Parcours académique" icone="school">
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                  <Champ label="Niveau d’étude" value={agent.parcours_academique.niveau_etude} />
                  <Champ label="Libellé du diplôme le plus élevé" value={agent.parcours_academique.libelle_diplome} />
                  <Champ label="Domaine de formation" value={agent.parcours_academique.domaine_formation} />
                </dl>
              </Bloc>

              <Bloc titre="Conjoint" icone="favorite">
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                  <Champ label="Nom" value={agent.famille.conjoint.nom} />
                  <Champ label="Prénoms" value={agent.famille.conjoint.prenoms} />
                  <Champ label="Téléphone" value={agent.famille.conjoint.telephone} />
                  <Champ label="Adresse e-mail" value={agent.famille.conjoint.courriel} />
                </dl>
              </Bloc>

              <Bloc titre={`Enfants à charge (${agent.famille.enfants.length})`} icone="child_care">
                <EnfantsACharge agent={agent} />
              </Bloc>
            </div>
          )}

          {onglet === "documents" && (
            <div className="space-y-4">
              <Bloc titre="Dossier personnel numérique" icone="folder_open">
                <DocumentsAgent agent={agent} />
              </Bloc>
            </div>
          )}

          {onglet === "conges" && <DemandesConges agent={agent} />}

          {onglet === "demandes" && <DemandesActes agent={agent} />}
        </div>
      </div>
      {photoOuverte ? <EditeurPhoto agent={agent} onClose={() => setPhotoOuverte(false)} /> : null}
    </div>
  );
}
