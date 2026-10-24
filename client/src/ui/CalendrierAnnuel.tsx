import { useMemo, useState } from "react";
import { Icone } from "./Icone";

export type Periodes = { debut: string; fin: string; debut2: string; fin2: string };
/** Congés choisis par un collègue de la même structure, validés ou non. */
export type Collegue = { matricule: string; nom: string; debut: string; fin: string; debut2: string | null; fin2: string | null; palier: string; palier_libelle: string; autres?: { debut: string; fin: string }[] };

/** Toutes les plages d'un collègue : ses deux temps de campagne, puis les congés demandés depuis. */
function plagesDe(c: Collegue): { debut: string; fin: string }[] {
  return [{ debut: c.debut, fin: c.fin }, ...(c.debut2 && c.fin2 ? [{ debut: c.debut2, fin: c.fin2 }] : []), ...(c.autres ?? [])];
}
export const PERIODES_VIDES: Periodes = { debut: "", fin: "", debut2: "", fin2: "" };

const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const JOURS = ["L", "M", "M", "J", "V", "S", "D"];

function iso(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

function court(valeur: string): string {
  const [annee, mois, jour] = valeur.split("-");
  return `${jour}/${mois}/${annee}`;
}

function nombreDeJours(debut: string, fin: string): number {
  return Math.round((new Date(`${fin}T00:00:00`).getTime() - new Date(`${debut}T00:00:00`).getTime()) / 86_400_000) + 1;
}

/** Nombre de jours calendaires choisis, les deux temps réunis. */
export function totalJours(valeur: Periodes): number {
  return [[valeur.debut, valeur.fin], [valeur.debut2, valeur.fin2]].reduce((somme, [debut, fin]) => (debut && fin ? somme + nombreDeJours(debut, fin) : somme), 0);
}

/** Résumé en une ligne des périodes choisies : « du 06/07/2026 au 17/07/2026 et du … au … ». */
export function resumePeriodes(valeur: Periodes): string {
  const premiere = valeur.debut && valeur.fin ? `du ${court(valeur.debut)} au ${court(valeur.fin)}` : "";
  const seconde = valeur.debut2 && valeur.fin2 ? `du ${court(valeur.debut2)} au ${court(valeur.fin2)}` : "";
  return [premiere, seconde].filter(Boolean).join(" et ");
}

type Cible = 0 | 1;

/**
 * Calendrier de l'année en 12 mois, pour choisir ses congés en une fois ou en deux temps.
 * Un premier clic pose le début, un second la fin ; la seconde période se choisit de la même façon.
 */
export function CalendrierAnnuel({
  annee,
  valeur,
  onChange,
  lecture = false,
  droit,
  collegues = [],
}: {
  annee: number;
  valeur: Periodes;
  onChange: (valeur: Periodes) => void;
  lecture?: boolean;
  /** Jours de congé auxquels l'agent a droit : les deux temps réunis doivent les couvrir exactement. */
  droit?: number | null;
  /** Les collègues de la même structure : leurs jours s'affichent pour ne pas se placer sur les leurs. */
  collegues?: Collegue[];
}) {
  const [deuxTemps, setDeuxTemps] = useState(Boolean(valeur.debut2));
  const [actif, setActif] = useState<Cible>(0);
  const [attente, setAttente] = useState("");
  // Jour survolé pendant qu'un début est posé : la période à venir se dessine avant le second clic.
  const [survol, setSurvol] = useState("");
  const [avis, setAvis] = useState("");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  // En lecture ou si la seconde période existe déjà, elle s'affiche même si le mode n'a pas été activé.
  const deuxAffichees = deuxTemps || Boolean(valeur.debut2);

  const mois = useMemo(
    () =>
      MOIS.map((nom, index) => ({
        nom,
        decalage: (new Date(annee, index, 1).getDay() + 6) % 7,
        jours: new Date(annee, index + 1, 0).getDate(),
        index,
      })),
    [annee],
  );

  function periode(cible: Cible): { debut: string; fin: string } {
    return cible === 0 ? { debut: valeur.debut, fin: valeur.fin } : { debut: valeur.debut2, fin: valeur.fin2 };
  }

  function poser(cible: Cible, debut: string, fin: string) {
    onChange(cible === 0 ? { ...valeur, debut, fin } : { ...valeur, debut2: debut, fin2: fin });
  }

  function choisir(jour: string) {
    if (lecture) return;
    setAvis("");
    if (!attente) {
      setAttente(jour);
      return;
    }
    const debut = attente < jour ? attente : jour;
    const fin = attente < jour ? jour : attente;
    const autre = periode(actif === 0 ? 1 : 0);
    if (autre.debut && autre.fin && debut <= autre.fin && fin >= autre.debut) {
      setAvis("Les deux périodes ne peuvent pas se chevaucher.");
      setAttente("");
      setSurvol("");
      return;
    }
    poser(actif, debut, fin);
    setAttente("");
    setSurvol("");
    if (deuxTemps && actif === 0 && !valeur.debut2) setActif(1);
  }

  function basculer(valeurDeuxTemps: boolean) {
    setDeuxTemps(valeurDeuxTemps);
    setAttente("");
    setAvis("");
    if (!valeurDeuxTemps) {
      setActif(0);
      onChange({ ...valeur, debut2: "", fin2: "" });
    } else if (valeur.debut && valeur.fin) {
      setActif(1);
    }
  }

  function efface(cible: Cible) {
    setAttente("");
    setAvis("");
    poser(cible, "", "");
    setActif(cible);
  }

  function absentsLe(jour: string): Collegue[] {
    return collegues.filter((c) => plagesDe(c).some((plage) => jour >= plage.debut && jour <= plage.fin));
  }

  // Collègues déjà absents sur au moins un des jours choisis : un avertissement, pas un blocage.
  const chevauchent = useMemo(() => {
    const choisis = [[valeur.debut, valeur.fin], [valeur.debut2, valeur.fin2]].filter(([debut, fin]) => debut && fin);
    return collegues.filter((c) =>
      choisis.some(([debut, fin]) => plagesDe(c).some((plage) => debut <= plage.fin && fin >= plage.debut)),
    );
  }, [collegues, valeur]);

  function classeJour(jour: string, indexSemaine: number): string {
    const base = "relative flex h-8 w-full items-center justify-center font-label-sm text-label-sm transition-colors";
    // Chaque période est une bande continue : bornes pleines, jours intermédiaires teintés, bords arrondis en début/fin de ligne.
    const bande = (debut: string, fin: string, plein: string, teinte: string): string | null => {
      if (!debut || !fin || jour < debut || jour > fin) return null;
      const borne = jour === debut || jour === fin;
      const gauche = jour === debut || indexSemaine === 0 ? "rounded-l-md" : "";
      const droite = jour === fin || indexSemaine === 6 ? "rounded-r-md" : "";
      return `${base} ${borne ? `${plein} font-bold shadow-sm` : `${teinte} font-semibold`} ${gauche} ${droite}`;
    };
    const periode1 = bande(valeur.debut, valeur.fin, "bg-[#16a34a] text-white", "bg-[#16a34a]/25 text-on-surface");
    if (periode1) return periode1;
    const periode2 = bande(valeur.debut2, valeur.fin2, "bg-[#9333ea] text-white", "bg-[#9333ea]/25 text-on-surface");
    if (periode2) return periode2;
    if (attente === jour) return `${base} rounded-md ${actif === 0 ? "bg-[#16a34a] text-white ring-[#16a34a]" : "bg-[#9333ea] text-white ring-[#9333ea]"} font-bold ring-2 ring-offset-1`;
    // Aperçu de la période en cours de choix, entre le début posé et le jour survolé.
    if (attente && survol) {
      const [de, a] = attente < survol ? [attente, survol] : [survol, attente];
      if (jour >= de && jour <= a) return `${base} rounded-sm ${actif === 0 ? "bg-[#16a34a]/15 text-on-surface outline-dashed outline-1 -outline-offset-1 outline-[#16a34a]" : "bg-[#9333ea]/15 text-on-surface outline-dashed outline-1 -outline-offset-1 outline-[#9333ea]"} font-semibold`;
    }
    const collegue = collegues.length > 0 && absentsLe(jour).length > 0;
    const teinte = collegue ? "rounded-md bg-[#dbeafe] text-[#1e3a8a]" : indexSemaine >= 5 ? "rounded-md bg-surface-container text-on-surface-variant" : "rounded-md text-on-surface";
    const survolable = lecture ? "" : "hover:bg-primary-fixed hover:text-on-surface";
    const auj = jour === aujourdhui ? "font-bold ring-2 ring-on-surface" : "";
    return `${base} ${teinte} ${survolable} ${auj}`;
  }

  const total = totalJours(valeur);
  const ecart = droit ? droit - total : 0;

  return (
    <div className="space-y-4">
      {lecture ? null : (
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Façon de prendre ses congés">
          {([[false, "En une fois"], [true, "En deux temps"]] as const).map(([mode, libelle]) => (
            <button
              key={libelle}
              type="button"
              aria-pressed={deuxAffichees === mode}
              onClick={() => basculer(mode)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-label-md text-label-md transition-colors ${deuxAffichees === mode ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"}`}
            >
              <Icone nom={mode ? "call_split" : "event"} className="text-base" />
              {libelle}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([0, ...(deuxAffichees ? [1] : [])] as Cible[]).map((cible) => {
          const p = periode(cible);
          const choisie = Boolean(p.debut && p.fin);
          const selectionnee = !lecture && actif === cible;
          return (
            <div
              key={cible}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${selectionnee ? "border-primary bg-primary-fixed/40" : "border-hairline bg-surface-container-low/60"}`}
            >
              <button type="button" disabled={lecture} onClick={() => { setActif(cible); setAttente(""); }} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
                <span className={`h-3 w-3 shrink-0 rounded-full ${cible === 0 ? "bg-[#16a34a]" : "bg-[#9333ea]"}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-label-md text-label-md font-bold text-on-surface">{deuxAffichees ? `Période ${cible + 1}` : "Période de congé"}</span>
                  <span className="block font-body-sm text-body-sm text-on-surface-variant">
                    {choisie ? `Du ${court(p.debut)} au ${court(p.fin)} · ${nombreDeJours(p.debut, p.fin)} jour${nombreDeJours(p.debut, p.fin) > 1 ? "s" : ""}` : selectionnee ? (attente ? `Début le ${court(attente)} : choisissez le dernier jour` : "Cliquez sur le premier jour") : "Non choisie"}
                  </span>
                </span>
              </button>
              {!lecture && choisie ? (
                <button type="button" onClick={() => efface(cible)} aria-label={`Effacer la période ${cible + 1}`} className="rounded-full p-1.5 text-on-surface-variant hover:bg-error-container/60 hover:text-error">
                  <Icone nom="close" className="text-lg" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {attente && !lecture ? (
        <button
          type="button"
          onClick={() => { setAttente(""); setSurvol(""); }}
          className="inline-flex items-center gap-2 rounded-full border border-outline-variant px-4 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-error hover:text-error"
        >
          <Icone nom="close" className="text-base" />
          Annuler le début posé le {court(attente)}
        </button>
      ) : null}
      {droit ? (
        <div
          role="status"
          className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${ecart === 0 ? "border-primary bg-primary-fixed/50" : ecart > 0 ? "border-attention/60 bg-attention/10" : "border-error/60 bg-error-container/50"}`}
        >
          <Icone nom={ecart === 0 ? "check_circle" : "warning"} className={`text-2xl ${ecart === 0 ? "text-primary" : ecart > 0 ? "text-attention" : "text-error"}`} />
          <div>
            <p className="font-label-lg text-label-lg font-bold text-on-surface">{total} jour{total > 1 ? "s" : ""} choisi{total > 1 ? "s" : ""} sur {droit} de droit</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {ecart === 0
                ? "Vos congés sont complets : ils couvrent exactement votre droit."
                : ecart > 0
                  ? `Il reste ${ecart} jour${ecart > 1 ? "s" : ""} à placer : les deux temps réunis doivent faire ${droit} jours.`
                  : `Vous dépassez votre droit de ${-ecart} jour${-ecart > 1 ? "s" : ""}.`}
            </p>
          </div>
        </div>
      ) : total > 0 ? (
        <p className="font-label-md text-label-md text-on-surface">Total : {total} jour{total > 1 ? "s" : ""} calendaires{deuxAffichees && valeur.debut2 ? ", en deux temps" : ""}.</p>
      ) : null}
      {avis ? <p role="alert" className="font-body-sm text-body-sm text-error">{avis}</p> : null}

      {collegues.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-hairline bg-surface-container-low/50 p-3">
          <p className="flex flex-wrap items-center gap-2 font-label-md text-label-md font-bold text-on-surface">
            <Icone nom="group" className="text-lg text-[#2563eb]" />
            Vos collègues de la structure ({collegues.length})
            <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">· mis à jour en direct, qu'ils soient validés ou non</span>
          </p>
          <ul className="flex flex-wrap gap-2">
            {collegues.map((c) => (
              <li key={c.matricule} className="inline-flex items-center gap-2 rounded-full bg-[#dbeafe] px-3 py-1 font-body-sm text-body-sm text-[#1e3a8a]">
                <span className="font-semibold">{c.nom}</span>
                {plagesDe(c).map((plage) => `du ${court(plage.debut)} au ${court(plage.fin)}`).join(" et ")}
                <span className="rounded-full bg-white/70 px-2 text-[11px] font-bold uppercase">{c.palier === "publie" ? "Arrêté" : c.palier === "demande" ? "Demandé" : "Proposé"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {chevauchent.length > 0 && !lecture ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-attention/60 bg-attention/10 px-4 py-3 font-body-sm text-body-sm text-on-surface">
          <Icone nom="warning" className="mt-0.5 text-lg text-attention" />
          <span>Attention : {chevauchent.map((c) => c.nom).join(", ")} {chevauchent.length > 1 ? "sont déjà absents" : "est déjà absent(e)"} sur une partie de vos jours. Vous pouvez poursuivre, mais pensez à la continuité du service.</span>
        </p>
      ) : null}

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 font-label-sm text-label-sm text-on-surface-variant" aria-label="Légende du calendrier">
        <li className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-md bg-[#16a34a]" aria-hidden="true" />{deuxAffichees ? "Période 1" : "Votre période"}</li>
        {deuxAffichees ? <li className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-md bg-[#9333ea]" aria-hidden="true" />Période 2</li> : null}
        <li className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-md bg-[#16a34a]/25 ring-1 ring-[#16a34a]/50" aria-hidden="true" />Jours entre les bornes</li>
        {collegues.length > 0 ? <li className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-md bg-[#dbeafe] ring-1 ring-[#2563eb]/40" aria-hidden="true" />Collègue absent</li> : null}
        <li className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-md bg-surface-container" aria-hidden="true" />Week-end</li>
        <li className="inline-flex items-center gap-2"><span className="h-4 w-8 rounded-md ring-2 ring-on-surface" aria-hidden="true" />Aujourd'hui</li>
      </ul>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {mois.map((m) => (
          <div key={m.nom} className="rounded-xl border border-hairline bg-surface-container-lowest p-3">
            <h4 className="mb-2 text-center font-label-lg text-label-lg font-bold text-on-surface">{m.nom}</h4>
            <div className="grid grid-cols-7 gap-x-0 gap-y-1" onMouseLeave={() => setSurvol("")}>
              {JOURS.map((jour, index) => (
                <div key={index} className="text-center font-label-sm text-label-sm text-on-surface-variant">{jour}</div>
              ))}
              {Array.from({ length: m.decalage }, (_, index) => <div key={`vide-${index}`} />)}
              {Array.from({ length: m.jours }, (_, index) => {
                const jour = iso(annee, m.index, index + 1);
                const absents = absentsLe(jour);
                return (
                  <button
                    key={jour}
                    type="button"
                    disabled={lecture}
                    onClick={() => choisir(jour)}
                    onMouseEnter={() => (attente ? setSurvol(jour) : undefined)}
                    title={absents.length ? `${court(jour)} · absent${absents.length > 1 ? "s" : ""} : ${absents.map((c) => c.nom).join(", ")}` : undefined}
                    aria-label={`${court(jour)}${absents.length ? ` · absents : ${absents.map((c) => c.nom).join(", ")}` : ""}`}
                    aria-pressed={Boolean((valeur.debut && jour >= valeur.debut && jour <= valeur.fin) || (valeur.debut2 && jour >= valeur.debut2 && jour <= valeur.fin2))}
                    className={classeJour(jour, (m.decalage + index) % 7)}
                  >
                    {index + 1}
                    {absents.length > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#2563eb] px-0.5 text-[9px] font-bold leading-none text-white" aria-hidden="true">
                        {absents.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
