import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api, telecharger } from "../../api/client";
import type { NotificationItem, Notifications } from "../../api/types";
import { apiHorsLigne } from "../../hors-ligne/envoi";
import { CATEGORIE, CLE as CLE_NOTIFICATIONS, ilYA } from "../NotificationBell";
import { Chargement } from "../../ui/Chargement";
import { Icone } from "../../ui/Icone";
import { Pagination, usePagination } from "../../ui/Pagination";

export type Evenement = {
  id: number;
  reference: string;
  nature: string;
  nature_libelle: string;
  urgence: "normal" | "important" | "urgent";
  urgence_libelle: string;
  intitule: string;
  corps: string;
  signataire: string;
  echeance: string | null;
  publiee_le: string | null;
  publiee_libelle: string;
  piece_nom: string;
  lue: boolean;
};

export const CLE_EVENEMENTS = ["evenements"];

/** Les publications sont récentes tant qu'elles datent de moins de trente jours : c'est ce qui allume la pastille de l'onglet. */
export function evenementsRecents(evenements: Evenement[]): number {
  const limite = Date.now() - 30 * 24 * 3600 * 1000;
  return evenements.filter((item) => item.publiee_le && new Date(item.publiee_le).getTime() >= limite).length;
}

const TON_URGENCE: Record<Evenement["urgence"], string> = {
  normal: "",
  important: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  urgent: "bg-error-container text-on-error-container",
};

type Vue = "evenements" | "communiques" | "notifications";

const vueDe = (item: Evenement): Vue => (item.nature === "evenement" ? "evenements" : "communiques");

