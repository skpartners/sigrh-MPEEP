import { useMemo, useState } from "react";
import { AppChrome } from "./AppChrome";
import { Icone } from "../ui/Icone";

type OngletId = "carrieres" | "social" | "formation" | "effectifs";
type Statut = "Validé" | "En cours" | "À examiner" | "Clôturé" | "Programmé" | "Rejeté";
type LigneDemo = { reference: string; titre: string; detail: string; date: string; statut: Statut };
type Rubrique = { id: string; titre: string; description: string; icone: string; elements: string[]; donnees: LigneDemo[] };
type IndicateurData = { icone: string; titre: string; valeur: string; detail: string };

const ONGLET: { id: OngletId; libelle: string; icone: string; description: string }[] = [
  { id: "carrieres", libelle: "Gestion des carrières", icone: "work_history", description: "Suivi des situations administratives, procédures disciplinaires, congés, absences et bilans de carrière." },
  { id: "social", libelle: "Action sociale", icone: "diversity_3", description: "Accompagnement des fins de carrière et suivi des distinctions honorifiques." },
  { id: "formation", libelle: "Formation continue", icone: "school", description: "Programmation, suivi et évaluation des formations nationales et internationales." },
  { id: "effectifs", libelle: "Programmation des effectifs", icone: "groups", description: "Recensement des besoins, validations, mesures nouvelles et suivi des dotations." },
];

