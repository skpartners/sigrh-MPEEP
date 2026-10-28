import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { Chargement } from "../../ui/Chargement";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../../ui/Modale";
import { ChoixExercice, FeuilleCertificat } from "../dossier-onglets/CertificatCessation";
import { FeuilleActe, aModeleActe } from "../dossier-onglets/ModelesActes";
import { CLE_SECRETARIAT, type LigneSecretariat } from "./types";

/** Page d'impression d'un document validé : la feuille du modèle, prête pour « Imprimer » ou « Enregistrer en PDF ». */
export function ImpressionScreen() {
  const { reference = "" } = useParams();
  const [choix, setChoix] = useState<number | null>(null);
  const page = useQuery({ queryKey: CLE_SECRETARIAT, queryFn: () => api<{ demandes: LigneSecretariat[] }>("/api/v1/secretariat/") });
  const ligne = page.data?.demandes.find((item) => item.reference === reference);
  const document = ligne?.document ?? null;

  return (
    <div className="min-h-screen bg-surface-container print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-hairline bg-surface-container-lowest px-4 py-3">
        <Link to="/app/secretariat" className={`${BOUTON_SECONDAIRE} inline-flex items-center gap-2`}>
          <Icone nom="arrow_back" className="text-lg" />Retour au secrétariat
        </Link>
        <button type="button" className={`${BOUTON_PRIMAIRE} inline-flex items-center gap-2`} disabled={!document || !ligne?.imprimable} onClick={() => window.print()}>
          <Icone nom="print" className="text-lg" />Imprimer / Enregistrer en PDF
        </button>
        {ligne?.categorie === "conge" && document?.conge?.annuel ? (
          <ChoixExercice debut={ligne.debut} auto={document.conge.exercice} exercices={document.conge.exercices} valeur={choix} onChange={setChoix} classe="h-9 rounded border border-outline-variant bg-surface-container-lowest px-2" />
        ) : null}
        {ligne ? <span className="font-body-sm text-body-sm text-on-surface-variant">{ligne.nature} · {ligne.agent.nom_complet}</span> : null}
        {ligne && !ligne.imprimable ? (
          <span role="status" className="rounded bg-secondary-fixed px-2.5 py-1 font-label-sm text-label-sm font-bold text-on-secondary-fixed-variant">
            Prévisualisation : impression possible quand toute la chaîne aura validé
          </span>
        ) : null}
      </div>

      <div className={`overflow-x-auto p-4 print:p-0 ${ligne?.imprimable ? "" : "print:hidden"}`}>
        {page.isPending ? <Chargement libelle="Chargement du document…" className="print:hidden" /> : null}
        {page.isSuccess && !document ? (
          <p className="p-6 font-body-md text-body-md text-on-surface-variant print:hidden">Aucun document à afficher pour cette demande (refusée ou introuvable).</p>
        ) : null}
        {ligne && document && ligne.categorie === "conge" && document.conge ? (
          <FeuilleCertificat
            impression
            entree={{
              agent: document.agent,
              type: document.conge.type,
              libelle: document.conge.libelle,
              debut: ligne.debut,
              fin: ligne.fin,
              jours: document.conge.jours,
              annuel: document.conge.annuel,
              rang: document.conge.rang,
              periodes: document.conge.periodes,
              exercice: choix ?? document.conge.exercice,
            }}
          />
        ) : null}
        {ligne && document && ligne.categorie === "acte" && aModeleActe(ligne.type_acte) ? (
          <FeuilleActe impression agent={document.agent} code={ligne.type_acte} debut={ligne.debut} fin={ligne.fin} />
        ) : null}
        {ligne && document && ligne.categorie === "acte" && !aModeleActe(ligne.type_acte) ? (
          <p className="p-6 font-body-md text-body-md text-on-surface-variant print:hidden">Aucun modèle de document n'est encore rattaché à cet acte.</p>
        ) : null}
      </div>
    </div>
  );
}
