import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { Dossier } from "../../api/types";
import { dateCourte } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../../ui/Modale";
import { Icone } from "../../ui/Icone";
import { CircuitDemande, demandeClose, jour, periode, pluriel } from "../dossier-onglets/commun";
import { Inscription } from "../dossier-onglets/OngletFormation";

type Module = Dossier["sessions_formations"][number];

/** Pourquoi l'agent ne peut pas postuler à ce module, ou null quand la candidature est ouverte. */
function obstacle(module: Module, dejaCandidat: boolean): string | null {
  if (dejaCandidat) return "Candidature déjà déposée";
  if (module.inscriptions_fin && module.inscriptions_fin < new Date().toISOString().slice(0, 10)) return "Inscriptions closes";
  if (module.places_restantes <= 0) return "Module complet";
  return null;
}

/** Collecte des besoins et inscriptions ouvertes, dans l'espace profil de l'agent. */
export function CollecteAgent({ agent }: { agent: Dossier }) {
  const collecte = agent.collecte_formation;
  const sessions = agent.sessions_formations ?? [];
  const feedback = useFeedback();
  const client = useQueryClient();
  const [lignes, setLignes] = useState<string[]>([""]);
  // null : fermée ; sinon le module visé par la candidature ("" : aucun choix préalable).
  const [candidature, setCandidature] = useState<string | null>(null);
  const modifiable = agent.modifiable !== false;
  const demandes = agent.demandes.filter((item) => item.categorie === "formation");
  const ouvertes = demandes.filter((item) => !demandeClose(item));
  const closes = demandes.filter(demandeClose);
  const [enCours, setEnCours] = useState(false);
  const enAttente = Boolean(collecte?.ouverte && !collecte.repondu);
  // Deux volets : les modules ouverts aux inscriptions, et la collecte des besoins lancée par l'équipe RH.
  const [volet, setVolet] = useState<"inscriptions" | "collecte">(enAttente ? "collecte" : "inscriptions");

  async function envoyer(ras: boolean) {
    const besoins = ras ? [] : lignes.map((intitule) => intitule.trim()).filter(Boolean).map((intitule) => ({ intitule }));
    if (!ras && besoins.length === 0) {
      feedback.toast("Besoin manquant", "Saisissez au moins un besoin, ou indiquez RAS.", "error");
      return;
    }
    setEnCours(true);
    try {
      await feedback.run(
        ras ? "Enregistrement de votre RAS…" : "Envoi de vos besoins…",
        () => api("/api/v1/formation/collecte/repondre/", { method: "POST", body: JSON.stringify({ ras, besoins }) }),
        { success: { title: ras ? "RAS enregistré" : "Besoins envoyés", message: "La sous-direction de la formation en a pris connaissance." } },
      );
      await client.invalidateQueries({ queryKey: ["agent", agent.matricule] });
      await client.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      /* toast déjà affiché */
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-xl border border-hairline bg-surface-container-lowest p-1" role="tablist" aria-label="Volets de la formation">
        {([
          ["inscriptions", "how_to_reg", "Formations ouvertes aux inscriptions", false],
          ["collecte", "campaign", "Collecte des besoins de formation", enAttente],
        ] as const).map(([cle, icone, libelle, alerte]) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={volet === cle}
            onClick={() => setVolet(cle)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-label-md text-label-md transition-colors ${volet === cle ? "bg-primary text-on-primary font-semibold" : "text-on-surface-variant hover:bg-surface-container-low"}`}
          >
            <Icone nom={icone} className="text-lg" />{libelle}
            {alerte ? <span className="h-2 w-2 rounded-full bg-secondary-container" role="img" aria-label="Réponse attendue" /> : null}
          </button>
        ))}
      </div>

      {volet === "collecte" ? (
        <section className="rounded-xl border border-hairline bg-surface-container-lowest p-5 space-y-4" aria-labelledby="titre-collecte">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="titre-collecte" className="font-label-lg text-label-lg text-on-surface font-bold">Collecte des besoins de formation</h3>
            </div>
            <span className={`rounded-full px-3 py-1 font-label-sm text-label-sm font-bold ${enAttente ? "bg-secondary-container text-on-secondary-container" : collecte?.ouverte ? "bg-primary/10 text-primary" : "bg-surface-container text-on-surface-variant"}`}>
              {!collecte ? "Aucune campagne" : collecte.ouverte ? (collecte.repondu ? "Campagne ouverte · réponse envoyée" : "Campagne ouverte · réponse attendue") : "Campagne clôturée"}
            </span>
          </div>

          {!collecte ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Aucune collecte n'est lancée pour le moment. Vous serez notifié dès que l'équipe RH ouvrira la campagne.
            </p>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface">
              {collecte.communique || "Le ministère recueille vos besoins de formation."}
              {collecte.date_limite ? ` Date limite de réponse : ${dateCourte(collecte.date_limite)} ; la campagne se clôt automatiquement à cette date.` : ""}
            </p>
          )}

          {enAttente && modifiable ? (
            <div className="rounded-lg border border-secondary-container bg-secondary-fixed/40 p-4">
              <p className="font-label-md text-label-md text-on-surface font-semibold">Mes besoins de formation</p>
              <ul className="mt-3 space-y-2">
                {lignes.map((ligne, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <input
                      className="w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface"
                      value={ligne}
                      maxLength={200}
                      aria-label={`Besoin de formation ${index + 1}`}
                      placeholder="Ex. : Rédaction administrative, contrôle de gestion…"
                      onChange={(e) => setLignes((liste) => liste.map((x, i) => (i === index ? e.target.value : x)))}
                    />
                    {lignes.length > 1 ? (
                      <button type="button" aria-label={`Retirer le besoin ${index + 1}`} className="p-2 rounded text-on-surface-variant hover:text-error hover:bg-surface-container-low"
                        onClick={() => setLignes((liste) => liste.filter((_, i) => i !== index))}>
                        <Icone nom="delete" className="text-lg" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setLignes((liste) => [...liste, ""])}>
                  <Icone nom="add" className="text-lg" />Ajouter un besoin
                </button>
                <button type="button" className={BOUTON_PRIMAIRE} disabled={enCours} onClick={() => void envoyer(false)}>Envoyer mes besoins</button>
                <button type="button" className={BOUTON_SECONDAIRE} disabled={enCours} onClick={() => void envoyer(true)}>RAS — aucun besoin</button>
              </div>
            </div>
          ) : null}

          {collecte?.repondu ? (
            <div className="rounded-lg bg-surface-container-low p-4">
              <p className="font-label-md text-label-md text-on-surface font-semibold">Votre réponse</p>
              {collecte.ras ? (
                <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Vous avez indiqué n'avoir aucun besoin (RAS).</p>
              ) : (
                <ul className="mt-2 list-disc pl-5 font-body-sm text-body-sm text-on-surface">
                  {collecte.besoins.map((b) => <li key={b.id}>{b.intitule}</li>)}
                </ul>
              )}
            </div>
          ) : collecte && !collecte.ouverte ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">La campagne est clôturée et vous n'y avez pas répondu.</p>
          ) : null}
        </section>
      ) : (
        <>
      <section className="rounded-xl border border-hairline bg-surface-container-lowest p-5" aria-labelledby="titre-candidatures">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="titre-candidatures" className="font-label-lg text-label-lg text-on-surface font-bold">Mes candidatures</h3>
          </div>
          {modifiable && sessions.length ? (
            <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setCandidature("")}>
              <Icone nom="person_add" className="text-lg" />S'inscrire à un module
            </button>
          ) : null}
        </div>
        <div className="mt-4 space-y-4">
          {ouvertes.map((demande) => <CircuitDemande key={demande.reference} demande={demande} />)}
          {closes.map((demande) => <CircuitDemande key={demande.reference} demande={demande} clos />)}
          {demandes.length === 0 ? <p className="font-body-sm text-body-sm text-on-surface-variant">Vous n'avez déposé aucune candidature.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-hairline bg-surface-container-lowest p-5" aria-labelledby="titre-modules">
        <h3 id="titre-modules" className="font-label-lg text-label-lg text-on-surface font-bold">Modules ouverts aux inscriptions</h3>
        {sessions.length === 0 ? (
          <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">Aucun module n'est ouvert pour le moment.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sessions.map((module) => {
              const dejaCandidat = ouvertes.some((demande) => demande.nature === module.libelle);
              const raison = obstacle(module, dejaCandidat);
              return (
                <li key={module.code} className="rounded-lg border border-hairline bg-surface-container-low p-4 flex flex-col gap-3">
                  <div>
                    <p className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">{module.type_libelle}</p>
                    <p className="font-label-lg text-label-lg text-on-surface font-semibold">{module.libelle}</p>
                    {module.objectif ? <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{module.objectif}</p> : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-body-sm text-body-sm">
                    <div><dt className="text-on-surface-variant">Période</dt><dd className="font-semibold">{module.date_debut && module.date_fin ? periode(module.date_debut, module.date_fin) : "À planifier"}</dd></div>
                    <div><dt className="text-on-surface-variant">Lieu</dt><dd className="font-semibold">{module.lieu || "À préciser"}</dd></div>
                    <div><dt className="text-on-surface-variant">Durée</dt><dd className="font-semibold">{module.heures ? `${module.heures} h` : "—"}</dd></div>
                    <div><dt className="text-on-surface-variant">Places restantes</dt><dd className="font-semibold">{module.places_restantes} / {module.places}</dd></div>
                    <div><dt className="text-on-surface-variant">Inscriptions jusqu'au</dt><dd className="font-semibold">{module.inscriptions_fin ? jour(module.inscriptions_fin) : "Sans limite"}</dd></div>
                  </dl>
                  {modifiable ? (
                    <div className="mt-auto flex items-center justify-between gap-2">
                      {raison ? <span className="font-label-sm text-label-sm text-on-surface-variant">{raison}</span> : <span />}
                      <button type="button" className={BOUTON_PRIMAIRE} disabled={Boolean(raison)} onClick={() => setCandidature(module.code)}>
                        Postuler
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="rounded-xl border border-hairline bg-surface-container-lowest p-5">
        <h3 className="font-label-lg text-label-lg text-on-surface font-bold">Parcours de formation</h3>
        {agent.formations.length === 0 ? (
          <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Aucune formation n'est encore versée à votre dossier.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {agent.formations.map((f) => (
              <li key={f.id} className="py-3">
                <p className="font-label-lg text-label-lg text-on-surface">{f.intitule}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{f.organisme} · {pluriel(f.heures, "heure")} · {f.statut}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
        </>
      )}
      {candidature !== null ? (
        <Inscription
          agent={agent}
          typeInitial={sessions.find((module) => module.code === candidature)?.type ?? ""}
          moduleInitial={candidature}
          onClose={() => setCandidature(null)}
        />
      ) : null}
    </div>
  );
}

export function pastilleCollecte(agent: Dossier): boolean {
  return Boolean(agent.collecte_formation?.ouverte && !agent.collecte_formation.repondu);
}
