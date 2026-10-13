
import type { SessionUser } from "../api/types";

export type AccesMenu = {
  module: string;
  fonction?: string;
};

export type EnfantNav = {
  to: string;
  libelle: string;
  end?: boolean;
  icone: string;
  acces: AccesMenu;
};

export type LienNav = {
  to: string;
  end?: boolean;
  icone: string;
  libelle: string;
  resume: string;
  acces: AccesMenu;
  enfants?: EnfantNav[];
};

export type SectionNav = {
  groupe: string;
  liens: LienNav[];
};

export const NAV: SectionNav[] = [
  {
    groupe: "Pilotage central",
    liens: [
      {
        to: "/app/tableau-de-bord",
        end: true,
        icone: "dashboard",
        libelle: "Tableau de bord",
        resume:
          "Le tableau de bord de l'exercice : registres ouverts, indicateurs, file de visas et derniers actes.",
        acces: {
          module: "Statistiques & RBAC",
          fonction: "Tableau de bord",
        },
      },
      {
        to: "/app/agents",
        icone: "badge",
        libelle: "Profil agent",
        resume:
          "Le profil agent permet de consulter et de mettre à jour ses informations personnelles, familiales et professionnelles, ainsi que de gérer ses demandes d'actes et ses documents administratifs.",
        acces: {
          module: "Dossier Agent",
          fonction: "Consultation du dossier",
        },
        enfants: [
          {
            to: "/app/agents",
            end: true,
            icone: "badge",
            libelle: "Accueil",
            acces: {
              module: "Dossier Agent",
              fonction: "Consultation du dossier",
            },
          },
          {
            to: "/app/agents/demandes-d-actes",
            icone: "description",
            libelle: "Demandes d'actes",
            acces: {
              module: "Dossier Agent",
              fonction: "Demandes d'actes",
            },
          },
          {
            to: "/app/agents-actualiser-mes-informations",
            icone: "manage_accounts",
            libelle: "Actualiser mes informations",
            acces: {
              module: "Dossier Agent",
              fonction: "Actualisation des informations",
            },
          },
          {
            to: "/app/agents-actualiser-informations",
            icone: "group",
            libelle: "Actualiser informations agents",
            acces: {
              module: "Dossier Agent",
              fonction: "Actualisation des informations agents",
            },
          },
        ],
      },
    ],
  },
  {
    groupe: "Métier",
    liens: [
      {
        to: "/app/grh",
        icone: "assignment",
        libelle: "GRH",
        resume:
          "La GRH permet d'assurer la gestion des carrières, des congés, des absences, des procédures disciplinaires, des fins de carrière, de la formation continue et de la programmation des effectifs.",
        acces: {
          module: "Carrières & Actes",
          fonction: "Accueil",
        },
        enfants: [
          {
            to: "/app/grh",
            end: true,
            icone: "dashboard",
            libelle: "Accueil",
            acces: {
              module: "GRH",
              fonction: "Accueil",
            },
          },
          {
            to: "/app/grh/gestion-des-carrieres",
            icone: "work_history",
            libelle: "Gestion des carrières",
            acces: {
              module: "GRH",
              fonction: "Gestion des carrières",
            },
          },
          {
            to: "/app/grh/action-sociale",
            icone: "volunteer_activism",
            libelle: "Action sociale",
            acces: {
              module: "GRH",
              fonction: "Action sociale",
            },
          },
          {
            to: "/app/grh/formation-continue",
            icone: "school",
            libelle: "Formation continue",
            acces: {
              module: "GRH",
              fonction: "Formation continue",
            },
          },
          {
            to: "/app/grh/programmation-des-effectifs",
            icone: "groups",
            libelle: "Programmations des effectifs",
            acces: {
              module: "GRH",
              fonction: "Programmations des effectifs",
            },
          },
        ],
      },
      {
        to: "/app/communication",
        icone: "campaign",
        libelle: "Communication",
        resume:
          "Les notes, circulaires et annonces, du brouillon jusqu'à la publication.",
        acces: {
          module: "Statistiques & RBAC",
          fonction: "Communication",
        },
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
        resume:
          "Tableaux croisés dynamiques, graphiques modifiables et classeurs Excel.",
        acces: {
          module: "Statistiques & RBAC",
          fonction: "Statistiques",
        },
      },
      {
        to: "/app/parametres",
        end: true,
        icone: "tune",
        libelle: "Paramètres",
        resume:
          "L'identité de la ministre, les délais, les couleurs, les circuits, les habilitations, les comptes et les structures.",
        acces: {
          module: "Statistiques & RBAC",
          fonction: "Paramètres",
        },
        enfants: [
          {
            to: "/app/parametres",
            end: true,
            icone: "tune",
            libelle: "Accueil",
            acces: {
              module: "Statistiques & RBAC",
              fonction: "Paramètres",
            },
          },
          {
            to: "/app/circuits",
            icone: "approval_delegation",
            libelle: "Circuits de validation",
            acces: {
              module: "Statistiques & RBAC",
              fonction: "Circuits et habilitations",
            },
          },
          {
            to: "/app/habilitations",
            icone: "admin_panel_settings",
            libelle: "Habilitations",
            acces: {
              module: "Statistiques & RBAC",
              fonction: "Habilitations",
            },
          },
          {
            to: "/app/utilisateurs",
            icone: "manage_accounts",
            libelle: "Gestion des utilisateurs",
            acces: {
              module: "Statistiques & RBAC",
              fonction: "Comptes utilisateurs",
            },
          },
          {
            to: "/app/structures",
            icone: "account_tree",
            libelle: "Structures du ministère",
            acces: {
              module: "Statistiques & RBAC",
              fonction: "Structures du ministère",
            },
          },
        ],
      },
    ],
  },
];

