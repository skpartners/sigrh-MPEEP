import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, logout } from "../api/client";
import type { AgentBrief, SessionUser } from "../api/types";
import { EditeurSignature } from "../ui/EditeurSignature";
import { Portrait } from "../ui/PhotoProfil";
import { useFeedback } from "../ui/Feedback";
import { PageMotion } from "../ui/Motion";
import { CommunicationBouton } from "./CommunicationBouton";
import { MessagerieBouton } from "./Messagerie";
import { NotificationBell } from "./NotificationBell";

type AccesMenu = { module: string; fonction?: string };
type EnfantNav = { to: string; libelle: string; end?: boolean; acces: AccesMenu };
type LienNav = { to: string; end?: boolean; icone: string; libelle: string; acces: AccesMenu; enfants?: EnfantNav[] };

const NAV: { groupe: string; liens: LienNav[] }[] = [
  {
    groupe: "Pilotage central",
    liens: [
      { to: "/app", end: true, icone: "dashboard", libelle: "Vue d'ensemble DRH", acces: { module: "Statistiques & RBAC", fonction: "Vue d'ensemble" } },
      { to: "/app/dossiers", icone: "badge", libelle: "Dossier agent numérique", acces: { module: "Dossier Agent", fonction: "Consultation du dossier" } },
    ],
  },
  {
    groupe: "Métier",
    liens: [
      {
        to: "/app/carrieres",
        icone: "assignment",
        libelle: "Carrières & actes",
        acces: { module: "Carrières & Actes", fonction: "Accueil" },
        enfants: [
          { to: "/app/carrieres", end: true, libelle: "Accueil", acces: { module: "Carrières & Actes", fonction: "Accueil" } },
          { to: "/app/carrieres/situation-administrative", libelle: "Situation administrative", acces: { module: "Carrières & Actes", fonction: "Situation administrative" } },
          { to: "/app/carrieres/absences", libelle: "Absences", acces: { module: "Carrières & Actes", fonction: "Absences" } },
          { to: "/app/carrieres/conges", libelle: "Congés", acces: { module: "Carrières & Actes", fonction: "Congés" } },
          { to: "/app/carrieres/procedures-disciplinaires", libelle: "Procédures disciplinaires", acces: { module: "Carrières & Actes", fonction: "Procédures disciplinaires" } },
          { to: "/app/carrieres/fin-de-carriere", libelle: "Fin de carrière", acces: { module: "Carrières & Actes", fonction: "Fin de carrière" } },
        ],
      },
      {
        to: "/app/action-sociale",
        icone: "volunteer_activism",
        libelle: "Action sociale",
        acces: { module: "Social & Santé", fonction: "Action sociale" },
        enfants: [{ to: "/app/action-sociale", end: true, libelle: "Accueil", acces: { module: "Social & Santé", fonction: "Action sociale" } }],
      },
      {
        to: "/app/formation",
        icone: "school",
        libelle: "Formation continue",
        acces: { module: "Formations", fonction: "Formation continue" },
        enfants: [{ to: "/app/formation", end: true, libelle: "Accueil", acces: { module: "Formations", fonction: "Formation continue" } }],
      },
      {
        to: "/app/gpec",
        icone: "groups",
        libelle: "GPEC",
        acces: { module: "GPEC", fonction: "GPEC" },
        enfants: [
          { to: "/app/gpec/expression-des-besoins", libelle: "Expression des besoins", acces: { module: "GPEC", fonction: "Expression des besoins" } },
          { to: "/app/gpec/recrutement", libelle: "Recrutement", acces: { module: "GPEC", fonction: "Recrutement" } },
        ],
      },
      { to: "/app/communication", icone: "campaign", libelle: "Communication", acces: { module: "Statistiques & RBAC", fonction: "Communication" } },
    ],
  },
  {
    groupe: "Gouvernance & conformité",
    liens: [
      { to: "/app/circuits", icone: "approval_delegation", libelle: "Circuits de validation", acces: { module: "Statistiques & RBAC", fonction: "Circuits et habilitations" } },
      { to: "/app/circuits#rbac", icone: "admin_panel_settings", libelle: "Habilitations", acces: { module: "Statistiques & RBAC", fonction: "Habilitations" } },
      { to: "/app/statistiques", icone: "bar_chart", libelle: "Statistiques", acces: { module: "Statistiques & RBAC", fonction: "Statistiques" } },
      { to: "/app/utilisateurs", icone: "manage_accounts", libelle: "Gestion des utilisateurs", acces: { module: "Statistiques & RBAC", fonction: "Comptes utilisateurs" } },
      { to: "/app/structures", icone: "account_tree", libelle: "Structures du ministère", acces: { module: "Statistiques & RBAC", fonction: "Structures du ministère" } },
    ],
  },
];

