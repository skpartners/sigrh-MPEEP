import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Icone } from "../../ui/Icone";
import { libelleValeur, type ConfigTcd, type SourceCatalogue, type Zone } from "./moteur";

const CHAMP = "h-9 w-full px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const TYPE_GLISSE = "application/x-sigrh-tcd";

export type Glisse =
  | { genre: "champ"; code: string; de: Zone | "liste" }
  | { genre: "mesure"; code: string; de: "liste" }
  | { genre: "valeur"; indice: number; de: "valeurs" };

/** Une position désigne l'élément devant lequel on insère, compté dans la liste avant le déplacement. */
export type ActionsVolet = {
  placerChamp: (code: string, zone: Exclude<Zone, "valeurs">, position?: number) => void;
  retirerChamp: (code: string) => void;
  ajouterValeur: (mesure: string, position?: number) => void;
  deplacerValeur: (indice: number, position: number) => void;
  retirerValeur: (indice: number) => void;
  filtrer: (code: string) => void;
  regler: (indice: number) => void;
};

const ZONES: { zone: Zone; titre: string; icone: string; aide: string }[] = [
  { zone: "filtres", titre: "Filtres", icone: "filter_alt", aide: "Restreint tout le tableau" },
  { zone: "colonnes", titre: "Colonnes", icone: "view_column", aide: "Une colonne par élément" },
  { zone: "lignes", titre: "Lignes", icone: "table_rows", aide: "Un groupe par élément" },
  { zone: "valeurs", titre: "Valeurs", icone: "functions", aide: "Ce qui est compté ou calculé" },
];

