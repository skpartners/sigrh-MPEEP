import type { SerieGraphique } from "./Graphique";

const PALETTE = ["004428", "0A5E3A", "9E4300", "495167", "8CD6A9", "FE7B28", "333A4F"];
const ENCRE_CLAIRE = new Set(["8CD6A9", "FE7B28"]);

type Cellule = string | number | null;
type StyleCellule = number;

type Feuille = {
  nom: string;
  onglet: string;
  lignes: Cellule[][];
  styles: StyleCellule[][];
  largeurs: number[];
  figer?: number;
  filtre?: string;
  fusions?: string[];
  hauteurs?: Map<number, number>;
};

export type EntreeGraphique = {
  titre: string;
  detail?: string;
  series: SerieGraphique[];
};

/** Classeur .xlsx des valeurs d'un graphique : feuille Guide puis feuille Données. */
export function octetsClasseurGraphique(entree: EntreeGraphique): Uint8Array {
  const titre = entree.titre.trim() || "Graphique";
  const colonnes = colonnesDonnees(entree.series);
  return zipper({
    "[Content_Types].xml": contentTypes(),
    "_rels/.rels": relsRacine(),
    "xl/workbook.xml": workbook(),
    "xl/_rels/workbook.xml.rels": relsWorkbook(),
    "xl/styles.xml": styles(),
    "xl/worksheets/sheet1.xml": feuilleXml(feuilleGuide(titre, entree.detail?.trim() ?? "", entree.series, colonnes)),
    "xl/worksheets/sheet2.xml": feuilleXml(feuilleDonnees(colonnes)),
  });
}

