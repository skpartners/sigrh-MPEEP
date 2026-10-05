import type { ReactNode } from "react";
import { mediaUrl, telecharger } from "../../api/client";
import type { Dossier } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";

export type Demande = Dossier["demandes"][number];
export type Absence = Dossier["absences"][number];

// --- Formats -------------------------------------------------------------------------

const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function groupe(montant: number): string {
  return montant.toLocaleString("fr-FR");
}

export function pourcent(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(",", ".");
}

/** 2026-03-14 → « 14 mars 2026 ». */
export function dateFr(iso: string): string {
  const [annee, mois, jourMois] = iso.split("-");
  return `${jourMois} ${MOIS_LONGS[Number(mois) - 1]} ${annee}`;
}

/** 2026-03-14 → « 14/03/2026 ». */
export function jour(iso: string): string {
  const [annee, mois, jourMois] = iso.split("-");
  return `${jourMois}/${mois}/${annee}`;
}

/** Période courte : « 05 janv. - 16 janv. 2026 ». */
export function periode(debut: string, fin: string): string {
  if (debut === fin) {
    const [annee, mois, jourMois] = debut.split("-").map(Number);
    return `${String(jourMois).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
  }
  const [anneeDebut, moisDebut, jourDebut] = debut.split("-").map(Number);
  const [anneeFin, moisFin, jourFin] = fin.split("-").map(Number);
  const gauche = `${String(jourDebut).padStart(2, "0")} ${MOIS[moisDebut - 1]}`;
  const droite = `${String(jourFin).padStart(2, "0")} ${MOIS[moisFin - 1]} ${anneeFin}`;
  return anneeDebut === anneeFin ? `${gauche} - ${droite}` : `${gauche} ${anneeDebut} - ${droite}`;
}

export function pluriel(nombre: number, mot: string): string {
  return `${nombre} ${mot}${nombre > 1 ? "s" : ""}`;
}

// --- Circuit des demandes ------------------------------------------------------------------

function normaliser(texte: string): string {
  return texte.toLowerCase().replaceAll("é", "e").replaceAll("ô", "o");
}

export function etapeCourante(demande: Demande): number {
  return Number(normaliser(demande.etape).match(/\d+/)?.[0] ?? 1);
}

export function demandeClose(demande: Demande): boolean {
  const etape = normaliser(demande.etape);
  return etape.includes("etape 5") || etape.includes("notifie") || etape.includes("clotur");
}

export function estPret(demande: Demande): boolean {
  return demande.categorie === "social" && /pr[eê]t/i.test(demande.nature);
}

export function absenceEnCours(absence: Absence): boolean {
  return !/(pris|justifi|clotur|archiv|exécut|execute|notifi)/i.test(absence.statut);
}

/** Une demande et ses visas, étape par étape. */
export function CircuitDemande({ demande, clos = false, suite }: { demande: Demande; clos?: boolean; suite?: ReactNode }) {
  const courant = clos ? 6 : etapeCourante(demande);
  return (
    <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${clos ? "bg-primary" : "bg-secondary-container animate-pulse"}`} />
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              {clos ? `Circuit clos : Demande #${demande.reference}` : `Circuit d'Ordonnancement en Cours : Demande #${demande.reference}`}
            </h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {demande.nature} • {demande.responsable}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-bold flex items-center gap-1">
            <Icone nom="schedule" className="text-sm" /> {demande.echeance}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
        {demande.visas.map((visa) => (
          <CarteEtape key={visa.ordre} visa={visa} courant={courant} />
        ))}
      </div>
      {suite}
    </div>
  );
}

function CarteEtape({ visa, courant }: { visa: Demande["visas"][number]; courant: number }) {
  const passe = visa.ordre < courant;
  const encours = visa.ordre === courant;
  const fond = encours ? "bg-secondary-fixed/30" : passe ? "bg-surface-container-low" : "bg-surface-container-low opacity-70";
  const badge = encours ? "bg-secondary-container text-on-secondary-container" : passe ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant";
  const couleur = encours ? "text-secondary" : passe ? "text-primary" : "text-on-surface-variant";
  return (
    <div className={`p-3.5 rounded-lg ${fond} flex flex-col justify-between space-y-3`}>
      <div className="flex items-center justify-between">
        <span className={`font-code-num text-code-num px-2 py-0.5 rounded ${badge} font-bold`}>
          {encours ? `Étape ${visa.ordre} • En cours` : `Étape ${visa.ordre}`}
        </span>
        <Icone nom={encours ? "sync" : passe ? "check_circle" : "radio_button_unchecked"} className={`${couleur} text-lg${encours ? " animate-spin" : ""}`} />
      </div>
      <div>
        <p className="font-label-md text-label-md text-on-surface font-bold">{visa.instance}</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{visa.titulaire || visa.avis}</p>
        <p className={`font-label-sm text-label-sm ${couleur} font-semibold mt-1`}>{visa.date ? dateFr(visa.date) : "En attente de transmission"}</p>
        {visa.signature_url ? (
          <div className="mt-2 flex h-12 items-center justify-center rounded bg-white px-2">
            <img src={mediaUrl(visa.signature_url)} alt={`Signature de ${visa.titulaire || visa.instance}`} className="max-h-10 max-w-full object-contain" />
          </div>
        ) : null}
      </div>
      <span className="font-label-sm text-label-sm text-on-surface-variant">{visa.fonction || visa.avis}</span>
    </div>
  );
}

/** Message neutre d'une rubrique sans demande. */
export function RubriqueVide({ children }: { children: ReactNode }) {
  return (
    <div className="p-3.5 rounded bg-surface-container-low">
      <p className="font-body-sm text-body-sm text-on-surface-variant">{children}</p>
    </div>
  );
}

// --- Documents de l'agent ---------------------------------------------------------------------

type Document = "bulletin" | "releve" | "rapport";

const DOCUMENTS: Record<Document, { chemin: string; fichier: string; attente: string; titre: string; message: string; erreur: string }> = {
  bulletin: {
    chemin: "notations/bulletin",
    fichier: "notations",
    attente: "Préparation du bulletin…",
    titre: "Bulletin prêt",
    message: "Le relevé des notations de cet agent est téléchargé.",
    erreur: "Le bulletin n'a pas pu être préparé.",
  },
  releve: {
    chemin: "conges/releve",
    fichier: "conges",
    attente: "Préparation du relevé de congés…",
    titre: "Relevé prêt",
    message: "Le relevé des congés de cet agent est téléchargé.",
    erreur: "Le relevé n'a pas pu être préparé.",
  },
  rapport: {
    chemin: "social/rapport",
    fichier: "social",
    attente: "Préparation du rapport social…",
    titre: "Rapport prêt",
    message: "Le rapport des prestations de cet agent est téléchargé.",
    erreur: "Le rapport n'a pas pu être préparé.",
  },
};

/** Télécharge un document PDF du dossier, avec l'attente et les messages habituels. */
export function useDocumentAgent(matricule: string) {
  const feedback = useFeedback();
  return (document: Document) => {
    const doc = DOCUMENTS[document];
    void feedback
      .run(doc.attente, () => telecharger(`/api/v1/agents/${matricule}/${doc.chemin}/`, `${doc.fichier}-${matricule}.pdf`), {
        success: { title: doc.titre, message: doc.message },
        error: doc.erreur,
      })
      .catch(() => undefined);
  };
}
