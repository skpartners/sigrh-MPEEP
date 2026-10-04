import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AppChrome } from "./AppChrome";

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto flex-1";

type Bloc = { titre: string; lignes: string[] };

type ModuleAide = {
  id: string;
  icone: string;
  titre: string;
  chemin: string;
  resume: string;
  fait: string[];
  cas: string[];
  circuit: string[];
  obligations: string[];
  exports?: string[];
  fonctionnement: string[];
  fonctionnalites: string[];
  marche: string[];
};

const COMMUNS: Bloc[] = [
  {
    titre: "Le périmètre de votre compte",
    lignes: [
      "Vous ne voyez que les agents placés sous votre supervision. Un chef voit son équipe. Un agent voit son propre dossier.",
      "Le directeur des ressources humaines, rattaché à la structure DRH, voit l'ensemble des agents du ministère.",
      "Un dossier hors supervision ne s'ouvre pas : l'application répond qu'il est introuvable.",
    ],
  },
  {
    titre: "Les habilitations",
    lignes: [
      "Chaque menu dépend d'un droit : refus, lecture, saisie ou validation. Un menu refusé reste visible mais ne s'ouvre pas.",
      "La validation permet de viser, d'arbitrer et de transmettre. La saisie permet de déposer et de modifier. La lecture permet de consulter.",
      "Un responsable ne peut déléguer à son équipe que des droits qu'il détient lui-même.",
    ],
  },
  {
    titre: "La signature et les PDF",
    lignes: [
      "Déposez votre signature dans le menu de profil avant d'apposer un visa. Sans fichier de signature, le visa est refusé.",
      "Le papier à en-tête d'un acte n'est établi qu'après l'accord. Le scan versé au dossier ouvre ensuite le droit.",
      "Chaque PDF porte en pied de page le compte qui l'a généré : nom et matricule.",
    ],
  },
];

const BARRE: Bloc[] = [
  {
    titre: "Aide",
    lignes: [
      "L'icône point d'interrogation, à droite de la barre, ouvre cette page.",
      "Le sommaire mène à chaque module. Le bouton Ouvrir y conduit si votre habilitation le permet.",
    ],
  },
  {
    titre: "Notifications et messagerie",
    lignes: [
      "La cloche liste les notifications. Vous pouvez n'afficher que les non lues, et tout marquer comme lu.",
      "L'enveloppe ouvre la messagerie interne. Nouveau message cherche un collègue dans l'annuaire.",
    ],
  },
  {
    titre: "Profil",
    lignes: [
      "Le menu à votre nom affiche le matricule, la signature et la déconnexion.",
      "Déposez la signature ici, dessinée ou importée, avant d'apposer un visa.",
      "L'icône de communication, lorsqu'elle est visible, ouvre les publications à traiter.",
    ],
  },
];

