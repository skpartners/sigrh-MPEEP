import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, telecharger } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { Icone } from "../ui/Icone";

const CHAMP = "w-full text-sm file:mr-3 file:h-9 file:rounded file:border-0 file:bg-primary-fixed file:px-3 file:font-label-md file:text-label-md file:text-on-primary-fixed file:cursor-pointer";

type ImportGroupe = {
  modeleUrl?: string;
  modeleNom?: string;
  importUrl?: string;
  titre?: string;
  sousTitre?: string;
  aide?: string;
  toastTitre?: string;
  invalidations?: string[][];
};

const DOSSIERS: Required<ImportGroupe> = {
  modeleUrl: "/api/v1/agents/import/modele/",
  modeleNom: "modele-dossiers-agents.xlsx",
  importUrl: "/api/v1/agents/import/",
  titre: "Importer des dossiers",
  sousTitre: "Une ligne du classeur met à jour un agent, identifié par son matricule.",
  aide: "Les colonnes sont celles de la situation administrative. Une cellule vide conserve la valeur déjà enregistrée. Téléchargez le modèle pour éviter les erreurs d'en-tête.",
  toastTitre: "Dossiers mis à jour",
  invalidations: [["agents"], ["agent"]],
};

/** Téléchargement du modèle et import groupé. */
export function ActionsImport({ classe = "flex flex-wrap gap-2", ...props }: ImportGroupe & { classe?: string } = {}) {
  const options = { ...DOSSIERS, ...props };
  const feedback = useFeedback();
  const [ouvert, setOuvert] = useState(false);

  async function modele() {
    try {
      await telecharger(options.modeleUrl, options.modeleNom);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Le téléchargement n'a pas abouti.";
      feedback.toast("Modèle indisponible", message, "error");
    }
  }

  return (
    <>
      <div className={classe}>
        <button type="button" className={BOUTON_SECONDAIRE} onClick={modele}>
          <Icone nom="download" className="text-lg" />
          Télécharger le modèle
        </button>
        <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setOuvert(true)}>
          <Icone nom="upload_file" className="text-lg" />
          Importer un classeur
        </button>
      </div>
      {ouvert ? <ModaleImport options={options} onClose={() => setOuvert(false)} /> : null}
    </>
  );
}

function ModaleImport({ options, onClose }: { options: Required<ImportGroupe>; onClose: () => void }) {
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [fichier, setFichier] = useState<File | null>(null);
  const [erreurLocale, setErreurLocale] = useState("");
  const importer = useMutation({
    mutationFn: (choisi: File) => {
      const corps = new FormData();
      corps.set("fichier", choisi);
      return api<{ detail: string }> (options.importUrl, { method: "POST", body: corps });
    },
    onSuccess: (resultat) => {
      for (const cle of options.invalidations) queryClient.invalidateQueries({ queryKey: cle });
      feedback.toast(options.toastTitre, resultat.detail);
      onClose();
    },
  });

  function envoyer() {
    setErreurLocale("");
    if (!fichier) {
      setErreurLocale("Choisissez un classeur Excel (.xlsx).");
      return;
    }
    if (!fichier.name.toLowerCase().endsWith(".xlsx")) {
      setErreurLocale("Le fichier doit être un classeur Excel au format .xlsx.");
      return;
    }
    importer.mutate(fichier);
  }

  const erreurApi = importer.error instanceof ApiError ? importer.error : null;
  const erreur = erreurLocale || (erreurApi ? erreurApi.message : importer.isError ? "L'import n'a pas abouti." : "");

  return (
    <Modale
      titre={options.titre}
      sousTitre={options.sousTitre}
      icone="upload_file"
      taille="lg"
      onClose={onClose}
      onSubmit={envoyer}
      enCours={importer.isPending}
      erreur={erreur}
      libelleValider="Importer"
    >
      <p className="font-body-sm text-body-sm text-on-surface-variant">{options.aide}</p>
      <label className="mt-4 block">
        <span className="block font-label-md text-label-md text-on-surface mb-1">Classeur Excel</span>
        <input
          className={CHAMP}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            setFichier(event.target.files?.[0] ?? null);
            setErreurLocale("");
            importer.reset();
          }}
        />
      </label>
      {erreurApi && erreurApi.erreurs.length > 0 ? (
        <ul className="mt-4 max-h-48 overflow-auto rounded-lg bg-error-container/50 px-3 py-2 space-y-1" aria-label="Lignes incorrectes">
          {erreurApi.erreurs.slice(0, 30).map((item) => (
            <li key={`${item.ligne}-${item.message}`} className="font-body-sm text-body-sm text-on-error-container">
              Ligne {item.ligne} : {item.message}
            </li>
          ))}
          {erreurApi.erreurs.length > 30 ? (
            <li className="font-body-sm text-body-sm text-on-error-container">et {erreurApi.erreurs.length - 30} autres lignes</li>
          ) : null}
        </ul>
      ) : null}
    </Modale>
  );
}
