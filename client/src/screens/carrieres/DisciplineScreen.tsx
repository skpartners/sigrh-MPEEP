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
  suivi: { titre?: string; texte?: string };
  indicateurs: { instruction: number; dans_les_delais: number; sanctions_premier_degre: number; avertissements: number; blames: number; sessions: number; second_degre: number };
  regularite: { taux?: number; detail?: string; controle?: string; visa?: string };
  procedures: Procedure[];
  etats_session: { code: string; libelle: string }[];
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
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function jourLocal(): string {
  const quand = new Date();
  return `${quand.getFullYear()}-${String(quand.getMonth() + 1).padStart(2, "0")}-${String(quand.getDate()).padStart(2, "0")}`;
}

function dateCourte(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split("-").map(Number);
  return `${String(jour).padStart(2, "0")} ${MOIS[mois - 1]} ${annee}`;
}

function dateSeance(iso: string): string {
  const quand = new Date(iso);
  return `${JOURS[quand.getDay()]} ${dateCourte(iso)} • ${String(quand.getHours()).padStart(2, "0")}:${String(quand.getMinutes()).padStart(2, "0")}`;
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
  const [seance, setSeance] = useState(false);
  const donnees = registre.data;
  const indicateurs = donnees?.indicateurs;
  const delai = donnees?.regles.delai_jours ?? 30;
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
  const prochaine = donnees?.sessions[0];

  return (
    <AppChrome>
      <div className="flex flex-col w-full">
        <div className="px-6 lg:px-8 py-6 space-y-8 mx-auto w-full">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 motion-rise">
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
                <span>Saisir la commission paritaire</span>
              </button>
            </div>
          </div>
          {/* Indicateurs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Indicateur index={0} titre="Dossiers en instruction" icone="pending_actions" liseret="bg-secondary-container" teinte="text-secondary" valeur={deuxChiffres(indicateurs?.instruction)} legende="Phase contradictoire active" legendeCouleur="text-secondary font-semibold" pied={`Délai d'instruction de ${delai} jours`} piedValeur={indicateurs ? `${indicateurs.dans_les_delais} dans les délais` : "—"} piedCouleur="text-primary" />
            <Indicateur index={1} titre={`Sanctions du 1er degré (${donnees?.exercice ?? ""})`} icone="assignment_late" liseret="bg-primary" teinte="text-primary" valeur={deuxChiffres(indicateurs?.sanctions_premier_degre)} legende="Actes notifiés" pied={indicateurs ? `${indicateurs.avertissements} avertissement${indicateurs.avertissements > 1 ? "s" : ""} • ${indicateurs.blames} blâme${indicateurs.blames > 1 ? "s" : ""}` : "—"} piedValeur="Notifiés RH" piedCouleur="text-on-surface" />
            <Indicateur index={2} titre="Sessions paritaires à venir" icone="groups" liseret="bg-secondary" teinte="text-secondary" valeur={deuxChiffres(indicateurs?.sessions)} legende={prochaine ? `Prochaine : ${dateCourte(prochaine.date)}` : "Aucune session fixée"} legendeCouleur="text-secondary font-semibold" pied="Dossiers du 2nd degré" piedValeur={indicateurs ? String(indicateurs.second_degre) : "—"} piedCouleur="text-secondary" />
            <Indicateur index={3} titre="Régularité & contradictoire" icone="fact_check" liseret="bg-primary-container" teinte="text-primary" valeur={donnees?.regularite.taux != null ? `${donnees.regularite.taux}%` : "—"} valeurCouleur="text-primary" legende={donnees?.regularite.detail ?? ""} pied={donnees?.regularite.controle ?? ""} piedValeur={donnees?.regularite.visa ?? ""} piedCouleur="text-primary" />
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
                    <th className="py-3.5 px-6 font-semibold">Réf. procédure</th>
                    <th className="py-3.5 px-6 font-semibold">Agent mis en cause & société</th>
                    <th className="py-3.5 px-6 font-semibold">Nature du grief</th>
                    <th className="py-3.5 px-6 font-semibold">Rapporteur & délais ({delai} j)</th>
                    <th className="py-3.5 px-6 font-semibold" data-min="">Stade du contradictoire</th>
                    <th className="py-3.5 px-6 font-semibold">Avis</th>
                    <th className="py-3.5 px-6 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-on-surface font-body-sm text-body-sm">
                  {registre.isPending ? (
                    <tr>
                      <td colSpan={7} className="py-4 px-6"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ) : registre.isError ? (
                    <tr>
                      <td colSpan={7} className="py-6 px-6 text-error">Le registre disciplinaire n'a pas pu être chargé.</td>
                    </tr>
                  ) : visibles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 px-6 text-on-surface-variant">Aucune procédure ne correspond à ces filtres.</td>
                    </tr>
                  ) : (
                    visibles.map((item) => <LigneProcedure key={item.id} procedure={item} delai={delai} onOuvrir={() => setDossier(item)} />)
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
          {/* Sessions paritaires et effacements */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-surface-container-low text-primary flex items-center justify-center font-bold">
                    <Icone nom="event_available" className="text-xl" />
                  </div>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{donnees?.calendrier.titre}</h2>
                    {donnees?.calendrier.texte ? <p className="font-label-sm text-label-sm text-on-surface-variant">{donnees.calendrier.texte}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {prochaine?.lieu ? <span className="px-2.5 py-1 bg-surface-container text-on-surface rounded font-code-num text-code-num font-semibold">{prochaine.lieu}</span> : null}
                  <button className="inline-flex items-center gap-2 px-3 py-2 rounded bg-primary text-on-primary font-label-md text-label-md font-semibold hover:bg-primary-container transition-colors" type="button" onClick={() => setSeance(true)}>
                    <Icone nom="event" className="text-lg" />
                    Fixer une session
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                {(donnees?.sessions ?? []).length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune session n'est fixée.</p>
                ) : (
                  donnees?.sessions.map((session) => (
                    <div key={session.code} className="p-4 bg-surface-container-low rounded-lg space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold uppercase ${session.etat === "convoquee" ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>
                            {session.intitule} {session.code}
                          </span>
                          <span className="font-label-md text-label-md text-on-surface font-bold">{dateSeance(session.date)}</span>
                        </div>
                        <span className={`font-code-num text-label-sm font-bold ${session.etat === "convoquee" ? "text-secondary" : "text-on-surface-variant"}`}>{session.etat_libelle}</span>
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-label-md text-label-md text-on-surface font-semibold">Ordre du jour : {session.ordre_du_jour}</p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{session.description}</p>
                      </div>
                      {session.composition.length ? (
                        <div className="pt-2 flex flex-wrap items-center gap-2 font-label-sm text-label-sm">
                          <span className="text-on-surface-variant font-medium">Composition :</span>
                          {session.composition.map((membre, index) => (
                            <span key={membre} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-lowest text-on-surface font-semibold">
                              <Icone nom={index === 0 ? "how_to_reg" : "badge"} className={`text-xs ${index === 0 ? "text-primary" : "text-secondary"}`} />
                              {membre}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-6 flex flex-col">
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-2">
                  <div className="w-9 h-9 rounded bg-surface-container-low text-primary flex items-center justify-center font-bold">
                    <Icone nom="auto_fix_high" className="text-xl" />
                  </div>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{donnees?.amnistie.titre}</h2>
                    {donnees?.amnistie.sous_titre ? <p className="font-label-sm text-label-sm text-on-surface-variant">{donnees.amnistie.sous_titre}</p> : null}
                  </div>
                </div>
                <div className="p-3.5 bg-surface-container-low rounded space-y-1.5 text-on-surface">
                  <div className="flex items-center gap-2">
                    <Icone nom="verified" className="text-primary text-base" />
                    <span className="font-label-sm text-label-sm font-bold uppercase tracking-wide">{donnees?.amnistie.regle}</span>
                  </div>
                  {donnees?.amnistie.texte ? (
                    <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{donnees.amnistie.texte}</p>
                  ) : null}
                </div>
                <div className="space-y-2.5">
                  <span className="font-label-md text-label-md text-on-surface font-bold">Prochaines échéances d'effacement :</span>
                  {(donnees?.effacements ?? []).length === 0 ? (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{donnees?.amnistie.vide}</p>
                  ) : (
                    donnees?.effacements.map((item) => (
                      <div key={`${item.agent.matricule}-${item.le}`} className="p-3 bg-surface-container-low/60 rounded flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-label-md text-label-md font-semibold text-on-surface">{item.agent.nom_complet}</p>
                          <p className="font-code-num text-label-sm text-on-surface-variant">{item.nature} {item.annee} • Mat. {item.agent.matricule}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="inline-block px-2 py-0.5 rounded bg-surface-container text-primary font-code-num text-label-sm font-bold">Effacement le {dateCourte(item.le)}</span>
                          {donnees?.amnistie.mention ? <span className="block font-label-sm text-label-sm text-on-surface-variant mt-0.5">{donnees.amnistie.mention}</span> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
          {donnees?.suivi.titre ? (
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-surface-container-low text-primary flex items-center justify-center shrink-0">
                  <Icone nom="security" className="text-2xl" />
                </div>
                <div className="space-y-0.5">
                  <p className="font-label-md text-label-md text-on-surface font-bold uppercase tracking-wide">{donnees.suivi.titre}</p>
                  {donnees.suivi.texte ? <p className="font-body-sm text-body-sm text-on-surface-variant">{donnees.suivi.texte}</p> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {saisie ? <SaisineCommission agents={donnees?.agents ?? []} degres={degres} onClose={() => setSaisie(false)} /> : null}
      {dossier ? <DossierInstruction procedure={dossier} onClose={() => setDossier(null)} /> : null}
      {seance ? <FixerSession agents={donnees?.agents ?? []} etats={donnees?.etats_session ?? []} onClose={() => setSeance(false)} /> : null}
    </AppChrome>
  );
}

function Indicateur({ titre, icone, liseret, teinte, valeur, valeurCouleur = "text-on-surface", legende, legendeCouleur = "text-on-surface-variant", pied, piedValeur, piedCouleur, index = 0 }: {
  titre: string; icone: string; liseret: string; teinte: string; valeur: string; valeurCouleur?: string; legende: string; legendeCouleur?: string; pied: string; piedValeur: string; piedCouleur: string; index?: number;
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
      <div className="mt-4 flex items-baseline gap-3">
        <span className={`font-code-num text-3xl font-bold ${valeurCouleur}`}>{valeur}</span>
        <span className={`font-label-sm text-label-sm ${legendeCouleur}`}>{legende}</span>
      </div>
      <div className="mt-3 pt-3 flex items-center justify-between gap-2 text-on-surface-variant font-label-sm text-label-sm bg-surface-container-low/60 -mx-5 -mb-5 px-5 py-2">
        <span>{pied}</span>
        <span className={`font-code-num font-bold ${piedCouleur}`}>{piedValeur}</span>
      </div>
    </div>
  );
}

function convocationDe(procedure: Procedure): Promise<void> {
  return telecharger(`${ROUTE}${procedure.id}/convocation/`, `convocation-${procedure.reference}.pdf`);
}

function LigneProcedure({ procedure, delai, onOuvrir }: { procedure: Procedure; delai: number; onOuvrir: () => void }) {
  const feedback = useFeedback();
  const { agent } = procedure;
  const restant = procedure.jours_restants;
  const ecoule = Math.min(100, Math.max(0, ((delai - restant) / Math.max(delai, 1)) * 100));
  const close = procedure.avis === "sanction" || procedure.avis === "classee";
  return (
    <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-4 px-6 align-top">
        <div className="flex flex-col">
          <span className="font-code-num text-code-num text-primary font-bold">{procedure.reference}</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Saisine : {dateCourte(procedure.saisine)}</span>
        </div>
      </td>
      <td className="py-4 px-6 align-top">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-surface-container text-primary flex items-center justify-center font-bold text-xs shrink-0">{agent.initiales}</div>
          <div className="min-w-0">
            <p className="font-label-lg text-label-lg font-semibold text-on-surface leading-tight">{agent.nom_complet}</p>
            <p className="font-code-num text-label-sm text-on-surface-variant">Mat. {agent.matricule}</p>
            <span className="inline-block mt-1 px-1.5 py-0.5 bg-surface-container font-label-sm text-label-sm text-primary rounded font-semibold">{agent.organisme_sigle}</span>
          </div>
        </div>
      </td>
      <td className="py-4 px-6 align-top">
        <div className="space-y-1">
          <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold inline-block ${procedure.degre >= 2 ? "bg-error-container text-on-error-container" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
            {procedure.grief} · {procedure.degre}{procedure.degre === 1 ? "er" : "e"} degré
          </span>
          <p className="text-on-surface-variant text-xs line-clamp-2">{procedure.description}</p>
        </div>
      </td>
      <td className="py-4 px-6 align-top">
        <div className="space-y-1">
          <p className="font-label-md text-label-md text-on-surface font-medium">{procedure.rapporteur}</p>
          {close ? (
            <span className="font-label-sm text-label-sm text-on-surface-variant">Instruction close</span>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-20 bg-surface-container h-1.5 rounded-full overflow-hidden">
                <div className={`motion-fill h-full ${restant < 7 ? "bg-error" : "bg-secondary-container"}`} style={{ width: `${ecoule}%` }} />
              </div>
              <span className={`font-code-num text-label-sm font-bold ${restant < 0 ? "text-error" : "text-secondary"}`}>{restant >= 0 ? `J - ${restant}` : `Dépassé de ${-restant} j`}</span>
            </div>
          )}
        </div>
      </td>
      <td className="py-4 px-6 align-top">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
          <span className="font-label-sm text-label-sm font-semibold text-on-surface">{procedure.stade}</span>
        </div>
        {procedure.stade_detail ? <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">{procedure.stade_detail}</p> : null}
      </td>
      <td className="py-4 px-6 align-top">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${close ? "bg-surface-container-high text-on-surface" : "bg-secondary-fixed text-on-secondary-fixed-variant"}`}>
          <Icone nom={ICONE_AVIS[procedure.avis]} className="text-xs" />
          {procedure.avis_libelle}
        </span>
      </td>
      <td className="py-4 px-6 align-top text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded transition-colors" title="Consulter le dossier d'instruction" aria-label={`Consulter le dossier ${procedure.reference}`} type="button" onClick={onOuvrir}>
            <Icone nom="folder_open" className="text-lg" />
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
    ["Stade", procedure.stade_detail ? `${procedure.stade} — ${procedure.stade_detail}` : procedure.stade],
    ["Avis", procedure.avis_libelle],
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

type SeanceCreee = { code: string; intitule: string };

/** Inscrit une séance à venir : date, lieu, ordre du jour et membres choisis parmi les agents. */
function FixerSession({ agents, etats, onClose }: { agents: Registre["agents"]; etats: Registre["etats_session"]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ intitule: "", date: "", heure: "09:30", lieu: "", etat: "a_confirmer", ordre_du_jour: "", description: "" });
  const [membres, setMembres] = useState<string[]>([]);
  const envoi = useMutation({
    mutationFn: () => api<SeanceCreee>("/api/v1/carrieres/discipline/sessions/", { method: "POST", body: JSON.stringify({ ...saisie, composition: membres }) }),
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ["carrieres-discipline"] });
      feedback.toast("Session fixée", `${item.intitule} · ${item.code}`);
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  const restants = agents.filter((agent) => !membres.includes(agent.matricule));
  return (
    <Modale
      titre="Fixer une session paritaire"
      sousTitre="La séance est inscrite au calendrier de la commission."
      icone="event"
      taille="lg"
      onClose={onClose}
      onSubmit={() => envoi.mutate()}
      libelleValider="Inscrire la séance"
      enCours={envoi.isPending}
      erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.isError ? "La séance n'a pas été inscrite." : undefined}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className={LIBELLE}>Intitulé <span className="text-error">*</span></span>
            <input className={CHAMP} required maxLength={120} value={saisie.intitule} onChange={champ("intitule")} placeholder="Session ordinaire" />
          </label>
          <label className="block">
            <span className={LIBELLE}>État</span>
            <select className={CHAMP} value={saisie.etat} onChange={champ("etat")}>
              {etats.map((etat) => (
                <option key={etat.code} value={etat.code}>{etat.libelle}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className={LIBELLE}>Date <span className="text-error">*</span></span>
            <input className={CHAMP} required type="date" min={jourLocal()} value={saisie.date} onChange={champ("date")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Heure <span className="text-error">*</span></span>
            <input className={CHAMP} required type="time" value={saisie.heure} onChange={champ("heure")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Lieu</span>
            <input className={CHAMP} maxLength={120} value={saisie.lieu} onChange={champ("lieu")} placeholder="Salle du conseil" />
          </label>
        </div>
        <label className="block">
          <span className={LIBELLE}>Ordre du jour <span className="text-error">*</span></span>
          <input className={CHAMP} required maxLength={240} value={saisie.ordre_du_jour} onChange={champ("ordre_du_jour")} />
        </label>
        <label className="block">
          <span className={LIBELLE}>Précisions</span>
          <textarea className={`${CHAMP} h-auto py-2`} rows={3} value={saisie.description} onChange={champ("description")} />
        </label>
        <div className="space-y-2">
          <label className="block">
            <span className={LIBELLE}>Composition</span>
            <select className={CHAMP} value="" onChange={(event) => { if (event.target.value) setMembres([...membres, event.target.value]); }}>
              <option value="">Ajouter un membre…</option>
              {restants.map((agent) => (
                <option key={agent.matricule} value={agent.matricule}>{agent.nom_complet} · {agent.organisme_sigle}</option>
              ))}
            </select>
          </label>
          {membres.length ? (
            <div className="flex flex-wrap gap-2">
              {membres.map((matricule) => {
                const agent = agents.find((item) => item.matricule === matricule);
                return (
                  <button key={matricule} type="button" className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm font-semibold" onClick={() => setMembres(membres.filter((item) => item !== matricule))}>
                    {agent?.nom_complet ?? matricule}
                    <Icone nom="close" className="text-sm" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </Modale>
  );
}

/** Saisir la commission : la procédure s'ouvre en instruction, avec son rapporteur et un délai de 30 jours. */
function SaisineCommission({ agents, degres, onClose }: { agents: Registre["agents"]; degres: DegreEchelle[]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ matricule: "", grief: "", description: "", degre: "1", rapporteur: "" });
  const envoi = useMutation({
    mutationFn: () => api<Procedure>(ROUTE, { method: "POST", body: JSON.stringify({ ...saisie, degre: Number(saisie.degre) }) }),
    onSuccess: async (item) => {
      await client.invalidateQueries({ queryKey: ["carrieres-discipline"] });
      feedback.toast("Commission saisie", `${item.reference} · ${item.agent.nom_complet}`);
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
      titre="Saisir la commission paritaire"
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
