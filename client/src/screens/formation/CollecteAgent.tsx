import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { Dossier } from "../../api/types";
import { dateCourte } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../../ui/Modale";

/** Collecte des besoins et inscriptions ouvertes, dans l'espace profil de l'agent. */
export function CollecteAgent({ agent }: { agent: Dossier }) {
  const collecte = agent.collecte_formation;
  const sessions = agent.sessions_formations ?? [];
  const feedback = useFeedback();
  const client = useQueryClient();
  const [lignes, setLignes] = useState<string[]>([""]);
  const [enCours, setEnCours] = useState(false);
  const enAttente = Boolean(collecte?.ouverte && !collecte.repondu);

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
      {enAttente ? (
        <div className="rounded-xl border border-secondary-container bg-secondary-fixed/40 p-5" role="status">
          <p className="flex items-center gap-2 font-label-lg text-label-lg text-on-surface font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-secondary-container motion-pulse-dot" aria-hidden="true" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-secondary-container" />
            </span>
            Collecte des besoins de formation
          </p>
          <p className="mt-2 font-body-sm text-body-sm text-on-surface">
            {collecte?.communique || "Le ministère recueille vos besoins de formation."}
            {collecte?.date_limite ? ` Répondez avant le ${dateCourte(collecte.date_limite)}.` : ""}
          </p>
          <ul className="mt-4 space-y-2">
            {lignes.map((ligne, index) => (
              <li key={index}>
                <input
                  className="w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface"
                  value={ligne}
                  maxLength={200}
                  placeholder="Ex. Rédaction administrative, contrôle de gestion…"
                  onChange={(e) => setLignes((liste) => liste.map((x, i) => (i === index ? e.target.value : x)))}
                />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setLignes((liste) => [...liste, ""])}>Ajouter un besoin</button>
            <button type="button" className={BOUTON_PRIMAIRE} disabled={enCours} onClick={() => void envoyer(false)}>Envoyer mes besoins</button>
            <button type="button" className={BOUTON_SECONDAIRE} disabled={enCours} onClick={() => void envoyer(true)}>RAS — aucun besoin</button>
          </div>
        </div>
      ) : collecte?.repondu ? (
        <div className="rounded-xl border border-hairline bg-surface-container-lowest p-5">
          <p className="font-label-lg text-label-lg text-on-surface font-bold">Votre réponse à la collecte</p>
          {collecte.ras ? (
            <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Vous avez indiqué n'avoir aucun besoin (RAS).</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 font-body-sm text-body-sm text-on-surface">
              {collecte.besoins.map((b) => <li key={b.id}>{b.intitule}</li>)}
            </ul>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-hairline bg-surface-container-lowest p-5">
        <h3 className="font-label-lg text-label-lg text-on-surface font-bold">Modules ouverts aux inscriptions</h3>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Formations organisées par le ministère. La candidature suit le circuit de validation.</p>
        {sessions.length === 0 ? (
          <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">Aucun module n'est ouvert pour le moment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {sessions.map((s) => (
              <li key={s.code} className="py-3">
                <p className="font-label-lg text-label-lg text-on-surface">{s.libelle}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{s.objectif || s.cadre}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-hairline bg-surface-container-lowest p-5">
        <h3 className="font-label-lg text-label-lg text-on-surface font-bold">Parcours de formation</h3>
        {agent.formations.length === 0 ? (
          <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Aucune formation n'est encore versée à votre dossier.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {agent.formations.map((f) => (
              <li key={f.id} className="py-3">
                <p className="font-label-lg text-label-lg text-on-surface">{f.intitule}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{f.organisme} · {f.heures} h · {f.statut}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function pastilleCollecte(agent: Dossier): boolean {
  return Boolean(agent.collecte_formation?.ouverte && !agent.collecte_formation.repondu);
}
