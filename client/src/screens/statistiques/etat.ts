import type { SerieGraphique } from "../../ui/Graphique";
import {
  calculerTcd,
  configComplete,
  configVide,
  seriesGraphique,
  type ConfigTcd,
  type Cube,
  type ResultatTcd,
  type SourceCatalogue,
} from "./moteur";

/**
 * États composés : une suite de blocs prêts à lire, chacun réunissant sur une même ligne un graphique, son tableau de données
 * et les points à retenir. Les blocs se recomposent (champs, graphique, couleurs, textes) et s'exportent dans un classeur
 * dont la première feuille porte les blocs et la seconde la synthèse.
 */

export type Redaction = "programme" | "grade" | "age" | "famille" | "statut" | "libre";

export type BlocEtat = {
  id: string;
  redaction: Redaction;
  /** Surtitre du bloc, par exemple « GRAPHIQUE 1 · STRUCTURES ET PROGRAMMES ». */
  kicker: string;
  titre: string;
  /** Tant qu'il est vrai, le titre est rédigé à partir des données. */
  titre_auto: boolean;
  sous_titre: string;
  /** null : points à retenir rédigés à partir des données ; une liste : texte de l'utilisateur. */
  commentaires: string[] | null;
  /** Anneau d'accompagnement : la répartition des totaux, à gauche du graphique. */
  anneau: boolean;
  config: ConfigTcd;
};

export type ConfigEtat = {
  titre: string;
  sous_titre: string;
  source: string;
  synthese: boolean;
  blocs: BlocEtat[];
};

/** Couleurs de la maquette : bleu marine pour les hommes, vert d'eau pour les femmes. */
export const BLEU_MARINE = "#14365D";
export const VERT_EAU = "#2A9D8F";
export const COULEURS_GENRE = [BLEU_MARINE, VERT_EAU];
export const COULEURS_ANNEAU = [BLEU_MARINE, VERT_EAU, "#E9A23B", "#8AB17D", "#C8553D", "#6C7A89"];

export const MODELE_PERSONNEL = "etat-du-personnel";
export const MAX_BLOCS = 24;

const SOURCE_DEFAUT = "Dossiers agents du SIGRH — état du personnel. Parts calculées sur l'effectif total.";

function config(partiel: Partial<ConfigTcd>, graphique: Partial<ConfigTcd["graphique"]>): ConfigTcd {
  const base = configVide("agents");
  return configComplete({
    ...base,
    ...partiel,
    valeurs: [{ mesure: "nombre", agregat: "nombre", affichage: "valeur" }],
    options: { total_lignes: true, total_colonnes: true, sous_totaux: true },
    graphique: { ...base.graphique, legende: true, etiquettes: true, couleurs: COULEURS_GENRE, ...graphique },
    nom_auto: false,
  });
}

