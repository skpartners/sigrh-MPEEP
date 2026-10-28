import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiError, api } from "../../api/client";
import type { ConfigurationCircuits, ElementCircuit } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { Select } from "../../ui/Select";
import { TableauElements } from "./TableauElements";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

type Famille = "conge" | "absence";
type Edition = { id: number | null; libelle: string; parent: string };

const TEXTES: Record<Famille, { titre: string; aide: string; singulier: string; nouveau: string; sousRubrique: boolean }> = {
  conge: {
    titre: "Congés proposés aux agents",
    aide: "Ces congés composent la liste « Nature de la demande » du profil agent. Un congé peut avoir des sous-rubriques (par exemple la maladie de courte ou de longue durée).",
    singulier: "congé",
    nouveau: "Nouveau congé",
    sousRubrique: true,
  },
  absence: {
    titre: "Absences proposées aux agents",
    aide: "Ces absences figurent, avec les congés, dans la demande de l’agent. Elles suivent le circuit auquel elles sont attribuées, sinon le circuit par défaut.",
    singulier: "absence",
    nouveau: "Nouvelle absence",
    sousRubrique: false,
  },
};

/** Gestion d'une famille d'éléments attribuables à un circuit : congés (avec sous-rubriques) ou absences. */
export function ElementsConfigurables({ famille }: { famille: Famille }) {
  const texte = TEXTES[famille];
  const titreId = useId();
  const feedback = useFeedback();
  const client = useQueryClient();
  const [edition, setEdition] = useState<Edition | null>(null);
  const configuration = useQuery({
    queryKey: ["circuits-config"],
    queryFn: () => api<ConfigurationCircuits>("/api/v1/circuits/configuration/"),
  });
  const elements: ElementCircuit[] = famille === "conge" ? (configuration.data?.elements.conges ?? []) : (configuration.data?.elements.absences ?? []);
  const circuits = configuration.data?.circuits ?? [];

  async function rafraichir() {
    await client.invalidateQueries({ queryKey: ["circuits-config"] });
    await client.invalidateQueries({ queryKey: ["agent"] });
  }

  async function retirer(element: ElementCircuit) {
    const confirme = await feedback.confirm(`Retirer « ${element.libelle} » ?`, {
      message: "Les agents ne pourront plus le demander. Les demandes déjà traitées restent consultables.",
      confirmLabel: "Retirer",
    });
    if (!confirme) return;
    try {
      await feedback.run(`Retrait du ${texte.singulier}…`, () => api(`/api/v1/circuits/elements/${famille}/${element.id}/`, { method: "DELETE" }), {
        error: "Le retrait a échoué",
        success: { title: "Élément retiré" },
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
          <h2 id={titreId} className="font-headline-md text-headline-md text-on-surface">{texte.titre}</h2>
        </div>
        <button type="button" onClick={() => setEdition({ id: null, libelle: "", parent: "" })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shrink-0">
          <Icone nom="add" className="text-lg" />{texte.nouveau}
        </button>
      </div>

      {configuration.isError ? (
        <div className={`${CARD} p-6`} role="alert"><p className="font-label-lg text-label-lg text-error">La liste n’a pas pu être chargée.</p></div>
      ) : (
        <TableauElements
          lignes={elements}
          circuits={circuits}
          vide={{ titre: configuration.data ? `Aucun ${texte.singulier} proposé` : "Chargement…", texte: configuration.data ? `Les agents ne peuvent rien demander tant qu'aucun ${texte.singulier} n'est ajouté.` : "" }}
          onModifier={(element) => setEdition({ id: element.id, libelle: element.libelle, parent: element.parent })}
          onRetirer={(element) => void retirer(element)}
        />
      )}

      {edition ? (
        <Editeur famille={famille} edition={edition} rubriques={elements.filter((element) => !element.parent && element.id !== edition.id)}
          possedeEnfants={edition.id != null && elements.some((element) => element.parent === elements.find((item) => item.id === edition.id)?.code)}
          onChange={setEdition} onFermer={() => setEdition(null)} onEnregistre={rafraichir} />
      ) : null}
    </section>
  );
}

function Editeur({ famille, edition, rubriques, possedeEnfants, onChange, onFermer, onEnregistre }: {
  famille: Famille;
  edition: Edition;
  rubriques: ElementCircuit[];
  possedeEnfants: boolean;
  onChange: (edition: Edition) => void;
  onFermer: () => void;
  onEnregistre: () => Promise<void>;
}) {
  const texte = TEXTES[famille];
  const enregistrement = useMutation({
    mutationFn: () =>
      api(edition.id == null ? `/api/v1/circuits/elements/${famille}/` : `/api/v1/circuits/elements/${famille}/${edition.id}/`, {
        method: edition.id == null ? "POST" : "PUT",
        body: JSON.stringify(edition),
      }),
    onSuccess: async () => {
      await onEnregistre();
      onFermer();
    },
  });
  const erreur = enregistrement.error instanceof ApiError ? enregistrement.error.message : enregistrement.isError ? "L’enregistrement a échoué." : "";

  return (
    <Modale titre={edition.id == null ? texte.nouveau : `Modifier le ${texte.singulier}`} sousTitre="Il apparaît dans la demande de l’agent."
      icone="event_available" taille="md" onClose={onFermer} onSubmit={() => enregistrement.mutate()} enCours={enregistrement.isPending} erreur={erreur || undefined}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onFermer} disabled={enregistrement.isPending}>Annuler</button>
          <button type="submit" className={BOUTON_PRIMAIRE} disabled={enregistrement.isPending || !edition.libelle.trim()}>Enregistrer</button>
        </>
      }>
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="font-label-md text-label-md text-on-surface font-semibold">Nom <span className="text-error">*</span></span>
          <input className={CHAMP} value={edition.libelle} onChange={(e) => onChange({ ...edition, libelle: e.target.value })} maxLength={famille === "conge" ? 80 : 120} required />
        </label>
        {texte.sousRubrique ? (
          <label className="block space-y-1.5">
            <span className="font-label-md text-label-md text-on-surface font-semibold">Rubrique</span>
            <Select className={CHAMP} value={edition.parent} disabled={possedeEnfants} onChange={(e) => onChange({ ...edition, parent: e.target.value })}>
              <option value="">Aucune : congé de premier niveau</option>
              {rubriques.map((rubrique) => <option key={rubrique.code} value={rubrique.code}>Sous-rubrique de « {rubrique.libelle} »</option>)}
            </Select>
            <span className="block font-body-sm text-body-sm text-on-surface-variant">
              {possedeEnfants ? "Ce congé a des sous-rubriques : il ne peut pas être rangé sous un autre." : "Sans circuit propre, une sous-rubrique suit le circuit de sa rubrique."}
            </span>
          </label>
        ) : null}
      </div>
    </Modale>
  );
}