const RUBRIQUES: Record<OngletId, Rubrique[]> = {
  carrieres: [
    { id: "situation", titre: "Situation administrative", description: "Positions administratives, nominations, promotions et mutations.", icone: "badge", elements: ["Positions administratives", "Nominations et promotions", "Mutations et mouvements"], donnees: [
      { reference: "ADM-2026-014", titre: "Affectation — Direction des Affaires administratives", detail: "A. Kouassi · Attaché administratif · DAAF", date: "12/09/2026", statut: "Validé" },
      { reference: "ADM-2026-019", titre: "Promotion — Assistant administratif", detail: "M. Koné · Avancement de grade · DRH", date: "25/09/2026", statut: "En cours" },
      { reference: "ADM-2026-023", titre: "Mutation interne", detail: "S. Yao · Direction financière vers DRH", date: "02/10/2026", statut: "À examiner" },
    ] },
    { id: "discipline", titre: "Procédures disciplinaires", description: "Traçabilité des demandes d’explication, instructions et décisions.", icone: "gavel", elements: ["Demande d’explication", "Instruction devant le conseil de discipline", "Décision et exécution — premier degré", "Décision et exécution — second degré"], donnees: [
      { reference: "DIS-2026-004", titre: "Demande d’explication", detail: "Dossier anonymisé · Réponse attendue du service concerné", date: "18/09/2026", statut: "En cours" },
      { reference: "DIS-2026-006", titre: "Instruction du dossier", detail: "Pièces à compléter avant examen", date: "22/09/2026", statut: "À examiner" },
      { reference: "DIS-2026-002", titre: "Décision de premier degré", detail: "Exécution administrative à vérifier", date: "05/08/2026", statut: "Clôturé" },
    ] },
    { id: "conges", titre: "Congés et absences", description: "Demandes, autorisations, périodes et suivi des absences.", icone: "event_available", elements: ["Congé annuel", "Congé de maternité", "Congé pour couche et allaitement", "Congé de paternité", "Congé de maladie — courte ou longue durée", "Permission spéciale d’absence", "Autorisation spéciale d’absence", "Permission"], donnees: [
      { reference: "ABS-2026-031", titre: "Congé annuel", detail: "K. N’Guessan · 10 jours ouvrés · Service courrier", date: "01/10/2026", statut: "Validé" },
      { reference: "ABS-2026-034", titre: "Autorisation spéciale d’absence", detail: "Dossier de démonstration · Justificatif à vérifier", date: "06/10/2026", statut: "En cours" },
      { reference: "ABS-2026-028", titre: "Congé de maladie", detail: "Dossier confidentiel · Accès réservé aux personnes habilitées", date: "26/09/2026", statut: "À examiner" },
    ] },
    { id: "bilan-carriere", titre: "Bilan de la gestion de la carrière", description: "Synthèse des actes administratifs, mouvements, congés et procédures.", icone: "analytics", elements: ["Actes administratifs par période", "Mouvements et promotions", "Congés et absences", "Dossiers disciplinaires par statut"], donnees: [
      { reference: "BIL-CAR-T3", titre: "Bilan du troisième trimestre", detail: "18 actes administratifs · 7 mouvements · 26 demandes d’absence", date: "30/09/2026", statut: "Validé" },
      { reference: "BIL-CAR-2026", titre: "Synthèse annuelle provisoire", detail: "Données de démonstration à consolider en fin d’exercice", date: "12/10/2026", statut: "En cours" },
    ] },
  ],
  social: [
    { id: "fin-carriere", titre: "Gestion des fins de carrière", description: "Préparation et suivi des départs et fins de fonctions.", icone: "exit_to_app", elements: ["Limite d’âge", "Décès", "Démission", "Révocation", "Licenciement"], donnees: [
      { reference: "FIN-2026-007", titre: "Départ à la limite d’âge", detail: "Agent fictif · Dossier de préparation des actes de fin de service", date: "30/11/2026", statut: "En cours" },
      { reference: "FIN-2026-009", titre: "Démission — suivi administratif", detail: "Vérification des pièces et de la décision", date: "14/09/2026", statut: "À examiner" },
      { reference: "FIN-2026-003", titre: "Dossier de fin de service", detail: "Actes administratifs de clôture contrôlés", date: "31/07/2026", statut: "Clôturé" },
    ] },
    { id: "distinctions", titre: "Distinctions", description: "Propositions, décisions et attribution des distinctions honorifiques.", icone: "military_tech", elements: ["Prix d’excellence", "Distinction dans l’ordre du mérite de la fonction publique"], donnees: [
      { reference: "DIS-HON-2026-012", titre: "Proposition au prix d’excellence", detail: "Dossier de candidature fictif · Pièces en cours de vérification", date: "20/08/2026", statut: "En cours" },
      { reference: "DIS-HON-2026-006", titre: "Ordre du mérite de la fonction publique", detail: "Proposition transmise pour examen", date: "11/07/2026", statut: "Validé" },
    ] },
  ],
  formation: [
    { id: "plan", titre: "Élaboration du plan de formation", description: "Recueil des besoins, priorisation et validation du plan annuel.", icone: "edit_document", elements: ["Recueil des besoins", "Priorisation des besoins", "Programmation des actions", "Validation du plan"], donnees: [
      { reference: "FOR-PLAN-2026", titre: "Plan annuel de formation", detail: "24 actions prévues · 8 domaines prioritaires", date: "15/01/2026", statut: "Validé" },
      { reference: "FOR-BES-041", titre: "Besoin en gestion de projet", detail: "Direction des études · 12 participants souhaités", date: "29/09/2026", statut: "À examiner" },
      { reference: "FOR-ACT-017", titre: "Atelier de renforcement des capacités", detail: "Programmation prévisionnelle · 2 jours", date: "04/11/2026", statut: "Programmé" },
    ] },
    { id: "etranger", titre: "Formation hors Côte d’Ivoire", description: "Suivi des formations de courte et de longue durée à l’étranger.", icone: "flight_takeoff", elements: ["Formation de courte durée", "Formation de longue durée", "Organisme d’accueil et agent concerné", "Dates, état d’avancement et justificatifs"], donnees: [
      { reference: "FOR-INT-008", titre: "Séminaire international de gestion RH", detail: "Accra · 5 jours · 2 participants fictifs", date: "16/11/2026", statut: "Programmé" },
      { reference: "FOR-INT-003", titre: "Formation longue durée en finances publiques", detail: "Programme de 6 mois · Suivi des justificatifs", date: "01/09/2026", statut: "En cours" },
    ] },
    { id: "national", titre: "Formation en Côte d’Ivoire", description: "Suivi des formations nationales, concours professionnels et partenaires techniques.", icone: "location_on", elements: ["Formations après concours professionnel", "Formations dispensées par des partenaires techniques", "Participants et périodes", "Attestations et résultats"], donnees: [
      { reference: "FOR-NAT-021", titre: "Formation après concours professionnel", detail: "Abidjan · Session de perfectionnement · 15 participants fictifs", date: "05/10/2026", statut: "En cours" },
      { reference: "FOR-NAT-024", titre: "Atelier avec un partenaire technique", detail: "Passation des marchés · Attestations à collecter", date: "08/12/2026", statut: "Programmé" },
      { reference: "FOR-NAT-016", titre: "Formation aux outils numériques", detail: "Session terminée · Évaluation disponible", date: "18/09/2026", statut: "Clôturé" },
    ] },
    { id: "bilan-formation", titre: "Bilan du plan de formation", description: "Comparaison des actions prévues, réalisées et en attente.", icone: "assessment", elements: ["Actions prévues et réalisées", "Agents formés", "Répartition par domaine et durée", "Écarts entre programmation et réalisation"], donnees: [
      { reference: "BIL-FOR-T3", titre: "Point d’exécution au troisième trimestre", detail: "24 actions prévues · 15 réalisées · 9 restant à réaliser", date: "30/09/2026", statut: "En cours" },
      { reference: "BIL-FOR-2026", titre: "Bilan annuel provisoire", detail: "180 participations prévues dans le jeu de démonstration", date: "12/10/2026", statut: "À examiner" },
    ] },
  ],
  effectifs: [
    { id: "besoins", titre: "Besoins exprimés", description: "Recensement des besoins par structure, service et emploi.", icone: "account_tree", elements: ["Structure du ministère jusqu’au service utilisateur", "Besoins exprimés par emploi", "Quantités demandées et motifs"], donnees: [
      { reference: "EFF-2026-101", titre: "Besoin d’attachés administratifs", detail: "DRH · Besoin exprimé : 5 agents", date: "10/06/2026", statut: "En cours" },
      { reference: "EFF-2026-108", titre: "Besoin de gestionnaires de données", detail: "Direction des études · Besoin exprimé : 3 agents", date: "18/06/2026", statut: "À examiner" },
      { reference: "EFF-2026-114", titre: "Besoin de secrétaires de direction", detail: "Cabinet · Besoin exprimé : 2 agents", date: "24/06/2026", statut: "Validé" },
    ] },
    { id: "conference", titre: "Validation par la conférence de programmation", description: "Suivi des besoins présentés, retenus, rejetés ou reportés.", icone: "fact_check", elements: ["Besoins soumis à la conférence", "Besoins validés", "Besoins rejetés ou reportés", "Observations et référence de décision"], donnees: [
      { reference: "CP-2026-018", titre: "Conférence de programmation — séance 2", detail: "12 besoins examinés · 8 validés · 2 reportés · 2 à revoir", date: "22/07/2026", statut: "Validé" },
      { reference: "CP-2026-023", titre: "Arbitrage complémentaire", detail: "Justification de priorité demandée", date: "07/10/2026", statut: "En cours" },
    ] },
    { id: "catalogue", titre: "Catalogue des mesures nouvelles", description: "Suivi des emplois et quantités retenus dans le catalogue validé.", icone: "menu_book", elements: ["Besoins inscrits au catalogue", "Emploi et structure bénéficiaire", "Quantités autorisées", "Référence de validation"], donnees: [
      { reference: "CMN-2026-044", titre: "Attaché administratif", detail: "DRH · Quantité autorisée : 3", date: "18/08/2026", statut: "Validé" },
      { reference: "CMN-2026-051", titre: "Gestionnaire de données", detail: "Direction des études · Quantité autorisée : 2", date: "18/08/2026", statut: "Validé" },
      { reference: "CMN-2026-058", titre: "Secrétaire de direction", detail: "Cabinet · Quantité autorisée : 2", date: "18/08/2026", statut: "Validé" },
    ] },
    { id: "dotation", titre: "Suivi des dotations", description: "Affectations, réaffectations et mises à disposition.", icone: "swap_horiz", elements: ["Affectations", "Réaffectations", "Mises à disposition", "Date d’effet et structure d’accueil"], donnees: [
      { reference: "DOT-2026-031", titre: "Affectation d’attachés administratifs", detail: "3 agents · Direction des ressources humaines", date: "01/09/2026", statut: "Validé" },
      { reference: "DOT-2026-036", titre: "Mise à disposition", detail: "1 agent · Direction des études", date: "15/09/2026", statut: "En cours" },
      { reference: "DOT-2026-040", titre: "Réaffectation interne", detail: "2 agents · Services administratifs", date: "01/10/2026", statut: "Validé" },
    ] },
    { id: "satisfaction", titre: "Bilan de satisfaction des besoins", description: "Comparaison des besoins validés et des dotations réalisées.", icone: "compare_arrows", elements: ["Besoins validés", "Dotations réalisées", "Solde restant à couvrir", "Taux de satisfaction par emploi et structure"], donnees: [
      { reference: "BIL-EFF-DRH", titre: "Direction des ressources humaines", detail: "5 besoins validés · 3 dotations · Solde : 2", date: "12/10/2026", statut: "En cours" },
      { reference: "BIL-EFF-ETU", titre: "Direction des études", detail: "2 besoins validés · 1 dotation · Solde : 1", date: "12/10/2026", statut: "En cours" },
      { reference: "BIL-EFF-CAB", titre: "Cabinet", detail: "2 besoins validés · 2 dotations · Solde : 0", date: "12/10/2026", statut: "Clôturé" },
    ] },
  ],
};