/** L'état du personnel de la maquette STAT_graphiques : cinq blocs, du plus général au plus fin. */
export function etatDuPersonnel(): ConfigEtat {
  return {
    titre: "État du personnel — analyse graphique",
    sous_titre: "Hommes / femmes : bleu marine = hommes, vert d'eau = femmes. Les titres et les points à retenir se recalculent à partir des données.",
    source: SOURCE_DEFAUT,
    synthese: true,
    blocs: [
      {
        id: "structures",
        redaction: "programme",
        kicker: "GRAPHIQUE 1  ·  STRUCTURES ET PROGRAMMES",
        titre: "",
        titre_auto: true,
        sous_titre: "Effectif par programme et par structure, selon le genre (nombre d'agents ; part dans l'effectif total)",
        commentaires: null,
        anneau: false,
        config: config(
          { lignes: ["programme", "direction"], colonnes: ["sexe"], tri: { par: "valeur", sens: "desc" } },
          { forme: "empilee-horizontale", niveau: 1 },
        ),
      },
      {
        id: "grades",
        redaction: "grade",
        kicker: "GRAPHIQUE 2  ·  CATÉGORIES ET GRADES",
        titre: "",
        titre_auto: true,
        sous_titre: "Effectif par catégorie et par grade, selon le genre (nombre d'agents ; part dans l'effectif total)",
        commentaires: null,
        anneau: false,
        config: config(
          { lignes: ["categorie_statutaire", "grade"], colonnes: ["sexe"] },
          { forme: "empilee", niveau: 1 },
        ),
      },
      {
        id: "ages",
        redaction: "age",
        kicker: "GRAPHIQUE 3  ·  PYRAMIDE DES ÂGES",
        titre: "",
        titre_auto: true,
        sous_titre: "Effectif par tranche d'âge — hommes à gauche, femmes à droite (nombre d'agents ; part dans l'effectif total)",
        commentaires: null,
        anneau: false,
        config: config({ lignes: ["tranche_age_detail"], colonnes: ["sexe"] }, { forme: "pyramide" }),
      },
      {
        id: "familles",
        redaction: "famille",
        kicker: "GRAPHIQUE 4  ·  FAMILLES D'EMPLOI",
        titre: "",
        titre_auto: true,
        sous_titre: "Effectif par famille d'emploi, selon le genre, trié par effectif décroissant (nombre d'agents ; part)",
        commentaires: null,
        anneau: false,
        config: config(
          { lignes: ["famille_emploi"], colonnes: ["sexe"], tri: { par: "valeur", sens: "desc" } },
          { forme: "empilee-horizontale" },
        ),
      },
      {
        id: "statuts",
        redaction: "statut",
        kicker: "GRAPHIQUE 5  ·  STATUT",
        titre: "",
        titre_auto: true,
        sous_titre: "À gauche : répartition par statut (% de l'effectif) — à droite : effectif par statut selon le genre",
        commentaires: null,
        anneau: true,
        config: config(
          { lignes: ["type_agent"], colonnes: ["sexe"], tri: { par: "valeur", sens: "desc" } },
          { forme: "empilee-horizontale" },
        ),
      },
    ],
  };
}

export function blocVierge(rang: number): BlocEtat {
  return {
    id: `bloc-${Date.now().toString(36)}${rang}`,
    redaction: "libre",
    kicker: `GRAPHIQUE ${rang + 1}`,
    titre: "",
    titre_auto: true,
    sous_titre: "",
    commentaires: null,
    anneau: false,
    config: config({ lignes: ["programme"], colonnes: ["sexe"] }, { forme: "empilee-horizontale" }),
  };
}

/** Complète un état reçu du serveur (ou d'une ancienne version) avec les réglages par défaut. */
export function etatComplet(brut: Partial<ConfigEtat> | null | undefined): ConfigEtat {
  const base = etatDuPersonnel();
  if (!brut) return base;
  return {
    titre: brut.titre ?? base.titre,
    sous_titre: brut.sous_titre ?? "",
    source: brut.source ?? "",
    synthese: brut.synthese !== false,
    blocs: (brut.blocs ?? []).map((bloc, rang) => ({
      ...blocVierge(rang),
      ...bloc,
      commentaires: Array.isArray(bloc.commentaires) ? bloc.commentaires : null,
      anneau: bloc.anneau === true,
      config: configComplete(bloc.config),
    })),
  };
}

// --- Lecture des données d'un bloc ----------------------------------------------------------

export type LigneVue = {
  libelle: string;
  chemin: string[];
  niveau: number;
  groupe: boolean;
  /** Une valeur par colonne du tableau croisé (hommes, femmes…). */
  valeurs: number[];
  total: number;
  part: number | null;
};

export type VueBloc = {
  vide: boolean;
  colonnes: string[];
  lignes: LigneVue[];
  /** Lignes sans enfant : celles qui se comptent une fois chacune. */
  feuilles: LigneVue[];
  total: number;
  totaux: number[];
  categories: string[];
  series: SerieGraphique[];
  /** Répartition des totaux, pour l'anneau. */
  repartition: SerieGraphique[];
  forage: boolean;
};

