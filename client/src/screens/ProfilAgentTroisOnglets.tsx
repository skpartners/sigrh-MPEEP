
import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type ChangeEvent,
} from "react";
import type { Dossier } from "../api/types";
import { OngletPieces } from "./OngletPieces";
import { Icone } from "../ui/Icone";

type OngletProfil = "profil" | "documents" | "demandes";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";
const CARD =
  "bg-surface-container-lowest rounded-xl border border-hairline p-6";

function Champ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  const renseigne =
    value !== undefined &&
    value !== null &&
    String(value).trim() !== "";

  return (
    <div className="py-3 border-b border-hairline min-w-0">
      <dt className="font-label-sm text-label-sm text-on-surface-variant">
        {label}
      </dt>
      <dd className="mt-1 font-body-md text-body-md text-on-surface font-semibold break-words">
        {renseigne ? (
          String(value)
        ) : (
          <span className="font-normal text-on-surface-variant">
            Non renseigné
          </span>
        )}
      </dd>
    </div>
  );
}

function Bloc({
  titre,
  icone,
  children,
}: {
  titre: string;
  icone: string;
  children: ReactNode;
}) {
  return (
    <section className={CARD}>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-5 flex items-center gap-2">
        <Icone nom={icone} className="text-primary text-xl" />
        {titre}
      </h2>
      {children}
    </section>
  );
}

