
import { useMemo, useState } from "react";

type ModeGestion = "agent" | "rh";

type Enfant = {
  id: number;
  nom: string;
  prenoms: string;
  sexe: string;
  dateNaissance: string;
  lieuNaissance: string;
  valide: boolean;
};

type Agent = {
  id: number;
  matricule: string;
  nom: string;
  prenoms: string;
  email: string;
  telephone: string;
  fonction: string;
  service: string;
  statut: string;
  valide: boolean;
  details: Record<string, string>;
  enfants: Enfant[];
};

type Props = {
  mode: ModeGestion;
  matricule?: string;
};

const champs = [
  {
    titre: "État civil",
    champs: [
      ["nom", "Nom"],
      ["prenoms", "Prénoms"],
      ["nomJeuneFille", "Nom de jeune fille"],
      ["sexe", "Sexe"],
      ["dateNaissance", "Date de naissance"],
      ["lieuNaissance", "Lieu de naissance"],
      ["nationalite", "Nationalité"],
      ["situationMatrimoniale", "Situation matrimoniale"],
    ],
  },
  {
    titre: "Coordonnées",
    champs: [
      ["telephone", "Téléphone"],
      ["telephoneSecondaire", "Téléphone secondaire"],
      ["email", "Adresse e-mail"],
      ["adresse", "Adresse"],
      ["commune", "Commune"],
      ["personneUrgence", "Personne à contacter en urgence"],
      ["telephoneUrgence", "Téléphone d'urgence"],
    ],
  },
  {
    titre: "Pièce d'identité",
    champs: [
      ["typePiece", "Type de pièce"],
      ["numeroPiece", "Numéro de pièce"],
      ["lieuDelivrance", "Lieu de délivrance"],
      ["dateDelivrance", "Date de délivrance"],
      ["dateExpiration", "Date d'expiration"],
    ],
  },
  {
    titre: "Situation administrative",
    champs: [
      ["matricule", "Matricule"],
      ["typeAgent", "Type d'agent"],
      ["emploi", "Emploi ou corps"],
      ["categorie", "Catégorie"],
      ["grade", "Grade"],
      ["datePriseService", "Date de prise de service"],
      ["dateEntreeAdministration", "Date d'entrée dans l'administration"],
      ["modeAffectation", "Mode d'affectation"],
      ["structure", "Structure"],
      ["direction", "Direction"],
      ["sousDirection", "Sous-direction"],
      ["service", "Service"],
      ["fonction", "Fonction"],
      ["communeTravail", "Commune de travail"],
      ["positionAdministrative", "Position administrative"],
      ["dateNomination", "Date de nomination"],
    ],
  },
  {
    titre: "Formation et diplômes",
    champs: [
      ["niveauEtude", "Niveau d'études"],
      ["diplome", "Diplôme le plus élevé"],
      ["domaineFormation", "Domaine de formation"],
      ["specialite", "Spécialité"],
      ["etablissement", "Établissement"],
      ["anneeObtention", "Année d'obtention"],
    ],
  },
] as const;

const detailsInit = (): Record<string, string> => ({
  nom: "KOUASSI",
  prenoms: "Jean Michel",
  nomJeuneFille: "",
  sexe: "Masculin",
  dateNaissance: "1990-05-15",
  lieuNaissance: "Abidjan",
  nationalite: "Ivoirienne",
  situationMatrimoniale: "Marié(e)",
  telephone: "0700000000",
  telephoneSecondaire: "",
  email: "agent.demo@example.com",
  adresse: "Cocody",
  commune: "Cocody",
  personneUrgence: "KOUASSI Marie",
  telephoneUrgence: "0500000000",
  typePiece: "CNI",
  numeroPiece: "CI-DEMO-001",
  lieuDelivrance: "Abidjan",
  dateDelivrance: "2024-01-10",
  dateExpiration: "2034-01-10",
  matricule: "AG-001",
  typeAgent: "Fonctionnaire",
  emploi: "Administrateur",
  categorie: "A",
  grade: "A3",
  datePriseService: "2020-01-06",
  dateEntreeAdministration: "2020-01-06",
  modeAffectation: "Affectation",
  structure: "Ministère du Portefeuille de l'État",
  direction: "Direction des Ressources Humaines",
  sousDirection: "Gestion administrative",
  service: "Gestion des agents",
  fonction: "Chargé d'études",
  communeTravail: "Abidjan",
  positionAdministrative: "En activité",
  dateNomination: "",
  niveauEtude: "MASTER",
  diplome: "Master en gestion",
  domaineFormation: "Administration",
  specialite: "Gestion des ressources humaines",
  etablissement: "Université de démonstration",
  anneeObtention: "2018",
});

