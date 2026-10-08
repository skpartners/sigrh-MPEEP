import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { SessionUser } from "../api/types";
import { useFeedback } from "./Feedback";
import { Modale } from "./Modale";

type ParametresConnexion = {
  peut_modifier: boolean;
  connexion: {
    active: boolean;
    matricule: string;
    nom: string;
    prenoms: string;
    fonction: string;
    organisme: string;
  };
};

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";

export function EditeurConnexion({ user, onClose }: { user: SessionUser | undefined; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const page = useQuery({ queryKey: ["parametres"], queryFn: () => api<ParametresConnexion>("/api/v1/parametres/") });
  const organismes = useQuery({
    queryKey: ["organismes"],
    queryFn: () => api<{ code: string; nom: string; sigle: string }[]>("/api/v1/public/organismes/"),
  });
  const [matricule, setMatricule] = useState("");
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [fonction, setFonction] = useState("");
  const [organisme, setOrganisme] = useState("");
  const [passe, setPasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!page.data) return;
    setMatricule(page.data.connexion.matricule);
    setNom(page.data.connexion.nom);
    setPrenoms(page.data.connexion.prenoms);
    setFonction(page.data.connexion.fonction);
    setOrganisme(page.data.connexion.organisme);
  }, [page.data]);

  const data = page.data;
  const bloque = enCours || !data || !data.peut_modifier;

  async function enregistrer() {
    if ((passe || confirmation) && passe !== confirmation) {
      setErreur("La confirmation du mot de passe ne correspond pas.");
      return;
    }
    setEnCours(true);
    setErreur("");
    try {
      const reponse = await feedback.run(
        "Enregistrement des paramètres de connexion…",
        () =>
          api<ParametresConnexion>("/api/v1/parametres/connexion/", {
            method: "POST",
            body: JSON.stringify({
              matricule: matricule.trim(),
              nom: nom.trim(),
              prenoms: prenoms.trim(),
              fonction: fonction.trim(),
              organisme,
              mot_de_passe: passe,
              confirmation,
            }),
          }),
        { success: { title: "Connexion mise à jour", message: "Les identifiants de votre compte sont enregistrés." } },
      );
      client.setQueryData(["parametres"], reponse);
      await client.invalidateQueries({ queryKey: ["me"] });
      setPasse("");
      setConfirmation("");
      onClose();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Les paramètres de connexion n'ont pas pu être enregistrés.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      titre="Connexion"
      sousTitre="Le matricule et le mot de passe initiaux viennent du fichier d'environnement. Laissez le mot de passe vide pour le conserver."
      icone="lock"
      taille="lg"
      onClose={onClose}
      onSubmit={data?.connexion.active && data.peut_modifier ? () => void enregistrer() : undefined}
      enCours={enCours}
      erreur={erreur || (page.isError ? (page.error instanceof ApiError ? page.error.message : "Les paramètres n'ont pas pu être chargés.") : undefined)}
      libelleValider="Enregistrer"
    >
      {data && !data.connexion.active ? (
        <p className="font-body-md text-body-md text-on-surface">
          La connexion n'est pas encore activée. Renseignez SIGRH_ADMIN_MATRICULE et SIGRH_ADMIN_MOT_DE_PASSE, puis redémarrez le service.
        </p>
      ) : data && !data.peut_modifier ? (
        <p className="font-body-md text-body-md text-on-surface">
          {[data.connexion.prenoms, data.connexion.nom].filter(Boolean).join(" ") || data.connexion.matricule}
          {data.connexion.fonction ? ` · ${data.connexion.fonction}` : ""}. La modification est réservée aux comptes habilités.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Matricule</span>
            <input className={CHAMP} value={matricule} maxLength={150} disabled={bloque} autoComplete="username" onChange={(event) => setMatricule(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Fonction</span>
            <input className={CHAMP} value={fonction} maxLength={160} disabled={bloque} onChange={(event) => setFonction(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
            <input className={CHAMP} value={nom} maxLength={150} disabled={bloque} onChange={(event) => setNom(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Prénoms</span>
            <input className={CHAMP} value={prenoms} maxLength={150} disabled={bloque} onChange={(event) => setPrenoms(event.target.value)} />
          </label>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Organisme</span>
            <select className={CHAMP} value={organisme} disabled={bloque} onChange={(event) => setOrganisme(event.target.value)}>
              {(organismes.data ?? []).map((item) => (
                <option key={item.code} value={item.code}>{item.sigle ? `${item.nom} (${item.sigle})` : item.nom}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Nouveau mot de passe</span>
            <input className={CHAMP} type="password" value={passe} autoComplete="new-password" disabled={bloque} onChange={(event) => setPasse(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Confirmation</span>
            <input className={CHAMP} type="password" value={confirmation} autoComplete="new-password" disabled={bloque} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          {user ? (
            <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">
              Compte connecté : {user.nom_complet} · {user.matricule}.
            </p>
          ) : null}
        </div>
      )}
    </Modale>
  );
}
