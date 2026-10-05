import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api, telecharger } from "../api/client";
import type { Carrieres } from "../api/types";
import { dateLongue, nombre } from "../ui/format";
import { Portrait } from "../ui/PhotoProfil";
import { Skeleton, useFlip } from "../ui/Motion";
import { useAction } from "../ui/useAction";
import { useFeedback } from "../ui/Feedback";
import { AppChrome } from "./AppChrome";
import { Icone } from "../ui/Icone";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";
const PAR_PAGE = 6;

type Ligne = Carrieres["lignes"][number];
type Alerte = Carrieres["alertes"][number];

// Statuts après décision : plus aucune action possible sur la ligne.
const CLOTURES = new Set(["Transmis à la signature", "Pièces demandées"]);

const RISQUE: Record<Alerte["risque"], { badge: string; barre: string }> = {
  eleve: { badge: "bg-error-container text-on-error-container", barre: "bg-error" },
  modere: { badge: "bg-secondary-fixed text-on-secondary-fixed", barre: "bg-secondary-container" },
  faible: { badge: "bg-surface-container-high text-on-surface", barre: "bg-primary" },
};

function moisAvant(iso: string): number {
  const cible = new Date(`${iso}T00:00:00`);
  const maintenant = new Date();
  return (cible.getFullYear() - maintenant.getFullYear()) * 12 + cible.getMonth() - maintenant.getMonth();
}

function echeance(iso: string): string {
  const mois = moisAvant(iso);
  if (mois <= 0) return "Échéance dépassée";
  if (mois < 24) return `Dans ${mois} mois`;
  return `Dans ${Math.floor(mois / 12)} ans`;
}

