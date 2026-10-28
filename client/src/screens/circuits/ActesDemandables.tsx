import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { ConfigurationCircuits, ElementCircuit } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Select } from "../../ui/Select";
import { Precision, TableauElements } from "./TableauElements";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

type Acte = ElementCircuit & { id: number; periode: boolean; destinataire: boolean; justificatif: string; justificatif_obligatoire: boolean };
type Edition = { id: number | null; libelle: string; parent: string; periode: boolean; destinataire: boolean; justificatif: string; justificatif_obligatoire: boolean };

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
        <button type="button" onClick={() => setEdition({ id: null, libelle: "", parent: "", periode: false, destinataire: false, justificatif: "", justificatif_obligatoire: false })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shrink-0">
          <Icone nom="add" className="text-lg" />Nouvel acte
        </button>
      </div>

      {configuration.isError ? (
        <div className={`${CARD} p-6`} role="alert"><p className="font-label-lg text-label-lg text-error">Les actes n’ont pas pu être chargés.</p></div>
      ) : (
        <TableauElements
          lignes={actes}
          circuits={circuits}
          colonneDetail="Précisions demandées"
          detail={(acte) => (
            <>
              {acte.periode ? <Precision>Période</Precision> : null}
              {acte.destinataire ? <Precision>Destinataire</Precision> : null}
              {acte.justificatif_obligatoire ? <Precision>Justificatif obligatoire</Precision> : null}
              {!acte.periode && !acte.destinataire && !acte.justificatif_obligatoire ? <span className="text-on-surface-variant">—</span> : null}
            </>
          )}
          vide={{ titre: configuration.data ? "Aucun acte configuré" : "Chargement…", texte: configuration.data ? "Les agents ne peuvent rien demander tant qu’aucun acte n’est ajouté." : "" }}
          onModifier={(acte) => setEdition({ id: acte.id, libelle: acte.libelle, parent: acte.parent, periode: acte.periode, destinataire: acte.destinataire, justificatif: acte.justificatif, justificatif_obligatoire: acte.justificatif_obligatoire })}
          onRetirer={(acte) => void retirer(acte)}
        />
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
        <label className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low cursor-pointer">
          <input type="checkbox" className="accent-primary h-4 w-4 mt-0.5" checked={edition.justificatif_obligatoire} onChange={(e) => onChange({ ...edition, justificatif_obligatoire: e.target.checked })} />
          <span>
            <span className="font-label-md text-label-md text-on-surface block">Justificatif obligatoire</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">La demande n’est pas recevable sans pièce jointe (événement familial, allaitement…).</span>
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="font-label-md text-label-md text-on-surface font-semibold">Conseil pour le justificatif</span>
          <input className={CHAMP} value={edition.justificatif} onChange={(e) => onChange({ ...edition, justificatif: e.target.value })} maxLength={200} placeholder="Par exemple : acte de décès, convocation…" />
        </label>
      </div>
    </Modale>
  );
}
