import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "../../api/client";
import { ChoixForme, Toile } from "../../ui/Graphique";
import { Icone } from "../../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";
import { useFeedback } from "../../ui/Feedback";
import { nombre } from "../../ui/format";
import { exporterClasseurTcd } from "./exportTcd";
import { GrilleTcd } from "./GrilleTcd";
import {
  AFFICHAGES_ORDONNES,
  AGREGATS_ORDONNES,
  calculerTcd,
  champsUtilises,
  configVide,
  libelleChamp,
  LIBELLES_AFFICHAGE,
  LIBELLES_AGREGAT,
  libelleValeur,
  nomPropose,
  seriesGraphique,
  sourceEffective,
  textePeriode,
  valeursIndisponibles,
  type Periode,
  type Zone,
  type Agregat,
  type Affichage,
  type Catalogue,
  type ConfigTcd,
  type Cube,
  type ResultatTcd,
  type SourceCatalogue,
} from "./moteur";
import { VoletChamps, type ActionsVolet } from "./VoletChamps";

export const MAX_CHAMPS = 8;
export const MAX_VALEURS = 6;

const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline shadow-sm";
const CHAMP = "h-9 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

export type FeuilleTcd = {
  cle: string;
  id: number | null;
  nom: string;
  config: ConfigTcd;
  mien: boolean;
  auteur: string;
  modifiee: boolean;
};

type Requete = Pick<ConfigTcd, "source" | "croisements" | "periodes">;

export function cleCube(config: Requete, champs: string[]) {
  return ["tcd-cube", config.source, [...champs].sort().join(","), [...config.croisements].sort().join(","), JSON.stringify(config.periodes)] as const;
}

export function chargerCube(config: Requete, champs: string[]): Promise<Cube> {
  const params = new URLSearchParams({
    source: config.source,
    champs: [...champs].sort().join(","),
    croisements: [...config.croisements].sort().join(","),
    periodes: JSON.stringify(config.periodes),
  });
  return api<Cube>(`/api/v1/statistiques/cube/?${params}`);
}

type Modele = { titre: string; detail: string; config: Partial<ConfigTcd> };

const MODELES: Modele[] = [
  { titre: "Effectif par corps et par sexe", detail: "Dossiers agents", config: { source: "agents", lignes: ["corps"], colonnes: ["sexe"] } },
  {
    titre: "Pyramide des âges",
    detail: "Tranches d'âge, femmes et hommes",
    config: { source: "agents", lignes: ["tranche_age"], colonnes: ["sexe"], graphique: { ...configVide().graphique, forme: "empilee-horizontale" } },
  },
  {
    titre: "Âge moyen par catégorie",
    detail: "Moyenne et âge le plus élevé",
    config: {
      source: "agents",
      lignes: ["categorie"],
      valeurs: [{ mesure: "age", agregat: "moyenne", affichage: "valeur" }, { mesure: "age", agregat: "max", affichage: "valeur" }],
    },
  },
  {
    titre: "Jours d'absence par nature et par année",
    detail: "Absences",
    config: { source: "absences", lignes: ["nature"], colonnes: ["annee"], valeurs: [{ mesure: "jours", agregat: "somme", affichage: "valeur" }] },
  },
  {
    titre: "Actes par domaine et par statut",
    detail: "Part de chaque statut dans le domaine",
    config: {
      source: "actes",
      lignes: ["domaine"],
      colonnes: ["statut"],
      valeurs: [{ mesure: "nombre", agregat: "nombre", affichage: "pct_ligne" }],
      graphique: { ...configVide().graphique, forme: "pourcentage" },
    },
  },
];

