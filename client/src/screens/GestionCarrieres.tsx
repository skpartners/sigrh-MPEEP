import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AppChrome } from "./AppChrome";

type Onglet =
  | "tableau"
  | "situation"
  | "discipline"
  | "conges"
  | "bilan";

type Statut =
  | "Brouillon"
  | "En attente"
  | "En cours"
  | "Approuvé"
  | "Rejeté"
  | "Exécuté";

type TypeConge =
  | "Congé annuel"
  | "Congé de maternité"
  | "Congé pour couches et allaitement"
  | "Congé de paternité"
  | "Congé de maladie courte durée"
  | "Congé de maladie longue durée"
  | "Permission spéciale d’absence"
  | "Autorisation spéciale d’absence"
  | "Permission";

type EvenementCarriere = {
  id: number;
  matricule: string;
  agent: string;
  type: string;
  date: string;
  description: string;
  statut: Statut;
};

type DossierDiscipline = {
  id: number;
  matricule: string;
  agent: string;
  objet: string;
  degre: "Premier degré" | "Second degré";
  etape: string;
  date: string;
  statut: Statut;
};

type DossierConge = {
  id: number;
  matricule: string;
  agent: string;
  type: TypeConge;
  annee: number;
  debut: string;
  fin: string;
  joursDemandes: number;
  droitsAnnuels: number;
  joursDejaPris: number;
  motif: string;
  statut: Statut;
};

const TYPES_CONGES: TypeConge[] = [
  "Congé annuel",
  "Congé de maternité",
  "Congé pour couches et allaitement",
  "Congé de paternité",
  "Congé de maladie courte durée",
  "Congé de maladie longue durée",
  "Permission spéciale d’absence",
  "Autorisation spéciale d’absence",
  "Permission",
];

const STATUTS: Statut[] = [
  "Brouillon",
  "En attente",
  "En cours",
  "Approuvé",
  "Rejeté",
  "Exécuté",
];

const SITUATIONS_INITIALES: EvenementCarriere[] = [
  {
    id: 1,
    matricule: "MPE-00124",
    agent: "Kouassi Jean-Marc",
    type: "Promotion",
    date: "2026-03-15",
    description: "Avancement de grade — dossier à vérifier",
    statut: "Approuvé",
  },
  {
    id: 2,
    matricule: "MPE-00138",
    agent: "Amani Clarisse",
    type: "Mutation",
    date: "2026-05-01",
    description: "Affectation au service des ressources humaines",
    statut: "En cours",
  },
  {
    id: 3,
    matricule: "MPE-00152",
    agent: "Yao Ibrahim",
    type: "Nomination",
    date: "2026-06-10",
    description: "Nomination à une fonction de responsabilité",
    statut: "En attente",
  },
  {
    id: 4,
    matricule: "MPE-00161",
    agent: "N'Guessan Mireille",
    type: "Position administrative",
    date: "2026-07-01",
    description: "Mise à jour de la position administrative",
    statut: "Approuvé",
  },
];

const DISCIPLINES_INITIALES: DossierDiscipline[] = [
  {
    id: 1,
    matricule: "MPE-00138",
    agent: "Amani Clarisse",
    objet: "Demande d’explication",
    degre: "Premier degré",
    etape: "Transmission de la demande",
    date: "2026-09-08",
    statut: "En attente",
  },
  {
    id: 2,
    matricule: "MPE-00152",
    agent: "Yao Ibrahim",
    objet: "Instruction devant le conseil de discipline",
    degre: "Second degré",
    etape: "Instruction du dossier",
    date: "2026-09-15",
    statut: "En cours",
  },
];

const CONGES_INITIAUX: DossierConge[] = [
  {
    id: 1,
    matricule: "MPE-00124",
    agent: "Kouassi Jean-Marc",
    type: "Congé annuel",
    annee: 2026,
    debut: "2026-11-02",
    fin: "2026-11-11",
    joursDemandes: 10,
    droitsAnnuels: 30,
    joursDejaPris: 5,
    motif: "Congé annuel",
    statut: "En attente",
  },
  {
    id: 2,
    matricule: "MPE-00138",
    agent: "Amani Clarisse",
    type: "Congé de maternité",
    annee: 2026,
    debut: "2026-10-20",
    fin: "2026-12-31",
    joursDemandes: 0,
    droitsAnnuels: 0,
    joursDejaPris: 0,
    motif: "Demande de congé de maternité",
    statut: "En cours",
  },
  {
    id: 3,
    matricule: "MPE-00161",
    agent: "N'Guessan Mireille",
    type: "Permission spéciale d’absence",
    annee: 2026,
    debut: "2026-10-19",
    fin: "2026-10-20",
    joursDemandes: 2,
    droitsAnnuels: 0,
    joursDejaPris: 0,
    motif: "Événement familial",
    statut: "Approuvé",
  },
];

const formatDate = (date: string) => {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(
    new Date(`${date}T12:00:00`)
  );
};

const joursEntre = (debut: string, fin: string) => {
  if (!debut || !fin) return 0;
  const d1 = new Date(`${debut}T12:00:00`);
  const d2 = new Date(`${fin}T12:00:00`);
  if (d2 < d1) return 0;
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
};

const soldeAnnuel = (conge: DossierConge) =>
  Math.max(
    0,
    conge.droitsAnnuels -
      conge.joursDejaPris -
      (conge.statut === "Approuvé" ? conge.joursDemandes : 0)
  );

const statutClasse = (statut: Statut) => {
  switch (statut) {
    case "Approuvé":
    case "Exécuté":
      return "gc-badge gc-green";
    case "Rejeté":
      return "gc-badge gc-red";
    case "En cours":
      return "gc-badge gc-blue";
    case "En attente":
      return "gc-badge gc-orange";
    default:
      return "gc-badge gc-gray";
  }
};

const initialForm = {
  matricule: "",
  agent: "",
  type: "Congé annuel" as TypeConge,
  annee: new Date().getFullYear(),
  debut: "",
  fin: "",
  joursDemandes: 0,
  droitsAnnuels: 30,
  joursDejaPris: 0,
  motif: "",
};

