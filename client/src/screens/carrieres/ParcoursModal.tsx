import { Chargement } from "../../ui/Chargement";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import type { EtapeParcours } from "../../api/types";
import { ouvreAuClic } from "../../ui/clicLigne";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { dateCourte } from "../../ui/format";
import { Select } from "../../ui/Select";

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";

export const TYPES_PARCOURS: [string, string][] = [
  ["position", "Position"],
  ["nomination", "Nomination"],
  ["promotion", "Promotion"],
  ["mutation", "Mutation"],
  ["autre", "Autre événement"],
];

const VIDE = { type: "nomination", intitule: "", date_effet: "", reference_acte: "", detail: "" };

function message(erreur: unknown, defaut: string): string {
  return erreur instanceof ApiError ? erreur.message : defaut;
}

/** Suivi du parcours professionnel d'un agent : le gestionnaire ajoute, corrige et retire ; l'agent le consulte dans son profil. */
export function ParcoursModal({ matricule, nom, onClose }: { matricule: string; nom: string; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const base = `/api/v1/agents/${encodeURIComponent(matricule)}/parcours/`;
  const liste = useQuery({ queryKey: ["parcours", matricule], queryFn: () => api<EtapeParcours[]>(base) });
  const [edition, setEdition] = useState<{ id?: number } | null>(null);
  const [saisie, setSaisie] = useState(VIDE);

  async function rafraichir() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["parcours", matricule] }),
      client.invalidateQueries({ queryKey: ["agent", matricule] }),
    ]);
  }

  const enregistrer = useMutation({
    mutationFn: () => api<EtapeParcours>(edition?.id ? `${base}${edition.id}/` : base, { method: edition?.id ? "PATCH" : "POST", body: JSON.stringify(saisie) }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast(edition?.id ? "Événement mis à jour" : "Événement ajouté", nom);
      setEdition(null);
    },
  });
  const retirer = useMutation({
    mutationFn: (item: EtapeParcours) => api(`${base}${item.id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Événement retiré", nom);
    },
    onError: (erreur) => feedback.toast("Suppression impossible", message(erreur, ""), "error"),
  });

  function ouvrir(item?: EtapeParcours) {
    enregistrer.reset();
    setSaisie(item ? { type: item.type, intitule: item.intitule, date_effet: item.date_effet, reference_acte: item.reference_acte, detail: item.detail } : VIDE);
    setEdition({ id: item?.id });
  }
  async function confirmerRetrait(item: EtapeParcours) {
    if (await feedback.confirm(`Retirer « ${item.intitule} » du parcours ?`, { message: "L'agent ne le verra plus dans son profil.", confirmLabel: "Retirer" })) retirer.mutate(item);
  }
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });

  return (
    <Modale
      titre="Parcours professionnel"
      sousTitre={`${nom} · position, nominations, promotions, mutations`}
      icone="timeline"
      taille="xl"
      onClose={onClose}
      pied={edition ? undefined : (
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => ouvrir()}><Icone nom="add" className="text-lg" />Ajouter un événement</button>
        </>
      )}
      onSubmit={edition ? () => enregistrer.mutate() : undefined}
      enCours={enregistrer.isPending}
      erreur={edition && enregistrer.isError ? message(enregistrer.error, "L'événement n'a pas été enregistré.") : undefined}
    >
      {edition ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className={LIBELLE}>Type <span className="text-error">*</span></span>
              <Select className={CHAMP} value={saisie.type} onChange={champ("type")}>
                {TYPES_PARCOURS.map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
              </Select>
            </label>
            <label className="block">
              <span className={LIBELLE}>Date d'effet <span className="text-error">*</span></span>
              <input className={CHAMP} required type="date" value={saisie.date_effet} onChange={champ("date_effet")} />
            </label>
          </div>
          <label className="block">
            <span className={LIBELLE}>Intitulé <span className="text-error">*</span></span>
            <input className={CHAMP} required maxLength={200} value={saisie.intitule} onChange={champ("intitule")} placeholder="Ex. : Nommé chef de service des carrières" />
          </label>
          <label className="block">
            <span className={LIBELLE}>Référence de l'acte</span>
            <input className={CHAMP} maxLength={120} value={saisie.reference_acte} onChange={champ("reference_acte")} placeholder="Ex. : Arrêté n° 0123/MPEEP/DRH" />
          </label>
          <label className="block">
            <span className={LIBELLE}>Détail</span>
            <input className={CHAMP} maxLength={300} value={saisie.detail} onChange={champ("detail")} />
          </label>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setEdition(null)} disabled={enregistrer.isPending}>Revenir à la liste</button>
        </div>
      ) : liste.isPending ? (
        <Chargement libelle="Chargement du parcours…" />
      ) : liste.isError ? (
        <p role="alert" className="text-error">Le parcours n'a pas pu être chargé.</p>
      ) : liste.data.length === 0 ? (
        <p className="text-on-surface-variant">Aucun événement enregistré pour cet agent.</p>
      ) : (
        <ol className="space-y-2.5">
          {liste.data.map((item) => (
            <li key={`${item.origine}-${item.id}`} title={item.origine === "position" ? undefined : `Modifier ${item.intitule}`} onClick={item.origine === "position" ? undefined : ouvreAuClic(() => ouvrir(item))} className={`p-3 bg-surface-container-low rounded-lg flex items-start justify-between gap-3 ${item.origine === "position" ? "" : "cursor-pointer hover:bg-surface-container"}`}>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold">{item.type_libelle}</span>
                  <span className="font-code-num text-label-sm text-on-surface-variant">{dateCourte(item.date_effet)}</span>
                </p>
                <p className="mt-1 font-label-md text-label-md text-on-surface font-bold">{item.intitule}</p>
                {item.reference_acte ? <p className="font-label-sm text-label-sm text-on-surface-variant">{item.reference_acte}</p> : null}
                {item.detail ? <p className="font-body-sm text-body-sm text-on-surface-variant">{item.detail}</p> : null}
              </div>
              {item.origine === "position" ? (
                <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0">Voir « Position »</span>
              ) : <span className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label={`Modifier ${item.intitule}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => ouvrir(item)}><Icone nom="edit" className="text-lg" /></button>
                <button type="button" aria-label={`Retirer ${item.intitule}`} disabled={retirer.isPending} className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container" onClick={() => void confirmerRetrait(item)}><Icone nom="delete" className="text-lg" /></button>
              </span>}
            </li>
          ))}
        </ol>
      )}
    </Modale>
  );
}