const nombre = (valeur: number | null) => valeur ?? 0;

/** Les chiffres d'un bloc : tableau (avec parts) et séries du graphique, à partir du cube déjà chargé. */
export function vueBloc(cube: Cube | undefined, bloc: BlocEtat, source: SourceCatalogue | undefined): VueBloc {
  const resultat = calculerTcd(cube, bloc.config);
  return vueDepuisResultat(resultat, bloc.config, source);
}

export function vueDepuisResultat(resultat: ResultatTcd, cfg: ConfigTcd, source: SourceCatalogue | undefined): VueBloc {
  const avecColonnes = cfg.colonnes.length > 0;
  const colonnes = avecColonnes ? resultat.colonnes : [];
  const total = nombre(resultat.totalGeneral(0));
  const lignes: LigneVue[] = resultat.lignes
    .filter((ligne) => !ligne.cachee)
    .map((ligne) => {
      const valeurs = colonnes.map((colonne) => nombre(resultat.cellule(ligne.noeud.cle, colonne.cle, 0)));
      const ligneTotal = nombre(resultat.totalLigne(ligne.noeud.cle, 0));
      return {
        libelle: ligne.noeud.libelle,
        chemin: ligne.noeud.chemin,
        niveau: ligne.noeud.niveau,
        groupe: ligne.groupe && !ligne.replie,
        valeurs,
        total: ligneTotal,
        part: total ? ligneTotal / total : null,
      };
    });
  const { categories, series } = seriesGraphique(resultat, cfg, source);
  const feuilles = lignes.filter((ligne) => !ligne.groupe);
  return {
    vide: resultat.vide || total === 0,
    colonnes: colonnes.map((colonne) => colonne.chemin.join(" · ")),
    lignes,
    feuilles,
    total,
    totaux: colonnes.map((colonne) => nombre(resultat.totalColonne(colonne.cle, 0))),
    categories,
    series,
    repartition: [{ nom: "Part de l'effectif", points: feuilles.map((ligne) => ({ libelle: ligne.libelle, total: ligne.part === null ? 0 : Math.round(ligne.part * 1000) / 10 })) }],
    forage: false,
  };
}

// --- Rédaction automatique ----------------------------------------------------------------

const fr = (valeur: number, decimales = 0) => valeur.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const pct = (valeur: number, decimales = 1) => `${fr(valeur * 100, decimales)} %`;
const agents = (valeur: number) => `${fr(valeur)} agent${valeur > 1 ? "s" : ""}`;
const ABSENT = /^non renseign/i;

type Redigee = { titre: string; commentaires: string[] };

function plusGrandes(vue: VueBloc, nombreMax: number): LigneVue[] {
  return [...vue.feuilles].filter((ligne) => !ABSENT.test(ligne.libelle)).sort((a, b) => b.total - a.total).slice(0, nombreMax);
}

/** Indice de la colonne « femmes » : celle dont le libellé commence par « F ». */
function colonneFemmes(vue: VueBloc): number {
  return vue.colonnes.findIndex((nom) => /^f/i.test(nom));
}

function partFemmes(vue: VueBloc, ligne: LigneVue): number | null {
  const rang = colonneFemmes(vue);
  return rang < 0 || !ligne.total ? null : ligne.valeurs[rang] / ligne.total;
}

function nonRenseigne(vue: VueBloc, quoi: string): string | null {
  const ligne = vue.feuilles.find((item) => ABSENT.test(item.libelle));
  return ligne && ligne.total ? `${agents(ligne.total)} (${pct(ligne.part ?? 0)}) sans ${quoi} renseigné : une donnée à fiabiliser.` : null;
}

