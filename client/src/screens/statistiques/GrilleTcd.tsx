import { useState, type ReactNode } from "react";
import { Icone } from "../../ui/Icone";
import { nombre } from "../../ui/format";
import { CLE_TOTAL, formaterValeur, libelleChamp, libelleValeur, type ConfigTcd, type ResultatTcd, type SourceCatalogue } from "./moteur";

const PAS_LIGNES = 400;
const MAX_COLONNES = 150;

const ENTETE = "px-3 py-2 border border-hairline bg-primary text-on-primary font-label-sm text-label-sm font-semibold align-bottom";
const CASE = "px-3 py-1.5 border border-hairline text-right font-code-num text-code-num tabular-nums whitespace-nowrap";

/** Tableau croisé en forme compacte : les niveaux de lignes s'indentent dans la première colonne, comme dans Excel. */
export function GrilleTcd({ resultat, config, source, onBasculer }: {
  resultat: ResultatTcd;
  config: ConfigTcd;
  source: SourceCatalogue | undefined;
  onBasculer: (cle: string) => void;
}) {
  const [limite, setLimite] = useState(PAS_LIGNES);
  const valeurs = config.valeurs;
  const avecColonnes = config.colonnes.length > 0;
  const toutes = avecColonnes ? resultat.colonnes : [{ cle: CLE_TOTAL, chemin: [] as string[] }];
  const maxFeuilles = Math.max(1, Math.floor(MAX_COLONNES / Math.max(1, valeurs.length)));
  const colonnes = toutes.slice(0, maxFeuilles);
  const totalColonne = avecColonnes && config.options.total_colonnes;
  const rangValeurs = valeurs.length > 1 || !avecColonnes;
  const hauteur = (avecColonnes ? config.colonnes.length : 0) + (rangValeurs ? 1 : 0);
  const visibles = resultat.lignes.filter((ligne) => !ligne.cachee);
  const affichees = visibles.slice(0, limite);
  const coin = config.lignes.map((code) => libelleChamp(code, source)).join(" / ") || "Étiquettes de lignes";

  const rangs: ReactNode[][] = Array.from({ length: hauteur }, () => []);
  rangs.forEach((rang, niveau) => {
    if (niveau === 0) {
      rang.push(
        <th key="coin" rowSpan={hauteur} scope="col" className={`${ENTETE} sticky left-0 z-20 text-left min-w-[12rem]`}>
          {valeurs.length === 1 && avecColonnes && <span className="block font-normal opacity-80">{libelleValeur(valeurs[0], source)}</span>}
          {coin}
        </th>,
      );
    }
  });
  if (avecColonnes) {
    config.colonnes.forEach((_, niveau) => {
      let debut = 0;
      while (debut < colonnes.length) {
        let fin = debut;
        const prefixe = colonnes[debut].chemin.slice(0, niveau + 1).join("\u0001");
        while (fin + 1 < colonnes.length && colonnes[fin + 1].chemin.slice(0, niveau + 1).join("\u0001") === prefixe) fin += 1;
        rangs[niveau].push(
          <th key={`${niveau}-${debut}`} scope="colgroup" colSpan={(fin - debut + 1) * valeurs.length} className={`${ENTETE} text-center`}>
            {colonnes[debut].chemin[niveau]}
          </th>,
        );
        debut = fin + 1;
      }
    });
  }
  if (rangValeurs) {
    colonnes.forEach((colonne) => {
      valeurs.forEach((valeur, indice) => {
        rangs[hauteur - 1].push(
          <th key={`${colonne.cle}-${indice}`} scope="col" className={`${ENTETE} text-right bg-primary/85`}>{libelleValeur(valeur, source)}</th>,
        );
      });
    });
  }
  if (totalColonne) {
    valeurs.forEach((valeur, indice) => {
      rangs[0].push(
        <th key={`total-${indice}`} scope="col" rowSpan={hauteur} className={`${ENTETE} text-right`}>
          {valeurs.length > 1 ? `Total — ${libelleValeur(valeur, source)}` : "Total général"}
        </th>,
      );
    });
  }

  const chiffres = (cle: string, total: boolean) => [
    ...colonnes.flatMap((colonne) => valeurs.map((valeur, indice) => {
      const nombre = total ? resultat.totalColonne(colonne.cle, indice) : resultat.cellule(cle, colonne.cle, indice);
      return <td key={`${colonne.cle}-${indice}`} className={CASE}>{formaterValeur(nombre, valeur)}</td>;
    })),
    ...(totalColonne
      ? valeurs.map((valeur, indice) => {
        const nombre = total ? resultat.totalGeneral(indice) : resultat.totalLigne(cle, indice);
        return <td key={`total-${indice}`} className={`${CASE} font-semibold`}>{formaterValeur(nombre, valeur)}</td>;
      })
      : []),
  ];
  const largeur = colonnes.length * valeurs.length + (totalColonne ? valeurs.length : 0);

  return (
    <div>
      {toutes.length > colonnes.length && (
        <p className="mb-2 rounded bg-secondary-container/40 px-3 py-2 font-body-sm text-body-sm text-on-surface">
          {nombre(toutes.length)} colonnes : seules les {nombre(colonnes.length)} premières sont affichées. L'export Excel les reprend toutes.
        </p>
      )}
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-hairline">
        <table className="tableau-fixe w-max min-w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            {rangs.map((cellules, niveau) => <tr key={niveau}>{cellules}</tr>)}
          </thead>
          <tbody>
            {affichees.map(({ noeud, groupe, replie, chiffree }) => (
              <tr key={noeud.cle} className={groupe ? "bg-primary-fixed/50" : "bg-surface-container-lowest hover:bg-surface-container-low"}>
                <th
                  scope="row"
                  className={`sticky left-0 z-[5] px-3 py-1.5 border border-hairline font-body-sm text-body-sm text-on-surface whitespace-nowrap ${groupe ? "font-semibold bg-primary-fixed" : "font-normal bg-surface-container-lowest"}`}
                  style={{ paddingLeft: `${0.75 + noeud.niveau * 1.25}rem` }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {groupe ? (
                      <button
                        type="button"
                        className="inline-flex size-5 items-center justify-center rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-primary"
                        aria-expanded={!replie}
                        aria-label={`${replie ? "Développer" : "Réduire"} ${noeud.libelle}`}
                        onClick={() => onBasculer(noeud.cle)}
                      >
                        <span aria-hidden className="text-xs leading-none">{replie ? "+" : "−"}</span>
                      </button>
                    ) : config.lignes.length > 1 && <span className="size-5" aria-hidden />}
                    {noeud.libelle}
                  </span>
                </th>
                {chiffree ? chiffres(noeud.cle, false) : Array.from({ length: largeur }, (_, indice) => <td key={indice} className={CASE} />)}
              </tr>
            ))}
            {(config.options.total_lignes || !config.lignes.length) && (
              <tr className="bg-primary-fixed font-semibold">
                <th scope="row" className="sticky left-0 z-[5] bg-primary-fixed px-3 py-2 border border-hairline border-t-2 border-t-on-surface-variant font-body-sm text-body-sm font-bold text-on-surface">
                  Total général
                </th>
                {chiffres("", true)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {visibles.length > affichees.length && (
        <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-hairline px-3 py-2 font-label-md text-label-md text-primary hover:bg-surface-container-low" onClick={() => setLimite((valeur) => valeur + PAS_LIGNES)}>
          <Icone nom="expand_more" />
          Afficher les {nombre(Math.min(PAS_LIGNES, visibles.length - affichees.length))} lignes suivantes sur {nombre(visibles.length - affichees.length)}
        </button>
      )}
    </div>
  );
}
