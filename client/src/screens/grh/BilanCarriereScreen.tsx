import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { nombre } from "../../ui/format";
import { Kpi, PageGrh, Repartition, Section } from "./ui";

type Repart = { libelle: string; nombre: number; part: number }[];
type Bilan = {
  exercice: number;
  effectifs: { total: number; femmes: number; hommes: number; par_situation: Repart; par_categorie: Repart };
  mouvements: { total: number; par_nature: Repart };
  discipline: { procedures: number; ouvertes: number; classees: number; sanctions: number; premier_degre: number; second_degre: number; par_sanction: Repart };
  conges: { demandes: number; jours: number; par_nature: Repart };
  absences: { autorisations: number; jours: number; en_attente: number; par_type: Repart };
  sorties: { total: number; par_motif: Repart };
};

/** Bilan de la gestion de carrière : la vie administrative des agents sur l'exercice, tirée de la base. */
export function BilanCarriereScreen() {
  const bilan = useQuery({ queryKey: ["grh-bilan-carriere"], queryFn: () => api<Bilan>("/api/v1/grh/bilan-carriere/") });
  const b = bilan.data;
  return (
    <PageGrh
      rubrique="Gestion des carrières"
      titre="Bilan de la gestion de carrière"
      resume={b ? `Exercice ${b.exercice} : effectifs, mouvements, discipline, congés, absences et sorties.` : undefined}
      chargement={bilan.isLoading}
      erreur={bilan.isError ? "Le bilan n'a pas pu être chargé." : undefined}
    >
      {b ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="groups" libelle="Effectif" valeur={nombre(b.effectifs.total)} detail={`${nombre(b.effectifs.femmes)} femmes · ${nombre(b.effectifs.hommes)} hommes`} />
            <Kpi icone="swap_horiz" libelle="Actes de carrière" valeur={nombre(b.mouvements.total)} detail="Nominations, promotions, mutations…" />
            <Kpi icone="gavel" libelle="Procédures disciplinaires" valeur={nombre(b.discipline.procedures)} detail={`${nombre(b.discipline.ouvertes)} ouverte${b.discipline.ouvertes > 1 ? "s" : ""} · ${nombre(b.discipline.sanctions)} sanction${b.discipline.sanctions > 1 ? "s" : ""} sur l'exercice`} />
            <Kpi icone="military_tech" libelle="Sorties de carrière" valeur={nombre(b.sorties.total)} detail="Dossiers de fin de carrière instruits" />
          </section>
          <div className="grid gap-6 xl:grid-cols-2">
            <Section titre="Effectifs par situation" icone="badge"><Repartition lignes={b.effectifs.par_situation} /></Section>
            <Section titre="Effectifs par catégorie" icone="stacked_bar_chart"><Repartition lignes={b.effectifs.par_categorie} /></Section>
            <Section titre={`Parcours : actes de carrière ${b.exercice}`} icone="swap_horiz"><Repartition lignes={b.mouvements.par_nature} vide="Aucun acte de carrière enregistré sur l'exercice." /></Section>
            <Section titre="Sanctions disciplinaires prononcées" icone="gavel">
              <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">
                {nombre(b.discipline.premier_degre)} du 1er degré · {nombre(b.discipline.second_degre)} du 2nd degré · {nombre(b.discipline.classees)} procédure{b.discipline.classees > 1 ? "s" : ""} classée{b.discipline.classees > 1 ? "s" : ""} sans suite.
              </p>
              <Repartition lignes={b.discipline.par_sanction} vide="Aucune sanction prononcée sur l'exercice." />
            </Section>
            <Section titre="Congés" icone="beach_access">
              <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">{nombre(b.conges.demandes)} demande{b.conges.demandes > 1 ? "s" : ""} · {nombre(b.conges.jours)} jours.</p>
              <Repartition lignes={b.conges.par_nature} vide="Aucun congé enregistré sur l'exercice." />
            </Section>
            <Section titre="Absences et permissions" icone="event_busy">
              <p className="mb-4 font-body-sm text-body-sm text-on-surface-variant">{nombre(b.absences.autorisations)} autorisation{b.absences.autorisations > 1 ? "s" : ""} · {nombre(b.absences.jours)} jours · {nombre(b.absences.en_attente)} en attente de décision.</p>
              <Repartition lignes={b.absences.par_type} vide="Aucune absence enregistrée sur l'exercice." />
            </Section>
            <Section titre="Sorties par motif" icone="military_tech" className="xl:col-span-2"><Repartition lignes={b.sorties.par_motif} vide="Aucune sortie enregistrée." /></Section>
          </div>
        </>
      ) : null}
    </PageGrh>
  );
}
