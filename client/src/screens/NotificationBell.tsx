import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { NotificationItem, Notifications } from "../api/types";
import { Skeleton } from "../ui/Motion";
import { useIntervalle } from "../ui/TempsReel";
import { Icone } from "../ui/Icone";

const CLE = ["notifications"];

const CATEGORIE: Record<NotificationItem["categorie"], { icone: string; teinte: string }> = {
  visa: { icone: "draw", teinte: "bg-primary-fixed text-primary" },
  demande: { icone: "swap_horiz", teinte: "bg-secondary-fixed text-secondary" },
  releve: { icone: "shield_person", teinte: "bg-secondary-fixed text-secondary" },
  dossier: { icone: "badge", teinte: "bg-surface-container text-primary" },
  systeme: { icone: "campaign", teinte: "bg-surface-container text-on-surface-variant" },
};

const RELATIF = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

/** « il y a 12 minutes », « hier », « il y a 3 jours ». */
function ilYA(iso: string): string {
  const secondes = (new Date(iso).getTime() - Date.now()) / 1000;
  const minutes = secondes / 60;
  if (Math.abs(minutes) < 1) return "à l'instant";
  if (Math.abs(minutes) < 60) return RELATIF.format(Math.round(minutes), "minute");
  const heures = minutes / 60;
  if (Math.abs(heures) < 24) return RELATIF.format(Math.round(heures), "hour");
  return RELATIF.format(Math.round(heures / 24), "day");
}

/** Marque une notification lue dans le cache, avant même la réponse de l'API. */
function marquerDansCache(donnees: Notifications | undefined, id: number | "toutes"): Notifications | undefined {
  if (!donnees) return donnees;
  const notifications = donnees.notifications.map((item) => (id === "toutes" || item.id === id ? { ...item, lue: true } : item));
  return { non_lues: notifications.filter((item) => !item.lue).length, notifications };
}

