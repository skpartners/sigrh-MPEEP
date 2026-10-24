import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "../api/client";
import type { Dossier, SessionUser } from "../api/types";
import { Icone } from "./Icone";

/*
 * Socle des documents officiels du ministère (modèles Word de la DAAF) : en-tête, pied de page, feuille et utilitaires
 * de rédaction. Chaque modèle (certificat de cessation, attestations, autorisations…) n'écrit que son texte.
 */

/** Morceau de phrase : texte courant, passage en gras comme sur les exemplaires, ou blanc à compléter. */
export type Morceau = string | { gras: string };

export const g = (texte: string): Morceau => ({ gras: texte });

/** Pointillés laissés à la place d'une information pas encore connue ; elle les remplace dès qu'elle l'est. */
export const POINTS = "…………………";
export const ou = (valeur: string | null | undefined): string => (valeur ?? "").trim() || POINTS;

// --- Dates et nombres ----------------------------------------------------------------------------

const JOURS_SEMAINE = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

export function date(valeur: string): Date {
  return new Date(`${valeur}T00:00:00`);
}

export function iso(quand: Date): string {
  return `${quand.getFullYear()}-${String(quand.getMonth() + 1).padStart(2, "0")}-${String(quand.getDate()).padStart(2, "0")}`;
}

export function veille(valeur: string): string {
  const quand = date(valeur);
  quand.setDate(quand.getDate() - 1);
  return iso(quand);
}

/** 2026-10-05 → « lundi 05 octobre 2026 ». */
export function complete(valeur: string): string {
  const quand = date(valeur);
  return `${JOURS_SEMAINE[quand.getDay()]} ${String(quand.getDate()).padStart(2, "0")} ${MOIS[quand.getMonth()]} ${quand.getFullYear()}`;
}

/** 2026-10-26 → « lundi 26 octobre », l'année étant donnée à la fin de la période. */
export function sansAnnee(valeur: string): string {
  const quand = date(valeur);
  return `${JOURS_SEMAINE[quand.getDay()]} ${String(quand.getDate()).padStart(2, "0")} ${MOIS[quand.getMonth()]}`;
}

/** 2022-03-30 → « 30 mars 2022 ». */
export function dateLongue(valeur: string): string {
  const quand = date(valeur);
  return `${String(quand.getDate()).padStart(2, "0")} ${MOIS[quand.getMonth()]} ${quand.getFullYear()}`;
}

/** Une date AAAA-MM-JJ valide, sinon rien. */
export function dateValide(valeur: string | undefined): string {
  return valeur && /^\d{4}-\d{2}-\d{2}$/.test(valeur) && !Number.isNaN(date(valeur).getTime()) ? valeur : "";
}

function enLettres(valeur: number): string {
  if (valeur < 20) return UNITES[valeur] ?? String(valeur);
  if (valeur >= 100) return String(valeur);
  const dizaine = Math.floor(valeur / 10);
  const reste = valeur % 10;
  if (dizaine === 7 || dizaine === 9) return `${DIZAINES[dizaine]}-${UNITES[10 + reste]}`;
  if (reste === 0) return dizaine === 8 ? "quatre-vingts" : DIZAINES[dizaine];
  return `${DIZAINES[dizaine]}${reste === 1 && dizaine < 8 ? " et " : "-"}${UNITES[reste]}`;
}

/** 24 → « vingt-quatre (24) ». */
export function nombre(valeur: number): string {
  return `${enLettres(valeur)} (${String(valeur).padStart(2, "0")})`;
}

/** Ce que les modèles lisent d'un agent : le dossier complet convient, tout comme l'extrait du secrétariat. */
export type AgentDocument = Pick<Dossier, "matricule" | "nom" | "prenoms" | "grade" | "structure" | "prise_service" | "direction_complete"> & {
  etat_civil: Pick<Dossier["etat_civil"], "sexe_code" | "statut_matrimonial" | "nom_jeune_fille">;
  situation_saisie: Pick<Dossier["situation_saisie"], "emploi" | "direction" | "prise_service_ministere">;
};

// --- Désignations ----------------------------------------------------------------------------------

export function designation(agent: AgentDocument): { civilite: string; feminin: boolean; nom: string } {
  const feminin = agent.etat_civil.sexe_code === "F";
  const celibataire = /c[ée]libataire/i.test(agent.etat_civil.statut_matrimonial);
  const civilite = !feminin ? "Monsieur" : celibataire ? "Mademoiselle" : "Madame";
  const jeuneFille = agent.etat_civil.nom_jeune_fille.trim();
  const nom = feminin && !celibataire && jeuneFille && jeuneFille.toLowerCase() !== agent.nom.toLowerCase()
    ? `${jeuneFille} ${agent.prenoms} épouse ${agent.nom}`
    : `${agent.nom} ${agent.prenoms}`;
  return { civilite, feminin, nom };
}

