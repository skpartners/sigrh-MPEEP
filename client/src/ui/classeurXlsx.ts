import { colonne, echapper, telechargerOctets, zipper } from "./classeurGraphique";
import type { FormeGraphique } from "./Graphique";

/**
 * Écriture d'un classeur .xlsx de plusieurs feuilles, avec styles, plan (groupes
 * repliables), volets figés, filtres automatiques et graphiques Excel natifs : le
 * graphique se modifie dans Excel comme s'il y avait été créé, car ses séries
 * pointent sur des plages de cellules du classeur.
 */

export type FormatX = "texte" | "entier" | "decimal" | "pourcent";

export type StyleX = {
  gras?: boolean;
  italique?: boolean;
  taille?: number;
  couleur?: string;
  fond?: string;
  bordure?: "fine" | "total";
  format?: FormatX;
  aligne?: "left" | "right" | "center";
  retrait?: number;
  retour?: boolean;
};

export type CelluleX = { v: string | number | null; s?: StyleX };

export type LigneX = {
  cellules: (CelluleX | null)[];
  /** Niveau de plan Excel (0 = hors groupe). */
  niveau?: number;
  cachee?: boolean;
  repliee?: boolean;
  hauteur?: number;
};

export type SerieX = { nom: string; plageNom: string; plage: string; valeurs: (number | null)[]; couleur: string; encre: string };

export type GraphiqueX = {
  forme: FormeGraphique;
  titre: string;
  etiquettes: boolean;
  legende: boolean;
  categories: { plage: string; valeurs: string[] };
  series: SerieX[];
  /** Couleurs des secteurs, pour un graphique circulaire. */
  couleursPoints: string[];
  /** Coins du cadre, en index de colonne et de ligne commençant à 0. */
  ancre: { colonne: number; ligne: number; colonne2: number; ligne2: number };
};

export type FeuilleX = {
  nom: string;
  onglet?: string;
  lignes: LigneX[];
  largeurs: number[];
  fusions?: string[];
  figer?: { lignes: number; colonnes: number };
  filtre?: string;
  graphiques?: GraphiqueX[];
  quadrillage?: boolean;
};

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const ENTETE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

/** Nom de feuille Excel valide et unique : 31 caractères, sans []:*?/\ ni apostrophe en bord. */
export function nomFeuille(brut: string, pris: Set<string>): string {
  const base = brut.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "").slice(0, 31) || "Feuille";
  let nom = base;
  let rang = 2;
  while (pris.has(nom.toLowerCase())) {
    const suffixe = ` (${rang})`;
    nom = `${base.slice(0, 31 - suffixe.length)}${suffixe}`;
    rang += 1;
  }
  pris.add(nom.toLowerCase());
  return nom;
}

/** Plage absolue d'une feuille : 'Feuille'!$A$1:$A$5. Lignes et colonnes commencent à 1. */
export function plage(feuille: string, colonne1: number, ligne1: number, colonne2 = colonne1, ligne2 = ligne1): string {
  const debut = `$${colonne(colonne1)}$${ligne1}`;
  const fin = `$${colonne(colonne2)}$${ligne2}`;
  return `'${feuille.replace(/'/g, "''")}'!${debut}${debut === fin ? "" : `:${fin}`}`;
}

export function telechargerClasseur(feuilles: FeuilleX[], nomFichier: string): void {
  telechargerOctets(octetsClasseur(feuilles), nomFichier);
}

