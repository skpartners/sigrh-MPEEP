import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api, telecharger } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../../ui/Modale";
import { AppChrome } from "../AppChrome";
import { dateFr } from "../dossier-onglets/commun";
import { aModeleActe } from "../dossier-onglets/ModelesActes";
import { CLE_SECRETARIAT, type LigneSecretariat } from "./types";
import { correspond } from "../../ui/recherche";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";

const FILTRES = [
  { cle: "a_signer", libelle: "À imprimer et à signer", icone: "print" },
  { cle: "circuit", libelle: "En circuit", icone: "sync" },
  { cle: "signe", libelle: "Signés", icone: "task_alt" },
  { cle: "refusee", libelle: "Refusées", icone: "block" },
  { cle: "toutes", libelle: "Toutes", icone: "list" },
] as const;

type Filtre = (typeof FILTRES)[number]["cle"];

const ETAT: Record<LigneSecretariat["statut"], { libelle: string; classe: string }> = {
  circuit: { libelle: "En circuit", classe: "bg-secondary-fixed text-on-secondary-fixed-variant" },
  a_signer: { libelle: "À imprimer et à signer", classe: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  signe: { libelle: "Document signé versé", classe: "bg-primary-fixed text-on-primary-fixed-variant" },
  refusee: { libelle: "Refusée", classe: "bg-error-container text-on-error-container" },
};

/** Le modèle imprimable d'une demande : le certificat pour un congé, le modèle de l'acte sinon. */
export function modeleDisponible(ligne: LigneSecretariat): boolean {
  return ligne.categorie === "conge" || aModeleActe(ligne.type_acte);
}

/** Écran du secrétariat : suivi des demandes dans leur circuit, impression des documents validés et versement du signé. */
export function SecretariatScreen() {
  const [filtre, setFiltre] = useState<Filtre>("a_signer");
  const [recherche, setRecherche] = useState("");
  const page = useQuery({ queryKey: CLE_SECRETARIAT, queryFn: () => api<{ demandes: LigneSecretariat[] }>("/api/v1/secretariat/"), refetchInterval: 60_000 });
  const demandes = page.data?.demandes ?? [];
  const compte = (cle: Filtre) => (cle === "toutes" ? demandes.length : demandes.filter((item) => item.statut === cle).length);
  const terme = recherche.trim().toLowerCase();
  const visibles = demandes.filter(
    (item) =>
      (filtre === "toutes" || item.statut === filtre) &&
      (!terme || [item.reference, item.nature, item.agent.nom_complet, item.agent.matricule].some((texte) => correspond(texte, terme))),
  );

  return (
    <AppChrome>
      <div className={PAGE}>
        <div className="motion-rise bg-surface-container-lowest p-6 rounded-lg border border-hairline space-y-1.5">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Courrier · Secrétariat</p>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Secrétariat</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Suivez les demandes dans leur circuit. Une fois visées par toute la chaîne, imprimez le document, faites-le signer, puis joignez la version signée : l'intéressé est prévenu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="État des demandes">
          {FILTRES.map((item) => (
            <button
              key={item.cle}
              type="button"
              role="tab"
              aria-selected={filtre === item.cle}
              onClick={() => setFiltre(item.cle)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-label-md text-label-md transition-colors ${filtre === item.cle ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"}`}
            >
              <Icone nom={item.icone} className="text-lg" />
              {item.libelle}
              <span className="rounded-full bg-black/10 px-2 font-code-num text-code-num">{compte(item.cle)}</span>
            </button>
          ))}
          <input
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            placeholder="Agent, matricule, référence…"
            aria-label="Rechercher une demande"
            className="ml-auto h-10 w-full rounded border border-outline-variant bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface sm:w-72"
          />
        </div>

        {page.isError ? (
          <p className="font-body-md text-body-md text-error" role="alert">
            {page.error instanceof ApiError ? page.error.message : "Les demandes n'ont pas pu être chargées."}
          </p>
        ) : null}
        {page.isSuccess && visibles.length === 0 ? (
          <p className="rounded-lg bg-surface-container-low p-6 font-body-md text-body-md text-on-surface-variant">Aucune demande dans cette rubrique.</p>
        ) : null}
        <div className="space-y-4">
          {visibles.map((ligne) => (
            <CarteSecretariat key={ligne.reference} ligne={ligne} />
          ))}
        </div>
      </div>
    </AppChrome>
  );
}

function CarteSecretariat({ ligne }: { ligne: LigneSecretariat }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const champ = useRef<HTMLInputElement>(null);
  const etat = ETAT[ligne.statut];
  // Le document se verse une fois toute la chaîne validée ; avant, la secrétaire ne dispose que de la prévisualisation.
  const aVerser = ligne.statut === "a_signer" || ligne.statut === "signe";
  const pourcentage = ligne.total ? Math.round((ligne.fait / ligne.total) * 100) : 0;

  const verser = useMutation({
    mutationFn: (fichier: File) => {
      const corps = new FormData();
      corps.set("fichier", fichier);
      return api<LigneSecretariat>(`/api/v1/secretariat/${encodeURIComponent(ligne.reference)}/signe/verser/`, { method: "POST", body: corps });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CLE_SECRETARIAT });
    },
  });

  async function choisir(fichier: File | null) {
    if (!fichier) return;
    try {
      await feedback.run("Envoi du document signé…", () => verser.mutateAsync(fichier), {
        success: { title: "Document signé versé", message: `${ligne.agent.nom_complet} est prévenu : il peut passer prendre l'original.` },
        error: "Le document signé n'a pas été versé.",
      });
    } catch {
      /* le toast d'erreur est déjà affiché */
    }
    if (champ.current) champ.current.value = "";
  }

  return (
    <article className="rounded-xl border border-hairline bg-surface-container-lowest p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{ligne.nature}</h2>
          <p className="font-body-md text-body-md text-on-surface">
            {ligne.agent.nom_complet} <span className="font-code-num text-code-num text-on-surface-variant">· {ligne.agent.matricule}</span>
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            #{ligne.reference} · déposée le {dateFr(ligne.depose_le)}
            {ligne.debut ? ` · du ${dateFr(ligne.debut)}${ligne.fin ? ` au ${dateFr(ligne.fin)}` : ""}` : ""}
            {ligne.agent.structure ? ` · ${ligne.agent.structure}` : ""}
          </p>
        </div>
        <span className={`rounded px-2.5 py-1 font-label-sm text-label-sm font-bold ${etat.classe}`}>{etat.libelle}</span>
      </div>

      {ligne.statut !== "refusee" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuemin={0} aria-valuemax={ligne.total} aria-valuenow={ligne.fait} aria-label="Validations obtenues">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pourcentage}%` }} />
            </div>
            <span className="font-code-num text-code-num text-on-surface-variant">{ligne.fait}/{ligne.total} validations</span>
          </div>
          <ol className="flex flex-wrap gap-2">
            {ligne.visas.filter((visa) => visa.ordre > 1).map((visa) => {
              const fait = visa.avis === "Favorable" || visa.avis === "Délivré" || visa.avis === "Accordé";
              return (
                <li key={visa.ordre} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-label-sm text-label-sm ${fait ? "bg-primary-fixed text-on-primary-fixed-variant" : "bg-surface-container-low text-on-surface-variant"}`}>
                  <Icone nom={fait ? "check_circle" : "radio_button_unchecked"} className="text-base" />
                  {visa.instance}
                  {visa.titulaire && fait ? ` · ${visa.titulaire}` : ""}
                </li>
              );
            })}
          </ol>
          {ligne.statut === "circuit" ? <p className="font-body-sm text-body-sm text-on-surface-variant">{ligne.etape} · {ligne.responsable}</p> : null}
        </div>
      ) : (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{ligne.etape}</p>
      )}

      {aVerser || ligne.document ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          {modeleDisponible(ligne) && ligne.document ? (
            <Link to={`/app/secretariat/imprimer/${encodeURIComponent(ligne.reference)}`} className={`${BOUTON_SECONDAIRE} inline-flex items-center gap-2`}>
              <Icone nom={ligne.imprimable ? "print" : "visibility"} className="text-lg" />{ligne.imprimable ? "Imprimer (PDF)" : "Prévisualiser"}
            </Link>
          ) : (
            <span className="font-body-sm text-body-sm text-on-surface-variant">Aucun modèle de document n'est encore rattaché à cet acte.</span>
          )}
          {!ligne.imprimable ? <span className="font-body-sm text-body-sm text-on-surface-variant">L'impression sera possible quand toute la chaîne aura validé.</span> : null}
          {aVerser ? (
            <>
          <input
            ref={champ}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            tabIndex={-1}
            aria-label={`Document signé de la demande ${ligne.reference}`}
            onChange={(event) => void choisir(event.target.files?.[0] ?? null)}
          />
          <button type="button" className={`${BOUTON_PRIMAIRE} inline-flex items-center gap-2`} disabled={verser.isPending} onClick={() => champ.current?.click()}>
            <Icone nom={verser.isPending ? "progress_activity" : "upload_file"} className={`text-lg ${verser.isPending ? "motion-spin" : ""}`} />
            {ligne.statut === "signe" ? "Remplacer le document signé" : "Joindre le document signé"}
          </button>
            </>
          ) : null}
          {ligne.statut === "signe" ? (
            <>
              <button type="button" className={`${BOUTON_SECONDAIRE} inline-flex items-center gap-2`} onClick={() => void telecharger(`/api/v1/secretariat/${encodeURIComponent(ligne.reference)}/signe/`, `${ligne.reference}-signe.pdf`)}>
                <Icone nom="download" className="text-lg" />Voir le document signé
              </button>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Versé le {dateFr(ligne.signe_le)} par {ligne.signe_par}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
