import { couleursCourantes, encreSur, melanger, paletteGraphique } from "../../ui/Couleurs";
import { colonne, nomFichierGraphique } from "../../ui/classeurGraphique";
import { nomFeuille, plage, telechargerClasseur, type CelluleX, type FeuilleX, type LigneX, type StyleX } from "../../ui/classeurXlsx";
import {
  calculerTcd,
  CLE_TOTAL,
  estPourcentage,
  libelleChamp,
  libelleValeur,
  seriesGraphique,
  type ConfigTcd,
  type Cube,
  type SourceCatalogue,
} from "./moteur";

export type TableauExporte = { nom: string; config: ConfigTcd; cube: Cube; source: SourceCatalogue | undefined };

/** Un classeur : pour chaque tableau, une feuille (tableau croisé et graphique Excel) et une feuille de données. */
export function exporterClasseurTcd(tableaux: TableauExporte[], nomFichier?: string): void {
  const nom = nomFichier ?? nomFichierGraphique(tableaux.length === 1 ? tableaux[0].nom : "tableaux-croises");
  telechargerClasseur(feuillesTcd(tableaux), nom);
}

export function feuillesTcd(tableaux: TableauExporte[]): FeuilleX[] {
  const pris = new Set<string>();
  const feuilles: FeuilleX[] = [];
  for (const tableau of tableaux) {
    const nom = nomFeuille(tableau.nom, pris);
    const donnees = nomFeuille(`${tableau.nom.slice(0, 20)} (données)`, pris);
    feuilles.push(feuilleTableau(nom, donnees, tableau));
    feuilles.push(feuilleDonnees(donnees, tableau));
  }
  return feuilles;
}

function teintes() {
  const { principale, accent } = couleursCourantes();
  const fond = principale.replace("#", "");
  return {
    principale: fond,
    encre: encreSur(principale).replace("#", ""),
    groupe: melanger(principale, "#FFFFFF", 0.9).replace("#", ""),
    total: melanger(principale, "#FFFFFF", 0.8).replace("#", ""),
    filtre: melanger(accent, "#FFFFFF", 0.55).replace("#", ""),
    palette: paletteGraphique(couleursCourantes()),
  };
}

