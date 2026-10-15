import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, mediaUrl } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { dateCourte } from "../../ui/format";

type Position = {
  id: number;
  type: string;
  type_libelle: string;
  structure_accueil: string;
  motif: string;
  date_debut: string;
  date_fin: string;
  reference_acte: string;
  detail: string;
  document_url: string;
  document_nom: string;
  etat: "en_cours" | "a_venir" | "terminee";
};

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";

const TYPES: { code: string; libelle: string; accueil: string; motif: string }[] = [
  { code: "detachement", libelle: "Détachement", accueil: "Administration ou institution d'accueil", motif: "Motif du détachement" },
  { code: "mise_a_disposition", libelle: "Mise à disposition", accueil: "Société ou administration d'accueil", motif: "Objet de la mise à disposition" },
  { code: "disponibilite", libelle: "Disponibilité", accueil: "", motif: "Motif de la disponibilité (convenances personnelles, études…)" },
  { code: "hors_cadre", libelle: "Position hors-cadre", accueil: "Institution ou mandat d'État", motif: "Mandat ou fonction exercée" },
];
const ETAT: Record<Position["etat"], { libelle: string; classe: string }> = {
  en_cours: { libelle: "En cours", classe: "bg-primary text-on-primary" },
  a_venir: { libelle: "À venir", classe: "bg-secondary-fixed text-on-secondary-fixed" },
  terminee: { libelle: "Terminée", classe: "bg-surface-container-high text-on-surface-variant" },
};
const TAILLE_MAX = 5 * 1024 * 1024;
const VIDE = { type: "detachement", structure_accueil: "", motif: "", date_debut: "", date_fin: "", reference_acte: "", detail: "" };

function message(erreur: unknown, defaut: string): string {
  return erreur instanceof ApiError ? erreur.message : defaut;
}

/**
 * Positions administratives d'un agent : détachement, mise à disposition, disponibilité, hors-cadre.
 * La période en cours fixe la situation de l'agent ; à son terme, il redevient « En activité ».
 */
