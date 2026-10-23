import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, logout } from "../api/client";
import type { AdhesionEtat, SessionUser } from "../api/types";
import { Icone } from "../ui/Icone";
import { MarqueSigrh } from "../ui/MarqueSigrh";

/** Marge (px) sous laquelle le document est considéré lu jusqu'à la fin. */
const MARGE_FIN = 48;

export function AdhesionScreen() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const etat = useQuery({ queryKey: ["adhesion"], queryFn: () => api<AdhesionEtat>("/api/v1/adhesion/") });
  const [coche, setCoche] = useState(false);
  const [lu, setLu] = useState(false);

  const accepter = useMutation({
    mutationFn: (document: { code: string; version: string }) =>
      api<AdhesionEtat>("/api/v1/adhesion/", { method: "POST", body: JSON.stringify({ document: document.code, version: document.version }) }),
    onSuccess: (suite) => {
      // Le compte est déclaré à jour avant de quitter la page : sinon la garde de /app, qui lit encore l'ancien état,
      // renvoie ici et l'écran reste vide jusqu'à l'actualisation.
      if (suite.complet) client.setQueryData<SessionUser>(["me"], (me) => (me ? { ...me, adhesion_complete: true } : me));
      client.setQueryData(["adhesion"], suite);
      if (suite.complet) {
        // Dernier document accepté : on entre dans l'application par un chargement complet. L'écran du parcours se démonte
        // sans attendre la route suivante, et c'est ce qui laissait une page vide jusqu'à l'actualisation.
        window.location.replace(`${import.meta.env.BASE_URL}app`);
      }
    },
  });

  const documents = etat.data?.documents ?? [];
  const courant = documents.find((document) => !document.acceptee);
  const rang = courant ? documents.indexOf(courant) : documents.length;

  // Chaque document repart de zéro : à lire en entier, puis à cocher.
  useEffect(() => {
    setCoche(false);
    setLu(false);
  }, [courant?.code]);

  async function refuser() {
    await logout().catch(() => undefined);
    client.clear();
    navigate("/connexion", { replace: true });
  }

  // Parcours déjà terminé (page rouverte) : retour au menu. Juste après le dernier clic, le chargement complet s'en charge.
  if (etat.data?.complet && !accepter.isSuccess) return <Navigate to="/app" replace />;
  if (accepter.isSuccess && etat.data?.complet) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface" role="status">
        <p className="font-body-md text-body-md text-on-surface-variant">Ouverture de votre espace…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface font-body-md text-body-md text-on-surface">
      <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <header className="flex items-center justify-between gap-3">
          <MarqueSigrh />
          <p className="font-label-md text-label-md text-on-surface-variant">Première connexion</p>
        </header>

        <div>
          <h1 className="font-headline-md text-headline-md court:text-headline-sm">Avant d'accéder à votre espace</h1>
          <p className="mt-1 text-on-surface-variant court:hidden">
            Lisez et acceptez les trois documents suivants. Votre accord est enregistré avec la date, et redemandé si un document change.
          </p>
        </div>

        <ol className="flex flex-wrap gap-2" aria-label="Étapes du parcours">
          {documents.map((document, index) => {
            const faite = document.acceptee;
            const actuelle = index === rang;
            return (
              <li
                key={document.code}
                aria-current={actuelle ? "step" : undefined}
                className={`flex min-w-0 flex-1 basis-40 items-center gap-2 rounded-xl border px-3 py-2 court:py-1 ${actuelle ? "border-primary bg-primary-fixed/40" : "border-hairline bg-surface-container-lowest"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-label-md text-label-md ${faite ? "bg-primary text-on-primary" : actuelle ? "bg-primary-container text-on-primary" : "bg-surface-container-high text-on-surface-variant"}`}>
                  {faite ? <Icone nom="check" className="text-base leading-none" /> : index + 1}
                </span>
                <span className="min-w-0 font-label-md text-label-md">{document.libelle}</span>
              </li>
            );
          })}
        </ol>

        {etat.isError ? (
          <p role="alert" className="rounded-lg border border-error/40 bg-error-container/40 px-4 py-3 text-on-error-container">
            Impossible de charger le parcours. Rechargez la page ou reconnectez-vous.
          </p>
        ) : null}

        {courant ? (
          <section className="flex min-h-0 flex-1 flex-col gap-3" aria-labelledby="titre-document">
            <h2 id="titre-document" className="font-headline-sm text-headline-sm court:sr-only">
              {rang + 1}. {courant.libelle}
            </h2>
            <DocumentLu key={courant.code} route={courant.route} titre={courant.libelle} onLu={setLu} />
            <p className={`font-label-sm text-label-sm ${lu ? "text-primary" : "text-on-surface-variant"}`} aria-live="polite">
              {lu ? "Document lu jusqu'à la fin." : "Faites défiler le document jusqu'à la fin pour pouvoir l'accepter."}
            </p>

            <label className={`flex items-start gap-3 rounded-xl border border-hairline bg-surface-container-lowest px-4 py-3 ${lu ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-primary"
                checked={coche}
                disabled={!lu}
                onChange={(event) => setCoche(event.target.checked)}
              />
              <span>J'ai lu et j'accepte : {courant.libelle}.</span>
            </label>

            {accepter.isError ? (
              <p role="alert" className="text-error">
                {accepter.error instanceof Error ? accepter.error.message : "L'enregistrement a échoué."}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button type="button" className="rounded-xl px-4 py-3 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high" onClick={() => void refuser()}>
                Refuser et me déconnecter
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary px-5 py-3 font-label-md text-label-md font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!coche || !lu || accepter.isPending}
                onClick={() => accepter.mutate({ code: courant.code, version: courant.version })}
              >
                {rang === documents.length - 1 ? "Accepter et accéder à mon espace" : "Accepter et continuer"}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Le document public, dans un cadre ; signale quand son lecteur est arrivé en bas. */
function DocumentLu({ route, titre, onLu }: { route: string; titre: string; onLu: (lu: boolean) => void }) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const racine = import.meta.env.BASE_URL.replace(/\/$/, "");

  const verifier = useCallback(() => {
    const page = cadre.current?.contentDocument?.documentElement;
    if (!page) return;
    onLu(page.scrollHeight - (page.scrollTop + page.clientHeight) <= MARGE_FIN);
  }, [onLu]);

  useEffect(() => () => onLu(false), [onLu]);

  function apresChargement() {
    const fenetre = cadre.current?.contentWindow;
    const corps = cadre.current?.contentDocument?.body;
    if (!fenetre || !corps) return;
    fenetre.addEventListener("scroll", verifier, { passive: true });
    // La page se construit après le chargement : on recontrôle quand sa hauteur change.
    new ResizeObserver(verifier).observe(corps);
    verifier();
  }

  return (
    <iframe
      ref={cadre}
      title={titre}
      src={`${racine}${route}?integre=1`}
      onLoad={apresChargement}
      className="min-h-80 w-full flex-1 rounded-xl border border-hairline bg-surface"
    />
  );
}