export function nomFichierGraphique(titre: string): string {
  const base = titre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "graphique"}.xlsx`;
}

export function telechargerClasseurGraphique(entree: EntreeGraphique): void {
  telechargerOctets(octetsClasseurGraphique(entree), nomFichierGraphique(entree.titre));
}

export type ColonneClasseur = {
  entete: string;
  texte: string;
  genre: "texte" | "nombre";
  somme?: boolean;
};

export type EntreeTableau = {
  titre: string;
  detail?: string;
  lecture: string;
  colonnes: ColonneClasseur[];
  lignes: (string | number | null)[][];
  surligne?: number;
  reperes?: { libelle: string; valeur: string | number }[];
};

/** Classeur .xlsx d'un tableau : feuille Guide puis feuille Données. */
export function telechargerClasseurTableau(entree: EntreeTableau): void {
  const titre = entree.titre.trim() || "Tableau";
  const colonnes = entree.colonnes.length ? entree.colonnes : [{ entete: "Libellé", texte: "Aucune colonne.", genre: "texte" as const }];
  const lignes = entree.lignes.map((ligne) => colonnes.map((_, index) => ligne[index] ?? null));
  const avecTotal = colonnes.some((colonne) => colonne.somme) && lignes.length > 0;
  const donnees = lignesDonnees(colonnes, lignes, entree.surligne, avecTotal);
  const reperes = [
    { libelle: "Lignes", valeur: lignes.length },
    ...(entree.reperes ?? []),
  ];
  const classeur = zipper({
    "[Content_Types].xml": contentTypes(),
    "_rels/.rels": relsRacine(),
    "xl/workbook.xml": workbook(),
    "xl/_rels/workbook.xml.rels": relsWorkbook(),
    "xl/styles.xml": styles(),
    "xl/worksheets/sheet1.xml": feuilleXml(feuilleExplicative({
      titre,
      detail: entree.detail?.trim() ?? "",
      lecture: entree.lecture,
      colonnes,
      total: avecTotal
        ? "La dernière ligne additionne les colonnes indiquées comme totalisées. Les pourcentages et les textes ne sont pas additionnés. Une cellule vide n'est pas comptée comme un zéro."
        : null,
      reperes,
    })),
    "xl/worksheets/sheet2.xml": feuilleXml({
      nom: "Données",
      onglet: "9E4300",
      lignes: donnees.lignes,
      styles: donnees.styles,
      largeurs: colonnes.map((colonne, index) => (index === 0 || colonne.genre === "texte" ? Math.min(42, Math.max(18, colonne.entete.length + 6)) : Math.min(28, Math.max(14, colonne.entete.length + 4)))),
      figer: 1,
      filtre: lignes.length > 0 ? `A1:${colonne(colonnes.length)}${lignes.length + 1}` : undefined,
    }),
  });
  telechargerOctets(classeur, nomFichierGraphique(titre));
}

export function telechargerOctets(octets: Uint8Array, nom: string): void {
  const fichier = new ArrayBuffer(octets.byteLength);
  new Uint8Array(fichier).set(octets);
  const blob = new Blob([fichier], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(url);
}

type Colonne = { entete: string; cle: "libelle" | "serie" | "ecart" | "total" | "part"; serie?: number; texte: string };

function colonnesDonnees(series: SerieGraphique[]): { colonnes: Colonne[]; lignes: Cellule[][]; styles: StyleCellule[][] } {
  const noms = nomsSeries(series);
  const categories = categoriesOrdonnees(series);
  const colonnes: Colonne[] = [
    {
      entete: "Libellé",
      cle: "libelle",
      texte: "Catégorie portée sur l'axe du graphique, ou nom de chaque secteur. L'ordre est celui du graphique.",
    },
  ];
  noms.forEach((nom, index) => {
    colonnes.push({
      entete: nom,
      cle: "serie",
      serie: index,
      texte: `Valeur tracée pour la série « ${nom} ». C'est le nombre lu sur la barre, la courbe ou le secteur.`,
    });
  });
  if (noms.length === 2) {
    colonnes.push({
      entete: "Écart",
      cle: "ecart",
      texte: `« ${noms[1]} » moins « ${noms[0]} ». Un nombre négatif indique une baisse de la seconde série par rapport à la première.`,
    });
  }
  if (noms.length > 1) {
    colonnes.push({
      entete: "Total",
      cle: "total",
      texte: "Somme des séries de la ligne.",
    });
  }
  colonnes.push({
    entete: "Part (%)",
    cle: "part",
    texte: noms.length > 1
      ? "Poids de la ligne dans la somme de toutes les valeurs, en pourcentage arrondi au dixième."
      : `Poids de la catégorie dans la série « ${noms[0] ?? "Total"} », en pourcentage arrondi au dixième.`,
  });

  const valeurs = series.map((serie) => new Map(serie.points.map((point) => [point.libelle, point.total])));
  const corps = categories.map((libelle) => noms.map((_, index) => valeurs[index].get(libelle) ?? 0));
  const grand = corps.reduce((somme, ligne) => somme + ligne.reduce((total, valeur) => total + valeur, 0), 0);

  const lignes: Cellule[][] = [colonnes.map((colonne) => colonne.entete)];
  const styles: StyleCellule[][] = [colonnes.map((colonne, index) => styleEntete(colonne, index))];
  corps.forEach((ligne, index) => {
    const libelle = categories[index] ?? "";
    const alterne = index % 2 === 1;
    const total = ligne.reduce((somme, valeur) => somme + valeur, 0);
    const cellules: Cellule[] = [];
    const styleLigne: StyleCellule[] = [];
    colonnes.forEach((colonne) => {
      if (colonne.cle === "libelle") {
        cellules.push(libelle);
        styleLigne.push(alterne ? 9 : 8);
      } else if (colonne.cle === "serie") {
        cellules.push(ligne[colonne.serie ?? 0] ?? 0);
        styleLigne.push(styleNombre(ligne[colonne.serie ?? 0] ?? 0, alterne));
      } else if (colonne.cle === "ecart") {
        const ecart = (ligne[1] ?? 0) - (ligne[0] ?? 0);
        cellules.push(ecart);
        styleLigne.push(styleNombre(ecart, alterne));
      } else if (colonne.cle === "total") {
        cellules.push(total);
        styleLigne.push(styleNombre(total, alterne));
      } else {
        cellules.push(grand ? Math.round((total / grand) * 1000) / 10 : 0);
        styleLigne.push(alterne ? 13 : 12);
      }
    });
    lignes.push(cellules);
    styles.push(styleLigne);
  });

  if (corps.length > 0) {
    const totaux: Cellule[] = [];
    const styleTotal: StyleCellule[] = [];
    colonnes.forEach((colonne) => {
      if (colonne.cle === "libelle") {
        totaux.push("Total");
        styleTotal.push(19);
      } else if (colonne.cle === "part") {
        totaux.push(grand ? 100 : 0);
        styleTotal.push(21);
      } else {
        const somme = corps.reduce((acc, ligne) => {
          if (colonne.cle === "serie") return acc + (ligne[colonne.serie ?? 0] ?? 0);
          if (colonne.cle === "ecart") return acc + ((ligne[1] ?? 0) - (ligne[0] ?? 0));
          return acc + ligne.reduce((s, valeur) => s + valeur, 0);
        }, 0);
        totaux.push(somme);
        styleTotal.push(Number.isInteger(somme) ? 20 : 21);
      }
    });
    lignes.push(totaux);
    styles.push(styleTotal);
  }
  return { colonnes, lignes, styles };
}

