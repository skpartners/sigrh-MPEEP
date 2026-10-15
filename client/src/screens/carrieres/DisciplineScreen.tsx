import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { AppChrome } from "../AppChrome";
import { Icone } from "../../ui/Icone";

type Avis = "instruction" | "recevable" | "attente_reponse" | "visa_rapporteur" | "delibere" | "sanction" | "classee";
type Procedure = {
  id: number;
  reference: string;
  agent: AgentBrief & { fonction: string };
  saisine: string;
  echeance: string;
  jours_restants: number;
  grief: string;
  description: string;
  degre: number;
  rapporteur: string;
  stade: string;
  stade_detail: string;
  avis: Avis;
  avis_libelle: string;
  phase: string;
  phase_libelle: string;
  decision: string;
  sanction_nature: string;
  sanction_libelle: string;
  date_decision: string;
  executee_le: string;
};
type Teinte = "primary" | "secondary" | "error";
type DegreEchelle = {
  degre: number; rang: string; teinte: Teinte; autorite: string; intitule: string;
  description: string; pied: string; pied_valeur: string; option: string;
};
type Registre = {
  exercice: number;
  regles: { delai_jours: number; effacement_ans: number; horizon_jours: number };
  entete: { fil?: string[]; titre?: string; chapeau?: string };
  echelle: { titre?: string; reference?: string; principe?: string; degres?: DegreEchelle[] };
  registre_texte: { titre?: string; texte?: string };
  calendrier: { titre?: string; texte?: string };
  amnistie: { titre?: string; sous_titre?: string; regle?: string; texte?: string; mention?: string; vide?: string };
  indicateurs: { instruction: number; dans_les_delais: number; sanctions_premier_degre: number; avertissements: number; blames: number; sessions: number; second_degre: number };
  regularite: { taux?: number; detail?: string; controle?: string; visa?: string };
  procedures: Procedure[];
  etats_session: { code: string; libelle: string }[];
  phases: { code: string; libelle: string }[];
  avis_possibles: { code: string; libelle: string }[];
  natures_sanction: { code: string; libelle: string }[];
  sessions: { code: string; intitule: string; date: string; etat: "convoquee" | "a_confirmer" | "tenue"; etat_libelle: string; ordre_du_jour: string; description: string; composition: string[]; lieu: string }[];
  effacements: { agent: AgentBrief; nature: string; annee: number; le: string }[];
  agents: { matricule: string; nom_complet: string; organisme_sigle: string }[];
};

const TEINTE: Record<Teinte, { rang: string; autorite: string; pied: string }> = {
  primary: { rang: "text-primary", autorite: "bg-surface-container text-on-surface-variant font-medium", pied: "text-primary" },
  secondary: { rang: "text-secondary", autorite: "bg-secondary-fixed text-on-secondary-fixed-variant font-semibold", pied: "text-secondary" },
  error: { rang: "text-error", autorite: "bg-error-container text-on-error-container font-semibold", pied: "text-error" },
};

const ROUTE = "/api/v1/carrieres/discipline/";
const PAR_PAGE = 4;
const ICONE_AVIS: Record<Avis, string> = {
  instruction: "hourglass_empty",
  recevable: "verified",
  attente_reponse: "hourglass_top",
  visa_rapporteur: "done",
  delibere: "pending",
  sanction: "gavel",
  classee: "folder_off",
};
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function jourLocal(): string {
  const quand = new Date();
  return `${quand.getFullYear()}-${String(quand.getMonth() + 1).padStart(2, "0")}-${String(quand.getDate()).padStart(2, "0")}`;
}

