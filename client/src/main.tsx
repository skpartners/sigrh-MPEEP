import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { jetonPresent } from "./api/adresse";
import "./styles/app.css";
import { demarrerSurveillance } from "./hors-ligne/connexion";
import { brancherEnregistrement, purgerLecture, restaurerLecture } from "./hors-ligne/lecture";
import { queryClient } from "./hors-ligne/queryClient";
import { appliquerCouleursMemorisees } from "./ui/Couleurs";

appliquerCouleursMemorisees();
demarrerSurveillance();

// Mode hors ligne : sans session, aucune donnée gardée ne reste lisible ; avec une session, les écrans déjà consultés
// reviennent avant le premier rendu (au plus 1,5 s d'attente : le démarrage ne dépend pas du coffre). Si le coffre est
// plus lent, l'écran s'affiche quand même et les données arrivent dès qu'elles sont lues.
const DELAI_RESTAURATION_MS = 1_500;
const lecture = jetonPresent() ? restaurerLecture(queryClient) : purgerLecture().then(() => false);
const restauration = Promise.race([lecture, new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), DELAI_RESTAURATION_MS))]);

// L'enregistrement ne démarre qu'une fois la copie gardée relue : sinon un démarrage lent écraserait de bonnes données
// par un cache à peine rempli.
void lecture.finally(() => brancherEnregistrement(queryClient));

// Service worker : l'application s'ouvre sans réseau. Désactivé en développement (Vite sert les modules à la volée).
if (import.meta.env.PROD && "serviceWorker" in navigator) void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));

void restauration.finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
