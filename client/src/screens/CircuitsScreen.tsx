import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../api/client";
import type { Circuits } from "../api/types";
import { useFeedback } from "../ui/Feedback";
import { dateLongue } from "../ui/format";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { Portrait } from "../ui/PhotoProfil";
import { Skeleton, useFlip } from "../ui/Motion";
import { Pagination, usePagination } from "../ui/Pagination";
import { useAction } from "../ui/useAction";
import { AppChrome } from "./AppChrome";
import { ConfigurerCircuits } from "./circuits/ConfigurerCircuits";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";

const FLUX: { id: string; libelle: string }[] = [
  { id: "", libelle: "Tous les flux" },
  { id: "conge", libelle: "Congés" },
  { id: "social", libelle: "Prêts & aides sociales" },
  { id: "formation", libelle: "Formation" },
];

const ENTREES_MENU: { groupe: string; titre: string; module: string; fonction: string }[] = [
  { groupe: "Pilotage central", titre: "Vue d'ensemble DRH", module: "Statistiques & RBAC", fonction: "Vue d'ensemble" },
  { groupe: "Pilotage central", titre: "Dossier agent numérique", module: "Dossier Agent", fonction: "Consultation du dossier" },
  { groupe: "Carrières & actes", titre: "Accueil", module: "Carrières & Actes", fonction: "Accueil" },
  { groupe: "Carrières & actes", titre: "Situation administrative", module: "Carrières & Actes", fonction: "Situation administrative" },
  { groupe: "Carrières & actes", titre: "Absences", module: "Carrières & Actes", fonction: "Absences" },
  { groupe: "Carrières & actes", titre: "Congés", module: "Carrières & Actes", fonction: "Congés" },
  { groupe: "Carrières & actes", titre: "Procédures disciplinaires", module: "Carrières & Actes", fonction: "Procédures disciplinaires" },
  { groupe: "Carrières & actes", titre: "Fin de carrière", module: "Carrières & Actes", fonction: "Fin de carrière" },
  { groupe: "Action sociale", titre: "Action sociale", module: "Social & Santé", fonction: "Action sociale" },
  { groupe: "Formation continue", titre: "Formation continue", module: "Formations", fonction: "Formation continue" },
  { groupe: "GPEC", titre: "GPEC", module: "GPEC", fonction: "GPEC" },
  { groupe: "GPEC", titre: "Expression des besoins", module: "GPEC", fonction: "Expression des besoins" },
  { groupe: "GPEC", titre: "Recrutement", module: "GPEC", fonction: "Recrutement" },
  { groupe: "Métier", titre: "Communication", module: "Statistiques & RBAC", fonction: "Communication" },
  { groupe: "Gouvernance", titre: "Circuits de validation", module: "Statistiques & RBAC", fonction: "Circuits et habilitations" },
  { groupe: "Gouvernance", titre: "Habilitations", module: "Statistiques & RBAC", fonction: "Habilitations" },
  { groupe: "Gouvernance", titre: "Statistiques", module: "Statistiques & RBAC", fonction: "Statistiques" },
  { groupe: "Gouvernance", titre: "Gestion des utilisateurs", module: "Statistiques & RBAC", fonction: "Comptes utilisateurs" },
  { groupe: "Gouvernance", titre: "Structures du ministère", module: "Statistiques & RBAC", fonction: "Structures du ministère" },
];

function groupesMenu(entrees: typeof ENTREES_MENU): { titre: string; taille: number; simple: boolean }[] {
  const groupes: { titre: string; taille: number; simple: boolean }[] = [];
  for (const entree of entrees) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.titre === entree.groupe) dernier.taille += 1;
    else groupes.push({ titre: entree.groupe, taille: 1, simple: entree.titre === entree.groupe });
  }
  return groupes.map((groupe, index) => {
    const debut = groupes.slice(0, index).reduce((total, item) => total + item.taille, 0);
    const entreesGroupe = entrees.slice(debut, debut + groupe.taille);
    return { ...groupe, simple: entreesGroupe.length === 1 && entreesGroupe[0].titre === groupe.titre };
  });
}

