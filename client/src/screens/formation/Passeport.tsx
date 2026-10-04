import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { AgentBrief, Dossier, SessionUser } from "../../api/types";
import { dateCourte, dateLongue, nombre, pluriel } from "../../ui/format";
import { Skeleton } from "../../ui/Motion";
import { BOUTON_PRIMAIRE, CARTE, CHAMP, EnTeteSection, Modale, Vide } from "./ui";

/** Passeport de formation : formations suivies par un agent, heures cumulées, attestation imprimable. */
export function Passeport() {
  const [recherche, setRecherche] = useState("");
  const [matricule, setMatricule] = useState<string | null>(null);
  const agents = useQuery({ queryKey: ["agents", ""], queryFn: () => api<AgentBrief[]>("/api/v1/agents/") });
  const q = recherche.trim().toLowerCase();
  const proposes = useMemo(
    () => (agents.data ?? []).filter((a) => !q || `${a.nom_complet} ${a.matricule} ${a.organisme_sigle}`.toLowerCase().includes(q)).slice(0, 8),
    [agents.data, q],
  );

  return (
    <section aria-labelledby="titre-passeport">
      <EnTeteSection icone="workspace_premium" titre="Passeport de formation" sousTitre="Formations suivies par un agent, versées à son dossier à la clôture de chaque module." />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className={`${CARTE} p-4 xl:col-span-4 self-start`}>
          <label className="block">
            <span className="block font-label-md text-label-md text-on-surface mb-1">Rechercher un agent</span>
            <input type="search" className={CHAMP} placeholder="Nom, matricule, structure…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
          <ul className="mt-3 divide-y divide-surface-container-high">
            {agents.isPending ? <li className="py-3"><Skeleton className="h-10 w-full" /></li> : null}
            {agents.data && proposes.length === 0 ? <li className="py-3 font-body-sm text-body-sm text-on-surface-variant">Aucun agent ne correspond.</li> : null}
            {proposes.map((a) => (
              <li key={a.matricule}>
                <button
                  type="button"
                  aria-pressed={matricule === a.matricule}
                  onClick={() => setMatricule(a.matricule)}
                  className={`w-full flex items-center gap-3 px-2 py-2.5 rounded text-left ${matricule === a.matricule ? "bg-primary-fixed/50" : "hover:bg-surface-container-low"}`}
                >
                  <span className="w-9 h-9 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-label-md text-label-md font-bold shrink-0" aria-hidden="true">{a.initiales}</span>
                  <span className="min-w-0">
                    <span className="block font-label-lg text-label-lg text-on-surface truncate">{a.nom_complet}</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">{a.matricule} · {a.organisme_sigle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="xl:col-span-8">
          {matricule ? <Fiche matricule={matricule} /> : <Vide icone="badge" titre="Choisissez un agent" texte="Son passeport de formation s'affiche ici : modules suivis, organismes, heures et attestations." />}
        </div>
      </div>
    </section>
  );
}

function Fiche({ matricule }: { matricule: string }) {
  const [attestation, setAttestation] = useState<Dossier["formations"][number] | null>(null);
  const dossier = useQuery({ queryKey: ["agent", matricule], queryFn: () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(matricule)}/`) });
  if (dossier.isPending) return <Skeleton className="h-72 w-full rounded-xl" />;
  if (dossier.isError) return <Vide icone="error" titre="Passeport indisponible" texte="Le dossier de l'agent n'a pas pu être chargé." />;
  const agent = dossier.data;
  const suivies = agent.formations.filter((f) => f.statut === "Terminée");
  const autres = agent.formations.filter((f) => f.statut !== "Terminée");
  const heures = suivies.reduce((s, f) => s + f.heures, 0);

  return (
    <div className={`${CARTE} motion-content p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-hairline">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">{agent.nom_complet}</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">{agent.matricule} · {agent.corps} · {agent.organisme_sigle}</p>
        </div>
        <div className="text-right">
          <p className="font-headline-md text-headline-md text-primary font-bold">{nombre(heures)} h</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">{pluriel(suivies.length, "formation suivie", "formations suivies")}</p>
        </div>
      </div>
      {suivies.length === 0 ? (
        <p className="py-6 font-body-sm text-body-sm text-on-surface-variant">Aucune formation terminée pour l'instant.</p>
      ) : (
        <ul className="divide-y divide-surface-container-high">
          {suivies.map((f) => (
            <li key={f.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-label-lg text-label-lg text-on-surface">{f.intitule}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{f.organisme} · du {dateCourte(f.debut)} au {dateCourte(f.fin)} · {pluriel(f.heures, "heure")}</p>
              </div>
              <button type="button" className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-surface-container" onClick={() => setAttestation(f)}>
                <span className="material-symbols-outlined text-base" aria-hidden="true">print</span>
                Attestation
              </button>
            </li>
          ))}
        </ul>
      )}
      {autres.length ? (
        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
          {pluriel(autres.length, "autre formation")} en cours ou planifiée : {autres.map((f) => f.intitule).join(", ")}.
        </p>
      ) : null}
      <Link to={`/app/dossiers/${encodeURIComponent(agent.matricule)}?onglet=formation`} className="mt-4 inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline rounded">
        Ouvrir le dossier de l'agent
        <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
      </Link>
      {attestation ? <Attestation agent={agent} formation={attestation} onClose={() => setAttestation(null)} /> : null}
    </div>
  );
}

function Attestation({ agent, formation, onClose }: { agent: Dossier; formation: Dossier["formations"][number]; onClose: () => void }) {
  const moi = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  return (
    <Modale
      titre="Attestation de formation"
      sousTitre="Aperçu avant impression ou enregistrement en PDF depuis la fenêtre d'impression."
      onClose={onClose}
      largeur="max-w-3xl"
      pied={
        <button type="button" className={`${BOUTON_PRIMAIRE} mr-auto`} onClick={() => window.print()}>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">print</span>
          Imprimer
        </button>
      }
    >
      <article className="zone-impression rounded-lg border border-hairline bg-white p-8 text-[#0b1c30]">
        <header className="flex items-center gap-4 border-b border-hairline pb-4">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Armoiries de la République de Côte d'Ivoire" className="h-16 w-16 object-contain" />
          <div>
            <p className="font-label-md text-label-md uppercase tracking-wider">République de Côte d'Ivoire</p>
            <p className="font-body-sm text-body-sm">Ministère du Portefeuille de l'État et des Entreprises Publiques</p>
            <p className="font-body-sm text-body-sm">Direction des Ressources Humaines · Sous-direction de la formation continue</p>
          </div>
        </header>
        <h2 className="mt-8 text-center font-headline-md text-headline-md font-bold uppercase tracking-wide">Attestation de formation</h2>
        <p className="mt-8 font-body-lg text-body-lg leading-relaxed">
          La sous-direction de la formation continue atteste que <strong>{agent.nom_complet}</strong>, matricule <strong>{agent.matricule}</strong>{" "}
          ({agent.organisme_sigle}), a suivi la formation <strong>« {formation.intitule} »</strong> du {dateLongue(formation.debut)} au {dateLongue(formation.fin)},
          pour un volume de {pluriel(formation.heures, "heure")}.
        </p>
        <p className="mt-4 font-body-lg text-body-lg">Organisme de formation : {formation.organisme}.</p>
        <p className="mt-4 font-body-lg text-body-lg">En foi de quoi la présente attestation lui est délivrée pour servir et valoir ce que de droit.</p>
        <footer className="mt-12 flex justify-between gap-6 font-body-md text-body-md">
          <span>{formation.certification}</span>
          <span className="text-right">
            Fait à Abidjan, le {dateLongue(new Date().toISOString())}
            <br />
            <strong>{moi.data?.nom_complet ?? ""}</strong>
            <br />
            {moi.data?.fonction ?? ""}
          </span>
        </footer>
      </article>
    </Modale>
  );
}
