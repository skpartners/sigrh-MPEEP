import { encreSur } from "../../ui/Couleurs";
import { nomFichierGraphique } from "../../ui/classeurGraphique";
import { nomFeuille, plage, telechargerClasseur, type CelluleX, type FeuilleX, type GraphiqueX, type LigneX, type StyleX } from "../../ui/classeurXlsx";
import { BLEU_MARINE, COULEURS_ANNEAU, indicateurs, textesBloc, VERT_EAU, type BlocEtat, type ConfigEtat, type VueBloc } from "./etat";
import { libelleChamp, type SourceCatalogue } from "./moteur";

/**
 * Classeur d'un état composé, présenté comme la maquette : une première feuille où chaque bloc réunit sur une même ligne le graphique
 * Excel, son tableau de données et les points à retenir, puis une feuille de synthèse (chiffres clés et messages principaux).
 */

const MARINE = BLEU_MARINE.slice(1);
const VERT = VERT_EAU.slice(1);
const GRIS = "7F7F7F";
const PANNEAU = "F2F5F8";
const ENCRE = "262626";

const LARGEUR_GRAPHIQUE = 8;
const LARGEUR_ANNEAU = 4;
const LIGNES_MIN = 19;
const PUCE = "▪  ";

export type DonneesBloc = { bloc: BlocEtat; vue: VueBloc; source: SourceCatalogue | undefined };

export function exporterEtat(etat: ConfigEtat, donnees: DonneesBloc[], nomFichier?: string): void {
  telechargerClasseur(feuillesEtat(etat, donnees), nomFichier ?? nomFichierGraphique(etat.titre || "etat-statistique"));
}

export function feuillesEtat(etat: ConfigEtat, donnees: DonneesBloc[]): FeuilleX[] {
  const pris = new Set<string>();
  const nomGraphiques = nomFeuille("Graphiques", pris);
  const feuilles = [feuilleGraphiques(nomGraphiques, etat, donnees)];
  if (etat.synthese) feuilles.push(feuilleSynthese(nomFeuille("Synthèse", pris), etat, donnees));
  return feuilles;
}

/** Une grille de cellules indexée par ligne (à partir de 1) et colonne (à partir de 0), écrite en lignes à la fin. */
class Grille {
  private cellules = new Map<number, Map<number, CelluleX>>();
  readonly fusions: string[] = [];
  private hauteurs = new Map<number, number>();

  poser(ligne: number, colonne: number, cellule: CelluleX) {
    const rang = this.cellules.get(ligne) ?? new Map<number, CelluleX>();
    rang.set(colonne, cellule);
    this.cellules.set(ligne, rang);
  }

  hauteur(ligne: number, valeur: number) {
    this.hauteurs.set(ligne, valeur);
  }

  /** Fusionne une zone ; le style de la première cellule est repris par toutes, pour que le fond couvre la zone. */
  fusionner(ligne1: number, colonne1: number, ligne2: number, colonne2: number, cellule: CelluleX) {
    for (let l = ligne1; l <= ligne2; l += 1) {
      for (let c = colonne1; c <= colonne2; c += 1) this.poser(l, c, l === ligne1 && c === colonne1 ? cellule : { v: null, s: cellule.s });
    }
    if (ligne2 > ligne1 || colonne2 > colonne1) this.fusions.push(`${ref(colonne1, ligne1)}:${ref(colonne2, ligne2)}`);
  }

  lignes(): LigneX[] {
    const derniere = Math.max(0, ...this.cellules.keys(), ...this.hauteurs.keys());
    const lignes: LigneX[] = [];
    for (let numero = 1; numero <= derniere; numero += 1) {
      const rang = this.cellules.get(numero);
      const largeur = rang ? Math.max(...rang.keys()) + 1 : 0;
      const cellules: (CelluleX | null)[] = Array.from({ length: largeur }, (_, colonne) => rang?.get(colonne) ?? null);
      lignes.push({ cellules, hauteur: this.hauteurs.get(numero) });
    }
    return lignes;
  }
}

function lettre(colonne: number): string {
  let reste = colonne + 1;
  let texte = "";
  while (reste > 0) {
    const decalage = (reste - 1) % 26;
    texte = String.fromCharCode(65 + decalage) + texte;
    reste = Math.floor((reste - 1) / 26);
  }
  return texte;
}

/** Référence A1 ; la colonne commence à 0, la ligne à 1. */
function ref(colonne: number, ligne: number): string {
  return `${lettre(colonne)}${ligne}`;
}

