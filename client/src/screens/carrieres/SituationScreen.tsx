import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import type { AgentBrief, Dossier } from "../../api/types";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { Portrait } from "../../ui/PhotoProfil";
import { AppChrome } from "../AppChrome";
import { SituationModal } from "../SituationModal";
import { ParcoursModal } from "./ParcoursModal";
import { PositionsModal } from "./PositionsModal";
import { Icone } from "../../ui/Icone";
import { positionAffichee } from "../../ui/situation";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";
const TAILLE = 8;

type Famille = "activite" | "detachement" | "disponibilite" | "hors";

/** Les seuls indicateurs de l'écran : l'effectif, puis chaque position, avec son export Excel. */
const POSITIONS: {
  id: Famille | "toutes";
  libelle: string;
  detail: string;
  icone: string;
}[] = [
  { id: "toutes", libelle: "Effectif du personnel", detail: "Tous les agents du périmètre", icone: "groups" },
  { id: "activite", libelle: "En activité", detail: "Position d'activité normale", icone: "group_work" },
  { id: "detachement", libelle: "En détachement", detail: "Détachements et mises à disposition", icone: "domain_add" },
  { id: "disponibilite", libelle: "En disponibilité", detail: "Disponibilités", icone: "event_busy" },
];

/** Bouton d'action en icône : même gabarit pour tous, léger soulèvement au survol. */
const BOUTON_ICONE = "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const TON_POSITION: Record<Famille, { fond: string; pastille: string }> = {
  activite: { fond: "bg-primary-fixed text-on-primary-fixed", pastille: "bg-primary" },
  detachement: { fond: "bg-secondary-fixed text-on-secondary-fixed", pastille: "bg-secondary" },
  disponibilite: { fond: "bg-tertiary-fixed text-on-tertiary-fixed", pastille: "bg-tertiary" },
  hors: { fond: "bg-error-container text-on-error-container", pastille: "bg-error" },
};

function tonPart(part: number): { texte: string; barre: string; icone: string } {
  if (part >= 70) return { texte: "text-primary", barre: "bg-primary-container", icone: "text-primary" };
  if (part >= 20) return { texte: "text-secondary", barre: "bg-secondary", icone: "text-secondary" };
  if (part > 0) return { texte: "text-tertiary", barre: "bg-tertiary", icone: "text-tertiary" };
  return { texte: "text-on-surface-variant", barre: "bg-outline", icone: "text-outline" };
}

/**
 * Position statutaire d'un agent. Détachement, mise à disposition, disponibilité et hors-cadre sont des positions à part ;
 * tout le reste est l'activité : présence au poste, formation, congé annuel, congé de paternité, de maternité ou de maladie.
 */
function famille(situation: string): Famille {
  const s = situation.toLowerCase();
  if (s.includes("détach") || s.includes("detach") || s.includes("disposition")) return "detachement";
  if (s.includes("disponib")) return "disponibilite";
  if (s.includes("hors")) return "hors";
  return "activite";
}