/** « à la Direction… », « au Service… » : la préposition qui convient au nom de la structure. */
export function aStructure(structure: string): string {
  const nom = structure.trim();
  if (!nom) return `à ${POINTS}`;
  if (/^(direction|sous-direction|cellule|inspection|coordination|division)/i.test(nom)) return `à la ${nom}`;
  if (/^(service|cabinet|secr[ée]tariat|coll[èe]ge|pool|bureau|d[ée]partement)/i.test(nom)) return `au ${nom}`;
  if (/^[aeiouéèhAEIOUÉÈH]/.test(nom)) return `à l'${nom}`;
  return `à ${nom}`;
}

export function enServiceA(structure: string): string {
  return `en service ${aStructure(structure)}`;
}

// --- Signataire et numéro de courrier --------------------------------------------------------------

export type Signataire = { matricule: string; trouve: boolean; nom: string; prenoms: string; titre: string; fonction: string; direction: string };

/** Agent désigné dans les paramètres système pour signer les documents finaux. */
export function useSignataire(): Signataire | null {
  const parametres = useQuery({ queryKey: ["parametres"], queryFn: () => api<{ signataire?: Signataire }>("/api/v1/parametres/"), staleTime: 60_000 });
  const signataire = parametres.data?.signataire;
  return signataire?.trouve ? signataire : null;
}

/** Nom du signataire pour le corps du texte, « Signataire » tant qu'il n'est pas désigné. */
export function nomSignataire(signataire: Signataire | null): string {
  return signataire ? `${signataire.nom} ${signataire.prenoms}` : "Signataire";
}

const PETITS_MOTS = new Set(["de", "des", "du", "la", "le", "les", "et", "en", "au", "aux", "à", "d", "l"]);
const SIGLES = /^(daaf|drh|dgpe|dsi|dsps|dgpn|mpeep)$/i;

