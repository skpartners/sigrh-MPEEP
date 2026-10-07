import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ApiError, api } from "../api/client";
import type { AnnuaireUtilisateurs, CompteUtilisateur } from "../api/types";
import { optionsEntites, rangerStructures } from "../ui/Entites";
import { Modale } from "../ui/Modale";
import { useAction } from "../ui/useAction";
import { useFeedback } from "../ui/Feedback";
import { Pagination, TAILLE_PAGE, usePagination } from "../ui/Pagination";
import { AppChrome } from "./AppChrome";
import { Icone } from "../ui/Icone";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";
const CARTE = "rounded-xl bg-surface-container-lowest border border-hairline";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const PRIMAIRE = "inline-flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md";

const VIDE = {
  matricule: "",
  nom: "",
  prenoms: "",
  courriel: "",
  fonction: "",
  pole: "",
  role: "Agent",
  structure: "",
  superieur: "",
  interimaire: "",
  mot_de_passe: "",
  confirmation: "",
  actif: true,
  personnaliser: false,
  habilitations: [] as string[],
  precisions: {} as Record<string, string>,
};

const NIVEAUX = ["refus", "lecture", "saisie", "validation"] as const;
const LIBELLE_DROIT: Record<string, string> = {
  refus: "Accès refusé",
  lecture: "Lecture",
  saisie: "Saisie",
  validation: "Validation",
};

function rangDroit(code: string): number {
  const index = NIVEAUX.indexOf(code as (typeof NIVEAUX)[number]);
  return index < 0 ? 0 : index;
}

function droitsDuRole(roles: AnnuaireUtilisateurs["roles"], role: string): string[] {
  return roles.find((item) => item.role === role)?.droits ?? [];
}

function precisionsDuRole(roles: AnnuaireUtilisateurs["roles"], role: string): Record<string, string> {
  return roles.find((item) => item.role === role)?.precisions ?? {};
}

function posteDuCompte(role: string): "agent" | "responsable" {
  return role === "Agent" ? "agent" : "responsable";
}

function roleDuPoste(poste: "agent" | "responsable", structure: AnnuaireUtilisateurs["structures"][number]): string {
  if (poste === "agent") return "Agent";
  if (structure.niveau === "service") return "Chef de service";
  if (structure.niveau === "sous-direction") return "Sous directeur";
  if (structure.niveau === "direction-generale") return "Directeur général";
  if (structure.niveau === "ministere") return "Ministre";
  return "Directeur";
}

function responsableDe(comptes: CompteUtilisateur[], structure: string, sauf = ""): CompteUtilisateur | undefined {
  return comptes.find((compte) => compte.actif && compte.structure === structure && compte.role !== "Agent" && compte.matricule !== sauf);
}

function referentDe(comptes: CompteUtilisateur[], structure: string, sauf = ""): CompteUtilisateur | undefined {
  return responsableDe(comptes, structure, sauf)
    ?? comptes.find((compte) => compte.actif && compte.interimaire === structure && compte.matricule !== sauf);
}

function chefAttendu(
  poste: "agent" | "responsable",
  structure: AnnuaireUtilisateurs["structures"][number],
  comptes: CompteUtilisateur[],
  sauf = "",
): CompteUtilisateur | undefined {
  if (poste === "agent") return referentDe(comptes, structure.code, sauf);
  if (structure.parent) return referentDe(comptes, structure.parent, sauf);
  return undefined;
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "L'enregistrement n'a pas abouti.";
}

