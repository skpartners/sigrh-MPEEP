import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api, telecharger } from "../../api/client";
import type { Besoins, FicheBesoin } from "../../api/types";
import { dateCourte, nombre } from "../../ui/format";
import { useFeedback } from "../../ui/Feedback";
import { Modale } from "../../ui/Modale";
import { AppChrome } from "../AppChrome";
import { optionsEntites } from "../../ui/Entites";
import { SelectEmploi, SelectGrade, useNomenclature } from "../../ui/Nomenclature";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex-1 space-y-6";
const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const PRIMAIRE = "inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-container font-label-lg text-label-lg disabled:opacity-50";
const SECOND = "inline-flex items-center gap-2 px-4 py-2 rounded bg-surface-container-low text-primary hover:bg-surface-container font-label-lg text-label-lg";
const TAILLE = 5;
const FICHE_VIDE = { entite: "", direction: "", profil: "", grade: "", specialite: "", volume: "1", motif: "", nature: "creation", critique: false };

function ton(statut: string): string {
  if (statut === "favorable") return "bg-primary-fixed text-on-primary-fixed";
  if (statut === "rejet") return "bg-error-container text-on-error-container";
  return "bg-secondary-fixed text-on-secondary-fixed";
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "L'enregistrement n'a pas abouti.";
}

