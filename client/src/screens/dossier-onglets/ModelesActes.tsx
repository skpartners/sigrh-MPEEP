import {
  CadreApercu,
  type AgentDocument,
  FeuilleOfficielle,
  POINTS,
  aStructure,
  dateLongue,
  directionAgent,
  enCasseEmploi,
  dateValide,
  date,
  designation,
  enServiceA,
  fonctionSignataire,
  g,
  nomSignataire,
  nombre,
  ou,
  useSignataire,
  type Ampliation,
  type Morceau,
  type MiseEnPage,
  type Paragraphe,
  type Signataire,
} from "../../ui/DocumentOfficiel";

/*
 * Modèles des actes que l'agent demande (exemplaires de la DAAF). Pour en ajouter un : déposer son exemplaire dans le dossier
 * des modèles, écrire ici sa rédaction et l'inscrire dans MODELES avec le code de l'acte demandable qui le porte.
 */

export type Entree = { agent: AgentDocument; debut: string; fin: string; signataire: Signataire | null };

type Modele = {
  titre: string;
  tailleTitre: number;
  avecNumero: boolean;
  mise: MiseEnPage;
  titreAmpliations?: string;
  ampliations: (feminin: boolean) => Ampliation[];
  paragraphes: (entree: Entree) => Paragraphe[];
};

/** Rédaction commune des deux attestations : « Je soussigné … atteste que … ». */
function attestation(entree: Entree, situation: (structure: string, depuis: string, feminin: boolean) => Morceau[]): Paragraphe[] {
  const { agent, signataire } = entree;
  const { civilite, feminin, nom } = designation(agent);
  // « depuis le » : la prise de service au ministère ; à défaut, la première prise de service.
  const depuis = dateValide(agent.situation_saisie.prise_service_ministere) || dateValide(agent.prise_service);
  return [
    {
      interligne: 1.725,
      apres: 1.8,
      morceaux: [
        "Je soussigné ",
        g(`${nomSignataire(signataire)},`),
        " ",
        g(fonctionSignataire(signataire)),
        " du Ministère du Portefeuille de l'Etat et des Entreprises Publiques, atteste que ",
        g(`${civilite} ${nom},`),
        " Matricule ",
        g(ou(agent.matricule)),
        ", ",
        g(ou(enCasseEmploi(agent.situation_saisie.emploi || agent.grade))),
        g(", "),
        ...situation(directionAgent(agent), depuis ? dateLongue(depuis) : POINTS, feminin),
      ],
    },
    { interligne: 1.32, apres: 0.83, morceaux: ["En foi de quoi, la présente attestation lui est délivrée pour servir et valoir ce que de droit."] },
  ];
}

// Le numéro et la date sont dans l'en-tête du Word des attestations, juste sous le bloc officiel.
const MISE_ATTESTATION: MiseEnPage = { avantNumero: 3.5, avantTitre: 3, apresTitre: 1.2, avantSignature: 6, avantAmpliations: 3.5, interligne: 1.725 };

const AMPLIATIONS_ATTESTATION = (feminin: boolean): Ampliation[] => [{ libelle: "CHRONO" }, { libelle: feminin ? "Intéressée" : "Intéressé" }, { libelle: "Dossier" }];

/** Mois entiers les plus proches entre deux dates, pour la durée d'une autorisation. */
function moisEntre(debut: string, fin: string): number {
  return Math.max(Math.round((date(fin).getTime() - date(debut).getTime()) / 86_400_000 / 30.4375), 0);
}

