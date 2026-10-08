import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../ui/Modale";
import { AppChrome } from "./AppChrome";
import { exporterClasseurTcd } from "./statistiques/exportTcd";
import { champsUtilises, configComplete, configVide, nomPropose, sourceEffective, type Catalogue, type ConfigTcd } from "./statistiques/moteur";
import { chargerCube, cleCube, TableauCroise, type FeuilleTcd } from "./statistiques/TableauCroise";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-5";
const CLE_ONGLET = "sigrh_statistiques_onglet";
const CLE_LISTE = ["compositions-statistiques"] as const;

type Enregistre = {
  id: number;
  nom: string;
  configuration: Partial<ConfigTcd>;
  mien: boolean;
  auteur: string;
  modifiee_le: string | null;
};

function depuisServeur(item: Enregistre): FeuilleTcd {
  return {
    cle: `srv-${item.id}`,
    id: item.id,
    nom: item.nom,
    config: configComplete(item.configuration),
    mien: item.mien,
    auteur: item.auteur,
    modifiee: false,
  };
}

function lireOnglet(): string {
  try {
    return window.localStorage.getItem(CLE_ONGLET) ?? "";
  } catch {
    return "";
  }
}

function memoriserOnglet(cle: string) {
  try {
    window.localStorage.setItem(CLE_ONGLET, cle);
  } catch {
    // Sans stockage, la page rouvre sur le premier tableau.
  }
}

