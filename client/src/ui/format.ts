// Formats d'affichage français partagés par les écrans.

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function jour(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** « 12 janvier 2026 » */
export function dateLongue(iso: string | null | undefined, vide = "Non renseignée"): string {
  if (!iso) return vide;
  return jour(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** « 12/01/2026 » */
export function dateCourte(iso: string | null | undefined, vide = "—"): string {
  if (!iso) return vide;
  return jour(iso).toLocaleDateString("fr-FR");
}

/** « janv. 2026 », pour les filtres par période. */
export function moisAnnee(iso: string): string {
  const d = jour(iso);
  return `${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`;
}

export function nombre(valeur: number, decimales = 0): string {
  return valeur.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** « 8 500 000 FCFA » */
export function fcfa(montant: number): string {
  return `${nombre(montant)} FCFA`;
}

export function pluriel(n: number, singulier: string, plurielForme = `${singulier}s`): string {
  return `${nombre(n)} ${n > 1 ? plurielForme : singulier}`;
}
