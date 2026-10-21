import { useRef } from "react";
import { Link } from "react-router-dom";
import { Icone } from "../ui/Icone";
import { useHauteurFixe } from "../ui/HauteurFixe";
import { MarqueSigrh } from "../ui/MarqueSigrh";
import { useModeIntegre } from "../ui/ModeIntegre";
import type { DocumentJuridique, SectionJuridique } from "./documentsJuridiques";
import { PublicHeaderNav } from "./PublicHeaderNav";

const LIENS_DOCUMENTS = [
  ["/conditions-generales", "Conditions générales d'utilisation"],
  ["/confidentialite", "Politique de confidentialité"],
  ["/protection-des-donnees", "Protection des données personnelles"],
] as const;

/**
 * Page publique d'un document juridique. Avec `?integre=1` (parcours d'adhésion, affiché dans un cadre), elle
 * n'a ni en-tête, ni fil d'Ariane, ni pied de page : le texte occupe tout l'espace.
 */
export function PageJuridique({ document }: { document: DocumentJuridique }) {
  const integre = useModeIntegre();
  const enteteRef = useRef<HTMLElement>(null);
  useHauteurFixe(enteteRef, "--haut-entete");

  return (
    <>
      {integre ? null : <Entete enteteRef={enteteRef} />}
      <main className="w-full bg-surface pt-[calc(var(--haut-entete)+0.5rem)]">
        <div className="w-full bg-surface-container-high/60">
          <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            {integre ? null : (
              <nav aria-label="Fil d'Ariane" className="mb-3 flex flex-wrap items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                <Link to="/" className="flex items-center gap-1 hover:text-primary">
                  <Icone nom="home" className="text-base" />
                  Accueil
                </Link>
                <span aria-hidden="true">/</span>
                <span>Cadre juridique</span>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-on-surface">{document.titre}</span>
              </nav>
            )}
            <p className="mb-2 inline-flex items-center gap-1.5 rounded bg-primary px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-primary">
              <Icone nom="gavel" className="text-sm leading-none" />
              Document juridique
            </p>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">{document.titre}</h1>
            <p className="mt-2 max-w-3xl font-body-lg text-body-lg text-on-surface-variant">{document.resume}</p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {document.tuiles.map((tuile) => (
                <div key={tuile.libelle} className="rounded-lg border border-hairline bg-surface-container-lowest px-3 py-2">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant">{tuile.libelle}</dt>
                  <dd className="font-label-md text-label-md font-semibold text-on-surface">{tuile.valeur}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[90rem] gap-4 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 lg:px-8">
          <Sommaire sections={document.sections} />
          <div className="min-w-0 space-y-3 sm:space-y-4">
            {document.sections.map((section) => (
              <Section key={section.id} section={section} />
            ))}
          </div>
        </div>
      </main>
      {integre ? null : <Pied />}
    </>
  );
}

function Sommaire({ sections }: { sections: SectionJuridique[] }) {
  const liens = (
    <ol className="space-y-1">
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`} className="block rounded px-2 py-1.5 font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-high hover:text-primary">
            {section.titre}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <aside className="lg:sticky lg:top-[calc(var(--haut-entete)+1rem)] lg:self-start">
      <details className="rounded-xl border border-hairline bg-surface-container-lowest p-3 lg:hidden">
        <summary className="cursor-pointer font-label-md text-label-md font-semibold">Sommaire</summary>
        <div className="mt-2">{liens}</div>
      </details>
      <nav aria-label="Sommaire" className="hidden rounded-xl border border-hairline bg-surface-container-lowest p-3 lg:block">
        <p className="px-2 pb-2 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">Sommaire</p>
        {liens}
      </nav>
    </aside>
  );
}

function Section({ section }: { section: SectionJuridique }) {
  return (
    <section id={section.id} className="scroll-mt-[calc(var(--haut-entete)+1rem)] space-y-3 rounded-xl border border-hairline bg-surface-container-lowest p-4 sm:p-6">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">{section.titre}</h2>
      {section.paragraphes?.map((texte) => (
        <p key={texte} className="font-body-md text-body-md text-on-surface-variant">
          {texte}
        </p>
      ))}
      {section.liste ? (
        <ul className="list-disc space-y-1.5 pl-5 font-body-md text-body-md text-on-surface-variant marker:text-primary">
          {section.liste.map((element) => (
            <li key={element}>{element}</li>
          ))}
        </ul>
      ) : null}
      {section.note ? (
        <p className="flex gap-2 rounded-lg border border-primary/20 bg-primary-fixed/30 px-3 py-2 font-body-sm text-body-sm text-on-surface">
          <Icone nom="info" className="shrink-0 text-lg text-primary" />
          {section.note}
        </p>
      ) : null}
    </section>
  );
}

function Entete({ enteteRef }: { enteteRef: React.RefObject<HTMLElement | null> }) {
  return (
    <header ref={enteteRef} className="fixed top-0 z-50 w-full bg-surface/95 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="w-full bg-primary px-4 py-1 text-on-primary sm:px-6 lg:px-8">
        <p className="font-label-sm text-label-sm">RÉPUBLIQUE DE CÔTE D'IVOIRE</p>
      </div>
      <div className="mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <MarqueSigrh />
        <PublicHeaderNav />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary" aria-hidden="true">
          <Icone nom="person" className="text-[1.125rem] text-on-primary" />
        </span>
      </div>
    </header>
  );
}

function Pied() {
  return (
    <footer className="mt-6 w-full bg-surface-container-low shadow-[0_-1px_8px_rgba(0,0,0,0.04)]">
      <div className="mx-auto grid w-full max-w-[90rem] gap-6 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="space-y-2">
          <p className="flex items-center gap-2 font-label-md text-label-md font-bold text-primary">
            <Icone nom="account_balance" className="text-2xl" />
            MPEEP · SIGRH
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Système de gestion des ressources humaines du Ministère du Portefeuille de l'État et des Entreprises Publiques. République de Côte d'Ivoire.
          </p>
        </div>
        <nav aria-label="Documents juridiques" className="space-y-2">
          <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">Documents</p>
          <ul className="space-y-1">
            {LIENS_DOCUMENTS.map(([vers, libelle]) => (
              <li key={vers}>
                <Link to={vers} className="font-body-sm text-body-sm text-on-surface hover:text-primary hover:underline">
                  {libelle}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-2">
          <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">Autorité de protection</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI), chargée de la protection des données à caractère personnel.
          </p>
          <a href="https://www.artci.ci" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-body-sm text-body-sm text-primary hover:underline">
            artci.ci
            <Icone nom="open_in_new" className="text-base" />
          </a>
        </div>
      </div>
      <div className="border-t border-hairline/60 px-4 py-3 sm:px-6 lg:px-8">
        <p className="mx-auto max-w-[90rem] font-label-sm text-label-sm text-on-surface-variant">
          © {new Date().getFullYear()} Ministère du Portefeuille de l'État et des Entreprises Publiques · République de Côte d'Ivoire · Version {__VERSION_APPLICATION__}
        </p>
      </div>
    </footer>
  );
}