/** Volet des champs, comme dans Excel : la liste des champs de la source, puis les quatre zones. */
export function VoletChamps({ config, source, actions, onFermer }: {
  config: ConfigTcd;
  source: SourceCatalogue | undefined;
  actions: ActionsVolet;
  onFermer?: () => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [survol, setSurvol] = useState<Zone | null>(null);
  const utilises = new Set([...config.filtres, ...config.colonnes, ...config.lignes]);
  const mesuresUtilisees = new Set(config.valeurs.map((valeur) => valeur.mesure));
  const cherche = normaliser(recherche);
  const champs = (source?.champs ?? []).filter((champ) => !cherche || normaliser(`${champ.groupe} ${champ.libelle}`).includes(cherche));
  const propres = champs.filter((champ) => !champ.groupe);
  const groupes = [...new Set(champs.filter((champ) => champ.groupe).map((champ) => champ.groupe))];
  const mesures = (source?.mesures ?? []).filter((mesure) => !cherche || normaliser(`${mesure.groupe ?? ""} ${mesure.libelle}`).includes(cherche));

  function deposer(event: DragEvent, zone: Zone, position?: number) {
    event.preventDefault();
    event.stopPropagation();
    setSurvol(null);
    const brut = event.dataTransfer.getData(TYPE_GLISSE);
    if (!brut) return;
    const glisse = JSON.parse(brut) as Glisse;
    if (zone === "valeurs") {
      if (glisse.genre === "valeur") actions.deplacerValeur(glisse.indice, position ?? config.valeurs.length);
      else if (glisse.genre === "mesure") actions.ajouterValeur(glisse.code, position);
      return;
    }
    if (glisse.genre === "champ") actions.placerChamp(glisse.code, zone, position);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-label-md text-label-md font-semibold text-on-surface">Champs du tableau croisé</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Cochez un champ ou faites-le glisser vers une zone.</p>
        </div>
        {onFermer && (
          <button type="button" className="xl:hidden inline-flex size-8 items-center justify-center rounded hover:bg-surface-container-low" aria-label="Fermer le volet des champs" onClick={onFermer}>
            <Icone nom="close" />
          </button>
        )}
      </div>
      <input className={CHAMP} type="search" value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Rechercher un champ" aria-label="Rechercher un champ" />
      <div className="max-h-[19rem] overflow-y-auto rounded border border-hairline bg-surface-container-lowest p-1">
        <GroupeListe titre={source?.libelle ?? "Champs"}>
          {propres.map((champ) => (
            <ElementListe
              key={champ.code}
              libelle={champ.libelle}
              coche={utilises.has(champ.code)}
              glisse={{ genre: "champ", code: champ.code, de: "liste" }}
              onCocher={(coche) => (coche ? actions.placerChamp(champ.code, "lignes") : actions.retirerChamp(champ.code))}
            />
          ))}
        </GroupeListe>
        {groupes.map((groupe) => (
          <GroupeListe key={groupe} titre={groupe === "Agent" ? "Dossier de l'agent" : `Croisé : ${groupe}`}>
            {champs.filter((champ) => champ.groupe === groupe).map((champ) => (
              <ElementListe
                key={champ.code}
                libelle={champ.libelle}
                coche={utilises.has(champ.code)}
                glisse={{ genre: "champ", code: champ.code, de: "liste" }}
                onCocher={(coche) => (coche ? actions.placerChamp(champ.code, "lignes") : actions.retirerChamp(champ.code))}
              />
            ))}
          </GroupeListe>
        ))}
        <GroupeListe titre="Mesures (Σ)">
          {mesures.map((mesure) => (
            <ElementListe
              key={mesure.code}
              libelle={mesure.code === "nombre" ? "Nombre d'enregistrements" : mesure.groupe ? `${mesure.groupe} · ${mesure.libelle}` : mesure.libelle}
              mesure
              coche={mesuresUtilisees.has(mesure.code)}
              glisse={{ genre: "mesure", code: mesure.code, de: "liste" }}
              onCocher={(coche) => {
                if (coche) actions.ajouterValeur(mesure.code);
                else {
                  for (let indice = config.valeurs.length - 1; indice >= 0; indice -= 1) {
                    if (config.valeurs[indice].mesure === mesure.code) actions.retirerValeur(indice);
                  }
                }
              }}
            />
          ))}
        </GroupeListe>
        {!champs.length && !mesures.length && <p className="px-2 py-3 font-body-sm text-body-sm text-on-surface-variant">Aucun champ ne correspond.</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {ZONES.map(({ zone, titre, icone, aide }) => {
          const elements = zone === "valeurs" ? config.valeurs : config[zone];
          return (
            <section
              key={zone}
              aria-label={`Zone ${titre}`}
              className={`flex min-h-[7.5rem] flex-col rounded-lg border p-2 transition-colors ${survol === zone ? "border-primary bg-primary/5 border-dashed" : "border-hairline bg-surface-container-low/60"}`}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(TYPE_GLISSE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (survol !== zone) setSurvol(zone);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSurvol(null);
              }}
              onDrop={(event) => deposer(event, zone)}
            >
              <h3 className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold text-on-surface" title={aide}>
                <Icone nom={icone} className="text-primary" />
                {titre}
              </h3>
              <ul className="mt-1.5 flex flex-1 flex-col gap-1">
                {zone === "valeurs"
                  ? config.valeurs.map((valeur, indice) => (
                    <Puce
                      key={`${valeur.mesure}-${indice}`}
                      libelle={libelleValeur(valeur, source)}
                      glisse={{ genre: "valeur", indice, de: "valeurs" }}
                      onDeposer={(event) => deposer(event, "valeurs", indice)}
                      menu={[
                        { libelle: "Paramètres des valeurs…", icone: "tune", action: () => actions.regler(indice) },
                        ...(indice > 0 ? [{ libelle: "Monter", icone: "arrow_upward", action: () => actions.deplacerValeur(indice, indice - 1) }] : []),
                        ...(indice < config.valeurs.length - 1 ? [{ libelle: "Descendre", icone: "arrow_downward", action: () => actions.deplacerValeur(indice, indice + 2) }] : []),
                        ...(config.valeurs.length > 1 ? [{ libelle: "Retirer", icone: "close", action: () => actions.retirerValeur(indice), danger: true }] : []),
                      ]}
                    />
                  ))
                  : (elements as string[]).map((code, indice) => {
                    const champ = source?.champs.find((item) => item.code === code);
                    const liste = elements as string[];
                    const autres = (["filtres", "colonnes", "lignes"] as const).filter((cible) => cible !== zone);
                    const actif = Boolean(config.selections[code]);
                    return (
                      <Puce
                        key={code}
                        libelle={champ ? (champ.groupe ? `${champ.groupe} · ${champ.libelle}` : champ.libelle) : code}
                        filtre={actif}
                        glisse={{ genre: "champ", code, de: zone }}
                        onDeposer={(event) => deposer(event, zone, indice)}
                        menu={[
                          { libelle: actif ? "Modifier le filtre…" : "Filtrer les éléments…", icone: "filter_list", action: () => actions.filtrer(code) },
                          ...(indice > 0 ? [{ libelle: "Monter", icone: "arrow_upward", action: () => actions.placerChamp(code, zone as Exclude<Zone, "valeurs">, indice - 1) }] : []),
                          ...(indice < liste.length - 1 ? [{ libelle: "Descendre", icone: "arrow_downward", action: () => actions.placerChamp(code, zone as Exclude<Zone, "valeurs">, indice + 2) }] : []),
                          ...autres.map((cible) => ({
                            libelle: `Déplacer vers ${ZONES.find((item) => item.zone === cible)?.titre ?? cible}`,
                            icone: ZONES.find((item) => item.zone === cible)?.icone ?? "arrow_forward",
                            action: () => actions.placerChamp(code, cible),
                          })),
                          { libelle: "Retirer", icone: "close", action: () => actions.retirerChamp(code), danger: true },
                        ]}
                      />
                    );
                  })}
                {elements.length === 0 && (
                  <li className="flex flex-1 items-center justify-center rounded border border-dashed border-outline-variant px-2 py-3 text-center font-body-sm text-body-sm text-on-surface-variant">
                    Déposez ici
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function GroupeListe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-2 pb-1 font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">{titre}</p>
      <ul>{children}</ul>
    </div>
  );
}

function ElementListe({ libelle, coche, glisse, onCocher, mesure = false }: {
  libelle: string;
  coche: boolean;
  glisse: Glisse;
  onCocher: (coche: boolean) => void;
  mesure?: boolean;
}) {
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(TYPE_GLISSE, JSON.stringify(glisse));
        event.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-container-low cursor-grab active:cursor-grabbing"
    >
      <label className="flex min-w-0 flex-1 items-center gap-2 font-body-sm text-body-sm text-on-surface">
        <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={coche} onChange={(event) => onCocher(event.target.checked)} />
        {mesure && <span aria-hidden className="font-semibold text-primary">Σ</span>}
        <span className="truncate">{libelle}</span>
      </label>
      <Icone nom="drag_indicator" className="text-on-surface-variant opacity-0 group-hover:opacity-100" />
    </li>
  );
}

type EntreeMenu = { libelle: string; icone: string; action: () => void; danger?: boolean };

function Puce({ libelle, glisse, menu, onDeposer, filtre = false }: {
  libelle: string;
  glisse: Glisse;
  menu: EntreeMenu[];
  onDeposer: (event: DragEvent) => void;
  filtre?: boolean;
}) {
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(TYPE_GLISSE, JSON.stringify(glisse));
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(TYPE_GLISSE)) event.preventDefault();
      }}
      onDrop={onDeposer}
      className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container-lowest pl-1 shadow-sm cursor-grab active:cursor-grabbing"
    >
      <Icone nom="drag_indicator" className="shrink-0 text-on-surface-variant" />
      <span className="min-w-0 flex-1 truncate font-body-sm text-body-sm text-on-surface" title={libelle}>{libelle}</span>
      {filtre && <Icone nom="filter_alt" className="shrink-0 text-primary" />}
      <MenuPuce libelle={libelle} entrees={menu} />
    </li>
  );
}

function MenuPuce({ libelle, entrees }: { libelle: string; entrees: EntreeMenu[] }) {
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
    <div className="relative shrink-0" ref={boite}>
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Options de ${libelle}`}
        onClick={() => setOuvert((valeur) => !valeur)}
      >
        <Icone nom="expand_more" />
      </button>
      {ouvert && (
        <div role="menu" className="menu-flottant absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border p-1 shadow-lg">
          {entrees.map((entree) => (
            <button
              key={entree.libelle}
              type="button"
              role="menuitem"
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-body-sm text-body-sm hover:bg-surface-container-low ${entree.danger ? "text-error" : "text-on-surface"}`}
              onClick={() => {
                setOuvert(false);
                entree.action();
              }}
            >
              <Icone nom={entree.icone} />
              {entree.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