const MODULES: ModuleAide[] = [
  {
    id: "vue-ensemble",
    icone: "dashboard",
    titre: "Vue d'ensemble",
    chemin: "/app",
    resume: "Le tableau de bord de l'exercice : registres ouverts, indicateurs, file de visas et derniers actes.",
    fait: [
      "Elle montre, dès l'ouverture, ce qui attend une décision dans votre périmètre : registres encore ouverts, indicateurs de l'exercice et actes à viser.",
      "Elle sert à traiter les visas urgents sans entrer dans chaque module, et à sortir le rapport 360, la note de pilotage du personnel dont vous avez la charge.",
    ],
    cas: [
      "Lundi, douze visas attendent. Vous traitez les urgents, vous renvoyez celui dont la pièce manque, puis vous sortez le rapport 360 pour la réunion de direction.",
      "Un chef de service ouvre la page : les cartes et le rapport ne comptent que son équipe, pas les agents des autres directions.",
    ],
    circuit: [
      "Les actes arrivent dans la file lorsqu'ils sont déjà instruits en amont et attendent le visa du directeur des ressources humaines.",
      "Le visa exige la signature déposée. L'acte passe à « accord acquis » : le papier à en-tête peut être établi.",
      "Le renvoi pour complément sort l'acte de la file et le renvoie au service.",
      "Le droit de l'agent s'ouvre quand le scan du papier à en-tête est versé au dossier.",
    ],
    obligations: [
      "Le visa d'un acte en attente exige votre signature déjà déposée.",
      "Le rapport 360 ne contient que les agents de votre périmètre. Seul le DRH y trouve tout le ministère.",
    ],
    fonctionnement: [
      "Les cartes de registres comptent ce qui est encore ouvert dans chaque module : absences, congés, discipline, social, formation, besoins, recrutement, communication.",
      "Les indicateurs reprennent la photographie de l'exercice (effectifs, visas, notations, action sociale).",
      "La file de visas classe les actes urgents en premier. Vous visez ou vous renvoyez pour complément. L'acte quitte alors la file.",
      "Le registre du bas liste les mouvements déjà versés.",
    ],
    fonctionnalites: [
      "Ouvrir directement le module depuis une carte de registre.",
      "Viser ou renvoyer un acte depuis la file.",
      "Exporter le rapport 360.",
    ],
    exports: [
      "Le bouton Rapport 360, sur la carte d'accueil, produit le PDF rapport-pilotage-2026.pdf.",
      "Il reprend les indicateurs, les observations, les points d'attention, les effectifs, les âges, les visas, les actes, les congés, la discipline et les emplois de votre périmètre.",
    ],
    marche: [
      "Ouvrez Vue d'ensemble depuis le menu.",
      "Traitez d'abord les visas urgents. Si la mention de signature manque, déposez-la dans le profil, puis revenez.",
      "Pour une note de pilotage, cliquez Rapport 360. Le fichier se nomme rapport-pilotage-2026.pdf.",
    ],
  },
  {
    id: "dossier",
    icone: "badge",
    titre: "Dossier agent numérique",
    chemin: "/app/dossiers",
    resume: "Le dossier individuel : identité, situation, carrière, pièces et exports.",
    fait: [
      "Il rassemble, pour un agent, l'identité, la situation administrative, les actes, les notations, les congés, le social, les formations et les pièces.",
      "Il sert à consulter ce dossier, à le corriger et à le remettre en PDF ou en archive à la hiérarchie.",
    ],
    cas: [
      "Une mutation est annoncée. Vous ouvrez le dossier, vous vérifiez la prise de service et le dernier arrêté, puis vous remettez le PDF à la hiérarchie.",
      "L'inspection demande les pièces d'un agent. Vous exportez l'archive ZIP depuis l'onglet des pièces, sans ressortir les originaux.",
    ],
    circuit: [
      "Un acte suit le parcours commun : dépôt, avis du chef de service, contrôle de la sous-direction métier, visa du DRH, puis scan du papier à en-tête.",
      "Une notation suit un circuit plus court : visa du DRH, puis notification à l'agent.",
      "La photo, la situation administrative et les pièces se versent directement. Elles ne passent pas par un visa.",
    ],
    obligations: [
      "Vous ne consultez que les matricules de votre supervision.",
      "La situation administrative se corrige avec des dates valides. Une date impossible est refusée.",
      "La photo acceptée est une image PNG, JPG ou WEBP, au plus 5 Mo.",
    ],
    fonctionnement: [
      "L'annuaire liste les agents de votre périmètre. La recherche porte sur le nom, les prénoms et le matricule.",
      "L'en-tête montre le portrait, le grade, l'échelon, la catégorie, la structure, l'indice, l'ancienneté et la projection de départ à la retraite.",
      "La situation administrative tient les dix-sept rubriques : rattachement, emploi, recrutement, catégorie, grade, prises de service, fonction et position.",
      "Les onglets portent les actes, les notations, les congés, l'action sociale, les formations et les pièces. Les pièces jointes se déposent et s'archivent en ZIP.",
    ],
    fonctionnalites: [
      "Enregistrer ou remplacer la photo de profil.",
      "Modifier la situation administrative.",
      "Télécharger un acte validé.",
      "Exporter le dossier complet en PDF : identité avec portrait rond, situation, actes, notations, congés, formations, social, pièces, demandes, visas et ayants droit.",
      "Télécharger l'archive ZIP des pièces, le bulletin de notations, le relevé de congés ou le rapport social.",
    ],
    exports: [
      "Dossier (PDF), dans l'en-tête : dossier-{matricule}.pdf. Identité avec portrait rond, situation, actes, notations, congés, formations, social, liste des pièces, demandes, visas et ayants droit.",
      "Un acte au statut validé se télécharge en PDF depuis la colonne du dossier. Les actes encore en instruction ne se téléchargent pas.",
      "L'onglet Pièces propose Exporter les pièces : l'archive pieces-{matricule}.zip. Chaque pièce se télécharge aussi seule. Sans pièce, l'archive n'est pas proposée.",
      "L'onglet Notations propose Bulletin individuel (PDF) : notations-{matricule}.pdf.",
      "L'onglet Congés propose le Bilan trimestriel et le relevé statutaire sur trois ans : les deux produisent conges-{matricule}.pdf.",
      "L'onglet Action sociale propose Rapport annuel social (PDF) : social-{matricule}.pdf.",
      "Télécharger le modèle prépare le classeur modele-dossiers-agents.xlsx, pour importer des situations. Une cellule vide conserve la valeur déjà enregistrée.",
    ],
    marche: [
      "Cherchez l'agent, ouvrez son dossier.",
      "Vérifiez la situation et les prises de service avant tout acte.",
      "Pour remettre le dossier à la hiérarchie, cliquez Dossier (PDF) dans l'en-tête. Le portrait versé y figure en rond.",
    ],
  },
  {
    id: "carrieres",
    icone: "assignment",
    titre: "Carrières et actes — accueil",
    chemin: "/app/carrieres",
    resume: "Le pilotage des avancements et l'entrée des mouvements de carrière.",
    fait: [
      "Il prépare le tableau d'avancement de l'exercice : qui est proposé, sur quelle note, et selon quel mode.",
      "Il sert à transmettre les lignes prêtes au visa, à renvoyer celles qui manquent d'une pièce, et à produire le tableau officiel.",
    ],
    cas: [
      "La commission d'avancement approche. Vous contrôlez la note et l'ancienneté, vous transmettez les lignes prêtes et vous renvoyez celle dont le diplôme n'est pas versé.",
      "Le DRH prépare l'arrêté collectif. Vous générez le tableau PDF une fois les avis favorables certifiés.",
    ],
    circuit: [
      "La sous-direction des carrières transmet la ligne : un arrêté d'avancement est créé en instruction et un visa s'ouvre pour le DRH.",
      "Le renvoi retourne le dossier pour pièces. Une ligne déjà transmise ou renvoyée ne se décide plus.",
      "Le DRH vise ensuite depuis la vue d'ensemble. L'accord autorise le papier à en-tête. Le scan versé au dossier ouvre le droit.",
    ],
    obligations: [
      "Un avancement transmis part au visa. Un renvoi retourne le dossier au service d'origine avec le motif.",
      "Le tableau généré est un PDF officiel de l'exercice.",
    ],
    fonctionnement: [
      "L'accueil réunit les propositions d'avancement : emploi, grade, ancienneté, note et mode (ancienneté ou choix).",
      "Vous filtrez le régime, vous transmettez une ligne ou vous la renvoyez.",
      "Les compteurs mènent vers la situation, les absences, les congés, la discipline et la fin de carrière.",
    ],
    fonctionnalites: [
      "Consulter le tableau d'avancement.",
      "Transmettre ou renvoyer une proposition.",
      "Générer le tableau d'avancement en PDF.",
    ],
    exports: [
      "Le bouton Générer le tableau d'avancement 2026 certifie les calculs des lignes encore ouvertes, puis télécharge tableau-avancement-2026.pdf.",
    ],
    marche: [
      "Ouvrez Carrières et actes, puis Accueil.",
      "Contrôlez la note et l'ancienneté de chaque ligne.",
      "Transmettez les lignes prêtes, ou renvoyez celles qui manquent d'une pièce.",
    ],
  },
  {
    id: "situation",
    icone: "badge",
    titre: "Situation administrative",
    chemin: "/app/carrieres/situation-administrative",
    resume: "La mise à jour du rattachement, de l'emploi et des prises de service.",
    fait: [
      "Elle tient à jour la position administrative de l'agent : où il est affecté, quel emploi il occupe, à quel grade, et depuis quand.",
      "Ce qui est enregistré ici alimente l'en-tête du dossier et tous les actes qui s'appuient sur cette situation.",
    ],
    cas: [
      "Un agent est muté au 1er mars. Vous corrigez la direction, le service et la prise de service dans l'emploi, puis vous rouvrez le dossier pour vérifier l'en-tête.",
      "Une date de prise de service est saisie au 31 février. L'enregistrement est refusé et l'ancienne situation reste en place.",
    ],
    circuit: [
      "L'enregistrement de la situation est immédiat. Il ne passe pas par un visa.",
      "L'acte qui officialise le changement de position suit, lui, le parcours des actes : instruction, visa du DRH, papier à en-tête, puis scan.",
    ],
    obligations: [
      "Chaque date suit le calendrier réel. Une date impossible est rejetée et l'ancienne situation est conservée.",
      "L'emploi, le grade et la position doivent correspondre au référentiel et à la situation réelle de l'agent.",
    ],
    fonctionnement: [
      "Vous ouvrez l'agent, vous corrigez organisme, direction, service, lieu, emploi, type d'agent, mode de recrutement, catégorie, grade, échelon, fonction et position.",
      "Les trois prises de service (Fonction publique, ministère, emploi) et la prise de fonction sont distinctes.",
      "L'enregistrement met à jour le dossier numérique immédiatement.",
    ],
    fonctionnalites: [
      "Saisir ou corriger les dix-sept rubriques.",
      "Relire le dossier après enregistrement.",
    ],
    marche: [
      "Choisissez l'agent dans votre périmètre.",
      "Corrigez la rubrique, enregistrez, puis rouvrez le dossier pour vérifier l'en-tête et la fiche.",
    ],
  },
  {
    id: "absences",
    icone: "event_busy",
    titre: "Absences",
    chemin: "/app/carrieres/absences",
    resume: "Les autorisations d'absence et leur décision, distinctes des congés annuels.",
    fait: [
      "Il instruit les absences qui ne sont pas un congé annuel : autorisation, autorisation spéciale et permission spéciale.",
      "Il sert à accepter ou refuser une demande, à en garder le justificatif et l'intérim, et à mesurer l'assiduité du service.",
    ],
    cas: [
      "Un agent est convoqué à un jury deux jours. Vous validez l'autorisation, vous notez l'intérim, et le solde n'est pas touché.",
      "Une absence de cinq jours sans justificatif est invalidée. La retenue d'un trentième par jour est consignée, et le visa du DRH était requis au-delà de 72 heures.",
    ],
    circuit: [
      "La demande est en attente de décision.",
      "Le gestionnaire valide ou invalide. Le motif est obligatoire. L'invalidation emporte une retenue sur le solde.",
      "Au-delà de 72 heures, le visa du directeur des ressources humaines est requis avant la décision.",
    ],
    obligations: [
      "Toute autorisation de plus de 72 heures requiert le visa du directeur des ressources humaines.",
      "La décision (validée ou invalidée) est motivée. Elle peut avoir un impact sur le solde.",
    ],
    fonctionnement: [
      "Le registre distingue l'autorisation d'absence, l'autorisation spéciale et la permission spéciale.",
      "Une demande en attente se valide ou s'invalide. Le justificatif et l'intérim sont portés au dossier.",
      "L'export d'assiduité reprend le présentéisme du service.",
    ],
    fonctionnalites: [
      "Instruire une autorisation.",
      "Consulter le justificatif, l'intérim et l'impact sur le solde.",
      "Exporter le relevé d'assiduité en PDF.",
    ],
    exports: [
      "Le bouton Rapport d'assiduité mensuel (PDF), en haut de page, télécharge rapport-assiduite-{année}-{mois}.pdf.",
      "Il reprend le présentéisme du mois en cours.",
    ],
    marche: [
      "Ouvrez Absences, filtrez les demandes en attente.",
      "Vérifiez la durée. Au-delà de 72 heures, laissez la demande suivre le visa du DRH.",
      "Décidez, motivez, puis exportez le relevé si le service en a besoin.",
    ],
  },
  {
    id: "conges",
    icone: "beach_access",
    titre: "Congés",
    chemin: "/app/carrieres/conges",
    resume: "La planification des congés annuels et l'arbitrage des demandes.",
    fait: [
      "Il organise les congés annuels : la campagne, le plan du service et chaque demande jusqu'à l'arrêté.",
      "Il sert à faire partir les agents sans casser le quorum, et à ouvrir le droit une fois l'arrêté visé et le scan versé.",
    ],
    cas: [
      "Trois agents du même service veulent partir la même semaine. Le quorum tombe sous le seuil : vous décalez l'un d'eux au lieu de signer.",
      "Le reliquat couvre 21 jours, l'intérim est nommé, les visas sont là. Vous signez l'arrêté, puis le scan versé au dossier ouvre le droit.",
    ],
    circuit: [
      "La campagne suit l'accord du DRH, l'ouverture aux agents, la remontée chez les responsables, la soumission au DRH, puis l'arrêté publié.",
      "Une demande déposée suit le circuit attribué à son type de congé. Sans circuit attribué : chef de service, sous-direction des carrières, visa du DRH, puis scan du papier.",
      "Sur cet écran, une demande prête se signe, se rejette ou se décale. La signature exige la signature électronique. Un conflit de quorum empêche de signer.",
    ],
    obligations: [
      "Le départ doit respecter le quorum de présence du service. Un conflit de quorum bloque la signature.",
      "L'arrêté du DRH n'est prêt qu'après les visas du circuit et l'intérim, lorsqu'il est exigé.",
      "Les droits acquis, le consommé et le reliquat du dossier font foi.",
    ],
    fonctionnement: [
      "La campagne fixe le cadrage et les échéances de l'exercice.",
      "Chaque demande est en instruction : prête pour signature, approbation automatique, remplacement, conflit de quorum, signée, rejetée ou à décaler.",
      "Le relevé individuel se télécharge depuis le dossier de l'agent.",
    ],
    fonctionnalites: [
      "Suivre la campagne et le plan de service.",
      "Arbitrer une demande et son intérim.",
      "Repérer les conflits de quorum.",
      "Consulter le reliquat dans le dossier.",
    ],
    exports: [
      "Le bouton Exporter l'état des congés, en haut de page, télécharge etat-conges-{exercice}.pdf : le plan de l'exercice.",
      "Le relevé d'un agent se prend dans son dossier, onglet Congés : conges-{matricule}.pdf.",
    ],
    marche: [
      "Ouvrez Congés et repérez les demandes prêtes pour signature.",
      "Écartez ou décalez celles qui cassent le quorum.",
      "Faites viser l'arrêté, puis versez le scan au dossier pour ouvrir le droit.",
    ],
  },
  {
    id: "discipline",
    icone: "gavel",
    titre: "Procédures disciplinaires",
    chemin: "/app/carrieres/procedures-disciplinaires",
    resume: "L'instruction devant la commission, du grief jusqu'à la sanction ou au classement.",
    fait: [
      "Il conduit une procédure disciplinaire, du grief notifié à l'agent jusqu'à la décision de la commission.",
      "Il sert à convoquer, à recueillir la réponse et les avis, puis à prononcer une sanction ou à classer sans suite.",
    ],
    cas: [
      "Des retards répétés sont signalés. Vous ouvrez la procédure, vous émettez la convocation, et vous attendez la réponse avant le délibéré.",
      "La commission classe sans suite. Le dossier s'arrête là. Une sanction du premier degré, elle, s'efface après trois ans sans récidive.",
    ],
    circuit: [
      "La procédure s'ouvre en instruction, puis la recevabilité est examinée.",
      "La convocation notifie les griefs. La procédure attend la réponse de l'agent, puis le visa du rapporteur.",
      "La commission délibère. La procédure se termine par une sanction prononcée ou un classement sans suite.",
    ],
    obligations: [
      "Le contradictoire est obligatoire : la convocation notifie les griefs et le délai de réponse.",
      "Le degré encouru va de 1 à 3. Une sanction du premier degré s'efface après trois ans sans récidive.",
      "La convocation est signée par le DRH, ou par l'intérimaire si la signature du titulaire n'est pas lisible.",
    ],
    fonctionnement: [
      "Une procédure porte la référence, l'agent, le grief, le degré, le rapporteur et le stade.",
      "Les stades suivent l'instruction, la recevabilité, l'attente de réponse, le visa du rapporteur, le délibéré, la sanction ou le classement sans suite.",
      "La convocation PDF rappelle l'identité, le dossier d'instruction et le délai.",
    ],
    fonctionnalites: [
      "Ouvrir et suivre une procédure.",
      "Générer la convocation.",
      "Enregistrer l'avis à chaque stade.",
      "Prononcer la sanction ou classer.",
    ],
    exports: [
      "Générer la convocation, depuis la ligne du registre ou le dossier d'instruction, produit convocation-{référence}.pdf.",
      "La convocation rappelle l'identité, les griefs, le dossier d'instruction et le délai de réponse.",
    ],
    marche: [
      "Ouvrez la procédure et vérifiez le grief et le degré.",
      "Émettez la convocation et attendez la réponse dans le délai.",
      "Recueillez le visa du rapporteur, puis délibérez.",
    ],
  },
  {
    id: "fin-carriere",
    icone: "elderly",
    titre: "Fin de carrière",
    chemin: "/app/carrieres/fin-de-carriere",
    resume: "Les départs à la limite d'âge et la préparation de la relève.",
    fait: [
      "Il anticipe les départs à la retraite à partir de l'âge et du grade.",
      "Il sert à voir qui quitte les cadres dans les douze mois, et à préparer le successeur et le dossier de pension avant la radiation.",
    ],
    cas: [
      "Un directeur de grade A4 atteint 65 ans dans dix mois. Vous ouvrez son dossier de retraite et vous désignez le successeur du poste de direction.",
      "Un agent de catégorie B atteint 60 ans. L'admission s'ouvre d'elle-même. Le dossier suit la visite, la quittance, l'arrêté, puis la CGRAE.",
    ],
    circuit: [
      "Le départ à la limite d'âge s'ouvre de lui-même. Les autres motifs de sortie sont saisis.",
      "Le dossier suit ensuite la visite médicale de sortie, la quittance de fin de gestion et l'arrêté signé.",
      "Le dossier est transmis à la CGRAE, puis la CGRAE est notifiée.",
    ],
    obligations: [
      "La limite d'âge est de 65 ans pour les grades A4 à A7, et de 60 ans pour les autres grades.",
      "Un poste de direction sans successeur désigné doit être signalé avant le départ.",
    ],
    fonctionnement: [
      "L'écran projette la radiation des cadres à partir de la date de naissance et du grade.",
      "Le dossier de l'agent rappelle la même projection : prochain échelon et date de radiation.",
      "Les départs proches alimentent aussi les points d'attention du rapport 360.",
    ],
    fonctionnalites: [
      "Lister les agents proches de la limite d'âge.",
      "Identifier les postes de direction concernés.",
      "Préparer le dossier de fin de carrière.",
    ],
    marche: [
      "Ouvrez Fin de carrière et triez par échéance.",
      "Pour chaque départ à douze mois, vérifiez le successeur et le dossier de pension.",
    ],
  },
  {
    id: "social",
    icone: "volunteer_activism",
    titre: "Action sociale",
    chemin: "/app/action-sociale",
    resume: "Les aides, prêts et secours, et la quotité cessible de l'agent.",
    fait: [
      "Il instruit les prestations sociales : aides, prêts et secours, pour l'agent ou un ayant droit.",
      "Il sert à vérifier que le montant tient dans la quotité et dans l'enveloppe, puis à faire passer la commission jusqu'au mandat.",
    ],
    cas: [
      "Un secours décès est déposé avec l'acte. La quotité couvre le montant. Vous transmettez à la commission, puis vous mandatez une fois la requête conforme.",
      "La facture manque. La requête reste en pièces manquantes et ne peut pas être mandatée.",
    ],
    circuit: [
      "La requête attend l'avis de la commission.",
      "Des pièces manquantes la renvoient. Une requête complète et conforme part à l'ordonnancement.",
      "Seule une requête conforme se mandate. Le mandat la verse au dossier de l'agent.",
    ],
    obligations: [
      "Une demande incomplète reste en pièces manquantes tant que le justificatif n'est pas versé.",
      "Le montant engagé ne peut pas dépasser la quotité cessible ni la marge restante de l'agent.",
      "L'enveloppe de l'exercice borne les mandats de l'organisme.",
    ],
    fonctionnement: [
      "Chaque prestation a une référence, une nature, un objet, un montant, un ayant droit et un statut d'instruction.",
      "Les états vont de l'avis de la commission au mandat, en passant par la conformité et les pièces manquantes.",
      "Le dossier social de l'agent rappelle le numéro CMU, le solde net, la quotité et la marge.",
      "Le rapport social PDF se télécharge depuis le dossier.",
    ],
    fonctionnalites: [
      "Instruire une aide, un prêt ou un secours.",
      "Suivre la commission, l'ordonnancement et le mandat.",
      "Consulter les ayants droit et l'enveloppe.",
      "Exporter le rapport social d'un agent.",
    ],
    exports: [
      "L'écran Action sociale ne produit pas de fichier. Le rapport se prend dans le dossier de l'agent, onglet Action sociale.",
      "Le bouton Rapport annuel social (PDF) télécharge social-{matricule}.pdf : prestations, quotité et ayants droit de cet agent.",
    ],
    marche: [
      "Ouvrez la demande et contrôlez les pièces et la quotité.",
      "Transmettez à la commission si le dossier est complet.",
      "Après mandat, la prestation figure au dossier de l'agent.",
    ],
  },
  {
    id: "formation",
    icone: "school",
    titre: "Formation continue",
    chemin: "/app/formation",
    resume: "Le plan, le catalogue, les sessions, les candidatures et le passeport de compétences.",
    fait: [
      "Il tient le plan de formation de l'exercice : le catalogue, les sessions, les candidatures et le passeport de chaque agent.",
      "Il sert à ouvrir une session, à viser les inscriptions et à verser les heures et la certification au dossier.",
    ],
    cas: [
      "Une session de rédaction a encore deux places. Vous visez la candidature du chef de service, la sous-direction contrôle, le DRH notifie l'agent.",
      "La session affiche complet. La candidature suivante ne part pas au DRH. Vous orientez l'agent vers une autre date du catalogue.",
    ],
    circuit: [
      "L'agent dépose l'inscription. La requête est enregistrée.",
      "Le chef de service vise, puis la sous-direction de la formation continue contrôle le dossier.",
      "Le DRH vise. L'agent est notifié de sa prise en compte. Une session complète ou fermée ne se transmet pas.",
    ],
    obligations: [
      "Une candidature ne se transmet pas au DRH si la session est déjà complète ou fermée.",
      "L'inscription suit le circuit de visas jusqu'à la notification à l'agent.",
      "Le plan de formation reste dans le cadrage de l'exercice.",
    ],
    fonctionnement: [
      "Le pilotage montre le recensement des besoins, le budget, les évaluations et les prochaines sessions.",
      "Les rubriques couvrent le catalogue, les sessions, les candidatures, les prestataires et le passeport.",
      "Depuis le dossier, l'agent s'inscrit à une session ouverte. Les heures et la certification sont versées à son dossier.",
    ],
    fonctionnalites: [
      "Paramétrer le plan et suivre les indicateurs.",
      "Ouvrir ou fermer une session.",
      "Valider une étape du circuit d'inscription.",
      "Exporter le tableau de la formation.",
    ],
    exports: [
      "Le bouton Exporter le plan (XLSX), en haut de page, télécharge plan-formation-2026.xlsx.",
      "Une ligne du classeur correspond à un module : type, état, dates, heures, lieu, prestataire, places, retenus et montants.",
    ],
    marche: [
      "Vérifiez les places restantes avant de viser une candidature.",
      "Validez l'étape de votre niveau. La dernière étape notifie l'agent.",
      "Après la session, la formation et les heures apparaissent dans le dossier et dans le PDF.",
    ],
  },
  {
    id: "besoins",
    icone: "groups",
    titre: "Expression des besoins",
    chemin: "/app/gpec/expression-des-besoins",
    resume: "Les fiches de besoin de l'exercice, dans la limite des plafonds d'emplois.",
    fait: [
      "Il recueille, structure par structure, les postes dont le ministère a besoin pour l'exercice.",
      "Il sert à déposer une fiche, à la faire instruire et à obtenir un avis : postes accordés, complément demandé ou rejet.",
    ],
    cas: [
      "Une direction perd deux départs à la retraite. Elle dépose une fiche de remplacement, marquée critique, dans la limite du plafond.",
      "Le volume demandé dépasse le plafond. L'avis accorde moins de postes, ou renvoie la fiche pour complément.",
    ],
    circuit: [
      "La fiche est déposée et reste en attente d'avis technique.",
      "L'arbitrage la rend favorable, la renvoie pour complément, ou la rejette.",
      "L'avis favorable indique les postes accordés. Ce nombre ne peut pas dépasser le volume demandé.",
    ],
    obligations: [
      "Une fiche se dépose pendant la campagne ouverte, dans le cadrage des plafonds.",
      "Un volume qui dépasse le plafond est rejeté ou renvoyé.",
      "Une fiche critique doit être motivée : départ, risque ou renfort.",
    ],
    fonctionnement: [
      "La fiche nomme la structure, le profil, le grade, la spécialité, le volume et la nature : création, remplacement, mobilité ou renfort.",
      "Les statuts sont l'instruction technique, le complément, l'avis favorable ou le rejet.",
      "Le nombre de postes accordés peut être inférieur au volume demandé.",
    ],
    fonctionnalites: [
      "Déposer et suivre une fiche.",
      "Marquer une fiche critique.",
      "Arbitrer, renvoyer ou rejeter.",
    ],
    exports: [
      "Le bouton Exporter le plan, en haut de page, télécharge plan-besoins-{date}.pdf.",
      "C'est le plan prévisionnel des fiches déposées pour l'exercice.",
    ],
    marche: [
      "Déposez la fiche avec le motif et le volume.",
      "Suivez l'avis technique. Répondez si un complément est demandé.",
      "L'avis favorable indique les postes accordés.",
    ],
  },
  {
    id: "recrutement",
    icone: "person_add",
    titre: "Recrutement et dotation",
    chemin: "/app/gpec/recrutement",
    resume: "Les plafonds d'emplois, les mouvements de postes et les postes critiques non pourvus.",
    fait: [
      "Il applique les plafonds d'emplois et suit les mouvements : affectation, mise à disposition, redéploiement et réaffectation.",
      "Il sert à accorder un poste dans la marge du plafond, et à signaler un emploi critique qui reste vacant.",
    ],
    cas: [
      "Un emploi d'ingénieur est déjà tenu dans le ministère et reste vacant. Vous le signalez, vous choisissez cet intitulé, puis vous lancez l'appel.",
      "Une affectation ferait dépasser le plafond de la branche. La demande est rejetée. Vous exportez la gestion PDF pour l'arbitrage.",
    ],
    circuit: [
      "La demande entre en arbitrage, puis au contrôle des emplois.",
      "L'avis favorable l'acte. Le dépassement du plafond la rejette.",
      "Seule une demande actée se notifie. Une alerte de poste critique se saisit directement : elle ne suit pas ce circuit.",
    ],
    obligations: [
      "On ne pourvoit pas un emploi avec une personne extérieure au ministère. La liste des postes est celle des emplois déjà tenus par des agents.",
      "Une demande qui dépasse le plafond de la branche est rejetée.",
      "Les boutons Exporter le registre, Gestion (PDF) et Historique portent sur toute la dotation, pas sur un seul onglet.",
    ],
    fonctionnement: [
      "L'exercice fixe les plafonds par branche et le fondement (décret).",
      "Les mouvements sont l'affectation, la mise à disposition, le redéploiement et la réaffectation après concours.",
      "Les postes critiques non pourvus sont saisis ici : structure, intitulé reconnu, nombre de postes, ancienneté de la vacance, situation et piste. Ils ne sont pas calculés automatiquement.",
      "Lancer un appel transforme les alertes ouvertes en demandes d'affectation.",
    ],
    fonctionnalites: [
      "Saisir, modifier, consulter et retirer une alerte de poste critique.",
      "Instruire une demande de dotation.",
      "Exporter le registre Excel et la gestion complète en PDF.",
      "Lire le journal des décisions.",
    ],
    exports: [
      "Exporter le registre, dans l'en-tête de la page, télécharge registre-dotation-{date}.xlsx : une ligne par demande, avec la référence, l'entité, le poste, la nature, l'impact, le statut et le visa.",
      "Gestion (PDF), au même endroit, télécharge gestion-dotation-{année}.pdf, la gestion complète de l'exercice. Les deux portent sur toute la dotation, pas sur un seul onglet.",
      "Historique ouvre le journal à l'écran. Il ne télécharge pas de fichier.",
    ],
    marche: [
      "Contrôlez le plafond de la branche avant d'accorder un poste.",
      "Pour un poste vacant, cliquez Signaler un poste, choisissez un intitulé déjà tenu dans le ministère, puis enregistrez.",
      "Exportez la gestion PDF pour l'arbitrage de l'exercice.",
    ],
  },
  {
    id: "communication",
    icone: "campaign",
    titre: "Communication",
    chemin: "/app/communication",
    resume: "Les notes, circulaires et annonces, du brouillon jusqu'à la publication.",
    fait: [
      "Il fait circuler les notes, circulaires et annonces, du brouillon jusqu'à la lecture par les agents.",
      "Il sert à rédiger, à faire viser par le DRH, à diffuser aux destinataires et à publier sur l'accueil ce qui doit être vu de tous.",
    ],
    cas: [
      "Une note de service doit être lue par tous les gestionnaires. Vous la rédigez, le DRH la vise, elle est diffusée, et les émargements suivent les lectures.",
      "Une annonce de campagne doit apparaître sans connexion. Après le visa, le DRH la rend publique : elle seule s'affiche sur l'accueil.",
    ],
    circuit: [
      "La publication est un brouillon, puis elle est soumise au visa du DRH.",
      "Seul le directeur des ressources humaines vise. La publication est alors diffusée et les destinataires sont notifiés.",
      "Le DRH peut la rendre publique sur l'accueil. L'archivage clôt la publication.",
    ],
    obligations: [
      "Une publication n'est diffusée qu'après le visa du DRH.",
      "Seule une publication rendue publique apparaît sur la page d'accueil.",
      "Le sondage, lorsqu'il est ouvert, n'accepte qu'une réponse par compte.",
    ],
    fonctionnement: [
      "Le circuit va du brouillon au visa, puis à la diffusion.",
      "Les annonces publiques sont lues par les agents, avec émargement.",
    ],
    fonctionnalites: [
      "Rédiger une note et joindre une pièce.",
      "Viser, diffuser et publier sur l'accueil.",
      "Suivre les émargements.",
      "Télécharger l'acte d'une publication et la pièce jointe.",
    ],
    exports: [
      "Acte PDF, sur une publication, télécharge publication-{identifiant}.pdf.",
      "La pièce jointe se télécharge à part, sous son nom d'origine.",
      "Exporter le rapport, lorsqu'un sondage est ouvert, télécharge consultation-flash.pdf.",
      "Télécharger le modèle prépare modele-communications.xlsx pour un import. Il n'y a pas d'export du registre entier.",
    ],
    marche: [
      "Rédigez, joignez la pièce, envoyez au visa.",
      "Le DRH vise. La diffusion notifie les destinataires.",
      "Rendez publique seulement l'annonce destinée à l'accueil.",
    ],
  },
  {
    id: "circuits",
    icone: "approval_delegation",
    titre: "Circuits de validation",
    chemin: "/app/circuits",
    resume: "Les chaînes de visas appliquées aux congés, aux absences et aux demandes.",
    fait: [
      "Il définit qui signe, et dans quel ordre, pour un type de congé ou d'absence.",
      "Il sert à ce que chaque demande suive toujours le même chemin, du dépôt jusqu'au versement du scan.",
    ],
    cas: [
      "Le congé annuel doit passer par le chef de service puis le DRH, alors que la permission d'absence s'arrête au chef. Vous créez deux circuits et vous les attachez chacun à son type.",
      "Vous déposez une demande d'essai. Le dossier s'arrête à l'étape 2 tant que le chef n'a pas visé, puis il avance dans l'ordre que vous avez écrit.",
    ],
    circuit: [
      "Ce module ne vise pas une demande. Il compose les chaînes que les autres modules appliqueront.",
      "Vous nommez les étapes, dans l'ordre, puis vous attachez le circuit à un type de congé ou d'absence.",
      "Un congé déposé ensuite suit ces étapes. Un type sans circuit attribué suit la chaîne par défaut : chef de service, sous-direction, DRH, puis scan du papier.",
    ],
    obligations: [
      "Chaque étape nomme une instance et une fonction. L'ordre des étapes est celui du circuit.",
      "Un circuit attribué à un type de congé ou d'absence s'applique à toutes les demandes de ce type.",
    ],
    fonctionnement: [
      "Vous composez les étapes, puis vous attachez le circuit au type concerné.",
      "La demande déroule les visas dans l'ordre : chef de service, sous-direction, DRH, puis versement du scan.",
      "Le commentaire de chaque visa reste au dossier de la demande.",
    ],
    fonctionnalites: [
      "Créer et modifier un circuit.",
      "Attribuer le circuit à un congé ou à une absence.",
      "Relire les visas déjà apposés.",
    ],
    marche: [
      "Décrivez les étapes dans l'ordre réel de signature.",
      "Attachez le circuit au type, puis déposez une demande d'essai pour vérifier le chemin.",
    ],
  },
  {
    id: "habilitations",
    icone: "admin_panel_settings",
    titre: "Habilitations",
    chemin: "/app/circuits#rbac",
    resume: "La matrice des droits par rôle, et les exceptions propres à un compte.",
    fait: [
      "Il décide ce que chaque rôle peut voir et faire dans les menus : rien, lire, saisir ou valider.",
      "Il sert à ouvrir un écran à un métier, à le fermer à un autre, ou à accorder à un compte un droit différent de celui de son rôle.",
    ],
    cas: [
      "Les chefs de service doivent viser les congés, pas modifier les structures. Vous laissez la validation sur Congés et le refus sur Structures du ministère.",
      "Un gestionnaire remplace le DRH pendant un congé. L'intérim lui ouvre la compétence du poste couvert, pas davantage.",
    ],
    circuit: [
      "Il n'y a pas de visa de document. La matrice décide qui peut lire, saisir ou valider dans chaque menu.",
      "Le droit « validation » est celui qui permet d'apposer les visas des autres modules.",
      "Une personnalisation de compte s'applique à la reconnexion, sans étape intermédiaire.",
    ],
    obligations: [
      "Le rôle doit correspondre au niveau de la structure : agent, chef de service, sous-directeur, directeur ou directeur général.",
      "Une délégation ne peut pas dépasser les droits du délégant ni sortir de son équipe.",
      "Le DRH conserve la vue sur l'ensemble des agents.",
    ],
    fonctionnement: [
      "La matrice donne, pour chaque rôle et chaque fonction de menu, un droit : refus, lecture, saisie ou validation.",
      "Un compte peut recevoir une liste personnelle. Tant qu'elle est vide, les droits du rôle s'appliquent.",
      "L'intérim d'un poste vacant étend la compétence au poste couvert, dans la limite de ce poste.",
    ],
    fonctionnalites: [
      "Modifier la matrice des rôles.",
      "Personnaliser les droits d'un compte et une fonction précise.",
      "Retirer la personnalisation pour revenir au rôle.",
    ],
    marche: [
      "Ouvrez Habilitations depuis le menu.",
      "Ajustez le rôle, puis, seulement si ce compte doit s'écarter du rôle, enregistrez une personnalisation.",
      "Demandez à l'agent de se reconnecter pour voir le menu à jour.",
    ],
  },
  {
    id: "statistiques",
    icone: "bar_chart",
    titre: "Statistiques",
    chemin: "/app/statistiques",
    resume: "L'observatoire des effectifs, filtré par exercice, structure et segment.",
    fait: [
      "Il mesure les effectifs selon l'exercice, la structure et le segment statutaire.",
      "Il sert à comparer les âges, les corps et les absences, à croiser des dossiers, et à sortir un état chiffré pour l'arbitrage.",
    ],
    cas: [
      "Le cabinet demande les effectifs de la DGPE, catégorie A, pour 2026. Vous filtrez, puis vous exportez la synthèse PDF : les totaux se reportent d'une page à l'autre.",
      "Vous suivez chaque mois la même composition « absences par structure ». Vous l'enregistrez et vous la rouvrez à l'exercice suivant.",
    ],
    circuit: [
      "Il n'y a pas de visa. Les chiffres se lisent et s'exportent selon le filtre affiché.",
      "L'export Excel ou PDF ne modifie aucun dossier.",
    ],
    obligations: [
      "Les chiffres exportés respectent le filtre affiché à l'écran.",
      "La synthèse PDF est un état de tableaux. Les totaux se reportent d'une page à l'autre.",
    ],
    fonctionnement: [
      "Vous choisissez l'exercice, la structure et le segment statutaire.",
      "Les blocs comparent les effectifs, les âges, les corps et les absences.",
      "Une composition enregistrée croise des dossiers selon les axes que vous choisissez.",
      "L'export Excel et la synthèse PDF reprennent le même périmètre filtré.",
    ],
    fonctionnalites: [
      "Filtrer et lire les tableaux.",
      "Exporter un classeur Excel.",
      "Exporter la synthèse PDF, avec total à reporter et report en haut de la page suivante.",
      "Enregistrer une composition.",
    ],
    exports: [
      "Données (XLSX) télécharge statistiques-{exercice}.xlsx. Synthèse (PDF) télécharge statistiques-{exercice}.pdf. Les deux gardent l'exercice, la structure et le segment affichés.",
      "La synthèse est un état de tableaux : les totaux se reportent en haut de la page suivante.",
      "L'icône Excel d'un graphique exporte les séries de ce graphique. Le fichier porte le nom du graphique.",
      "Séries pluriannuelles, matrice par structure et résultat d'une composition ont chacun un bouton Exporter. Le classeur reprend le filtre en cours, pas seulement la page affichée.",
    ],
    marche: [
      "Réglez le filtre avant d'exporter : le PDF et le classeur gardent ce filtre.",
      "Pour un suivi régulier, enregistrez la composition et rouvrez-la à l'exercice suivant.",
    ],
  },
  {
    id: "utilisateurs",
    icone: "manage_accounts",
    titre: "Gestion des utilisateurs",
    chemin: "/app/utilisateurs",
    resume: "Les comptes, leur structure, leur supérieur et leur mot de passe.",
    fait: [
      "Il crée et tient les comptes qui entrent dans l'application.",
      "Il sert à rattacher chaque personne à sa structure, à son supérieur et à son rôle, et à désigner qui assure l'intérim d'un poste.",
    ],
    cas: [
      "Une nouvelle sous-direction est créée. Vous créez d'abord le compte du sous-directeur, sans supérieur s'il est le premier responsable, puis les agents qui en dépendent.",
      "Le chef est absent trois semaines. Vous désignez l'intérim sur son compte : le remplaçant couvre ce poste, dans la limite des droits de ce poste.",
    ],
    circuit: [
      "La création du compte est immédiate, après le contrôle du rôle, de la structure et du supérieur.",
      "Il n'y a pas de visa. L'intérim étend la compétence au poste couvert, dans la limite de ce poste.",
    ],
    obligations: [
      "Un agent a pour supérieur le premier responsable de sa structure.",
      "Une structure n'a qu'un premier responsable. Le rôle doit coller au niveau de cette structure.",
      "Le premier responsable d'une structure racine n'a pas de supérieur.",
    ],
    fonctionnement: [
      "La création demande le matricule, le nom, la fonction, le rôle, la structure, le supérieur et le mot de passe confirmé.",
      "Le système signale un rattachement incohérent : rôle impropre, supérieur absent, ou poste déjà pourvu.",
      "L'intérim désigne le poste dont le compte assure les fonctions en l'absence du titulaire.",
    ],
    fonctionnalites: [
      "Créer, modifier et retirer un compte.",
      "Rattacher le supérieur hiérarchique.",
      "Désigner un intérim.",
      "Personnaliser les habilitations du compte.",
    ],
    marche: [
      "Créez d'abord le responsable de la structure, puis les agents qui en dépendent.",
      "Vérifiez l'alerte de hiérarchie avant de remettre le mot de passe.",
    ],
  },
  {
    id: "structures",
    icone: "account_tree",
    titre: "Structures du ministère",
    chemin: "/app/structures",
    resume: "L'organigramme, les pôles, les grades et le référentiel des emplois.",
    fait: [
      "Il décrit l'organigramme du ministère : les pôles, les directions, les services, les grades et les emplois de référence.",
      "Il sert de socle aux comptes, aux affectations et aux fiches de besoin : sans structure, le reste ne se rattache pas.",
    ],
    cas: [
      "Le ministère crée une sous-direction du numérique. Vous ajoutez la structure sous sa direction, puis vous rattachez les comptes dans Gestion des utilisateurs.",
      "Vous ajoutez un emploi au référentiel pour la nomenclature. Il n'apparaît dans la liste des postes de la dotation que lorsqu'un agent le tient déjà.",
    ],
    circuit: [
      "La création d'un pôle, d'une structure, d'un grade ou d'un emploi est immédiate.",
      "Il n'y a pas de visa. Une structure qui porte encore des comptes ou des demandes ne se retire pas.",
    ],
    obligations: [
      "Une structure se range sous son parent : direction générale, direction, sous-direction ou service.",
      "On ne retire pas une structure qui porte encore des comptes ou des demandes.",
      "Le référentiel des emplois sert la nomenclature. La liste des postes de la dotation, elle, vient des emplois déjà tenus par les agents.",
    ],
    fonctionnement: [
      "Les pôles regroupent les structures. Chaque structure a un code, un nom, un niveau et un parent.",
      "Les grades portent la catégorie et l'état en vigueur.",
      "Les emplois du référentiel sont classés par famille et par grade.",
    ],
    fonctionnalites: [
      "Créer et modifier un pôle ou une structure.",
      "Tenir les grades et les emplois.",
      "Filtrer l'organigramme par pôle.",
    ],
    exports: [
      "Télécharger le modèle prépare modele-structures.xlsx, le classeur vierge pour importer des structures.",
      "L'organigramme, les grades et les emplois ne s'exportent pas en l'état.",
    ],
    marche: [
      "Créez le pôle, puis les directions, puis les services.",
      "Rattachez ensuite les comptes dans Gestion des utilisateurs.",
    ],
  },
];

