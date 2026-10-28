import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../../api/client";
import { nombre } from "../../ui/format";
import { usePagination } from "../../ui/Pagination";
import { Kpi, pourcent, PageGrh, Section } from "./ui";
import { Recherche, TableauListe } from "../dotation/commun";
import { LIBELLE_ETAT, type CampagneBesoins } from "../gpec/besoinsCommun";
import { correspond } from "../../ui/recherche";

type Effectifs = { fonctionnaires: number; contractuels: number; total: number };
type Ligne = {
  emploi: string; grade: string; demande: Effectifs; conference: Effectifs; catalogue: Effectifs; dote: Effectifs;
  ecart: number; taux: number | null; couverture: number | null;
};
type Bilan = {
  campagne: CampagneBesoins | null;
  totaux: { demande: Effectifs; conference: Effectifs; catalogue: Effectifs; dote: Effectifs; taux: number | null; couverture: number | null; taux_validation: number | null };
  lignes: Ligne[];
};

function Cellule({ e }: { e: Effectifs }) {
  return (
    <td className="py-3 pr-4 text-right whitespace-nowrap">
      <span className="font-semibold">{nombre(e.total)}</span>
      <span className="block text-on-surface-variant">{nombre(e.fonctionnaires)} fonct. · {nombre(e.contractuels)} contr.</span>
    </td>
  );
}

/** Bilan de satisfaction : pour chaque emploi, le demandé, le retenu en Conférence, le retenu au Catalogue et l'affecté. */
export function BilanSatisfactionScreen() {
  const bilan = useQuery({ queryKey: ["grh-programmation-bilan"], queryFn: () => api<Bilan>("/api/v1/grh/programmation/bilan/") });
  const [recherche, setRecherche] = useState("");
  const b = bilan.data;
  const terme = recherche.trim().toLowerCase();
  const lignes = useMemo(() => (b?.lignes ?? []).filter((l) => !terme || [l.emploi, l.grade].some((v) => correspond(v, terme))), [b?.lignes, terme]);
  const page = usePagination(lignes, terme);
  return (
    <PageGrh
      rubrique="Programmation des effectifs"
      titre="Bilan de satisfaction des besoins"
      resume={b?.campagne ? `Appel ${b.campagne.exercice} (${LIBELLE_ETAT(b.campagne)}) : ce qui a été demandé, retenu en Conférence, retenu au Catalogue des mesures nouvelles, puis effectivement affecté, emploi par emploi.` : "Aucun appel n'a encore été lancé : le bilan se construit à partir des besoins collectés."}
      chargement={bilan.isLoading}
      erreur={bilan.isError ? "Le bilan n'a pas pu être chargé." : undefined}
    >
      {b ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi icone="post_add" libelle="Demandé" valeur={nombre(b.totaux.demande.total)} detail={`${nombre(b.totaux.demande.fonctionnaires)} fonctionnaires · ${nombre(b.totaux.demande.contractuels)} contractuels`} />
            <Kpi icone="how_to_vote" libelle="Retenu en Conférence" valeur={nombre(b.totaux.conference.total)} detail={`${nombre(b.totaux.conference.fonctionnaires)} fonctionnaires · ${nombre(b.totaux.conference.contractuels)} contractuels`} />
            <Kpi icone="menu_book" libelle="Retenu au Catalogue" valeur={nombre(b.totaux.catalogue.total)} detail={`${pourcent(b.totaux.taux_validation)} du demandé`} />
            <Kpi icone="how_to_reg" libelle="Affecté" valeur={nombre(b.totaux.dote.total)} detail={`Satisfaction du Catalogue : ${pourcent(b.totaux.taux)} · du demandé : ${pourcent(b.totaux.couverture)}`} />
          </section>
          <Section titre="Satisfaction par emploi" icone="balance">
            <div className="mb-4">
              <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher un emploi" placeholder="Emploi, grade…" />
            </div>
            <TableauListe
              colonnes={["Emploi", "Demandé", "Conférence", "Catalogue", "Affecté", "Écart", "Satisfaction"]}
              vide={lignes.length ? null : b.lignes.length ? "Aucun emploi ne correspond à cette recherche." : "Aucun besoin ni affectation à comparer pour l'instant."}
              page={{ ...page, libelle: "emploi" }}
            >
              {page.visibles.map((l) => (
                <tr key={l.emploi} className="border-b border-hairline text-on-surface align-top">
                  <td className="py-3 pr-4"><span className="font-semibold block">{l.emploi}</span><span className="text-on-surface-variant">{l.grade}</span></td>
                  <Cellule e={l.demande} />
                  <Cellule e={l.conference} />
                  <Cellule e={l.catalogue} />
                  <Cellule e={l.dote} />
                  <td className={`py-3 pr-4 text-right font-semibold ${l.ecart < 0 ? "text-error" : ""}`}>{l.ecart > 0 ? "+" : ""}{nombre(l.ecart)}</td>
                  <td className="py-3 text-right">{pourcent(l.taux)}</td>
                </tr>
              ))}
            </TableauListe>
            {b.lignes.length ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3 font-body-sm text-body-sm font-bold text-on-surface">
                <span>Décompte · {nombre(b.lignes.length)} emploi{b.lignes.length > 1 ? "s" : ""}</span>
                <span>{nombre(b.totaux.demande.total)} demandés → {nombre(b.totaux.conference.total)} en Conférence → {nombre(b.totaux.catalogue.total)} au Catalogue → {nombre(b.totaux.dote.total)} affectés</span>
              </div>
            ) : null}
            <p className="mt-3 font-body-sm text-on-surface-variant">Un écart négatif signale des agents retenus au Catalogue qui n'ont pas encore été affectés. L'affecté compte les affectations et réaffectations enregistrées dans la dotation depuis l'ouverture de l'appel.</p>
          </Section>
        </>
      ) : null}
    </PageGrh>
  );
}
