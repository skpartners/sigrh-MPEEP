import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api } from "../../api/client";
import { useFeedback } from "../../ui/Feedback";
import { Toile } from "../../ui/Graphique";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../../ui/Modale";
import { Select } from "../../ui/Select";
import {
  BLEU_MARINE,
  blocVierge,
  COULEURS_ANNEAU,
  etatComplet,
  etatDuPersonnel,
  indicateurs,
  MAX_BLOCS,
  MODELE_PERSONNEL,
  textesBloc,
  vueBloc,
  type BlocEtat,
  type ConfigEtat,
  type VueBloc,
} from "./etat";
import { exporterEtat } from "./exportEtat";
import { champsUtilises, libelleChamp, sourceEffective, type Catalogue, type SourceCatalogue } from "./moteur";
import { chargerCube, cleCube, TableauCroise } from "./TableauCroise";

const CLE_LISTE = ["etats-statistiques"] as const;
const CHAMP = "h-9 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const ZONE = "w-full px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const BOUTON_ICONE = "inline-flex size-8 items-center justify-center rounded border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low disabled:opacity-40";
const nombre = (valeur: number) => valeur.toLocaleString("fr-FR");

type Enregistre = {
  id: number;
  nom: string;
  modele: string;
  configuration: Partial<ConfigEtat>;
  mien: boolean;
  auteur: string;
  modifiee_le: string | null;
};

type Courant = {
  id: number | null;
  nom: string;
  modele: string;
  config: ConfigEtat;
  mien: boolean;
  auteur: string;
  modifie: boolean;
};

function modeleInitial(): Courant {
  return { id: null, nom: "État du personnel", modele: MODELE_PERSONNEL, config: etatDuPersonnel(), mien: true, auteur: "", modifie: false };
}

function depuisServeur(item: Enregistre): Courant {
  return { id: item.id, nom: item.nom, modele: item.modele, config: etatComplet(item.configuration), mien: item.mien, auteur: item.auteur, modifie: false };
}