function droitMenu(acces: SessionUser["acces"], cle: AccesMenu): string {
  if (!acces) return "lecture";
  if (cle.fonction) {
    const detail = acces.fonctions[`${cle.module}|${cle.fonction}`];
    if (detail) return detail;
  }
  return acces.modules[cle.module] ?? "refus";
}

function menuAutorise(acces: SessionUser["acces"], cle: AccesMenu): boolean {
  return droitMenu(acces, cle) !== "refus";
}

function pageHorsHabilitation(pathname: string, hash: string, acces: SessionUser["acces"]): boolean {
  if (!acces) return false;
  const candidats: { to: string; end?: boolean; acces: AccesMenu }[] = [];
  for (const section of NAV) {
    for (const lien of section.liens) {
      candidats.push(lien);
      for (const enfant of lien.enfants ?? []) candidats.push(enfant);
    }
  }
  const actifs = candidats.filter((item) => lienActif(item.to, item.end, pathname, hash));
  actifs.sort((a, b) => b.to.length - a.to.length);
  const choisi = actifs[0];
  return choisi ? !menuAutorise(acces, choisi.acces) : false;
}

const ANCRES = NAV.flatMap((section) => section.liens.map((lien) => lien.to)).filter((to) => to.includes("#"));

/**
 * NavLink ignore l'ancre : « Circuits » et « Circuits#rbac » seraient actifs ensemble.
 * Un lien à ancre n'est actif que sur son ancre ; le lien parent lui cède alors la place.
 */
function lienActif(to: string, end: boolean | undefined, pathname: string, hash: string): boolean {
  const [chemin, ancre] = to.split("#");
  if (ancre) return pathname === chemin && hash === `#${ancre}`;
  if (ANCRES.includes(`${pathname}${hash}`)) return false;
  return end ? pathname === chemin : pathname === chemin || pathname.startsWith(`${chemin}/`);
}

const CLE_REPLI = "sigrh-sidebar-repli";

function repliEnregistre(): boolean {
  try {
    return localStorage.getItem(CLE_REPLI) === "1";
  } catch {
    return false;
  }
}

