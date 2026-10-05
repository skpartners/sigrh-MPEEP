import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { AgentBrief, Dossier } from "../../api/types";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { Portrait } from "../../ui/PhotoProfil";
import { AppChrome } from "../AppChrome";
import { SituationModal } from "../SituationModal";
import { Icone } from "../../ui/Icone";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";
const TAILLE = 8;

type Famille = "activite" | "detachement" | "disponibilite" | "hors";

const POSITIONS: {
  id: Famille;
  libelle: string;
  texte: string;
  icone: string;
  detail: string;
}[] = [
  {
    id: "activite",
    libelle: "Effectif en activité normale",
    texte: "Agents en service effectif dans leur emploi, au ministère ou dans la société qui les emploie.",
    icone: "group_work",
    detail: "Postes pourvus",
  },
  {
    id: "detachement",
    libelle: "Détachements et mises à disposition",
    texte: "Agents qui exercent hors de leur administration d'origine, par arrêté de détachement ou décision de mise à disposition.",
    icone: "domain_add",
    detail: "Sociétés et administrations d'accueil",
  },
  {
    id: "disponibilite",
    libelle: "Disponibilités",
    texte: "Agents temporairement hors de leur emploi. Le retour se fait par arrêté de réintégration, avant l'échéance.",
    icone: "event_busy",
    detail: "À suivre jusqu'à l'échéance",
  },
  {
    id: "hors",
    libelle: "Positions hors-cadre",
    texte: "Dirigeants nommés pour un mandat d'État, en dehors du cadre de leur corps d'origine.",
    icone: "workspace_premium",
    detail: "Mandats d'État",
  },
];

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
  const agents = useQuery({ queryKey: ["agents", ""], queryFn: () => api<AgentBrief[]>("/api/v1/agents/") });
  const tous = agents.data ?? [];
  const comptes = useMemo(() => {
    const base = { activite: 0, detachement: 0, disponibilite: 0, hors: 0 };
    for (const agent of tous) base[famille(agent.situation)] += 1;
    return base;
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
    });
  }, [tous, filtre, position]);
  const speciales = tous.filter((agent) => famille(agent.situation) !== "activite");
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
            <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
              La situation administrative fixe la position de l'agent : activité, détachement, mise à disposition, disponibilité ou hors-cadre. Le gestionnaire tient le registre à jour. L'agent consulte son dossier sans le modifier.
            </p>
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
            const ton = tonPart(part);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPosition(position === item.id ? "toutes" : item.id);
                  setPage(1);
                }}
                className={`bg-surface-container-lowest p-5 rounded-xl text-left ${position === item.id ? "ring-2 ring-primary" : ""}`}
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
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-3">{item.texte}</p>
                <div className="mt-4 flex items-center justify-between font-label-sm text-label-sm">
                  <span className={`font-semibold ${ton.texte}`}>{part}% du registre</span>
                  <span className="text-on-surface-variant font-code-num">{item.detail}</span>
                </div>
                <div className="w-full bg-surface-container-high h-1.5 mt-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${ton.barre}`} style={{ width: `${part}%` }} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 bg-surface-container-lowest rounded-xl overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-surface-container-low/50">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Registre matriculaire des positions spéciales et mouvements</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Suivi juridique des actes portant nomination, détachement et renouvellement statutaire.
                </p>
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

            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Agent / Fonctionnaire</th>
                    <th className="py-3 px-4">Origine & Affectation</th>
                    <th className="py-3 px-4" data-min="">Position</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.isPending
                    ? [0, 1, 2, 3].map((ligne) => (
                        <tr key={ligne} className="border-t border-hairline">
                          <td className="py-4 px-4" colSpan={4}><Skeleton className="h-8 w-2/3" /></td>
                        </tr>
                      ))
                    : null}
                  {lignes.map((agent) => (
                    <tr key={agent.matricule} className="border-t border-hairline hover:bg-surface-container-low/60">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <Portrait agent={agent} className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md shrink-0" />
                          <span className="min-w-0">
                            <span className="block font-label-lg text-label-lg font-bold text-on-surface truncate">{agent.nom_complet}</span>
                            <span className="flex items-center gap-1.5 font-code-num text-xs text-on-surface-variant">
                              <span>Mle {agent.matricule}</span>
                              <span aria-hidden="true">•</span>
                              <span className="text-primary font-semibold">Grade {agent.grade} / Éch. {agent.echelon}</span>
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-on-surface block truncate">{agent.organisme}</span>
                        <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
                          <Icone nom="arrow_upward" className="text-xs" />
                          {agent.structure}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-label-sm text-label-sm rounded font-bold ${TON_POSITION[famille(agent.situation)].fond}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TON_POSITION[famille(agent.situation)].pastille}`} aria-hidden="true" />
                          {agent.situation}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setMatricule(agent.matricule)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-container text-on-primary font-label-sm text-label-sm font-semibold hover:bg-primary"
                        >
                          <Icone nom="edit_note" className="text-lg" />
                          Modifier
                        </button>
                      </td>
                    </tr>
                  ))}
                  {agents.data && visibles.length === 0 ? (
                    <tr className="border-t border-hairline">
                      <td className="py-6 px-4 text-on-surface-variant" colSpan={4}>Aucun agent ne correspond à cette recherche.</td>
                    </tr>
                  ) : null}
                  {agents.isError ? (
                    <tr className="border-t border-hairline">
                      <td className="py-6 px-4 text-error" colSpan={4} role="alert">
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

          <aside className="lg:col-span-4 space-y-6">
            <section className="bg-surface-container-lowest p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Échéances imminentes</h2>
                <span className="px-2 py-0.5 bg-surface-container-high text-secondary font-label-sm text-label-sm rounded font-bold text-center leading-tight">
                  3<br />dossiers
                </span>
              </div>
              <ul className="space-y-3">
                <li className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-error mt-2 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-label-md text-label-md font-bold text-on-surface truncate">KONÉ Gnénéma</p>
                      <span className="font-code-num text-xs text-error font-bold shrink-0">Dans 7 jours</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Fin de disponibilité — Nécessite arrêté de réintégration ou radiation.</p>
                    <button type="button" data-soon="La réintégration sera lancée depuis le dossier de l'agent." className="mt-2 px-2 py-1 bg-surface-container text-primary font-label-sm text-label-sm rounded hover:bg-surface-container-high">
                      Lancer Réintégration
                    </button>
                  </div>
                </li>
                <li className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-secondary-container mt-2 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-label-md text-label-md font-bold text-on-surface truncate">KOUADIO Affoué Chantal</p>
                      <span className="font-code-num text-xs text-secondary font-bold shrink-0 text-right">Dans 42 jours</span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Renouvellement MAD CI-ENERGIES en attente d'avis de la DGPE.</p>
                    <button type="button" data-soon="La relance de la DGPE sera envoyée depuis le circuit de validation." className="mt-2 px-2 py-1 bg-surface-container text-secondary font-label-sm text-label-sm rounded hover:bg-surface-container-high">
                      Relancer DGPE
                    </button>
                  </div>
                </li>
              </ul>
            </section>
            <section className="bg-surface-container-lowest p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Positions à suivre</h2>
                <span className="px-2 py-0.5 bg-surface-container-high text-secondary font-label-sm text-label-sm rounded font-bold">
                  {speciales.length} dossier{speciales.length > 1 ? "s" : ""}
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Détachement, mise à disposition, disponibilité et hors-cadre appellent un acte : renouvellement, réintégration ou fin de mandat.
              </p>
              {speciales.length === 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface">Tous les agents du registre sont en activité.</p>
              ) : (
                <ul className="space-y-3">
                  {speciales.map((agent) => (
                    <li key={agent.matricule} className="p-3 bg-surface-container-low rounded-lg">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-label-md text-label-md font-bold text-on-surface truncate">{agent.nom_complet}</p>
                        <span className="font-code-num text-xs text-on-surface-variant shrink-0">{agent.matricule}</span>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{agent.situation} — {agent.organisme}</p>
                      <button
                        type="button"
                        onClick={() => setMatricule(agent.matricule)}
                        className="mt-2 px-2 py-1 bg-surface-container text-primary font-label-sm text-label-sm rounded hover:bg-surface-container-high"
                      >
                        Mettre à jour la situation
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
      {matricule ? <EditionAgent matricule={matricule} onClose={() => setMatricule(null)} /> : null}
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
