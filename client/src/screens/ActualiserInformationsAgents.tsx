
import { AppChrome } from "./AppChrome";
import { GestionDossiersAgents } from "./GestionDossiersAgents";

export function ActualiserInformationsAgents() {
  return (
    <AppChrome>
      <GestionDossiersAgents mode="rh" />
    </AppChrome>
  );
}

export default ActualiserInformationsAgents;
