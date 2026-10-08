import type { SessionUser } from "../api/types";

export type AccesMenu = { module: string; fonction?: string };
export type EnfantNav = { to: string; libelle: string; end?: boolean; icone: string; acces: AccesMenu };
export type LienNav = {
  to: string;
  end?: boolean;
  icone: string;
  libelle: string;
  resume: string;
  acces: AccesMenu;
  enfants?: EnfantNav[];
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
        to: "/app/dossiers",
        icone: "badge",
        libelle: "Mon profil",
        resume: "Le dossier individuel : identité, situation, carrière, pièces et exports.",
        acces: { module: "Dossier Agent", fonction: "Consultation du dossier" },
      },
    ],
  },
  {
    groupe: "Métier",
    liens: [
      {
        to: "/app/carrieres",
        icone: "assignment",
        libelle: "Carrières & actes",
        resume: "L'avancement et les mouvements qui suivent la vie administrative de l'agent.",
        acces: { module: "Carrières & Actes", fonction: "Accueil" },
        enfants: [
          { to: "/app/carrieres", end: true, icone: "dashboard", libelle: "Accueil", acces: { module: "Carrières & Actes", fonction: "Accueil" } },
          { to: "/app/carrieres/situation-administrative", icone: "badge", libelle: "Situation administrative", acces: { module: "Carrières & Actes", fonction: "Situation administrative" } },
          { to: "/app/carrieres/absences", icone: "event_busy", libelle: "Absences", acces: { module: "Carrières & Actes", fonction: "Absences" } },
          { to: "/app/carrieres/conges", icone: "beach_access", libelle: "Congés", acces: { module: "Carrières & Actes", fonction: "Congés" } },
          { to: "/app/carrieres/procedures-disciplinaires", icone: "gavel", libelle: "Procédures disciplinaires", acces: { module: "Carrières & Actes", fonction: "Procédures disciplinaires" } },
          { to: "/app/carrieres/fin-de-carriere", icone: "military_tech", libelle: "Fin de carrière", acces: { module: "Carrières & Actes", fonction: "Fin de carrière" } },
        ],
      },
      {
        to: "/app/action-sociale",
        icone: "volunteer_activism",
        libelle: "Action sociale",
        resume: "Les aides, prêts et secours, et la quotité cessible de l'agent.",
        acces: { module: "Social & Santé", fonction: "Action sociale" },
      },
      {
        to: "/app/formation",
        icone: "school",
        libelle: "Formation continue",
        resume: "Le plan, le catalogue, les sessions, les candidatures et le passeport de compétences.",
        acces: { module: "Formations", fonction: "Formation continue" },
      },
      {
        to: "/app/gpec",
        icone: "groups",
        libelle: "GPEC",
        resume: "Ce que les structures demandent, et la façon dont les postes sont pourvus dans les plafonds.",
        acces: { module: "GPEC", fonction: "GPEC" },
        enfants: [
          { to: "/app/gpec/expression-des-besoins", icone: "post_add", libelle: "Expression des besoins", acces: { module: "GPEC", fonction: "Expression des besoins" } },
          { to: "/app/gpec/recrutement", icone: "person_add", libelle: "Recrutement", acces: { module: "GPEC", fonction: "Recrutement" } },
        ],
      },
      {
        to: "/app/communication",
        icone: "campaign",
        libelle: "Communication",
        resume: "Les notes, circulaires et annonces, du brouillon jusqu'à la publication.",
        acces: { module: "Statistiques & RBAC", fonction: "Communication" },
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
