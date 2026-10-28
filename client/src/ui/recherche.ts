/** Sans accents ni casse : « Côte d'Ivoire » et « cote d'ivoire » se valent. */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
}

let dernierTerme = "";
let derniersMots: string[] = [];

function mots(terme: string): string[] {
  if (terme !== dernierTerme) {
    dernierTerme = terme;
    derniersMots = normaliser(terme).split(/[\s,;]+/).filter(Boolean);
  }
  return derniersMots;
}

/**
 * Vrai si chaque mot saisi figure dans le texte, quels que soient la casse, les accents et l'ordre :
 * « yaya cisse » retrouve « CISSE Yaya ». Une saisie vide correspond à tout.
 */
export function correspond(texte: string | null | undefined, terme: string): boolean {
  const recherches = mots(terme);
  if (!recherches.length) return true;
  const cible = normaliser(texte ?? "");
  return recherches.every((mot) => cible.includes(mot));
}
