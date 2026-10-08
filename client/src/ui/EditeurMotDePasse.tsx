import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, remplacerToken } from "../api/client";
import type { SessionUser } from "../api/types";
import { useFeedback } from "./Feedback";
import { Modale } from "./Modale";

const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-70";

/** Paramètres de connexion de l'utilisateur connecté : identifiant affiché, mot de passe modifiable. */
export function EditeurMotDePasse({ user, onClose }: { user: SessionUser | undefined; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    if (!actuel || !nouveau) {
      setErreur("Saisissez le mot de passe actuel et le nouveau.");
      return;
    }
    if (nouveau !== confirmation) {
      setErreur("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setEnCours(true);
    setErreur("");
    try {
      const reponse = await feedback.run(
        "Changement du mot de passe…",
        () => api<{ detail: string; token: string }>("/api/v1/me/mot-de-passe/", {
          method: "POST",
          body: JSON.stringify({ actuel, nouveau, confirmation }),
        }),
        { success: { title: "Mot de passe modifié", message: "Utilisez-le à votre prochaine connexion. Vos autres appareils sont déconnectés." } },
      );
      // La session en cours continue avec le jeton renouvelé.
      remplacerToken(reponse.token);
      void client.invalidateQueries({ queryKey: ["notifications"] });
      onClose();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Le mot de passe n'a pas pu être modifié.");
    } finally {
      setEnCours(false);
    }
  }

  const type = visible ? "text" : "password";
  return (
    <Modale
      titre="Ma connexion"
      sousTitre="Votre identifiant et votre mot de passe pour ouvrir le SIGRH."
      icone="lock"
      taille="md"
      onClose={onClose}
      onSubmit={() => void enregistrer()}
      libelleValider="Changer le mot de passe"
      enCours={enCours}
      erreur={erreur || undefined}
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Identifiant de connexion (matricule)</span>
          <input className={CHAMP} value={user?.matricule ?? ""} disabled readOnly autoComplete="username" />
          <span className="block font-body-sm text-body-sm text-on-surface-variant">
            Le matricule relie votre compte à votre dossier : seul un administrateur peut le modifier.
          </span>
        </label>
        <label className="block space-y-1.5">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Mot de passe actuel</span>
          <input className={CHAMP} type={type} value={actuel} required autoComplete="current-password" disabled={enCours} onChange={(event) => setActuel(event.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Nouveau mot de passe</span>
            <input className={CHAMP} type={type} value={nouveau} required minLength={8} autoComplete="new-password" disabled={enCours} onChange={(event) => setNouveau(event.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Confirmation</span>
            <input className={CHAMP} type={type} value={confirmation} required autoComplete="new-password" disabled={enCours} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          Afficher les mots de passe
        </label>
        <p className="rounded-lg bg-surface-container-low px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">
          Au moins 8 caractères, pas uniquement des chiffres, ni un mot de passe courant ou proche de votre nom.
          Après le changement, vos autres appareils devront se reconnecter.
        </p>
      </div>
    </Modale>
  );
}
