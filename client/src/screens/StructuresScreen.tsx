import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api } from "../api/client";
import type { EntiteTutelle } from "../api/types";
import { rangerStructures } from "../ui/Entites";
import { useNomenclature, type EmploiNomenclature, type GradeNomenclature, type Nomenclature } from "../ui/Nomenclature";
import { Modale } from "../ui/Modale";
import { useAction } from "../ui/useAction";
import { useFeedback } from "../ui/Feedback";
import { Pagination, usePagination } from "../ui/Pagination";
import { ActionsImport } from "./ImportAgents";
import { AppChrome } from "./AppChrome";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex-1 space-y-6";
const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const PRIMAIRE = "inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-container font-label-lg text-label-lg";

type Pole = { code: string; nom: string; libelle: string };
type Annuaire = { structures: EntiteTutelle[]; poles: Pole[] };

const VIDE = { nom: "", pole: "", niveau: "direction-centrale", parent: "" };

const TEINTE_NIVEAU: Record<string, { pastille: string; puce: string }> = {
  "direction-generale": { pastille: "bg-primary text-on-primary", puce: "bg-primary" },
  "direction-centrale": { pastille: "bg-primary-fixed text-on-primary-fixed", puce: "bg-primary-container" },
  "sous-direction": { pastille: "bg-tertiary-fixed text-on-tertiary-fixed", puce: "bg-tertiary-container" },
  service: { pastille: "bg-secondary-fixed text-on-secondary-fixed", puce: "bg-secondary" },
};

function teinteNiveau(niveau?: string) {
  return TEINTE_NIVEAU[niveau || ""] ?? { pastille: "bg-surface-container-high text-on-surface", puce: "bg-outline" };
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "L'enregistrement n'a pas abouti.";
}

