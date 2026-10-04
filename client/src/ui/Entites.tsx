import type { ReactNode } from "react";
import type { EntiteTutelle } from "../api/types";

export function rangerStructures(entites: EntiteTutelle[]): { item: EntiteTutelle; profondeur: number }[] {
  const parParent = new Map<string, EntiteTutelle[]>();
  for (const item of entites) {
    const cle = item.parent || "";
    parParent.set(cle, [...(parParent.get(cle) ?? []), item]);
  }
  const resultat: { item: EntiteTutelle; profondeur: number }[] = [];
  const visiter = (parent: string, profondeur: number) => {
    for (const item of parParent.get(parent) ?? []) {
      resultat.push({ item, profondeur });
      visiter(item.code, profondeur + 1);
    }
  };
  visiter("", 0);
  const places = new Set(resultat.map((ligne) => ligne.item.code));
  for (const item of entites) {
    if (!places.has(item.code)) resultat.push({ item, profondeur: 0 });
  }
  return resultat;
}

/** Regroupe les structures par pôle, en respectant direction puis structures rattachées. */
export function optionsEntites(entites: EntiteTutelle[]): ReactNode {
  const poles: { code: string; libelle: string }[] = [];
  for (const item of entites) {
    if (!poles.some((pole) => pole.code === item.pole)) poles.push({ code: item.pole, libelle: item.pole_libelle });
  }
  return poles.map((pole) => (
    <optgroup key={pole.code} label={pole.libelle}>
      {rangerStructures(entites.filter((item) => item.pole === pole.code)).map(({ item, profondeur }) => (
        <option key={item.code} value={item.code}>{`${"– ".repeat(profondeur)}${item.nom}`}</option>
      ))}
    </optgroup>
  ));
}
