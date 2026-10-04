import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { AgentBrief } from "../../api/types";
import { dateCourte, fcfa, nombre, pluriel } from "../../ui/format";
import { Pagination, usePagination } from "../../ui/Pagination";
import { useAction } from "../../ui/useAction";
import { RefusCandidature } from "./Candidatures";
import type { Candidature, EtatSession, Session, TableauFormation } from "./types";
import {
  BOUTON_ICONE,
  BOUTON_PRIMAIRE,
  BOUTON_SECONDAIRE,
  BadgeCandidature,
  BadgeSession,
  CARTE,
  CHAMP,
  Case,
  DateChamp,
  EnTeteSection,
  Liste,
  Modale,
  Nombre,
  Texte,
  Vide,
  Zone,
  messageErreur,
  useEnregistrement,
} from "./ui";

const ETATS: { valeur: EtatSession | ""; libelle: string }[] = [
  { valeur: "", libelle: "Tous les états" },
  { valeur: "inscriptions_ouvertes", libelle: "Inscriptions ouvertes" },
  { valeur: "en_cours", libelle: "En cours" },
  { valeur: "planifiee", libelle: "Planifiées" },
  { valeur: "a_planifier", libelle: "À planifier" },
  { valeur: "terminee", libelle: "Terminées" },
  { valeur: "annulee", libelle: "Annulées" },
];
const ACTIF = new Set<EtatSession>(["a_planifier", "planifiee", "inscriptions_ouvertes", "en_cours"]);