export default function GestionCarrieres() {
  const [onglet, setOnglet] = useState<Onglet>("tableau");
  const [situations, setSituations] =
    useState<EvenementCarriere[]>(SITUATIONS_INITIALES);
  const [disciplines, setDisciplines] =
    useState<DossierDiscipline[]>(DISCIPLINES_INITIALES);
  const [conges, setConges] =
    useState<DossierConge[]>(CONGES_INITIAUX);

  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("Tous");
  const [filtreAnnee, setFiltreAnnee] = useState(
    String(new Date().getFullYear())
  );

  const [modalOuvert, setModalOuvert] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [erreur, setErreur] = useState("");

  const [formSituation, setFormSituation] = useState({
    matricule: "",
    agent: "",
    type: "Promotion",
    date: "",
    description: "",
  });

  const [formDiscipline, setFormDiscipline] = useState({
    matricule: "",
    agent: "",
    objet: "Demande d’explication",
    degre: "Premier degré" as DossierDiscipline["degre"],
    etape: "Demande d’explication",
    date: "",
  });

  const congesFiltres = useMemo(() => {
    const q = recherche.toLowerCase().trim();

    return conges.filter((c) => {
      const correspondRecherche =
        !q ||
        c.agent.toLowerCase().includes(q) ||
        c.matricule.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.motif.toLowerCase().includes(q);

      const correspondStatut =
        filtreStatut === "Tous" || c.statut === filtreStatut;

      const correspondAnnee =
        filtreAnnee === "Toutes" || String(c.annee) === filtreAnnee;

      return (
        correspondRecherche && correspondStatut && correspondAnnee
      );
    });
  }, [conges, recherche, filtreStatut, filtreAnnee]);

  const situationsFiltrees = useMemo(() => {
    const q = recherche.toLowerCase().trim();

    return situations.filter(
      (s) =>
        (!q ||
          s.agent.toLowerCase().includes(q) ||
          s.matricule.toLowerCase().includes(q) ||
          s.type.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)) &&
        (filtreStatut === "Tous" || s.statut === filtreStatut)
    );
  }, [situations, recherche, filtreStatut]);

  const disciplinesFiltrees = useMemo(() => {
    const q = recherche.toLowerCase().trim();

    return disciplines.filter(
      (d) =>
        (!q ||
          d.agent.toLowerCase().includes(q) ||
          d.matricule.toLowerCase().includes(q) ||
          d.objet.toLowerCase().includes(q)) &&
        (filtreStatut === "Tous" || d.statut === filtreStatut)
    );
  }, [disciplines, recherche, filtreStatut]);

  const demandesEnAttente =
    conges.filter((c) => c.statut === "En attente").length +
    situations.filter((s) => s.statut === "En attente").length +
    disciplines.filter((d) => d.statut === "En attente").length;

  const congesEnCours = conges.filter(
    (c) => c.statut === "En cours"
  ).length;

  const proceduresOuvertes = disciplines.filter(
    (d) => d.statut === "En attente" || d.statut === "En cours"
  ).length;

  const mouvementsValides = situations.filter(
    (s) => s.statut === "Approuvé" || s.statut === "Exécuté"
  ).length;

  const totalDemandesConges = conges.length;

  const ouvrirNouvelleDemande = () => {
    setErreur("");
    setForm(initialForm);
    setModalOuvert(true);
  };

  const enregistrerConge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErreur("");

    if (!form.matricule.trim() || !form.agent.trim()) {
      setErreur("Renseignez le matricule et le nom de l’agent.");
      return;
    }

    if (!form.debut || !form.fin || form.fin < form.debut) {
      setErreur("Vérifiez les dates de début et de fin.");
      return;
    }

    const duree = joursEntre(form.debut, form.fin);
    const jours = form.type === "Congé annuel" ? duree : form.joursDemandes;

    if (form.type === "Congé annuel" && jours > form.droitsAnnuels - form.joursDejaPris) {
      setErreur(
        "La durée demandée dépasse le solde annuel disponible renseigné."
      );
      return;
    }

    const nouveau: DossierConge = {
      id: Date.now(),
      matricule: form.matricule.trim(),
      agent: form.agent.trim(),
      type: form.type,
      annee: Number(form.annee),
      debut: form.debut,
      fin: form.fin,
      joursDemandes: jours,
      droitsAnnuels: Number(form.droitsAnnuels),
      joursDejaPris: Number(form.joursDejaPris),
      motif: form.motif.trim() || form.type,
      statut: "En attente",
    };

    setConges((precedents) => [nouveau, ...precedents]);
    setModalOuvert(false);
    setOnglet("conges");
    setRecherche("");
    setFiltreStatut("Tous");
    setFiltreAnnee("Toutes");
  };

  const modifierStatutConge = (id: number, statut: Statut) => {
    setConges((precedents) =>
      precedents.map((c) => (c.id === id ? { ...c, statut } : c))
    );
  };

  const supprimerConge = (id: number) => {
    if (!window.confirm("Supprimer cette demande de congé de la démonstration ?")) {
      return;
    }
    setConges((precedents) => precedents.filter((c) => c.id !== id));
  };

  const enregistrerSituation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !formSituation.matricule.trim() ||
      !formSituation.agent.trim() ||
      !formSituation.date
    ) {
      window.alert("Renseignez le matricule, le nom et la date.");
      return;
    }

    const nouveau: EvenementCarriere = {
      id: Date.now(),
      ...formSituation,
      statut: "En attente",
    };

    setSituations((precedents) => [nouveau, ...precedents]);
    setFormSituation({
      matricule: "",
      agent: "",
      type: "Promotion",
      date: "",
      description: "",
    });
  };

  const enregistrerDiscipline = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !formDiscipline.matricule.trim() ||
      !formDiscipline.agent.trim() ||
      !formDiscipline.date
    ) {
      window.alert("Renseignez le matricule, le nom et la date.");
      return;
    }

    const nouveau: DossierDiscipline = {
      id: Date.now(),
      ...formDiscipline,
      statut: "En attente",
    };

    setDisciplines((precedents) => [nouveau, ...precedents]);
    setFormDiscipline({
      matricule: "",
      agent: "",
      objet: "Demande d’explication",
      degre: "Premier degré",
      etape: "Demande d’explication",
      date: "",
    });
  };

  const exporterBilan = () => {
    const lignes = [
      "BILAN DE LA GESTION DES CARRIERES",
      `Date d'edition : ${formatDate(new Date().toISOString().slice(0, 10))}`,
      "",
      `Mouvements de carrière enregistrés : ${situations.length}`,
      `Mouvements approuvés ou exécutés : ${mouvementsValides}`,
      `Dossiers disciplinaires : ${disciplines.length}`,
      `Procédures disciplinaires ouvertes : ${proceduresOuvertes}`,
      `Demandes de congés et absences : ${totalDemandesConges}`,
      `Congés en cours : ${congesEnCours}`,
      `Demandes en attente : ${demandesEnAttente}`,
      "",
      "DEMANDES DE CONGES ET ABSENCES",
      ...conges.map(
        (c) =>
          `${c.matricule};${c.agent};${c.type};${c.debut};${c.fin};${c.joursDemandes};${c.statut}`
      ),
      "",
      "MOUVEMENTS DE CARRIERE",
      ...situations.map(
        (s) =>
          `${s.matricule};${s.agent};${s.type};${s.date};${s.statut}`
      ),
      "",
      "DOSSIERS DISCIPLINAIRES",
      ...disciplines.map(
        (d) =>
          `${d.matricule};${d.agent};${d.objet};${d.degre};${d.etape};${d.statut}`
      ),
    ];

    const blob = new Blob(
      ["\uFEFF" + lignes.join("\r\n")],
      { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "bilan-gestion-carrieres.csv";
    lien.click();
    URL.revokeObjectURL(url);
  };

  const onglets: { id: Onglet; titre: string; icone: string }[] = [
    { id: "tableau", titre: "Vue d’ensemble", icone: "▦" },
    { id: "situation", titre: "Situation administrative", icone: "↗" },
    { id: "discipline", titre: "Discipline", icone: "⚖" },
    { id: "conges", titre: "Congés et absences", icone: "▣" },
    { id: "bilan", titre: "Bilan de carrière", icone: "▤" },
  ];

  return (
    <AppChrome>
      <div className="gc-page">
        <style>{`
          .gc-page{--gc-primary:#153e70;--gc-primary2:#1f568f;--gc-ink:#172b43;--gc-muted:#64748b;--gc-line:#e1e8f0;--gc-bg:#f4f7fb;color:var(--gc-ink);font-family:inherit;padding:24px;background:var(--gc-bg);min-height:100vh}
          .gc-page *{box-sizing:border-box}
          .gc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:22px}
          .gc-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;color:var(--gc-primary2);margin-bottom:8px}
          .gc-title{font-size:27px;line-height:1.2;font-weight:800;letter-spacing:-.6px;margin:0 0 8px;color:#132c4c}
          .gc-subtitle{font-size:13px;line-height:1.65;color:var(--gc-muted);max-width:700px;margin:0}
          .gc-actions{display:flex;gap:9px;flex-wrap:wrap}
          .gc-btn{border:1px solid #d4dfeb;background:white;color:#244261;border-radius:9px;padding:10px 13px;font-size:12px;font-weight:750;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}
          .gc-btn:hover{filter:brightness(.97)}
          .gc-btn-primary{background:var(--gc-primary);border-color:var(--gc-primary);color:white}
          .gc-btn:disabled{opacity:.5;cursor:not-allowed}
          .gc-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:20px}
          .gc-kpi{background:white;border:1px solid var(--gc-line);border-radius:13px;padding:17px;min-width:0}
          .gc-kpi-top{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--gc-muted);font-size:12px;font-weight:650}
          .gc-kpi-icon{width:35px;height:35px;display:grid;place-items:center;border-radius:10px;background:#edf4fc;color:var(--gc-primary);font-size:17px}
          .gc-kpi-value{font-size:28px;font-weight:850;letter-spacing:-.7px;margin:12px 0 5px;color:#142e4e}
          .gc-kpi-foot{font-size:11px;color:#718096}
          .gc-tabs{display:flex;gap:5px;overflow-x:auto;background:white;padding:7px;border:1px solid var(--gc-line);border-radius:12px;margin-bottom:18px}
          .gc-tab{white-space:nowrap;border:0;background:transparent;color:#64748b;padding:11px 14px;border-radius:8px;font-size:12px;font-weight:750;cursor:pointer}
          .gc-tab.active{background:#eaf1fa;color:#163f70}
          .gc-panel{background:white;border:1px solid var(--gc-line);border-radius:13px;margin-bottom:18px;overflow:hidden}
          .gc-panel-head{padding:18px 20px;border-bottom:1px solid var(--gc-line);display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
          .gc-panel-title{font-size:15px;font-weight:800;margin:0 0 5px;color:#183451}
          .gc-panel-desc{font-size:12px;color:var(--gc-muted);margin:0;line-height:1.5}
          .gc-panel-body{padding:19px 20px}
          .gc-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
          .gc-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
          .gc-shortcut{padding:17px;border:1px solid var(--gc-line);border-radius:11px;text-align:left;background:white;cursor:pointer;color:inherit}
          .gc-shortcut:hover{border-color:#a8c1df;background:#fbfdff}
          .gc-shortcut-icon{width:38px;height:38px;border-radius:10px;background:#edf4fc;display:grid;place-items:center;color:var(--gc-primary);font-size:18px;margin-bottom:12px}
          .gc-shortcut strong{display:block;font-size:13px;margin-bottom:6px}
          .gc-shortcut span{font-size:11px;color:var(--gc-muted);line-height:1.5;display:block}
          .gc-filterbar{padding:14px 18px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--gc-line);align-items:center}
          .gc-input,.gc-select,.gc-textarea{width:100%;border:1px solid #d7e0ea;border-radius:8px;padding:10px 11px;background:white;color:#233c56;font:inherit;font-size:12px;min-width:0}
          .gc-input:focus,.gc-select:focus,.gc-textarea:focus{outline:2px solid #c7dcf4;border-color:#7ca5d4}
          .gc-search{flex:1;min-width:190px}
          .gc-filter{width:170px}
          .gc-table-wrap{overflow-x:auto}
          .gc-table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}
          .gc-table th{font-size:10px;letter-spacing:.45px;text-transform:uppercase;color:#708197;background:#f8fafc;padding:12px 16px;border-bottom:1px solid var(--gc-line)}
          .gc-table td{font-size:12px;padding:14px 16px;border-bottom:1px solid #edf1f5;vertical-align:middle}
          .gc-table tr:last-child td{border-bottom:0}
          .gc-table tbody tr:hover{background:#fbfdff}
          .gc-agent{font-weight:750;color:#203b59}
          .gc-subcell{font-size:10px;color:#8390a1;margin-top:4px}
          .gc-badge{display:inline-flex;align-items:center;border-radius:30px;padding:5px 8px;font-size:10px;font-weight:800}
          .gc-green{background:#e6f6ed;color:#197247}.gc-red{background:#fdeaea;color:#a52a2a}.gc-blue{background:#e7f0ff;color:#285a9c}.gc-orange{background:#fff1dc;color:#935a0b}.gc-gray{background:#eef1f5;color:#5d6c7d}
          .gc-linkbtn{border:0;background:transparent;color:#285b94;font-weight:800;font-size:11px;cursor:pointer;padding:5px}
          .gc-empty{text-align:center;padding:32px 15px;color:var(--gc-muted);font-size:12px}
          .gc-note{padding:12px 14px;background:#f5f8fc;border:1px solid #e1e9f3;border-radius:9px;color:#596d84;font-size:11px;line-height:1.65}
          .gc-formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
          .gc-field label{display:block;font-size:11px;font-weight:750;color:#425872;margin-bottom:6px}
          .gc-field.full{grid-column:1/-1}
          .gc-metric{border:1px solid var(--gc-line);border-radius:10px;padding:14px}
          .gc-metric-label{font-size:11px;color:var(--gc-muted)}
          .gc-metric-value{font-size:22px;font-weight:850;margin-top:7px;color:#1a416e}
          .gc-progress{height:7px;background:#e9eef5;border-radius:20px;overflow:hidden;margin-top:10px}
          .gc-progress>span{display:block;height:100%;background:#2c659f;border-radius:20px}
          .gc-modal-backdrop{position:fixed;inset:0;background:rgba(13,29,49,.48);z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px}
          .gc-modal{background:white;border-radius:14px;width:min(650px,100%);max-height:90vh;overflow-y:auto;box-shadow:0 20px 65px rgba(0,0,0,.2)}
          .gc-modal-head{padding:19px 22px;border-bottom:1px solid var(--gc-line);display:flex;justify-content:space-between;align-items:center;gap:12px}
          .gc-modal-head h3{font-size:16px;margin:0}
          .gc-modal-body{padding:20px 22px}
          .gc-modal-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}
          .gc-error{background:#fff0f0;border:1px solid #f3c5c5;color:#a42626;padding:10px;border-radius:8px;font-size:12px;margin-bottom:14px}
          @media(max-width:950px){.gc-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.gc-grid3{grid-template-columns:repeat(2,minmax(0,1fr))}.gc-top{flex-direction:column}}
          @media(max-width:600px){.gc-page{padding:13px}.gc-kpis,.gc-grid2,.gc-grid3,.gc-formgrid{grid-template-columns:1fr}.gc-field.full{grid-column:auto}.gc-panel-head{padding:15px;flex-direction:column}.gc-panel-body{padding:14px}.gc-title{font-size:23px}.gc-kpi{padding:13px}}
        `}</style>

        <header className="gc-top">
          <div>
            <div className="gc-eyebrow">SIGRH · Ressources humaines</div>
            <h1 className="gc-title">Gestion des carrières</h1>
            <p className="gc-subtitle">
              Pilotez les parcours professionnels, les procédures
              disciplinaires, les congés et les absences des agents dans
              un espace RH centralisé.
            </p>
          </div>

          <div className="gc-actions">
            <button className="gc-btn" onClick={exporterBilan}>
              ↓ Exporter le bilan
            </button>
            <button
              className="gc-btn gc-btn-primary"
              onClick={ouvrirNouvelleDemande}
            >
              + Nouvelle demande
            </button>
          </div>
        </header>

        <section className="gc-kpis">
          <div className="gc-kpi">
            <div className="gc-kpi-top">
              Mouvements de carrière
              <span className="gc-kpi-icon">↗</span>
            </div>
            <div className="gc-kpi-value">{situations.length}</div>
            <div className="gc-kpi-foot">
              {mouvementsValides} approuvés ou exécutés
            </div>
          </div>

          <div className="gc-kpi">
            <div className="gc-kpi-top">
              Congés en cours
              <span className="gc-kpi-icon">▣</span>
            </div>
            <div className="gc-kpi-value">{congesEnCours}</div>
            <div className="gc-kpi-foot">
              Congés et absences en traitement
            </div>
          </div>

          <div className="gc-kpi">
            <div className="gc-kpi-top">
              Procédures disciplinaires
              <span className="gc-kpi-icon">⚖</span>
            </div>
            <div className="gc-kpi-value">{proceduresOuvertes}</div>
            <div className="gc-kpi-foot">
              Dossiers ouverts ou en instruction
            </div>
          </div>

          <div className="gc-kpi">
            <div className="gc-kpi-top">
              Actions en attente
              <span className="gc-kpi-icon">◷</span>
            </div>
            <div className="gc-kpi-value">{demandesEnAttente}</div>
            <div className="gc-kpi-foot">
              Éléments nécessitant un traitement RH
            </div>
          </div>
        </section>

        <nav className="gc-tabs" aria-label="Rubriques de gestion des carrières">
          {onglets.map((item) => (
            <button
              key={item.id}
              className={`gc-tab ${onglet === item.id ? "active" : ""}`}
              onClick={() => setOnglet(item.id)}
            >
              <span style={{ marginRight: 7 }}>{item.icone}</span>
              {item.titre}
            </button>
          ))}
        </nav>

        {onglet === "tableau" && (
          <>
            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Espace de pilotage RH</h2>
                  <p className="gc-panel-desc">
                    Accédez aux principaux processus de la gestion des carrières.
                  </p>
                </div>
              </div>
              <div className="gc-panel-body">
                <div className="gc-grid3">
                  <button
                    className="gc-shortcut"
                    onClick={() => setOnglet("situation")}
                  >
                    <div className="gc-shortcut-icon">↗</div>
                    <strong>Situation administrative</strong>
                    <span>
                      Positions, nominations, promotions, mutations et
                      historique professionnel.
                    </span>
                  </button>
                  <button
                    className="gc-shortcut"
                    onClick={() => setOnglet("discipline")}
                  >
                    <div className="gc-shortcut-icon">⚖</div>
                    <strong>Procédures disciplinaires</strong>
                    <span>
                      Demandes d’explication, instruction, décisions et
                      suivi de l’exécution.
                    </span>
                  </button>
                  <button
                    className="gc-shortcut"
                    onClick={() => setOnglet("conges")}
                  >
                    <div className="gc-shortcut-icon">▣</div>
                    <strong>Congés et absences</strong>
                    <span>
                      Soldes annuels, périodes d’absence, demandes et
                      validation administrative.
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Derniers mouvements de carrière</h2>
                  <p className="gc-panel-desc">
                    Vue synthétique des opérations enregistrées.
                  </p>
                </div>
                <button
                  className="gc-btn"
                  onClick={() => setOnglet("situation")}
                >
                  Tout afficher →
                </button>
              </div>
              <div className="gc-table-wrap">
                <table className="gc-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Opération</th>
                      <th>Date d’effet</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {situations.slice(0, 4).map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="gc-agent">{s.agent}</div>
                          <div className="gc-subcell">{s.matricule}</div>
                        </td>
                        <td>{s.type}</td>
                        <td>{formatDate(s.date)}</td>
                        <td>
                          <span className={statutClasse(s.statut)}>
                            {s.statut}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Demandes récentes de congés et absences</h2>
                  <p className="gc-panel-desc">
                    Les demandes sont affichées à titre de démonstration.
                  </p>
                </div>
                <button
                  className="gc-btn"
                  onClick={() => setOnglet("conges")}
                >
                  Consulter les demandes →
                </button>
              </div>
              <div className="gc-table-wrap">
                <table className="gc-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type</th>
                      <th>Période</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conges.slice(0, 4).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="gc-agent">{c.agent}</div>
                          <div className="gc-subcell">{c.matricule}</div>
                        </td>
                        <td>{c.type}</td>
                        <td>
                          {formatDate(c.debut)} — {formatDate(c.fin)}
                        </td>
                        <td>
                          <span className={statutClasse(c.statut)}>
                            {c.statut}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {onglet === "situation" && (
          <>
            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Situation administrative</h2>
                  <p className="gc-panel-desc">
                    Suivi des mouvements et des événements du parcours
                    professionnel des agents.
                  </p>
                </div>
              </div>

              <div className="gc-panel-body">
                <form onSubmit={enregistrerSituation}>
                  <div className="gc-formgrid">
                    <div className="gc-field">
                      <label>Matricule de l’agent *</label>
                      <input
                        className="gc-input"
                        value={formSituation.matricule}
                        onChange={(e) =>
                          setFormSituation({
                            ...formSituation,
                            matricule: e.target.value,
                          })
                        }
                        placeholder="Ex. MPE-00170"
                        required
                      />
                    </div>
                    <div className="gc-field">
                      <label>Nom et prénoms *</label>
                      <input
                        className="gc-input"
                        value={formSituation.agent}
                        onChange={(e) =>
                          setFormSituation({
                            ...formSituation,
                            agent: e.target.value,
                          })
                        }
                        placeholder="Nom complet"
                        required
                      />
                    </div>
                    <div className="gc-field">
                      <label>Type d’opération *</label>
                      <select
                        className="gc-select"
                        value={formSituation.type}
                        onChange={(e) =>
                          setFormSituation({
                            ...formSituation,
                            type: e.target.value,
                          })
                        }
                      >
                        <option>Position administrative</option>
                        <option>Nomination</option>
                        <option>Promotion</option>
                        <option>Mutation</option>
                        <option>Avancement</option>
                        <option>Détachement</option>
                        <option>Disponibilité</option>
                        <option>Réintégration</option>
                        <option>Autre</option>
                      </select>
                    </div>
                    <div className="gc-field">
                      <label>Date d’effet ou de référence *</label>
                      <input
                        className="gc-input"
                        type="date"
                        value={formSituation.date}
                        onChange={(e) =>
                          setFormSituation({
                            ...formSituation,
                            date: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="gc-field full">
                      <label>Description / référence administrative</label>
                      <input
                        className="gc-input"
                        value={formSituation.description}
                        onChange={(e) =>
                          setFormSituation({
                            ...formSituation,
                            description: e.target.value,
                          })
                        }
                        placeholder="Décision, arrêté, service d’affectation…"
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 13 }}>
                    <button className="gc-btn gc-btn-primary" type="submit">
                      + Enregistrer le mouvement
                    </button>
                  </div>
                </form>
              </div>

              <div className="gc-filterbar">
                <input
                  className="gc-input gc-search"
                  placeholder="Rechercher un agent, un matricule ou une opération…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
                <select
                  className="gc-select gc-filter"
                  value={filtreStatut}
                  onChange={(e) => setFiltreStatut(e.target.value)}
                >
                  <option value="Tous">Tous les statuts</option>
                  {STATUTS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="gc-table-wrap">
                <table className="gc-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Opération</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Statut / action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {situationsFiltrees.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="gc-agent">{s.agent}</div>
                          <div className="gc-subcell">{s.matricule}</div>
                        </td>
                        <td>{s.type}</td>
                        <td>{formatDate(s.date)}</td>
                        <td>{s.description || "—"}</td>
                        <td>
                          <span className={statutClasse(s.statut)}>
                            {s.statut}
                          </span>
                          <select
                            className="gc-select"
                            style={{ marginTop: 7, minWidth: 125 }}
                            value={s.statut}
                            aria-label={`Modifier le statut de ${s.agent}`}
                            onChange={(e) =>
                              setSituations((prev) =>
                                prev.map((item) =>
                                  item.id === s.id
                                    ? { ...item, statut: e.target.value as Statut }
                                    : item
                                )
                              )
                            }
                          >
                            {STATUTS.map((st) => (
                              <option key={st}>{st}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                    {situationsFiltrees.length === 0 && (
                      <tr><td colSpan={5} className="gc-empty">Aucun mouvement trouvé.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {onglet === "discipline" && (
          <section className="gc-panel">
            <div className="gc-panel-head">
              <div>
                <h2 className="gc-panel-title">Suivi des procédures disciplinaires</h2>
                <p className="gc-panel-desc">
                  Traçabilité des étapes : demande d’explication, instruction,
                  décision et exécution.
                </p>
              </div>
            </div>

            <div className="gc-panel-body">
              <form onSubmit={enregistrerDiscipline}>
                <div className="gc-formgrid">
                  <div className="gc-field">
                    <label>Matricule *</label>
                    <input
                      className="gc-input"
                      value={formDiscipline.matricule}
                      onChange={(e) =>
                        setFormDiscipline({
                          ...formDiscipline,
                          matricule: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="gc-field">
                    <label>Nom et prénoms *</label>
                    <input
                      className="gc-input"
                      value={formDiscipline.agent}
                      onChange={(e) =>
                        setFormDiscipline({
                          ...formDiscipline,
                          agent: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="gc-field">
                    <label>Type de dossier</label>
                    <select
                      className="gc-select"
                      value={formDiscipline.objet}
                      onChange={(e) =>
                        setFormDiscipline({
                          ...formDiscipline,
                          objet: e.target.value,
                        })
                      }
                    >
                      <option>Demande d’explication</option>
                      <option>Instruction devant le conseil de discipline</option>
                      <option>Décision disciplinaire</option>
                      <option>Exécution de la décision</option>
                    </select>
                  </div>
                  <div className="gc-field">
                    <label>Degré de procédure</label>
                    <select
                      className="gc-select"
                      value={formDiscipline.degre}
                      onChange={(e) =>
                        setFormDiscipline({
                          ...formDiscipline,
                          degre: e.target.value as DossierDiscipline["degre"],
                        })
                      }
                    >
                      <option>Premier degré</option>
                      <option>Second degré</option>
                    </select>
                  </div>
                  <div className="gc-field">
                    <label>Étape actuelle</label>
                    <select
                      className="gc-select"
                      value={formDiscipline.etape}
                      onChange={(e) =>
                        setFormDiscipline({
                          ...formDiscipline,
                          etape: e.target.value,
                        })
                      }
                    >
                      <option>Demande d’explication</option>
                      <option>Réponse de l’agent</option>
                      <option>Instruction du dossier</option>
                      <option>Conseil de discipline</option>
                      <option>Décision à notifier</option>
                      <option>Exécution de la décision</option>
                      <option>Clôture du dossier</option>
                    </select>
                  </div>
                  <div className="gc-field">
                    <label>Date d’ouverture *</label>
                    <input
                      className="gc-input"
                      type="date"
                      value={formDiscipline.date}
                      onChange={(e) =>
                        setFormDiscipline({
                          ...formDiscipline,
                          date: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 13 }}>
                  <button className="gc-btn gc-btn-primary" type="submit">
                    + Ouvrir un dossier
                  </button>
                </div>
              </form>

              <div className="gc-note" style={{ marginTop: 16 }}>
                Les dossiers disciplinaires contiennent des informations
                confidentielles. Dans la version connectée, leur consultation,
                modification et exportation devront être limités aux rôles RH
                et autorités habilités.
              </div>
            </div>

            <div className="gc-filterbar">
              <input
                className="gc-input gc-search"
                placeholder="Rechercher un agent ou un dossier…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
              <select
                className="gc-select gc-filter"
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
              >
                <option value="Tous">Tous les statuts</option>
                {STATUTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div className="gc-table-wrap">
              <table className="gc-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Objet du dossier</th>
                    <th>Degré</th>
                    <th>Étape actuelle</th>
                    <th>Date</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {disciplinesFiltrees.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="gc-agent">{d.agent}</div>
                        <div className="gc-subcell">{d.matricule}</div>
                      </td>
                      <td>{d.objet}</td>
                      <td>{d.degre}</td>
                      <td>{d.etape}</td>
                      <td>{formatDate(d.date)}</td>
                      <td>
                        <select
                          className="gc-select"
                          value={d.statut}
                          onChange={(e) =>
                            setDisciplines((prev) =>
                              prev.map((item) =>
                                item.id === d.id
                                  ? { ...item, statut: e.target.value as Statut }
                                  : item
                              )
                            )
                          }
                        >
                          {STATUTS.map((st) => (
                            <option key={st}>{st}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {disciplinesFiltrees.length === 0 && (
                    <tr><td colSpan={6} className="gc-empty">Aucun dossier disciplinaire trouvé.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {onglet === "conges" && (
          <>
            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Gestion des congés et absences</h2>
                  <p className="gc-panel-desc">
                    Suivi des droits, périodes demandées, soldes annuels et
                    circuits de validation.
                  </p>
                </div>
                <button
                  className="gc-btn gc-btn-primary"
                  onClick={ouvrirNouvelleDemande}
                >
                  + Nouvelle demande
                </button>
              </div>

              <div className="gc-panel-body">
                <div className="gc-note">
                  <strong>Règle de calcul du congé annuel :</strong> le solde
                  affiché est égal aux droits annuels renseignés, diminués des
                  jours déjà pris et, lorsqu’une demande est approuvée, des
                  jours de cette demande. Vérifiez les règles de décompte
                  appliquées par votre administration avant la mise en
                  production. Les durées des autres congés sont à valider
                  selon les textes applicables et le dossier individuel.
                </div>
              </div>

              <div className="gc-filterbar">
                <input
                  className="gc-input gc-search"
                  placeholder="Rechercher un agent, matricule, congé ou motif…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
                <select
                  className="gc-select gc-filter"
                  value={filtreAnnee}
                  onChange={(e) => setFiltreAnnee(e.target.value)}
                >
                  <option value="Toutes">Toutes les années</option>
                  {Array.from(new Set(conges.map((c) => c.annee)))
                    .sort((a, b) => b - a)
                    .map((a) => <option key={a}>{a}</option>)}
                </select>
                <select
                  className="gc-select gc-filter"
                  value={filtreStatut}
                  onChange={(e) => setFiltreStatut(e.target.value)}
                >
                  <option value="Tous">Tous les statuts</option>
                  {STATUTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>

              <div className="gc-table-wrap">
                <table className="gc-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Type</th>
                      <th>Année</th>
                      <th>Début</th>
                      <th>Fin</th>
                      <th>Jours demandés</th>
                      <th>Solde annuel*</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {congesFiltres.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="gc-agent">{c.agent}</div>
                          <div className="gc-subcell">{c.matricule}</div>
                        </td>
                        <td>{c.type}</td>
                        <td>{c.annee}</td>
                        <td>{formatDate(c.debut)}</td>
                        <td>{formatDate(c.fin)}</td>
                        <td>
                          {c.type === "Congé annuel"
                            ? joursEntre(c.debut, c.fin)
                            : c.joursDemandes || "À confirmer"}
                        </td>
                        <td>
                          {c.type === "Congé annuel"
                            ? `${soldeAnnuel(c)} j`
                            : "—"}
                        </td>
                        <td>
                          <span className={statutClasse(c.statut)}>
                            {c.statut}
                          </span>
                        </td>
                        <td>
                          {c.statut === "En attente" && (
                            <>
                              <button
                                className="gc-linkbtn"
                                onClick={() => modifierStatutConge(c.id, "Approuvé")}
                              >
                                Approuver
                              </button>
                              <button
                                className="gc-linkbtn"
                                style={{ color: "#a52a2a" }}
                                onClick={() => modifierStatutConge(c.id, "Rejeté")}
                              >
                                Rejeter
                              </button>
                            </>
                          )}
                          {c.statut === "Approuvé" && (
                            <button
                              className="gc-linkbtn"
                              onClick={() => modifierStatutConge(c.id, "Exécuté")}
                            >
                              Marquer exécuté
                            </button>
                          )}
                          <button
                            className="gc-linkbtn"
                            style={{ color: "#8b4b4b" }}
                            onClick={() => supprimerConge(c.id)}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                    {congesFiltres.length === 0 && (
                      <tr><td colSpan={9} className="gc-empty">Aucune demande correspondant aux filtres.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "12px 18px", color: "#718096", fontSize: 10 }}>
                * Le solde annuel est indicatif et concerne uniquement les demandes de congé annuel.
              </div>
            </section>
          </>
        )}

        {onglet === "bilan" && (
          <>
            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Bilan de la gestion des carrières</h2>
                  <p className="gc-panel-desc">
                    Indicateurs synthétiques calculés à partir des données
                    présentes dans cette démonstration.
                  </p>
                </div>
                <button className="gc-btn gc-btn-primary" onClick={exporterBilan}>
                  ↓ Exporter en CSV
                </button>
              </div>

              <div className="gc-panel-body">
                <div className="gc-grid3">
                  <div className="gc-metric">
                    <div className="gc-metric-label">Mouvements administratifs</div>
                    <div className="gc-metric-value">{situations.length}</div>
                    <div className="gc-progress">
                      <span style={{ width: `${situations.length ? (mouvementsValides / situations.length) * 100 : 0}%` }} />
                    </div>
                    <div className="gc-subcell">{mouvementsValides} validés ou exécutés</div>
                  </div>
                  <div className="gc-metric">
                    <div className="gc-metric-label">Congés et absences</div>
                    <div className="gc-metric-value">{conges.length}</div>
                    <div className="gc-progress">
                      <span style={{ width: `${conges.length ? (conges.filter((c) => c.statut === "Approuvé" || c.statut === "Exécuté").length / conges.length) * 100 : 0}%` }} />
                    </div>
                    <div className="gc-subcell">
                      {conges.filter((c) => c.statut === "Approuvé" || c.statut === "Exécuté").length} approuvés ou exécutés
                    </div>
                  </div>
                  <div className="gc-metric">
                    <div className="gc-metric-label">Dossiers disciplinaires</div>
                    <div className="gc-metric-value">{disciplines.length}</div>
                    <div className="gc-progress">
                      <span style={{ width: `${disciplines.length ? (proceduresOuvertes / disciplines.length) * 100 : 0}%` }} />
                    </div>
                    <div className="gc-subcell">{proceduresOuvertes} procédures ouvertes</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Répartition des congés et absences</h2>
                  <p className="gc-panel-desc">
                    Nombre de demandes par catégorie.
                  </p>
                </div>
              </div>
              <div className="gc-panel-body">
                {TYPES_CONGES.map((type) => {
                  const nombre = conges.filter((c) => c.type === type).length;
                  const maximum = Math.max(1, ...TYPES_CONGES.map(
                    (t) => conges.filter((c) => c.type === t).length
                  ));
                  return (
                    <div key={type} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, marginBottom: 6 }}>
                        <span>{type}</span>
                        <strong>{nombre}</strong>
                      </div>
                      <div className="gc-progress">
                        <span style={{ width: `${(nombre / maximum) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="gc-panel">
              <div className="gc-panel-head">
                <div>
                  <h2 className="gc-panel-title">Points de suivi RH</h2>
                  <p className="gc-panel-desc">
                    Éléments à examiner pour préparer le rapport de gestion.
                  </p>
                </div>
              </div>
              <div className="gc-panel-body">
                <div className="gc-grid2">
                  <div className="gc-note">
                    <strong>Demandes en attente</strong>
                    <p>{demandesEnAttente} demande(s) ou opération(s) en attente
                    de traitement dans les données de démonstration.</p>
                  </div>
                  <div className="gc-note">
                    <strong>Congés annuels</strong>
                    <p>
                      {conges.filter((c) => c.type === "Congé annuel").length}
                      {" "}dossier(s) de congé annuel suivi(s). Vérifiez les
                      droits acquis, les jours pris, les reports et les soldes.
                    </p>
                  </div>
                  <div className="gc-note">
                    <strong>Procédures disciplinaires</strong>
                    <p>
                      {proceduresOuvertes} procédure(s) ouverte(s). Assurez le
                      suivi des étapes, notifications, décisions et preuves
                      d’exécution conformément aux règles applicables.
                    </p>
                  </div>
                  <div className="gc-note">
                    <strong>Qualité des données</strong>
                    <p>
                      Vérifiez les matricules, références des actes,
                      dates d’effet, justificatifs et habilitations avant
                      la mise en production.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {modalOuvert && (
          <div
            className="gc-modal-backdrop"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setModalOuvert(false);
            }}
          >
            <div
              className="gc-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gc-modal-title"
            >
              <div className="gc-modal-head">
                <div>
                  <h3 id="gc-modal-title">Nouvelle demande de congé ou d’absence</h3>
                  <div className="gc-subcell">Les champs marqués d’un * sont obligatoires.</div>
                </div>
                <button
                  className="gc-btn"
                  type="button"
                  onClick={() => setModalOuvert(false)}
                >
                  Fermer ✕
                </button>
              </div>

              <form onSubmit={enregistrerConge}>
                <div className="gc-modal-body">
                  {erreur && <div className="gc-error">{erreur}</div>}

                  <div className="gc-formgrid">
                    <div className="gc-field">
                      <label>Matricule *</label>
                      <input
                        className="gc-input"
                        value={form.matricule}
                        onChange={(e) =>
                          setForm({ ...form, matricule: e.target.value })
                        }
                        placeholder="Ex. MPE-00170"
                        required
                      />
                    </div>

                    <div className="gc-field">
                      <label>Nom et prénoms *</label>
                      <input
                        className="gc-input"
                        value={form.agent}
                        onChange={(e) =>
                          setForm({ ...form, agent: e.target.value })
                        }
                        placeholder="Nom complet de l’agent"
                        required
                      />
                    </div>

                    <div className="gc-field full">
                      <label>Type de congé ou d’absence *</label>
                      <select
                        className="gc-select"
                        value={form.type}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            type: e.target.value as TypeConge,
                          })
                        }
                      >
                        {TYPES_CONGES.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div className="gc-field">
                      <label>Date de début *</label>
                      <input
                        className="gc-input"
                        type="date"
                        value={form.debut}
                        onChange={(e) =>
                          setForm({ ...form, debut: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="gc-field">
                      <label>Date de fin *</label>
                      <input
                        className="gc-input"
                        type="date"
                        min={form.debut || undefined}
                        value={form.fin}
                        onChange={(e) =>
                          setForm({ ...form, fin: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="gc-field">
                      <label>Année de référence *</label>
                      <input
                        className="gc-input"
                        type="number"
                        min="2000"
                        max="2100"
                        value={form.annee}
                        onChange={(e) =>
                          setForm({ ...form, annee: Number(e.target.value) })
                        }
                        required
                      />
                    </div>

                    {form.type === "Congé annuel" && (
                      <>
                        <div className="gc-field">
                          <label>Droits annuels (jours)</label>
                          <input
                            className="gc-input"
                            type="number"
                            min="0"
                            value={form.droitsAnnuels}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                droitsAnnuels: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="gc-field">
                          <label>Jours déjà pris</label>
                          <input
                            className="gc-input"
                            type="number"
                            min="0"
                            value={form.joursDejaPris}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                joursDejaPris: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div className="gc-field full">
                          <div className="gc-note">
                            Durée calendaire de la période sélectionnée :{" "}
                            <strong>
                              {joursEntre(form.debut, form.fin)} jour(s)
                            </strong>
                            . Le décompte définitif doit suivre les règles
                            validées par les RH.
                          </div>
                        </div>
                      </>
                    )}

                    {form.type !== "Congé annuel" && (
                      <div className="gc-field">
                        <label>
                          Durée demandée (jours, si applicable)
                        </label>
                        <input
                          className="gc-input"
                          type="number"
                          min="0"
                          value={form.joursDemandes}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              joursDemandes: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    )}

                    <div className="gc-field full">
                      <label>Motif / référence du dossier</label>
                      <textarea
                        className="gc-textarea"
                        rows={3}
                        value={form.motif}
                        onChange={(e) =>
                          setForm({ ...form, motif: e.target.value })
                        }
                        placeholder="Motif de la demande ou référence du justificatif…"
                      />
                    </div>
                  </div>

                  <div className="gc-note" style={{ marginTop: 14 }}>
                    L’enregistrement crée une demande de démonstration au
                    statut « En attente ». Il ne constitue pas une autorisation
                    officielle et ne remplace pas la validation administrative.
                  </div>

                  <div className="gc-modal-foot">
                    <button
                      className="gc-btn"
                      type="button"
                      onClick={() => setModalOuvert(false)}
                    >
                      Annuler
                    </button>
                    <button
                      className="gc-btn gc-btn-primary"
                      type="submit"
                    >
                      Enregistrer la demande
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppChrome>
  );
}
