import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl, telecharger } from "../api/client";
import type { Dashboard, SessionUser } from "../api/types";
import { Pagination, usePagination } from "../ui/Pagination";
import { Portrait } from "../ui/PhotoProfil";
import { useFeedback, wait } from "../ui/Feedback";
import { useAction } from "../ui/useAction";
import { EASE_IN, EASE_OUT, Skeleton, reducedMotion } from "../ui/Motion";
import { AppChrome } from "./AppChrome";
import { BoutonExcel } from "./dashboard/Etats";
import { EtatsPersonnel } from "./dashboard/EtatsPersonnel";
import { exporterVisas } from "./dashboard/exportsTdb";
import { Icone } from "../ui/Icone";

/** Actes affichés par page dans la file des visas. */
const VISAS_PAR_PAGE = 2;
const CARD = "bg-surface-container-lowest rounded-xl border border-hairline";

const CATEGORIE_ICONE: Record<string, string> = {
  carriere: "arrow_upward",
  social: "real_estate_agent",
  conge: "beach_access",
  formation: "school",
};
export function DashboardScreen() {
  const feedback = useFeedback();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const tableau = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/v1/dashboard/") });
  const data = tableau.data;

  async function exporterPilotage() {
    const exercice = data?.exercice ?? new Date().getFullYear();
    await feedback.run(
      "Préparation du rapport…",
      () => telecharger("/api/v1/dashboard/rapport/", `rapport-pilotage-${exercice}.pdf`),
      { success: { title: "Rapport exporté" }, error: "L'export n'a pas abouti" },
    );
  }

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1">
        <div className="flex flex-col w-full space-y-6">
          {/* Bandeau d'accueil */}
          <div className={`${CARD} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                <Icone nom="verified_user" className="text-3xl" />
              </div>
              <div className="space-y-1">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                  {me.data ? `Bienvenue, ${me.data.nom_complet}` : "Bienvenue"}
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant flex flex-wrap items-center gap-2">
                  {me.data ? (
                    <>
                      <span>{me.data.fonction}</span>
                      <span className="w-1 h-1 rounded-full bg-outline" aria-hidden="true"></span>
                      <span className="font-code-num text-code-num text-primary font-semibold">Matricule {me.data.matricule}</span>
                      <span className="w-1 h-1 rounded-full bg-outline" aria-hidden="true"></span>
                    </>
                  ) : null}
                  <span>Exercice {data?.exercice ?? 2026}</span>
                </p>
              </div>
            </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 h-8 px-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md shrink-0"
                onClick={() => void exporterPilotage()}
              >
                <Icone nom="picture_as_pdf" className="text-lg" />
                Rapport 360
              </button>
            </div>
          </div>

          {tableau.isError ? (
            <div className={`${CARD} p-6`} role="alert">
              <p className="font-label-lg text-label-lg text-error">Le tableau de bord n'a pas pu être chargé.</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Vérifiez votre connexion au réseau ministériel.</p>
              <button type="button" className="mt-3 h-8 px-3 rounded bg-primary-container text-on-primary font-label-md text-label-md hover:bg-primary" onClick={() => tableau.refetch()}>
                Réessayer
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <FileVisas visas={data?.visas} signatureUrl={me.data?.signature_url ?? ""} />
          </div>

          <EtatsPersonnel />

        </div>
      </div>
    </AppChrome>
  );
}

type Visa = Dashboard["visas"][number];
type Traitement = "visa" | "complement";

const SCEAU: Record<Traitement, { libelle: string; style: string; toast: string }> = {
  visa: { libelle: "Visé", style: "border-primary text-primary bg-primary-fixed/80", toast: "Visa DRH apposé" },
  complement: { libelle: "Renvoyé", style: "border-secondary text-secondary bg-secondary-fixed/80", toast: "Demande de complément envoyée" },
};

/** File des visas : traiter un acte le scelle puis le retire de la file. */
function FileVisas({ visas, signatureUrl }: { visas: Dashboard["visas"] | undefined; signatureUrl: string }) {
  const [traites, setTraites] = useState<Set<number>>(() => new Set());
  const restants = useMemo(
    () => [...(visas ?? [])].filter((visa) => !traites.has(visa.id)).sort((a, b) => Number(b.urgent) - Number(a.urgent)),
    [visas, traites],
  );
  const urgents = restants.filter((visa) => visa.urgent).length;
  // Un acte traité quitte la file : la page reste la même, ou recule si elle se vide.
  const { page, pages, total, visibles, aller } = usePagination(restants, "visas", VISAS_PAR_PAGE);

  return (
    <section className={`xl:col-span-12 ${CARD} overflow-hidden flex flex-col`} aria-labelledby="titre-visas">
      <div className="p-5 flex flex-wrap items-center justify-between gap-3 bg-surface-container-low/40">
        <div className="flex items-center gap-2.5">
          <Icone nom="rule" className="text-primary text-2xl" />
          <div>
            <h2 id="titre-visas" className="font-headline-sm text-headline-sm text-on-surface">Actes en attente de votre visa</h2>
            {signatureUrl ? null : (
              <p className="font-label-sm text-label-sm text-error font-semibold mt-1">Déposez votre signature dans le menu de profil avant d'apposer un visa.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
        {visas ? (
          <span className="font-code-num text-code-num px-2.5 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-bold" aria-live="polite">
            {/* Le compteur rebondit quand un acte quitte la file (pas au premier affichage). */}
            <span key={restants.length} className={traites.size > 0 ? "motion-bump" : undefined}>
              {urgents} urgent{urgents > 1 ? "s" : ""} sur {restants.length}
            </span>
          </span>
        ) : null}
          <BoutonExcel titre="Actes en attente de votre visa" onExporter={() => exporterVisas(restants)} disabled={!visas} />
        </div>
      </div>
      <ul className="p-5 space-y-4">
        {visas === undefined ? [0, 1, 2].map((index) => <li key={index}><Skeleton className="h-24 rounded-lg" /></li>) : null}
        {visas && restants.length === 0 ? (
          <li className="motion-content p-6 text-center">
            <Icone nom="task_alt" className="text-3xl text-primary" />
            <p className="font-label-lg text-label-lg text-on-surface mt-1">Aucun acte n'attend votre visa</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">La file est à jour.</p>
          </li>
        ) : null}
        {visibles.map((visa) => (
          <VisaLigne key={visa.id} visa={visa} signatureUrl={signatureUrl} onTraite={(id) => setTraites((ancien) => new Set(ancien).add(id))} />
        ))}
      </ul>
      <div className="mt-auto">
        <Pagination page={page} pages={pages} total={total} aller={aller} libelle="acte" />
      </div>
    </section>
  );
}

function VisaLigne({ visa, signatureUrl, onTraite }: { visa: Visa; signatureUrl: string; onTraite: (id: number) => void }) {
  const { agir, rafraichir } = useAction();
  const ref = useRef<HTMLLIElement>(null);
  const [sceau, setSceau] = useState<Traitement | null>(null);
  const [signatureApposee, setSignatureApposee] = useState("");

  async function traiter(mode: Traitement) {
    const question =
      mode === "visa"
        ? `Apposer votre visa sur l'acte de ${visa.agent.nom_complet} ?`
        : `Demander un complément pour le dossier de ${visa.agent.nom_complet} ?`;
    const reponse = await agir<{ reference: string; signature: string }>({
      confirmation: question,
      confirmLabel: mode === "visa" ? "Apposer le visa" : "Renvoyer",
      attente: mode === "visa" ? "Apposition du visa DRH…" : "Envoi de la demande de complément…",
      route: `/api/v1/visas/${visa.id}/decision/`,
      corps: { decision: mode },
      succes: SCEAU[mode].toast,
      detail: (r) => (r.reference ? `${visa.agent.nom_complet} · ${r.reference}` : `${visa.agent.nom_complet} a été notifié.`),
      // Les données ne se rafraîchissent qu'après la sortie animée de la ligne.
      rafraichir: false,
    });
    if (!reponse) return;

    // 1. La signature frappe la ligne. 2. La ligne glisse hors de la file. 3. L'espace se referme.
    if (mode === "visa" && reponse.signature) setSignatureApposee(reponse.signature);
    setSceau(mode);
    const el = ref.current;
    const reduit = reducedMotion();
    await wait(reduit ? 400 : 700);
    if (el && !reduit) {
      await el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(56px)" }], {
        duration: 240,
        easing: EASE_IN,
        fill: "forwards",
      }).finished;
      const style = getComputedStyle(el);
      el.style.overflow = "hidden";
      await el.animate(
        [
          { height: `${el.offsetHeight}px`, marginTop: style.marginTop, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom },
          { height: "0px", marginTop: "0px", paddingTop: "0px", paddingBottom: "0px" },
        ],
        { duration: 220, easing: EASE_OUT, fill: "forwards" },
      ).finished;
    }
    onTraite(visa.id);
    void rafraichir();
  }

  return (
    <li
      ref={ref}
      className={`motion-content relative p-4 rounded-lg transition-colors duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4 ${sceau ? "bg-primary-fixed/40" : "bg-surface-container-low/50 hover:bg-surface-container-high/40"}`}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        <Portrait agent={visa.agent} className="w-11 h-11 rounded-full bg-primary-fixed text-on-primary-fixed shrink-0 font-label-lg text-label-lg" />
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/app/dossiers/${encodeURIComponent(visa.agent.matricule)}`} className="font-label-lg text-label-lg text-on-surface font-semibold hover:text-primary hover:underline rounded">
              {visa.agent.nom_complet}
            </Link>
            <span className="font-code-num text-code-num text-on-surface-variant font-medium">Mat. {visa.agent.matricule}</span>
            <span className="font-label-sm text-label-sm px-2 py-0.5 rounded bg-surface-container text-primary font-bold">{visa.agent.organisme_sigle}</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface font-medium flex items-start gap-1.5">
            <Icone nom={CATEGORIE_ICONE[visa.categorie] ?? "description"} className="text-base text-primary" />
            {visa.objet}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-label-sm text-label-sm text-on-surface-variant">
            <span className={`flex items-center gap-1 ${visa.urgent ? "text-error font-bold" : ""}`}>
              <Icone nom="schedule" className="text-sm" />
              {visa.echeance}
            </span>
            <span aria-hidden="true">•</span>
            <span className="text-primary font-semibold flex items-center gap-1">
              <Icone nom="check_circle" className="text-sm" />
              {visa.visa_amont}
            </span>
          </div>
        </div>
      </div>
      <div className={`flex items-center gap-2 shrink-0 self-end md:self-center transition-opacity duration-200 ${sceau ? "opacity-0 pointer-events-none" : ""}`}>
        <button className="px-3 py-1.5 rounded bg-surface-container-high text-on-surface hover:bg-surface-container font-label-md text-label-md" type="button" onClick={() => traiter("complement")}>
          Complément
        </button>
        <button
          className="px-3.5 py-1.5 rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md font-semibold shadow-sm flex items-center gap-1.5"
          type="button"
          onClick={() => traiter("visa")}
        >
          {signatureUrl ? (
            <img src={mediaUrl(signatureUrl)} alt="" className="h-5 max-w-[4.5rem] object-contain bg-white rounded-sm" />
          ) : (
            <Icone nom="draw" className="text-sm" />
          )}
          <span>Apposer le visa</span>
        </button>
      </div>
      {sceau ? (
        <span
          role="status"
          className={`visa-stamp absolute right-6 top-1/2 -mt-7 h-14 px-3 rounded-lg border-2 flex items-center gap-1.5 font-headline-sm text-headline-sm font-bold uppercase tracking-widest shadow-sm bg-white ${SCEAU[sceau].style}`}
        >
          {sceau === "visa" && signatureApposee ? (
            <img src={signatureApposee} alt="" className="h-10 max-w-[9rem] object-contain" />
          ) : (
            <Icone nom={sceau === "visa" ? "verified" : "undo"} className="text-2xl" />
          )}
          {SCEAU[sceau].libelle}
        </span>
      ) : null}
    </li>
  );
}