function ecranLarge(): boolean {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function initiales(user: SessionUser | undefined): string {
  if (!user) return "";
  return `${user.prenoms.charAt(0)}${user.nom.charAt(0)}`.toUpperCase();
}

function BandeauSondage() {
  const sondage = useQuery({
    queryKey: ["sondage-courant"],
    queryFn: () => api<{ ouverte: boolean; ma_reponse: string; question: string } | null>("/api/v1/sondage/"),
  });
  if (!sondage.data?.ouverte || sondage.data.ma_reponse) return null;
  return (
    <Link to="/app/sondage" className="mx-4 mt-4 sm:mx-6 lg:mx-8 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-fixed/40 px-4 py-3 text-on-surface hover:bg-primary-fixed/70">
      <span className="material-symbols-outlined text-primary" aria-hidden="true">poll</span>
      <span>
        <span className="block font-label-md text-label-md font-bold">Sondage ouvert à l'ensemble des agents</span>
        <span className="block font-body-sm text-body-sm text-on-surface-variant">{sondage.data.question}</span>
      </span>
    </Link>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [repli, setRepli] = useState(repliEnregistre);
  const [large, setLarge] = useState(ecranLarge);
  const { pathname, hash } = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<SessionUser>("/api/v1/me/"), staleTime: Infinity });
  const reduit = large && repli;
  const menuOuvert = large ? !repli : menuOpen;

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const suivre = () => setLarge(media.matches);
    media.addEventListener("change", suivre);
    return () => media.removeEventListener("change", suivre);
  }, []);

  function basculerMenu() {
    if (ecranLarge()) {
      setRepli((valeur) => {
        const suivant = !valeur;
        try {
          localStorage.setItem(CLE_REPLI, suivant ? "1" : "0");
        } catch {
          /* le choix reste valable pour cette visite */
        }
        return suivant;
      });
      return;
    }
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-md border-b border-hairline">
        <div className="h-1 flex w-full" aria-hidden="true">
          <div className="w-1/3 bg-secondary-container"></div>
          <div className="w-1/3 bg-surface-container-lowest"></div>
          <div className="w-1/3 bg-primary-container"></div>
        </div>
        <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              className="p-2 -ml-1 rounded text-on-surface-variant hover:bg-surface-container-high"
              aria-label={large ? (repli ? "Élargir le menu" : "Réduire le menu") : menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={menuOuvert}
              aria-controls="app-sidebar"
              onClick={basculerMenu}
            >
              <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                {menuOuvert ? "menu_open" : "menu"}
              </span>
            </button>
            <Link to="/app" className="flex items-center gap-3 min-w-0 rounded">
              <span className="flex items-center justify-center p-1 bg-surface-container-low rounded shrink-0">
                <img alt="Armoiries de la République de Côte d'Ivoire" className="h-10 w-10 object-contain" src="/logo.png" />
              </span>
              <span className="hidden sm:flex flex-col min-w-0">
                <span className="font-label-md text-label-md text-primary uppercase tracking-wider font-bold truncate">
                  SIGRH | République de Côte d'Ivoire
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  Ministère du Portefeuille de l'État et des Entreprises Publiques
                </span>
              </span>
            </Link>
          </div>
          <AgentSearch />
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-surface-container-low rounded">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Exercice</span>
              <span className="font-code-num text-code-num text-primary font-bold px-1.5 py-0.5 bg-surface-container-lowest rounded">
                2026
              </span>
            </div>
            {menuAutorise(me.data?.acces, { module: "Statistiques & RBAC", fonction: "Communication" }) ? <CommunicationBouton /> : null}
            <MessagerieBouton />
            <NotificationBell />
            <ProfileMenu user={me.data} />
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="motion-overlay fixed inset-0 z-30 bg-inverse-surface/30 lg:hidden" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside
        id="app-sidebar"
        inert={!large && !menuOpen}
        className={`fixed left-0 top-0 h-full bg-primary text-on-primary z-40 flex flex-col pt-20 pb-24 border-r border-primary-container overflow-x-hidden overflow-y-auto transition-[width,transform] duration-300 ease-out w-72 ${menuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"} lg:translate-x-0 lg:shadow-none ${repli ? "lg:w-16" : "lg:w-72"}`}
      >
        <div className={reduit ? "px-2 pb-3" : "px-5 pb-3"}>
          <div className={`bg-primary-container rounded flex items-center ${reduit ? "justify-center p-2" : "gap-3 p-3"}`} title={reduit ? (me.data ? `${me.data.organisme_sigle} — ${me.data.organisme}` : "DGPE & Sociétés d'État") : undefined}>
            <div className="w-8 h-8 rounded bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">account_balance</span>
            </div>
            <div className={reduit ? "sr-only" : "min-w-0"}>
              <p className="font-label-sm text-label-sm text-primary-fixed font-medium">Portefeuille étatique</p>
              <p className="font-label-md text-label-md text-on-primary font-bold truncate">
                {me.data ? `${me.data.organisme_sigle} — ${me.data.organisme}` : "DGPE & Sociétés d'État"}
              </p>
            </div>
          </div>
        </div>
        <nav className={`flex-1 space-y-1 font-body-sm text-body-sm ${reduit ? "px-2" : "px-3"}`} aria-label="Navigation principale">
          {NAV.map((section, index) => (
            <div key={section.groupe}>
              {reduit && index > 0 ? <div className="mx-2 my-2 border-t border-primary-fixed/40" /> : null}
              <p className={reduit ? "sr-only" : `px-3 ${index === 0 ? "pt-2" : "pt-3"} pb-1 font-label-sm text-label-sm text-primary-fixed uppercase tracking-wider font-bold`}>
                {section.groupe}
              </p>
              {section.liens.map((lien) => (
                <EntreeNav key={lien.to} lien={lien} pathname={pathname} hash={hash} acces={me.data?.acces} reduit={reduit} />
              ))}
            </div>
          ))}
        </nav>
        <div className={reduit ? "px-2 pt-3 mt-auto" : "px-4 pt-3 mt-auto"}>
          <div className={`bg-primary-container rounded text-center ${reduit ? "p-2" : "p-3"}`} title={reduit ? "Direction des ressources humaines" : undefined}>
            <span className={reduit ? "sr-only" : "font-label-sm text-label-sm text-primary-fixed block font-medium"}>Direction des ressources humaines</span>
            <span className="font-code-num text-code-num text-on-primary block mt-0.5">{reduit ? "DRH" : "MPEEP"}</span>
          </div>
        </div>
      </aside>

      <div className={`transition-[padding] duration-300 ${repli ? "lg:pl-16" : "lg:pl-72"}`}>
        <main className="relative pt-16 pb-28 min-h-screen bg-background flex flex-col justify-between">
          <PageMotion className="flex-1 flex flex-col" reveal={false}>
            <BandeauSondage />
            {pageHorsHabilitation(pathname, hash, me.data?.acces) ? (
              <p className="m-8 max-w-xl font-body-md text-body-md text-on-surface-variant">Cette entrée est hors de votre habilitation.</p>
            ) : children}
          </PageMotion>
        </main>
      </div>
      <footer className="fixed bottom-0 inset-x-0 z-50 bg-surface-container-lowest py-4 px-4 sm:px-8 border-t border-hairline">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="font-label-md text-label-md text-primary font-bold">SIGRH MPEEP</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
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

const REFUSE = "text-on-primary/35 cursor-not-allowed";

function EntreeNav({ lien, pathname, hash, acces, reduit }: { lien: LienNav; pathname: string; hash: string; acces: SessionUser["acces"]; reduit: boolean }) {
  const sousMenuId = useId();
  const dansSection = lien.enfants?.some((enfant) => lienActif(enfant.to, enfant.end, pathname, hash)) ?? false;
  const [ouvert, setOuvert] = useState(dansSection);
  const autorise = menuAutorise(acces, lien.acces);

  useEffect(() => {
    if (dansSection) setOuvert(true);
  }, [dansSection]);

  if (!lien.enfants) {
    const actif = lienActif(lien.to, lien.end, pathname, hash);
    if (!autorise) {
      return (
        <span title={reduit ? lien.libelle : "Hors de votre habilitation"} aria-disabled="true" className={`flex items-center rounded ${REFUSE} ${reduit ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"}`}>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">{lien.icone}</span>
          <span className={reduit ? "sr-only" : ""}>{lien.libelle}</span>
        </span>
      );
    }
    return (
      <Link
        to={lien.to}
        title={reduit ? lien.libelle : undefined}
        aria-current={actif ? "page" : undefined}
        className={`flex items-center rounded transition-colors ${reduit ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"} ${actif ? "bg-primary-fixed text-on-primary-fixed font-semibold shadow-sm" : "text-on-primary/80 hover:bg-primary-container hover:text-on-primary"}`}
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">{lien.icone}</span>
        <span className={reduit ? "sr-only" : ""}>{lien.libelle}</span>
      </Link>
    );
  }

  if (reduit) {
    const actif = dansSection || lienActif(lien.to, lien.end, pathname, hash);
    const classe = `flex items-center justify-center px-2 py-2 rounded transition-colors ${actif ? "bg-primary-fixed text-on-primary-fixed font-semibold shadow-sm" : autorise ? "text-on-primary/80 hover:bg-primary-container hover:text-on-primary" : REFUSE}`;
    const contenu = (
      <>
        <span className="material-symbols-outlined text-lg" aria-hidden="true">{lien.icone}</span>
        <span className="sr-only">{lien.libelle}</span>
      </>
    );
    if (!autorise) {
      return <span title={lien.libelle} aria-disabled="true" className={classe}>{contenu}</span>;
    }
    return (
      <Link to={lien.to} title={lien.libelle} aria-current={actif ? "page" : undefined} className={classe}>
        {contenu}
      </Link>
    );
  }

  return (
    <div>
      <div className="flex items-center">
        {autorise ? (
          <Link
            to={lien.to}
            onClick={() => setOuvert(true)}
            className={`flex flex-1 items-center gap-3 min-w-0 px-3 py-2 rounded transition-colors ${dansSection ? "text-on-primary font-semibold" : "text-on-primary/80 hover:bg-primary-container hover:text-on-primary"}`}
          >
            <span className="material-symbols-outlined text-lg shrink-0" aria-hidden="true">{lien.icone}</span>
            <span className="truncate">{lien.libelle}</span>
          </Link>
        ) : (
          <span title="Hors de votre habilitation" aria-disabled="true" className={`flex flex-1 items-center gap-3 min-w-0 px-3 py-2 rounded ${REFUSE}`}>
            <span className="material-symbols-outlined text-lg shrink-0" aria-hidden="true">{lien.icone}</span>
            <span className="truncate">{lien.libelle}</span>
          </span>
        )}
        <button
          type="button"
          className="mr-1 p-1.5 rounded text-on-primary/80 hover:bg-primary-container hover:text-on-primary"
          aria-expanded={ouvert}
          aria-controls={sousMenuId}
          aria-label={ouvert ? `Replier ${lien.libelle}` : `Déplier ${lien.libelle}`}
          onClick={() => setOuvert((valeur) => !valeur)}
        >
          <span className={`material-symbols-outlined text-lg block transition-transform ${ouvert ? "rotate-180" : ""}`} aria-hidden="true">
            expand_more
          </span>
        </button>
      </div>
      {ouvert ? (
        <div id={sousMenuId} className="mt-0.5 mb-1 ml-5 pl-3 border-l border-primary-fixed/40 space-y-0.5">
          {lien.enfants.map((enfant) => {
            const actif = lienActif(enfant.to, enfant.end, pathname, hash);
            if (!menuAutorise(acces, enfant.acces)) {
              return (
                <span key={enfant.to} title="Hors de votre habilitation" aria-disabled="true" className={`block px-3 py-1.5 rounded leading-snug ${REFUSE}`}>
                  {enfant.libelle}
                </span>
              );
            }
            return (
              <Link
                key={enfant.to}
                to={enfant.to}
                aria-current={actif ? "page" : undefined}
                className={`block px-3 py-1.5 rounded leading-snug transition-colors ${actif ? "bg-primary-fixed text-on-primary-fixed font-semibold shadow-sm" : "text-on-primary/80 hover:bg-primary-container hover:text-on-primary"}`}
              >
                {enfant.libelle}
              </Link>
            );
          })}
        </div>
      ) : null}
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
        <span
          className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-md text-label-md font-bold"
          aria-hidden="true"
        >
          {initiales(user) || <span className="material-symbols-outlined text-lg">person</span>}
        </span>
        <span className="hidden md:flex flex-col text-left">
          <span className="font-label-md text-label-md text-on-surface font-semibold leading-tight">
            {user?.nom_complet ?? "Session"}
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant">{user?.fonction ?? ""}</span>
        </span>
        <span className="material-symbols-outlined text-lg text-on-surface-variant" aria-hidden="true">expand_more</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="motion-overlay-card absolute right-0 mt-2 w-72 rounded-lg border border-hairline bg-surface-container-lowest p-2 shadow-xl"
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
              <span className="material-symbols-outlined text-lg leading-none text-primary shrink-0" aria-hidden="true">ink_pen</span>
              Ma signature
            </span>
            {user?.signature_url ? (
              <span className="flex h-14 items-center justify-center rounded-md border border-hairline bg-white px-3">
                <img src={user.signature_url} alt="Signature enregistrée" className="max-h-10 max-w-full object-contain" />
              </span>
            ) : (
              <span className="font-body-sm text-body-sm text-on-surface-variant">Aucune signature enregistrée</span>
            )}
          </button>
          <button
            role="menuitem"
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-left font-label-lg text-label-lg text-error hover:bg-error-container/50"
            onClick={onLogout}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">logout</span>
            Se déconnecter
          </button>
        </div>
      ) : null}
      {signatureOuverte ? <EditeurSignature user={user} onClose={() => setSignatureOuverte(false)} /> : null}
    </div>
  );
}