export function NotificationBell() {
  const intervalle = useIntervalle(30_000);
  const [ouvert, setOuvert] = useState(false);
  const [nonLuesSeules, setNonLuesSeules] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const client = useQueryClient();

  const requete = useQuery({
    queryKey: CLE,
    queryFn: () => api<Notifications>("/api/v1/notifications/"),
    refetchInterval: intervalle,
  });
  const nonLues = requete.data?.non_lues ?? 0;

  // Le badge rebondit quand le nombre de non-lues augmente (nouvelle notification), pas au chargement.
  const precedent = useRef<number | null>(null);
  const [rebond, setRebond] = useState(0);
  useEffect(() => {
    if (precedent.current !== null && nonLues > precedent.current) setRebond((n) => n + 1);
    if (requete.data) precedent.current = nonLues;
  }, [nonLues, requete.data]);

  // Mise à jour optimiste : le cache change tout de suite, et revient en arrière si l'API refuse.
  function mutation(appel: (id: number | "toutes") => Promise<unknown>) {
    return {
      mutationFn: appel,
      onMutate: async (id: number | "toutes") => {
        await client.cancelQueries({ queryKey: CLE });
        const avant = client.getQueryData<Notifications>(CLE);
        client.setQueryData<Notifications | undefined>(CLE, (donnees) => marquerDansCache(donnees, id));
        return { avant };
      },
      onError: (_erreur: unknown, _id: number | "toutes", contexte?: { avant?: Notifications }) => {
        if (contexte?.avant) client.setQueryData(CLE, contexte.avant);
      },
      onSettled: () => client.invalidateQueries({ queryKey: CLE }),
    };
  }
  const marquerLue = useMutation(mutation((id) => api(`/api/v1/notifications/${id}/lue/`, { method: "POST" })));
  const toutMarquer = useMutation(mutation(() => api("/api/v1/notifications/tout-lu/", { method: "POST" })));

  function fermer(rendreFocus = true) {
    setOuvert(false);
    if (rendreFocus) bouton.current?.focus();
  }

  useEffect(() => {
    if (!ouvert) return;
    titre.current?.focus();
    void requete.refetch();
    function auClic(event: MouseEvent) {
      if (!conteneur.current?.contains(event.target as Node)) fermer(false);
    }
    function auClavier(event: KeyboardEvent) {
      if (event.key === "Escape") fermer();
    }
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
    // Ne se relance qu'à l'ouverture ou à la fermeture du panneau.
  }, [ouvert]);

  function ouvrirNotification(item: NotificationItem) {
    if (!item.lue) marquerLue.mutate(item.id);
    fermer(false);
    if (item.lien) navigate(item.lien);
  }

  const liste = (requete.data?.notifications ?? []).filter((item) => !nonLuesSeules || !item.lue);

  return (
    <div ref={conteneur} className="relative">
      <button
        ref={bouton}
        type="button"
        onClick={() => (ouvert ? fermer() : setOuvert(true))}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        aria-controls="panneau-notifications"
        aria-label={nonLues ? `Notifications, ${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Notifications, aucune non lue"}
        className={`relative p-2 rounded hover:bg-surface-container-high ${ouvert ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
      >
        <Icone nom={nonLues ? "notifications_active" : "notifications"} className="text-xl" />
        {nonLues ? (
          <span
            key={rebond}
            className={`absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-error text-on-error font-label-sm text-label-sm font-bold flex items-center justify-center ring-2 ring-surface-container-lowest ${rebond ? "motion-bump" : ""}`}
            aria-hidden="true"
          >
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        ) : null}
      </button>

      {ouvert ? (
        <div
          id="panneau-notifications"
          role="dialog"
          aria-labelledby="titre-notifications"
          className="motion-overlay-card fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-[7.5rem] sm:top-auto sm:mt-2 sm:w-[24rem] z-50 rounded-lg border border-hairline bg-surface-container-lowest shadow-xl overflow-hidden"
        >
          <div className="px-4 pt-4 pb-3 border-b border-hairline">
            <div className="flex items-center justify-between gap-3">
              <h2 id="titre-notifications" ref={titre} tabIndex={-1} className="font-headline-sm text-headline-sm text-on-surface rounded">
                Notifications
              </h2>
              <button
                type="button"
                disabled={nonLues === 0 || toutMarquer.isPending}
                onClick={() => toutMarquer.mutate("toutes")}
                className="font-label-md text-label-md text-primary hover:underline rounded disabled:text-on-surface-variant disabled:no-underline disabled:cursor-default"
              >
                Tout marquer comme lu
              </button>
            </div>
            <div className="mt-3 inline-flex p-1 bg-surface-container-low rounded-lg" role="group" aria-label="Filtre des notifications">
              {[
                [false, "Toutes"],
                [true, `Non lues (${nonLues})`],
              ].map(([valeur, libelle]) => (
                <button
                  key={String(valeur)}
                  type="button"
                  aria-pressed={nonLuesSeules === valeur}
                  onClick={() => setNonLuesSeules(valeur as boolean)}
                  className={`px-3 py-1 rounded font-label-md text-label-md ${nonLuesSeules === valeur ? "bg-surface-container-lowest text-primary shadow-sm font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
                >
                  {libelle as string}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[min(28rem,calc(100vh-12rem))] overflow-y-auto overscroll-contain">
            {requete.isPending ? (
              <div className="p-4 space-y-3" aria-busy="true">
                {[0, 1, 2].map((index) => <Skeleton key={index} className="h-14 rounded-lg" />)}
              </div>
            ) : null}
            {requete.isError ? (
              <div className="p-6 text-center" role="alert">
                <p className="font-label-lg text-label-lg text-error">Les notifications n'ont pas pu être chargées.</p>
                <button type="button" className="mt-2 font-label-md text-label-md text-primary underline rounded" onClick={() => requete.refetch()}>
                  Réessayer
                </button>
              </div>
            ) : null}
            {requete.data && liste.length === 0 ? (
              <div className="motion-content p-8 text-center">
                <Icone nom="task_alt" className="text-3xl text-primary" />
                <p className="font-label-lg text-label-lg text-on-surface mt-1">{nonLuesSeules ? "Tout est lu" : "Aucune notification"}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Vous êtes à jour.</p>
              </div>
            ) : null}
            <ul>
              {liste.map((item) => {
                const style = CATEGORIE[item.categorie] ?? CATEGORIE.systeme;
                return (
                  <li key={item.id} className="border-b border-hairline last:border-0">
                    <button
                      type="button"
                      onClick={() => ouvrirNotification(item)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-surface-container-low ${item.lue ? "" : "bg-primary-fixed/15"}`}
                    >
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${style.teinte}`} aria-hidden="true">
                        <Icone nom={style.icone} className="text-lg" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`font-label-lg text-label-lg ${item.lue ? "text-on-surface-variant font-medium" : "text-on-surface font-bold"}`}>{item.titre}</span>
                          {item.urgente && !item.lue ? (
                            <span className="px-1.5 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">Urgent</span>
                          ) : null}
                        </span>
                        <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">{item.message}</span>
                        <span className="block font-label-sm text-label-sm text-on-surface-variant mt-1">
                          <time dateTime={item.creee_le} title={new Date(item.creee_le).toLocaleString("fr-FR")}>{ilYA(item.creee_le)}</time>
                        </span>
                      </span>
                      {item.lue ? null : <span className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0" aria-label="Non lue"></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="px-4 py-2 border-t border-hairline bg-surface-container-low/60 font-label-sm text-label-sm text-on-surface-variant">
            Mise à jour automatique chaque minute.
          </p>
        </div>
      ) : null}
    </div>
  );
}
