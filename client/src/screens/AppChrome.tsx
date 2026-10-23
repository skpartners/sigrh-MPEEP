import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, logout, mediaUrl } from "../api/client";
import type { SessionUser } from "../api/types";
import { EditeurConnexion } from "../ui/EditeurConnexion";
import { EditeurMotDePasse } from "../ui/EditeurMotDePasse";
import { EditeurSignature } from "../ui/EditeurSignature";
import { Portrait } from "../ui/PhotoProfil";
import { useFeedback } from "../ui/Feedback";
import { useHauteurFixe } from "../ui/HauteurFixe";
import { PageMotion } from "../ui/Motion";
import { useIntervalle } from "../ui/TempsReel";
import { CommunicationBouton } from "./CommunicationBouton";
import { MessagerieBouton } from "./Messagerie";
import { NotificationBell } from "./NotificationBell";
import { Icone } from "../ui/Icone";
import { IndicateurTaches } from "../ui/IndicateurTaches";
import { destinationModule, lienActif, libellePage, menuAutorise, menuCourant, moduleAutorise, NAV, pageHorsHabilitation, repliHabilitation, sousMenus, type LienNav } from "./navigation";
import { MarqueSigrh } from "../ui/MarqueSigrh";

// Même palier que lg: de Tailwind (63,5 rem, voir @theme dans app.css) : il suit la taille de police du navigateur, et le zoom
// réduit déjà la largeur utile en px CSS.
const ECRAN_LARGE = "(width >= 63.5rem)";

function ecranLarge(): boolean {
  return window.matchMedia(ECRAN_LARGE).matches;
}

function initiales(user: SessionUser | undefined): string {
  if (!user) return "";
  return `${user.prenoms.charAt(0)}${user.nom.charAt(0)}`.toUpperCase();
}

const MOTS_VIDES = new Set(["de", "des", "du", "d", "et", "la", "le", "les", "l", "au", "aux", "en", "par", "pour", "sur", "a", "un", "une", "dans"]);