const DROIT: Record<string, { libelle: string; style: string }> = {
  lecture: { libelle: "Lecture", style: "bg-surface-container text-on-surface-variant font-semibold" },
  saisie: { libelle: "Saisie", style: "bg-secondary-fixed text-on-secondary-fixed font-bold" },
  validation: { libelle: "Validation", style: "bg-primary-fixed text-on-primary-fixed font-bold" },
  refus: { libelle: "Accès refusé", style: "bg-surface-container-low text-on-surface-variant font-semibold" },
};

const ICONES_ETAPES = ["edit_note", "pending_actions", "policy", "draw", "mark_email_read"];

export function CircuitsScreen() {
  const [auditOpen, setAuditOpen] = useState(false);
  const [flux, setFlux] = useState("");
  const [ajout, setAjout] = useState<"role" | "module" | null>(null);
  const [roleEdite, setRoleEdite] = useState<Circuits["matrice"]["roles"][number] | null>(null);
  const { agir } = useAction();
  const client = useQueryClient();
  const feedback = useFeedback();
  const circuits = useQuery({ queryKey: ["circuits"], queryFn: () => api<Circuits>("/api/v1/circuits/") });
  const enregistrerDroit = useMutation({
    mutationFn: (corps: { role: number; colonne: number; droit: string }) =>
      api("/api/v1/circuits/habilitations/cellule/", { method: "PATCH", body: JSON.stringify(corps) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["circuits"] }),
    onError: (error) => feedback.toast("Modification impossible", messageErreur(error), "error"),
  });
  const enregistrerPrecision = useMutation({
    mutationFn: (corps: { role: number; fonction: number; droit: string }) =>
      api("/api/v1/circuits/habilitations/precision/", { method: "PATCH", body: JSON.stringify(corps) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["circuits"] }),
    onError: (error) => feedback.toast("Modification impossible", messageErreur(error), "error"),
  });
  const data = circuits.data;
  const pageRoles = usePagination(data?.matrice.roles ?? [], String(data?.matrice.roles.length ?? 0));

  const aSigner = (data?.demandes ?? []).filter((demande) => demande.etape.startsWith("Étape 4") && !demande.etape.includes("papier")).length;
  const maxEtape = Math.max(1, ...(data?.etapes ?? []).slice(0, -1).map((etape) => Number(etape.compteur)));

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex-1">
        <div className="flex flex-col w-full space-y-8">
          {/* Bandeau et compteurs du circuit */}
          <div className={`${CARD} p-6`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
                  Circuits de validation & habilitations
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                  Suivi de la chaîne d'approbation, de la requête de l'agent jusqu'au visa du DRH, et contrôle des droits d'accès.
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Décret n° 2024-412 · exercice {data?.exercice ?? 2026}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  className="inline-flex items-center gap-2 px-4 py-2 rounded bg-surface-container-high text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors"
                  id="btn-open-audit-modal"
                  type="button"
                  onClick={() => setAuditOpen(true)}
                  aria-haspopup="dialog"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">verified_user</span>
                  <span>Audit des habilitations</span>
                </button>
                <button
                  className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50"
                  type="button"
                  disabled={aSigner === 0}
                  onClick={() =>
                    agir<{ signees: number }>({
                      confirmation: `Apposer votre signature sur les ${aSigner} document${aSigner > 1 ? "s" : ""} en circulation ? Le papier à en-tête sera établi ensuite.`,
                      confirmLabel: "Signer le lot",
                      attente: "Signature électronique du lot…",
                      route: "/api/v1/demandes/signer-lot/",
                      succes: "Lot DRH signé",
                      detail: (r) => `${r.signees} demande${r.signees > 1 ? "s" : ""} notifiée${r.signees > 1 ? "s" : ""} aux agents.`,
                    })
                  }
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">fact_check</span>
                  <span>Signer le lot DRH ({aSigner})</span>
                </button>
              </div>
            </div>
            <ol className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
              {data
                ? data.etapes.map((etape, index) => {
                    const derniere = index === data.etapes.length - 1;
                    const attention = etape.ordre === 2;
                    return (
                      <li key={etape.ordre} className="motion-content p-3.5 rounded-lg bg-surface-container-low">
                        <div className={`flex items-center justify-between gap-2 ${attention ? "text-secondary" : "text-on-surface-variant"}`}>
                          <span className="font-label-sm text-label-sm font-semibold">{etape.ordre}. {etape.titre}</span>
                          <span className="material-symbols-outlined text-base" aria-hidden="true">{ICONES_ETAPES[index] ?? "radio_button_checked"}</span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          <span className={`font-headline-lg text-headline-lg font-bold ${derniere ? "text-primary" : attention ? "text-secondary" : "text-on-surface"}`}>{etape.compteur}</span>
                          <span className="font-code-num text-code-num text-on-surface-variant">{etape.detail}</span>
                        </div>
                        <div className="w-full bg-surface-container-high h-1 rounded-full mt-2 overflow-hidden" aria-hidden="true">
                          <div
                            className={`motion-fill h-full ${derniere ? "bg-primary" : attention ? "bg-secondary-container" : "bg-tertiary-container"}`}
                            style={{ width: derniere ? "100%" : `${(Number(etape.compteur) / maxEtape) * 100}%` }}
                          ></div>
                        </div>
                      </li>
                    );
                  })
                : [0, 1, 2, 3, 4].map((index) => <li key={index}><Skeleton className="h-24 rounded-lg" /></li>)}
            </ol>
          </div>

          {circuits.isError ? (
            <div className={`${CARD} p-6`} role="alert">
              <p className="font-label-lg text-label-lg text-error">Les circuits n'ont pas pu être chargés.</p>
              <button type="button" className="mt-3 h-10 px-4 rounded bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary" onClick={() => circuits.refetch()}>
                Réessayer
              </button>
            </div>
          ) : null}

          <ConfigurerCircuits />

          {/* Parcours d'une requête */}
          <section className="space-y-4" aria-labelledby="titre-parcours">
            <div>
              <h2 id="titre-parcours" className="font-headline-md text-headline-md text-on-surface">Parcours d'une requête</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Cinq étapes, avec contrôle de légalité et retour possible à l'agent.</p>
            </div>
            <ol className={`${CARD} p-6 grid grid-cols-1 lg:grid-cols-5 gap-4`}>
              {data
                ? data.parcours.map((etape, index) => (
                    <li key={etape.ordre} className="motion-content relative rounded-lg p-4 bg-surface-container-low flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-full bg-primary text-on-primary font-code-num text-code-num flex items-center justify-center font-bold">{etape.ordre}</span>
                          <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">{ICONES_ETAPES[index] ?? "radio_button_checked"}</span>
                        </div>
                        <div>
                          <p className="font-label-md text-label-md text-on-surface-variant font-bold">{etape.acteur}</p>
                          <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">{etape.titre}</h3>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">{etape.texte}</p>
                      </div>
                      {etape.metas.map((meta) => (
                        <div key={meta.label} className="mt-4 bg-surface-container-lowest/80 -mx-4 -mb-4 p-3 rounded-b-lg flex items-center justify-between gap-2">
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{meta.label}</span>
                          <span className="font-code-num text-code-num text-on-surface font-semibold text-right">{meta.value}</span>
                        </div>
                      ))}
                      {index < data.parcours.length - 1 ? (
                        <span className="hidden lg:block absolute top-1/2 -right-[19px] -translate-y-1/2 z-10 material-symbols-outlined text-primary text-2xl" aria-hidden="true">
                          arrow_forward
                        </span>
                      ) : null}
                    </li>
                  ))
                : [0, 1, 2, 3, 4].map((index) => <li key={index}><Skeleton className="h-56 rounded-lg" /></li>)}
            </ol>
          </section>

          <RegistreDemandes demandes={data?.demandes} flux={flux} onFlux={setFlux} onActualiser={() => circuits.refetch()} />

          {/* Matrice des habilitations */}
          <section className="space-y-4" aria-labelledby="rbac">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface scroll-mt-24" id="rbac" tabIndex={-1}>
                  Matrice des habilitations (<abbr title="Contrôle d'accès basé sur les rôles">RBAC</abbr>)
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Chaque colonne est une entrée du menu. Le droit affiché est celui de cette entrée, ou celui du module s'il n'a pas été précisé.</p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-2">
                <ul className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm" aria-label="Légende">
                  {Object.values(DROIT).map((droit) => (
                    <li key={droit.libelle} className={`px-2.5 py-1 rounded ${droit.style}`}>{droit.libelle}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={BOUTON_SECONDAIRE} onClick={() => setAjout("module")}>Ajouter un module</button>
                  <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setAjout("role")}>Ajouter un rôle</button>
                </div>
              </div>
            </div>
            <div className={`${CARD} overflow-x-auto`}>
              <table className="tableau-fixe w-max min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface font-label-md text-label-md">
                    <th className="sticky left-0 z-10 bg-surface-container-low py-3 px-5" rowSpan={2}>Rôle</th>
                    {groupesMenu(ENTREES_MENU).map((groupe) => (
                      <th key={groupe.titre} className="px-3 py-2 text-center border-l border-hairline" colSpan={groupe.taille} rowSpan={groupe.simple ? 2 : 1}>
                        {groupe.titre}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                    {groupesMenu(ENTREES_MENU).flatMap((groupe, index, groupes) => {
                      if (groupe.simple) return [];
                      const debut = groupes.slice(0, index).reduce((total, item) => total + item.taille, 0);
                      return ENTREES_MENU.slice(debut, debut + groupe.taille).map((entree) => (
                        <th key={`${entree.module}-${entree.fonction}`} className="min-w-36 max-w-44 px-2 py-2 text-center font-normal border-l border-hairline whitespace-normal">{entree.titre}</th>
                      ));
                    })}
                  </tr>
                </thead>
                <tbody className="font-body-sm text-body-sm">
                  {data === undefined
                    ? [0, 1, 2].map((index) => (
                        <tr key={index} className="border-t border-hairline">
                          <td className="py-3.5 px-5" colSpan={ENTREES_MENU.length + 1}><Skeleton className="h-8 w-full" /></td>
                        </tr>
                      ))
                    : null}
                  {pageRoles.visibles.map((role) => (
                    <tr key={role.role} className="motion-content border-t border-hairline hover:bg-surface-container-low/50 transition-colors">
                      <th scope="row" className="sticky left-0 z-10 bg-surface-container-lowest py-3.5 px-5 font-normal">
                        <span className="flex items-center gap-2.5">
                          <span className="material-symbols-outlined text-primary text-base" aria-hidden="true">{role.icone}</span>
                          <span>
                            <button type="button" className="font-label-lg text-label-lg font-bold text-on-surface block text-left hover:underline" onClick={() => setRoleEdite(role)}>
                              {role.role}
                            </button>
                            <span className="block font-label-sm text-label-sm text-on-surface-variant">{role.description}</span>
                          </span>
                        </span>
                      </th>
                      {ENTREES_MENU.map((entree) => {
                        const index = data?.matrice.colonnes.indexOf(entree.module) ?? -1;
                        const fonction = index >= 0 ? data?.matrice.fonctions[index]?.find((item) => item.libelle === entree.fonction) : undefined;
                        const droitModule = index >= 0 ? role.droits[index] : "refus";
                        const valeur = fonction ? (role.precisions[String(fonction.id)] ?? droitModule) : droitModule;
                        return (
                          <td key={`${role.id}-${entree.module}-${entree.fonction}`} className="py-3.5 px-2 text-center border-l border-hairline">
                            <CelluleDroit
                              valeur={valeur}
                              libelle={`${role.role}, ${entree.titre}`}
                              onChoisir={(niveau) => {
                                if (fonction) enregistrerPrecision.mutate({ role: role.id, fonction: fonction.id, droit: niveau });
                                else if (index >= 0) enregistrerDroit.mutate({ role: role.id, colonne: index, droit: niveau });
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={pageRoles.page} pages={pageRoles.pages} total={pageRoles.total} aller={pageRoles.aller} libelle="rôle" />
            </div>
          </section>

          {/* Journal d'audit des habilitations */}
          {auditOpen ? (
            <Modale
              titre="Audit des habilitations"
              sousTitre="Registre des habilitations"
              icone="security"
              taille="lg"
              onClose={() => setAuditOpen(false)}
              pied={
                <>
                  <button className={BOUTON_SECONDAIRE} type="button" onClick={() => setAuditOpen(false)}>
                    Fermer
                  </button>
                  <button className={BOUTON_PRIMAIRE} type="button" data-long-action="Génération du certificat d'audit…" data-long-action-done="Certificat d'audit prêt">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">download</span>
                    Télécharger le certificat (PDF)
                  </button>
                </>
              }
            >
              <div className="space-y-6">
              <dl className="p-4 rounded-lg bg-surface-container-low space-y-2 font-label-sm text-label-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-on-surface-variant">Intégrité de la matrice</dt>
                  <dd className="text-primary font-bold">Enregistrée</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-on-surface-variant">Dernière recertification DSI</dt>
                  <dd className="font-code-num text-code-num text-on-surface font-semibold">{dateLongue("2026-03-12")}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-on-surface-variant">Profils audités</dt>
                  <dd className="font-code-num text-code-num text-on-surface font-semibold">{data?.matrice.roles.length ?? 0} rôles</dd>
                </div>
              </dl>
              <fieldset className="space-y-2">
                <legend className="font-label-md text-label-md text-on-surface mb-2">Recertification périodique des droits</legend>
                <label className="flex items-center gap-3 p-3 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
                  <input defaultChecked className="accent-primary h-4 w-4" name="audit_mode" type="radio" />
                  <span>
                    <span className="font-label-md text-label-md text-on-surface block font-bold">Registre des habilitations</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Exporte le registre légal pour l'inspection générale des services.</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors">
                  <input className="accent-primary h-4 w-4" name="audit_mode" type="radio" />
                  <span>
                    <span className="font-label-md text-label-md text-on-surface block font-bold">Verrouillage conservatoire</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Gèle toute modification de rôle non validée par double visa DRH / DSI.</span>
                  </span>
                </label>
              </fieldset>
              </div>
            </Modale>
          ) : null}
          {ajout ? <FormulaireHabilitation genre={ajout} onClose={() => setAjout(null)} /> : null}
          {roleEdite ? <EditionRole role={roleEdite} onClose={() => setRoleEdite(null)} /> : null}
        </div>
      </div>
    </AppChrome>
  );
}

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const NIVEAUX = ["lecture", "saisie", "validation", "refus"] as const;

function messageErreur(error: unknown): string {
  return error instanceof ApiError ? error.message : "L'enregistrement n'a pas abouti.";
}

function CelluleDroit({ valeur, libelle, onChoisir }: { valeur: string; libelle: string; onChoisir: (droit: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const droit = DROIT[valeur] ?? DROIT.refus;
  useEffect(() => {
    if (!ouvert) return;
    function fermer(event: MouseEvent) {
      if (!zone.current?.contains(event.target as Node)) setOuvert(false);
    }
    function clavier(event: KeyboardEvent) {
      if (event.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);
  return (
    <div className="relative inline-block" ref={zone}>
      <button
        type="button"
        className={`inline-block px-2.5 py-1 rounded font-label-md text-label-md ${droit.style}`}
        aria-haspopup="listbox"
        aria-expanded={ouvert}
        aria-label={`${libelle} : ${droit.libelle}. Modifier le droit`}
        onClick={() => setOuvert((actuel) => !actuel)}
      >
        {valeur === "refus" ? "—" : droit.libelle}
      </button>
      {ouvert ? (
        <ul role="listbox" aria-label={libelle} className="absolute z-20 left-1/2 -translate-x-1/2 mt-1 min-w-40 rounded-lg border border-hairline bg-surface-container-lowest p-1 text-left shadow-lg">
          {NIVEAUX.map((code) => (
            <li key={code}>
              <button
                type="button"
                role="option"
                aria-selected={code === (DROIT[valeur] ? valeur : "refus")}
                className={`w-full rounded px-2 py-1.5 text-left font-label-md text-label-md hover:bg-surface-container-low ${code === valeur ? "font-bold" : ""}`}
                onClick={() => {
                  setOuvert(false);
                  if (code !== valeur) onChoisir(code);
                }}
              >
                {DROIT[code].libelle}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FormulaireHabilitation({ genre, onClose }: { genre: "role" | "module"; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const enregistrer = useMutation({
    mutationFn: () => {
      if (genre === "module") {
        return api("/api/v1/circuits/habilitations/modules/", { method: "POST", body: JSON.stringify({ libelle: nom.trim() }) });
      }
      return api("/api/v1/circuits/habilitations/roles/", {
        method: "POST",
        body: JSON.stringify({ role: nom.trim(), description: description.trim() }),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["circuits"] });
      await client.invalidateQueries({ queryKey: ["circuits-config"] });
      await client.invalidateQueries({ queryKey: ["utilisateurs"] });
      feedback.toast(genre === "module" ? "Module ajouté" : "Rôle ajouté", nom.trim());
      onClose();
    },
  });
  return (
    <Modale
      titre={genre === "module" ? "Ajouter un module" : "Ajouter un rôle"}
      sousTitre={genre === "module" ? "Une colonne de la matrice, refusée à tous les rôles tant qu'un droit n'est pas choisi." : "Un rôle commence sans accès. Attribuez ensuite chaque droit dans la matrice."}
      icone={genre === "module" ? "view_column" : "badge"}
      onClose={() => { if (!enregistrer.isPending) onClose(); }}
      onSubmit={() => enregistrer.mutate()}
      enCours={enregistrer.isPending}
      erreur={enregistrer.isError ? messageErreur(enregistrer.error) : undefined}
      libelleValider="Ajouter"
    >
      <label className="block space-y-1">
        <span className="font-label-sm text-label-sm text-on-surface-variant">{genre === "module" ? "Module" : "Rôle"}</span>
        <input className={CHAMP} required value={nom} onChange={(event) => setNom(event.target.value)} />
      </label>
      {genre === "role" ? (
        <label className="mt-3 block space-y-1">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Description</span>
          <input className={CHAMP} required value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
      ) : null}
    </Modale>
  );
}

function EditionRole({ role, onClose }: { role: Circuits["matrice"]["roles"][number]; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [nom, setNom] = useState(role.role);
  const [description, setDescription] = useState(role.description);
  const enregistrer = useMutation({
    mutationFn: () =>
      api(`/api/v1/circuits/habilitations/roles/${role.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ role: nom.trim(), description: description.trim() }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["circuits"] });
      await client.invalidateQueries({ queryKey: ["circuits-config"] });
      await client.invalidateQueries({ queryKey: ["utilisateurs"] });
      feedback.toast("Rôle mis à jour", nom.trim());
      onClose();
    },
  });
  return (
    <Modale
      titre="Modifier le rôle"
      sousTitre="Le nom est repris sur les comptes qui portent déjà ce rôle."
      icone="badge"
      onClose={() => { if (!enregistrer.isPending) onClose(); }}
      onSubmit={() => enregistrer.mutate()}
      enCours={enregistrer.isPending}
      erreur={enregistrer.isError ? messageErreur(enregistrer.error) : undefined}
    >
      <label className="block space-y-1">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Rôle</span>
        <input className={CHAMP} required value={nom} onChange={(event) => setNom(event.target.value)} />
      </label>
      <label className="mt-3 block space-y-1">
        <span className="font-label-sm text-label-sm text-on-surface-variant">Description</span>
        <input className={CHAMP} required value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
    </Modale>
  );
}

function RegistreDemandes({
  demandes,
  flux,
  onFlux,
  onActualiser,
}: {
  demandes: Circuits["demandes"] | undefined;
  flux: string;
  onFlux: (flux: string) => void;
  onActualiser: () => void;
}) {
  const { agir } = useAction();
  const visibles = (demandes ?? []).filter((demande) => !flux || demande.categorie === flux);
  const pageDemandes = usePagination(visibles, `${flux}|${demandes?.length ?? 0}`);
  const compte = (id: string) => (demandes ?? []).filter((demande) => !id || demande.categorie === id).length;
  const corps = useFlip<HTMLTableSectionElement>(`${flux}|${demandes?.length ?? 0}`);

  return (
    <section className="space-y-4" aria-labelledby="titre-demandes">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 id="titre-demandes" className="font-headline-md text-headline-md text-on-surface">Demandes en circulation</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Dossiers en cours dans le circuit, avec leur étape et leur échéance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 bg-surface-container-low rounded-lg" role="group" aria-label="Type de flux">
            {FLUX.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={flux === item.id}
                onClick={() => onFlux(item.id)}
                className={`px-3 py-1.5 rounded font-label-md text-label-md transition-colors ${flux === item.id ? "bg-surface-container-lowest text-primary shadow-sm font-bold" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                {item.libelle} {demandes ? <span className="font-code-num">({compte(item.id)})</span> : null}
              </button>
            ))}
          </div>
          <button className="p-2 rounded bg-surface-container-lowest border border-hairline text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" aria-label="Actualiser les demandes" type="button" onClick={onActualiser}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">sync</span>
          </button>
        </div>
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-label-md text-label-md">
              <th className="py-3.5 px-4">Référence</th>
              <th className="py-3.5 px-4">Agent</th>
              <th className="py-3.5 px-4">Nature</th>
              <th className="py-3.5 px-4" data-min="">Étape & responsable</th>
              <th className="py-3.5 px-4">Échéance</th>
              <th className="py-3.5 px-4 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody ref={corps} className="font-body-sm text-body-sm">
            {demandes === undefined
              ? [0, 1, 2].map((index) => (
                  <tr key={index} className="border-t border-hairline">
                    <td className="py-3.5 px-4" colSpan={6}><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              : null}
            {pageDemandes.visibles.map((demande) => {
              const retour = /complément|retourn/i.test(`${demande.etape} ${demande.echeance}`);
              const cloture = demande.etape.startsWith("Étape 5");
              return (
                <tr key={demande.reference} data-flip={demande.reference} className="motion-content border-t border-hairline hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="font-code-num text-code-num font-bold text-primary">{demande.reference}</span>
                    <span className="block font-label-sm text-label-sm text-on-surface-variant">Déposée le {dateLongue(demande.depose_le)}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Portrait agent={demande.agent} className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md shrink-0" />
                      <div>
                        <p className="font-label-lg text-label-lg font-bold text-on-surface">{demande.agent.nom_complet}</p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant font-code-num">
                          Mle {demande.agent.matricule} · {demande.agent.organisme_sigle}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-label-sm">
                      <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">{demande.icone}</span>
                      {demande.nature}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="flex items-center gap-2 font-label-md text-label-md text-on-surface font-semibold">
                      <span className={`w-2 h-2 rounded-full ${cloture ? "bg-primary" : retour ? "bg-error" : "bg-secondary-container"}`} aria-hidden="true"></span>
                      {demande.etape}
                    </span>
                    <span className={`font-label-sm text-label-sm ${retour ? "text-error" : "text-on-surface-variant"}`}>{demande.responsable}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-bold whitespace-nowrap ${cloture ? "bg-primary-fixed text-on-primary-fixed" : retour ? "bg-error-container text-on-error-container" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">timer</span>
                      {demande.echeance}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <span className="inline-flex items-center justify-end gap-2">
                      {demande.categorie === "formation" && !demande.etape.startsWith("Étape 5") ? (
                        <button
                          type="button"
                          className="px-2.5 py-1 rounded bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-colors"
                          onClick={() =>
                            agir<{ etape: string; notifiee: boolean }>({
                              confirmation: `Valider l'étape en cours pour ${demande.agent.nom_complet} ?`,
                              confirmLabel: "Valider",
                              attente: "Visa de l'étape…",
                              route: `/api/v1/demandes/${encodeURIComponent(demande.reference)}/valider/`,
                              succes: (reponse) => (reponse.notifiee ? "Agent notifié" : "Étape validée"),
                              detail: (reponse) =>
                                reponse.notifiee
                                  ? `${demande.agent.nom_complet} a été notifié de sa prise en compte pour cette formation.`
                                  : reponse.etape,
                            })
                          }
                        >
                          Valider l'étape
                        </button>
                      ) : null}
                      <Link
                        to={`/app/dossiers/${encodeURIComponent(demande.agent.matricule)}`}
                        className="inline-block px-2.5 py-1 rounded bg-surface-container text-primary font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors"
                      >
                        Ouvrir le dossier
                      </Link>
                    </span>
                  </td>
                </tr>
              );
            })}
            {demandes && visibles.length === 0 ? (
              <tr className="border-t border-hairline">
                <td className="py-8 px-4 text-center text-on-surface-variant" colSpan={6}>Aucune demande en cours pour ce flux.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <Pagination page={pageDemandes.page} pages={pageDemandes.pages} total={pageDemandes.total} aller={pageDemandes.aller} libelle="demande" />
      </div>
    </section>
  );
}
