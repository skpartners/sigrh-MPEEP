import { AppChrome } from "./AppChrome";
import { Icone } from "../ui/Icone";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1";

/** Espace des projets et des études de ressources humaines, ouvert aux responsables de la DRH. */
export function ProjetsEtudesScreen() {
  return (
    <AppChrome>
      <div className={PAGE}>
        <section className="max-w-3xl rounded-xl border border-hairline bg-surface-container-lowest p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary">
              <Icone nom="assignment" className="text-2xl" />
            </span>
            <div>
              <h1 className="font-headline-md text-headline-md text-on-surface">Projets et études RH</h1>
              <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
                Les projets et les études menés par la direction des ressources humaines. Aucun dossier n'est encore enregistré.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppChrome>
  );
}