/** Féminisation : le groupe le plus féminin et le moins féminin parmi ceux qui comptent au moins dix agents. */
function ecartsGenre(vue: VueBloc): string | null {
  if (colonneFemmes(vue) < 0) return null;
  const candidats = vue.feuilles
    .filter((ligne) => ligne.total >= 10 && !ABSENT.test(ligne.libelle))
    .map((ligne) => ({ ligne, femmes: partFemmes(vue, ligne) ?? 0 }));
  if (candidats.length < 2) return null;
  const haut = candidats.reduce((a, b) => (b.femmes > a.femmes ? b : a));
  const bas = candidats.reduce((a, b) => (b.femmes < a.femmes ? b : a));
  if (haut.ligne === bas.ligne) return null;
  return `Écart de genre : ${pct(haut.femmes, 0)} de femmes pour « ${haut.ligne.libelle} », contre ${pct(bas.femmes, 0)} pour « ${bas.ligne.libelle} ».`;
}

export function rediger(bloc: BlocEtat, vue: VueBloc): Redigee {
  if (vue.vide) return { titre: "Aucune donnée pour ce bloc", commentaires: ["Aucun enregistrement ne correspond aux champs et aux filtres choisis."] };
  const haut = plusGrandes(vue, 3);
  const premier = haut[0];
  const trois = haut.reduce((somme, ligne) => somme + (ligne.part ?? 0), 0);
  const global = vue.total ? vue.totaux.map((valeur) => valeur / vue.total) : [];
  const femmes = colonneFemmes(vue) >= 0 ? global[colonneFemmes(vue)] : null;

  if (bloc.redaction === "programme") {
    const programmes = vue.lignes.filter((ligne) => ligne.niveau === 0);
    const tete = [...programmes].sort((a, b) => b.total - a.total);
    const titre = premier
      ? `La structure « ${premier.libelle} » concentre ${pct(premier.part ?? 0)} des effectifs${haut.length >= 3 ? ` ; avec « ${haut[1].libelle} » et « ${haut[2].libelle} », trois structures regroupent ${pct(trois)} du personnel` : ""}`
      : "Répartition des effectifs";
    const commentaires = [
      ...(tete.length ? [`Programme « ${tete[0].libelle} » : ${agents(tete[0].total)} (${pct(tete[0].part ?? 0)})${tete[1] ? ` ; « ${tete[1].libelle} » : ${agents(tete[1].total)} (${pct(tete[1].part ?? 0)})` : ""}.`] : []),
      ...(femmes !== null ? [`Les femmes représentent ${pct(femmes)} de l'effectif de ces structures (${agents(vue.totaux[colonneFemmes(vue)])} sur ${fr(vue.total)}).`] : []),
      ...(ecartsGenre(vue) ? [ecartsGenre(vue) as string] : []),
    ];
    return { titre, commentaires };
  }

  if (bloc.redaction === "grade") {
    const categories = vue.lignes.filter((ligne) => ligne.niveau === 0 && ligne.groupe);
    const categorieA = categories.find((ligne) => /\bA$/i.test(ligne.libelle.trim()));
    const gradesA = categorieA ? vue.feuilles.filter((ligne) => ligne.chemin[0] === categorieA.libelle && !ABSENT.test(ligne.libelle)).sort((a, b) => b.total - a.total) : [];
    const titre = categorieA
      ? `La catégorie A représente ${pct(categorieA.part ?? 0)} des effectifs${gradesA.length >= 2 ? `, portée par les grades ${gradesA[0].libelle} et ${gradesA[1].libelle} (${pct((gradesA[0].part ?? 0) + (gradesA[1].part ?? 0))})` : ""}`
      : premier ? `Le grade ${premier.libelle} est le plus représenté (${pct(premier.part ?? 0)} des effectifs)` : "Répartition par catégorie et par grade";
    const rangF = colonneFemmes(vue);
    const commentaires = [
      ...(gradesA[0] && partFemmes(vue, gradesA[0]) !== null ? [`Féminisation à l'entrée de la catégorie A : ${pct(partFemmes(vue, gradesA[0]) ?? 0, 0)} de femmes en ${gradesA[0].libelle}.`] : []),
      ...(rangF >= 0 && categorieA ? [`Dans la catégorie A : ${agents(categorieA.valeurs[rangF])} de sexe féminin sur ${fr(categorieA.total)}.`] : []),
      ...(nonRenseigne(vue, "grade") ? [nonRenseigne(vue, "grade") as string] : []),
    ];
    return { titre, commentaires };
  }

  if (bloc.redaction === "age") {
    const dans = (ligne: LigneVue, motifs: RegExp) => motifs.test(ligne.libelle);
    const aines = vue.feuilles.filter((ligne) => dans(ligne, /^(45|55|60)/));
    const coeur = vue.feuilles.filter((ligne) => dans(ligne, /^(35|45) /));
    const sommeAines = aines.reduce((somme, ligne) => somme + ligne.total, 0);
    const sommeCoeur = coeur.reduce((somme, ligne) => somme + ligne.total, 0);
    const jeunes = vue.feuilles.filter((ligne) => dans(ligne, /^(moins|25)/)).reduce((somme, ligne) => somme + ligne.total, 0);
    const titre = vue.total ? `${pct(sommeAines / vue.total)} des agents ont 45 ans ou plus : un renouvellement des effectifs à anticiper dès maintenant` : "Pyramide des âges";
    const commentaires = [
      `Cœur de la pyramide : ${agents(sommeCoeur)} ont entre 35 et 54 ans (${pct(vue.total ? sommeCoeur / vue.total : 0)}).`,
      `Relève : ${agents(jeunes)} de moins de 35 ans (${pct(vue.total ? jeunes / vue.total : 0)}), contre ${agents(sommeAines)} de 45 ans et plus.`,
      ...(nonRenseigne(vue, "âge") ? [nonRenseigne(vue, "âge") as string] : []),
    ];
    return { titre, commentaires };
  }

  if (bloc.redaction === "famille") {
    const famille = (ligne: LigneVue) => partFemmes(vue, ligne);
    const majoritaires = haut.filter((ligne) => (famille(ligne) ?? 0) > 0.5);
    const titre = haut.length >= 3
      ? `Trois familles concentrent ${pct(trois)} des effectifs, avec une forte différenciation hommes / femmes selon les métiers`
      : premier ? `${premier.libelle} : famille la plus représentée (${pct(premier.part ?? 0)})` : "Répartition par famille d'emploi";
    const commentaires = [
      ...(majoritaires[0] ? [`${majoritaires[0].libelle} : famille majoritairement féminine (${pct(famille(majoritaires[0]) ?? 0, 0)} de femmes).`] : []),
      ...(ecartsGenre(vue) ? [ecartsGenre(vue) as string] : []),
      ...(vue.feuilles.find((ligne) => /non class/i.test(ligne.libelle)) ? [`${agents(vue.feuilles.find((ligne) => /non class/i.test(ligne.libelle))?.total ?? 0)} sans famille d'emploi classée : une donnée à fiabiliser.`] : []),
    ];
    return { titre, commentaires };
  }

  if (bloc.redaction === "statut") {
    const second = haut[1];
    const titre = premier
      ? `${pct(premier.part ?? 0)} des agents sont « ${premier.libelle} »${second ? ` ; les « ${second.libelle} » représentent ${pct(second.part ?? 0)} de l'effectif` : ""}`
      : "Répartition par statut";
    const commentaires = [
      ...(premier ? [`Un effectif stable : ${agents(premier.total)} « ${premier.libelle} »${second ? ` pour ${fr(second.total)} « ${second.libelle} »` : ""}.`] : []),
      ...(premier && second && partFemmes(vue, premier) !== null && partFemmes(vue, second) !== null
        ? [`Taux de féminisation : ${pct(partFemmes(vue, premier) ?? 0, 0)} parmi les « ${premier.libelle} », ${pct(partFemmes(vue, second) ?? 0, 0)} parmi les « ${second.libelle} ».`]
        : []),
      ...(nonRenseigne(vue, "statut") ? [nonRenseigne(vue, "statut") as string] : []),
    ];
    return { titre, commentaires };
  }

  // Bloc libre : le plus grand groupe, l'écart de genre et les données manquantes.
  const titre = premier
    ? `${premier.libelle} : ${pct(premier.part ?? 0)} des effectifs${haut.length >= 3 ? ` ; trois groupes réunissent ${pct(trois)} du total` : ""}`
    : "Répartition des effectifs";
  const commentaires = [
    ...(premier ? [`${premier.libelle} : ${agents(premier.total)} (${pct(premier.part ?? 0)}).`] : []),
    ...(femmes !== null ? [`Part des femmes : ${pct(femmes)}.`] : []),
    ...(ecartsGenre(vue) ? [ecartsGenre(vue) as string] : []),
    ...(nonRenseigne(vue, "valeur") ? [nonRenseigne(vue, "valeur") as string] : []),
  ];
  return { titre, commentaires };
}

