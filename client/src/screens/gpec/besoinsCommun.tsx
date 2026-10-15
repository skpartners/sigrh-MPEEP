import { Fragment, useState } from "react";
import { Icone } from "../../ui/Icone";
import { dateCourte, nombre } from "../../ui/format";

export type CampagneBesoins = {
  exercice: number;
  ouverte: boolean;
  cloturee: boolean;
  limite_depassee: boolean;
  cadrage: string;
  ouverte_le: string | null;
  limite: string | null;
};

export type Effectifs = { fonctionnaires: number; contractuels: number; total: number };

export type NoeudBesoins = {
  id: number;
  nom: string;
  niveau: string;
  niveau_libelle: string;
  responsable: string;
  a_un_responsable: boolean;
  repond: boolean;
  fiches: number;
  lignes: { reference: string; emploi: string; emploi_code: string; grade: string; motif: string; fonctionnaires: number; contractuels: number; auteur: string; depose_le: string }[];
  propre: Effectifs;
  cumul: Effectifs;
  enfants: NoeudBesoins[];
};

export type FicheBesoins = {
  reference: string;
  entite: { id: number; nom: string };
  chemin: string[];
  emploi: { code: string; libelle: string };
  profil: string;
  grade: string;
  motif: string;
  fonctionnaires: number;
  contractuels: number;
  volume: number;
  auteur: string;
  depose_le: string;
};

export type EmploiBesoins = { code: string; libelle: string; grade: string; fonctionnaires: number; contractuels: number; total: number; structures: number };

export type TotauxBesoins = { structures: number; reponses: number; fonctionnaires: number; contractuels: number; volume: number };

export const LIBELLE_ETAT = (campagne: CampagneBesoins | null): string => {
  if (!campagne) return "Aucun appel lancé";
  if (campagne.cloturee) return "Appel clos";
  if (campagne.limite_depassee) return "Date limite dépassée";
  return "Appel ouvert";
};

function Etat({ n }: { n: NoeudBesoins }) {
  if (!n.a_un_responsable) return <span className="text-on-surface-variant">Sans responsable</span>;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${n.repond ? "bg-primary-fixed text-on-primary-fixed" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
      {n.repond ? "A répondu" : "En attente"}
    </span>
  );
}

/** Les structures regroupées : chaque niveau se termine par une ligne de total qui remonte celui de ses structures. */
export type ActionsBesoin = {
  modifier: (noeud: NoeudBesoins, ligne: NoeudBesoins["lignes"][number]) => void;
  retirer: (noeud: NoeudBesoins, ligne: NoeudBesoins["lignes"][number]) => void;
};

