import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api } from "../../api/client";
import type { CircuitConfigure, ConfigurationCircuits, ElementCircuit } from "../../api/types";
import { useFeedback } from "../../ui/Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../../ui/Modale";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

type EtapeSaisie = { instance: string; fonction: string };
type Edition = { id: number | null; nom: string; etapes: EtapeSaisie[]; selection: string[] };

function cle(famille: string, code: string): string {
  return `${famille}:${code}`;
}

export function ConfigurerCircuits() {
  const feedback = useFeedback();
  const client = useQueryClient();
  const titreId = useId();
  const [edition, setEdition] = useState<Edition | null>(null);
  const configuration = useQuery({
    queryKey: ["circuits-config"],
    queryFn: () => api<ConfigurationCircuits>("/api/v1/circuits/configuration/"),
  });
  const data = configuration.data;

  function ouvrir(circuit: CircuitConfigure | null) {
    setEdition({
      id: circuit?.id ?? null,
      nom: circuit?.nom ?? "",
      etapes: circuit?.etapes.map((etape) => ({ instance: etape.instance, fonction: etape.fonction })) ?? [
        { instance: "", fonction: "" },
      ],
      selection: circuit ? circuit.attributions.map((item) => cle(item.famille, item.code)) : [],
    });
  }

  async function retirer(circuit: CircuitConfigure) {
    const confirme = await feedback.confirm(`Retirer le circuit « ${circuit.nom} » ?`, {
      message: "Les congés et les absences qui lui sont attribués n'auront plus de circuit.",
      confirmLabel: "Retirer",
    });
    if (!confirme) return;
    try {
      await feedback.run("Retrait du circuit…", () => api(`/api/v1/circuits/configuration/${circuit.id}/`, { method: "DELETE" }), {
        error: "Le circuit n'a pas été retiré",
        success: { title: "Circuit retiré" },
      });
      await client.invalidateQueries({ queryKey: ["circuits-config"] });
    } catch {
      /* le toast d'erreur est déjà affiché */
    }
  }

  return (
    <section className="space-y-4" aria-labelledby={titreId}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 id={titreId} className="font-headline-md text-headline-md text-on-surface">Configurer un circuit</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-3xl">
            Définissez les visas, puis attribuez le circuit à un élément précis : congé annuel, maternité, paternité, parental, maladie, ou un type d'absence.
          </p>
        </div>
        <button
          type="button"
          onClick={() => ouvrir(null)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>
          Nouveau circuit
        </button>
      </div>

      {configuration.isError ? (
        <div className={`${CARD} p-6`} role="alert">
          <p className="font-label-lg text-label-lg text-error">Les circuits configurés n'ont pas pu être chargés.</p>
          <button type="button" className="mt-3 h-10 px-4 rounded bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary" onClick={() => configuration.refetch()}>
            Réessayer
          </button>
        </div>
      ) : (
        <div className="space-y-3">
            {data === undefined ? (
              <div className={`${CARD} h-40`} />
            ) : data.circuits.length === 0 ? (
              <div className={`${CARD} p-6`}>
                <p className="font-label-lg text-label-lg text-on-surface">Aucun circuit configuré</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Créez un circuit, indiquez qui vise, puis cochez le congé ou l'absence auquel il s'applique.
                </p>
              </div>
            ) : (
              data.circuits.map((circuit) => (
                <article key={circuit.id} className={`${CARD} p-5 space-y-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface">{circuit.nom}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <button type="button" onClick={() => ouvrir(circuit)} className="px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high">
                        Modifier
                      </button>
                      <button type="button" onClick={() => retirer(circuit)} className="px-3 py-1.5 rounded bg-surface-container text-error font-label-md text-label-md hover:bg-error-container">
                        Retirer
                      </button>
                    </div>
                  </div>
                  <ol className="space-y-2">
                    {circuit.etapes.map((etape) => (
                      <li key={etape.ordre} className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-code-num text-code-num flex items-center justify-center font-bold shrink-0">{etape.ordre}</span>
                        <span>
                          <span className="font-label-md text-label-md text-on-surface font-bold block">{etape.instance}</span>
                          {etape.fonction ? <span className="font-body-sm text-body-sm text-on-surface-variant">{etape.fonction}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    {circuit.attributions.length === 0 ? (
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Attribué à aucun élément.</span>
                    ) : (
                      circuit.attributions.map((item) => (
                        <span key={cle(item.famille, item.code)} className="px-2.5 py-1 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold">
                          {item.libelle}
                        </span>
                      ))
                    )}
                  </div>
                </article>
              ))
            )}
        </div>
      )}

      {edition && data ? (
        <Editeur
          edition={edition}
          elements={data.elements}
          circuits={data.circuits}
          roles={data.roles}
          onChange={setEdition}
          onFermer={() => setEdition(null)}
        />
      ) : null}
    </section>
  );
}

function Editeur({
  edition,
  elements,
  circuits,
  roles,
  onChange,
  onFermer,
}: {
  edition: Edition;
  elements: ConfigurationCircuits["elements"];
  circuits: CircuitConfigure[];
  roles: ConfigurationCircuits["roles"];
  onChange: (edition: Edition) => void;
  onFermer: () => void;
}) {
  const feedback = useFeedback();
  const client = useQueryClient();
  const titre = edition.id == null ? "Nouveau circuit" : "Modifier le circuit";

  function etapes(suivantes: EtapeSaisie[]) {
    onChange({ ...edition, etapes: suivantes });
  }

  function basculer(clef: string) {
    const selection = edition.selection.includes(clef)
      ? edition.selection.filter((item) => item !== clef)
      : [...edition.selection, clef];
    onChange({ ...edition, selection });
  }

  async function enregistrer() {
    const etapes = edition.etapes
      .map((etape) => ({ instance: etape.instance.trim(), fonction: etape.fonction.trim() }))
      .filter((etape) => etape.instance);
    if (!edition.nom.trim() || etapes.length === 0) {
      feedback.toast("Circuit incomplet", "Indiquez un nom et choisissez au moins un rôle.", "error");
      return;
    }
    const corps = {
      nom: edition.nom.trim(),
      etapes,
      attributions: edition.selection.map((clef) => {
        const index = clef.indexOf(":");
        return { famille: clef.slice(0, index), code: clef.slice(index + 1) };
      }),
    };
    const route = edition.id == null ? "/api/v1/circuits/configuration/" : `/api/v1/circuits/configuration/${edition.id}/`;
    try {
      await feedback.run(
        "Enregistrement du circuit…",
        () => api(route, { method: edition.id == null ? "POST" : "PUT", body: JSON.stringify(corps) }),
        {
          error: "Le circuit n'a pas été enregistré",
          success: {
            title: "Circuit enregistré",
            message: "Il s'applique aux congés et aux absences que vous lui avez attribués.",
          },
        },
      );
      await client.invalidateQueries({ queryKey: ["circuits-config"] });
      onFermer();
    } catch {
      /* le toast d'erreur est déjà affiché */
    }
  }

  return (
    <Modale
      titre={titre}
      sousTitre="Le dépôt de l'agent précède toujours ces visas."
      icone="account_tree"
      taille="xl"
      onClose={onFermer}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={enregistrer}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <label className="block space-y-1.5">
          <span className="font-label-md text-label-md text-on-surface font-semibold">Nom du circuit</span>
          <input id="circuit-nom" className={CHAMP} value={edition.nom} onChange={(event) => onChange({ ...edition, nom: event.target.value })} />
        </label>

        <fieldset className="space-y-3">
          <legend className="font-label-md text-label-md text-on-surface font-semibold">Étapes de validation</legend>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Le rôle choisi fixe l'instance et sa fonction.</p>
          <ol className="space-y-2">
            {edition.etapes.map((etape, index) => {
              const connu = roles.some((role) => role.role === etape.instance);
              return (
              <li key={index} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
                <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-code-num text-code-num flex items-center justify-center font-bold">{index + 1}</span>
                <select
                  className={CHAMP}
                  aria-label={`Rôle de l'étape ${index + 1}`}
                  value={etape.instance}
                  onChange={(event) => {
                    const role = roles.find((item) => item.role === event.target.value);
                    const suivantes = edition.etapes.slice();
                    suivantes[index] = { instance: role?.role ?? "", fonction: role?.description ?? "" };
                    etapes(suivantes);
                  }}
                >
                  <option value="">Choisir un rôle</option>
                  {etape.instance && !connu ? <option value={etape.instance}>{etape.instance}</option> : null}
                  {roles.map((role) => (
                    <option key={role.role} value={role.role}>{role.role}</option>
                  ))}
                </select>
                <span className="font-body-sm text-body-sm text-on-surface-variant px-1">
                  {etape.fonction || "La fonction suit le rôle"}
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label={`Monter l'étape ${index + 1}`} disabled={index === 0} onClick={() => deplacer(edition.etapes, index, -1, etapes)} className="p-1 rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-30">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_upward</span>
                  </button>
                  <button type="button" aria-label={`Descendre l'étape ${index + 1}`} disabled={index === edition.etapes.length - 1} onClick={() => deplacer(edition.etapes, index, 1, etapes)} className="p-1 rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-30">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_downward</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Retirer l'étape ${index + 1}`}
                    disabled={edition.etapes.length === 1}
                    onClick={() => etapes(edition.etapes.filter((_, position) => position !== index))}
                    className="p-1 rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                  >
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                  </button>
                </span>
              </li>
              );
            })}
          </ol>
          <button
            type="button"
            disabled={edition.etapes.length >= 8}
            onClick={() => etapes([...edition.etapes, { instance: "", fonction: "" }])}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">add</span>
            Ajouter une étape
          </button>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-label-md text-label-md text-on-surface font-semibold">Attribuer à</legend>
          <Choix famille="conge" titre="Congés" elements={elements.conges} edition={edition} circuits={circuits} onBasculer={basculer} />
          <Choix famille="absence" titre="Absences" elements={elements.absences} edition={edition} circuits={circuits} onBasculer={basculer} />
        </fieldset>

      </div>
    </Modale>
  );
}

function Choix({
  famille,
  titre,
  elements,
  edition,
  circuits,
  onBasculer,
}: {
  famille: "conge" | "absence";
  titre: string;
  elements: ElementCircuit[];
  edition: Edition;
  circuits: CircuitConfigure[];
  onBasculer: (clef: string) => void;
}) {
  const racines = elements.filter((item) => !item.parent);
  const enfants = (parent: string) => elements.filter((item) => item.parent === parent);
  const simples = racines.filter((item) => enfants(item.code).length === 0);
  const familles = racines.filter((item) => enfants(item.code).length > 0);
  return (
    <div className="space-y-2">
      <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">{titre}</p>
      {simples.length > 0 ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {simples.map((element) => (
            <li key={element.code}>
              <Case element={element} famille={famille} edition={edition} circuits={circuits} onBasculer={onBasculer} />
            </li>
          ))}
        </ul>
      ) : null}
      {familles.map((parent) => (
        <div key={parent.code} className="rounded-lg border border-hairline p-2 space-y-2">
          <Case element={parent} famille={famille} edition={edition} circuits={circuits} onBasculer={onBasculer} />
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-4 border-l border-hairline ml-3">
            {enfants(parent.code).map((element) => (
              <li key={element.code}>
                <Case element={element} famille={famille} edition={edition} circuits={circuits} onBasculer={onBasculer} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Case({
  element,
  famille,
  edition,
  circuits,
  onBasculer,
}: {
  element: ElementCircuit;
  famille: "conge" | "absence";
  edition: Edition;
  circuits: CircuitConfigure[];
  onBasculer: (clef: string) => void;
}) {
  const clef = cle(famille, element.code);
  const coche = edition.selection.includes(clef);
  const ailleurs = element.circuit_id != null && element.circuit_id !== edition.id
    ? circuits.find((item) => item.id === element.circuit_id)?.nom
    : "";
  return (
    <label className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${coche ? "bg-primary-fixed" : "bg-surface-container-low hover:bg-surface-container"}`}>
      <input className="accent-primary h-4 w-4 mt-0.5" type="checkbox" checked={coche} onChange={() => onBasculer(clef)} />
      <span>
        <span className="font-label-md text-label-md text-on-surface block">{element.libelle}</span>
        {ailleurs && !coche ? <span className="font-label-sm text-label-sm text-on-surface-variant">Déjà attribué à {ailleurs}</span> : null}
      </span>
    </label>
  );
}

function deplacer(etapes: EtapeSaisie[], index: number, sens: -1 | 1, appliquer: (etapes: EtapeSaisie[]) => void) {
  const cible = index + sens;
  if (cible < 0 || cible >= etapes.length) return;
  const suivantes = etapes.slice();
  [suivantes[index], suivantes[cible]] = [suivantes[cible], suivantes[index]];
  appliquer(suivantes);
}
