import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { EtatsTableauDeBord, LigneCompte } from "../../api/types";
import { dateCourte, nombre } from "../../ui/format";
import { Icone } from "../../ui/Icone";
import { Skeleton } from "../../ui/Motion";
import { exporterAbsences, exporterDotations, exporterEffectifs, exporterFormation } from "./exportsTdb";

const CARD = "bg-surface-container-lowest rounded-xl border border-hairline";

type Etats = EtatsTableauDeBord | undefined;

function pourcent(valeur: number): string {
  return `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** Bouton d'export Excel d'une carte : le classeur reprend les données de la carte. */
export function BoutonExcel({ titre, onExporter, disabled = false }: { titre: string; onExporter: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-primary disabled:opacity-50"
      title={`Exporter « ${titre} » en Excel`}
      aria-label={`Exporter « ${titre} » en Excel`}
      disabled={disabled}
      onClick={onExporter}
    >
      <Icone nom="download" />
    </button>
  );
}

function Carte({ id, titre, sousTitre, icone, lien, libelleLien, onExporter, className = "", children }: {
  onExporter?: () => void;
  id: string;
  titre: string;
  sousTitre: string;
  icone: string;
  lien: string;
  libelleLien: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${CARD} p-5 flex flex-col gap-4 ${className}`} aria-labelledby={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Icone nom={icone} className="text-primary text-2xl mt-0.5" />
          <div>
            <h2 id={id} className="font-headline-sm text-headline-sm text-on-surface">{titre}</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{sousTitre}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to={lien} className="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline">
            {libelleLien}
            <Icone nom="arrow_forward" />
          </Link>
          <BoutonExcel titre={titre} onExporter={() => onExporter?.()} disabled={!onExporter} />
        </div>
      </div>
      {children}
    </section>
  );
}

function Chiffre({ valeur, libelle, alerte = false }: { valeur: string; libelle: string; alerte?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-container-low/60 px-3 py-2.5">
      <p className={`font-headline-sm text-headline-sm font-bold tabular-nums ${alerte ? "text-error" : "text-on-surface"}`}>{valeur}</p>
      <p className="font-label-sm text-label-sm text-on-surface-variant">{libelle}</p>
    </div>
  );
}

function Jauge({ pourcentage, alerte = false }: { pourcentage: number; alerte?: boolean }) {
  return (
    <div className="h-2 w-full rounded-full bg-surface-container overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full motion-fill ${alerte ? "bg-error" : "bg-primary"}`} style={{ width: `${Math.min(100, pourcentage)}%` }} />
    </div>
  );
}

