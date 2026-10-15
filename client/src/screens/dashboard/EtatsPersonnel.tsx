import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { api } from "../../api/client";
import { dateCourte, nombre } from "../../ui/format";
import { Icone } from "../../ui/Icone";
import { usePagination } from "../../ui/Pagination";
import { CHAMP, Recherche, TableauListe } from "../dotation/commun";

type Ventilation = { libelle: string; hommes: number; femmes: number; total: number };
type Programme = { programme: string; hommes: number; femmes: number; total: number; structures: Ventilation[] };
type Etats = {
  date: string;
  perimetre: boolean;
  socio_demographie: {
    total: number; hommes: number; femmes: number;
    par_programme: Programme[];
    par_categorie: Ventilation[]; par_grade: Ventilation[]; par_statut: Ventilation[]; par_famille: Ventilation[]; par_tranche_age: Ventilation[];
  };
  sorties: {
    projection: { libelle: string; total: number; hommes: number; femmes: number; cadres_a: number }[];
    admis: {
      debut: number; fin: number; par_annee: { annee: number; total: number }[];
      agents: { matricule: string; nom_complet: string; grade: string; sexe: string; structure: string; age_limite: number; date_limite: string; annee: number; dossier: string; atteinte: boolean }[];
    };
  };
  autres: {
    responsables: {
      structures: { structure: string; niveau: string; programme: string; responsables: { matricule: string; nom_complet: string; fonction: string; role: string; interim: boolean }[] }[];
      structures_total: number; structures_pourvues: number; agents: number;
    };
    detail: { famille: string; emploi: string; grade: string; genre: string; structure: string; effectif: number }[];
  };
};

const CARTE = "bg-surface-container-lowest rounded-xl border border-hairline p-6";
const TITRE_PARTIE = "font-headline-sm text-headline-sm text-on-primary bg-primary-container rounded-xl px-5 py-3.5 font-bold flex items-center gap-3 shadow-sm";
const TITRE_ETAT = "font-headline-sm text-headline-sm text-on-surface font-bold";

function Barre({ part }: { part: number }) {
  return (
    <div className="w-full min-w-16 h-2 bg-surface-container rounded-full overflow-hidden" aria-hidden="true">
      <div className="h-full bg-primary rounded-full motion-fill" style={{ width: `${Math.max(2, part)}%` }} />
    </div>
  );
}

