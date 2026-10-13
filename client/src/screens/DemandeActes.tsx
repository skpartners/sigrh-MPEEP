import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AppChrome } from "./AppChrome";

const PAGE =
  "mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8";

const CARD =
  "rounded-xl border border-hairline bg-surface-container-lowest p-5";

const INPUT =
  "mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-low";

const DANGER =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50";

const TYPES = [
  "Attestation de travail",
  "Attestation de présence au poste",
  "Permission spéciale d’absence",
  "Autorisation spéciale d’absence",
  "Permission",
] as const;

type TypeActe = (typeof TYPES)[number];

type Statut =
  | "Brouillon"
  | "Soumise"
  | "En cours de validation"
  | "Approuvée"
  | "Rejetée";

type Demande = {
  id: number;
  reference: string;
  type: TypeActe;
  motif: string;
  jours: number | null;
  statut: Statut;
  creeLe: string;
};

type Formulaire = {
  type: TypeActe;
  motif: string;
  jours: string;
};

const INITIAL_FORM: Formulaire = {
  type: "Attestation de travail",
  motif: "",
  jours: "",
};

// Données de démonstration uniquement.
// Elles seront remplacées par les données Django lors du raccordement API.
const DEMANDES_INITIALES: Demande[] = [
  {
    id: 1,
    reference: "ACT-2026-001",
    type: "Attestation de travail",
    motif: "Constitution d’un dossier administratif.",
    jours: null,
    statut: "Approuvée",
    creeLe: "2026-10-02",
  },
  {
    id: 2,
    reference: "ACT-2026-002",
    type: "Permission",
    motif: "Démarches administratives personnelles.",
    jours: 2,
    statut: "Brouillon",
    creeLe: "2026-10-08",
  },
  {
    id: 3,
    reference: "ACT-2026-003",
    type: "Autorisation spéciale d’absence",
    motif: "Participation à un événement familial.",
    jours: 1,
    statut: "En cours de validation",
    creeLe: "2026-10-10",
  },
];

function necessiteJours(type: TypeActe): boolean {
  return (
    type === "Permission spéciale d’absence" ||
    type === "Autorisation spéciale d’absence" ||
    type === "Permission"
  );
}

function dateFr(date: string): string {
  return new Intl.DateTimeFormat("fr-FR").format(
    new Date(`${date}T12:00:00`)
  );
}

function badgeStatut(statut: Statut) {
  const classes: Record<Statut, string> = {
    Brouillon: "bg-slate-100 text-slate-700",
    Soumise: "bg-blue-100 text-blue-800",
    "En cours de validation": "bg-amber-100 text-amber-800",
    Approuvée: "bg-green-100 text-green-800",
    Rejetée: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${classes[statut]}`}
    >
      {statut}
    </span>
  );
}

/**
 * Génère un récapitulatif PDF de la demande.
 * Ce document n'est pas une attestation officielle.
 */
function telechargerPDF(demande: Demande) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const largeur = doc.internal.pageSize.getWidth();
  const marge = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("MINISTÈRE DU PORTEFEUILLE DE L'ÉTAT", largeur / 2, 20, {
    align: "center",
  });

  doc.setFontSize(11);
  doc.text("ET DES ENTREPRISES PUBLIQUES", largeur / 2, 28, {
    align: "center",
  });

  doc.setDrawColor(100);
  doc.line(marge, 35, largeur - marge, 35);

  doc.setFontSize(15);
  doc.text("RÉCAPITULATIF D'UNE DEMANDE D'ACTE", largeur / 2, 47, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Référence : ${demande.reference}`, marge, 58);
  doc.text(`Date de création : ${dateFr(demande.creeLe)}`, marge, 65);

  autoTable(doc, {
    startY: 73,
    margin: { left: marge, right: marge },
    head: [["Champ", "Informations"]],
    body: [
      ["Type d'acte", demande.type],
      ["Motif", demande.motif],
      [
        "Nombre de jours",
        demande.jours === null ? "Non applicable" : `${demande.jours} jour(s)`,
      ],
      ["Statut", demande.statut],
      ["Référence", demande.reference],
    ],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 4,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [35, 74, 120],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 43, fontStyle: "bold" },
      1: { cellWidth: 127 },
    },
  });

  const position = (
    doc as typeof doc & {
      lastAutoTable?: { finalY: number };
    }
  ).lastAutoTable?.finalY ?? 130;

  let y = position + 15;

  if (y > 240) {
    doc.addPage();
    y = 30;
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);

  const avertissement =
    "Document de récapitulation généré par le SIGRH. Il ne constitue pas une autorisation, une attestation officielle ni une décision administrative.";

  const lignes = doc.splitTextToSize(avertissement, largeur - 2 * marge);
  doc.text(lignes, marge, y);

  y += lignes.length * 5 + 15;

  if (y > 265) {
    doc.addPage();
    y = 35;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  doc.text("Signature de l'agent :", marge, y);
  doc.text("Visa de l'autorité compétente :", 115, y);

  doc.save(`${demande.reference}.pdf`);
}