export function StatistiquesScreen() {
  const feedback = useFeedback();
  const client = useQueryClient();
  const catalogue = useQuery({
    queryKey: ["tcd-catalogue"],
    queryFn: () => api<Catalogue>("/api/v1/statistiques/catalogue/"),
    staleTime: Infinity,
  });
  const liste = useQuery({ queryKey: CLE_LISTE, queryFn: () => api<Enregistre[]>("/api/v1/statistiques/compositions/") });
  const [brouillons, setBrouillons] = useState<Record<string, FeuilleTcd>>({});
  const [nouvelles, setNouvelles] = useState<FeuilleTcd[]>([]);
  const [active, setActive] = useState(lireOnglet);

  const serveur = (liste.data ?? []).map(depuisServeur);
  const feuilles = [...serveur.map((feuille) => brouillons[feuille.cle] ?? feuille), ...nouvelles];
  const courante = feuilles.find((feuille) => feuille.cle === active) ?? feuilles[0];
  const modifiees = feuilles.filter((feuille) => feuille.modifiee);

  function ouvrir(cle: string) {
    setActive(cle);
    memoriserOnglet(cle);
  }

  useEffect(() => {
    if (!modifiees.length) return;
    const avertir = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifiees.length]);

  function changer(cle: string, modifier: (feuille: FeuilleTcd) => FeuilleTcd) {
    if (nouvelles.some((feuille) => feuille.cle === cle)) {
      setNouvelles((courantes) => courantes.map((feuille) => (feuille.cle === cle ? modifier(feuille) : feuille)));
      return;
    }
    const base = serveur.find((feuille) => feuille.cle === cle);
    setBrouillons((courants) => {
      const depart = courants[cle] ?? base;
      return depart ? { ...courants, [cle]: modifier(depart) } : courants;
    });
  }

  function oublier(cle: string) {
    setNouvelles((courantes) => courantes.filter((feuille) => feuille.cle !== cle));
    setBrouillons((courants) => {
      const suite = { ...courants };
      delete suite[cle];
      return suite;
    });
  }

  function nouveau() {
    const config = configVide();
    creer(catalogue.data ? nomPropose(config, sourceEffective(catalogue.data, config)) : "Nouveau tableau croisé", config);
  }

  function creer(nom: string, config: ConfigTcd) {
    const cle = `loc-${Date.now()}`;
    setNouvelles((courantes) => [...courantes, { cle, id: null, nom, config, mien: true, auteur: "", modifiee: true }]);
    ouvrir(cle);
  }

  const enregistrer = useMutation({
    mutationFn: (feuille: FeuilleTcd) => {
      const corps = JSON.stringify({ nom: feuille.nom.trim() || "Tableau croisé", configuration: feuille.config });
      if (feuille.id !== null && feuille.mien) {
        return api<Enregistre>(`/api/v1/statistiques/compositions/${feuille.id}/`, { method: "PATCH", body: corps });
      }
      return api<Enregistre>("/api/v1/statistiques/compositions/", { method: "POST", body: corps });
    },
    onSuccess: (reponse, feuille) => {
      client.setQueryData<Enregistre[]>(CLE_LISTE, (courants = []) => {
        const autres = courants.filter((item) => item.id !== reponse.id);
        return feuille.id !== null && feuille.mien ? courants.map((item) => (item.id === reponse.id ? reponse : item)) : [reponse, ...autres];
      });
      oublier(feuille.cle);
      ouvrir(`srv-${reponse.id}`);
      void client.invalidateQueries({ queryKey: CLE_LISTE });
      feedback.toast("Tableau enregistré", `« ${reponse.nom} » se rouvre avec ses zones, ses filtres et son graphique.`);
    },
    onError: (erreur) => {
      feedback.toast("Enregistrement impossible", erreur instanceof ApiError ? erreur.message : "Le tableau n'a pas été enregistré.", "error");
    },
  });

  async function supprimer(feuille: FeuilleTcd) {
    const confirme = await feedback.confirm(`Supprimer le tableau « ${feuille.nom} » ?`, {
      message: feuille.id === null ? "Ce tableau n'a pas encore été enregistré." : "Le tableau est retiré pour tous les utilisateurs.",
      confirmLabel: "Supprimer",
    });
    if (!confirme) return;
    if (feuille.id !== null) {
      try {
        await feedback.run(
          "Suppression du tableau…",
          () => api(`/api/v1/statistiques/compositions/${feuille.id}/`, { method: "DELETE" }),
          { success: { title: "Tableau supprimé" }, error: "Le tableau n'a pas été supprimé." },
        );
      } catch {
        return;
      }
      client.setQueryData<Enregistre[]>(CLE_LISTE, (courants = []) => courants.filter((item) => item.id !== feuille.id));
    }
    const rang = feuilles.findIndex((item) => item.cle === feuille.cle);
    const voisine = feuilles[rang + 1] ?? feuilles[rang - 1];
    oublier(feuille.cle);
    ouvrir(voisine && voisine.cle !== feuille.cle ? voisine.cle : "");
  }

  async function exporterTout() {
    try {
      await feedback.run("Préparation du classeur…", async () => {
        const tableaux = await Promise.all(feuilles.map(async (feuille) => {
          const champs = champsUtilises(feuille.config);
          const cube = await client.fetchQuery({
            queryKey: cleCube(feuille.config, champs),
            queryFn: () => chargerCube(feuille.config, champs),
            staleTime: 60_000,
          });
          return { nom: feuille.nom, config: feuille.config, cube, source: sourceEffective(catalogue.data, feuille.config) };
        }));
        exporterClasseurTcd(tableaux, "tableaux-croises.xlsx");
      }, { error: "Le classeur n'a pas pu être préparé." });
    } catch {
      /* le retour est déjà affiché */
    }
  }

  return (
    <AppChrome>
      <div className={PAGE}>
        <header className="flex flex-col gap-1">
          <h1 className="font-headline-md text-headline-md text-on-surface">Statistiques</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Composez vos tableaux croisés dynamiques comme dans Excel, tracez-les en graphique, puis exportez le classeur.
          </p>
        </header>

        <nav className="flex flex-col gap-3 border-b border-hairline sm:flex-row sm:items-end" aria-label="Feuilles de statistiques">
          <div role="tablist" aria-label="Feuilles" className="-mb-px flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
            {feuilles.map((feuille) => (
              <Onglet
                key={feuille.cle}
                actif={courante?.cle === feuille.cle}
                icone="table"
                libelle={feuille.nom.trim() || "Sans nom"}
                modifie={feuille.modifiee}
                partage={!feuille.mien}
                onClick={() => ouvrir(feuille.cle)}
              />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 pb-2">
            <button type="button" className={BOUTON_SECONDAIRE} disabled={!feuilles.length} onClick={() => void exporterTout()}>
              <Icone nom="download" className="text-lg" />
              Exporter le classeur
            </button>
            <button type="button" className={BOUTON_PRIMAIRE} onClick={nouveau}>
              <Icone nom="add" className="text-lg" />
              Nouveau tableau
            </button>
          </div>
        </nav>

        {liste.isError && (
          <p className="text-error">{liste.error instanceof ApiError ? liste.error.message : "Les tableaux enregistrés n'ont pas pu être chargés."}</p>
        )}
        {liste.isLoading && !courante && <p className="text-on-surface-variant">Chargement des tableaux…</p>}
        {liste.isSuccess && !courante && (
          <section className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center">
            <Icone nom="table" className="text-3xl text-primary" />
            <p className="mt-3 font-label-md text-label-md text-on-surface">Aucun tableau croisé pour l'instant</p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Créez-en un : choisissez une source, placez des champs en lignes et en colonnes, puis une mesure en valeurs.</p>
            <button type="button" className={`${BOUTON_PRIMAIRE} mt-4`} onClick={nouveau}>
              <Icone nom="add" className="text-lg" />
              Nouveau tableau
            </button>
          </section>
        )}
        {courante && (
          <TableauCroise
            key={courante.cle}
            feuille={courante}
            catalogue={catalogue.data}
            enregistrement={enregistrer.isPending}
            onChange={(modifier) => changer(courante.cle, modifier)}
            onEnregistrer={() => enregistrer.mutate(courante.id !== null && !courante.mien ? { ...courante, nom: `${courante.nom} (copie)` } : courante)}
            onDupliquer={() => creer(`${courante.nom} (copie)`, { ...structuredClone(courante.config), nom_auto: false })}
            onSupprimer={() => void supprimer(courante)}
          />
        )}
      </div>
    </AppChrome>
  );
}

function Onglet({ actif, icone, libelle, modifie = false, partage = false, onClick }: {
  actif: boolean;
  icone: string;
  libelle: string;
  modifie?: boolean;
  partage?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={actif}
      title={`${libelle}${modifie ? " — modifications non enregistrées" : ""}${partage ? " — tableau d'un autre utilisateur" : ""}`}
      className={`inline-flex max-w-[16rem] shrink-0 items-center gap-2 rounded-t-lg border px-3 py-2 font-label-md text-label-md transition-colors ${
        actif
          ? "border-hairline border-b-surface-container-lowest bg-surface-container-lowest text-primary shadow-sm"
          : "border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
      }`}
      onClick={onClick}
    >
      <Icone nom={icone} className={actif ? "text-primary" : ""} />
      <span className={`truncate ${partage ? "italic" : ""}`}>{libelle}</span>
      {modifie && <span className="size-2 shrink-0 rounded-full bg-secondary" aria-label="non enregistré" />}
    </button>
  );
}