export function StructuresScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const { agir } = useAction();
  const annuaire = useQuery({ queryKey: ["structures"], queryFn: () => api<Annuaire>("/api/v1/structures/") });
  const [pole, setPole] = useState("");
  const [formulaire, setFormulaire] = useState<typeof VIDE | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [formulairePole, setFormulairePole] = useState<{ nom: string } | null>(null);
  const [editionPole, setEditionPole] = useState<string | null>(null);
  const [volet, setVolet] = useState<"structures" | "grades" | "emplois">("structures");

  const data = annuaire.data;
  const visibles = useMemo(() => {
    const filtre = (data?.structures ?? []).filter((item) => !pole || item.pole === pole);
    return rangerStructures(filtre);
  }, [data, pole]);
  const pagePoles = usePagination(data?.poles ?? [], String(data?.poles.length ?? 0));
  const pageStructures = usePagination(visibles, pole);

  const enregistrer = useMutation({
    mutationFn: () => {
      if (!formulaire) return Promise.reject(new Error("Formulaire vide"));
      const corps = JSON.stringify({
        nom: formulaire.nom.trim(),
        pole: formulaire.pole,
        niveau: formulaire.niveau,
        parent: formulaire.niveau === "direction-generale" ? "" : formulaire.parent,
      });
      if (edition) {
        return api<EntiteTutelle>(`/api/v1/structures/${encodeURIComponent(edition)}/`, { method: "PATCH", body: corps });
      }
      return api<EntiteTutelle>("/api/v1/structures/", { method: "POST", body: corps });
    },
    onSuccess: async (structure) => {
      await client.invalidateQueries({ queryKey: ["structures"] });
      await client.invalidateQueries({ queryKey: ["utilisateurs"] });
      await client.invalidateQueries({ queryKey: ["dotation"] });
      await client.invalidateQueries({ queryKey: ["besoins"] });
      feedback.toast(edition ? "Structure mise à jour" : "Structure ajoutée", structure.nom);
      setFormulaire(null);
      setEdition(null);
    },
  });

  const enregistrerPole = useMutation({
    mutationFn: () => {
      if (!formulairePole) return Promise.reject(new Error("Formulaire vide"));
      const corps = JSON.stringify({ nom: formulairePole.nom.trim() });
      if (editionPole) {
        return api<Pole>(`/api/v1/poles/${encodeURIComponent(editionPole)}/`, { method: "PATCH", body: corps });
      }
      return api<Pole>("/api/v1/poles/", { method: "POST", body: corps });
    },
    onSuccess: async (cree) => {
      await client.invalidateQueries({ queryKey: ["structures"] });
      await client.invalidateQueries({ queryKey: ["utilisateurs"] });
      await client.invalidateQueries({ queryKey: ["dotation"] });
      await client.invalidateQueries({ queryKey: ["besoins"] });
      feedback.toast(editionPole ? "Pôle mis à jour" : "Pôle ajouté", cree.nom);
      setFormulairePole(null);
      setEditionPole(null);
    },
  });

  function ouvrirCreation() {
    setEdition(null);
    setFormulairePole(null);
    setEditionPole(null);
    setFormulaire({ ...VIDE, pole: data?.poles[0]?.code ?? "" });
    enregistrer.reset();
  }

  function ouvrirPole(item?: Pole) {
    setFormulaire(null);
    setEdition(null);
    setEditionPole(item?.code ?? null);
    setFormulairePole({ nom: item?.libelle || item?.nom || "" });
    enregistrerPole.reset();
  }

  function ouvrirEdition(item: EntiteTutelle) {
    setEdition(item.code);
    setFormulaire({ nom: item.nom, pole: item.pole, niveau: item.niveau || "direction-centrale", parent: item.parent || "" });
    enregistrer.reset();
  }

  function fermer() {
    if (!enregistrer.isPending) {
      setFormulaire(null);
      setEdition(null);
    }
  }

  function supprimerPole(item: Pole) {
    void agir({
      confirmation: `Supprimer le pôle « ${item.libelle || item.nom} » ?`,
      confirmLabel: "Supprimer",
      attente: "Suppression du pôle…",
      route: `/api/v1/poles/${encodeURIComponent(item.code)}/`,
      methode: "DELETE",
      succes: "Pôle supprimé",
    });
  }

  function supprimer(item: EntiteTutelle) {
    void agir({
      confirmation: `Supprimer la structure « ${item.nom} » ?`,
      confirmLabel: "Supprimer",
      attente: "Suppression de la structure…",
      route: `/api/v1/structures/${encodeURIComponent(item.code)}/`,
      methode: "DELETE",
      succes: "Structure supprimée",
    });
  }

  if (annuaire.isLoading) {
    return <AppChrome><p className={`${PAGE} text-on-surface-variant`}>Chargement des structures…</p></AppChrome>;
  }
  if (!data) {
    return <AppChrome><p className={`${PAGE} text-error`}>Les structures n'ont pas pu être chargées.</p></AppChrome>;
  }

  return (
    <AppChrome>
      <div className={PAGE}>
        <section className={`${CARTE} p-6`}>
          <p className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            <span>Gouvernance</span>
            <span className="material-symbols-outlined text-xs" aria-hidden="true">chevron_right</span>
            <span className="font-bold text-primary">Structures du ministère</span>
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Structures du ministère</h1>
              <p className="mt-2 max-w-3xl font-body-md text-body-md text-on-surface-variant">
                {data.poles.length} pôle{data.poles.length > 1 ? "s" : ""}, {data.structures.length} structure{data.structures.length > 1 ? "s" : ""}. Les grades et les emplois de cette page alimentent les dossiers et les besoins.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 self-end sm:w-fit">
              <ActionsImport
                classe="grid grid-cols-1 gap-2 sm:grid-cols-2 [&>button]:w-full [&>button]:justify-center"
                modeleUrl="/api/v1/structures/import/modele/"
                modeleNom="modele-structures.xlsx"
                importUrl="/api/v1/structures/import/"
                titre="Importer le référentiel"
                sousTitre="Une ligne crée ou met à jour un pôle, une structure, un grade ou un emploi."
                aide="Le modèle a une feuille par liste : Pôles, Structures, Grades et Emplois. Le niveau et le rattachement placent la structure dans la hiérarchie. Une cellule vide, sur une ligne déjà connue, conserve la valeur enregistrée."
                toastTitre="Référentiel mis à jour"
                invalidations={[["structures"], ["nomenclature"], ["utilisateurs"], ["dotation"], ["besoins"]]}
              />
              {volet === "structures" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" className={`${PRIMAIRE} w-full justify-center`} onClick={() => ouvrirPole()}>
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
                    Ajouter un pôle
                  </button>
                  <button type="button" className={`${PRIMAIRE} w-full justify-center`} onClick={ouvrirCreation}>
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
                    Ajouter une structure
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Référentiel du ministère">
            {([
              ["structures", "Structures"],
              ["grades", "Grades"],
              ["emplois", "Emplois"],
            ] as const).map(([code, libelle]) => (
              <button
                key={code}
                type="button"
                role="tab"
                aria-selected={volet === code}
                className={`px-4 py-2 rounded font-label-md text-label-md ${volet === code ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface hover:bg-surface-container"}`}
                onClick={() => setVolet(code)}
              >
                {libelle}
              </button>
            ))}
          </div>
        </section>

        {volet === "grades" && <VoletGrades />}
        {volet === "emplois" && <VoletEmplois />}
        {volet === "structures" && (
        <>

        <section className={`${CARTE} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Pôle</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.poles.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Aucun pôle. Ajoutez-en un avant de créer une structure.</td>
                  </tr>
                ) : pagePoles.visibles.map((item) => (
                  <tr key={item.code} className="border-t border-hairline">
                    <td className="px-4 py-3 font-body-md text-body-md text-on-surface">{item.libelle || item.nom}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => ouvrirPole(item)}>Modifier</button>
                      <button type="button" className="ml-3 font-label-md text-label-md text-error hover:underline" onClick={() => supprimerPole(item)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagePoles.page} pages={pagePoles.pages} total={pagePoles.total} aller={pagePoles.aller} libelle="pôle" />
        </section>

        <section className={`${CARTE} overflow-hidden`}>
          <div className="p-4">
            <select className={`${CHAMP} max-w-sm`} value={pole} aria-label="Filtrer par pôle" onChange={(event) => setPole(event.target.value)}>
              <option value="">Tous les pôles</option>
              {data.poles.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Structure</th>
                  <th className="px-4 py-3">Niveau</th>
                  <th className="px-4 py-3">Rattachement</th>
                  <th className="px-4 py-3">Pôle</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Aucune structure ne correspond à ce pôle.</td>
                  </tr>
                ) : pageStructures.visibles.map(({ item, profondeur }) => {
                  const teinte = teinteNiveau(item.niveau);
                  return (
                  <tr key={item.code} className="border-t border-hairline">
                    <td className="px-4 py-3 font-body-md text-body-md text-on-surface" style={{ paddingLeft: `${16 + profondeur * 20}px` }}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${teinte.puce}`} aria-hidden="true" />
                        {item.nom}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 font-label-sm text-label-sm ${teinte.pastille}`}>{item.niveau_libelle || "Direction centrale"}</span>
                    </td>
                    <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">{item.parent_nom || "—"}</td>
                    <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">{item.pole_libelle}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => ouvrirEdition(item)}>Modifier</button>
                      <button type="button" className="ml-3 font-label-md text-label-md text-error hover:underline" onClick={() => supprimer(item)}>Supprimer</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={pageStructures.page} pages={pageStructures.pages} total={pageStructures.total} aller={pageStructures.aller} libelle="structure" />
        </section>
        </>
        )}
      </div>

      {formulaire ? (
        <Modale
          titre={edition ? "Modifier la structure" : "Ajouter une structure"}
          sousTitre="Direction générale, direction centrale, sous-direction ou service."
          icone="account_tree"
          onClose={fermer}
          onSubmit={() => enregistrer.mutate()}
          enCours={enregistrer.isPending}
          erreur={enregistrer.isError ? message(enregistrer.error) : undefined}
          libelleValider={edition ? "Enregistrer" : "Ajouter"}
        >
          <div className="grid gap-4">
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
              <input className={CHAMP} required value={formulaire.nom} onChange={(event) => setFormulaire({ ...formulaire, nom: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Pôle</span>
              <select
                className={CHAMP}
                required
                value={formulaire.pole}
                onChange={(event) => setFormulaire({ ...formulaire, pole: event.target.value, parent: "" })}
              >
                {data.poles.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Niveau</span>
              <select
                className={CHAMP}
                required
                value={formulaire.niveau}
                onChange={(event) => setFormulaire({
                  ...formulaire,
                  niveau: event.target.value,
                  parent: event.target.value === "direction-generale" ? "" : formulaire.parent,
                })}
              >
                <option value="direction-generale">Direction générale</option>
                <option value="direction-centrale">Direction centrale</option>
                <option value="sous-direction">Sous-direction</option>
                <option value="service">Service</option>
              </select>
            </label>
            {formulaire.niveau !== "direction-generale" ? (
              <label className="block space-y-1">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Rattachement</span>
                <select
                  className={CHAMP}
                  value={formulaire.parent}
                  onChange={(event) => setFormulaire({ ...formulaire, parent: event.target.value })}
                >
                  <option value="">Aucun</option>
                  {data.structures
                    .filter((item) => item.pole === formulaire.pole && item.code !== edition && (
                      formulaire.niveau === "direction-centrale" ? item.niveau === "direction-generale"
                        : formulaire.niveau === "sous-direction" ? item.niveau === "direction-centrale"
                          : item.niveau === "sous-direction" || item.niveau === "direction-centrale"
                    ))
                    .map((item) => <option key={item.code} value={item.code}>{item.nom}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </Modale>
      ) : null}

      {formulairePole ? (
        <Modale
          titre={editionPole ? "Modifier le pôle" : "Ajouter un pôle"}
          sousTitre="Regroupe les directions générales du ministère."
          icone="account_tree"
          onClose={() => { if (!enregistrerPole.isPending) { setFormulairePole(null); setEditionPole(null); } }}
          onSubmit={() => enregistrerPole.mutate()}
          enCours={enregistrerPole.isPending}
          erreur={enregistrerPole.isError ? message(enregistrerPole.error) : undefined}
          libelleValider={editionPole ? "Enregistrer" : "Ajouter"}
        >
          <label className="block space-y-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
            <input className={CHAMP} required value={formulairePole.nom} onChange={(event) => setFormulairePole({ nom: event.target.value })} />
          </label>
        </Modale>
      ) : null}
    </AppChrome>
  );
}

const TAILLE = 8;

function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function VoletGrades() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const { agir } = useAction();
  const page = useNomenclature();
  const [categorie, setCategorie] = useState("");
  const [edition, setEdition] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<{ code: string; categorie: string; libelle: string; en_vigueur: boolean } | null>(null);
  const enregistrer = useMutation({
    mutationFn: () => {
      if (!formulaire) return Promise.reject(new Error("Formulaire vide"));
      const corps = JSON.stringify({
        code: formulaire.code.trim(),
        categorie: formulaire.categorie,
        libelle: formulaire.libelle.trim(),
        en_vigueur: formulaire.en_vigueur,
      });
      if (edition) return api<GradeNomenclature>(`/api/v1/grades/${encodeURIComponent(edition)}/`, { method: "PATCH", body: corps });
      return api<GradeNomenclature>("/api/v1/grades/", { method: "POST", body: corps });
    },
    onSuccess: async (grade) => {
      await client.invalidateQueries({ queryKey: ["nomenclature"] });
      feedback.toast(edition ? "Grade mis à jour" : "Grade ajouté", grade.code);
      setFormulaire(null);
      setEdition(null);
    },
  });
  const data = page.data;
  const visibles = (data?.grades ?? []).filter((item) => !categorie || item.categorie === categorie);
  const liste = usePagination(visibles, `${categorie}|${data?.grades.length ?? 0}`);
  if (page.isLoading) return <p className="text-on-surface-variant">Chargement des grades…</p>;
  if (!data) return <p className="text-error">Les grades n'ont pas pu être chargés.</p>;
  return (
    <section className={`${CARTE} overflow-hidden`}>
      <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="max-w-3xl font-body-sm text-body-sm text-on-surface-variant">{data.source} Chaque grade comporte quatre classes : exceptionnelle, principale, première et deuxième.</p>
          <select className={`${CHAMP} mt-3 max-w-sm`} value={categorie} aria-label="Filtrer par catégorie" onChange={(event) => setCategorie(event.target.value)}>
            <option value="">Toutes les catégories</option>
            <option value="A">Catégorie A</option>
            <option value="B">Catégorie B</option>
            <option value="C">Catégorie C</option>
            <option value="D">Catégorie D</option>
          </select>
        </div>
        <button
          type="button"
          className={PRIMAIRE}
          onClick={() => {
            setEdition(null);
            setFormulaire({ code: "", categorie: "A", libelle: "", en_vigueur: true });
            enregistrer.reset();
          }}
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
          Ajouter un grade
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Catégorie</th>
              <th className="px-4 py-3">Définition</th>
              <th className="px-4 py-3 text-right">Emplois</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {liste.visibles.map((item) => (
              <tr key={item.code} className="border-t border-hairline">
                <td className="px-4 py-3 font-body-md text-body-md text-on-surface whitespace-nowrap">
                  {item.code}
                  {!item.en_vigueur && <span className="ml-2 font-label-sm text-label-sm text-on-surface-variant">Ancien</span>}
                </td>
                <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{item.categorie}</td>
                <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">{item.libelle}</td>
                <td className="px-4 py-3 text-right font-body-sm text-body-sm text-on-surface">{item.emplois}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="font-label-md text-label-md text-primary hover:underline"
                    onClick={() => {
                      setEdition(item.code);
                      setFormulaire({ code: item.code, categorie: item.categorie, libelle: item.libelle, en_vigueur: item.en_vigueur });
                      enregistrer.reset();
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="ml-3 font-label-md text-label-md text-error hover:underline"
                    onClick={() => void agir({
                      confirmation: `Supprimer le grade ${item.code} ?`,
                      confirmLabel: "Supprimer",
                      attente: "Suppression du grade…",
                      route: `/api/v1/grades/${encodeURIComponent(item.code)}/`,
                      methode: "DELETE",
                      succes: "Grade supprimé",
                    })}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={liste.page} pages={liste.pages} total={liste.total} aller={liste.aller} libelle="grade" />
      {formulaire && (
        <Modale
          titre={edition ? `Modifier le grade ${edition}` : "Ajouter un grade"}
          sousTitre="Ce grade sera proposé dans les dossiers et les besoins."
          icone="badge"
          onClose={() => { if (!enregistrer.isPending) { setFormulaire(null); setEdition(null); } }}
          onSubmit={() => enregistrer.mutate()}
          enCours={enregistrer.isPending}
          erreur={enregistrer.isError ? message(enregistrer.error) : undefined}
          libelleValider={edition ? "Enregistrer" : "Ajouter"}
        >
          <div className="grid gap-4">
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Code</span>
              <input className={CHAMP} required maxLength={8} value={formulaire.code} disabled={Boolean(edition)} onChange={(event) => setFormulaire({ ...formulaire, code: event.target.value.toUpperCase() })} />
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Catégorie</span>
              <select className={CHAMP} value={formulaire.categorie} onChange={(event) => setFormulaire({ ...formulaire, categorie: event.target.value })}>
                <option value="A">A — conception et direction</option>
                <option value="B">B — application</option>
                <option value="C">C — exécution</option>
                <option value="D">D — exécution</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Définition</span>
              <textarea className={`${CHAMP} h-28 py-2`} required maxLength={320} value={formulaire.libelle} onChange={(event) => setFormulaire({ ...formulaire, libelle: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
              <input type="checkbox" checked={formulaire.en_vigueur} onChange={(event) => setFormulaire({ ...formulaire, en_vigueur: event.target.checked })} />
              Grille en vigueur
            </label>
          </div>
        </Modale>
      )}
    </section>
  );
}

function VoletEmplois() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const { agir } = useAction();
  const page = useNomenclature();
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState("");
  const [grade, setGrade] = useState("");
  const [pageCourante, setPageCourante] = useState(0);
  const [signature, setSignature] = useState("");
  const [edition, setEdition] = useState<string | null>(null);
  const [formulaire, setFormulaire] = useState<{ libelle: string; famille: string; grade: string } | null>(null);
  const enregistrer = useMutation({
    mutationFn: () => {
      if (!formulaire) return Promise.reject(new Error("Formulaire vide"));
      const corps = JSON.stringify({ libelle: formulaire.libelle.trim(), famille: formulaire.famille, grade: formulaire.grade });
      if (edition) return api<EmploiNomenclature>(`/api/v1/emplois/${encodeURIComponent(edition)}/`, { method: "PATCH", body: corps });
      return api<EmploiNomenclature>("/api/v1/emplois/", { method: "POST", body: corps });
    },
    onSuccess: async (emploi) => {
      await client.invalidateQueries({ queryKey: ["nomenclature"] });
      feedback.toast(edition ? "Emploi mis à jour" : "Emploi ajouté", emploi.libelle);
      setFormulaire(null);
      setEdition(null);
    },
  });
  const data = page.data;
  const cle = `${recherche}|${famille}|${grade}`;
  if (signature !== cle) {
    setSignature(cle);
    setPageCourante(0);
  }
  const correspond = (data?.emplois ?? []).filter((item) => {
    if (famille && item.famille !== famille) return false;
    if (grade && item.grade !== grade) return false;
    if (recherche && !normaliser(`${item.libelle} ${item.grade} ${item.famille_libelle}`).includes(normaliser(recherche))) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(correspond.length / TAILLE));
  const courante = Math.min(pageCourante, pages - 1);
  const visibles = correspond.slice(courante * TAILLE, courante * TAILLE + TAILLE);
  if (page.isLoading) return <p className="text-on-surface-variant">Chargement des emplois…</p>;
  if (!data) return <p className="text-error">Les emplois n'ont pas pu être chargés.</p>;
  return (
    <ListeEmplois
      data={data}
      recherche={recherche}
      setRecherche={setRecherche}
      famille={famille}
      setFamille={setFamille}
      grade={grade}
      setGrade={setGrade}
      visibles={visibles}
      total={correspond.length}
      courante={courante}
      pages={pages}
      aller={setPageCourante}
      onCreer={() => {
        setEdition(null);
        setFormulaire({ libelle: "", famille: data.familles[0]?.code ?? "", grade: data.grades.find((item) => item.en_vigueur)?.code ?? "" });
        enregistrer.reset();
      }}
      onEditer={(item) => {
        setEdition(item.code);
        setFormulaire({ libelle: item.libelle, famille: item.famille, grade: item.grade });
        enregistrer.reset();
      }}
      onSupprimer={(item) => void agir({
        confirmation: `Supprimer l'emploi « ${item.libelle} » ?`,
        confirmLabel: "Supprimer",
        attente: "Suppression de l'emploi…",
        route: `/api/v1/emplois/${encodeURIComponent(item.code)}/`,
        methode: "DELETE",
        succes: "Emploi supprimé",
      })}
      formulaire={formulaire}
      setFormulaire={setFormulaire}
      edition={edition}
      setEdition={setEdition}
      enregistrer={() => enregistrer.mutate()}
      enCours={enregistrer.isPending}
      erreur={enregistrer.isError ? message(enregistrer.error) : undefined}
    />
  );
}