function feuilleTableau(nom: string, nomDonnees: string, tableau: TableauExporte): FeuilleX {
  const { config, cube, source } = tableau;
  const t = teintes();
  const resultat = calculerTcd(cube, config);
  const valeurs = config.valeurs;
  const avecColonnes = config.colonnes.length > 0;
  const totalColonne = avecColonnes && config.options.total_colonnes;
  const colonnes = avecColonnes ? resultat.colonnes : [{ cle: CLE_TOTAL, chemin: [] as string[] }];

  const entete: StyleX = { gras: true, couleur: t.encre, fond: t.principale, bordure: "fine", retour: true };
  const sousEntete: StyleX = { gras: true, couleur: "1C1C1C", fond: t.total, bordure: "fine", retour: true };
  const format = (indice: number, nombre: number | null): StyleX["format"] => {
    if (estPourcentage(valeurs[indice])) return "pourcent";
    return nombre !== null && !Number.isInteger(nombre) ? "decimal" : "entier";
  };

  const lignes: LigneX[] = [];
  const fusions: string[] = [];
  const poser = (ligne: LigneX) => {
    lignes.push(ligne);
    return lignes.length;
  };

  poser({ cellules: [{ v: tableau.nom, s: { gras: true, taille: 15, couleur: t.principale } }], hauteur: 24 });
  const calcule = new Date(cube.calcule_le).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  poser({ cellules: [{ v: `Source : ${cube.source.libelle} · ${resultat.enregistrements.toLocaleString("fr-FR")} ${cube.detail ? "agents" : "enregistrements"} retenus · calculé le ${calcule}`, s: { italique: true, couleur: "5B6472" } }] });
  poser({ cellules: [{ v: `Les combinaisons détaillées sont sur la feuille « ${nomDonnees} » : elle se prête à un tableau croisé Excel.`, s: { italique: true, couleur: "5B6472" } }] });
  poser({ cellules: [] });

  for (const code of config.filtres) {
    const choix = config.selections[code];
    const retenues = (resultat.modalites[code] ?? []).filter((valeur) => {
      if (choix?.inclus) return choix.inclus.includes(valeur);
      if (choix?.exclus) return !choix.exclus.includes(valeur);
      return true;
    });
    const texte = !choix || retenues.length === (resultat.modalites[code] ?? []).length
      ? "(Tous)"
      : retenues.length <= 4 ? retenues.join(", ") || "(Aucun)" : `(${retenues.length} éléments)`;
    poser({ cellules: [{ v: libelleChamp(code, source), s: { gras: true, fond: t.filtre, bordure: "fine" } }, { v: texte, s: { fond: t.filtre, bordure: "fine" } }] });
  }
  if (config.filtres.length) poser({ cellules: [] });

  // En-têtes : un rang par niveau de colonne, plus un rang des valeurs quand il y en a plusieurs.
  const rangValeurs = valeurs.length > 1 || !avecColonnes;
  const hauteurEntete = (avecColonnes ? config.colonnes.length : 0) + (rangValeurs ? 1 : 0);
  const debutEntete = lignes.length + 1;
  const largeurDonnees = colonnes.length * valeurs.length + (totalColonne ? valeurs.length : 0);
  const enTetes: (CelluleX | null)[][] = Array.from({ length: hauteurEntete }, () => Array(1 + largeurDonnees).fill(null));
  const coin = config.lignes.map((code) => libelleChamp(code, source)).join(" / ") || " ";
  enTetes.forEach((rang, indice) => {
    rang[0] = { v: indice === hauteurEntete - 1 ? coin : indice === 0 && valeurs.length === 1 ? libelleValeur(valeurs[0], source) : null, s: entete };
  });
  if (avecColonnes) {
    config.colonnes.forEach((_, niveau) => {
      let debut = 0;
      while (debut < colonnes.length) {
        let fin = debut;
        const prefixe = colonnes[debut].chemin.slice(0, niveau + 1).join("\u0001");
        while (fin + 1 < colonnes.length && colonnes[fin + 1].chemin.slice(0, niveau + 1).join("\u0001") === prefixe) fin += 1;
        const x1 = 1 + debut * valeurs.length;
        const x2 = 1 + (fin + 1) * valeurs.length - 1;
        enTetes[niveau][x1] = { v: colonnes[debut].chemin[niveau], s: { ...entete, aligne: "center" } };
        for (let x = x1 + 1; x <= x2; x += 1) enTetes[niveau][x] = { v: null, s: entete };
        if (x2 > x1) fusions.push(`${ref(x1, debutEntete + niveau)}:${ref(x2, debutEntete + niveau)}`);
        debut = fin + 1;
      }
    });
  }
  if (rangValeurs) {
    const rang = enTetes[hauteurEntete - 1];
    colonnes.forEach((_, indiceColonne) => {
      valeurs.forEach((valeur, indice) => {
        rang[1 + indiceColonne * valeurs.length + indice] = { v: libelleValeur(valeur, source), s: { ...sousEntete, aligne: "right" } };
      });
    });
  }
  if (totalColonne) {
    valeurs.forEach((valeur, indice) => {
      const x = 1 + colonnes.length * valeurs.length + indice;
      const texte = valeurs.length > 1 ? `Total — ${libelleValeur(valeur, source)}` : "Total général";
      enTetes[0][x] = { v: texte, s: { ...entete, aligne: "right" } };
      for (let niveau = 1; niveau < hauteurEntete; niveau += 1) enTetes[niveau][x] = { v: null, s: entete };
      if (hauteurEntete > 1) fusions.push(`${ref(x, debutEntete)}:${ref(x, debutEntete + hauteurEntete - 1)}`);
    });
  }
  enTetes.forEach((cellules) => poser({ cellules, hauteur: 30 }));

  const chiffres = (cle: string, groupe: boolean, total: boolean): (CelluleX | null)[] => {
    const cellules: (CelluleX | null)[] = [];
    const style = (indice: number, nombre: number | null): StyleX => ({
      format: format(indice, nombre),
      bordure: total ? "total" : "fine",
      gras: groupe || total,
      fond: total ? t.total : groupe ? t.groupe : undefined,
    });
    colonnes.forEach((colonne) => {
      valeurs.forEach((_, indice) => {
        const nombre = total ? resultat.totalColonne(colonne.cle, indice) : resultat.cellule(cle, colonne.cle, indice);
        cellules.push({ v: nombre, s: style(indice, nombre) });
      });
    });
    if (totalColonne) {
      valeurs.forEach((_, indice) => {
        const nombre = total ? resultat.totalGeneral(indice) : resultat.totalLigne(cle, indice);
        cellules.push({ v: nombre, s: { ...style(indice, nombre), gras: true } });
      });
    }
    return cellules;
  };

  let largeurLibelle = Math.max(18, coin.length + 2);
  for (const ligne of resultat.lignes) {
    const { noeud } = ligne;
    largeurLibelle = Math.max(largeurLibelle, noeud.libelle.length + noeud.niveau * 2 + 4);
    const vide: (CelluleX | null)[] = Array.from({ length: largeurDonnees }, () => ({ v: null, s: { bordure: "fine" as const, fond: ligne.groupe ? t.groupe : undefined } }));
    poser({
      cellules: [
        { v: noeud.libelle, s: { gras: ligne.groupe, fond: ligne.groupe ? t.groupe : undefined, bordure: "fine", retrait: noeud.niveau } },
        ...(ligne.chiffree ? chiffres(noeud.cle, ligne.groupe, false) : vide),
      ],
      niveau: noeud.niveau,
      cachee: ligne.cachee,
      repliee: ligne.replie,
    });
  }
  if (config.options.total_lignes || !config.lignes.length) {
    poser({ cellules: [{ v: "Total général", s: { gras: true, fond: t.total, bordure: "total" } }, ...chiffres("", false, true)] });
  }

  // Données du graphique, sous le tableau : les séries du graphique Excel pointent sur ces cellules.
  const graphiques: FeuilleX["graphiques"] = [];
  if (config.graphique.visible && !resultat.vide) {
    const { categories, series } = seriesGraphique(resultat, config, source);
    const circulaire = config.graphique.forme === "secteur" || config.graphique.forme === "anneau" || config.graphique.forme === "entonnoir";
    poser({ cellules: [] });
    poser({ cellules: [] });
    poser({ cellules: [{ v: "Données du graphique", s: { gras: true, couleur: t.principale, taille: 12 } }] });
    const rangEntete = poser({
      cellules: [
        { v: config.graphique.inverser ? "Série" : coin.trim() || "Catégorie", s: entete },
        ...series.map((serie) => ({ v: serie.nom, s: { ...entete, aligne: "right" as const } })),
      ],
      hauteur: 30,
    });
    categories.forEach((categorie, rang) => {
      poser({
        cellules: [
          { v: categorie, s: { bordure: "fine" } },
          ...series.map((serie) => {
            const total = serie.points[rang]?.total || null;
            return { v: total, s: { bordure: "fine" as const, format: total === null || Number.isInteger(total) ? "entier" as const : "decimal" as const } };
          }),
        ],
      });
    });
    const premiere = rangEntete + 1;
    const derniere = rangEntete + categories.length;
    const largeurTableau = 1 + largeurDonnees;
    graphiques.push({
      forme: config.graphique.forme,
      titre: config.graphique.titre || tableau.nom,
      etiquettes: config.graphique.etiquettes,
      legende: config.graphique.legende,
      categories: { plage: plage(nom, 1, premiere, 1, derniere), valeurs: categories },
      series: (circulaire ? series.slice(-1) : series).map((serie) => {
        const indice = series.indexOf(serie);
        return {
          nom: serie.nom,
          plageNom: plage(nom, indice + 2, rangEntete),
          plage: plage(nom, indice + 2, premiere, indice + 2, derniere),
          valeurs: serie.points.map((point) => point.total || null),
          couleur: t.palette[indice % t.palette.length],
          encre: encreSur(t.palette[indice % t.palette.length]),
        };
      }),
      couleursPoints: categories.map((_, indice) => t.palette[indice % t.palette.length]),
      ancre: { colonne: largeurTableau + 1, ligne: debutEntete - 1, colonne2: largeurTableau + 10, ligne2: debutEntete + 21 },
    });
  }

  return {
    nom,
    onglet: t.principale,
    lignes,
    largeurs: [Math.min(60, largeurLibelle), ...Array.from({ length: Math.max(largeurDonnees, 1) }, () => 15)],
    fusions,
    figer: debutEntete + hauteurEntete - 1 <= 12 ? { lignes: debutEntete + hauteurEntete - 1, colonnes: 1 } : undefined,
    graphiques,
    quadrillage: false,
  };
}