/** États composés : des blocs prêts à lire (graphique, tableau et points à retenir sur une même ligne), recomposables et exportables. */
export function EtatCompose({ catalogue }: { catalogue: Catalogue | undefined }) {
  const feedback = useFeedback();
  const client = useQueryClient();
  const liste = useQuery({ queryKey: CLE_LISTE, queryFn: () => api<Enregistre[]>("/api/v1/statistiques/etats/") });
  const [courant, setCourant] = useState<Courant>(modeleInitial);
  const [edition, setEdition] = useState<string | null>(null);
  const blocs = courant.config.blocs;

  const requetes = useQueries({
    queries: blocs.map((bloc) => {
      const champs = champsUtilises(bloc.config);
      return {
        queryKey: cleCube(bloc.config, champs),
        queryFn: () => chargerCube(bloc.config, champs),
        placeholderData: keepPreviousData,
        staleTime: 60_000,
      };
    }),
  });
  const donnees = useMemo(
    () => blocs.map((bloc, rang) => {
      const source = sourceEffective(catalogue, bloc.config);
      const cube = requetes[rang]?.data;
      return { bloc, source, vue: vueBloc(cube?.source.code === bloc.config.source ? cube : undefined, bloc, source), chargee: Boolean(cube) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocs, catalogue, requetes.map((requete) => requete.dataUpdatedAt).join(",")],
  );
  const attente = requetes.some((requete) => requete.isLoading);

  function changer(modifier: (config: ConfigEtat) => ConfigEtat) {
    setCourant((actuel) => ({ ...actuel, config: modifier(actuel.config), modifie: true }));
  }
  function changerBloc(id: string, modifier: (bloc: BlocEtat) => BlocEtat) {
    changer((config) => ({ ...config, blocs: config.blocs.map((bloc) => (bloc.id === id ? modifier(bloc) : bloc)) }));
  }
  function deplacer(id: string, sens: -1 | 1) {
    changer((config) => {
      const rang = config.blocs.findIndex((bloc) => bloc.id === id);
      const cible = rang + sens;
      if (rang < 0 || cible < 0 || cible >= config.blocs.length) return config;
      const suite = [...config.blocs];
      [suite[rang], suite[cible]] = [suite[cible], suite[rang]];
      return { ...config, blocs: suite };
    });
  }
  async function retirer(bloc: BlocEtat) {
    if (!(await feedback.confirm(`Retirer le bloc « ${bloc.kicker || "sans titre"} » ?`, { message: "Le bloc disparaît de l'état et du classeur exporté.", confirmLabel: "Retirer" }))) return;
    changer((config) => ({ ...config, blocs: config.blocs.filter((item) => item.id !== bloc.id) }));
  }
  function dupliquer(bloc: BlocEtat) {
    changer((config) => {
      const rang = config.blocs.findIndex((item) => item.id === bloc.id);
      const copie = { ...structuredClone(bloc), id: `${bloc.id}-${Date.now().toString(36)}`, kicker: `${bloc.kicker} (copie)` };
      const suite = [...config.blocs];
      suite.splice(rang + 1, 0, copie);
      return { ...config, blocs: suite };
    });
  }
  function ajouter() {
    if (blocs.length >= MAX_BLOCS) return;
    const bloc = blocVierge(blocs.length);
    changer((config) => ({ ...config, blocs: [...config.blocs, bloc] }));
    setEdition(bloc.id);
  }

  async function ouvrir(valeur: string) {
    if (courant.modifie && !(await feedback.confirm("Quitter cet état ?", { message: "Les modifications non enregistrées seront perdues.", confirmLabel: "Quitter" }))) return;
    setEdition(null);
    if (valeur === "modele") {
      setCourant(modeleInitial());
      return;
    }
    const trouve = liste.data?.find((item) => String(item.id) === valeur);
    if (trouve) setCourant(depuisServeur(trouve));
  }

  async function retablir() {
    if (!(await feedback.confirm("Rétablir le modèle ?", { message: "Les cinq blocs d'origine remplacent la composition actuelle.", confirmLabel: "Rétablir" }))) return;
    setEdition(null);
    changer(() => etatDuPersonnel());
  }

  const enregistrer = useMutation({
    mutationFn: (cible: Courant) => {
      const corps = JSON.stringify({ nom: cible.nom.trim() || "État statistique", modele: cible.modele, configuration: cible.config });
      return cible.id !== null && cible.mien
        ? api<Enregistre>(`/api/v1/statistiques/etats/${cible.id}/`, { method: "PATCH", body: corps })
        : api<Enregistre>("/api/v1/statistiques/etats/", { method: "POST", body: corps });
    },
    onSuccess: (reponse) => {
      setCourant(depuisServeur(reponse));
      void client.invalidateQueries({ queryKey: CLE_LISTE });
      feedback.toast("État enregistré", `« ${reponse.nom} » se rouvre avec ses blocs, ses couleurs et ses textes.`);
    },
    onError: (erreur) => feedback.toast("Enregistrement impossible", erreur instanceof ApiError ? erreur.message : "L'état n'a pas été enregistré.", "error"),
  });

  async function supprimer() {
    if (courant.id === null) return;
    if (!(await feedback.confirm(`Supprimer l'état « ${courant.nom} » ?`, { message: "L'état est retiré pour tous les utilisateurs.", confirmLabel: "Supprimer" }))) return;
    try {
      await feedback.run(
        "Suppression de l'état…",
        () => api(`/api/v1/statistiques/etats/${courant.id}/`, { method: "DELETE" }),
        { success: { title: "État supprimé" }, error: "L'état n'a pas été supprimé." },
      );
    } catch {
      return;
    }
    void client.invalidateQueries({ queryKey: CLE_LISTE });
    setCourant(modeleInitial());
  }

  function exporter() {
    exporterEtat(courant.config, donnees.map(({ bloc, vue, source }) => ({ bloc, vue, source })));
    feedback.toast("Classeur prêt", "La feuille Graphiques réunit chaque graphique, son tableau et ses points à retenir ; la synthèse suit.");
  }

  const blocEdite = blocs.find((bloc) => bloc.id === edition);
  if (blocEdite) {
    const rang = blocs.indexOf(blocEdite);
    return (
      <EditeurBloc
        bloc={blocEdite}
        catalogue={catalogue}
        vue={donnees[rang]?.vue}
        onChange={(modifier) => changerBloc(blocEdite.id, modifier)}
        onRetour={() => setEdition(null)}
      />
    );
  }

  const vues: Record<string, VueBloc | undefined> = Object.fromEntries(donnees.map(({ bloc, vue }) => [bloc.id, vue]));
  const chiffres = indicateurs(blocs, vues);

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-hairline bg-surface-container-lowest p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
            État
            <Select aria-label="État composé" className={`${CHAMP} min-w-56`} value={courant.id === null ? "modele" : String(courant.id)} onChange={(event) => void ouvrir(event.target.value)}>
              <option value="modele">État du personnel (modèle)</option>
              {(liste.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.nom}{item.mien ? "" : ` — ${item.auteur}`}</option>
              ))}
            </Select>
          </label>
          <input aria-label="Nom de l'état" className={`${CHAMP} min-w-56 flex-1`} value={courant.nom} onChange={(event) => setCourant((actuel) => ({ ...actuel, nom: event.target.value, modifie: true }))} placeholder="Nom de l'état" />
          <button type="button" className={BOUTON_PRIMAIRE} disabled={enregistrer.isPending || (!courant.modifie && courant.id !== null)} onClick={() => enregistrer.mutate(courant.id !== null && !courant.mien ? { ...courant, nom: `${courant.nom} (copie)` } : courant)}>
            <Icone nom="save" className="text-lg" />
            {courant.id !== null && !courant.mien ? "Enregistrer une copie" : "Enregistrer"}
          </button>
          <button type="button" className={BOUTON_SECONDAIRE} disabled={attente || !blocs.length} onClick={exporter}>
            <Icone nom="download" className="text-lg" />
            Exporter (Excel)
          </button>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={ajouter} disabled={blocs.length >= MAX_BLOCS}>
            <Icone nom="add_chart" className="text-lg" />
            Ajouter un bloc
          </button>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={() => void retablir()}>
            <Icone nom="restart_alt" className="text-lg" />
            Rétablir le modèle
          </button>
          {courant.id !== null && courant.mien && (
            <button type="button" className={`${BOUTON_SECONDAIRE} text-error`} onClick={() => void supprimer()}>
              <Icone nom="delete" className="text-lg" />
              Supprimer
            </button>
          )}
        </div>
        <details className="rounded-lg border border-hairline px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 font-label-md text-label-md text-on-surface">
            <Icone nom="edit_note" className="text-lg text-primary" />
            Titre, source et synthèse de l'état
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1 font-label-sm text-label-sm text-on-surface-variant">
              Titre
              <input className={`${CHAMP} w-full`} value={courant.config.titre} onChange={(event) => changer((config) => ({ ...config, titre: event.target.value }))} />
            </label>
            <label className="space-y-1 font-label-sm text-label-sm text-on-surface-variant">
              Source (pied de chaque bloc)
              <input className={`${CHAMP} w-full`} value={courant.config.source} onChange={(event) => changer((config) => ({ ...config, source: event.target.value }))} />
            </label>
            <label className="space-y-1 font-label-sm text-label-sm text-on-surface-variant md:col-span-2">
              Chapeau
              <textarea className={ZONE} rows={2} value={courant.config.sous_titre} onChange={(event) => changer((config) => ({ ...config, sous_titre: event.target.value }))} />
            </label>
            <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
              <input type="checkbox" checked={courant.config.synthese} onChange={(event) => changer((config) => ({ ...config, synthese: event.target.checked }))} />
              Ajouter la feuille de synthèse à l'exportation
            </label>
          </div>
        </details>
        {courant.id !== null && !courant.mien && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">État de {courant.auteur}. Vos changements restent sur cet écran ; « Enregistrer une copie » les garde dans un état à vous.</p>
        )}
      </section>

      <header>
        <h2 className="font-headline-md text-headline-md" style={{ color: BLEU_MARINE }}>{courant.config.titre || "État statistique"}</h2>
        {courant.config.sous_titre && <p className="mt-1 font-body-sm text-body-sm italic text-on-surface-variant">{courant.config.sous_titre}</p>}
      </header>

      {blocs.map((bloc, rang) => (
        <BlocCarte
          key={bloc.id}
          bloc={bloc}
          vue={donnees[rang]?.vue}
          source={donnees[rang]?.source}
          chargee={donnees[rang]?.chargee ?? false}
          texteSource={courant.config.source}
          premier={rang === 0}
          dernier={rang === blocs.length - 1}
          onEditer={() => setEdition(bloc.id)}
          onMonter={() => deplacer(bloc.id, -1)}
          onDescendre={() => deplacer(bloc.id, 1)}
          onDupliquer={() => dupliquer(bloc)}
          onRetirer={() => void retirer(bloc)}
        />
      ))}
      {!blocs.length && (
        <p className="rounded-xl border border-dashed border-outline-variant p-8 text-center font-body-sm text-body-sm text-on-surface-variant">
          Cet état n'a plus de bloc. Ajoutez-en un, ou rétablissez le modèle.
        </p>
      )}

      {courant.config.synthese && chiffres.length > 0 && (
        <section className="space-y-4 rounded-xl border border-hairline bg-surface-container-lowest p-4 shadow-sm" aria-label="Synthèse">
          <h3 className="font-label-md text-label-md font-bold tracking-wide" style={{ color: BLEU_MARINE }}>SYNTHÈSE — INDICATEURS CLÉS</h3>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {chiffres.map((chiffre) => (
              <li key={chiffre.libelle} className="rounded-lg bg-[#F2F5F8] p-3">
                <p className="font-label-sm text-label-sm font-bold text-[#2A9D8F]">{chiffre.libelle}</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: BLEU_MARINE }}>{chiffre.valeur}</p>
                <p className="font-body-sm text-body-sm text-[#7F7F7F]">{chiffre.detail}</p>
              </li>
            ))}
          </ul>
          <h3 className="font-label-md text-label-md font-bold" style={{ color: BLEU_MARINE }}>MESSAGES CLÉS</h3>
          <ol className="space-y-2">
            {donnees.filter(({ vue }) => !vue.vide).map(({ bloc, vue }, rang) => (
              <li key={bloc.id} className="flex gap-3 font-body-md text-body-md text-on-surface">
                <span className="text-lg font-bold text-[#2A9D8F]">{rang + 1}</span>
                <span>{textesBloc(bloc, vue).titre}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function BlocCarte({ bloc, vue, source, chargee, texteSource, premier, dernier, onEditer, onMonter, onDescendre, onDupliquer, onRetirer }: {
  bloc: BlocEtat;
  vue: VueBloc | undefined;
  source: SourceCatalogue | undefined;
  chargee: boolean;
  texteSource: string;
  premier: boolean;
  dernier: boolean;
  onEditer: () => void;
  onMonter: () => void;
  onDescendre: () => void;
  onDupliquer: () => void;
  onRetirer: () => void;
}) {
  const textes = vue && !vue.vide ? textesBloc(bloc, vue) : null;
  const graphique = bloc.config.graphique;
  const coin = bloc.config.lignes.map((code) => libelleChamp(code, source)).join(" / ") || "Total";
  return (
    <section className="rounded-xl border border-hairline bg-surface-container-lowest p-4 shadow-sm" aria-label={bloc.kicker}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-label-sm text-label-sm font-bold tracking-wide text-[#2A9D8F]">{bloc.kicker.toUpperCase()}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug" style={{ color: BLEU_MARINE }}>
            {textes ? textes.titre : chargee ? "Aucune donnée pour ce bloc" : "Chargement…"}
          </h3>
          {bloc.sous_titre && <p className="mt-1 font-body-sm text-body-sm italic text-[#7F7F7F]">{bloc.sous_titre}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onEditer}>
            <Icone nom="tune" className="text-lg" />
            Modifier
          </button>
          <button type="button" className={BOUTON_ICONE} title="Monter" aria-label="Monter le bloc" disabled={premier} onClick={onMonter}><Icone nom="arrow_upward" /></button>
          <button type="button" className={BOUTON_ICONE} title="Descendre" aria-label="Descendre le bloc" disabled={dernier} onClick={onDescendre}><Icone nom="arrow_downward" /></button>
          <button type="button" className={BOUTON_ICONE} title="Dupliquer" aria-label="Dupliquer le bloc" onClick={onDupliquer}><Icone nom="content_copy" /></button>
          <button type="button" className={`${BOUTON_ICONE} text-error`} title="Retirer" aria-label="Retirer le bloc" onClick={onRetirer}><Icone nom="delete" /></button>
        </div>
      </div>

      {vue && !vue.vide ? (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)]">
          <div className={`min-w-0 ${bloc.anneau ? "grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" : ""}`}>
            {bloc.anneau && (
              <Toile forme="anneau" series={vue.repartition} etiquettes legende hauteur={340} titre={`${bloc.kicker} — répartition`} couleurs={COULEURS_ANNEAU} />
            )}
            {graphique.visible && (
              <Toile forme={graphique.forme} series={vue.series} etiquettes={graphique.etiquettes} legende={graphique.legende} hauteur={340} titre={bloc.kicker} couleurs={graphique.couleurs} />
            )}
          </div>

          <div className="min-w-0 overflow-auto rounded-lg border border-hairline">
            <table className="w-full border-collapse font-body-sm text-body-sm">
              <thead>
                <tr style={{ backgroundColor: BLEU_MARINE }} className="text-white">
                  <th scope="col" className="px-2 py-1.5 text-left font-label-sm text-label-sm">{coin}</th>
                  {vue.colonnes.map((nom) => <th key={nom} scope="col" className="px-2 py-1.5 text-right font-label-sm text-label-sm">{nom}</th>)}
                  <th scope="col" className="px-2 py-1.5 text-right font-label-sm text-label-sm">Total</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-label-sm text-label-sm">Part</th>
                </tr>
              </thead>
              <tbody>
                {vue.lignes.map((ligne) => (
                  <tr key={ligne.chemin.join("\u0001")} className={`border-t border-hairline ${ligne.groupe ? "bg-[#F2F5F8] font-bold" : ""}`}>
                    <th scope="row" className="px-2 py-1 text-left font-normal" style={{ paddingLeft: `${0.5 + ligne.niveau * 0.9}rem`, fontWeight: ligne.groupe ? 700 : 400 }}>{ligne.libelle}</th>
                    {ligne.valeurs.map((valeur, rang) => <td key={vue.colonnes[rang]} className="px-2 py-1 text-right tabular-nums">{nombre(valeur)}</td>)}
                    <td className="px-2 py-1 text-right font-bold tabular-nums">{nombre(ligne.total)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{ligne.part === null ? "" : `${(ligne.part * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-on-surface-variant bg-[#F2F5F8] font-bold">
                  <th scope="row" className="px-2 py-1.5 text-left">Total</th>
                  {vue.totaux.map((valeur, rang) => <td key={vue.colonnes[rang]} className="px-2 py-1.5 text-right tabular-nums">{nombre(valeur)}</td>)}
                  <td className="px-2 py-1.5 text-right tabular-nums">{nombre(vue.total)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">100,0 %</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <aside className="min-w-0 rounded-lg bg-[#F2F5F8] p-3" aria-label="À retenir">
            <p className="font-label-sm text-label-sm font-bold tracking-wide text-[#2A9D8F]">À RETENIR</p>
            <ul className="mt-2 space-y-3 font-body-sm text-body-sm text-[#262626]">
              {(textes?.commentaires ?? []).map((texte) => (
                <li key={texte} className="flex gap-2"><span aria-hidden="true">▪</span><span>{texte}</span></li>
              ))}
              {textes && !textes.commentaires.length && <li className="italic text-[#7F7F7F]">Aucun point à retenir. Ajoutez-en dans « Modifier ».</li>}
            </ul>
          </aside>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-surface-container-low p-6 text-center font-body-sm text-body-sm text-on-surface-variant">
          {chargee ? "Aucun enregistrement ne correspond aux champs et aux filtres de ce bloc. Ouvrez « Modifier » pour les ajuster." : "Calcul des chiffres…"}
        </p>
      )}
      {texteSource && <p className="mt-3 font-body-sm text-xs italic text-[#7F7F7F]">Source : {texteSource}</p>}
    </section>
  );
}

function EditeurBloc({ bloc, catalogue, vue, onChange, onRetour }: {
  bloc: BlocEtat;
  catalogue: Catalogue | undefined;
  vue: VueBloc | undefined;
  onChange: (modifier: (bloc: BlocEtat) => BlocEtat) => void;
  onRetour: () => void;
}) {
  const automatiques = vue && !vue.vide ? textesBloc({ ...bloc, titre_auto: true, commentaires: null }, vue) : null;
  const points = bloc.commentaires;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface-container-lowest p-3 shadow-sm">
        <button type="button" className={BOUTON_PRIMAIRE} onClick={onRetour}>
          <Icone nom="arrow_back" className="text-lg" />
          Retour à l'état
        </button>
        <div className="min-w-0">
          <p className="font-label-sm text-label-sm text-on-surface-variant">Modification du bloc</p>
          <p className="truncate font-label-md text-label-md font-bold text-on-surface">{bloc.kicker}</p>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-hairline bg-surface-container-lowest p-4 shadow-sm md:grid-cols-2">
        <label className="space-y-1 font-label-sm text-label-sm text-on-surface-variant">
          Surtitre du bloc
          <input className={`${CHAMP} w-full`} value={bloc.kicker} onChange={(event) => onChange((courant) => ({ ...courant, kicker: event.target.value }))} />
        </label>
        <label className="space-y-1 font-label-sm text-label-sm text-on-surface-variant">
          Légende sous le titre
          <input className={`${CHAMP} w-full`} value={bloc.sous_titre} onChange={(event) => onChange((courant) => ({ ...courant, sous_titre: event.target.value }))} />
        </label>

        <div className="space-y-1.5">
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
            <input type="checkbox" checked={bloc.titre_auto} onChange={(event) => onChange((courant) => ({ ...courant, titre_auto: event.target.checked, titre: event.target.checked || courant.titre ? courant.titre : (automatiques?.titre ?? "") }))} />
            Titre rédigé à partir des données
          </label>
          <textarea
            className={ZONE}
            rows={3}
            disabled={bloc.titre_auto}
            aria-label="Titre du bloc"
            value={bloc.titre_auto ? (automatiques?.titre ?? "") : bloc.titre}
            onChange={(event) => onChange((courant) => ({ ...courant, titre: event.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
            <input
              type="checkbox"
              checked={points === null}
              onChange={(event) => onChange((courant) => ({ ...courant, commentaires: event.target.checked ? null : (automatiques?.commentaires ?? []) }))}
            />
            Points à retenir rédigés à partir des données
          </label>
          <textarea
            className={ZONE}
            rows={5}
            disabled={points === null}
            aria-label="Points à retenir, un par ligne"
            placeholder="Un point à retenir par ligne"
            value={points === null ? (automatiques?.commentaires ?? []).join("\n") : points.join("\n")}
            onChange={(event) => onChange((courant) => ({ ...courant, commentaires: event.target.value.split("\n") }))}
            onBlur={() => onChange((courant) => (courant.commentaires ? { ...courant, commentaires: courant.commentaires.map((ligne) => ligne.trim()).filter(Boolean) } : courant))}
          />
        </div>

        <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface md:col-span-2">
          <input type="checkbox" checked={bloc.anneau} onChange={(event) => onChange((courant) => ({ ...courant, anneau: event.target.checked }))} />
          Ajouter un anneau de répartition (part de chaque ligne dans l'effectif) à gauche du graphique
        </label>
      </section>

      <TableauCroise
        integre
        feuille={{ cle: bloc.id, id: null, nom: bloc.kicker, config: bloc.config, mien: true, auteur: "", modifiee: false }}
        catalogue={catalogue}
        enregistrement={false}
        onChange={(modifier) => onChange((courant) => ({
          ...courant,
          config: modifier({ cle: courant.id, id: null, nom: courant.kicker, config: courant.config, mien: true, auteur: "", modifiee: false }).config,
        }))}
        onEnregistrer={onRetour}
        onDupliquer={onRetour}
        onSupprimer={onRetour}
      />
    </div>
  );
}
