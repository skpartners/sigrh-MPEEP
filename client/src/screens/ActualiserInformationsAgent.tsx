
import { useState, type FormEvent } from "react";
import { Icone } from "../ui/Icone";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";
const CARD =
  "bg-surface-container-lowest rounded-xl border border-hairline p-6";

type TypeChamp = "text" | "date" | "email" | "tel" | "select";

type ChampConfig = {
  name: string;
  label: string;
  type?: TypeChamp;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

type OngletConfig = {
  id: string;
  label: string;
  icon: string;
  description: string;
  fields: ChampConfig[];
};

type Enregistrement = {
  id: string;
  [key: string]: string;
};

const ONGLETS: OngletConfig[] = [
  {
    id: "identification",
    label: "Identification",
    icon: "person",
    description: "Informations personnelles et état civil.",
    fields: [
      { name: "nom", label: "Nom", required: true },
      { name: "prenoms", label: "Prénoms", required: true },
      { name: "nom_jeune_fille", label: "Nom de jeune fille" },
      {
        name: "sexe",
        label: "Sexe",
        type: "select",
        options: ["Masculin", "Féminin"],
        required: true,
      },
      {
        name: "date_naissance",
        label: "Date de naissance",
        type: "date",
      },
      { name: "lieu_naissance", label: "Lieu de naissance" },
    ],
  },
  {
    id: "matrimoniale",
    label: "Situation matrimoniale",
    icon: "heart",
    description: "Statut matrimonial et informations relatives au mariage.",
    fields: [
      {
        name: "statut_matrimonial",
        label: "Statut matrimonial",
        type: "select",
        options: ["Célibataire", "Marié(e)", "Veuf / Veuve", "Divorcé(e)"],
        required: true,
      },
      {
        name: "date_mariage",
        label: "Date du mariage",
        type: "date",
      },
      { name: "nom_conjoint", label: "Nom et prénoms du conjoint" },
      {
        name: "telephone_conjoint",
        label: "Téléphone du conjoint",
        type: "tel",
      },
    ],
  },
  {
    id: "identite",
    label: "Pièces d'identité",
    icon: "id-card",
    description: "Références des pièces d'identité.",
    fields: [
      {
        name: "type_piece",
        label: "Type de pièce",
        type: "select",
        options: ["CNI", "Passeport", "Autre"],
        required: true,
      },
      {
        name: "numero_piece",
        label: "Numéro de pièce",
        required: true,
      },
      {
        name: "date_delivrance",
        label: "Date de délivrance",
        type: "date",
      },
      {
        name: "date_expiration",
        label: "Date d'expiration",
        type: "date",
      },
      {
        name: "lieu_delivrance",
        label: "Lieu de délivrance",
      },
    ],
  },
  {
    id: "coordonnees",
    label: "Coordonnées",
    icon: "contact",
    description: "Adresse de résidence et moyens de contact.",
    fields: [
      {
        name: "adresse",
        label: "Adresse de résidence",
        required: true,
      },
      { name: "ville", label: "Ville", required: true },
      { name: "commune", label: "Commune" },
      {
        name: "telephone_principal",
        label: "Téléphone principal",
        type: "tel",
        required: true,
      },
      {
        name: "telephone_secondaire",
        label: "Téléphone secondaire",
        type: "tel",
      },
      {
        name: "email",
        label: "Adresse e-mail",
        type: "email",
        required: true,
      },
      {
        name: "contact_urgence",
        label: "Nom de la personne à contacter en cas d'urgence",
      },
      {
        name: "telephone_urgence",
        label: "Téléphone du contact d'urgence",
        type: "tel",
      },
    ],
  },
  {
    id: "academique",
    label: "Parcours académique",
    icon: "school",
    description: "Diplômes, spécialités et formations obtenus.",
    fields: [
      {
        name: "diplome",
        label: "Intitulé du diplôme",
        required: true,
      },
      {
        name: "niveau",
        label: "Niveau d'études",
        type: "select",
        options: [
          "CEPE",
          "BEPC",
          "BAC",
          "BTS",
          "LICENCE",
          "MASTER",
          "DOCTORAT",
          "Autre",
        ],
        required: true,
      },
      { name: "domaine", label: "Domaine de formation" },
      { name: "specialite", label: "Spécialité" },
      { name: "etablissement", label: "Établissement" },
      {
        name: "annee_obtention",
        label: "Année d'obtention",
        placeholder: "Ex. : 2024",
      },
    ],
  },
  {
    id: "famille",
    label: "Conjoint et enfants",
    icon: "users",
    description: "Informations relatives aux membres de la famille.",
    fields: [
      {
        name: "lien_parente",
        label: "Lien de parenté",
        type: "select",
        options: ["Conjoint(e)", "Enfant"],
        required: true,
      },
      { name: "nom", label: "Nom", required: true },
      { name: "prenoms", label: "Prénoms", required: true },
      {
        name: "sexe",
        label: "Sexe",
        type: "select",
        options: ["Masculin", "Féminin"],
      },
      {
        name: "date_naissance",
        label: "Date de naissance",
        type: "date",
      },
      { name: "lieu_naissance", label: "Lieu de naissance" },
      {
        name: "telephone",
        label: "Téléphone",
        type: "tel",
      },
    ],
  },
];

const VALEURS_VIDES = (onglet: OngletConfig) =>
  Object.fromEntries(onglet.fields.map((field) => [field.name, ""])) as Record<
    string,
    string
  >;

export function ActualiserInformationsAgent() {
  const [ongletActif, setOngletActif] = useState("identification");

  const [donnees, setDonnees] = useState<
    Record<string, Enregistrement[]>
  >({});

  const [formulaire, setFormulaire] = useState<Record<string, string>>({});
  const [idEdition, setIdEdition] = useState<string | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [message, setMessage] = useState("");

  const configuration = ONGLETS.find(
    (onglet) => onglet.id === ongletActif
  )!;

  const enregistrements = donnees[ongletActif] ?? [];

  const enregistrementsFiltres = enregistrements.filter((item) =>
    configuration.fields.some((field) =>
      (item[field.name] ?? "")
        .toLowerCase()
        .includes(recherche.toLowerCase())
    )
  );

  function ouvrirCreation() {
    setFormulaire(VALEURS_VIDES(configuration));
    setIdEdition(null);
    setFormulaireOuvert(true);
    setMessage("");
  }

  function ouvrirModification(item: Enregistrement) {
    const valeurs = VALEURS_VIDES(configuration);

    configuration.fields.forEach((field) => {
      valeurs[field.name] = item[field.name] ?? "";
    });

    setFormulaire(valeurs);
    setIdEdition(item.id);
    setFormulaireOuvert(true);
    setMessage("");
  }

  function changerOnglet(id: string) {
    setOngletActif(id);
    setFormulaireOuvert(false);
    setIdEdition(null);
    setRecherche("");
    setMessage("");
  }

  function enregistrer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const enregistrement: Enregistrement = {
      ...formulaire,
      id: idEdition ?? crypto.randomUUID(),
    };

    setDonnees((precedentes) => {
      const liste = precedentes[ongletActif] ?? [];

      const nouvelleListe = idEdition
        ? liste.map((item) =>
            item.id === idEdition ? enregistrement : item
          )
        : [...liste, enregistrement];

      return {
        ...precedentes,
        [ongletActif]: nouvelleListe,
      };
    });

    setFormulaireOuvert(false);
    setIdEdition(null);
    setMessage(
      idEdition
        ? "Modification prise en compte dans l'interface."
        : "Enregistrement ajouté à la liste affichée."
    );
  }

  function supprimer(item: Enregistrement) {
    const nom =
      item.nom ||
      item.diplome ||
      item.numero_piece ||
      item.adresse ||
      "cet enregistrement";

    if (
      !window.confirm(
        `Voulez-vous vraiment supprimer « ${nom} » de cette liste ?`
      )
    ) {
      return;
    }

    setDonnees((precedentes) => ({
      ...precedentes,
      [ongletActif]: (precedentes[ongletActif] ?? []).filter(
        (element) => element.id !== item.id
      ),
    }));

    setMessage("Enregistrement supprimé de la liste affichée.");
  }

  function libelleEnregistrement(item: Enregistrement): string {
    return (
      [item.nom, item.prenoms].filter(Boolean).join(" ") ||
      item.diplome ||
      item.numero_piece ||
      item.adresse ||
      item.statut_matrimonial ||
      item.type_piece ||
      "Enregistrement sans intitulé"
    );
  }

  return (
    <main className={PAGE}>
      {/* En-tête */}
      <header className={`${CARD} mb-6`}>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
            <Icone nom="user-round-pen" className="text-3xl" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-label-sm text-on-surface-variant">
              Espace personnel de l'agent
            </p>
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold">
              Actualiser mes informations
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2">
              Consultez et gérez les informations de votre dossier
              personnel par rubrique.
            </p>
          </div>
        </div>
      </header>

      {/* Avertissement sur le mode de fonctionnement */}
      <div className="rounded-xl border border-outline-variant p-4 mb-6 flex items-start gap-3">
        <Icone nom="info" className="text-primary text-xl mt-0.5" />
        <p className="text-sm text-on-surface-variant">
          Mode démonstration : les modifications sont conservées
          uniquement dans l'état de la page. Elles ne sont pas encore
          enregistrées dans la base de données Django.
        </p>
      </div>

      {/* Navigation des rubriques */}
      <div className={`${CARD} mb-6`}>
        <h2 className="font-title-md text-title-md text-on-surface font-semibold mb-4">
          Rubriques du dossier
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ONGLETS.map((onglet) => {
            const actif = ongletActif === onglet.id;
            const nombre = (donnees[onglet.id] ?? []).length;

            return (
              <button
                key={onglet.id}
                type="button"
                onClick={() => changerOnglet(onglet.id)}
                aria-pressed={actif}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  actif
                    ? "border-primary bg-primary-container text-on-primary-container"
                    : "border-hairline hover:bg-surface-container-low text-on-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Icone nom={onglet.icon} className="text-xl" />
                  <span className="text-xs rounded-full px-2 py-1 bg-surface-container-low">
                    {nombre}
                  </span>
                </div>

                <p className="font-semibold mt-3">{onglet.label}</p>
                <p className="text-sm mt-1 opacity-80">
                  {onglet.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenu CRUD de la rubrique sélectionnée */}
      <section className={CARD}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
              {configuration.label}
            </h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {configuration.description}
            </p>
          </div>

          <button
            type="button"
            onClick={ouvrirCreation}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-on-primary font-semibold"
          >
            <Icone nom="plus" />
            Ajouter
          </button>
        </div>

        {message && (
          <div
            role="status"
            className="rounded-lg bg-surface-container-low p-3 mb-5 text-sm text-on-surface"
          >
            {message}
          </div>
        )}

        {/* Formulaire de création ou de modification */}
        {formulaireOuvert && (
          <form
            onSubmit={enregistrer}
            className="rounded-xl border border-outline-variant p-4 sm:p-6 mb-6"
          >
            <h3 className="font-title-md text-title-md text-on-surface font-semibold mb-5">
              {idEdition
                ? "Modifier l'enregistrement"
                : "Nouvel enregistrement"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {configuration.fields.map((field) => (
                <div key={field.name} className="min-w-0">
                  <label
                    htmlFor={`champ-${ongletActif}-${field.name}`}
                    className="block text-sm font-medium text-on-surface mb-2"
                  >
                    {field.label}
                    {field.required && (
                      <span className="text-error"> *</span>
                    )}
                  </label>

                  {field.type === "select" ? (
                    <select
                      id={`champ-${ongletActif}-${field.name}`}
                      value={formulaire[field.name] ?? ""}
                      onChange={(event) =>
                        setFormulaire((precedent) => ({
                          ...precedent,
                          [field.name]: event.target.value,
                        }))
                      }
                      required={field.required}
                      className="w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface"
                    >
                      <option value="">Sélectionner</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`champ-${ongletActif}-${field.name}`}
                      type={field.type ?? "text"}
                      value={formulaire[field.name] ?? ""}
                      onChange={(event) =>
                        setFormulaire((precedent) => ({
                          ...precedent,
                          [field.name]: event.target.value,
                        }))
                      }
                      required={field.required}
                      placeholder={field.placeholder ?? field.label}
                      className="w-full min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-on-primary font-semibold"
              >
                <Icone nom="check" />
                {idEdition ? "Enregistrer les modifications" : "Créer"}
              </button>

              <button
                type="button"
                onClick={() => setFormulaireOuvert(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-4 py-2.5 text-on-surface"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {/* Recherche */}
        <div className="mb-5">
          <label
            htmlFor="recherche-informations"
            className="block text-sm font-medium text-on-surface mb-2"
          >
            Rechercher dans cette rubrique
          </label>

          <div className="relative">
            <Icone
              nom="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              id="recherche-informations"
              type="search"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Saisir un nom, un diplôme, une adresse..."
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-10 pr-3 py-2.5 text-on-surface"
            />
          </div>
        </div>

        {/* Liste des enregistrements */}
        {enregistrementsFiltres.length > 0 ? (
          <div className="space-y-4">
            {enregistrementsFiltres.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-hairline p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-on-surface break-words">
                      {libelleEnregistrement(item)}
                    </h3>

                    <p className="text-xs text-on-surface-variant mt-1">
                      Rubrique : {configuration.label}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => ouvrirModification(item)}
                      className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm text-on-surface hover:bg-surface-container-low"
                    >
                      <Icone nom="pencil" />
                      Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() => supprimer(item)}
                      className="inline-flex items-center gap-2 rounded-lg border border-error px-3 py-2 text-sm text-error hover:bg-surface-container-low"
                    >
                      <Icone nom="trash-2" />
                      Supprimer
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 mt-3">
                  {configuration.fields.map((field) => (
                    <Champ
                      key={field.name}
                      label={field.label}
                      value={item[field.name]}
                    />
                  ))}
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-outline-variant p-8 text-center">
            <div className="flex justify-center mb-3">
              <Icone
                nom="folder-open"
                className="text-3xl text-on-surface-variant"
              />
            </div>

            <h3 className="font-semibold text-on-surface">
              {recherche
                ? "Aucun résultat"
                : "Aucune information enregistrée"}
            </h3>

            <p className="text-sm text-on-surface-variant mt-2">
              {recherche
                ? "Modifiez votre recherche ou vérifiez l'orthographe."
                : "Utilisez le bouton Ajouter pour créer un enregistrement dans cette rubrique."}
            </p>

            {!recherche && (
              <button
                type="button"
                onClick={ouvrirCreation}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-on-primary font-semibold"
              >
                <Icone nom="plus" />
                Ajouter une information
              </button>
            )}
          </div>
        )}
      </section>

      <p className="text-xs text-on-surface-variant mt-4">
        Les modifications affichées ici ne remplacent pas les données
        officielles du dossier tant que l'enregistrement côté serveur
        et les contrôles de la DRH ne sont pas configurés.
      </p>
    </main>
  );
}

function Champ({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="py-3 border-b border-hairline min-w-0">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-medium text-on-surface break-words">
        {value?.trim() ? value : "Non renseigné"}
      </dd>
    </div>
  );
}
