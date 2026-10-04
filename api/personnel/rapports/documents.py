"""Actes et rapports officiels du SIGRH, sur le papier à en-tête du ministère."""

from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, Spacer, Table, TableStyle

from .mise_en_page import assembler, encadre, fiche, metriques, paragraphe, section, tableau, tableau_reporte, texte
from .papier import FILET, date_longue, largeur

DRH = "Direction des ressources humaines"
CARRIERES = "Sous-direction de la gestion des carrières"
SOCIALE = "Sous-direction de l'action sociale"


def rendre_acte(acte) -> bytes:
    """Extrait d'un acte validé, mis à disposition de l'agent."""
    return assembler(
        {
            "reference": acte.reference,
            "titre": f"Extrait {acte.reference}",
            "sujet": acte.titre,
            "mention": "extrait du dossier individuel",
            "suite": "Extrait",
            "service": DRH,
            "detail": CARRIERES,
            "kicker": "Direction des ressources humaines",
            "titre_affiche": "EXTRAIT D'ACTE",
            "sous_titre": acte.get_domaine_display(),
            "badge": "EXTRAIT",
            "gabarit": "extrait",
            "bandeau": "EXTRAIT",
        },
        lambda feuille: _corps_acte(feuille, acte),
        _signataire(),
    )


def rendre_notations(agent) -> bytes:
    """Bulletin des notations versées au dossier de l'agent."""
    return assembler(
        _meta_agent(
            agent,
            "notations",
            "Bulletin des notations",
            "Notations et appréciations versées au dossier",
            "dossier individuel confidentiel",
            "Bulletin",
            CARRIERES,
            "CONFIDENTIEL",
            "bulletin",
            "BULLETIN DES NOTATIONS",
        ),
        lambda feuille: _corps_notations(feuille, agent),
        _signataire(),
    )


def rendre_conges(agent) -> bytes:
    """Relevé des congés et absences versés au dossier de l'agent."""
    return assembler(
        _meta_agent(
            agent,
            "conges",
            "Relevé des congés",
            "Congés et absences versés au dossier",
            "extrait du dossier individuel",
            "Relevé",
            CARRIERES,
            "EXTRAIT",
            "releve",
            "RELEVE DES CONGES",
        ),
        lambda feuille: _corps_conges(feuille, agent),
        _signataire(),
    )


def rendre_social(agent) -> bytes:
    """Rapport des prestations sociales versées au dossier de l'agent."""
    return assembler(
        _meta_agent(
            agent,
            "social",
            "Rapport des prestations",
            "Prestations sociales versées au dossier",
            "dossier social confidentiel",
            "Rapport",
            SOCIALE,
            "CONFIDENTIEL",
            "social",
            "ACTION SOCIALE",
        ),
        lambda feuille: _corps_social(feuille, agent),
        _signataire(),
    )


def rendre_dossier(agent) -> bytes:
    """État administratif complet du dossier numérique de l'agent."""
    return assembler(
        _meta_agent(
            agent,
            "dossier",
            "Dossier numérique",
            "État administratif du dossier individuel",
            "dossier individuel confidentiel",
            "Dossier",
            CARRIERES,
            "CONFIDENTIEL",
            "bulletin",
            "DOSSIER",
        ),
        lambda feuille: _corps_dossier(feuille, agent),
        _signataire(),
    )


def rendre_registre(publications) -> bytes:
    """Registre des publications officielles déjà sorties du brouillon."""
    return assembler(
        _meta_drh(
            "REGISTRE",
            "Registre des publications",
            "Notes, circulaires, décisions et communiqués",
            "registre des publications",
            "Registre",
            gabarit="registre",
            bandeau="REGISTRE DES PUBLICATIONS",
        ),
        lambda feuille: _corps_registre(feuille, publications),
        _signataire(),
    )


def rendre_publication(publication) -> bytes:
    """Publication officielle, dans sa rédaction intégrale."""
    return assembler(
        {
            "reference": publication.reference,
            "titre": publication.intitule,
            "sujet": publication.get_nature_display(),
            "mention": "publication officielle",
            "suite": publication.get_nature_display(),
            "service": DRH,
            "detail": "",
            "kicker": publication.get_nature_display(),
            "titre_affiche": publication.intitule,
            "sous_titre": publication.get_perimetre_display(),
            "badge": "URGENT" if publication.urgence == "urgent" else "OFFICIEL",
            "gabarit": "note",
            "bandeau": publication.get_nature_display().upper(),
        },
        lambda feuille: _corps_publication(feuille, publication),
        _signataire(),
    )


def rendre_consultation(bilan: dict | None) -> bytes:
    """Bilan d'une consultation flash du personnel."""
    return assembler(
        _meta_drh(
            "CONSULTATION",
            "Consultation du personnel",
            "Sondage auprès de l'ensemble des agents",
            "consultation du personnel",
            "Consultation",
            gabarit="consultation",
            bandeau="COMPTE RENDU",
        ),
        lambda feuille: _corps_consultation(feuille, bilan),
        _signataire(),
    )


def rendre_etat_conges(annee: int, totaux: dict, campagne, plans, demandes) -> bytes:
    """État des congés : soldes, campagne et demandes encore ouvertes."""
    return assembler(
        _meta_drh(
            f"CONGES-{annee}",
            f"État des congés {annee}",
            "Soldes, campagne de planification et demandes en cours",
            "état des congés",
            "État des congés",
            CARRIERES,
            gabarit="etat",
            bandeau=f"ETAT DES CONGES {annee}",
        ),
        lambda feuille: _corps_etat_conges(feuille, annee, totaux, campagne, plans, demandes),
        _signataire(),
    )