function dateCourte(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split("-").map(Number);
  return `${String(jour).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function deuxChiffres(valeur: number | undefined): string {
  return valeur === undefined ? "—" : String(valeur).padStart(2, "0");
}

/** Procédures disciplinaires : registre, commission paritaire et effacement des sanctions. */
export function DisciplineScreen() {
  const registre = useQuery({ queryKey: ["carrieres-discipline"], queryFn: () => api<Registre>(ROUTE) });
  const [entite, setEntite] = useState("");
  const [degre, setDegre] = useState("");
  const [page, setPage] = useState(1);
  const [saisie, setSaisie] = useState(false);
  const [dossier, setDossier] = useState<Procedure | null>(null);
  const [edition, setEdition] = useState<Procedure | null>(null);
  const donnees = registre.data;
  const indicateurs = donnees?.indicateurs;
  const degres = donnees?.echelle.degres ?? [];
  const procedures = donnees?.procedures ?? [];
  const filtrees = useMemo(
    () => procedures.filter((item) => (!entite || item.agent.organisme_sigle === entite) && (!degre || (degre === "1" ? item.degre === 1 : item.degre >= 2))),
    [procedures, entite, degre],
  );
  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE));
  const pageCourante = Math.min(page, pages);
  const visibles = filtrees.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);
  const entites = [...new Set(procedures.map((item) => item.agent.organisme_sigle))].sort();

  return (
    <AppChrome>
      <div className="flex flex-col w-full">
        <div className="px-6 lg:px-8 py-6 space-y-8 mx-auto w-full">
          <section className="bg-surface-container-lowest p-6 rounded-xl relative overflow-hidden flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 motion-rise">
            <div className="space-y-1.5">
              <nav className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {(donnees?.entete.fil ?? []).map((etape, index, fil) => (
                  <Fragment key={etape}>
                    {index > 0 ? <Icone nom="chevron_right" className="text-xs" /> : null}
                    <span className={index === fil.length - 1 ? "text-primary font-bold" : undefined}>{etape}</span>
                  </Fragment>
                ))}
              </nav>
              <div className="flex flex-wrap items-baseline gap-3">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{donnees?.entete.titre}</h1>
                {donnees?.exercice ? (
                  <span className="px-2.5 py-0.5 rounded bg-primary-container text-on-primary font-label-sm text-label-sm uppercase font-semibold tracking-wider">
                    Exercice {donnees.exercice}
                  </span>
                ) : null}
              </div>
              {donnees?.entete.chapeau ? (
                <p className="font-body-md text-body-md text-on-surface-variant max-w-4xl">{donnees.entete.chapeau}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-colors" type="button" onClick={() => setSaisie(true)}>
                <Icone nom="add_moderator" className="text-lg" />
                <span>Saisir une sanction</span>
              </button>
            </div>
          </section>
          {/* Indicateurs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Indicateur index={0} titre="Dossiers en instruction" icone="pending_actions" liseret="bg-secondary-container" teinte="text-secondary" valeur={deuxChiffres(indicateurs?.instruction)} />
            <Indicateur index={1} titre={`Sanctions du 1er degré (${donnees?.exercice ?? ""})`} icone="assignment_late" liseret="bg-primary" teinte="text-primary" valeur={deuxChiffres(indicateurs?.sanctions_premier_degre)} />
            <Indicateur index={2} titre="Sessions paritaires à venir" icone="groups" liseret="bg-secondary" teinte="text-secondary" valeur={deuxChiffres(indicateurs?.sessions)} />
            <Indicateur index={3} titre="Procédures dans les délais" icone="fact_check" liseret="bg-primary-container" teinte="text-primary" valeur={donnees?.regularite.taux != null ? `${donnees.regularite.taux}%` : "—"} valeurCouleur="text-primary" />
          </div>
          {donnees?.echelle.titre ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-surface-container-low text-primary flex items-center justify-center font-bold">
                    <Icone nom="balance" className="text-xl" />
                  </div>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{donnees.echelle.titre}</h2>
                    {donnees.echelle.reference ? <p className="font-label-sm text-label-sm text-on-surface-variant">{donnees.echelle.reference}</p> : null}
                  </div>
                </div>
                {donnees.echelle.principe ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container text-on-surface rounded font-label-sm text-label-sm font-semibold">
                    <Icone nom="info" className="text-sm text-secondary" />
                    {donnees.echelle.principe}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {degres.map((degre) => {
                  const teinte = TEINTE[degre.teinte] ?? TEINTE.primary;
                  return (
                    <div key={degre.degre} className="p-4 bg-surface-container-low/70 rounded flex flex-col justify-between space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-label-sm text-label-sm font-bold uppercase tracking-wider ${teinte.rang}`}>{degre.rang}</span>
                          <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm ${teinte.autorite}`}>{degre.autorite}</span>
                        </div>
                        <h3 className="font-label-lg text-label-lg text-on-surface font-bold">{degre.intitule}</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">{degre.description}</p>
                      </div>
                      <div className="pt-2 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                        <span>{degre.pied}</span>
                        <span className={`font-code-num font-semibold ${teinte.pied}`}>{degre.pied_valeur}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {/* Registre des procédures */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm flex flex-col overflow-hidden">
            <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{donnees?.registre_texte.titre}</h2>
                  <span className="px-2 py-0.5 rounded bg-surface-container font-code-num text-code-num font-bold text-primary">{indicateurs?.instruction ?? 0} ACTIFS</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{donnees?.registre_texte.texte}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Icone nom="filter_list" className="absolute left-3 top-2.5 text-on-surface-variant text-base pointer-events-none" />
                  <select aria-label="Filtrer par entité" className="pl-9 pr-8 py-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none focus:bg-surface-container" value={entite} onChange={(event) => { setEntite(event.target.value); setPage(1); }}>
                    <option value="">Toutes les entités</option>
                    {entites.map((sigle) => (
                      <option key={sigle} value={sigle}>{sigle}</option>
                    ))}
                  </select>
                </div>
                <select aria-label="Filtrer par degré de sanction" className="px-3 py-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded focus:outline-none" value={degre} onChange={(event) => { setDegre(event.target.value); setPage(1); }}>
                  <option value="">Tous degrés confondus</option>
                  <option value="1">1er degré</option>
                  <option value="2">2nd degré et plus (conseil convoqué)</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md tracking-wider uppercase">
                    <th className="py-3 px-6 font-semibold">Procédure</th>
                    <th className="py-3 px-6 font-semibold">Agent</th>
                    <th className="py-3 px-6 font-semibold">Grief</th>
                    <th className="py-3 px-6 font-semibold">Phase</th>
                    <th className="py-3 px-6 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="text-on-surface font-body-sm text-body-sm">
                  {registre.isPending ? (
                    <tr>
                      <td colSpan={5} className="py-4 px-6"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ) : registre.isError ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-error">Le registre disciplinaire n'a pas pu être chargé.</td>
                    </tr>
                  ) : visibles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-on-surface-variant">Aucune procédure ne correspond à ces filtres.</td>
                    </tr>
                  ) : (
                    visibles.map((item) => <LigneProcedure key={item.id} procedure={item} onOuvrir={() => setDossier(item)} onModifier={() => setEdition(item)} />)
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-3 font-label-sm text-label-sm text-on-surface-variant">
              <span>
                {filtrees.length ? `Affichage de ${visibles.length} sur ${filtrees.length} procédure${filtrees.length > 1 ? "s" : ""} • année ${donnees?.exercice ?? ""}` : "Aucune procédure affichée"}
              </span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded bg-surface-container-lowest text-on-surface shadow-sm font-semibold hover:bg-surface transition-colors disabled:opacity-50" type="button" disabled={pageCourante <= 1} onClick={() => setPage(pageCourante - 1)}>Précédent</button>
                {Array.from({ length: pages }, (_, index) => index + 1).map((numero) => (
                  <button key={numero} type="button" aria-current={numero === pageCourante ? "page" : undefined} className={`px-3 py-1.5 rounded font-semibold ${numero === pageCourante ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface"}`} onClick={() => setPage(numero)}>
                    {numero}
                  </button>
                ))}
                <button className="px-3 py-1.5 rounded bg-surface-container-lowest text-on-surface shadow-sm font-semibold hover:bg-surface transition-colors disabled:opacity-50" type="button" disabled={pageCourante >= pages} onClick={() => setPage(pageCourante + 1)}>Suivant</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {saisie ? <SaisineCommission agents={donnees?.agents ?? []} degres={degres} onClose={() => setSaisie(false)} /> : null}
      {edition && donnees ? <ModifierProcedure procedure={edition} registre={donnees} onClose={() => setEdition(null)} /> : null}
      {dossier ? <DossierInstruction procedure={dossier} onClose={() => setDossier(null)} /> : null}
    </AppChrome>
  );
}