const INDICATEURS: Record<OngletId, IndicateurData[]> = {
  carrieres: [
    { icone: "badge", titre: "Actes administratifs", valeur: "18", detail: "Actes suivis au trimestre" },
    { icone: "gavel", titre: "Dossiers disciplinaires", valeur: "06", detail: "Dossiers fictifs suivis" },
    { icone: "event_available", titre: "Demandes d’absence", valeur: "26", detail: "Demandes dans la période" },
    { icone: "analytics", titre: "Dossiers à traiter", valeur: "09", detail: "Tous sous-modules confondus" },
  ],
  social: [
    { icone: "exit_to_app", titre: "Fins de carrière", valeur: "07", detail: "Dossiers à différents stades" },
    { icone: "military_tech", titre: "Distinctions", valeur: "12", detail: "Propositions fictives suivies" },
    { icone: "hourglass_top", titre: "En cours", valeur: "04", detail: "Dossiers nécessitant un suivi" },
    { icone: "task_alt", titre: "Clôturés", valeur: "08", detail: "Dossiers de démonstration" },
  ],
  formation: [
    { icone: "edit_document", titre: "Actions prévues", valeur: "24", detail: "Plan annuel de démonstration" },
    { icone: "school", titre: "Actions réalisées", valeur: "15", detail: "Soit 62,5 % du plan" },
    { icone: "groups", titre: "Participations prévues", valeur: "180", detail: "Agents et participations fictifs" },
    { icone: "pending_actions", titre: "Actions restantes", valeur: "09", detail: "À programmer ou réaliser" },
  ],
  effectifs: [
    { icone: "account_tree", titre: "Besoins exprimés", valeur: "42", detail: "Demandes de démonstration" },
    { icone: "fact_check", titre: "Besoins validés", valeur: "28", detail: "Après arbitrage simulé" },
    { icone: "groups", titre: "Dotations réalisées", valeur: "19", detail: "Mouvements simulés" },
    { icone: "hourglass_top", titre: "Solde à couvrir", valeur: "09", detail: "Besoins validés moins dotations" },
  ],
};

