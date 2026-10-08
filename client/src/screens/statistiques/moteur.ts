import type { FormeGraphique, SerieGraphique } from "../../ui/Graphique";

/**
 * Moteur du tableau croisé dynamique. Le serveur renvoie un cube : une ligne par
 * combinaison des champs demandés, avec le nombre d'enregistrements et les agrégats
 * des mesures. Ce module le fait pivoter : filtres, arborescence des lignes,
 * colonnes, sous-totaux, totaux généraux et pourcentages.
 */

export type Agregat = "nombre" | "somme" | "moyenne" | "min" | "max";
export type Affichage = "valeur" | "pct_total" | "pct_ligne" | "pct_colonne";
export type Zone = "filtres" | "colonnes" | "lignes" | "valeurs";

export type ValeurTcd = { mesure: string; agregat: Agregat; affichage: Affichage };
export type Selection = { inclus?: string[]; exclus?: string[] };

export type ConfigTcd = {
  source: string;
  /** Sources croisées avec la source du tableau (aujourd'hui : avec les dossiers agents). */
  croisements: string[];
  /** Période de chaque source croisée, en années ; une borne vide laisse la période ouverte. */
  periodes: Record<string, Periode>;
  filtres: string[];
  colonnes: string[];
  lignes: string[];
  valeurs: ValeurTcd[];
  selections: Record<string, Selection>;
  tri: { par: "libelle" | "valeur"; sens: "asc" | "desc" };
  options: { total_lignes: boolean; total_colonnes: boolean; sous_totaux: boolean };
  replies: string[];
  graphique: { visible: boolean; forme: FormeGraphique; etiquettes: boolean; legende: boolean; inverser: boolean; titre: string };
  /** Le nom du tableau suit son contenu tant que l'utilisateur ne l'a pas saisi lui-même. */
  nom_auto: boolean;
};

export type Periode = { de: number | null; a: number | null };
/** `detail` : champ propre à une source croisée ; un agent compte alors une fois par modalité. */
export type ChampCatalogue = { code: string; libelle: string; groupe: string; detail?: string };
export type MesureCatalogue = { code: string; libelle: string; numerique: boolean; groupe?: string };
export type CroisementCatalogue = { code: string; libelle: string; possible: boolean; motif: string };
export type SourceCatalogue = {
  code: string;
  libelle: string;
  champs: ChampCatalogue[];
  mesures: MesureCatalogue[];
  croisements?: CroisementCatalogue[];
  croises?: Record<string, { champs: ChampCatalogue[]; mesures: MesureCatalogue[]; annees: number[] }>;
};
export type Catalogue = { sources: SourceCatalogue[] };

/** La source du tableau, enrichie des champs et des mesures des sources croisées. */
export function sourceEffective(catalogue: Catalogue | undefined, config: Pick<ConfigTcd, "source" | "croisements">): SourceCatalogue | undefined {
  const source = catalogue?.sources.find((item) => item.code === config.source);
  if (!source) return undefined;
  const croises = config.croisements.map((code) => source.croises?.[code]).filter((item) => item !== undefined);
  if (!croises.length) return source;
  return {
    ...source,
    champs: [...source.champs, ...croises.flatMap((item) => item.champs)],
    mesures: [...source.mesures, ...croises.flatMap((item) => item.mesures)],
  };
}

/** Agrégats d'une mesure numérique : somme, nombre de valeurs, minimum, maximum. */
type Agregats = [number, number, number, number];
export type Cube = {
  source: { code: string; libelle: string };
  champs: { code: string; libelle: string }[];
  /** `a` : agents du groupe, présents quand une source croisée est détaillée. */
  groupes: { v: string[]; n: number; m: Record<string, Agregats>; a?: number[] }[];
  /** Source croisée détaillée : le nombre compte alors des agents distincts. */
  detail?: string | null;
  /** Mesures que ce calcul sait fournir. */
  mesures?: string[];
  total: number;
  calcule_le: string;
};

export const AGREGATS_ORDONNES: Agregat[] = ["nombre", "somme", "moyenne", "min", "max"];
export const AFFICHAGES_ORDONNES: Affichage[] = ["valeur", "pct_total", "pct_ligne", "pct_colonne"];

export const LIBELLES_AGREGAT: Record<Agregat, string> = {
  nombre: "Nombre",
  somme: "Somme",
  moyenne: "Moyenne",
  min: "Minimum",
  max: "Maximum",
};

export const LIBELLES_AFFICHAGE: Record<Affichage, string> = {
  valeur: "Valeur brute",
  pct_total: "% du total général",
  pct_ligne: "% du total de la ligne",
  pct_colonne: "% du total de la colonne",
};