function parId(id: string): ModuleAide {
  const trouve = MODULES.find((item) => item.id === id);
  if (!trouve) throw new Error(id);
  return trouve;
}

type Rubrique =
  | { genre: "page"; module: ModuleAide }
  | { genre: "groupe"; id: string; icone: string; titre: string; chemin: string; resume: string; cas: string[]; enfants: ModuleAide[] };

const RUBRIQUES: Rubrique[] = [
  { genre: "page", module: parId("vue-ensemble") },
  { genre: "page", module: parId("dossier") },
  {
    genre: "groupe",
    id: "menu-carrieres",
    icone: "assignment",
    titre: "Carrières et actes",
    chemin: "/app/carrieres",
    resume: "Le menu regroupe l'avancement et les mouvements qui suivent la vie administrative de l'agent.",
    cas: [
      "Vous préparez la commission : Accueil pour le tableau, Situation pour vérifier le grade, Congés pour le reliquat, Discipline pour une sanction encore inscrite.",
      "Un départ est proche. Fin de carrière donne la date, Absences dit si une autorisation court encore, et le dossier numérique rassemble le tout.",
    ],
    enfants: ["carrieres", "situation", "absences", "conges", "discipline", "fin-carriere"].map(parId),
  },
  { genre: "page", module: parId("social") },
  { genre: "page", module: parId("formation") },
  {
    genre: "groupe",
    id: "menu-gpec",
    icone: "groups",
    titre: "GPEC",
    chemin: "/app/gpec/expression-des-besoins",
    resume: "Le menu relie ce que les structures demandent et la façon dont les postes sont pourvus, dans les plafonds.",
    cas: [
      "La campagne est ouverte. Expression des besoins recueille les fiches. Recrutement transforme les postes accordés en affectations, sans dépasser le plafond.",
      "Un emploi vacant est déjà tenu dans le ministère. Vous le signalez dans Recrutement, pas dans une fiche de création.",
    ],
    enfants: ["besoins", "recrutement"].map(parId),
  },
  { genre: "page", module: parId("communication") },
  { genre: "page", module: parId("circuits") },
  { genre: "page", module: parId("habilitations") },
  { genre: "page", module: parId("statistiques") },
  { genre: "page", module: parId("utilisateurs") },
  { genre: "page", module: parId("structures") },
];

