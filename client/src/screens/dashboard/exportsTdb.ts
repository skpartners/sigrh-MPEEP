import type { Dashboard, EtatsTableauDeBord, Kpi } from "../../api/types";
import { couleursCourantes, encreSur, melanger } from "../../ui/Couleurs";
import { colonne as lettre, nomFichierGraphique } from "../../ui/classeurGraphique";
import { nomFeuille, telechargerClasseur, type CelluleX, type FeuilleX, type LigneX, type StyleX } from "../../ui/classeurXlsx";

/**
 * Exports Excel du tableau de bord : chaque carte donne un classeur de ses propres données,
 * une feuille par bloc, avec titre, date d'extraction et ligne de total quand elle a un sens.
 */

type Format = "texte" | "entier" | "decimal" | "pourcent";
type Colonne = { titre: string; format?: Format; largeur?: number; somme?: boolean };
type Valeur = string | number | null;
type Bloc = { onglet: string; titre: string; detail?: string; colonnes: Colonne[]; lignes: Valeur[][] };

function teintes() {
  const { principale } = couleursCourantes();
  return {
    principale: principale.replace("#", ""),
    encre: encreSur(principale).replace("#", ""),
    total: melanger(principale, "#FFFFFF", 0.82).replace("#", ""),
  };
}

function feuille(bloc: Bloc, pris: Set<string>, perimetre: string): FeuilleX {
  const t = teintes();
  const entete: StyleX = { gras: true, couleur: t.encre, fond: t.principale, bordure: "fine", retour: true };
  const extraction = new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const lignes: LigneX[] = [
    { cellules: [{ v: bloc.titre, s: { gras: true, taille: 15, couleur: t.principale } }], hauteur: 24 },
    { cellules: [{ v: [bloc.detail, perimetre, `Extrait le ${extraction}`].filter(Boolean).join(" · "), s: { italique: true, couleur: "5B6472" } }] },
    { cellules: [] },
    {
      cellules: bloc.colonnes.map((colonne) => ({ v: colonne.titre, s: { ...entete, aligne: colonne.format && colonne.format !== "texte" ? "right" as const : "left" as const } })),
      hauteur: 30,
    },
  ];
  const debut = lignes.length;
  for (const valeurs of bloc.lignes) {
    lignes.push({
      cellules: bloc.colonnes.map((colonne, indice): CelluleX => {
        const valeur = valeurs[indice] ?? null;
        const format = colonne.format ?? "texte";
        return { v: format === "pourcent" && typeof valeur === "number" ? valeur / 100 : valeur, s: { bordure: "fine", format } };
      }),
    });
  }
  if (bloc.lignes.length > 1 && bloc.colonnes.some((colonne) => colonne.somme)) {
    lignes.push({
      cellules: bloc.colonnes.map((colonne, indice): CelluleX => {
        const style: StyleX = { gras: true, fond: t.total, bordure: "total", format: colonne.format ?? "texte" };
        if (indice === 0) return { v: "Total", s: style };
        if (!colonne.somme) return { v: null, s: style };
        return { v: bloc.lignes.reduce((somme, ligne) => somme + (typeof ligne[indice] === "number" ? (ligne[indice] as number) : 0), 0), s: style };
      }),
    });
  }
  return {
    nom: nomFeuille(bloc.onglet, pris),
    onglet: t.principale,
    lignes,
    largeurs: bloc.colonnes.map((colonne, indice) => colonne.largeur ?? (indice === 0 ? 42 : Math.max(14, colonne.titre.length + 4))),
    figer: { lignes: debut, colonnes: 0 },
    filtre: bloc.lignes.length ? `A${debut}:${lettre(bloc.colonnes.length)}${debut + bloc.lignes.length}` : undefined,
    quadrillage: false,
  };
}

function exporter(nom: string, blocs: Bloc[], perimetre: string) {
  const pris = new Set<string>();
  telechargerClasseur(blocs.map((bloc) => feuille(bloc, pris, perimetre)), nomFichierGraphique(nom));
}

function libellePerimetre(etats: EtatsTableauDeBord | undefined): string {
  if (!etats) return "";
  return etats.perimetre ? "Agents de votre périmètre" : "Ensemble du ministère";
}

