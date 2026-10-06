import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { Modale } from "../../ui/Modale";
import { Skeleton } from "../../ui/Motion";
import { Pagination, usePagination } from "../../ui/Pagination";
import { AppChrome } from "../AppChrome";
import { Icone } from "../../ui/Icone";

type Etat = "commission" | "conforme" | "reserve" | "mandatee";
type Requete = {
  id: number;
  reference: string;
  agent: AgentBrief & { fonction: string };
  nature: string;
  objet: string;
  ayant_droit: string;
  montant: number;
  date_demande: string;
  pieces: string;
  avis_commission: string;
  urgent: boolean;
  etat: Etat;
  etat_libelle: string;
};
type Tableau = {
  exercice: number;
  budget: { allouee: number; engagee: number; reliquat: number; ligne: string };
  instruites: number;
  instruites_mois: number;
  commission: number;
  requetes: Requete[];
  natures: string[];
  etats: { code: Etat; libelle: string }[];
  agents: { matricule: string; nom_complet: string; organisme_sigle: string }[];
  entete: { arrete?: string; synchronisation?: string; satisfaction?: number } | null;
  guichets: { icone: string; titre: string; plafond: string; texte: string; consomme: number; dotation: number; pied: string; valeur: string }[] | null;
  partenaires: { organisme: string; badge: string; titre: string; texte: string; gauche: string; droite: string }[] | null;
  medecine: { couverture: number; vus: number; effectif: number; relances: number; aptes: number; amenagements: number; inaptitudes: number } | null;
  handicap: { agents: number; postes: number; postes_detail: string; transport: string; referent: string } | null;
  retraites: { seminaire: string; date: string; texte: string } | null;
  activites: { quand: string; lieu: string; titre: string; texte: string; jauge: string; part: number }[] | null;
  ecoute: { ligne: string; responsable: string; horaires: string } | null;
};

const ROUTE = "/api/v1/action-sociale/";
const CHAMP = "w-full px-3 py-2 bg-surface-container-low rounded font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

function fcfa(valeur: number): string {
  return valeur.toLocaleString("fr-FR");
}

function part(valeur: number, total: number): number {
  return total ? Math.round((valeur * 1000) / total) / 10 : 0;
}

/** Plafond légal du tiers cessible et capacité restante après les retenues en cours. */
function calculerQuotite(brut: number, retenues: number) {
  const plafond = Math.round(brut * 0.3333);
  const residuelle = Math.max(0, plafond - retenues);
  const avis =
    retenues > plafond
      ? { libelle: "DÉPASSEMENT (quotité saturée)", classe: "bg-error text-on-error" }
      : residuelle < 30000
        ? { libelle: "RESTREINT (capacité résiduelle faible)", classe: "bg-secondary-container text-on-secondary-container" }
        : { libelle: "FAVORABLE (quotité préservée)", classe: "bg-primary text-on-primary" };
  return { plafond, residuelle, avis };
}