def rendre_dotation(corps: dict) -> bytes:
    """Gestion complète de la dotation : plafonds, mouvements, alertes et passerelles."""
    annee = corps["annee"]
    return assembler(
        _meta_drh(
            f"DOT-{annee}",
            f"Gestion de la dotation {annee}",
            corps.get("intitule") or "Dotation en personnel et plafonds d'emplois",
            "gestion de la dotation",
            "Dotation",
            CARRIERES,
            gabarit="registre",
            bandeau=f"DOTATION {annee}",
        ),
        lambda feuille: _corps_dotation(feuille, corps),
        _signataire(),
    )


def rendre_plan_besoins(fiches) -> bytes:
    """Plan prévisionnel des besoins en effectifs."""
    from django.utils import timezone

    annee = timezone.localdate().year
    return assembler(
        _meta_drh(
            f"BESOINS-{annee}",
            "Plan prévisionnel des besoins",
            f"Fiches de besoin déposées pour l'exercice {annee}",
            "plan prévisionnel des besoins",
            "Plan des besoins",
            gabarit="plan",
            bandeau=f"PLAN DES BESOINS {annee}",
        ),
        lambda feuille: _corps_besoins(feuille, annee, fiches),
        _signataire(),
    )


def rendre_assiduite(quand, presenteisme: dict, lignes) -> bytes:
    """Rapport mensuel d'assiduité : présentéisme et autorisations du mois."""
    from .papier import MOIS

    libelle = f"{MOIS[quand.month - 1]} {quand.year}"
    return assembler(
        {
            "reference": f"ASSIDUITE-{quand.year}-{quand.month:02d}",
            "titre": f"Rapport d'assiduité {libelle}",
            "sujet": "Rapport d'assiduité mensuel",
            "mention": "temps de service",
            "suite": "Assiduité",
            "detail": CARRIERES,
            "titre_affiche": f"Rapport d'assiduité — {libelle}",
            "sous_titre": "Autorisations d'absence instruites dans le mois",
            "gabarit": "assiduite",
            "bandeau": "RAPPORT D'ASSIDUITE",
        },
        lambda feuille: _corps_assiduite(feuille, libelle, presenteisme, lignes),
        _signataire(),
    )


def rendre_tableau_avancement(annee: int, lignes) -> bytes:
    """Tableau collectif d'avancement de l'exercice, après certification des calculs."""
    return assembler(
        _meta_drh(
            f"AVANC-{annee}",
            f"Tableau d'avancement {annee}",
            "Campagne annuelle, ancienneté d'échelon et notation de service",
            "tableau d'avancement",
            "Tableau d'avancement",
            CARRIERES,
            gabarit="registre",
            bandeau=f"TABLEAU D'AVANCEMENT {annee}",
        ),
        lambda feuille: _corps_avancement(feuille, annee, lignes),
        _signataire(),
    )


def rendre_synthese(corps: dict) -> bytes:
    """Synthèse statistique de l'observatoire, pour l'exercice demandé."""
    exercice = corps["exercice"]
    return assembler(
        _meta_drh(
            f"STAT-{exercice}",
            f"Synthèse statistique {exercice}",
            "Observatoire des effectifs du portefeuille de l'État",
            "synthèse statistique",
            "Synthèse",
            gabarit="observatoire",
            bandeau=f"OBSERVATOIRE {exercice}",
        ),
        lambda feuille: _corps_synthese(feuille, corps),
        _signataire(),
    )


def _meta_agent(agent, code, titre, sous_titre, mention, suite, detail, badge, gabarit, bandeau) -> dict:
    return {
        "reference": f"{code.upper()}-{agent.matricule}",
        "titre": f"{titre} — {agent.matricule}",
        "sujet": titre,
        "mention": mention,
        "suite": suite,
        "service": DRH,
        "detail": detail,
        "kicker": detail,
        "titre_affiche": titre.upper(),
        "sous_titre": f"{agent.nom_complet} · {agent.matricule}",
        "badge": badge,
        "gabarit": gabarit,
        "bandeau": bandeau,
    }


def _meta_drh(reference, titre, sous_titre, mention, suite, detail="", gabarit="etat", bandeau="") -> dict:
    return {
        "reference": reference,
        "titre": titre,
        "sujet": titre,
        "mention": mention,
        "suite": suite,
        "service": DRH,
        "detail": detail,
        "kicker": DRH,
        "titre_affiche": titre.upper(),
        "sous_titre": sous_titre,
        "badge": "OFFICIEL",
        "gabarit": gabarit,
        "bandeau": bandeau or titre.upper(),
    }