/** Carte d'indicateur : la valeur, son détail, sa jauge et sa répartition. */
export function exporterKpi(kpi: Kpi, exercice: number, etats: EtatsTableauDeBord | undefined) {
  const lignes: Valeur[][] = [
    ["Valeur", `${kpi.valeur}${kpi.unite ? ` ${kpi.unite}` : ""}`],
    ["Détail", kpi.detail],
  ];
  if (kpi.badge) lignes.push(["Repère", kpi.badge]);
  if (kpi.jauge) {
    lignes.push(["Jauge", `${kpi.jauge.pourcentage.toLocaleString("fr-FR")} %`]);
    lignes.push(["Lecture de la jauge", `${kpi.jauge.gauche} · ${kpi.jauge.droite}`]);
  }
  for (const part of kpi.repartition ?? []) lignes.push(["Répartition", part]);
  lignes.push(["Exercice", String(exercice)]);
  exporter(`indicateur ${kpi.libelle}`, [{
    onglet: kpi.libelle,
    titre: kpi.libelle,
    detail: "Indicateur du tableau de bord",
    colonnes: [{ titre: "Élément", largeur: 26 }, { titre: "Valeur", largeur: 70 }],
    lignes,
  }], libellePerimetre(etats));
}

/** File des visas : tous les actes en attente, pas seulement la page affichée. */
export function exporterVisas(visas: Dashboard["visas"]) {
  const categories: Record<string, string> = { carriere: "Carrière", conge: "Congé", formation: "Formation", social: "Action sociale" };
  exporter("actes en attente de visa", [{
    onglet: "Actes en attente",
    titre: "Actes en attente de votre visa",
    detail: `${visas.length} acte${visas.length > 1 ? "s" : ""}, dont ${visas.filter((visa) => visa.urgent).length} urgent${visas.filter((visa) => visa.urgent).length > 1 ? "s" : ""}`,
    colonnes: [
      { titre: "Agent", largeur: 30 },
      { titre: "Matricule", largeur: 14 },
      { titre: "Organisme", largeur: 14 },
      { titre: "Structure", largeur: 32 },
      { titre: "Objet", largeur: 60 },
      { titre: "Catégorie", largeur: 16 },
      { titre: "Échéance", largeur: 28 },
      { titre: "Visa en amont", largeur: 30 },
      { titre: "Urgent", largeur: 10 },
    ],
    lignes: visas.map((visa) => [
      visa.agent.nom_complet,
      visa.agent.matricule,
      visa.agent.organisme_sigle,
      visa.agent.structure,
      visa.objet,
      categories[visa.categorie] ?? visa.categorie,
      visa.echeance,
      visa.visa_amont,
      visa.urgent ? "Oui" : "Non",
    ]),
  }], "");
}

/** État des effectifs : une feuille de synthèse, puis une feuille par axe, toutes modalités comprises. */
export function exporterEffectifs(etats: EtatsTableauDeBord) {
  const { effectifs } = etats;
  const part = (valeur: number) => (effectifs.total ? Math.round((valeur * 1000) / effectifs.total) / 10 : 0);
  exporter("etat des effectifs", [
    {
      onglet: "Synthèse",
      titre: "État des effectifs",
      detail: "Répartition par genre",
      colonnes: [{ titre: "Genre" }, { titre: "Agents", format: "entier", somme: true }, { titre: "Part", format: "pourcent" }],
      lignes: [["Femmes", effectifs.femmes, part(effectifs.femmes)], ["Hommes", effectifs.hommes, part(effectifs.hommes)]],
    },
    ...effectifs.axes.map((axe): Bloc => ({
      onglet: axe.libelle,
      titre: `Effectifs par ${axe.libelle.toLowerCase()}`,
      detail: `${axe.modalites} modalité${axe.modalites > 1 ? "s" : ""}`,
      colonnes: [
        { titre: axe.libelle },
        { titre: "Agents", format: "entier", somme: true },
        { titre: "Femmes", format: "entier", somme: true },
        { titre: "Hommes", format: "entier", somme: true },
        { titre: "Part des femmes", format: "pourcent" },
        { titre: "Part de l'effectif", format: "pourcent" },
      ],
      lignes: (axe.toutes ?? axe.lignes).map((ligne) => [
        ligne.libelle,
        ligne.total,
        ligne.femmes,
        ligne.hommes,
        ligne.total ? Math.round((ligne.femmes * 1000) / ligne.total) / 10 : 0,
        part(ligne.total),
      ]),
    })),
  ], libellePerimetre(etats));
}