const creerAgent = (id: number, matricule: string, nom: string, prenoms: string): Agent => {
  const details = detailsInit();
  details.nom = nom;
  details.prenoms = prenoms;
  details.matricule = matricule;

  return {
    id,
    matricule,
    nom,
    prenoms,
    email: `${matricule.toLowerCase()}@example.com`,
    telephone: "0700000000",
    fonction: "Chargé d'études",
    service: "Gestion des agents",
    statut: "Brouillon",
    valide: false,
    details,
    enfants: [
      {
        id: id * 100 + 1,
        nom,
        prenoms: "Enfant de démonstration",
        sexe: "Féminin",
        dateNaissance: "2018-06-12",
        lieuNaissance: "Abidjan",
        valide: false,
      },
    ],
  };
};

const donneesInitiales: Agent[] = [
  creerAgent(1, "AG-001", "KOUASSI", "Jean Michel"),
  creerAgent(2, "AG-002", "TRAORÉ", "Aminata"),
  creerAgent(3, "AG-003", "YAO", "Patrick"),
];

const CARD =
  "rounded-xl border border-hairline bg-surface-container-lowest p-5 sm:p-6";
const LABEL = "mb-1.5 block text-sm font-medium text-on-surface";
const INPUT =
  "w-full rounded-lg border border-hairline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const PRIMARY =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-lg border border-hairline px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-low";
const DANGER =
  "inline-flex items-center justify-center rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50";