export function configVide(source = "agents"): ConfigTcd {
  return {
    source,
    croisements: [],
    periodes: {},
    filtres: [],
    colonnes: [],
    lignes: [],
    valeurs: [{ mesure: "nombre", agregat: "nombre", affichage: "valeur" }],
    selections: {},
    tri: { par: "libelle", sens: "asc" },
    options: { total_lignes: true, total_colonnes: true, sous_totaux: true },
    replies: [],
    graphique: { visible: true, forme: "barre", etiquettes: true, legende: true, inverser: false, titre: "" },
    nom_auto: true,
  };
}

/** Complète une configuration reçue du serveur (ou d'une ancienne version) avec les réglages par défaut. */
export function configComplete(brute: Partial<ConfigTcd> | null | undefined): ConfigTcd {
  const base = configVide(brute?.source || "agents");
  if (!brute) return base;
  return {
    ...base,
    ...brute,
    croisements: brute.croisements ?? [],
    periodes: brute.periodes ?? {},
    filtres: brute.filtres ?? [],
    colonnes: brute.colonnes ?? [],
    lignes: brute.lignes ?? [],
    valeurs: brute.valeurs?.length ? brute.valeurs : base.valeurs,
    selections: brute.selections ?? {},
    tri: { ...base.tri, ...brute.tri },
    options: { ...base.options, ...brute.options },
    replies: brute.replies ?? [],
    graphique: { ...base.graphique, ...brute.graphique },
    nom_auto: brute.nom_auto === true,
  };
}

export function champsUtilises(config: ConfigTcd): string[] {
  return [...config.filtres, ...config.colonnes, ...config.lignes];
}

export function libelleValeur(valeur: ValeurTcd, source: SourceCatalogue | undefined): string {
  const mesure = source?.mesures.find((item) => item.code === valeur.mesure);
  const base = valeur.mesure === "nombre"
    ? "Nombre"
    : `${LIBELLES_AGREGAT[valeur.agregat]} ${de(minuscule(mesure?.libelle ?? valeur.mesure))}`;
  return valeur.affichage === "valeur" ? base : `${base} (${LIBELLES_AFFICHAGE[valeur.affichage]})`;
}

export function libelleChamp(code: string, source: SourceCatalogue | undefined): string {
  const champ = source?.champs.find((item) => item.code === code);
  if (!champ) return code;
  return champ.groupe ? `${champ.groupe} — ${champ.libelle}` : champ.libelle;
}

const SEP = "\u0001";
const TOTAL = "\u0002";
const comparateur = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** « de corps », « d'âge » : élision devant une voyelle ou un h muet. */
function de(mot: string): string {
  return /^[aeéèêiîoôuûyhAEÉÈÊIÎOÔUÛYH]/.test(mot) ? `d'${mot}` : `de ${mot}`;
}

function minuscule(texte: string): string {
  // Un sigle (« FCFA », « CGRAE ») garde ses capitales.
  return /^[A-ZÀ-Ý]{2}/.test(texte) ? texte : texte.replace(/^./, (lettre) => lettre.toLowerCase());
}

function enumerer(morceaux: string[]): string {
  if (morceaux.length <= 1) return morceaux.join("");
  return `${morceaux.slice(0, -1).join(", ")} et ${morceaux[morceaux.length - 1]}`;
}

/**
 * Nom tiré du contenu du tableau : ce qui est mesuré, sur quelle source, réparti par quels champs,
 * et les éléments retenus. « Nombre d'absences par nature et par année — hors Congé de maladie ».
 */
