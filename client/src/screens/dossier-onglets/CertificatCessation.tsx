import { useState } from "react";
import { CadreApercu, FeuilleOfficielle, type AgentDocument, MISE_EN_PAGE_COURANTE, POINTS, complete, date, designation, enServiceA, fonctionSignataire, g, iso, nombre, ou, sansAnnee, useSignataire, veille, type Morceau, type Signataire } from "../../ui/DocumentOfficiel";

/** Modèles du certificat de cessation de service (exemplaires de la DAAF) selon le congé demandé. */
export type ModeleCessation = "annuel" | "tranche" | "maternite" | "paternite" | "autre";

export type EntreeCertificat = {
  agent: AgentDocument;
  /** Code du congé choisi dans la modale. */
  type: string;
  /** Premier jour de congé (inclus) et jour de reprise, au format AAAA-MM-JJ. */
  debut: string;
  fin: string;
  /** Jours décomptés par la modale. */
  jours: number;
  annuel: boolean;
  /** Rang de la période parmi celles arrêtées par la campagne, et leur nombre. */
  rang: number;
  periodes: number;
  /** Exercice dont relève le congé annuel : le plus ancien qui compte encore des jours ; à défaut, N-1 (jamais N). */
  exercice?: number | null;
  /** Libellé du congé choisi, repris par la formule générale quand le ministère n'a pas d'exemplaire. */
  libelle?: string;
  /** Signataire des documents : sa fonction ouvre les certificats de maternité et de paternité. */
  signataire?: Signataire | null;
};

// Horaires de service du ministère, tels qu'ils figurent sur les exemplaires.
const HEURE_CESSATION = "16 heures 30 minutes";
const HEURE_REPRISE = "07 heures 30 minutes";

/** Modèle du certificat : celui de la DAAF quand il existe, sinon la formule générale du congé. */
export function modeleCessation({ type, annuel, periodes }: Pick<EntreeCertificat, "type" | "annuel" | "periodes">): ModeleCessation {
  if (/maternit/i.test(type)) return "maternite";
  if (/paternit/i.test(type)) return "paternite";
  if (annuel) return periodes > 1 ? "tranche" : "annuel";
  return "autre";
}

/** Paragraphes du certificat : toujours complets, les éléments manquants étant en pointillés. */
export function corpsCertificat(entree: EntreeCertificat): { modele: ModeleCessation; paragraphes: Morceau[][] } {
  const modele = modeleCessation(entree);
  const { agent, debut, fin } = entree;
  const dates = Boolean(debut && fin && fin > debut);
  const jours = dates && entree.jours > 0 ? String(entree.jours) : POINTS;
  const { civilite, feminin, nom } = designation(agent);
  const interesse = feminin ? "l'intéressée" : "l'intéressé";
  const emploi = ou(agent.situation_saisie.emploi || agent.grade);
  const service = enServiceA(agent.structure);
  const matricule = `matricule ${ou(agent.matricule)}`;
  const cessation = dates ? complete(veille(debut)) : POINTS;
  const dernier = dates ? complete(veille(fin)) : POINTS;
  const du = debut ? sansAnnee(debut) : POINTS;
  const reprise_le = dates ? complete(fin) : POINTS;
  // Un congé pris en N est dû au titre de N-1, ou d'un exercice plus ancien quand il a été reporté : jamais de N.
  const exercice = entree.exercice ? String(entree.exercice) : debut ? String(Number(debut.slice(0, 4)) - 1) : POINTS;
  const passe = dates && iso(new Date()) > veille(debut);
  const reprise: Morceau[] = [`A l'issue de son congé, ${interesse} reprendra le service à son poste habituel, `, g(`le ${reprise_le}`), `, à ${HEURE_REPRISE}.`];
  const cloture: Morceau[] = ["En foi de quoi, le présent certificat est établi pour servir et valoir ce que de droit."];

  if (modele === "maternite") {
    const semaines = dates ? Math.round((date(fin).getTime() - date(debut).getTime()) / 86_400_000 / 7) : 0;
    return {
      modele,
      paragraphes: [
        [
          `Le ${fonctionSignataire(entree.signataire ?? null)} soussigné, certifie que `,
          g(`${civilite} ${nom}`),
          `, ${matricule}, ${emploi}, ${service}, bénéficiaire d'un congé de maternité de ${semaines > 0 ? nombre(semaines) : POINTS} semaines, ${passe ? "a cessé" : "cessera"} le service `,
          g(`le ${cessation}`),
          ".",
        ],
        [`A l'issue de son congé, ${interesse} reprendra le service à son poste `, g(`le ${reprise_le} à 7h30`), "."],
        cloture,
      ],
    };
  }
  if (modele === "paternite") {
    return {
      modele,
      paragraphes: [
        [
          `Le ${fonctionSignataire(entree.signataire ?? null)} soussigné, certifie que `,
          g(`${civilite} ${nom}`),
          ", ",
          g(`${matricule}, ${emploi},`),
          ` ${service}, est bénéficiaire d'un `,
          g(`congé de paternité de ${dates && entree.jours > 0 ? nombre(entree.jours) : POINTS} jours`),
          ", allant du ",
          g(`${du} au ${dernier}`),
          " inclus.",
        ],
        reprise,
        cloture,
      ],
    };
  }
  const identite: Morceau[] = [g(`${civilite} ${nom},`), " ", g(`${matricule},`), " ", g(`${emploi},`), ` ${service}, `];
  if (modele === "tranche") {
    const derniere = entree.rang >= entree.periodes - 1;
    return {
      modele,
      paragraphes: [
        [
          ...identite,
          `bénéficiaire de la ${derniere ? "dernière" : "première"} tranche de son `,
          g("congé annuel"),
          " ",
          g(`de ${jours} jours`),
          " au titre ",
          g(`${exercice},`),
          ` ${passe ? "a cessé" : "cessera"} le service le `,
          g(`${cessation}, à ${HEURE_CESSATION}`),
          ".",
        ],
        reprise,
        cloture,
      ],
    };
  }
  if (modele === "autre") {
    // Pas d'exemplaire de la DAAF pour ce congé : la formule générale reprend celle du congé annuel.
    return {
      modele,
      paragraphes: [
        [...identite, "est bénéficiaire d'un ", g(ou(entree.libelle ?? "congé").toLowerCase()), " ", g(`de ${jours} jours`), ", allant ", g(`du ${du} au ${dernier} inclus`), "."],
        reprise,
        cloture,
      ],
    };
  }
  return {
    modele,
    paragraphes: [
      [
        ...identite,
        "est bénéficiaire d'un ",
        g("congé"),
        " ",
        g(`de ${jours} jours`),
        " au titre de l'année ",
        g(`${exercice},`),
        " allant ",
        g(`du ${du} au ${dernier} inclus`),
        ".",
      ],
      reprise,
      cloture,
    ],
  };
}