export function octetsClasseur(feuilles: FeuilleX[]): Uint8Array {
  const styles = new RegistreStyles();
  const fichiers: Record<string, string> = {};
  const types: string[] = [];
  let graphiques = 0;
  let dessins = 0;

  feuilles.forEach((feuille, indice) => {
    const numero = indice + 1;
    let dessin = "";
    if (feuille.graphiques?.length) {
      dessins += 1;
      dessin = `<drawing r:id="rId1"/>`;
      fichiers[`xl/worksheets/_rels/sheet${numero}.xml.rels`] = rels([
        { id: "rId1", type: `${NS_REL}/drawing`, cible: `../drawings/drawing${dessins}.xml` },
      ]);
      const ancres: string[] = [];
      const liens: { id: string; type: string; cible: string }[] = [];
      feuille.graphiques.forEach((graphique, rang) => {
        graphiques += 1;
        fichiers[`xl/charts/chart${graphiques}.xml`] = graphiqueXml(graphique);
        types.push(`<Override PartName="/xl/charts/chart${graphiques}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        liens.push({ id: `rId${rang + 1}`, type: `${NS_REL}/chart`, cible: `../charts/chart${graphiques}.xml` });
        ancres.push(ancreXml(graphique, rang));
      });
      fichiers[`xl/drawings/drawing${dessins}.xml`] = `${ENTETE}<xdr:wsDr xmlns:xdr="${NS_XDR}" xmlns:a="${NS_A}" xmlns:r="${NS_REL}" xmlns:c="${NS_C}">${ancres.join("")}</xdr:wsDr>`;
      fichiers[`xl/drawings/_rels/drawing${dessins}.xml.rels`] = rels(liens);
      types.push(`<Override PartName="/xl/drawings/drawing${dessins}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    }
    fichiers[`xl/worksheets/sheet${numero}.xml`] = feuilleXml(feuille, styles, dessin);
    types.push(`<Override PartName="/xl/worksheets/sheet${numero}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  });

  fichiers["xl/styles.xml"] = styles.xml();
  fichiers["xl/workbook.xml"] =
    `${ENTETE}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
    feuilles.map((feuille, indice) => `<sheet name="${attribut(feuille.nom)}" sheetId="${indice + 1}" r:id="rId${indice + 1}"/>`).join("") +
    `</sheets></workbook>`;
  fichiers["xl/_rels/workbook.xml.rels"] = rels([
    ...feuilles.map((_, indice) => ({ id: `rId${indice + 1}`, type: `${NS_REL}/worksheet`, cible: `worksheets/sheet${indice + 1}.xml` })),
    { id: `rId${feuilles.length + 1}`, type: `${NS_REL}/styles`, cible: "styles.xml" },
  ]);
  fichiers["_rels/.rels"] = rels([{ id: "rId1", type: `${NS_REL}/officeDocument`, cible: "xl/workbook.xml" }]);
  fichiers["[Content_Types].xml"] =
    `${ENTETE}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    types.join("") +
    `</Types>`;
  return zipper(fichiers);
}

function rels(liens: { id: string; type: string; cible: string }[]): string {
  return (
    `${ENTETE}<Relationships xmlns="${NS_PKG}">` +
    liens.map((lien) => `<Relationship Id="${lien.id}" Type="${lien.type}" Target="${lien.cible}"/>`).join("") +
    `</Relationships>`
  );
}

function attribut(texte: string): string {
  return echapper(texte).replace(/"/g, "&quot;");
}

// --- Feuilles ---------------------------------------------------------------------------

function feuilleXml(feuille: FeuilleX, styles: RegistreStyles, dessin: string): string {
  const niveauMax = Math.max(0, ...feuille.lignes.map((ligne) => ligne.niveau ?? 0));
  const largeur = Math.max(1, feuille.largeurs.length, ...feuille.lignes.map((ligne) => ligne.cellules.length));
  const lignes = feuille.lignes.map((ligne, indice) => {
    const numero = indice + 1;
    const attributs = [
      ligne.hauteur ? ` ht="${ligne.hauteur}" customHeight="1"` : "",
      ligne.niveau ? ` outlineLevel="${ligne.niveau}"` : "",
      ligne.cachee ? ` hidden="1"` : "",
      ligne.repliee ? ` collapsed="1"` : "",
    ].join("");
    const cellules = ligne.cellules
      .map((cellule, rang) => (cellule ? celluleXml(rang + 1, numero, cellule, styles) : ""))
      .join("");
    return `<row r="${numero}"${attributs}>${cellules}</row>`;
  });
  const figer = feuille.figer && (feuille.figer.lignes || feuille.figer.colonnes) ? volet(feuille.figer.lignes, feuille.figer.colonnes) : "";
  const vue = `<sheetViews><sheetView workbookViewId="0"${feuille.quadrillage === false ? ` showGridLines="0"` : ""}${figer ? `>${figer}</sheetView>` : "/>"}</sheetViews>`;
  const colonnes = feuille.largeurs.length
    ? `<cols>${feuille.largeurs.map((valeur, indice) => `<col min="${indice + 1}" max="${indice + 1}" width="${valeur}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const fusions = feuille.fusions?.length
    ? `<mergeCells count="${feuille.fusions.length}">${feuille.fusions.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return (
    `${ENTETE}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<sheetPr>${feuille.onglet ? `<tabColor rgb="FF${feuille.onglet}"/>` : ""}<outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>` +
    `<dimension ref="A1:${colonne(largeur)}${Math.max(1, feuille.lignes.length)}"/>` +
    vue +
    `<sheetFormatPr defaultRowHeight="15"${niveauMax ? ` outlineLevelRow="${niveauMax}"` : ""}/>` +
    colonnes +
    `<sheetData>${lignes.join("")}</sheetData>` +
    (feuille.filtre ? `<autoFilter ref="${feuille.filtre}"/>` : "") +
    fusions +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup orientation="landscape" fitToHeight="0"/>` +
    dessin +
    `</worksheet>`
  );
}

function volet(lignes: number, colonnes: number): string {
  const cellule = `${colonne(colonnes + 1)}${lignes + 1}`;
  const panneau = lignes && colonnes ? "bottomRight" : lignes ? "bottomLeft" : "topRight";
  return (
    `<pane${colonnes ? ` xSplit="${colonnes}"` : ""}${lignes ? ` ySplit="${lignes}"` : ""} topLeftCell="${cellule}" activePane="${panneau}" state="frozen"/>` +
    `<selection pane="${panneau}" activeCell="${cellule}" sqref="${cellule}"/>`
  );
}

function celluleXml(x: number, y: number, cellule: CelluleX, styles: RegistreStyles): string {
  const ref = `${colonne(x)}${y}`;
  const style = cellule.s ? ` s="${styles.indice(cellule.s)}"` : "";
  const valeur = cellule.v;
  if (typeof valeur === "number" && Number.isFinite(valeur)) return `<c r="${ref}"${style}><v>${valeur}</v></c>`;
  if (valeur == null || valeur === "") return `<c r="${ref}"${style}/>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${echapper(String(valeur))}</t></is></c>`;
}

// --- Styles -----------------------------------------------------------------------------

const FORMATS: Record<FormatX, number> = { texte: 0, entier: 164, decimal: 165, pourcent: 166 };

class RegistreStyles {
  private polices = new Map<string, number>([[policeXml({}), 0]]);
  private fonds = new Map<string, number>([["none", 0], ["gray125", 1]]);
  private bordures = new Map<string, number>([["", 0]]);
  private xfs = new Map<string, number>([[`0|0|0|0|left|0|0`, 0]]);

  indice(style: StyleX): number {
    const police = this.inscrire(this.polices, policeXml(style));
    const fond = style.fond ? this.inscrire(this.fonds, style.fond.toUpperCase()) : 0;
    const bordure = style.bordure ? this.inscrire(this.bordures, style.bordure) : 0;
    const format = FORMATS[style.format ?? "texte"];
    const aligne = style.aligne ?? (style.format && style.format !== "texte" ? "right" : "left");
    return this.inscrire(this.xfs, `${police}|${fond}|${bordure}|${format}|${aligne}|${style.retrait ?? 0}|${style.retour ? 1 : 0}`);
  }

  private inscrire(registre: Map<string, number>, cle: string): number {
    const connu = registre.get(cle);
    if (connu !== undefined) return connu;
    registre.set(cle, registre.size);
    return registre.size - 1;
  }

  xml(): string {
    const polices = [...this.polices.keys()];
    const fonds = [...this.fonds.keys()].map((cle) => {
      if (cle === "none" || cle === "gray125") return `<fill><patternFill patternType="${cle}"/></fill>`;
      return `<fill><patternFill patternType="solid"><fgColor rgb="FF${cle}"/><bgColor indexed="64"/></patternFill></fill>`;
    });
    const fin = `<color rgb="FFD0D5DD"/>`;
    const bordures = [...this.bordures.keys()].map((cle) => {
      if (!cle) return "<border><left/><right/><top/><bottom/><diagonal/></border>";
      const haut = cle === "total" ? `<top style="medium"><color rgb="FF3A4450"/></top>` : `<top style="thin">${fin}</top>`;
      return `<border><left style="thin">${fin}</left><right style="thin">${fin}</right>${haut}<bottom style="thin">${fin}</bottom><diagonal/></border>`;
    });
    const xfs = [...this.xfs.keys()].map((cle) => {
      const [police, fond, bordure, format, aligne, retrait, retour] = cle.split("|");
      const alignement = `<alignment horizontal="${aligne}" vertical="center"${retrait !== "0" ? ` indent="${retrait}"` : ""}${retour === "1" ? ` wrapText="1"` : ""}/>`;
      return `<xf numFmtId="${format}" fontId="${police}" fillId="${fond}" borderId="${bordure}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">${alignement}</xf>`;
    });
    return (
      `${ENTETE}<styleSheet xmlns="${NS_MAIN}">` +
      `<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>` +
      `<fonts count="${polices.length}">${polices.join("")}</fonts>` +
      `<fills count="${fonds.length}">${fonds.join("")}</fills>` +
      `<borders count="${bordures.length}">${bordures.join("")}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
}

function policeXml(style: StyleX): string {
  return (
    `<font>${style.gras ? "<b/>" : ""}${style.italique ? "<i/>" : ""}<sz val="${style.taille ?? 11}"/>` +
    `<color rgb="FF${(style.couleur ?? "1C1C1C").toUpperCase()}"/><name val="Calibri"/><family val="2"/></font>`
  );
}

// --- Graphiques -------------------------------------------------------------------------

function ancreXml(graphique: GraphiqueX, rang: number): string {
  const { colonne: c1, ligne: l1, colonne2: c2, ligne2: l2 } = graphique.ancre;
  const point = (balise: string, c: number, l: number) =>
    `<xdr:${balise}><xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${l}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:${balise}>`;
  return (
    `<xdr:twoCellAnchor editAs="oneCell">${point("from", c1, l1)}${point("to", c2, l2)}` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${rang + 2}" name="${attribut(graphique.titre || `Graphique ${rang + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_C}"><c:chart r:id="rId${rang + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame>` +
    `<xdr:clientData/></xdr:twoCellAnchor>`
  );
}

const AXE_CATEGORIES = 500001;
const AXE_VALEURS = 500002;

function graphiqueXml(graphique: GraphiqueX): string {
  const forme = graphique.forme;
  const circulaire = forme === "secteur" || forme === "anneau";
  const horizontal = forme === "horizontale" || forme === "empilee-horizontale" || forme === "entonnoir";
  const titre = graphique.titre
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="1300" b="1"/><a:t>${echapper(graphique.titre)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : `<c:autoTitleDeleted val="1"/>`;
  const legende = graphique.legende && (circulaire || graphique.series.length > 1)
    ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`
    : "";
  const axes = circulaire ? "" : axesXml(horizontal, forme === "pourcentage");
  return (
    `${ENTETE}<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_REL}">` +
    `<c:roundedCorners val="0"/>` +
    `<c:chart>${titre}<c:plotArea><c:layout/>${traceXml(graphique)}${axes}</c:plotArea>${legende}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="3A4450"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>` +
    `</c:chartSpace>`
  );
}

function traceXml(graphique: GraphiqueX): string {
  const { forme } = graphique;
  const ids = `<c:axId val="${AXE_CATEGORIES}"/><c:axId val="${AXE_VALEURS}"/>`;
  if (forme === "secteur" || forme === "anneau") {
    const serie = graphique.series[graphique.series.length - 1];
    const points = graphique.couleursPoints
      .slice(0, graphique.categories.valeurs.length)
      .map((couleur, indice) => `<c:dPt><c:idx val="${indice}"/><c:bubble3D val="0"/>${remplissage(couleur)}</c:dPt>`)
      .join("");
    const corps = serie
      ? `<c:ser><c:idx val="0"/><c:order val="0"/>${nomSerie(serie)}${points}${etiquettes(graphique.etiquettes, { position: "outEnd", lignes: true })}${categories(graphique)}${valeurs(serie)}</c:ser>`
      : "";
    return forme === "anneau"
      ? `<c:doughnutChart><c:varyColors val="1"/>${corps}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`
      : `<c:pieChart><c:varyColors val="1"/>${corps}<c:firstSliceAng val="0"/></c:pieChart>`;
  }
  if (forme === "ligne" || forme === "points") {
    const series = graphique.series.map((serie, indice) => {
      const marqueur = forme === "points"
        ? `<c:marker><c:symbol val="circle"/><c:size val="6"/>${remplissage(serie.couleur)}</c:marker>`
        : `<c:marker><c:symbol val="none"/></c:marker>`;
      return `<c:ser>${identite(indice)}${nomSerie(serie)}${trait(serie.couleur)}${marqueur}${etiquettes(graphique.etiquettes)}${categories(graphique)}${valeurs(serie)}<c:smooth val="${forme === "ligne" ? 1 : 0}"/></c:ser>`;
    });
    return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series.join("")}<c:marker val="1"/>${ids}</c:lineChart>`;
  }
  if (forme === "aire") {
    const series = graphique.series.map(
      (serie, indice) => `<c:ser>${identite(indice)}${nomSerie(serie)}${remplissage(serie.couleur, 70)}${etiquettes(graphique.etiquettes)}${categories(graphique)}${valeurs(serie)}</c:ser>`,
    );
    return `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series.join("")}${ids}</c:areaChart>`;
  }
  const horizontal = forme === "horizontale" || forme === "empilee-horizontale" || forme === "entonnoir";
  const groupement = forme === "pourcentage" ? "percentStacked" : forme === "empilee" || forme === "empilee-horizontale" ? "stacked" : "clustered";
  // Empilées, les étiquettes sont dans la barre : leur encre suit la couleur de la série.
  const series = graphique.series.map(
    (serie, indice) => `<c:ser>${identite(indice)}${nomSerie(serie)}${remplissage(serie.couleur)}<c:invertIfNegative val="0"/>${etiquettes(graphique.etiquettes, { encre: groupement === "clustered" ? undefined : serie.encre })}${categories(graphique)}${valeurs(serie)}</c:ser>`,
  );
  return (
    `<c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="${groupement}"/><c:varyColors val="0"/>${series.join("")}` +
    `<c:gapWidth val="${forme === "entonnoir" ? 20 : 60}"/>${groupement === "clustered" ? "" : `<c:overlap val="100"/>`}${ids}</c:barChart>`
  );
}

function axesXml(horizontal: boolean, pourcentage: boolean): string {
  const ligne = (couleur: string) => `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${couleur}"/></a:solidFill></a:ln></c:spPr>`;
  return (
    `<c:catAx><c:axId val="${AXE_CATEGORIES}"/><c:scaling><c:orientation val="${horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${horizontal ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/>` +
    `<c:tickLblPos val="nextTo"/>${ligne("BFBFBF")}<c:crossAx val="${AXE_VALEURS}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${AXE_VALEURS}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>` +
    `<c:axPos val="${horizontal ? "b" : "l"}"/><c:majorGridlines>${ligne("E5E7EB")}</c:majorGridlines>` +
    `<c:numFmt formatCode="${pourcentage ? "0%" : "General"}" sourceLinked="${pourcentage ? 0 : 1}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/>` +
    `<c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:crossAx val="${AXE_CATEGORIES}"/><c:crosses val="${horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`
  );
}

function identite(indice: number): string {
  return `<c:idx val="${indice}"/><c:order val="${indice}"/>`;
}

function nomSerie(serie: SerieX): string {
  return `<c:tx>${refTexte(serie.plageNom, [serie.nom])}</c:tx>`;
}

function categories(graphique: GraphiqueX): string {
  return `<c:cat>${refTexte(graphique.categories.plage, graphique.categories.valeurs)}</c:cat>`;
}

function valeurs(serie: SerieX): string {
  // Une case vide n'a pas de point : Excel laisse un trou, sans étiquette « 0 ».
  const points = serie.valeurs
    .map((valeur, indice) => (valeur !== null && Number.isFinite(valeur) ? `<c:pt idx="${indice}"><c:v>${valeur}</c:v></c:pt>` : ""))
    .join("");
  return `<c:val><c:numRef><c:f>${echapper(serie.plage)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${serie.valeurs.length}"/>${points}</c:numCache></c:numRef></c:val>`;
}

function refTexte(ref: string, textes: string[]): string {
  const points = textes.map((texte, indice) => `<c:pt idx="${indice}"><c:v>${echapper(texte)}</c:v></c:pt>`).join("");
  return `<c:strRef><c:f>${echapper(ref)}</c:f><c:strCache><c:ptCount val="${textes.length}"/>${points}</c:strCache></c:strRef>`;
}

function remplissage(couleur: string, opacite = 100): string {
  const alpha = opacite < 100 ? `<a:alpha val="${opacite * 1000}"/>` : "";
  return `<c:spPr><a:solidFill><a:srgbClr val="${hex(couleur)}">${alpha}</a:srgbClr></a:solidFill></c:spPr>`;
}

function trait(couleur: string): string {
  return `<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${hex(couleur)}"/></a:solidFill><a:round/></a:ln></c:spPr>`;
}

function etiquettes(visibles: boolean, { encre, position, lignes = false }: { encre?: string; position?: "outEnd"; lignes?: boolean } = {}): string {
  if (!visibles) return "";
  const texte = encre
    ? `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"><a:solidFill><a:srgbClr val="${hex(encre)}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`
    : "";
  return (
    `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${texte}${position ? `<c:dLblPos val="${position}"/>` : ""}` +
    `<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>` +
    `${lignes ? `<c:showLeaderLines val="1"/>` : ""}</c:dLbls>`
  );
}

function hex(couleur: string): string {
  return couleur.replace("#", "").toUpperCase();
}