/** Une ventilation des effectifs, avec le genre et la part de chaque modalité. */
function TableauVentile({ lignes, libelle }: { lignes: Ventilation[]; libelle: string }) {
  const total = lignes.reduce((n, l) => n + l.total, 0);
  const hommes = lignes.reduce((n, l) => n + l.hommes, 0);
  const femmes = lignes.reduce((n, l) => n + l.femmes, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-body-sm text-body-sm">
        <thead>
          <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
            <th className="py-2 pr-4 font-medium">{libelle}</th>
            <th className="py-2 pr-4 font-medium text-right">Hommes</th>
            <th className="py-2 pr-4 font-medium text-right">Femmes</th>
            <th className="py-2 pr-4 font-medium text-right">Total</th>
            <th className="py-2 font-medium w-40">Part</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 ? <tr><td colSpan={5} className="py-4 text-on-surface-variant">Aucun agent.</td></tr> : lignes.map((l) => (
            <tr key={l.libelle} className="border-b border-hairline text-on-surface">
              <td className="py-2 pr-4 font-semibold">{l.libelle}</td>
              <td className="py-2 pr-4 text-right">{nombre(l.hommes)}</td>
              <td className="py-2 pr-4 text-right">{nombre(l.femmes)}</td>
              <td className="py-2 pr-4 text-right font-bold">{nombre(l.total)}</td>
              <td className="py-2"><span className="flex items-center gap-2"><Barre part={total ? (l.total * 100) / total : 0} /><span className="w-12 text-right text-on-surface-variant">{total ? Math.round((l.total * 1000) / total) / 10 : 0} %</span></span></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold text-on-surface">
            <td className="py-2 pr-4">Total</td>
            <td className="py-2 pr-4 text-right">{nombre(hommes)}</td>
            <td className="py-2 pr-4 text-right">{nombre(femmes)}</td>
            <td className="py-2 pr-4 text-right">{nombre(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Etat({ titre, children, className = "" }: { titre: string; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARTE} ${className}`}>
      <h3 className={`${TITRE_ETAT} mb-4`}>{titre}</h3>
      {children}
    </section>
  );
}

/** Les états du personnel du ministère : caractéristiques socio-démographiques, sorties de carrière et autres états. */
export function EtatsPersonnel() {
  const [periode, setPeriode] = useState({ debut: "2024", fin: "2030" });
  const requete = useQuery({
    queryKey: ["dashboard-etats", periode.debut, periode.fin],
    queryFn: () => api<Etats>(`/api/v1/dashboard/etats/?debut=${periode.debut}&fin=${periode.fin}`),
    placeholderData: (precedent) => precedent,
    retry: false,
  });
  const d = requete.data;
  if (requete.isError && !d) return <p role="alert" className={`${CARTE} text-error`}>Les états du personnel n'ont pas pu être chargés (vérifiez la période).</p>;
  if (!d) return <p className={`${CARTE} text-on-surface-variant`}>Chargement des états…</p>;
  const s = d.socio_demographie;
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className={TITRE_PARTIE}><Icone nom="groups" className="text-2xl" />I. Caractéristiques socio-démographiques</h2>
        <EffectifsParStructure programmes={s.par_programme} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Etat titre="Effectifs du personnel par catégorie"><TableauVentile lignes={s.par_categorie} libelle="Catégorie" /></Etat>
          <Etat titre="Effectifs du personnel par statut"><TableauVentile lignes={s.par_statut} libelle="Statut" /></Etat>
          <Etat titre="Effectifs du personnel par grade"><TableauVentile lignes={s.par_grade} libelle="Grade" /></Etat>
          <Etat titre="Effectifs du personnel par famille d'emploi"><TableauVentile lignes={s.par_famille} libelle="Famille d'emploi" /></Etat>
        </div>
        <Etat titre="Tranche d'âge des agents"><TableauVentile lignes={s.par_tranche_age} libelle="Tranche d'âge" /></Etat>
      </div>

      <div className="space-y-4">
        <h2 className={TITRE_PARTIE}><Icone nom="event_busy" className="text-2xl" />II. État des sorties de carrière</h2>
        <Projection lignes={d.sorties.projection} />
        <AgentsAdmis admis={d.sorties.admis} periode={periode} onPeriode={setPeriode} />
      </div>

      <div className="space-y-4">
        <h2 className={TITRE_PARTIE}><Icone nom="account_tree" className="text-2xl" />III. Autres états</h2>
        <Responsables donnees={d.autres.responsables} />
        <DetailAgents lignes={d.autres.detail} />
      </div>
    </div>
  );
}

function EffectifsParStructure({ programmes }: { programmes: Programme[] }) {
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const basculer = (p: string) => setOuverts((actuel) => { const suivant = new Set(actuel); if (!suivant.delete(p)) suivant.add(p); return suivant; });
  const total = programmes.reduce((n, p) => n + p.total, 0);
  return (
    <Etat titre="Effectifs du personnel par structure, par programme et par genre">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
              <th className="py-2 pr-4 font-medium">Programme / structure</th>
              <th className="py-2 pr-4 font-medium text-right">Hommes</th>
              <th className="py-2 pr-4 font-medium text-right">Femmes</th>
              <th className="py-2 pr-4 font-medium text-right">Total</th>
              <th className="py-2 font-medium w-40">Part</th>
            </tr>
          </thead>
          <tbody>
            {programmes.length === 0 ? <tr><td colSpan={5} className="py-4 text-on-surface-variant">Aucun agent.</td></tr> : programmes.map((p) => {
              const ouvert = ouverts.has(p.programme);
              return (
                <Fragment key={p.programme}>
                  <tr className="border-b border-hairline bg-surface-container-low/60 font-semibold text-on-surface">
                    <td className="py-2 pr-4">
                      <button type="button" aria-expanded={ouvert} aria-label={`${ouvert ? "Replier" : "Déplier"} ${p.programme}`} className="inline-flex items-center gap-1.5 text-left" onClick={() => basculer(p.programme)}>
                        <Icone nom={ouvert ? "expand_more" : "chevron_right"} className="text-lg" />{p.programme}
                      </button>
                    </td>
                    <td className="py-2 pr-4 text-right">{nombre(p.hommes)}</td>
                    <td className="py-2 pr-4 text-right">{nombre(p.femmes)}</td>
                    <td className="py-2 pr-4 text-right font-bold">{nombre(p.total)}</td>
                    <td className="py-2"><span className="flex items-center gap-2"><Barre part={total ? (p.total * 100) / total : 0} /><span className="w-12 text-right font-normal text-on-surface-variant">{total ? Math.round((p.total * 1000) / total) / 10 : 0} %</span></span></td>
                  </tr>
                  {ouvert ? p.structures.map((st) => (
                    <tr key={st.libelle} className="border-b border-hairline text-on-surface">
                      <td className="py-2 pr-4 pl-9">{st.libelle}</td>
                      <td className="py-2 pr-4 text-right">{nombre(st.hommes)}</td>
                      <td className="py-2 pr-4 text-right">{nombre(st.femmes)}</td>
                      <td className="py-2 pr-4 text-right">{nombre(st.total)}</td>
                      <td />
                    </tr>
                  )) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold text-on-surface">
              <td className="py-2 pr-4">Total</td>
              <td className="py-2 pr-4 text-right">{nombre(programmes.reduce((n, p) => n + p.hommes, 0))}</td>
              <td className="py-2 pr-4 text-right">{nombre(programmes.reduce((n, p) => n + p.femmes, 0))}</td>
              <td className="py-2 pr-4 text-right">{nombre(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Etat>
  );
}

function Projection({ lignes }: { lignes: Etats["sorties"]["projection"] }) {
  const plus = Math.max(1, ...lignes.map((l) => l.total));
  return (
    <Etat titre="Projection de sortie de carrière pour motif de limite d'âge">
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
          <thead>
            <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
              <th className="py-2 pr-4 font-medium">Année</th>
              <th className="py-2 pr-4 font-medium text-right">Hommes</th>
              <th className="py-2 pr-4 font-medium text-right">Femmes</th>
              <th className="py-2 pr-4 font-medium text-right">Total</th>
              <th className="py-2 pr-4 font-medium text-right">Dont catégorie A</th>
              <th className="py-2 font-medium w-40">Départs</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.libelle} className="border-b border-hairline text-on-surface">
                <td className="py-2 pr-4 font-semibold">{l.libelle}</td>
                <td className="py-2 pr-4 text-right">{nombre(l.hommes)}</td>
                <td className="py-2 pr-4 text-right">{nombre(l.femmes)}</td>
                <td className="py-2 pr-4 text-right font-bold">{nombre(l.total)}</td>
                <td className="py-2 pr-4 text-right">{nombre(l.cadres_a)}</td>
                <td className="py-2"><Barre part={(l.total * 100) / plus} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold text-on-surface">
              <td className="py-2 pr-4">Total</td>
              <td className="py-2 pr-4 text-right">{nombre(lignes.reduce((n, l) => n + l.hommes, 0))}</td>
              <td className="py-2 pr-4 text-right">{nombre(lignes.reduce((n, l) => n + l.femmes, 0))}</td>
              <td className="py-2 pr-4 text-right">{nombre(lignes.reduce((n, l) => n + l.total, 0))}</td>
              <td className="py-2 pr-4 text-right">{nombre(lignes.reduce((n, l) => n + l.cadres_a, 0))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Etat>
  );
}

function AgentsAdmis({ admis, periode, onPeriode }: { admis: Etats["sorties"]["admis"]; periode: { debut: string; fin: string }; onPeriode: (p: { debut: string; fin: string }) => void }) {
  const [recherche, setRecherche] = useState("");
  const terme = recherche.trim().toLowerCase();
  const lignes = useMemo(() => admis.agents.filter((a) => !terme || [a.nom_complet, a.matricule, a.grade, a.structure].some((v) => v.toLowerCase().includes(terme))), [admis.agents, terme]);
  const page = usePagination(lignes, terme + admis.debut + admis.fin);
  return (
    <Etat titre={`Agents admis à faire valoir leur droit à la retraite sur la période ${admis.debut}-${admis.fin}`}>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="block"><span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Du</span><input className={`${CHAMP} w-28`} type="number" min={1990} max={2100} value={periode.debut} onChange={(e) => onPeriode({ ...periode, debut: e.target.value })} /></label>
        <label className="block"><span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">Au</span><input className={`${CHAMP} w-28`} type="number" min={1990} max={2100} value={periode.fin} onChange={(e) => onPeriode({ ...periode, fin: e.target.value })} /></label>
        <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher un agent admis" placeholder="Agent, grade, structure…" />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {admis.par_annee.map((a) => (
          <span key={a.annee} className="px-3 py-1 rounded-full bg-surface-container-low font-label-sm text-label-sm text-on-surface">
            <span className="font-bold">{a.annee}</span> · {nombre(a.total)}
          </span>
        ))}
      </div>
      <TableauListe colonnes={["Agent", "Grade", "Structure", "Limite d'âge", "Date de départ", "Dossier"]} vide={lignes.length ? null : admis.agents.length ? "Aucun agent ne correspond à cette recherche." : "Aucun agent n'atteint la limite d'âge sur cette période."} page={{ ...page, libelle: "agent" }}>
        {page.visibles.map((a) => (
          <tr key={a.matricule} className="border-b border-hairline text-on-surface align-top">
            <td className="py-3 pr-4"><span className="font-semibold block">{a.nom_complet}</span><span className="text-on-surface-variant">{a.matricule}</span></td>
            <td className="py-3 pr-4">{a.grade || "—"}</td>
            <td className="py-3 pr-4">{a.structure}</td>
            <td className="py-3 pr-4">{a.age_limite} ans</td>
            <td className="py-3 pr-4 whitespace-nowrap"><span className={a.atteinte ? "text-error font-semibold" : ""}>{dateCourte(a.date_limite)}</span></td>
            <td className="py-3 pr-4">{a.dossier}</td>
          </tr>
        ))}
      </TableauListe>
    </Etat>
  );
}

function Responsables({ donnees }: { donnees: Etats["autres"]["responsables"] }) {
  const [recherche, setRecherche] = useState("");
  const terme = recherche.trim().toLowerCase();
  const lignes = useMemo(() => donnees.structures.filter((l) => !terme || [l.structure, l.programme, ...l.responsables.map((r) => r.nom_complet)].some((v) => v.toLowerCase().includes(terme))), [donnees.structures, terme]);
  const page = usePagination(lignes, terme);
  return (
    <Etat titre="Agents ayant des postes de responsabilité par structure">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher une structure" placeholder="Structure, programme, responsable…" />
        <p className="font-body-sm text-body-sm text-on-surface-variant">{nombre(donnees.structures_pourvues)} structure{donnees.structures_pourvues > 1 ? "s" : ""} sur {nombre(donnees.structures_total)} ont un responsable désigné.</p>
      </div>
      <TableauListe colonnes={["Structure", "Programme", "Responsable(s)"]} vide={lignes.length ? null : donnees.structures.length ? "Aucune structure ne correspond à cette recherche." : "Aucun responsable n'est désigné."} page={{ ...page, libelle: "structure" }}>
        {page.visibles.map((l) => (
          <tr key={l.structure} className="border-b border-hairline text-on-surface align-top">
            <td className="py-3 pr-4"><span className="font-semibold block">{l.structure}</span><span className="text-on-surface-variant">{l.niveau}</span></td>
            <td className="py-3 pr-4">{l.programme}</td>
            <td className="py-3 pr-4">
              <ul className="space-y-1">
                {l.responsables.map((r) => <li key={`${r.matricule}-${r.interim}`}><span className="font-semibold">{r.nom_complet}</span> <span className="text-on-surface-variant">· {r.fonction || r.role}{r.interim ? " (intérim)" : ""}</span></li>)}
              </ul>
            </td>
          </tr>
        ))}
      </TableauListe>
    </Etat>
  );
}

function DetailAgents({ lignes }: { lignes: Etats["autres"]["detail"] }) {
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState("");
  const familles = useMemo(() => [...new Set(lignes.map((l) => l.famille))].sort(), [lignes]);
  const terme = recherche.trim().toLowerCase();
  const filtrees = useMemo(() => lignes.filter((l) => (!famille || l.famille === famille) && (!terme || [l.emploi, l.grade, l.structure, l.famille].some((v) => v.toLowerCase().includes(terme)))), [lignes, famille, terme]);
  const page = usePagination(filtrees, `${terme}|${famille}`);
  const total = filtrees.reduce((n, l) => n + l.effectif, 0);
  return (
    <Etat titre="Agents du ministère par famille d'emploi, par emploi, par grade, par genre et par structure">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher dans l'état" placeholder="Emploi, grade, structure…" />
        <select aria-label="Filtrer par famille d'emploi" className={`${CHAMP} w-auto`} value={famille} onChange={(e) => setFamille(e.target.value)}>
          <option value="">Toutes les familles d'emploi</option>
          {familles.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{nombre(total)} agent{total > 1 ? "s" : ""}</span>
      </div>
      <TableauListe colonnes={["Famille d'emploi", "Emploi", "Grade", "Genre", "Structure", "Effectif"]} vide={filtrees.length ? null : "Aucun agent ne correspond à ces critères."} page={{ ...page, libelle: "ligne" }}>
        {page.visibles.map((l) => (
          <tr key={`${l.famille}|${l.emploi}|${l.grade}|${l.genre}|${l.structure}`} className="border-b border-hairline text-on-surface align-top">
            <td className="py-2.5 pr-4">{l.famille}</td>
            <td className="py-2.5 pr-4 font-semibold">{l.emploi}</td>
            <td className="py-2.5 pr-4">{l.grade}</td>
            <td className="py-2.5 pr-4">{l.genre}</td>
            <td className="py-2.5 pr-4">{l.structure}</td>
            <td className="py-2.5 pr-4 text-right font-bold">{nombre(l.effectif)}</td>
          </tr>
        ))}
      </TableauListe>
    </Etat>
  );
}
