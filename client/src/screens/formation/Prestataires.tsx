import { useState } from "react";
import { dateCourte, nombre, pluriel } from "../../ui/format";
import { useAction } from "../../ui/useAction";
import type { Prestataire, TableauFormation } from "./types";
import { BOUTON_ICONE, BOUTON_PRIMAIRE, Badge, CARTE, Case, DateChamp, EnTeteSection, Liste, Modale, Texte, Vide, messageErreur, useEnregistrement } from "./ui";

const CATEGORIES = [
  { valeur: "ecole", libelle: "École publique de formation" },
  { valeur: "institut", libelle: "Institut ou université" },
  { valeur: "cabinet", libelle: "Cabinet privé agréé" },
  { valeur: "interne", libelle: "Formateurs internes" },
];

/** Organismes qui dispensent les modules, avec le suivi de leur convention. */
export function Prestataires({ data }: { data: TableauFormation }) {
  const [edition, setEdition] = useState<Prestataire | "nouveau" | null>(null);
  const [inactifs, setInactifs] = useState(false);
  const { agir } = useAction();
  const liste = data.prestataires.filter((p) => inactifs || p.actif);

  function supprimer(p: Prestataire) {
    void agir({
      confirmation: `Supprimer le prestataire « ${p.nom} » ?`,
      confirmLabel: "Supprimer",
      attente: "Suppression du prestataire…",
      route: `/api/v1/formation/prestataires/${p.id}/`,
      methode: "DELETE",
      succes: "Prestataire supprimé",
    });
  }

  return (
    <section aria-labelledby="titre-prestataires">
      <EnTeteSection
        icone="assured_workload"
        titre="Prestataires et conventions"
        sousTitre={`${pluriel(data.indicateurs.prestataires_actifs, "prestataire actif", "prestataires actifs")} · seuls les actifs sont proposés à la planification`}
        action={
          <div className="flex flex-wrap items-center gap-4">
            <Case libelle="Afficher les inactifs" coche={inactifs} onChange={setInactifs} />
            <button type="button" className={BOUTON_PRIMAIRE} onClick={() => setEdition("nouveau")}>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">post_add</span>
              Nouveau prestataire
            </button>
          </div>
        }
      />
      {liste.length === 0 ? (
        <Vide icone="assured_workload" titre="Aucun prestataire" texte="Référencez les organismes qui dispensent vos modules." />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {liste.map((p) => (
            <li key={p.id} className={`${CARTE} motion-content p-5 flex flex-col gap-3 ${p.actif ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-label-sm text-label-sm text-primary font-semibold">{p.categorie_libelle}</p>
                  <h3 className="font-label-lg text-label-lg text-on-surface font-bold mt-0.5">{p.nom}</h3>
                  {p.ville ? <p className="font-body-sm text-body-sm text-on-surface-variant">{p.ville}</p> : null}
                </div>
                <div className="flex shrink-0">
                  <button type="button" className={BOUTON_ICONE} onClick={() => setEdition(p)} aria-label={`Modifier ${p.nom}`} title="Modifier">
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
                  </button>
                  {p.sessions === 0 ? (
                    <button type="button" className={BOUTON_ICONE} onClick={() => supprimer(p)} aria-label={`Supprimer ${p.nom}`} title="Supprimer">
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                    </button>
                  ) : null}
                </div>
              </div>
              {p.specialites ? <p className="font-body-sm text-body-sm text-on-surface">{p.specialites}</p> : null}
              <dl className="grid grid-cols-2 gap-2 font-body-sm text-body-sm">
                <div className="rounded bg-surface-container-low p-2.5">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">Modules confiés</dt>
                  <dd className="font-label-lg text-label-lg text-on-surface">{nombre(p.sessions)}</dd>
                </div>
                <div className="rounded bg-surface-container-low p-2.5">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">Heures dispensées</dt>
                  <dd className="font-label-lg text-label-lg text-on-surface">{nombre(p.heures)} h</dd>
                </div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                {!p.actif ? <Badge ton="bg-surface-container-high text-on-surface-variant">Inactif</Badge> : null}
                {p.categorie === "interne" ? null : p.convention_fin ? (
                  <Badge ton={p.convention_valide ? "bg-primary-fixed text-on-primary-fixed" : "bg-error-container text-on-error-container"}>
                    {p.convention_valide ? `Convention jusqu'au ${dateCourte(p.convention_fin)}` : `Convention échue le ${dateCourte(p.convention_fin)}`}
                  </Badge>
                ) : (
                  <Badge ton="bg-secondary-fixed text-on-secondary-fixed">Sans convention</Badge>
                )}
                {p.contact_nom ? <span>{p.contact_nom}{p.contact_telephone ? ` · ${p.contact_telephone}` : ""}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {edition ? <FormulairePrestataire prestataire={edition === "nouveau" ? null : edition} onClose={() => setEdition(null)} /> : null}
    </section>
  );
}

function FormulairePrestataire({ prestataire: p, onClose }: { prestataire: Prestataire | null; onClose: () => void }) {
  const [f, setF] = useState({
    nom: p?.nom ?? "",
    categorie: p?.categorie ?? "institut",
    specialites: p?.specialites ?? "",
    ville: p?.ville ?? "",
    contact_nom: p?.contact_nom ?? "",
    contact_email: p?.contact_email ?? "",
    contact_telephone: p?.contact_telephone ?? "",
    convention_debut: p?.convention_debut ?? "",
    convention_fin: p?.convention_fin ?? "",
  });
  const [actif, setActif] = useState(p?.actif ?? true);
  const enregistrer = useEnregistrement<Prestataire>(onClose, p ? "Prestataire mis à jour" : "Prestataire référencé");
  const maj = (cle: keyof typeof f) => (valeur: string) => setF((a) => ({ ...a, [cle]: valeur }));

  return (
    <Modale
      titre={p ? "Modifier le prestataire" : "Nouveau prestataire"}
      onClose={onClose}
      onSubmit={() => enregistrer.mutate({ route: p ? `/api/v1/formation/prestataires/${p.id}/` : "/api/v1/formation/prestataires/", methode: p ? "PATCH" : "POST", corps: { ...f, actif } })}
      enCours={enregistrer.isPending}
      erreur={messageErreur(enregistrer.error)}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        <Texte libelle="Nom" obligatoire max={160} valeur={f.nom} onChange={maj("nom")} className="sm:col-span-2" />
        <Liste libelle="Catégorie" obligatoire valeur={f.categorie} onChange={maj("categorie")} options={CATEGORIES} />
        <Texte libelle="Ville" max={80} valeur={f.ville} onChange={maj("ville")} />
        <Texte libelle="Spécialités" max={240} valeur={f.specialites} onChange={maj("specialites")} className="sm:col-span-2" />
        <Texte libelle="Contact" max={120} valeur={f.contact_nom} onChange={maj("contact_nom")} />
        <Texte libelle="Téléphone" max={40} valeur={f.contact_telephone} onChange={maj("contact_telephone")} />
        <Texte libelle="Courriel" max={254} valeur={f.contact_email} onChange={maj("contact_email")} className="sm:col-span-2" />
        <DateChamp libelle="Début de convention" valeur={f.convention_debut} onChange={maj("convention_debut")} />
        <DateChamp libelle="Fin de convention" valeur={f.convention_fin} min={f.convention_debut || undefined} onChange={maj("convention_fin")} />
      </div>
      <div className="mt-5">
        <Case libelle="Prestataire actif" aide="Un prestataire inactif n'est plus proposé à la planification ; son historique est conservé." coche={actif} onChange={setActif} />
      </div>
    </Modale>
  );
}
