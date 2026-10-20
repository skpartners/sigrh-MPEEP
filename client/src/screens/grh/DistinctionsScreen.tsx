import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { Modale } from "../../ui/Modale";
import { CHAMP, LIBELLE, PRIMAIRE, PageGrh, Section } from "./ui";
import { Select } from "../../ui/Select";

type Famille = "prix_excellence" | "ordre_merite" | "autre";
type Distinction = { id: number; rang: string; titre: string; detail: string; etat: string; famille: Famille };
type Tableau = { distinctions: Distinction[] };

const FAMILLES: { code: Famille; titre: string; icone: string; vide: string }[] = [
  { code: "prix_excellence", titre: "Prix d'excellence", icone: "emoji_events", vide: "Aucun prix d'excellence enregistré." },
  { code: "ordre_merite", titre: "Distinctions dans l'ordre du mérite de la fonction publique", icone: "workspace_premium", vide: "Aucune distinction dans l'ordre du mérite enregistrée." },
  { code: "autre", titre: "Autres distinctions", icone: "military_tech", vide: "Aucune autre distinction enregistrée." },
];
const ROUTE = "/api/v1/carrieres/fin-de-carriere/distinctions/";

function message(erreur: unknown): string {
  return erreur instanceof ApiError ? erreur.message : "La distinction n'a pas été enregistrée.";
}

/** Distinctions des agents : prix d'excellence et ordre du mérite de la fonction publique. */
export function DistinctionsScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const donnees = useQuery({ queryKey: ["carrieres-fin-carriere"], queryFn: () => api<Tableau>("/api/v1/carrieres/fin-de-carriere/") });
  const [edition, setEdition] = useState<{ distinction?: Distinction; famille: Famille } | null>(null);
  const retirer = useMutation({
    mutationFn: (item: Distinction) => api(`${ROUTE}${item.id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast("Distinction retirée");
    },
  });

  return (
    <PageGrh
      rubrique="Action sociale"
      titre="Distinctions"
      resume="Prix d'excellence et distinctions dans l'ordre du mérite de la fonction publique, instruits avant la radiation des cadres."
      chargement={donnees.isLoading}
      erreur={donnees.isError ? "Les distinctions n'ont pas pu être chargées." : undefined}
      actions={<button type="button" className={PRIMAIRE} onClick={() => setEdition({ famille: "prix_excellence" })}><Icone nom="add" className="text-lg" />Nouvelle distinction</button>}
    >
      {donnees.data ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {FAMILLES.map((famille) => {
            const lignes = donnees.data.distinctions.filter((item) => (item.famille ?? "autre") === famille.code);
            return (
              <Section key={famille.code} titre={famille.titre} icone={famille.icone} className={famille.code === "autre" ? "xl:col-span-2" : ""}>
                {lignes.length === 0 ? <p className="font-body-sm text-on-surface-variant">{famille.vide}</p> : (
                  <ul className="space-y-2.5">
                    {lignes.map((item) => (
                      <li key={item.id} className="p-2.5 bg-surface-container-low rounded flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded bg-secondary-container/20 text-secondary font-bold font-label-sm flex items-center justify-center shrink-0">{item.rang}</span>
                          <span className="min-w-0">
                            <span className="font-label-md text-label-md font-bold text-on-surface block">{item.titre}</span>
                            {item.detail ? <span className="font-label-sm text-label-sm text-on-surface-variant">{item.detail}</span> : null}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 shrink-0">
                          {item.etat ? <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-label-sm font-bold whitespace-nowrap">{item.etat}</span> : null}
                          <button type="button" aria-label={`Modifier ${item.titre}`} className="p-1.5 rounded text-on-surface-variant hover:bg-surface-container" onClick={() => setEdition({ distinction: item, famille: item.famille })}><Icone nom="edit" className="text-base" /></button>
                          <button type="button" aria-label={`Retirer ${item.titre}`} disabled={retirer.isPending} className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container" onClick={() => retirer.mutate(item)}><Icone nom="delete" className="text-base" /></button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            );
          })}
        </div>
      ) : null}
      {edition ? <FormulaireDistinction distinction={edition.distinction} famille={edition.famille} onClose={() => setEdition(null)} /> : null}
    </PageGrh>
  );
}

function FormulaireDistinction({ distinction, famille, onClose }: { distinction?: Distinction; famille: Famille; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState({
    famille,
    rang: distinction?.rang ?? "",
    titre: distinction?.titre ?? "",
    detail: distinction?.detail ?? "",
    etat: distinction?.etat ?? "",
  });
  const envoi = useMutation({
    mutationFn: () => api(distinction ? `${ROUTE}${distinction.id}/` : ROUTE, { method: distinction ? "PATCH" : "POST", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["carrieres-fin-carriere"] });
      feedback.toast(distinction ? "Distinction mise à jour" : "Distinction ajoutée");
      onClose();
    },
  });
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });
  return (
    <Modale titre={distinction ? "Modifier la distinction" : "Nouvelle distinction"} icone="military_tech" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={envoi.isError ? message(envoi.error) : undefined}>
      <div className="space-y-4">
        <label className="block">
          <span className={LIBELLE}>Type de distinction</span>
          <Select className={CHAMP} value={saisie.famille} onChange={champ("famille")}>
            {FAMILLES.map((item) => <option key={item.code} value={item.code}>{item.titre}</option>)}
          </Select>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className={LIBELLE}>Rang <span className="text-error">*</span></span><input className={CHAMP} required maxLength={12} value={saisie.rang} onChange={champ("rang")} placeholder="Ex. : OR" /></label>
          <label className="block"><span className={LIBELLE}>État</span><input className={CHAMP} maxLength={80} value={saisie.etat} onChange={champ("etat")} placeholder="Ex. : Instruit" /></label>
        </div>
        <label className="block"><span className={LIBELLE}>Intitulé <span className="text-error">*</span></span><input className={CHAMP} required maxLength={200} value={saisie.titre} onChange={champ("titre")} /></label>
        <label className="block"><span className={LIBELLE}>Détail</span><input className={CHAMP} maxLength={240} value={saisie.detail} onChange={champ("detail")} /></label>
      </div>
    </Modale>
  );
}