function feuilleGraphiques(nom: string, etat: ConfigEtat, donnees: DonneesBloc[]): FeuilleX {
  const grille = new Grille();
  const graphiques: GraphiqueX[] = [];
  const entete: StyleX = { gras: true, couleur: "FFFFFF", fond: MARINE, bordure: "fine", retour: true };

  // Colonnes communes à tous les blocs : la zone du tableau s'élargit au bloc qui a le plus de colonnes.
  const nbColonnes = Math.max(2, ...donnees.map(({ vue }) => vue.colonnes.length));
  const largeurTableau = 1 + nbColonnes + 2;
  const colGraphique = 1;
  const colEcart = colGraphique + LARGEUR_GRAPHIQUE;
  const colTableau = colEcart + 1;
  const colRetenir = colTableau + largeurTableau + 1;
  const colAide = colRetenir + 2;
  const largeurs = [
    2,
    ...Array.from({ length: LARGEUR_GRAPHIQUE }, () => 10.5),
    2,
    30,
    ...Array.from({ length: nbColonnes + 2 }, () => 11),
    2,
    46,
    2,
  ];

  grille.poser(2, colGraphique, { v: etat.titre || "État statistique", s: { gras: true, taille: 18, couleur: MARINE } });
  grille.hauteur(2, 28);
  if (etat.sous_titre) {
    grille.fusionner(3, colGraphique, 3, colRetenir, { v: etat.sous_titre, s: { italique: true, taille: 9, couleur: GRIS, retour: true, haut: true } });
    grille.hauteur(3, 26);
  }

  let ligne = 5;
  let maxAide = 0;
  donnees.forEach(({ bloc, vue, source }) => {
    const textes = textesBloc(bloc, vue);
    const couleurs = bloc.config.graphique.couleurs;
    const palette = (rang: number) => couleurs[rang] ?? COULEURS_ANNEAU[rang % COULEURS_ANNEAU.length];

    grille.poser(ligne, colGraphique, { v: bloc.kicker.toUpperCase(), s: { gras: true, taille: 9, couleur: VERT } });
    grille.fusionner(ligne + 1, colGraphique, ligne + 1, colRetenir, { v: textes.titre, s: { gras: true, taille: 15, couleur: MARINE, retour: true, haut: true } });
    grille.hauteur(ligne + 1, 42);
    if (bloc.sous_titre) grille.poser(ligne + 2, colGraphique, { v: bloc.sous_titre, s: { italique: true, taille: 9, couleur: GRIS } });

    const debut = ligne + 4;
    const lignesTableau = vue.lignes.length + 1;
    const hauteurCorps = Math.max(LIGNES_MIN, lignesTableau + 3);
    const fin = debut + hauteurCorps - 1;

    // Tableau des données : étiquette, une colonne par genre, total et part.
    const coin = bloc.config.lignes.map((code) => libelleChamp(code, source)).join(" / ") || "Total";
    grille.poser(debut, colTableau, { v: coin, s: entete });
    for (let rang = 0; rang < nbColonnes; rang += 1) {
      grille.poser(debut, colTableau + 1 + rang, { v: vue.colonnes[rang] ?? null, s: { ...entete, aligne: "right" } });
    }
    grille.poser(debut, colTableau + 1 + nbColonnes, { v: "Total", s: { ...entete, aligne: "right" } });
    grille.poser(debut, colTableau + 2 + nbColonnes, { v: "Part", s: { ...entete, aligne: "right" } });
    grille.hauteur(debut, 24);
    vue.lignes.forEach((item, rang) => {
      const l = debut + 1 + rang;
      const fond = item.groupe ? PANNEAU : undefined;
      grille.poser(l, colTableau, { v: item.libelle, s: { bordure: "fine", gras: item.groupe, fond, retrait: item.niveau } });
      for (let c = 0; c < nbColonnes; c += 1) {
        grille.poser(l, colTableau + 1 + c, { v: c < vue.colonnes.length ? item.valeurs[c] : null, s: { bordure: "fine", gras: item.groupe, fond, format: "entier" } });
      }
      grille.poser(l, colTableau + 1 + nbColonnes, { v: item.total, s: { bordure: "fine", gras: true, fond, format: "entier" } });
      grille.poser(l, colTableau + 2 + nbColonnes, { v: item.part, s: { bordure: "fine", gras: item.groupe, fond, format: "pourcent" } });
    });
    const lt = debut + 1 + vue.lignes.length;
    const total: StyleX = { bordure: "total", gras: true, fond: PANNEAU };
    grille.poser(lt, colTableau, { v: "Total", s: total });
    for (let c = 0; c < nbColonnes; c += 1) grille.poser(lt, colTableau + 1 + c, { v: c < vue.colonnes.length ? vue.totaux[c] : null, s: { ...total, format: "entier" } });
    grille.poser(lt, colTableau + 1 + nbColonnes, { v: vue.total, s: { ...total, format: "entier" } });
    grille.poser(lt, colTableau + 2 + nbColonnes, { v: vue.total ? 1 : null, s: { ...total, format: "pourcent" } });

    // Points à retenir : un panneau d'une seule cellule fusionnée, sous son titre.
    grille.poser(debut, colRetenir, { v: "À RETENIR", s: { gras: true, taille: 9, couleur: VERT } });
    const puces = textes.commentaires.map((texte) => `${PUCE}${texte}`).join("\n\n");
    grille.fusionner(debut + 1, colRetenir, fin, colRetenir, { v: puces || null, s: { fond: PANNEAU, taille: 10, couleur: ENCRE, retour: true, haut: true } });

    grille.fusionner(fin + 1, colGraphique, fin + 1, colRetenir, {
      v: etat.source ? `Source : ${etat.source}` : null,
      s: { italique: true, taille: 8, couleur: GRIS },
    });

    // Données du graphique : colonnes d'appoint à droite, que les séries Excel désignent. La pyramide y est signée (hommes en négatif).
    if (!vue.vide) {
      const pyramide = bloc.config.graphique.forme === "pyramide";
      const circulaire = ["secteur", "anneau", "entonnoir"].includes(bloc.config.graphique.forme);
      grille.poser(debut - 1, colAide, { v: `Données du graphique — ${bloc.kicker}`, s: { italique: true, taille: 8, couleur: GRIS } });
      const sousEntete: StyleX = { ...entete, taille: 9 };
      grille.poser(debut, colAide, { v: "Catégorie", s: sousEntete });
      vue.series.forEach((serie, rang) => grille.poser(debut, colAide + 1 + rang, { v: serie.nom, s: { ...sousEntete, aligne: "right" } }));
      vue.categories.forEach((categorie, rang) => {
        grille.poser(debut + 1 + rang, colAide, { v: categorie, s: { bordure: "fine", taille: 9 } });
        vue.series.forEach((serie, indice) => {
          const valeur = serie.points[rang]?.total ?? 0;
          grille.poser(debut + 1 + rang, colAide + 1 + indice, {
            v: pyramide && indice === 0 ? -valeur : valeur,
            s: { bordure: "fine", taille: 9, format: Number.isInteger(valeur) ? "entier" : "decimal" },
          });
        });
      });
      const premiere = debut + 1;
      const derniere = debut + vue.categories.length;
      maxAide = Math.max(maxAide, 1 + vue.series.length);

      const couleursPoints = vue.categories.map((_, rang) => palette(rang));
      const colonneDe = (rang: number) => colAide + 1 + rang + 1; // plage() compte les colonnes à partir de 1
      const principal: GraphiqueX = {
        forme: bloc.config.graphique.forme,
        titre: "",
        etiquettes: bloc.config.graphique.etiquettes,
        legende: bloc.config.graphique.legende,
        categories: { plage: plage(nom, colAide + 1, premiere, colAide + 1, derniere), valeurs: vue.categories },
        series: (circulaire ? vue.series.slice(-1) : vue.series).map((serie) => {
          const indice = vue.series.indexOf(serie);
          const couleur = palette(indice);
          return {
            nom: serie.nom,
            plageNom: plage(nom, colonneDe(indice), debut),
            plage: plage(nom, colonneDe(indice), premiere, colonneDe(indice), derniere),
            valeurs: serie.points.map((point) => (pyramide && indice === 0 ? -point.total : point.total) || null),
            couleur,
            encre: encreSur(couleur),
          };
        }),
        couleursPoints,
        ancre: {
          colonne: colGraphique + (bloc.anneau ? LARGEUR_ANNEAU : 0),
          ligne: debut - 1,
          colonne2: colEcart,
          ligne2: fin,
        },
      };
      graphiques.push(principal);

      if (bloc.anneau) {
        const colRepartition = colAide + 2 + vue.series.length;
        grille.poser(debut, colRepartition, { v: "Catégorie", s: sousEntete });
        grille.poser(debut, colRepartition + 1, { v: "Part de l'effectif (%)", s: { ...sousEntete, aligne: "right" } });
        const repartition = vue.repartition[0]?.points ?? [];
        repartition.forEach((point, rang) => {
          grille.poser(debut + 1 + rang, colRepartition, { v: point.libelle, s: { bordure: "fine", taille: 9 } });
          grille.poser(debut + 1 + rang, colRepartition + 1, { v: point.total, s: { bordure: "fine", taille: 9, format: "decimal" } });
        });
        maxAide = Math.max(maxAide, 2 + vue.series.length + 1 + 2);
        const fins = debut + repartition.length;
        graphiques.push({
          forme: "anneau",
          titre: "Part de l'effectif (%)",
          etiquettes: true,
          legende: true,
          categories: { plage: plage(nom, colRepartition + 1, premiere, colRepartition + 1, fins), valeurs: repartition.map((point) => point.libelle) },
          series: [{
            nom: "Part de l'effectif (%)",
            plageNom: plage(nom, colRepartition + 2, debut),
            plage: plage(nom, colRepartition + 2, premiere, colRepartition + 2, fins),
            valeurs: repartition.map((point) => point.total),
            couleur: COULEURS_ANNEAU[0],
            encre: encreSur(COULEURS_ANNEAU[0]),
          }],
          couleursPoints: repartition.map((_, rang) => COULEURS_ANNEAU[rang % COULEURS_ANNEAU.length]),
          ancre: { colonne: colGraphique, ligne: debut - 1, colonne2: colGraphique + LARGEUR_ANNEAU, ligne2: fin },
        });
      }
    }

    ligne = fin + 4;
  });

  const lignes = grille.lignes();
  return {
    nom,
    onglet: MARINE,
    lignes,
    largeurs: [...largeurs, ...Array.from({ length: Math.max(maxAide, 1) + 4 }, (_, rang) => (rang === 0 ? 26 : 12))],
    fusions: grille.fusions,
    graphiques,
    quadrillage: false,
  };
}

