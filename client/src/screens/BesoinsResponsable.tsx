import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../api/client";
import { dateCourte, nombre } from "../ui/format";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";
import { Modale } from "../ui/Modale";
import { SelectEmploi, useNomenclature } from "../ui/Nomenclature";
import { Pagination, usePagination } from "../ui/Pagination";
import { ArbreBesoins, LIBELLE_ETAT, TableauEmplois, type CampagneBesoins, type EmploiBesoins, type FicheBesoins, type NoeudBesoins, type TotauxBesoins } from "./gpec/besoinsCommun";

export type MesBesoins =
  | { responsable: false }
  | {
      responsable: true;
      structures: { id: number; nom: string; niveau_libelle: string }[];
      campagne: CampagneBesoins | null;
      fiches: FicheBesoins[];
      arbre: NoeudBesoins[];
      emplois: EmploiBesoins[];
      totaux: TotauxBesoins;
    };

const CLE = ["besoins-responsable"];
const CARTE = "bg-surface-container-lowest rounded-xl border border-hairline p-6";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary";
const LIBELLE = "block font-label-md text-label-md text-on-surface font-semibold mb-1";

/** Interroge l'espace du responsable : faux pour un agent qui ne dirige aucune structure. */
export function useMesBesoins(actif: boolean) {
  return useQuery({ queryKey: CLE, queryFn: () => api<MesBesoins>("/api/v1/besoins/mes-fiches/"), enabled: actif });
}