/** Feuille du certificat de cessation de service, à l'écran ou pour le papier. */
export function FeuilleCertificat({ entree: saisie, impression = false }: { entree: EntreeCertificat; impression?: boolean }) {
  const signataire = useSignataire();
  const entree = { ...saisie, signataire };
  const certificat = corpsCertificat(entree);
  return (
    <FeuilleOfficielle
      titre="CERTIFICAT DE CESSATION DE SERVICE"
      tailleTitre={1.333}
      avecNumero
      impression={impression}
      mise={MISE_EN_PAGE_COURANTE}
      paragraphes={certificat.paragraphes.map((morceaux, rang) => ({ morceaux, apres: rang === 2 ? 0.5 : 0.83 }))}
      ampliations={[{ libelle: "Chrono", apres: 1.25 }, { libelle: "Dossier" }, { libelle: entree.agent.etat_civil.sexe_code === "F" ? "Intéressée" : "Intéressé" }]}
    />
  );
}

/** Exercices proposables pour un congé annuel : N-1, N-2, et celui que les droits de l'agent désignent. */
export function ChoixExercice({ debut, auto, valeur, onChange, classe }: { debut: string; auto?: number | null; valeur?: number | null; onChange: (exercice: number) => void; classe: string }) {
  const annee = Number(debut.slice(0, 4) || new Date().getFullYear());
  const propositions = [...new Set([annee - 1, annee - 2, ...(auto ? [auto] : [])])].sort((a, b) => b - a);
  return (
    <label className="flex items-center gap-2 font-label-sm text-label-sm font-normal text-on-surface-variant">
      Au titre de
      <select className={classe} value={valeur ?? auto ?? annee - 1} onChange={(event) => onChange(Number(event.target.value))}>
        {propositions.map((exercice) => (
          <option key={exercice} value={exercice}>
            {exercice}
            {exercice === annee - 1 ? " (N-1)" : exercice === annee - 2 ? " (N-2)" : ""}
            {exercice === auto ? " · selon les droits" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Aperçu du certificat tel qu'il sera délivré, mis à jour pendant la saisie de la demande. */
export function ApercuCertificat({ entree: saisie }: { entree: EntreeCertificat }) {
  const [choix, setChoix] = useState<number | null>(null);
  const entree = { ...saisie, exercice: choix ?? saisie.exercice ?? null };
  return (
    <CadreApercu
      id="titre-apercu-certificat"
      titre="Certificat de cessation de service"
      reglage={
        entree.annuel ? (
          <span className="ml-auto">
            <ChoixExercice debut={entree.debut} auto={saisie.exercice} valeur={choix} onChange={setChoix} classe="h-8 rounded border border-outline-variant bg-surface-container-lowest px-2" />
          </span>
        ) : null
      }
    >
      <FeuilleCertificat entree={entree} />
    </CadreApercu>
  );
}
