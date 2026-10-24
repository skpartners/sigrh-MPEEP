import type { AgentBrief } from "../api/types";

/** Position statutaire à afficher et, pour un agent en activité, ce qu'il fait aujourd'hui (présence au poste, formation, congé…). */
export function positionAffichee(agent: Pick<AgentBrief, "situation" | "situation_detail">): { position: string; detail: string } {
  const texte = (agent.situation || "").toLowerCase();
  const hors = /d[ée]tach|disposition|disponib|hors/.test(texte);
  if (hors || !texte) return { position: agent.situation || "Non renseignée", detail: "" };
  return { position: "En activité", detail: agent.situation_detail || (texte === "en activité" ? "" : agent.situation) };
}
