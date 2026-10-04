import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Children, useEffect, useState, type ReactNode } from "react";
import { ApiError, api, telecharger } from "../api/client";
import type { EntiteTutelle } from "../api/types";
import { optionsEntites } from "../ui/Entites";
import { telechargerClasseurGraphique, telechargerClasseurTableau } from "../ui/classeurGraphique";
import { GraphiqueChoisi, type FormeGraphique } from "../ui/Graphique";
import { nombre } from "../ui/format";
import { useFeedback } from "../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { AppChrome } from "./AppChrome";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex-1 space-y-6";
const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline shadow-sm";
const CHAMP = "h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const APERCU = 4;
const PAGE_TABLEAU = 8;

type Serie = { libelle: string; total: number };
type Branche = { code: string; libelle: string; effectif: number; plafond: number; occupation: number };
type Passerelle = { cedant: string; recepteur: string; effectif: number; statut: string };
type Ligne = {
  code: string;
  nom: string;
  pole: string;
  pole_libelle: string;
  effectif: number;
  cadres: number;
  part_cadres: number;
  departs: number;
  femmes: number;
  hommes: number;
  parite: number;
  risque: string;
};
type Kpi = {
  dossiers: number;
  effectif_officiel: number | null;
  plafond: number | null;
  occupation: number | null;
  actes_carriere: number;
  actes_valides: number;
  femmes: number;
  hommes: number;
  parite: number;
  postes_signales: number;
  vacance: number | null;
  disponibilite: number;
  absents: number;
  departs: number;
  encadrement: number;
};
type Ecart = { total: number | null; precedent: number | null; ecart: number | null };
type SerieAnnuelle = {
  code: string;
  libelle: string;
  unite: "nombre" | "note";
  valeurs: { annee: number; total: number | null }[];
  ecart: Ecart;
};
type Statistiques = {
  exercice: number;
  exercices: number[];
  filtre: boolean;
  structures: number;
  poles: number;
  kpi: Kpi;
  flux: Record<string, Ecart>;
  comparaison: SerieAnnuelle[];
  perimetre: EntiteTutelle[];
  repartition: Serie[];
  ages: Serie[];
  mobilites: Serie[];
  passerelles: Passerelle[];
  absences: Serie[];
  branches: Branche[];
  lignes: Ligne[];
  domaines: Serie[];
  circuits: Serie[];
  corps: Serie[];
  situations: Serie[];
  mentions: Serie[];
  sanctions_nature: Serie[];
  retraites: Serie[];
  par_pole: { nom: string; structures: number }[];
  conges: { acquis: number; consommes: number; reliquat_moyen: number };
};

function requete(structure: string, segment: string, exercice: string): string {
  const params = new URLSearchParams();
  if (structure) params.set("structure", structure);
  if (segment) params.set("segment", segment);
  if (exercice) params.set("exercice", exercice);
  const texte = params.toString();
  return texte ? `?${texte}` : "";
}

function teinteRisque(risque: string): string {
  if (risque === "Élevé") return "text-error font-semibold";
  if (risque === "Modéré") return "text-secondary font-semibold";
  if (risque === "Faible") return "text-primary font-semibold";
  return "text-on-surface-variant";
}

function ecartTexte(ecart: Ecart | undefined, decimales = 0): string {
  if (!ecart || ecart.ecart == null) return "—";
  const absolu = nombre(Math.abs(ecart.ecart), decimales);
  if (ecart.ecart > 0) return `+${absolu}`;
  if (ecart.ecart < 0) return `−${absolu}`;
  return nombre(0, decimales);
}