const MODELES: Record<string, Modele> = {
  "attestation-travail": {
    titre: "ATTESTATION DE TRAVAIL",
    tailleTitre: 1.667,
    avecNumero: true,
    mise: MISE_ATTESTATION,
    titreAmpliations: "AMPLIATIONS :",
    ampliations: AMPLIATIONS_ATTESTATION,
    paragraphes: (entree) => attestation(entree, (structure, depuis) => [`est ${enServiceA(structure)} depuis le `, g(`${depuis}.`)]),
  },
  "attestation-presence": {
    titre: "ATTESTATION DE PRESENCE",
    tailleTitre: 1.667,
    avecNumero: true,
    mise: MISE_ATTESTATION,
    titreAmpliations: "AMPLIATIONS :",
    ampliations: AMPLIATIONS_ATTESTATION,
    paragraphes: (entree) => attestation(entree, (structure, depuis, feminin) => [`est ${feminin ? "présente" : "présent"} à son poste de travail, ${aStructure(structure)}, depuis le `, g(`${depuis}.`)]),
  },
  "autorisation-horaire-allaitement": {
    titre: "AUTORISATION D'HORAIRE POUR ALLAITEMENT",
    tailleTitre: 1.333,
    avecNumero: true,
    mise: { avantNumero: 3.5, avantTitre: 6.35, apresTitre: 0.4, avantSignature: 6, avantAmpliations: 3, interligne: 1.32 },
    ampliations: (feminin) => [{ libelle: "MBPE/CAB", apres: 0.83 }, { libelle: "CHRONO", apres: 0.83 }, { libelle: "Dossier" }, { libelle: feminin ? "Intéressée" : "Intéressé" }],
    paragraphes: ({ agent, debut, fin }) => {
      const { civilite, nom } = designation(agent);
      const mois = debut && fin && fin > debut ? moisEntre(debut, fin) : 0;
      return [
        {
          morceaux: [
            "Conformément à l'article ",
            g("23.12 de la loi n° 2015-532 du 20 juillet 2015 "),
            "portant code du ",
            g("travail"),
            `, il est accordé à ${civilite.toLowerCase()} `,
            g(`${nom}, Matricule ${ou(agent.matricule)},`),
            " ",
            g(ou(enCasseEmploi(agent.situation_saisie.emploi || agent.grade))),
            `, ${enServiceA(directionAgent(agent))}, un temps de repos pour allaitement d'une (01) heure par jour sur une durée de ${mois > 0 ? nombre(mois) : POINTS} mois.`,
          ],
        },
        { morceaux: ["Par conséquent, les horaires de service de l'intéressée s'établissent comme suit :"] },
        { interligne: 1.3, apres: 0.67, morceaux: ["Début du service : 07h30 mn."] },
        { interligne: 1.3, apres: 0.67, morceaux: ["Fin de service : 15h30 mn."] },
        {
          apres: 1.17,
          morceaux: [`La présente autorisation prend effet à compter du ${debut ? dateLongue(debut) : POINTS} et prendra fin le ${fin ? dateLongue(fin) : POINTS}.`],
        },
      ];
    },
  },
};

/** Vrai quand un modèle de document est rattaché à cet acte demandable. */
export function aModeleActe(code: string): boolean {
  return code in MODELES;
}

/** Feuille du document que délivre l'acte, à l'écran ou pour le papier. */
export function FeuilleActe({ agent, code, debut = "", fin = "", impression = false }: { agent: AgentDocument; code: string; debut?: string; fin?: string; impression?: boolean }) {
  const signataire = useSignataire();
  const modele = MODELES[code];
  if (!modele) return null;
  return (
    <FeuilleOfficielle
      titre={modele.titre}
      tailleTitre={modele.tailleTitre}
      avecNumero={modele.avecNumero}
      impression={impression}
      mise={modele.mise}
      titreAmpliations={modele.titreAmpliations}
      paragraphes={modele.paragraphes({ agent, debut, fin, signataire })}
      ampliations={modele.ampliations(agent.etat_civil.sexe_code === "F")}
    />
  );
}

/** Aperçu du document que délivrera l'acte demandé, rempli d'après le dossier et la saisie. */
export function ApercuActe({ agent, code, debut = "", fin = "" }: { agent: AgentDocument; code: string; debut?: string; fin?: string }) {
  const modele = MODELES[code];
  if (!modele) return null;
  return (
    <CadreApercu id="titre-apercu-acte" titre={modele.titre.charAt(0) + modele.titre.slice(1).toLowerCase()}>
      <FeuilleActe agent={agent} code={code} debut={debut} fin={fin} />
    </CadreApercu>
  );
}

/** Texte du corps d'un acte, paragraphe par paragraphe : sert à contrôler la rédaction contre les exemplaires. */
export function corpsActe(code: string, entree: Entree): string[] {
  const modele = MODELES[code];
  return modele ? modele.paragraphes(entree).map((paragraphe) => paragraphe.morceaux.map((morceau) => (typeof morceau === "string" ? morceau : morceau.gras)).join("")) : [];
}
