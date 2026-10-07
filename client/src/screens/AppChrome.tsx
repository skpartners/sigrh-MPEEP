import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, logout, mediaUrl } from "../api/client";
import type { SessionUser } from "../api/types";
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
import { lienActif, libellePage, menuAutorise, menuCourant, pageHorsHabilitation, repliHabilitation, sousMenus, type LienNav } from "./navigation";

// Même palier que lg: de Tailwind (64rem) : il suit la taille de police du navigateur, et le zoom
// réduit déjà la largeur utile en px CSS.
const ECRAN_LARGE = "(width >= 64rem)";

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

export function AppChrome({ children }: { children: ReactNode }) {
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
  const enfants = courant ? sousMenus(courant) : [];
  const repli = repliHabilitation(pathname, hash, me.data?.acces);
  const avecSidebar = enfants.length > 0;
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
      <header ref={enteteRef} className="fixed top-0 left-0 right-0 z-50 bg-white/20 backdrop-blur-2xl border-b border-white/10 shadow-[0_1px_20px_color-mix(in_oklab,var(--color-primary)_10%,transparent)] pt-[env(safe-area-inset-top)]">
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
            <Link to="/app" title="Menu" aria-label="Menu principal" className="flex max-[22rem]:hidden items-center gap-3 min-w-0 rounded">
              <span className="relative flex items-center justify-center p-1 bg-surface-container-low rounded shrink-0">
                <img alt="Armoiries de la République de Côte d'Ivoire" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" src={`${import.meta.env.BASE_URL}logo.png`} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-secondary-container border border-surface-container-lowest" aria-hidden="true" />
              </span>
              <span className="hidden sm:flex flex-col min-w-0">
                <span className="font-label-md text-label-md font-bold truncate flex items-center gap-0.5">
                  <span className="text-primary">SIGRH</span>
                  <span className="text-secondary">·</span>
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant truncate flex items-center gap-1.5" title="Ministère du Portefeuille de l'État et des Entreprises Publiques">MPEEP<span className="font-label-xs text-label-xs text-on-surface-variant/50 tabular-nums">v0</span></span>
              </span>
            </Link>
          </div>
          <div className="outils flex items-center gap-0.5 sm:gap-3 shrink-0">
            <Link
              to="/app"
              aria-label="Menu"
              aria-current={pathname === "/app" ? "page" : undefined}
              title="Menu"
              className={`hidden sm:inline-flex items-center justify-center p-2 rounded hover:bg-surface-container-high ${pathname === "/app" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <Icone nom="home" className="text-xl" />
            </Link>
            {menuAutorise(me.data?.acces, { module: "Statistiques & RBAC", fonction: "Communication" }) ? <CommunicationBouton /> : null}
            <MessagerieBouton />
            <NotificationBell />
            <Link
              to="/app/aide"
              aria-label="Aide"
              aria-current={pathname === "/app/aide" ? "page" : undefined}
              title="Aide"
              className={`hidden sm:inline-flex items-center justify-center p-2 rounded hover:bg-surface-container-high ${pathname === "/app/aide" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <Icone nom="help" className="text-xl" />
            </Link>
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
              title={reduit ? "Retour au menu" : undefined}
              className={`mb-2 flex items-center rounded text-primary-fixed hover:bg-primary-container hover:text-on-primary ${reduit ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"}`}
            >
              <Icone nom="arrow_back" className="text-lg shrink-0" />
              <span className={reduit ? "sr-only" : "font-label-md text-label-md font-semibold"}>Retour au menu</span>
            </Link>
            <p className={reduit ? "sr-only" : "px-3 pt-2 pb-2 font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider font-bold"}>
              {courant.libelle}
            </p>
            {enfants.map((enfant) => {
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
              if (!autorise) {
                return (
                  <span key={enfant.to} title="Hors de votre habilitation" aria-disabled="true" className={classe}>
                    {contenu}
                  </span>
                );
              }
              return (
                <Link key={enfant.to} to={enfant.to} title={reduit ? enfant.libelle : undefined} aria-current={actif ? "page" : undefined} className={classe}>
                  {contenu}
                </Link>
              );
            })}
          </nav>
        </aside>
      ) : null}

      <div className={avecSidebar ? "lg:pl-16" : ""}>
        <main className={`zone-app relative pt-[calc(var(--haut-entete)+0.25rem)] pb-[calc(var(--haut-pied)+4.5rem)] min-h-dvh flex flex-col justify-between ${pathname === "/app" ? "bg-transparent" : "bg-white/20 backdrop-blur-sm"}`}>
          <PageMotion className="flex-1 flex flex-col w-full max-w-[120rem] mx-auto" reveal={true}>
            <BandeauSondage />
            {pathname !== "/app" ? <HeroBanniere courant={courant} user={me.data} pathname={pathname} /> : null}
            {me.isPending ? null : repli ? <Navigate to={repli} replace /> : children}
          </PageMotion>
        </main>
      </div>
      <footer ref={piedRef} className="app-pied fixed tres-court:static bottom-0 inset-x-0 z-50 bg-white/15 backdrop-blur-2xl border-t border-white/10 shadow-[0_-1px_16px_color-mix(in_oklab,var(--color-primary)_8%,transparent)] py-3 sm:py-4 court:py-2 px-4 sm:px-8">
        {/* Ligne accent animée — Jitter gradient sweep (footer) */}
        <div className="motion-gradient-sweep absolute top-0 left-0 right-0 h-0.5" aria-hidden="true" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <img alt="" className="h-7 w-7 object-contain opacity-50 shrink-0" src={`${import.meta.env.BASE_URL}logo.png`} aria-hidden="true" />
            <div className="flex flex-col text-left">
              <span className="font-label-md text-label-md font-bold flex items-center gap-0.5">
                <span className="text-primary">SIGRH</span>
                <span className="text-secondary">·</span>
                <span className="text-primary">MPEEP</span>
              </span>
              <span className="hidden sm:block court:hidden font-label-sm text-label-sm text-on-surface-variant leading-none">
                Ministère du Portefeuille de l'État et des Entreprises Publiques
              </span>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-1" aria-label="Informations légales">
            <Link to="/conditions-generales" className="font-label-sm text-label-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
              CGU
            </Link>
            <Link to="/confidentialite" className="font-label-sm text-label-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
              Confidentialité
            </Link>
            <Link to="/protection-des-donnees" className="font-label-sm text-label-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
              Protection des données
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const PAGES_FIXES: Record<string, { libelle: string; icone: string; resume: string }> = {
  "/app/aide": { libelle: "Aide & documentation", icone: "help", resume: "Guides d'utilisation et explications détaillées des modules du SIGRH." },
  "/app/sondage": { libelle: "Sondage", icone: "poll", resume: "Donnez votre avis sur les sujets ouverts à l'ensemble des agents." },
};

function HeroBanniere({ courant, user, pathname }: { courant: LienNav | null; user: SessionUser | undefined; pathname: string }) {
  const fixe = PAGES_FIXES[pathname];
  const libelle = courant?.libelle ?? fixe?.libelle;
  const icone = courant?.icone ?? fixe?.icone ?? "apps";
  const resume = courant?.resume ?? fixe?.resume;
  if (!libelle) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary-container mx-4 sm:mx-6 lg:mx-8 mt-4 court:mt-2 mb-2">
      <div className="motion-float-1 absolute -right-10 -top-10 w-40 h-40 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="motion-float-2 absolute left-1/3 bottom-0 w-32 h-32 rounded-full bg-secondary/15 blur-2xl pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 px-5 sm:px-8 py-5 court:py-3 flex items-center justify-between gap-4">
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
            {resume ? (
              <p className="font-body-sm text-body-sm text-on-primary/60 mt-0.5 hidden sm:block court:hidden truncate max-w-xl">
                {resume}
              </p>
            ) : null}
          </div>
        </div>
        <img
          alt=""
          aria-hidden="true"
          className="hidden sm:block h-16 w-16 object-contain opacity-15 shrink-0"
          src={`${import.meta.env.BASE_URL}logo.png`}
        />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-secondary-container/40" aria-hidden="true" />
    </div>
  );
}

function ProfileMenu({ user }: { user: SessionUser | undefined }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [signatureOuverte, setSignatureOuverte] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const feedback = useFeedback();

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
          <span className="font-label-sm text-label-sm text-on-surface-variant" title={user?.fonction || undefined}>{user?.fonction ? sigleFonction(user.fonction) : ""}</span>
        </span>
        <Icone nom="expand_more" className="text-lg text-on-surface-variant hidden sm:inline" />
      </button>
      {open ? (
        <div
          role="menu"
          className="motion-overlay-card absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border border-hairline bg-surface-container-lowest p-2 shadow-xl"
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
          {/* Sur téléphone, Menu et Aide quittent la barre du haut et se retrouvent ici. */}
          <Link
            role="menuitem"
            to="/app"
            className="sm:hidden w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-on-surface hover:bg-surface-container-high"
            onClick={() => setOpen(false)}
          >
            <Icone nom="home" className="text-lg" />
            Menu principal
          </Link>
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
    </div>
  );
}