function BadgeStatut({ statut }: { statut: Statut }) {
  const style: Record<Statut, string> = {
    "Validé": "bg-emerald-50 text-emerald-700",
    "En cours": "bg-blue-50 text-blue-700",
    "À examiner": "bg-amber-50 text-amber-800",
    "Clôturé": "bg-slate-100 text-slate-700",
    "Programmé": "bg-violet-50 text-violet-700",
    "Rejeté": "bg-rose-50 text-rose-700",
  };
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold ${style[statut]}`}>{statut}</span>;
}

function Indicateur({ item }: { item: IndicateurData }) {
  return <article className="rounded-xl border border-hairline bg-surface-container-lowest p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="font-label-sm text-label-sm text-on-surface-variant">{item.titre}</p><p className="mt-2 font-headline-lg text-headline-lg font-bold text-on-surface">{item.valeur}</p><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{item.detail}</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary"><Icone nom={item.icone} className="text-xl" /></span></div>
  </article>;
}

function CarteRubrique({ rubrique, ouverte, onBasculer }: { rubrique: Rubrique; ouverte: boolean; onBasculer: () => void }) {
  return <article className="overflow-hidden rounded-xl border border-hairline bg-surface-container-lowest">
    <div className="p-5"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary"><Icone nom={rubrique.icone} className="text-2xl" /></span><div className="min-w-0 flex-1"><h3 className="font-label-lg text-label-lg font-bold text-on-surface">{rubrique.titre}</h3><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{rubrique.description}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="rounded-full bg-surface-container-low px-3 py-1 font-label-sm text-label-sm text-on-surface-variant">{rubrique.donnees.length} exemples de dossiers</span><button type="button" aria-expanded={ouverte} onClick={onBasculer} className="inline-flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container">{ouverte ? "Masquer les dossiers" : "Consulter les dossiers"}<Icone nom={ouverte ? "expand_less" : "expand_more"} className="text-lg" /></button></div>
    </div>
    {ouverte ? <div className="border-t border-hairline bg-surface-container-low/40 px-5 py-4"><div className="mb-4"><p className="font-label-md text-label-md font-bold text-on-surface">Éléments couverts</p><ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{rubrique.elements.map((element) => <li key={element} className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface"><Icone nom="check_circle" className="mt-0.5 shrink-0 text-base text-primary" /><span>{element}</span></li>)}</ul></div>
      <div className="space-y-3">{rubrique.donnees.map((dossier) => <div key={dossier.reference} className="rounded-lg border border-hairline bg-surface-container-lowest p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><p className="font-label-sm text-label-sm font-semibold text-primary">{dossier.reference}</p><h4 className="mt-1 font-label-md text-label-md font-bold text-on-surface">{dossier.titre}</h4><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{dossier.detail}</p><p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Date : {dossier.date}</p></div><BadgeStatut statut={dossier.statut} /></div></div>)}</div>
      <p className="mt-4 rounded-lg border border-dashed border-hairline px-3 py-2 font-body-sm text-body-sm text-on-surface-variant"><strong>Mode démonstration :</strong> ces dossiers sont fictifs et ne sont pas enregistrés dans Django.</p>
    </div> : null}
  </article>;
}

function TableauEffectifs() {
  const lignes = [
    { structure: "Direction des ressources humaines", emploi: "Attaché administratif", besoins: 5, dotation: 3 },
    { structure: "Direction des études", emploi: "Gestionnaire de données", besoins: 2, dotation: 1 },
    { structure: "Cabinet", emploi: "Secrétaire de direction", besoins: 2, dotation: 2 },
    { structure: "Direction financière", emploi: "Agent comptable", besoins: 4, dotation: 2 },
  ];
  return <section className="mt-6 overflow-hidden rounded-xl border border-hairline bg-surface-container-lowest" aria-labelledby="titre-comparatif-effectifs"><div className="border-b border-hairline p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container text-primary"><Icone nom="compare_arrows" className="text-xl" /></span><div><h3 id="titre-comparatif-effectifs" className="font-headline-sm text-headline-sm font-bold text-on-surface">Comparatif besoins validés / dotations</h3><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Exemple de tableau de pilotage par structure et emploi.</p></div></div></div>
    <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant"><th className="px-4 py-3 font-semibold">Structure / service</th><th className="px-4 py-3 font-semibold">Emploi</th><th className="px-4 py-3 text-right font-semibold">Besoins validés</th><th className="px-4 py-3 text-right font-semibold">Dotations</th><th className="px-4 py-3 text-right font-semibold">Solde</th><th className="px-4 py-3 font-semibold">Couverture</th></tr></thead><tbody>{lignes.map((ligne) => { const solde = ligne.besoins - ligne.dotation; const taux = Math.round((ligne.dotation / ligne.besoins) * 100); return <tr key={ligne.structure} className="border-t border-hairline"><td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{ligne.structure}</td><td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{ligne.emploi}</td><td className="px-4 py-3 text-right font-body-sm text-body-sm tabular-nums text-on-surface">{ligne.besoins}</td><td className="px-4 py-3 text-right font-body-sm text-body-sm tabular-nums text-on-surface">{ligne.dotation}</td><td className="px-4 py-3 text-right font-body-sm text-body-sm font-semibold tabular-nums text-on-surface">{solde}</td><td className="min-w-36 px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container"><div className="h-full rounded-full bg-primary" style={{ width: `${taux}%` }} /></div><span className="w-10 text-right font-label-sm text-label-sm text-on-surface-variant">{taux}%</span></div></td></tr>; })}</tbody></table></div>
    <div className="flex flex-wrap gap-5 border-t border-hairline px-5 py-4 font-label-sm text-label-sm text-on-surface-variant"><span>Total des besoins validés : <strong className="text-on-surface">13</strong></span><span>Total des dotations : <strong className="text-on-surface">8</strong></span><span>Solde restant : <strong className="text-on-surface">5</strong></span></div>
  </section>;
}

export function GrhScreen() {
  const [ongletActif, setOngletActif] = useState<OngletId>("carrieres");
  const [recherche, setRecherche] = useState("");
  const [ouvertes, setOuvertes] = useState<string[]>(["situation"]);
  const onglet = ONGLET.find((item) => item.id === ongletActif) ?? ONGLET[0];
  const rubriques = useMemo(() => {
    const terme = recherche.trim().toLocaleLowerCase("fr");
    const liste = RUBRIQUES[ongletActif];
    return terme ? liste.filter((r) => [r.titre, r.description, ...r.elements, ...r.donnees.flatMap((d) => [d.reference, d.titre, d.detail, d.statut])].join(" ").toLocaleLowerCase("fr").includes(terme)) : liste;
  }, [ongletActif, recherche]);

  function changerOnglet(id: OngletId) { setOngletActif(id); setRecherche(""); setOuvertes([]); }
  function basculerRubrique(id: string) { setOuvertes((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }

  return <AppChrome><main className="mx-auto w-full flex-1 px-4 py-6 sm:px-6 lg:px-8"><div className="flex flex-col gap-6">
    <section className="rounded-xl border border-hairline bg-surface-container-lowest p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Ressources humaines</p><span className="rounded-full bg-amber-100 px-2.5 py-1 font-label-sm text-label-sm font-semibold text-amber-900">Phase pilote · données fictives</span></div><h1 className="mt-2 font-headline-xl text-headline-xl font-bold tracking-tight text-on-surface">Gestion des ressources humaines</h1><p className="mt-3 font-body-md text-body-md text-on-surface-variant">Espace de pilotage des carrières, de l’action sociale, de la formation continue et de la programmation des effectifs du Ministère.</p><p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">Les chiffres et dossiers affichés sont des exemples destinés à la présentation. Ils ne proviennent pas encore de la base de données officielle.</p></div><div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-4 lg:max-w-xs"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-fixed text-primary"><Icone nom="groups" className="text-2xl" /></span><div><p className="font-label-md text-label-md font-bold text-on-surface">Pilotage RH</p><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">4 domaines · {Object.values(RUBRIQUES).flat().length} sous-modules présentés</p></div></div></div></section>

    <nav className="grid grid-cols-1 gap-2 rounded-xl border border-hairline bg-surface-container-lowest p-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Rubriques de gestion des ressources humaines">{ONGLET.map((item) => { const actif = item.id === ongletActif; return <button key={item.id} type="button" role="tab" aria-selected={actif} onClick={() => changerOnglet(item.id)} className={`flex min-h-14 items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${actif ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}><Icone nom={item.icone} className="shrink-0 text-xl" /><span className="font-label-md text-label-md font-semibold">{item.libelle}</span></button>; })}</nav>

    <section aria-labelledby="titre-onglet-grh"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Module GRH</p><h2 id="titre-onglet-grh" className="mt-1 font-headline-lg text-headline-lg font-bold text-on-surface">{onglet.libelle}</h2><p className="mt-1 max-w-3xl font-body-sm text-body-sm text-on-surface-variant">{onglet.description}</p></div><label className="relative block w-full sm:max-w-sm"><span className="sr-only">Rechercher dans les rubriques et dossiers</span><Icone nom="search" className="absolute left-3 top-2.5 text-lg text-on-surface-variant" /><input type="search" value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher une rubrique, un dossier…" className="w-full rounded-lg bg-surface-container-low py-2.5 pl-10 pr-3 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary" /></label></div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{INDICATEURS[ongletActif].map((item) => <Indicateur key={item.titre} item={item} />)}</div>
      <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Sous-modules et dossiers de démonstration</h3><span className="font-label-sm text-label-sm text-on-surface-variant">{rubriques.length} rubrique(s)</span></div>
      <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">{rubriques.map((rubrique) => <CarteRubrique key={rubrique.id} rubrique={rubrique} ouverte={ouvertes.includes(rubrique.id)} onBasculer={() => basculerRubrique(rubrique.id)} />)}</div>
      {rubriques.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-hairline bg-surface-container-lowest p-8 text-center"><Icone nom="search_off" className="text-3xl text-on-surface-variant" /><p className="mt-2 font-label-lg text-label-lg font-semibold text-on-surface">Aucun résultat trouvé</p><p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Essayez un autre mot-clé, une référence ou un statut.</p></div> : null}
      {ongletActif === "effectifs" ? <TableauEffectifs /> : null}
    </section>

    <footer className="rounded-xl border border-dashed border-hairline bg-surface-container-lowest px-4 py-4 font-body-sm text-body-sm text-on-surface-variant"><div className="flex items-start gap-3"><Icone nom="info" className="mt-0.5 shrink-0 text-lg text-primary" /><div><strong className="text-on-surface">Périmètre de cette phase pilote.</strong> L’interface, les exemples de dossiers, la recherche et les indicateurs fonctionnent localement dans le navigateur. Aucune donnée n’est enregistrée et aucune API Django n’est appelée. Avant la mise en production, il faudra remplacer ces jeux de données par les réponses des API, appliquer les règles d’accès et de confidentialité, puis tester les workflows de validation.</div></div></footer>
  </div></main></AppChrome>;
}