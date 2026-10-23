import { useEffect, useState } from "react";
import { Icone } from "./Icone";
import { VERIFIER_VERSION, nouvelleVersionPubliee } from "./versionApp";

const VERIFICATION_MS = 5 * 60 * 1000;
/** « Plus tard » : le bandeau revient après ce délai, pour qu'une mise à jour ne soit pas oubliée toute la journée. */
const REPORT_MS = 30 * 60 * 1000;

/**
 * Prévient qu'une nouvelle version de SIGRH est publiée : une application déjà ouverte ne recharge jamais
 * `index.html` toute seule. Vérification périodique, au retour sur l'onglet, au retour du réseau et après une
 * coupure du temps réel (redémarrage du serveur). Le rechargement reste au choix de l'utilisateur : un formulaire
 * en cours ne doit pas être perdu.
 */
export function NouvelleVersion() {
  const [disponible, setDisponible] = useState(false);
  const [reporteJusqua, setReporteJusqua] = useState(0);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    let actif = true;
    const verifier = () => {
      setMaintenant(Date.now());
      if (disponible) return;
      void nouvelleVersionPubliee().then((plusRecente) => {
        if (actif && plusRecente) setDisponible(true);
      });
    };
    const auRetour = () => {
      if (document.visibilityState === "visible") verifier();
    };
    const minuteur = window.setInterval(verifier, VERIFICATION_MS);
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("online", verifier);
    window.addEventListener(VERIFIER_VERSION, verifier);
    return () => {
      actif = false;
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("online", verifier);
      window.removeEventListener(VERIFIER_VERSION, verifier);
    };
  }, [disponible]);

  if (!disponible || maintenant < reporteJusqua) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-[400] flex items-start gap-3 rounded-2xl border border-white/10 bg-primary p-4 text-on-primary shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-md"
      role="status"
      aria-live="polite"
    >
      <Icone nom="system_update_alt" className="mt-0.5 shrink-0 text-2xl" />
      <div className="min-w-0 flex-1">
        <p className="font-label-lg text-label-lg font-bold">Nouvelle version disponible</p>
        <p className="mt-0.5 font-body-sm text-body-sm opacity-90">Enregistrez votre travail en cours, puis actualisez la page.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-lg bg-white px-3 py-1.5 font-label-md text-label-md font-bold text-primary hover:bg-primary-fixed" onClick={() => window.location.reload()}>
            Actualiser
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 font-label-md text-label-md font-semibold text-on-primary/90 hover:bg-white/10"
            onClick={() => {
              const instant = Date.now();
              setMaintenant(instant);
              setReporteJusqua(instant + REPORT_MS);
            }}
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
