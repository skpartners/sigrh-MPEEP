import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export type GradeNomenclature = {
  code: string;
  categorie: string;
  libelle: string;
  ordre: number;
  en_vigueur: boolean;
  emplois: number;
};

export type EmploiNomenclature = {
  code: string;
  libelle: string;
  famille: string;
  famille_libelle: string;
  grade: string;
};

export type Nomenclature = {
  source: string;
  familles: { code: string; libelle: string }[];
  grades: GradeNomenclature[];
  emplois: EmploiNomenclature[];
};

export function useNomenclature() {
  return useQuery({
    queryKey: ["nomenclature"],
    queryFn: () => api<Nomenclature>("/api/v1/nomenclature/"),
    staleTime: 5 * 60 * 1000,
  });
}

const CATEGORIES = [
  ["A", "Catégorie A — conception et direction"],
  ["B", "Catégorie B — application"],
  ["C", "Catégorie C — exécution"],
  ["D", "Catégorie D — exécution"],
] as const;

export function SelectGrade({
  valeur,
  grades,
  onChange,
  className,
}: {
  valeur: string;
  grades: GradeNomenclature[];
  onChange: (code: string, categorie: string) => void;
  className: string;
}) {
  const connu = grades.some((item) => item.code === valeur);
  const anciens = grades.filter((item) => !item.en_vigueur);
  return (
    <select
      className={className}
      value={valeur}
      aria-label="Grade"
      onChange={(event) => {
        const code = event.target.value;
        onChange(code, grades.find((item) => item.code === code)?.categorie ?? "");
      }}
    >
      <option value="">Choisir un grade</option>
      {valeur && !connu ? <option value={valeur}>{valeur} — hors liste</option> : null}
      {CATEGORIES.map(([categorie, titre]) => {
        const items = grades.filter((item) => item.categorie === categorie && item.en_vigueur);
        if (!items.length) return null;
        return (
          <optgroup key={categorie} label={titre}>
            {items.map((item) => (
              <option key={item.code} value={item.code} title={item.libelle}>{item.code}</option>
            ))}
          </optgroup>
        );
      })}
      {anciens.length > 0 && (
        <optgroup label="Anciens grades, hors grille de 2015">
          {anciens.map((item) => (
            <option key={item.code} value={item.code} title={item.libelle}>{item.code}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function SelectEmploi({
  valeur,
  emplois,
  onChange,
  className,
  required,
}: {
  valeur: string;
  emplois: EmploiNomenclature[];
  onChange: (libelle: string, grade: string) => void;
  className: string;
  required?: boolean;
}) {
  const connu = emplois.some((item) => item.libelle === valeur);
  const familles = [...new Map(emplois.map((item) => [item.famille, item.famille_libelle])).entries()];
  return (
    <select
      className={className}
      value={valeur}
      required={required}
      aria-label="Emploi"
      onChange={(event) => {
        const libelle = event.target.value;
        onChange(libelle, emplois.find((item) => item.libelle === libelle)?.grade ?? "");
      }}
    >
      <option value="">Choisir un emploi</option>
      {valeur && !connu ? <option value={valeur}>{valeur} — hors liste</option> : null}
      {familles.map(([code, titre]) => (
        <optgroup key={code} label={titre}>
          {emplois.filter((item) => item.famille === code).map((item) => (
            <option key={item.code} value={item.libelle}>{item.libelle} · {item.grade}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
