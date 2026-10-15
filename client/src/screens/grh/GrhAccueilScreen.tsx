import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { SessionUser } from "../../api/types";
import { AppChrome } from "../AppChrome";
import { ACCENTS, CarteModule } from "../HubScreen";
import { destinationModule, domainesDuMenu, moduleAutorise, NAV } from "../navigation";
import { PAGE } from "./ui";

const RESUMES: Record<string, { icone: string; resume: string }> = {
  "I. Gestion des carrières": {
    icone: "assignment",
    resume: "Parcours professionnels, discipline, congés et absences, puis le bilan de la gestion de carrière.",
  },
  "II. Action sociale": {
    icone: "volunteer_activism",
    resume: "Fins de carrière (limite d'âge, décès, démission, révocation, licenciement), distinctions et aides sociales.",
  },
  "III. Formation continue": {
    icone: "school",
    resume: "Élaboration du plan de formation, suivi hors et en Côte d'Ivoire, et bilan de la formation.",
  },
  "IV. Programmation des effectifs": {
    icone: "groups",
    resume: "Besoins exprimés, validés en Conférence puis au Catalogue, dotation et bilan de satisfaction.",
  },
};

/** Accueil du menu GRH : une carte par domaine, comme l'accueil général. Le sidebar ne garde que le domaine ouvert. */
export function GrhAccueilScreen() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const acces = me.data?.acces;
  const grh = NAV.flatMap((section) => section.liens).find((lien) => lien.to === "/app/grh");
  const domaines = grh ? domainesDuMenu(grh, RESUMES) : [];

  return (
    <AppChrome>
      <div className={PAGE}>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {domaines.map((domaine, index) => (
            <CarteModule
              key={domaine.libelle}
              lien={domaine}
              accent={ACCENTS[index % ACCENTS.length]}
              autorise={moduleAutorise(acces, domaine)}
              vers={destinationModule(acces, domaine)}
            />
          ))}
        </div>
      </div>
    </AppChrome>
  );
}
