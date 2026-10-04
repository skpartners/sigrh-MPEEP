import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../api/client";
import type { ConversationItem, Conversations, Fil, MessageItem, Personne, SessionUser } from "../api/types";
import { useFeedback } from "../ui/Feedback";
import { reducedMotion } from "../ui/Motion";
import { useIntervalle, useTempsReel } from "../ui/TempsReel";

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
        <span className="material-symbols-outlined text-xl">groups</span>
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
          className={`${sortie ? "motion-chat-out" : "motion-chat-in"} fixed z-[60] inset-x-2 top-20 bottom-60 sm:inset-x-auto sm:top-auto sm:bottom-48 sm:right-6 sm:w-[24rem] sm:h-[min(36rem,calc(100vh-18rem))] lg:bottom-40 rounded-xl border border-hairline bg-surface-container-lowest shadow-2xl flex flex-col overflow-hidden`}
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
          className="fixed z-[60] bottom-40 right-6 sm:bottom-28 lg:bottom-20 w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl hover:bg-primary-container flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-2xl" aria-hidden="true">{ouvert && !sortie ? "close" : "forum"}</span>
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
        <span className="material-symbols-outlined text-xl" aria-hidden="true">{nonLus ? "mark_chat_unread" : "chat_bubble"}</span>
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
          className="motion-overlay-card fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-[4.5rem] sm:top-auto sm:mt-2 sm:w-[22rem] z-50 rounded-lg border border-hairline bg-surface-container-lowest shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
            <h2 id="titre-apercu-messagerie" className="font-headline-sm text-headline-sm text-on-surface">Messages</h2>
            <span className="font-label-sm text-label-sm text-on-surface-variant">{nonLus ? `${nonLus} non lu${nonLus > 1 ? "s" : ""}` : "Tout est lu"}</span>
          </div>
          <ul className="max-h-80 overflow-y-auto overscroll-contain">
            {liste.isPending ? <li className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Chargement…</li> : null}
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
            <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
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
          <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_back</span>
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
    (c) => !q || c.titre.toLowerCase().includes(q) || c.interlocuteurs.some((p) => p.fonction.toLowerCase().includes(q)),
  );

  return (
    <>
      <EnTete
        titre="Messagerie"
        sousTitre="Échanges internes du ministère"
        action={
          <button type="button" onClick={onNouveau} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container">
            <span className="material-symbols-outlined text-base" aria-hidden="true">edit_square</span>
            Nouveau
          </button>
        }
      />
      <label className="block px-3 pt-3 shrink-0">
        <span className="sr-only">Filtrer les conversations</span>
        <span className="relative block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none" aria-hidden="true">search</span>
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
        {liste.isPending ? <li className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Chargement…</li> : null}
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
            <span className="material-symbols-outlined text-3xl text-on-surface-variant" aria-hidden="true">forum</span>
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

// --- Vue : nouveau message ---------------------------------------------------

function VueNouveau({ onRetour, onOuvrir }: { onRetour: () => void; onOuvrir: (id: number) => void }) {
  const [saisie, setSaisie] = useState("");
  const [terme, setTerme] = useState("");
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

  return (
    <>
      <EnTete titre="Nouveau message" sousTitre="Choisissez un collègue" onRetour={onRetour} />
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
        {annuaire.data?.map((personne) => (
          <li key={personne.id}>
            <button
              type="button"
              disabled={ouvrir.isPending}
              onClick={() => ouvrir.mutate(personne.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-container-low disabled:opacity-60"
            >
              <span className="w-10 h-10 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0 font-label-md text-label-md font-bold" aria-hidden="true">
                {personne.initiales}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-label-lg text-label-lg text-on-surface">{personne.nom_complet}</span>
                <span className="block truncate font-body-sm text-body-sm text-on-surface-variant">
                  {personne.fonction} · {personne.organisme}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Vue : fil de discussion -------------------------------------------------

function VueFil({ id, onRetour }: { id: number; onRetour: () => void }) {
  const intervalleFil = useIntervalle(5_000);
  const client = useQueryClient();
  const feedback = useFeedback();
  const [texte, setTexte] = useState("");
  const zone = useRef<HTMLTextAreaElement>(null);
  const defilement = useRef<HTMLOListElement>(null);
  const premierRendu = useRef(true);
  const vus = useRef<Set<number> | null>(null);
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

  // Toujours afficher le dernier message : direct à l'ouverture, en douceur ensuite.
  useLayoutEffect(() => {
    const liste = defilement.current;
    if (!liste || messages.length === 0) return;
    liste.scrollTo({ top: liste.scrollHeight, behavior: premierRendu.current || reducedMotion() ? "auto" : "smooth" });
    premierRendu.current = false;
  }, [messages.length]);

  // Les bulles présentes à l'ouverture ne s'animent pas ; seules les nouvelles arrivent en douceur.
  if (vus.current === null && fil.data) vus.current = new Set(messages.map((m) => m.id));

  const envoyer = useMutation({
    mutationFn: (contenu: string) =>
      api<MessageItem>(`/api/v1/messagerie/conversations/${id}/messages/`, { method: "POST", body: JSON.stringify({ texte: contenu }) }),
    onMutate: async (contenu) => {
      await client.cancelQueries({ queryKey: cleFil(id) });
      const avant = client.getQueryData<Fil>(cleFil(id));
      const provisoire: MessageItem = {
        id: -Date.now(),
        texte: contenu,
        envoye_le: new Date().toISOString(),
        de_moi: true,
        envoi: true,
        auteur: { id: 0, matricule: moi?.matricule ?? "", nom_complet: moi?.nom_complet ?? "Vous", initiales: "", fonction: moi?.fonction ?? "", organisme: moi?.organisme_sigle ?? "" },
      };
      client.setQueryData<Fil | undefined>(cleFil(id), (donnees) => donnees && { ...donnees, messages: [...donnees.messages, provisoire] });
      return { avant, contenu };
    },
    onError: (erreur, _contenu, contexte) => {
      if (contexte?.avant) client.setQueryData(cleFil(id), contexte.avant);
      if (contexte) setTexte(contexte.contenu); // le texte n'est jamais perdu
      feedback.toast("Message non envoyé", erreur instanceof Error ? erreur.message : undefined, "error");
    },
    // Le message confirmé remplace le provisoire sans rejouer l'animation d'arrivée.
    onSuccess: (message) => vus.current?.add(message.id),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: cleFil(id) });
      void client.invalidateQueries({ queryKey: CLE_LISTE, exact: true });
    },
  });

  function soumettre(event?: FormEvent) {
    event?.preventDefault();
    const contenu = texte.trim();
    if (!contenu || contenu.length > LONGUEUR_MAX) return;
    setTexte("");
    envoyer.mutate(contenu);
    zone.current?.focus();
  }

  function clavier(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      soumettre();
    }
  }

  // Hauteur de la zone de saisie : suit le texte, de une à cinq lignes.
  useLayoutEffect(() => {
    const champ = zone.current;
    if (!champ) return;
    champ.style.height = "auto";
    champ.style.height = `${Math.min(champ.scrollHeight, 120)}px`;
  }, [texte]);

  const sousTitre = conversation
    ? conversation.groupe
      ? conversation.interlocuteurs.map((p) => p.nom_complet).join(", ")
      : [conversation.interlocuteurs[0]?.fonction, conversation.interlocuteurs[0]?.organisme].filter(Boolean).join(" · ")
    : undefined;

  return (
    <>
      <EnTete
        titre={conversation?.titre ?? "Conversation"}
        sousTitre={sousTitre}
        onRetour={onRetour}
        avatar={conversation ? <Avatar conversation={conversation} taille="w-9 h-9" /> : null}
      />
      <ol ref={defilement} role="log" aria-live="polite" aria-label="Messages" className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-1.5 bg-background">
        {fil.isPending ? <li className="py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Chargement…</li> : null}
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
          return (
            <li key={message.id} className="list-none">
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
                <p
                  className={`max-w-[85%] px-3 py-2 rounded-2xl font-body-md text-body-md whitespace-pre-wrap break-words ${
                    message.de_moi ? "bg-primary-container text-on-primary rounded-br-md" : "bg-surface-container-lowest text-on-surface border border-hairline rounded-bl-md"
                  } ${message.envoi ? "opacity-70" : ""}`}
                >
                  {message.texte}
                </p>
                <span className="px-1 mt-0.5 font-label-sm text-label-sm text-on-surface-variant">
                  {message.envoi ? "Envoi…" : new Date(message.envoye_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={soumettre} className="shrink-0 border-t border-hairline p-2.5 flex items-end gap-2 bg-surface-container-lowest">
        <label className="flex-1">
          <span className="sr-only">Votre message</span>
          <textarea
            ref={zone}
            rows={1}
            value={texte}
            maxLength={LONGUEUR_MAX}
            onChange={(event) => setTexte(event.target.value)}
            onKeyDown={clavier}
            placeholder="Écrire un message…"
            className="block w-full resize-none max-h-[120px] px-3 py-2 rounded-lg bg-surface-container-low font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {texte.length > LONGUEUR_MAX - 200 ? (
            <span className="block px-1 pt-0.5 font-label-sm text-label-sm text-on-surface-variant text-right">
              {texte.length} / {LONGUEUR_MAX}
            </span>
          ) : null}
        </label>
        <button
          type="submit"
          disabled={!texte.trim()}
          aria-label="Envoyer le message"
          className="w-10 h-10 rounded-full bg-primary text-on-primary hover:bg-primary-container flex items-center justify-center shrink-0 disabled:bg-surface-container-high disabled:text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">send</span>
        </button>
      </form>
      <p className="sr-only">Entrée pour envoyer, Maj + Entrée pour aller à la ligne.</p>
    </>
  );
}
