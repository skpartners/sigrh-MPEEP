import { useRef, useState, type FormEvent, type ReactNode, type ChangeEvent } from "react";
import type { Dossier } from "../api/types";
import { OngletPieces } from "./OngletPieces";
import { Icone } from "../ui/Icone";

type OngletProfil = "profil" | "documents" | "demandes";

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
  const [onglet, setOnglet] = useState<OngletProfil>("profil");
  const [typeDemande, setTypeDemande] = useState("Attestation de travail");
  const [motif, setMotif] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [message, setMessage] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const inputFichier = useRef<HTMLInputElement>(null);

  const lignesAdmin = agent.situation_administrative ?? [];
  const lignesEtatCivil = lignesAdmin.filter((ligne) =>
    /nom|prénom|naissance|sexe|mari|adresse|ville|téléphone|telephone|courriel|email|urgence|cni|identité/i.test(ligne.libelle)
  );
  const lignesAcademiques = lignesAdmin.filter((ligne) =>
    /diplôme|diplome|étude|etude|formation initiale|spécialité|specialite|niveau académique|niveau academique|domaine de formation/i.test(ligne.libelle)
  );
  const valeurAdmin = (motifs: RegExp): string | undefined => {
    const ligne = lignesAdmin.find((item) => motifs.test(item.libelle));
    return ligne?.valeur == null || !String(ligne.valeur).trim() ? undefined : String(ligne.valeur);
  };

  function choisirFichier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFichier(file);
    setApercu(null);
    if (file && (file.type.startsWith("image/") || file.type === "application/pdf")) {
      setApercu(URL.createObjectURL(file));
    }
  }

  function envoyerDemande(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(`Votre formulaire « ${typeDemande} » est préparé dans l’interface. Il n’a pas été transmis à la DRH, car aucune route API de demande n’est configurée ici.`);
  }

  return (
    <div className={PAGE}>
      <div className="motion-content flex flex-col w-full">
        <div className={`${CARD} mb-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-20 h-20 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
              <Icone nom="person" className="text-4xl" />
            </div>
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
              <Bloc titre="État civil et coordonnées" icone="badge">
                {lignesEtatCivil.length ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                    {lignesEtatCivil.map((ligne) => <Champ key={ligne.libelle} label={ligne.libelle} value={ligne.valeur} />)}
                  </dl>
                ) : (
                  <p className="font-body-sm text-on-surface-variant">Les données d’état civil et de coordonnées détaillées ne sont pas présentes dans les données actuellement fournies par le dossier.</p>
                )}
              </Bloc>

              <Bloc titre="Situation administrative" icone="account_tree">
                <div className="flex flex-wrap gap-3 mb-4">
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Grade : </span><strong>{agent.grade || "Non renseigné"}</strong></span>
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Catégorie : </span><strong>{agent.categorie || "Non renseignée"}</strong></span>
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low"><span className="text-on-surface-variant text-sm">Structure : </span><strong>{agent.structure || "Non renseignée"}</strong></span>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                  {lignesAdmin.filter((ligne) => !lignesEtatCivil.includes(ligne) && !lignesAcademiques.includes(ligne)).map((ligne) =>
                    <Champ key={ligne.libelle} label={ligne.libelle} value={ligne.valeur} />
                  )}
                </dl>
              </Bloc>

              <Bloc titre="Parcours académique" icone="school">
                <p className="font-body-sm text-on-surface-variant mb-3">Les champs ci-dessous sont prévus pour afficher le niveau d’études, le diplôme le plus élevé et le domaine de formation. Les valeurs restent « Non renseigné » si le dossier ne les fournit pas.</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                  <Champ label="Niveau d’étude" value={valeurAdmin(/niveau.*(étude|etude|académique|academique)|étude|etude/i)} />
                  <Champ label="Libellé du diplôme le plus élevé" value={valeurAdmin(/libellé.*diplôme|libelle.*diplome|diplôme.*élevé|diplome.*eleve|intitulé.*diplôme|intitule.*diplome/i)} />
                  <Champ label="Domaine de formation" value={valeurAdmin(/domaine.*formation|spécialité|specialite|filière|filiere/i)} />
                </dl>
                <p className="font-body-sm text-on-surface-variant mt-3">Niveaux prévus : CEPE, BEPC, BAC, LICENCE, MASTER et DOCTORAT.</p>
              </Bloc>

              <Bloc titre="Liste du conjoint et des enfants" icone="family_restroom">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-2">Conjoint</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <Champ label="Nom et prénoms du conjoint" value={valeurAdmin(/conjoint.*(nom|prénom)|nom.*conjoint|époux|epoux|épouse|epouse/i)} />
                  <Champ label="Contacts du conjoint" value={valeurAdmin(/contact.*conjoint|conjoint.*contact|téléphone.*conjoint|telephone.*conjoint/i)} />
                </dl>

                <div className="mt-6">
                  <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-2">Enfants à charge</h3>
                  <div className="overflow-x-auto rounded-lg border border-hairline">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface-container-low text-on-surface-variant">
                        <tr>
                          <th className="px-3 py-3 font-semibold">Nom et prénoms</th>
                          <th className="px-3 py-3 font-semibold">Sexe</th>
                          <th className="px-3 py-3 font-semibold">Date de naissance</th>
                          <th className="px-3 py-3 font-semibold">Lieu de naissance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-3 border-t border-hairline text-on-surface-variant" colSpan={4}>
                            Aucune liste d’enfants structurée n’est disponible dans les données chargées. Les colonnes ci-dessus définissent les informations attendues pour chaque enfant.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </Bloc>
            </div>
          )}

          {onglet === "documents" && (
            <div className="space-y-4">
              <Bloc titre="Mes documents" icone="folder_open">
                <p className="font-body-sm text-on-surface-variant mb-4">Consultez les pièces déjà associées au dossier. La prévisualisation, le téléchargement et les contrôles de validité dépendent des fonctionnalités prises en charge par la liste de pièces existante.</p>
                <OngletPieces agent={agent} />
              </Bloc>
              <Bloc titre="Ajouter une pièce (aperçu local)" icone="upload_file">
                <label className="block font-label-md text-on-surface mb-2" htmlFor="ajout-document">Sélectionner un document</label>
                <input ref={inputFichier} id="ajout-document" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={choisirFichier}
                  className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary" />
                {fichier && <div className="mt-3 rounded-lg bg-surface-container-low p-3">
                  <p className="font-semibold text-on-surface">{fichier.name}</p>
                  <p className="text-sm text-on-surface-variant">{Math.ceil(fichier.size / 1024)} Ko · fichier sélectionné localement</p>
                  {apercu && fichier.type.startsWith("image/") && <img src={apercu} alt={`Aperçu de ${fichier.name}`} className="mt-3 max-h-72 rounded-lg object-contain" />}
                  {apercu && fichier.type === "application/pdf" && <a href={apercu} target="_blank" rel="noreferrer" className="inline-flex mt-3 text-primary underline">Prévisualiser le PDF</a>}
                  <p className="text-sm text-on-surface-variant mt-2">Ce fichier n’est pas encore téléversé ni enregistré dans le dossier.</p>
                </div>}
              </Bloc>
            </div>
          )}

          {onglet === "demandes" && (
            <Bloc titre="Demande d’actes administratifs" icone="description">
              <p className="font-body-sm text-on-surface-variant mb-5">Remplissez les informations ci-dessous. Cette version prépare le formulaire dans l’interface uniquement : elle ne transmet pas encore la demande à la DRH.</p>
              <form onSubmit={envoyerDemande} className="space-y-5 max-w-3xl">
                <div>
                  <label htmlFor="type-demande" className="block font-label-md text-on-surface mb-2">Type de demande</label>
                  <select id="type-demande" value={typeDemande} onChange={(e) => setTypeDemande(e.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface">
                    <option>Attestation de travail</option>
                    <option>Attestation de présence au poste</option>
                    <option>Permission spéciale d’absence</option>
                    <option>Autorisation spéciale d’absence</option>
                    <option>Permission</option>
                  </select>
                </div>
                {(typeDemande.includes("absence") || typeDemande === "Permission") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label htmlFor="date-debut" className="block font-label-md text-on-surface mb-2">Date de début</label><input id="date-debut" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required className="w-full rounded-lg border border-outline-variant px-3 py-2 bg-surface-container-lowest text-on-surface" /></div>
                    <div><label htmlFor="date-fin" className="block font-label-md text-on-surface mb-2">Date de fin</label><input id="date-fin" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required min={dateDebut || undefined} className="w-full rounded-lg border border-outline-variant px-3 py-2 bg-surface-container-lowest text-on-surface" /></div>
                  </div>
                )}
                <div><label htmlFor="motif-demande" className="block font-label-md text-on-surface mb-2">Motif / précisions</label><textarea id="motif-demande" rows={4} value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Précisez l’objet de votre demande…" className="w-full rounded-lg border border-outline-variant px-3 py-2 bg-surface-container-lowest text-on-surface" /></div>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary"><Icone nom="send" />Préparer la demande</button>
                {message && <p role="status" className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface">{message}</p>}
              </form>
            </Bloc>
          )}
        </div>
      </div>
    </div>
  );
}