function ListeEmplois({
  data, recherche, setRecherche, famille, setFamille, grade, setGrade, visibles, total, courante, pages, aller,
  onCreer, onEditer, onSupprimer, formulaire, setFormulaire, edition, setEdition, enregistrer, enCours, erreur,
}: {
  data: Nomenclature;
  recherche: string;
  setRecherche: (valeur: string) => void;
  famille: string;
  setFamille: (valeur: string) => void;
  grade: string;
  setGrade: (valeur: string) => void;
  visibles: EmploiNomenclature[];
  total: number;
  courante: number;
  pages: number;
  aller: (page: number) => void;
  onCreer: () => void;
  onEditer: (item: EmploiNomenclature) => void;
  onSupprimer: (item: EmploiNomenclature) => void;
  formulaire: { libelle: string; famille: string; grade: string } | null;
  setFormulaire: (valeur: { libelle: string; famille: string; grade: string } | null) => void;
  edition: string | null;
  setEdition: (valeur: string | null) => void;
  enregistrer: () => void;
  enCours: boolean;
  erreur?: string;
}) {
  return (
    <section className={`${CARTE} overflow-hidden`}>
      <div className="p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-3xl font-body-sm text-body-sm text-on-surface-variant">
            {total} emploi{total > 1 ? "s" : ""} affiché{total > 1 ? "s" : ""}. Six familles, du décret de classification. Le choix d'un emploi renseigne le grade dans le dossier.
          </p>
          <button type="button" className={PRIMAIRE} onClick={onCreer}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
            Ajouter un emploi
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className={CHAMP} value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher un emploi" aria-label="Rechercher un emploi" />
          <select className={CHAMP} value={famille} aria-label="Filtrer par famille" onChange={(event) => setFamille(event.target.value)}>
            <option value="">Toutes les familles</option>
            {data.familles.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
          </select>
          <select className={CHAMP} value={grade} aria-label="Filtrer par grade" onChange={(event) => setGrade(event.target.value)}>
            <option value="">Tous les grades</option>
            {data.grades.map((item) => <option key={item.code} value={item.code}>{item.code}{item.en_vigueur ? "" : " (ancien)"}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Emploi</th>
              <th className="px-4 py-3">Famille</th>
              <th className="px-4 py-3" data-min="">Grade</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Aucun emploi ne correspond.</td>
              </tr>
            ) : visibles.map((item) => (
              <tr key={item.code} className="border-t border-hairline">
                <td className="px-4 py-3 font-body-md text-body-md text-on-surface">{item.libelle}</td>
                <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface-variant">{item.famille_libelle}</td>
                <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{item.grade}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => onEditer(item)}>Modifier</button>
                  <button type="button" className="ml-3 font-label-md text-label-md text-error hover:underline" onClick={() => onSupprimer(item)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-hairline">
        <p className="font-label-sm text-label-sm text-on-surface-variant">Page {courante + 1} / {pages}</p>
        {pages > 1 && (
          <div className="flex gap-2">
            <button type="button" className="font-label-md text-label-md text-primary hover:underline disabled:opacity-40" disabled={courante === 0} onClick={() => aller(courante - 1)}>Précédent</button>
            <button type="button" className="font-label-md text-label-md text-primary hover:underline disabled:opacity-40" disabled={courante >= pages - 1} onClick={() => aller(courante + 1)}>Suivant</button>
          </div>
        )}
      </div>
      {formulaire && (
        <Modale
          titre={edition ? "Modifier l'emploi" : "Ajouter un emploi"}
          sousTitre="L'emploi sera proposé partout où un dossier ou un besoin le demande."
          icone="work"
          onClose={() => { if (!enCours) { setFormulaire(null); setEdition(null); } }}
          onSubmit={enregistrer}
          enCours={enCours}
          erreur={erreur}
          libelleValider={edition ? "Enregistrer" : "Ajouter"}
        >
          <div className="grid gap-4">
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
              <input className={CHAMP} required maxLength={220} value={formulaire.libelle} onChange={(event) => setFormulaire({ ...formulaire, libelle: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Famille</span>
              <select className={CHAMP} required value={formulaire.famille} onChange={(event) => setFormulaire({ ...formulaire, famille: event.target.value })}>
                {data.familles.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Grade</span>
              <select className={CHAMP} required value={formulaire.grade} onChange={(event) => setFormulaire({ ...formulaire, grade: event.target.value })}>
                {data.grades.map((item) => <option key={item.code} value={item.code}>{item.code} — catégorie {item.categorie}</option>)}
              </select>
            </label>
          </div>
        </Modale>
      )}
    </section>
  );
}
