export const ENTETE_CLE = "Idempotency-Key";
export const ENTETE_SAISIE = "X-Saisi-Le";
/** Posé seulement au rejeu depuis la file : le serveur vérifie alors le droit du rôle à agir hors ligne. */
export const ENTETE_DIFFERE = "X-Hors-Ligne";

/** Les en-têtes qui rendent une action rejouable : sa clé d'idempotence et l'instant de sa saisie. */
export function entetesRejeu(id: string, saisieLe: string, differe = false): Record<string, string> {
  return { [ENTETE_CLE]: id, [ENTETE_SAISIE]: saisieLe, ...(differe ? { [ENTETE_DIFFERE]: "1" } : {}) };
}