/** Sous-direction de l'action sociale : budget, guichets, requêtes, partenaires et accompagnement. */
export function SocialScreen() {
  const tableau = useQuery({ queryKey: ["action-sociale"], queryFn: () => api<Tableau>(ROUTE) });
  const [brut, setBrut] = useState("780000");
  const [retenues, setRetenues] = useState("95000");
  const [demandeOuverte, setDemandeOuverte] = useState(false);
  const [entite, setEntite] = useState("");
  const [etat, setEtat] = useState("");
  const quotite = useMemo(() => calculerQuotite(Number(brut) || 0, Number(retenues) || 0), [brut, retenues]);
  const donnees = tableau.data;
  const budget = donnees?.budget;
  const requetes = donnees?.requetes ?? [];
  const filtrees = requetes.filter((item) => (!entite || item.agent.organisme_sigle === entite) && (!etat || (etat === "urgent" ? item.urgent : item.etat === etat)));
  const pageRequetes = usePagination(filtrees, `${entite}|${etat}`);
  const entites = [...new Set(requetes.map((item) => item.agent.organisme_sigle))].sort();
  const exercice = donnees?.exercice ?? "";
  const engage = budget ? part(budget.engagee, budget.allouee) : 0;

  return (
    <AppChrome>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Bandeau */}
        <section className="w-full px-6 py-5 bg-surface-container-lowest shadow-sm flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 motion-rise">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icone nom="volunteer_activism" className="text-2xl" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-label-sm uppercase tracking-widest font-bold bg-primary text-on-primary">Régie sociale ministérielle</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-label-sm font-semibold bg-surface-container-high text-on-surface-variant flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
                  Exercice budgétaire {exercice}
                  {donnees?.entete?.arrete ? ` • ${donnees.entete.arrete}` : ""}
                </span>
                {donnees?.entete?.synchronisation ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-label-sm font-bold bg-primary-fixed text-on-primary-fixed">{donnees.entete.synchronisation}</span>
                ) : null}
              </div>
              <h1 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">Sous-direction de l'action sociale (SDAS)</h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Prévoyance, secours d'urgence, appui au logement et médecine préventive du Portefeuille de l'État</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto shrink-0">
            <span className="px-3.5 py-2 rounded bg-surface-container-low text-primary text-label-md font-label-md flex items-center gap-2">
              <Icone nom="gavel" className="text-base" />
              <span>Commission d'arbitrage</span>
              <span className="px-1.5 py-0.2 rounded-full bg-secondary text-on-secondary text-[10px] font-bold">{donnees?.commission ?? 0}</span>
            </span>
            <button className="px-4 py-2 rounded bg-primary hover:bg-primary-container text-on-primary text-label-md font-label-md transition-all shadow-sm flex items-center gap-2" type="button" onClick={() => setDemandeOuverte(true)}>
              <Icone nom="add_circle" className="text-base" />
              <span>Nouvelle demande de secours</span>
            </button>
          </div>
        </section>

        <div className="w-full px-6 py-6 space-y-6">
          {/* Budget de l'exercice */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CarteBudget titre="Dotation sociale annuelle" icone="account_balance_wallet" teinte="text-primary" valeur={budget ? fcfa(budget.allouee) : "—"} gauche="Ligne budgétaire" droite={budget?.ligne ?? ""} />
            <CarteBudget titre={`Engagé & liquidé (${engage.toLocaleString("fr-FR")} %)`} icone="payments" teinte="text-secondary" valeur={budget ? fcfa(budget.engagee) : "—"} valeurCouleur="text-secondary">
              <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div className="motion-fill h-full bg-secondary-container rounded-full" style={{ width: `${Math.min(engage, 100)}%` }} />
              </div>
            </CarteBudget>
            <CarteBudget titre="Solde disponible" icone="savings" teinte="text-primary" valeur={budget ? fcfa(budget.reliquat) : "—"} valeurCouleur="text-primary" gauche="Trésorerie DAAF" droite="Réserve" />
            <CarteBudget titre={`Dossiers instruits (${exercice})`} icone="diversity_1" teinte="text-tertiary" valeur={donnees ? String(donnees.instruites) : "—"} unite={donnees ? `+${donnees.instruites_mois} ce mois` : ""} gauche="Taux de conformité" droite={donnees?.entete?.satisfaction != null ? `${donnees.entete.satisfaction.toLocaleString("fr-FR")} %` : "—"} />
          </section>

          {/* Guichets */}
          {donnees?.guichets?.length ? (
            <section className="space-y-3">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                  Guichets d'aides, prévoyance & secours spéciaux
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Dispositif d'urgence sociale prévu par le statut général et les conventions des entreprises d'État</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {donnees.guichets.map((guichet) => {
                  const consommation = part(guichet.consomme, guichet.dotation);
                  return (
                    <div key={guichet.titre} className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="w-9 h-9 rounded-lg bg-surface-container-high text-primary flex items-center justify-center">
                            <Icone nom={guichet.icone} className="text-xl" />
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-label-sm font-bold bg-primary-fixed text-on-primary-fixed">{guichet.plafond}</span>
                        </div>
                        <h3 className="font-label-lg text-label-lg font-bold text-on-surface">{guichet.titre}</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{guichet.texte}</p>
                        <div className="mt-4 space-y-1.5">
                          <div className="flex justify-between gap-2 font-label-sm text-label-sm">
                            <span className="text-on-surface-variant">Consommation</span>
                            <span className={`font-bold ${consommation > 70 ? "text-secondary" : "text-on-surface"}`}>
                              {fcfa(guichet.consomme)} / {fcfa(guichet.dotation)} F
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                            <div className={`motion-fill h-full rounded-full ${consommation > 70 ? "bg-secondary-container" : "bg-primary"}`} style={{ width: `${Math.min(consommation, 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 flex items-center justify-between gap-2 text-[11px] font-label-sm text-on-surface-variant bg-surface-container-low/50 px-2 py-1.5 rounded">
                        <span>{guichet.pied}</span>
                        <span className="font-bold text-primary">{guichet.valeur}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Simulateur et partenaires */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 pb-3">
                <Icone nom="calculate" className="text-primary text-xl" />
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Calculateur de quotité cessible (33 %)</h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Contrôle d'éligibilité pour les avances sur salaire, prêts et conventions d'équipement.</p>
              <div className="space-y-3">
                <Champ libelle="Traitement brut mensuel (FCFA) *">
                  <input className={`${CHAMP} font-code-num`} type="number" min={0} value={brut} onChange={(event) => setBrut(event.target.value)} />
                </Champ>
                <Champ libelle="Retenues existantes (crédits en cours, mutuelle)">
                  <input className={`${CHAMP} font-code-num`} type="number" min={0} value={retenues} onChange={(event) => setRetenues(event.target.value)} />
                </Champ>
              </div>
              <div className="mt-5 p-4 rounded-lg bg-surface-container-low flex flex-col gap-2" aria-live="polite">
                <div className="flex items-center justify-between gap-2 text-body-sm">
                  <span className="text-on-surface-variant">Plafond légal 1/3 :</span>
                  <span className="font-code-num font-bold text-on-surface">{fcfa(quotite.plafond)} FCFA / mois</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-body-sm">
                  <span className="text-on-surface-variant">Capacité d'endettement résiduelle :</span>
                  <span className="font-code-num font-bold text-primary">{fcfa(quotite.residuelle)} FCFA / mois</span>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-label-sm font-semibold">
                  <span className="text-on-surface">Avis d'éligibilité :</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${quotite.avis.classe}`}>{quotite.avis.libelle}</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 pb-3">
                <div className="flex items-center gap-2">
                  <Icone nom="apartment" className="text-primary text-xl" />
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Conventions partenariales & protection sociale</h3>
                </div>
                <span className="text-label-sm font-semibold text-primary whitespace-nowrap">{donnees?.partenaires?.length ?? 0} protocoles actifs</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(donnees?.partenaires ?? []).map((partenaire) => (
                  <div key={partenaire.titre} className="p-3.5 rounded-lg bg-surface-container-low flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-on-primary uppercase">{partenaire.organisme}</span>
                        <span className="font-code-num text-label-sm font-bold text-primary">{partenaire.badge}</span>
                      </div>
                      <h4 className="font-label-md text-label-md font-bold text-on-surface">{partenaire.titre}</h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{partenaire.texte}</p>
                    </div>
                    <div className="mt-3 pt-2 flex items-center justify-between gap-2 font-label-sm text-label-sm">
                      <span className="text-on-surface-variant">{partenaire.gauche}</span>
                      <span className="text-primary font-bold">{partenaire.droite}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Médecine, handicap, retraités */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {donnees?.medecine ? (
              <Panneau icone="medical_services" titre="Médecine du travail" badge={`${donnees.medecine.couverture} % de couverture`}>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-3">Bilan de santé annuel obligatoire des agents.</p>
                <div className="flex items-center gap-5 my-2 p-3 bg-surface-container-low rounded-lg">
                  <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                      <path className="text-surface-container-high" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
                      <path className="text-primary" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${donnees.medecine.couverture}, 100`} strokeLinecap="round" strokeWidth="3.5" />
                    </svg>
                    <span className="absolute font-code-num text-sm font-bold text-on-surface">{donnees.medecine.couverture}%</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-label-md font-bold text-on-surface">{fcfa(donnees.medecine.vus)} / {fcfa(donnees.medecine.effectif)} agents</div>
                    <div className="text-body-sm text-on-surface-variant">Visites d'aptitude validées</div>
                    <div className="text-[11px] font-semibold text-secondary">{fcfa(donnees.medecine.relances)} relances programmées</div>
                  </div>
                </div>
                <div className="space-y-2 mt-3">
                  <Ligne libelle="Aptitudes sans restriction :" valeur={fcfa(donnees.medecine.aptes)} couleur="text-primary" />
                  <Ligne libelle="Aptitudes avec aménagement :" valeur={fcfa(donnees.medecine.amenagements)} couleur="text-secondary" />
                  <Ligne libelle="Inaptitudes temporaires suivies :" valeur={fcfa(donnees.medecine.inaptitudes)} couleur="text-error" />
                </div>
              </Panneau>
            ) : null}
            {donnees?.handicap ? (
              <Panneau icone="accessible_forward" titre="Agents en situation de handicap" badge={`${donnees.handicap.agents} agents reconnus`}>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Aménagements ergonomiques des postes et dotations spécifiques.</p>
                <div className="space-y-3">
                  <Encart icone="chair" titre="Postes ergonomiques aménagés" texte={`${donnees.handicap.postes} postes adaptés. ${donnees.handicap.postes_detail}`} />
                  <Encart icone="directions_car" titre="Accessibilité & transports" texte={donnees.handicap.transport} />
                </div>
                <p className="mt-4 pt-3 text-body-sm text-on-surface-variant">Référent handicap : {donnees.handicap.referent}</p>
              </Panneau>
            ) : null}
            {donnees?.retraites ? (
              <Panneau icone="elderly" titre="Suivi des retraités" badge="Accompagnement">
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Cellule d'écoute, remise des livrets de fin de carrière et préparation à la cessation de service.</p>
                <div className="p-3 bg-surface-container-low rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-label-md text-label-md font-bold text-on-surface">{donnees.retraites.seminaire}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-on-primary whitespace-nowrap">{donnees.retraites.date}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{donnees.retraites.texte}</p>
                </div>
              </Panneau>
            ) : null}
          </section>

          {/* Registre des requêtes */}
          <section className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                  <Icone nom="rule" className="text-primary" />
                  Registre des requêtes sociales en instance
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Demandes d'aides, avances statutaires et secours médicaux</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Filtrer par société d'État" className="px-2.5 py-1.5 bg-surface-container-low rounded font-body-sm text-body-sm text-on-surface focus:outline-none" value={entite} onChange={(event) => setEntite(event.target.value)}>
                  <option value="">Toutes les entités</option>
                  {entites.map((sigle) => (
                    <option key={sigle} value={sigle}>{sigle}</option>
                  ))}
                </select>
                <select aria-label="Filtrer par statut" className="px-2.5 py-1.5 bg-surface-container-low rounded font-body-sm text-body-sm text-on-surface focus:outline-none" value={etat} onChange={(event) => setEtat(event.target.value)}>
                  <option value="">Tous les statuts</option>
                  <option value="urgent">Urgences</option>
                  {(donnees?.etats ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.libelle}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md">
                    <th className="py-3 px-4 rounded-l">Agent bénéficiaire</th>
                    <th className="py-3 px-4">Entité</th>
                    <th className="py-3 px-4">Nature de la prestation</th>
                    <th className="py-3 px-4">Montant sollicité</th>
                    <th className="py-3 px-4">Pièces justificatives</th>
                    <th className="py-3 px-4" data-min="">Avis de la commission</th>
                    <th className="py-3 px-4 text-right rounded-r">Décision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
                  {tableau.isPending ? (
                    <tr>
                      <td colSpan={7} className="py-4 px-4"><Skeleton className="h-10 w-full" /></td>
                    </tr>
                  ) : filtrees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 px-4 text-on-surface-variant">{tableau.isError ? "Le registre n'a pas pu être chargé." : "Aucune requête ne correspond à ces filtres."}</td>
                    </tr>
                  ) : (
                    pageRequetes.visibles.map((requete) => <LigneRequete key={requete.id} requete={requete} />)
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={pageRequetes.page} pages={pageRequetes.pages} total={pageRequetes.total} aller={pageRequetes.aller} libelle="requête" />
          </section>

          {/* Activités et écoute */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6">
            {donnees?.activites?.length ? (
              <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                    <Icone nom="celebration" className="text-primary" />
                    Activités sociales, éducatives & culturelles {exercice}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Cohésion, arbre de Noël, colonies de vacances et tournoi inter-entreprises</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {donnees.activites.map((activite) => (
                    <div key={activite.titre} className="p-4 rounded-lg bg-surface-container-low flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary text-on-primary whitespace-nowrap">{activite.quand} {exercice}</span>
                          <span className="font-label-sm text-primary font-bold text-right">{activite.lieu}</span>
                        </div>
                        <h4 className="font-label-lg text-label-lg font-bold text-on-surface">{activite.titre}</h4>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">{activite.texte}</p>
                      </div>
                      <div className="mt-4 pt-2">
                        <span className="text-[11px] text-on-surface-variant block mb-1">{activite.jauge}</span>
                        <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                          <div className="motion-fill h-full bg-primary rounded-full" style={{ width: `${activite.part}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {donnees?.ecoute ? (
              <div className="lg:col-span-4 bg-surface-container-lowest rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 pb-3">
                  <Icone nom="support_agent" className="text-secondary text-xl" />
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Permanence d'écoute sociale</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-3">Soutien confidentiel aux agents en difficulté personnelle, deuil ou surendettement.</p>
                <div className="p-3 bg-surface-container-low rounded-lg space-y-2">
                  <Ligne libelle="Ligne verte :" valeur={donnees.ecoute.ligne} couleur="text-primary" />
                  <Ligne libelle="Assistante sociale en chef :" valeur={donnees.ecoute.responsable} couleur="text-on-surface" />
                  <Ligne libelle="Horaires :" valeur={donnees.ecoute.horaires} couleur="text-on-surface" />
                </div>
                <div className="mt-4 p-3 bg-surface-container-low/60 rounded-lg">
                  <span className="font-label-md text-label-md font-bold text-on-surface block mb-1">Secret professionnel</span>
                  <p className="text-[12px] text-on-surface-variant">Tout entretien est protégé par le secret médical et déontologique de la fonction publique.</p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
        {demandeOuverte ? <NouvelleDemande natures={donnees?.natures ?? []} agents={donnees?.agents ?? []} onClose={() => setDemandeOuverte(false)} /> : null}
      </div>
    </AppChrome>
  );
}

function CarteBudget({ titre, icone, teinte, valeur, valeurCouleur = "text-on-surface", unite = "FCFA", gauche, droite, children }: {
  titre: string; icone: string; teinte: string; valeur: string; valeurCouleur?: string; unite?: string; gauche?: string; droite?: string; children?: ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">{titre}</span>
        <Icone nom={icone} className={`p-1.5 rounded-lg bg-surface-container-low text-lg ${teinte}`} />
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className={`font-headline-lg text-headline-lg font-bold tracking-tight ${valeurCouleur}`}>{valeur}</span>
        <span className="font-label-md text-label-md text-on-surface-variant ml-1">{unite}</span>
      </div>
      <div className="mt-3">
        {children ?? (
          <div className="pt-2 bg-surface-container-low/40 rounded flex items-center justify-between gap-2 px-2 py-1 text-[11px] font-label-sm text-on-surface-variant">
            <span>{gauche}</span>
            <span className="font-bold text-primary">{droite}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Panneau({ icone, titre, badge, children }: { icone: string; titre: string; badge: string; children: ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <Icone nom={icone} className="text-primary text-xl" />
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">{titre}</h3>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-label-sm font-bold bg-primary-fixed text-on-primary-fixed whitespace-nowrap">{badge}</span>
      </div>
      {children}
    </div>
  );
}

function Encart({ icone, titre, texte }: { icone: string; titre: string; texte: string }) {
  return (
    <div className="p-3 bg-surface-container-low rounded-lg flex items-start gap-3">
      <Icone nom={icone} className="text-primary mt-0.5" />
      <div>
        <p className="font-label-md text-label-md font-bold text-on-surface">{titre}</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{texte}</p>
      </div>
    </div>
  );
}

function Ligne({ libelle, valeur, couleur }: { libelle: string; valeur: string; couleur: string }) {
  return (
    <div className="flex justify-between items-center gap-2 text-body-sm font-label-sm">
      <span className="text-on-surface-variant">{libelle}</span>
      <span className={`font-code-num font-bold text-right ${couleur}`}>{valeur}</span>
    </div>
  );
}

function LigneRequete({ requete }: { requete: Requete }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const action = useMutation({
    mutationFn: (quoi: "mandater" | "relancer") => api<Requete>(`/api/v1/action-sociale/requetes/${requete.id}/${quoi}/`, { method: "POST" }),
    onSuccess: async (_, quoi) => {
      await client.invalidateQueries({ queryKey: ["action-sociale"] });
      feedback.toast(
        quoi === "mandater" ? "Mandatement validé" : "Relance transmise",
        quoi === "mandater" ? `${fcfa(requete.montant)} FCFA engagés pour ${requete.agent.nom_complet}.` : `Pièces manquantes demandées à ${requete.agent.nom_complet}.`,
        quoi === "mandater" ? "success" : "info",
      );
    },
    onError: (erreur) => feedback.toast("Action refusée", erreur instanceof ApiError ? erreur.message : "L'action n'a pas abouti.", "error"),
  });
  const reserve = requete.etat === "reserve";
  return (
    <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-on-surface text-label-md shrink-0">{requete.agent.initiales}</div>
          <div className="min-w-0">
            <span className="font-label-md text-label-md font-bold text-on-surface block">{requete.agent.nom_complet}</span>
            <span className="font-code-num text-xs text-on-surface-variant">Mat. {requete.agent.matricule}</span>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-4 font-semibold text-on-surface">{requete.agent.organisme_sigle}</td>
      <td className="py-3.5 px-4">
        <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold flex items-center gap-1 w-max max-w-full ${requete.urgent ? "bg-error-container text-error" : "bg-surface-container-high text-on-surface"}`}>
          {requete.urgent ? <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping" /> : null}
          {requete.nature}
        </span>
        <span className="block font-label-sm text-label-sm text-on-surface-variant mt-0.5">Ayant droit : {requete.ayant_droit}</span>
      </td>
      <td className="py-3.5 px-4 font-code-num font-bold text-on-surface whitespace-nowrap">{fcfa(requete.montant)} FCFA</td>
      <td className="py-3.5 px-4">
        <span className={`px-2 py-0.5 rounded bg-surface-container-low text-[11px] font-semibold flex items-center gap-1 w-max ${reserve ? "text-secondary" : "text-primary"}`}>
          <Icone nom={reserve ? "warning" : "task"} className="text-xs" />
          {requete.pieces}
        </span>
      </td>
      <td className="py-3.5 px-4">
        <span className={`inline-block max-w-full px-2 py-0.5 rounded font-label-sm text-label-sm leading-snug font-semibold ${requete.etat === "conforme" || requete.etat === "mandatee" ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface"}`}>{requete.avis_commission}</span>
      </td>
      <td className="py-3.5 px-4 text-right">
        {requete.etat === "conforme" ? (
          <button type="button" disabled={action.isPending} onClick={() => action.mutate("mandater")} className="px-2.5 py-1 rounded bg-primary text-on-primary font-label-sm text-[11px] hover:bg-primary-container transition-colors inline-flex items-center gap-1 disabled:opacity-50">
            <Icone nom="check" className="text-sm" />
            Mandater
          </button>
        ) : reserve ? (
          <button type="button" disabled={action.isPending} onClick={() => action.mutate("relancer")} className="px-2.5 py-1 rounded bg-surface-container-high text-on-surface font-label-sm text-[11px] hover:bg-surface-container transition-colors inline-flex items-center gap-1 disabled:opacity-50">
            <Icone nom="attachment" className="text-sm" />
            Relancer
          </button>
        ) : (
          <span className={`inline-flex items-center gap-1 font-label-sm text-[11px] font-semibold ${requete.etat === "mandatee" ? "text-primary" : "text-on-surface-variant"}`}>
            <Icone nom={requete.etat === "mandatee" ? "done_all" : "hourglass_top"} className="text-sm" />
            {requete.etat_libelle}
          </span>
        )}
      </td>
    </tr>
  );
}

/** Nouvelle requête de secours : elle entre au registre, en attente de l'avis de la commission. */
function NouvelleDemande({ natures, agents, onClose }: { natures: string[]; agents: Tableau["agents"]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({ matricule: "", nature: natures[0] ?? "", montant: "", ayant_droit: "", objet: "" });
  const [fichier, setFichier] = useState<File | null>(null);
  const envoi = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      Object.entries(saisie).forEach(([cle, valeur]) => corps.set(cle, valeur));
      if (fichier) corps.set("fichier", fichier);
      return api<Requete>(ROUTE, { method: "POST", body: corps });
    },
    onSuccess: async (requete) => {
      await client.invalidateQueries({ queryKey: ["action-sociale"] });
      feedback.toast("Requête enregistrée", `${requete.reference} · transmise à la commission sociale.`);
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale
      titre="Nouvelle requête d'assistance sociale"
      sousTitre="Enregistrement au registre de la sous-direction de l'action sociale"
      icone="post_add"
      taille="lg"
      onClose={onClose}
      onSubmit={() => envoi.mutate()}
      libelleValider="Enregistrer la requête"
      enCours={envoi.isPending}
      erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.isError ? "La requête n'a pas été enregistrée." : undefined}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Champ libelle="Agent bénéficiaire *">
            <select className={CHAMP} required value={saisie.matricule} onChange={champ("matricule")}>
              <option value="">Choisir un agent…</option>
              {agents.map((agent) => (
                <option key={agent.matricule} value={agent.matricule}>{agent.nom_complet} · {agent.organisme_sigle}</option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Nature du secours *">
            <select className={CHAMP} required value={saisie.nature} onChange={champ("nature")}>
              {natures.map((nature) => (
                <option key={nature} value={nature}>{nature}</option>
              ))}
            </select>
          </Champ>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Champ libelle="Montant sollicité (FCFA) *">
            <input className={`${CHAMP} font-code-num`} placeholder="Ex : 850000" required type="number" min={1} value={saisie.montant} onChange={champ("montant")} />
          </Champ>
          <Champ libelle="Ayant droit concerné">
            <input className={CHAMP} placeholder="Ex : enfant mineur, conjoint, agent" type="text" value={saisie.ayant_droit} onChange={champ("ayant_droit")} />
          </Champ>
        </div>
        <Champ libelle="Objet de la demande">
          <input className={CHAMP} type="text" maxLength={240} value={saisie.objet} onChange={champ("objet")} />
        </Champ>
        <Champ libelle="Pièce justificative (PDF ou image)">
          <input className={`${CHAMP} file:mr-3 file:rounded file:border-0 file:bg-surface-container-high file:px-3 file:py-1`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => setFichier(event.target.files?.[0] ?? null)} />
        </Champ>
      </div>
    </Modale>
  );
}

function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-label-sm text-label-sm text-on-surface-variant font-medium mb-1">{libelle}</span>
      {children}
    </label>
  );
}