/** Liste de barres horizontales : libellé, valeur, barre proportionnelle à la plus forte ligne. */
function Barres({ lignes, valeur = (ligne) => ligne.total, unite = "" }: {
  lignes: LigneCompte[];
  valeur?: (ligne: LigneCompte) => number;
  unite?: string;
}) {
  if (!lignes.length) return <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun enregistrement.</p>;
  const max = Math.max(1, ...lignes.map(valeur));
  return (
    <ul className="space-y-2">
      {lignes.map((ligne) => (
        <li key={ligne.libelle}>
          <div className="flex justify-between gap-3 font-body-sm text-body-sm">
            <span className="truncate text-on-surface" title={ligne.libelle}>{ligne.libelle}</span>
            <span className="shrink-0 font-code-num text-code-num font-semibold text-on-surface">{nombre(valeur(ligne))}{unite}</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-surface-container overflow-hidden" aria-hidden="true">
            <div className="h-full rounded-full bg-primary/80" style={{ width: `${(valeur(ligne) * 100) / max}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Chargement() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-8 rounded" />)}
    </div>
  );
}

/** État des effectifs : une répartition par axe (grade, emploi, structure…), avec la part femmes / hommes. */
export function EtatEffectifs({ etats }: { etats: Etats }) {
  const [axe, setAxe] = useState("categorie");
  const effectifs = etats?.effectifs;
  const courant = effectifs?.axes.find((item) => item.code === axe) ?? effectifs?.axes[0];
  const max = Math.max(1, ...(courant?.lignes ?? []).map((ligne) => ligne.total));
  return (
    <Carte
      id="titre-effectifs"
      titre="État des effectifs"
      sousTitre={etats?.perimetre ? "Agents de votre périmètre, par grade, genre, emploi, structure…" : "Agents du ministère, par grade, genre, emploi, structure…"}
      icone="groups"
      lien="/app/statistiques"
      libelleLien="Croiser dans les statistiques"
      onExporter={etats ? () => exporterEffectifs(etats) : undefined}
    >
      {!effectifs ? <Chargement /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Chiffre valeur={nombre(effectifs.total)} libelle="Agents" />
            <Chiffre valeur={`${nombre(effectifs.femmes)} · ${pourcent(effectifs.total ? (effectifs.femmes * 100) / effectifs.total : 0)}`} libelle="Femmes" />
            <Chiffre valeur={`${nombre(effectifs.hommes)} · ${pourcent(effectifs.total ? (effectifs.hommes * 100) / effectifs.total : 0)}`} libelle="Hommes" />
          </div>
          <div role="tablist" aria-label="Répartir les effectifs par" className="flex flex-wrap gap-1.5">
            {effectifs.axes.map((item) => (
              <button
                key={item.code}
                type="button"
                role="tab"
                aria-selected={item.code === courant?.code}
                className={`h-8 px-3 rounded-full border font-label-md text-label-md ${item.code === courant?.code ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface hover:bg-surface-container-low"}`}
                onClick={() => setAxe(item.code)}
              >
                {item.libelle}
              </button>
            ))}
          </div>
          {courant && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <span>{nombre(courant.modalites)} {courant.libelle.toLowerCase()}{courant.modalites > 1 ? "s" : ""} distinct{courant.modalites > 1 ? "s" : ""}</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />Femmes</span>
                  <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-secondary-container" aria-hidden="true" />Hommes</span>
                </span>
              </div>
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-2.5">
                {courant.lignes.map((ligne) => (
                  <li key={ligne.libelle}>
                    <div className="flex justify-between gap-3 font-body-sm text-body-sm">
                      <span className="truncate text-on-surface" title={ligne.libelle}>{ligne.libelle}</span>
                      <span className="shrink-0 font-code-num text-code-num text-on-surface-variant">
                        <span className="font-semibold text-on-surface">{nombre(ligne.total)}</span> · {nombre(ligne.femmes)} F / {nombre(ligne.hommes)} H
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-container" style={{ width: `${(ligne.total * 100) / max}%` }} aria-hidden="true">
                      <div className="h-full bg-primary" style={{ width: `${ligne.total ? (ligne.femmes * 100) / ligne.total : 0}%` }} />
                      <div className="h-full flex-1 bg-secondary-container" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Carte>
  );
}

/** État des dotations : occupation des plafonds d'emplois et demandes de dotation en cours. */
export function EtatDotations({ etats, className = "" }: { etats: Etats; className?: string }) {
  const dotations = etats?.dotations;
  return (
    <Carte
      id="titre-dotations"
      titre="État des dotations"
      sousTitre="Plafonds d'emplois et demandes de dotation."
      icone="account_tree"
      lien="/app/gpec/recrutement"
      libelleLien="Recrutement"
      onExporter={etats ? () => exporterDotations(etats) : undefined}
      className={className}
    >
      {!dotations ? <Chargement /> : (
        <>
          <div>
            <div className="flex justify-between gap-2 font-label-md text-label-md">
              <span className="text-on-surface">{nombre(dotations.effectif)} emplois occupés sur {nombre(dotations.plafond)}</span>
              <span className={dotations.occupation >= 95 ? "text-error font-bold" : "text-primary font-bold"}>{pourcent(dotations.occupation)}</span>
            </div>
            <div className="mt-1.5"><Jauge pourcentage={dotations.occupation} alerte={dotations.occupation >= 95} /></div>
          </div>
          {dotations.branches.length > 0 && (
            <ul className="space-y-2.5">
              {dotations.branches.map((branche) => (
                <li key={branche.libelle}>
                  <div className="flex justify-between gap-3 font-body-sm text-body-sm">
                    <span className="truncate text-on-surface" title={branche.libelle}>{branche.libelle}</span>
                    <span className="shrink-0 font-code-num text-code-num text-on-surface-variant">
                      {nombre(branche.effectif)} / {nombre(branche.plafond)} · <span className={branche.occupation >= 95 ? "text-error font-semibold" : ""}>{pourcent(branche.occupation)}</span>
                    </span>
                  </div>
                  <div className="mt-1"><Jauge pourcentage={branche.occupation} alerte={branche.occupation >= 95} /></div>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Chiffre valeur={nombre(dotations.ouvertes)} libelle="Demandes ouvertes" alerte={dotations.ouvertes > 0} />
            <Chiffre valeur={nombre(dotations.demandes)} libelle="Demandes reçues" />
            <Chiffre valeur={`${dotations.impact_ouvert > 0 ? "+" : ""}${nombre(dotations.impact_ouvert)}`} libelle="Postes en jeu" />
          </div>
          <div>
            <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Demandes par étape</p>
            <Barres lignes={dotations.par_statut} />
          </div>
        </>
      )}
    </Carte>
  );
}

/** État des absences et congés : absents du jour, décisions en attente, absences de l'exercice, soldes de congés. */
export function EtatAbsences({ etats, exercice }: { etats: Etats; exercice: number }) {
  const absences = etats?.absences;
  return (
    <Carte
      id="titre-absences"
      titre="État des absences et congés"
      sousTitre={`Absents du jour et absences débutées en ${exercice}.`}
      icone="event_busy"
      lien="/app/carrieres/absences"
      libelleLien="Absences"
      onExporter={etats ? () => exporterAbsences(etats, exercice) : undefined}
    >
      {!absences ? <Chargement /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Chiffre valeur={nombre(absences.absents)} libelle="Absents aujourd'hui" />
            <Chiffre valeur={nombre(absences.a_decider)} libelle="Absences à décider" alerte={absences.a_decider > 0} />
            <Chiffre valeur={nombre(absences.conges.a_instruire)} libelle="Congés à instruire" alerte={absences.conges.a_instruire > 0} />
            <Chiffre valeur={nombre(absences.annee.jours)} libelle={`Jours d'absence ${exercice}`} />
          </div>
          <div>
            <div className="flex flex-wrap justify-between gap-2 font-label-md text-label-md">
              <span className="text-on-surface">Congés consommés : {nombre(absences.conges.consommes)} j sur {nombre(absences.conges.acquis)} j</span>
              <span className="text-primary font-bold">{pourcent(absences.conges.consommation)}</span>
            </div>
            <div className="mt-1.5"><Jauge pourcentage={absences.conges.consommation} /></div>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Reliquat : {nombre(absences.conges.reliquat)} jours · {nombre(absences.conges.signes)} arrêtés de congé signés</p>
          </div>
          {absences.en_cours.length > 0 && (
            <p className="font-body-sm text-body-sm text-on-surface">
              <span className="text-on-surface-variant">En ce moment : </span>
              {absences.en_cours.map((ligne) => `${ligne.libelle} (${ligne.total})`).join(", ")}
            </p>
          )}
          <div>
            <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Jours d'absence par nature, {exercice}</p>
            <Barres lignes={absences.annee.par_nature} valeur={(ligne) => (ligne as LigneCompte & { jours: number }).jours} unite=" j" />
          </div>
        </>
      )}
    </Carte>
  );
}

/** État des mises en formation : sessions, agents en formation, formés de l'exercice, prochaines sessions. */
export function EtatFormation({ etats, exercice }: { etats: Etats; exercice: number }) {
  const formation = etats?.formation;
  return (
    <Carte
      id="titre-formation"
      titre="État des mises en formation"
      sousTitre={`Sessions et agents formés en ${exercice}.`}
      icone="school"
      lien="/app/formation"
      libelleLien="Formation"
      onExporter={etats ? () => exporterFormation(etats, exercice) : undefined}
    >
      {!formation ? <Chargement /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Chiffre valeur={nombre(formation.agents_en_cours)} libelle="Agents en formation" />
            <Chiffre valeur={nombre(formation.sessions_ouvertes)} libelle="Sessions ouvertes" />
            <Chiffre valeur={nombre(formation.inscrits)} libelle={`Inscriptions ${exercice}`} />
            <Chiffre valeur={`${nombre(formation.agents_formes)} · ${nombre(formation.heures)} h`} libelle={`Agents formés ${exercice}`} />
          </div>
          <div>
            <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Inscriptions par type de formation</p>
            <Barres lignes={formation.par_type} />
          </div>
          <div>
            <p className="mb-2 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Prochaines sessions</p>
            {formation.prochaines.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune session programmée.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {formation.prochaines.map((session) => (
                  <li key={`${session.libelle}-${session.debut}`} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-body-sm text-body-sm text-on-surface" title={session.libelle}>{session.libelle}</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant">{dateCourte(session.debut)}{session.lieu ? ` · ${session.lieu}` : ""}</p>
                    </div>
                    <span className="shrink-0 font-code-num text-code-num text-on-surface">{nombre(session.inscrits)} / {nombre(session.places)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Carte>
  );
}