export function nomPropose(config: ConfigTcd, source: SourceCatalogue | undefined): string {
  const population = minuscule(source?.libelle ?? "enregistrements");
  const mesures = config.valeurs.map((valeur) => {
    if (valeur.mesure === "nombre") return `Nombre ${de(population)}`;
    const croisee = source?.mesures.find((item) => item.code === valeur.mesure && item.groupe);
    if (croisee && valeur.agregat === "somme") return croisee.libelle;
    const mesure = source?.mesures.find((item) => item.code === valeur.mesure);
    return `${LIBELLES_AGREGAT[valeur.agregat]} ${de(minuscule(mesure?.libelle ?? valeur.mesure))}`;
  });
  const uniques = [...new Set(mesures)];
  let nom = uniques.length > 2
    ? `${uniques[0]} et ${uniques.length - 1} autres valeurs`
    : enumerer(uniques.map((texte, rang) => (rang ? minuscule(texte) : texte)));
  if (config.valeurs.some((valeur) => valeur.affichage !== "valeur")) nom += " (en %)";

  const champ = (code: string) => {
    const trouve = source?.champs.find((item) => item.code === code);
    if (!trouve) return code;
    if (trouve.groupe === "Agent") return `${minuscule(trouve.libelle)} de l'agent`;
    if (trouve.detail) return `${minuscule(trouve.libelle)} (${minuscule(trouve.groupe)})`;
    return minuscule(trouve.libelle);
  };
  const axes = [...config.lignes, ...config.colonnes];
  if (axes.length) nom += ` ${enumerer(axes.map((code) => `par ${champ(code)}`))}`;

  const precisions: string[] = [];
  for (const code of [...config.filtres, ...axes]) {
    const choix = config.selections[code];
    if (choix?.inclus?.length && choix.inclus.length <= 3) precisions.push(choix.inclus.join(", "));
    else if (choix?.exclus?.length && choix.exclus.length <= 3) precisions.push(`hors ${choix.exclus.join(", ")}`);
    else if (choix) precisions.push(`${champ(code)} filtré`);
  }
  const croisees = config.croisements
    .filter((code) => !axes.some((champ) => champ.startsWith(`x.${code}.`)) && !config.valeurs.some((valeur) => valeur.mesure.startsWith(`x.${code}.`)))
    .map((code) => minuscule(source?.croisements?.find((item) => item.code === code)?.libelle ?? code));
  if (croisees.length) nom += `, croisé avec ${enumerer(croisees)}`;
  for (const code of config.croisements) {
    const periode = textePeriode(config.periodes[code]);
    if (periode) precisions.push(`${minuscule(source?.croisements?.find((item) => item.code === code)?.libelle ?? code)} ${periode}`);
  }
  if (precisions.length) nom += ` — ${precisions.join(" ; ")}`;
  return nom.length > 160 ? `${nom.slice(0, 157).trimEnd()}…` : nom;
}

type Accu = { n: number; m: Map<string, Agregats>; agents: Set<number> };

export type NoeudLigne = {
  cle: string;
  chemin: string[];
  libelle: string;
  niveau: number;
  enfants: NoeudLigne[];
};

export type LigneAffichee = {
  noeud: NoeudLigne;
  /** Ligne d'un groupe qui a des enfants (sous-total). */
  groupe: boolean;
  replie: boolean;
  /** Masquée parce qu'un parent est replié : utile à l'export, qui garde le plan Excel. */
  cachee: boolean;
  /** Affiche des valeurs : toujours pour une feuille, pour un groupe si sous-totaux ou replié. */
  chiffree: boolean;
};

export type ColonneFeuille = { cle: string; chemin: string[] };

export type ResultatTcd = {
  vide: boolean;
  enregistrements: number;
  colonnes: ColonneFeuille[];
  lignes: LigneAffichee[];
  /** Valeur affichée (fraction pour un pourcentage), ou null quand la case est vide. */
  cellule: (ligne: string, colonne: string, indice: number) => number | null;
  totalLigne: (ligne: string, indice: number) => number | null;
  totalColonne: (colonne: string, indice: number) => number | null;
  totalGeneral: (indice: number) => number | null;
  /** Modalités de chaque champ présent dans le cube, triées. */
  modalites: Record<string, string[]>;
  /** Groupes du cube retenus par les filtres, pour la feuille de données de l'export. */
  groupes: Cube["groupes"];
};

