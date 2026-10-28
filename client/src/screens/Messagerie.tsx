import { Chargement } from "../ui/Chargement";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { api, televerser } from "../api/client";
import type { ConversationItem, Conversations, Fil, MessageItem, Personne, SessionUser } from "../api/types";
import { useFeedback } from "../ui/Feedback";
import { reducedMotion } from "../ui/Motion";
import { useIntervalle, useTempsReel } from "../ui/TempsReel";
import { Icone } from "../ui/Icone";
import { Coches, EnregistreurVocal, PieceBulle, taille } from "./MessagerieMedias";
import { correspond } from "../ui/recherche";

const CLE_LISTE = ["messagerie"];
const cleFil = (id: number) => ["messagerie", "fil", id];
const LONGUEUR_MAX = 2000;
const SORTIE_MS = 150;

type Vue = { type: "liste" } | { type: "nouveau" } | { type: "fil"; id: number };

// --- Formats de date --------------------------------------------------------

function memeJour(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Liste : « 14:32 » aujourd'hui, « hier », « lun. » cette semaine, sinon « 12/03 ». */
function heureCourte(iso: string): string {
  const date = new Date(iso);
  const maintenant = new Date();
  if (memeJour(date, maintenant)) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (memeJour(date, hier)) return "hier";
  if (maintenant.getTime() - date.getTime() < 6 * 86_400_000) return date.toLocaleDateString("fr-FR", { weekday: "short" });
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/** Séparateur de jour dans un fil. */
function jourLong(iso: string): string {
  const date = new Date(iso);
  const maintenant = new Date();
  if (memeJour(date, maintenant)) return "Aujourd'hui";
  const hier = new Date(maintenant);
  hier.setDate(hier.getDate() - 1);
  if (memeJour(date, hier)) return "Hier";
  return date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function Avatar({ conversation, taille = "w-10 h-10" }: { conversation: Pick<ConversationItem, "groupe" | "interlocuteurs">; taille?: string }) {
  if (conversation.groupe) {
    return (
      <span className={`${taille} rounded-full bg-secondary-fixed text-secondary flex items-center justify-center shrink-0`} aria-hidden="true">
        <Icone nom="groups" className="text-xl" />
      </span>
    );
  }
  return (
    <span className={`${taille} rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0 font-label-md text-label-md font-bold`} aria-hidden="true">
      {conversation.interlocuteurs[0]?.initiales ?? "?"}
    </span>
  );
}

// --- Bouton flottant et panneau ----------------------------------------------

// --- État partagé : la barre du haut ouvre le panneau, le panneau survit à la navigation ----

type MessagerieApi = {
  /** Ouvre le panneau, sur une conversation précise ou sur la liste. */
  ouvrir: (conversationId?: number) => void;
  ouvert: boolean;
};

const MessagerieContext = createContext<MessagerieApi>({ ouvrir: () => undefined, ouvert: false });

function useListeConversations() {
  const intervalle = useIntervalle(15_000);
  return useQuery({
    queryKey: CLE_LISTE,
    queryFn: () => api<Conversations>("/api/v1/messagerie/conversations/"),
    refetchInterval: intervalle,
  });
}

/**
 * Monté une fois au-dessus des écrans de l'application : le panneau flottant reste ouvert d'un
 * écran à l'autre. `actif` est faux hors de /app (pages publiques, connexion).
 */
export function MessagerieProvider({ children, actif }: { children: ReactNode; actif: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [sortie, setSortie] = useState(false);
  const [vue, setVue] = useState<Vue>({ type: "liste" });
  const bouton = useRef<HTMLButtonElement>(null);
  const feedback = useFeedback();
  const { abonner } = useTempsReel();
  const filAffiche = ouvert && vue.type === "fil" ? vue.id : null;

  const ouvrir = useCallback((conversationId?: number) => {
    setVue(conversationId ? { type: "fil", id: conversationId } : { type: "liste" });
    setSortie(false);
    setOuvert(true);
  }, []);

  // Message reçu (pas envoyé par moi) dans une conversation qui n'est pas à l'écran : on prévient.
  const moi = useQueryClient().getQueryData<SessionUser>(["me"]);
  useEffect(
    () =>
      abonner((evenement) => {
        if (evenement.type !== "message.nouveau" || evenement.conversation_id === filAffiche) return;
        if (moi && evenement.auteur_matricule === moi.matricule) return;
        feedback.toast(`Message de ${evenement.auteur}`, evenement.extrait, "message");
      }),
    [abonner, feedback, filAffiche, moi],
  );

  function fermer() {
    if (!ouvert || sortie) return;
    setSortie(true);
    window.setTimeout(
      () => {
        setOuvert(false);
        setSortie(false);
        bouton.current?.focus();
      },
      reducedMotion() ? 0 : SORTIE_MS,
    );
  }

  useEffect(() => {
    if (!ouvert) return;
    function auClavier(event: globalThis.KeyboardEvent) {
      // Échap ferme le panneau, sauf si une boîte de dialogue (confirmation…) est au-dessus.
      if (event.key === "Escape" && !document.querySelector('[role="alertdialog"]')) fermer();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  });

  // Hors de l'application, ou après déconnexion : le panneau disparaît.
  useEffect(() => {
    if (!actif) setOuvert(false);
  }, [actif]);

  return (
    <MessagerieContext.Provider value={{ ouvrir, ouvert }}>
      {children}
      {actif && ouvert ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Messagerie interne"
          className={`${sortie ? "motion-chat-out" : "motion-chat-in"} fixed z-[60] inset-x-2 top-[calc(var(--haut-entete)+0.5rem)] bottom-[calc(var(--haut-pied)+5.5rem)] sm:inset-x-auto sm:top-auto sm:right-6 sm:w-[24rem] sm:h-[min(36rem,calc(100dvh-var(--haut-entete)-var(--haut-pied)-6.5rem))] rounded-xl border border-hairline bg-surface-container-lowest shadow-2xl flex flex-col overflow-hidden`}
        >
          {vue.type === "liste" ? <VueListe onOuvrir={(id) => setVue({ type: "fil", id })} onNouveau={() => setVue({ type: "nouveau" })} /> : null}
          {vue.type === "nouveau" ? <VueNouveau onRetour={() => setVue({ type: "liste" })} onOuvrir={(id) => setVue({ type: "fil", id })} /> : null}
          {vue.type === "fil" ? <VueFil key={vue.id} id={vue.id} onRetour={() => setVue({ type: "liste" })} /> : null}
        </div>
      ) : null}
      {actif ? (
        <button
          ref={bouton}
          type="button"
          onClick={() => (ouvert ? fermer() : ouvrir())}
          aria-expanded={ouvert}
          aria-haspopup="dialog"
          aria-label={ouvert ? "Fermer la messagerie" : "Ouvrir la messagerie"}
          className="fixed z-[60] bottom-[calc(var(--haut-pied)+0.75rem)] right-3 w-11 h-11 sm:bottom-[calc(var(--haut-pied)+1rem)] sm:right-6 sm:w-14 sm:h-14 rounded-full bg-primary text-on-primary shadow-xl hover:bg-primary-container flex items-center justify-center"
        >
          <Icone nom={ouvert && !sortie ? "close" : "forum"} className="text-2xl" />
        </button>
      ) : null}
    </MessagerieContext.Provider>
  );
}

/** Icône de la barre du haut, à côté de la cloche : non-lus et aperçu des conversations. */
export function MessagerieBouton() {
  const { ouvrir } = useContext(MessagerieContext);
  const liste = useListeConversations();
  const [deroule, setDeroule] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const nonLus = liste.data?.non_lus ?? 0;

  // Le badge rebondit quand un nouveau message arrive, pas au chargement.
  const precedent = useRef<number | null>(null);
  const [rebond, setRebond] = useState(0);
  useEffect(() => {
    if (precedent.current !== null && nonLus > precedent.current) setRebond((n) => n + 1);
    if (liste.data) precedent.current = nonLus;
  }, [nonLus, liste.data]);

  useEffect(() => {
    if (!deroule) return;
    function auClic(event: MouseEvent) {
      if (!conteneur.current?.contains(event.target as Node)) setDeroule(false);
    }
    function auClavier(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setDeroule(false);
        bouton.current?.focus();
      }
    }
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [deroule]);

  function aller(conversationId?: number) {
    setDeroule(false);
    ouvrir(conversationId);
  }

  // Les conversations non lues d'abord, puis les plus récentes : cinq au plus.
  const apercu = [...(liste.data?.conversations ?? [])].sort((a, b) => Number(b.non_lus > 0) - Number(a.non_lus > 0)).slice(0, 5);

  return (
    <div ref={conteneur} className="relative">
      <button
        ref={bouton}
        type="button"
        onClick={() => setDeroule((v) => !v)}
        aria-expanded={deroule}
        aria-haspopup="dialog"
        aria-controls="apercu-messagerie"
        aria-label={nonLus ? `Messagerie, ${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}` : "Messagerie, aucun message non lu"}
        className={`relative p-2 rounded hover:bg-surface-container-high ${deroule ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
      >
        <Icone nom={nonLus ? "mark_chat_unread" : "chat_bubble"} className="text-xl" />
        {nonLus ? (
          <span
            key={rebond}
            className={`absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center justify-center ring-2 ring-surface-container-lowest ${rebond ? "motion-bump" : ""}`}
            aria-hidden="true"
          >
            {nonLus > 9 ? "9+" : nonLus}
          </span>
        ) : null}
      </button>
      {deroule ? (
        <div
          id="apercu-messagerie"
          role="dialog"
          aria-labelledby="titre-apercu-messagerie"
          className="motion-overlay-card fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-[calc(var(--haut-entete)+0.5rem)] sm:top-auto sm:mt-2 sm:w-[22rem] z-50 rounded-lg border border-hairline bg-surface-container-lowest shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
            <h2 id="titre-apercu-messagerie" className="font-headline-sm text-headline-sm text-on-surface">Messages</h2>
            <span className="font-label-sm text-label-sm text-on-surface-variant">{nonLus ? `${nonLus} non lu${nonLus > 1 ? "s" : ""}` : "Tout est lu"}</span>
          </div>
          <ul className="max-h-80 overflow-y-auto overscroll-contain">
            {liste.isPending ? <li><Chargement enLigne libelle="Chargement…" /></li> : null}
            {liste.isError ? <li className="px-4 py-6 text-center font-body-sm text-body-sm text-error" role="alert">La messagerie est indisponible.</li> : null}
            {liste.data && apercu.length === 0 ? (
              <li className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Aucune conversation pour l'instant.</li>
            ) : null}
            {apercu.map((conversation) => (
              <li key={conversation.id} className="border-b border-hairline last:border-0">
                <button type="button" onClick={() => aller(conversation.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-container-low ${conversation.non_lus ? "bg-primary-fixed/15" : ""}`}>
                  <Avatar conversation={conversation} taille="w-9 h-9" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate font-label-lg text-label-lg ${conversation.non_lus ? "text-on-surface font-bold" : "text-on-surface font-medium"}`}>{conversation.titre}</span>
                      {conversation.dernier_message ? (
                        <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">{heureCourte(conversation.dernier_message.envoye_le)}</span>
                      ) : null}
                    </span>
                    <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">
                      {conversation.dernier_message ? `${conversation.dernier_message.de_moi ? "Vous : " : ""}${conversation.dernier_message.texte}` : "Nouvelle conversation"}
                    </span>
                  </span>
                  {conversation.non_lus ? <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Non lu"></span> : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => aller()} className="w-full px-4 py-2.5 border-t border-hairline bg-surface-container-low/60 font-label-md text-label-md text-primary hover:bg-surface-container-low text-left flex items-center justify-between">
            Ouvrir la messagerie
            <Icone nom="arrow_forward" className="text-base" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EnTete({ titre, sousTitre, onRetour, action, avatar }: { titre: string; sousTitre?: string; onRetour?: () => void; action?: ReactNode; avatar?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 border-b border-hairline bg-surface-container-low/60 shrink-0">
      {onRetour ? (
        <button type="button" onClick={onRetour} aria-label="Retour aux conversations" className="p-1.5 rounded text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface">
          <Icone nom="arrow_back" className="text-xl" />
        </button>
      ) : null}
      {avatar}
      <div className="min-w-0 flex-1 px-1">
        <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">{titre}</h2>
        {sousTitre ? <p className="font-label-sm text-label-sm text-on-surface-variant truncate">{sousTitre}</p> : null}
      </div>
      {action}
    </div>
  );
}

// --- Vue : liste des conversations ------------------------------------------

function VueListe({ onOuvrir, onNouveau }: { onOuvrir: (id: number) => void; onNouveau: () => void }) {
  const liste = useListeConversations();
  const [filtre, setFiltre] = useState("");
  const recherche = useRef<HTMLInputElement>(null);
  useEffect(() => recherche.current?.focus(), []);

  const q = filtre.trim().toLowerCase();
  const conversations = (liste.data?.conversations ?? []).filter(
    (c) => !q || correspond(c.titre, q) || c.interlocuteurs.some((p) => correspond(p.fonction, q)),
  );

  return (
    <>
      <EnTete
        titre="Messagerie"
        sousTitre="Échanges internes du ministère"
        action={
          <button type="button" onClick={onNouveau} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container">
            <Icone nom="edit_square" className="text-base" />
            Nouveau
          </button>
        }
      />
      <label className="block px-3 pt-3 shrink-0">
        <span className="sr-only">Filtrer les conversations</span>
        <span className="relative block">
          <Icone nom="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none" />
        <input
          ref={recherche}
          type="search"
          value={filtre}
          onChange={(event) => setFiltre(event.target.value)}
          placeholder="Filtrer les conversations…"
          className="w-full h-9 pl-9 pr-3 rounded bg-surface-container-low font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
        />
        </span>
      </label>
      <ul className="flex-1 overflow-y-auto overscroll-contain py-2" aria-label="Conversations">
        {liste.isPending ? <li><Chargement enLigne libelle="Chargement…" /></li> : null}
        {liste.isError ? (
          <li className="px-4 py-6 text-center" role="alert">
            <p className="font-label-lg text-label-lg text-error">La messagerie est indisponible.</p>
            <button type="button" className="mt-1 font-label-md text-label-md text-primary underline rounded" onClick={() => liste.refetch()}>
              Réessayer
            </button>
          </li>
        ) : null}
        {liste.data && conversations.length === 0 ? (
          <li className="px-6 py-10 text-center">
            <Icone nom="forum" className="text-3xl text-on-surface-variant" />
            <p className="font-label-lg text-label-lg text-on-surface mt-1">{q ? "Aucune conversation trouvée" : "Aucune conversation"}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Écrivez à un collègue avec « Nouveau ».</p>
          </li>
        ) : null}
        {conversations.map((conversation) => {
          const dernier = conversation.dernier_message;
          const nonLu = conversation.non_lus > 0;
          return (
            <li key={conversation.id}>
              <button type="button" onClick={() => onOuvrir(conversation.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container-low">
                <Avatar conversation={conversation} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate font-label-lg text-label-lg ${nonLu ? "text-on-surface font-bold" : "text-on-surface font-medium"}`}>{conversation.titre}</span>
                    {dernier ? (
                      <span className={`shrink-0 font-label-sm text-label-sm ${nonLu ? "text-primary font-bold" : "text-on-surface-variant"}`}>{heureCourte(dernier.envoye_le)}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate font-body-sm text-body-sm ${nonLu ? "text-on-surface" : "text-on-surface-variant"}`}>
                      {dernier ? `${dernier.de_moi ? "Vous : " : conversation.groupe ? `${dernier.auteur.nom_complet.split(" ").slice(-1)[0]} : ` : ""}${dernier.texte}` : "Nouvelle conversation"}
                    </span>
                    {nonLu ? (
                      <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center justify-center" aria-label={`${conversation.non_lus} non lu${conversation.non_lus > 1 ? "s" : ""}`}>
                        {conversation.non_lus}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// --- Vue : nouveau message ou nouveau groupe ----------------------------------

function VueNouveau({ onRetour, onOuvrir }: { onRetour: () => void; onOuvrir: (id: number) => void }) {
  const [saisie, setSaisie] = useState("");
  const [terme, setTerme] = useState("");
  const [groupe, setGroupe] = useState(false);
  const [choisis, setChoisis] = useState<Personne[]>([]);
  const [sujet, setSujet] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const feedback = useFeedback();
  useEffect(() => champ.current?.focus(), []);
  useEffect(() => {
    const minuteur = window.setTimeout(() => setTerme(saisie.trim()), 250);
    return () => window.clearTimeout(minuteur);
  }, [saisie]);

  const annuaire = useQuery({
    queryKey: ["messagerie", "annuaire", terme],
    queryFn: () => api<Personne[]>(`/api/v1/messagerie/annuaire/?q=${encodeURIComponent(terme)}`),
  });
  const ouvrir = useMutation({
    mutationFn: (destinataire: number) =>
      api<ConversationItem>("/api/v1/messagerie/conversations/", { method: "POST", body: JSON.stringify({ destinataire }) }),
    onSuccess: (conversation) => {
      void client.invalidateQueries({ queryKey: CLE_LISTE });
      onOuvrir(conversation.id);
    },
    onError: (erreur) => feedback.toast("Conversation impossible", erreur instanceof Error ? erreur.message : undefined, "error"),
  });
  const creerGroupe = useMutation({
    mutationFn: () =>
      api<ConversationItem>("/api/v1/messagerie/conversations/", { method: "POST", body: JSON.stringify({ sujet: sujet.trim(), participants: choisis.map((personne) => personne.id) }) }),
    onSuccess: (conversation) => {
      void client.invalidateQueries({ queryKey: CLE_LISTE });
      onOuvrir(conversation.id);
    },
    onError: (erreur) => feedback.toast("Groupe non créé", erreur instanceof Error ? erreur.message : undefined, "error"),
  });

  function basculer(personne: Personne) {
    setChoisis((actuels) => (actuels.some((item) => item.id === personne.id) ? actuels.filter((item) => item.id !== personne.id) : [...actuels, personne]));
  }

  return (
    <>
      <EnTete
        titre={groupe ? "Nouveau groupe" : "Nouveau message"}
        sousTitre={groupe ? "Nommez le groupe et choisissez au moins deux collègues" : "Choisissez un collègue"}
        onRetour={onRetour}
        action={
          <button
            type="button"
            onClick={() => setGroupe((valeur) => !valeur)}
            aria-pressed={groupe}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-label-md text-label-md ${groupe ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"}`}
          >
            <Icone nom="group_add" className="text-base" />
            Groupe
          </button>
        }
      />
      {groupe ? (
        <div className="shrink-0 space-y-2 px-3 pt-3">
          <label className="block">
            <span className="sr-only">Nom du groupe</span>
            <input
              type="text"
              value={sujet}
              maxLength={160}
              onChange={(event) => setSujet(event.target.value)}
              placeholder="Nom du groupe"
              className="h-9 w-full rounded bg-surface-container-low px-3 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          {choisis.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Membres du groupe">
              {choisis.map((personne) => (
                <li key={personne.id} className="flex items-center gap-1 rounded-full bg-primary-fixed py-0.5 pl-2.5 pr-1 font-label-sm text-label-sm text-on-primary-fixed">
                  {personne.nom_complet}
                  <button type="button" aria-label={`Retirer ${personne.nom_complet}`} onClick={() => basculer(personne)} className="rounded-full p-0.5 hover:bg-black/10">
                    <Icone nom="close" className="text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <label className="block px-3 pt-3 shrink-0">
        <span className="sr-only">Rechercher un collègue</span>
        <input
          ref={champ}
          type="search"
          value={saisie}
          onChange={(event) => setSaisie(event.target.value)}
          placeholder="Nom, matricule ou fonction…"
          className="w-full h-9 px-3 rounded bg-surface-container-low font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <ul className="flex-1 overflow-y-auto overscroll-contain py-2" aria-label="Collègues">
        {annuaire.isPending ? <li className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Recherche…</li> : null}
        {annuaire.data?.length === 0 ? (
          <li className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Aucun collègue ne correspond à « {terme} ».</li>
        ) : null}
        {annuaire.data?.map((personne) => {
          const retenu = choisis.some((item) => item.id === personne.id);
          return (
            <li key={personne.id}>
              <button
                type="button"
                disabled={ouvrir.isPending}
                aria-pressed={groupe ? retenu : undefined}
                onClick={() => (groupe ? basculer(personne) : ouvrir.mutate(personne.id))}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container-low disabled:opacity-60"
              >
                <span className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0 font-label-md text-label-md font-bold" aria-hidden="true">
                  {retenu ? <Icone nom="check" className="text-xl" /> : personne.initiales}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-label-lg text-label-lg text-on-surface">{personne.nom_complet}</span>
                  <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">
                    {personne.fonction} · {personne.organisme}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {groupe ? (
        <div className="shrink-0 border-t border-hairline p-2.5">
          <button
            type="button"
            disabled={creerGroupe.isPending || choisis.length < 2 || !sujet.trim()}
            onClick={() => creerGroupe.mutate()}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-label-md text-label-md font-semibold text-on-primary hover:bg-primary-container disabled:bg-surface-container-high disabled:text-on-surface-variant"
          >
            Créer le groupe ({choisis.length + 1} personnes)
          </button>
        </div>
      ) : null}
    </>
  );
}

// --- Vue : fil de discussion -------------------------------------------------

const PIECES_MAX = 5;
const TAILLE_MAX_PIECE = 15 * 1024 * 1024;
const ACCEPTE = ".jpg,.jpeg,.png,.webp,.gif,.heic,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.mp3,.m4a,.ogg,.wav,.webm,.opus,.aac,.mp4,.mov,.mkv";
const SAISIE_ENVOI_MS = 2_500;
const SAISIE_AFFICHEE_MS = 4_000;

function VueFil({ id, onRetour }: { id: number; onRetour: () => void }) {
  const intervalleFil = useIntervalle(5_000);
  const client = useQueryClient();
  const feedback = useFeedback();
  const { abonner, envoyer: envoyerTempsReel } = useTempsReel();
  const [texte, setTexte] = useState("");
  const [pieces, setPieces] = useState<File[]>([]);
  const [progression, setProgression] = useState<number | null>(null);
  const [reponse, setReponse] = useState<MessageItem | null>(null);
  const [ecrit, setEcrit] = useState("");
  const [aSupprimer, setASupprimer] = useState<number | null>(null);
  const [survol, setSurvol] = useState(false);
  const zone = useRef<HTMLTextAreaElement>(null);
  const defilement = useRef<HTMLOListElement>(null);
  const choixFichier = useRef<HTMLInputElement>(null);
  const premierRendu = useRef(true);
  const vus = useRef<Set<number> | null>(null);
  const derniereSaisie = useRef(0);
  const moi = client.getQueryData<SessionUser>(["me"]);

  const fil = useQuery({
    queryKey: cleFil(id),
    queryFn: () => api<Fil>(`/api/v1/messagerie/conversations/${id}/messages/`),
    refetchInterval: intervalleFil,
  });
  const messages = useMemo(() => fil.data?.messages ?? [], [fil.data]);
  const conversation = fil.data?.conversation;

  // Ouvrir le fil (ou y recevoir un message) vaut lecture.
  const nonLus = conversation?.non_lus ?? 0;
  useEffect(() => {
    if (!nonLus) return;
    void api(`/api/v1/messagerie/conversations/${id}/lu/`, { method: "POST" }).then(() => {
      client.setQueryData<Conversations | undefined>(CLE_LISTE, (liste) =>
        liste && {
          non_lus: Math.max(0, liste.non_lus - nonLus),
          conversations: liste.conversations.map((c) => (c.id === id ? { ...c, non_lus: 0 } : c)),
        },
      );
    });
  }, [id, nonLus, client]);

  useEffect(() => zone.current?.focus(), []);

  // « X écrit… » : l'indication disparaît seule si rien de neuf n'arrive.
  useEffect(() => {
    let minuteur = 0;
    const desabonner = abonner((evenement) => {
      if (evenement.type !== "messagerie.saisie" || evenement.conversation_id !== id) return;
      setEcrit(evenement.auteur);
      window.clearTimeout(minuteur);
      minuteur = window.setTimeout(() => setEcrit(""), SAISIE_AFFICHEE_MS);
    });
    return () => {
      desabonner();
      window.clearTimeout(minuteur);
    };
  }, [abonner, id]);

  // Toujours afficher le dernier message : direct à l'ouverture, en douceur ensuite.
  useLayoutEffect(() => {
    const liste = defilement.current;
    if (!liste || messages.length === 0) return;
    liste.scrollTo({ top: liste.scrollHeight, behavior: premierRendu.current || reducedMotion() ? "auto" : "smooth" });
    premierRendu.current = false;
  }, [messages.length]);

  // Les bulles présentes à l'ouverture ne s'animent pas ; seules les nouvelles arrivent en douceur.
  if (vus.current === null && fil.data) vus.current = new Set(messages.map((m) => m.id));

  function ajouter(fichiers: File[]) {
    const acceptes: File[] = [];
    for (const fichier of fichiers) {
      if (fichier.size > TAILLE_MAX_PIECE) {
        feedback.toast("Fichier trop lourd", `« ${fichier.name} » dépasse 15 Mo.`, "error");
        continue;
      }
      acceptes.push(fichier);
    }
    setPieces((actuelles) => {
      const suite = [...actuelles, ...acceptes];
      if (suite.length > PIECES_MAX) feedback.toast("Trop de fichiers", `Un message porte ${PIECES_MAX} fichiers au plus.`, "info");
      return suite.slice(0, PIECES_MAX);
    });
  }

  const envoyer = useMutation({
    mutationFn: async ({ contenu, fichiers, cite }: { contenu: string; fichiers: File[]; cite: MessageItem | null }) => {
      const adresse = `/api/v1/messagerie/conversations/${id}/messages/`;
      if (fichiers.length === 0) {
        return api<MessageItem>(adresse, { method: "POST", body: JSON.stringify({ texte: contenu, reponse_a: cite?.id ?? null }) });
      }
      const formulaire = new FormData();
      formulaire.set("texte", contenu);
      if (cite) formulaire.set("reponse_a", String(cite.id));
      fichiers.forEach((fichier) => formulaire.append("fichiers", fichier, fichier.name));
      setProgression(0);
      return televerser<MessageItem>(adresse, formulaire, setProgression);
    },
    onMutate: async ({ contenu, fichiers, cite }) => {
      if (fichiers.length > 0) return { avant: undefined };
      await client.cancelQueries({ queryKey: cleFil(id) });
      const avant = client.getQueryData<Fil>(cleFil(id));
      const provisoire: MessageItem = {
        id: -Date.now(),
        texte: contenu,
        envoye_le: new Date().toISOString(),
        de_moi: true,
        envoi: true,
        reponse_a: cite ? { id: cite.id, auteur: cite.auteur.nom_complet, extrait: cite.texte.slice(0, 140) } : null,
        auteur: { id: 0, matricule: moi?.matricule ?? "", nom_complet: moi?.nom_complet ?? "Vous", initiales: "", fonction: moi?.fonction ?? "", organisme: moi?.organisme_sigle ?? "" },
      };
      client.setQueryData<Fil | undefined>(cleFil(id), (donnees) => donnees && { ...donnees, messages: [...donnees.messages, provisoire] });
      return { avant };
    },
    onError: (erreur, variables, contexte) => {
      if (contexte?.avant) client.setQueryData(cleFil(id), contexte.avant);
      // Ni le texte ni les fichiers ne sont perdus.
      setTexte(variables.contenu);
      setPieces(variables.fichiers);
      setReponse(variables.cite);
      feedback.toast("Message non envoyé", erreur instanceof Error ? erreur.message : undefined, "error");
    },
    // Le message confirmé remplace le provisoire sans rejouer l'animation d'arrivée.
    onSuccess: (message) => vus.current?.add(message.id),
    onSettled: () => {
      setProgression(null);
      void client.invalidateQueries({ queryKey: cleFil(id) });
      void client.invalidateQueries({ queryKey: CLE_LISTE, exact: true });
    },
  });

  const supprimer = useMutation({
    mutationFn: (message: number) => api(`/api/v1/messagerie/messages/${message}/`, { method: "DELETE" }),
    onSettled: () => {
      setASupprimer(null);
      void client.invalidateQueries({ queryKey: cleFil(id) });
      void client.invalidateQueries({ queryKey: CLE_LISTE, exact: true });
    },
    onError: (erreur) => feedback.toast("Suppression impossible", erreur instanceof Error ? erreur.message : undefined, "error"),
  });

  function soumettre(event?: FormEvent) {
    event?.preventDefault();
    const contenu = texte.trim();
    if ((!contenu && pieces.length === 0) || contenu.length > LONGUEUR_MAX || envoyer.isPending) return;
    envoyer.mutate({ contenu, fichiers: pieces, cite: reponse });
    setTexte("");
    setPieces([]);
    setReponse(null);
    zone.current?.focus();
  }

  function clavier(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      soumettre();
    }
  }

  function saisie(valeur: string) {
    setTexte(valeur);
    const maintenant = Date.now();
    if (valeur && maintenant - derniereSaisie.current > SAISIE_ENVOI_MS) {
      derniereSaisie.current = maintenant;
      envoyerTempsReel({ type: "saisie", conversation_id: id });
    }
  }

  // Hauteur de la zone de saisie : suit le texte, de une à cinq lignes.
  useLayoutEffect(() => {
    const champ = zone.current;
    if (!champ) return;
    champ.style.height = "auto";
    champ.style.height = `${Math.min(champ.scrollHeight, 120)}px`;
  }, [texte]);

  const sousTitre = ecrit
    ? `${ecrit} écrit…`
    : conversation
      ? conversation.groupe
        ? conversation.interlocuteurs.map((p) => p.nom_complet).join(", ")
        : conversation.en_ligne
          ? "En ligne"
          : [conversation.interlocuteurs[0]?.fonction, conversation.interlocuteurs[0]?.organisme].filter(Boolean).join(" · ")
      : undefined;
  const envoiEnCours = envoyer.isPending && progression !== null;

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col ${survol ? "ring-2 ring-inset ring-primary" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(event) => {
        event.preventDefault();
        setSurvol(false);
        ajouter(Array.from(event.dataTransfer.files));
      }}
    >
      <EnTete
        titre={conversation?.titre ?? "Conversation"}
        sousTitre={sousTitre}
        onRetour={onRetour}
        avatar={conversation ? <Avatar conversation={conversation} taille="w-9 h-9" /> : null}
      />
      <ol ref={defilement} role="log" aria-live="polite" aria-label="Messages" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-1.5 bg-background">
        {fil.isPending ? <li><Chargement enLigne libelle="Chargement…" /></li> : null}
        {fil.isError ? (
          <li className="py-6 text-center" role="alert">
            <p className="font-label-lg text-label-lg text-error">Ce fil n'a pas pu être chargé.</p>
            <button type="button" className="mt-1 font-label-md text-label-md text-primary underline rounded" onClick={() => fil.refetch()}>
              Réessayer
            </button>
          </li>
        ) : null}
        {fil.data && messages.length === 0 ? (
          <li className="py-10 text-center font-body-sm text-body-sm text-on-surface-variant">Aucun message pour l'instant. Écrivez le premier.</li>
        ) : null}
        {messages.map((message, index) => {
          const precedent = messages[index - 1];
          const nouveauJour = !precedent || !memeJour(new Date(precedent.envoye_le), new Date(message.envoye_le));
          const memeAuteur = precedent && !nouveauJour && precedent.auteur.matricule === message.auteur.matricule;
          const anime = vus.current !== null && !vus.current.has(message.id);
          const supprimable = message.de_moi && !message.supprime && !message.envoi && Date.now() - new Date(message.envoye_le).getTime() < 48 * 3_600_000;
          return (
            <li key={message.id} className="list-none group">
              {nouveauJour ? (
                <p className="text-center my-3">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-on-surface-variant first-letter:uppercase inline-block">
                    {jourLong(message.envoye_le)}
                  </span>
                </p>
              ) : null}
              <div className={`flex flex-col ${message.de_moi ? "items-end" : "items-start"} ${memeAuteur ? "" : "mt-2.5"} ${anime ? "motion-bubble" : ""}`}>
                {conversation?.groupe && !message.de_moi && !memeAuteur ? (
                  <span className="px-1 mb-0.5 font-label-sm text-label-sm text-primary font-semibold">{message.auteur.nom_complet}</span>
                ) : null}
                <div className={`flex max-w-[88%] items-end gap-1 ${message.de_moi ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`min-w-0 space-y-1.5 px-3 py-2 rounded-2xl font-body-md text-body-md break-words ${
                      message.de_moi ? "bg-primary-container text-on-primary rounded-br-md" : "bg-surface-container-lowest text-on-surface border border-hairline rounded-bl-md"
                    } ${message.envoi ? "opacity-70" : ""}`}
                  >
                    {message.reponse_a ? (
                      <div className={`rounded-lg border-l-4 px-2 py-1 ${message.de_moi ? "border-on-primary/60 bg-white/15" : "border-primary bg-surface-container"}`}>
                        <span className="block font-label-sm text-label-sm font-bold">{message.reponse_a.auteur}</span>
                        <span className="block truncate font-body-sm text-body-sm opacity-90">{message.reponse_a.extrait || "Pièce jointe"}</span>
                      </div>
                    ) : null}
                    {message.supprime ? (
                      <p className="flex items-center gap-1.5 italic opacity-80">
                        <Icone nom="block" className="text-base" />Ce message a été supprimé
                      </p>
                    ) : (
                      <>
                        {message.pieces?.map((piece) => (
                          <PieceBulle key={piece.id} piece={piece} surMoi={message.de_moi} />
                        ))}
                        {message.texte ? <p className="whitespace-pre-wrap">{message.texte}</p> : null}
                      </>
                    )}
                  </div>
                  {!message.supprime && !message.envoi ? (
                    <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label="Répondre" title="Répondre" onClick={() => { setReponse(message); zone.current?.focus(); }} className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-high">
                        <Icone nom="reply" className="text-base" />
                      </button>
                      {supprimable ? (
                        aSupprimer === message.id ? (
                          <button type="button" onClick={() => supprimer.mutate(message.id)} disabled={supprimer.isPending} className="rounded-full bg-error px-2 py-1 font-label-sm text-label-sm font-bold text-on-error">
                            Supprimer pour tous ?
                          </button>
                        ) : (
                          <button type="button" aria-label="Supprimer pour tous" title="Supprimer pour tous" onClick={() => setASupprimer(message.id)} className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-high">
                            <Icone nom="delete" className="text-base" />
                          </button>
                        )
                      ) : null}
                    </span>
                  ) : null}
                </div>
                <span className="px-1 mt-0.5 flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
                  {message.envoi ? "Envoi…" : new Date(message.envoye_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  {message.de_moi && !message.envoi && !message.supprime ? <Coches statut={message.statut} /> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {reponse ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface-container-low px-3 py-1.5">
          <Icone nom="reply" className="text-lg text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-label-sm text-label-sm font-bold text-primary">{reponse.de_moi ? "Vous" : reponse.auteur.nom_complet}</span>
            <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">{reponse.texte || (reponse.pieces?.length ? "Pièce jointe" : "")}</span>
          </span>
          <button type="button" aria-label="Annuler la réponse" onClick={() => setReponse(null)} className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high">
            <Icone nom="close" className="text-lg" />
          </button>
        </div>
      ) : null}
      {pieces.length > 0 ? (
        <ul className="flex shrink-0 flex-wrap gap-1.5 border-t border-hairline bg-surface-container-low px-3 py-2" aria-label="Fichiers à envoyer">
          {pieces.map((fichier, rang) => (
            <li key={`${fichier.name}-${rang}`} className="flex max-w-full items-center gap-1.5 rounded-full bg-surface-container-lowest py-1 pl-2.5 pr-1 font-label-sm text-label-sm text-on-surface">
              <Icone nom={fichier.type.startsWith("image/") ? "image" : fichier.type.startsWith("audio/") ? "mic" : "description"} className="text-base" />
              <span className="max-w-40 truncate">{fichier.name}</span>
              <span className="text-on-surface-variant">{taille(fichier.size)}</span>
              <button type="button" aria-label={`Retirer ${fichier.name}`} disabled={envoiEnCours} onClick={() => setPieces((actuelles) => actuelles.filter((_, position) => position !== rang))} className="rounded-full p-0.5 hover:bg-surface-container-high">
                <Icone nom="close" className="text-base" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {envoiEnCours ? (
        <div className="shrink-0 px-3 pb-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progression ?? 0} aria-label="Envoi des fichiers">
          <div className="h-1 overflow-hidden rounded-full bg-surface-container-high">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progression}%` }} />
          </div>
        </div>
      ) : null}
      <form onSubmit={soumettre} className="shrink-0 border-t border-hairline p-2.5 flex items-end gap-1.5 bg-surface-container-lowest">
        <input
          ref={choixFichier}
          type="file"
          multiple
          accept={ACCEPTE}
          className="sr-only"
          tabIndex={-1}
          aria-label="Joindre des fichiers"
          onChange={(event) => {
            ajouter(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <button type="button" aria-label="Joindre un fichier" title="Joindre un fichier (photos, documents, 15 Mo au plus)" onClick={() => choixFichier.current?.click()} disabled={envoyer.isPending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50">
          <Icone nom="attach_file" className="text-xl" />
        </button>
        <label className="flex-1">
          <span className="sr-only">Votre message</span>
          <textarea
            ref={zone}
            rows={1}
            value={texte}
            maxLength={LONGUEUR_MAX}
            onChange={(event) => saisie(event.target.value)}
            onKeyDown={clavier}
            onPaste={(event) => {
              const collees = Array.from(event.clipboardData.files);
              if (collees.length) {
                event.preventDefault();
                ajouter(collees);
              }
            }}
            placeholder="Écrire un message…"
            className="block w-full resize-none max-h-[7.5rem] px-3 py-2 rounded-lg bg-surface-container-low font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {texte.length > LONGUEUR_MAX - 200 ? (
            <span className="block px-1 pt-0.5 font-label-sm text-label-sm text-on-surface-variant text-right">
              {texte.length} / {LONGUEUR_MAX}
            </span>
          ) : null}
        </label>
        {texte.trim() || pieces.length > 0 ? (
          <button
            type="submit"
            disabled={envoyer.isPending}
            aria-label="Envoyer le message"
            className="w-10 h-10 rounded-full bg-primary text-on-primary hover:bg-primary-container flex items-center justify-center shrink-0 disabled:bg-surface-container-high disabled:text-on-surface-variant"
          >
            <Icone nom="send" className="text-xl" />
          </button>
        ) : (
          <EnregistreurVocal onFichier={(fichier) => ajouter([fichier])} desactive={envoyer.isPending} />
        )}
      </form>
      <p className="sr-only">Entrée pour envoyer, Maj + Entrée pour aller à la ligne. Les fichiers se gardent 48 heures.</p>
    </div>
  );
}
