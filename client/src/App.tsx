import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { CarrieresScreen } from "./screens/CarrieresScreen";
import { AbsencesScreen, CongesScreen, DisciplineScreen, DotationScreen, FinCarriereScreen, SituationScreen } from "./screens/carrieres/Rubriques";
import { CircuitsScreen } from "./screens/CircuitsScreen";
import { StatistiquesScreen } from "./screens/StatistiquesScreen";
import { CommunicationScreen } from "./screens/CommunicationScreen";
import { SondageScreen } from "./screens/SondageScreen";
import { StructuresScreen } from "./screens/StructuresScreen";
import { UtilisateursScreen } from "./screens/UtilisateursScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { DossierScreen } from "./screens/DossierScreen";
import { BesoinsScreen, SocialScreen } from "./screens/ModuleScreens";
import { FormationScreen } from "./screens/formation/FormationScreen";
import { CguScreen } from "./screens/CguScreen";
import { ConfidentialiteScreen } from "./screens/ConfidentialiteScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProtectionDonneesScreen } from "./screens/ProtectionDonneesScreen";
import { getToken } from "./api/client";
import { MessagerieProvider } from "./screens/Messagerie";
import { FeedbackProvider } from "./ui/Feedback";
import { PageMotion, TopProgress } from "./ui/Motion";
import { TempsReelProvider } from "./ui/TempsReel";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter useTransitions={false}>
        <FeedbackProvider>
          <TopProgress />
          <SessionApplicative>
          <PublicMotion>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/connexion" element={<LoginScreen />} />
              <Route path="/conditions-generales" element={<CguScreen />} />
              <Route path="/confidentialite" element={<ConfidentialiteScreen />} />
              <Route path="/protection-des-donnees" element={<ProtectionDonneesScreen />} />
              <Route path="/app" element={<RequireAuth><DashboardScreen /></RequireAuth>} />
              <Route path="/app/dossiers" element={<RequireAuth><DossierScreen /></RequireAuth>} />
              <Route path="/app/dossiers/:matricule" element={<RequireAuth><DossierScreen /></RequireAuth>} />
              <Route path="/app/carrieres" element={<RequireAuth><CarrieresScreen /></RequireAuth>} />
              <Route path="/app/carrieres/dotation" element={<Navigate to="/app/gpec/recrutement" replace />} />
              <Route path="/app/carrieres/situation-administrative" element={<RequireAuth><SituationScreen /></RequireAuth>} />
              <Route path="/app/carrieres/absences" element={<RequireAuth><AbsencesScreen /></RequireAuth>} />
              <Route path="/app/carrieres/conges" element={<RequireAuth><CongesScreen /></RequireAuth>} />
              <Route path="/app/carrieres/procedures-disciplinaires" element={<RequireAuth><DisciplineScreen /></RequireAuth>} />
              <Route path="/app/carrieres/fin-de-carriere" element={<RequireAuth><FinCarriereScreen /></RequireAuth>} />
              <Route path="/app/action-sociale" element={<RequireAuth><SocialScreen /></RequireAuth>} />
              <Route path="/app/formation" element={<RequireAuth><FormationScreen /></RequireAuth>} />
              <Route path="/app/gpec" element={<Navigate to="/app/gpec/expression-des-besoins" replace />} />
              <Route path="/app/gpec/expression-des-besoins" element={<RequireAuth><BesoinsScreen /></RequireAuth>} />
              <Route path="/app/gpec/recrutement" element={<RequireAuth><DotationScreen /></RequireAuth>} />
              <Route path="/app/circuits" element={<RequireAuth><CircuitsScreen /></RequireAuth>} />
              <Route path="/app/statistiques" element={<RequireAuth><StatistiquesScreen /></RequireAuth>} />
              <Route path="/app/utilisateurs" element={<RequireAuth><UtilisateursScreen /></RequireAuth>} />
              <Route path="/app/structures" element={<RequireAuth><StructuresScreen /></RequireAuth>} />
              <Route path="/app/communication" element={<RequireAuth><CommunicationScreen /></RequireAuth>} />
              <Route path="/app/sondage" element={<RequireAuth><SondageScreen /></RequireAuth>} />
            </Routes>
          </PublicMotion>
          </SessionApplicative>
        </FeedbackProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Les écrans /app animent leur contenu dans AppChrome, pour que la barre latérale reste immobile.
function PublicMotion({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (pathname.startsWith("/app")) return children;
  return <PageMotion>{children}</PageMotion>;
}

/**
 * Temps réel et messagerie, montés une seule fois au-dessus des écrans : le WebSocket ne se
 * reconnecte pas à chaque navigation et le panneau de messagerie reste ouvert d'un écran à l'autre.
 * Actifs seulement dans l'application (/app), avec une session ouverte.
 */
function SessionApplicative({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const actif = pathname.startsWith("/app") && Boolean(getToken());
  return (
    <TempsReelProvider actif={actif}>
      <MessagerieProvider actif={actif}>{children}</MessagerieProvider>
    </TempsReelProvider>
  );
}