export function calculerTcd(cube: Cube | undefined, config: ConfigTcd): ResultatTcd {
  const position = new Map((cube?.champs ?? []).map((champ, indice) => [champ.code, indice]));
  const pret = Boolean(cube) && champsUtilises(config).every((code) => position.has(code));
  const groupes = pret && cube ? cube.groupes : [];

  const modalites: Record<string, string[]> = {};
  for (const [code, indice] of position) {
    const vues = new Set<string>();
    for (const groupe of groupes) vues.add(groupe.v[indice]);
    modalites[code] = [...vues].sort(comparateur.compare);
  }

  const retenu = (code: string, valeur: string) => {
    const choix = config.selections[code];
    if (!choix) return true;
    if (choix.inclus) return choix.inclus.includes(valeur);
    if (choix.exclus) return !choix.exclus.includes(valeur);
    return true;
  };
  const filtres = champsUtilises(config).filter((code) => config.selections[code]);
  const detail = pret && cube ? Boolean(cube.detail) : false;
  const disponibles = pret && cube?.mesures ? new Set(cube.mesures) : null;
  const retenus = groupes.filter((groupe) => filtres.every((code) => retenu(code, groupe.v[position.get(code) ?? 0])));

  const accus = new Map<string, Accu>();
  const ajouter = (cle: string, groupe: Cube["groupes"][number]) => {
    let accu = accus.get(cle);
    if (!accu) {
      accu = { n: 0, m: new Map(), agents: new Set() };
      accus.set(cle, accu);
    }
    accu.n += groupe.n;
    // Un agent présent dans plusieurs groupes ne compte qu'une fois dans le sous-total.
    if (groupe.a) for (const agent of groupe.a) accu.agents.add(agent);
    for (const [code, valeurs] of Object.entries(groupe.m)) {
      const courant = accu.m.get(code);
      if (!courant) accu.m.set(code, [...valeurs] as Agregats);
      else {
        courant[0] += valeurs[0];
        courant[1] += valeurs[1];
        courant[2] = Math.min(courant[2], valeurs[2]);
        courant[3] = Math.max(courant[3], valeurs[3]);
      }
    }
  };

  const racine: NoeudLigne = { cle: "", chemin: [], libelle: "", niveau: -1, enfants: [] };
  const index = new Map<string, NoeudLigne>([["", racine]]);
  const colonnesVues = new Map<string, string[]>();
  const iLignes = config.lignes.map((code) => position.get(code) ?? 0);
  const iColonnes = config.colonnes.map((code) => position.get(code) ?? 0);

  for (const groupe of retenus) {
    const cheminColonne = iColonnes.map((indice) => groupe.v[indice]);
    const cleColonne = cheminColonne.join(SEP);
    if (!colonnesVues.has(cleColonne)) colonnesVues.set(cleColonne, cheminColonne);
    let parent = racine;
    const cles = [""];
    iLignes.forEach((indice, niveau) => {
      const chemin = [...parent.chemin, groupe.v[indice]];
      const cle = chemin.join(SEP);
      let noeud = index.get(cle);
      if (!noeud) {
        noeud = { cle, chemin, libelle: groupe.v[indice], niveau, enfants: [] };
        index.set(cle, noeud);
        parent.enfants.push(noeud);
      }
      cles.push(cle);
      parent = noeud;
    });
    for (const cle of cles) {
      ajouter(`${cle}${TOTAL}${cleColonne}`, groupe);
      ajouter(`${cle}${TOTAL}${TOTAL}`, groupe);
    }
  }

  const brute = (cle: string, valeur: ValeurTcd): number | null => {
    const accu = accus.get(cle);
    if (!accu || accu.n === 0) return null;
    if (valeur.mesure === "nombre") return detail ? accu.agents.size : accu.n;
    if (disponibles && !disponibles.has(valeur.mesure)) return null;
    const agregats = accu.m.get(valeur.mesure);
    if (!agregats || agregats[1] === 0) return null;
    switch (valeur.agregat) {
      case "nombre": return agregats[1];
      case "somme": return agregats[0];
      case "moyenne": return agregats[0] / agregats[1];
      case "min": return agregats[2];
      case "max": return agregats[3];
    }
  };
  const affichee = (ligne: string, colonne: string, indice: number): number | null => {
    const valeur = config.valeurs[indice];
    if (!valeur) return null;
    const nombre = brute(`${ligne}${TOTAL}${colonne}`, valeur);
    if (nombre === null || valeur.affichage === "valeur") return nombre;
    const reference = valeur.affichage === "pct_total"
      ? brute(`${TOTAL}${TOTAL}`, valeur)
      : valeur.affichage === "pct_ligne"
        ? brute(`${ligne}${TOTAL}${TOTAL}`, valeur)
        : brute(`${TOTAL}${colonne}`, valeur);
    return reference ? nombre / reference : null;
  };

  const premier = config.valeurs[0];
  const poids = (noeud: NoeudLigne) => (premier ? brute(`${noeud.cle}${TOTAL}${TOTAL}`, premier) ?? 0 : 0);
  const sens = config.tri.sens === "desc" ? -1 : 1;
  const trier = (noeuds: NoeudLigne[]) => {
    noeuds.sort((a, b) => {
      const ordre = config.tri.par === "valeur" ? poids(a) - poids(b) || comparateur.compare(a.libelle, b.libelle) : comparateur.compare(a.libelle, b.libelle);
      return ordre * sens;
    });
    noeuds.forEach((noeud) => trier(noeud.enfants));
  };
  trier(racine.enfants);

  const replies = new Set(config.replies);
  const lignes: LigneAffichee[] = [];
  const parcourir = (noeuds: NoeudLigne[], cachee: boolean) => {
    for (const noeud of noeuds) {
      const groupe = noeud.enfants.length > 0;
      const replie = groupe && replies.has(noeud.cle);
      lignes.push({ noeud, groupe, replie, cachee, chiffree: !groupe || replie || config.options.sous_totaux });
      if (groupe) parcourir(noeud.enfants, cachee || replie);
    }
  };
  parcourir(racine.enfants, false);

  const colonnes = [...colonnesVues.entries()]
    .map(([cle, chemin]) => ({ cle, chemin }))
    .sort((a, b) => {
      for (let indice = 0; indice < a.chemin.length; indice += 1) {
        const ordre = comparateur.compare(a.chemin[indice], b.chemin[indice]);
        if (ordre) return ordre;
      }
      return 0;
    });

  return {
    vide: retenus.length === 0,
    enregistrements: detail
      ? new Set(retenus.flatMap((groupe) => groupe.a ?? [])).size
      : retenus.reduce((somme, groupe) => somme + groupe.n, 0),
    colonnes,
    lignes,
    cellule: (ligne, colonne, indice) => affichee(ligne, colonne, indice),
    totalLigne: (ligne, indice) => affichee(ligne, TOTAL, indice),
    totalColonne: (colonne, indice) => affichee("", colonne, indice),
    totalGeneral: (indice) => affichee("", TOTAL, indice),
    modalites,
    groupes: retenus,
  };
}

