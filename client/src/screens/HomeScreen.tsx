import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, mediaUrl } from "../api/client";
import type { Accueil, CommunicationPublique } from "../api/types";
import { dateLongue } from "../ui/format";
import { reducedMotion, useSlideNavigate } from "../ui/Motion";
import { PublicHeaderNav } from "./PublicHeaderNav";
import { useHauteurFixe } from "../ui/HauteurFixe";
import { Icone } from "../ui/Icone";

/** Extrait l'entier de tête d'une chaîne (ex : "1 247 agents" → 1247) et anime le comptage.
 *  Si la valeur ne commence pas par un chiffre, elle s'affiche directement sans animation. */
function useCounterReveal(valeur: string | undefined): string {
  const [affiche, setAffiche] = useState<string>("—");
  const ref = useRef<ReturnType<typeof requestAnimationFrame>>(0);

  useEffect(() => {
    if (!valeur) return;
    const match = valeur.match(/^([\d\s ]+)(.*)/u);
    if (!match || reducedMotion()) {
      setAffiche(valeur);
      return;
    }
    const cible = parseInt(match[1].replace(/\s/g, ""), 10);
    const suffixe = match[2];
    if (isNaN(cible)) {
      setAffiche(valeur);
      return;
    }
    const duree = 1_200;
    let debut: number | null = null;
    const step = (t: number) => {
      if (!debut) debut = t;
      const progress = Math.min((t - debut) / duree, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const courant = Math.round(eased * cible);
      setAffiche(`${courant.toLocaleString("fr-FR")}${suffixe}`);
      if (progress < 1) ref.current = requestAnimationFrame(step);
    };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [valeur]);

  return affiche;
}

function ChiffreAnime({ chiffre, ton }: { chiffre: { valeur: string; libelle: string; detail?: string; icone?: string } | null; ton: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const valeur = visible ? chiffre?.valeur : undefined;
  const affiche = useCounterReveal(valeur);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={"bg-white/70 backdrop-blur-xl border border-white/40 rounded-xl p-space-md shadow-[0_4px_24px_color-mix(in_oklab,var(--color-primary)_10%,transparent)] flex items-start gap-space-md"}>
      <div className={`w-12 h-12 rounded-lg bg-white/60 flex items-center justify-center shrink-0 ${ton}`}>
        <Icone nom={chiffre?.icone ?? "hourglass_empty"} className="text-[1.625rem]" />
      </div>
      <div className={"space-y-0.5"}>
        <span className={`font-headline-lg text-headline-lg tracking-tight ${ton}`}>
          {visible ? affiche : (chiffre ? "—" : "—")}
        </span>
        <p className={"font-label-md text-label-md text-on-surface"}>
          {chiffre?.libelle ?? "Chargement"}
        </p>
        <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
          {chiffre?.detail ?? ""}
        </span>
      </div>
    </div>
  );
}

const TONS_CHIFFRE = ["text-secondary", "text-primary", "text-tertiary"];

export function HomeScreen() {
  const enteteRef = useRef<HTMLElement>(null);
  useHauteurFixe(enteteRef, "--haut-entete");
  const slideTo = useSlideNavigate();
  const accueil = useQuery({
    queryKey: ["accueil"],
    queryFn: () => api<Accueil>("/api/v1/public/accueil/"),
  });
  const chiffres = accueil.data?.chiffres ?? [];
  const portrait = mediaUrl(accueil.data?.photo_ministre_url);
  const nomMinistre = [accueil.data?.ministre?.civilite, accueil.data?.ministre?.nom].filter(Boolean).join(" ");
  const annonces = useQuery({
    queryKey: ["communications-publiques"],
    queryFn: () => api<CommunicationPublique[]>("/api/v1/public/communications/"),
  });
  return (
    <>
    <img
      src={`${import.meta.env.BASE_URL}DGPE%20siege.jpg`}
      alt=""
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full object-cover object-center"
    />
    <div className="relative z-10">
    <header ref={enteteRef} className={"fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"w-full bg-primary text-on-primary px-margin-desktop py-space-xs"}>
        <div className={"mx-auto flex items-center justify-between font-label-sm text-label-sm"}>
          <div className={"flex items-center gap-space-md"}>
            <span>
              RÉPUBLIQUE DE CÔTE D'IVOIRE
            </span>
            <span className={"opacity-40"}>
              |
            </span>
            <span className={"italic text-primary-fixed"}>
              Union - Discipline - Travail
            </span>
          </div>
          <div className={"flex items-center gap-space-md"}>
            <span>
              Exercice Budgétaire : 2026
            </span>
          </div>
        </div>
      </div>
      <div className={"h-16 mx-auto px-margin-desktop flex items-center justify-between gap-space-md"}>
        <div className={"flex items-center gap-space-md"}>
          <img alt="Armoiries de la République de Côte d'Ivoire" className="h-12 w-12 object-contain" src={`${import.meta.env.BASE_URL}logo.png`} />
          <div className={"flex flex-col"}>
            <span className={"font-label-lg text-label-lg text-primary uppercase tracking-tight"}>
              SIGRH-PORTFEUILLE
            </span>
            <span className={"font-label-sm text-label-sm text-on-surface-variant truncate max-w-xl"}>
              Ministère du Portefeuille de l'État et des Entreprises Publiques
            </span>
          </div>
        </div>
        <PublicHeaderNav />
        <div className={"flex items-center gap-space-md"}>
          <div className={"hidden sm:flex items-center gap-space-xs bg-surface-container-high px-space-md py-space-xs rounded"}>
            <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
              Plateforme Souveraine
            </span>
          </div>
          <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
            <Icone nom="person" className="text-on-primary text-[1.125rem]" />
          </div>
        </div>
      </div>
    </header>
    <main className={"w-full pt-[calc(var(--haut-entete)+0.5rem)]"}>
      <div className={"flex flex-col w-full"}>
        {/* BANNIÈRE D'ACCUEIL RÉGALIENNE & PRESTIGIEUSE */}
        <section className={"relative overflow-hidden bg-primary/75 text-on-primary"}>
          {/* Motif décoratif souverain inspiré des tissages ivoiriens */}
          <div className={"absolute inset-0 opacity-10 pointer-events-none"}>
            <svg className={"w-full h-full"} height={"100%"} width={"100%"} xmlns={"http://www.w3.org/2000/svg"}>
              <defs>
                <pattern height={"80"} id={"kente-pattern"} patternUnits={"userSpaceOnUse"} width={"80"}>
                  <path d={"M0 20 L20 0 L40 20 L20 40 Z M40 60 L60 40 L80 60 L60 80 Z"} fill={"none"} stroke={"currentColor"} strokeWidth={"1.5"}></path>
                  <path d={"M40 20 L60 0 L80 20 L60 40 Z M0 60 L20 40 L40 60 L20 80 Z"} fill={"none"} stroke={"currentColor"} strokeWidth={"1.5"}></path>
                  <circle cx={"20"} cy={"20"} fill={"currentColor"} r={"3"}></circle>
                  <circle cx={"60"} cy={"60"} fill={"currentColor"} r={"3"}></circle>
                </pattern>
              </defs>
              <rect fill={"url(#kente-pattern)"} height={"100%"} width={"100%"}></rect>
            </svg>
          </div>
          {/* Voile lumineux dégradé */}
          <div className={"relative mx-auto px-margin-desktop py-space-xl"}>
            <div className={"grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center"}>
              {/* Contenu textuel solennel */}
              <div className={"lg:col-span-8 min-w-0 space-y-space-md"}>
                {/* Badge souverain */}
                <div
                  className={"motion-hero inline-flex max-w-full flex-wrap items-center gap-space-sm bg-surface-container-lowest/15 backdrop-blur-md px-space-md py-space-xs rounded-full"}
                  style={{ "--delay": "0ms" } as React.CSSProperties}
                >
                  <span className={"inline-block w-2.5 h-2.5 rounded-full bg-secondary-container shrink-0"}></span>
                  <span className={"min-w-0 font-label-sm text-label-sm tracking-wider uppercase text-on-primary"}>
                    Portail Numérique Souverain · République de Côte d'Ivoire
                  </span>
                </div>
                <h1
                  className={"motion-hero font-headline-xl text-headline-xl tracking-tight text-on-primary max-w-4xl"}
                  style={{ "--delay": "80ms" } as React.CSSProperties}
                >

            Système Intégré de Gestion des Ressources Humaines du Portefeuille de l'État

                </h1>
                <p
                  className={"motion-hero font-body-lg text-body-lg text-on-primary/85 max-w-3xl leading-relaxed"}
                  style={{ "--delay": "160ms" } as React.CSSProperties}
                >

            Le socle numérique régalien unifié pour le pilotage stratégique des carrières, le suivi des actes administratifs, l'action sociale et le développement des compétences des hauts fonctionnaires et agents des sociétés d'État ivoiriennes.

                </p>
                {/* Groupe de CTAs */}
                <div
                  className={"motion-hero pt-space-sm flex flex-wrap items-center gap-space-md"}
                  style={{ "--delay": "240ms" } as React.CSSProperties}
                >
                  <button className={"flex max-w-full flex-wrap items-center justify-center gap-space-sm bg-surface-container-lowest text-primary px-space-lg py-space-sm rounded font-label-lg text-label-lg shadow-md hover:bg-primary-fixed transition-colors"} type="button" onClick={() => slideTo("/connexion", "forward")}>
                    <Icone nom="lock" className="text-[1.25rem]" />
                    <span>
                      Accéder à l'Espace Sécurisé (Connexion)
                    </span>
                  </button>
                </div>
              </div>
              {/* Visuel symbolique solennel : Armoiries & Sceau Étatique Numérique */}
              <div
                className={"motion-hero-img lg:col-span-4 flex flex-col items-center gap-4"}
                style={{ "--delay": "120ms" } as React.CSSProperties}
              >
                <div className={"relative w-full max-w-xs aspect-square overflow-hidden rounded-full bg-primary-container border border-primary-fixed/20 shadow-xl"}>
                  <img
                    alt={nomMinistre ? `Portrait de ${nomMinistre}` : portrait ? "Portrait de la ministre" : "Armoiries de la République de Côte d'Ivoire"}
                    className={"absolute inset-0 h-full w-full object-cover"}
                    src={portrait || `${import.meta.env.BASE_URL}logo.png`}
                  />
                </div>
                <div className={"text-center"}>
                  <span className={"font-headline-sm text-headline-sm text-on-primary uppercase tracking-wide"}>
                    {nomMinistre || (portrait ? "La Ministre" : "MPEEP")}
                  </span>
                  <span className={"font-label-sm text-label-sm text-primary-fixed mt-2 block max-w-[15rem] leading-snug"}>
                    Ministère du Portefeuille de l'État et des Entreprises Publiques
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* BANDEAU CHIFFRES CLÉS & IMPACT DU PORTEFEUILLE ÉTATIQUE */}
        <section className={"w-full mx-auto px-margin-desktop -mt-8 relative z-20 motion-rise"} style={{ "--delay": "280ms" } as React.CSSProperties}>
          <div className={"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-md"}>
            {(chiffres.length > 0 ? chiffres : [null, null, null]).map((chiffre, index) => (
              <ChiffreAnime
                key={chiffre?.libelle ?? index}
                chiffre={chiffre}
                ton={TONS_CHIFFRE[index] ?? "text-primary"}
              />
            ))}
          </div>
        </section>
        <section className={"bg-surface-container-low/55 py-space-xl motion-rise"} style={{ "--delay": "360ms" } as React.CSSProperties}>
          <div className={"mx-auto px-margin-desktop"}>
            <div className={"space-y-space-md"}>
              <div className={"flex items-center gap-space-xs"}>
                <Icone nom="campaign" className="text-primary text-[1.5rem]" />
                <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Informations de la Direction des ressources humaines
                </h2>
              </div>
              {annonces.data?.length === 0 ? (
                <p className="font-body-md text-body-md text-on-surface-variant">Aucune information publiée pour le moment.</p>
              ) : null}
              {(annonces.data ?? []).map((annonce) => (
                <article key={`${annonce.source ?? "communication"}-${annonce.id}`} className={"bg-white/70 backdrop-blur-sm border border-white/40 p-space-md rounded-xl shadow-sm space-y-1.5"}>
                  <div className={"flex flex-wrap items-center gap-space-xs"}>
                    <span className={"px-2 py-0.5 bg-primary-fixed/50 text-on-primary-fixed-variant rounded font-label-sm text-label-sm"}>
                      {annonce.rubrique_libelle}
                    </span>
                    {annonce.publie_le ? (
                      <span className={"text-on-surface-variant font-label-sm text-label-sm"}>
                        Publiée le {dateLongue(annonce.publie_le)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    {annonce.titre}
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    {annonce.texte}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
        {/* MODALITÉS D'ACCÈS SÉCURISÉ & PROTOCOLE RÉGALIEN */}
        <section className={"w-full mx-auto px-margin-desktop py-space-xl"}>
          {/* Bannière support technique de la DSI */}
          <div className={"mt-space-lg bg-surface-container rounded-xl p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md"}>
            <div className={"flex items-center gap-space-md"}>
              <div className={"w-12 h-12 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0"}>
                <Icone nom="support_agent" className="text-[1.5rem]" />
              </div>
              <div>
                <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                  Assistance Technique DSI & Déploiement
                </h4>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  Une difficulté d'enrôlement ou de synchronisation d'un matricule ? Nos ingénieurs sont joignables du lundi au vendredi.
                </p>
              </div>
            </div>
            <div className={"flex items-center gap-space-sm shrink-0"}>
              <span className={"font-code-num text-code-num text-primary bg-surface-container-lowest px-3 py-1.5 rounded-lg border border-hairline font-semibold"}>
                
          Centre d'Appels : +225 20 21 00 00
        
              </span>
              <button className={"px-space-md py-1.5 bg-primary text-on-primary rounded font-label-sm text-label-sm hover:bg-primary-container transition-colors"} type="button" data-soon>
                
          Ouvrir un Ticket DSI
        
              </button>
            </div>
          </div>
        </section>
        {/* MICRO-INTERACTIONS JS NATIVES */}
      </div>
    </main>
    <footer className={"relative w-full bg-surface-container-low/70 mt-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"mx-auto px-margin-desktop py-space-xl"}>
        <div className={"grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-lg"}>
          <div className={"space-y-space-sm"}>
            <div className={"flex items-center gap-space-sm"}>
              <Icone nom="account_balance" className="text-primary text-[1.5rem]" />
              <span className={"font-headline-sm text-headline-sm text-primary"}>
                MPEEP - SIGRH
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
              Système Intégré de Gestion des Ressources Humaines du Portefeuille de l'État et des Sociétés à Participation Publique. République de Côte d'Ivoire.
            </p>
          </div>
          <div className={"space-y-space-xs"}>
            <span className={"font-label-lg text-label-lg text-on-surface"}>
              Gouvernance & Textes
            </span>
            <ul className={"space-y-space-xs font-body-sm text-body-sm text-on-surface-variant"}>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Loi portant organisation des Entreprises Publiques
                </a>
              </li>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Statut Général de la Fonction Publique
                </a>
              </li>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Recueil des Décrets d'Avancement 2025-2026
                </a>
              </li>
            </ul>
          </div>
          <div className={"space-y-space-xs"}>
            <span className={"font-label-lg text-label-lg text-on-surface"}>
              Sécurité Souveraine
            </span>
            <ul className={"space-y-space-xs font-body-sm text-body-sm text-on-surface-variant"}>
              <li>
                <Link className={"hover:text-on-surface"} to="/confidentialite">
                  Politique de Protection des Données Personnelles
                </Link>
              </li>
            </ul>
          </div>
          <div className={"space-y-space-xs"}>
            <span className={"font-label-lg text-label-lg text-on-surface"}>
              Centre d'Assistance
            </span>
            <div className={"font-body-sm text-body-sm text-on-surface-variant space-y-space-xs"}>
              <p>
                Support Technique DSI : +225 20 21 00 00
              </p>
              <p>
                Abidjan-Plateau, Immeuble SCIAM
              </p>
              <p>
                Lundi - Vendredi : 07h30 - 16h30 GMT
              </p>
            </div>
          </div>
        </div>
        <div className={"pt-space-md flex flex-col md:flex-row items-center justify-between gap-space-md font-label-sm text-label-sm text-on-surface-variant"}>
          <p>
            © 2026 Ministère du Portefeuille de l'État et des Entreprises Publiques. République de Côte d'Ivoire. Tous droits réservés.
          </p>
          <div className={"flex items-center gap-space-md"}>
            <span>
              Version 4.2.1-SEC
            </span>
            <span>
              Infrastructure Cloud Souverain National
            </span>
          </div>
        </div>
      </div>
    </footer>
    </div>
    </>
  );
}
