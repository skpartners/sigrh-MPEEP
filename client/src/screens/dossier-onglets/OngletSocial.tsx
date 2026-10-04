import type { Dossier } from "../../api/types";
import { Pagination, usePagination } from "../../ui/Pagination";
import { CircuitDemande, RubriqueVide, dateFr, demandeClose, estPret, groupe, pourcent, useDocumentAgent } from "./commun";

/** Valeurs de l'agent affichées aux emplacements de la fiche sociale (la maquette tient lieu de repli). */
function valeurs(agent: Dossier) {
  const social = agent.social;
  const enveloppe = social?.enveloppe && social.enveloppe.allouee > 0 ? social.enveloppe : null;
  const dispositif = (code: string, defaut: string) => social?.dispositifs.find((item) => item.code === code)?.valeur ?? defaut;
  const quotite = social && social.traitement_brut > 0 ? social : null;
  const compte = agent.prestations.length;
  return {
    nom: agent.nom_complet,
    envAllouee: enveloppe ? groupe(enveloppe.allouee) : "120 000 000",
    envLigne: enveloppe?.ligne ?? "7412-Action-Soc",
    envEngagee: enveloppe ? groupe(enveloppe.engagee) : "72 800 000",
    envExecution: enveloppe ? pourcent(enveloppe.taux_execution) : "60.7",
    envReliquat: enveloppe ? groupe(enveloppe.reliquat) : "47 200 000",
    envReserve: enveloppe ? pourcent(Math.round((enveloppe.reliquat / enveloppe.allouee) * 1000) / 10) : "39.3",
    envSession: enveloppe ? String(enveloppe.session).padStart(2, "0") : "04",
    envDemandes: !enveloppe
      ? "12 demandes en instance d'instruction paritaire."
      : enveloppe.demandes === 0
        ? "Aucune demande en instance d'instruction paritaire."
        : enveloppe.demandes === 1
          ? "1 demande en instance d'instruction paritaire."
          : `${enveloppe.demandes} demandes en instance d'instruction paritaire.`,
    envDate: enveloppe?.session_date ?? "Jeudi 19 Mars 2026",
    envContact: enveloppe?.contact || "Mme A. Bakayoko (Poste 4410)",
    qBrut: quotite ? groupe(quotite.traitement_brut) : "1 054 200",
    qCotisations: quotite ? groupe(quotite.cotisations) : "211 700",
    qNette: quotite ? groupe(quotite.solde_nette) : "842 500",
    qPart: quotite ? pourcent(quotite.part_quotite) : "34.1",
    qEngagements: quotite ? pourcent(quotite.part_engagements) : "11.2",
    qTaux: quotite ? (Number.isInteger(quotite.taux_quotite) ? String(quotite.taux_quotite) : pourcent(quotite.taux_quotite)) : "33",
    qQuotite: quotite ? groupe(quotite.quotite) : "278 025",
    dispSecoursDeces: dispositif("secours-deces", "Plafond : 1 500 000 FCFA"),
    dispHospitalisation: dispositif("hospitalisation", "Prise en charge : jusqu'à 80%"),
    dispAllocationRentree: dispositif("allocation-rentree", "150 000 FCFA / enfant"),
    dispTauxBonifie: dispositif("taux-bonifie", "Taux Bonifié 3.5%"),
    dispPretImmobilier: dispositif("pret-immobilier", "25 000 000 FCFA"),
    dispPretMensualites: dispositif("pret-mensualites", "180 mensualités"),
    dispAvance: dispositif("avance", "3 000 000 FCFA"),
    dispAvanceDuree: dispositif("avance-duree", "24 mois (taux 0%)"),
    visite: ligneVisite(agent.visite_medicale),
    visiteCourte: agent.visite_medicale.toLowerCase().startsWith("à jour") ? "À Jour (Conforme)" : agent.visite_medicale.split("(")[0].trim() || "À jour",
    comptePrestations: compte > 1 ? `${compte} requêtes sur ${compte} dossiers enregistrés` : compte === 1 ? "1 requête sur 1 dossier enregistré" : "0 requête sur 0 dossier enregistré",
  };
}

/** « À jour (visite du 14 novembre 2025) » → dernier examen et prochaine échéance. */
function ligneVisite(visite: string): string {
  const trouve = visite.match(/visite du (.+?)\)/i);
  if (!trouve) return visite;
  const morceaux = trouve[1].split(" ");
  const annee = Number(morceaux[morceaux.length - 1]);
  const mois = morceaux.slice(1, -1).join(" ");
  const moisTitre = mois ? `${mois.charAt(0).toUpperCase()}${mois.slice(1)}` : "";
  return `Dernier examen validé : ${morceaux[0]} ${moisTitre} ${annee} • Prochaine échéance : ${moisTitre} ${annee + 1}`;
}

