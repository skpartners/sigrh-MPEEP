import type { SessionUser } from "../api/types";

export type AccesMenu = { module: string; fonction?: string };
export type EnfantNav = { to: string; libelle: string; end?: boolean; icone: string; acces: AccesMenu; groupe?: string };
export type LienNav = {
  to: string;
  end?: boolean;
  icone: string;
  libelle: string;
  resume: string;
  acces: AccesMenu;
  enfants?: EnfantNav[];
  /** Visible au menu mais non ouvrant : le module n'est pas encore livré. */
  bientot?: boolean;
};
export type SectionNav = { groupe: string; liens: LienNav[] };

export const NAV: SectionNav[] = [
  {
    groupe: "Pilotage central",
    liens: [
      {
        to: "/app/tableau-de-bord",
        end: true,
        icone: "dashboard",
        libelle: "Tableau de bord",
        resume: "Le tableau de bord de l'exercice : registres ouverts, indicateurs, file de visas et derniers actes.",
        acces: { module: "Statistiques & RBAC", fonction: "Tableau de bord" },
      },
      {
        to: "/app/agents",
        icone: "badge",
        libelle: "Profil agent",
        resume: "Le profil agent permet de consulter et de mettre à jour ses informations personnelles, familiales et professionnelles, ainsi que de gérer ses demandes d’actes et ses documents administratifs.",
        acces: { module: "Dossier Agent", fonction: "Consultation du dossier" },
        enfants: [
          { to: "/app/profil-agent", end: true, icone: "person", libelle: "Accueil", acces: { module: "Profil agent", fonction: "Accueil" } },
          { to: "/app/profil-agent/etat-civil", icone: "badge", libelle: "État civil", acces: { module: "Profil agent", fonction: "État civil" } },
          { to: "/app/profil-agent/situation-administrative", icone: "work", libelle: "Situation administrative", acces: { module: "Profil agent", fonction: "Situation administrative" } },
          { to: "/app/profil-agent/liste-des-enfants", icone: "family_restroom", libelle: "Liste des enfants", acces: { module: "Profil agent", fonction: "Liste des enfants" } },
          { to: "/app/profil-agent/mes-documents-administratifs", icone: "folder_open", libelle: "Mes documents administratifs", acces: { module: "Profil agent", fonction: "Mes documents administratifs" } },
        ],
      }
    ],
  },
  {
    groupe: "Métier",
    liens: [
      {
        to: "/app/grh",
        end: true,
        icone: "hub",
        libelle: "GRH",
        resume: "Gestion des ressources humaines : carrières, action sociale, formation continue et programmation des effectifs.",
        acces: { module: "Carrières & Actes", fonction: "Accueil" },
        enfants: [
          { to: "/app/grh", end: true, icone: "hub", libelle: "Accueil GRH", acces: { module: "Carrières & Actes", fonction: "Accueil" } },
          { to: "/app/carrieres/situation-administrative", icone: "badge", libelle: "Situation administrative", acces: { module: "Carrières & Actes", fonction: "Situation administrative" }, groupe: "I. Gestion des carrières" },
          { to: "/app/carrieres/procedures-disciplinaires", icone: "gavel", libelle: "Procédures disciplinaires", acces: { module: "Carrières & Actes", fonction: "Procédures disciplinaires" }, groupe: "I. Gestion des carrières" },
          { to: "/app/carrieres/conges", icone: "beach_access", libelle: "Suivi des congés", acces: { module: "Carrières & Actes", fonction: "Congés" }, groupe: "I. Gestion des carrières" },
          { to: "/app/carrieres/absences", icone: "event_busy", libelle: "Suivi des absences", acces: { module: "Carrières & Actes", fonction: "Absences" }, groupe: "I. Gestion des carrières" },
          { to: "/app/grh/bilan-carriere", icone: "analytics", libelle: "Bilan de la gestion de carrière", acces: { module: "Carrières & Actes", fonction: "Bilan de carrière" }, groupe: "I. Gestion des carrières" },
          { to: "/app/carrieres/fin-de-carriere", icone: "military_tech", libelle: "Gestion des fins de carrière", acces: { module: "Carrières & Actes", fonction: "Fin de carrière" }, groupe: "II. Action sociale" },
          { to: "/app/grh/distinctions", icone: "workspace_premium", libelle: "Distinctions", acces: { module: "Carrières & Actes", fonction: "Distinctions" }, groupe: "II. Action sociale" },
          { to: "/app/formation", icone: "edit_calendar", libelle: "Élaboration du plan de formation", acces: { module: "Formations", fonction: "Formation continue" }, groupe: "III. Formation continue" },
          { to: "/app/grh/formation/suivi", icone: "fact_check", libelle: "Suivi du plan de formation", acces: { module: "Formations", fonction: "Suivi du plan" }, groupe: "III. Formation continue" },
          { to: "/app/grh/formation/bilan", icone: "analytics", libelle: "Bilan de la formation", acces: { module: "Formations", fonction: "Bilan de la formation" }, groupe: "III. Formation continue" },
          { to: "/app/gpec/expression-des-besoins", icone: "post_add", libelle: "Besoins exprimés", acces: { module: "GPEC", fonction: "Expression des besoins" }, groupe: "IV. Programmation des effectifs" },
          { to: "/app/grh/programmation/conference", icone: "how_to_vote", libelle: "Besoins validés en Conférence de programmation", acces: { module: "GPEC", fonction: "Conférence de programmation" }, groupe: "IV. Programmation des effectifs" },
          { to: "/app/grh/programmation/catalogue", icone: "menu_book", libelle: "Catalogue des mesures nouvelles", acces: { module: "GPEC", fonction: "Catalogue des mesures nouvelles" }, groupe: "IV. Programmation des effectifs" },
          { to: "/app/gpec/recrutement", icone: "domain_add", libelle: "Dotation", acces: { module: "GPEC", fonction: "Recrutement" }, groupe: "IV. Programmation des effectifs" },
          { to: "/app/grh/programmation/bilan", icone: "balance", libelle: "Bilan de satisfaction des besoins", acces: { module: "GPEC", fonction: "Bilan de satisfaction" }, groupe: "IV. Programmation des effectifs" },
        ],
      },
      {
        to: "/app/communication",
        icone: "campaign",
        libelle: "Documents publics & communication",
        resume: "Les notes, circulaires et annonces, du brouillon jusqu'à la publication.",
        acces: { module: "Statistiques & RBAC", fonction: "Communication" },
      },
      {
        to: "/app/projets-etudes-rh",
        icone: "assignment",
        libelle: "Projets et études RH",
        resume: "Les projets et les études menés en ressources humaines.",
        acces: { module: "Projets et études RH" },
        bientot: true,
      },
    ],
  },
  {
    groupe: "Gouvernance & conformité",
    liens: [
      {
        to: "/app/statistiques",
        icone: "bar_chart",
        libelle: "Statistiques",
        resume: "Tableaux croisés dynamiques, graphiques modifiables et classeurs Excel.",
        acces: { module: "Statistiques & RBAC", fonction: "Statistiques" },
      },
      {
        to: "/app/parametres",
        end: true,
        icone: "tune",
        libelle: "Paramètres",
        resume: "L'identité de la ministre, les délais, les couleurs, les circuits, les habilitations, les comptes et les structures.",
        acces: { module: "Statistiques & RBAC", fonction: "Paramètres" },
        enfants: [
          { to: "/app/parametres", end: true, icone: "tune", libelle: "Accueil", acces: { module: "Statistiques & RBAC", fonction: "Paramètres" } },
          { to: "/app/circuits", icone: "approval_delegation", libelle: "Circuits de validation", acces: { module: "Statistiques & RBAC", fonction: "Circuits et habilitations" } },
          { to: "/app/habilitations", icone: "admin_panel_settings", libelle: "Habilitations", acces: { module: "Statistiques & RBAC", fonction: "Habilitations" } },
          { to: "/app/utilisateurs", icone: "manage_accounts", libelle: "Gestion des utilisateurs", acces: { module: "Statistiques & RBAC", fonction: "Comptes utilisateurs" } },
          { to: "/app/structures", icone: "account_tree", libelle: "Structures du ministère", acces: { module: "Statistiques & RBAC", fonction: "Structures du ministère" } },
        ],
      },
    ],
  },
];

