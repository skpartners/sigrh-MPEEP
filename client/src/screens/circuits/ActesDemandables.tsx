import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { ConfigurationCircuits, ElementCircuit } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Select } from "../../ui/Select";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

type Acte = ElementCircuit & { id: number; periode: boolean; destinataire: boolean; justificatif: string };
type Edition = { id: number | null; libelle: string; parent: string; periode: boolean; destinataire: boolean; justificatif: string };

/**
 * Actes que l'agent peut demander depuis son profil. Cette liste alimente le choix « Acte demandé » ;
 * chaque acte suit le circuit auquel il est attribué, sinon le circuit par défaut.
 */
export function ActesDemandables() {
  const titreId = useId();
  const feedback = useFeedback();
  const client = useQueryClient();
  const [edition, setEdition] = useState<Edition | null>(null);
  const configuration = useQuery({
    queryKey: ["circuits-config"],
    queryFn: () => api<ConfigurationCircuits>("/api/v1/circuits/configuration/"),
  });
  const actes = (configuration.data?.elements.actes ?? []) as Acte[];
  const circuits = configuration.data?.circuits ?? [];
  const ordonnes = actes
    .filter((acte) => !acte.parent)
    .flatMap((racine) => [racine, ...actes.filter((acte) => acte.parent === racine.code)]);

  async function rafraichir() {
    await client.invalidateQueries({ queryKey: ["circuits-config"] });
    await client.invalidateQueries({ queryKey: ["demandes-actes"] });
  }

  async function retirer(acte: Acte) {
    const confirme = await feedback.confirm(`Retirer l’acte « ${acte.libelle} » ?`, {
      message: "Les agents ne pourront plus le demander. Les demandes déjà traitées restent consultables.",
      confirmLabel: "Retirer",
    });
    if (!confirme) return;
    try {
      await feedback.run("Retrait de l’acte…", () => api(`/api/v1/circuits/actes/${acte.id}/`, { method: "DELETE" }), {
        error: "L’acte n’a pas été retiré",
        success: { title: "Acte retiré" },
      });
      await rafraichir();
    } catch {
      /* le toast d'erreur est déjà affiché */
    }
  }

  return (
    <section className="space-y-4" aria-labelledby={titreId}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 id={titreId} className="font-headline-md text-headline-md text-on-surface">Actes demandables par les agents</h2>
        </div>
        <button type="button" onClick={() => setEdition({ id: null, libelle: "", parent: "", periode: false, destinataire: false, justificatif: "" })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shrink-0">
          <Icone nom="add" className="text-lg" />Nouvel acte
        </button>
      </div>

      {configuration.isError ? (
        <div className={`${CARD} p-6`} role="alert"><p className="font-label-lg text-label-lg text-error">Les actes n’ont pas pu être chargés.</p></div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {ordonnes.map((acte) => {
            const parent = actes.find((item) => item.code === acte.parent);
            const circuit = circuits.find((item) => item.id === (acte.circuit_id ?? parent?.circuit_id));
            const herite = acte.circuit_id == null && circuit != null;
            return (
              <li key={acte.id} className={`${CARD} p-4 flex items-start justify-between gap-3 ${parent ? "lg:ml-6 border-l-4 border-l-primary-fixed-dim" : ""}`}>
                <div className="min-w-0 space-y-1.5">
                  <p className="font-label-lg text-label-lg text-on-surface font-bold">{acte.libelle}</p>
                  {parent ? <p className="font-label-sm text-label-sm text-on-surface-variant">Sous-rubrique de « {parent.libelle} »</p> : null}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${circuit ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container text-on-surface-variant"}`}>
                      {circuit ? `Circuit : ${circuit.nom}${herite ? " (hérité)" : ""}` : "Circuit par défaut"}
                    </span>
                    {acte.periode ? <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm">Période</span> : null}
                    {acte.destinataire ? <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm">Destinataire</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setEdition({ id: acte.id, libelle: acte.libelle, parent: acte.parent, periode: acte.periode, destinataire: acte.destinataire, justificatif: acte.justificatif })}
                    className="px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high">Modifier</button>
                  <button type="button" onClick={() => void retirer(acte)}
                    className="px-3 py-1.5 rounded bg-surface-container text-error font-label-md text-label-md hover:bg-error-container">Retirer</button>
                </div>
              </li>
            );
          })}
          {actes.length === 0 && configuration.data ? (
            <li className={`${CARD} p-6 lg:col-span-2`}>
              <p className="font-label-lg text-label-lg text-on-surface">Aucun acte configuré</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Les agents ne peuvent rien demander tant qu’aucun acte n’est ajouté.</p>
            </li>
          ) : null}
        </ul>
      )}

      {edition ? <EditeurActe edition={edition} rubriques={actes.filter((acte) => !acte.parent && acte.id !== edition.id)} possedeEnfants={edition.id != null && actes.some((acte) => acte.parent === actes.find((item) => item.id === edition.id)?.code)} onChange={setEdition} onFermer={() => setEdition(null)} onEnregistre={rafraichir} /> : null}
    </section>
  );
}

function EditeurActe({ edition, rubriques, possedeEnfants, onChange, onFermer, onEnregistre }: {
  edition: Edition;
  rubriques: Acte[];
  possedeEnfants: boolean;
  onChange: (edition: Edition) => void;
  onFermer: () => void;
  onEnregistre: () => Promise<void>;
}) {
  const enregistrement = useMutation({
    mutationFn: () =>
      api(edition.id == null ? "/api/v1/circuits/actes/" : `/api/v1/circuits/actes/${edition.id}/`, {
        method: edition.id == null ? "POST" : "PUT",
        body: JSON.stringify(edition),
      }),
    onSuccess: async () => {
      await onEnregistre();
      onFermer();
    },
  });
  const erreur = enregistrement.error instanceof ApiError ? enregistrement.error.message : enregistrement.isError ? "L’acte n’a pas été enregistré." : "";

  return (
    <Modale titre={edition.id == null ? "Nouvel acte" : "Modifier l’acte"} sousTitre="Il apparaît dans la liste des actes demandables du profil agent."
      icone="description" taille="md" onClose={onFermer} onSubmit={() => enregistrement.mutate()} enCours={enregistrement.isPending} erreur={erreur || undefined}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onFermer} disabled={enregistrement.isPending}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={enregistrement.isPending || !edition.libelle.trim()}>Enregistrer</button>
        </>
      }>
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="font-label-md text-label-md text-on-surface font-semibold">Nom de l’acte <span className="text-error">*</span></span>
          <input className={CHAMP} value={edition.libelle} onChange={(e) => onChange({ ...edition, libelle: e.target.value })} maxLength={160} required />
        </label>
        <label className="block space-y-1.5">
          <span className="font-label-md text-label-md text-on-surface font-semibold">Rubrique</span>
          <Select className={CHAMP} value={edition.parent} disabled={possedeEnfants} onChange={(e) => onChange({ ...edition, parent: e.target.value })}>
            <option value="">Aucune : acte de premier niveau</option>
            {rubriques.map((rubrique) => <option key={rubrique.code} value={rubrique.code}>Sous-rubrique de « {rubrique.libelle} »</option>)}
          </Select>
          <span className="block font-body-sm text-body-sm text-on-surface-variant">
            {possedeEnfants ? "Cet acte a des sous-rubriques : il ne peut pas être rangé sous une autre." : "Sans circuit propre, une sous-rubrique suit le circuit de sa rubrique."}
          </span>
        </label>
        <label className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low cursor-pointer">
          <input type="checkbox" className="accent-primary h-4 w-4 mt-0.5" checked={edition.periode} onChange={(e) => onChange({ ...edition, periode: e.target.checked })} />
          <span>
            <span className="font-label-md text-label-md text-on-surface block">Période à renseigner</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">L’agent indique une date de début et une date de fin (permission, autorisation d’absence).</span>
          </span>
        </label>
        <label className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low cursor-pointer">
          <input type="checkbox" className="accent-primary h-4 w-4 mt-0.5" checked={edition.destinataire} onChange={(e) => onChange({ ...edition, destinataire: e.target.checked })} />
          <span>
            <span className="font-label-md text-label-md text-on-surface block">Destinataire de l’acte</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">L’agent peut préciser à qui l’acte est destiné (attestations).</span>
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="font-label-md text-label-md text-on-surface font-semibold">Conseil pour le justificatif (facultatif)</span>
          <input className={CHAMP} value={edition.justificatif} onChange={(e) => onChange({ ...edition, justificatif: e.target.value })} maxLength={200} placeholder="Par exemple : acte de décès, convocation…" />
        </label>
      </div>
    </Modale>
  );
}
