import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, telecharger } from "../api/client";
import type { Acte, Dossier, SessionUser } from "../api/types";
import { dateCourte, dateLongue, nombre, pluriel } from "../ui/format";
import { useFeedback } from "../ui/Feedback";
import { OngletConges } from "./dossier-onglets/OngletConges";
import { OngletFormation } from "./dossier-onglets/OngletFormation";
import { OngletNotations } from "./dossier-onglets/OngletNotations";
import { OngletSocial } from "./dossier-onglets/OngletSocial";
import { SuiviActe } from "./dossier-onglets/SuiviActe";
import { TitreOnglet } from "./dossier-onglets/TitreOnglet";
import { ActionsImport } from "./ImportAgents";
import { OngletPieces } from "./OngletPieces";
import { EditeurPhoto, Portrait } from "../ui/PhotoProfil";
import { Skeleton } from "../ui/Motion";
import { AppChrome } from "./AppChrome";
import { Icone } from "../ui/Icone";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";
const CARD = "bg-surface-container-lowest rounded-xl border border-hairline p-6";

const STATUT_ACTE: Record<Acte["statut"], { pastille: string; badge: string }> = {
  valide: { pastille: "bg-primary", badge: "bg-primary text-on-primary" },
  accorde: { pastille: "bg-secondary-container", badge: "bg-secondary-fixed text-on-secondary-fixed" },
  instruction: { pastille: "bg-secondary-container", badge: "bg-secondary-fixed text-on-secondary-fixed" },
  complement: { pastille: "bg-secondary-container", badge: "bg-secondary-fixed text-on-secondary-fixed" },
  rejete: { pastille: "bg-error", badge: "bg-error-container text-on-error-container" },
};

/** Couleur d'un statut libre (« Versé », « En attente », « Réservé »…). */
function tonStatut(statut: string): string {
  const s = statut.toLowerCase();
  if (/(attente|instruction|cours|planifi|signée par|complément|complement)/.test(s)) return "bg-secondary-fixed text-on-secondary-fixed";
  if (/(réservé|rejet|refus|vérification)/.test(s)) return "bg-error-container text-on-error-container";
  return "bg-primary-fixed text-on-primary-fixed";
}

function Statut({ children }: { children: string }) {
  return <span className={`inline-flex px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold whitespace-nowrap ${tonStatut(children)}`}>{children}</span>;
}

export function DossierScreen() {
  const { matricule } = useParams();
  return <AppChrome>{matricule ? <DossierAgent matricule={matricule} /> : <VersMonProfil />}</AppChrome>;
}

function VersMonProfil() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  if (me.isError) {
    return (
      <div className={PAGE}>
        <p className="font-body-md text-body-md text-error" role="alert">Votre profil n'a pas pu être ouvert.</p>
      </div>
    );
  }
  if (!me.data) return <DossierSquelette />;
  return <Navigate to={`/app/dossiers/${encodeURIComponent(me.data.matricule)}`} replace />;
}

