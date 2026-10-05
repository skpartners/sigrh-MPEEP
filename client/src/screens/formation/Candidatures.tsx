import { useState } from "react";
import { Link } from "react-router-dom";
import { dateCourte, pluriel } from "../../ui/format";
import { useFlip } from "../../ui/Motion";
import { useAction } from "../../ui/useAction";
import type { Candidature, EtatCandidature, TableauFormation } from "./types";
import { BadgeCandidature, CARTE, CHAMP, EnTeteSection, Modale, Vide, Zone, messageErreur, useEnregistrement } from "./ui";
import { Icone } from "../../ui/Icone";

const PAR_PAGE = 10;
const FILTRES: { valeur: EtatCandidature | ""; libelle: string }[] = [
  { valeur: "controle_sd", libelle: "À contrôler (SD)" },
  { valeur: "visa_drh", libelle: "Au visa DRH" },
  { valeur: "avis_hierarchique", libelle: "Chez le chef de service" },
  { valeur: "retenue", libelle: "Retenues" },
  { valeur: "refusee", libelle: "Refusées" },
  { valeur: "", libelle: "Toutes" },
];
const VALIDER: Partial<Record<EtatCandidature, { libelle: string; q: string; s: string }>> = {
  avis_hierarchique: { libelle: "Avis favorable", q: "Enregistrer l'avis favorable du chef de service", s: "Avis du chef de service enregistré" },
  controle_sd: { libelle: "Transmettre au DRH", q: "Valider le contrôle de la SD et transmettre au visa du DRH", s: "Candidature transmise au DRH" },
  visa_drh: { libelle: "Viser (DRH)", q: "Apposer le visa du DRH ; l'agent sera notifié de sa prise en compte", s: "Candidature retenue, agent notifié" },
};