/** Clé de colonne qui réunit toutes les colonnes (total de la ligne). */
export const CLE_TOTAL = TOTAL;

/** Valeurs du tableau que le calcul ne fournit pas (l'âge des agents quand on détaille les absences). */
export function valeursIndisponibles(cube: Cube | undefined, config: ConfigTcd): ValeurTcd[] {
  if (!cube?.mesures) return [];
  const disponibles = new Set(cube.mesures);
  return config.valeurs.filter((valeur) => !disponibles.has(valeur.mesure));
}

/** « 2025 », « 2024 à 2026 », « depuis 2024 », « jusqu'en 2025 » ; chaîne vide sans période. */
export function textePeriode(periode: Periode | undefined): string {
  if (!periode || (periode.de === null && periode.a === null)) return "";
  if (periode.de !== null && periode.a !== null) return periode.de === periode.a ? String(periode.de) : `${periode.de} à ${periode.a}`;
  return periode.de !== null ? `depuis ${periode.de}` : `jusqu'en ${periode.a}`;
}

export function estPourcentage(valeur: ValeurTcd | undefined): boolean {
  return Boolean(valeur && valeur.affichage !== "valeur");
}

export function formaterValeur(nombre: number | null, valeur: ValeurTcd | undefined): string {
  if (nombre === null) return "";
  if (estPourcentage(valeur)) return `${(nombre * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
  const decimales = Number.isInteger(nombre) ? 0 : 2;
  return nombre.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Lignes et séries du graphique croisé : les lignes visibles terminales, une série par colonne et par valeur. */
export function seriesGraphique(resultat: ResultatTcd, config: ConfigTcd, source: SourceCatalogue | undefined): { categories: string[]; series: SerieGraphique[] } {
  const terminales = resultat.lignes.filter((ligne) => !ligne.cachee && (!ligne.groupe || ligne.replie));
  const categories = terminales.length ? terminales.map((ligne) => ligne.noeud.chemin.join(" · ")) : ["Total"];
  const clesLignes = terminales.length ? terminales.map((ligne) => ligne.noeud.cle) : [""];
  const plusieurs = config.valeurs.length > 1;
  const colonnes = config.colonnes.length ? resultat.colonnes : [{ cle: CLE_TOTAL, chemin: [] }];
  const series: SerieGraphique[] = [];
  config.valeurs.forEach((valeur, indice) => {
    const pourcentage = estPourcentage(valeur);
    for (const colonne of colonnes) {
      const morceaux = [...colonne.chemin];
      if (plusieurs || !morceaux.length) morceaux.push(libelleValeur(valeur, source));
      series.push({
        nom: morceaux.join(" · "),
        points: clesLignes.map((cle, rang) => {
          const nombre = resultat.cellule(cle, colonne.cle, indice) ?? 0;
          return { libelle: categories[rang], total: pourcentage ? Math.round(nombre * 1000) / 10 : Math.round(nombre * 100) / 100 };
        }),
      });
    }
  });
  if (!config.graphique.inverser) return { categories, series };
  return {
    categories: series.map((serie) => serie.nom),
    series: categories.map((categorie, rang) => ({
      nom: categorie,
      points: series.map((serie) => ({ libelle: serie.nom, total: serie.points[rang]?.total ?? 0 })),
    })),
  };
}