export function BesoinsScreen() {
  const client = useQueryClient();
  const nomenclature = useNomenclature();
  const feedback = useFeedback();
  const besoins = useQuery({ queryKey: ["besoins"], queryFn: () => api<Besoins>("/api/v1/besoins/") });
  const [entite, setEntite] = useState("");
  const [nature, setNature] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [panneau, setPanneau] = useState<"fiche" | "instruire" | "consulter" | null>(null);
  const [fiche, setFiche] = useState(FICHE_VIDE);
  const [cible, setCible] = useState<FicheBesoin | null>(null);
  const [decision, setDecision] = useState({ statut: "favorable", visa: "", motif: "", postes_accordes: "0" });

  const data = besoins.data;
  const visibles = useMemo(() => (data?.fiches ?? []).filter((item) => (
    (!entite || item.entite_code === entite) && (!nature || item.nature === nature) && (!statut || item.statut === statut)
  )), [data, entite, nature, statut]);
  const pages = Math.max(1, Math.ceil(visibles.length / TAILLE));
  const courante = Math.min(page, pages);
  const lignes = visibles.slice((courante - 1) * TAILLE, courante * TAILLE);

  function fermer() {
    setPanneau(null);
  }

  const creer = useMutation({
    mutationFn: () => api("/api/v1/besoins/fiches/", {
      method: "POST",
      body: JSON.stringify({ ...fiche, volume: Number(fiche.volume) }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["besoins"] });
      feedback.toast("Fiche d'expression enregistrée");
      fermer();
    },
  });
  const instruire = useMutation({
    mutationFn: () => api(`/api/v1/besoins/fiches/${cible?.reference}/instruire/`, {
      method: "POST",
      body: JSON.stringify({ ...decision, postes_accordes: Number(decision.postes_accordes) }),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["besoins"] });
      feedback.toast("Arbitrage enregistré");
      fermer();
    },
  });

  async function exporter() {
    await feedback.run("Préparation du plan…", () => telecharger("/api/v1/besoins/export/", "plan-besoins.pdf"), {
      success: { title: "Plan prévisionnel exporté" },
      error: "L'export n'a pas abouti",
    });
  }

  if (besoins.isLoading) {
    return <AppChrome><p className={`${PAGE} text-on-surface-variant`}>Chargement des besoins…</p></AppChrome>;
  }
  if (!data) {
    return <AppChrome><p className={`${PAGE} text-error`}>Les besoins n'ont pas pu être chargés.</p></AppChrome>;
  }

  return (
    <AppChrome>
      <div className={PAGE}>
        <section className={`${CARTE} p-6`}>
          <p className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            <span>GPEC</span>
            <span className="material-symbols-outlined text-xs" aria-hidden="true">chevron_right</span>
            <span className="font-bold text-primary">Expression des besoins</span>
          </p>
          <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Expression des besoins et arbitrage</h1>
              <p className="mt-2 max-w-3xl font-body-md text-body-md text-on-surface-variant">
                Campagne {data.exercice}. {data.cadrage}. Plafond de référence : {nombre(data.pea_max)} emplois.
              </p>
              <p className="mt-2 font-label-sm text-label-sm text-primary">{data.ouverte ? "Campagne ouverte" : "Campagne close"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={SECOND} onClick={() => void exporter()}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">picture_as_pdf</span>
                Exporter le plan
              </button>
              <button type="button" className={PRIMAIRE} onClick={() => { setFiche(FICHE_VIDE); setPanneau("fiche"); }}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">post_add</span>
                Nouvelle fiche
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Indicateur libelle="Volume demandé" valeur={nombre(data.volume)} detail={`${nombre(data.entites)} entité${data.entites > 1 ? "s" : ""}${data.variation === null ? "" : ` · ${data.variation > 0 ? "+" : ""}${nombre(data.variation, 1)} % par rapport à l'exercice précédent`}`} />
          <Indicateur libelle="Postes accordés" valeur={nombre(data.postes_favorables)} detail={`${nombre(data.favorables)} fiche${data.favorables > 1 ? "s" : ""} favorable${data.favorables > 1 ? "s" : ""} · ${nombre(data.taux_favorable, 1)} %`} />
          <Indicateur libelle="Postes critiques" valeur={nombre(data.critiques)} detail="Volume des fiches signalées comme critiques" />
        </section>

        {data.alerte_retraites > 0 ? (
          <p className={`${CARTE} px-6 py-4 font-body-md text-body-md text-on-surface`}>
            {nombre(data.alerte_retraites)} fiche{data.alerte_retraites > 1 ? "s" : ""} mentionne{data.alerte_retraites > 1 ? "nt" : ""} un remplacement lié à un départ en retraite.
          </p>
        ) : null}

        <section className={`${CARTE} p-6`}>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Compétences sous tension</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {data.filieres.map((item) => (
              <article key={item.code}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-label-lg text-label-lg text-on-surface">
                    <span className="material-symbols-outlined mr-1 align-middle text-lg text-primary" aria-hidden="true">{item.icone}</span>
                    {item.libelle}
                  </p>
                  <p className="font-code-num text-code-num text-on-surface">{nombre(item.taux)} %</p>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{nombre(item.requis)} requis · {nombre(item.couverts)} couverts</p>
                <div className="mt-1 h-2 overflow-hidden rounded bg-surface-container">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, item.taux)}%` }} />
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">
            Redéploiements actés : {nombre(data.agents_repositionnes)} agent{data.agents_repositionnes > 1 ? "s" : ""}.
          </p>
        </section>

        <section className={`${CARTE} overflow-hidden`}>
          <div className="flex flex-col gap-3 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Registre des fiches</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{nombre(visibles.length)} fiche{visibles.length > 1 ? "s" : ""} · exercice {data.exercice}</p>
            </div>
            <button type="button" className={SECOND} onClick={() => { setEntite(""); setNature(""); setStatut(""); setPage(1); }}>Réinitialiser</button>
          </div>
          <div className="grid gap-3 px-6 pb-4 md:grid-cols-3">
            <select className={CHAMP} value={entite} onChange={(event) => { setEntite(event.target.value); setPage(1); }}>
              <option value="">Toutes les entités</option>
              {optionsEntites(data.entites_liste)}
            </select>
            <select className={CHAMP} value={nature} onChange={(event) => { setNature(event.target.value); setPage(1); }}>
              <option value="">Tous les mouvements</option>
              {data.natures.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
            </select>
            <select className={CHAMP} value={statut} onChange={(event) => { setStatut(event.target.value); setPage(1); }}>
              <option value="">Tous les statuts</option>
              {data.statuts.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Fiche</th>
                  <th className="px-4 py-3">Entité</th>
                  <th className="px-4 py-3">Profil</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Arbitrage</th>
                  <th className="px-4 py-3">Visa</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {lignes.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-on-surface-variant">Aucune fiche ne correspond à ce filtre.</td></tr>
                ) : lignes.map((item) => (
                  <tr key={item.reference} className="border-t border-hairline align-top">
                    <td className="px-4 py-3">
                      <p className="font-label-md text-label-md text-on-surface">{item.reference}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{dateCourte(item.depose_le)} · {item.heure}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{item.entite}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.direction}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{item.profil}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{[item.grade, item.specialite].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{nombre(item.volume)} poste{item.volume > 1 ? "s" : ""}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.nature_libelle}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.motif}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-1 font-label-sm text-label-sm ${ton(item.statut)}`}>{item.arbitrage || item.statut_libelle}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-on-surface">{item.visa || "—"}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{item.detail}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.statut === "instruction" || item.statut === "complement" ? (
                        <button type="button" className="rounded bg-primary px-3 py-1.5 font-label-md text-label-md text-on-primary" onClick={() => {
                          setCible(item);
                          setDecision({ statut: item.statut, visa: item.visa, motif: "", postes_accordes: String(item.postes_accordes) });
                          setPanneau("instruire");
                        }}>Instruire</button>
                      ) : (
                        <button type="button" className="rounded bg-surface-container-low px-3 py-1.5 font-label-md text-label-md text-primary" onClick={() => { setCible(item); setPanneau("consulter"); }}>Consulter</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {visibles.length === 0 ? "0 fiche" : `${(courante - 1) * TAILLE + 1} à ${Math.min(courante * TAILLE, visibles.length)} sur ${visibles.length}`}
            </p>
            <div className="flex gap-1">
              <button type="button" className={SECOND} disabled={courante <= 1} onClick={() => setPage(courante - 1)}>Précédent</button>
              <button type="button" className={SECOND} disabled={courante >= pages} onClick={() => setPage(courante + 1)}>Suivant</button>
            </div>
          </div>
        </section>
      </div>

      {panneau === "fiche" ? (
        <Modale titre="Nouvelle fiche d'expression" onClose={fermer} large>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); creer.mutate(); }}>
            <label className="block sm:col-span-2">Entité
              <select className={`${CHAMP} mt-1`} required value={fiche.entite} onChange={(event) => {
                const code = event.target.value;
                const choisi = data.entites_liste.find((item) => item.code === code);
                setFiche({ ...fiche, entite: code, direction: choisi?.nom ?? "" });
              }}>
                <option value="">Choisir</option>
                {optionsEntites(data.entites_liste)}
              </select>
            </label>
            <label className="block">Direction
              <input className={`${CHAMP} mt-1`} required value={fiche.direction} onChange={(event) => setFiche({ ...fiche, direction: event.target.value })} />
            </label>
            <label className="block">Emploi
              <SelectEmploi
                className={`${CHAMP} mt-1`}
                valeur={fiche.profil}
                required
                emplois={nomenclature.data?.emplois ?? []}
                onChange={(libelle, gradeChoisi) => setFiche({ ...fiche, profil: libelle, grade: gradeChoisi || fiche.grade })}
              />
            </label>
            <label className="block">Grade
              <SelectGrade
                className={`${CHAMP} mt-1`}
                valeur={fiche.grade}
                grades={nomenclature.data?.grades ?? []}
                onChange={(code) => setFiche({ ...fiche, grade: code })}
              />
            </label>
            <label className="block">Spécialité
              <input className={`${CHAMP} mt-1`} value={fiche.specialite} onChange={(event) => setFiche({ ...fiche, specialite: event.target.value })} />
            </label>
            <label className="block">Volume
              <input className={`${CHAMP} mt-1`} required type="number" min={1} value={fiche.volume} onChange={(event) => setFiche({ ...fiche, volume: event.target.value })} />
            </label>
            <label className="block">Mouvement
              <select className={`${CHAMP} mt-1`} value={fiche.nature} onChange={(event) => setFiche({ ...fiche, nature: event.target.value })}>
                {data.natures.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">Motif
              <textarea className={`${CHAMP} mt-1 h-24 py-2`} required value={fiche.motif} onChange={(event) => setFiche({ ...fiche, motif: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" checked={fiche.critique} onChange={(event) => setFiche({ ...fiche, critique: event.target.checked })} />
              Poste critique
            </label>
            {creer.isError ? <p className="sm:col-span-2 text-error">{message(creer.error)}</p> : null}
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" className={SECOND} onClick={fermer}>Annuler</button>
              <button type="submit" className={PRIMAIRE} disabled={creer.isPending}>Enregistrer</button>
            </div>
          </form>
        </Modale>
      ) : null}

      {panneau === "instruire" && cible ? (
        <Modale titre={`Instruire ${cible.reference}`} onClose={fermer}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); instruire.mutate(); }}>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{cible.entite} · {cible.profil} · {nombre(cible.volume)} demandé{cible.volume > 1 ? "s" : ""}</p>
            <label className="block">Décision
              <select className={`${CHAMP} mt-1`} value={decision.statut} onChange={(event) => setDecision({ ...decision, statut: event.target.value })}>
                {data.statuts.map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
              </select>
            </label>
            {decision.statut === "favorable" ? (
              <label className="block">Postes accordés
                <input className={`${CHAMP} mt-1`} required type="number" min={0} max={cible.volume} value={decision.postes_accordes} onChange={(event) => setDecision({ ...decision, postes_accordes: event.target.value })} />
              </label>
            ) : null}
            <label className="block">Visa
              <input className={`${CHAMP} mt-1`} value={decision.visa} onChange={(event) => setDecision({ ...decision, visa: event.target.value })} />
            </label>
            <label className="block">Motif
              <textarea className={`${CHAMP} mt-1 h-24 py-2`} required value={decision.motif} onChange={(event) => setDecision({ ...decision, motif: event.target.value })} />
            </label>
            {instruire.isError ? <p className="text-error">{message(instruire.error)}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={SECOND} onClick={fermer}>Annuler</button>
              <button type="submit" className={PRIMAIRE} disabled={instruire.isPending}>Enregistrer</button>
            </div>
          </form>
        </Modale>
      ) : null}

      {panneau === "consulter" && cible ? (
        <Modale titre={cible.reference} onClose={fermer}>
          <dl className="space-y-2 font-body-md text-body-md">
            <Ligne k="Entité" v={`${cible.entite} · ${cible.direction}`} />
            <Ligne k="Profil" v={`${cible.profil}${cible.grade ? ` · ${cible.grade}` : ""}`} />
            <Ligne k="Volume" v={`${nombre(cible.volume)} · ${cible.nature_libelle}`} />
            <Ligne k="Motif" v={cible.motif} />
            <Ligne k="Arbitrage" v={cible.arbitrage || cible.statut_libelle} />
            <Ligne k="Postes accordés" v={nombre(cible.postes_accordes)} />
            <Ligne k="Visa" v={cible.visa || "—"} />
            <Ligne k="Détail" v={cible.detail || "—"} />
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={SECOND} onClick={fermer}>Fermer</button>
            <button type="button" className={PRIMAIRE} onClick={() => {
              setDecision({ statut: cible.statut, visa: cible.visa, motif: cible.detail, postes_accordes: String(cible.postes_accordes) });
              setPanneau("instruire");
            }}>Reprendre l'arbitrage</button>
          </div>
        </Modale>
      ) : null}
    </AppChrome>
  );
}

function Indicateur({ libelle, valeur, detail }: { libelle: string; valeur: string; detail: string }) {
  return (
    <article className={`${CARTE} p-5`}>
      <p className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">{libelle}</p>
      <p className="mt-1 font-headline-md text-headline-md text-on-surface">{valeur}</p>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{detail}</p>
    </article>
  );
}

function Ligne({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-label-sm text-label-sm text-on-surface-variant">{k}</dt>
      <dd className="text-on-surface">{v}</dd>
    </div>
  );
}