/** Recherche d'agent branchée sur /api/v1/agents/?q=. Raccourci : « / ». */
function AgentSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const results = useQuery({
    queryKey: ["agents", debounced],
    queryFn: () => api<AgentBrief[]>(`/api/v1/agents/?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });
  const agents = (results.data ?? []).slice(0, 6);
  const showPanel = open && debounced.length >= 2;

  function goTo(matricule: string) {
    setOpen(false);
    setQuery("");
    navigate(`/app/dossiers/${encodeURIComponent(matricule)}`);
  }

  return (
    <div className="flex-1 max-w-md mx-2 hidden lg:block relative">
      <label className="relative flex items-center">
        <span className="sr-only">Rechercher un agent</span>
        <span className="material-symbols-outlined absolute left-3 text-on-surface-variant text-lg pointer-events-none" aria-hidden="true">
          search
        </span>
        <input
          ref={inputRef}
          className="w-full pl-9 pr-10 py-1.5 bg-surface-container-low text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm rounded border border-transparent focus:outline-none focus:border-primary-container focus:bg-surface-container-lowest"
          placeholder="Rechercher un agent (nom ou matricule)…"
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && agents[0]) goTo(agents[0].matricule);
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
        />
        <kbd className="absolute right-2 px-1.5 rounded border border-hairline bg-surface-container-lowest font-label-sm text-label-sm text-on-surface-variant" aria-hidden="true">
          /
        </kbd>
      </label>
      {showPanel ? (
        <ul
          id={listId}
          role="listbox"
          className="motion-overlay-card absolute left-0 right-0 mt-2 rounded-lg border border-hairline bg-surface-container-lowest p-1 shadow-xl"
        >
          {results.isPending ? (
            <li className="px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">Recherche…</li>
          ) : results.isError ? (
            <li className="px-3 py-2 font-body-sm text-body-sm text-error">La recherche n'a pas abouti. Réessayez dans un instant.</li>
          ) : agents.length === 0 ? (
            <li className="px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">
              Aucun agent ne correspond à « {debounced} ». Vérifiez l'orthographe ou saisissez le matricule.
            </li>
          ) : (
            agents.map((agent) => (
              <li key={agent.matricule} role="option" aria-selected="false">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2 rounded text-left hover:bg-surface-container-low"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => goTo(agent.matricule)}
                >
                  <Portrait agent={agent} className="w-8 h-8 rounded-full bg-surface-container text-primary font-label-md text-label-md shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-label-lg text-label-lg text-on-surface truncate">{agent.nom_complet}</span>
                    <span className="block font-code-num text-code-num text-on-surface-variant truncate">
                      {agent.matricule} · {agent.organisme_sigle}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