/** Onglet « Événements » : événements et communiqués de la communication RH, et les notifications de l'agent. */
export function EvenementsAgent({ selection }: { selection: string | null }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [vue, setVue] = useState<Vue>("evenements");
  const [nature, setNature] = useState("");
  const [ouverte, setOuverte] = useState<number | null>(selection ? Number(selection) || null : null);
  const evenements = useQuery({ queryKey: CLE_EVENEMENTS, queryFn: () => api<{ evenements: Evenement[] }>("/api/v1/evenements/") });
  const notifications = useQuery({ queryKey: CLE_NOTIFICATIONS, queryFn: () => api<Notifications>("/api/v1/notifications/") });
  const lire = useMutation({
    mutationFn: (id: number) => api(`/api/v1/evenements/${id}/lu/`, { method: "POST" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: CLE_EVENEMENTS });
      void client.invalidateQueries({ queryKey: CLE_NOTIFICATIONS });
    },
  });
  const notificationLue = useMutation({
    mutationFn: (id: number | "toutes") => apiHorsLigne(id === "toutes" ? "/api/v1/notifications/tout-lu/" : `/api/v1/notifications/${id}/lue/`, { capacite: "notification", libelle: id === "toutes" ? "Toutes les notifications marquées comme lues" : "Notification marquée comme lue" }),
    onSettled: () => void client.invalidateQueries({ queryKey: CLE_NOTIFICATIONS }),
  });

  const liste = evenements.data?.evenements ?? [];
  const deLaVue = liste.filter((item) => vueDe(item) === vue);
  const natures = vue === "communiques" ? [...new Map(deLaVue.map((item) => [item.nature, item.nature_libelle])).entries()] : [];
  const visibles = deLaVue.filter((item) => !nature || item.nature === nature);
  const page = usePagination(visibles, `${vue}|${nature}`, 6);
  const dansVue = (cible: Vue) => liste.filter((item) => vueDe(item) === cible);
  const nonLuesPar = (cible: Vue) => dansVue(cible).filter((item) => !item.lue).length;
  const listeNotifications = notifications.data?.notifications ?? [];
  const notificationsNonLues = notifications.data?.non_lues ?? 0;

  // Une notification amène sur la publication concernée : la bonne rubrique s'affiche, la publication s'ouvre et se place sous les yeux de l'agent.
  const cible = useRef<HTMLLIElement | null>(null);
  const positionnee = useRef<number | null>(null);
  const [relance, setRelance] = useState(0);
  const [vers, setVers] = useState<number | null>(selection ? Number(selection) || null : null);
  useEffect(() => {
    const numero = selection ? Number(selection) || null : null;
    positionnee.current = null;
    setVers(numero);
    if (numero) setOuverte(numero);
  }, [selection]);
  useEffect(() => {
    const item = liste.find((element) => element.id === vers);
    if (!item || positionnee.current === vers) return;
    if (vue !== vueDe(item)) {
      setVue(vueDe(item));
      return;
    }
    const position = visibles.findIndex((element) => element.id === vers);
    if (position < 0) {
      setNature("");
      return;
    }
    positionnee.current = vers;
    page.aller(Math.floor(position / 6));
    const minuteur = window.setTimeout(() => cible.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    return () => window.clearTimeout(minuteur);
    // Ne se relance que lorsque la liste arrive, que la cible change ou que la rubrique affichée change.
  }, [vers, liste.length, vue, nature, relance]); // eslint-disable-line react-hooks/exhaustive-deps

  function basculer(item: Evenement) {
    const ouvrir = ouverte !== item.id;
    setOuverte(ouvrir ? item.id : null);
    if (ouvrir && !item.lue) lire.mutate(item.id);
  }

  function ouvrirNotification(item: NotificationItem) {
    if (!item.lue) notificationLue.mutate(item.id);
    const publication = item.lien?.startsWith("/app/agents") ? item.lien.match(/[?&]evenement=(\d+)/) : null;
    if (publication) {
      // La publication est ici même : pas de changement de page.
      positionnee.current = null;
      setOuverte(Number(publication[1]));
      setVers(Number(publication[1]));
      setRelance((n) => n + 1);
    } else if (item.lien) {
      navigate(item.lien);
    }
  }

  // La publication visée par la notification est lue dès qu'elle s'ouvre.
  useEffect(() => {
    const item = liste.find((element) => element.id === vers);
    if (item && !item.lue && ouverte === item.id) lire.mutate(item.id);
  }, [vers, liste.length, relance]); // eslint-disable-line react-hooks/exhaustive-deps

  if (evenements.isPending) return <Chargement libelle="Chargement des événements…" />;
  if (evenements.isError) {
    return (
      <p className="font-body-md text-body-md text-error" role="alert">
        {evenements.error instanceof ApiError ? evenements.error.message : "Les événements n'ont pas pu être chargés."}
      </p>
    );
  }

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden" aria-labelledby="titre-evenements">
      <div className="px-6 py-4 bg-surface-container-low flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icone nom="campaign" className="text-primary text-xl shrink-0" />
          <div className="min-w-0">
            <h2 id="titre-evenements" className="font-headline-sm text-headline-sm font-bold text-on-surface">Événements, communiqués et notifications</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Événements et communiqués rédigés par l'équipe de communication de la DRH, et vos notifications.</p>
          </div>
        </div>
        {vue === "notifications" ? (
          <button
            type="button"
            disabled={notificationsNonLues === 0 || notificationLue.isPending}
            onClick={() => notificationLue.mutate("toutes")}
            className="font-label-md text-label-md text-primary hover:underline rounded disabled:text-on-surface-variant disabled:no-underline disabled:cursor-default shrink-0"
          >
            Tout marquer comme lu
          </button>
        ) : (
          <span className="font-code-num text-label-sm text-on-surface-variant shrink-0">{`${deLaVue.length} publication${deLaVue.length > 1 ? "s" : ""}`}</span>
        )}
      </div>

      <div className="px-6 pt-5">
        <div className="inline-flex flex-wrap p-1 bg-surface-container-low rounded-lg gap-1" role="group" aria-label="Rubrique">
          {([
            ["evenements", "event", "Événements", nonLuesPar("evenements")],
            ["communiques", "campaign", "Communiqués", nonLuesPar("communiques")],
            ["notifications", "notifications", "Notifications", notificationsNonLues],
          ] as [Vue, string, string, number][]).map(([code, icone, libelle, nonLues]) => (
            <button
              key={code}
              type="button"
              aria-pressed={vue === code}
              onClick={() => { setVue(code); setNature(""); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-label-md text-label-md ${vue === code ? "bg-surface-container-lowest text-primary shadow-sm font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <Icone nom={icone} className="text-base" />
              {libelle}
              {nonLues ? <span className="min-w-[1.25rem] h-5 px-1 rounded-full bg-error text-on-error font-label-sm text-label-sm font-bold inline-flex items-center justify-center" aria-label={`${nonLues} non lu${nonLues > 1 ? "s" : ""}`}>{nonLues}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {vue === "notifications" ? (
        <div className="p-6">
          {notifications.isPending ? <Chargement libelle="Chargement des notifications…" enLigne /> : null}
          {notifications.isError ? <p className="font-body-md text-body-md text-error" role="alert">Les notifications n'ont pas pu être chargées.</p> : null}
          {notifications.data && listeNotifications.length === 0 ? (
            <p className="py-8 text-center font-body-md text-body-md text-on-surface-variant">Aucune notification. Vous êtes à jour.</p>
          ) : null}
          <ul className="space-y-2">
            {listeNotifications.map((item) => {
              const style = CATEGORIE[item.categorie] ?? CATEGORIE.systeme;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => ouvrirNotification(item)}
                    className={`w-full flex items-start gap-3 rounded-xl border border-hairline px-4 py-3 text-left hover:bg-surface-container-low ${item.lue ? "" : "bg-primary-fixed/15"}`}
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${style.teinte}`} aria-hidden="true">
                      <Icone nom={style.icone} className="text-lg" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`font-label-lg text-label-lg ${item.lue ? "text-on-surface-variant font-medium" : "text-on-surface font-bold"}`}>{item.titre}</span>
                        {item.urgente && !item.lue ? <span className="px-1.5 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">Urgent</span> : null}
                      </span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">{item.message}</span>
                      <time className="block font-label-sm text-label-sm text-on-surface-variant mt-1" dateTime={item.creee_le} title={new Date(item.creee_le).toLocaleString("fr-FR")}>{ilYA(item.creee_le)}</time>
                    </span>
                    {item.lue ? null : <span className="w-2 h-2 mt-2 rounded-full bg-primary shrink-0" aria-label="Non lue"></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
      <div className="p-6 space-y-5">
        {natures.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Nature de la publication">
            <Puce actif={nature === ""} onClick={() => setNature("")}>Tous</Puce>
            {natures.map(([code, libelle]) => <Puce key={code} actif={nature === code} onClick={() => setNature(code)}>{libelle}</Puce>)}
          </div>
        ) : null}

        {visibles.length === 0 ? (
          <p className="py-8 text-center font-body-md text-body-md text-on-surface-variant">{vue === "communiques" ? "Aucun communiqué n'a été diffusé pour le moment." : "Aucun événement n'a été diffusé pour le moment."}</p>
        ) : (
          <ul className="space-y-3">
            {page.visibles.map((item) => {
              const detail = ouverte === item.id;
              return (
                <li
                  key={item.id}
                  ref={item.id === vers ? cible : undefined}
                  className={`rounded-xl border bg-surface-container-lowest ${item.id === vers ? "border-primary ring-2 ring-primary/20" : "border-hairline"}`}
                >
                  <button type="button" className="w-full text-left p-4 flex items-start gap-3 rounded-xl hover:bg-surface-container-low/60" aria-expanded={detail} onClick={() => basculer(item)}>
                    <span className="mt-0.5 w-10 h-10 shrink-0 rounded-full bg-primary-fixed text-primary flex items-center justify-center" aria-hidden="true">
                      <Icone nom={item.nature === "evenement" ? "event" : item.urgence === "urgent" ? "notification_important" : "article"} className="text-xl" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">{item.nature_libelle}</span>
                        {item.urgence !== "normal" ? <span className={`rounded px-2 py-0.5 font-label-sm text-label-sm font-bold ${TON_URGENCE[item.urgence]}`}>{item.urgence_libelle}</span> : null}
                        {item.lue ? null : <span className="rounded bg-primary px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-primary">Nouveau</span>}
                        <time className="font-label-sm text-label-sm text-on-surface-variant" dateTime={item.publiee_le ?? undefined}>{item.publiee_libelle}</time>
                      </span>
                      <span className={`mt-1 block font-label-lg text-label-lg text-on-surface ${item.lue ? "font-semibold" : "font-bold"}`}>{item.intitule}</span>
                      {detail ? null : <span className="mt-0.5 block font-body-sm text-body-sm text-on-surface-variant line-clamp-2">{item.corps}</span>}
                    </span>
                    <Icone nom={detail ? "expand_less" : "expand_more"} className="text-xl text-on-surface-variant shrink-0" />
                  </button>
                  {detail ? (
                    <div className="px-4 pb-4 pl-[4.25rem] space-y-3">
                      <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">{item.corps}</p>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-label-sm text-label-sm text-on-surface-variant">
                        <span>Réf. {item.reference}</span>
                        {item.signataire ? <span>Signé : {item.signataire}</span> : null}
                        {item.echeance ? <span>À traiter avant le {new Date(item.echeance).toLocaleDateString("fr-FR")}</span> : null}
                        {item.piece_nom ? (
                          <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => void telecharger(`/api/v1/evenements/${item.id}/piece/`, item.piece_nom)}>
                            <Icone nom="attach_file" className="text-base" />{item.piece_nom}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}
      {vue === "notifications" ? null : <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="publication" />}
    </section>
  );
}

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-label-md text-label-md transition-colors ${actif ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
    >
      {children}
    </button>
  );
}
