import type { ReactNode } from "react";
import type { Dossier } from "../../api/types";
import { Pagination, usePagination } from "../../ui/Pagination";
import { dateFr, useDocumentAgent } from "./commun";
import { Icone } from "../../ui/Icone";

type Evaluation = Dossier["evaluations"][number];

function note(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function horodatage(iso: string | null): string {
  if (!iso) return "";
  const quand = new Date(iso);
  return `${dateFr(iso.slice(0, 10))} à ${String(quand.getHours()).padStart(2, "0")}:${String(quand.getMinutes()).padStart(2, "0")}`;
}

/** Score pondéré des objectifs du contrat. */
function scoreObjectifs(evaluation: Evaluation): number | null {
  const total = evaluation.objectifs.reduce((somme, item) => somme + item.ponderation, 0);
  if (!total) return null;
  return evaluation.objectifs.reduce((somme, item) => somme + item.note * item.ponderation, 0) / total;
}

/** Notations & évaluations de l'agent, versées par la hiérarchie. */
export function OngletNotations({ agent }: { agent: Dossier }) {
  const telecharger = useDocumentAgent(agent.matricule);
  const evaluations = agent.evaluations;
  const pageEvaluations = usePagination(evaluations, String(evaluations.length));
  const courante = evaluations[0];
  const ancienne = evaluations[evaluations.length - 1];
  const progression = courante && ancienne && courante !== ancienne ? courante.note - ancienne.note : null;
  const score = courante ? scoreObjectifs(courante) : null;
  const tauxMoyen = courante?.objectifs.length ? Math.round(courante.objectifs.reduce((somme, item) => somme + item.taux_atteinte, 0) / courante.objectifs.length) : null;
  const atteints = courante?.objectifs.filter((item) => item.taux_atteinte >= 100).length ?? 0;
  const moyenneCriteres = courante?.criteres.length ? courante.criteres.reduce((somme, item) => somme + item.note, 0) / courante.criteres.length : null;
  const limiteRecours = courante?.notifiee_le ? new Date(new Date(courante.notifiee_le).getTime() + 15 * 86_400_000).toISOString().slice(0, 10) : null;
  const projection = agent.projection;

  if (!courante) {
    return (
      <div className="w-full px-6 py-6 mx-auto">
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm font-body-md text-body-md text-on-surface-variant">Aucune notation n'est versée au dossier de {agent.nom_complet}.</div>
      </div>
    );
  }

  const points = evaluations.slice().reverse();
  const minimum = Math.min(...points.map((item) => item.note));
  const maximum = Math.max(...points.map((item) => item.note));
  const trace = points
    .map((item, index) => {
      const x = points.length > 1 ? 4 + (index * 72) / (points.length - 1) : 40;
      const y = maximum > minimum ? 34 - ((item.note - minimum) / (maximum - minimum)) * 28 : 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="w-full px-6 py-6 mx-auto flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div className="space-y-1">
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Notations & évaluations</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Évaluateur (N+1) : <strong className="text-on-surface">{courante.evaluateur}</strong> ({courante.fonction_evaluateur})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button className="px-4 py-2.5 rounded bg-primary text-on-primary hover:bg-primary-container font-label-lg text-label-lg font-semibold shadow-sm transition-all flex items-center gap-2" type="button" onClick={() => telecharger("bulletin")}>
            <Icone nom="download" className="text-lg" />
            <span>Bulletin individuel (PDF)</span>
          </button>
        </div>
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Carte titre={`Note retenue ${courante.annee}`} badge={courante.statut} badgeTon="bg-primary-fixed text-on-primary-fixed">
          <div className="my-3 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl text-primary font-bold tracking-tight">{note(courante.note)}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface-variant font-medium">/ 20</span>
          </div>
          <span className="text-primary font-semibold flex items-center gap-1 font-label-sm text-label-sm">
            <Icone nom="workspace_premium" className="text-sm" />
            Mention {courante.mention}
          </span>
        </Carte>
        <Carte titre="Réalisation des objectifs" badge={`${atteints}/${courante.objectifs.length} atteints`} badgeTon="bg-secondary-fixed text-on-secondary-fixed">
          <div className="my-3 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">{tauxMoyen ?? "—"}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface-variant font-medium">%</span>
          </div>
          <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
            <div className="bg-primary-container h-full rounded-full" style={{ width: `${Math.min(tauxMoyen ?? 0, 100)}%` }} />
          </div>
        </Carte>
        <Carte titre={`Progression ${ancienne.annee}-${courante.annee}`} badge={progression !== null ? `${progression >= 0 ? "+" : ""}${note(progression)} pt` : "—"} badgeTon="bg-primary-fixed text-on-primary-fixed-variant">
          <div className="my-3 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-code-num text-code-num text-on-surface-variant">{ancienne.annee} : {note(ancienne.note)}</span>
              <span className="font-headline-md text-headline-md text-on-surface font-bold">{note(courante.note)}</span>
            </div>
            <svg className="w-20 h-10 overflow-visible" viewBox="0 0 80 40" aria-hidden="true">
              <polyline fill="none" points={trace} stroke="var(--color-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            </svg>
          </div>
        </Carte>
        <Carte titre="Critères statutaires" badge={moyenneCriteres !== null ? "Moyenne" : "—"} badgeTon="bg-surface-container-high text-on-surface">
          <div className="my-3 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl text-secondary font-bold tracking-tight">{moyenneCriteres !== null ? note(moyenneCriteres) : "—"}</span>
            <span className="font-headline-sm text-headline-sm text-on-surface-variant font-medium">/ 20</span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">{courante.criteres.length} critères évalués</span>
        </Carte>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 flex flex-col gap-6">
          {/* Objectifs */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-2">
              <div>
                <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-wider">Contrat {courante.annee}</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Objectifs & résultats individuels</h2>
              </div>
              {score !== null ? <span className="px-2.5 py-1 rounded bg-surface-container-high text-primary font-bold font-code-num text-code-num">Score pondéré : {note(score)} / 20</span> : null}
            </div>
            <div className="space-y-4 pt-2">
              {courante.objectifs.map((objectif) => (
                <div key={objectif.ordre} className="bg-surface-container-low rounded-lg p-4 transition-colors hover:bg-surface-container">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded bg-primary text-on-primary font-code-num text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">{objectif.ordre}</span>
                      <div>
                        <h3 className="font-label-lg text-label-lg text-on-surface font-semibold">{objectif.intitule}</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{objectif.description}</p>
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-end shrink-0 pl-9 sm:pl-0">
                      <span className="font-headline-sm text-headline-sm text-primary font-bold">
                        {note(objectif.note)} <span className="text-xs text-on-surface-variant font-normal">/ 20</span>
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Pondération : {objectif.ponderation} %</span>
                    </div>
                  </div>
                  <div className="pl-9 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-surface-container">
                    <span className="inline-flex items-center gap-1.5 font-label-sm text-label-sm text-primary font-semibold">
                      <Icone nom="check_circle" className="text-sm" />
                      Mention N+1 : {objectif.mention}
                    </span>
                    <span className="text-xs font-code-num text-on-surface-variant">Taux d'atteinte : {objectif.taux_atteinte} %</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Critères */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
            <h2 className="font-headline-sm text-headline-sm text-on-surface pb-4">Critères statutaires de la fonction publique</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courante.criteres.map((critere) => (
                <div key={critere.libelle} className="bg-surface-container-low rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-label-md text-label-md text-on-surface font-semibold">{critere.libelle}</span>
                    <span className="font-code-num text-code-num text-primary font-bold">{note(critere.note)} / 20</span>
                  </div>
                  <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${(critere.note / 20) * 100}%` }} />
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{critere.commentaire}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Circuit de validation */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
            <h2 className="font-headline-sm text-headline-sm text-on-surface pb-4">Circuit de validation</h2>
            <ol className="space-y-4">
              <Etape numero={1} titre="Avis du supérieur hiérarchique direct (N+1)" etat="Signé" texte={`« ${courante.appreciation} »`} signataire={`${courante.evaluateur}, ${courante.fonction_evaluateur}`} />
              <Etape numero={2} titre="Visa du directeur des ressources humaines" etat={courante.vise_le ? "Visa apposé" : "En attente"} texte={courante.avis_drh || "Le visa du DRH n'est pas encore apposé."} quand={courante.vise_le ? `Visé le ${horodatage(courante.vise_le)}` : ""} />
              <Etape
                numero={3}
                titre="Notification à l'agent noté"
                etat={courante.notifiee_le ? "Notifiée" : "À notifier"}
                texte={courante.observation_agent ? `Observation de l'agent : « ${courante.observation_agent} »` : "L'agent n'a pas encore porté d'observation."}
                signataire={agent.nom_complet}
                quand={courante.notifiee_le ? `Notifiée le ${horodatage(courante.notifiee_le)}` : ""}
              />
            </ol>
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          {/* Historique */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between gap-2 pb-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Historique des notations</h2>
              <span className="font-code-num text-code-num text-on-surface-variant">{ancienne.annee} — {courante.annee}</span>
            </div>
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead>
                <tr className="text-on-surface-variant font-label-sm text-label-sm uppercase">
                  <th className="py-2">Exercice</th>
                  <th className="py-2" data-min="">Note</th>
                  <th className="py-2">Mention</th>
                  <th className="py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {pageEvaluations.visibles.map((item) => (
                  <tr key={item.id} className="border-t border-surface-container">
                    <td className="py-2.5 font-code-num">{item.annee}</td>
                    <td className="py-2.5 font-code-num font-bold text-on-surface">{note(item.note)}</td>
                    <td className="py-2.5">{item.mention}</td>
                    <td className="py-2.5 text-on-surface-variant">{item.statut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={pageEvaluations.page} pages={pageEvaluations.pages} total={pageEvaluations.total} aller={pageEvaluations.aller} libelle="notation" />
          </div>

          {/* Impact sur la carrière */}
          {projection ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-3">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Impact sur la carrière</h2>
              <div className="bg-surface-container-low rounded-lg p-3 space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Prochain échelon</span>
                <p className="font-label-lg text-label-lg text-on-surface font-semibold">
                  {projection.prochain_echelon ? `Échelon ${projection.prochain_echelon}` : "Échelon terminal atteint"}
                  {projection.date_prochain_echelon ? ` • ${dateFr(projection.date_prochain_echelon)}` : ""}
                </p>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Indice actuel</span>
                <p className="font-label-lg text-label-lg text-on-surface font-semibold">{agent.indice.toLocaleString("fr-FR")} points</p>
              </div>
            </div>
          ) : null}

          {/* Voies de recours */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-3">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Voies de recours & délais</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              L'agent dispose de <strong>15 jours francs</strong> à compter de la notification pour saisir la commission mixte paritaire de recours.
            </p>
            {limiteRecours ? (
              <p className="font-label-md text-label-md text-on-surface">
                Date limite : <strong className="text-secondary">{dateFr(limiteRecours)}</strong>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Carte({ titre, badge, badgeTon, children }: { titre: string; badge: string; badgeTon: string; children: ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="font-label-md text-label-md text-on-surface-variant font-semibold">{titre}</span>
        <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold whitespace-nowrap ${badgeTon}`}>{badge}</span>
      </div>
      {children}
    </div>
  );
}

function Etape({ numero, titre, etat, texte, signataire, quand }: { numero: number; titre: string; etat: string; texte: string; signataire?: string; quand?: string }) {
  return (
    <li className="bg-surface-container-low rounded-lg p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-label-lg text-label-lg text-on-surface font-semibold">
          {numero}. {titre}
        </span>
        <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-bold">{etat}</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{texte}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
        {signataire ? (
          <span>
            Signataire : <strong className="text-on-surface">{signataire}</strong>
          </span>
        ) : (
          <span />
        )}
        {quand ? <span className="font-code-num">{quand}</span> : null}
      </div>
    </li>
  );
}