export function PositionsModal({ matricule, nom, onClose }: { matricule: string; nom: string; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const base = `/api/v1/agents/${encodeURIComponent(matricule)}/positions/`;
  const liste = useQuery({ queryKey: ["positions", matricule], queryFn: () => api<Position[]>(base) });
  const [edition, setEdition] = useState<{ id?: number } | null>(null);
  const [saisie, setSaisie] = useState(VIDE);
  const [acte, setActe] = useState<File | null>(null);
  const [erreurActe, setErreurActe] = useState("");
  const actuel = liste.data?.find((item) => item.id === edition?.id);
  const type = TYPES.find((item) => item.code === saisie.type) ?? TYPES[0];

  async function rafraichir() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["positions", matricule] }),
      client.invalidateQueries({ queryKey: ["agents"] }),
      client.invalidateQueries({ queryKey: ["agent", matricule] }),
      client.invalidateQueries({ queryKey: ["parcours", matricule] }),
    ]);
  }

  const enregistrer = useMutation({
    mutationFn: () => {
      const corps = new FormData();
      Object.entries(saisie).forEach(([cle, valeur]) => corps.set(cle, valeur));
      if (acte) corps.set("document", acte);
      return api<Position>(edition?.id ? `${base}${edition.id}/` : base, { method: edition?.id ? "PATCH" : "POST", body: corps });
    },
    onSuccess: async () => {
      await rafraichir();
      feedback.toast(edition?.id ? "Position mise à jour" : "Position enregistrée", nom);
      setEdition(null);
    },
  });
  const retirer = useMutation({
    mutationFn: (item: Position) => api(`${base}${item.id}/`, { method: "DELETE" }),
    onSuccess: async () => {
      await rafraichir();
      feedback.toast("Position retirée", nom);
    },
    onError: (erreur) => feedback.toast("Suppression impossible", message(erreur, ""), "error"),
  });

  function ouvrir(item?: Position) {
    enregistrer.reset();
    setActe(null);
    setErreurActe("");
    setSaisie(item ? {
      type: item.type, structure_accueil: item.structure_accueil, motif: item.motif, date_debut: item.date_debut,
      date_fin: item.date_fin, reference_acte: item.reference_acte, detail: item.detail,
    } : VIDE);
    setEdition({ id: item?.id });
  }
  async function confirmerRetrait(item: Position) {
    if (await feedback.confirm(`Retirer ce ${item.type_libelle.toLowerCase()} ?`, { message: "La situation de l'agent est recalculée.", confirmLabel: "Retirer" })) retirer.mutate(item);
  }
  function choisirActe(choisi: File | null) {
    setErreurActe("");
    if (choisi && choisi.size > TAILLE_MAX) {
      setErreurActe("L'acte dépasse 5 Mo.");
      setActe(null);
      return;
    }
    setActe(choisi);
  }
  const champ = (cle: keyof typeof saisie) => (event: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: event.target.value });

  return (
    <Modale
      titre="Positions administratives"
      sousTitre={`${nom} · détachement, mise à disposition, disponibilité, hors-cadre`}
      icone="swap_horiz"
      taille="xl"
      onClose={onClose}
      pied={edition ? undefined : (
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => ouvrir()}><Icone nom="add" className="text-lg" />Mettre en position</button>
        </>
      )}
      onSubmit={edition ? () => {
        if (!acte && !actuel?.document_url) {
          setErreurActe("Joignez l'acte qui prononce cette position.");
          return;
        }
        enregistrer.mutate();
      } : undefined}
      enCours={enregistrer.isPending}
      erreur={edition ? (erreurActe || (enregistrer.isError ? message(enregistrer.error, "La position n'a pas été enregistrée.") : undefined)) : undefined}
    >
      {edition ? (
        <div className="space-y-4">
          <label className="block">
            <span className={LIBELLE}>Position <span className="text-error">*</span></span>
            <select className={CHAMP} value={saisie.type} onChange={champ("type")}>
              {TYPES.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
            </select>
          </label>
          {type.accueil ? (
            <label className="block">
              <span className={LIBELLE}>{type.accueil} <span className="text-error">*</span></span>
              <input className={CHAMP} required maxLength={200} value={saisie.structure_accueil} onChange={champ("structure_accueil")} />
            </label>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className={LIBELLE}>Date de début <span className="text-error">*</span></span>
              <input className={CHAMP} required type="date" value={saisie.date_debut} onChange={champ("date_debut")} />
            </label>
            <label className="block">
              <span className={LIBELLE}>Date de fin / de réintégration</span>
              <input className={CHAMP} type="date" min={saisie.date_debut || undefined} value={saisie.date_fin} onChange={champ("date_fin")} />
              <span className="mt-1 block font-label-sm text-label-sm text-on-surface-variant">Laissez vide si aucun terme n'est fixé.</span>
            </label>
          </div>
          <label className="block">
            <span className={LIBELLE}>{type.motif}</span>
            <input className={CHAMP} maxLength={200} value={saisie.motif} onChange={champ("motif")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Référence de l'acte</span>
            <input className={CHAMP} maxLength={120} value={saisie.reference_acte} onChange={champ("reference_acte")} placeholder="Ex. : Arrêté n° 0456/MPEEP/DRH" />
          </label>
          <label className="block">
            <span className={LIBELLE}>Détail</span>
            <input className={CHAMP} maxLength={300} value={saisie.detail} onChange={champ("detail")} />
          </label>
          <div>
            <label htmlFor="acte-position" className={LIBELLE}>Acte à joindre <span className="text-error">*</span></label>
            <input id="acte-position" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => choisirActe(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-on-surface file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-on-primary" />
            <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
              Arrêté, décision ou acte qui prononce la position (PDF, PNG, JPG ou WEBP, 5 Mo maximum).
              {actuel?.document_url && !acte ? (
                <> Acte actuel : <a className="text-primary underline" href={mediaUrl(actuel.document_url)} target="_blank" rel="noreferrer">{actuel.document_nom}</a>. Choisir un fichier le remplace.</>
              ) : null}
            </p>
          </div>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setEdition(null)} disabled={enregistrer.isPending}>Revenir à la liste</button>
        </div>
      ) : liste.isPending ? (
        <p className="text-on-surface-variant">Chargement des positions…</p>
      ) : liste.isError ? (
        <p role="alert" className="text-error">Les positions n'ont pas pu être chargées.</p>
      ) : liste.data.length === 0 ? (
        <p className="text-on-surface-variant">Cet agent est en activité normale : aucune position particulière n'est enregistrée.</p>
      ) : (
        <ul className="space-y-2.5">
          {liste.data.map((item) => (
            <li key={item.id} className="p-3 bg-surface-container-low rounded-lg flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold">{item.type_libelle}</span>
                  <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${ETAT[item.etat].classe}`}>{ETAT[item.etat].libelle}</span>
                  <span className="font-code-num text-label-sm text-on-surface-variant">{dateCourte(item.date_debut)} → {item.date_fin ? dateCourte(item.date_fin) : "sans terme fixé"}</span>
                </p>
                {item.structure_accueil ? <p className="mt-1 font-label-md text-label-md text-on-surface font-bold">{item.structure_accueil}</p> : null}
                {item.motif ? <p className="font-body-sm text-body-sm text-on-surface-variant">{item.motif}</p> : null}
                {item.reference_acte ? <p className="font-label-sm text-label-sm text-on-surface-variant">{item.reference_acte}</p> : null}
                {item.document_url ? (
                  <a href={mediaUrl(item.document_url)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-label-sm text-label-sm text-primary underline">
                    <Icone nom="attach_file" className="text-sm" />{item.document_nom || "Acte joint"}
                  </a>
                ) : null}
              </div>
              <span className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label={`Modifier ${item.type_libelle}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container" onClick={() => ouvrir(item)}><Icone nom="edit" className="text-lg" /></button>
                <button type="button" aria-label={`Retirer ${item.type_libelle}`} disabled={retirer.isPending} className="p-1.5 rounded text-on-surface-variant hover:text-error hover:bg-surface-container" onClick={() => void confirmerRetrait(item)}><Icone nom="delete" className="text-lg" /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modale>
  );
}