/**
 * Normalise les libellés pour faciliter la comparaison :
 * "Prénom" devient "prenom", par exemple.
 */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ProfilAgentTroisOnglets({
  agent,
}: {
  agent: Dossier;
}) {
  const [onglet, setOnglet] = useState<OngletProfil>("profil");

  const [typeDemande, setTypeDemande] = useState(
    "Attestation de travail"
  );
  const [motif, setMotif] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [message, setMessage] = useState("");

  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);

  const inputFichier = useRef<HTMLInputElement>(null);

  const lignesAdmin = agent.situation_administrative ?? [];

  /**
   * Recherche une valeur dans les informations administratives
   * disponibles dans le dossier Django.
   */
  function valeurAdmin(motifs: RegExp): string | undefined {
    const ligne = lignesAdmin.find((item) => motifs.test(item.libelle));

    if (
      ligne?.valeur === undefined ||
      ligne?.valeur === null ||
      !String(ligne.valeur).trim()
    ) {
      return undefined;
    }

    return String(ligne.valeur);
  }

  /**
   * Recherche d'abord un libellé normalisé exact.
   * Utilise ensuite les expressions régulières de secours.
   */
  function valeurChamp(
    libelles: string[],
    secours?: RegExp
  ): string | undefined {
    const libellesNormalises = libelles.map(normaliser);

    const ligneExacte = lignesAdmin.find((item) =>
      libellesNormalises.includes(normaliser(item.libelle))
    );

    if (
      ligneExacte?.valeur !== undefined &&
      ligneExacte?.valeur !== null &&
      String(ligneExacte.valeur).trim() !== ""
    ) {
      return String(ligneExacte.valeur);
    }

    if (secours) {
      return valeurAdmin(secours);
    }

    return undefined;
  }

  const lignesEtatCivil = lignesAdmin.filter((ligne) =>
    /nom|prenom|jeune fille|naissance|sexe|matrimonial|mariage|adresse|ville|commune|telephone|courriel|email|urgence|cni|identite|residence/i.test(
      normaliser(ligne.libelle)
    )
  );

  const lignesAcademiques = lignesAdmin.filter((ligne) =>
    /diplome|etude|formation initiale|specialite|niveau academique|domaine de formation|filiere/i.test(
      normaliser(ligne.libelle)
    )
  );

  const lignesAdministrativesRestantes = lignesAdmin.filter(
    (ligne) =>
      !lignesEtatCivil.includes(ligne) &&
      !lignesAcademiques.includes(ligne)
  );

  function choisirFichier(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setFichier(file);
    setApercu(null);

    if (
      file &&
      (file.type.startsWith("image/") ||
        file.type === "application/pdf")
    ) {
      setApercu(URL.createObjectURL(file));
    }
  }

  function envoyerDemande(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage(
      `Votre formulaire « ${typeDemande} » est préparé dans l’interface. Il n’a pas été transmis à la DRH, car aucune route API de demande n’est configurée ici.`
    );
  }

  return (
    <div className={PAGE}>
      <div className="motion-content flex flex-col w-full">

        {/* EN-TÊTE DU DOSSIER */}
        <header className={`${CARD} mb-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-20 h-20 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
              <Icone nom="person" className="text-4xl" />
            </div>

            <div className="min-w-0">
              <p className="font-label-sm text-on-surface-variant">
                Dossier individuel de l’agent
              </p>

              <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold">
                {agent.nom_complet}
              </h1>

              <div className="flex flex-wrap gap-2 mt-2">
                <span className="px-2.5 py-1 rounded bg-primary-fixed text-on-primary-fixed font-label-sm">
                  Matricule : {agent.matricule}
                </span>

                <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm">
                  Corps : {agent.corps || "Non renseigné"}
                </span>

                <span className="px-2.5 py-1 rounded bg-surface-container-low text-on-surface-variant font-label-sm">
                  Situation : {agent.situation || "Non renseignée"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* NAVIGATION DES TROIS ONGLETS */}
        <div
          className="bg-surface-container-lowest rounded-xl border border-hairline mb-6 p-1 flex flex-wrap gap-1"
          role="tablist"
          aria-label="Sections du profil agent"
        >
          {(
            [
              ["profil", "person", "Mon profil"],
              ["documents", "folder_open", "Mes documents"],
              ["demandes", "description", "Demande d’actes"],
            ] as const
          ).map(([id, icone, libelle]) => (
            <button
              key={id}
              id={`profil-tab-${id}`}
              role="tab"
              aria-selected={onglet === id}
              aria-controls="profil-tab-panel"
              type="button"
              onClick={() => setOnglet(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-3 font-label-md text-label-md transition-colors ${
                onglet === id
                  ? "bg-primary text-on-primary font-semibold"
                  : "text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              <Icone nom={icone} className="text-lg" />
              {libelle}
            </button>
          ))}
        </div>

        <div
          id="profil-tab-panel"
          role="tabpanel"
          aria-labelledby={`profil-tab-${onglet}`}
          className="space-y-6"
        >

          {/* ================================================== */}
          {/* ONGLET 1 : MON PROFIL */}
          {/* ================================================== */}

          {onglet === "profil" && (
            <div className="space-y-6">

              {/* ÉTAT CIVIL ET COORDONNÉES */}
              <Bloc titre="État civil et coordonnées" icone="badge">
                <div className="space-y-8">

                  {/* Identification de l'agent */}
                  <section>
                    <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-3">
                      Identification de l’agent
                    </h3>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                      <Champ
                        label="Nom"
                        value={valeurChamp(
                          ["Nom", "Nom de famille"],
                          /^nom$/i
                        )}
                      />

                      <Champ
                        label="Prénoms"
                        value={valeurChamp(
                          ["Prénoms", "Prénom"],
                          /^prenoms?$/
                        )}
                      />

                      <Champ
                        label="Nom de jeune fille"
                        value={valeurChamp(
                          ["Nom de jeune fille"],
                          /nom.*jeune fille/
                        )}
                      />

                      <Champ
                        label="Sexe"
                        value={valeurChamp(
                          ["Sexe"],
                          /^sexe$/
                        )}
                      />

                      <Champ
                        label="Date de naissance"
                        value={valeurChamp(
                          ["Date de naissance"],
                          /^date.*naissance$/
                        )}
                      />

                      <Champ
                        label="Lieu de naissance"
                        value={valeurChamp(
                          ["Lieu de naissance"],
                          /^lieu.*naissance$/
                        )}
                      />
                    </dl>
                  </section>

                  {/* Situation matrimoniale */}
                  <section className="border-t border-hairline pt-6">
                    <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-3">
                      Situation matrimoniale
                    </h3>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                      <Champ
                        label="Statut matrimonial"
                        value={valeurChamp(
                          [
                            "Statut matrimonial",
                            "Situation matrimoniale",
                            "État matrimonial",
                          ],
                          /statut matrimonial|situation matrimoniale|etat matrimonial/
                        )}
                      />

                      <Champ
                        label="Date du mariage"
                        value={valeurChamp(
                          ["Date du mariage", "Date mariage"],
                          /date.*mariage/
                        )}
                      />
                    </dl>
                  </section>

                  {/* Pièces d'identité */}
                  <section className="border-t border-hairline pt-6">
                    <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-3">
                      Pièces d’identité
                    </h3>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                      <Champ
                        label="Numéro CNI"
                        value={valeurChamp(
                          [
                            "Numéro CNI",
                            "Numéro de CNI",
                            "N° CNI",
                            "Numéro de carte nationale d'identité",
                          ],
                          /numero.*cni|n°.*cni|carte nationale d identite/
                        )}
                      />
                    </dl>
                  </section>

                  {/* Coordonnées */}
                  <section className="border-t border-hairline pt-6">
                    <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-3">
                      Coordonnées
                    </h3>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                      <Champ
                        label="Adresse de résidence"
                        value={valeurChamp(
                          [
                            "Adresse de résidence",
                            "Adresse résidence",
                            "Adresse du domicile",
                            "Adresse personnelle",
                          ],
                          /adresse.*(residence|domicile|personnelle)/
                        )}
                      />

                      <Champ
                        label="Ville / commune"
                        value={valeurChamp(
                          ["Ville / commune", "Ville", "Commune"],
                          /^(ville|commune)$/
                        )}
                      />

                      <Champ
                        label="Téléphone principal"
                        value={valeurChamp(
                          [
                            "Téléphone principal",
                            "Téléphone",
                            "Numéro de téléphone",
                          ],
                          /telephone principal|numero de telephone|telephone portable/
                        )}
                      />

                      <Champ
                        label="Téléphone secondaire"
                        value={valeurChamp(
                          ["Téléphone secondaire", "Second téléphone"],
                          /telephone secondaire|second telephone/
                        )}
                      />

                      <Champ
                        label="Adresse e-mail"
                        value={valeurChamp(
                          ["Adresse e-mail", "Adresse email", "Courriel", "E-mail"],
                          /adresse.*email|courriel|^email$|^e mail$/
                        )}
                      />

                      <Champ
                        label="Personne à contacter en cas d'urgence"
                        value={valeurChamp(
                          [
                            "Personne à contacter en cas d'urgence",
                            "Contact d'urgence",
                            "Personne à contacter en cas d’urgence",
                          ],
                          /personne.*urgence|contact.*urgence/
                        )}
                      />
                    </dl>
                  </section>

                  {lignesEtatCivil.length === 0 && (
                    <p className="text-sm text-on-surface-variant">
                      Aucune donnée d’état civil n’est actuellement
                      fournie par le dossier. Les champs sont affichés
                      pour faciliter le contrôle des informations attendues.
                    </p>
                  )}
                </div>
              </Bloc>

              {/* SITUATION ADMINISTRATIVE */}
              <Bloc titre="Situation administrative" icone="account_tree">
                <div className="flex flex-wrap gap-3 mb-4">
                  <span className="px-3 py-2 rounded-lg bg-surface-container-low">
                    <span className="text-on-surface-variant text-sm">
                      Grade :{" "}
                    </span>
                    <strong>
                      {agent.grade || "Non renseigné"}
                    </strong>
                  </span>

                  <span className="px-3 py-2 rounded-lg bg-surface-container-low">
                    <span className="text-on-surface-variant text-sm">
                      Catégorie :{" "}
                    </span>
                    <strong>
                      {agent.categorie || "Non renseignée"}
                    </strong>
                  </span>

                  <span className="px-3 py-2 rounded-lg bg-surface-container-low">
                    <span className="text-on-surface-variant text-sm">
                      Structure :{" "}
                    </span>
                    <strong>
                      {agent.structure || "Non renseignée"}
                    </strong>
                  </span>
                </div>

                {lignesAdministrativesRestantes.length > 0 ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                    {lignesAdministrativesRestantes.map((ligne) => (
                      <Champ
                        key={ligne.libelle}
                        label={ligne.libelle}
                        value={ligne.valeur}
                      />
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    Aucune autre information administrative détaillée
                    n’est disponible.
                  </p>
                )}
              </Bloc>

              {/* PARCOURS ACADÉMIQUE */}
              <Bloc titre="Parcours académique" icone="school">
                <p className="text-sm text-on-surface-variant mb-3">
                  Niveau d’études, diplôme le plus élevé et domaine de
                  formation de l’agent.
                </p>

                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
                  <Champ
                    label="Niveau d’étude"
                    value={valeurAdmin(
                      /niveau.*(etude|academique)|^etude$/
                    )}
                  />

                  <Champ
                    label="Libellé du diplôme le plus élevé"
                    value={valeurAdmin(
                      /libelle.*diplome|diplome.*eleve|intitule.*diplome/
                    )}
                  />

                  <Champ
                    label="Domaine de formation"
                    value={valeurAdmin(
                      /domaine.*formation|specialite|filiere/
                    )}
                  />
                </dl>

                <p className="text-sm text-on-surface-variant mt-3">
                  Niveaux prévus : CEPE, BEPC, BAC, LICENCE, MASTER
                  et DOCTORAT.
                </p>
              </Bloc>

              {/* CONJOINT ET ENFANTS */}
              <Bloc titre="Liste du conjoint et des enfants" icone="family_restroom">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-2">
                  Conjoint
                </h3>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                  <Champ
                    label="Nom et prénoms du conjoint"
                    value={valeurAdmin(
                      /conjoint.*(nom|prenom)|nom.*conjoint|epoux|epouse/
                    )}
                  />

                  <Champ
                    label="Contacts du conjoint"
                    value={valeurAdmin(
                      /contact.*conjoint|conjoint.*contact|telephone.*conjoint/
                    )}
                  />
                </dl>

                <div className="mt-6">
                  <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-3">
                    Enfants à charge
                  </h3>

                  <div className="overflow-x-auto rounded-lg border border-hairline">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface-container-low text-on-surface-variant">
                        <tr>
                          <th className="px-3 py-3 font-semibold">
                            Nom et prénoms
                          </th>
                          <th className="px-3 py-3 font-semibold">
                            Sexe
                          </th>
                          <th className="px-3 py-3 font-semibold">
                            Date de naissance
                          </th>
                          <th className="px-3 py-3 font-semibold">
                            Lieu de naissance
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr>
                          <td
                            className="px-3 py-3 border-t border-hairline text-on-surface-variant"
                            colSpan={4}
                          >
                            Aucune liste d’enfants structurée n’est
                            disponible dans les données chargées.
                            Les informations pourront être affichées
                            lorsque l’API fournira les enfants du dossier.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </Bloc>
            </div>
          )}

          {/* ================================================== */}
          {/* ONGLET 2 : MES DOCUMENTS */}
          {/* ================================================== */}

          {onglet === "documents" && (
            <div className="space-y-6">
              <Bloc titre="Mes documents" icone="folder_open">
                <p className="text-sm text-on-surface-variant mb-4">
                  Consultez les pièces associées au dossier. Les
                  fonctionnalités de consultation et de téléchargement
                  dépendent de celles prises en charge par la liste
                  de pièces existante.
                </p>

                <OngletPieces agent={agent} />
              </Bloc>

              <Bloc titre="Ajouter une pièce (aperçu local)" icone="upload_file">
                <label
                  className="block font-label-md text-on-surface mb-2"
                  htmlFor="ajout-document"
                >
                  Sélectionner un document
                </label>

                <input
                  ref={inputFichier}
                  id="ajout-document"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  onChange={choisirFichier}
                  className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary"
                />

                {fichier && (
                  <div className="mt-3 rounded-lg bg-surface-container-low p-3">
                    <p className="font-semibold text-on-surface">
                      {fichier.name}
                    </p>

                    <p className="text-sm text-on-surface-variant">
                      {Math.ceil(fichier.size / 1024)} Ko · fichier
                      sélectionné localement
                    </p>

                    {apercu && fichier.type.startsWith("image/") && (
                      <img
                        src={apercu}
                        alt={`Aperçu de ${fichier.name}`}
                        className="mt-3 max-h-72 rounded-lg object-contain"
                      />
                    )}

                    {apercu && fichier.type === "application/pdf" && (
                      <a
                        href={apercu}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex mt-3 text-primary underline"
                      >
                        Prévisualiser le PDF
                      </a>
                    )}

                    <p className="text-sm text-on-surface-variant mt-2">
                      Ce fichier n’est pas encore téléversé ni enregistré
                      dans le dossier.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setFichier(null);
                        setApercu(null);

                        if (inputFichier.current) {
                          inputFichier.current.value = "";
                        }
                      }}
                      className="mt-3 text-sm text-primary underline"
                    >
                      Retirer le fichier
                    </button>
                  </div>
                )}
              </Bloc>
            </div>
          )}

          {/* ================================================== */}
          {/* ONGLET 3 : DEMANDE D'ACTES */}
          {/* ================================================== */}

          {onglet === "demandes" && (
            <Bloc titre="Demande d’actes administratifs" icone="description">
              <p className="text-sm text-on-surface-variant mb-5">
                Remplissez le formulaire ci-dessous. Dans cette version,
                la demande est préparée localement et n’est pas transmise
                à la DRH.
              </p>

              <form
                onSubmit={envoyerDemande}
                className="space-y-5 max-w-3xl"
              >
                <div>
                  <label
                    htmlFor="type-demande"
                    className="block font-label-md text-on-surface mb-2"
                  >
                    Type de demande
                  </label>

                  <select
                    id="type-demande"
                    value={typeDemande}
                    onChange={(event) => {
                      setTypeDemande(event.target.value);
                      setMessage("");
                    }}
                    className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
                  >
                    <option>Attestation de travail</option>
                    <option>Attestation de présence au poste</option>
                    <option>Permission spéciale d’absence</option>
                    <option>Autorisation spéciale d’absence</option>
                    <option>Permission</option>
                  </select>
                </div>

                {(typeDemande.toLowerCase().includes("absence") ||
                  typeDemande === "Permission") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="date-debut"
                        className="block font-label-md text-on-surface mb-2"
                      >
                        Date de début
                      </label>

                      <input
                        id="date-debut"
                        type="date"
                        value={dateDebut}
                        onChange={(event) => setDateDebut(event.target.value)}
                        required
                        className="w-full rounded-lg border border-outline-variant px-3 py-2 bg-surface-container-lowest text-on-surface"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="date-fin"
                        className="block font-label-md text-on-surface mb-2"
                      >
                        Date de fin
                      </label>

                      <input
                        id="date-fin"
                        type="date"
                        value={dateFin}
                        onChange={(event) => setDateFin(event.target.value)}
                        required
                        min={dateDebut || undefined}
                        className="w-full rounded-lg border border-outline-variant px-3 py-2 bg-surface-container-lowest text-on-surface"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="motif-demande"
                    className="block font-label-md text-on-surface mb-2"
                  >
                    Motif / précisions
                  </label>

                  <textarea
                    id="motif-demande"
                    rows={4}
                    value={motif}
                    onChange={(event) => setMotif(event.target.value)}
                    required
                    placeholder="Précisez l’objet de votre demande…"
                    className="w-full rounded-lg border border-outline-variant px-3 py-2 bg-surface-container-lowest text-on-surface"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-label-md text-on-primary"
                >
                  <Icone nom="send" />
                  Préparer la demande
                </button>

                {message && (
                  <p
                    role="status"
                    className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface"
                  >
                    {message}
                  </p>
                )}
              </form>
            </Bloc>
          )}
        </div>
      </div>
    </div>
  );
}
