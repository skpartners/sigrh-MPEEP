const ENTREE = /\/assets\/(index-[\w-]+\.js)/;

/** Événement : demande de vérifier tout de suite si une nouvelle version est publiée (après une coupure, par exemple). */
export const VERIFIER_VERSION = "sigrh:verifier-version";

/** Nom du fichier d'entrée haché (`index-XXXX.js`) trouvé dans un document HTML, ou `null`. */
export function entreeDuDocument(html: string): string | null {
  return ENTREE.exec(html)?.[1] ?? null;
}

/** Fichier d'entrée chargé par la page courante (`null` en développement : pas de hash). */
export function entreeChargee(): string | null {
  for (const script of Array.from(document.querySelectorAll("script[src]"))) {
    const nom = entreeDuDocument(script.getAttribute("src") ?? "");
    if (nom) return nom;
  }
  return null;
}

/**
 * Vrai si le serveur publie un autre build que celui chargé dans cet onglet. Une erreur réseau ne signale jamais
 * de nouvelle version : le serveur peut simplement être en train de redémarrer.
 */
export async function nouvelleVersionPubliee(): Promise<boolean> {
  const chargee = entreeChargee();
  if (!chargee) return false;
  try {
    const reponse = await fetch(import.meta.env.BASE_URL, { cache: "no-store", headers: { Accept: "text/html" } });
    if (!reponse.ok) return false;
    const publiee = entreeDuDocument(await reponse.text());
    return publiee !== null && publiee !== chargee;
  } catch {
    return false;
  }
}