export function Sessions({ data }: { data: TableauFormation }) {
  const [etat, setEtat] = useState<string>("");
  const [type, setType] = useState("");
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState<Session | "nouvelle" | null>(null);
  const [gestion, setGestion] = useState<string | null>(null);
  const [annulation, setAnnulation] = useState<Session | null>(null);
  const { agir } = useAction();

  const q = recherche.trim().toLowerCase();
  const sessions = data.sessions.filter(
    (s) =>
      (!etat || s.etat === etat) &&
      (!type || s.type === type) &&
      (!q || `${s.libelle} ${s.code} ${s.lieu} ${s.formateur} ${s.prestataire?.nom ?? ""}`.toLowerCase().includes(q)),
  );
  // Ce qui demande une action en premier : en cours, inscriptions ouvertes, puis le reste par date.
  const ordre: Record<EtatSession, number> = { en_cours: 0, inscriptions_ouvertes: 1, planifiee: 2, a_planifier: 3, terminee: 4, annulee: 5 };
  sessions.sort((a, b) => ordre[a.etat] - ordre[b.etat] || (a.date_debut ?? "9").localeCompare(b.date_debut ?? "9"));
  const geree = gestion ? data.sessions.find((s) => s.code === gestion) ?? null : null;

  function action(session: Session, verbe: "ouvrir" | "fermer" | "cloturer") {
    const textes = {
      ouvrir: { q: `Ouvrir les inscriptions à « ${session.libelle} » ? Les agents pourront candidater depuis leur dossier.`, b: "Ouvrir", a: "Ouverture des inscriptions…", s: "Inscriptions ouvertes" },
      fermer: { q: `Fermer les inscriptions à « ${session.libelle} » ? Les candidatures déjà déposées continuent leur circuit.`, b: "Fermer", a: "Fermeture des inscriptions…", s: "Inscriptions fermées" },
      cloturer: {
        q: `Clôturer « ${session.libelle} » ? La formation sera inscrite au dossier des ${session.presents} participant(s) présent(s). L'émargement sera figé.`,
        b: "Clôturer",
        a: "Clôture du module…",
        s: "Module clôturé",
      },
    }[verbe];
    void agir({ confirmation: textes.q, confirmLabel: textes.b, attente: textes.a, route: `/api/v1/formation/sessions/${session.code}/${verbe}/`, succes: textes.s, detail: session.libelle });
  }

  function supprimer(session: Session) {
    void agir({
      confirmation: `Supprimer définitivement le module « ${session.libelle} » ?`,
      confirmLabel: "Supprimer",
      attente: "Suppression du module…",
      route: `/api/v1/formation/sessions/${session.code}/`,
      methode: "DELETE",
      succes: "Module supprimé",
    });
  }

  return (
    <section aria-labelledby="titre-sessions">
      <EnTeteSection
        icone="event_available"
        titre="Modules et sessions"
        sousTitre={`${pluriel(data.indicateurs.sessions, "module")} au plan ${data.exercice} · ${data.indicateurs.sessions_ouvertes} ouvert(s) aux inscriptions · ${data.indicateurs.sessions_en_cours} en cours`}
        action={
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setEdition("nouvelle")}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">add_circle</span>
            Planifier un module
          </button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-5">
        <label className="sm:col-span-6 relative">
          <span className="sr-only">Rechercher un module</span>
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none" aria-hidden="true">search</span>
          <input type="search" className={`${CHAMP} pl-10`} placeholder="Module, lieu, formateur, prestataire…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <label className="sm:col-span-3">
          <span className="sr-only">État</span>
          <select className={CHAMP} value={etat} onChange={(e) => setEtat(e.target.value)}>
            {ETATS.map((e) => <option key={e.valeur} value={e.valeur}>{e.libelle}</option>)}
          </select>
        </label>
        <label className="sm:col-span-3">
          <span className="sr-only">Cycle</span>
          <select className={CHAMP} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les cycles</option>
            {data.types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
          </select>
        </label>
      </div>

      {sessions.length === 0 ? (
        <Vide
          icone="event_busy"
          titre={data.sessions.length ? "Aucun module ne correspond à ces critères" : "Aucun module au plan"}
          texte={data.sessions.length ? "Modifiez les filtres ou la recherche." : "Planifiez le premier module : dates, lieu, places et coût par participant."}
        />
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {sessions.map((s) => (
            <CarteSession
              key={s.code}
              session={s}
              onGerer={() => setGestion(s.code)}
              onModifier={() => setEdition(s)}
              onAction={(verbe) => action(s, verbe)}
              onAnnuler={() => setAnnulation(s)}
              onSupprimer={() => supprimer(s)}
            />
          ))}
        </ul>
      )}

      {edition ? <FormulaireSession data={data} session={edition === "nouvelle" ? null : edition} onClose={() => setEdition(null)} /> : null}
      {geree ? <GestionParticipants data={data} session={geree} onClose={() => setGestion(null)} /> : null}
      {annulation ? <Annulation session={annulation} onClose={() => setAnnulation(null)} /> : null}
    </section>
  );
}

function CarteSession({
  session: s,
  onGerer,
  onModifier,
  onAction,
  onAnnuler,
  onSupprimer,
}: {
  session: Session;
  onGerer: () => void;
  onModifier: () => void;
  onAction: (verbe: "ouvrir" | "fermer" | "cloturer") => void;
  onAnnuler: () => void;
  onSupprimer: () => void;
}) {
  const remplissage = s.places ? Math.min(100, Math.round((s.occupees / s.places) * 100)) : 0;
  const actif = ACTIF.has(s.etat);
  const dateDepassee = s.date_debut ? new Date(`${s.date_debut}T00:00:00`) <= new Date() : false;
  return (
    <li className={`${CARTE} motion-content flex flex-col overflow-hidden ${s.etat === "annulee" ? "opacity-75" : ""}`}>
      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <BadgeSession etat={s.etat} libelle={s.etat_libelle} />
          <span className="font-code-num text-code-num text-on-surface-variant">{s.code.toUpperCase()}</span>
        </div>
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold leading-snug">{s.libelle}</h3>
          <p className="font-label-sm text-label-sm text-primary mt-1">{s.type_libelle}</p>
        </div>
        <dl className="space-y-1.5 font-body-sm text-body-sm text-on-surface-variant">
          <Info icone="calendar_month" libelle="Dates">
            {s.date_debut ? `Du ${dateCourte(s.date_debut)} au ${dateCourte(s.date_fin)} · ${pluriel(s.heures, "heure")}` : <span className="italic">Dates à fixer · {pluriel(s.heures, "heure")}</span>}
          </Info>
          <Info icone="location_on" libelle="Lieu">{s.lieu || <span className="italic">Lieu à préciser</span>}</Info>
          <Info icone="badge" libelle="Prestataire et formateur">{[s.prestataire?.nom, s.formateur].filter(Boolean).join(" · ") || <span className="italic">Prestataire à désigner</span>}</Info>
          <Info icone="payments" libelle="Coût">{fcfa(s.cout_participant)} par participant · engagé {fcfa(s.engage)}</Info>
        </dl>
        {s.etat === "annulee" ? (
          <p className="rounded bg-error-container/50 px-3 py-2 font-body-sm text-body-sm text-on-error-container">Annulé : {s.motif_annulation}</p>
        ) : (
          <div>
            <div className="flex justify-between font-label-sm text-label-sm mb-1">
              <span className="text-on-surface-variant">{s.occupees} / {s.places} places attribuées</span>
              <span className="text-on-surface-variant">{pluriel(s.candidatures, "candidature")}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
              <div className={`motion-fill h-full rounded-full ${remplissage >= 100 ? "bg-secondary-container" : "bg-primary"}`} style={{ width: `${remplissage}%` }}></div>
            </div>
          </div>
        )}
        {s.a_traiter ? (
          <p className="flex items-center gap-1.5 font-label-md text-label-md text-secondary font-semibold">
            <span className="material-symbols-outlined text-base" aria-hidden="true">pending_actions</span>
            {pluriel(s.a_traiter, "candidature")} à contrôler par la SD
          </p>
        ) : null}
        {s.etat === "terminee" ? (
          <p className="font-label-md text-label-md text-on-surface-variant">
            {s.presents} présent(s) sur {s.retenues} retenu(s)
            {s.satisfaction ? ` · satisfaction ${nombre(s.satisfaction, 1)} / 5` : ""}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-container-low/50 px-4 py-3">
        <button type="button" className="inline-flex items-center gap-1.5 h-9 px-3 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container" onClick={onGerer}>
          <span className="material-symbols-outlined text-base" aria-hidden="true">groups</span>
          Participants
        </button>
        {actif && s.etat !== "en_cours" ? (
          s.ouverte ? (
            <button type="button" className="h-9 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-surface-container" onClick={() => onAction("fermer")}>Fermer les inscriptions</button>
          ) : (
            <button type="button" className="h-9 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-surface-container disabled:opacity-50" onClick={() => onAction("ouvrir")} disabled={!s.date_debut} title={s.date_debut ? undefined : "Fixez d'abord les dates"}>
              Ouvrir les inscriptions
            </button>
          )
        ) : null}
        {actif && s.retenues > 0 && dateDepassee ? (
          <button type="button" className="h-9 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-surface-container" onClick={() => onAction("cloturer")}>Clôturer</button>
        ) : null}
        <span className="flex-1" />
        {actif ? (
          <>
            <button type="button" className={BOUTON_ICONE} onClick={onModifier} aria-label={`Modifier ${s.libelle}`} title="Modifier">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
            </button>
            <button type="button" className={BOUTON_ICONE} onClick={onAnnuler} aria-label={`Annuler ${s.libelle}`} title="Annuler le module">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">event_busy</span>
            </button>
          </>
        ) : null}
        {s.candidatures === 0 ? (
          <button type="button" className={BOUTON_ICONE} onClick={onSupprimer} aria-label={`Supprimer ${s.libelle}`} title="Supprimer">
            <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
          </button>
        ) : null}
      </div>
    </li>
  );
}

function Info({ icone, libelle, children }: { icone: string; libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="sr-only">{libelle}</dt>
      <span className="material-symbols-outlined text-base text-on-surface-variant mt-px" aria-hidden="true">{icone}</span>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// --- Planification ---------------------------------------------------------------

function FormulaireSession({ data, session, onClose }: { data: TableauFormation; session: Session | null; onClose: () => void }) {
  const [f, setF] = useState({
    type: session?.type ?? data.types[0]?.code ?? "",
    libelle: session?.libelle ?? "",
    objectif: session?.objectif ?? "",
    cadre_budgetaire: session?.cadre_budgetaire ?? `Dotation ministérielle, exercice ${data.exercice}`,
    prestataire: session?.prestataire ? String(session.prestataire.id) : "",
    formateur: session?.formateur ?? "",
    lieu: session?.lieu ?? "",
    date_debut: session?.date_debut ?? "",
    date_fin: session?.date_fin ?? "",
    heures: String(session?.heures ?? ""),
    places: String(session?.places ?? 20),
    cout_participant: String(session?.cout_participant ?? ""),
  });
  const deja = new Set(data.besoins.filter((b) => b.session?.code === session?.code && session).map((b) => b.id));
  const [besoins, setBesoins] = useState<Set<number>>(deja);
  const enregistrer = useEnregistrement<Session>(onClose, session ? "Module mis à jour" : "Module planifié");
  const maj = (cle: keyof typeof f) => (valeur: string) => setF((actuel) => ({ ...actuel, [cle]: valeur }));
  // Besoins du même cycle encore à couvrir (ou déjà couverts par ce module).
  const couvrables = data.besoins.filter((b) => b.type === f.type && (b.statut !== "couvert" || deja.has(b.id)));

  function soumettre() {
    enregistrer.mutate({
      route: session ? `/api/v1/formation/sessions/${session.code}/` : "/api/v1/formation/sessions/",
      methode: session ? "PATCH" : "POST",
      corps: { ...f, prestataire: f.prestataire ? Number(f.prestataire) : null, besoins: [...besoins] },
    });
  }

  return (
    <Modale
      titre={session ? "Modifier le module" : "Planifier un module"}
      sousTitre={session ? `${session.code.toUpperCase()} · ${session.occupees} place(s) déjà attribuée(s)` : "Le module est créé « planifié » ; ouvrez ensuite les inscriptions."}
      onClose={onClose}
      onSubmit={soumettre}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
      libelleValider={session ? "Enregistrer" : "Planifier"}
      largeur="max-w-3xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <Liste libelle="Cycle de formation" obligatoire valeur={f.type} onChange={maj("type")} options={data.types.map((t) => ({ valeur: t.code, libelle: t.libelle }))} className="md:col-span-2" />
        <Texte libelle="Intitulé du module" obligatoire max={160} valeur={f.libelle} onChange={maj("libelle")} className="md:col-span-2" />
        <Zone libelle="Objectif pédagogique" max={240} lignes={2} valeur={f.objectif} onChange={maj("objectif")} className="md:col-span-2" />
        <DateChamp libelle="Date de début" valeur={f.date_debut} onChange={maj("date_debut")} aide="Obligatoire pour ouvrir les inscriptions." />
        <DateChamp libelle="Date de fin" valeur={f.date_fin} min={f.date_debut || undefined} onChange={maj("date_fin")} />
        <Nombre libelle="Volume horaire" obligatoire valeur={f.heures} onChange={maj("heures")} max={2000} unite="heures" />
        <Nombre libelle="Nombre de places" obligatoire valeur={f.places} onChange={maj("places")} min={1} max={1000} unite="places" />
        <Nombre libelle="Coût par participant" obligatoire valeur={f.cout_participant} onChange={maj("cout_participant")} unite="FCFA" />
        <Texte libelle="Cadre budgétaire" max={160} valeur={f.cadre_budgetaire} onChange={maj("cadre_budgetaire")} />
        <Liste
          libelle="Prestataire"
          valeur={f.prestataire}
          onChange={maj("prestataire")}
          vide="À désigner"
          options={data.prestataires.filter((p) => p.actif || String(p.id) === f.prestataire).map((p) => ({ valeur: String(p.id), libelle: p.nom }))}
        />
        <Texte libelle="Formateur ou intervenant" max={160} valeur={f.formateur} onChange={maj("formateur")} />
        <Texte libelle="Lieu" max={160} valeur={f.lieu} onChange={maj("lieu")} placeholder="Salle, bâtiment, ville" className="md:col-span-2" />
      </div>
      {couvrables.length ? (
        <fieldset className="mt-5 rounded-lg bg-surface-container-low p-4">
          <legend className="font-label-md text-label-md text-on-surface px-1">Besoins recensés couverts par ce module</legend>
          <div className="mt-2 space-y-2.5">
            {couvrables.map((b) => (
              <Case
                key={b.id}
                libelle={`${b.intitule} · ${b.organisme.nom}`}
                aide={`${pluriel(b.effectif, "agent")} · priorité ${b.priorite_libelle.toLowerCase()}`}
                coche={besoins.has(b.id)}
                onChange={(coche) => setBesoins((s) => {
                  const suivant = new Set(s);
                  if (coche) suivant.add(b.id); else suivant.delete(b.id);
                  return suivant;
                })}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
    </Modale>
  );
}

function Annulation({ session, onClose }: { session: Session; onClose: () => void }) {
  const [motif, setMotif] = useState("");
  const enregistrer = useEnregistrement<Session>(onClose, "Module annulé");
  return (
    <Modale
      titre="Annuler le module"
      sousTitre={`${session.libelle} · ${pluriel(session.candidatures, "candidature")} : chaque candidat est prévenu du motif.`}
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: `/api/v1/formation/sessions/${session.code}/annuler/`, methode: "POST", corps: { motif } })}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
      libelleValider="Annuler le module"
      largeur="max-w-lg"
    >
      <Zone libelle="Motif de l'annulation" obligatoire max={240} valeur={motif} onChange={setMotif} aide="Communiqué aux agents dont la candidature est refermée." />
    </Modale>
  );
}

// --- Gestion des participants --------------------------------------------------------

function GestionParticipants({ data, session, onClose }: { data: TableauFormation; session: Session; onClose: () => void }) {
  const { agir } = useAction();
  const [refus, setRefus] = useState<Candidature | null>(null);
  const [ajout, setAjout] = useState(false);
  const candidatures = data.inscriptions.filter((i) => i.session.code === session.code);
  const fige = session.etat === "terminee" || session.etat === "annulee";
  const ordre = { controle_sd: 0, visa_drh: 1, avis_hierarchique: 2, retenue: 3, refusee: 4 };
  candidatures.sort((a, b) => ordre[a.etat] - ordre[b.etat] || a.agent.nom_complet.localeCompare(b.agent.nom_complet));
  const pageCandidatures = usePagination(candidatures, `${session.code}|${candidatures.length}`);

  const VALIDER: Partial<Record<Candidature["etat"], { libelle: string; q: string; s: string }>> = {
    avis_hierarchique: { libelle: "Avis favorable du chef de service", q: "Enregistrer l'avis favorable du chef de service ?", s: "Avis du chef de service enregistré" },
    controle_sd: { libelle: "Transmettre au DRH", q: "Valider le contrôle de la SD et transmettre au visa du DRH ?", s: "Candidature transmise au DRH" },
    visa_drh: { libelle: "Viser (DRH)", q: "Apposer le visa du DRH ? L'agent sera notifié de sa prise en compte.", s: "Candidature retenue, agent notifié" },
  };

  function valider(c: Candidature) {
    const v = VALIDER[c.etat];
    if (!v) return;
    void agir({ confirmation: `${v.q} (${c.agent.nom_complet})`, confirmLabel: v.libelle, attente: "Enregistrement…", route: `/api/v1/demandes/${c.reference}/valider/`, succes: v.s, detail: c.agent.nom_complet });
  }

  function emarger(c: Candidature, corps: { present?: boolean | null; note_satisfaction?: number | null }) {
    void agir({ attente: "Enregistrement de l'émargement…", route: `/api/v1/formation/inscriptions/${c.id}/`, methode: "PATCH", corps, succes: "Émargement enregistré", detail: c.agent.nom_complet });
  }

  return (
    <Modale
      titre={session.libelle}
      sousTitre={`${session.etat_libelle} · ${session.occupees} / ${session.places} places attribuées · ${pluriel(candidatures.length, "candidature")}`}
      onClose={onClose}
      largeur="max-w-4xl"
      pied={
        session.ouverte && !fige ? (
          <button type="button" className={`${BOUTON_SECONDAIRE} mr-auto`} onClick={() => setAjout(true)}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">group_add</span>
            Inscrire des agents
          </button>
        ) : null
      }
    >
      {candidatures.length === 0 ? (
        <Vide
          icone="person_search"
          titre="Aucune candidature pour l'instant"
          texte={session.ouverte ? "Les agents candidatent depuis leur dossier ; vous pouvez aussi les inscrire directement." : "Ouvrez les inscriptions pour recevoir des candidatures."}
        />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left font-body-sm text-body-sm">
            <thead>
              <tr className="border-b border-hairline font-label-md text-label-md text-on-surface-variant">
                <th className="py-2.5 px-2">Agent</th>
                <th className="py-2.5 px-2">Étape</th>
                <th className="py-2.5 px-2">{session.etat === "en_cours" || session.etat === "terminee" ? "Émargement" : "Décision"}</th>
              </tr>
            </thead>
            <tbody>
              {pageCandidatures.visibles.map((c) => (
                <tr key={c.id} className="border-b border-hairline last:border-0 align-top">
                  <td className="py-3 px-2">
                    <Link to={`/app/dossiers/${encodeURIComponent(c.agent.matricule)}?onglet=formation`} className="font-label-lg text-label-lg text-on-surface hover:text-primary hover:underline rounded">
                      {c.agent.nom_complet}
                    </Link>
                    <span className="block text-on-surface-variant">{c.agent.matricule} · {c.agent.organisme}</span>
                    <span className="block text-on-surface-variant">Candidature {c.reference} du {dateCourte(c.deposee_le)}</span>
                  </td>
                  <td className="py-3 px-2"><BadgeCandidature etat={c.etat} libelle={c.etat_libelle} /></td>
                  <td className="py-3 px-2">
                    {c.etat === "retenue" ? (
                      <Emargement candidature={c} fige={fige} onChange={(corps) => emarger(c, corps)} />
                    ) : c.etat === "refusee" ? (
                      <span className="text-on-surface-variant">{c.etape}</span>
                    ) : fige ? null : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="h-8 px-3 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container" onClick={() => valider(c)}>
                          {VALIDER[c.etat]?.libelle}
                        </button>
                        <button type="button" className="h-8 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-error-container/40" onClick={() => setRefus(c)}>
                          Refuser
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pageCandidatures.page} pages={pageCandidatures.pages} total={pageCandidatures.total} aller={pageCandidatures.aller} libelle="candidature" />
        </div>
      )}
      {session.etat !== "terminee" && session.retenues > 0 && !session.emargement_complet ? (
        <p className="mt-4 font-label-sm text-label-sm text-on-surface-variant">La clôture exige la présence (oui ou non) de chaque participant retenu.</p>
      ) : null}
      {refus ? <RefusCandidature candidature={refus} onClose={() => setRefus(null)} /> : null}
      {ajout ? <AjoutAgents session={session} dejaInscrits={new Set(candidatures.filter((c) => c.etat !== "refusee").map((c) => c.agent.matricule))} onClose={() => setAjout(false)} /> : null}
    </Modale>
  );
}

function Emargement({ candidature: c, fige, onChange }: { candidature: Candidature; fige: boolean; onChange: (corps: { present?: boolean | null; note_satisfaction?: number | null }) => void }) {
  const choix: { valeur: boolean | null; libelle: string }[] = [
    { valeur: true, libelle: "Présent" },
    { valeur: false, libelle: "Absent" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded border border-outline-variant overflow-hidden" role="group" aria-label={`Présence de ${c.agent.nom_complet}`}>
        {choix.map((o) => (
          <button
            key={String(o.valeur)}
            type="button"
            disabled={fige}
            aria-pressed={c.present === o.valeur}
            onClick={() => onChange({ present: c.present === o.valeur ? null : o.valeur })}
            className={`h-8 px-3 font-label-md text-label-md ${c.present === o.valeur ? (o.valeur ? "bg-primary text-on-primary" : "bg-error text-on-error") : "hover:bg-surface-container"} disabled:cursor-default`}
          >
            {o.libelle}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
        Satisfaction
        <select
          className="h-8 rounded border border-outline-variant bg-surface-container-lowest px-2 font-label-md text-label-md text-on-surface"
          value={c.note_satisfaction ?? ""}
          disabled={fige || c.present === false}
          onChange={(e) => onChange({ note_satisfaction: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">—</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
        </select>
      </label>
    </div>
  );
}

function AjoutAgents({ session, dejaInscrits, onClose }: { session: Session; dejaInscrits: Set<string>; onClose: () => void }) {
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState<Map<string, string>>(new Map());
  const [resultats, setResultats] = useState<{ matricule: string; nom?: string; ok: boolean; message: string }[] | null>(null);
  const agents = useQuery({ queryKey: ["agents", ""], queryFn: () => api<AgentBrief[]>("/api/v1/agents/") });
  const enregistrer = useEnregistrement<{ resultats: typeof resultats; inscrits: number }>((r) => setResultats(r.resultats), "Inscriptions transmises");
  const q = recherche.trim().toLowerCase();
  const proposes = useMemo(
    () => (agents.data ?? []).filter((a) => !dejaInscrits.has(a.matricule) && (!q || `${a.nom_complet} ${a.matricule} ${a.organisme_sigle}`.toLowerCase().includes(q))).slice(0, 40),
    [agents.data, dejaInscrits, q],
  );

  if (resultats) {
    return (
      <Modale titre="Résultat des inscriptions" sousTitre={session.libelle} onClose={onClose} largeur="max-w-lg">
        <ul className="space-y-2">
          {resultats.map((r) => (
            <li key={r.matricule} className="flex items-start gap-2 font-body-sm text-body-sm">
              <span className={`material-symbols-outlined text-lg ${r.ok ? "text-primary" : "text-error"}`} aria-hidden="true">{r.ok ? "check_circle" : "error"}</span>
              <span><strong className="text-on-surface">{r.nom ?? r.matricule}</strong> — {r.message}</span>
            </li>
          ))}
        </ul>
      </Modale>
    );
  }

  return (
    <Modale
      titre="Inscrire des agents"
      sousTitre={`${session.libelle} · chaque candidature entre dans le circuit (chef de service, SD, DRH).`}
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: `/api/v1/formation/sessions/${session.code}/inscrire/`, methode: "POST", corps: { matricules: [...choisis.keys()] } })}
      enCours={enregistrer.isPending}
      erreur={choisis.size === 0 && enregistrer.isError ? "Choisissez au moins un agent." : messageErreur(enregistrer.error)}
      libelleValider={`Inscrire ${choisis.size || ""}`.trim()}
      largeur="max-w-xl"
    >
      <label className="block">
        <span className="sr-only">Rechercher un agent</span>
        <input type="search" className={CHAMP} placeholder="Nom, matricule ou structure…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
      </label>
      {choisis.size ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Agents choisis">
          {[...choisis].map(([matricule, nom]) => (
            <li key={matricule}>
              <button type="button" className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm" onClick={() => setChoisis((m) => { const s = new Map(m); s.delete(matricule); return s; })} aria-label={`Retirer ${nom}`}>
                {nom}
                <span className="material-symbols-outlined text-sm" aria-hidden="true">close</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-3 max-h-72 overflow-y-auto rounded border border-hairline divide-y divide-surface-container-high">
        {agents.isPending ? <li className="p-3 font-body-sm text-body-sm text-on-surface-variant">Chargement…</li> : null}
        {agents.data && proposes.length === 0 ? <li className="p-3 font-body-sm text-body-sm text-on-surface-variant">Aucun agent disponible pour cette recherche.</li> : null}
        {proposes.map((a) => (
          <li key={a.matricule}>
            <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-container-low">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={choisis.has(a.matricule)}
                onChange={(e) => setChoisis((m) => { const s = new Map(m); if (e.target.checked) s.set(a.matricule, a.nom_complet); else s.delete(a.matricule); return s; })}
              />
              <span className="min-w-0">
                <span className="block font-label-lg text-label-lg text-on-surface">{a.nom_complet}</span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">{a.matricule} · {a.organisme_sigle} · {a.corps}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </Modale>
  );
}