export function TableauCroise({ feuille, catalogue, onChange, onEnregistrer, onDupliquer, onSupprimer, enregistrement }: {
  feuille: FeuilleTcd;
  catalogue: Catalogue | undefined;
  onChange: (modifier: (feuille: FeuilleTcd) => FeuilleTcd) => void;
  onEnregistrer: () => void;
  onDupliquer: () => void;
  onSupprimer: () => void;
  enregistrement: boolean;
}) {
  const feedback = useFeedback();
  const [volet, setVolet] = useState(false);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [reglage, setReglage] = useState<number | null>(null);
  const config = feuille.config;
  const source = sourceEffective(catalogue, config);
  const champs = champsUtilises(config);
  const [refus, setRefus] = useState<string | null>(null);
  const [periode, setPeriode] = useState<string | null>(null);

  const requete = useQuery({
    queryKey: cleCube(config, champs),
    queryFn: () => chargerCube(config, champs),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const cube = requete.data?.source.code === config.source ? requete.data : undefined;
  const resultat = useMemo(() => calculerTcd(cube, config), [cube, config]);

  // Tant que le nom n'a pas été saisi, il se recompose à chaque changement du tableau.
  function modifier(transformer: (config: ConfigTcd) => ConfigTcd | null) {
    onChange((courante) => {
      const suivante = transformer(courante.config);
      if (!suivante) return courante;
      const nom = suivante.nom_auto ? nomPropose(suivante, sourceEffective(catalogue, suivante)) : courante.nom;
      return { ...courante, nom, config: suivante, modifiee: true };
    });
  }

  function croiser(code: string) {
    const choix = source?.croisements?.find((item) => item.code === code);
    if (!choix) return;
    if (!choix.possible) {
      setRefus(`Croisement impossible avec « ${choix.libelle} ». ${choix.motif}`);
      return;
    }
    setRefus(null);
    modifier((courante) => (courante.croisements.includes(code) ? null : { ...courante, croisements: [...courante.croisements, code] }));
  }

  function decroiser(code: string) {
    const prefixe = `x.${code}.`;
    modifier((courante) => {
      const garde = (champ: string) => !champ.startsWith(prefixe);
      const selections = Object.fromEntries(Object.entries(courante.selections).filter(([champ]) => garde(champ)));
      const valeurs = courante.valeurs.filter((valeur) => garde(valeur.mesure));
      const periodes = { ...courante.periodes };
      delete periodes[code];
      return {
        ...courante,
        periodes,
        croisements: courante.croisements.filter((item) => item !== code),
        filtres: courante.filtres.filter(garde),
        colonnes: courante.colonnes.filter(garde),
        lignes: courante.lignes.filter(garde),
        selections,
        valeurs: valeurs.length ? valeurs : configVide().valeurs,
      };
    });
  }

  /** Deux sources croisées ne se détaillent pas ensemble : la seconde est refusée, avec la raison. */
  function detailRefuse(code: string): string | null {
    const champ = source?.champs.find((item) => item.code === code);
    if (!champ?.detail) return null;
    const autre = champsUtilises(config)
      .map((place) => source?.champs.find((item) => item.code === place))
      .find((item) => item?.detail && item.detail !== champ.detail);
    if (!autre) return null;
    return `« ${champ.groupe} · ${champ.libelle} » ne peut pas s'ajouter : le tableau détaille déjà « ${autre.groupe} » avec « ${autre.libelle} ». `
      + `Chaque enregistrement de l'une serait répété pour chaque enregistrement de l'autre et les totaux seraient faux : `
      + `gardez le détail d'une seule source. Les autres restent disponibles en « oui / non » et en totaux par agent.`;
  }

  function placer(code: string, zone: Exclude<Zone, "valeurs">, position?: number) {
    modifier((courante) => {
      const dejaPlace = champsUtilises(courante).includes(code);
      if (!dejaPlace && champsUtilises(courante).length >= MAX_CHAMPS) {
        feedback.toast("Tableau complet", `Un tableau croise au plus ${MAX_CHAMPS} champs.`, "error");
        return null;
      }
      const depart = (["filtres", "colonnes", "lignes"] as const).find((item) => courante[item].includes(code));
      const ancien = depart ? courante[depart].indexOf(code) : -1;
      const suivante: ConfigTcd = {
        ...courante,
        filtres: courante.filtres.filter((item) => item !== code),
        colonnes: courante.colonnes.filter((item) => item !== code),
        lignes: courante.lignes.filter((item) => item !== code),
      };
      const liste = [...suivante[zone]];
      let rang = position ?? liste.length;
      if (depart === zone && ancien >= 0 && rang > ancien) rang -= 1;
      liste.splice(Math.max(0, Math.min(rang, liste.length)), 0, code);
      return { ...suivante, [zone]: liste, replies: zone === "lignes" || depart === "lignes" ? [] : suivante.replies };
    });
  }

  const actions: ActionsVolet = {
    placerChamp: (code, zone, position) => {
      const motif = detailRefuse(code);
      if (motif) {
        setRefus(motif);
        return;
      }
      placer(code, zone, position);
    },
    retirerChamp: (code) => modifier((courante) => {
      const selections = { ...courante.selections };
      delete selections[code];
      return {
        ...courante,
        filtres: courante.filtres.filter((item) => item !== code),
        colonnes: courante.colonnes.filter((item) => item !== code),
        lignes: courante.lignes.filter((item) => item !== code),
        selections,
        replies: courante.lignes.includes(code) ? [] : courante.replies,
      };
    }),
    ajouterValeur: (mesure, position) => modifier((courante) => {
      if (courante.valeurs.length >= MAX_VALEURS) {
        feedback.toast("Valeurs complètes", `Un tableau affiche au plus ${MAX_VALEURS} valeurs.`, "error");
        return null;
      }
      const numerique = source?.mesures.find((item) => item.code === mesure)?.numerique ?? false;
      const valeurs = [...courante.valeurs];
      valeurs.splice(position ?? valeurs.length, 0, { mesure, agregat: numerique ? "somme" : "nombre", affichage: "valeur" });
      return { ...courante, valeurs };
    }),
    deplacerValeur: (indice, position) => modifier((courante) => {
      const valeurs = [...courante.valeurs];
      const [element] = valeurs.splice(indice, 1);
      if (!element) return null;
      valeurs.splice(position > indice ? position - 1 : position, 0, element);
      return { ...courante, valeurs };
    }),
    retirerValeur: (indice) => modifier((courante) => {
      const valeurs = courante.valeurs.filter((_, rang) => rang !== indice);
      return { ...courante, valeurs: valeurs.length ? valeurs : configVide().valeurs };
    }),
    filtrer: (code) => setFiltre(code),
    regler: (indice) => setReglage(indice),
  };

  const vierge = !config.lignes.length && !config.colonnes.length && !config.filtres.length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
      <div className="min-w-0 space-y-4">
        <BarreOutils
          feuille={feuille}
          catalogue={catalogue}
          enCours={requete.isFetching}
          enregistrement={enregistrement}
          onNom={(nom) => onChange((courante) => {
            // Un nom effacé redevient le nom proposé, qui suit de nouveau le tableau.
            const auto = !nom.trim();
            const config = { ...courante.config, nom_auto: auto };
            return { ...courante, config, nom: auto ? nomPropose(config, sourceEffective(catalogue, config)) : nom, modifiee: true };
          })}
          onNomAuto={() => modifier((courante) => ({ ...courante, nom_auto: true }))}
          onSource={(code) => {
            setRefus(null);
            modifier((courante) => (code === courante.source ? null : { ...configVide(code), graphique: courante.graphique, options: courante.options, nom_auto: courante.nom_auto }));
          }}
          source={source}
          refus={refus}
          onFermerRefus={() => setRefus(null)}
          onCroiser={croiser}
          onDecroiser={decroiser}
          onPeriode={setPeriode}
          onActualiser={() => void requete.refetch()}
          onEnregistrer={onEnregistrer}
          onDupliquer={onDupliquer}
          onSupprimer={onSupprimer}
          onExporter={() => {
            if (!cube) return;
            exporterClasseurTcd([{ nom: feuille.nom, config, cube, source }]);
            feedback.toast("Classeur prêt", "Le tableau, son graphique Excel et ses données sont dans le fichier.");
          }}
          onVolet={() => setVolet((valeur) => !valeur)}
          modifier={modifier}
          resultat={resultat}
        />

        <section className={`${CARTE} p-4 sm:p-5`}>
          {config.filtres.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Filtres du rapport</span>
              {config.filtres.map((code) => (
                <button key={code} type="button" className="inline-flex items-center gap-2 rounded border border-outline-variant bg-secondary-container/30 px-3 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-secondary-container/50" onClick={() => setFiltre(code)}>
                  <span className="font-semibold">{libelleChamp(code, source)}</span>
                  <span className="text-on-surface-variant">{resumeSelection(code, config, resultat)}</span>
                  <Icone nom="expand_more" />
                </button>
              ))}
            </div>
          )}
          {[...config.lignes, ...config.colonnes].some((code) => config.selections[code]) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">Éléments masqués</span>
              {[...config.lignes, ...config.colonnes].filter((code) => config.selections[code]).map((code) => (
                <span key={code} className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 font-body-sm text-body-sm text-on-surface">
                  <button type="button" className="hover:underline" onClick={() => setFiltre(code)}>
                    {libelleChamp(code, source)} : {resumeSelection(code, config, resultat)}
                  </button>
                  <button
                    type="button"
                    className="ml-1 text-on-surface-variant hover:text-error"
                    aria-label={`Effacer le filtre sur ${libelleChamp(code, source)}`}
                    onClick={() => modifier((courante) => {
                      const selections = { ...courante.selections };
                      delete selections[code];
                      return { ...courante, selections };
                    })}
                  >
                    <Icone nom="close" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {cube?.detail && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2 font-body-sm text-body-sm text-on-surface">
              <Icone nom="info" className="mt-0.5 shrink-0 text-primary" />
              <span>
                Détail de « {source?.croisements?.find((item) => item.code === cube.detail)?.libelle ?? cube.detail} » : un agent compte une fois
                dans chaque élément où il apparaît, mais une seule fois dans les sous-totaux et le total. Le nombre compte des agents distincts ;
                les autres mesures de cette source portent sur ses enregistrements.
              </span>
            </p>
          )}
          {valeursIndisponibles(cube, config).length > 0 && (
            <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-error/40 bg-error/5 px-3 py-2 font-body-sm text-body-sm text-on-surface">
              <Icone nom="warning" className="mt-0.5 shrink-0 text-error" />
              <span>
                {valeursIndisponibles(cube, config).map((valeur) => `« ${libelleValeur(valeur, source)} »`).join(", ")} ne se calcule pas ici : quand une source
                croisée est détaillée, un agent peut figurer sur plusieurs lignes et ses valeurs propres seraient comptées plusieurs fois.
                Retirez ces valeurs ou le champ détaillé.
              </span>
            </p>
          )}
          {requete.isError && !cube && (
            <p className="text-error">{requete.error instanceof ApiError ? requete.error.message : "Le tableau n'a pas pu être calculé."}</p>
          )}
          {!cube && requete.isLoading && <Chargement />}
          {cube && (
            <>
              {vierge && <Modeles onChoisir={(modele) => modifier((courante) => ({ ...configVide(), ...modele.config, graphique: { ...configVide().graphique, ...modele.config.graphique }, nom_auto: courante.nom_auto }))} />}
              {resultat.vide ? (
                <p className="rounded-lg bg-surface-container-low px-4 py-6 text-center font-body-md text-body-md text-on-surface-variant">
                  Aucun enregistrement ne correspond aux filtres.
                </p>
              ) : (
                <div className={requete.isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                  <GrilleTcd
                    resultat={resultat}
                    config={config}
                    source={source}
                    onBasculer={(cle) => modifier((courante) => ({
                      ...courante,
                      replies: courante.replies.includes(cle) ? courante.replies.filter((item) => item !== cle) : [...courante.replies, cle],
                    }))}
                  />
                </div>
              )}
              <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
                {cube.source.libelle} · {nombre(resultat.enregistrements)} enregistrement{resultat.enregistrements > 1 ? "s" : ""} retenu{resultat.enregistrements > 1 ? "s" : ""} sur {nombre(cube.total)}
                {" · "}calculé à {new Date(cube.calcule_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </>
          )}
        </section>

        {config.graphique.visible ? (
          cube && !resultat.vide && <PanneauGraphique feuille={feuille} resultat={resultat} source={source} modifier={modifier} />
        ) : (
          <button type="button" className={BOUTON_SECONDAIRE} onClick={() => modifier((courante) => ({ ...courante, graphique: { ...courante.graphique, visible: true } }))}>
            <Icone nom="bar_chart" className="text-lg" />
            Afficher le graphique croisé
          </button>
        )}
      </div>

      <aside className={`${CARTE} p-4 xl:sticky xl:top-[calc(var(--haut-entete,4rem)+1rem)] order-first xl:order-none ${volet ? "block" : "hidden"} xl:block`}>
        <VoletChamps config={config} source={source} actions={actions} onFermer={() => setVolet(false)} />
      </aside>

      {filtre && (
        <DialogueFiltre
          code={filtre}
          config={config}
          cube={cube}
          source={source}
          onClose={() => setFiltre(null)}
          onValider={(exclus) => {
            modifier((courante) => {
              const selections = { ...courante.selections };
              if (exclus.length) selections[filtre] = { exclus };
              else delete selections[filtre];
              return { ...courante, selections };
            });
            setFiltre(null);
          }}
        />
      )}
      {periode && (
        <DialoguePeriode
          libelle={source?.croisements?.find((item) => item.code === periode)?.libelle ?? periode}
          annees={source?.croises?.[periode]?.annees ?? []}
          initiale={config.periodes[periode] ?? { de: null, a: null }}
          onClose={() => setPeriode(null)}
          onValider={(choix) => {
            const code = periode;
            modifier((courante) => {
              const periodes = { ...courante.periodes };
              if (choix.de === null && choix.a === null) delete periodes[code];
              else periodes[code] = choix;
              return { ...courante, periodes };
            });
            setPeriode(null);
          }}
        />
      )}
      {reglage !== null && config.valeurs[reglage] && (
        <DialogueValeur
          indice={reglage}
          config={config}
          source={source}
          onClose={() => setReglage(null)}
          onValider={(valeur) => {
            modifier((courante) => ({ ...courante, valeurs: courante.valeurs.map((item, rang) => (rang === reglage ? valeur : item)) }));
            setReglage(null);
          }}
        />
      )}
    </div>
  );
}

function resumeSelection(code: string, config: ConfigTcd, resultat: ResultatTcd): string {
  const choix = config.selections[code];
  const toutes = resultat.modalites[code] ?? [];
  if (!choix) return "(Tous)";
  const retenues = toutes.filter((valeur) => (choix.inclus ? choix.inclus.includes(valeur) : !(choix.exclus ?? []).includes(valeur)));
  if (retenues.length === toutes.length) return "(Tous)";
  if (retenues.length === 0) return "(Aucun)";
  if (retenues.length <= 2) return retenues.join(", ");
  return `${retenues.length} sur ${toutes.length}`;
}

function Chargement() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Calcul du tableau">
      {Array.from({ length: 6 }, (_, indice) => <div key={indice} className="h-8 animate-pulse rounded bg-surface-container-low" />)}
    </div>
  );
}

function Modeles({ onChoisir }: { onChoisir: (modele: Modele) => void }) {
  return (
    <div className="mb-5 rounded-lg border border-dashed border-outline-variant p-4">
      <p className="font-label-md text-label-md text-on-surface">Composez le tableau</p>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
        Faites glisser des champs vers les zones Lignes, Colonnes et Filtres, et des mesures vers Valeurs. Ou partez d'un modèle :
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {MODELES.map((modele) => (
          <button key={modele.titre} type="button" className="rounded-lg border border-hairline bg-surface-container-low/60 px-3 py-2 text-left hover:border-primary hover:bg-primary/5" onClick={() => onChoisir(modele)}>
            <span className="block font-label-md text-label-md text-on-surface">{modele.titre}</span>
            <span className="block font-body-sm text-body-sm text-on-surface-variant">{modele.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BarreOutils({ feuille, catalogue, enCours, enregistrement, onNom, onNomAuto, onSource, source, refus, onFermerRefus, onCroiser, onDecroiser, onPeriode, onActualiser, onEnregistrer, onDupliquer, onSupprimer, onExporter, onVolet, modifier, resultat }: {
  feuille: FeuilleTcd;
  catalogue: Catalogue | undefined;
  onNomAuto: () => void;
  source: SourceCatalogue | undefined;
  refus: string | null;
  onFermerRefus: () => void;
  onCroiser: (code: string) => void;
  onDecroiser: (code: string) => void;
  onPeriode: (code: string) => void;
  enCours: boolean;
  enregistrement: boolean;
  onNom: (nom: string) => void;
  onSource: (code: string) => void;
  onActualiser: () => void;
  onEnregistrer: () => void;
  onDupliquer: () => void;
  onSupprimer: () => void;
  onExporter: () => void;
  onVolet: () => void;
  modifier: (transformer: (config: ConfigTcd) => ConfigTcd | null) => void;
  resultat: ResultatTcd;
}) {
  const config = feuille.config;
  const groupes = resultat.lignes.filter((ligne) => ligne.groupe).map((ligne) => ligne.noeud.cle);
  return (
    <section className={`${CARTE} p-4 sm:p-5 space-y-3`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
            Nom du tableau
            <input className={`${CHAMP} font-label-md`} value={feuille.nom} maxLength={160} onChange={(event) => onNom(event.target.value)} />
          </label>
          <p className="flex flex-wrap items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
            {config.nom_auto ? "Nom composé d'après le tableau : il suit vos changements." : "Nom saisi."}
            {!config.nom_auto && (
              <button type="button" className="text-primary hover:underline" onClick={onNomAuto}>Revenir au nom composé</button>
            )}
          </p>
        </div>
        <label className="flex flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant lg:w-60">
          Source de données
          <select className={CHAMP} value={config.source} onChange={(event) => onSource(event.target.value)}>
            {(catalogue?.sources ?? []).map((item) => <option key={item.code} value={item.code}>{item.libelle}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Croiser avec</span>
        {config.croisements.map((code) => (
          <span key={code} className="inline-flex items-center gap-1 self-start rounded-full bg-primary/10 px-3 py-1 font-body-sm text-body-sm text-on-surface">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 hover:underline"
              title="Choisir la période de cette source"
              onClick={() => onPeriode(code)}
            >
              {source?.croisements?.find((item) => item.code === code)?.libelle ?? code}
              <span className="text-on-surface-variant">· {textePeriode(config.periodes[code]) || "toutes les années"}</span>
              <Icone nom="date_range" />
            </button>
            <button type="button" className="ml-1 text-on-surface-variant hover:text-error" aria-label={`Ne plus croiser avec ${code}`} onClick={() => onDecroiser(code)}>
              <Icone nom="close" />
            </button>
          </span>
        ))}
        <select
          className={`${CHAMP} sm:w-64`}
          value=""
          aria-label="Croiser avec une autre source"
          onChange={(event) => onCroiser(event.target.value)}
        >
          <option value="">{config.croisements.length ? "Ajouter une source…" : "Choisir une source…"}</option>
          {(source?.croisements ?? []).filter((item) => !config.croisements.includes(item.code)).map((item) => (
            <option key={item.code} value={item.code}>{item.possible ? item.libelle : `${item.libelle} — impossible`}</option>
          ))}
        </select>
      </div>
      {refus && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-error/40 bg-error/5 px-3 py-2 font-body-sm text-body-sm text-on-surface">
          <Icone nom="warning" className="mt-0.5 shrink-0 text-error" />
          <p className="flex-1">{refus}</p>
          <button type="button" className="shrink-0 text-on-surface-variant hover:text-on-surface" aria-label="Fermer le message" onClick={onFermerRefus}>
            <Icone nom="close" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BOUTON_PRIMAIRE} onClick={onEnregistrer} disabled={enregistrement || (!feuille.modifiee && feuille.id !== null)}>
          <Icone nom="save" className="text-lg" />
          {feuille.id !== null && !feuille.mien ? "Enregistrer une copie" : "Enregistrer"}
        </button>
        <button type="button" className={BOUTON_SECONDAIRE} onClick={onActualiser} disabled={enCours}>
          <Icone nom="refresh" className={`text-lg${enCours ? " motion-spin" : ""}`} />
          Actualiser
        </button>
        <Deroulant libelle="Disposition" icone="tune">
          <div className="w-72 space-y-3 p-2">
            <fieldset className="flex flex-col gap-1">
              <legend className="font-label-sm text-label-sm text-on-surface-variant">Trier les lignes</legend>
              {([
                ["libelle-asc", "Étiquette, de A à Z"],
                ["libelle-desc", "Étiquette, de Z à A"],
                ["valeur-desc", "Première valeur, décroissante"],
                ["valeur-asc", "Première valeur, croissante"],
              ] as const).map(([code, libelle]) => {
                const actuel = `${config.tri.par}-${config.tri.sens}` === code;
                return (
                  <button
                    key={code}
                    type="button"
                    className={`w-full rounded px-2 py-1.5 text-left font-label-md text-label-md hover:bg-surface-container-low ${actuel ? "bg-surface-container-low font-bold" : "text-on-surface"}`}
                    aria-pressed={actuel}
                    onClick={() => {
                      const [par, sens] = code.split("-") as [ConfigTcd["tri"]["par"], ConfigTcd["tri"]["sens"]];
                      modifier((courante) => ({ ...courante, tri: { par, sens } }));
                    }}
                  >
                    {libelle}
                  </button>
                );
              })}
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="font-label-sm text-label-sm text-on-surface-variant">Totaux</legend>
              <Case libelle="Sous-totaux des groupes" coche={config.options.sous_totaux} onChange={(valeur) => modifier((courante) => ({ ...courante, options: { ...courante.options, sous_totaux: valeur } }))} />
              <Case libelle="Ligne « Total général »" coche={config.options.total_lignes} onChange={(valeur) => modifier((courante) => ({ ...courante, options: { ...courante.options, total_lignes: valeur } }))} />
              <Case libelle="Colonne « Total général »" coche={config.options.total_colonnes} onChange={(valeur) => modifier((courante) => ({ ...courante, options: { ...courante.options, total_colonnes: valeur } }))} />
            </fieldset>
            {groupes.length > 0 && (
              <div className="flex gap-2">
                <button type="button" className={`${BOUTON_SECONDAIRE} flex-1`} onClick={() => modifier((courante) => ({ ...courante, replies: [] }))}>
                  <Icone nom="unfold_more" />
                  Tout développer
                </button>
                <button type="button" className={`${BOUTON_SECONDAIRE} flex-1`} onClick={() => modifier((courante) => ({ ...courante, replies: groupes }))}>
                  <Icone nom="unfold_less" />
                  Tout réduire
                </button>
              </div>
            )}
          </div>
        </Deroulant>
        <button type="button" className={BOUTON_SECONDAIRE} onClick={onExporter} disabled={resultat.vide && !resultat.enregistrements}>
          <Icone nom="download" className="text-lg" />
          Exporter (Excel)
        </button>
        <button type="button" className={`${BOUTON_SECONDAIRE} xl:hidden`} onClick={onVolet}>
          <Icone nom="format_list_bulleted" className="text-lg" />
          Champs
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onDupliquer}>
            <Icone nom="content_copy" className="text-lg" />
            Dupliquer
          </button>
          {(feuille.mien || feuille.id === null) && (
            <button type="button" className={`${BOUTON_SECONDAIRE} text-error`} onClick={onSupprimer}>
              <Icone nom="delete" className="text-lg" />
              Supprimer
            </button>
          )}
        </div>
      </div>
      {feuille.id !== null && !feuille.mien && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Tableau de {feuille.auteur}. Vos changements restent sur cet écran ; « Enregistrer une copie » les garde dans un tableau à vous.
        </p>
      )}
    </section>
  );
}

function Case({ libelle, coche, onChange }: { libelle: string; coche: boolean; onChange: (valeur: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
      <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={coche} onChange={(event) => onChange(event.target.checked)} />
      {libelle}
    </label>
  );
}

function Deroulant({ libelle, icone, children }: { libelle: string; icone: string; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (event: PointerEvent) => {
      if (!boite.current?.contains(event.target as Node)) setOuvert(false);
    };
    const clavier = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOuvert(false);
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);
  return (
    <div className="relative" ref={boite}>
      <button type="button" className={BOUTON_SECONDAIRE} aria-expanded={ouvert} aria-haspopup="dialog" onClick={() => setOuvert((valeur) => !valeur)}>
        <Icone nom={icone} className="text-lg" />
        {libelle}
        <Icone nom={ouvert ? "expand_less" : "expand_more"} />
      </button>
      {ouvert && (
        <div role="dialog" aria-label={libelle} className="menu-flottant absolute left-0 top-full z-50 mt-1 rounded-lg border p-1 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

function PanneauGraphique({ feuille, resultat, source, modifier }: {
  feuille: FeuilleTcd;
  resultat: ResultatTcd;
  source: SourceCatalogue | undefined;
  modifier: (transformer: (config: ConfigTcd) => ConfigTcd | null) => void;
}) {
  const reglages = feuille.config.graphique;
  const { series } = useMemo(() => seriesGraphique(resultat, feuille.config, source), [resultat, feuille.config, source]);
  const circulaire = reglages.forme === "secteur" || reglages.forme === "anneau" || reglages.forme === "entonnoir";
  const regler = (partiel: Partial<ConfigTcd["graphique"]>) => modifier((courante) => ({ ...courante, graphique: { ...courante.graphique, ...partiel } }));
  const bascule = (actif: boolean) => `inline-flex size-9 items-center justify-center rounded border ${actif ? "border-2 border-primary bg-primary/10 text-primary" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant"} hover:bg-surface-container-low`;
  const titre = reglages.titre || feuille.nom;
  return (
    <section className={`${CARTE} p-4 sm:p-5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-label-sm text-label-sm text-on-surface-variant">
          Titre du graphique croisé
          <input className={CHAMP} value={reglages.titre} maxLength={160} placeholder={feuille.nom} onChange={(event) => regler({ titre: event.target.value })} />
        </label>
        <div className="flex flex-wrap items-center gap-1">
          <ChoixForme forme={reglages.forme} onChange={(forme) => regler({ forme })} />
          <button type="button" className={bascule(reglages.etiquettes)} aria-pressed={reglages.etiquettes} title="Étiquettes de données" aria-label="Étiquettes de données" onClick={() => regler({ etiquettes: !reglages.etiquettes })}>
            <Icone nom="label" />
          </button>
          <button type="button" className={bascule(reglages.legende)} aria-pressed={reglages.legende} title="Légende" aria-label="Légende" onClick={() => regler({ legende: !reglages.legende })}>
            <Icone nom="format_list_bulleted" />
          </button>
          <button type="button" className={bascule(reglages.inverser)} aria-pressed={reglages.inverser} title="Intervertir lignes et colonnes" aria-label="Intervertir lignes et colonnes" onClick={() => regler({ inverser: !reglages.inverser })}>
            <Icone nom="swap_horiz" />
          </button>
          <button type="button" className={bascule(false)} title="Masquer le graphique" aria-label="Masquer le graphique" onClick={() => regler({ visible: false })}>
            <Icone nom="visibility_off" />
          </button>
        </div>
      </div>
      <h3 className="mt-4 text-center font-label-md text-label-md text-on-surface">{titre}</h3>
      {circulaire && series.length > 1 && (
        <p className="mt-1 text-center font-body-sm text-body-sm text-on-surface-variant">Ce graphique montre la série « {series[series.length - 1]?.nom} ». Intervertissez lignes et colonnes pour changer de série.</p>
      )}
      <Toile forme={reglages.forme} series={series} etiquettes={reglages.etiquettes} legende={reglages.legende} hauteur={360} titre={titre} />
    </section>
  );
}

function DialogueFiltre({ code, config, cube, source, onClose, onValider }: {
  code: string;
  config: ConfigTcd;
  cube: Cube | undefined;
  source: SourceCatalogue | undefined;
  onClose: () => void;
  onValider: (exclus: string[]) => void;
}) {
  const indice = cube?.champs.findIndex((champ) => champ.code === code) ?? -1;
  const comptes = useMemo(() => {
    const totaux = new Map<string, number>();
    if (!cube || indice < 0) return totaux;
    for (const groupe of cube.groupes) totaux.set(groupe.v[indice], (totaux.get(groupe.v[indice]) ?? 0) + groupe.n);
    return totaux;
  }, [cube, indice]);
  const modalites = useMemo(() => [...comptes.keys()].sort(new Intl.Collator("fr", { numeric: true }).compare), [comptes]);
  const choix = config.selections[code];
  const [exclus, setExclus] = useState<Set<string>>(() => new Set(
    choix?.inclus ? modalites.filter((valeur) => !choix.inclus?.includes(valeur)) : choix?.exclus ?? [],
  ));
  const [recherche, setRecherche] = useState("");
  const visibles = modalites.filter((valeur) => valeur.toLowerCase().includes(recherche.trim().toLowerCase()));
  const toutes = visibles.every((valeur) => !exclus.has(valeur));

  return (
    <Modale
      titre={`Filtrer : ${libelleChamp(code, source)}`}
      sousTitre="Décochez les éléments à masquer. Les totaux se recalculent sans eux."
      icone="filter_alt"
      taille="sm"
      onClose={onClose}
      onSubmit={() => onValider(modalites.filter((valeur) => exclus.has(valeur)))}
      libelleValider="Appliquer"
    >
      {!cube ? <p className="text-on-surface-variant">Chargement des éléments…</p> : (
        <div className="space-y-3">
          <input className={`${CHAMP} w-full`} type="search" value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher un élément" aria-label="Rechercher un élément" />
          <label className="flex items-center gap-2 border-b border-hairline pb-2 font-label-md text-label-md text-on-surface">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={toutes}
              onChange={() => setExclus((courant) => {
                const suivant = new Set(courant);
                visibles.forEach((valeur) => (toutes ? suivant.add(valeur) : suivant.delete(valeur)));
                return suivant;
              })}
            />
            (Tout sélectionner)
          </label>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {visibles.map((valeur) => (
              <li key={valeur}>
                <label className="flex items-center gap-2 rounded px-1 py-0.5 font-body-sm text-body-sm text-on-surface hover:bg-surface-container-low">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={!exclus.has(valeur)}
                    onChange={(event) => setExclus((courant) => {
                      const suivant = new Set(courant);
                      if (event.target.checked) suivant.delete(valeur);
                      else suivant.add(valeur);
                      return suivant;
                    })}
                  />
                  <span className="flex-1">{valeur}</span>
                  <span className="font-code-num text-code-num text-on-surface-variant">{nombre(comptes.get(valeur) ?? 0)}</span>
                </label>
              </li>
            ))}
          </ul>
          {exclus.size === modalites.length && modalites.length > 0 && (
            <p className="font-body-sm text-body-sm text-error">Tous les éléments sont masqués : le tableau sera vide.</p>
          )}
        </div>
      )}
    </Modale>
  );
}

function DialoguePeriode({ libelle, annees, initiale, onClose, onValider }: {
  libelle: string;
  annees: number[];
  initiale: Periode;
  onClose: () => void;
  onValider: (periode: Periode) => void;
}) {
  const [de, setDe] = useState(initiale.de);
  const [a, setA] = useState(initiale.a);
  const lire = (texte: string) => (texte ? Number(texte) : null);
  const choix = { de: de !== null && a !== null && de > a ? a : de, a: de !== null && a !== null && de > a ? de : a };
  return (
    <Modale
      titre={`Période : ${libelle}`}
      sousTitre="Seuls les enregistrements de ces années comptent : champ oui / non, totaux par agent et champs détaillés."
      icone="date_range"
      taille="sm"
      onClose={onClose}
      onSubmit={() => onValider(choix)}
      libelleValider="Appliquer"
    >
      {annees.length === 0 ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Aucun enregistrement daté dans cette source.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
            De
            <select className={CHAMP} value={de ?? ""} onChange={(event) => setDe(lire(event.target.value))}>
              <option value="">Le début</option>
              {[...annees].sort((x, y) => x - y).map((annee) => <option key={annee} value={annee}>{annee}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
            À
            <select className={CHAMP} value={a ?? ""} onChange={(event) => setA(lire(event.target.value))}>
              <option value="">Aujourd'hui</option>
              {annees.map((annee) => <option key={annee} value={annee}>{annee}</option>)}
            </select>
          </label>
        </div>
      )}
      <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
        {textePeriode(choix) ? `Période retenue : ${textePeriode(choix)}.` : "Toutes les années sont retenues."}
      </p>
    </Modale>
  );
}

function DialogueValeur({ indice, config, source, onClose, onValider }: {
  indice: number;
  config: ConfigTcd;
  source: SourceCatalogue | undefined;
  onClose: () => void;
  onValider: (valeur: ConfigTcd["valeurs"][number]) => void;
}) {
  const initiale = config.valeurs[indice];
  const [mesure, setMesure] = useState(initiale.mesure);
  const [agregat, setAgregat] = useState<Agregat>(initiale.agregat);
  const [affichage, setAffichage] = useState<Affichage>(initiale.affichage);
  const numerique = source?.mesures.find((item) => item.code === mesure)?.numerique ?? false;
  const calcul = numerique ? agregat : "nombre";
  return (
    <Modale
      titre="Paramètres des valeurs"
      sousTitre={libelleValeur({ mesure, agregat: calcul, affichage }, source)}
      icone="functions"
      taille="sm"
      onClose={onClose}
      onSubmit={() => onValider({ mesure, agregat: calcul, affichage })}
      libelleValider="Appliquer"
    >
      <div className="space-y-4">
        <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
          Mesure
          <select className={CHAMP} value={mesure} onChange={(event) => setMesure(event.target.value)}>
            {(source?.mesures ?? []).map((item) => <option key={item.code} value={item.code}>{item.code === "nombre" ? "Nombre d'enregistrements" : item.libelle}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
          Synthèse par
          <select className={CHAMP} value={calcul} disabled={!numerique} onChange={(event) => setAgregat(event.target.value as Agregat)}>
            {AGREGATS_ORDONNES.filter((item) => numerique || item === "nombre").map((item) => (
              <option key={item} value={item}>{item === "nombre" && numerique ? "Nombre de valeurs renseignées" : LIBELLES_AGREGAT[item]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label-md text-label-md text-on-surface">
          Afficher les valeurs
          <select className={CHAMP} value={affichage} onChange={(event) => setAffichage(event.target.value as Affichage)}>
            {AFFICHAGES_ORDONNES.map((item) => <option key={item} value={item}>{LIBELLES_AFFICHAGE[item]}</option>)}
          </select>
        </label>
      </div>
    </Modale>
  );
}