/** État des dotations : plafonds d'emplois par branche, demandes par étape et par nature. */
export function exporterDotations(etats: EtatsTableauDeBord) {
  const { dotations } = etats;
  exporter("etat des dotations", [
    {
      onglet: "Plafonds d'emplois",
      titre: "Plafonds d'emplois",
      detail: `${dotations.effectif} emplois occupés sur ${dotations.plafond}`,
      colonnes: [
        { titre: "Branche" },
        { titre: "Effectif", format: "entier", somme: true },
        { titre: "Plafond", format: "entier", somme: true },
        { titre: "Postes disponibles", format: "entier", somme: true },
        { titre: "Occupation", format: "pourcent" },
      ],
      lignes: dotations.branches.map((branche) => [branche.libelle, branche.effectif, branche.plafond, branche.plafond - branche.effectif, branche.occupation]),
    },
    {
      onglet: "Demandes par étape",
      titre: "Demandes de dotation par étape",
      detail: `${dotations.ouvertes} ouvertes sur ${dotations.demandes} · ${dotations.impact_ouvert} postes en jeu`,
      colonnes: [{ titre: "Étape" }, { titre: "Demandes", format: "entier", somme: true }],
      lignes: dotations.par_statut.map((ligne) => [ligne.libelle, ligne.total]),
    },
    {
      onglet: "Demandes par nature",
      titre: "Demandes de dotation par nature",
      colonnes: [{ titre: "Nature" }, { titre: "Demandes", format: "entier", somme: true }],
      lignes: dotations.par_nature.map((ligne) => [ligne.libelle, ligne.total]),
    },
  ], "Ensemble du ministère");
}

/** État des absences et congés : chiffres du jour, soldes de congés, absences de l'exercice par nature. */
export function exporterAbsences(etats: EtatsTableauDeBord, exercice: number) {
  const { absences } = etats;
  exporter("etat des absences et conges", [
    {
      onglet: "Synthèse",
      titre: "État des absences et congés",
      colonnes: [{ titre: "Indicateur" }, { titre: "Valeur", format: "entier" }],
      lignes: [
        ["Agents absents aujourd'hui", absences.absents],
        ["Absences à décider", absences.a_decider],
        ["Congés à instruire", absences.conges.a_instruire],
        ["Arrêtés de congé signés", absences.conges.signes],
        [`Absences débutées en ${exercice}`, absences.annee.absences],
        [`Jours d'absence ${exercice}`, absences.annee.jours],
        ["Jours de congé acquis (report compris)", absences.conges.acquis],
        ["Jours de congé consommés", absences.conges.consommes],
        ["Reliquat de congés (jours)", absences.conges.reliquat],
      ],
    },
    {
      onglet: `Absences ${exercice}`,
      titre: `Absences débutées en ${exercice}, par nature`,
      colonnes: [{ titre: "Nature" }, { titre: "Absences", format: "entier", somme: true }, { titre: "Jours", format: "entier", somme: true }],
      lignes: (absences.annee.toutes_natures ?? absences.annee.par_nature).map((ligne) => [ligne.libelle, ligne.total, ligne.jours]),
    },
    {
      onglet: "Absents aujourd'hui",
      titre: "Agents absents aujourd'hui, par nature",
      colonnes: [{ titre: "Nature" }, { titre: "Agents", format: "entier", somme: true }],
      lignes: absences.en_cours.map((ligne) => [ligne.libelle, ligne.total]),
    },
  ], libellePerimetre(etats));
}

/** État des mises en formation : chiffres de l'exercice, inscriptions par type, prochaines sessions. */
export function exporterFormation(etats: EtatsTableauDeBord, exercice: number) {
  const { formation } = etats;
  exporter("etat des mises en formation", [
    {
      onglet: "Synthèse",
      titre: "État des mises en formation",
      colonnes: [{ titre: "Indicateur" }, { titre: "Valeur", format: "entier" }],
      lignes: [
        ["Agents en formation aujourd'hui", formation.agents_en_cours],
        ["Sessions ouvertes", formation.sessions_ouvertes],
        ["Sessions en cours", formation.sessions_en_cours],
        [`Inscriptions ${exercice}`, formation.inscrits],
        ["Présences constatées", formation.presents],
        [`Agents formés en ${exercice}`, formation.agents_formes],
        [`Heures de formation ${exercice}`, formation.heures],
      ],
    },
    {
      onglet: "Inscriptions par type",
      titre: `Inscriptions ${exercice} par type de formation`,
      colonnes: [{ titre: "Type de formation" }, { titre: "Inscriptions", format: "entier", somme: true }],
      lignes: formation.par_type.map((ligne) => [ligne.libelle, ligne.total]),
    },
    {
      onglet: "Prochaines sessions",
      titre: "Prochaines sessions",
      colonnes: [
        { titre: "Session" },
        { titre: "Début", largeur: 14 },
        { titre: "Lieu", largeur: 30 },
        { titre: "Inscrits", format: "entier", somme: true },
        { titre: "Places", format: "entier", somme: true },
        { titre: "Remplissage", format: "pourcent" },
      ],
      lignes: formation.prochaines.map((session) => [
        session.libelle,
        session.debut ? new Date(`${session.debut}T00:00:00`).toLocaleDateString("fr-FR") : "",
        session.lieu,
        session.inscrits,
        session.places,
        session.places ? Math.round((session.inscrits * 1000) / session.places) / 10 : 0,
      ]),
    },
  ], libellePerimetre(etats));
}
