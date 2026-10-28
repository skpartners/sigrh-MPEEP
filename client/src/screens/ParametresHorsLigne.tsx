import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import { CLE_DROITS } from "../hors-ligne/capacites";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";
import { Skeleton } from "../ui/Motion";

type Matrice = {
  peut_modifier: boolean;
  capacites: { code: string; libelle: string; aide: string }[];
  roles: { id: number; role: string; description: string; capacites: string[] }[];
};

const CLE = ["parametres-hors-ligne"] as const;

/**
 * Travail hors ligne, rôle par rôle : ce qu'un rôle garde sur l'appareil et ce qu'il peut faire sans connexion.
 * Le serveur applique le même réglage au rejeu : retirer un droit refuse aussi une action déjà en attente.
 */
export function CarteHorsLigne() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const matrice = useQuery({ queryKey: CLE, queryFn: () => api<Matrice>("/api/v1/parametres/hors-ligne/") });
  const regler = useMutation({
    mutationFn: (corps: { role: number; capacite: string; autorise: boolean }) =>
      api<Matrice>("/api/v1/parametres/hors-ligne/", { method: "PATCH", body: JSON.stringify(corps) }),
    onSuccess: (donnees) => {
      client.setQueryData(CLE, donnees);
      // Le compte connecté peut avoir changé de droits : on les relit tout de suite.
      void client.invalidateQueries({ queryKey: CLE_DROITS });
    },
    onError: (erreur) => feedback.toast("Réglage impossible", erreur instanceof ApiError ? erreur.message : "Le réglage n'a pas été enregistré.", "error"),
  });

  const data = matrice.data;
  const modifiable = Boolean(data?.peut_modifier);

  return (
    <section className="motion-rise rounded-xl border border-hairline bg-surface-container-lowest p-6" aria-labelledby="titre-hors-ligne">
      <h2 id="titre-hors-ligne" className="font-headline-sm text-headline-sm text-on-surface">Travail hors ligne</h2>
      <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
        Choisissez, rôle par rôle, ce qui reste possible sans connexion. Une action faite hors ligne attend sur l'appareil, puis part seule au retour du réseau.
        Une case décochée est aussi appliquée par le serveur : une action déjà en attente est refusée à l'envoi.
      </p>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface">
        <Icone nom="lock" className="mt-0.5 shrink-0 text-lg" />
        <span>
          Tout ce qui est gardé sur l'appareil est chiffré (AES-256-GCM, clé non exportable) et effacé à la déconnexion. Sans « Consulter », aucune donnée n'est conservée pour le rôle.
        </span>
      </p>

      {matrice.isError ? (
        <p className="mt-4 font-body-md text-body-md text-error" role="alert">
          {matrice.error instanceof ApiError && matrice.error.status === 403
            ? "Cette rubrique est hors de votre habilitation."
            : "Les droits hors ligne n'ont pas pu être chargés."}
        </p>
      ) : !data ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <caption className="sr-only">Actions autorisées hors ligne, par rôle</caption>
            <thead className="bg-surface-container-low">
              <tr>
                <th scope="col" className="px-4 py-3 font-label-md text-label-md text-on-surface">Rôle</th>
                {data.capacites.map((capacite) => (
                  <th key={capacite.code} scope="col" className="px-3 py-3 text-center font-label-md text-label-md text-on-surface" title={capacite.aide}>
                    {capacite.libelle}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.roles.map((ligne) => (
                <tr key={ligne.id} className="border-t border-hairline">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="block font-label-md text-label-md text-on-surface">{ligne.role}</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">{ligne.description}</span>
                  </th>
                  {data.capacites.map((capacite) => {
                    const actif = ligne.capacites.includes(capacite.code);
                    return (
                      <td key={capacite.code} className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="accent-primary h-4 w-4"
                          checked={actif}
                          disabled={!modifiable || regler.isPending}
                          aria-label={`${ligne.role} : ${capacite.libelle}`}
                          onChange={(event) => regler.mutate({ role: ligne.id, capacite: capacite.code, autorise: event.target.checked })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data ? (
        <dl className="mt-4 grid gap-2 sm:grid-cols-2">
          {data.capacites.map((capacite) => (
            <div key={capacite.code}>
              <dt className="font-label-sm text-label-sm text-on-surface">{capacite.libelle}</dt>
              <dd className="font-body-sm text-body-sm text-on-surface-variant">{capacite.aide}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data && !modifiable ? (
        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">La modification est réservée aux comptes habilités à saisir ces paramètres.</p>
      ) : null}
    </section>
  );
}
