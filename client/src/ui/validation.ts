/** Contrôles de saisie du profil agent. Chaque contrôle renvoie le message d'erreur, ou null quand la valeur est acceptable. */

/** Numéro ivoirien à 10 chiffres (01, 05, 07 mobiles ; 20 à 27 fixes), avec l'indicatif +225 ou 00225 en option. */
const TELEPHONE_CI = /^(?:\+225|00225)?(?:0[157]|2[0-7])\d{8}$/;
const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NOM_PROPRE = /^[\p{L}][\p{L}\s'’.-]*$/u;

export const FORMAT_TELEPHONE = "Ex. : 07 08 09 10 11";

export function normaliserTelephone(valeur: string): string {
  return valeur.replace(/[\s.()-]/g, "");
}

export function controleTelephone(valeur: string): string | null {
  const brut = valeur.trim();
  if (!brut) return null;
  return TELEPHONE_CI.test(normaliserTelephone(brut)) ? null : "Numéro ivoirien attendu : 10 chiffres (07 08 09 10 11), avec ou sans +225.";
}

export function controleCourriel(valeur: string): string | null {
  const brut = valeur.trim();
  if (!brut) return null;
  return COURRIEL.test(brut) ? null : "Adresse e-mail invalide (exemple : prenom.nom@domaine.ci).";
}

export function controleNom(valeur: string): string | null {
  const brut = valeur.trim();
  if (!brut) return null;
  return NOM_PROPRE.test(brut) ? null : "Uniquement des lettres, espaces, apostrophes et traits d'union.";
}

export function controleDateNaissance(valeur: string): string | null {
  if (!valeur) return null;
  const jour = new Date(valeur);
  if (Number.isNaN(jour.getTime())) return "Date invalide.";
  if (jour > new Date()) return "La date ne peut pas être dans le futur.";
  if (jour.getFullYear() < 1900) return "Date trop ancienne.";
  return null;
}

type Controle = (valeur: string) => string | null;

/** Contrôle et exemple de saisie de chaque champ du profil, par nom de champ. */
export const CHAMPS_PROFIL: Record<string, { placeholder: string; controle?: Controle }> = {
  nom: { placeholder: "Ex. : KOUASSI", controle: controleNom },
  prenoms: { placeholder: "Ex. : Aya Marie", controle: controleNom },
  nom_jeune_fille: { placeholder: "Ex. : TRAORÉ", controle: controleNom },
  date_naissance: { placeholder: "jj/mm/aaaa", controle: controleDateNaissance },
  lieu_naissance: { placeholder: "Ex. : Bouaké" },
  date_mariage: { placeholder: "jj/mm/aaaa", controle: controleDateNaissance },
  adresse_residence: { placeholder: "Ex. : Cocody Angré, 8e tranche, lot 123" },
  ville: { placeholder: "Ex. : Abidjan" },
  telephone: { placeholder: FORMAT_TELEPHONE, controle: controleTelephone },
  telephone_secondaire: { placeholder: FORMAT_TELEPHONE, controle: controleTelephone },
  courriel: { placeholder: "prenom.nom@domaine.ci", controle: controleCourriel },
  contact_urgence_nom: { placeholder: "Nom et prénoms de la personne", controle: controleNom },
  contact_urgence_telephone: { placeholder: FORMAT_TELEPHONE, controle: controleTelephone },
  conjoint_nom: { placeholder: "Ex. : KOFFI", controle: controleNom },
  conjoint_prenoms: { placeholder: "Ex. : Jean Baptiste", controle: controleNom },
  conjoint_telephone: { placeholder: FORMAT_TELEPHONE, controle: controleTelephone },
  conjoint_courriel: { placeholder: "prenom.nom@domaine.ci", controle: controleCourriel },
};

/** Première erreur du brouillon, avec le nom du champ fautif ; null quand tout est valide. */
export function premiereErreur(brouillon: Record<string, string>): { champ: string; message: string } | null {
  for (const [champ, { controle }] of Object.entries(CHAMPS_PROFIL)) {
    const message = controle?.(brouillon[champ] ?? "");
    if (message) return { champ, message };
  }
  return null;
}