/** Arbitrage des candidatures de tous les modules, dans l'ordre du circuit de validation. */
export function Candidatures({ data }: { data: TableauFormation }) {
  const [filtre, setFiltre] = useState<string>("controle_sd");
  const [session, setSession] = useState("");
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(0);
  const [refus, setRefus] = useState<Candidature | null>(null);
  const { agir } = useAction();

  const compte = (etat: string) => data.inscriptions.filter((i) => !etat || i.etat === etat).length;
  const q = recherche.trim().toLowerCase();
  const lignes = data.inscriptions.filter(
    (i) =>
      (!filtre || i.etat === filtre) &&
      (!session || i.session.code === session) &&
      (!q || `${i.agent.nom_complet} ${i.agent.matricule} ${i.reference} ${i.agent.organisme}`.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const courante = Math.min(page, pages - 1);
  const visibles = lignes.slice(courante * PAR_PAGE, courante * PAR_PAGE + PAR_PAGE);
  const corps = useFlip<HTMLTableSectionElement>(`${filtre}|${session}|${q}|${courante}|${data.inscriptions.length}`);
  const sessionsFigees = new Set(data.sessions.filter((s) => s.etat === "annulee" || s.etat === "terminee").map((s) => s.code));

  function valider(c: Candidature) {
    const v = VALIDER[c.etat];
    if (!v) return;
    void agir({ confirmation: `${v.q} ? (${c.agent.nom_complet})`, confirmLabel: v.libelle, attente: "Enregistrement…", route: `/api/v1/demandes/${c.reference}/valider/`, succes: v.s, detail: `${c.agent.nom_complet} · ${c.session.libelle}` });
  }

  return (
    <section aria-labelledby="titre-candidatures">
      <EnTeteSection icone="fact_check" titre="Candidatures" sousTitre="Circuit : agent → chef de service → SD Formation Continue → visa DRH → notification" />
      <div className="flex flex-wrap gap-1 p-1 mb-4 rounded-lg bg-surface-container-low w-fit" role="group" aria-label="Étape du circuit">
        {FILTRES.map((f) => (
          <button
            key={f.valeur}
            type="button"
            aria-pressed={filtre === f.valeur}
            onClick={() => { setFiltre(f.valeur); setPage(0); }}
            className={`px-3 py-1.5 rounded font-label-md text-label-md ${filtre === f.valeur ? "bg-surface-container-lowest text-primary font-bold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
          >
            {f.libelle} <span className="font-code-num">({compte(f.valeur)})</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-4">
        <label className="sm:col-span-7">
          <span className="sr-only">Rechercher une candidature</span>
          <input type="search" className={CHAMP} placeholder="Agent, matricule, référence, structure…" value={recherche} onChange={(e) => { setRecherche(e.target.value); setPage(0); }} />
        </label>
        <label className="sm:col-span-5">
          <span className="sr-only">Module</span>
          <select className={CHAMP} value={session} onChange={(e) => { setSession(e.target.value); setPage(0); }}>
            <option value="">Tous les modules</option>
            {data.sessions.map((s) => <option key={s.code} value={s.code}>{s.libelle}</option>)}
          </select>
        </label>
      </div>

      {lignes.length === 0 ? (
        <Vide icone="inbox" titre="Aucune candidature" texte={filtre === "controle_sd" ? "Aucune candidature n'attend le contrôle de la sous-direction. Tout est à jour." : "Aucune candidature ne correspond à ces critères."} />
      ) : (
        <div className={`${CARTE} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant">
                <tr>
                  <th className="py-3 px-4">Agent</th>
                  <th className="py-3 px-4">Module demandé</th>
                  <th className="py-3 px-4">Déposée le</th>
                  <th className="py-3 px-4" data-min="">Étape</th>
                  <th className="py-3 px-4 text-right">Décision</th>
                </tr>
              </thead>
              <tbody ref={corps}>
                {visibles.map((c) => {
                  const fige = sessionsFigees.has(c.session.code);
                  return (
                    <tr key={c.id} data-flip={c.id} className="motion-content border-t border-hairline align-top hover:bg-surface-container-low/50">
                      <td className="py-3 px-4">
                        <Link to={`/app/dossiers/${encodeURIComponent(c.agent.matricule)}?onglet=formation`} className="flex items-center gap-3 rounded group">
                          <span className="w-9 h-9 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-label-md text-label-md font-bold shrink-0" aria-hidden="true">{c.agent.initiales}</span>
                          <span>
                            <span className="block font-label-lg text-label-lg text-on-surface group-hover:text-primary group-hover:underline">{c.agent.nom_complet}</span>
                            <span className="block text-on-surface-variant">{c.agent.matricule} · {c.agent.organisme}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-on-surface">
                        {c.session.libelle}
                        <span className="block text-on-surface-variant font-code-num">{c.reference}{c.piece ? " · pièce jointe" : ""}</span>
                      </td>
                      <td className="py-3 px-4 text-on-surface-variant whitespace-nowrap">{dateCourte(c.deposee_le)}</td>
                      <td className="py-3 px-4"><BadgeCandidature etat={c.etat} libelle={c.etat_libelle} /></td>
                      <td className="py-3 px-4">
                        {VALIDER[c.etat] && !fige ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" className="h-8 px-3 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container" onClick={() => valider(c)}>{VALIDER[c.etat]?.libelle}</button>
                            <button type="button" className="h-8 px-3 rounded border border-outline-variant font-label-md text-label-md hover:bg-error-container/40" onClick={() => setRefus(c)}>Refuser</button>
                          </div>
                        ) : (
                          <p className="text-right text-on-surface-variant">{c.etat === "refusee" ? c.etape.replace(/^Rejetée : /, "Refusée par la ") : c.etat === "retenue" ? "Agent notifié" : "Module clos"}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-hairline bg-surface-container-low/40 font-body-sm text-body-sm text-on-surface-variant" aria-label="Pagination des candidatures">
            <span>{pluriel(lignes.length, "candidature")}</span>
            <span className="flex items-center gap-1">
              <button type="button" className="p-1 rounded hover:bg-surface-container disabled:opacity-40" disabled={courante === 0} onClick={() => setPage(courante - 1)} aria-label="Page précédente">
                <Icone nom="chevron_left" className="text-lg" />
              </button>
              <span className="px-2">Page {courante + 1} / {pages}</span>
              <button type="button" className="p-1 rounded hover:bg-surface-container disabled:opacity-40" disabled={courante >= pages - 1} onClick={() => setPage(courante + 1)} aria-label="Page suivante">
                <Icone nom="chevron_right" className="text-lg" />
              </button>
            </span>
          </nav>
        </div>
      )}
      {refus ? <RefusCandidature candidature={refus} onClose={() => setRefus(null)} /> : null}
    </section>
  );
}

export function RefusCandidature({ candidature, onClose }: { candidature: Candidature; onClose: () => void }) {
  const [motif, setMotif] = useState("");
  const enregistrer = useEnregistrement<Candidature>(onClose, "Candidature refusée");
  return (
    <Modale
      titre="Refuser la candidature"
      sousTitre={`${candidature.agent.nom_complet} · ${candidature.session.libelle}`}
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: `/api/v1/formation/inscriptions/${candidature.id}/refuser/`, methode: "POST", corps: { motif } })}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
      libelleValider="Refuser"
      largeur="max-w-lg"
    >
      <Zone libelle="Motif du refus" obligatoire max={240} valeur={motif} onChange={setMotif} aide="L'agent est notifié de ce motif." />
    </Modale>
  );
}
