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

/**
 * Configuration centrale de la navigation du SIGRH.
 *
 * IMPORTANT :
 * Les noms des modules et des fonctions doivent correspondre
 * aux clés des habilitations renvoyées par Django.
 */
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
        end: true,
        icone: "assignment",
        libelle: "GRH",
        resume:
          "La GRH permet d'assurer la gestion des carrières, des congés, des absences, des procédures disciplinaires, des fins de carrière, de la formation continue et de la programmation des effectifs.",
        acces: {
          module: "GRH",
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
            to: "/app/grh/gestion-carrieres",
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
            to: "/app/grh/programmation-effectifs",
            icone: "groups",
            libelle: "Programmation des effectifs",
            acces: {
              module: "GRH",
              fonction: "Programmation des effectifs",
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
 * Normalise une valeur de droit pour éviter les problèmes
 * de casse et d'espaces en début ou en fin de chaîne.
 */
function normaliserDroit(droit: unknown): string | null {
  if (typeof droit !== "string") return null;

  const valeur = droit.trim().toLowerCase();
  return valeur || null;
}

/**
 * Retourne le droit de la fonction si celui-ci est défini.
 *
 * Si le droit de la fonction n'est pas présent, le droit
 * global du module est utilisé.
 *
 * Un refus explicite au niveau de la fonction reste prioritaire.
 */
export function droitMenu(
  acces: SessionUser["acces"],
  cle: AccesMenu,
): string {
  if (!acces) return "refus";

  if (cle.fonction) {
    const cleFonction = `${cle.module}|${cle.fonction}`;
    const detail = normaliserDroit(acces.fonctions?.[cleFonction]);

    if (detail !== null) {
      return detail;
    }
  }

  const module = normaliserDroit(acces.modules?.[cle.module]);

  return module ?? "refus";
}

/**
 * Vérifie si un droit permet d'afficher un lien.
 */
export function menuAutorise(
  acces: SessionUser["acces"],
  cle: AccesMenu,
): boolean {
  const droit = droitMenu(acces, cle);

  return droit !== "refus" && droit !== "interdit";
}

/**
 * Un module est accessible si le parent ou au moins
 * un de ses enfants est accessible.
 */
export function moduleAutorise(
  acces: SessionUser["acces"],
  lien: LienNav,
): boolean {
  return (
    menuAutorise(acces, lien.acces) ||
    sousMenus(lien).some((enfant) =>
      menuAutorise(acces, enfant.acces),
    )
  );
}

/**
 * Détermine la première destination accessible du module.
 */
export function destinationModule(
  acces: SessionUser["acces"],
  lien: LienNav,
): string {
  if (menuAutorise(acces, lien.acces)) {
    return lien.to;
  }

  const enfantAutorise = sousMenus(lien).find((enfant) =>
    menuAutorise(acces, enfant.acces),
  );

  return enfantAutorise?.to ?? "/app";
}

/**
 * Recense les liens comportant une ancre.
 */
const ANCRES = NAV.flatMap((section) =>
  section.liens.flatMap((lien) => [
    lien.to,
    ...(lien.enfants ?? []).map((enfant) => enfant.to),
  ]),
).filter((to) => to.includes("#"));

/**
 * Détermine si un lien est actif.
 */
export function lienActif(
  to: string,
  end: boolean | undefined,
  pathname: string,
  hash: string,
): boolean {
  const [chemin, ancre] = to.split("#");

  if (ancre) {
    return pathname === chemin && hash === `#${ancre}`;
  }

  // Évite qu'une route sans ancre soit active lorsqu'une
  // ancre distincte est sélectionnée sur la même page.
  if (ANCRES.includes(`${pathname}${hash}`)) {
    return false;
  }

  return end
    ? pathname === chemin
    : pathname === chemin || pathname.startsWith(`${chemin}/`);
}

/**
 * Représentation commune des pages de navigation.
 */
type PageNav = {
  to: string;
  end?: boolean;
  acces: AccesMenu;
  libelle: string;
};

/**
 * Recherche la page correspondant au chemin courant.
 * La correspondance la plus précise est prioritaire.
 */
function pageCourante(
  pathname: string,
  hash: string,
): PageNav | null {
  const candidats: PageNav[] = [];

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

  actifs.sort((a, b) => {
    if (b.to.length !== a.to.length) {
      return b.to.length - a.to.length;
    }

    // En cas d'égalité, privilégie une correspondance exacte.
    const exactA = pathname === a.to ? 1 : 0;
    const exactB = pathname === b.to ? 1 : 0;

    return exactB - exactA;
  });

  return actifs[0] ?? null;
}

/**
 * Détermine si la page actuelle est hors habilitation.
 */
export function pageHorsHabilitation(
  pathname: string,
  hash: string,
  acces: SessionUser["acces"],
): boolean {
  if (!acces) return false;

  const page = pageCourante(pathname, hash);

  // Une route qui n'est pas déclarée dans NAV n'est pas
  // évaluée par cette fonction.
  return page ? !menuAutorise(acces, page.acces) : false;
}

/**
 * Propose une destination accessible dans le même module.
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

  const destination = [menu, ...sousMenus(menu)].find((item) =>
    menuAutorise(acces, item.acces),
  );

  return destination?.to ?? "/app";
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
 * Retourne les enfants distincts du lien parent.
 */
export function sousMenus(lien: LienNav): EnfantNav[] {
  const enfants = lien.enfants ?? [];

  return enfants.some((enfant) => enfant.to !== lien.to)
    ? enfants
    : [];
}

/**
 * Identifie le module correspondant à la page courante.
 */
export function menuCourant(
  pathname: string,
  hash: string,
): LienNav | null {
  let choisi: LienNav | null = null;
  let longueurMax = -1;

  for (const section of NAV) {
    for (const lien of section.liens) {
      const cibles = [lien, ...(lien.enfants ?? [])];

      for (const cible of cibles) {
        if (!lienActif(cible.to, cible.end, pathname, hash)) {
          continue;
        }

        if (cible.to.length > longueurMax) {
          longueurMax = cible.to.length;
          choisi = lien;
        }
      }
    }
  }

  return choisi;
}