function feuilleDonnees(nom: string, tableau: TableauExporte): FeuilleX {
  const { config, cube, source } = tableau;
  const t = teintes();
  const resultat = calculerTcd(cube, config);
  const position = new Map(cube.champs.map((champ, indice) => [champ.code, indice]));
  const champs = [...config.lignes, ...config.colonnes, ...config.filtres].filter((code) => position.has(code));
  const mesures = [...new Set(config.valeurs.map((valeur) => valeur.mesure).filter((code) => code !== "nombre"))];
  const libelleMesure = (code: string) => source?.mesures.find((item) => item.code === code)?.libelle ?? code;
  const entete: StyleX = { gras: true, couleur: t.encre, fond: t.principale, bordure: "fine", retour: true };
  const titres = [
    ...champs.map((code) => libelleChamp(code, source)),
    cube.detail ? `Enregistrements (${cube.detail})` : "Nombre d'enregistrements",
    ...(cube.detail ? ["Agents distincts"] : []),
    ...mesures.flatMap((code) => [`${libelleMesure(code)} — somme`, `${libelleMesure(code)} — valeurs renseignées`, `${libelleMesure(code)} — minimum`, `${libelleMesure(code)} — maximum`]),
  ];
  const lignes: LigneX[] = [{ cellules: titres.map((titre) => ({ v: titre, s: entete })), hauteur: 32 }];
  for (const groupe of resultat.groupes) {
    lignes.push({
      cellules: [
        ...champs.map((code) => ({ v: groupe.v[position.get(code) ?? 0], s: { bordure: "fine" as const } })),
        { v: groupe.n, s: { bordure: "fine", format: "entier" } },
        ...(cube.detail ? [{ v: groupe.a?.length ?? 0, s: { bordure: "fine" as const, format: "entier" as const } }] : []),
        ...mesures.flatMap((code) => {
          const agregats = groupe.m[code];
          return [0, 1, 2, 3].map((rang) => {
            const nombre = agregats ? agregats[rang] : null;
            return { v: nombre, s: { bordure: "fine" as const, format: nombre !== null && !Number.isInteger(nombre) ? "decimal" as const : "entier" as const } };
          });
        }),
      ],
    });
  }
  return {
    nom,
    onglet: t.palette[1]?.replace("#", ""),
    lignes,
    largeurs: titres.map((titre, indice) => (indice < champs.length ? 28 : Math.min(26, Math.max(14, titre.length / 1.6)))),
    figer: { lignes: 1, colonnes: 0 },
    filtre: resultat.groupes.length ? `A1:${ref(titres.length - 1, lignes.length)}` : undefined,
  };
}

/** Référence A1 d'une cellule ; x commence à 0, y à 1. */
function ref(x: number, y: number): string {
  return `${colonne(x + 1)}${y}`;
}