function feuilleDonnees(contenu: ReturnType<typeof colonnesDonnees>): Feuille {
  const derniereDonnee = Math.max(1, contenu.lignes.length - (contenu.lignes.length > 1 ? 1 : 0));
  return {
    nom: "Données",
    onglet: "9E4300",
    lignes: contenu.lignes,
    styles: contenu.styles,
    largeurs: contenu.colonnes.map((colonne, index) => (index === 0 ? 36 : Math.min(28, Math.max(14, colonne.entete.length + 4)))),
    figer: 1,
    filtre: contenu.lignes.length > 1 ? `A1:${colonne(contenu.colonnes.length)}${derniereDonnee}` : undefined,
  };
}

function feuilleGuide(titre: string, detail: string, series: SerieGraphique[], contenu: ReturnType<typeof colonnesDonnees>): Feuille {
  return feuilleExplicative({
    titre,
    detail,
    lecture: `La feuille Données reprend les valeurs du graphique « ${titre} ». Chaque ligne est une catégorie, dans le même ordre que sur le graphique. Chaque colonne de série est une barre, une courbe ou un secteur.`,
    colonnes: contenu.colonnes,
    total: contenu.lignes.length > 1
      ? "La dernière ligne additionne chaque colonne de valeurs. La part de cette ligne vaut 100 lorsque le total général n'est pas nul."
      : "Aucune catégorie n'est tracée pour le filtre en cours : la feuille Données ne contient que les en-têtes, et il n'y a pas de ligne Total.",
    reperes: [
      { libelle: "Catégories", valeur: categoriesOrdonnees(series).length },
      { libelle: "Séries", valeur: series.length ? series.map((serie) => serie.nom).join(", ") : "Aucune" },
    ],
  });
}

function feuilleExplicative(opts: {
  titre: string;
  detail: string;
  lecture: string;
  colonnes: { entete: string; texte: string }[];
  total: string | null;
  reperes: { libelle: string; valeur: Cellule }[];
}): Feuille {
  const lignes: Cellule[][] = [];
  const stylesLignes: StyleCellule[][] = [];
  const hauteurs = new Map<number, number>();
  const fusions: string[] = [];
  const poser = (gauche: Cellule, droite: Cellule, styleGauche: number, styleDroite: number, hauteur?: number) => {
    lignes.push([gauche, droite]);
    stylesLignes.push([styleGauche, styleDroite]);
    if (hauteur) hauteurs.set(lignes.length, hauteur);
  };
  const bande = (texte: string) => {
    fusions.push(`A${lignes.length + 1}:B${lignes.length + 1}`);
    poser(texte, null, 15, 15, 18);
  };

  fusions.push("A1:B1");
  poser("Guide de lecture", null, 14, 14, 26);
  poser(opts.titre, null, 22, 22, 18);
  fusions.push(`A${lignes.length}:B${lignes.length}`);
  if (opts.detail) {
    poser(opts.detail, null, 18, 18, 18);
    fusions.push(`A${lignes.length}:B${lignes.length}`);
  }
  poser(null, null, 0, 0);
  bande("Ce que contient ce classeur");
  poser("Lecture", opts.lecture, 16, 17, 32);
  poser(null, null, 0, 0);
  bande("Colonnes de la feuille Données");
  poser("Colonne", "Ce qu'elle contient", 1, 1, 18);
  opts.colonnes.forEach((item) => poser(item.entete, item.texte, 16, 17, 18));
  if (opts.total) {
    poser(null, null, 0, 0);
    bande("Ligne Total");
    poser("Total", opts.total, 16, 17, 20);
  }
  poser(null, null, 0, 0);
  bande("Repères");
  poser("Généré le", new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }), 16, 17, 20);
  opts.reperes.forEach((repere) => poser(repere.libelle, repere.valeur, 16, typeof repere.valeur === "number" ? 10 : 17, 20));

  return {
    nom: "Guide",
    onglet: "004428",
    lignes,
    styles: stylesLignes,
    largeurs: [28, 78],
    fusions,
    hauteurs,
  };
}