/** Titre et points à retenir d'un bloc : ceux de l'utilisateur, sinon ceux que les données suggèrent. */
export function textesBloc(bloc: BlocEtat, vue: VueBloc): { titre: string; commentaires: string[] } {
  const auto = rediger(bloc, vue);
  return {
    titre: bloc.titre_auto || !bloc.titre.trim() ? auto.titre : bloc.titre.trim(),
    commentaires: bloc.commentaires ?? auto.commentaires,
  };
}

// --- Synthèse -----------------------------------------------------------------------------

export type Indicateur = { libelle: string; valeur: string; detail: string };

/** Les chiffres clés de la feuille de synthèse, tirés des blocs présents (un bloc absent retire son indicateur). */
export function indicateurs(blocs: BlocEtat[], vues: Record<string, VueBloc | undefined>): Indicateur[] {
  const vueDe = (redaction: Redaction) => {
    const bloc = blocs.find((item) => item.redaction === redaction);
    return bloc ? vues[bloc.id] : undefined;
  };
  const sorties: Indicateur[] = [];
  const reference = blocs.map((bloc) => vues[bloc.id]).find((vue) => vue && !vue.vide);
  if (reference) {
    sorties.push({ libelle: "EFFECTIF TOTAL", valeur: fr(reference.total), detail: "agents" });
    const rang = colonneFemmes(reference);
    if (rang >= 0 && reference.total) {
      const part = reference.totaux[rang] / reference.total;
      const sur = part > 0 ? Math.round(1 / part) : 0;
      sorties.push({ libelle: "PART DES FEMMES", valeur: pct(part), detail: sur >= 2 && sur <= 10 ? `1 agent sur ${sur}` : "des agents" });
    }
  }
  const grades = vueDe("grade");
  if (grades && !grades.vide) {
    const categorieA = grades.lignes.find((ligne) => ligne.niveau === 0 && /\bA$/i.test(ligne.libelle.trim()));
    if (categorieA) sorties.push({ libelle: "CATÉGORIE A", valeur: pct(categorieA.part ?? 0), detail: "des effectifs" });
  }
  const ages = vueDe("age");
  if (ages && !ages.vide) {
    const aines = ages.feuilles.filter((ligne) => /^(45|55|60)/.test(ligne.libelle)).reduce((somme, ligne) => somme + ligne.total, 0);
    sorties.push({ libelle: "45 ANS ET PLUS", valeur: pct(ages.total ? aines / ages.total : 0), detail: "des agents" });
  }
  const statuts = vueDe("statut");
  if (statuts && !statuts.vide) {
    const premier = [...statuts.feuilles].filter((ligne) => !ABSENT.test(ligne.libelle)).sort((a, b) => b.total - a.total)[0];
    if (premier) sorties.push({ libelle: premier.libelle.toUpperCase(), valeur: pct(premier.part ?? 0), detail: "des agents" });
  }
  if (grades && !grades.vide) {
    const absent = grades.feuilles.find((ligne) => ABSENT.test(ligne.libelle));
    sorties.push({ libelle: "GRADE NON RENSEIGNÉ", valeur: pct(absent?.part ?? 0), detail: "à fiabiliser" });
  }
  return sorties.slice(0, 6);
}