export function ArbreBesoins({ arbre, actions }: { arbre: NoeudBesoins[]; actions?: ActionsBesoin }) {
  const [ouverts, setOuverts] = useState<Set<number>>(new Set());
  const basculer = (id: number) => setOuverts((actuel) => {
    const suivant = new Set(actuel);
    if (!suivant.delete(id)) suivant.add(id);
    return suivant;
  });
  const marge = (profondeur: number) => ({ paddingLeft: `${profondeur * 1.25}rem` });
  const chiffres = (e: Effectifs, fort = false) => (
    <>
      <td className={`py-2.5 pr-4 text-right ${fort ? "font-bold" : ""}`}>{nombre(e.fonctionnaires)}</td>
      <td className={`py-2.5 pr-4 text-right ${fort ? "font-bold" : ""}`}>{nombre(e.contractuels)}</td>
      <td className={`py-2.5 pr-4 text-right ${fort ? "font-bold" : "font-semibold"}`}>{nombre(e.total)}</td>
    </>
  );

  function emplois(n: NoeudBesoins, profondeur: number) {
    return n.lignes.map((l) => (
      <tr key={l.reference} className="border-b border-hairline align-top text-on-surface-variant">
        <td className="py-2 pr-4" style={marge(profondeur)}>
          <span className="inline-flex items-start gap-1.5">
            <span className="w-6" />
            <span>
              <span className="block text-on-surface">{l.emploi}{l.grade ? ` · ${l.grade}` : ""}</span>
              {l.motif ? <span className="block">{l.motif}</span> : null}
              <span className="block">{[l.auteur, dateCourte(l.depose_le)].filter(Boolean).join(" · ")}</span>
            </span>
          </span>
        </td>
        <td className="py-2 pr-4 text-right">{nombre(l.fonctionnaires)}</td>
        <td className="py-2 pr-4 text-right">{nombre(l.contractuels)}</td>
        <td className="py-2 pr-4 text-right">{nombre(l.fonctionnaires + l.contractuels)}</td>
        <td />
        {actions ? (
          <td className="py-2 text-right whitespace-nowrap">
            <button type="button" aria-label={`Modifier le besoin ${l.emploi} de ${n.nom}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => actions.modifier(n, l)}><Icone nom="edit" className="text-lg" /></button>
            <button type="button" aria-label={`Supprimer le besoin ${l.emploi} de ${n.nom}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => actions.retirer(n, l)}><Icone nom="delete" className="text-lg" /></button>
          </td>
        ) : null}
      </tr>
    ));
  }

  function lignes(noeuds: NoeudBesoins[], profondeur: number) {
    return noeuds.map((n) => {
      if (n.enfants.length === 0) {
        const replie = !ouverts.has(n.id);
        return (
          <Fragment key={n.id}>
            <tr className="border-b border-hairline align-top">
              <td className="py-2.5 pr-4" style={marge(profondeur)}>
                <span className="inline-flex items-start gap-1.5">
                  {n.lignes.length ? (
                    <button type="button" aria-label={replie ? `Déplier ${n.nom}` : `Replier ${n.nom}`} aria-expanded={!replie} className="p-0.5 rounded text-on-surface-variant hover:text-primary" onClick={() => basculer(n.id)}>
                      <Icone nom={replie ? "chevron_right" : "expand_more"} className="text-lg" />
                    </button>
                  ) : <span className="w-6" />}
                  <span><span className="block text-on-surface">{n.nom}</span><span className="block text-on-surface-variant">{n.niveau_libelle}{n.responsable ? ` · ${n.responsable}` : ""}</span></span>
                </span>
              </td>
              {chiffres(n.propre)}
              <td className="py-2.5"><Etat n={n} /></td>
            </tr>
            {replie ? null : emplois(n, profondeur + 1)}
          </Fragment>
        );
      }
      const ferme = !ouverts.has(n.id);
      return (
        <Fragment key={n.id}>
          <tr className="border-b border-hairline align-top bg-surface-container-low/60">
            <td className="py-2.5 pr-4" style={marge(profondeur)}>
              <span className="inline-flex items-start gap-1.5">
                <button type="button" aria-label={ferme ? `Déplier ${n.nom}` : `Replier ${n.nom}`} aria-expanded={!ferme} className="p-0.5 rounded text-on-surface-variant hover:text-primary" onClick={() => basculer(n.id)}>
                  <Icone nom={ferme ? "chevron_right" : "expand_more"} className="text-lg" />
                </button>
                <span><span className="block font-semibold text-on-surface">{n.nom}</span><span className="block text-on-surface-variant">{n.niveau_libelle}{n.responsable ? ` · ${n.responsable}` : ""}</span></span>
              </span>
            </td>
            {ferme ? chiffres(n.cumul, true) : <td colSpan={3} />}
            <td className="py-2.5">{ferme ? null : <Etat n={n} />}</td>
          </tr>
          {ferme ? null : (
            <>
              {n.propre.total > 0 ? (
                <>
                  <tr className="border-b border-hairline align-top">
                    <td className="py-2.5 pr-4 text-on-surface" style={marge(profondeur + 1)}><span className="inline-flex gap-1.5"><span className="w-6" />Besoins propres de {n.nom}</span></td>
                    {chiffres(n.propre)}
                    <td />
                  </tr>
                  {emplois(n, profondeur + 2)}
                </>
              ) : null}
              {lignes(n.enfants, profondeur + 1)}
              <tr className="border-b border-hairline align-top font-bold text-on-surface bg-surface-container-low/60">
                <td className="py-2.5 pr-4" style={marge(profondeur + 1)}><span className="inline-flex gap-1.5"><span className="w-6" />Total {n.nom}</span></td>
                {chiffres(n.cumul, true)}
                <td />
              </tr>
            </>
          )}
        </Fragment>
      );
    });
  }

  const general = arbre.reduce((cumul, n) => ({
    fonctionnaires: cumul.fonctionnaires + n.cumul.fonctionnaires,
    contractuels: cumul.contractuels + n.cumul.contractuels,
    total: cumul.total + n.cumul.total,
  }), { fonctionnaires: 0, contractuels: 0, total: 0 });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-body-sm text-body-sm">
        <thead>
          <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
            <th className="py-2 pr-4 font-medium">Structure</th>
            <th className="py-2 pr-4 font-medium text-right">Fonctionnaires</th>
            <th className="py-2 pr-4 font-medium text-right">Contractuels</th>
            <th className="py-2 pr-4 font-medium text-right">Total</th>
            <th className="py-2 font-medium">Réponse</th>
            {actions ? <th className="py-2 font-medium text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {arbre.length === 0 ? <tr><td colSpan={5} className="py-6 text-on-surface-variant">Aucune structure à afficher.</td></tr> : lignes(arbre, 0)}
        </tbody>
        {arbre.length > 1 ? (
          <tfoot>
            <tr className="font-bold text-on-surface">
              <td className="py-3 pr-4">Total général</td>
              {chiffres(general, true)}
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export function dateLimite(campagne: CampagneBesoins | null): string {
  return campagne?.limite ? dateCourte(campagne.limite) : "—";
}

/** Les besoins regroupés par emploi : le nombre demandé, fonctionnaires et contractuels, et par combien de structures. */
export function TableauEmplois({ emplois }: { emplois: EmploiBesoins[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-body-sm text-body-sm">
        <thead>
          <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
            <th className="py-2 pr-4 font-medium">Emploi</th>
            <th className="py-2 pr-4 font-medium">Grade</th>
            <th className="py-2 pr-4 font-medium text-right">Fonctionnaires</th>
            <th className="py-2 pr-4 font-medium text-right">Contractuels</th>
            <th className="py-2 pr-4 font-medium text-right">Total</th>
            <th className="py-2 font-medium text-right">Structures</th>
          </tr>
        </thead>
        <tbody>
          {emplois.length === 0 ? <tr><td colSpan={6} className="py-6 text-on-surface-variant">Aucun besoin exprimé.</td></tr> : emplois.map((e) => (
            <tr key={e.code || e.libelle} className="border-b border-hairline text-on-surface">
              <td className="py-2.5 pr-4 font-semibold">{e.libelle}</td>
              <td className="py-2.5 pr-4">{e.grade || "—"}</td>
              <td className="py-2.5 pr-4 text-right">{nombre(e.fonctionnaires)}</td>
              <td className="py-2.5 pr-4 text-right">{nombre(e.contractuels)}</td>
              <td className="py-2.5 pr-4 text-right font-bold">{nombre(e.total)}</td>
              <td className="py-2.5 text-right">{nombre(e.structures)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
