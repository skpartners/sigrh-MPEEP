import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { dateCourte } from "../../ui/format";
import { ouvreAuClic } from "../../ui/clicLigne";
import { useFeedback } from "../../ui/Feedback";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, Modale } from "../../ui/Modale";

type Campagne = {
  id: number;
  exercice: number;
  statut: string;
  statut_libelle: string;
  phase: string;
  cloturee: boolean;
  delai: string;
  limite_agents: string;
  limite_hierarchie: string;
  limite_rh: string;
  limite_drh: string;
  communique: string;
  plans: number;
  participants: number;
  cloturee_le: string;
};
type Liste = { role: "drh" | "rh"; peut_ouvrir: boolean; campagnes: Campagne[] };
type Saisie = { exercice: string; delai: string; limite_agents: string; limite_hierarchie: string; limite_rh: string; limite_drh: string; communique: string };

const CLE = ["campagnes-conges"];
const ROUTE = "/api/v1/conges/planification/campagnes/";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";
const BOUTON_LIGNE = "inline-flex items-center gap-1.5 rounded-lg border border-outline-variant px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-surface-container-low disabled:opacity-50";

function plusJours(jours: number): string {
  const date = new Date();
  date.setDate(date.getDate() + jours);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function saisieVide(): Saisie {
  return {
    exercice: String(new Date().getFullYear()), delai: plusJours(60), limite_agents: plusJours(14), limite_hierarchie: plusJours(28),
    limite_rh: plusJours(42), limite_drh: plusJours(56),
    communique: "La planification annuelle des congés est ouverte. Chaque agent choisit ses dates avant la date limite ; passé ce délai, son responsable les fixera.",
  };
}

function saisieDe(campagne: Campagne): Saisie {
  return {
    exercice: String(campagne.exercice), delai: campagne.delai, limite_agents: campagne.limite_agents, limite_hierarchie: campagne.limite_hierarchie,
    limite_rh: campagne.limite_rh, limite_drh: campagne.limite_drh, communique: campagne.communique,
  };
}

/** Campagnes de planification des congés : créer, consulter, modifier, clôturer et supprimer. Réservé à l'équipe RH et au DRH. */
export function GestionCampagnes() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const liste = useQuery({ queryKey: CLE, queryFn: () => api<Liste>(ROUTE), retry: false });
  const [edition, setEdition] = useState<Campagne | "nouvelle" | null>(null);

  const rafraichir = async () => {
    await client.invalidateQueries({ queryKey: CLE });
    await client.invalidateQueries({ queryKey: ["carrieres-conges"] });
    await client.invalidateQueries({ queryKey: ["planification-conges"] });
  };
  const action = useMutation({
    mutationFn: ({ libelle, appel, succes }: { libelle: string; appel: () => Promise<unknown>; succes: string }) =>
      feedback.run(libelle, appel, { success: { title: succes } }),
    onSuccess: rafraichir,
    onError: (erreur) => feedback.toast("Action impossible", erreur instanceof ApiError ? erreur.message : undefined, "error"),
  });

  async function cloturer(campagne: Campagne) {
    if (!(await feedback.confirm(`Clôturer la campagne ${campagne.exercice} ?`, { message: "Elle n'est plus proposée aux agents et ne se modifie plus. Les dates déjà déposées sont conservées.", confirmLabel: "Clôturer" }))) return;
    action.mutate({ libelle: "Clôture de la campagne…", appel: () => api(`${ROUTE}${campagne.id}/cloturer/`, { method: "POST" }), succes: "Campagne clôturée" });
  }

  async function supprimer(campagne: Campagne) {
    const message = campagne.plans
      ? `Les ${campagne.plans} plan${campagne.plans > 1 ? "s" : ""} de congés déposés dans cette campagne seront supprimés avec elle. Cette action est définitive.`
      : "Cette action est définitive.";
    if (!(await feedback.confirm(`Supprimer la campagne ${campagne.exercice} ?`, { message, confirmLabel: "Supprimer" }))) return;
    action.mutate({ libelle: "Suppression de la campagne…", appel: () => api(`${ROUTE}${campagne.id}/`, { method: "DELETE" }), succes: "Campagne supprimée" });
  }

  const etape = (libelle: string, route: string, succes: string) =>
    action.mutate({ libelle, appel: () => api(`/api/v1/conges/planification/${route}/`, { method: "POST" }), succes });

  // Pas de droit sur la gestion des campagnes : la section n'existe pas pour cette personne.
  if (liste.isError || !liste.data) return null;
  const { campagnes, peut_ouvrir: peutOuvrir, role } = liste.data;

  return (
    <section className="bg-surface-container-lowest rounded-xl p-6 space-y-4" aria-labelledby="titre-campagnes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="titre-campagnes" className="font-headline-sm text-headline-sm text-on-surface font-bold">Campagnes de planification des congés</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Ouvrez, modifiez, clôturez ou supprimez une campagne. Les agents choisissent leurs dates depuis leur profil.</p>
        </div>
        <button type="button" className={BOUTON_PRIMAIRE} disabled={!peutOuvrir} title={peutOuvrir ? undefined : "Une campagne est déjà en cours : clôturez-la d'abord."} onClick={() => setEdition("nouvelle")}>
          <Icone nom="add" className="text-lg" />Ouvrir une campagne
        </button>
      </div>

      {campagnes.length === 0 ? <p className="font-body-sm text-body-sm text-on-surface-variant">Aucune campagne n'a encore été ouverte.</p> : null}
      <ul className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {campagnes.map((campagne) => (
          <li key={campagne.id} title={campagne.cloturee ? undefined : `Modifier la campagne ${campagne.exercice}`} onClick={campagne.cloturee ? undefined : ouvreAuClic(() => setEdition(campagne))} className={`rounded-xl border p-5 space-y-3 ${campagne.cloturee ? "border-hairline bg-surface-container-low/50" : "cursor-pointer border-primary/40 bg-primary-fixed/20 hover:bg-primary-fixed/40"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-headline-sm text-headline-sm font-bold text-on-surface">Campagne {campagne.exercice}</p>
                <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-bold ${campagne.cloturee ? "bg-surface-container-high text-on-surface-variant" : "bg-primary text-on-primary"}`}>
                  {!campagne.cloturee ? <span className="h-1.5 w-1.5 rounded-full bg-current motion-pulse-dot" aria-hidden="true" /> : null}
                  {campagne.statut_libelle}
                </span>
              </div>
              <p className="text-right font-label-sm text-label-sm text-on-surface-variant">
                {campagne.plans} plan{campagne.plans > 1 ? "s" : ""} déposé{campagne.plans > 1 ? "s" : ""} · {campagne.participants} agent{campagne.participants > 1 ? "s" : ""}
              </p>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-label-sm text-label-sm">
              {([["Agents", campagne.limite_agents], ["Responsables", campagne.limite_hierarchie], ["Équipe RH", campagne.limite_rh], ["DRH", campagne.limite_drh], ["Délai", campagne.delai]] as const).map(([nom, date]) => (
                <div key={nom} className="rounded-lg bg-surface-container px-2.5 py-1.5">
                  <dt className="text-on-surface-variant">{nom}</dt>
                  <dd className="font-code-num font-bold text-on-surface">{dateCourte(date)}</dd>
                </div>
              ))}
            </dl>
            <p className="line-clamp-2 font-body-sm text-body-sm text-on-surface-variant">{campagne.communique}</p>
            <div className="flex flex-wrap items-center gap-2">
              {!campagne.cloturee ? (
                <>
                  <button type="button" className={BOUTON_LIGNE} onClick={() => setEdition(campagne)}><Icone nom="edit" className="text-base" />Modifier</button>
                  <button type="button" className={BOUTON_LIGNE} disabled={action.isPending} onClick={() => void cloturer(campagne)}><Icone nom="lock" className="text-base" />Clôturer</button>
                  {campagne.statut === "accord" && role === "drh" ? (
                    <button type="button" className={`${BOUTON_LIGNE} border-primary text-primary`} onClick={() => etape("Ouverture de la campagne…", "accorder", "Campagne ouverte")}><Icone nom="how_to_reg" className="text-base" />Accorder l'ouverture</button>
                  ) : null}
                  {(campagne.statut === "ouverte" || campagne.statut === "remontee") && role === "rh" ? (
                    <button type="button" className={`${BOUTON_LIGNE} border-primary text-primary`} onClick={() => etape("Transmission au DRH…", "soumettre", "Ensemble soumis au DRH")}><Icone nom="forward_to_inbox" className="text-base" />Soumettre au DRH</button>
                  ) : null}
                  {campagne.statut === "soumis" && role === "drh" ? (
                    <button type="button" className={`${BOUTON_LIGNE} border-primary text-primary`} onClick={() => etape("Publication de l'arrêté…", "publier", "Congés arrêtés et notifiés")}><Icone nom="gavel" className="text-base" />Viser et publier l'arrêté</button>
                  ) : null}
                </>
              ) : null}
              <button type="button" className={`${BOUTON_LIGNE} ml-auto text-error hover:bg-error-container/50`} disabled={action.isPending} onClick={() => void supprimer(campagne)}>
                <Icone nom="delete" className="text-base" />Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
      {edition ? <FormulaireCampagne campagne={edition === "nouvelle" ? null : edition} onClose={() => setEdition(null)} onFait={rafraichir} /> : null}
    </section>
  );
}

function FormulaireCampagne({ campagne, onClose, onFait }: { campagne: Campagne | null; onClose: () => void; onFait: () => Promise<void> }) {
  const feedback = useFeedback();
  const [saisie, setSaisie] = useState<Saisie>(campagne ? saisieDe(campagne) : saisieVide());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const champ = (cle: keyof Saisie) => (event: { target: { value: string } }) => setSaisie((actuelle) => ({ ...actuelle, [cle]: event.target.value }));

  async function enregistrer() {
    setEnCours(true);
    setErreur("");
    try {
      await feedback.run(
        campagne ? "Enregistrement de la campagne…" : "Ouverture de la campagne…",
        () => api(campagne ? `${ROUTE}${campagne.id}/` : ROUTE, { method: campagne ? "PATCH" : "POST", body: JSON.stringify({ ...saisie, exercice: Number(saisie.exercice) }) }),
        { success: { title: campagne ? "Campagne modifiée" : "Campagne ouverte" } },
      );
      await onFait();
      onClose();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La campagne n'a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      titre={campagne ? `Modifier la campagne ${campagne.exercice}` : "Ouvrir une campagne de planification"}
      sousTitre="Chaque échéance suit celle du niveau précédent, et toutes restent dans le délai de la campagne."
      icone="event_repeat"
      taille="lg"
      onClose={onClose}
      onSubmit={() => void enregistrer()}
      libelleValider={campagne ? "Enregistrer" : "Ouvrir la campagne"}
      enCours={enCours}
      erreur={erreur || undefined}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <label className="block">
            <span className={LIBELLE}>Exercice <span className="text-error">*</span></span>
            <input className={CHAMP} type="number" required min={2000} max={2100} value={saisie.exercice} onChange={champ("exercice")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Choix des agents jusqu'au <span className="text-error">*</span></span>
            <input className={CHAMP} type="date" required value={saisie.limite_agents} onChange={champ("limite_agents")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Responsables jusqu'au <span className="text-error">*</span></span>
            <input className={CHAMP} type="date" required min={saisie.limite_agents} value={saisie.limite_hierarchie} onChange={champ("limite_hierarchie")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Équipe RH jusqu'au <span className="text-error">*</span></span>
            <input className={CHAMP} type="date" required min={saisie.limite_hierarchie} value={saisie.limite_rh} onChange={champ("limite_rh")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>DRH jusqu'au <span className="text-error">*</span></span>
            <input className={CHAMP} type="date" required min={saisie.limite_rh} value={saisie.limite_drh} onChange={champ("limite_drh")} />
          </label>
          <label className="block">
            <span className={LIBELLE}>Délai de la campagne <span className="text-error">*</span></span>
            <input className={CHAMP} type="date" required min={saisie.limite_drh} value={saisie.delai} onChange={champ("delai")} />
          </label>
        </div>
        <label className="block">
          <span className={LIBELLE}>Communiqué aux agents <span className="text-error">*</span></span>
          <textarea className={`${CHAMP} h-auto py-2`} required rows={4} value={saisie.communique} onChange={champ("communique")} />
        </label>
      </div>
    </Modale>
  );
}