export default function DemandeActes() {
  const [demandes, setDemandes] = useState<Demande[]>(
    DEMANDES_INITIALES
  );

  const [recherche, setRecherche] = useState("");
  const [filtreType, setFiltreType] = useState("Tous");
  const [filtreStatut, setFiltreStatut] = useState("Tous");

  const [formulaire, setFormulaire] =
    useState<Formulaire>(INITIAL_FORM);

  const [demandeEnEdition, setDemandeEnEdition] =
    useState<number | null>(null);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [message, setMessage] = useState("");

  const listeFiltree = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr");

    return demandes.filter((demande) => {
      const correspondRecherche =
        !terme ||
        demande.reference.toLocaleLowerCase("fr").includes(terme) ||
        demande.motif.toLocaleLowerCase("fr").includes(terme) ||
        demande.type.toLocaleLowerCase("fr").includes(terme);

      const correspondType =
        filtreType === "Tous" || demande.type === filtreType;

      const correspondStatut =
        filtreStatut === "Tous" || demande.statut === filtreStatut;

      return (
        correspondRecherche &&
        correspondType &&
        correspondStatut
      );
    });
  }, [demandes, recherche, filtreType, filtreStatut]);

  const statistiques = useMemo(
    () => ({
      total: demandes.length,
      brouillons: demandes.filter((d) => d.statut === "Brouillon").length,
      enCours: demandes.filter(
        (d) =>
          d.statut === "Soumise" ||
          d.statut === "En cours de validation"
      ).length,
      approuvees: demandes.filter(
        (d) => d.statut === "Approuvée"
      ).length,
    }),
    [demandes]
  );

  function ouvrirCreation() {
    setDemandeEnEdition(null);
    setFormulaire(INITIAL_FORM);
    setMessage("");
    setFormulaireOuvert(true);
  }

  function ouvrirModification(demande: Demande) {
    if (demande.statut !== "Brouillon") return;

    setDemandeEnEdition(demande.id);
    setFormulaire({
      type: demande.type,
      motif: demande.motif,
      jours: demande.jours === null ? "" : String(demande.jours),
    });
    setMessage("");
    setFormulaireOuvert(true);
  }

  function fermerFormulaire() {
    setFormulaireOuvert(false);
    setDemandeEnEdition(null);
    setFormulaire(INITIAL_FORM);
  }

  function enregistrer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const motif = formulaire.motif.trim();

    if (!motif) {
      setMessage("Veuillez renseigner le motif de la demande.");
      return;
    }

    let jours: number | null = null;

    if (necessiteJours(formulaire.type)) {
      jours = Number(formulaire.jours);

      if (!Number.isInteger(jours) || jours < 1 || jours > 365) {
        setMessage("Veuillez saisir un nombre de jours entier valide.");
        return;
      }
    }

    if (demandeEnEdition !== null) {
      const existante = demandes.find(
        (d) => d.id === demandeEnEdition
      );

      if (!existante || existante.statut !== "Brouillon") {
        setMessage("Seuls les brouillons peuvent être modifiés.");
        return;
      }

      setDemandes((avant) =>
        avant.map((d) =>
          d.id === demandeEnEdition
            ? {
                ...d,
                type: formulaire.type,
                motif,
                jours,
              }
            : d
        )
      );

      setMessage("La demande a été modifiée.");
    } else {
      const id = Date.now();

      const nouvelle: Demande = {
        id,
        reference: `ACT-${new Date().getFullYear()}-${String(id).slice(-6)}`,
        type: formulaire.type,
        motif,
        jours,
        statut: "Brouillon",
        creeLe: new Date().toISOString().slice(0, 10),
      };

      setDemandes((avant) => [nouvelle, ...avant]);
      setMessage("Demande enregistrée comme brouillon.");
    }

    fermerFormulaire();
  }

  function supprimer(demande: Demande) {
    if (demande.statut !== "Brouillon") {
      setMessage(
        "Seules les demandes en brouillon peuvent être supprimées."
      );
      return;
    }

    if (
      !window.confirm(
        `Voulez-vous supprimer la demande ${demande.reference} ?`
      )
    ) {
      return;
    }

    setDemandes((avant) =>
      avant.filter((d) => d.id !== demande.id)
    );

    setMessage(`La demande ${demande.reference} a été supprimée.`);
  }

  function soumettre(demande: Demande) {
    if (demande.statut !== "Brouillon") return;

    if (
      !window.confirm(
        `Confirmer la soumission de la demande ${demande.reference} ?`
      )
    ) {
      return;
    }

    setDemandes((avant) =>
      avant.map((d) =>
        d.id === demande.id ? { ...d, statut: "Soumise" } : d
      )
    );

    setMessage(
      `La demande ${demande.reference} est marquée comme soumise dans cette démonstration locale.`
    );
  }

  return (
    <AppChrome>
      <main className={PAGE}>
        <header className={`${CARD} mb-6`}>
          <p className="text-sm text-on-surface-variant">
            Espace agent / Gestion administrative
          </p>

          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-on-surface sm:text-3xl">
                Demande d’actes
              </h1>

              <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
                Créez vos demandes d’actes administratifs, consultez leur
                statut et téléchargez leur récapitulatif PDF.
              </p>
            </div>

            <button
              type="button"
              className={PRIMARY}
              onClick={ouvrirCreation}
            >
              <span aria-hidden="true">＋</span>
              Nouvelle demande
            </button>
          </div>
        </header>

        {message && (
          <div
            role="status"
            className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface"
          >
            <p>{message}</p>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="font-semibold"
              aria-label="Fermer le message"
            >
              ×
            </button>
          </div>
        )}

        <section
          className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Indicateurs des demandes"
        >
          {[
            {
              titre: "Total des demandes",
              valeur: statistiques.total,
              detail: "Toutes les demandes",
            },
            {
              titre: "Brouillons",
              valeur: statistiques.brouillons,
              detail: "À compléter ou soumettre",
            },
            {
              titre: "En traitement",
              valeur: statistiques.enCours,
              detail: "Soumises ou en validation",
            },
            {
              titre: "Approuvées",
              valeur: statistiques.approuvees,
              detail: "Demandes approuvées",
            },
          ].map((item) => (
            <article key={item.titre} className={CARD}>
              <p className="text-sm text-on-surface-variant">
                {item.titre}
              </p>
              <p className="mt-2 text-3xl font-bold text-on-surface">
                {item.valeur}
              </p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {item.detail}
              </p>
            </article>
          ))}
        </section>

        {formulaireOuvert && (
          <section className={`${CARD} mb-6`}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-on-surface">
                  {demandeEnEdition !== null
                    ? "Modifier la demande"
                    : "Nouvelle demande d’acte"}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Les champs marqués d’un astérisque sont obligatoires.
                </p>
              </div>

              <button
                type="button"
                className={SECONDARY}
                onClick={fermerFormulaire}
              >
                Fermer
              </button>
            </div>

            <form onSubmit={enregistrer} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="type-acte"
                    className="block text-sm font-semibold text-on-surface"
                  >
                    Type d’acte *
                  </label>

                  <select
                    id="type-acte"
                    className={INPUT}
                    value={formulaire.type}
                    onChange={(event) => {
                      const type = event.target.value as TypeActe;

                      setFormulaire((avant) => ({
                        ...avant,
                        type,
                        jours: necessiteJours(type) ? avant.jours : "",
                      }));
                    }}
                    required
                  >
                    {TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {necessiteJours(formulaire.type) && (
                  <div>
                    <label
                      htmlFor="nombre-jours"
                      className="block text-sm font-semibold text-on-surface"
                    >
                      Nombre de jours *
                    </label>

                    <input
                      id="nombre-jours"
                      type="number"
                      min={1}
                      max={365}
                      step={1}
                      required
                      className={INPUT}
                      value={formulaire.jours}
                      onChange={(event) =>
                        setFormulaire((avant) => ({
                          ...avant,
                          jours: event.target.value,
                        }))
                      }
                      placeholder="Ex. : 2"
                    />

                    <p className="mt-1 text-xs text-on-surface-variant">
                      Saisissez un nombre entier de jours.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="motif-acte"
                  className="block text-sm font-semibold text-on-surface"
                >
                  Motif de la demande *
                </label>

                <textarea
                  id="motif-acte"
                  className={INPUT}
                  rows={4}
                  required
                  maxLength={2000}
                  value={formulaire.motif}
                  onChange={(event) =>
                    setFormulaire((avant) => ({
                      ...avant,
                      motif: event.target.value,
                    }))
                  }
                  placeholder="Expliquez clairement l’objet de votre demande..."
                />

                <p className="mt-1 text-right text-xs text-on-surface-variant">
                  {formulaire.motif.length}/2000 caractères
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-hairline pt-4">
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={fermerFormulaire}
                >
                  Annuler
                </button>

                <button type="submit" className={PRIMARY}>
                  {demandeEnEdition !== null
                    ? "Enregistrer les modifications"
                    : "Enregistrer le brouillon"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className={CARD}>
          <div className="mb-5">
            <h2 className="text-xl font-bold text-on-surface">
              Liste des demandes
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Recherchez, filtrez et téléchargez vos demandes.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="recherche"
                className="block text-sm font-semibold text-on-surface"
              >
                Recherche
              </label>
              <input
                id="recherche"
                type="search"
                className={INPUT}
                value={recherche}
                onChange={(event) => setRecherche(event.target.value)}
                placeholder="Référence, type ou motif..."
              />
            </div>

            <div>
              <label
                htmlFor="filtre-type"
                className="block text-sm font-semibold text-on-surface"
              >
                Type d’acte
              </label>
              <select
                id="filtre-type"
                className={INPUT}
                value={filtreType}
                onChange={(event) => setFiltreType(event.target.value)}
              >
                <option value="Tous">Tous les types</option>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="filtre-statut"
                className="block text-sm font-semibold text-on-surface"
              >
                Statut
              </label>
              <select
                id="filtre-statut"
                className={INPUT}
                value={filtreStatut}
                onChange={(event) => setFiltreStatut(event.target.value)}
              >
                <option value="Tous">Tous les statuts</option>
                <option value="Brouillon">Brouillon</option>
                <option value="Soumise">Soumise</option>
                <option value="En cours de validation">
                  En cours de validation
                </option>
                <option value="Approuvée">Approuvée</option>
                <option value="Rejetée">Rejetée</option>
              </select>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-on-surface-variant">
              {listeFiltree.length} résultat(s)
            </p>

            <button
              type="button"
              className="text-sm font-semibold text-primary underline"
              onClick={() => {
                setRecherche("");
                setFiltreType("Tous");
                setFiltreStatut("Tous");
              }}
            >
              Réinitialiser les filtres
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-hairline bg-surface-container-low text-on-surface-variant">
                  <th className="px-3 py-3 font-semibold">Référence</th>
                  <th className="px-3 py-3 font-semibold">Type d’acte</th>
                  <th className="px-3 py-3 font-semibold">Motif</th>
                  <th className="px-3 py-3 font-semibold">Jours</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Statut</th>
                  <th className="px-3 py-3 font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody>
                {listeFiltree.map((demande) => (
                  <tr
                    key={demande.id}
                    className="border-b border-hairline align-top hover:bg-surface-container-low/50"
                  >
                    <td className="px-3 py-4 font-semibold text-on-surface">
                      {demande.reference}
                    </td>

                    <td className="max-w-56 whitespace-normal px-3 py-4 text-on-surface">
                      {demande.type}
                    </td>

                    <td className="max-w-64 whitespace-normal px-3 py-4 text-on-surface-variant">
                      {demande.motif}
                    </td>

                    <td className="px-3 py-4 text-on-surface">
                      {demande.jours === null ? "—" : `${demande.jours} j`}
                    </td>

                    <td className="whitespace-nowrap px-3 py-4 text-on-surface-variant">
                      {dateFr(demande.creeLe)}
                    </td>

                    <td className="px-3 py-4">
                      {badgeStatut(demande.statut)}
                    </td>

                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={SECONDARY}
                          onClick={() => telechargerPDF(demande)}
                          title={`Télécharger ${demande.reference} en PDF`}
                        >
                          Télécharger PDF
                        </button>

                        {demande.statut === "Brouillon" && (
                          <>
                            <button
                              type="button"
                              className={SECONDARY}
                              onClick={() => ouvrirModification(demande)}
                            >
                              Modifier
                            </button>

                            <button
                              type="button"
                              className={PRIMARY}
                              onClick={() => soumettre(demande)}
                            >
                              Soumettre
                            </button>

                            <button
                              type="button"
                              className={DANGER}
                              onClick={() => supprimer(demande)}
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {listeFiltree.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-on-surface-variant"
                    >
                      <p className="font-semibold">
                        Aucune demande trouvée
                      </p>
                      <p className="mt-1 text-sm">
                        Modifiez les filtres ou créez une nouvelle demande.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-on-surface-variant">
            Phase pilote : les demandes sont conservées uniquement en mémoire.
            Le PDF téléchargé est un récapitulatif et ne constitue pas un
            document administratif officiel.
          </p>
        </section>
      </main>
    </AppChrome>
  );
}