function Indicateur({ titre, icone, liseret, teinte, valeur, valeurCouleur = "text-on-surface", index = 0 }: {
  titre: string; icone: string; liseret: string; teinte: string; valeur: string; valeurCouleur?: string; index?: number;
}) {
  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden motion-card-appear" style={{ "--delay": `${index * 80}ms` } as CSSProperties}>
      <div className={`absolute top-0 left-0 w-1.5 h-full ${liseret}`} />
      <div className="flex items-start justify-between gap-2">
        <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider font-semibold">{titre}</span>
        <span className={`w-8 h-8 rounded bg-surface-container-low flex items-center justify-center shrink-0 ${teinte}`}>
          <Icone nom={icone} className="text-lg" />
        </span>
      </div>
      <div className="mt-4">
        <span className={`font-code-num text-3xl font-bold ${valeurCouleur}`}>{valeur}</span>
      </div>
    </div>
  );
}

function convocationDe(procedure: Procedure): Promise<void> {
  return telecharger(`${ROUTE}${procedure.id}/convocation/`, `convocation-${procedure.reference}.pdf`);
}

function LigneProcedure({ procedure, onOuvrir, onModifier }: { procedure: Procedure; onOuvrir: () => void; onModifier: () => void }) {
  const feedback = useFeedback();
  const client = useQueryClient();
  const supprimer = useMutation({
    mutationFn: () => api(`${ROUTE}${procedure.id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-discipline"] });
      feedback.toast("Procédure supprimée", procedure.reference);
    },
    onError: (erreur) => feedback.toast("Suppression impossible", erreur instanceof ApiError ? erreur.message : undefined, "error"),
  });
  async function retirer() {
    if (await feedback.confirm(`Supprimer la procédure ${procedure.reference} ?`, { message: "Elle disparaît aussi du profil de l'agent, avec la sanction qu'elle a produite.", confirmLabel: "Supprimer" })) supprimer.mutate();
  }
  const { agent } = procedure;
  const close = procedure.avis === "sanction" || procedure.avis === "classee";
  return (
    <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-6 align-top">
        <span className="block font-code-num text-code-num text-primary font-bold">{procedure.reference}</span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{dateCourte(procedure.saisine)}</span>
      </td>
      <td className="py-3 px-6 align-top">
        <span className="block font-label-lg text-label-lg font-semibold text-on-surface leading-tight">{agent.nom_complet}</span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">{agent.organisme_sigle}</span>
      </td>
      <td className="py-3 px-6 align-top">
        <span className="block text-on-surface">{procedure.grief}</span>
        <span className={`mt-1 inline-block px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${procedure.degre >= 2 ? "bg-error-container text-on-error-container" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
          {procedure.degre}{procedure.degre === 1 ? "er" : "e"} degré
        </span>
      </td>
      <td className="py-3 px-6 align-top">
        <span className="block font-label-md text-label-md font-semibold text-on-surface">{procedure.phase_libelle}</span>
        <span className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${close ? "bg-surface-container-high text-on-surface" : "bg-secondary-fixed text-on-secondary-fixed-variant"}`}>
          <Icone nom={ICONE_AVIS[procedure.avis]} className="text-xs" />
          {procedure.avis_libelle}
        </span>
      </td>
      <td className="py-3 px-6 align-top text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded transition-colors" title="Consulter le dossier d'instruction" aria-label={`Consulter le dossier ${procedure.reference}`} type="button" onClick={onOuvrir}>
            <Icone nom="folder_open" className="text-lg" />
          </button>
          <button className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded transition-colors" title="Modifier la procédure" aria-label={`Modifier la procédure ${procedure.reference}`} type="button" onClick={onModifier}>
            <Icone nom="edit" className="text-lg" />
          </button>
          <button className="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container rounded transition-colors disabled:opacity-50" title="Supprimer la procédure" aria-label={`Supprimer la procédure ${procedure.reference}`} type="button" disabled={supprimer.isPending} onClick={() => void retirer()}>
            <Icone nom="delete" className="text-lg" />
          </button>
          <button className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded transition-colors" title="Générer la convocation" aria-label={`Générer la convocation ${procedure.reference}`} type="button" onClick={() => void feedback.run("Préparation de la convocation…", () => convocationDe(procedure), { success: { title: "Convocation prête", message: procedure.reference }, error: "La convocation n'a pas été générée." })}>
            <Icone nom="mark_email_read" className="text-lg" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DossierInstruction({ procedure, onClose }: { procedure: Procedure; onClose: () => void }) {
  const feedback = useFeedback();
  const { agent } = procedure;
  const faits = [
    ["Agent", `${agent.nom_complet} · ${agent.matricule}`],
    ["Entité", `${agent.organisme_sigle}${agent.fonction ? ` · ${agent.fonction}` : ""}`],
    ["Grief", procedure.grief],
    ["Degré", `${procedure.degre}${procedure.degre === 1 ? "er" : "e"} degré`],
    ["Rapporteur", procedure.rapporteur],
    ["Saisine", dateCourte(procedure.saisine)],
    ["Échéance", dateCourte(procedure.echeance)],
    ["Phase", procedure.stade_detail ? `${procedure.phase_libelle} — ${procedure.stade_detail}` : procedure.phase_libelle],
    ["Avis", procedure.avis_libelle],
    ...(procedure.decision ? [
      ["Décision", `${procedure.decision}${procedure.sanction_libelle ? ` (${procedure.sanction_libelle})` : ""} · ${dateCourte(procedure.date_decision)}`],
      ["Exécution", procedure.executee_le ? dateCourte(procedure.executee_le) : "Non exécutée"],
    ] : []),
  ];
  return (
    <Modale
      titre={procedure.reference}
      sousTitre="Dossier d'instruction"
      icone="folder_open"
      taille="lg"
      onClose={onClose}
      pied={(
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => void feedback.run("Préparation de la convocation…", () => convocationDe(procedure), { success: { title: "Convocation prête", message: procedure.reference }, error: "La convocation n'a pas été générée." })}>
            <Icone nom="mark_email_read" className="text-lg" />
            Générer la convocation
          </button>
        </>
      )}
    >
      <dl className="space-y-3">
        {faits.map(([libelle, valeur]) => (
          <div key={libelle} className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-1 sm:gap-3">
            <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">{libelle}</dt>
            <dd className="font-body-sm text-body-sm text-on-surface">{valeur}</dd>
          </div>
        ))}
        <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-1 sm:gap-3">
          <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">Faits reprochés</dt>
          <dd className="font-body-sm text-body-sm text-on-surface whitespace-pre-wrap">{procedure.description}</dd>
        </div>
      </dl>
    </Modale>
  );
}

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";

/** Saisir une sanction : la procédure s'ouvre en instruction, avec son rapporteur et un délai de 30 jours. */
function SaisineCommission({ agents, degres, onClose }: { agents: Registre["agents"]; degres: DegreEchelle[]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ matricule: "", grief: "", description: "", degre: "1", rapporteur: "" });
  const envoi = useMutation({
    mutationFn: () => api<Procedure>(ROUTE, { method: "POST", body: JSON.stringify({ ...saisie, degre: Number(saisie.degre) }) }),
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ["carrieres-discipline"] });
      feedback.toast("Sanction saisie", `${item.reference} · ${item.agent.nom_complet}`);
      onClose();
    },
  });
  const rapporteurs = agents.filter((agent) => agent.matricule !== saisie.matricule);
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => {
    const valeur = event.target.value;
    setSaisie({
      ...saisie,
      [cle]: valeur,
      ...(cle === "matricule" && valeur === saisie.rapporteur ? { rapporteur: "" } : {}),
    });
  };
  return (
    <Modale
      titre="Saisir une sanction"
      sousTitre="La procédure s'ouvre en instruction : l'agent dispose de 30 jours pour le contradictoire."
      icone="add_moderator"
      taille="lg"
      onClose={onClose}
      onSubmit={() => envoi.mutate()}
      libelleValider="Ouvrir la procédure"
      enCours={envoi.isPending}
      erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.isError ? "La procédure n'a pas été ouverte." : undefined}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className={LIBELLE}>Agent mis en cause <span className="text-error">*</span></span>
            <select className={CHAMP} required value={saisie.matricule} onChange={champ("matricule")}>
              <option value="">Choisir un agent…</option>
              {agents.map((agent) => (
                <option key={agent.matricule} value={agent.matricule}>{agent.nom_complet} · {agent.organisme_sigle}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LIBELLE}>Degré de sanction encouru <span className="text-error">*</span></span>
            <select className={CHAMP} value={saisie.degre} onChange={champ("degre")}>
              {degres.map((degre) => (
                <option key={degre.degre} value={degre.degre}>{degre.option}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={LIBELLE}>Nature du grief <span className="text-error">*</span></span>
          <input className={CHAMP} required maxLength={160} value={saisie.grief} onChange={champ("grief")} placeholder="Ex. : manquement au devoir de réserve" />
        </label>
        <label className="block">
          <span className={LIBELLE}>Faits reprochés <span className="text-error">*</span></span>
          <textarea className={`${CHAMP} h-auto py-2`} required rows={3} value={saisie.description} onChange={champ("description")} />
        </label>
        <label className="block">
          <span className={LIBELLE}>Rapporteur désigné <span className="text-error">*</span></span>
          <select className={CHAMP} required value={saisie.rapporteur} onChange={champ("rapporteur")}>
            <option value="">Choisir un rapporteur…</option>
            {rapporteurs.map((agent) => (
              <option key={agent.matricule} value={agent.matricule}>{agent.nom_complet} · {agent.organisme_sigle}</option>
            ))}
          </select>
        </label>
      </div>
    </Modale>
  );
}

/** Fait avancer la procédure : demande d'explication, instruction devant le conseil, décision et exécution. */
function ModifierProcedure({ procedure, registre, onClose }: { procedure: Procedure; registre: Registre; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    phase: procedure.phase,
    grief: procedure.grief,
    description: procedure.description,
    degre: String(procedure.degre),
    rapporteur: "",
    stade_detail: procedure.stade_detail,
    avis: registre.avis_possibles.some((a) => a.code === procedure.avis) ? procedure.avis : "",
    decision: procedure.decision,
    sanction_nature: procedure.sanction_nature,
    date_decision: procedure.date_decision,
    executee_le: procedure.executee_le,
  });
  const decision = saisie.phase === "decision_execution";
  const envoi = useMutation({
    mutationFn: () => api<Procedure>(`${ROUTE}${procedure.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ ...saisie, degre: Number(saisie.degre), rapporteur: saisie.rapporteur || undefined, avis: saisie.avis || undefined }),
    }),
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ["carrieres-discipline"] });
      feedback.toast("Procédure mise à jour", `${item.reference} · ${item.phase_libelle}`);
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  const degres = registre.echelle.degres ?? [];
  return (
    <Modale
      titre={`Modifier ${procedure.reference}`}
      sousTitre={`${procedure.agent.nom_complet} · l'agent suit ces étapes depuis son profil`}
      icone="edit"
      taille="lg"
      onClose={onClose}
      onSubmit={() => envoi.mutate()}
      enCours={envoi.isPending}
      erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.isError ? "La procédure n'a pas été mise à jour." : undefined}
    >
      <div className="space-y-4">
        <label className="block">
          <span className={LIBELLE}>Phase de la procédure</span>
          <select className={CHAMP} value={saisie.phase} onChange={champ("phase")}>
            {registre.phases.map((phase) => <option key={phase.code} value={phase.code}>{phase.libelle}</option>)}
          </select>
        </label>
        {decision ? (
          <div className="space-y-4 rounded-lg bg-surface-container-low p-4">
            <label className="block">
              <span className={LIBELLE}>Sanction prononcée</span>
              <select className={CHAMP} value={saisie.sanction_nature} onChange={champ("sanction_nature")}>
                <option value="">Aucune (classement sans suite)</option>
                {registre.natures_sanction.map((nature) => <option key={nature.code} value={nature.code}>{nature.libelle}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LIBELLE}>Décision <span className="text-error">*</span></span>
              <input className={CHAMP} required maxLength={240} value={saisie.decision} onChange={champ("decision")} placeholder="Ex. : blâme notifié par arrêté n°…" />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block">
                <span className={LIBELLE}>Date de la décision <span className="text-error">*</span></span>
                <input className={CHAMP} required type="date" max={jourLocal()} value={saisie.date_decision} onChange={champ("date_decision")} />
              </label>
              <label className="block">
                <span className={LIBELLE}>Date d'exécution</span>
                <input className={CHAMP} type="date" min={saisie.date_decision || undefined} value={saisie.executee_le} onChange={champ("executee_le")} />
              </label>
            </div>
          </div>
        ) : (
          <label className="block">
            <span className={LIBELLE}>Avis</span>
            <select className={CHAMP} value={saisie.avis} onChange={champ("avis")}>
              <option value="">Selon la phase</option>
              {registre.avis_possibles.map((avis) => <option key={avis.code} value={avis.code}>{avis.libelle}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className={LIBELLE}>Précision sur l'étape</span>
          <input className={CHAMP} maxLength={160} value={saisie.stade_detail} onChange={champ("stade_detail")} placeholder="Ex. : réponse attendue avant le…" />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className={LIBELLE}>Degré de sanction encouru</span>
            <select className={CHAMP} value={saisie.degre} onChange={champ("degre")}>
              {degres.map((degre) => <option key={degre.degre} value={degre.degre}>{degre.option}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={LIBELLE}>Rapporteur (actuel : {procedure.rapporteur})</span>
            <select className={CHAMP} value={saisie.rapporteur} onChange={champ("rapporteur")}>
              <option value="">Conserver</option>
              {registre.agents.filter((agent) => agent.matricule !== procedure.agent.matricule).map((agent) => (
                <option key={agent.matricule} value={agent.matricule}>{agent.nom_complet} · {agent.organisme_sigle}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={LIBELLE}>Nature du grief <span className="text-error">*</span></span>
          <input className={CHAMP} required maxLength={160} value={saisie.grief} onChange={champ("grief")} />
        </label>
        <label className="block">
          <span className={LIBELLE}>Faits reprochés <span className="text-error">*</span></span>
          <textarea className={`${CHAMP} h-auto py-2`} required rows={3} value={saisie.description} onChange={champ("description")} />
        </label>
      </div>
    </Modale>
  );
}
