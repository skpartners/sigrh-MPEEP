import { useState } from "react";
import { dateCourte, nombre, pluriel } from "../../ui/format";
import { Pagination, usePagination } from "../../ui/Pagination";
import { useFlip } from "../../ui/Motion";
import { useAction } from "../../ui/useAction";
import type { Besoin, TableauFormation } from "./types";
import { BOUTON_ICONE, BOUTON_PRIMAIRE, Badge, CARTE, CHAMP, EnTeteSection, Liste, Modale, Nombre, Texte, Vide, messageErreur, useEnregistrement } from "./ui";

const PRIORITES = [
  { valeur: "haute", libelle: "Haute" },
  { valeur: "moyenne", libelle: "Moyenne" },
  { valeur: "basse", libelle: "Basse" },
];
const STATUTS = [
  { valeur: "exprime", libelle: "Exprimé" },
  { valeur: "retenu", libelle: "Retenu au plan" },
  { valeur: "couvert", libelle: "Couvert par une session" },
];
const TON_PRIORITE = { haute: "bg-error-container text-on-error-container", moyenne: "bg-secondary-fixed text-on-secondary-fixed", basse: "bg-surface-container text-on-surface-variant" };
const TON_STATUT = { exprime: "bg-surface-container-high text-on-surface", retenu: "bg-secondary-fixed text-on-secondary-fixed", couvert: "bg-primary-fixed text-on-primary-fixed" };