export function GestionDossiersAgents({ mode, matricule }: Props) {
  const [agents, setAgents] = useState<Agent[]>(donneesInitiales);
  const [recherche, setRecherche] = useState("");
  const [selectionId, setSelectionId] = useState<number | null>(
    mode === "agent" ? 1 : null,
  );
  const [onglet, setOnglet] = useState<"informations" | "famille">(
    "informations",
  );
  const [message, setMessage] = useState("");
  const [erreur, setErreur] = useState("");
  const [enfantEnEdition, setEnfantEnEdition] = useState<number | null>(null);
  const [formEnfant, setFormEnfant] = useState<Omit<Enfant, "id" | "valide">>({
    nom: "",
    prenoms: "",
    sexe: "Féminin",
    dateNaissance: "",
    lieuNaissance: "",
  });

  const agentsVisibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();

    return agents.filter((agent) => {
      const autorise =
        mode === "rh" || agent.matricule === (matricule || "AG-001");

      const correspond =
        !terme ||
        `${agent.nom} ${agent.prenoms} ${agent.matricule} ${agent.service}`
          .toLowerCase()
          .includes(terme);

      return autorise && correspond;
    });
  }, [agents, mode, matricule, recherche]);

  const agentActuel =
    agents.find((agent) => agent.id === selectionId) ??
    (mode === "agent"
      ? agents.find((agent) => agent.matricule === (matricule || "AG-001"))
      : undefined);

  function afficherMessage(texte: string) {
    setMessage(texte);
    setErreur("");
  }

  function modifierAgent(champ: string, valeur: string) {
    if (!agentActuel) return;

    setAgents((precedents) =>
      precedents.map((agent) => {
        if (agent.id !== agentActuel.id) return agent;

        const details = { ...agent.details, [champ]: valeur };

        return {
          ...agent,
          details,
          nom: details.nom || "",
          prenoms: details.prenoms || "",
          matricule: details.matricule || "",
          email: details.email || "",
          telephone: details.telephone || "",
          fonction: details.fonction || "",
          service: details.service || "",
          valide: false,
          statut: "Modifications en cours",
        };
      }),
    );
    setMessage("");
  }

  function ajouterAgent() {
    const numero = Math.max(0, ...agents.map((agent) => agent.id)) + 1;
    const nouveauMatricule = `AG-${String(numero).padStart(3, "0")}`;
    const nouveau = creerAgent(numero, nouveauMatricule, "", "");

    nouveau.details = {
      ...nouveau.details,
      nom: "",
      prenoms: "",
      matricule: nouveauMatricule,
      email: "",
      telephone: "",
    };
    nouveau.nom = "";
    nouveau.prenoms = "";
    nouveau.email = "";
    nouveau.telephone = "";
    nouveau.statut = "Brouillon";

    setAgents((precedents) => [...precedents, nouveau]);
    setSelectionId(nouveau.id);
    setOnglet("informations");
    afficherMessage("Nouveau dossier de démonstration créé.");
  }

  function supprimerAgent(agent: Agent) {
    const confirmation = window.confirm(
      `Supprimer le dossier de ${agent.prenoms} ${agent.nom} (${agent.matricule}) ?`,
    );
    if (!confirmation) return;

    setAgents((precedents) =>
      precedents.filter((item) => item.id !== agent.id),
    );
    setSelectionId(null);
    afficherMessage("Dossier supprimé de la démonstration.");
  }

  function validerDossier() {
    if (!agentActuel) return;

    const nom = agentActuel.details.nom?.trim();
    const prenoms = agentActuel.details.prenoms?.trim();

    if (!nom || !prenoms) {
      setErreur("Veuillez renseigner au minimum le nom et les prénoms.");
      setMessage("");
      return;
    }

    setAgents((precedents) =>
      precedents.map((agent) =>
        agent.id === agentActuel.id
          ? { ...agent, valide: true, statut: "Validé" }
          : agent,
      ),
    );
    afficherMessage("Dossier marqué comme validé dans cette démonstration.");
  }

  function enregistrerEnfant() {
    if (!agentActuel) return;

    if (
      !formEnfant.nom.trim() ||
      !formEnfant.prenoms.trim() ||
      !formEnfant.dateNaissance
    ) {
      setErreur("Renseignez le nom, les prénoms et la date de naissance de l'enfant.");
      setMessage("");
      return;
    }

    setAgents((precedents) =>
      precedents.map((agent) => {
        if (agent.id !== agentActuel.id) return agent;

        if (enfantEnEdition !== null) {
          return {
            ...agent,
            enfants: agent.enfants.map((enfant) =>
              enfant.id === enfantEnEdition
                ? { ...enfant, ...formEnfant, valide: false }
                : enfant,
            ),
          };
        }

        const nouvelEnfant: Enfant = {
          id: Date.now(),
          ...formEnfant,
          valide: false,
        };

        return { ...agent, enfants: [...agent.enfants, nouvelEnfant] };
      }),
    );

    setEnfantEnEdition(null);
    setFormEnfant({
      nom: "",
      prenoms: "",
      sexe: "Féminin",
      dateNaissance: "",
      lieuNaissance: "",
    });
    afficherMessage("Informations de l'enfant enregistrées dans la démonstration.");
  }

  function commencerModificationEnfant(enfant: Enfant) {
    setEnfantEnEdition(enfant.id);
    setFormEnfant({
      nom: enfant.nom,
      prenoms: enfant.prenoms,
      sexe: enfant.sexe,
      dateNaissance: enfant.dateNaissance,
      lieuNaissance: enfant.lieuNaissance,
    });
    setMessage("");
    setErreur("");
  }

  function supprimerEnfant(enfantId: number) {
    if (!agentActuel) return;
    if (!window.confirm("Supprimer cet enfant du dossier de démonstration ?")) {
      return;
    }

    setAgents((precedents) =>
      precedents.map((agent) =>
        agent.id === agentActuel.id
          ? {
              ...agent,
              enfants: agent.enfants.filter((enfant) => enfant.id !== enfantId),
            }
          : agent,
      ),
    );
    afficherMessage("Enfant supprimé de la démonstration.");
  }

  function validerEnfant(enfantId: number) {
    if (!agentActuel) return;

    setAgents((precedents) =>
      precedents.map((agent) =>
        agent.id === agentActuel.id
          ? {
              ...agent,
              enfants: agent.enfants.map((enfant) =>
                enfant.id === enfantId
                  ? { ...enfant, valide: true }
                  : enfant,
              ),
            }
          : agent,
      ),
    );
    afficherMessage("Informations de l'enfant marquées comme validées.");
  }

  return (
    <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-1 text-sm text-on-surface-variant">
            SIGRH / Gestion des dossiers
          </p>
          <h1 className="text-2xl font-bold text-on-surface sm:text-3xl">
            {mode === "agent"
              ? "Actualiser mes informations"
              : "Actualisation des informations des agents"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
            {mode === "agent"
              ? "Consultez et mettez à jour les informations de votre dossier administratif."
              : "Recherchez les agents et gérez leurs dossiers administratifs dans cette interface de démonstration."}
          </p>
        </div>

        {mode === "rh" && (
          <button type="button" className={PRIMARY} onClick={ajouterAgent}>
            + Ajouter un agent
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={CARD}>
          <p className="text-sm text-on-surface-variant">Dossiers affichés</p>
          <p className="mt-2 text-2xl font-bold text-on-surface">
            {agentsVisibles.length}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-sm text-on-surface-variant">Dossiers validés</p>
          <p className="mt-2 text-2xl font-bold text-on-surface">
            {agentsVisibles.filter((agent) => agent.valide).length}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-sm text-on-surface-variant">En attente ou en cours</p>
          <p className="mt-2 text-2xl font-bold text-on-surface">
            {agentsVisibles.filter((agent) => !agent.valide).length}
          </p>
        </div>
      </div>

      {message && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </div>
      )}

      {erreur && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {erreur}
        </div>
      )}

      <div
        className={
          mode === "rh"
            ? "grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]"
            : "grid grid-cols-1 items-start gap-6"
        }
      >
        {mode === "rh" && (
          <aside className={`${CARD} xl:sticky xl:top-6`}>
            <label className={LABEL} htmlFor="recherche-agent">
              Rechercher un agent
            </label>
            <input
              id="recherche-agent"
              className={INPUT}
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Nom, matricule, service..."
            />

            <div className="mt-4 flex items-center justify-between">
              <h2 className="font-semibold text-on-surface">Liste des agents</h2>
              <span className="text-xs text-on-surface-variant">
                {agentsVisibles.length} résultat(s)
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {agentsVisibles.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelectionId(agent.id);
                    setOnglet("informations");
                    setMessage("");
                    setErreur("");
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectionId === agent.id
                      ? "border-primary bg-primary/5"
                      : "border-hairline hover:bg-surface-container-low"
                  }`}
                >
                  <span className="block font-semibold text-on-surface">
                    {agent.prenoms || "Prénoms non renseignés"}{" "}
                    {agent.nom || "Nom non renseigné"}
                  </span>
                  <span className="mt-1 block text-xs text-on-surface-variant">
                    {agent.matricule}
                  </span>
                  <span className="mt-2 inline-block rounded-full bg-surface-container-low px-2 py-1 text-xs text-on-surface-variant">
                    {agent.statut}
                  </span>
                </button>
              ))}

              {agentsVisibles.length === 0 && (
                <p className="py-5 text-sm text-on-surface-variant">
                  Aucun agent ne correspond à la recherche.
                </p>
              )}
            </div>
          </aside>
        )}

        <section className="min-w-0 space-y-6">
          {!agentActuel ? (
            <div className={CARD}>
              <h2 className="text-lg font-semibold text-on-surface">
                Aucun dossier sélectionné
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                {mode === "rh"
                  ? "Sélectionnez un agent dans la liste ou créez un nouveau dossier."
                  : "Votre dossier de démonstration n'est pas disponible."}
              </p>
              {mode === "rh" && (
                <button
                  type="button"
                  className={`${PRIMARY} mt-4`}
                  onClick={ajouterAgent}
                >
                  + Créer un dossier
                </button>
              )}
            </div>
          ) : (
            <>
              <div className={CARD}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {(agentActuel.prenoms[0] || "A").toUpperCase()}
                      {(agentActuel.nom[0] || "").toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-on-surface">
                        {agentActuel.prenoms || "Prénoms non renseignés"}{" "}
                        {agentActuel.nom || "Nom non renseigné"}
                      </h2>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        Matricule : {agentActuel.matricule}
                      </p>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        {agentActuel.fonction} · {agentActuel.service}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
                      agentActuel.valide
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {agentActuel.valide
                      ? "Dossier validé"
                      : agentActuel.statut}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-hairline pb-3">
                <button
                  type="button"
                  className={
                    onglet === "informations"
                      ? PRIMARY
                      : SECONDARY
                  }
                  onClick={() => setOnglet("informations")}
                >
                  Informations personnelles
                </button>
                <button
                  type="button"
                  className={onglet === "famille" ? PRIMARY : SECONDARY}
                  onClick={() => setOnglet("famille")}
                >
                  Situation familiale ({agentActuel.enfants.length})
                </button>
              </div>

              {onglet === "informations" && (
                <>
                  {champs.map((section) => (
                    <section className={CARD} key={section.titre}>
                      <h2 className="mb-5 text-lg font-bold text-on-surface">
                        {section.titre}
                      </h2>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {section.champs.map(([cle, libelle]) => {
                          const valeur =
                            agentActuel.details[cle] ?? "";

                          return (
                            <div key={cle}>
                              <label className={LABEL} htmlFor={`champ-${cle}`}>
                                {libelle}
                              </label>

                              {cle === "sexe" ||
                              cle === "situationMatrimoniale" ||
                              cle === "typePiece" ||
                              cle === "typeAgent" ||
                              cle === "categorie" ||
                              cle === "modeAffectation" ||
                              cle === "positionAdministrative" ||
                              cle === "niveauEtude" ? (
                                <select
                                  id={`champ-${cle}`}
                                  className={INPUT}
                                  value={valeur}
                                  onChange={(event) =>
                                    modifierAgent(cle, event.target.value)
                                  }
                                >
                                  {(cle === "sexe"
                                    ? ["Masculin", "Féminin", "Autre"]
                                    : cle === "situationMatrimoniale"
                                      ? ["Célibataire", "Marié(e)", "Divorcé(e)", "Veuf/Veuve"]
                                      : cle === "typePiece"
                                        ? ["CNI", "Passeport", "Autre"]
                                        : cle === "typeAgent"
                                          ? ["Fonctionnaire", "Agent contractuel", "Autre"]
                                          : cle === "categorie"
                                            ? ["A", "B", "C", "D"]
                                            : cle === "modeAffectation"
                                              ? ["Affectation", "Mise à disposition", "Redéploiement"]
                                              : cle === "positionAdministrative"
                                                ? ["En activité", "Détachement avec acte", "Détachement sans acte", "Disponibilité", "Sous les drapeaux"]
                                                : ["CEPE", "BEPC", "BAC", "LICENCE", "MASTER", "DOCTORAT"]
                                  ).map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  id={`champ-${cle}`}
                                  className={INPUT}
                                  type={
                                    cle.toLowerCase().includes("date")
                                      ? "date"
                                      : cle === "email"
                                        ? "email"
                                        : "text"
                                  }
                                  value={valeur}
                                  onChange={(event) =>
                                    modifierAgent(cle, event.target.value)
                                  }
                                  placeholder={libelle}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  <section className={CARD}>
                    <h2 className="mb-4 text-lg font-bold text-on-surface">
                      Actions sur le dossier
                    </h2>
                    <p className="mb-4 text-sm text-on-surface-variant">
                      Les actions ci-dessous sont simulées localement. La
                      validation ne constitue pas une validation administrative
                      officielle.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={() =>
                          afficherMessage(
                            "Les modifications sont conservées dans l'état React de cette démonstration.",
                          )
                        }
                      >
                        Enregistrer les modifications
                      </button>
                      <button
                        type="button"
                        className={SECONDARY}
                        onClick={validerDossier}
                      >
                        Valider le dossier
                      </button>
                      <button
                        type="button"
                        className={DANGER}
                        onClick={() => supprimerAgent(agentActuel)}
                      >
                        Supprimer le dossier
                      </button>
                    </div>
                  </section>
                </>
              )}

              {onglet === "famille" && (
                <>
                  <section className={CARD}>
                    <h2 className="mb-4 text-lg font-bold text-on-surface">
                      Ajouter ou modifier un enfant
                    </h2>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={LABEL} htmlFor="enfant-nom">
                          Nom
                        </label>
                        <input
                          id="enfant-nom"
                          className={INPUT}
                          value={formEnfant.nom}
                          onChange={(event) =>
                            setFormEnfant({
                              ...formEnfant,
                              nom: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className={LABEL} htmlFor="enfant-prenoms">
                          Prénoms
                        </label>
                        <input
                          id="enfant-prenoms"
                          className={INPUT}
                          value={formEnfant.prenoms}
                          onChange={(event) =>
                            setFormEnfant({
                              ...formEnfant,
                              prenoms: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className={LABEL} htmlFor="enfant-sexe">
                          Sexe
                        </label>
                        <select
                          id="enfant-sexe"
                          className={INPUT}
                          value={formEnfant.sexe}
                          onChange={(event) =>
                            setFormEnfant({
                              ...formEnfant,
                              sexe: event.target.value,
                            })
                          }
                        >
                          <option>Féminin</option>
                          <option>Masculin</option>
                          <option>Autre</option>
                        </select>
                      </div>

                      <div>
                        <label className={LABEL} htmlFor="enfant-date">
                          Date de naissance
                        </label>
                        <input
                          id="enfant-date"
                          type="date"
                          className={INPUT}
                          value={formEnfant.dateNaissance}
                          onChange={(event) =>
                            setFormEnfant({
                              ...formEnfant,
                              dateNaissance: event.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className={LABEL} htmlFor="enfant-lieu">
                          Lieu de naissance
                        </label>
                        <input
                          id="enfant-lieu"
                          className={INPUT}
                          value={formEnfant.lieuNaissance}
                          onChange={(event) =>
                            setFormEnfant({
                              ...formEnfant,
                              lieuNaissance: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className={PRIMARY}
                        onClick={enregistrerEnfant}
                      >
                        {enfantEnEdition !== null
                          ? "Enregistrer la modification"
                          : "Ajouter l'enfant"}
                      </button>
                      {enfantEnEdition !== null && (
                        <button
                          type="button"
                          className={SECONDARY}
                          onClick={() => {
                            setEnfantEnEdition(null);
                            setFormEnfant({
                              nom: "",
                              prenoms: "",
                              sexe: "Féminin",
                              dateNaissance: "",
                              lieuNaissance: "",
                            });
                          }}
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </section>

                  <section className={CARD}>
                    <h2 className="mb-4 text-lg font-bold text-on-surface">
                      Enfants enregistrés
                    </h2>

                    {agentActuel.enfants.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">
                        Aucun enfant enregistré dans ce dossier.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {agentActuel.enfants.map((enfant) => (
                          <article
                            key={enfant.id}
                            className="rounded-lg border border-hairline p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <h3 className="font-semibold text-on-surface">
                                  {enfant.prenoms} {enfant.nom}
                                </h3>
                                <p className="mt-1 text-sm text-on-surface-variant">
                                  {enfant.sexe} · Né(e) le{" "}
                                  {enfant.dateNaissance || "Non renseignée"}
                                </p>
                                <p className="mt-1 text-sm text-on-surface-variant">
                                  Lieu : {enfant.lieuNaissance || "Non renseigné"}
                                </p>
                                <span
                                  className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs ${
                                    enfant.valide
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {enfant.valide ? "Validé" : "À valider"}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className={SECONDARY}
                                  onClick={() =>
                                    commencerModificationEnfant(enfant)
                                  }
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  className={SECONDARY}
                                  onClick={() => validerEnfant(enfant.id)}
                                >
                                  Valider
                                </button>
                                <button
                                  type="button"
                                  className={DANGER}
                                  onClick={() => supprimerEnfant(enfant.id)}
                                >
                                  Supprimer
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export default GestionDossiersAgents;
