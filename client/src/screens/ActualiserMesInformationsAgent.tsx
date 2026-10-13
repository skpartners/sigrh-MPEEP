import { useParams } from "react-router-dom";
import { AppChrome } from "./AppChrome";
import { GestionDossiersAgents } from "./GestionDossiersAgents";

export function ActualiserMesInformationsAgent() {
  const { matricule } = useParams<{ matricule: string }>();

  return (
    <AppChrome>
      <GestionDossiersAgents
        mode="agent"
        matricule={matricule}
      />
    </AppChrome>
  );
}