import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, api } from "../api/client";
import type { Circuits } from "../api/types";
import { useFeedback } from "../ui/Feedback";
import { dateLongue } from "../ui/format";
import { Icone } from "../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "../ui/Modale";
import { Skeleton } from "../ui/Motion";
import { Pagination, usePagination } from "../ui/Pagination";
import { AppChrome } from "./AppChrome";

const CARD = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

const ENTREES_MENU: { groupe: string; titre: string; module: string; fonction: string }[] = [
  { groupe: "Pilotage central", titre: "Tableau de bord", module: "Statistiques & RBAC", fonction: "Tableau de bord" },
  { groupe: "Pilotage central", titre: "Mon profil", module: "Dossier Agent", fonction: "Consultation du dossier" },
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
  { groupe: "Gouvernance", titre: "Statistiques", module: "Statistiques & RBAC", fonction: "Statistiques" },
  { groupe: "Paramètres", titre: "Accueil", module: "Statistiques & RBAC", fonction: "Paramètres" },
  { groupe: "Paramètres", titre: "Circuits de validation", module: "Statistiques & RBAC", fonction: "Circuits et habilitations" },
  { groupe: "Paramètres", titre: "Habilitations", module: "Statistiques & RBAC", fonction: "Habilitations" },
  { groupe: "Paramètres", titre: "Gestion des utilisateurs", module: "Statistiques & RBAC", fonction: "Comptes utilisateurs" },
  { groupe: "Paramètres", titre: "Structures du ministère", module: "Statistiques & RBAC", fonction: "Structures du ministère" },
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

const NIVEAUX = ["lecture", "saisie", "validation", "refus"] as const;
const COLONNE_ROLE = "sticky left-0 z-10 w-36 max-w-36 sm:w-56 sm:max-w-56 whitespace-normal shadow-[4px_0_8px_-4px_rgba(11,28,48,0.18)]";

function messageErreur(error: unknown): string {
  return error instanceof ApiError ? error.message : "L'enregistrement n'a pas abouti.";
}

export function HabilitationsScreen() {
  const [auditOpen, setAuditOpen] = useState(false);
  const [ajout, setAjout] = useState<"role" | "module" | null>(null);
  const [roleEdite, setRoleEdite] = useState<Circuits["matrice"]["roles"][number] | null>(null);
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

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1">
        <div className="flex flex-col w-full space-y-8">
          <div className={`${CARD} p-6 motion-rise`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Habilitations</h1>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                  Chaque colonne est une entrée du menu. Le droit affiché est celui de cette entrée, ou celui du module s'il n'a pas été précisé.
                </p>
              </div>
              <button
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-high text-on-surface font-label-md text-label-md hover:bg-surface-container transition-colors shrink-0"
                type="button"
                onClick={() => setAuditOpen(true)}
                aria-haspopup="dialog"
              >
                <Icone nom="verified_user" className="text-lg" />
                <span>Audit des habilitations</span>
              </button>
            </div>
          </div>

          {circuits.isError ? (
            <div className={`${CARD} p-6`} role="alert">
              <p className="font-label-lg text-label-lg text-error">Les habilitations n'ont pas pu être chargées.</p>
              <button type="button" className="mt-3 h-8 px-3 rounded bg-primary-container text-on-primary font-label-md text-label-md hover:bg-primary" onClick={() => circuits.refetch()}>
                Réessayer
              </button>
            </div>
          ) : null}

          <section className="space-y-4 motion-rise" style={{ "--delay": "80ms" } as CSSProperties} aria-labelledby="titre-matrice">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 id="titre-matrice" className="font-headline-md text-headline-md text-on-surface">
                Matrice des rôles
              </h2>
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
            <p className="lg:hidden font-body-sm text-body-sm text-on-surface-variant">Faites défiler le tableau pour voir chaque entrée du menu.</p>
            <div className={`${CARD} overflow-x-auto`}>
              <table className="tableau-fixe w-max min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface font-label-md text-label-md">
                    <th className={`${COLONNE_ROLE} bg-surface-container-low py-3 px-3 sm:px-5`} rowSpan={2}>Rôle</th>
                    {groupesMenu(ENTREES_MENU).map((groupe) => (
                      <th key={groupe.titre} className="min-w-28 sm:min-w-36 px-2 sm:px-3 py-2 text-center border-l border-hairline whitespace-normal" colSpan={groupe.taille} rowSpan={groupe.simple ? 2 : 1}>
                        {groupe.titre}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                    {groupesMenu(ENTREES_MENU).flatMap((groupe, index, groupes) => {
                      if (groupe.simple) return [];
                      const debut = groupes.slice(0, index).reduce((total, item) => total + item.taille, 0);
                      return ENTREES_MENU.slice(debut, debut + groupe.taille).map((entree) => (
                        <th key={`${entree.module}-${entree.fonction}`} className="min-w-28 sm:min-w-36 max-w-44 px-2 py-2 text-center font-normal border-l border-hairline whitespace-normal">{entree.titre}</th>
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
                      <th scope="row" className={`${COLONNE_ROLE} bg-surface-container-lowest py-3 px-3 sm:py-3.5 sm:px-5 font-normal`}>
                        <span className="flex items-start gap-2 min-w-0">
                          <Icone nom={role.icone} className="text-primary text-base mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            <button type="button" className="font-label-lg text-label-lg font-bold text-on-surface block text-left hover:underline whitespace-normal" onClick={() => setRoleEdite(role)}>
                              {role.role}
                            </button>
                            <span className="block font-label-sm text-label-sm text-on-surface-variant whitespace-normal">{role.description}</span>
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
                    <Icone nom="download" className="text-lg" />
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