function DossierAgent({ matricule }: { matricule: string }) {
  const dossier = useQuery({
    queryKey: ["agent", matricule],
    queryFn: () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(matricule)}/`),
  });

  if (dossier.isPending) return <DossierSquelette />;
  if (dossier.isError) {
    const introuvable = dossier.error instanceof ApiError && dossier.error.status === 404;
    return (
      <div className={PAGE}>
        <div className={`${CARD} max-w-2xl`} role="alert">
          <h1 className="font-headline-md text-headline-md text-on-surface">{introuvable ? "Agent introuvable" : "Le dossier n'a pas pu être chargé"}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-2">
            {introuvable
              ? `Aucun dossier ne correspond au matricule « ${matricule} ».`
              : "Vérifiez votre connexion au réseau ministériel, puis réessayez."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {introuvable ? null : (
              <button type="button" className="h-10 px-4 rounded bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary" onClick={() => dossier.refetch()}>
                Réessayer
              </button>
            )}
            <Link to="/app/dossiers" className="h-10 px-4 inline-flex items-center rounded border border-outline-variant font-label-lg text-label-lg text-on-surface hover:bg-surface-container-low">
              Mon profil
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <DossierContenu agent={dossier.data} />;
}

function DossierSquelette() {
  return (
    <div className={PAGE} aria-busy="true" aria-label="Chargement du dossier">
      <div className={`${CARD} mb-8 flex items-center gap-6`}>
        <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-14 w-full rounded-xl mb-8" />
      <div className="space-y-8">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

type Onglet = "carriere" | "notations" | "conges" | "social" | "formation" | "pieces";

const ONGLET_A_VENIR = new Set<Onglet>(["notations", "social"]);

function DossierContenu({ agent }: { agent: Dossier }) {
  const feedback = useFeedback();

  async function exporterDossier() {
    await feedback.run(
      "Préparation du dossier…",
      () => telecharger(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/dossier/`, `dossier-${agent.matricule}.pdf`),
      { success: { title: "Dossier exporté" }, error: "L'export n'a pas abouti" },
    );
  }
  // L'onglet actif vit dans l'URL (?onglet=…) : il survit au rechargement et se partage.
  const [params, setParams] = useSearchParams();
  const demande = (params.get("onglet") as Onglet | null) ?? "carriere";
  const onglet = ONGLET_A_VENIR.has(demande) ? "carriere" : demande;
  const onglets: { id: Onglet; icone: string; libelle: string; compteur?: string; aVenir?: boolean }[] = [
    { id: "carriere", icone: "assignment", libelle: "Carrière, Actes & Mutations", compteur: String(agent.actes.length) },
    { id: "notations", icone: "rate_review", libelle: "Notations & Évaluations", compteur: String(agent.evaluations.length), aVenir: true },
    { id: "conges", icone: "date_range", libelle: "Congés & Absences", compteur: `${agent.conges.reliquat} j` },
    { id: "social", icone: "volunteer_activism", libelle: "Action Sociale & Prêts", compteur: String(agent.prestations.length), aVenir: true },
    { id: "formation", icone: "school", libelle: "Formation & Parcours", compteur: String(agent.formations.length) },
    { id: "pieces", icone: "folder_zip", libelle: "Pièces Jointes & Actes Numérisés", compteur: String(agent.pieces.length) },
  ];
  const [photoOuverte, setPhotoOuverte] = useState(false);
  const conformite = [
    { libelle: "Situation", valeur: agent.situation },
    { libelle: "Visite médicale", valeur: agent.visite_medicale },
    { libelle: "Affiliation CGRAE", valeur: agent.affiliation_cgrae },
  ];

  // Sens du changement d'onglet : le nouveau contenu entre du côté de l'onglet choisi.
  const sens = useRef(1);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicateur, setIndicateur] = useState<{ x: number; y: number; w: number; h: number; anime: boolean } | null>(null);

  useLayoutEffect(() => {
    const liste = tabsRef.current;
    if (!liste) return;
    const mesurer = () => {
      const actif = liste.querySelector<HTMLElement>(`#onglet-${onglet}`);
      if (!actif) return;
      actif.scrollIntoView({ inline: "nearest", block: "nearest" });
      setIndicateur((avant) => ({ x: actif.offsetLeft, y: actif.offsetTop, w: actif.offsetWidth, h: actif.offsetHeight, anime: avant !== null }));
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(liste);
    return () => observateur.disconnect();
  }, [onglet]);

  function choisir(id: Onglet) {
    if (ONGLET_A_VENIR.has(id)) {
      feedback.toast("Fonction à venir", "Cette fonction arrive dans une prochaine version.", "info");
      return;
    }
    const ordre = onglets.map((item) => item.id);
    sens.current = ordre.indexOf(id) >= ordre.indexOf(onglet) ? 1 : -1;
    setParams(id === "carriere" ? {} : { onglet: id }, { replace: true });
  }

  // Clavier : flèches gauche/droite, Début et Fin, comme un groupe d'onglets natif.
  function clavier(event: KeyboardEvent<HTMLDivElement>) {
    const ordre = onglets.filter((item) => !item.aVenir).map((item) => item.id);
    const index = ordre.indexOf(onglet);
    const cible =
      event.key === "ArrowRight" ? ordre[(index + 1) % ordre.length]
      : event.key === "ArrowLeft" ? ordre[(index - 1 + ordre.length) % ordre.length]
      : event.key === "Home" ? ordre[0]
      : event.key === "End" ? ordre[ordre.length - 1]
      : null;
    if (!cible) return;
    event.preventDefault();
    choisir(cible);
    tabsRef.current?.querySelector<HTMLElement>(`#onglet-${cible}`)?.focus();
  }

  return (
    <div className={PAGE}>
      <div className="motion-content flex flex-col w-full">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <nav aria-label="Fil d'Ariane" className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
            <Link to="/app/dossiers" className="rounded hover:text-primary hover:underline">Mon profil</Link>
            <span aria-hidden="true">/</span>
            <span className="text-on-surface font-semibold">{agent.nom_complet}</span>
          </nav>
          <ActionsImport />
        </div>

        {/* Identité statutaire */}
        <div className={`${CARD} mb-8 min-w-0`}>
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 min-w-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 min-w-0 lg:flex-1">
              <button
                type="button"
                onClick={() => setPhotoOuverte(true)}
                className="relative shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={`Enregistrer la photo de profil de ${agent.nom_complet}`}
              >
                <Portrait agent={agent} className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-primary-fixed text-on-primary-fixed font-headline-lg text-headline-lg" />
                <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center ring-2 ring-surface-container-lowest" aria-hidden="true">
                  <Icone nom="photo_camera" className="text-base" />
                </span>
              </button>
              <div className="flex flex-col space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-code-num text-code-num bg-primary-fixed text-on-primary-fixed px-2.5 py-0.5 rounded font-bold tracking-wide">Matricule {agent.matricule}</span>
                  <span className="px-2.5 py-0.5 bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm rounded font-semibold">Corps : {agent.corps}</span>
                  <Statut>{agent.situation}</Statut>
                </div>
                <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight mt-1">{agent.nom_complet}</h1>
                <p className="font-body-md text-body-md text-primary font-semibold flex items-start gap-1.5 min-w-0">
                  <Icone nom="workspace_premium" className="text-base shrink-0" />
                  <span className="min-w-0">Grade {agent.grade}, échelon {agent.echelon} · catégorie {agent.categorie}</span>
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant flex items-start gap-1.5 min-w-0">
                  <Icone nom="apartment" className="text-base shrink-0" />
                  <span className="min-w-0">{agent.organisme} — {agent.structure}</span>
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md"
                  onClick={() => void exporterDossier()}
                >
                  <Icone nom="picture_as_pdf" className="text-lg" />
                  Dossier (PDF)
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 min-w-0 w-full lg:flex-1 lg:justify-end">
              <Indicateur libelle="Indice" valeur={nombre(agent.indice)} accent />
              <Indicateur
                libelle="Ancienneté"
                valeur={agent.anciennete || "—"}
                detail={agent.prise_service ? (/^\d{4}-\d{2}-\d{2}$/.test(agent.prise_service) ? `Prise de service le ${dateLongue(agent.prise_service)}` : `Prise de service en ${agent.prise_service}`) : "Prise de service non renseignée"}
              />
              <Indicateur
                libelle="Départ à la retraite"
                valeur={agent.projection ? dateCourte(agent.projection.date_radiation) : "—"}
                detail={agent.projection ? `Limite d'âge ${agent.projection.age_limite} ans · ${agent.projection.service_restant}` : "Date de naissance non renseignée"}
              />
              <ul className="flex flex-col gap-1.5 min-w-0 max-w-full">
                {conformite.map((ligne) => (
                  <li key={ligne.libelle} className={`flex items-start gap-1.5 px-2.5 py-1 bg-surface-container-low rounded min-w-0 max-w-full ${ligne.valeur ? "text-primary" : "text-on-surface-variant"}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${ligne.valeur ? "bg-primary" : "bg-outline-variant"}`} aria-hidden="true"></span>
                    <span className="font-label-sm text-label-sm font-semibold min-w-0">
                      {ligne.libelle} : {ligne.valeur || "non renseigné"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Onglets du dossier */}
        <div className="bg-surface-container-lowest rounded-xl border border-hairline mb-8">
          <div ref={tabsRef} role="tablist" aria-label="Sections du dossier agent" onKeyDown={clavier} className="relative flex flex-wrap items-stretch p-1 gap-1">
            {indicateur ? (
              <span
                aria-hidden="true"
                className={`absolute top-0 left-0 rounded bg-primary shadow-sm ${indicateur.anime ? "tab-indicator" : ""}`}
                style={{ width: indicateur.w, height: indicateur.h, transform: `translate(${indicateur.x}px, ${indicateur.y}px)` }}
              />
            ) : null}
            {onglets.map((item) => {
              const actif = item.id === onglet;
              return (
                <button
                  key={item.id}
                  role="tab"
                  id={`onglet-${item.id}`}
                  aria-selected={actif}
                  aria-disabled={item.aVenir || undefined}
                  tabIndex={actif ? 0 : -1}
                  aria-controls="panneau-dossier"
                  type="button"
                  onClick={() => choisir(item.id)}
                  className={`relative z-10 flex items-center gap-2 px-4 py-3 rounded font-label-md text-label-md ${actif ? "text-on-primary font-semibold" : item.aVenir ? "text-outline cursor-not-allowed" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"}`}
                >
                  <Icone nom={item.icone} className="text-base" />
                  <span>{item.libelle}</span>
                  {item.compteur ? (
                    <span className={`ml-1 px-1.5 rounded font-code-num text-label-sm ${actif ? "bg-on-primary/20 text-on-primary" : item.aVenir ? "bg-surface-container text-outline" : "bg-surface-container-high text-on-surface"}`}>
                      {item.compteur}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div id="panneau-dossier" role="tabpanel" aria-labelledby={`onglet-${onglet}`}>
          <div key={onglet} className="motion-panel flex flex-col space-y-8" style={{ "--from": `${sens.current * 16}px` } as CSSProperties}>
            {onglet === "carriere" ? <OngletCarriere agent={agent} /> : onglet === "pieces" ? <OngletPieces agent={agent} /> : onglet === "conges" ? <OngletConges agent={agent} /> : onglet === "formation" ? <OngletFormation agent={agent} /> : onglet === "notations" ? <OngletNotations agent={agent} /> : <OngletSocial agent={agent} />}
          </div>
        </div>
      </div>
      {photoOuverte ? <EditeurPhoto agent={agent} onClose={() => setPhotoOuverte(false)} /> : null}
    </div>
  );
}

// --- Onglets ---------------------------------------------------------------


function Section({ icone, titre, sousTitre, action, children }: { icone: string; titre: string; sousTitre?: string; action?: ReactNode; children: ReactNode }) {
  const id = `titre-${titre.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={CARD} aria-labelledby={id}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Icone nom={icone} className="text-primary text-xl" />
            <h2 id={id} className="font-headline-sm text-headline-sm text-on-surface font-bold">{titre}</h2>
          </div>
          {sousTitre ? <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{sousTitre}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Vide({ icone, titre, texte }: { icone: string; titre: string; texte: string }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-6 text-center">
      <Icone nom={icone} className="text-3xl text-on-surface-variant" />
      <p className="font-label-lg text-label-lg text-on-surface mt-2">{titre}</p>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{texte}</p>
    </div>
  );
}


const GROUPES_SITUATION: { titre: string; icone: string; champs: string[]; bandeau?: boolean }[] = [
  {
    titre: "Identité statutaire",
    icone: "badge",
    bandeau: true,
    champs: ["Matricule", "Positions", "Grade", "Catégorie", "Type Agent"],
  },
  {
    titre: "Rattachement",
    icone: "account_tree",
    champs: ["Structure", "Direction", "Sous-Direction", "Service", "Lieu de Travail"],
  },
  {
    titre: "Emploi et fonction",
    icone: "work",
    champs: ["Emploi", "Mode Recrutement", "Fonction"],
  },
  {
    titre: "Prises de service",
    icone: "event",
    champs: [
      "Date de première prise de service (Fonction Publique)",
      "Date de prise de service dans le ministère",
      "Date de prise de service dans l'emploi",
      "Date de prise de service dans la fonction",
    ],
  },
];

function texteSituation(valeur: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(valeur) ? dateLongue(valeur) : valeur;
}

function FicheSituation({ lignes }: { lignes: { libelle: string; valeur: string }[] }) {
  const valeurs = new Map(lignes.map((ligne) => [ligne.libelle, ligne.valeur]));
  const connus = new Set(GROUPES_SITUATION.flatMap((groupe) => groupe.champs));
  const reste = lignes.filter((ligne) => !connus.has(ligne.libelle));

  return (
    <div className="space-y-8">
      {GROUPES_SITUATION.map((groupe) => (
        <div key={groupe.titre}>
          <h3 className="flex items-center gap-2 font-label-md text-label-md text-on-surface font-semibold">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-low text-primary" aria-hidden="true">
              <Icone nom={groupe.icone} className="text-lg" />
            </span>
            {groupe.titre}
          </h3>
          {groupe.bandeau ? (
            <dl className="mt-3 flex flex-wrap gap-px overflow-hidden rounded-lg bg-hairline">
              {groupe.champs.map((libelle) => (
                <div key={libelle} className="bg-surface-container-low px-4 py-3 min-w-[10.5rem] flex-1">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">{libelle}</dt>
                  <dd className="mt-1 font-body-md text-body-md text-on-surface font-semibold break-words">
                    <ValeurSituation libelle={libelle} valeur={valeurs.get(libelle) ?? ""} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {groupe.champs.map((libelle) => (
                <div key={libelle} className="py-3 border-b border-hairline min-w-0">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">{libelle}</dt>
                  <dd className="mt-1 font-body-md text-body-md text-on-surface font-semibold break-words">
                    <ValeurSituation libelle={libelle} valeur={valeurs.get(libelle) ?? ""} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ))}
      {reste.length > 0 ? (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {reste.map((ligne) => (
            <div key={ligne.libelle} className="py-3 border-b border-hairline min-w-0">
              <dt className="font-label-sm text-label-sm text-on-surface-variant">{ligne.libelle}</dt>
              <dd className="mt-1 font-body-md text-body-md text-on-surface font-semibold break-words">
                <ValeurSituation libelle={ligne.libelle} valeur={ligne.valeur} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function ValeurSituation({ libelle, valeur }: { libelle: string; valeur: string }) {
  if (!valeur) return <span className="font-normal text-on-surface-variant">Non renseigné</span>;
  if (libelle === "Positions") return <Statut>{valeur}</Statut>;
  if (libelle === "Matricule") return <span className="font-code-num text-code-num tracking-wide">{valeur}</span>;
  return texteSituation(valeur);
}

function OngletCarriere({ agent }: { agent: Dossier }) {
  const [nature, setNature] = useState("");
  const natures = useMemo(() => Array.from(new Set(agent.actes.map((acte) => acte.nature))).sort(), [agent.actes]);
  const actes = agent.actes.filter((acte) => !nature || acte.nature === nature);
  const projection = agent.projection;

  return (
    <>
      <TitreOnglet titre="Gestion de la Carrière, des Actes & Mutations" />
      <Laterale agent={agent} />
      <Section icone="badge" titre="Situation administrative" sousTitre="Position, rattachement et prises de service de l'agent">
        <FicheSituation lignes={agent.situation_administrative} />
      </Section>

      <Section
        icone="history_edu"
        titre="Fascicule des actes administratifs"
        sousTitre={agent.actes.length === 0 ? "Aucun acte enregistré" : `${pluriel(agent.actes.length, "acte")} du plus récent au plus ancien`}
        action={
          natures.length > 1 ? (
            <label className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Nature :</span>
              <select
                value={nature}
                onChange={(event) => setNature(event.target.value)}
                className="bg-surface-container-low text-on-surface font-label-md text-label-md rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Tous les actes ({agent.actes.length})</option>
                {natures.map((valeur) => <option key={valeur} value={valeur}>{valeur}</option>)}
              </select>
            </label>
          ) : null
        }
      >
        {actes.length === 0 ? (
          <Vide icone="folder_off" titre="Aucun acte dans ce dossier pour l'instant" texte="Les arrêtés, décisions et décrets apparaîtront ici dès leur enregistrement par la DRH." />
        ) : (
          <ol className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-surface-container-high">
            {actes.map((acte) => <ActeFascicule key={acte.id} acte={acte} matricule={agent.matricule} />)}
          </ol>
        )}
      </Section>

      <Section icone="insights" titre="Projection d'avancement & retraite" sousTitre="Projection indicative : un échelon tous les 2 ans, limite d'âge statutaire">
        {projection ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-surface-container-low rounded-xl">
            <div className="flex flex-col justify-between gap-4">
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant font-bold">Prochaine échéance statutaire</p>
                <h3 className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                  {projection.prochain_echelon ? `Passage à l'échelon ${projection.prochain_echelon}` : "Prochain avancement"} (grade {agent.grade})
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Éligibilité à l'ancienneté au <strong className="text-on-surface">{dateLongue(projection.date_prochain_echelon)}</strong>.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface-variant">Ancienneté dans l'échelon</span>
                  <span className="font-bold text-primary">{projection.progression}&#8239;% accompli</span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden" role="progressbar" aria-valuenow={projection.progression} aria-valuemin={0} aria-valuemax={100} aria-label="Ancienneté dans l'échelon">
                  <div className="bg-primary motion-fill h-full" style={{ width: `${projection.progression}%` }}></div>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Indice actuel : {nombre(agent.indice)}</p>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-4 md:pl-6 md:border-l md:border-hairline">
              <div>
                <p className="font-label-sm text-label-sm text-secondary font-bold">Limite d'âge & retraite</p>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">
                  Radiation des cadres : {new Date(`${projection.date_radiation}T00:00:00`).getFullYear()}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Limite d'âge de {projection.age_limite} ans pour le grade {agent.grade}, atteinte le {dateLongue(projection.date_radiation)}.
                </p>
              </div>
              <div className="p-3 bg-surface-container-lowest rounded-lg">
                <p className="font-label-sm text-label-sm text-on-surface-variant">Durée de service restante</p>
                <p className="font-headline-sm text-headline-sm text-on-surface font-bold">{projection.service_restant}</p>
              </div>
            </div>
          </div>
        ) : (
          <Vide icone="insights" titre="Projection indisponible" texte="La date de naissance ou la date de prise de service de l'agent n'est pas renseignée." />
        )}
      </Section>
    </>
  );
}


// --- Colonne latérale --------------------------------------------------------

function Laterale({ agent }: { agent: Dossier }) {
  const disponibles = agent.actes.filter((acte) => acte.statut === "valide");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState<number | null>(null);

  async function telechargerActe(acte: Acte) {
    setErreur("");
    setEnCours(acte.id);
    const nom = `${acte.reference.replace(/[^\w.-]+/g, "-")}.pdf`;
    try {
      await telecharger(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/actes/${acte.id}/`, nom);
    } catch (error) {
      setErreur(error instanceof ApiError ? error.message : "Le téléchargement n'a pas abouti.");
    } finally {
      setEnCours(null);
    }
  }

  return (
    <aside aria-label="Actions et informations complémentaires">
      <section className={CARD}>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-1 flex items-center gap-2">
          <Icone nom="bolt" className="text-primary text-xl" />
          Actions administratives
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">Actes mis à disposition par la hiérarchie.</p>
        <div className="flex flex-col space-y-2.5">
          {disponibles.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant p-3 bg-surface-container-low rounded-lg">Aucun acte n'a encore été mis à disposition.</p>
          ) : disponibles.map((acte) => (
            <button
              key={acte.id}
              type="button"
              disabled={enCours === acte.id}
              onClick={() => telechargerActe(acte)}
              className="w-full flex items-center justify-between gap-3 p-3 bg-surface-container-low hover:bg-surface-container rounded-lg text-left transition-colors disabled:opacity-60"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icone nom={ICONE_ACTE[acte.domaine] ?? "description"} className="text-primary shrink-0" />
                <span className="min-w-0">
                  <span className="font-label-md text-label-md text-on-surface font-bold block leading-tight break-words">{acte.titre}</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{acte.nature} n° {acte.reference}</span>
                </span>
              </span>
              <Icone nom={enCours === acte.id ? "progress_activity" : "download"} className="text-on-surface-variant text-lg shrink-0" />
            </button>
          ))}
          <ActionRapide icone="transfer_within_a_station" titre="Transmettre pour mutation" detail="Initier un dossier d'affectation" />
          <ActionRapide icone="lock_reset" titre="Réinitialiser l'accès de l'agent" detail="Portail libre-service du fonctionnaire" />
        </div>
        {erreur ? <p className="mt-3 font-body-sm text-body-sm text-error" role="alert">{erreur}</p> : null}
      </section>
    </aside>
  );
}

function Indicateur({ libelle, valeur, detail, accent = false }: { libelle: string; valeur: string; detail?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col p-3 bg-surface-container-low rounded-lg min-w-[8rem] max-w-full">
      <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">{libelle}</span>
      <span className={`font-headline-md text-headline-md font-bold ${accent ? "text-primary" : "text-on-surface"}`}>{valeur}</span>
      {detail ? <span className="font-label-sm text-label-sm text-on-surface-variant">{detail}</span> : null}
    </div>
  );
}


function ActeFascicule({ acte, matricule }: { acte: Acte; matricule: string }) {
  const feedback = useFeedback();
  const style = STATUT_ACTE[acte.statut] ?? STATUT_ACTE.instruction;
  const nom = `${acte.reference.replace(/[^\w.-]+/g, "-")}.pdf`;
  return (
    <li className="relative">
      <span className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full ring-4 ring-surface-container-lowest ${style.pastille}`} aria-hidden="true"></span>
      <article className="bg-surface-container-low p-5 rounded-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 bg-surface-container-lowest text-on-surface font-code-num text-code-num rounded font-bold">
              {acte.nature} n° {acte.reference}
            </span>
            <span className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-bold ${style.badge}`}>{acte.statut_libelle}</span>
          </div>
          <span className="font-code-num text-code-num text-on-surface-variant">Date d'effet : {dateLongue(acte.date_effet)}</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mt-2">{acte.titre}</h3>
        {acte.resume ? <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{acte.resume}</p> : null}
        <SuiviActe acte={acte} matricule={matricule} />
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 bg-surface-container-lowest/60 p-3 rounded">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-on-surface-variant font-label-sm text-label-sm">
            <span>Signataire : <strong className="text-on-surface">{acte.signataire || "non encore signé"}</strong></span>
            <span>Enregistré le <strong className="text-on-surface">{dateLongue(acte.date_enregistrement)}</strong></span>
          </div>
          <button
            className="text-primary hover:text-primary-container font-label-sm text-label-sm font-bold flex items-center gap-1 rounded"
            type="button"
            onClick={() => {
              void feedback
                .run(
                  "Préparation de l'acte…",
                  () => telecharger(`/api/v1/agents/${encodeURIComponent(matricule)}/actes/${acte.id}/`, nom),
                  {
                    success: { title: "Acte prêt", message: "Le document est téléchargé." },
                    error: "L'acte n'a pas pu être téléchargé.",
                  },
                )
                .catch(() => undefined);
            }}
          >
            <Icone nom="download" className="text-base" />
            <span>PDF certifié</span>
          </button>
        </div>
      </article>
    </li>
  );
}

const ICONE_ACTE: Record<string, string> = {
  carriere: "history_edu",
  social: "volunteer_activism",
  formation: "school",
  conge: "event_available",
};

function ActionRapide({ icone, titre, detail, longue, faite }: { icone: string; titre: string; detail: string; longue?: string; faite?: string }) {
  const comportement = longue
    ? { "data-long-action": longue, "data-long-action-done": faite }
    : { "data-soon": "Cette action arrive dans une prochaine version." };
  return (
    <button className="w-full flex items-center justify-between gap-3 p-3 bg-surface-container-low hover:bg-surface-container rounded-lg text-left transition-colors" type="button" {...comportement}>
      <span className="flex items-center gap-3">
        <Icone nom={icone} className="text-primary" />
        <span>
          <span className="font-label-md text-label-md text-on-surface font-bold block leading-tight">{titre}</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">{detail}</span>
        </span>
      </span>
      <Icone nom={longue ? "download" : "schedule"} className="text-on-surface-variant text-lg" />
    </button>
  );
}
