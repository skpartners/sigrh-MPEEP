import type { ReactNode } from "react";
import type { CircuitConfigure, ElementCircuit } from "../../api/types";
import { ouvreAuClic } from "../../ui/clicLigne";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";

/** Racines suivies de leurs sous-rubriques, dans l'ordre d'affichage. */
export function ordonner<T extends ElementCircuit>(elements: T[]): T[] {
  return elements
    .filter((element) => !element.parent)
    .flatMap((racine) => [racine, ...elements.filter((element) => element.parent === racine.code)]);
}

/** Pastille discrète pour une précision (période, destinataire, justificatif). */
export function Precision({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">{children}</span>;
}

/**
 * Tableau des éléments proposés aux agents (congés, absences, actes) : un clic sur la ligne ouvre la modification,
 * « Retirer » reste un bouton à part. Une sous-rubrique est décalée sous sa rubrique et suit son circuit tant qu'elle n'en a pas.
 */
export function TableauElements<T extends ElementCircuit>({
  lignes,
  circuits,
  colonneDetail,
  detail,
  vide,
  onModifier,
  onRetirer,
}: {
  lignes: T[];
  circuits: CircuitConfigure[];
  /** Titre de la colonne facultative de précisions. */
  colonneDetail?: string;
  detail?: (ligne: T) => ReactNode;
  vide: { titre: string; texte: string };
  onModifier: (ligne: T) => void;
  onRetirer: (ligne: T) => void;
}) {
  const ordonnes = ordonner(lignes);
  const colonnes = colonneDetail ? 4 : 3;
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-4 py-3" data-min="">Élément</th>
              <th className="px-4 py-3">Circuit</th>
              {colonneDetail ? <th className="px-4 py-3">{colonneDetail}</th> : null}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ordonnes.length === 0 ? (
              <tr>
                <td colSpan={colonnes} className="px-4 py-8">
                  <p className="font-label-lg text-label-lg text-on-surface">{vide.titre}</p>
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{vide.texte}</p>
                </td>
              </tr>
            ) : (
              ordonnes.map((ligne) => {
                const parent = lignes.find((item) => item.code === ligne.parent);
                const circuit = circuits.find((item) => item.id === (ligne.circuit_id ?? parent?.circuit_id));
                const herite = ligne.circuit_id == null && circuit != null;
                return (
                  <tr
                    key={ligne.id}
                    title={`Modifier ${ligne.libelle}`}
                    onClick={ouvreAuClic(() => onModifier(ligne))}
                    className="cursor-pointer border-t border-hairline hover:bg-surface-container-low/70"
                  >
                    <td className={`py-3 pr-4 ${parent ? "pl-10" : "pl-4"}`}>
                      <p className={`font-body-md text-body-md text-on-surface ${parent ? "" : "font-semibold"}`}>
                        {parent ? <span className="mr-1.5 text-on-surface-variant" aria-hidden="true">↳</span> : null}
                        {ligne.libelle}
                      </p>
                      {parent ? <p className="font-label-sm text-label-sm text-on-surface-variant">Sous-rubrique de « {parent.libelle} »</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-0.5 font-label-sm text-label-sm font-semibold ${circuit ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container text-on-surface-variant"}`}>
                        {circuit ? `${circuit.nom}${herite ? " (hérité)" : ""}` : "Circuit par défaut"}
                      </span>
                    </td>
                    {colonneDetail ? <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">{detail?.(ligne)}</div></td> : null}
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => onModifier(ligne)}>
                        Modifier
                      </button>
                      <button type="button" className="ml-3 font-label-md text-label-md text-error hover:underline" onClick={() => onRetirer(ligne)}>
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