export function droitMenu(acces: SessionUser["acces"], cle: AccesMenu): string {
  if (!acces) return "lecture";
  if (cle.fonction) {
    const detail = acces.fonctions[`${cle.module}|${cle.fonction}`];
    if (detail) return detail;
  }
  return acces.modules[cle.module] ?? "refus";
}

export function menuAutorise(acces: SessionUser["acces"], cle: AccesMenu): boolean {
  return droitMenu(acces, cle) !== "refus";
}

/** Le module s'ouvre dès qu'une de ses rubriques est autorisée. */
export function moduleAutorise(acces: SessionUser["acces"], lien: LienNav): boolean {
  return menuAutorise(acces, lien.acces) || sousMenus(lien).some((enfant) => menuAutorise(acces, enfant.acces));
}

/** L'accueil du module, ou la première rubrique encore ouverte. Jamais une page refusée. */
export function destinationModule(acces: SessionUser["acces"], lien: LienNav): string {
  if (menuAutorise(acces, lien.acces)) return lien.to;
  return sousMenus(lien).find((enfant) => menuAutorise(acces, enfant.acces))?.to ?? "/app";
}

/** Quand l'adresse courante est refusée, la première page encore ouverte du même module. */
export function repliHabilitation(pathname: string, hash: string, acces: SessionUser["acces"]): string | null {
  if (!acces || !pageHorsHabilitation(pathname, hash, acces)) return null;
  const menu = menuCourant(pathname, hash);
  if (!menu) return "/app";
  const ouvert = [menu, ...sousMenus(menu)].find((item) => menuAutorise(acces, item.acces));
  return ouvert?.to ?? "/app";
}