function lignesDonnees(
  colonnes: ColonneClasseur[],
  corps: (string | number | null)[][],
  surligne: number | undefined,
  avecTotal: boolean,
): { lignes: Cellule[][]; styles: StyleCellule[][] } {
  const lignes: Cellule[][] = [colonnes.map((item) => item.entete)];
  const stylesLignes: StyleCellule[][] = [colonnes.map((_, index) => styleColonne(index, surligne))];
  corps.forEach((ligne, index) => {
    const alterne = index % 2 === 1;
    lignes.push(ligne);
    stylesLignes.push(ligne.map((valeur) => {
      if (typeof valeur === "number") return styleNombre(valeur, alterne);
      return alterne ? 9 : 8;
    }));
  });
  if (avecTotal) {
    const totaux: Cellule[] = colonnes.map((item, index) => {
      if (index === 0) return "Total";
      if (!item.somme) return null;
      return corps.reduce((somme, ligne) => somme + (typeof ligne[index] === "number" ? ligne[index] : 0), 0);
    });
    lignes.push(totaux);
    stylesLignes.push(totaux.map((valeur) => {
      if (typeof valeur !== "number") return 19;
      return Number.isInteger(valeur) ? 20 : 21;
    }));
  }
  return { lignes, styles: stylesLignes };
}

function styleColonne(index: number, surligne: number | undefined): number {
  if (index === surligne) return 3;
  if (index === 0) return 1;
  return [2, 4, 5, 6, 7][(index - 1) % 5];
}

function categoriesOrdonnees(series: SerieGraphique[]): string[] {
  const vus = new Set<string>();
  const ordre: string[] = [];
  for (const serie of series) {
    for (const point of serie.points) {
      if (!vus.has(point.libelle)) {
        vus.add(point.libelle);
        ordre.push(point.libelle);
      }
    }
  }
  return ordre;
}

function nomsSeries(series: SerieGraphique[]): string[] {
  const reserves = new Set(["Libellé", "Part (%)"]);
  if (series.length === 2) reserves.add("Écart");
  if (series.length > 1) reserves.add("Total");
  const pris = new Set<string>();
  return series.map((serie, index) => {
    const base = serie.nom.trim() || `Série ${index + 1}`;
    let nom = reserves.has(base) || pris.has(base) ? `${base} (${index + 1})` : base;
    while (reserves.has(nom) || pris.has(nom)) nom = `${nom} (${index + 1})`;
    pris.add(nom);
    return nom;
  });
}

function styleEntete(colonne: Colonne, index: number): number {
  if (colonne.cle === "libelle") return 1;
  if (colonne.cle === "ecart") return 4;
  if (colonne.cle === "total") return 2;
  if (colonne.cle === "part") return 3;
  return [1, 2, 3, 4, 5, 6, 7][(colonne.serie ?? index) % 7];
}

function styleNombre(valeur: number, alterne: boolean): number {
  const decimal = !Number.isInteger(valeur);
  if (decimal) return alterne ? 13 : 12;
  return alterne ? 11 : 10;
}

