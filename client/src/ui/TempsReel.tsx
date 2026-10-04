import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiBaseUrl, getToken } from "../api/client";

export type EvenementTempsReel =
  | { type: "message.nouveau"; conversation_id: number; message_id: number; auteur_id: number; auteur_matricule: string; auteur: string; extrait: string }
  | { type: "messagerie.lu"; conversation_id: number }
  | { type: "notification.nouvelle"; id: number; titre: string; urgente: boolean };

type TempsReelApi = {
  /** Vrai quand le WebSocket est authentifié : le rafraîchissement périodique peut s'espacer. */
  connecte: boolean;
  abonner: (ecouteur: (evenement: EvenementTempsReel) => void) => () => void;
};

const TempsReelContext = createContext<TempsReelApi>({ connecte: false, abonner: () => () => undefined });

export function useTempsReel(): TempsReelApi {
  return useContext(TempsReelContext);
}

/** Intervalle de secours : rapide sans WebSocket, lent quand le temps réel fonctionne. */
export function useIntervalle(sansTempsReelMs: number): number {
  return useTempsReel().connecte ? 60_000 : sansTempsReelMs;
}

const PING_MS = 25_000;
const DELAI_MAX_MS = 30_000;
const FERMETURE_NON_AUTHENTIFIE = 4401;

function adresse(): string {
  return `${apiBaseUrl().replace(/^http/, "ws")}/ws/`;
}

/**
 * Un WebSocket par onglet. Le jeton est envoyé dans le premier message, jamais dans l'URL.
 * Chaque événement rafraîchit les données concernées ; après une coupure, tout est resynchronisé.
 */
export function TempsReelProvider({ children, actif }: { children: ReactNode; actif: boolean }) {
  const client = useQueryClient();
  const [connecte, setConnecte] = useState(false);
  const ecouteurs = useRef(new Set<(evenement: EvenementTempsReel) => void>());

  const abonner = useCallback((ecouteur: (evenement: EvenementTempsReel) => void) => {
    ecouteurs.current.add(ecouteur);
    return () => {
      ecouteurs.current.delete(ecouteur);
    };
  }, []);

  useEffect(() => {
    if (!actif) return;
    let socket: WebSocket | null = null;
    let ping = 0;
    let relance = 0;
    let delai = 1_000;
    let arrete = false;
    let dejaConnecte = false;

    function traiter(evenement: EvenementTempsReel) {
      if (evenement.type === "message.nouveau" || evenement.type === "messagerie.lu") {
        void client.invalidateQueries({ queryKey: ["messagerie"] });
      } else if (evenement.type === "notification.nouvelle") {
        // Une notification suit une action : les écrans qu'elle concerne changent aussi.
        for (const cle of ["notifications", "dashboard", "carrieres", "circuits"]) void client.invalidateQueries({ queryKey: [cle] });
      }
      ecouteurs.current.forEach((ecouteur) => ecouteur(evenement));
    }

    function ouvrir() {
      const jeton = getToken();
      if (!jeton || arrete) return;
      socket = new WebSocket(adresse());
      socket.onopen = () => socket?.send(JSON.stringify({ type: "auth", token: jeton }));
      socket.onmessage = (message) => {
        let donnees: { type?: string };
        try {
          donnees = JSON.parse(String(message.data));
        } catch {
          return;
        }
        if (donnees.type === "pret") {
          setConnecte(true);
          delai = 1_000;
          // Après une coupure, des événements ont pu être manqués : on resynchronise tout.
          if (dejaConnecte) void client.invalidateQueries();
          dejaConnecte = true;
          ping = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "ping" })), PING_MS);
        } else if (donnees.type && donnees.type !== "pong") {
          traiter(donnees as EvenementTempsReel);
        }
      };
      socket.onclose = (fermeture) => {
        setConnecte(false);
        window.clearInterval(ping);
        // Jeton refusé : inutile d'insister (l'API redirigera vers la connexion).
        if (arrete || fermeture.code === FERMETURE_NON_AUTHENTIFIE) return;
        relance = window.setTimeout(ouvrir, delai);
        delai = Math.min(delai * 2, DELAI_MAX_MS);
      };
    }

    ouvrir();
    return () => {
      arrete = true;
      window.clearTimeout(relance);
      window.clearInterval(ping);
      socket?.close();
      setConnecte(false);
    };
  }, [client, actif]);

  return <TempsReelContext.Provider value={{ connecte, abonner }}>{children}</TempsReelContext.Provider>;
}