/** « Directeur des Ressources Humaines » → DRH. Un seul mot reste tel quel. */
function sigleFonction(fonction: string): string {
  const mots = fonction
    .split(/[\s'’]+/)
    .map((mot) => mot.trim())
    .filter((mot) => mot && !MOTS_VIDES.has(mot.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")));
  if (mots.length <= 1) return fonction;
  return mots.map((mot) => mot.normalize("NFD").replace(/\p{M}/gu, "").charAt(0).toUpperCase()).join("");
}

function BandeauSondage() {
  const sondage = useQuery({
    queryKey: ["sondage-courant"],
    queryFn: () => api<{ ouverte: boolean; ma_reponse: string; question: string } | null>("/api/v1/sondage/"),
  });
  if (!sondage.data?.ouverte || sondage.data.ma_reponse) return null;
  return (
    <Link to="/app/sondage" className="mx-4 mt-4 sm:mx-6 lg:mx-8 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-fixed/40 px-4 py-3 text-on-surface hover:bg-primary-fixed/70">
      <Icone nom="poll" className="text-primary" />
      <span>
        <span className="block font-label-md text-label-md font-bold">Sondage ouvert à l'ensemble des agents</span>
        <span className="block font-body-sm text-body-sm text-on-surface-variant">{sondage.data.question}</span>
      </span>
    </Link>
  );
}

/** `sansSidebar` : page qui occupe toute la largeur, sans menu latéral (le profil agent).
 *  `actions` : boutons affichés dans le bandeau de titre, à droite. */
export function AppChrome({ children, sansSidebar = false, actions }: { children: ReactNode; sansSidebar?: boolean; actions?: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pointe, setPointe] = useState(false);
  const [focusDedans, setFocusDedans] = useState(false);
  const [large, setLarge] = useState(ecranLarge);
  const { pathname, hash } = useLocation();
  const feedback = useFeedback();
  const intervalle = useIntervalle(4_000);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<SessionUser>("/api/v1/me/"),
    staleTime: Infinity,
    refetchInterval: intervalle,
    refetchIntervalInBackground: true,
  });
  const accesConnu = useRef<SessionUser["acces"] | undefined>(undefined);
  const enteteRef = useRef<HTMLElement>(null);
  const piedRef = useRef<HTMLElement>(null);
  useHauteurFixe(enteteRef, "--haut-entete");
  useHauteurFixe(piedRef, "--haut-pied");
  const courant = menuCourant(pathname, hash);
  const tousLesEnfants = courant ? sousMenus(courant) : [];
  // Menu à rubriques groupées (GRH) : le sidebar ne montre que le groupe de la page courante ;
  // sur l'accueil du menu, ce sont les cartes qui servent de navigation.
  const aGroupes = tousLesEnfants.some((enfant) => enfant.groupe);
  const groupeCourant = tousLesEnfants.find((enfant) => lienActif(enfant.to, enfant.end, pathname, hash))?.groupe;
  const enfants = aGroupes ? tousLesEnfants.filter((enfant) => !enfant.groupe || enfant.groupe === groupeCourant) : tousLesEnfants;
  const repli = repliHabilitation(pathname, hash, me.data?.acces);
  const avecSidebar = enfants.length > 0 && !sansSidebar && !(aGroupes && !groupeCourant);
  const deplie = pointe || focusDedans;
  const reduit = avecSidebar && large && !deplie;

  useEffect(() => {
    const media = window.matchMedia(ECRAN_LARGE);
    const suivre = () => setLarge(media.matches);
    media.addEventListener("change", suivre);
    return () => media.removeEventListener("change", suivre);
  }, []);

  function basculerMenu() {
    setMenuOpen((ouvert) => !ouvert);
  }

  // Le tiroir se referme à chaque navigation et à la touche Échap.
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const avant = accesConnu.current;
    const apres = me.data?.acces;
    accesConnu.current = apres;
    if (!avant || !apres) return;
    if (!pageHorsHabilitation(pathname, hash, apres) || pageHorsHabilitation(pathname, hash, avant)) return;
    const libelle = libellePage(pathname, hash);
    feedback.toast(
      "Accès retiré",
      libelle ? `L'accès à « ${libelle} » vient de vous être retiré.` : "L'accès à cette page vient de vous être retiré.",
      "info",
    );
  }, [me.data?.acces, pathname, hash, feedback]);
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-transparent font-body-md text-body-md text-on-surface antialiased">
      {/* Fond photo du siège — persiste sur toutes les pages applicatives */}
      <img
        src={`${import.meta.env.BASE_URL}DGPE%20siege.jpg`}
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 h-dvh w-full object-cover object-center"
      />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-primary/15 via-transparent to-primary/10" aria-hidden="true" />
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-label-md focus:text-on-primary">Aller au contenu</a>
      <header ref={enteteRef} className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-hairline/60 shadow-[0_1px_20px_color-mix(in_oklab,var(--color-primary)_10%,transparent)] pt-[env(safe-area-inset-top)]">
        <div className="barre-app h-14 sm:h-16 court:h-14 px-2 sm:px-6 flex items-center justify-between gap-1 sm:gap-3">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            {avecSidebar && !large ? (
              <button
                type="button"
                className="p-2 -ml-1 rounded text-on-surface-variant hover:bg-surface-container-high"
                aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
                aria-expanded={menuOpen}
                aria-controls="app-sidebar"
                onClick={basculerMenu}
              >
                <Icone nom={menuOpen ? "menu_open" : "menu"} className="text-2xl" />
              </button>
            ) : null}
            <Link to="/app" title="SIGRH-PORTEFEUILLE" aria-label="Menu principal" className="flex max-[22rem]:hidden items-center min-w-0 rounded">
              <MarqueSigrh compact />
            </Link>
          </div>
          <div className="outils flex items-center gap-0.5 sm:gap-2 shrink-0" role="toolbar" aria-label="Outils de l'application">
            {menuAutorise(me.data?.acces, { module: "Statistiques & RBAC", fonction: "Communication" }) ? <CommunicationBouton /> : null}
            <IndicateurTaches />
            <MessagerieBouton />
            <NotificationBell />
            <Link
              to="/app/aide"
              aria-label="Aide"
              aria-current={pathname === "/app/aide" ? "page" : undefined}
              title="Aide"
              className={`hidden sm:inline-flex items-center justify-center p-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-surface-container-high ${pathname === "/app/aide" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <Icone nom="help" className="text-xl" />
            </Link>
            <span className="mx-1 hidden h-6 w-px bg-hairline sm:block" aria-hidden="true" />
            <ProfileMenu user={me.data} />
          </div>
        </div>
        {/* Ligne accent animée — Jitter gradient sweep */}
        <div className="motion-gradient-sweep absolute bottom-0 left-0 right-0 h-px" aria-hidden="true" />
      </header>

      {avecSidebar && menuOpen ? (
        <div className="motion-overlay fixed inset-0 z-30 bg-inverse-surface/30 lg:hidden" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      ) : null}
      {avecSidebar && courant ? (
        <aside
          id="app-sidebar"
          inert={!large && !menuOpen}
          onMouseEnter={() => setPointe(true)}
          onMouseLeave={() => setPointe(false)}
          onFocus={() => setFocusDedans(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusDedans(false);
          }}
          className={`fixed left-0 top-0 h-full bg-primary/40 backdrop-blur-2xl text-on-primary z-40 flex flex-col pt-[calc(var(--haut-entete)+1rem)] pb-[calc(var(--haut-pied)+1rem)] border-r border-white/15 overflow-x-hidden overflow-y-auto transition-[width,transform] duration-300 ease-out w-72 ${menuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"} lg:translate-x-0 ${deplie ? "lg:w-72 lg:shadow-[8px_0_32px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]" : "lg:w-16 lg:shadow-none"}`}
        >
          <nav className={`flex-1 space-y-1 font-body-sm text-body-sm ${reduit ? "px-2" : "px-3"}`} aria-label={courant.libelle}>
            <Link
              to="/app"
              title={reduit ? "Accueil" : undefined}
              className={`mb-2 flex items-center rounded text-primary-fixed hover:bg-primary-container hover:text-on-primary ${reduit ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"}`}
            >
              <Icone nom="home" className="text-lg shrink-0" />
              <span className={reduit ? "sr-only" : "font-label-md text-label-md font-semibold"}>Accueil</span>
            </Link>
            <p className={reduit ? "sr-only" : "px-3 pt-2 pb-2 font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider font-bold"}>
              {courant.libelle}
            </p>
            {enfants.map((enfant, rang) => {
              const intertitre = enfant.groupe && enfant.groupe !== enfants[rang - 1]?.groupe ? enfant.groupe : null;
              const autorise = menuAutorise(me.data?.acces, enfant.acces);
              const actif = autorise && lienActif(enfant.to, enfant.end, pathname, hash);
              const classe = `relative flex items-center rounded transition-colors ${reduit ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"} ${!autorise ? "text-on-primary/35 cursor-not-allowed" : actif ? "bg-primary-fixed text-on-primary-fixed font-semibold shadow-sm" : "text-on-primary/80 hover:bg-primary-container hover:text-on-primary"}`;
              const contenu = (
                <>
                  {actif && !reduit && (
                    <span
                      className="nav-active-bar absolute left-0 top-1 bottom-1 w-0.5 bg-secondary-container rounded-r"
                      aria-hidden="true"
                    />
                  )}
                  <Icone nom={enfant.icone} className="text-lg shrink-0" />
                  <span className={reduit ? "sr-only" : "leading-snug"}>{enfant.libelle}</span>
                </>
              );
              const titre = intertitre ? (
                reduit
                  ? <hr key={`groupe-${enfant.to}`} className="my-2 border-white/15" aria-hidden="true" />
                  : <p key={`groupe-${enfant.to}`} className="px-3 pt-4 pb-1 font-label-sm text-label-sm text-primary-fixed/80 uppercase tracking-wider font-bold">{intertitre}</p>
              ) : null;
              if (!autorise) {
                return (
                  <Fragment key={enfant.to}>
                    {titre}
                    <span title="Hors de votre habilitation" aria-disabled="true" className={classe}>
                      {contenu}
                    </span>
                  </Fragment>
                );
              }
              return (
                <Fragment key={enfant.to}>
                  {titre}
                  <Link to={enfant.to} title={reduit ? enfant.libelle : undefined} aria-current={actif ? "page" : undefined} className={classe}>
                    {contenu}
                  </Link>
                </Fragment>
              );
            })}
          </nav>
        </aside>
      ) : null}

      <div className={`zone-defilement ${avecSidebar ? "lg:pl-16" : ""}`}>
        <main id="contenu" tabIndex={-1} className={`outline-none zone-app relative pt-[calc(var(--haut-entete)+0.25rem)] ${pathname === "/app" ? "pb-[calc(var(--haut-pied)+0.75rem)]" : "pb-[calc(var(--haut-pied)+4.5rem)]"} min-h-dvh flex flex-col justify-between ${pathname === "/app" ? "bg-transparent" : "bg-white/20 backdrop-blur-sm"}`}>
          <PageMotion className="flex-1 flex flex-col w-full max-w-[120rem] mx-auto" reveal={true}>
            <BandeauSondage />
            {pathname !== "/app" ? (
              <OngletsModules courant={courant} acces={me.data?.acces} />
            ) : null}
            {pathname !== "/app" ? <HeroBanniere courant={courant} user={me.data} pathname={pathname} actions={actions} /> : null}
            {me.isPending ? null : repli ? <Navigate to={repli} replace /> : children}
          </PageMotion>
        </main>
      </div>
      <footer ref={piedRef} className="app-pied fixed tres-court:static bottom-0 inset-x-0 z-50 bg-white/80 backdrop-blur-2xl border-t border-hairline/60 shadow-[0_-1px_16px_color-mix(in_oklab,var(--color-primary)_8%,transparent)] py-1.5 sm:py-4 court:py-2 px-4 sm:px-8">
        {/* Ligne accent animée — Jitter gradient sweep (footer) */}
        <div className="motion-gradient-sweep absolute top-0 left-0 right-0 h-0.5" aria-hidden="true" />
        <div className="mx-auto flex max-w-[120rem] flex-col items-center justify-between gap-1 sm:flex-row sm:gap-4">
          <p className="font-label-sm text-label-sm text-on-surface-variant text-center sm:text-left">
            © {new Date().getFullYear()} République de Côte d'Ivoire
            <span className="mx-2 opacity-40" aria-hidden="true">·</span>
            <span className="tabular-nums">Version {__VERSION_APPLICATION__}</span>
          </p>
          <nav className="flex flex-wrap items-center justify-center sm:justify-end" aria-label="Informations légales et assistance">
            <ul className="flex flex-wrap items-center justify-center gap-x-1 sm:justify-end">
              {[
                ["/app/aide", "Aide"],
                ["/conditions-generales", "Conditions d'utilisation"],
                ["/confidentialite", "Confidentialité"],
                ["/protection-des-donnees", "Protection des données"],
              ].map(([vers, libelle], rang) => (
                <li key={vers} className="flex items-center">
                  {rang > 0 ? <span className="text-hairline" aria-hidden="true">|</span> : null}
                  <Link to={vers} className={LIEN_PIED}>{libelle}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Barre d'onglets au-dessus de l'entête de page : passer d'un module à l'autre sans repasser par l'accueil. */
function OngletsModules({ courant, acces }: { courant: LienNav | null; acces: SessionUser["acces"] }) {
  const modules = NAV.flatMap((section) => section.liens).filter((lien) => !lien.horsAccueil && !lien.bientot && moduleAutorise(acces, lien));
  const piste = useRef<HTMLDivElement>(null);
  const [repere, setRepere] = useState<{ x: number; l: number } | null>(null);
  const cle = courant?.to ?? "";

  // La pastille glisse sous l'onglet actif ; mesurée sur la piste, donc juste même défilée.
  useLayoutEffect(() => {
    const mesurer = () => {
      const actif = piste.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!actif) return setRepere(null);
      setRepere({ x: actif.offsetLeft, l: actif.offsetWidth });
      actif.scrollIntoView({ block: "nearest", inline: "center" });
    };
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, [cle, modules.length]);

  const onglet = "relative z-10 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 font-label-md text-label-md transition-colors duration-300";
  return (
    <nav aria-label="Modules" className="sticky top-[calc(var(--haut-entete)+0.5rem)] z-30 px-4 sm:px-6 lg:px-8 mt-4">
      <div className="rounded-2xl border border-white/60 bg-white/70 p-1 shadow-[0_4px_20px_color-mix(in_oklab,var(--color-primary)_10%,transparent)] backdrop-blur-xl">
        <div ref={piste} className="relative flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {repere ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-xl bg-gradient-to-br from-primary to-primary-container shadow-md transition-[transform,width] duration-700 ease-[linear(0,0.027,0.096,0.192,0.303,0.42,0.535,0.643,0.74,0.825,0.895,0.952,0.997,1.029,1.052,1.065,1.072,1.073,1.071,1.065,1.058,1.049,1.041,1.032,1.025,1.018,1.012,1.007,1.003,1,0.997,0.996,0.995,0.995,0.995,0.995,1)] motion-reduce:transition-none"
              style={{ width: repere.l, transform: `translateX(${repere.x}px)` }}
            />
          ) : null}
          <Link to="/app" className={`${onglet} text-primary hover:bg-primary/10`}>
            <Icone nom="home" className="text-lg" />
            Accueil
          </Link>
          {modules.map((lien) => {
            const actif = courant?.to === lien.to;
            return (
              <Link
                key={lien.to}
                to={destinationModule(acces, lien)}
                aria-current={actif ? "page" : undefined}
                className={`${onglet} ${actif ? "font-semibold text-on-primary" : "text-on-surface-variant hover:bg-primary/10 hover:text-on-surface"}`}
              >
                <Icone nom={lien.icone} className="text-lg" />
                {lien.libelle}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

const LIEN_PIED = "rounded px-1.5 py-0.5 sm:px-2 sm:py-1 font-label-sm text-label-sm font-semibold text-on-surface-variant transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const PAGES_FIXES: Record<string, { libelle: string; icone: string; resume: string }> = {
  "/app/aide": { libelle: "Aide & documentation", icone: "help", resume: "Guides d'utilisation et explications détaillées des modules du SIGRH." },
  "/app/sondage": { libelle: "Sondage", icone: "poll", resume: "Donnez votre avis sur les sujets ouverts à l'ensemble des agents." },
};

function HeroBanniere({ courant, user, pathname, actions }: { courant: LienNav | null; user: SessionUser | undefined; pathname: string; actions?: ReactNode }) {
  const fixe = PAGES_FIXES[pathname];
  const libelle = courant?.libelle ?? fixe?.libelle;
  const icone = courant?.icone ?? fixe?.icone ?? "apps";
  if (!libelle) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary-container mx-4 sm:mx-6 lg:mx-8 mt-2 court:mt-1 mb-2">
      <div className="motion-float-1 absolute -right-10 -top-10 w-40 h-40 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="motion-float-2 absolute left-1/3 bottom-0 w-32 h-32 rounded-full bg-secondary/15 blur-2xl pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 px-5 sm:px-8 py-5 court:py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="w-12 h-12 court:w-10 court:h-10 rounded-xl flex items-center justify-center text-2xl court:text-xl bg-white/15 border border-white/20 text-on-primary shrink-0" aria-hidden="true">
            <Icone nom={icone} />
          </span>
          <div className="min-w-0">
            {user ? (
              <p className="font-label-sm text-label-sm text-on-primary/60 truncate">
                {user.fonction}
                {" · "}
                <strong className="text-on-primary/80 font-semibold">{user.organisme_sigle}</strong>
              </p>
            ) : null}
            <h1 className="font-headline-md text-headline-md sm:font-headline-lg sm:text-headline-lg text-on-primary font-bold tracking-tight leading-tight">
              {libelle}
            </h1>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-secondary-container/40" aria-hidden="true" />
    </div>
  );
}

function ProfileMenu({ user }: { user: SessionUser | undefined }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [signatureOuverte, setSignatureOuverte] = useState(false);
  const [connexionOuverte, setConnexionOuverte] = useState(false);
  const [motDePasseOuvert, setMotDePasseOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const feedback = useFeedback();
  // Espace réservé à l'administrateur et aux secrétaires : le serveur en décide.
  const secretariat = Boolean(user?.secretariat);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onLogout() {
    setOpen(false);
    await feedback.run("Fermeture de la session…", logout).catch(() => undefined);
    // Plus rien de la session précédente : le prochain compte connecté repart d'un cache vide.
    client.clear();
    navigate("/connexion", { replace: true });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded hover:bg-surface-container-high"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {user ? (
          <Portrait
            agent={{
              matricule: user.matricule,
              nom_complet: user.nom_complet,
              initiales: initiales(user),
              photo_url: user.photo_url,
            }}
            className="w-8 h-8 rounded-full bg-primary-container text-on-primary font-label-md text-label-md shrink-0 overflow-hidden"
          />
        ) : (
          <span
            className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-md text-label-md font-bold shrink-0"
            aria-hidden="true"
          >
            <Icone nom="person" className="text-lg" />
          </span>
        )}
        <span className="hidden md:flex flex-col text-left">
          <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">
            {user?.nom_complet ?? "Session"}
          </span>
          {user?.administrateur ? (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-secondary-container px-1.5 font-label-sm text-label-sm font-semibold text-on-secondary-container">
              <Icone nom="admin_panel_settings" className="text-sm leading-none" />
              Mode administrateur
            </span>
          ) : (
            <span className="font-label-sm text-label-sm text-on-surface-variant" title={user?.fonction || undefined}>{user?.fonction ? sigleFonction(user.fonction) : ""}</span>
          )}
        </span>
        <Icone nom="expand_more" className="text-lg text-on-surface-variant hidden sm:inline" />
      </button>
      {open ? (
        <div
          role="menu"
          className="menu-flottant motion-overlay-card absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border p-2 shadow-xl"
        >
          {user ? (
            <div className="px-3 py-2 border-b border-hairline mb-1">
              <p className="font-label-lg text-label-lg text-on-surface">{user.nom_complet}</p>
              <p className="font-code-num text-code-num text-on-surface-variant">{user.matricule}</p>
            </div>
          ) : null}
          <button
            role="menuitem"
            type="button"
            className="w-full flex flex-col gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high border-b border-hairline mb-1"
            onClick={() => {
              setOpen(false);
              setSignatureOuverte(true);
            }}
          >
            <span className="flex items-center gap-2">
              <Icone nom="ink_pen" className="text-lg leading-none text-primary shrink-0" />
              Ma signature
            </span>
            {user?.signature_url ? (
              <span className="flex h-14 items-center justify-center rounded-md border border-hairline bg-white px-3">
                <img src={mediaUrl(user.signature_url)} alt="Signature enregistrée" className="max-h-10 max-w-full object-contain" />
              </span>
            ) : (
              <span className="font-body-sm text-body-sm text-on-surface-variant">Aucune signature enregistrée</span>
            )}
          </button>
          <button
            role="menuitem"
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high border-b border-hairline mb-1"
            onClick={() => {
              setOpen(false);
              setMotDePasseOuvert(true);
            }}
          >
            <Icone nom="lock" className="text-lg leading-none text-primary shrink-0" />
            Ma connexion
            <span className="ml-auto font-body-sm text-body-sm text-on-surface-variant">Mot de passe</span>
          </button>
          {secretariat ? (
            <Link
              role="menuitem"
              to="/app/secretariat"
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high border-b border-hairline mb-1"
              onClick={() => setOpen(false)}
            >
              <Icone nom="assignment_ind" className="text-lg leading-none text-primary shrink-0" />
              Secrétariat
              <span className="ml-auto font-body-sm text-body-sm text-on-surface-variant">Demandes et signatures</span>
            </Link>
          ) : null}
          {user?.administrateur ? (
            <Link
              role="menuitem"
              to="/app/parametres"
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high border-b border-hairline mb-1"
              onClick={() => setOpen(false)}
            >
              <Icone nom="tune" className="text-lg leading-none text-primary shrink-0" />
              Paramètres
            </Link>
          ) : null}
          {user?.administrateur ? (
            <button
              role="menuitem"
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high border-b border-hairline mb-1"
              onClick={() => {
                setOpen(false);
                setConnexionOuverte(true);
              }}
            >
              <Icone nom="admin_panel_settings" className="text-lg leading-none text-primary shrink-0" />
              Compte administrateur
            </button>
          ) : null}
          {/* Sur téléphone, Aide quitte la barre du haut et se retrouve ici. L'accueil est sur la page. */}
          <Link
            role="menuitem"
            to="/app/aide"
            className="sm:hidden w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high"
            onClick={() => setOpen(false)}
          >
            <Icone nom="help" className="text-lg" />
            Aide
          </Link>
          <button
            role="menuitem"
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-error hover:bg-error-container/50"
            onClick={onLogout}
          >
            <Icone nom="logout" className="text-lg" />
            Se déconnecter
          </button>
        </div>
      ) : null}
      {signatureOuverte ? <EditeurSignature user={user} onClose={() => setSignatureOuverte(false)} /> : null}
      {connexionOuverte ? <EditeurConnexion user={user} onClose={() => setConnexionOuverte(false)} /> : null}
      {motDePasseOuvert ? <EditeurMotDePasse user={user} onClose={() => setMotDePasseOuvert(false)} /> : null}
    </div>
  );
}
