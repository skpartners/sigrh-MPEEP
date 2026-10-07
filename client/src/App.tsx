import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { CarrieresScreen } from "./screens/CarrieresScreen";
import { AbsencesScreen, CongesScreen, DisciplineScreen, DotationScreen, FinCarriereScreen, SituationScreen } from "./screens/carrieres/Rubriques";
import { CircuitsScreen } from "./screens/CircuitsScreen";
import { HabilitationsScreen } from "./screens/HabilitationsScreen";
import { StatistiquesScreen } from "./screens/StatistiquesScreen";
import { CommunicationScreen } from "./screens/CommunicationScreen";
import { SondageScreen } from "./screens/SondageScreen";
import { ParametresScreen } from "./screens/ParametresScreen";
import { StructuresScreen } from "./screens/StructuresScreen";
import { UtilisateursScreen } from "./screens/UtilisateursScreen";
import { AideScreen } from "./screens/AideScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { DossierScreen } from "./screens/DossierScreen";
import { BesoinsScreen, SocialScreen } from "./screens/ModuleScreens";
import { FormationScreen } from "./screens/formation/FormationScreen";
import { CguScreen } from "./screens/CguScreen";
import { ConfidentialiteScreen } from "./screens/ConfidentialiteScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { HubScreen } from "./screens/HubScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProtectionDonneesScreen } from "./screens/ProtectionDonneesScreen";
import { api, getToken, logout } from "./api/client";
import { MessagerieProvider } from "./screens/Messagerie";
import { CouleursApplication } from "./ui/Couleurs";
import { FeedbackProvider } from "./ui/Feedback";
import { EtiquettesTableaux } from "./ui/EtiquettesTableaux";
import { PageMotion, TopProgress } from "./ui/Motion";
import { TempsReelProvider } from "./ui/TempsReel";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CouleursApplication />
      <BrowserRouter basename="/sigrh" useTransitions={false}>
        <FeedbackProvider>
          <EtiquettesTableaux />
          <TopProgress />
          <SessionApplicative>
          <PublicMotion>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/connexion" element={<LoginScreen />} />
              <Route path="/conditions-generales" element={<CguScreen />} />
              <Route path="/confidentialite" element={<ConfidentialiteScreen />} />
              <Route path="/protection-des-donnees" element={<ProtectionDonneesScreen />} />
              <Route path="/app" element={<RequireAuth><HubScreen /></RequireAuth>} />
              <Route path="/app/vue-densemble" element={<Navigate to="/app/tableau-de-bord" replace />} />
              <Route path="/app/tableau-de-bord" element={<RequireAuth><DashboardScreen /></RequireAuth>} />
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
              <Route path="/app/habilitations" element={<RequireAuth><HabilitationsScreen /></RequireAuth>} />
              <Route path="/app/statistiques" element={<RequireAuth><StatistiquesScreen /></RequireAuth>} />
              <Route path="/app/utilisateurs" element={<RequireAuth><UtilisateursScreen /></RequireAuth>} />
              <Route path="/app/structures" element={<RequireAuth><StructuresScreen /></RequireAuth>} />
              <Route path="/app/parametres" element={<RequireAuth><ParametresScreen /></RequireAuth>} />
              <Route path="/app/communication" element={<RequireAuth><CommunicationScreen /></RequireAuth>} />
              <Route path="/app/sondage" element={<RequireAuth><SondageScreen /></RequireAuth>} />
              <Route path="/app/aide" element={<RequireAuth><AideScreen /></RequireAuth>} />
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
const INACTIVITE_DEFAUT_MIN = 15;
const CLE_ACTIVITE = "sigrh_derniere_activite";

function SessionApplicative({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const versConnexion = useRef(navigate);
  versConnexion.current = navigate;
  const actif = pathname.startsWith("/app") && Boolean(getToken());
  const reglages = useQuery({
    queryKey: ["parametres"],
    queryFn: () => api<{ inactivite_minutes: number }>("/api/v1/parametres/"),
    enabled: actif,
    staleTime: 30_000,
  });
  const minutes = reglages.data?.inactivite_minutes ?? INACTIVITE_DEFAUT_MIN;
  const inactiviteMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : INACTIVITE_DEFAUT_MIN) * 60 * 1000;

  useEffect(() => {
    if (!actif) return;
    let delai = 0;
    let dernier = 0;
    const noter = () => localStorage.setItem(CLE_ACTIVITE, String(Date.now()));
    const expirer = () => {
      const depuis = Date.now() - Number(localStorage.getItem(CLE_ACTIVITE) || 0);
      if (depuis < inactiviteMs) {
        delai = window.setTimeout(expirer, inactiviteMs - depuis);
        return;
      }
      // Un onglet resté ouvert ne ferme pas la session d'un autre onglet encore utilisé.
      if (!window.location.pathname.includes("/app") || !getToken()) return;
      void logout().finally(() => versConnexion.current("/connexion", { replace: true }));
    };
    const armer = () => {
      const maintenant = Date.now();
      if (maintenant - dernier < 1000) return;
      dernier = maintenant;
      noter();
      window.clearTimeout(delai);
      delai = window.setTimeout(expirer, inactiviteMs);
    };
    armer();
    const evenements = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    evenements.forEach((nom) => window.addEventListener(nom, armer, { passive: true, capture: true }));
    return () => {
      window.clearTimeout(delai);
      evenements.forEach((nom) => window.removeEventListener(nom, armer, { capture: true }));
    };
  }, [actif, inactiviteMs]);

  return (
    <TempsReelProvider actif={actif}>
      <MessagerieProvider actif={actif}>{children}</MessagerieProvider>
    </TempsReelProvider>
  );
}
