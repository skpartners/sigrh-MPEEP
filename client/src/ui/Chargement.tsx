import type { CSSProperties } from "react";

/**
 * Langage d'attente unique de l'application : l'orbite.
 * Le sceau au centre, deux arcs de teinte principale qui tournent en sens contraire, un halo à la teinte d'accent.
 * Les couleurs viennent des jetons (donc des Paramètres) ; sous prefers-reduced-motion, l'orbite reste affichée, immobile.
 */

/** Rond d'attente. `petit` : sans sceau ni halo, pour une ligne de texte ou un bouton. */
export function Orbite({ taille, petit = false, className = "" }: { taille?: string; petit?: boolean; className?: string }) {
  const style = taille ? ({ "--t": taille } as CSSProperties) : undefined;
  return (
    <span className={`orbite ${petit ? "orbite-petit" : ""} ${className}`} style={style} aria-hidden="true">
      <svg className="orbite-arcs" viewBox="0 0 80 80">
        <circle className="orbite-piste" cx="40" cy="40" r="34" fill="none" strokeWidth={petit ? 7 : 4} />
        <circle className="orbite-tour" cx="40" cy="40" r="34" fill="none" stroke="var(--color-primary)" strokeWidth={petit ? 7 : 4} strokeLinecap="round" strokeDasharray="72 142" />
        {petit ? null : (
          <circle className="orbite-contre" cx="40" cy="40" r="27" fill="none" stroke="var(--color-tertiary)" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="34 136" />
        )}
      </svg>
      {petit ? null : <img className="orbite-sceau" src={`${import.meta.env.BASE_URL}logo.png`} alt="" />}
    </span>
  );
}

/** Trois points qui sautent, à placer après un libellé. */
export function PointsAttente() {
  return (
    <span className="points-attente" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Chargement d'une page ou d'un panneau. `enLigne` : une rangée discrète, pour les listes et les menus. */
export function Chargement({ libelle = "Chargement", detail, enLigne = false, className = "" }: { libelle?: string; detail?: string; enLigne?: boolean; className?: string }) {
  const texte = libelle.replace(/[….]+$/, "");
  if (enLigne) {
    return (
      <p className={`flex items-center justify-center gap-2.5 px-4 py-6 font-body-sm text-body-sm text-on-surface-variant ${className}`} role="status" aria-busy="true">
        <Orbite petit />
        <span>{texte}<PointsAttente /></span>
      </p>
    );
  }
  return (
    <div className={`flex flex-col items-center justify-center gap-4 px-4 py-14 text-center ${className}`} role="status" aria-busy="true">
      <Orbite taille="4.25rem" />
      <div>
        <p className="font-headline-sm text-headline-sm text-on-surface">{texte}<PointsAttente /></p>
        {detail ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{detail}</p> : null}
      </div>
    </div>
  );
}