def _corps_acte(feuille, acte) -> list:
    effet = _jour(acte.date_effet) or "non renseignée"
    return [
        *section(feuille, "Identité administrative"),
        _identite_serree(feuille, acte.agent),
        Spacer(1, 3 * mm),
        *section(feuille, "Mentions de l'acte"),
        fiche(feuille, [
            ("Nature", acte.nature),
            ("Intitulé", acte.titre),
            ("Domaine", acte.get_domaine_display()),
            ("Statut", acte.get_statut_display()),
            ("Date d'effet", effet),
            ("Enregistré le", _jour(acte.date_enregistrement)),
            ("Signataire de l'acte", acte.signataire),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Dispositif"),
        *texte(feuille, acte.resume or "Aucun résumé n'est versé à cet acte."),
        Spacer(1, 2 * mm),
        encadre(
            feuille,
            "Mise à disposition",
            "Le présent extrait est établi par le système d'information des ressources humaines "
            "et tient lieu de copie de l'acte validé, à défaut du scan versé au dossier.",
        ),
    ]


def _corps_notations(feuille, agent) -> list:
    evaluations = list(agent.evaluations.all())
    histoire = [*_identite(feuille, agent), Spacer(1, 4 * mm)]
    if not evaluations:
        histoire += texte(feuille, "Aucune notation n'est versée à ce dossier.")
        return histoire
    derniere = evaluations[0]
    histoire += [
        metriques(feuille, [
            ("Notations", str(len(evaluations))),
            ("Dernier exercice", str(derniere.annee)),
            ("Dernière note", f"{derniere.note} / 20"),
        ]),
        Spacer(1, 4 * mm),
    ]
    for item in evaluations:
        histoire += [
            *section(feuille, f"Exercice {item.annee}"),
            metriques(feuille, [
                ("Note", f"{item.note} / 20"),
                ("Mention", item.mention),
                ("Statut", item.statut),
            ]),
            Spacer(1, 2 * mm),
            fiche(feuille, [
                ("Évaluateur", f"{item.evaluateur} — {item.fonction_evaluateur}".strip(" —")),
                ("Visé le", _jour(item.vise_le.date()) if item.vise_le else ""),
                ("Notifiée le", _jour(item.notifiee_le.date()) if item.notifiee_le else ""),
            ]),
            Spacer(1, 2 * mm),
            *texte(feuille, item.appreciation or "Aucune appréciation."),
        ]
        if item.avis_drh:
            histoire += [*texte(feuille, f"Avis du directeur des ressources humaines. {item.avis_drh}")]
        if item.observation_agent:
            histoire += [*texte(feuille, f"Observation de l'agent. {item.observation_agent}")]
    return histoire


def _corps_conges(feuille, agent) -> list:
    absences = list(agent.absences.all())
    histoire = [
        *_identite(feuille, agent),
        Spacer(1, 4 * mm),
        metriques(feuille, [
            ("Droits acquis", f"{agent.conges_acquis} j"),
            ("Consommés", f"{agent.conges_consommes} j"),
            ("Reliquat", f"{agent.reliquat_conges} j"),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Absences versées au dossier"),
    ]
    lignes = [
        [_jour(item.debut), _jour(item.fin), f"{item.jours} j", item.nature, item.statut]
        for item in absences
    ]
    histoire.append(tableau(
        feuille,
        ["Début", "Fin", "Durée", "Nature", "Statut"],
        lignes or [],
        [1.3, 1.3, 0.7, 2.2, 1.5],
    ))
    if not lignes:
        histoire += [Spacer(1, 2 * mm), *texte(feuille, "Aucune absence n'est versée à ce dossier.")]
    return histoire


def _corps_social(feuille, agent) -> list:
    prestations = list(agent.prestations.all())
    total = sum(item.montant for item in prestations)
    histoire = [
        *_identite(feuille, agent),
        Spacer(1, 4 * mm),
        metriques(feuille, [
            ("Prestations", str(len(prestations))),
            ("Montant cumulé", _fcfa(total)),
            ("Dernière demande", _jour(prestations[0].date_demande) if prestations else "—"),
        ]),
        Spacer(1, 4 * mm),
    ]
    if not prestations:
        histoire += texte(feuille, "Aucune prestation n'est versée à ce dossier.")
        return histoire
    for item in prestations:
        histoire += [
            *section(feuille, item.reference),
            fiche(feuille, [
                ("Nature", item.nature),
                ("Objet", item.objet),
                ("Montant", _fcfa(item.montant)),
                ("Demandée le", _jour(item.date_demande)),
                ("Statut", item.statut),
                ("Instruction", item.get_etat_display() if item.etat else ""),
                ("Ayant droit", item.ayant_droit),
                ("Échéancier", item.echeancier),
            ]),
            Spacer(1, 3 * mm),
        ]
    return histoire


def _corps_dossier(feuille, agent) -> list:
    from ..present import projection, situation_administrative

    actes = list(agent.actes.all())
    evaluations = list(agent.evaluations.all())
    absences = list(agent.absences.all())
    formations = list(agent.formations.all())
    prestations = list(agent.prestations.all())
    pieces = list(agent.pieces.all())
    demandes = list(agent.demandes.all())
    visas = list(agent.visas_dossier.all())
    proj = projection(agent)
    histoire = [
        *_identite_dossier(feuille, agent),
        Spacer(1, 3 * mm),
        metriques(feuille, [
            ("Actes", str(len(actes))),
            ("Pièces", str(len(pieces))),
            ("Reliquat de congés", f"{agent.reliquat_conges} j"),
            ("Radiation", _iso(proj["date_radiation"]) if proj else "—"),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Situation administrative"),
        fiche(feuille, [
            (ligne["libelle"], _valeur_situation(ligne["valeur"]))
            for ligne in situation_administrative(agent)
        ]),
        Spacer(1, 3 * mm),
        fiche(feuille, [
            ("Téléphone", agent.telephone),
            ("Courriel", agent.courriel),
            ("Lieu de travail", agent.localisation),
            ("Habilitation", agent.habilitation),
            ("Visite médicale", agent.visite_medicale),
            ("Affiliation CGRAE", agent.affiliation_cgrae),
        ]),
    ]
    if proj:
        histoire += [
            Spacer(1, 2 * mm),
            *texte(
                feuille,
                f"Projection indicative : prochain échelon {proj['prochain_echelon'] or '—'} "
                f"le {_iso(proj['date_prochain_echelon'])}, radiation des cadres le {_iso(proj['date_radiation'])} "
                f"(limite d'âge {proj['age_limite']} ans, {proj['service_restant']}).",
            ),
        ]
    histoire += [
        Spacer(1, 3 * mm),
        *section(feuille, "Actes et décisions"),
        tableau(
            feuille,
            ["Référence", "Nature", "Effet", "Statut"],
            [
                [item.reference, item.nature, _jour(item.date_effet), item.get_statut_display()]
                for item in actes
            ],
            [1.6, 2.2, 1.6, 1.6],
            compact=True,
        ),
        Spacer(1, 3 * mm),
        *section(feuille, "Notations"),
        tableau(
            feuille,
            ["Exercice", "Note", "Mention", "Statut"],
            [
                [str(item.annee), f"{item.note} / 20", item.mention, item.statut]
                for item in evaluations
            ],
            [1, 1, 2, 2],
            compact=True,
        ),
    ]
    if evaluations and evaluations[0].appreciation:
        histoire += [Spacer(1, 2 * mm), *texte(feuille, f"Dernière appréciation ({evaluations[0].annee}). {evaluations[0].appreciation}")]
    histoire += [
        Spacer(1, 3 * mm),
        *section(feuille, "Congés et absences"),
        _tableau_jours(feuille, absences),
        Spacer(1, 3 * mm),
        *section(feuille, "Formations"),
        _tableau_formations(feuille, formations),
        Spacer(1, 3 * mm),
        *section(feuille, "Action sociale"),
        *_fiche_sociale(feuille, agent),
        KeepTogether([
            *section(feuille, "Prestations"),
            _tableau_prestations(feuille, prestations),
        ]),
        Spacer(1, 3 * mm),
        *section(feuille, "Pièces versées au dossier"),
        tableau(
            feuille,
            ["Intitulé", "Catégorie", "Dépôt", "Contrôle"],
            [
                [item.intitule, item.categorie, _jour(item.date_depot), "Vérifiée" if item.verifiee else "À vérifier"]
                for item in pieces
            ],
            [2.4, 1.4, 1.6, 1.2],
            compact=True,
        ),
        Spacer(1, 2 * mm),
        *texte(
            feuille,
            "Les scans restent consultables dans le dossier numérique. "
            "Le présent état en dresse la situation administrative à la date d'édition.",
        ),
        Spacer(1, 3 * mm),
        *section(feuille, "Demandes"),
        tableau(
            feuille,
            ["Référence", "Nature", "Étape", "Échéance"],
            [[item.reference, item.nature, item.etape, item.echeance] for item in demandes],
            [1.4, 1.8, 2, 1.4],
            compact=True,
        ),
        Spacer(1, 3 * mm),
        *section(feuille, "Visas du dossier"),
        tableau(
            feuille,
            ["Instance", "Avis", "Date", "Référence"],
            [
                [item.instance, item.avis, _jour(item.date), item.reference]
                for item in visas
            ],
            [2, 1.4, 1.6, 1.6],
            compact=True,
        ),
    ]
    if agent.ayants_droit.exists():
        histoire += [
            Spacer(1, 3 * mm),
            *section(feuille, "Ayants droit"),
            tableau(
                feuille,
                ["Nom", "Lien", "Statut"],
                [[item.nom, item.lien, item.statut] for item in agent.ayants_droit.all()],
                [2.2, 1.6, 1.4],
                compact=True,
            ),
        ]
    return histoire


def _valeur_situation(valeur) -> str:
    texte_valeur = str(valeur or "")
    if len(texte_valeur) >= 10 and texte_valeur[4:5] == "-" and texte_valeur[7:8] == "-":
        return _iso(texte_valeur)
    return texte_valeur


def _tableau_jours(feuille, absences) -> Table:
    return tableau_reporte(
        feuille,
        ["Début", "Fin", "Jours", "Nature", "Statut"],
        [[_jour(item.debut), _jour(item.fin), f"{item.jours} j", item.nature, item.statut] for item in absences],
        [1.4, 1.4, 0.8, 2, 1.4],
        [[None, None, float(item.jours), None, None] for item in absences],
        compact=True,
    )


def _tableau_formations(feuille, formations) -> Table:
    return tableau_reporte(
        feuille,
        ["Intitulé", "Organisme", "Début", "Heures", "Statut"],
        [
            [item.intitule, item.organisme, _jour(item.debut), str(item.heures), item.statut]
            for item in formations
        ],
        [2, 1.6, 1.4, 0.8, 1.2],
        [[None, None, None, float(item.heures), None] for item in formations],
        compact=True,
    )


def _tableau_prestations(feuille, prestations) -> Table:
    return tableau_reporte(
        feuille,
        ["Référence", "Nature", "Demandée le", "Montant (FCFA)", "Statut"],
        [
            [item.reference, item.nature, _jour(item.date_demande), _entier(item.montant), item.statut]
            for item in prestations
        ],
        [1.4, 1.6, 1.4, 1.3, 1.3],
        [[None, None, None, float(item.montant), None] for item in prestations],
        compact=True,
    )


def _fiche_sociale(feuille, agent) -> list:
    try:
        situation = agent.situation_sociale
    except agent.__class__.situation_sociale.RelatedObjectDoesNotExist:
        return []
    return [
        fiche(feuille, [
            ("N° CMU", situation.numero_cmu),
            ("Solde net", _fcfa(situation.solde_nette)),
            ("Quotité cessible", _fcfa(situation.quotite)),
            ("Marge", _fcfa(situation.marge)),
        ]),
        Spacer(1, 2 * mm),
    ]


def _corps_registre(feuille, publications) -> list:
    lignes = [
        [
            item.reference,
            item.get_nature_display(),
            item.intitule,
            item.get_statut_display(),
            _jour(item.publiee_le.date()) if item.publiee_le else "",
        ]
        for item in publications
    ]
    return [
        metriques(feuille, [
            ("Publications", str(len(lignes))),
            ("Diffusées", str(sum(1 for item in publications if item.statut == "diffuse"))),
            ("En attente de visa", str(sum(1 for item in publications if item.statut == "visa"))),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Pièces du registre"),
        tableau(
            feuille,
            ["Référence", "Nature", "Intitulé", "Statut", "Publication"],
            lignes,
            [1.3, 1.4, 2.6, 1.2, 1.2],
            compact=True,
        ),
    ]


def _corps_publication(feuille, publication) -> list:
    histoire = [
        fiche(feuille, [
            ("Référence", publication.reference),
            ("Nature", publication.get_nature_display()),
            ("Urgence", publication.get_urgence_display()),
            ("Périmètre", publication.perimetre_detail or publication.get_perimetre_display()),
            ("Statut", publication.get_statut_display()),
            ("Signataire désigné", publication.signataire),
            ("Visa", publication.visa),
            ("Publiée le", _jour(publication.publiee_le.date()) if publication.publiee_le else ""),
            ("Échéance", _jour(publication.echeance)),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Texte"),
    ]
    blocs = [ligne.strip() for ligne in (publication.corps or "").splitlines() if ligne.strip()]
    if not blocs:
        histoire += texte(feuille, "Le corps de cette publication n'est pas renseigné.")
    for bloc in blocs:
        histoire += texte(feuille, bloc)
    return histoire


def _corps_consultation(feuille, bilan) -> list:
    if not bilan:
        return texte(feuille, "Aucune consultation n'est ouverte.")
    return [
        encadre(feuille, "Question posée au personnel", bilan.get("question") or ""),
        Spacer(1, 4 * mm),
        metriques(feuille, [
            ("Réponses reçues", str(bilan.get("participants") or 0)),
            ("Périmètre", bilan.get("perimetre") or "Ensemble des agents"),
            ("Clôture", _iso(bilan.get("cloture"))),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Répartition des réponses"),
        tableau(
            feuille,
            ["Réponse", "Voix", "Part"],
            [
                [option.get("libelle", ""), str(option.get("voix", 0)), f"{option.get('part', 0)} %"]
                for option in bilan.get("options") or []
            ],
            [3, 1, 1],
        ),
    ]


def _corps_etat_conges(feuille, annee, totaux, campagne, plans, demandes) -> list:
    histoire = [
        metriques(feuille, [
            ("Exercice", str(annee)),
            ("Jours acquis", str(totaux.get("acquis") or 0)),
            ("Jours consommés", str(totaux.get("consommes") or 0)),
            ("Reliquats", str(totaux.get("reports") or 0)),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Campagne de planification"),
    ]
    if campagne is None:
        histoire += texte(feuille, "Aucune campagne de planification n'est ouverte.")
    else:
        histoire += [
            fiche(feuille, [
                ("Exercice", str(campagne.exercice)),
                ("Statut", campagne.get_statut_display()),
                ("Délai de la campagne", _jour(campagne.delai)),
                ("Échéance des agents", _jour(campagne.limite_agents)),
                ("Échéance des responsables", _jour(campagne.limite_hierarchie)),
                ("Échéance de l'équipe RH", _jour(campagne.limite_rh)),
                ("Échéance du DRH", _jour(campagne.limite_drh)),
            ]),
            Spacer(1, 4 * mm),
            *section(feuille, "Plans déposés"),
            tableau(
                feuille,
                ["Agent", "Matricule", "Du", "Au", "Palier"],
                [
                    [_personne(plan.agent), plan.agent.username, _jour(plan.debut), _jour(plan.fin), plan.get_palier_display()]
                    for plan in plans
                ],
                [2.2, 1.2, 1.3, 1.3, 1.6],
                compact=True,
            ),
        ]
        if not plans:
            histoire += [Spacer(1, 2 * mm), *texte(feuille, "Aucun plan n'est déposé.")]
    histoire += [
        Spacer(1, 4 * mm),
        *section(feuille, "Demandes encore ouvertes"),
        tableau(
            feuille,
            ["Agent", "Matricule", "Nature", "Du", "Au", "Instruction"],
            [
                [
                    f"{item.agent.nom} {item.agent.prenoms}",
                    item.agent.matricule,
                    item.nature,
                    _jour(item.debut),
                    _jour(item.fin),
                    item.get_instruction_display(),
                ]
                for item in demandes
            ],
            [1.8, 1.1, 1.6, 1.2, 1.2, 1.6],
            compact=True,
        ),
    ]
    if not demandes:
        histoire += [Spacer(1, 2 * mm), *texte(feuille, "Aucune demande n'est en cours.")]
    return histoire


def _corps_dotation(feuille, corps) -> list:
    annee = corps["annee"]
    effectif = corps["effectif"]
    plafond = corps["plafond"]
    vacants = max(0, plafond - effectif)
    taux = round(1000 * effectif / plafond) / 10 if plafond else 0
    histoire = [
        metriques(feuille, [
            ("Exercice", str(annee)),
            ("Effectif en poste", str(effectif)),
            ("Plafond d'emplois", str(plafond)),
            ("Postes vacants", str(vacants)),
            ("Taux d'occupation", _pourcent(taux)),
            ("Campagnes ouvertes", str(corps["campagnes"])),
        ]),
    ]
    if corps.get("fondement"):
        histoire += [Spacer(1, 3 * mm), *texte(feuille, corps["fondement"])]
    histoire += [
        Spacer(1, 4 * mm),
        *section(feuille, "Plafonds par branche"),
        _tableau_branches(feuille, corps["branches"]),
        Spacer(1, 4 * mm),
        *section(feuille, "Mouvements de dotation"),
        _tableau_demandes(feuille, corps["demandes"]),
    ]
    if corps.get("repartition"):
        histoire += [
            Spacer(1, 4 * mm),
            *section(feuille, "Campagnes encore ouvertes"),
            _tableau_compte(feuille, corps["repartition"]),
        ]
    histoire += [
        Spacer(1, 4 * mm),
        KeepTogether([
            *section(feuille, "Postes critiques non pourvus"),
            _tableau_alertes(feuille, corps["alertes"]),
        ]),
        Spacer(1, 4 * mm),
        KeepTogether([
            *section(feuille, "Passerelles entre entités"),
            _tableau_passerelles(feuille, corps["passerelles"]),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Journal des opérations"),
        tableau(
            feuille,
            ["Référence", "Opération", "Auteur", "Date"],
            [
                [item.reference, item.titre, item.auteur, _jour(_date_locale(item.cree_le))]
                for item in corps["journal"]
            ],
            [1.1, 2.6, 1.5, 1.3],
            compact=True,
        ),
    ]
    return histoire


def _pourcent(valeur) -> str:
    return f"{valeur:.1f}".replace(".", ",") + " %"


def _date_locale(quand):
    from django.utils import timezone

    return timezone.localtime(quand).date()


def _tableau_branches(feuille, branches):
    lignes = [
        [
            item.libelle,
            item.entites,
            str(item.effectif),
            str(item.plafond),
            str(max(0, item.plafond - item.effectif)),
            _pourcent(round(1000 * item.effectif / item.plafond) / 10 if item.plafond else 0),
            item.note,
        ]
        for item in branches
    ]
    nombres = [
        [None, None, float(item.effectif), float(item.plafond), float(max(0, item.plafond - item.effectif)), None, None]
        for item in branches
    ]
    return tableau_reporte(
        feuille,
        ["Branche", "Périmètre", "Effectif", "Plafond", "Vacants", "Taux", "Note"],
        lignes,
        [1.6, 1.8, 0.8, 0.8, 0.8, 0.7, 1.6],
        nombres,
        compact=True,
    )


def _tableau_demandes(feuille, demandes):
    lignes = [
        [
            item.reference,
            _jour(item.recu_le),
            item.entite.nom,
            f"{item.poste}\n{item.detail}" if item.detail else item.poste,
            item.get_nature_display(),
            str(item.impact),
            item.get_statut_display() + (f"\n{item.visa}" if item.visa else ""),
        ]
        for item in demandes
    ]
    nombres = [[None, None, None, None, None, float(item.impact), None] for item in demandes]
    return tableau_reporte(
        feuille,
        ["Référence", "Reçu le", "Entité", "Poste", "Nature", "Impact", "Statut"],
        lignes,
        [1.1, 1.15, 1.5, 2.1, 1.5, 0.7, 1.2],
        nombres,
        compact=True,
    )


def _tableau_alertes(feuille, alertes):
    lignes = [
        [
            item.entite.nom,
            f"{item.intitule}\n{item.detail}" if item.detail else item.intitule,
            str(item.postes),
            str(item.jours),
            item.piste,
            "Traitée" if item.traitee else "Ouverte",
        ]
        for item in alertes
    ]
    nombres = [[None, None, float(item.postes), float(item.jours), None, None] for item in alertes]
    return tableau_reporte(
        feuille,
        ["Entité", "Intitulé", "Postes", "Jours", "Piste", "Suite"],
        lignes,
        [1.5, 2.2, 0.7, 0.7, 1.8, 0.8],
        nombres,
        compact=True,
    )


def _tableau_passerelles(feuille, passerelles):
    lignes = [
        [
            item.cedant,
            item.recepteur,
            item.profil,
            str(item.effectif),
            item.get_statut_display(),
            item.note,
        ]
        for item in passerelles
    ]
    nombres = [[None, None, None, float(item.effectif), None, None] for item in passerelles]
    return tableau_reporte(
        feuille,
        ["Cédant", "Récepteur", "Profil", "Effectif", "Statut", "Note"],
        lignes,
        [1.5, 1.5, 1.8, 0.8, 0.9, 1.6],
        nombres,
        compact=True,
    )


def _corps_besoins(feuille, annee, fiches) -> list:
    volume = sum(item.volume for item in fiches)
    favorables = sum(1 for item in fiches if item.statut == "favorable")
    return [
        metriques(feuille, [
            ("Exercice", str(annee)),
            ("Fiches", str(len(fiches))),
            ("Postes demandés", str(volume)),
            ("Avis favorables", str(favorables)),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Fiches de besoin"),
        tableau(
            feuille,
            ["Référence", "Entité", "Profil", "Volume", "Avis"],
            [
                [
                    item.reference,
                    item.entite.nom,
                    f"{item.profil}\n{item.motif}" if item.motif else item.profil,
                    str(item.volume),
                    item.get_statut_display(),
                ]
                for item in fiches
            ],
            [1.2, 1.6, 2.4, 0.7, 1.5],
            compact=True,
        ),
    ]


def _corps_synthese(feuille, corps) -> list:
    kpi = corps["kpi"]
    exercice = corps["exercice"]
    cases = [
        ("Dossiers", str(kpi["dossiers"])),
        ("Actes de carrière", str(kpi["actes_carriere"])),
        ("Actes validés", str(kpi["actes_valides"])),
        ("Parité femmes", f"{kpi['parite']} %"),
        ("Femmes", str(kpi["femmes"])),
        ("Hommes", str(kpi["hommes"])),
        ("Disponibilité", f"{kpi['disponibilite']} %"),
        ("Absents ce jour", str(kpi["absents"])),
        (f"Départs {exercice + 1}", str(kpi["departs"])),
        ("Postes signalés", str(kpi["postes_signales"])),
        ("Reliquat moyen", f"{corps['conges']['reliquat_moyen']} j"),
    ]
    if kpi.get("effectif_officiel") is not None:
        cases.insert(0, ("Au plafond", f"{kpi['effectif_officiel']} / {kpi['plafond']}"))
    histoire = [
        metriques(feuille, cases),
        Spacer(1, 4 * mm),
        *section(feuille, f"Comparaison {exercice} et {exercice - 1}"),
        KeepTogether([tableau(
            feuille,
            ["Indicateur", f"{exercice - 1}", str(exercice), "Écart"],
            [
                [
                    serie["libelle"],
                    _nombre(serie["ecart"].get("precedent")),
                    _nombre(serie["ecart"].get("total")),
                    _nombre(serie["ecart"].get("ecart")),
                ]
                for serie in corps.get("comparaison") or []
            ],
            [2.4, 1, 1, 1],
        )]),
        Spacer(1, 4 * mm),
        *section(feuille, "Effectifs par structure"),
        _tableau_effectifs(feuille, corps.get("lignes") or []),
    ]
    for cle, titre in (
        ("repartition", "Répartition par catégorie"),
        ("ages", "Répartition par âge"),
        ("absences", "Absences"),
        ("corps", "Répartition par corps"),
    ):
        items = corps.get(cle) or []
        if not items:
            continue
        histoire += [
            Spacer(1, 4 * mm),
            *section(feuille, titre),
            _tableau_compte(feuille, items),
        ]
    return histoire


def _tableau_effectifs(feuille, lignes_src: list):
    entetes = ["Structure", "Pôle", "Eff.", "Cadres", "Départs", "Parité", "Risque"]
    largeurs = [2.2, 1.5, 0.7, 1.2, 0.8, 0.8, 1.2]
    if not lignes_src:
        return tableau(feuille, entetes, [], largeurs, compact=True)
    lignes = [
        [
            ligne["nom"],
            ligne["pole_libelle"],
            str(ligne["effectif"]),
            f"{ligne['cadres']} ({ligne['part_cadres']} %)",
            str(ligne["departs"]),
            f"{ligne['parite']} %",
            ligne["risque"],
        ]
        for ligne in lignes_src
    ]
    nombres = [
        [None, None, float(ligne["effectif"]), float(ligne["cadres"]), float(ligne["departs"]), None, None]
        for ligne in lignes_src
    ]
    return tableau_reporte(feuille, entetes, lignes, largeurs, nombres, compact=True)


def _tableau_compte(feuille, items: list):
    lignes = []
    nombres = []
    for item in items:
        total = item.get("total", "")
        try:
            valeur = float(total)
        except (TypeError, ValueError):
            valeur = None
        lignes.append([str(item.get("libelle", "")), str(total)])
        nombres.append([None, valeur])
    return tableau_reporte(feuille, ["Libellé", "Total"], lignes, [3, 1], nombres)


def _identite_serree(feuille, agent) -> Table:
    """Identité sur deux colonnes, pour tenir l'extrait sur une page."""
    organisme = agent.organisme.nom if getattr(agent, "organisme_id", None) else ""
    grade = f"{agent.grade}, échelon {agent.echelon}"
    if agent.indice:
        grade = f"{grade}, indice {agent.indice}"
    champs = [
        (libelle, valeur)
        for libelle, valeur in (
            ("Nom et prénoms", agent.nom_complet),
            ("Matricule", agent.matricule),
            ("Corps", agent.corps),
            ("Grade", grade),
            ("Emploi", agent.fonction or agent.emploi),
            ("Organisme", organisme),
            ("Structure", agent.structure),
            ("Direction", agent.direction),
            ("Service", agent.service or agent.sous_direction),
            ("Situation", agent.situation),
        )
        if valeur
    ]
    if len(champs) % 2:
        champs.append(("", ""))
    lignes = []
    for index in range(0, len(champs), 2):
        gauche, droite = champs[index], champs[index + 1]
        lignes.append([
            paragraphe(gauche[0], feuille["label"]),
            paragraphe(gauche[1], feuille["valeur"]),
            paragraphe(droite[0], feuille["label"]),
            paragraphe(droite[1], feuille["valeur"]),
        ])
    utile = largeur()
    tableau = Table(lignes, colWidths=[24 * mm, utile / 2 - 24 * mm, 24 * mm, utile / 2 - 24 * mm])
    tableau.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 1.5 * mm),
        ("RIGHTPADDING", (2, 0), (2, -1), 1.5 * mm),
        ("LEFTPADDING", (2, 0), (2, -1), 2 * mm),
        ("LINEBEFORE", (2, 0), (2, -1), 0.3, FILET),
        ("TOPPADDING", (0, 0), (-1, -1), 1 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1 * mm),
        ("LINEBELOW", (0, 0), (-1, -2), 0.2, FILET),
    ]))
    return tableau


def _identite_dossier(feuille, agent) -> list:
    """Identité du dossier numérique, avec le portrait lorsqu'il est lisible."""
    identite = _champs_identite(agent)
    portrait = _portrait(agent)
    if portrait is None:
        return [*section(feuille, "Identité administrative"), fiche(feuille, identite)]
    cote = 32 * mm
    reste = largeur() - cote - 4 * mm
    ligne = Table([[portrait, fiche(feuille, identite, reste)]], colWidths=[cote + 4 * mm, reste])
    ligne.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "MIDDLE"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 4 * mm),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [*section(feuille, "Identité administrative"), ligne]


class _PortraitRond(Flowable):
    """Portrait recadré au carré puis dessiné dans un cercle."""

    def __init__(self, tampon, cote: float):
        super().__init__()
        self.tampon = tampon
        self.cote = cote
        self.width = cote
        self.height = cote

    def draw(self):
        from reportlab.lib.utils import ImageReader

        self.tampon.seek(0)
        rayon = self.cote / 2
        trace = self.canv.beginPath()
        trace.circle(rayon, rayon, rayon)
        self.canv.saveState()
        self.canv.clipPath(trace, stroke=0, fill=0)
        self.canv.drawImage(
            ImageReader(self.tampon), 0, 0, self.cote, self.cote,
            preserveAspectRatio=True, anchor="c", mask="auto",
        )
        self.canv.restoreState()


def _portrait(agent) -> _PortraitRond | None:
    if not getattr(agent, "photo", None):
        return None
    from io import BytesIO

    from PIL import Image as ImagePIL

    try:
        with agent.photo.open("rb") as source:
            contenu = source.read()
        image = ImagePIL.open(BytesIO(contenu))
        image = _carre(image)
        image.thumbnail((480, 480), ImagePIL.Resampling.LANCZOS)
        if image.mode == "RGBA":
            fond = ImagePIL.new("RGB", image.size, (255, 255, 255))
            fond.paste(image, mask=image.getchannel("A"))
            image = fond
        elif image.mode != "RGB":
            image = image.convert("RGB")
    except (OSError, ValueError):
        return None
    tampon = BytesIO()
    image.save(tampon, format="PNG")
    tampon.seek(0)
    return _PortraitRond(tampon, 32 * mm)


def _carre(image):
    cote = min(image.size)
    gauche = (image.width - cote) // 2
    haut = (image.height - cote) // 2
    return image.crop((gauche, haut, gauche + cote, haut + cote))


def _champs_identite(agent) -> list[tuple[str, str]]:
    organisme = agent.organisme.nom if getattr(agent, "organisme_id", None) else ""
    grade = f"{agent.grade}, échelon {agent.echelon}"
    if agent.indice:
        grade = f"{grade}, indice {agent.indice}"
    return [
        ("Nom et prénoms", agent.nom_complet),
        ("Matricule", agent.matricule),
        ("Corps", agent.corps),
        ("Grade", grade),
        ("Emploi", agent.fonction or agent.emploi),
        ("Organisme", organisme),
        ("Structure", agent.structure),
        ("Direction", agent.direction),
        ("Service", agent.service or agent.sous_direction),
        ("Situation", agent.situation),
    ]


def _identite(feuille, agent) -> list:
    return [*section(feuille, "Identité administrative"), fiche(feuille, _champs_identite(agent))]


def _corps_assiduite(feuille, libelle: str, presenteisme: dict, lignes) -> list:
    total = len(lignes)
    attente = sum(1 for item in lignes if item.decision == "en_attente")
    valides = sum(1 for item in lignes if item.decision == "validee")
    invalides = sum(1 for item in lignes if item.decision == "invalidee")
    taux = presenteisme.get("taux")
    objectif = presenteisme.get("objectif")
    histoire = [
        metriques(feuille, [
            ("Présentéisme", f"{taux} %" if taux is not None else "—"),
            ("Objectif", f"{objectif} %" if objectif is not None else "—"),
            ("Autorisations", str(total)),
            ("Validées", str(valides)),
            ("En attente", str(attente)),
            ("Invalidées", str(invalides)),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, f"Autorisations de {libelle}"),
        tableau(
            feuille,
            ["Agent", "Matricule", "Nature", "Du", "Au", "Jours", "Décision"],
            [
                [
                    item.agent.nom_complet,
                    item.agent.matricule,
                    item.get_type_autorisation_display(),
                    _jour(item.debut),
                    _jour(item.fin),
                    str(item.jours),
                    item.get_decision_display(),
                ]
                for item in lignes
            ],
            [1.8, 1.1, 1.8, 1.3, 1.3, 0.7, 1.3],
            compact=True,
        ),
    ]
    if not lignes:
        histoire += [Spacer(1, 2 * mm), *texte(feuille, f"Aucune autorisation d'absence n'est enregistrée pour {libelle}.")]
    return histoire


def _corps_avancement(feuille, annee: int, lignes) -> list:
    favorables = sum(1 for item in lignes if item.avis == "Favorable")
    certifies = sum(1 for item in lignes if item.statut == "Calcul certifié")
    return [
        metriques(feuille, [
            ("Exercice", str(annee)),
            ("Dossiers", str(len(lignes))),
            ("Avis favorables", str(favorables)),
            ("Calculs certifiés", str(certifies)),
        ]),
        Spacer(1, 4 * mm),
        *section(feuille, "Inscriptions"),
        tableau(
            feuille,
            ["Agent", "Grade", "Ancienneté", "Proposition", "Régime", "Note", "Avis", "Situation"],
            [
                [
                    f"{item.agent.nom_complet}\n{item.agent.matricule} · {item.structure}",
                    item.grade_echelon,
                    item.anciennete,
                    item.proposition,
                    item.mode,
                    f"{item.note} / 20",
                    item.avis,
                    item.statut,
                ]
                for item in lignes
            ],
            [2.4, 1.1, 1.3, 1.2, 1.1, 0.8, 1.1, 1.5],
            compact=True,
        ),
    ]


def _signataire():
    from ..discipline import resoudre_signataire

    return resoudre_signataire()


def _jour(quand) -> str:
    if not quand:
        return ""
    return date_longue(quand)


def _iso(valeur) -> str:
    if not valeur:
        return ""
    from datetime import date

    try:
        return date_longue(date.fromisoformat(str(valeur)[:10]))
    except ValueError:
        return str(valeur)


def _fcfa(montant) -> str:
    return f"{int(montant):,}".replace(",", "\u00a0") + "\u00a0FCFA"


def _entier(valeur) -> str:
    return f"{int(valeur):,}".replace(",", "\u00a0")


def _nombre(valeur) -> str:
    if valeur is None or valeur == "":
        return "—"
    return str(valeur)


def _personne(user) -> str:
    if user is None:
        return ""
    return user.get_full_name() or user.username
