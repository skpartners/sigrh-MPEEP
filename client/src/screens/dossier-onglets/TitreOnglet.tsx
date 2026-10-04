import type { ReactNode } from "react";

/** Même bandeau que les onglets Congés et Action sociale. */
export function TitreOnglet({ titre, actions }: { titre: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2.5 py-0.5 rounded text-primary-container bg-primary-fixed font-label-sm text-label-sm uppercase tracking-wider font-bold">Régime Statutaire Général</span>
          <span className="text-on-surface-variant font-label-sm text-label-sm">• Statut Général des Fonctionnaires (Loi n°2023-892)</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">{titre}</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Direction des Ressources Humaines • Direction Générale du Portefeuille de l'État (DGPE)</p>
      </div>
      {actions}
    </div>
  );
}
