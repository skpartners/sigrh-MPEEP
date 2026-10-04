import { useState } from "react";
import { nombre } from "./format";
import { BOUTON_SECONDAIRE } from "./Modale";

/** Au-delà de cette taille, un tableau ne montre qu'une page à la fois. */
export const TAILLE_PAGE = 8;

export function usePagination<T>(lignes: T[], signature: string, taille = TAILLE_PAGE) {
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
    total: lignes.length,
    visibles: lignes.slice(courante * taille, courante * taille + taille),
    aller: setPage,
  };
}

export function Pagination({
  page,
  pages,
  total,
  aller,
  libelle = "ligne",
}: {
  page: number;
  pages: number;
  total: number;
  aller: (page: number) => void;
  libelle?: string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-hairline">
      <p className="font-label-sm text-label-sm text-on-surface-variant">
        {nombre(total)} {libelle}{total > 1 ? "s" : ""}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={BOUTON_SECONDAIRE} disabled={page === 0} onClick={() => aller(page - 1)}>
          Précédent
        </button>
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          Page {page + 1} / {pages}
        </span>
        <button type="button" className={BOUTON_SECONDAIRE} disabled={page >= pages - 1} onClick={() => aller(page + 1)}>
          Suivant
        </button>
      </div>
    </div>
  );
}