/** Onglet du profil d'un responsable de structure : il répond à l'appel et suit la remontée de ses structures. */
export function BesoinsResponsable() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const requete = useMesBesoins(true);
  const [edition, setEdition] = useState<FicheBesoins | "nouvelle" | null>(null);
  const donnees = requete.data;
  const fiches = donnees && donnees.responsable ? donnees.fiches : [];
  const page = usePagination(fiches, String(fiches.length));

  if (requete.isLoading) return <p className="text-on-surface-variant">Chargement…</p>;
  if (!donnees || !donnees.responsable) return <p className={`${CARTE} text-on-surface-variant`}>Cet espace est réservé aux responsables de structure.</p>;

  const campagne = donnees.campagne;
  const saisissable = Boolean(campagne && campagne.ouverte);
  const rattachees = donnees.arbre.some((n) => n.enfants.length > 0);
  const emploisRemontes = donnees.emplois;

  async function retirer(f: FicheBesoins) {
    if (!(await feedback.confirm(`Retirer le besoin « ${f.profil} » ?`, { confirmLabel: "Supprimer" }))) return;
    await feedback.run("Suppression…", async () => {
      await api(`/api/v1/besoins/fiches/${f.reference}/`, { method: "DELETE" });
      await client.invalidateQueries({ queryKey: CLE });
    }, { success: { title: "Besoin retiré" }, error: "La suppression n'a pas abouti." });
  }

  return (
    <div className="space-y-6">
      <section className={CARTE}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Expression des besoins{campagne ? ` ${campagne.exercice}` : ""}</h2>
            <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
              {donnees.structures.map((s) => `${s.nom} (${s.niveau_libelle})`).join(" · ")}
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              {LIBELLE_ETAT(campagne)}{campagne?.limite ? ` · réponse avant le ${dateCourte(campagne.limite)}` : ""}
            </p>
            {campagne?.cadrage ? <p className="mt-2 font-body-md text-body-md text-on-surface">{campagne.cadrage}</p> : null}
          </div>
          <button type="button" disabled={!saisissable} className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary font-label-md text-label-md disabled:opacity-50" onClick={() => setEdition("nouvelle")}>
            <Icone nom="add" className="text-lg" />
            Exprimer un besoin
          </button>
        </div>
      </section>

      <section className={CARTE}>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-4">Mes besoins</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body-sm text-body-sm">
            <thead>
              <tr className="border-b border-hairline text-on-surface-variant font-label-sm">
                <th className="py-2 pr-4 font-medium">Structure</th>
                <th className="py-2 pr-4 font-medium">Emploi demandé</th>
                <th className="py-2 pr-4 font-medium text-right">Fonctionnaires</th>
                <th className="py-2 pr-4 font-medium text-right">Contractuels</th>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fiches.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-on-surface-variant">{campagne ? "Vous n'avez pas encore exprimé de besoin." : "Aucun appel n'a été lancé."}</td></tr>
              ) : page.visibles.map((f) => (
                <tr key={f.reference} className="border-b border-hairline text-on-surface align-top">
                  <td className="py-3 pr-4">{f.entite.nom}</td>
                  <td className="py-3 pr-4"><span className="block font-semibold">{f.emploi.libelle}{f.grade ? ` · ${f.grade}` : ""}</span>{f.motif ? <span className="block text-on-surface-variant">{f.motif}</span> : null}</td>
                  <td className="py-3 pr-4 text-right">{nombre(f.fonctionnaires)}</td>
                  <td className="py-3 pr-4 text-right">{nombre(f.contractuels)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{dateCourte(f.depose_le)}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <button type="button" disabled={!saisissable} aria-label={`Modifier ${f.profil}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-40" onClick={() => setEdition(f)}><Icone nom="edit" className="text-lg" /></button>
                    <button type="button" disabled={!saisissable} aria-label={`Supprimer ${f.profil}`} className="p-1.5 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container disabled:opacity-40" onClick={() => void retirer(f)}><Icone nom="delete" className="text-lg" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="besoin" />
      </section>

      <section className={CARTE}>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-4">{rattachees ? "Besoins par emploi, avec les structures rattachées" : "Besoins par emploi"}</h3>
        <TableauEmplois emplois={emploisRemontes} />
      </section>

      {rattachees ? (
        <section className={CARTE}>
          <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Remontée des structures rattachées</h3>
          <p className="mt-1 mb-4 font-body-sm text-body-sm text-on-surface-variant">
            {nombre(donnees.totaux.fonctionnaires)} fonctionnaires et {nombre(donnees.totaux.contractuels)} contractuels demandés au total par votre structure et celles qui lui sont rattachées.
          </p>
          <ArbreBesoins arbre={donnees.arbre} />
        </section>
      ) : null}

      {edition ? <FormulaireBesoin structures={donnees.structures} fiche={edition === "nouvelle" ? null : edition} onClose={() => setEdition(null)} /> : null}
    </div>
  );
}

export function FormulaireBesoin({ structures, fiche, onClose, invalider = CLE }: { structures: { id: number; nom: string }[]; fiche: FicheBesoins | null; onClose: () => void; invalider?: string[] }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const nomenclature = useNomenclature();
  const [saisie, setSaisie] = useState({
    structure: String(fiche?.entite.id ?? structures[0]?.id ?? ""),
    emploi: fiche?.emploi.code ?? "",
    grade: fiche?.grade ?? "",
    fonctionnaires: String(fiche?.fonctionnaires ?? 0),
    contractuels: String(fiche?.contractuels ?? 0),
    motif: fiche?.motif ?? "",
  });
  const envoi = useMutation({
    mutationFn: () => api(fiche ? `/api/v1/besoins/fiches/${fiche.reference}/` : "/api/v1/besoins/fiches/", {
      method: fiche ? "PATCH" : "POST",
      body: JSON.stringify({ ...saisie, structure: Number(saisie.structure), fonctionnaires: Number(saisie.fonctionnaires), contractuels: Number(saisie.contractuels) }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: invalider });
      feedback.toast(fiche ? "Besoin mis à jour" : "Besoin enregistré");
      onClose();
    },
  });
  const emplois = nomenclature.data?.emplois ?? [];
  const emploiChoisi = emplois.find((e) => e.code === saisie.emploi);
  const nombreChamp = (cle: "fonctionnaires" | "contractuels") => (e: { target: { value: string } }) => setSaisie({ ...saisie, [cle]: e.target.value });
  return (
    <Modale titre={fiche ? "Modifier le besoin" : "Exprimer un besoin"} sousTitre="Fonctionnaires et contractuels dont la structure a besoin." icone="post_add" taille="lg" onClose={onClose} onSubmit={() => envoi.mutate()} enCours={envoi.isPending} erreur={envoi.error instanceof ApiError ? envoi.error.message : envoi.error ? "Le besoin n'a pas été enregistré." : undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {structures.length > 1 && !fiche ? (
          <label className="block md:col-span-2">
            <span className={LIBELLE}>Structure <span className="text-error">*</span></span>
            <select className={CHAMP} required value={saisie.structure} onChange={(e) => setSaisie({ ...saisie, structure: e.target.value })}>
              {structures.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className={LIBELLE}>Emploi demandé <span className="text-error">*</span></span>
          <SelectEmploi className={CHAMP} required valeur={emploiChoisi?.libelle ?? ""} emplois={emplois} onChange={(libelle, grade) => setSaisie({ ...saisie, emploi: emplois.find((e) => e.libelle === libelle)?.code ?? "", grade: grade || saisie.grade })} />
        </label>
        <label className="block">
          <span className={LIBELLE}>Grade de l'emploi</span>
          <input className={`${CHAMP} bg-surface-container-low`} readOnly value={emploiChoisi?.grade ?? saisie.grade} aria-label="Grade de l'emploi" />
        </label>
        <label className="block"><span className={LIBELLE}>Fonctionnaires</span><input className={CHAMP} type="number" min={0} max={500} value={saisie.fonctionnaires} onChange={nombreChamp("fonctionnaires")} /></label>
        <label className="block"><span className={LIBELLE}>Contractuels</span><input className={CHAMP} type="number" min={0} max={500} value={saisie.contractuels} onChange={nombreChamp("contractuels")} /></label>
        <label className="block md:col-span-2"><span className={LIBELLE}>Motif</span><input className={CHAMP} maxLength={240} value={saisie.motif} onChange={(e) => setSaisie({ ...saisie, motif: e.target.value })} placeholder="Départs en retraite, nouvelle mission…" /></label>
      </div>
    </Modale>
  );
}
