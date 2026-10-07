import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BarChart, FunnelChart, LineChart, PieChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { init, use, type EChartsCoreOption, type EChartsType } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { telechargerClasseurGraphique } from "./classeurGraphique";
import { paletteGraphique, useCouleurs } from "./Couleurs";

use([
  BarChart,
  LineChart,
  PieChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

const TRAIT = "#64748b";
const ENCRE = "var(--color-tertiary)";
const CLAIR = "var(--color-tertiary-container)";
const FONCE = "var(--color-primary)";

/** Le canevas ignore la police du navigateur : la taille du texte suit celle de la racine (12px à 100 %). */
function styleTexte() {
  const racine = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return { fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: Math.round((12 * racine) / 16) };
}

const FORMES = [
  { code: "barre", libelle: "Barres", icone: IconeBarres },
  { code: "horizontale", libelle: "Barres horizontales", icone: IconeHorizontales },
  { code: "empilee", libelle: "Barres empilées", icone: IconeEmpilee },
  { code: "empilee-horizontale", libelle: "Barres empilées horizontales", icone: IconeEmpileeHorizontale },
  { code: "pourcentage", libelle: "Barres en pourcentage", icone: IconePourcentage },
  { code: "ligne", libelle: "Courbe", icone: IconeLigne },
  { code: "aire", libelle: "Aire", icone: IconeAire },
  { code: "points", libelle: "Courbe à points", icone: IconePoints },
  { code: "entonnoir", libelle: "Entonnoir", icone: IconeEntonnoir },
  { code: "secteur", libelle: "Secteurs", icone: IconeSecteur },
  { code: "anneau", libelle: "Anneau", icone: IconeAnneau },
] as const;

export type FormeGraphique = (typeof FORMES)[number]["code"];

export type PointGraphique = { libelle: string; total: number };
export type SerieGraphique = { nom: string; points: PointGraphique[] };

/** Graphique ECharts qui se redessine quand les données ou la forme changent. */
export function GraphiqueChoisi({
  series,
  defaut = "barre",
  hauteur = 280,
  titre = "Graphique",
  detail,
}: {
  series: SerieGraphique[];
  defaut?: FormeGraphique;
  hauteur?: number;
  titre?: string;
  detail?: string;
}) {
  const [forme, setForme] = useState<FormeGraphique>(defaut);
  const [etiquettes, setEtiquettes] = useState(true);
  const points = series.some((serie) => serie.points.some((point) => point.total !== 0));
  const circulaire = forme === "secteur" || forme === "anneau" || forme === "entonnoir";

  return (
    <div className="mt-4">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded border border-white/40 bg-white/60 backdrop-blur-sm hover:bg-white/90"
          title="Exporter les données en Excel"
          aria-label={`Exporter les données de ${titre} en Excel`}
          onClick={() => telechargerClasseurGraphique({ titre, detail, series })}
        >
          <IconeExcel />
        </button>
        <button
          type="button"
          className={`flex h-11 w-11 items-center justify-center rounded backdrop-blur-sm hover:bg-white/90 ${etiquettes ? "border-2 border-primary bg-primary/10" : "border border-white/40 bg-white/60"}`}
          aria-pressed={etiquettes}
          title="Étiquettes de données"
          aria-label={etiquettes ? "Masquer les étiquettes de données" : "Afficher les étiquettes de données"}
          onClick={() => setEtiquettes((valeur) => !valeur)}
        >
          <IconeEtiquette />
        </button>
        <ChoixForme forme={forme} onChange={setForme} />
      </div>
      {circulaire && series.length > 1 && (
        <p className="mt-1 text-right font-label-sm text-label-sm text-on-surface-variant">Ce graphique affiche {series[series.length - 1]?.nom}.</p>
      )}
      {points ? <Toile forme={forme} series={series} etiquettes={etiquettes} hauteur={hauteur} /> : (
        <p className="mt-4 font-body-sm text-body-sm text-on-surface-variant">Aucune donnée pour ce filtre.</p>
      )}
    </div>
  );
}

function ChoixForme({ forme, onChange }: { forme: FormeGraphique; onChange: (forme: FormeGraphique) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const titre = useId();
  const courant = FORMES.find((item) => item.code === forme) ?? FORMES[0];

  useEffect(() => {
    if (!ouvert) return;
    function dehors(event: PointerEvent) {
      if (!boite.current?.contains(event.target as Node)) setOuvert(false);
    }
    function clavier(event: KeyboardEvent) {
      if (event.key === "Escape") setOuvert(false);
    }
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);

  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded border border-white/40 bg-white/60 backdrop-blur-sm hover:bg-white/90"
        aria-label={`Type de graphique : ${courant.libelle}`}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        onClick={() => setOuvert((valeur) => !valeur)}
      >
        <courant.icone />
      </button>
      {ouvert && (
        <div
          role="listbox"
          aria-labelledby={titre}
          className="absolute right-0 top-full z-30 mt-1 grid w-max grid-cols-6 gap-1 rounded border border-white/40 bg-white/80 backdrop-blur-xl p-2 shadow-md"
        >
          <p id={titre} className="sr-only">Types de graphique</p>
          {FORMES.map((item) => {
            const choisi = item.code === forme;
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={choisi}
                title={item.libelle}
                aria-label={item.libelle}
                className={`flex h-11 w-11 items-center justify-center rounded ${choisi ? "border-2 border-primary bg-primary/10" : "border border-transparent bg-transparent hover:bg-white/70"}`}
                onClick={() => {
                  onChange(item.code);
                  setOuvert(false);
                }}
              >
                <item.icone />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toile({ forme, series, etiquettes, hauteur }: { forme: FormeGraphique; series: SerieGraphique[]; etiquettes: boolean; hauteur: number }) {
  const noeud = useRef<HTMLDivElement>(null);
  const graphique = useRef<EChartsType | null>(null);
  const couleurs = useCouleurs();

  useEffect(() => {
    const element = noeud.current;
    if (!element) return;
    const instance = init(element);
    graphique.current = instance;
    const observateur = new ResizeObserver(() => instance.resize());
    observateur.observe(element);
    return () => {
      observateur.disconnect();
      instance.dispose();
      graphique.current = null;
    };
  }, []);

  const signature = JSON.stringify(series);
  useEffect(() => {
    graphique.current?.setOption(option(forme, JSON.parse(signature) as SerieGraphique[], etiquettes, paletteGraphique(couleurs)), true);
  }, [forme, signature, etiquettes, couleurs]);

  // hauteur est donnée en px à la police par défaut ; en rem, le graphique grandit avec la police du navigateur.
  return <div ref={noeud} style={{ height: `${hauteur / 16}rem` }} role="img" aria-label="Graphique" />;
}

function option(forme: FormeGraphique, series: SerieGraphique[], etiquettes: boolean, palette: string[]): EChartsCoreOption {
  const source = series.length > 1 ? series[series.length - 1] : series[0];
  const categories = (series[0]?.points ?? []).map((point) => point.libelle);
  if (forme === "secteur" || forme === "anneau" || forme === "entonnoir") {
    const donnees = (source?.points ?? []).map((point) => ({ name: point.libelle, value: point.total }));
    return {
      color: palette,
      textStyle: styleTexte(),
      tooltip: { trigger: "item" },
      legend: { type: "scroll", bottom: 0 },
      series: [{
        type: forme === "entonnoir" ? "funnel" : "pie",
        radius: forme === "anneau" ? ["42%", "68%"] : "68%",
        center: ["50%", "44%"],
        sort: "descending",
        left: forme === "entonnoir" ? "12%" : undefined,
        width: forme === "entonnoir" ? "76%" : undefined,
        label: {
          show: etiquettes,
          formatter: (point: { name?: string; value?: number }) => `${point.name ?? ""}\n${formater(point.value, false)}`,
        },
        labelLine: { show: etiquettes },
        data: forme === "entonnoir" ? [...donnees].sort((a, b) => b.value - a.value) : donnees,
      }],
    };
  }
  const horizontale = forme === "horizontale" || forme === "empilee-horizontale";
  const courbe = forme === "ligne" || forme === "aire" || forme === "points";
  const empilee = forme === "empilee" || forme === "empilee-horizontale" || forme === "pourcentage";
  const valeurs = forme === "pourcentage" ? enPourcentage(series) : series;
  const beaucoup = categories.length > 8;
  const axeCategorie = { type: "category" as const, data: categories, axisLabel: { hideOverlap: true } };
  const axeValeur = { type: "value" as const, max: forme === "pourcentage" ? 100 : undefined };
  return {
    color: palette,
    textStyle: styleTexte(),
    tooltip: {
      trigger: "axis",
      valueFormatter: (valeur: unknown) => {
        if (typeof valeur !== "number") return "";
        return forme === "pourcentage" ? `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : valeur.toLocaleString("fr-FR");
      },
    },
    legend: series.length > 1 ? { bottom: 0 } : undefined,
    grid: { left: 8, right: etiquettes && horizontale ? 36 : 12, top: etiquettes && !horizontale ? 28 : 16, bottom: series.length > 1 || beaucoup ? 56 : 8, containLabel: true },
    dataZoom: beaucoup
      ? [{ type: "slider", start: 0, end: Math.round((8 / categories.length) * 100), ...(horizontale ? { yAxisIndex: 0 } : { xAxisIndex: 0 }) }]
      : undefined,
    xAxis: horizontale ? axeValeur : axeCategorie,
    yAxis: horizontale ? axeCategorie : axeValeur,
    series: valeurs.map((serie) => ({
      name: serie.nom,
      type: courbe ? "line" : "bar",
      stack: empilee ? "total" : undefined,
      areaStyle: forme === "aire" ? { opacity: 0.25 } : undefined,
      smooth: forme === "ligne" || forme === "aire",
      showSymbol: forme === "points" || etiquettes,
      symbolSize: forme === "points" ? 8 : 4,
      label: {
        show: etiquettes,
        position: empilee ? "inside" : horizontale ? "right" : "top",
        formatter: (point: { value?: number }) => formater(point.value, forme === "pourcentage"),
      },
      labelLayout: { hideOverlap: true },
      data: serie.points.map((point) => point.total),
    })),
  };
}

function formater(valeur: unknown, pourcentage: boolean): string {
  if (typeof valeur !== "number") return "";
  return pourcentage
    ? `${valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`
    : valeur.toLocaleString("fr-FR");
}

function enPourcentage(series: SerieGraphique[]): SerieGraphique[] {
  return series.map((serie) => ({
    ...serie,
    points: serie.points.map((point, index) => {
      const somme = series.reduce((total, autre) => total + (autre.points[index]?.total ?? 0), 0);
      return { ...point, total: somme ? Math.round((point.total / somme) * 1000) / 10 : 0 };
    }),
  }));
}

function IconeExcel() {
  return (
    <Cadre>
      <rect x="3" y="3" width="13" height="16" rx="1" fill="none" stroke={TRAIT} strokeWidth="1.2" />
      <path d="M3 8h13M3 12h13M7 8v11" stroke={TRAIT} strokeWidth="1" />
      <path d="M18 13v6M15.5 16.5 18 19l2.5-2.5" fill="none" style={{ stroke: ENCRE }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Cadre>
  );
}

function IconeEtiquette() {
  return (
    <Cadre>
      <rect x="4" y="12" width="5" height="8" style={{ fill: ENCRE }} />
      <rect x="15" y="8" width="5" height="12" style={{ fill: ENCRE }} />
      <text x="3" y="9" fill={TRAIT} fontSize="7" fontFamily="sans-serif">12</text>
      <text x="13" y="6" fill={TRAIT} fontSize="7" fontFamily="sans-serif">8</text>
    </Cadre>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      {children}
    </svg>
  );
}

function IconeBarres() {
  return (
    <Cadre>
      <rect x="3" y="12" width="4" height="8" style={{ fill: ENCRE }} />
      <rect x="10" y="6" width="4" height="14" style={{ fill: ENCRE }} />
      <rect x="17" y="9" width="4" height="11" style={{ fill: ENCRE }} />
      <path d="M2 21h20" stroke={TRAIT} strokeWidth="1.2" />
    </Cadre>
  );
}

function IconeHorizontales() {
  return (
    <Cadre>
      <rect x="3" y="4" width="14" height="4" style={{ fill: ENCRE }} />
      <rect x="3" y="10" width="18" height="4" style={{ fill: ENCRE }} />
      <rect x="3" y="16" width="10" height="4" style={{ fill: ENCRE }} />
    </Cadre>
  );
}

function IconeEmpilee() {
  return (
    <Cadre>
      <rect x="8" y="4" width="8" height="5" style={{ fill: ENCRE }} />
      <rect x="8" y="9" width="8" height="6" style={{ fill: CLAIR }} />
      <rect x="8" y="15" width="8" height="6" style={{ fill: FONCE }} />
      <path d="M2 21h20" stroke={TRAIT} strokeWidth="1.2" />
    </Cadre>
  );
}

function IconeEmpileeHorizontale() {
  return (
    <Cadre>
      <rect x="3" y="8" width="6" height="8" style={{ fill: ENCRE }} />
      <rect x="9" y="8" width="6" height="8" style={{ fill: CLAIR }} />
      <rect x="15" y="8" width="6" height="8" style={{ fill: FONCE }} />
    </Cadre>
  );
}

function IconePourcentage() {
  return (
    <Cadre>
      <rect x="5" y="4" width="5" height="16" style={{ fill: ENCRE }} />
      <rect x="5" y="4" width="5" height="6" style={{ fill: CLAIR }} />
      <rect x="14" y="4" width="5" height="16" style={{ fill: ENCRE }} />
      <rect x="14" y="4" width="5" height="10" style={{ fill: CLAIR }} />
      <path d="M2 21h20" stroke={TRAIT} strokeWidth="1.2" />
    </Cadre>
  );
}

function IconeLigne() {
  return (
    <Cadre>
      <path d="M3 16l5-6 4 3 8-8" fill="none" style={{ stroke: ENCRE }} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M2 21h20" stroke={TRAIT} strokeWidth="1.2" />
    </Cadre>
  );
}

function IconeAire() {
  return (
    <Cadre>
      <path d="M3 17l5-7 4 3 8-8v12H3z" style={{ fill: ENCRE }} opacity="0.85" />
      <path d="M2 21h20" stroke={TRAIT} strokeWidth="1.2" />
    </Cadre>
  );
}

function IconePoints() {
  return (
    <Cadre>
      <path d="M4 16l5-6 4 3 7-8" fill="none" style={{ stroke: ENCRE }} strokeWidth="1.6" />
      <circle cx="4" cy="16" r="1.6" style={{ fill: ENCRE }} />
      <circle cx="9" cy="10" r="1.6" style={{ fill: ENCRE }} />
      <circle cx="13" cy="13" r="1.6" style={{ fill: ENCRE }} />
      <circle cx="20" cy="5" r="1.6" style={{ fill: ENCRE }} />
    </Cadre>
  );
}

function IconeEntonnoir() {
  return (
    <Cadre>
      <path d="M4 4h16l-4 7v5l-8 3V11z" style={{ fill: ENCRE }} stroke={TRAIT} strokeWidth="1" />
    </Cadre>
  );
}

function IconeSecteur() {
  return (
    <Cadre>
      <path d="M12 12 L12 3 A9 9 0 1 1 5 17z" style={{ fill: ENCRE }} />
      <path d="M12 12 L5 17 A9 9 0 0 1 12 3z" style={{ fill: CLAIR }} />
    </Cadre>
  );
}

function IconeAnneau() {
  return (
    <Cadre>
      <path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" style={{ fill: ENCRE }} />
    </Cadre>
  );
}