export function SituationScreen() {
  const [filtre, setFiltre] = useState("");
  const [position, setPosition] = useState<Famille | "toutes">("toutes");
  const [page, setPage] = useState(1);
  const [matricule, setMatricule] = useState<string | null>(null);
  const [positionDe, setPositionDe] = useState<{ matricule: string; nom: string } | null>(null);
  const [parcours, setParcours] = useState<{ matricule: string; nom: string } | null>(null);
  const feedback = useFeedback();
  const agents = useQuery({ queryKey: ["agents", ""], queryFn: () => api<AgentBrief[]>("/api/v1/agents/") });

  async function exporter(id: Famille | "toutes", libelle: string) {
    try {
      await feedback.run(`Export Excel : ${libelle}…`, () => telecharger(`/api/v1/situation/export/?position=${id}`, `situation-${id}.xlsx`), {
        success: { title: "Export prêt", message: `${libelle} : le classeur Excel est téléchargé.` },
        error: "L'export Excel n'a pas abouti.",
      });
    } catch {
      /* le message d'erreur est déjà affiché */
    }
  }
  const tous = agents.data ?? [];
  const comptes = useMemo(() => {
    const base = { activite: 0, detachement: 0, disponibilite: 0, hors: 0 };
    for (const agent of tous) base[famille(agent.situation)] += 1;
    return { ...base, toutes: tous.length };
  }, [tous]);
  // Positions arrivant à terme prochainement, par famille.
  const proches = useMemo(() => {
    const base = { activite: 0, detachement: 0, disponibilite: 0, hors: 0 };
    for (const agent of tous) if (agent.echeance_proche) base[famille(agent.situation)] += 1;
    return { ...base, toutes: base.detachement + base.disponibilite + base.hors };
  }, [tous]);
  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return tous.filter((agent) => {
      const correspond =
        !q
        || agent.nom_complet.toLowerCase().includes(q)
        || agent.matricule.toLowerCase().includes(q)
        || agent.organisme.toLowerCase().includes(q)
        || agent.structure.toLowerCase().includes(q)
        || agent.situation.toLowerCase().includes(q);
      return correspond && (position === "toutes" || famille(agent.situation) === position);
    }).sort((a, b) => (a.echeance ?? "9999-12-31").localeCompare(b.echeance ?? "9999-12-31"));
  }, [tous, filtre, position]);
  const pages = Math.max(1, Math.ceil(visibles.length / TAILLE));
  const courante = Math.min(page, pages);
  const debut = (courante - 1) * TAILLE;
  const lignes = visibles.slice(debut, debut + TAILLE);

  return (
    <AppChrome>
      <div className={PAGE}>
        <section className="bg-surface-container-lowest p-6 rounded-xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col gap-3">
            <p className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
              <span className="font-semibold text-primary">Carrières</span>
              <Icone nom="chevron_right" className="text-xs" />
              <span>Gestion administrative et postes</span>
              <Icone nom="chevron_right" className="text-xs" />
              <span className="text-secondary font-bold">Positions statutaires</span>
            </p>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Gestion des situations administratives, postes et affectations
            </h1>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-low text-primary font-label-sm text-label-sm rounded-lg font-semibold">
                <span className="w-2 h-2 rounded-full bg-primary-container" aria-hidden="true" />
                Régime général et conventions d'État
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-low text-secondary font-label-sm text-label-sm rounded-lg font-bold">
                <Icone nom="event_repeat" className="text-sm" />
                Exercice réglementaire 2026
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {POSITIONS.map((item) => {
            const nombre = comptes[item.id];
            const part = tous.length === 0 ? 0 : Math.round((nombre / tous.length) * 100);
            const ton = tonPart(item.id === "toutes" ? 100 : part);
            return (
              <div key={item.id} className={`flex flex-col bg-surface-container-lowest rounded-xl ${position === item.id ? "ring-2 ring-primary" : ""}`}>
                <button
                  type="button"
                  aria-pressed={position === item.id}
                  onClick={() => {
                    setPosition(position === item.id || item.id === "toutes" ? "toutes" : item.id);
                    setPage(1);
                  }}
                  className="flex-1 rounded-t-xl p-5 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-semibold">{item.libelle}</p>
                      <p className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight mt-1">{agents.isPending ? "—" : nombre}</p>
                    </div>
                    <span className={`w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 ${ton.icone}`}>
                      <Icone nom={item.icone} className="text-2xl" />
                    </span>
                  </div>
                  <p className="mt-3 flex items-center justify-between gap-2 font-label-sm text-label-sm">
                    <span className={`font-semibold ${ton.texte}`}>{item.id === "toutes" ? item.detail : `${part}% du registre`}</span>
                    {item.id === "activite" || item.id === "toutes" ? null : (
                      proches[item.id] ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-error px-2.5 py-0.5 font-bold text-on-error shadow-sm">
                          <Icone nom="alarm" className="text-sm" />
                          {proches[item.id]} échéance{proches[item.id] > 1 ? "s" : ""} proche{proches[item.id] > 1 ? "s" : ""}
                        </span>
                      ) : <span className="text-on-surface-variant">Aucune échéance proche</span>
                    )}
                  </p>
                  <div className="w-full bg-surface-container-high h-1.5 mt-1.5 rounded-full overflow-hidden">
                    <div className={`motion-fill h-full rounded-full ${ton.barre}`} style={{ width: `${item.id === "toutes" ? 100 : part}%` }} />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void exporter(item.id, item.libelle)}
                  disabled={agents.isPending || nombre === 0}
                  title={nombre === 0 ? "Aucun agent à exporter" : `Exporter « ${item.libelle} » au format Excel`}
                  className="flex items-center justify-center gap-2 rounded-b-xl border-t border-hairline px-5 py-2.5 font-label-md text-label-md font-semibold text-primary transition-colors hover:bg-primary-fixed/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icone nom="download" className="text-lg" />Exporter (Excel)
                </button>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-12 bg-surface-container-lowest rounded-xl overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low/50">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Registre des positions</h2>
              </div>
              <label className="block w-full sm:w-72">
                <span className="sr-only">Rechercher un agent</span>
                <input
                  type="search"
                  value={filtre}
                  onChange={(event) => {
                    setFiltre(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Nom, matricule, structure…"
                  className="w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>

            <div>
              <table className="w-full table-fixed text-left font-body-sm text-body-sm">
                <thead className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Agent</th>
                    <th className="py-3 px-4 w-56">Position</th>
                    <th className="py-3 px-4 w-44 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {agents.isPending
                    ? [0, 1, 2, 3].map((ligne) => (
                        <tr key={ligne} className="border-t border-hairline">
                          <td className="py-4 px-4" colSpan={3}><Skeleton className="h-8 w-2/3" /></td>
                        </tr>
                      ))
                    : null}
                  {lignes.map((agent) => (
                    <tr key={agent.matricule} className={`border-t border-hairline ${agent.echeance_proche ? "bg-error-container/30 shadow-[inset_4px_0_0_var(--color-error)] hover:bg-error-container/50" : "hover:bg-surface-container-low/60"}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Portrait agent={agent} className="w-9 h-9 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md shrink-0" />
                          <span className="min-w-0">
                            <span className="block font-label-lg text-label-lg font-bold text-on-surface truncate">{agent.nom_complet}</span>
                            <span className="block font-code-num text-xs text-on-surface-variant truncate">Mle {agent.matricule} • {agent.organisme}</span>
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-label-sm text-label-sm rounded font-bold ${TON_POSITION[famille(agent.situation)].fond}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TON_POSITION[famille(agent.situation)].pastille}`} aria-hidden="true" />
                          {famille(agent.situation) === "activite" ? "En activité" : agent.situation}
                        </span>
                        {positionAffichee(agent).detail ? (
                          <span className="mt-1 block font-label-sm text-label-sm text-on-surface-variant">{positionAffichee(agent).detail}</span>
                        ) : null}
                        {agent.echeance ? (
                          <span className={`mt-1 inline-flex items-center gap-1 rounded px-2 py-0.5 font-label-sm text-label-sm ${agent.echeance_proche ? "bg-error font-bold text-on-error" : "bg-surface-container text-on-surface-variant"}`}>
                            {agent.echeance_proche ? <Icone nom="alarm" className="text-sm" /> : null}
                            Jusqu'au {agent.echeance.split("-").reverse().join("/")} · J-{agent.echeance_jours}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-nowrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title="Positions : détachement, disponibilité, mise à disposition…"
                            aria-label={`Positions administratives de ${agent.nom_complet}`}
                            onClick={() => setPositionDe({ matricule: agent.matricule, nom: agent.nom_complet })}
                            className={`${BOUTON_ICONE} bg-surface-container text-primary hover:bg-primary-fixed`}
                          >
                            <Icone nom="event_busy" className="text-xl" />
                          </button>
                          <button
                            type="button"
                            title="Parcours professionnel : nominations, promotions, mutations"
                            aria-label={`Parcours professionnel de ${agent.nom_complet}`}
                            onClick={() => setParcours({ matricule: agent.matricule, nom: agent.nom_complet })}
                            className={`${BOUTON_ICONE} bg-surface-container text-primary hover:bg-primary-fixed`}
                          >
                            <Icone nom="timeline" className="text-xl" />
                          </button>
                          <button
                            type="button"
                            title="Modifier la situation administrative"
                            aria-label={`Modifier la situation de ${agent.nom_complet}`}
                            onClick={() => setMatricule(agent.matricule)}
                            className={`${BOUTON_ICONE} bg-primary text-on-primary shadow-sm hover:bg-primary-container hover:shadow-md`}
                          >
                            <Icone nom="edit" className="text-xl" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {agents.data && visibles.length === 0 ? (
                    <tr className="border-t border-hairline">
                      <td className="py-6 px-4 text-on-surface-variant" colSpan={3}>Aucun agent ne correspond à cette recherche.</td>
                    </tr>
                  ) : null}
                  {agents.isError ? (
                    <tr className="border-t border-hairline">
                      <td className="py-6 px-4 text-error" colSpan={3} role="alert">
                        Le registre n'a pas pu être chargé.{" "}
                        <button type="button" className="underline font-semibold rounded" onClick={() => agents.refetch()}>Réessayer</button>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3 font-label-sm text-label-sm text-on-surface-variant">
              <span>
                {visibles.length === 0
                  ? "Aucun agent répertorié"
                  : `Affichage de ${debut + 1} à ${Math.min(debut + TAILLE, visibles.length)} sur ${visibles.length} agent${visibles.length > 1 ? "s" : ""}`}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" className="px-2.5 py-1 bg-surface-container-lowest rounded disabled:opacity-50" disabled={courante <= 1} onClick={() => setPage(courante - 1)}>Précédent</button>
                <span className="px-2.5 py-1 bg-primary text-on-primary font-bold rounded">{courante}</span>
                <span>sur {pages}</span>
                <button type="button" className="px-2.5 py-1 bg-surface-container-lowest rounded disabled:opacity-50" disabled={courante >= pages} onClick={() => setPage(courante + 1)}>Suivant</button>
              </div>
            </div>
          </section>

        </div>
      </div>
      {matricule ? <EditionAgent matricule={matricule} onClose={() => setMatricule(null)} /> : null}
      {positionDe ? <PositionsModal matricule={positionDe.matricule} nom={positionDe.nom} onClose={() => setPositionDe(null)} /> : null}
      {parcours ? <ParcoursModal matricule={parcours.matricule} nom={parcours.nom} onClose={() => setParcours(null)} /> : null}
    </AppChrome>
  );
}

function EditionAgent({ matricule, onClose }: { matricule: string; onClose: () => void }) {
  const dossier = useQuery({
    queryKey: ["agent", matricule],
    queryFn: () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(matricule)}/`),
  });
  if (dossier.data) return <SituationModal agent={dossier.data} onClose={onClose} />;
  const message = dossier.isError
    ? dossier.error instanceof ApiError && dossier.error.status === 404
      ? `Aucun agent ne porte le matricule ${matricule}.`
      : "La situation n'a pas pu être chargée."
    : "Chargement de la situation…";
  return (
    <Modale
      titre={dossier.isError ? "Situation indisponible" : "Situation administrative"}
      sousTitre={message}
      icone={dossier.isError ? "error" : "hourglass_top"}
      ton={dossier.isError ? "danger" : "neutre"}
      taille="sm"
      onClose={onClose}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>
          {dossier.isError ? (
            <button type="button" className={BOUTON_PRIMAIRE} onClick={() => dossier.refetch()}>Réessayer</button>
          ) : null}
        </>
      }
    >
      {dossier.isError ? null : <div className="motion-indeterminate h-1 w-full overflow-hidden rounded-full bg-surface-container" />}
    </Modale>
  );
}