export function CarrieresScreen() {
  const carrieres = useQuery({ queryKey: ["carrieres"], queryFn: () => api<Carrieres>("/api/v1/carrieres/") });
  const { agir } = useAction();
  const feedback = useFeedback();
  const data = carrieres.data;

  async function genererTableau() {
    const resultat = await agir<{ certifiees: number; reservees: number }>({
      attente: "Calcul du tableau d'avancement 2026…",
      route: "/api/v1/avancements/generer/",
      succes: "Tableau d'avancement généré",
      detail: (reponse) => `${reponse.certifiees} calculs certifiés, ${reponse.reservees} en attente d'avis.`,
    });
    if (!resultat) return;
    await feedback.run(
      "Préparation du tableau…",
      () => telecharger("/api/v1/avancements/export/", "tableau-avancement-2026.pdf"),
      { error: "Le tableau n'a pas pu être téléchargé" },
    );
  }

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1">
        <div className="flex flex-col w-full">
          {/* Bandeau */}
          <div className={`${CARD} p-6 sm:p-8`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <p className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">Carrières</p>
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Accueil</h1>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                  {data?.chapo ?? "Pilotage des actes, des avancements et des mouvements du portefeuille de l'État."}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Session statutaire 2026 · décret n° 2023-894/FP</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-surface-container text-primary hover:bg-surface-container-high transition-colors font-label-lg text-label-lg"
                  type="button"
                  onClick={() =>
                    agir<{ publies: number }>({
                      confirmation: "Publier les avis de mutation aux structures concernées ?",
                      confirmLabel: "Publier",
                      attente: "Publication des avis de mutation…",
                      route: "/api/v1/mouvements/publier/",
                      succes: "Avis de mutation publiés",
                      detail: (r) => `${r.publies} mouvement${r.publies > 1 ? "s" : ""} publié${r.publies > 1 ? "s" : ""}.`,
                    })
                  }
                >
                  <Icone nom="campaign" className="text-lg" />
                  Publier les avis de mutation
                </button>
                <button
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-primary text-on-primary hover:bg-primary-container shadow-md transition-colors font-label-lg text-label-lg"
                  type="button"
                  onClick={() => void genererTableau()}
                >
                  <Icone nom="task_alt" className="text-lg" />
                  Générer le tableau d'avancement 2026
                </button>
              </div>
            </div>
          </div>

          {carrieres.isError ? (
            <div className={`${CARD} p-6 mt-6`} role="alert">
              <p className="font-label-lg text-label-lg text-error">Les données de la sous-direction n'ont pas pu être chargées.</p>
              <button type="button" className="mt-3 h-10 px-4 rounded bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary" onClick={() => carrieres.refetch()}>
                Réessayer
              </button>
            </div>
          ) : null}

          {/* Compteurs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
            {data
              ? data.compteurs.map((compteur) => (
                  <div key={compteur.libelle} className={`${CARD} motion-content relative overflow-hidden p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-label-md text-label-md text-on-surface-variant">{compteur.libelle}</p>
                        <p className="font-headline-xl text-headline-xl text-on-surface font-bold">{compteur.valeur}</p>
                        <p className="font-label-sm text-label-sm text-primary font-semibold">{compteur.detail}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-primary-fixed flex items-center justify-center text-primary shrink-0">
                        <Icone nom={compteur.icone} className="text-2xl" />
                      </div>
                    </div>
                    <div className="motion-fill absolute bottom-0 left-0 h-1 bg-primary" style={{ width: `${compteur.pourcentage}%` }} aria-hidden="true"></div>
                  </div>
                ))
              : [0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mt-8">
            <div className="xl:col-span-8 flex flex-col gap-6">
              <TableauAvancement lignes={data?.lignes} />
              <Mouvements mouvements={data?.mouvements} />
            </div>
            <div className="xl:col-span-4 flex flex-col gap-6">
              {data ? <Pyramide data={data} /> : <Skeleton className="h-96 rounded-xl" />}
              <AlertesReleve alertes={data?.alertes} />
            </div>
          </div>
        </div>
      </div>
    </AppChrome>
  );
}

function TableauAvancement({ lignes }: { lignes: Ligne[] | undefined }) {
  const { agir } = useAction();
  const [recherche, setRecherche] = useState("");
  const [regime, setRegime] = useState("");
  const [avis, setAvis] = useState("");
  const [page, setPage] = useState(0);

  const regimes = useMemo(() => Array.from(new Set((lignes ?? []).map((ligne) => ligne.mode))), [lignes]);
  const q = recherche.trim().toLowerCase();
  const filtrees = (lignes ?? []).filter(
    (ligne) =>
      (!regime || ligne.mode === regime) &&
      (!avis || ligne.avis === avis) &&
      (!q || `${ligne.agent.nom_complet} ${ligne.agent.matricule} ${ligne.grade_echelon} ${ligne.emploi}`.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));
  const courante = Math.min(page, pages - 1);
  const visibles = filtrees.slice(courante * PAR_PAGE, courante * PAR_PAGE + PAR_PAGE);
  const corps = useFlip<HTMLTableSectionElement>(`${recherche}|${regime}|${avis}|${courante}|${lignes?.length ?? 0}`);
  function decider(ligne: Ligne, decision: "transmettre" | "renvoyer") {
    const transmettre = decision === "transmettre";
    void agir<{ statut: string }>({
      confirmation: transmettre
        ? `Transmettre l'avancement de ${ligne.agent.nom_complet} à la signature du DRH ?`
        : `Renvoyer le dossier de ${ligne.agent.nom_complet} pour pièces complémentaires ?`,
      confirmLabel: transmettre ? "Transmettre" : "Renvoyer",
      attente: transmettre ? "Transmission pour signature DRH…" : "Envoi de la demande de pièces…",
      route: `/api/v1/avancements/${ligne.id}/decision/`,
      corps: { decision },
      succes: transmettre ? "Transmis à la signature du DRH" : "Demande de pièces envoyée",
      detail: transmettre ? `L'acte de ${ligne.agent.nom_complet} attend votre visa sur le tableau de bord.` : ligne.agent.nom_complet,
    });
  }

  const conformes = (lignes ?? []).filter((ligne) => ligne.statut === "Calcul certifié").length;

  return (
    <>
      <div className={`${CARD} p-6 space-y-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
              <Icone nom="rule" className="text-primary" />
              Campagne annuelle d'avancement
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Ancienneté d'échelon certifiée et notation de service.</p>
          </div>
          <div className="inline-flex p-1 bg-surface-container-low rounded-lg shrink-0" role="group" aria-label="Régime d'avancement">
            {[["", "Tous les régimes"], ...regimes.map((mode) => [mode, mode === "Au choix" ? "Au choix (mérite)" : "À l'ancienneté"])].map(([valeur, libelle]) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={regime === valeur}
                onClick={() => {
                  setRegime(valeur);
                  setPage(0);
                }}
                className={`px-3.5 py-1.5 rounded-md font-label-md text-label-md transition-colors ${regime === valeur ? "bg-surface-container-lowest shadow-sm text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <label className="sm:col-span-8 relative">
            <span className="sr-only">Rechercher un dossier d'avancement</span>
            <Icone nom="search" className="absolute left-3.5 top-2.5 text-on-surface-variant text-lg" />
            <input
              value={recherche}
              onChange={(event) => {
                setRecherche(event.target.value);
                setPage(0);
              }}
              className="w-full pl-10 pr-4 py-2 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm rounded-lg focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
              placeholder="Filtrer par nom, matricule, grade ou emploi…"
              type="search"
            />
          </label>
          <label className="sm:col-span-4">
            <span className="sr-only">Avis du supérieur</span>
            <select
              value={avis}
              onChange={(event) => {
                setAvis(event.target.value);
                setPage(0);
              }}
              className="w-full px-3 py-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Tous les avis</option>
              <option value="Favorable">Avis favorable</option>
              <option value="Réservé">Avis réservé</option>
            </select>
          </label>
        </div>
      </div>

      <div className={`${CARD} overflow-hidden flex flex-col`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/70 text-on-surface-variant font-label-md text-label-md">
                <th className="py-3.5 px-4">Agent</th>
                <th className="py-3.5 px-3">Emploi & structure</th>
                <th className="py-3.5 px-3 text-center">Situation</th>
                <th className="py-3.5 px-3 text-center" data-min="">Proposition</th>
                <th className="py-3.5 px-3 text-center">Note /20</th>
                <th className="py-3.5 px-3 text-center">Avis N+1</th>
                <th className="py-3.5 px-3">Statut</th>
                <th className="py-3.5 px-4 text-right">Décision</th>
              </tr>
            </thead>
            <tbody ref={corps} className="font-body-sm text-body-sm">
              {lignes === undefined
                ? [0, 1, 2, 3].map((index) => (
                    <tr key={index} className="border-t border-hairline">
                      <td className="py-3.5 px-4" colSpan={8}><Skeleton className="h-8 w-full" /></td>
                    </tr>
                  ))
                : null}
              {visibles.map((ligne) => {
                const favorable = ligne.avis === "Favorable";
                const certifie = ligne.statut === "Calcul certifié" || ligne.statut === "Transmis à la signature";
                const note = Number(ligne.note);
                return (
                  <tr key={ligne.id} data-flip={ligne.id} className="motion-content border-t border-hairline hover:bg-surface-container-low/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link to={`/app/dossiers/${encodeURIComponent(ligne.agent.matricule)}`} className="flex items-center gap-3 rounded group">
                        <Portrait agent={ligne.agent} className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed shrink-0 font-label-lg text-label-lg" />
                        <span className="min-w-0">
                          <span className="block font-label-md text-label-md text-on-surface font-bold group-hover:text-primary group-hover:underline">{ligne.agent.nom_complet}</span>
                          <span className="block font-code-num text-code-num text-primary">Mat. {ligne.agent.matricule}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="text-on-surface font-medium">{ligne.emploi}</div>
                      <div className="text-on-surface-variant font-label-sm text-label-sm">{ligne.structure}</div>
                    </td>
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-block px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-code-num text-code-num font-bold">{ligne.grade_echelon}</span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant mt-0.5">Anc. {ligne.anciennete}</span>
                    </td>
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary-fixed text-primary font-code-num text-code-num font-bold">
                        {ligne.proposition}
                        <Icone nom="arrow_upward" className="text-sm" />
                      </span>
                      <span className="block font-label-sm text-label-sm text-primary font-medium mt-0.5">{ligne.mode}</span>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <div className="font-headline-sm text-headline-sm text-on-surface font-bold">{nombre(note, 2)}</div>
                      <div className="w-12 mx-auto bg-surface-container-high h-1.5 rounded-full mt-1 overflow-hidden" aria-hidden="true">
                        <div className="bg-primary motion-fill h-full rounded-full" style={{ width: `${(note / 20) * 100}%` }}></div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold ${favorable ? "bg-primary-fixed text-on-primary-fixed" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${favorable ? "bg-primary" : "bg-secondary"}`} aria-hidden="true"></span>
                        {ligne.avis}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`flex items-center gap-1.5 font-label-sm text-label-sm font-medium ${certifie ? "text-primary" : "text-secondary"}`}>
                        <Icone nom={certifie ? "verified" : "pending"} className="text-base" />
                        {ligne.statut}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {CLOTURES.has(ligne.statut) ? (
                        <span className="font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">Décision prise</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="p-1.5 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors"
                            aria-label={`Transmettre le dossier de ${ligne.agent.nom_complet} à la signature du DRH`}
                            title="Transmettre à la signature du DRH"
                            type="button"
                            onClick={() => decider(ligne, "transmettre")}
                          >
                            <Icone nom="check_circle" className="text-base block" />
                          </button>
                          <button
                            className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors"
                            aria-label={`Renvoyer le dossier de ${ligne.agent.nom_complet} pour pièces complémentaires`}
                            title="Renvoyer pour pièces complémentaires"
                            type="button"
                            onClick={() => decider(ligne, "renvoyer")}
                          >
                            <Icone nom="reply" className="text-base block" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {lignes && filtrees.length === 0 ? (
                <tr className="border-t border-hairline">
                  <td className="py-8 px-4 text-center text-on-surface-variant" colSpan={8}>Aucun dossier d'avancement ne correspond à ces critères.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {lignes && filtrees.length > 0 ? (
          <nav className="px-6 py-4 bg-surface-container-low/40 flex flex-col sm:flex-row items-center justify-between gap-4" aria-label="Pagination des avancements">
            <p className="text-on-surface-variant font-body-sm text-body-sm">
              <strong className="text-on-surface">{filtrees.length}</strong> dossier{filtrees.length > 1 ? "s" : ""} · <span className="text-primary font-semibold">{conformes} calculs certifiés</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm font-medium disabled:opacity-40" type="button" disabled={courante === 0} onClick={() => setPage(courante - 1)}>
                Précédent
              </button>
              {Array.from({ length: pages }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-current={index === courante ? "page" : undefined}
                  onClick={() => setPage(index)}
                  className={`px-3 py-1.5 rounded font-label-sm text-label-sm ${index === courante ? "bg-primary text-on-primary font-bold" : "bg-surface-container hover:bg-surface-container-high text-on-surface font-medium"}`}
                >
                  {index + 1}
                </button>
              ))}
              <button className="px-3 py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm font-medium disabled:opacity-40" type="button" disabled={courante >= pages - 1} onClick={() => setPage(courante + 1)}>
                Suivant
              </button>
            </div>
          </nav>
        ) : null}
      </div>
    </>
  );
}

function Mouvements({ mouvements }: { mouvements: Carrieres["mouvements"] | undefined }) {
  return (
    <section className={`${CARD} p-6`} aria-labelledby="titre-mouvements">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-lg bg-surface-container text-primary">
            <Icone nom="move_up" className="text-xl" />
          </span>
          <div>
            <h2 id="titre-mouvements" className="font-headline-sm text-headline-sm text-on-surface font-bold">Mouvements stratégiques</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Nominations, mutations et détachements sur les postes de direction.</p>
          </div>
        </div>
        {mouvements ? (
          <span className="px-3 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md font-bold">
            {mouvements.length} mouvement{mouvements.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mouvements === undefined ? [0, 1].map((index) => <li key={index}><Skeleton className="h-36 rounded-lg" /></li>) : null}
        {mouvements?.map((mouvement) => {
          const signe = /signé|publié/i.test(mouvement.statut);
          return (
            <li key={mouvement.id} className="motion-content p-4 rounded-lg bg-surface-container-low flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-label-sm text-label-sm text-secondary font-bold">{mouvement.nature} · {mouvement.organisme}</span>
                  <h3 className="font-label-lg text-label-lg text-on-surface font-bold mt-0.5">{mouvement.poste}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    <Link to={`/app/dossiers/${encodeURIComponent(mouvement.agent.matricule)}`} className="text-primary hover:underline rounded">{mouvement.agent.nom_complet}</Link>
                    {" "}· prise d'effet le {dateLongue(mouvement.date_effet)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className={`flex items-center gap-1.5 font-label-sm text-label-sm ${signe ? "text-primary" : "text-secondary"}`}>
                  <Icone nom={signe ? "check_circle" : "pending"} className="text-sm" />
                  {mouvement.statut}
                </span>
                <Link
                  to={`/app/dossiers/${encodeURIComponent(mouvement.agent.matricule)}`}
                  className="px-3 py-1 rounded bg-surface-container-lowest text-primary hover:bg-primary hover:text-on-primary font-label-sm text-label-sm font-semibold transition-colors"
                >
                  Ouvrir le dossier
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Pyramide({ data }: { data: Carrieres }) {
  const tranches = data.pyramide;
  const hommes = tranches.reduce((somme, t) => somme + t.hommes, 0);
  const femmes = tranches.reduce((somme, t) => somme + t.femmes, 0);
  const total = hommes + femmes || 1;
  const max = Math.max(1, ...tranches.flatMap((t) => [t.hommes, t.femmes]));
  // Couleur par tranche : la plus âgée en alerte, puis la zone de succession, puis la relève.
  const couleurs = ["var(--color-error)", "var(--color-secondary-container)", "var(--color-primary-container)", "var(--color-surface-tint)", "var(--color-tertiary)"];
  const LARGEUR = 110;
  const pourcentHommes = Math.round((100 * hommes) / total);

  return (
    <section className={`${CARD} motion-content p-6 flex flex-col`} aria-labelledby="titre-pyramide">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 id="titre-pyramide" className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-2">
          <Icone nom="analytics" className="text-primary text-xl" />
          <span><abbr title="Gestion prévisionnelle des emplois, des effectifs et des compétences">GPEEC</abbr> & démographie</span>
        </h2>
        <span className="px-2 py-0.5 rounded bg-surface-container-high font-code-num text-code-num text-primary font-bold">2026-2030</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mb-5">Pyramide des âges des {nombre(total)} agents du portefeuille.</p>
      <div className="bg-surface-container-low rounded-xl p-4">
        <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant font-semibold mb-2">
          <span>Hommes ({pourcentHommes}&#8239;%)</span>
          <span>Femmes ({100 - pourcentHommes}&#8239;%)</span>
        </div>
        <svg
          className="w-full h-auto"
          viewBox={`0 0 320 ${tranches.length * 34 + 6}`}
          role="img"
          aria-label={`Pyramide des âges : ${tranches.map((t) => `${t.tranche}, ${t.hommes} hommes et ${t.femmes} femmes`).join(" ; ")}.`}
        >
          <line x1="160" x2="160" y1="2" y2={tranches.length * 34 + 4} stroke="var(--color-outline-variant)" strokeDasharray="2 2" strokeWidth="1.5" />
          {tranches.map((tranche, index) => {
            const y = index * 34 + 6;
            const wh = (tranche.hommes / max) * LARGEUR;
            const wf = (tranche.femmes / max) * LARGEUR;
            const couleur = couleurs[index] ?? couleurs[couleurs.length - 1];
            return (
              <g key={tranche.tranche}>
                <text x="160" y={y + 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--color-on-surface)">{tranche.tranche}</text>
                <rect className="motion-fill" style={{ transformOrigin: "right center", transformBox: "fill-box", "--delay": `${120 + index * 60}ms` } as CSSProperties} x={155 - wh} y={y + 12} width={wh} height="12" rx="3" fill={couleur} />
                <rect className="motion-fill" style={{ transformBox: "fill-box", "--delay": `${120 + index * 60}ms` } as CSSProperties} x="165" y={y + 12} width={wf} height="12" rx="3" fill={couleur} opacity="0.45" />
                <text x={151 - wh} y={y + 22} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--color-on-surface-variant)">{nombre(tranche.hommes)}</text>
                <text x={169 + wf} y={y + 22} textAnchor="start" fontSize="11" fontWeight="600" fill="var(--color-on-surface-variant)">{nombre(tranche.femmes)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-6 rounded-lg bg-error-container/40 p-4 flex items-start gap-3">
        <Icone nom="notification_important" className="text-error text-xl shrink-0 mt-0.5" />
        <div>
          <h3 className="font-label-lg text-label-lg text-error font-bold">{data.departs.nombre} départs à la retraite dans les 12 mois</h3>
          <p className="font-body-sm text-body-sm text-on-surface mt-1">{data.departs.detail}</p>
        </div>
      </div>
    </section>
  );
}

function AlertesReleve({ alertes }: { alertes: Alerte[] | undefined }) {
  return (
    <section className={`${CARD} p-6 flex flex-col gap-4`} aria-labelledby="titre-releve">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titre-releve" className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-2">
          <Icone nom="shield_person" className="text-secondary text-xl" />
          Relève des postes clés
        </h2>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Postes de direction dont le titulaire atteint bientôt la limite d'âge.</p>
      <ul className="space-y-3">
        {alertes === undefined ? [0, 1, 2].map((index) => <li key={index}><Skeleton className="h-32 rounded-lg" /></li>) : null}
        {alertes?.map((alerte) => {
          const style = RISQUE[alerte.risque];
          const ratio = Math.min(100, Math.round((alerte.vivier / alerte.vivier_cible) * 100));
          return (
            <li key={alerte.id} className="motion-content p-3.5 rounded-lg bg-surface-container-low">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`inline-block px-1.5 rounded font-label-sm text-label-sm font-bold ${style.badge}`}>
                    {echeance(alerte.depart)} · risque {alerte.risque_libelle.toLowerCase()}
                  </span>
                  <h3 className="font-label-md text-label-md text-on-surface font-bold mt-1">{alerte.poste}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {alerte.organisme} · titulaire{" "}
                    <Link to={`/app/dossiers/${encodeURIComponent(alerte.titulaire.matricule)}`} className="text-primary hover:underline rounded">{alerte.titulaire.nom_complet}</Link>
                  </p>
                </div>
                <span className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface font-label-sm text-label-sm font-bold shrink-0" aria-hidden="true">
                  {alerte.titulaire.initiales}
                </span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant mb-1">
                  <span>Vivier interne : <strong className="text-on-surface">{alerte.vivier} candidat{alerte.vivier > 1 ? "s" : ""} prêt{alerte.vivier > 1 ? "s" : ""}</strong></span>
                  <span>objectif {alerte.vivier_cible}</span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden" aria-hidden="true">
                  <div className={`${style.barre} motion-fill h-full rounded-full`} style={{ width: `${ratio}%` }}></div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  className="px-2.5 py-1 rounded bg-surface-container-lowest text-primary hover:bg-primary hover:text-on-primary font-label-sm text-label-sm font-semibold transition-colors"
                  type="button"
                  data-soon="Les plans de succession arrivent dans une prochaine version."
                >
                  {alerte.vivier === 0 ? "Lancer un appel à candidatures" : "Préparer le plan de succession"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
