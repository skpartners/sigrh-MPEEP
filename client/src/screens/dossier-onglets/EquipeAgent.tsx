import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../../api/client";
import { Chargement } from "../../ui/Chargement";
import { Icone } from "../../ui/Icone";
import { Pagination, usePagination } from "../../ui/Pagination";
import { Portrait } from "../../ui/PhotoProfil";
import { correspond } from "../../ui/recherche";

type Membre = {
  matricule: string;
  nom_complet: string;
  initiales: string;
  photo_url: string;
  fonction: string;
  structure: string;
  courriel: string;
  telephone: string;
  relation: string;
  relation_libelle: string;
  presence: { ton: "present" | "conge" | "maladie"; badge: string; libelle: string };
};
type Equipe = {
  service: string;
  total: number;
  tronque: boolean;
  relations: { code: string; libelle: string; nombre: number }[];
  membres: Membre[];
};

const TON_PRESENCE: Record<Membre["presence"]["ton"], string> = {
  present: "bg-primary/10 text-primary",
  conge: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  maladie: "bg-error-container text-on-error-container",
};
const CHAMP = "w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-9 pr-3 py-2 text-on-surface";

/** Onglet « Ma team » : le supérieur, le service, les agents qui relèvent de l'utilisateur et ceux de son périmètre. */
export function EquipeAgent({ matricule }: { matricule: string }) {
  const [relation, setRelation] = useState("");
  const [recherche, setRecherche] = useState("");
  const equipe = useQuery({ queryKey: ["equipe", matricule], queryFn: () => api<Equipe>(`/api/v1/agents/${encodeURIComponent(matricule)}/equipe/`) });
  const visibles = (equipe.data?.membres ?? []).filter(
    (membre) => (!relation || membre.relation === relation) && correspond(`${membre.nom_complet} ${membre.matricule} ${membre.fonction} ${membre.structure}`, recherche),
  );
  const page = usePagination(visibles, `${relation}|${recherche}`, 12);

  if (equipe.isPending) return <Chargement libelle="Chargement de votre équipe…" />;
  if (equipe.isError) {
    return (
      <p className="font-body-md text-body-md text-error" role="alert">
        {equipe.error instanceof ApiError ? equipe.error.message : "Votre équipe n'a pas pu être chargée."}
      </p>
    );
  }
  const donnees = equipe.data;

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-hairline overflow-hidden" aria-labelledby="titre-ma-team">
      <div className="px-6 py-4 bg-surface-container-low flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icone nom="groups" className="text-primary text-xl shrink-0" />
          <div className="min-w-0">
            <h2 id="titre-ma-team" className="font-headline-sm text-headline-sm font-bold text-on-surface">Ma team</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">{donnees.service || "Service non renseigné"}</p>
          </div>
        </div>
        <span className="font-code-num text-label-sm text-on-surface-variant shrink-0">
          {donnees.total} collaborateur{donnees.total > 1 ? "s" : ""}
        </span>
      </div>

      <div className="p-6 space-y-5">
        {donnees.total === 0 ? (
          <p className="py-8 text-center font-body-md text-body-md text-on-surface-variant">
            Aucun collaborateur n'est rattaché à votre service pour le moment.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[14rem] max-w-md">
                <Icone nom="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant" />
                <input type="search" aria-label="Rechercher un collaborateur" className={CHAMP} placeholder="Nom, matricule, fonction…" value={recherche} onChange={(event) => setRecherche(event.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lien avec vous">
                <Puce actif={relation === ""} onClick={() => setRelation("")}>{`Tous (${donnees.total})`}</Puce>
                {donnees.relations.filter((item) => item.nombre > 0).map((item) => (
                  <Puce key={item.code} actif={relation === item.code} onClick={() => setRelation(item.code)}>{`${item.libelle} (${item.nombre})`}</Puce>
                ))}
              </div>
            </div>

            {visibles.length === 0 ? (
              <p className="py-6 text-center font-body-md text-body-md text-on-surface-variant">Aucun collaborateur ne correspond à cette recherche.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {page.visibles.map((membre) => <CarteMembre key={membre.matricule} membre={membre} />)}
              </ul>
            )}
            {donnees.tronque ? <p className="font-label-sm text-label-sm text-on-surface-variant">La liste est limitée aux {donnees.membres.length} premiers collaborateurs.</p> : null}
          </>
        )}
      </div>
      <Pagination page={page.page} pages={page.pages} total={page.total} aller={page.aller} libelle="collaborateur" />
    </section>
  );
}

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-label-md text-label-md transition-colors ${actif ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
    >
      {children}
    </button>
  );
}

function CarteMembre({ membre }: { membre: Membre }) {
  return (
    <li className="rounded-xl border border-hairline bg-surface-container-lowest p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Portrait agent={membre} className="w-12 h-12 shrink-0 rounded-xl bg-primary-fixed text-on-primary-fixed font-label-lg text-label-lg" />
        <div className="min-w-0 flex-1">
          <p className="font-label-lg text-label-lg font-bold text-on-surface truncate" title={membre.nom_complet}>{membre.nom_complet}</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant truncate" title={membre.fonction}>{membre.fonction || "Fonction non renseignée"}</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant truncate" title={membre.structure}>{membre.structure}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">{membre.relation_libelle}</span>
        <span className={`rounded px-2 py-0.5 font-label-sm text-label-sm font-semibold ${TON_PRESENCE[membre.presence.ton]}`} title={membre.presence.libelle}>{membre.presence.badge}</span>
      </div>
      {membre.presence.ton !== "present" ? <p className="font-label-sm text-label-sm text-on-surface-variant">{membre.presence.libelle}</p> : null}
      {membre.courriel || membre.telephone ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline pt-3 font-label-sm text-label-sm">
          {membre.courriel ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline min-w-0" href={`mailto:${membre.courriel}`}>
              <Icone nom="mail" className="text-base shrink-0" /><span className="truncate">{membre.courriel}</span>
            </a>
          ) : null}
          {membre.telephone ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${membre.telephone.replace(/\s+/g, "")}`}>
              <Icone nom="call" className="text-base shrink-0" />{membre.telephone}
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