export function UtilisateursScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const { agir } = useAction();
  const annuaire = useQuery({ queryKey: ["utilisateurs"], queryFn: () => api<AnnuaireUtilisateurs>("/api/v1/utilisateurs/", { cache: "no-store" }) });
  const [recherche, setRecherche] = useState("");
  const [role, setRole] = useState("");
  const [structure, setStructure] = useState("");
  const [formulaire, setFormulaire] = useState<typeof VIDE | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [ecart, setEcart] = useState("");
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [montre, setMontre] = useState<string | null>(null);

  const data = annuaire.data;
  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (data?.utilisateurs ?? []).filter((compte) => {
      const texte = `${compte.matricule} ${compte.nom_complet} ${compte.fonction} ${compte.courriel}`.toLowerCase();
      return (!terme || texte.includes(terme)) && (!role || compte.role === role) && (!structure || compte.structure === structure);
    });
  }, [data, recherche, role, structure]);
  const ordonnes = useMemo(() => {
    const rang = new Map<string, number>();
    for (const item of data?.structures ?? []) {
      if (item.pole && !rang.has(item.pole)) rang.set(item.pole, rang.size);
    }
    return [...visibles].sort((a, b) => {
      const gauche = a.pole ? (rang.get(a.pole) ?? 500) : 1000;
      const droite = b.pole ? (rang.get(b.pole) ?? 500) : 1000;
      if (gauche !== droite) return gauche - droite;
      return a.nom_complet.localeCompare(b.nom_complet, "fr");
    });
  }, [visibles, data?.structures]);
  const pageComptes = usePagination(ordonnes, `${recherche}|${role}|${structure}`);
  const allerPage = pageComptes.aller;

  useEffect(() => {
    if (!montre) return;
    const index = ordonnes.findIndex((compte) => compte.matricule === montre);
    if (index < 0) return;
    allerPage(Math.floor(index / TAILLE_PAGE));
    setMontre(null);
  }, [montre, ordonnes, allerPage]);

  const enregistrer = useMutation({
    mutationFn: () => {
      if (!formulaire) return Promise.reject(new Error("Formulaire vide"));
      const corps = {
        matricule: formulaire.matricule.trim(),
        nom: formulaire.nom.trim(),
        prenoms: formulaire.prenoms.trim(),
        courriel: formulaire.courriel.trim(),
        fonction: formulaire.fonction.trim(),
        role: formulaire.role,
        structure: formulaire.structure,
        superieur: formulaire.superieur,
        interimaire: formulaire.interimaire,
        mot_de_passe: formulaire.mot_de_passe,
        confirmation: formulaire.confirmation,
        actif: formulaire.actif,
        personnaliser: formulaire.personnaliser,
        habilitations: formulaire.habilitations,
        precisions: formulaire.precisions,
      };
      if (edition) {
        return api<CompteUtilisateur>(`/api/v1/utilisateurs/${encodeURIComponent(edition)}/`, { method: "PATCH", body: JSON.stringify(corps) });
      }
      return api<CompteUtilisateur>("/api/v1/utilisateurs/", { method: "POST", body: JSON.stringify(corps) });
    },
    onSuccess: (compte) => {
      client.setQueryData<AnnuaireUtilisateurs>(["utilisateurs"], (actuel) => {
        if (!actuel) return actuel;
        const reste = actuel.utilisateurs.filter((item) => item.matricule !== compte.matricule);
        return { ...actuel, utilisateurs: [...reste, compte] };
      });
      const creation = edition === null;
      feedback.toast(creation ? "Compte créé" : "Compte mis à jour");
      setFormulaire(null);
      setEdition(null);
      setMotDePasseVisible(false);
      if (creation) {
        const texte = `${compte.matricule} ${compte.nom_complet} ${compte.fonction} ${compte.courriel}`.toLowerCase();
        const cacheParFiltre = (recherche.trim() && !texte.includes(recherche.trim().toLowerCase()))
          || (role && compte.role !== role)
          || (structure && compte.structure !== structure);
        if (cacheParFiltre) {
          setRecherche("");
          setRole("");
          setStructure("");
        }
        setMontre(compte.matricule);
      }
      void client.refetchQueries({ queryKey: ["utilisateurs"] });
    },
  });

  function supprimer(compte: CompteUtilisateur) {
    void agir({
      confirmation: `Supprimer le compte de ${compte.nom_complet} (${compte.matricule}) ?`,
      confirmLabel: "Supprimer",
      attente: "Suppression du compte…",
      route: `/api/v1/utilisateurs/${encodeURIComponent(compte.matricule)}/`,
      methode: "DELETE",
      succes: "Compte supprimé",
    });
  }

  function ouvrirCreation() {
    setEdition(null);
    setFormulaire({ ...VIDE, habilitations: droitsDuRole(data?.roles ?? [], "Agent") });
    setEcart("");
    setMotDePasseVisible(false);
    enregistrer.reset();
  }

  function ouvrirEdition(compte: CompteUtilisateur) {
    setMotDePasseVisible(false);
    setEdition(compte.matricule);
    const structure = data?.structures.find((item) => item.code === compte.structure);
    const chef = structure ? chefAttendu(posteDuCompte(compte.role), structure, data?.utilisateurs ?? [], compte.matricule) : undefined;
    setFormulaire({
      matricule: compte.matricule,
      nom: compte.nom,
      prenoms: compte.prenoms,
      courriel: compte.courriel,
      fonction: compte.fonction,
      pole: compte.pole || structure?.pole || "",
      role: compte.role,
      structure: compte.structure,
      superieur: structure ? (chef?.matricule ?? "") : "",
      interimaire: compte.interimaire,
      mot_de_passe: "",
      confirmation: "",
      actif: compte.actif,
      personnaliser: compte.personnalisees,
      habilitations: compte.habilitations,
      precisions: compte.precisions ?? {},
    });
    setEcart("");
    enregistrer.reset();
  }

  if (annuaire.isLoading) {
    return <AppChrome><p className={`${PAGE} text-on-surface-variant`}>Chargement des comptes…</p></AppChrome>;
  }
  if (!data) {
    return <AppChrome><p className={`${PAGE} text-error`}>Les comptes n'ont pas pu être chargés.</p></AppChrome>;
  }

  const courant = data;
  const actifs = courant.utilisateurs.filter((compte) => compte.actif).length;
  const moi = courant.utilisateurs.find((compte) => compte.moi)?.matricule ?? "";
  const peutAttribuer = Boolean(formulaire && (courant.administrateur || formulaire.superieur === moi));
  const structureChoisie = courant.structures.find((item) => item.code === formulaire?.structure);
  const poste = posteDuCompte(formulaire?.role ?? "Agent");
  const chef = structureChoisie && formulaire ? chefAttendu(poste, structureChoisie, courant.utilisateurs, edition ?? "") : undefined;
  const responsableDejaNomme = structureChoisie
    ? responsableDe(courant.utilisateurs, structureChoisie.code, edition ?? "")
    : undefined;
  const alerteOuverte = edition ? courant.utilisateurs.find((compte) => compte.matricule === edition)?.alerte ?? "" : "";

  function retenir(structure: AnnuaireUtilisateurs["structures"][number], posteChoisi: "agent" | "responsable") {
    if (!formulaire) return;
    const role = roleDuPoste(posteChoisi, structure);
    setFormulaire({
      ...formulaire,
      pole: structure.pole,
      structure: structure.code,
      role,
      superieur: chefAttendu(posteChoisi, structure, courant.utilisateurs, edition ?? "")?.matricule ?? "",
      personnaliser: false,
      habilitations: droitsDuRole(courant.roles, role),
      precisions: {},
    });
  }

  return (
    <AppChrome>
      <div className={PAGE}>
        <section className={`${CARTE} p-6 motion-rise`} style={{ "--delay": "0ms" } as CSSProperties}>
          <p className="flex flex-wrap items-center gap-2 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
            <span>Administration</span>
            <Icone nom="chevron_right" className="text-xs" />
            <span className="font-bold text-primary">Gestion des utilisateurs</span>
          </p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface">Gestion des utilisateurs</h1>
              <p className="mt-2 max-w-3xl font-body-md text-body-md text-on-surface-variant">
                {actifs} compte{actifs > 1 ? "s" : ""} actif{actifs > 1 ? "s" : ""} sur {data.utilisateurs.length}. Sans habilitations particulières, les droits du rôle s'appliquent.
                {courant.administrateur ? " Votre compte d'administrateur est à part : tous les droits, sans structure ni supérieur." : ""}
              </p>
            </div>
            <button type="button" className={PRIMAIRE} onClick={ouvrirCreation}>
              <Icone nom="person_add" className="text-lg" />
              Créer un compte
            </button>
          </div>
        </section>

        <section className={`${CARTE} overflow-hidden motion-rise`} style={{ "--delay": "80ms" } as CSSProperties}>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            <input className={CHAMP} value={recherche} placeholder="Matricule ou nom…" aria-label="Rechercher un compte" onChange={(event) => setRecherche(event.target.value)} />
            <select className={CHAMP} value={role} aria-label="Filtrer par rôle" onChange={(event) => setRole(event.target.value)}>
              <option value="">Tous les rôles</option>
              {data.roles.map((item) => <option key={item.role} value={item.role}>{item.role}</option>)}
            </select>
            <select className={CHAMP} value={structure} aria-label="Filtrer par structure" onChange={(event) => setStructure(event.target.value)}>
              <option value="">Toutes les structures</option>
              {optionsEntites(data.structures)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[57.5rem] text-left">
              <thead className="bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-3">Matricule</th>
                  <th className="px-4 py-3" data-min="">Nom</th>
                  <th className="px-4 py-3">Structure</th>
                  <th className="px-4 py-3">Supérieur</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3" data-min="">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ordonnes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center font-body-sm text-body-sm text-on-surface-variant">Aucun compte ne correspond à ces filtres.</td>
                  </tr>
                ) : pageComptes.visibles.map((compte, index, page) => {
                  const code = compte.pole || "";
                  const precedent = index > 0 ? (page[index - 1].pole || "") : null;
                  const entete = code !== precedent;
                  const libelle = code ? (compte.pole_libelle || code) : "Sans pôle";
                  const effectif = ordonnes.filter((item) => (item.pole || "") === code).length;
                  return (
                    <Fragment key={compte.matricule}>
                      {entete ? (
                        <tr className="border-t border-hairline bg-primary-fixed text-on-primary-fixed">
                          <th colSpan={7} scope="colgroup" className="px-4 py-2 text-left font-label-md text-label-md font-bold">
                            {libelle}
                            <span className="ml-2 font-normal">{effectif} compte{effectif > 1 ? "s" : ""}</span>
                          </th>
                        </tr>
                      ) : null}
                      <tr className="border-t border-hairline">
                        <td className="px-4 py-3 font-code-num text-code-num text-on-surface">{compte.matricule}</td>
                        <td className="px-4 py-3">
                          <p className="font-body-md text-body-md text-on-surface">{compte.nom_complet}</p>
                          {compte.courriel ? <p className="font-body-sm text-body-sm text-on-surface-variant">{compte.courriel}</p> : null}
                        </td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">{compte.structure_nom || "—"}</td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">
                          <p>{compte.superieur_nom || "—"}</p>
                          {compte.alerte ? <p className="mt-1 font-label-sm text-label-sm text-error">{compte.alerte}</p> : null}
                          {compte.interim ? <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">{compte.interim}</p> : null}
                        </td>
                        <td className="px-4 py-3 font-body-sm text-body-sm text-on-surface">
                          <p>{compte.role}</p>
                          {compte.interimaire_texte ? <p className="mt-1 font-label-sm text-label-sm text-primary">{compte.interimaire_texte}</p> : null}
                          {compte.personnalisees ? <p className="font-label-sm text-label-sm text-primary">Habilitations personnelles</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded px-2 py-0.5 font-label-sm text-label-sm ${compte.actif ? "bg-primary-fixed text-on-primary-fixed" : "bg-surface-container-high text-on-surface-variant"}`}>
                            {compte.actif ? "Actif" : "Suspendu"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" className="font-label-md text-label-md text-primary hover:underline" onClick={() => ouvrirEdition(compte)}>
                            Modifier
                          </button>
                          {compte.moi ? null : (
                            <button type="button" className="ml-3 font-label-md text-label-md text-error hover:underline" onClick={() => supprimer(compte)}>
                              Supprimer
                            </button>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={pageComptes.page} pages={pageComptes.pages} total={pageComptes.total} aller={pageComptes.aller} libelle="compte" />
        </section>
      </div>

      {formulaire ? (
        <Modale
          titre={edition ? "Modifier le compte" : "Créer un compte"}
          sousTitre={edition ? formulaire.matricule : "Le matricule sert d'identifiant de connexion."}
          icone="manage_accounts"
          taille="lg"
          onClose={() => { if (!enregistrer.isPending) { setFormulaire(null); setEdition(null); setMotDePasseVisible(false); } }}
          onSubmit={() => {
            if (!formulaire.structure) {
              setEcart("Choisissez une structure du ministère.");
              return;
            }
            if (poste === "agent" && !chef) {
              setEcart("Désignez d'abord le premier responsable de cette structure.");
              return;
            }
            if (formulaire.interimaire) {
              const deja = courant.utilisateurs.find((compte) => compte.actif && compte.interimaire === formulaire.interimaire && compte.matricule !== (edition ?? ""));
              if (deja) {
                setEcart(`${deja.nom_complet} est déjà l'intérimaire de ce poste.`);
                return;
              }
            }
            if ((chef?.matricule ?? "") !== formulaire.superieur) {
              setEcart("Le supérieur doit suivre la hiérarchie de la structure.");
              return;
            }
            if ((formulaire.mot_de_passe || formulaire.confirmation) && formulaire.mot_de_passe !== formulaire.confirmation) {
              setEcart("La confirmation du mot de passe ne correspond pas.");
              return;
            }
            setEcart("");
            enregistrer.mutate();
          }}
          enCours={enregistrer.isPending}
          erreur={ecart || (enregistrer.isError ? message(enregistrer.error) : undefined)}
          libelleValider={edition ? "Enregistrer" : "Créer le compte"}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Matricule</span>
              <input className={CHAMP} value={formulaire.matricule} disabled={Boolean(edition)} onChange={(event) => setFormulaire({ ...formulaire, matricule: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Courriel</span>
              <input type="email" className={CHAMP} value={formulaire.courriel} onChange={(event) => setFormulaire({ ...formulaire, courriel: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
              <input className={CHAMP} value={formulaire.nom} onChange={(event) => setFormulaire({ ...formulaire, nom: event.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Prénoms</span>
              <input className={CHAMP} value={formulaire.prenoms} onChange={(event) => setFormulaire({ ...formulaire, prenoms: event.target.value })} />
            </label>
            {edition ? (
              <label className="block space-y-1 sm:col-span-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Fonction</span>
                <input className={CHAMP} value={formulaire.fonction} onChange={(event) => setFormulaire({ ...formulaire, fonction: event.target.value })} />
              </label>
            ) : null}
            {alerteOuverte ? <p className="sm:col-span-2 font-body-sm text-body-sm text-error">{alerteOuverte}</p> : null}
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Pôle</span>
              <select
                className={CHAMP}
                required
                value={formulaire.pole}
                onChange={(event) => setFormulaire({
                  ...formulaire,
                  pole: event.target.value,
                  structure: "",
                  role: "Agent",
                  superieur: "",
                  personnaliser: false,
                  habilitations: droitsDuRole(data.roles, "Agent"),
                  precisions: {},
                })}
              >
                <option value="">Choisir…</option>
                {data.structures.reduce<{ code: string; libelle: string }[]>((poles, item) => (
                  poles.some((pole) => pole.code === item.pole) ? poles : [...poles, { code: item.pole, libelle: item.pole_libelle }]
                ), []).map((pole) => <option key={pole.code} value={pole.code}>{pole.libelle}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Structure</span>
              <select
                className={CHAMP}
                required
                disabled={!formulaire.pole}
                value={formulaire.structure}
                onChange={(event) => {
                  const item = data.structures.find((structure) => structure.code === event.target.value);
                  if (!item) {
                    setFormulaire({ ...formulaire, structure: "", superieur: "" });
                    return;
                  }
                  const occupee = Boolean(responsableDe(data.utilisateurs, item.code, edition ?? ""));
                  retenir(item, occupee ? "agent" : "responsable");
                }}
              >
                <option value="">Choisir…</option>
                {rangerStructures(data.structures.filter((item) => item.pole === formulaire.pole)).map(({ item, profondeur }) => (
                  <option key={item.code} value={item.code}>{`${"– ".repeat(profondeur)}${item.nom}`}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Rôle dans la structure</span>
              <select
                className={CHAMP}
                disabled={!structureChoisie}
                value={structureChoisie ? poste : ""}
                onChange={(event) => {
                  if (structureChoisie) retenir(structureChoisie, event.target.value === "responsable" ? "responsable" : "agent");
                }}
              >
                <option value="" disabled>Choisir une structure…</option>
                <option value="responsable" disabled={Boolean(responsableDejaNomme)}>Premier responsable</option>
                <option value="agent">Agent</option>
              </select>
              {structureChoisie ? (
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  Habilitations du rôle « {formulaire.role} ».
                  {responsableDejaNomme && poste === "agent" ? ` ${responsableDejaNomme.nom_complet} est déjà le premier responsable.` : ""}
                </span>
              ) : null}
            </label>
            {structureChoisie && poste === "agent" && !chef ? (
              <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">Désignez d'abord le premier responsable de cette structure.</p>
            ) : null}
            {structureChoisie && poste === "responsable" && structureChoisie.parent && structureChoisie.niveau !== "direction-generale" && !chef && formulaire.interimaire !== structureChoisie.parent ? (
              <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">En l'absence de désignation du premier responsable de {structureChoisie.parent_nom || "la structure de rattachement"}, ce compte assure les fonctions de ce poste dans la limite des compétences de {structureChoisie.nom}, jusqu'à cette désignation. Une note de service le constate.</p>
            ) : null}
            {structureChoisie && chef ? (
              <label className="block space-y-1 sm:col-span-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Supérieur hiérarchique</span>
                <select className={CHAMP} required disabled value={chef.matricule}>
                  <option value={chef.matricule}>{chef.nom_complet} — {chef.role}</option>
                </select>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  {chef.interimaire === (poste === "agent" ? structureChoisie.code : structureChoisie.parent)
                    ? "Intérimaire qui assure pleinement les fonctions de ce poste."
                    : poste === "agent"
                      ? "Premier responsable de la structure choisie."
                    : chef.role === "Ministre"
                      ? "Le ministre, au sommet de la chaîne hiérarchique."
                      : `Premier responsable de ${structureChoisie.parent_nom || "la structure de rattachement"}.`}
                </span>
              </label>
            ) : null}
            {structureChoisie && poste === "responsable" && structureChoisie.niveau === "direction-generale" && !chef ? (
              <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">Le supérieur hiérarchique est le ministre. Ce poste n'est pas encore désigné.</p>
            ) : null}
            {structureChoisie && poste === "responsable" && !structureChoisie.parent ? (
              <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">
                {structureChoisie.niveau === "ministere"
                  ? "Le ministre est au sommet de la chaîne hiérarchique."
                  : "Le premier responsable de cette structure n'a pas de supérieur hiérarchique."}
              </p>
            ) : null}
            <label className="block space-y-1 sm:col-span-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Intérimaire</span>
              <select
                className={CHAMP}
                value={formulaire.interimaire}
                onChange={(event) => setFormulaire({ ...formulaire, interimaire: event.target.value })}
              >
                <option value="">Aucun</option>
                {rangerStructures(data.structures.filter((item) => !(poste === "responsable" && item.code === formulaire.structure))).map(({ item, profondeur }) => (
                  <option key={item.code} value={item.code}>{`${"– ".repeat(profondeur)}${item.nom}`}</option>
                ))}
              </select>
              {formulaire.interimaire ? (
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  {(() => {
                    const occupe = responsableDe(courant.utilisateurs, formulaire.interimaire, edition ?? "");
                    const deja = courant.utilisateurs.find((compte) => compte.actif && compte.interimaire === formulaire.interimaire && compte.matricule !== (edition ?? ""));
                    if (deja) return `${deja.nom_complet} est déjà l'intérimaire de ce poste.`;
                    if (occupe) return `Intérimaire de ${occupe.nom_complet}. Ce compte assure pleinement ses fonctions en son absence.`;
                    return "Ce poste n'est pas désigné. Ce compte en assure pleinement les fonctions jusqu'à la nomination du titulaire.";
                  })()}
                </span>
              ) : (
                <span className="block font-body-sm text-body-sm text-on-surface-variant">Nommer ce compte pour assurer pleinement les fonctions d'un poste, en l'absence du titulaire ou si le poste n'est pas désigné.</span>
              )}
            </label>
            <fieldset className="sm:col-span-2 space-y-3">
              <legend className="font-label-md text-label-md text-on-surface">Habilitations</legend>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Seul le supérieur hiérarchique peut écarter ce compte du rôle par défaut. Les données qu'il peut manipuler restent celles des personnes sous la supervision de ce chef.
              </p>
              {peutAttribuer ? (
                <label className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={formulaire.personnaliser}
                    onChange={(event) => setFormulaire({
                      ...formulaire,
                      personnaliser: event.target.checked,
                      habilitations: droitsDuRole(data.roles, formulaire.role).map((droit, index) => formulaire.habilitations[index] ?? droit),
                      precisions: event.target.checked ? precisionsDuRole(data.roles, formulaire.role) : {},
                    })}
                  />
                  <span>Donner des habilitations particulières, pour agir à votre place. Sinon, les droits du rôle s'appliquent.</span>
                </label>
              ) : null}
              <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
                {data.modules.map((module, index) => {
                  const defaut = droitsDuRole(data.roles, formulaire.role)[index] ?? "refus";
                  const valeur = formulaire.habilitations[index] ?? defaut;
                  const plafond = Math.max(rangDroit(defaut), rangDroit(data.mes_droits[index] ?? "refus"));
                  const precisionsRole = precisionsDuRole(data.roles, formulaire.role);
                  return (
                    <li key={module.libelle} className="bg-surface-container-lowest px-3 py-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-body-sm text-body-sm font-bold text-on-surface">{module.libelle}</span>
                        {formulaire.personnaliser && peutAttribuer ? (
                          <select
                            className={`${CHAMP} sm:max-w-56`}
                            aria-label={`Habilitation pour ${module.libelle}`}
                            value={valeur}
                            onChange={(event) => {
                              const suite = droitsDuRole(data.roles, formulaire.role).map((droit, position) => formulaire.habilitations[position] ?? droit);
                              suite[index] = event.target.value;
                              setFormulaire({ ...formulaire, habilitations: suite });
                            }}
                          >
                            {NIVEAUX.filter((code) => rangDroit(code) <= plafond || code === valeur).map((code) => (
                              <option key={code} value={code}>{LIBELLE_DROIT[code]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-label-sm text-label-sm text-on-surface-variant">{LIBELLE_DROIT[formulaire.personnaliser ? valeur : defaut] ?? defaut} · {formulaire.personnaliser ? "fixé par le supérieur" : "droit du rôle"}</span>
                        )}
                      </div>
                      {module.fonctions.length > 0 ? (
                        <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
                          {module.fonctions.map((fonction) => {
                            const cle = String(fonction.id);
                            const duRole = precisionsRole[cle] ?? defaut;
                            const duResponsable = data.mes_precisions[cle] ?? data.mes_droits[index] ?? "refus";
                            const toit = Math.max(rangDroit(duRole), rangDroit(duResponsable));
                            const choisi = formulaire.precisions[cle] ?? "";
                            return (
                              <li key={fonction.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <span className="pl-3 font-body-sm text-body-sm text-on-surface-variant">{fonction.libelle}</span>
                                {formulaire.personnaliser && peutAttribuer ? (
                                  <select
                                    className={`${CHAMP} sm:max-w-72`}
                                    aria-label={`Habilitation de ${fonction.libelle}`}
                                    value={choisi}
                                    onChange={(event) => setFormulaire({
                                      ...formulaire,
                                      precisions: { ...formulaire.precisions, [cle]: event.target.value },
                                    })}
                                  >
                                    <option value="">Même droit que le module ({LIBELLE_DROIT[valeur] ?? valeur})</option>
                                    {NIVEAUX.filter((code) => rangDroit(code) <= toit || code === choisi).map((code) => (
                                      <option key={code} value={code}>{LIBELLE_DROIT[code]}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                                    {LIBELLE_DROIT[formulaire.personnaliser ? (choisi || valeur) : duRole] ?? duRole}
                                    {formulaire.personnaliser ? (choisi ? " · précision du supérieur" : "") : precisionsRole[cle] ? " · précision du rôle" : ""}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">{edition ? "Nouveau mot de passe" : "Mot de passe"}</span>
              <span className="relative block">
                <input type={motDePasseVisible ? "text" : "password"} autoComplete="new-password" className={`${CHAMP} pr-10`} required={!edition} value={formulaire.mot_de_passe} placeholder={edition ? "Laisser vide pour le conserver" : ""} onChange={(event) => { setEcart(""); setFormulaire({ ...formulaire, mot_de_passe: event.target.value }); }} />
                <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 rounded text-on-surface-variant hover:text-on-surface" aria-label={motDePasseVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={motDePasseVisible} onClick={() => setMotDePasseVisible((visible) => !visible)}>
                  <Icone nom={motDePasseVisible ? "visibility_off" : "visibility"} className="text-[1.125rem]" />
                </button>
              </span>
            </label>
            <label className="block space-y-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Confirmation du mot de passe</span>
              <span className="relative block">
                <input type={motDePasseVisible ? "text" : "password"} autoComplete="new-password" className={`${CHAMP} pr-10`} required={!edition || Boolean(formulaire.mot_de_passe)} value={formulaire.confirmation} placeholder={edition ? "Laisser vide pour le conserver" : ""} onChange={(event) => { setEcart(""); setFormulaire({ ...formulaire, confirmation: event.target.value }); }} />
                <button type="button" className="absolute top-1/2 right-3 -translate-y-1/2 rounded text-on-surface-variant hover:text-on-surface" aria-label={motDePasseVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={motDePasseVisible} onClick={() => setMotDePasseVisible((visible) => !visible)}>
                  <Icone nom={motDePasseVisible ? "visibility_off" : "visibility"} className="text-[1.125rem]" />
                </button>
              </span>
            </label>
            {edition ? (
              <label className="flex items-center gap-2 sm:col-span-2 font-body-md text-body-md text-on-surface">
                <input type="checkbox" checked={formulaire.actif} onChange={(event) => setFormulaire({ ...formulaire, actif: event.target.checked })} />
                Compte actif
              </label>
            ) : null}
          </div>
        </Modale>
      ) : null}
    </AppChrome>
  );
}