const ANCRES = NAV.flatMap((section) =>
  section.liens.flatMap((lien) => [lien.to, ...(lien.enfants ?? []).map((enfant) => enfant.to)]),
).filter((to) => to.includes("#"));

/**
 * NavLink ignore l'ancre : deux liens du même chemin seraient actifs ensemble.
 * Un lien à ancre n'est actif que sur son ancre ; le lien parent lui cède alors la place.
 */
export function lienActif(to: string, end: boolean | undefined, pathname: string, hash: string): boolean {
  const [chemin, ancre] = to.split("#");
  if (ancre) return pathname === chemin && hash === `#${ancre}`;
  if (ANCRES.includes(`${pathname}${hash}`)) return false;
  return end ? pathname === chemin : pathname === chemin || pathname.startsWith(`${chemin}/`);
}

function pageCourante(pathname: string, hash: string): { acces: AccesMenu; libelle: string } | null {
  const candidats: { to: string; end?: boolean; acces: AccesMenu; libelle: string }[] = [];
  for (const section of NAV) {
    for (const lien of section.liens) {
      candidats.push(lien);
      for (const enfant of lien.enfants ?? []) candidats.push(enfant);
    }
  }
  const actifs = candidats.filter((item) => lienActif(item.to, item.end, pathname, hash));
  actifs.sort((a, b) => b.to.length - a.to.length);
  return actifs[0] ?? null;
}

export function pageHorsHabilitation(pathname: string, hash: string, acces: SessionUser["acces"]): boolean {
  if (!acces) return false;
  const choisi = pageCourante(pathname, hash);
  return choisi ? !menuAutorise(acces, choisi.acces) : false;
}

export function libellePage(pathname: string, hash: string): string | null {
  return pageCourante(pathname, hash)?.libelle ?? null;
}

/** Un enfant qui ne fait que répéter la page du menu n'est pas un sous-menu. */
export function sousMenus(lien: LienNav): EnfantNav[] {
  const enfants = lien.enfants ?? [];
  return enfants.some((enfant) => enfant.to !== lien.to) ? enfants : [];
}

/** Grand menu dont la page courante est l'accueil ou l'un des sous-menus. */
export function menuCourant(pathname: string, hash: string): LienNav | null {
  let choisi: LienNav | null = null;
  let score = -1;
  for (const section of NAV) {
    for (const lien of section.liens) {
      for (const cible of [lien, ...(lien.enfants ?? [])]) {
        if (!lienActif(cible.to, cible.end, pathname, hash)) continue;
        if (cible.to.length > score) {
          score = cible.to.length;
          choisi = lien;
        }
      }
    }
  }
  return choisi;
}

/**
 * Les rubriques d'un menu groupé (GRH) regroupées par domaine : chaque domaine devient une carte
 * de l'accueil du menu, ouverte sur sa première rubrique.
 */
export function domainesDuMenu(lien: LienNav, resumes: Record<string, { icone: string; resume: string }>): LienNav[] {
  const domaines: LienNav[] = [];
  for (const enfant of lien.enfants ?? []) {
    if (!enfant.groupe) continue;
    let domaine = domaines.find((item) => item.libelle === enfant.groupe);
    if (!domaine) {
      const infos = resumes[enfant.groupe] ?? { icone: enfant.icone, resume: "" };
      domaine = { to: enfant.to, icone: infos.icone, libelle: enfant.groupe, resume: infos.resume, acces: enfant.acces, enfants: [] };
      domaines.push(domaine);
    }
    domaine.enfants = [...(domaine.enfants ?? []), enfant];
  }
  return domaines;
}