const LIEN_SOMMAIRE = "flex items-start gap-2 rounded px-2 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-primary-fixed hover:text-on-primary-fixed";

export function AideScreen() {
  useEffect(() => {
    function ouvrirAncre() {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      const noeud = document.getElementById(id);
      if (!noeud) return;
      let courant: HTMLElement | null = noeud;
      while (courant) {
        if (courant instanceof HTMLDetailsElement) courant.open = true;
        courant = courant.parentElement;
      }
      noeud.scrollIntoView({ block: "start" });
    }
    ouvrirAncre();
    window.addEventListener("hashchange", ouvrirAncre);
    return () => window.removeEventListener("hashchange", ouvrirAncre);
  }, []);

  return (
    <AppChrome>
      <div className={PAGE}>
        <div className="grid grid-cols-1 xl:grid-cols-[16rem_minmax(0,1fr)] gap-8 items-start">
          <nav aria-label="Sommaire de l'aide" className="xl:sticky xl:top-24 rounded-xl border border-hairline bg-surface-container-lowest overflow-hidden">
            <Bandeau />
            <div className="p-4">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold px-2">Sommaire</p>
              <ol className="mt-2 space-y-0.5">
                <li>
                  <a href="#communs" className="block rounded px-2 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-primary-fixed hover:text-on-primary-fixed">
                    Règles communes
                  </a>
                </li>
                <li>
                  <a href="#barre" className="block rounded px-2 py-1.5 font-body-sm text-body-sm text-on-surface hover:bg-primary-fixed hover:text-on-primary-fixed">
                    Barre du haut
                  </a>
                </li>
                {RUBRIQUES.map((rubrique, index) => (
                  <li key={rubrique.genre === "page" ? rubrique.module.id : rubrique.id}>
                    {rubrique.genre === "page" ? (
                      <a href={`#${rubrique.module.id}`} className={LIEN_SOMMAIRE}>
                        <span className="font-code-num text-code-num text-primary shrink-0">{String(index + 1).padStart(2, "0")}</span>
                        <span>{rubrique.module.titre}</span>
                      </a>
                    ) : (
                      <div>
                        <a href={`#${rubrique.id}`} className={LIEN_SOMMAIRE}>
                          <span className="font-code-num text-code-num text-primary shrink-0">{String(index + 1).padStart(2, "0")}</span>
                          <span>{rubrique.titre}</span>
                        </a>
                        <ol className="mt-0.5">
                          {rubrique.enfants.map((enfant) => (
                            <li key={enfant.id}>
                              <a href={`#${enfant.id}`} className="block rounded py-1 pl-9 pr-2 font-body-sm text-body-sm text-on-surface-variant hover:bg-secondary-fixed hover:text-on-secondary-fixed">
                                {enfant.titre}
                              </a>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="space-y-8 min-w-0">
            <header className="rounded-xl overflow-hidden bg-primary text-on-primary">
              <Bandeau />
              <div className="p-6 sm:p-8">
                <h1 className="font-headline-lg text-headline-lg">Comment utiliser le SIGRH</h1>
                <p className="font-body-md text-body-md text-primary-fixed mt-3 max-w-3xl">
                  Chaque module dit ce qu'il fait, dans quel cas vous vous en servez, et quel circuit il suit. Les menus qui ont des sous-menus se déplient. Le menu que vous voyez dépend de votre habilitation.
                </p>
              </div>
            </header>

            <section id="communs" className="scroll-mt-24 space-y-4" aria-labelledby="titre-communs">
              <h2 id="titre-communs" className="font-headline-sm text-headline-sm text-on-surface">Règles communes</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {COMMUNS.map((bloc, index) => (
                  <Encart key={bloc.titre} ton={TONS_CARTES[index % TONS_CARTES.length]} titre={bloc.titre} lignes={bloc.lignes} />
                ))}
              </div>
            </section>

            <section id="barre" className="scroll-mt-24 space-y-4" aria-labelledby="titre-barre">
              <h2 id="titre-barre" className="font-headline-sm text-headline-sm text-on-surface">Barre du haut</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {BARRE.map((bloc, index) => (
                  <Encart key={bloc.titre} ton={TONS_CARTES[index % TONS_CARTES.length]} titre={bloc.titre} lignes={bloc.lignes} />
                ))}
              </div>
            </section>

            {RUBRIQUES.map((rubrique) => (
              rubrique.genre === "page" ? <CarteModule key={rubrique.module.id} module={rubrique.module} /> : <GroupeMenu key={rubrique.id} groupe={rubrique} />
            ))}
          </div>
        </div>
      </div>
    </AppChrome>
  );
}

type Ton = { fond: string; texte: string; puce: string };

const TONS = {
  fait: { fond: "bg-primary-fixed", texte: "text-on-primary-fixed", puce: "bg-primary text-on-primary" },
  circuit: { fond: "bg-secondary-fixed", texte: "text-on-secondary-fixed", puce: "bg-secondary text-on-secondary" },
  obligations: { fond: "bg-error-container", texte: "text-on-error-container", puce: "bg-error text-on-error" },
  fonctionnement: { fond: "bg-tertiary-fixed", texte: "text-on-tertiary-fixed", puce: "bg-tertiary text-on-tertiary" },
  fonctions: { fond: "bg-primary-container", texte: "text-on-primary", puce: "bg-primary-fixed text-on-primary-fixed" },
  exports: { fond: "bg-inverse-surface", texte: "text-inverse-on-surface", puce: "bg-secondary-container text-on-secondary-container" },
  marche: { fond: "bg-primary-fixed-dim", texte: "text-on-primary-fixed", puce: "bg-primary text-on-primary" },
  cas: { fond: "bg-secondary-fixed-dim", texte: "text-on-secondary-fixed", puce: "bg-secondary text-on-secondary" },
} as const;

const TONS_CARTES = [TONS.fait, TONS.fonctionnement, TONS.circuit];

function Bandeau() {
  return (
    <div className="h-1.5 flex" aria-hidden="true">
      <div className="w-1/3 bg-secondary-container" />
      <div className="w-1/3 bg-primary-fixed" />
      <div className="w-1/3 bg-primary" />
    </div>
  );
}

function Encart({ ton, titre, lignes }: { ton: Ton; titre: string; lignes: string[] }) {
  return (
    <article className={`rounded-xl p-5 ${ton.fond} ${ton.texte}`}>
      <h3 className="font-label-lg text-label-lg font-bold">{titre}</h3>
      <ul className="mt-3 space-y-2 list-disc pl-5 font-body-sm text-body-sm marker:text-current">
        {lignes.map((ligne) => (
          <li key={ligne} className="pl-1">{ligne}</li>
        ))}
      </ul>
    </article>
  );
}

function Partie({ titre, icone, lignes, ton, ordonne = false }: { titre: string; icone: string; lignes: string[]; ton: Ton; ordonne?: boolean }) {
  const Liste = ordonne ? "ol" : "ul";
  return (
    <section className={`rounded-lg p-4 ${ton.fond} ${ton.texte}`}>
      <h3 className="flex items-center gap-2 font-label-lg text-label-lg font-bold">
        <span className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${ton.puce}`}>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">{icone}</span>
        </span>
        {titre}
      </h3>
      <Liste className={`mt-3 space-y-2 ${ordonne ? "list-decimal pl-5" : "list-disc pl-5"} font-body-sm text-body-sm marker:text-current`}>
        {lignes.map((ligne) => (
          <li key={ligne} className="pl-1">{ligne}</li>
        ))}
      </Liste>
    </section>
  );
}

function CarteModule({ module }: { module: ModuleAide }) {
  return (
    <article id={module.id} className="scroll-mt-24 rounded-xl border border-hairline bg-surface-container-lowest overflow-hidden" aria-labelledby={`titre-${module.id}`}>
      <Bandeau />
      <div className="p-6">
        <Corps module={module} />
      </div>
    </article>
  );
}

function GroupeMenu({ groupe }: { groupe: Extract<Rubrique, { genre: "groupe" }> }) {
  return (
    <article id={groupe.id} className="scroll-mt-24 rounded-xl border border-hairline bg-surface-container-lowest overflow-hidden" aria-labelledby={`titre-${groupe.id}`}>
      <Bandeau />
      <div className="p-6">
        <Entete id={groupe.id} icone={groupe.icone} titre={groupe.titre} resume={groupe.resume} chemin={groupe.chemin} />
        <div className="mt-6">
          <Partie titre="Cas d'usage" icone="forum" lignes={groupe.cas} ton={TONS.cas} />
        </div>
      </div>
      <div>
        {groupe.enfants.map((enfant) => (
          <details key={enfant.id} id={enfant.id} className="group scroll-mt-24 border-t border-hairline">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-4 font-label-lg text-label-lg text-on-surface hover:bg-secondary-fixed [&::-webkit-details-marker]:hidden">
              <span className="w-9 h-9 rounded-md bg-secondary text-on-secondary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-lg" aria-hidden="true">{enfant.icone}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block">{enfant.titre}</span>
                <span className="block font-body-sm text-body-sm font-normal text-on-surface-variant group-open:text-on-secondary-fixed">{enfant.resume}</span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant transition-transform group-open:rotate-180" aria-hidden="true">expand_more</span>
            </summary>
            <div className="px-6 pb-6 bg-surface-container-low/50">
              <Corps module={enfant} entete={false} />
            </div>
          </details>
        ))}
      </div>
    </article>
  );
}

function Entete({ id, icone, titre, resume, chemin }: { id: string; icone: string; titre: string; resume: string; chemin: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-11 h-11 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined" aria-hidden="true">{icone}</span>
        </span>
        <div className="min-w-0">
          <h2 id={`titre-${id}`} className="font-headline-sm text-headline-sm text-on-surface">{titre}</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{resume}</p>
        </div>
      </div>
      <Link to={chemin} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container shrink-0">
        Ouvrir
        <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span>
      </Link>
    </div>
  );
}

function Corps({ module, entete = true }: { module: ModuleAide; entete?: boolean }) {
  const volets = VOLETS[module.id];
  return (
    <>
      {entete ? (
        <Entete id={module.id} icone={module.icone} titre={module.titre} resume={module.resume} chemin={module.chemin} />
      ) : (
        <div className="flex justify-end pt-2">
          <Link to={module.chemin} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container">
            Ouvrir
            <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>
      )}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="lg:col-span-2">
          <Partie titre="Fait quoi ?" icone="info" lignes={module.fait} ton={TONS.fait} />
        </div>
        <div className="lg:col-span-2">
          <Partie titre="Cas d'usage" icone="forum" lignes={module.cas} ton={TONS.cas} />
        </div>
        <div className="lg:col-span-2">
          <Partie titre="Circuit de validation" icone="conversion_path" lignes={module.circuit} ton={TONS.circuit} ordonne />
        </div>
        <Partie titre="Obligations" icone="gavel" lignes={module.obligations} ton={TONS.obligations} />
        <Partie titre="Fonctionnement" icone="account_tree" lignes={module.fonctionnement} ton={TONS.fonctionnement} />
        <Partie titre="Fonctionnalités" icone="checklist" lignes={module.fonctionnalites} ton={TONS.fonctions} />
        {module.exports?.length ? <Partie titre="Exports" icone="download" lignes={module.exports} ton={TONS.exports} /> : null}
        <Partie titre="Comment s'y prendre" icone="route" lignes={module.marche} ton={TONS.marche} ordonne />
      </div>
      {volets ? (
        <div className="mt-4 rounded-lg border border-hairline overflow-hidden bg-surface-container-lowest">
          <p className="px-4 py-3 font-label-lg text-label-lg text-on-surface bg-tertiary-fixed">Sous-menus</p>
          {volets.map((volet) => (
            <details key={volet.id} id={volet.id} className="group scroll-mt-24 border-t border-hairline">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-label-md text-label-md text-on-surface hover:bg-tertiary-fixed [&::-webkit-details-marker]:hidden">
                <span className="material-symbols-outlined text-tertiary" aria-hidden="true">subdirectory_arrow_right</span>
                <span className="flex-1">{volet.titre}</span>
                <span className="material-symbols-outlined text-on-surface-variant transition-transform group-open:rotate-180" aria-hidden="true">expand_more</span>
              </summary>
              <div className="px-4 pb-4 space-y-3">
                <p className="font-body-sm text-body-sm text-on-surface">{volet.texte}</p>
                <p className="rounded-lg bg-secondary-fixed-dim text-on-secondary-fixed p-3 font-body-sm text-body-sm">
                  <span className="font-bold">Cas. </span>{volet.cas}
                </p>
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </>
  );
}

type Volet = { id: string; titre: string; texte: string; cas: string };

const VOLETS: Record<string, Volet[]> = {
  dossier: [
    { id: "dossier-carriere", titre: "Carrière, actes et mutations", texte: "Les arrêtés et décisions versés au dossier, avec leur statut. Seul un acte validé se télécharge.", cas: "Avant de signer une mutation, vous ouvrez cet onglet et vous relisez le dernier arrêté encore en instruction." },
    { id: "dossier-notations", titre: "Notations et évaluations", texte: "Les notes de l'agent, l'évaluateur et le bulletin PDF.", cas: "La commission demande la note. Vous ouvrez l'onglet et vous sortez le bulletin individuel." },
    { id: "dossier-conges", titre: "Congés et absences", texte: "Les droits, le consommé, le reliquat et le relevé PDF.", cas: "L'agent demande 21 jours. Vous comparez au reliquat affiché ici avant de laisser partir la demande." },
    { id: "dossier-social", titre: "Action sociale et prêts", texte: "Le numéro CMU, la quotité, la marge et le rapport social PDF.", cas: "Un prêt est demandé. Vous vérifiez ici que le montant tient encore dans la quotité." },
    { id: "dossier-formation", titre: "Formation et parcours", texte: "Les sessions suivies, les heures et les certifications.", cas: "Après une session close, les heures apparaissent dans cet onglet et dans le PDF du dossier." },
    { id: "dossier-pieces", titre: "Pièces jointes", texte: "Les scans déposés, téléchargeables un par un ou en archive ZIP.", cas: "L'inspection demande le dossier. Vous exportez l'archive plutôt que de renvoyer chaque scan." },
  ],
  formation: [
    { id: "formation-pilotage", titre: "Pilotage", texte: "Les indicateurs du plan : besoins, budget, évaluations et prochaines sessions.", cas: "En début de mois, vous ouvrez Pilotage pour voir combien de candidatures attendent encore un visa." },
    { id: "formation-modules", titre: "Modules", texte: "Les sessions : dates, places, lieu, prestataire. Une session complète ou fermée ne reçoit plus de candidature.", cas: "Il reste deux places. Vous laissez la session ouverte. À complet, vous la fermez." },
    { id: "formation-candidatures", titre: "Candidatures", texte: "Chaque inscription suit le chef de service, la sous-direction, puis le visa du DRH.", cas: "Le chef a visé. Vous prenez le dossier à l'étape de la sous-direction et vous le transmettez si la pièce exigée est là." },
    { id: "formation-besoins", titre: "Besoins", texte: "Les besoins exprimés par les structures, à couvrir par une session du plan.", cas: "Trois structures demandent la même rédaction administrative. Vous ouvrez une session plutôt que trois modules isolés." },
    { id: "formation-catalogue", titre: "Catalogue", texte: "Les types de formation retenus, avec les fonctionnaires concernés et la pièce exigée.", cas: "Un nouveau cycle de dirigeants est décidé. Vous l'ajoutez au catalogue avant d'ouvrir la session." },
    { id: "formation-prestataires", titre: "Prestataires", texte: "Les organismes qui dispensent les sessions.", cas: "La session change d'organisme. Vous mettez le prestataire à jour pour que le plan Excel porte le bon nom." },
    { id: "formation-passeport", titre: "Passeport", texte: "Les compétences et certifications déjà versées aux dossiers.", cas: "Un agent postule à une session avancée. Le passeport montre qu'il a déjà le module préalable." },
  ],
  recrutement: [
    { id: "recrutement-affectation", titre: "Affectation", texte: "L'arrivée d'un fonctionnaire déjà dans le ministère sur un emploi, dans le plafond de la branche.", cas: "Un lauréat déjà matriculé rejoint la DGPE. Vous saisissez l'affectation dans cet onglet, pas une création de poste extérieur." },
    { id: "recrutement-disposition", titre: "Mise à disposition", texte: "Un agent du ministère est mis à disposition d'une autre structure, sans sortir des effectifs.", cas: "Un cadre part six mois à la présidence tout en restant payé par le ministère. Vous enregistrez la mise à disposition." },
    { id: "recrutement-redeploiement", titre: "Redéploiement", texte: "Un emploi se déplace d'une structure à une autre, dans le même plafond.", cas: "Un poste vacant de la SNDI est repris par la DGPE. Le redéploiement déplace l'emploi sans augmenter le plafond." },
    { id: "recrutement-reaffectation", titre: "Réaffectation après concours", texte: "L'agent change d'emploi après un concours professionnel.", cas: "Le concours est publié. Vous réaffectez l'agent sur le nouvel emploi, toujours choisi parmi les intitulés déjà tenus." },
    { id: "recrutement-alertes", titre: "Postes critiques", texte: "Un emploi déjà tenu, resté vacant, que vous signalez vous-même. Lancer un appel transforme les alertes ouvertes en demandes.", cas: "Le poste de directeur est vide depuis quarante jours. Vous le signalez, puis vous lancez l'appel à candidatures." },
  ],
  structures: [
    { id: "structures-organigramme", titre: "Organigramme", texte: "Les pôles, puis les directions, sous-directions et services, chacun avec son parent.", cas: "Une sous-direction est créée. Vous l'ajoutez sous sa direction avant d'y rattacher des comptes." },
    { id: "structures-grades", titre: "Grades", texte: "La catégorie et l'état en vigueur de chaque grade. La limite d'âge des grades A4 à A7 s'appuie sur cette liste.", cas: "Un grade n'est plus attribué. Vous le laissez au référentiel et vous le marquez hors vigueur, sans effacer les dossiers qui le portent." },
    { id: "structures-emplois", titre: "Emplois", texte: "Le référentiel classé par famille et par grade. Il sert la nomenclature. La dotation, elle, ne propose que les emplois déjà tenus par des agents.", cas: "Vous créez l'emploi « auditeur » dans le référentiel. Il n'entre dans la liste des postes de Recrutement que le jour où un agent le tient." },
  ],
};
