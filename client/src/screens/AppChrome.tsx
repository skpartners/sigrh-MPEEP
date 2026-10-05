import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, logout, mediaUrl } from "../api/client";
import type { SessionUser } from "../api/types";
import { EditeurSignature } from "../ui/EditeurSignature";
import { Portrait } from "../ui/PhotoProfil";
import { useFeedback } from "../ui/Feedback";
import { PageMotion } from "../ui/Motion";
import { CommunicationBouton } from "./CommunicationBouton";
import { MessagerieBouton } from "./Messagerie";
import { NotificationBell } from "./NotificationBell";
import { Icone } from "../ui/Icone";
import { lienActif, menuAutorise, menuCourant, pageHorsHabilitation, sousMenus } from "./navigation";

function ecranLarge(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
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
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const courant = menuCourant(pathname, hash);
  const enfants = courant ? sousMenus(courant) : [];
  const avecSidebar = enfants.length > 0;
  const deplie = pointe || focusDedans;
  const reduit = avecSidebar && large && !deplie;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
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
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-background font-body-md text-body-md text-on-surface antialiased">
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-md border-b border-hairline pt-[env(safe-area-inset-top)]">
        <div className="barre-app h-16 px-3 sm:px-6 flex items-center justify-between gap-1 sm:gap-3">
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
            <Link to="/app" title="Menu" className="flex items-center gap-3 min-w-0 rounded">
              <span className="flex items-center justify-center p-1 bg-surface-container-low rounded shrink-0">
                <img alt="Armoiries de la République de Côte d'Ivoire" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" src={`${import.meta.env.BASE_URL}logo.png`} />
              </span>
              <span className="hidden sm:flex flex-col min-w-0">
                <span className="font-label-md text-label-md text-primary font-bold truncate">SIGRH</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant truncate" title="Ministère du Portefeuille de l'État et des Entreprises Publiques">MPEEP</span>
              </span>
            </Link>
          </div>
          <div className="outils flex items-center gap-0.5 sm:gap-3 shrink-0">
            <Link
              to="/app"
              aria-label="Menu"
              aria-current={pathname === "/app" ? "page" : undefined}
              title="Menu"
              className={`inline-flex p-2 rounded hover:bg-surface-container-high ${pathname === "/app" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
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
              className={`inline-flex items-center justify-center p-2 rounded hover:bg-surface-container-high ${pathname === "/app/aide" ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
            >
              <Icone nom="help" className="text-xl" />
            </Link>
            <ProfileMenu user={me.data} />
          </div>
        </div>
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
          className={`fixed left-0 top-0 h-full bg-primary text-on-primary z-40 flex flex-col pt-20 pb-24 border-r border-primary-container overflow-x-hidden overflow-y-auto transition-[width,transform] duration-300 ease-out w-72 ${menuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"} lg:translate-x-0 ${deplie ? "lg:w-72 lg:shadow-2xl" : "lg:w-16 lg:shadow-none"}`}
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
              const actif = lienActif(enfant.to, enfant.end, pathname, hash);
              const autorise = menuAutorise(me.data?.acces, enfant.acces);
              const classe = `flex items-center rounded transition-colors ${reduit ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"} ${actif ? "bg-primary-fixed text-on-primary-fixed font-semibold shadow-sm" : autorise ? "text-on-primary/80 hover:bg-primary-container hover:text-on-primary" : "text-on-primary/35 cursor-not-allowed"}`;
              const contenu = (
                <>
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
        <main className="zone-app relative pt-[calc(4.25rem+env(safe-area-inset-top))] pb-40 sm:pb-28 min-h-screen bg-background flex flex-col justify-between">
          <PageMotion className="flex-1 flex flex-col" reveal={false}>
            <BandeauSondage />
            {pageHorsHabilitation(pathname, hash, me.data?.acces) ? (
              <p className="m-8 max-w-xl font-body-md text-body-md text-on-surface-variant">Cette entrée est hors de votre habilitation.</p>
            ) : children}
          </PageMotion>
        </main>
      </div>
      <footer className="app-pied fixed bottom-0 inset-x-0 z-50 bg-surface-container-lowest py-3 sm:py-4 px-4 sm:px-8 border-t border-hairline">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="font-label-md text-label-md text-primary font-bold">SIGRH MPEEP</span>
            <span className="hidden sm:inline font-body-sm text-body-sm text-on-surface-variant">
              • Ministère du Portefeuille de l'État et des Entreprises Publiques
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center sm:justify-end gap-x-4 gap-y-1" aria-label="Informations légales">
            <Link to="/conditions-generales" className="font-label-sm text-label-sm font-semibold text-primary hover:underline">
              CGU
            </Link>
            <Link to="/confidentialite" className="font-label-sm text-label-sm font-semibold text-primary hover:underline">
              Confidentialité
            </Link>
            <Link to="/protection-des-donnees" className="font-label-sm text-label-sm font-semibold text-primary hover:underline">
              Protection des données
            </Link>
          </nav>
        </div>
      </footer>
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