function styles(): string {
  const polices = [
    police(false, 11, "FF1C1C1C"),
    police(true, 11, "FFFFFFFF"),
    police(true, 16, "FF004428"),
    police(true, 11, "FF004428"),
    police(false, 11, "FF3A4450"),
    police(true, 11, "FF1C1C1C"),
    police(true, 12, "FFFFFFFF"),
  ];
  const aplats = ["none", "gray", ...PALETTE.map((couleur) => `FF${couleur}`), "FFF4F7F5", "FFE7F2EC", "FFF7F1EA"];
  const remplissages = aplats.map((aplat, index) => {
    if (index === 0) return `<fill><patternFill patternType="none"/></fill>`;
    if (index === 1) return `<fill><patternFill patternType="gray125"/></fill>`;
    return `<fill><patternFill patternType="solid"><fgColor rgb="${aplat}"/><bgColor indexed="64"/></patternFill></fill>`;
  });
  const bord = `<border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom></border>`;
  const xfs = [
    xf(0, 0, 0, 0),
    ...PALETTE.map((couleur, index) => xf(ENCRE_CLAIRE.has(couleur) ? 5 : 1, index + 2, 1, 0, "center", true)),
    xf(0, 0, 1, 0, "left", true),
    xf(0, aplats.indexOf("FFF4F7F5"), 1, 0, "left", true),
    xf(0, 0, 1, 164, "right"),
    xf(0, aplats.indexOf("FFF4F7F5"), 1, 164, "right"),
    xf(0, 0, 1, 165, "right"),
    xf(0, aplats.indexOf("FFF4F7F5"), 1, 165, "right"),
    xf(2, 0, 0, 0, "left", true),
    xf(6, 2, 0, 0, "left", true),
    xf(3, aplats.indexOf("FFE7F2EC"), 1, 0, "left", true),
    xf(0, 0, 1, 0, "left", true),
    xf(4, 0, 0, 0, "left", true),
    xf(3, aplats.indexOf("FFE7F2EC"), 1, 0, "left"),
    xf(3, aplats.indexOf("FFE7F2EC"), 1, 164, "right"),
    xf(3, aplats.indexOf("FFE7F2EC"), 1, 165, "right"),
    xf(4, aplats.indexOf("FFF7F1EA"), 0, 0, "left", true),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.0"/></numFmts>` +
    `<fonts count="${polices.length}">${polices.join("")}</fonts>` +
    `<fills count="${remplissages.length}">${remplissages.join("")}</fills>` +
    `<borders count="2"><border/><${bord.slice(1)}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `</styleSheet>`
  );
}

function police(gras: boolean, taille: number, couleur: string): string {
  return `<font>${gras ? "<b/>" : ""}<sz val="${taille}"/><color rgb="${couleur}"/><name val="Calibri"/><family val="2"/></font>`;
}

function xf(font: number, fill: number, border: number, numFmt: number, align: "left" | "right" | "center" = "left", wrap = false): string {
  const alignement = `<alignment horizontal="${align}" vertical="center"${wrap ? ` wrapText="1"` : ""}/>`;
  return (
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
    ` applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">${alignement}</xf>`
  );
}

function feuilleXml(feuille: Feuille): string {
  const lignes = feuille.lignes.map((ligne, index) => {
    const hauteur = feuille.hauteurs?.get(index + 1);
    const cellules = ligne.map((valeur, colonneIndex) => cellule(colonneIndex + 1, index + 1, valeur, feuille.styles[index]?.[colonneIndex] ?? 0));
    return `<row r="${index + 1}"${hauteur ? ` ht="${hauteur}" customHeight="1"` : ""}>${cellules.join("")}</row>`;
  });
  const cols = feuille.largeurs.map((largeur, index) => `<col min="${index + 1}" max="${index + 1}" width="${largeur}" customWidth="1"/>`).join("");
  const derniere = `${colonne(Math.max(1, feuille.largeurs.length))}${Math.max(1, feuille.lignes.length)}`;
  const figer = feuille.figer
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${feuille.figer}" topLeftCell="A${feuille.figer + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filtre = feuille.filtre ? `<autoFilter ref="${feuille.filtre}"/>` : "";
  const fusions = feuille.fusions?.length
    ? `<mergeCells count="${feuille.fusions.length}">${feuille.fusions.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetPr><tabColor rgb="FF${feuille.onglet}"/></sheetPr>` +
    `<dimension ref="A1:${derniere}"/>` +
    figer +
    `<sheetFormatPr defaultRowHeight="16"/>` +
    `<cols>${cols}</cols>` +
    `<sheetData>${lignes.join("")}</sheetData>` +
    filtre +
    fusions +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `</worksheet>`
  );
}