function aujourdhui(): string {
  const date = new Date();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${jour}`;
}

export function StatistiquesScreen() {
  const feedback = useFeedback();
  const client = useQueryClient();
  const [structure, setStructure] = useState("");
  const [segment, setSegment] = useState("");
  const [exercice, setExercice] = useState("");
  const [plan, setPlan] = useState(false);
  const [echeance, setEcheance] = useState(aujourdhui);
  const [objet, setObjet] = useState("");

  const page = useQuery({
    queryKey: ["statistiques", structure, segment, exercice],
    queryFn: () => api<Statistiques>(`/api/v1/statistiques/${requete(structure, segment, exercice)}`),
    placeholderData: keepPreviousData,
  });

  const planifier = useMutation({
    mutationFn: (corps: { echeance: string; objet: string }) =>
      api<{ detail: string }>("/api/v1/statistiques/planifier/", { method: "POST", body: JSON.stringify(corps) }),
    onSuccess: (reponse) => {
      setPlan(false);
      void client.invalidateQueries({ queryKey: ["notifications"] });
      feedback.toast("Point planifié", reponse.detail);
    },
  });

  async function exporter(format: "xlsx" | "pdf", code = structure) {
    const nom = format === "xlsx" ? "statistiques.xlsx" : "synthese-statistiques.pdf";
    await feedback.run(
      format === "xlsx" ? "Préparation du classeur…" : "Préparation de la synthèse…",
      () => telecharger(`/api/v1/statistiques/export/${format}/${requete(code, segment, exercice)}`, nom),
      { error: "L'export n'a pas abouti." },
    );
  }

  const data = page.data;

  return (
    <AppChrome>
      <div className={PAGE}>
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="font-headline-md text-headline-md text-on-surface">Statistiques</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {data
                ? `Exercice ${data.exercice} comparé à ${data.exercice - 1} · ${nombre(data.structures)} structures · ${nombre(data.poles)} pôles · ${nombre(data.kpi.dossiers)} dossiers`
                : "Effectifs, parité, relève et plafonds d'emplois."}
            </p>
          </div>
          <div className="flex flex-col xl:flex-row xl:items-end gap-3">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
                Exercice
                <select className={CHAMP} value={exercice || String(data?.exercice ?? "")} aria-label="Exercice" disabled={!data} onChange={(event) => setExercice(event.target.value)}>
                  {(data?.exercices ?? []).map((annee) => <option key={annee} value={annee}>{annee}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant min-w-0 sm:min-w-[16rem] sm:flex-1">
                Structure
                <select className={CHAMP} value={structure} aria-label="Structure" onChange={(event) => setStructure(event.target.value)}>
                  <option value="">Toutes les structures</option>
                  {optionsEntites(data?.perimetre ?? [])}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
                Segment
                <select className={CHAMP} value={segment} aria-label="Segment statutaire" onChange={(event) => setSegment(event.target.value)}>
                  <option value="">Tous les grades</option>
                  <option value="A">Catégorie A</option>
                  <option value="B">Catégorie B</option>
                  <option value="C">Catégories C et D</option>
                </select>
              </label>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 self-end sm:w-fit sm:grid-cols-2">
              <button type="button" className={`${BOUTON_SECONDAIRE} w-full`} onClick={() => void exporter("xlsx")}>
                <span className="material-symbols-outlined text-lg">table</span>
                Données (XLSX)
              </button>
              <button type="button" className={`${BOUTON_SECONDAIRE} w-full`} onClick={() => void exporter("pdf")}>
                <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                Synthèse (PDF)
              </button>
              <button type="button" className={`${BOUTON_PRIMAIRE} w-full`} onClick={() => void page.refetch()} disabled={page.isFetching}>
                <span className="material-symbols-outlined text-lg">refresh</span>
                Actualiser
              </button>
              <button type="button" className={`${BOUTON_SECONDAIRE} w-full`} onClick={() => { planifier.reset(); setEcheance(aujourdhui()); setObjet(""); setPlan(true); }}>
                <span className="material-symbols-outlined text-lg">schedule_send</span>
                Planifier au Cabinet
              </button>
            </div>
          </div>
        </header>

        {page.isLoading && <p className="text-on-surface-variant">Chargement des statistiques…</p>}
        {page.isError && <p className="text-error">{page.error instanceof ApiError ? page.error.message : "Les statistiques n'ont pas pu être chargées."}</p>}

        {data && (
          <>
            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <Indicateur
                libelle="Effectif consolidé"
                icone="groups"
                barre="bg-primary-container"
                valeur={data.kpi.effectif_officiel != null ? nombre(data.kpi.effectif_officiel) : nombre(data.kpi.dossiers)}
                detail={data.kpi.effectif_officiel != null ? "Effectif porté par les plafonds d'emplois" : "Dossiers correspondant au filtre"}
                gauche={data.kpi.plafond != null ? `Plafond : ${nombre(data.kpi.plafond)}` : `${nombre(data.kpi.dossiers)} dossiers`}
                droite={data.kpi.occupation != null ? `${nombre(data.kpi.occupation, 1)} % occupés` : "Filtre actif"}
              />
              <Indicateur
                libelle="Actes de carrière"
                icone="military_tech"
                barre="bg-secondary-container"
                valeur={nombre(data.kpi.actes_carriere)}
                detail={`Actes de carrière enregistrés en ${data.exercice}`}
                gauche={`${nombre(data.kpi.actes_valides)} validés`}
                droite={`${ecartTexte(data.flux.actes_carriere)} vs ${data.exercice - 1}`}
              />
              <Indicateur
                libelle="Parité"
                icone="diversity_3"
                barre="bg-primary"
                valeur={`${nombre(data.kpi.parite, 1)} %`}
                detail="Part des femmes dans les dossiers du filtre"
                gauche={`${nombre(data.kpi.femmes)} femmes`}
                droite={`${nombre(data.kpi.hommes)} hommes`}
              />
              <Indicateur
                libelle="Relève"
                icone="warning"
                barre="bg-secondary"
                valeur={nombre(data.kpi.departs)}
                detail={`Agents atteignant 60 ans en ${data.exercice + 1}`}
                gauche={`${nombre(data.kpi.postes_signales)} postes signalés`}
                droite={data.kpi.vacance != null ? `Vacance ${nombre(data.kpi.vacance, 1)} %` : "Au ministère"}
              />
              <Indicateur
                libelle="Disponibilité"
                icone="task_alt"
                barre="bg-primary-container"
                valeur={`${nombre(data.kpi.disponibilite, 1)} %`}
                detail="Dossiers sans absence en cours"
                gauche={`${nombre(data.kpi.absents)} absents`}
                droite={data.kpi.dossiers ? `${nombre(100 - data.kpi.disponibilite, 1)} % absents` : "—"}
              />
            </section>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              L'effectif, la parité, les âges et les congés décrivent les dossiers actuels. Les actes, absences, notations, sanctions et demandes suivent l'exercice {data.exercice}.
            </p>

            <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              <Indicateur
                libelle="Actes de l'exercice"
                icone="description"
                barre="bg-primary-container"
                valeur={nombre(data.flux.actes?.total ?? 0)}
                detail="Tous domaines confondus"
                gauche={`${nombre(data.flux.jours_absence?.total ?? 0)} jours d'absence`}
                droite={`${ecartTexte(data.flux.actes)} vs ${data.exercice - 1}`}
              />
              <Indicateur
                libelle="Absences ouvertes"
                icone="event_busy"
                barre="bg-secondary"
                valeur={nombre(data.flux.absences?.total ?? 0)}
                detail={`Débutées en ${data.exercice}`}
                gauche={`${nombre(data.flux.procedures?.total ?? 0)} procédures`}
                droite={`${ecartTexte(data.flux.absences)} vs ${data.exercice - 1}`}
              />
              <Indicateur
                libelle="Note moyenne"
                icone="star"
                barre="bg-primary"
                valeur={data.flux.notations?.total ? nombre(data.flux.note_moyenne?.total ?? 0, 2) : "—"}
                detail={data.flux.notations?.total ? `${nombre(data.flux.notations.total ?? 0)} notations` : `Aucune notation en ${data.exercice}`}
                gauche={`${nombre(data.flux.inscriptions?.total ?? 0)} inscriptions`}
                droite={data.flux.note_moyenne?.ecart == null ? "—" : `${ecartTexte(data.flux.note_moyenne, 2)} pt`}
              />
              <Indicateur
                libelle="Sanctions"
                icone="gavel"
                barre="bg-secondary-container"
                valeur={nombre(data.flux.sanctions?.total ?? 0)}
                detail={`Prononcées en ${data.exercice}`}
                gauche={`${nombre(data.flux.postes_sensibles?.total ?? 0)} postes sensibles`}
                droite={`${ecartTexte(data.flux.sanctions)} vs ${data.exercice - 1}`}
              />
              <Indicateur
                libelle="Demandes"
                icone="edit_note"
                barre="bg-tertiary-container"
                valeur={nombre(data.flux.demandes?.total ?? 0)}
                detail={`Déposées en ${data.exercice}`}
                gauche={`Congés : ${nombre(data.conges.reliquat_moyen, 1)} j restants`}
                droite={`${ecartTexte(data.flux.demandes)} vs ${data.exercice - 1}`}
              />
            </section>

            <BlocCompositions />

            <section className={`${CARTE} p-6`}>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Comparaison {data.exercice} / {data.exercice - 1}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">L'exercice choisi est comparé à l'année précédente, sur les dossiers du filtre.</p>
              <GraphiqueChoisi
                titre={`Comparaison ${data.exercice} / ${data.exercice - 1}`}
                detail="L'exercice choisi est comparé à l'année précédente, sur les dossiers du filtre. Seuls les indicateurs comptés en nombre sont tracés."
                defaut="ligne"
                series={[
                  {
                    nom: String(data.exercice - 1),
                    points: data.comparaison.filter((serie) => serie.unite === "nombre").map((serie) => ({ libelle: serie.libelle, total: serie.ecart.precedent ?? 0 })),
                  },
                  {
                    nom: String(data.exercice),
                    points: data.comparaison.filter((serie) => serie.unite === "nombre").map((serie) => ({ libelle: serie.libelle, total: serie.ecart.total ?? 0 })),
                  },
                ]}
              />
            </section>

            <SeriesPluri series={data.comparaison} exercice={data.exercice} />

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Bloc titre="Actes par domaine" detail={`Enregistrements ${data.exercice}`} series={data.domaines} defaut="anneau" />
              <Bloc titre="Demandes par circuit" detail={`Dépôts ${data.exercice}`} series={data.circuits} defaut="horizontale" />
              <Bloc titre="Corps" detail="Dossiers actuels du filtre" series={data.corps} defaut="secteur" />
              <Bloc titre="Situations" detail="Dossiers actuels du filtre" series={data.situations} defaut="points" />
              <Bloc titre="Mentions de notation" detail={`Exercice ${data.exercice}`} series={data.mentions} defaut="barre" />
              <Bloc titre="Sanctions par nature" detail={`Prononcées en ${data.exercice}`} series={data.sanctions_nature} defaut="entonnoir" />
              <Bloc titre="Dossiers de retraite" detail="Instruction en cours, hors exercice" series={data.retraites} defaut="aire" />
              <Bloc titre="Structures par pôle" detail="Répartition actuelle du ministère" series={data.par_pole.map((item) => ({ libelle: item.nom, total: item.structures }))} defaut="empilee" />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <article className={`${CARTE} p-6`}>
                <div className="flex items-start justify-between gap-3 pb-4">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary-container">badge</span>
                      Répartition par catégorie
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Grades des dossiers du filtre.</p>
                  </div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant shrink-0">{nombre(data.kpi.dossiers)} dossiers</p>
                </div>
                <GraphiqueChoisi titre="Répartition par catégorie" detail="Grades des dossiers du filtre." defaut="horizontale" series={[{ nom: "Dossiers", points: data.repartition.filter((item) => item.total > 0) }]} />
                <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">
                  Encadrement (catégorie A) : <span className="text-primary font-semibold">{nombre(data.kpi.encadrement, 1)} %</span>
                </p>
              </article>
              <article className={`${CARTE} p-6`}>
                <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">hourglass_top</span>
                  Âges et départs
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {nombre(data.kpi.departs)} départ{data.kpi.departs > 1 ? "s" : ""} à 60 ans en {data.exercice + 1}.
                </p>
                <GraphiqueChoisi titre="Âges et départs" detail={`Âges des dossiers du filtre. ${nombre(data.kpi.departs)} départ${data.kpi.departs > 1 ? "s" : ""} à 60 ans en ${data.exercice + 1}.`} defaut="anneau" series={[{ nom: "Âges", points: data.ages.filter((item) => item.total > 0) }]} />
              </article>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <article className={`${CARTE} p-6`}>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Plafonds d'emplois</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Effectif et plafond de chaque pôle, indépendants du filtre.</p>
                <GraphiqueChoisi
                  titre="Plafonds d'emplois"
                  detail="Effectif et plafond de chaque pôle, indépendants du filtre."
                  defaut="empilee"
                  series={[
                    { nom: "Effectif", points: data.branches.map((item) => ({ libelle: item.libelle, total: item.effectif })) },
                    { nom: "Plafond", points: data.branches.map((item) => ({ libelle: item.libelle, total: item.plafond })) },
                  ]}
                />
              </article>
              <article className={`${CARTE} p-6`}>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Mouvements de dotation</h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Demandes enregistrées au ministère.</p>
                <Barres titre="Mouvements de dotation" detail="Demandes enregistrées au ministère." series={data.mobilites} defaut="points" />
                {data.passerelles.length > 0 && (
                  <ListeRepliee className="mt-4 space-y-2">
                    {data.passerelles.map((item) => (
                      <li key={`${item.cedant}-${item.recepteur}`} className="font-body-sm text-body-sm text-on-surface">
                        {item.cedant} → {item.recepteur}
                        <span className="text-on-surface-variant"> · {nombre(item.effectif)} · {item.statut}</span>
                      </li>
                    ))}
                  </ListeRepliee>
                )}
              </article>
            </section>

            <article className={`${CARTE} p-6`}>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Absences</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Absences ouvertes en {data.exercice} sur les dossiers du filtre.</p>
              {data.absences.length === 0 ? (
                <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Aucune absence enregistrée pour ce filtre.</p>
              ) : (
                  <Barres titre="Absences" detail={`Absences ouvertes en ${data.exercice} sur les dossiers du filtre.`} series={data.absences} defaut="aire" />
              )}
            </article>

            <MatriceStructures lignes={data.lignes} />
          </>
        )}
      </div>

      {plan && (
        <Modale
          titre="Planifier au Cabinet"
          sousTitre="Le point est ajouté à vos notifications."
          icone="schedule_send"
          onClose={() => setPlan(false)}
          onSubmit={() => planifier.mutate({ echeance, objet })}
          libelleValider="Planifier"
          enCours={planifier.isPending}
          erreur={planifier.error instanceof ApiError ? planifier.error.message : planifier.isError ? "La planification n'a pas abouti." : undefined}
        >
          <label className="block font-label-md text-label-md text-on-surface">
            Date du point
            <input className={`${CHAMP} w-full mt-1`} type="date" name="echeance" required min={aujourdhui()} value={echeance} onChange={(event) => setEcheance(event.target.value)} />
          </label>
          <label className="block mt-4 font-label-md text-label-md text-on-surface">
            Objet
            <textarea className={`${CHAMP} w-full mt-1 h-24 py-2`} name="objet" required maxLength={240} value={objet} onChange={(event) => setObjet(event.target.value)} placeholder="Point sur les effectifs et la relève" />
          </label>
        </Modale>
      )}
    </AppChrome>
  );
}