/** « ADMINISTRATEUR EN CHEF DES SERVICES FINANCIERS » → « Administrateur en Chef des Services Financiers », comme sur les exemplaires. */
export function enCasseTitre(texte: string): string {
  const brut = texte.trim();
  if (!brut || brut !== brut.toUpperCase()) return brut;
  return brut
    .toLowerCase()
    .split(/\s+/)
    .map((mot, rang) => {
      if (SIGLES.test(mot)) return mot.toUpperCase();
      const apostrophe = mot.match(/^([ldj])(['’])(.+)$/);
      if (apostrophe) return `${apostrophe[1]}${apostrophe[2]}${apostrophe[3].charAt(0).toUpperCase()}${apostrophe[3].slice(1)}`;
      if (rang > 0 && PETITS_MOTS.has(mot)) return mot;
      return mot.charAt(0).toUpperCase() + mot.slice(1);
    })
    .join(" ");
}

/**
 * Emploi tel que l'écrivent les exemplaires : « Technicien Supérieur de l'Informatique, option Gestion ».
 * Les données mêlent capitales et minuscules ; chaque mot prend une majuscule initiale, sauf les petits mots et « option ».
 * Un sigle (« GPE-COFEB ») garde ses capitales quand le reste de l'emploi n'est pas en capitales.
 */
export function enCasseEmploi(texte: string): string {
  const brut = (texte ?? "").trim();
  if (!brut) return brut;
  const toutEnCapitales = brut === brut.toUpperCase();
  return brut
    .split(/\s+/)
    .map((mot, rang) => {
      const bas = mot.toLowerCase();
      if (rang > 0 && (PETITS_MOTS.has(bas) || bas === "option")) return bas;
      const sigle = !toutEnCapitales && mot === mot.toUpperCase() && /[A-Z]/.test(mot) && (mot.length <= 4 || mot.includes("-"));
      if (sigle) return mot;
      const apostrophe = bas.match(/^([ldj])(['’])(.+)$/);
      if (apostrophe) return `${apostrophe[1]}${apostrophe[2]}${apostrophe[3].charAt(0).toUpperCase()}${apostrophe[3].slice(1)}`;
      return bas.split("-").map((partie) => partie.charAt(0).toUpperCase() + partie.slice(1)).join("-");
    })
    .join(" ");
}

/** Direction où l'agent est en service : les exemplaires écrivent « en service à la Direction … », jamais son service. */
export function directionAgent(agent: AgentDocument): string {
  return agent.direction_complete?.trim() || agent.situation_saisie.direction?.trim() || agent.structure;
}

/** Fonction du signataire telle qu'elle s'écrit dans le texte : « Directeur des Affaires… » d'après sa direction, comme sur les exemplaires. */
export function fonctionSignataire(signataire: Signataire | null): string {
  const direction = (signataire?.direction ?? "").trim();
  const generale = direction.match(/^direction\s+g[ée]n[ée]rale\b\s*(.*)$/i);
  if (generale) return `Directeur Général ${generale[1]}`.trim();
  const simple = direction.match(/^direction\b\s*(.*)$/i);
  if (simple) return `Directeur ${simple[1]}`.trim();
  const fonction = (signataire?.fonction ?? "").trim();
  if (!fonction) return "fonction";
  // Les fonctions sont parfois saisies en capitales : on les remet en casse de titre, sans toucher aux sigles.
  return enCasseTitre(fonction);
}

/** Fin du numéro de courrier : sigle du ministère, hiérarchie de la structure de la personne qui imprime, puis ses initiales. */
function numeroCourrier(utilisateur: SessionUser | undefined): string {
  const reference = utilisateur?.reference_courrier;
  const structures = reference?.structures.length ? reference.structures : [POINTS];
  return ["MPEEP", ...structures, reference?.initiales || POINTS].join("/");
}

// --- En-tête et pied de page -----------------------------------------------------------------------

const POLICE_ENTETE = { fontFamily: "'Arial Narrow', Arial, sans-serif" };
const POLICE_CORPS = { fontFamily: "Arial, Helvetica, sans-serif" };

/** En-tête officiel du ministère, repris à l'identique du modèle Word de la DAAF. */
export function EnteteOfficiel() {
  return (
    <header className="grid min-h-[11.17em] grid-cols-[1fr_auto_1fr] items-start gap-2 text-center text-[0.85em] leading-snug" style={POLICE_ENTETE}>
      <div>
        <p className="font-bold">MINISTERE DU PORTEFEUILLE DE L'ETAT<br />ET DES ENTREPRISES PUBLIQUES</p>
        {/* Trait orangé du modèle Word : accent 2 du thème (E97132), 0,31 em soit 3,75 pt, 16,25 em soit 195 pt de long. */}
        <div className="mx-auto my-[0.4em] h-[0.3125em] w-full max-w-[16.25em] bg-[#E97132]" role="separator" />
        <p className="mt-1 font-bold">DIRECTION DES AFFAIRES ADMINISTRATIVES<br />ET FINANCIERES</p>
        <p className="mt-1">--------------------</p>
        <p className="font-bold">LE DIRECTEUR</p>
        <p>--------------------</p>
      </div>
      <img src={`${import.meta.env.BASE_URL}entete-armoiries.jpeg`} alt="Armoiries de la République de Côte d'Ivoire" className="h-[3.6em] w-auto" />
      <div>
        <p className="font-bold">REPUBLIQUE DE CÔTE D'IVOIRE</p>
        <p className="mt-1">Union – Discipline – Travail</p>
        <p className="mt-1">--------------</p>
      </div>
    </header>
  );
}

/** Pied de page officiel, repris du modèle Word : filet double à gauche, puis deux lignes à puces (Arial Narrow 9 pt). */
export function PiedOfficiel() {
  return (
    <footer className="mt-[3em] text-[0.75em] leading-tight" style={POLICE_ENTETE}>
      <div className="ml-[1.56em] h-[0.4em] w-full max-w-[28.2em] border-y border-black" aria-hidden="true" />
      <ul className="mt-[0.8em] ml-[1.56em]">
        <li className="flex gap-x-10">
          <span className="w-[16em]">• Abidjan – Plateau</span>
          <span>• 01 BP 12666 Abj 01</span>
        </li>
        <li className="flex gap-x-10">
          <span className="w-[16em]">• Cité Financière Bâtiment B1 - 4<sup>ème</sup> étage</span>
          <span>• Tél. (+225) 27 20 20 57 53</span>
        </li>
      </ul>
    </footer>
  );
}

// --- Feuille ---------------------------------------------------------------------------------------

export type Paragraphe = {
  morceaux: Morceau[];
  /** Blanc sous le paragraphe, en em (1 em = corps 12 pt). */
  apres?: number;
  /** Interligne propre au paragraphe, sinon celui de la feuille. */
  interligne?: number;
};

export type Ampliation = { libelle: string; apres?: number };

export type MiseEnPage = {
  /** Blanc entre l'en-tête et la première ligne du texte (numéro de courrier ou titre), en em. */
  avantNumero: number;
  avantTitre: number;
  apresTitre: number;
  avantSignature: number;
  avantAmpliations: number;
  interligne: number;
};

/** Mise en page du certificat de cessation, reprise des autres modèles quand ils n'en précisent pas une. */
export const MISE_EN_PAGE_COURANTE: MiseEnPage = { avantNumero: 3.5, avantTitre: 9.3, apresTitre: 3.5, avantSignature: 9.4, avantAmpliations: 1.8, interligne: 1.725 };

type PropsFeuille = {
  titre: string;
  /** Corps du titre en em (1 em = 12 pt). */
  tailleTitre: number;
  /** Ligne « N° …/ MPEEP/… » et « Abidjan, le … » : absente des attestations. */
  avecNumero: boolean;
  paragraphes: Paragraphe[];
  mise: MiseEnPage;
  ampliations: Ampliation[];
  titreAmpliations?: string;
  /** Feuille destinée au papier : corps de 12 pt (celui du modèle), sans cadre ni ombre. */
  impression?: boolean;
};

/** Feuille A4 du modèle Word : en-tête, numéro, titre, texte, cadre de signature, ampliations et pied de page. */
export function FeuilleOfficielle({ titre, tailleTitre, avecNumero, paragraphes, mise, ampliations, titreAmpliations = "AMPLIATIONS", impression = false }: PropsFeuille) {
  const signataire = useSignataire();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  return (
    <div className={impression ? "" : "overflow-x-auto rounded-lg bg-surface-container p-3 sm:p-5"}>
      {/* Mise en page du modèle Word, en em (1 em = corps 12 pt du modèle) : interlignes et blancs comme sur l'exemplaire. */}
      <article
        className={impression
          ? "feuille-officielle zone-impression mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white shadow-md print:shadow-none px-[4.7em] py-[3em] text-[12pt] text-black"
          : "mx-auto w-full max-w-[49.6em] bg-white px-[4.7em] py-[3em] text-[0.8em] text-black shadow-md"}
        style={POLICE_CORPS}
        aria-live="polite"
      >
        <EnteteOfficiel />
        {avecNumero ? (
          <div className="flex flex-wrap justify-between gap-2 leading-[1.4]" style={{ marginTop: `${mise.avantNumero}em` }}>
            <span>N° _________/{numeroCourrier(me.data)}</span>
            <span>Abidjan, le {complete(iso(new Date()))}</span>
          </div>
        ) : null}
        <h4
          className="text-center font-bold leading-[1.4] underline"
          style={{ fontSize: `${tailleTitre}em`, marginTop: `${avecNumero ? mise.avantTitre : mise.avantNumero + mise.avantTitre}em`, marginBottom: `${mise.apresTitre}em` }}
        >
          {titre}
        </h4>
        <div className="text-justify">
          {paragraphes.map((paragraphe, rang) => (
            <p key={rang} style={{ lineHeight: paragraphe.interligne ?? mise.interligne, marginBottom: `${paragraphe.apres ?? 0.83}em` }}>
              {paragraphe.morceaux.map((morceau, position) => (typeof morceau === "string" ? morceau : <strong key={position}>{morceau.gras}</strong>))}
            </p>
          ))}
        </div>
        {/* Cadre de signature du modèle : à 273 pt de la marge, 214 pt de large, texte centré (nom 12 pt, emploi 9 pt). */}
        <div className="ml-[22.75em] w-[17.8em] text-center" style={{ marginTop: `${mise.avantSignature}em` }}>
          {signataire ? (
            <>
              <p className="font-bold underline">{nomSignataire(signataire)}</p>
              <p className="text-[0.75em] leading-tight">{enCasseEmploi(signataire.titre)}</p>
            </>
          ) : (
            <p className="font-bold">Signataire</p>
          )}
        </div>
        <div className="text-[0.667em] leading-[1.15]" style={{ marginTop: `${mise.avantAmpliations}em` }}>
          <p className="mb-[0.375em] font-bold underline">{titreAmpliations}</p>
          <dl className="grid w-fit grid-cols-[auto_auto] gap-x-[3em]">
            {ampliations.map((ampliation) => (
              <div key={ampliation.libelle} className="contents">
                <dt style={{ marginBottom: `${ampliation.apres ?? 0}em` }}>{ampliation.libelle}</dt>
                <dd style={{ marginBottom: `${ampliation.apres ?? 0}em` }}>1</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Sur papier, le pied de page reste en bas de la feuille, comme dans le modèle Word. */}
        <div className={impression ? "mt-auto" : ""}>
          <PiedOfficiel />
        </div>
      </article>
    </div>
  );
}

/** Cadre d'un aperçu : titre du document, éventuel réglage à droite, puis la feuille. */
export function CadreApercu({ id, titre, reglage, children }: { id: string; titre: string; reglage?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <h3 id={id} className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
        <Icone nom="description" className="text-primary text-xl" />{titre}
        {reglage}
      </h3>
      {children}
    </section>
  );
}