function cellule(x: number, y: number, valeur: Cellule, style: number): string {
  const ref = `${colonne(x)}${y}`;
  if (typeof valeur === "number" && Number.isFinite(valeur)) {
    return `<c r="${ref}" s="${style}"><v>${valeur}</v></c>`;
  }
  if (valeur == null || valeur === "") return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${echapper(String(valeur))}</t></is></c>`;
}

function workbook(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView activeTab="0"/></bookViews>` +
    `<sheets>` +
    `<sheet name="Guide" sheetId="1" r:id="rId1"/>` +
    `<sheet name="Données" sheetId="2" r:id="rId2"/>` +
    `</sheets></workbook>`
  );
}

function relsWorkbook(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`
  );
}

function relsRacine(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`
  );
}

function contentTypes(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`
  );
}

export function colonne(indice: number): string {
  let lettres = "";
  let reste = indice;
  while (reste) {
    const modulo = (reste - 1) % 26;
    lettres = String.fromCharCode(65 + modulo) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return lettres;
}

export function echapper(valeur: string): string {
  return valeur
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function zipper(fichiers: Record<string, string>): Uint8Array {
  const encodeur = new TextEncoder();
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let offset = 0;
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const nomOctets = encodeur.encode(nom);
    const donnees = encodeur.encode(contenu);
    const crc = crc32(donnees);
    const local = new Uint8Array(30 + nomOctets.length);
    const vue = new DataView(local.buffer);
    vue.setUint32(0, 0x04034b50, true);
    vue.setUint16(4, 20, true);
    vue.setUint16(6, 0x0800, true);
    vue.setUint16(8, 0, true);
    vue.setUint16(10, 0, true);
    vue.setUint16(12, 0, true);
    vue.setUint32(14, crc, true);
    vue.setUint32(18, donnees.length, true);
    vue.setUint32(22, donnees.length, true);
    vue.setUint16(26, nomOctets.length, true);
    vue.setUint16(28, 0, true);
    local.set(nomOctets, 30);
    locaux.push(local, donnees);
    const central = new Uint8Array(46 + nomOctets.length);
    const vueCentrale = new DataView(central.buffer);
    vueCentrale.setUint32(0, 0x02014b50, true);
    vueCentrale.setUint16(4, 20, true);
    vueCentrale.setUint16(6, 20, true);
    vueCentrale.setUint16(8, 0x0800, true);
    vueCentrale.setUint16(10, 0, true);
    vueCentrale.setUint16(12, 0, true);
    vueCentrale.setUint16(14, 0, true);
    vueCentrale.setUint32(16, crc, true);
    vueCentrale.setUint32(20, donnees.length, true);
    vueCentrale.setUint32(24, donnees.length, true);
    vueCentrale.setUint16(28, nomOctets.length, true);
    vueCentrale.setUint16(30, 0, true);
    vueCentrale.setUint16(32, 0, true);
    vueCentrale.setUint16(34, 0, true);
    vueCentrale.setUint16(36, 0, true);
    vueCentrale.setUint32(38, 0, true);
    vueCentrale.setUint32(42, offset, true);
    central.set(nomOctets, 46);
    centraux.push(central);
    offset += local.length + donnees.length;
  }
  const tailleCentrale = centraux.reduce((somme, morceau) => somme + morceau.length, 0);
  const fin = new Uint8Array(22);
  const vueFin = new DataView(fin.buffer);
  vueFin.setUint32(0, 0x06054b50, true);
  vueFin.setUint16(4, 0, true);
  vueFin.setUint16(6, 0, true);
  vueFin.setUint16(8, centraux.length, true);
  vueFin.setUint16(10, centraux.length, true);
  vueFin.setUint32(12, tailleCentrale, true);
  vueFin.setUint32(16, offset, true);
  vueFin.setUint16(20, 0, true);
  const taille = offset + tailleCentrale + fin.length;
  const archive = new Uint8Array(taille);
  let curseur = 0;
  for (const morceau of [...locaux, ...centraux, fin]) {
    archive.set(morceau, curseur);
    curseur += morceau.length;
  }
  return archive;
}

function crc32(donnees: Uint8Array): number {
  let crc = ~0;
  for (let index = 0; index < donnees.length; index += 1) {
    crc ^= donnees[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