/** Action sociale & prêts de l'agent. */
export function OngletSocial({ agent }: { agent: Dossier }) {
  const v = valeurs(agent);
  const telecharger = useDocumentAgent(agent.matricule);
  const prets = agent.demandes.filter(estPret);
  const pagePrestations = usePagination(agent.prestations, String(agent.prestations.length));
  return (
    <>
      <div className="px-6 py-6 max-w-[1600px] w-full mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-primary-container bg-primary-fixed font-label-sm text-label-sm uppercase tracking-wider font-bold">
                Régime Statutaire Général
              </span>
              {" "}
              <span className="text-on-surface-variant font-label-sm text-label-sm">
                • Statut Général des Fonctionnaires (Loi n°2023-892)
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              {"Gestion des Prêts, Secours & Prestations"}
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Direction des Ressources Humaines • Direction Générale du Portefeuille de l'État (DGPE)
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button type="button" className="inline-flex items-center gap-2 px-3 py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors shadow-sm" onClick={() => telecharger("rapport")}>
              <span className="material-symbols-outlined text-lg">download</span>
              {" "}
              <span>Rapport Annuel Social (PDF)</span>
            </button>
            <button type="button" className="inline-flex items-center gap-2 px-4 py-2 rounded bg-secondary-container hover:bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold shadow-md transition-all" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
              <span className="material-symbols-outlined text-lg">add_circle</span>
              {" "}
              <span>Nouvelle demande d'aide ou prêt</span>
            </button>
          </div>
        </div>
        {/* 1. Bandeau supérieur : Solde Budgétaire Social de l'Exercice 2026 */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-lowest p-5 rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant tracking-wider">
                Enveloppe Allouée 2026
              </span>
              {" "}
              <span className="material-symbols-outlined text-primary bg-primary-container/10 p-2 rounded">account_balance</span>
            </div>
            <div className="mt-3">
              <span className="font-headline-lg text-headline-lg font-bold text-on-surface block font-code-num">
                {v.envAllouee}
              </span>
              {" "}
              <span className="font-label-md text-label-md text-on-surface-variant">FCFA • Ligne Budgétaire N° {v.envLigne}</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
              <span className="text-primary font-bold">100%</span>
              {" "}
              <span>Dotation votée en Loi de Finances</span>
            </div>
            <div className="absolute left-0 bottom-0 top-0 w-1.5 bg-primary-container" />
          </div>
          <div className="bg-surface-container-lowest p-5 rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant tracking-wider">
                {"Crédits Engagés & Validés"}
              </span>
              {" "}
              <span className="material-symbols-outlined text-secondary bg-secondary-fixed/50 p-2 rounded">payments</span>
            </div>
            <div className="mt-3">
              <span className="font-headline-lg text-headline-lg font-bold text-secondary font-code-num">{v.envEngagee}</span>
              {" "}
              <span className="font-label-md text-label-md text-on-surface-variant">
                FCFA (Taux d'exécution : {v.envExecution}%)
              </span>
            </div>
            <div className="mt-4 w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
              <div className="bg-secondary-container h-full rounded-full" style={{ width: `${v.envExecution}%` }} />
            </div>
            <div className="absolute left-0 bottom-0 top-0 w-1.5 bg-secondary-container" />
          </div>
          <div className="bg-surface-container-lowest p-5 rounded shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant tracking-wider">
                Reliquat Disponible
              </span>
              {" "}
              <span className="material-symbols-outlined text-primary bg-surface-container-high p-2 rounded">savings</span>
            </div>
            <div className="mt-3">
              <span className="font-headline-lg text-headline-lg font-bold text-primary font-code-num">{v.envReliquat}</span>
              {" "}
              <span className="font-label-md text-label-md text-on-surface-variant">FCFA prêts pour ordonnancement</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
              <span className="text-primary font-bold">{v.envReserve}%</span>
              {" "}
              <span>{"Fonds de réserve & secours d'urgence"}</span>
            </div>
            <div className="absolute left-0 bottom-0 top-0 w-1.5 bg-primary" />
          </div>
          <div className="bg-gradient-to-br from-primary-container to-primary p-5 rounded shadow-sm text-on-primary flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase font-bold text-primary-fixed tracking-wider">
                Commission Sociale DRH
              </span>
              {" "}
              <span className="px-2 py-0.5 rounded bg-surface-container-lowest/20 font-code-num text-label-sm">
                Session N° {v.envSession}
              </span>
            </div>
            <div className="my-2">
              <span className="font-headline-sm text-headline-sm font-bold block">Prochaine Session d'Arbitrage</span>
              <p className="font-body-sm text-body-sm text-primary-fixed mt-1">{v.envDemandes}</p>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="font-code-num text-code-num text-surface-container-lowest">Date : {v.envDate}</span>
              <button type="button" className="px-2.5 py-1 rounded bg-surface-container-lowest text-primary font-label-sm text-label-sm font-bold hover:bg-surface-container transition-colors" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                Voir Ordre du Jour
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 bg-surface-container-low p-3 rounded">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-xl">pending_actions</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface">Demande de prêt en cours</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-code-num text-code-num font-bold">{prets.filter((demande) => !demandeClose(demande)).length}</span>
              </div>
              <div className="space-y-4">
                {prets.length ? (
                  prets.map((demande) => <CircuitDemande key={demande.reference} demande={demande} clos={demandeClose(demande)} />)
                ) : (
                  <RubriqueVide>Aucune demande de prêt n'est en cours pour ce dossier.</RubriqueVide>
                )}
              </div>
            </div>
        {/* 2 & 3. Volet Aides Exceptionnelles & Prêts Immobiliers / Équipement */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Volet Aides Exceptionnelles & Secours d'Urgence (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-surface-container-lowest p-6 rounded shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-secondary-container">emergency</span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {"Secours & Aides Exceptionnelles"}
                  </h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-semibold">
                  Caisse Solidarité
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Aides non remboursables allouées sur justificatifs légaux certifiés, plafonnées selon la nomenclature interministérielle.
              </p>
              <div className="space-y-3.5">
                {/* Secours Décès & Obsèques */}
                <div className="p-4 rounded bg-surface-container-low hover:bg-surface-container transition-colors relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="p-2 bg-surface-container-lowest rounded shrink-0">
                        <span className="material-symbols-outlined text-primary">deceased</span>
                      </div>
                      <div>
                        <h3 className="font-label-lg text-label-lg font-bold text-on-surface">{"Secours Décès & Obsèques (1er Degré)"}</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          Décès de l'agent, du conjoint ou des enfants légaux déclarés.
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-on-surface-variant font-label-sm text-label-sm">
                          <span className="font-code-num text-on-surface font-bold">{v.dispSecoursDeces}</span>
                          {" "}
                          <span>• Versement sous 48h</span>
                        </div>
                      </div>
                    </div>
                    <button type="button" className="px-2.5 py-1.5 rounded bg-surface-container-lowest hover:bg-primary hover:text-on-primary font-label-sm text-label-sm font-semibold text-primary transition-colors shrink-0 shadow-sm" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                      Initier acte
                    </button>
                  </div>
                </div>
                {/* Prise en charge Hospitalisation d'Urgence / Évacuation */}
                <div className="p-4 rounded bg-surface-container-low hover:bg-surface-container transition-colors relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="p-2 bg-surface-container-lowest rounded shrink-0">
                        <span className="material-symbols-outlined text-secondary">local_hospital</span>
                      </div>
                      <div>
                        <h3 className="font-label-lg text-label-lg font-bold text-on-surface">
                          {"Hospitalisation d'Urgence & Évacuation"}
                        </h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          Intervention chirurgicale majeure, accident de service ou transfert CHU/PISAM.
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-on-surface-variant font-label-sm text-label-sm">
                          <span className="font-code-num text-on-surface font-bold">{v.dispHospitalisation}</span>
                          {" "}
                          <span>• Convention Ministère</span>
                        </div>
                      </div>
                    </div>
                    <button type="button" className="px-2.5 py-1.5 rounded bg-surface-container-lowest hover:bg-primary hover:text-on-primary font-label-sm text-label-sm font-semibold text-primary transition-colors shrink-0 shadow-sm" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                      Demande PEC
                    </button>
                  </div>
                </div>
                {/* Aides Rentrée Scolaire Pupilles & Ayants Droit */}
                <div className="p-4 rounded bg-surface-container-low hover:bg-surface-container transition-colors relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="p-2 bg-surface-container-lowest rounded shrink-0">
                        <span className="material-symbols-outlined text-primary">school</span>
                      </div>
                      <div>
                        <h3 className="font-label-lg text-label-lg font-bold text-on-surface">Allocation Rentrée Scolaire Pupilles</h3>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                          {"Soutien aux enfants d'agents décédés ou familles nombreuses (> 4 enfants)."}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-on-surface-variant font-label-sm text-label-sm">
                          <span className="font-code-num text-on-surface font-bold">{v.dispAllocationRentree}</span>
                          {" "}
                          <span>• Certificat de scolarité</span>
                        </div>
                      </div>
                    </div>
                    <button type="button" className="px-2.5 py-1.5 rounded bg-surface-container-lowest hover:bg-primary hover:text-on-primary font-label-sm text-label-sm font-semibold text-primary transition-colors shrink-0 shadow-sm" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                      Dossier annuel
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded bg-surface-container flex items-center justify-between text-on-surface">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">contact_support</span>
                  {" "}
                  <span className="font-body-sm text-body-sm">Permanence Assistant Social DGPE :</span>
                </div>
                <span className="font-label-md text-label-md font-bold text-primary">{v.envContact}</span>
              </div>
            </div>
            {/* Simulation Interactive de Quotité Cessible */}
            <div className="bg-surface-container-lowest p-6 rounded shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-1">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">calculate</span>
                  {" "}{"Barème & Quotité Cessible (Décret 2013-481)"}
                </h3>
                <span className="font-code-num text-label-sm text-on-surface-variant font-bold">Seuil Max : 33.33%</span>
              </div>
              <div className="p-4 rounded bg-surface-container-low space-y-3 font-body-sm text-body-sm">
                <div className="flex justify-between items-center text-on-surface-variant">
                  <span>Traitement Brut Soumis à Retenue :</span>
                  {" "}
                  <span className="font-code-num text-on-surface font-semibold">{v.qBrut} FCFA</span>
                </div>
                <div className="flex justify-between items-center text-on-surface-variant">
                  <span>Cotisations Légales (CGRAE, CMU, IGR) :</span>
                  {" "}
                  <span className="font-code-num text-error font-semibold">- {v.qCotisations} FCFA</span>
                </div>
                <div className="flex justify-between items-center font-bold text-on-surface pt-2">
                  <span>Solde Nette Réglementaire :</span>
                  {" "}
                  <span className="font-code-num text-primary">{v.qNette} FCFA</span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden my-1">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${v.qPart}%` }} />
                </div>
                <div className="flex justify-between text-label-sm font-label-sm text-on-surface-variant">
                  <span>Prélèvements en cours ({v.qEngagements}%)</span>
                  {" "}
                  <span>Plafond légal {v.qTaux}% ({v.qQuotite} FCFA)</span>
                </div>
              </div>
            </div>
          </div>
          {/* Right Column: Volet Prêts Immobiliers & Avances d'Équipement (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-surface-container-lowest p-6 rounded shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-2">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-primary-container">real_estate_agent</span>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      {"Prêts Bonifiés & Avances d'Équipement"}
                    </h2>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {"Partenariat Trésor Public & Banques Publiques (BNI, Versus Bank)"}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded bg-primary-container/10 text-primary font-code-num text-label-sm font-bold">
                  {v.dispTauxBonifie}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Prêt à l'accession à la propriété */}
                <div className="p-5 rounded bg-surface-container-low flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded bg-surface-container-lowest text-primary">
                        <span className="material-symbols-outlined">home_work</span>
                      </span>
                      {" "}
                      <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm font-semibold">
                        Convention État
                      </span>
                    </div>
                    <h3 className="font-label-lg text-label-lg font-bold text-on-surface mt-3">
                      Prêt Accession Propriété Immobilière
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      Acquisition de logement social ou terrain urbain avec ACD certifié. Amortissement jusqu'à 15 ans.
                    </p>
                    <div className="mt-3 space-y-1.5 text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex justify-between">
                        <span>Montant max :</span>
                        {" "}
                        <strong className="text-on-surface font-code-num">{v.dispPretImmobilier}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Durée maximale :</span>
                        {" "}
                        <strong className="text-on-surface font-code-num">{v.dispPretMensualites}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Garantie :</span>
                        {" "}
                        <strong className="text-on-surface">Hypothèque de 1er rang</strong>
                      </div>
                    </div>
                  </div>
                  <button type="button" className="w-full py-2 px-3 rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                    <span>Simuler le plan de prêt</span>
                    {" "}
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
                {/* Avance sur solde / Réhabilitation habitat */}
                <div className="p-5 rounded bg-surface-container-low flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="p-2 rounded bg-surface-container-lowest text-secondary">
                        <span className="material-symbols-outlined">construction</span>
                      </span>
                      {" "}
                      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm font-semibold">
                        Trésor Public
                      </span>
                    </div>
                    <h3 className="font-label-lg text-label-lg font-bold text-on-surface mt-3">
                      {"Avance Solde • Réhabilitation & Travaux"}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      Financement direct sans intérêts bancaires pour réhabilitation du domicile principal ou équipement ménager.
                    </p>
                    <div className="mt-3 space-y-1.5 text-on-surface-variant font-label-sm text-label-sm">
                      <div className="flex justify-between">
                        <span>Montant max :</span>
                        {" "}
                        <strong className="text-on-surface font-code-num">{v.dispAvance}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Remboursement :</span>
                        {" "}
                        <strong className="text-on-surface font-code-num">{v.dispAvanceDuree}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Prélèvement :</span>
                        {" "}
                        <strong className="text-on-surface">Retenue à la source</strong>
                      </div>
                    </div>
                  </div>
                  <button type="button" className="w-full py-2 px-3 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                    <span>Demander formulaire officiel</span>
                    {" "}
                    <span className="material-symbols-outlined text-sm">assignment</span>
                  </button>
                </div>
              </div>
              {/* Prêts Équipement & Véhicule de Fonctionnaire */}
              <div className="p-4 rounded bg-surface-container-high flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-2xl text-primary">directions_car</span>
                  <div>
                    <h4 className="font-label-lg text-label-lg font-bold text-on-surface">
                      Programme Équipement Mobilité Cadres de l'État
                    </h4>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Acquisition véhicules neufs concessionnaires agréés Abidjan avec subvention d'intérêt de 2%.
                    </p>
                  </div>
                </div>
                <button type="button" className="shrink-0 px-3.5 py-1.5 rounded bg-surface-container-lowest text-on-surface hover:text-primary font-label-sm text-label-sm font-bold shadow-sm transition-colors" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                  Consulter Catalogue 2026
                </button>
              </div>
            </div>
            {/* 4. Gestion des Ayants Droit & Couverture Maladie */}
            <div className="bg-surface-container-lowest p-6 rounded shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">family_restroom</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {"Ayants Droit & Couverture Maladie Universelle (CMU)"}
                  </h3>
                </div>
                <button type="button" className="inline-flex items-center gap-1 text-primary hover:text-primary-container font-label-sm text-label-sm font-bold transition-colors" data-soon={`Cette action porte sur le dossier de ${v.nom}. Elle sera versée à son circuit de validation.`}>
                  <span className="material-symbols-outlined text-base">person_add</span>
                  {" "}
                  <span>Ajouter un ayant droit</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{agent.social?.ayants_droit.length ? (
                agent.social.ayants_droit.map((ayant) => <Ayant key={`${ayant.nom}-${ayant.lien}`} ayant={ayant} />)
              ) : (
                <p className="p-3 font-body-sm text-body-sm text-on-surface-variant">Aucun ayant droit n'est versé à ce dossier.</p>
              )}</div>
              {/* Suivi Médical Périodique & Prévention */}
              <div className="p-4 rounded bg-surface-container flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-2xl">medical_services</span>
                  <div>
                    <span className="font-label-md text-label-md font-bold block">Visite Médicale Annuelle Périodique Obligatoire</span>
                    {" "}
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{v.visite}</span>
                  </div>
                </div>
                <span className="px-3 py-1 rounded bg-primary text-on-primary font-label-sm text-label-sm font-bold">
                  {v.visiteCourte}
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* 5. Tableau d'Instruction des Demandes d'Aides & Prêts en Cours */}
        <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">pending_actions</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  {"Registre d'Instruction des Requêtes Sociales & Prêts"}
                </h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Traçabilité réglementaire des dossiers soumis aux commissions sous-directionnelles et déblocages Trésor Public.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-base">search</span>
                <input className="pl-8 pr-3 py-1.5 rounded bg-surface-container-low font-body-sm text-body-sm text-on-surface focus:outline-none" placeholder="Filtrer par Réf. ou Motif..." type="text" />
              </div>
              <select className="px-3 py-1.5 rounded bg-surface-container-low text-on-surface font-label-sm text-label-sm focus:outline-none">
                <option>Tous les statuts</option>
                <option>En attente avis assistant social</option>
                <option>Accord commission sociale</option>
                <option>En attente signature DRH</option>
                <option>Décaissé Trésor</option>
              </select>
            </div>
          </div>
          {/* Table Section */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md uppercase tracking-wider">
                  <th className="py-3 px-4">Réf. Dossier</th>
                  <th className="py-3 px-4">Date Dépôt</th>
                  <th className="py-3 px-4">Type de Prestation</th>
                  <th className="py-3 px-4">Montant Sollicité</th>
                  <th className="py-3 px-4">{"Circuit d'Approbation & Statut"}</th>
                  <th className="py-3 px-4">Échéance Mandat</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-0">{agent.prestations.length ? (
                pagePrestations.visibles.map((prestation) => <LignePrestation key={prestation.id} prestation={prestation} nom={agent.nom_complet} />)
              ) : (
                <tr>
                  <td className="py-6 px-4 text-on-surface-variant" colSpan={7}>Aucune prestation n'est versée à ce dossier.</td>
                </tr>
              )}</tbody>
            </table>
          </div>
          {/* Pagination & Statutory Notice */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 text-on-surface-variant font-label-sm text-label-sm">
            <div className="flex items-center gap-2">
              <span>Affichage de {v.comptePrestations}</span>
              {" "}
              <span className="px-2 py-0.5 rounded bg-surface-container font-code-num text-primary font-bold">
                Base de Données SIGRH-Sociale
              </span>
            </div>
            <Pagination page={pagePrestations.page} pages={pagePrestations.pages} total={pagePrestations.total} aller={pagePrestations.aller} libelle="requête" />
          </div>
        </div>
        {/* Official Protocol Certification Footer Note */}
        <div className="p-4 rounded bg-surface-container-lowest shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">verified_user</span>
            <div>
              <span className="font-label-md text-label-md font-bold text-on-surface block">
                {"Visa Contrôle Financier & Direction de la Solde"}
              </span>
              {" "}
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Toute prestation ou retenue au titre des prêts bonifiés fait l'objet d'un arrêté interministériel certifié avec empreinte PKI souveraine.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-code-num text-label-sm text-primary font-bold">Certificat ID: CI-SIGRH-AS-77402-2026</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Ayant({ ayant }: { ayant: Dossier["social"]["ayants_droit"][number] }) {
  const pastille = ayant.lien === "Conjoint" ? "bg-primary-container/20 text-primary" : "bg-secondary-fixed text-on-secondary-fixed";
  return (
    <div className="p-3 rounded bg-surface-container-low flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-10 h-10 rounded-full ${pastille} flex items-center justify-center font-bold text-label-md shrink-0`}>{ayant.initiales}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-label-md text-label-md font-bold text-on-surface truncate">{ayant.nom}</span>
            <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-label-sm text-label-sm">{ayant.lien}</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate font-code-num">{ayant.detail}</p>
        </div>
      </div>
      <span className="px-2 py-0.5 rounded bg-primary-container/15 text-primary font-label-sm text-label-sm font-bold shrink-0">{ayant.statut}</span>
    </div>
  );
}

function LignePrestation({ prestation, nom }: { prestation: Dossier["prestations"][number]; nom: string }) {
  return (
    <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-3 px-4 font-code-num text-code-num font-bold text-primary">{prestation.reference}</td>
      <td className="py-3 px-4 text-on-surface-variant">{dateFr(prestation.date_demande)}</td>
      <td className="py-3 px-4">
        <div className="font-label-md text-label-md font-bold text-on-surface">{prestation.nature}</div>
        <div className="text-on-surface-variant font-body-sm text-label-sm">{prestation.objet}</div>
      </td>
      <td className="py-3 px-4 font-code-num text-code-num font-bold text-on-surface">{groupe(prestation.montant)} FCFA</td>
      <td className="py-3 px-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
          {prestation.statut}
        </span>
        <div className="text-on-surface-variant font-label-sm text-label-sm mt-0.5">{prestation.echeancier || prestation.objet}</div>
      </td>
      <td className="py-3 px-4 text-on-surface-variant font-code-num text-label-sm">{prestation.echeancier || "—"}</td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors" title="Voir bordereau d'instruction" type="button" data-soon={`La consultation s'ouvre dans le dossier de ${nom}.`}>
            <span className="material-symbols-outlined text-lg">visibility</span>
          </button>
          <button className="p-1 rounded bg-primary-container text-on-primary hover:bg-primary transition-colors" title="Visa Direct DRH" type="button" data-soon={`Le visa de cette prestation sera versé au circuit de ${nom}.`}>
            <span className="material-symbols-outlined text-lg">done</span>
          </button>
        </div>
      </td>
    </tr>
  );
}