function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function usePages<T>(lignes: T[], signature: string, taille = PAGE_TABLEAU) {
  const [page, setPage] = useState(0);
  const [vue, setVue] = useState(signature);
  const reinitialise = vue !== signature;
  if (reinitialise) {
    setVue(signature);
    setPage(0);
  }
  const pages = Math.max(1, Math.ceil(lignes.length / taille));
  const courante = Math.min(reinitialise ? 0 : page, pages - 1);
  return {
    page: courante,
    pages,
    visibles: lignes.slice(courante * taille, courante * taille + taille),
    aller: setPage,
  };
}

function Pages({ page, pages, total, aller }: { page: number; pages: number; total: number; aller: (page: number) => void }) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-hairline">
      <p className="font-label-sm text-label-sm text-on-surface-variant">{nombre(total)} ligne{total > 1 ? "s" : ""}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" className={BOUTON_SECONDAIRE} disabled={page === 0} onClick={() => aller(page - 1)}>Précédent</button>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Page {page + 1} / {pages}</span>
          <button type="button" className={BOUTON_SECONDAIRE} disabled={page >= pages - 1} onClick={() => aller(page + 1)}>Suivant</button>
        </div>
      )}
    </div>
  );
}

function ListeRepliee({ children, className = "mt-4 space-y-4" }: { children: ReactNode; className?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const plats = Children.toArray(children);
  const visibles = ouvert ? plats : plats.slice(0, APERCU);
  const reste = plats.length - APERCU;
  return (
    <div>
      <ul className={className}>{visibles}</ul>
      {reste > 0 && (
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-between rounded border border-hairline px-3 py-2 font-label-md text-label-md text-primary hover:bg-surface-container-low"
          aria-expanded={ouvert}
          onClick={() => setOuvert((valeur) => !valeur)}
        >
          {ouvert ? "Replier" : `Afficher les ${reste} autres`}
          <span className="material-symbols-outlined">{ouvert ? "expand_less" : "expand_more"}</span>
        </button>
      )}
    </div>
  );
}

function BoutonExport({ titre, onClick }: { titre: string; onClick: () => void }) {
  return (
    <button type="button" className={`${BOUTON_SECONDAIRE} shrink-0`} aria-label={`Exporter ${titre} en Excel`} onClick={onClick}>
      <span className="material-symbols-outlined text-lg">download</span>
      Exporter
    </button>
  );
}

function exporterSeries(series: SerieAnnuelle[], annees: number[], exercice: number, recherche: string, famille: string) {
  const indice = annees.indexOf(exercice);
  const reperes: { libelle: string; valeur: string | number }[] = [{ libelle: "Exercice surligné", valeur: exercice }];
  if (recherche.trim()) reperes.push({ libelle: "Recherche", valeur: recherche.trim() });
  if (famille) reperes.push({ libelle: "Type", valeur: famille === "note" ? "Notes" : "Effectifs et volumes" });
  telechargerClasseurTableau({
    titre: "Séries pluriannuelles",
    detail: "Indicateurs suivis sur toutes les années où un mouvement est enregistré, pour les dossiers du filtre en cours.",
    lecture: "Chaque ligne est un indicateur. Les colonnes d'années en donnent la valeur. Le fichier reprend toutes les lignes qui correspondent à la recherche et au type choisis, pas seulement la page affichée.",
    colonnes: [
      { entete: "Indicateur", texte: "Nom de la série suivie d'une année sur l'autre.", genre: "texte" },
      { entete: "Unité", texte: "Nombre pour un volume ou un effectif. Note pour une moyenne de notation.", genre: "texte" },
      ...annees.map((annee) => ({
        entete: String(annee),
        texte: annee === exercice
          ? `Valeur enregistrée en ${annee}, l'exercice affiché à l'écran. L'en-tête de cette colonne est orange. Une cellule vide signifie qu'aucun mouvement n'est enregistré : ce n'est pas un zéro.`
          : `Valeur enregistrée en ${annee}. Une cellule vide signifie qu'aucun mouvement n'est enregistré : ce n'est pas un zéro.`,
        genre: "nombre" as const,
      })),
      { entete: "Écart", texte: `Valeur de ${exercice} moins celle de ${exercice - 1}. La cellule est vide si l'une des deux années n'a pas de donnée. Un nombre négatif indique une baisse.`, genre: "nombre" },
    ],
    lignes: series.map((serie) => [
      serie.libelle,
      serie.unite === "note" ? "Note" : "Nombre",
      ...annees.map((annee) => serie.valeurs.find((point) => point.annee === annee)?.total ?? null),
      serie.ecart.ecart,
    ]),
    surligne: indice >= 0 ? indice + 2 : undefined,
    reperes,
  });
}

function exporterMatrice(lignes: Ligne[], filtre: { recherche: string; pole: string; risque: string; effectif: string }) {
  const reperes: { libelle: string; valeur: string | number }[] = [];
  if (filtre.recherche.trim()) reperes.push({ libelle: "Recherche", valeur: filtre.recherche.trim() });
  if (filtre.pole) reperes.push({ libelle: "Pôle", valeur: filtre.pole });
  if (filtre.risque) reperes.push({ libelle: "Risque", valeur: filtre.risque });
  if (filtre.effectif) reperes.push({ libelle: "Effectif", valeur: filtre.effectif === "avec" ? "Avec dossiers" : "Sans dossier" });
  telechargerClasseurTableau({
    titre: "Matrice par structure",
    detail: "Structures du ministère et dossiers dont la structure correspond.",
    lecture: "Chaque ligne est une structure du ministère, rattachée à son pôle. Le fichier reprend toutes les lignes qui correspondent aux filtres, pas seulement la page affichée.",
    colonnes: [
      { entete: "Structure", texte: "Nom de la structure du ministère.", genre: "texte" },
      { entete: "Pôle", texte: "Pôle ministériel de rattachement.", genre: "texte" },
      { entete: "Effectif réel", texte: "Nombre de dossiers dont la structure ou la direction correspond à cette structure.", genre: "nombre", somme: true },
      { entete: "Cadres A", texte: "Dossiers classés en catégorie A.", genre: "nombre", somme: true },
      { entete: "Part cadres A (%)", texte: "Part des cadres A dans l'effectif réel, en pourcentage arrondi au dixième. Cette colonne n'est pas additionnée.", genre: "nombre" },
      { entete: "Départs N+1", texte: "Dossiers qui atteignent 60 ans l'année suivant l'exercice affiché.", genre: "nombre", somme: true },
      { entete: "Femmes", texte: "Dossiers de sexe féminin.", genre: "nombre", somme: true },
      { entete: "Hommes", texte: "Dossiers de sexe masculin.", genre: "nombre", somme: true },
      { entete: "Parité femmes (%)", texte: "Part des femmes dans l'effectif réel, en pourcentage arrondi au dixième. Cette colonne n'est pas additionnée.", genre: "nombre" },
      { entete: "Risque relève", texte: "Élevé si plus d'un quart des dossiers a plus de 55 ans, Modéré de 10 à 25 %, Faible en dessous. Un tiret signifie qu'aucun dossier n'est rattaché.", genre: "texte" },
    ],
    lignes: lignes.map((ligne) => [ligne.nom, ligne.pole_libelle, ligne.effectif, ligne.cadres, ligne.part_cadres, ligne.departs, ligne.femmes, ligne.hommes, ligne.parite, ligne.risque]),
    reperes,
  });
}

function detailComposition(resultat: ResultatComposition): string {
  const croisement = resultat.colonnes
    ? `${resultat.lignes.libelle}, par rapport à ${resultat.colonnes.libelle}`
    : resultat.lignes.libelle;
  const lecture = resultat.lecture ? `${resultat.lecture} ` : "";
  return `${lecture}${resultat.sujet.libelle}. Mesure : ${resultat.mesure.libelle}. Répartition : ${croisement}.`;
}

function exporterComposition(titre: string, resultat: ResultatComposition) {
  const detail = detailComposition(resultat);
  if (resultat.tableau) {
    const tableau = resultat.tableau;
    const grand = tableau.lignes.reduce((somme, ligne) => somme + ligne.total, 0);
    const enteteTotal = tableau.colonnes.includes("Total") ? "Total de la ligne" : "Total";
    const entetePart = tableau.colonnes.includes("Part (%)") ? "Part de la ligne (%)" : "Part (%)";
    telechargerClasseurTableau({
      titre,
      detail,
      lecture: `Tableau de la composition « ${titre} ». Chaque ligne est une valeur de « ${resultat.lignes.libelle} ». Les autres colonnes chiffrent la mesure « ${resultat.mesure.libelle} ».`,
      colonnes: [
        { entete: resultat.lignes.libelle, texte: "Valeur de l'axe choisi pour les lignes.", genre: "texte" },
        ...tableau.colonnes.map((libelle) => ({
          entete: libelle,
          texte: resultat.colonnes ? `Valeur pour « ${libelle} » sur l'axe « ${resultat.colonnes.libelle} ».` : `Valeur pour « ${libelle} ».`,
          genre: "nombre" as const,
          somme: true,
        })),
        { entete: enteteTotal, texte: "Somme des colonnes de la ligne.", genre: "nombre" as const, somme: true },
        { entete: entetePart, texte: "Poids de la ligne dans le total général, en pourcentage arrondi au dixième. Cette colonne n'est pas additionnée.", genre: "nombre" as const },
      ],
      lignes: tableau.lignes.map((ligne) => [
        ligne.libelle,
        ...ligne.cellules,
        ligne.total,
        grand ? Math.round((ligne.total / grand) * 1000) / 10 : 0,
      ]),
      reperes: [
        { libelle: "Dossier", valeur: resultat.sujet.libelle },
        { libelle: "Mesure", valeur: resultat.mesure.libelle },
        { libelle: "Total général", valeur: resultat.total },
      ],
    });
    return;
  }
  if (resultat.series) {
    telechargerClasseurGraphique({
      titre,
      detail,
      series: [{ nom: resultat.mesure.libelle, points: resultat.series }],
    });
  }
}

function SeriesPluri({ series, exercice }: { series: SerieAnnuelle[]; exercice: number }) {
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState("");
  const correspond = series.filter((serie) => {
    if (famille && serie.unite !== famille) return false;
    return !recherche || normaliser(serie.libelle).includes(normaliser(recherche));
  });
  const { page, pages, visibles, aller } = usePages(correspond, `${recherche}|${famille}`);
  const annees = series[0]?.valeurs ?? [];
  return (
    <section className={`${CARTE} overflow-hidden`}>
      <div className="p-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Séries pluriannuelles</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Toutes les années où un mouvement est enregistré. L'exercice choisi est surligné.</p>
          </div>
          <BoutonExport titre="Séries pluriannuelles" onClick={() => exporterSeries(correspond, annees.map((point) => point.annee), exercice, recherche, famille)} />
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input className={`${CHAMP} flex-1`} value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher un indicateur" aria-label="Rechercher un indicateur" />
          <select className={CHAMP} value={famille} aria-label="Type d'indicateur" onChange={(event) => setFamille(event.target.value)}>
            <option value="">Tous les indicateurs</option>
            <option value="nombre">Effectifs et volumes</option>
            <option value="note">Notes</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Indicateur</th>
              {annees.map((point) => (
                <th key={point.annee} data-min={point.annee === exercice ? "" : undefined} className={`px-3 py-3 text-right ${point.annee === exercice ? "bg-primary-fixed text-primary" : ""}`}>{point.annee}</th>
              ))}
              <th className="px-4 py-3 text-right">Écart</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={annees.length + 2} className="px-4 py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Aucun indicateur ne correspond.</td>
              </tr>
            ) : visibles.map((serie) => (
              <tr key={serie.code} className="border-t border-hairline">
                <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface whitespace-nowrap">{serie.libelle}</td>
                {serie.valeurs.map((point) => (
                  <td key={point.annee} className={`px-3 py-3 text-right font-code-num text-code-num ${point.annee === exercice ? "bg-primary-fixed/60" : ""}`}>
                    {point.total == null ? "—" : nombre(point.total, serie.unite === "note" ? 2 : 0)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-code-num text-code-num">{ecartTexte(serie.ecart, serie.unite === "note" ? 2 : 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pages page={page} pages={pages} total={correspond.length} aller={aller} />
    </section>
  );
}

function MatriceStructures({ lignes }: { lignes: Ligne[] }) {
  const [recherche, setRecherche] = useState("");
  const [pole, setPole] = useState("");
  const [risque, setRisque] = useState("");
  const [effectif, setEffectif] = useState("");
  const poles = [...new Map(lignes.map((ligne) => [ligne.pole, ligne.pole_libelle])).entries()];
  const correspond = lignes.filter((ligne) => {
    if (pole && ligne.pole !== pole) return false;
    if (risque && ligne.risque !== risque) return false;
    if (effectif === "avec" && ligne.effectif === 0) return false;
    if (effectif === "sans" && ligne.effectif > 0) return false;
    if (recherche && !normaliser(`${ligne.nom} ${ligne.pole_libelle}`).includes(normaliser(recherche))) return false;
    return true;
  });
  const { page, pages, visibles, aller } = usePages(correspond, `${recherche}|${pole}|${risque}|${effectif}`);
  return (
    <section className={`${CARTE} overflow-hidden`}>
      <div className="p-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Matrice par structure</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Les lignes sont les structures du ministère, rattachées à leur pôle. L'effectif réel compte les dossiers dont la structure correspond.
            </p>
          </div>
          <BoutonExport titre="Matrice par structure" onClick={() => exporterMatrice(correspond, { recherche, pole: poles.find(([code]) => code === pole)?.[1] ?? "", risque, effectif })} />
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <input className={CHAMP} value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher une structure" aria-label="Rechercher une structure" />
          <select className={CHAMP} value={pole} aria-label="Filtrer par pôle" onChange={(event) => setPole(event.target.value)}>
            <option value="">Tous les pôles</option>
            {poles.map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
          </select>
          <select className={CHAMP} value={risque} aria-label="Filtrer par risque" onChange={(event) => setRisque(event.target.value)}>
            <option value="">Tous les risques</option>
            <option value="Élevé">Élevé</option>
            <option value="Modéré">Modéré</option>
            <option value="Faible">Faible</option>
            <option value="—">Sans dossier</option>
          </select>
          <select className={CHAMP} value={effectif} aria-label="Filtrer par effectif" onChange={(event) => setEffectif(event.target.value)}>
            <option value="">Tous les effectifs</option>
            <option value="avec">Avec dossiers</option>
            <option value="sans">Sans dossier</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Structure</th>
              <th className="px-4 py-3">Pôle</th>
              <th className="px-4 py-3 text-right" data-min="">Effectif réel</th>
              <th className="px-4 py-3 text-right">Cadres A</th>
              <th className="px-4 py-3 text-right">Départs N+1</th>
              <th className="px-4 py-3 text-right">Parité F/H</th>
              <th className="px-4 py-3">Risque relève</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Aucune structure ne correspond.</td>
              </tr>
            ) : visibles.map((ligne) => (
              <tr key={ligne.code} className="border-t border-hairline">
                <td className="px-4 py-3 font-body-md text-body-md text-on-surface">{ligne.nom}</td>
                <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">{ligne.pole_libelle}</td>
                <td className="px-4 py-3 text-right font-code-num text-code-num">{nombre(ligne.effectif)}</td>
                <td className="px-4 py-3 text-right font-code-num text-code-num">{nombre(ligne.cadres)} <span className="text-on-surface-variant">({nombre(ligne.part_cadres, 1)} %)</span></td>
                <td className="px-4 py-3 text-right font-code-num text-code-num">{nombre(ligne.departs)}</td>
                <td className="px-4 py-3 text-right font-code-num text-code-num">{nombre(ligne.femmes)} / {nombre(ligne.hommes)} <span className="text-on-surface-variant">({nombre(ligne.parite, 1)} %)</span></td>
                <td className={`px-4 py-3 font-label-md text-label-md ${teinteRisque(ligne.risque)}`}>{ligne.risque}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pages page={page} pages={pages} total={correspond.length} aller={aller} />
    </section>
  );
}

function Indicateur({ libelle, icone, barre, valeur, detail, gauche, droite }: {
  libelle: string;
  icone: string;
  barre: string;
  valeur: string;
  detail: string;
  gauche: string;
  droite: string;
}) {
  return (
    <article className={`${CARTE} p-5 relative overflow-hidden flex flex-col justify-between min-h-[10.5rem]`}>
      <span className={`absolute top-0 left-0 bottom-0 w-1 ${barre}`} />
      <div>
        <div className="flex items-center justify-between text-on-surface-variant">
          <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">{libelle}</span>
          <span className="material-symbols-outlined">{icone}</span>
        </div>
        <p className="mt-3 font-headline-lg text-headline-lg text-on-surface">{valeur}</p>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{detail}</p>
      </div>
      <p className="mt-4 -mx-5 -mb-5 px-5 py-2.5 bg-surface-container-low/60 flex items-center justify-between gap-2 font-label-sm text-label-sm text-on-surface-variant">
        <span>{gauche}</span>
        <span className="font-code-num text-code-num text-primary font-semibold">{droite}</span>
      </p>
    </article>
  );
}

function Barres({ series, defaut = "barre", titre, detail }: { series: Serie[]; defaut?: FormeGraphique; titre?: string; detail?: string }) {
  return <GraphiqueChoisi titre={titre} detail={detail} defaut={defaut} series={[{ nom: "Total", points: series.filter((item) => item.total > 0) }]} />;
}

function Bloc({ titre, detail, series, defaut }: { titre: string; detail: string; series: Serie[]; defaut: FormeGraphique }) {
  return (
    <article className={`${CARTE} p-6`}>
      <h2 className="font-headline-sm text-headline-sm text-on-surface">{titre}</h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{detail}</p>
      <Barres titre={titre} detail={detail} series={series} defaut={defaut} />
    </article>
  );
}

type CodeLibelle = { code: string; libelle: string };
type FiltreComposition = { dimension: string; valeur: string | null };
type ValeurAxe = { cle: string; libelle: string };
type SujetCatalogue = { code: string; libelle: string; combinable: boolean; axes: CodeLibelle[]; mesures: CodeLibelle[] };
type TableauCroise = { colonnes: string[]; lignes: { libelle: string; cellules: number[]; total: number }[] };
type ResultatComposition = {
  sujet: CodeLibelle;
  mesure: CodeLibelle;
  lignes: CodeLibelle;
  colonnes: CodeLibelle | null;
  total: number;
  series: Serie[] | null;
  tableau: TableauCroise | null;
  nom_propose?: string;
  lecture?: string;
};
type CompositionEnregistree = {
  id: number;
  nom: string;
  sujet: string;
  mesure: string;
  axe_lignes: string;
  axe_colonnes: string;
  filtres: FiltreComposition[];
  dossiers: string[];
  mien: boolean;
  auteur: string;
  resultat: ResultatComposition | null;
};
type Brouillon = {
  id: number | null;
  nom: string;
  dossiers: string[];
  mesure: string;
  lignes: string;
  colonnes: string;
  filtres: FiltreComposition[];
};

const BROUILLON_VIDE: Brouillon = {
  id: null,
  nom: "",
  dossiers: ["agents"],
  mesure: "nombre",
  lignes: "",
  colonnes: "",
  filtres: [],
};

function brouillonDepuis(item: CompositionEnregistree): Brouillon {
  return {
    id: item.id,
    nom: item.nom,
    dossiers: item.dossiers?.length ? item.dossiers : [item.sujet],
    mesure: item.mesure,
    lignes: item.axe_lignes,
    colonnes: item.axe_colonnes,
    filtres: item.filtres,
  };
}

function BlocCompositions() {
  const feedback = useFeedback();
  const client = useQueryClient();
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const page = useQuery({
    queryKey: ["compositions-statistiques"],
    queryFn: () => api<CompositionEnregistree[]>("/api/v1/statistiques/compositions/"),
  });

  async function supprimer(item: CompositionEnregistree) {
    const confirme = await feedback.confirm(`Retirer la composition « ${item.nom} » ?`, { confirmLabel: "Retirer" });
    if (!confirme) return;
    try {
      await feedback.run(
        "Retrait de la composition…",
        () => api(`/api/v1/statistiques/compositions/${item.id}/`, { method: "DELETE" }),
        { success: { title: "Composition retirée" }, error: "La composition n'a pas été retirée." },
      );
      void client.invalidateQueries({ queryKey: ["compositions-statistiques"] });
    } catch {
      /* le retour est déjà affiché */
    }
  }

  const liste = page.data ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Compositions</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Croisez des critères lus dans la base. Plusieurs dossiers peuvent être combinés dans la même statistique.
          </p>
        </div>
        <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setBrouillon(BROUILLON_VIDE)}>
          <span className="material-symbols-outlined text-lg">add</span>
          Composer
        </button>
      </div>

      {page.isLoading && <p className="text-on-surface-variant">Chargement des compositions…</p>}
      {page.isError && (
        <p className="text-error">{page.error instanceof ApiError ? page.error.message : "Les compositions n'ont pas pu être chargées."}</p>
      )}
      {page.data && liste.length === 0 && (
        <article className={`${CARTE} p-6`}>
          <p className="font-body-md text-body-md text-on-surface">Aucune composition enregistrée.</p>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            Les indicateurs au-dessus restent affichés. Composez-en un lorsque le périmètre n'est pas prévu d'avance.
          </p>
        </article>
      )}
      {liste.length > 0 && (
        <div className="space-y-6">
          {liste.map((item) => (
            <article key={item.id} className={`${CARTE} p-6 flex flex-col`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">{item.nom}</h3>
                  {!item.resultat && (
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Cette composition ne peut plus être calculée.</p>
                  )}
                  {!item.mien && <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{item.auteur}</p>}
                </div>
                {item.mien && (
                  <div className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      className="font-label-md text-label-md text-primary hover:underline"
                      onClick={() => setBrouillon(brouillonDepuis(item))}
                    >
                      Modifier
                    </button>
                    <button type="button" className="font-label-md text-label-md text-error hover:underline" onClick={() => void supprimer(item)}>
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
              {item.resultat && <ResultatStat resultat={item.resultat} nom={item.nom} />}
            </article>
          ))}
        </div>
      )}

      {brouillon && (
        <Compositeur
          initial={brouillon}
          onClose={() => setBrouillon(null)}
          onEnregistre={() => {
            setBrouillon(null);
            void client.invalidateQueries({ queryKey: ["compositions-statistiques"] });
          }}
        />
      )}
    </section>
  );
}

function Compositeur({ initial, onClose, onEnregistre }: { initial: Brouillon; onClose: () => void; onEnregistre: () => void }) {
  const feedback = useFeedback();
  const [nom, setNom] = useState(initial.nom);
  const [nomManuel, setNomManuel] = useState(Boolean(initial.nom));
  const [dossiers, setDossiers] = useState(initial.dossiers);
  const [mesure, setMesure] = useState(initial.mesure);
  const [lignes, setLignes] = useState(initial.lignes);
  const [colonnes, setColonnes] = useState(initial.colonnes);
  const [filtres, setFiltres] = useState(initial.filtres);
  const [ajout, setAjout] = useState("");
  const catalogue = useQuery({
    queryKey: ["catalogue-statistiques"],
    queryFn: () => api<{ sujets: SujetCatalogue[] }>("/api/v1/statistiques/catalogue/"),
  });
  const sujets = catalogue.data?.sujets ?? [];
  const plusieurs = dossiers.length > 1;
  const retenus = sujets.filter((item) => dossiers.includes(item.code));
  const axes = retenus.flatMap((sujet) => sujet.axes.map((axe) => ({
    code: plusieurs ? `${sujet.code}.${axe.code}` : axe.code,
    libelle: plusieurs ? `${sujet.libelle} — ${axe.libelle}` : axe.libelle,
  })));
  const mesures = plusieurs
    ? [{ code: "nombre", libelle: "Agents concernés" }]
    : (retenus[0]?.mesures ?? [{ code: "nombre", libelle: "Nombre" }]);
  const filtresActifs = filtres.filter((item): item is { dimension: string; valeur: string } => Boolean(item.dimension) && item.valeur !== null);
  const apercu = useQuery({
    queryKey: ["composer-statistiques", dossiers, mesure, lignes, colonnes, filtresActifs],
    queryFn: () => api<ResultatComposition>(urlComposer({ dossiers, mesure, lignes, colonnes, filtres: filtresActifs })),
    enabled: Boolean(dossiers.length && mesure && lignes),
  });
  const enregistrer = useMutation({
    mutationFn: () => {
      const corps = { nom, dossiers, mesure, axe_lignes: lignes, axe_colonnes: colonnes, filtres: filtresActifs };
      const chemin = initial.id ? `/api/v1/statistiques/compositions/${initial.id}/` : "/api/v1/statistiques/compositions/";
      return api<CompositionEnregistree>(chemin, { method: initial.id ? "PATCH" : "POST", body: JSON.stringify(corps) });
    },
    onSuccess: () => {
      feedback.toast(initial.id ? "Composition mise à jour" : "Composition enregistrée");
      onEnregistre();
    },
  });
  const proposition = apercu.data?.nom_propose ?? "";
  useEffect(() => {
    if (!nomManuel && proposition) setNom(proposition);
  }, [nomManuel, proposition]);
  const combinables = retenus.every((item) => item.combinable);
  const candidats = sujets.filter((item) => item.combinable && !dossiers.includes(item.code));

  function qualifier(code: string, origine: string): string {
    if (!code || code.includes(".")) return code;
    return `${origine}.${code}`;
  }

  function ajouterDossier(code: string) {
    if (!code || dossiers.includes(code) || dossiers.length >= 6) return;
    const origine = dossiers[0];
    setDossiers((liste) => [...liste, code]);
    setLignes((valeur) => qualifier(valeur, origine));
    setColonnes((valeur) => qualifier(valeur, origine));
    setFiltres((liste) => liste.map((filtre) => ({ ...filtre, dimension: qualifier(filtre.dimension, origine) })));
    setMesure("nombre");
    setAjout("");
  }

  function retirerDossier(code: string) {
    const suite = dossiers.filter((item) => item !== code);
    if (!suite.length) return;
    setDossiers(suite);
    const garde = (valeur: string) => !valeur.startsWith(`${code}.`);
    setLignes((valeur) => (garde(valeur) ? valeur : ""));
    setColonnes((valeur) => (garde(valeur) ? valeur : ""));
    setFiltres((liste) => liste.filter((filtre) => garde(filtre.dimension)));
    if (suite.length === 1) setMesure("nombre");
  }

  return (
    <Modale
      titre={initial.id ? "Modifier la composition" : "Composer une statistique"}
      sousTitre="Les dossiers choisis sont combinés dans une seule statistique. Les valeurs viennent de la base."
      icone="query_stats"
      taille="xl"
      onClose={onClose}
      onSubmit={() => enregistrer.mutate()}
      libelleValider="Enregistrer"
      enCours={enregistrer.isPending}
      erreur={enregistrer.error instanceof ApiError ? enregistrer.error.message : enregistrer.isError ? "L'enregistrement n'a pas abouti." : undefined}
    >
      <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
        Nom
        <input
          className={CHAMP}
          required
          maxLength={160}
          value={nom}
          onChange={(event) => {
            setNom(event.target.value);
            setNomManuel(event.target.value.trim().length > 0);
          }}
          placeholder="Le nom se propose dès que les axes sont choisis"
        />
        <span className="font-body-sm text-body-sm text-on-surface-variant">Proposé à partir des dossiers et des axes. Effacez-le pour retrouver la proposition.</span>
      </label>

      <div className="mt-4">
        <p className="font-label-md text-label-md text-on-surface">Dossiers combinés</p>
        {dossiers.length === 1 ? (
          <select
            className={`${CHAMP} mt-2`}
            aria-label="Dossier"
            value={dossiers[0]}
            onChange={(event) => {
              setDossiers([event.target.value]);
              setLignes("");
              setColonnes("");
              setFiltres([]);
              setMesure("nombre");
            }}
          >
            {sujets.map((item) => (
              <option key={item.code} value={item.code}>{item.libelle}</option>
            ))}
          </select>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {dossiers.map((code) => (
              <li key={code} className="inline-flex items-center gap-2 rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm text-on-surface">
                {sujets.find((item) => item.code === code)?.libelle ?? code}
                <button type="button" className="text-error" aria-label={`Retirer ${code}`} onClick={() => retirerDossier(code)}>×</button>
              </li>
            ))}
          </ul>
        )}
        {combinables && candidats.length > 0 && dossiers.length < 6 && (
          <label className="mt-3 flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
            Ajouter un dossier à la combinaison
            <select className={CHAMP} value={ajout} onChange={(event) => ajouterDossier(event.target.value)}>
              <option value="">Choisir…</option>
              {candidats.map((item) => (
                <option key={item.code} value={item.code}>{item.libelle}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
          Mesure
          <select className={CHAMP} required value={mesures.some((item) => item.code === mesure) ? mesure : mesures[0].code} onChange={(event) => setMesure(event.target.value)}>
            {mesures.map((item) => (
              <option key={item.code} value={item.code}>{item.libelle}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
          Réparti par
          <select
            className={CHAMP}
            required
            value={lignes}
            onChange={(event) => {
              const valeur = event.target.value;
              setLignes(valeur);
              if (colonnes === valeur) setColonnes("");
            }}
          >
            <option value="">Choisir…</option>
            {axes.map((item) => (
              <option key={item.code} value={item.code}>{item.libelle}</option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2 flex flex-col gap-1 font-label-md text-label-md text-on-surface">
          Par rapport à
          <select className={CHAMP} value={colonnes} onChange={(event) => setColonnes(event.target.value)}>
            <option value="">Un seul axe</option>
            {axes.filter((item) => item.code !== lignes).map((item) => (
              <option key={item.code} value={item.code}>{item.libelle}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-label-md text-label-md text-on-surface">Filtres</p>
          <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => setFiltres((liste) => [...liste, { dimension: "", valeur: null }])}>
            Ajouter un filtre
          </button>
        </div>
        {filtres.map((filtre, index) => (
          <FiltreLigne
            key={`${filtre.dimension}-${index}`}
            sujet={dossiers[0] ?? "agents"}
            axes={axes}
            filtre={filtre}
            onChange={(suivant) => setFiltres((liste) => liste.map((item, position) => (position === index ? suivant : item)))}
            onRetirer={() => setFiltres((liste) => liste.filter((_, position) => position !== index))}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-hairline pt-4">
        <h3 className="font-label-md text-label-md text-on-surface">Aperçu</h3>
        {!lignes && <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Choisissez l'axe de répartition pour voir le résultat.</p>}
        {apercu.isLoading && <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Calcul…</p>}
        {apercu.isError && (
          <p className="mt-2 text-error">{apercu.error instanceof ApiError ? apercu.error.message : "L'aperçu n'a pas pu être calculé."}</p>
        )}
        {apercu.data && <ResultatStat resultat={apercu.data} nom={nom} />}
      </div>
    </Modale>
  );
}

function urlComposer(corps: { dossiers: string[]; mesure: string; lignes: string; colonnes: string; filtres: { dimension: string; valeur: string }[] }): string {
  const params = new URLSearchParams({ dossiers: corps.dossiers.join(","), mesure: corps.mesure, lignes: corps.lignes });
  if (corps.colonnes) params.set("colonnes", corps.colonnes);
  if (corps.filtres.length) params.set("filtres", JSON.stringify(corps.filtres));
  return `/api/v1/statistiques/composer/?${params}`;
}

function cleAffichee(valeur: string | null): string {
  if (valeur === null) return "__aucun__";
  if (valeur === "") return "__vide__";
  return valeur;
}

function FiltreLigne({ sujet, axes, filtre, onChange, onRetirer }: {
  sujet: string;
  axes: CodeLibelle[];
  filtre: FiltreComposition;
  onChange: (filtre: FiltreComposition) => void;
  onRetirer: () => void;
}) {
  const point = filtre.dimension.indexOf(".");
  const sujetFiltre = point >= 0 ? filtre.dimension.slice(0, point) : sujet;
  const axeFiltre = point >= 0 ? filtre.dimension.slice(point + 1) : filtre.dimension;
  const valeurs = useQuery({
    queryKey: ["valeurs-statistiques", sujetFiltre, axeFiltre],
    queryFn: () => api<{ valeurs: ValeurAxe[] }>(`/api/v1/statistiques/catalogue/valeurs/?sujet=${encodeURIComponent(sujetFiltre)}&axe=${encodeURIComponent(axeFiltre)}`),
    enabled: Boolean(sujetFiltre && axeFiltre),
  });

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <select
        className={`${CHAMP} flex-1`}
        aria-label="Dimension du filtre"
        value={filtre.dimension}
        onChange={(event) => onChange({ dimension: event.target.value, valeur: null })}
      >
        <option value="">Choisir…</option>
        {axes.map((item) => (
          <option key={item.code} value={item.code}>{item.libelle}</option>
        ))}
      </select>
      <select
        className={`${CHAMP} flex-1`}
        aria-label="Valeur du filtre"
        value={cleAffichee(filtre.valeur)}
        onChange={(event) => {
          const choix = event.target.value;
          onChange({ ...filtre, valeur: choix === "__vide__" ? "" : choix === "__aucun__" ? null : choix });
        }}
      >
        <option value="__aucun__">Choisir…</option>
        {valeurs.data?.valeurs.map((item) => (
          <option key={item.cle || "__vide__"} value={item.cle === "" ? "__vide__" : item.cle}>{item.libelle}</option>
        ))}
      </select>
      <button type="button" className={BOUTON_SECONDAIRE} onClick={onRetirer}>Retirer</button>
    </div>
  );
}

function ResultatStat({ resultat, nom }: { resultat: ResultatComposition; nom?: string }) {
  const titre = nom?.trim() || resultat.nom_propose || `${resultat.sujet.libelle} — ${resultat.mesure.libelle}`;
  const exportable = Boolean(resultat.tableau || resultat.series);
  return (
    <div>
      <div className="mt-3 flex items-start justify-between gap-3">
        {resultat.lecture ? (
          <p className="rounded-lg bg-surface-container-low px-4 py-3 font-body-sm text-body-sm text-on-surface">{resultat.lecture}</p>
        ) : <span />}
        {exportable && <BoutonExport titre={titre} onClick={() => exporterComposition(titre, resultat)} />}
      </div>
      {resultat.tableau ? <Tableau resultat={resultat.tableau} coin={resultat.lignes.libelle} /> : resultat.series ? <Barres titre={titre} detail={detailComposition(resultat)} series={resultat.series} /> : (
        <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Aucune donnée pour cette composition.</p>
      )}
    </div>
  );
}

function Tableau({ resultat, coin }: { resultat: TableauCroise; coin: string }) {
  const [recherche, setRecherche] = useState("");
  const [remplies, setRemplies] = useState("");
  const correspond = resultat.lignes.filter((ligne) => {
    const texte = normaliser(`${ligne.libelle} ${ligne.cellules.join(" ")}`);
    if (recherche && !texte.includes(normaliser(recherche))) return false;
    if (remplies === "avec" && ligne.total <= 0) return false;
    if (remplies === "sans" && ligne.total > 0) return false;
    return true;
  });
  const { page, pages, visibles, aller } = usePages(correspond, `${recherche}|${remplies}`);
  if (resultat.lignes.length === 0) {
    return <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Aucune donnée pour cette composition.</p>;
  }
  return (
    <div className="mt-4">
      <div className="mb-3 flex flex-col sm:flex-row gap-2">
        <input className={`${CHAMP} flex-1`} value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher une ligne" aria-label="Rechercher dans le tableau" />
        <select className={CHAMP} value={remplies} aria-label="Filtrer les lignes" onChange={(event) => setRemplies(event.target.value)}>
          <option value="">Toutes les lignes</option>
          <option value="avec">Avec un total</option>
          <option value="sans">Sans total</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left">
          <thead className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">{coin}</th>
              {resultat.colonnes.map((colonne) => (
                <th key={colonne} className="px-3 py-2 text-right">{colonne}</th>
              ))}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={resultat.colonnes.length + 2} className="px-3 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Aucune ligne ne correspond.</td>
              </tr>
            ) : visibles.map((ligne) => (
              <tr key={ligne.libelle} className="border-t border-hairline">
                <th className="px-3 py-2 font-body-sm text-body-sm text-on-surface text-left font-semibold">{ligne.libelle}</th>
                {ligne.cellules.map((cellule, index) => (
                  <td key={`${ligne.libelle}-${resultat.colonnes[index]}`} className="px-3 py-2 text-right font-code-num text-code-num">{nombre(cellule)}</td>
                ))}
                <td className="px-3 py-2 text-right font-code-num text-code-num text-primary font-semibold">{nombre(ligne.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pages page={page} pages={pages} total={correspond.length} aller={aller} />
    </div>
  );
}