/** Besoins exprimés par les structures, à couvrir par les modules du plan. */
export function Besoins({ data }: { data: TableauFormation }) {
  const [edition, setEdition] = useState<Besoin | "nouveau" | null>(null);
  const [statut, setStatut] = useState("");
  const [type, setType] = useState("");
  const { agir } = useAction();
  const lignes = data.besoins.filter((b) => (!statut || b.statut === statut) && (!type || b.type === type));
  const pageBesoins = usePagination(lignes, `${statut}|${type}`);
  const corps = useFlip<HTMLTableSectionElement>(`${statut}|${type}|${data.besoins.length}`);
  const effectif = data.besoins.reduce((s, b) => s + b.effectif, 0);
  const couverts = data.besoins.filter((b) => b.statut === "couvert").reduce((s, b) => s + b.effectif, 0);

  function supprimer(b: Besoin) {
    void agir({
      confirmation: `Supprimer le besoin « ${b.intitule} » (${b.organisme.nom}) ?`,
      confirmLabel: "Supprimer",
      attente: "Suppression du besoin…",
      route: `/api/v1/formation/besoins/${b.id}/`,
      methode: "DELETE",
      succes: "Besoin supprimé",
    });
  }

  return (
    <section aria-labelledby="titre-besoins">
      <EnTeteSection
        icone="analytics"
        titre={`Besoins recensés ${data.exercice}`}
        sousTitre={`${pluriel(data.besoins.length, "besoin")} · ${pluriel(effectif, "agent")} concernés · ${effectif ? Math.round((100 * couverts) / effectif) : 0} % déjà couverts par une session`}
        action={
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setEdition("nouveau")}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
            Enregistrer un besoin
          </button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 sm:max-w-2xl">
        <label>
          <span className="sr-only">Statut</span>
          <select className={CHAMP} value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Cycle</span>
          <select className={CHAMP} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les cycles</option>
            {data.types.map((t) => <option key={t.code} value={t.code}>{t.libelle}</option>)}
          </select>
        </label>
      </div>
      {lignes.length === 0 ? (
        <Vide icone="analytics" titre="Aucun besoin" texte={data.besoins.length ? "Aucun besoin ne correspond à ces filtres." : "Enregistrez les besoins exprimés par les structures pour bâtir le plan."} />
      ) : (
        <div className={`${CARTE} overflow-x-auto`}>
          <table className="w-full min-w-[44rem] text-left font-body-sm text-body-sm">
            <thead className="bg-surface-container-low font-label-md text-label-md text-on-surface-variant">
              <tr>
                <th className="py-3 px-4">Besoin</th>
                <th className="py-3 px-4">Structure</th>
                <th className="py-3 px-4 text-right">Agents</th>
                <th className="py-3 px-4">Priorité</th>
                <th className="py-3 px-4" data-min="">Statut</th>
                <th className="py-3 px-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody ref={corps}>
              {pageBesoins.visibles.map((b) => (
                <tr key={b.id} data-flip={b.id} className="motion-content border-t border-hairline align-top">
                  <td className="py-3 px-4">
                    <span className="block font-label-lg text-label-lg text-on-surface">{b.intitule}</span>
                    <span className="block text-on-surface-variant">{b.type_libelle} · exprimé le {dateCourte(b.exprime_le)}</span>
                  </td>
                  <td className="py-3 px-4 text-on-surface">{b.organisme.nom}</td>
                  <td className="py-3 px-4 text-right font-code-num text-code-num">{nombre(b.effectif)}</td>
                  <td className="py-3 px-4"><Badge ton={TON_PRIORITE[b.priorite]}>{b.priorite_libelle}</Badge></td>
                  <td className="py-3 px-4">
                    <Badge ton={TON_STATUT[b.statut]}>{b.statut_libelle}</Badge>
                    {b.session ? <span className="block mt-1 text-on-surface-variant">par « {b.session.libelle} »</span> : null}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end">
                      <button type="button" className={BOUTON_ICONE} onClick={() => setEdition(b)} aria-label={`Modifier ${b.intitule}`} title="Modifier">
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
                      </button>
                      <button type="button" className={BOUTON_ICONE} onClick={() => supprimer(b)} aria-label={`Supprimer ${b.intitule}`} title="Supprimer">
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pageBesoins.page} pages={pageBesoins.pages} total={pageBesoins.total} aller={pageBesoins.aller} libelle="besoin" />
        </div>
      )}
      {edition ? <FormulaireBesoin data={data} besoin={edition === "nouveau" ? null : edition} onClose={() => setEdition(null)} /> : null}
    </section>
  );
}

function FormulaireBesoin({ data, besoin: b, onClose }: { data: TableauFormation; besoin: Besoin | null; onClose: () => void }) {
  const [f, setF] = useState({
    organisme: b?.organisme.code ?? data.organismes[0]?.code ?? "",
    type: b?.type ?? data.types[0]?.code ?? "",
    intitule: b?.intitule ?? "",
    effectif: String(b?.effectif ?? ""),
    priorite: b?.priorite ?? "moyenne",
    statut: b?.statut ?? "exprime",
  });
  const enregistrer = useEnregistrement(onClose, b ? "Besoin mis à jour" : "Besoin enregistré");
  const maj = (cle: keyof typeof f) => (valeur: string) => setF((a) => ({ ...a, [cle]: valeur }));
  // « Couvert » se décide en planifiant un module ; ici on ne peut que le conserver ou le défaire.
  const statuts = STATUTS.filter((s) => s.valeur !== "couvert" || b?.statut === "couvert");

  return (
    <Modale
      titre={b ? "Modifier le besoin" : "Enregistrer un besoin"}
      sousTitre={`Recensement ${data.exercice}`}
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: b ? `/api/v1/formation/besoins/${b.id}/` : "/api/v1/formation/besoins/", methode: b ? "PATCH" : "POST", corps: f })}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        <Texte libelle="Besoin exprimé" obligatoire max={200} valeur={f.intitule} onChange={maj("intitule")} placeholder="Ex. Pilotage par les indicateurs de performance" className="sm:col-span-2" />
        <Liste libelle="Structure" obligatoire valeur={f.organisme} onChange={maj("organisme")} options={data.organismes.map((o) => ({ valeur: o.code, libelle: o.nom }))} />
        <Liste libelle="Cycle de formation" obligatoire valeur={f.type} onChange={maj("type")} options={data.types.map((t) => ({ valeur: t.code, libelle: t.libelle }))} />
        <Nombre libelle="Agents concernés" obligatoire min={1} max={5000} valeur={f.effectif} onChange={maj("effectif")} unite="agents" />
        <Liste libelle="Priorité" obligatoire valeur={f.priorite} onChange={maj("priorite")} options={PRIORITES} />
        <Liste libelle="Statut" obligatoire valeur={f.statut} onChange={maj("statut")} options={statuts} className="sm:col-span-2" />
      </div>
      <p className="mt-4 font-label-sm text-label-sm text-on-surface-variant">Un besoin passe à « Couvert » quand vous le rattachez à un module, depuis le formulaire de planification.</p>
    </Modale>
  );
}