function feuilleSynthese(nom: string, etat: ConfigEtat, donnees: DonneesBloc[]): FeuilleX {
  const grille = new Grille();
  const vues: Record<string, VueBloc> = {};
  donnees.forEach(({ bloc, vue }) => {
    vues[bloc.id] = vue;
  });
  const chiffres = indicateurs(donnees.map(({ bloc }) => bloc), vues);

  grille.poser(2, 1, { v: `${(etat.titre || "État statistique").split("—")[0].trim()} — synthèse`.toUpperCase(), s: { gras: true, taille: 20, couleur: MARINE } });
  grille.hauteur(2, 30);
  grille.poser(3, 1, { v: "Indicateurs clés et messages principaux (calculés à partir des données de la feuille « Graphiques »)", s: { italique: true, taille: 9, couleur: GRIS } });

  // Six tuiles de deux colonnes, séparées par une colonne étroite.
  chiffres.forEach((chiffre, rang) => {
    const colonne = 1 + rang * 3;
    const fond = { fond: PANNEAU };
    grille.fusionner(5, colonne, 5, colonne + 1, { v: chiffre.libelle, s: { ...fond, gras: true, taille: 8, couleur: VERT } });
    grille.fusionner(6, colonne, 6, colonne + 1, { v: chiffre.valeur, s: { ...fond, gras: true, taille: 24, couleur: MARINE, aligne: "left" } });
    grille.fusionner(7, colonne, 7, colonne + 1, { v: chiffre.detail, s: { ...fond, taille: 8, couleur: GRIS } });
  });
  grille.hauteur(6, 38);

  grille.poser(10, 1, { v: "MESSAGES CLÉS", s: { gras: true, taille: 11, couleur: MARINE } });
  donnees.forEach(({ bloc, vue }, rang) => {
    const ligne = 11 + rang * 2;
    grille.poser(ligne, 1, { v: rang + 1, s: { gras: true, taille: 14, couleur: VERT, aligne: "center" } });
    grille.fusionner(ligne, 2, ligne, 17, { v: textesBloc(bloc, vue).titre, s: { taille: 11, couleur: ENCRE, retour: true, haut: true } });
    grille.hauteur(ligne, 34);
  });
  grille.poser(11 + donnees.length * 2 + 1, 1, {
    v: "Détail : feuille « Graphiques ». Données de calcul : colonnes d'appoint à droite de chaque bloc.",
    s: { italique: true, taille: 8, couleur: GRIS },
  });

  return {
    nom,
    onglet: VERT,
    lignes: grille.lignes(),
    largeurs: [2, ...Array.from({ length: 17 }, (_, rang) => ((rang + 1) % 3 === 0 ? 2.5 : 13))],
    fusions: grille.fusions,
    quadrillage: false,
  };
}
