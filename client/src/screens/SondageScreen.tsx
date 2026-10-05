import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { dateLongue, nombre } from "../ui/format";
import { BOUTON_PRIMAIRE } from "../ui/Modale";
import { AppChrome } from "./AppChrome";

export type Sondage = {
  id: number;
  question: string;
  cloture: string;
  ouverte: boolean;
  participants: number;
  perimetre: string;
  ma_reponse: string;
  options: { libelle: string; voix: number; part: number }[];
};

export const CLE_SONDAGE = ["sondage-courant"] as const;

export function SondageScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const sondage = useQuery({ queryKey: CLE_SONDAGE, queryFn: () => api<Sondage | null>("/api/v1/sondage/") });
  const [choix, setChoix] = useState("");
  const data = sondage.data;

  const repondre = useMutation({
    mutationFn: () => api<Sondage>("/api/v1/sondage/reponse/", { method: "POST", body: JSON.stringify({ choix }) }),
    onSuccess: () => {
      feedback.toast("Réponse enregistrée");
      void client.invalidateQueries({ queryKey: CLE_SONDAGE });
      void client.invalidateQueries({ queryKey: ["communication"] });
    },
    onError: (error) => feedback.toast("Réponse impossible", error instanceof ApiError ? error.message : "L'envoi n'a pas abouti.", "error"),
  });

  return (
    <AppChrome>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <h1 className="font-headline-sm text-headline-sm text-on-surface">Sondage</h1>
        {data == null ? <p className="font-body-md text-body-md text-on-surface-variant">Aucun sondage n'est ouvert.</p> : null}
        {data ? (
          <form
            className="rounded-xl border border-hairline bg-surface-container-lowest p-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!data.ma_reponse && data.ouverte) repondre.mutate();
            }}
          >
            <p className="font-label-sm text-label-sm text-on-surface-variant">{data.perimetre} · clôture {dateLongue(data.cloture)}</p>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">{data.question}</h2>
            {data.ma_reponse || !data.ouverte ? (
              <div className="space-y-3">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {data.ma_reponse ? `Votre réponse : ${data.ma_reponse}. ` : "Ce sondage est clos. "}
                  {nombre(data.participants)} réponse{data.participants > 1 ? "s" : ""}.
                </p>
                {data.options.map((option) => (
                  <div key={option.libelle}>
                    <div className="flex justify-between font-label-sm text-label-sm">
                      <span>{option.libelle}</span>
                      <span className="font-code-num">{nombre(option.voix)} · {nombre(option.part, 1)} %</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-2 bg-primary" style={{ width: `${option.part}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className="sr-only">Votre réponse</legend>
                {data.options.map((option) => (
                  <label key={option.libelle} className="flex items-center gap-2 rounded border border-hairline px-3 py-2 font-body-md text-body-md">
                    <input type="radio" name="choix" className="accent-primary" checked={choix === option.libelle} onChange={() => setChoix(option.libelle)} />
                    {option.libelle}
                  </label>
                ))}
                <button type="submit" className={BOUTON_PRIMAIRE} disabled={!choix || repondre.isPending}>Envoyer ma réponse</button>
              </fieldset>
            )}
          </form>
        ) : null}
      </div>
    </AppChrome>
  );
}
