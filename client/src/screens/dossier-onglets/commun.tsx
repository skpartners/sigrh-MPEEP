import { FilVisas } from "../../ui/FilVisas";
import { useState, type ReactNode } from "react";
import { ApiError, telecharger } from "../../api/client";
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
      <FilVisas
        visas={demande.visas.map((visa) => ({
          ...visa,
          etat: /refus|sans suite/i.test(visa.avis) ? "refus" : visa.ordre < courant ? "ok" : "attente",
        }))}
        enCours={!clos}
        ordreActuel={clos ? null : courant}
        libelleActuel="En cours"
        libelle={`Circuit de la demande ${demande.reference}`}
      />
      {suite}
      <DocumentSigne demande={demande} />
    </div>
  );
}

/** Document final d'un congé ou d'un acte : en cours de signature, puis disponible une fois versé par le secrétariat. */
export function DocumentSigne({ demande }: { demande: Demande }) {
  const [erreur, setErreur] = useState("");
  if (demande.categorie !== "conge" && demande.categorie !== "acte") return null;
  if (!demande.document_signe) {
    const enSignature = demande.categorie === "acte" ? demande.etape.startsWith("Validée") : demande.etape.startsWith("Clôturée : congé accordé");
    if (!enSignature) return null;
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface-variant">
        <Icone nom="draw" className="text-lg text-primary" />
        Toutes les validations sont obtenues : le document part à la signature. Vous serez prévenu dès qu'il sera disponible.
      </p>
    );
  }
  async function telechargerSigne() {
    setErreur("");
    try {
      await telecharger(`/api/v1/secretariat/${encodeURIComponent(demande.reference)}/signe/`, `${demande.reference}-signe.pdf`);
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Le document n'a pas pu être téléchargé.");
    }
  }
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-fixed/60 p-4">
      <p className="flex items-start gap-2 font-body-md text-body-md text-on-surface">
        <Icone nom="task_alt" className="text-xl text-primary" />
        <span>
          <strong>Votre document signé est disponible.</strong> Merci de passer prendre l'original auprès du secrétariat.
          {demande.signe_le ? ` Versé le ${dateFr(demande.signe_le)}.` : ""}
        </span>
      </p>
      <button type="button" onClick={() => void telechargerSigne()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label-md text-on-primary">
        <Icone nom="download" />Voir le document signé
      </button>
      {erreur ? <p role="alert" className="basis-full text-sm text-error">{erreur}</p> : null}
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