/**
 * Retourne le droit précis de la fonction si défini.
 * Sinon, utilise le droit du module.
 */
export function droitMenu(
  acces: SessionUser["acces"],
  cle: AccesMenu,
): string {
  if (!acces) return "refus";

  if (cle.fonction) {
    const detail = acces.fonctions?.[`${cle.module}|${cle.fonction}`];

    if (detail) return detail;
  }

  return acces.modules?.[cle.module] ?? "refus";
}

/**
 * Un lien est autorisé si son droit n'est pas refusé.
 */
export function menuAutorise(
  acces: SessionUser["acces"],
  cle: AccesMenu,
): boolean {
  return droitMenu(acces, cle) !== "refus";
}

/**
 * Un module est ouvert si le parent ou au moins un enfant est autorisé.
 */
export function moduleAutorise(
  acces: SessionUser["acces"],
  lien: LienNav,
): boolean {
  return (
    menuAutorise(acces, lien.acces) ||
    sousMenus(lien).some((enfant) => menuAutorise(acces, enfant.acces))
  );
}

/**
 * Destination du module : parent autorisé, sinon premier enfant autorisé.
 */

export function destinationModule(
  acces: SessionUser["acces"],
  lien: LienNav,
): string {
  if (menuAutorise(acces, lien.acces)) return lien.to;

  return (
    sousMenus(lien).find((enfant) =>
      menuAutorise(acces, enfant.acces),
    )?.to ?? "/app"
  );
}


/**
 * Détermine si la page courante est interdite.
 */
export function pageHorsHabilitation(
  pathname: string,
  hash: string,
  acces: SessionUser["acces"],
): boolean {
  if (!acces) return false;

  const choisi = pageCourante(pathname, hash);

  return choisi ? !menuAutorise(acces, choisi.acces) : false;
}

/**
 * Redirige vers une page autorisée du même module.
 */
export function repliHabilitation(
  pathname: string,
  hash: string,
  acces: SessionUser["acces"],
): string | null {
  if (!acces || !pageHorsHabilitation(pathname, hash, acces)) {
    return null;
  }

  const menu = menuCourant(pathname, hash);

  if (!menu) return "/app";

  const ouvert = [menu, ...sousMenus(menu)].find((item) =>
    menuAutorise(acces, item.acces),
  );

  return ouvert?.to ?? "/app";
}

const ANCRES = NAV.flatMap((section) =>
  section.liens.flatMap((lien) => [
    lien.to,
    ...(lien.enfants ?? []).map((enfant) => enfant.to),
  ]),
).filter((to) => to.includes("#"));

/**
 * Gère correctement l'état actif des liens avec ou sans ancre.
 */
export function lienActif(
  to: string,
  end: boolean | undefined,
  pathname: string,
  hash: string,
): boolean {
  const [chemin, ancre] = to.split("#");

  if (ancre) return pathname === chemin && hash === `#${ancre}`;

  if (ANCRES.includes(`${pathname}${hash}`)) return false;

  return end
    ? pathname === chemin
    : pathname === chemin || pathname.startsWith(`${chemin}/`);
}

function pageCourante(
  pathname: string,
  hash: string,
): { acces: AccesMenu; libelle: string } | null {
  const candidats: {
    to: string;
    end?: boolean;
    acces: AccesMenu;
    libelle: string;
  }[] = [];

  for (const section of NAV) {
    for (const lien of section.liens) {
      candidats.push(lien);

      for (const enfant of lien.enfants ?? []) {
        candidats.push(enfant);
      }
    }
  }

  const actifs = candidats.filter((item) =>
    lienActif(item.to, item.end, pathname, hash),
  );

  actifs.sort((a, b) => b.to.length - a.to.length);

  return actifs[0] ?? null;
}

/**
 * Retourne le libellé de la page active.
 */
export function libellePage(
  pathname: string,
  hash: string,
): string | null {
  return pageCourante(pathname, hash)?.libelle ?? null;
}

/**
 * Les enfants sont affichés uniquement s'ils sont distincts du parent.
 */
export function sousMenus(lien: LienNav): EnfantNav[] {
  const enfants = lien.enfants ?? [];

  return enfants.some((enfant) => enfant.to !== lien.to) ? enfants : [];
}

/**
 * Identifie le module correspondant à la page courante.
 */
export function menuCourant(
  pathname: string,
  hash: string,
): LienNav | null {
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
