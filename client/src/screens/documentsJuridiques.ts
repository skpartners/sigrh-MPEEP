/**
 * Textes des trois documents du parcours d'adhésion. Seules les références de droit ivoirien certaines y figurent :
 * ni numéro d'article, ni contact, ni référence d'arrêté que le ministère n'aurait pas confirmés.
 * Quand un texte change, la `version` du document est aussi à changer dans api/personnel/adhesion.py :
 * les comptes devront alors le réaccepter.
 */

export type SectionJuridique = {
  id: string;
  titre: string;
  paragraphes?: string[];
  liste?: string[];
  note?: string;
};

export type DocumentJuridique = {
  titre: string;
  resume: string;
  tuiles: { libelle: string; valeur: string }[];
  sections: SectionJuridique[];
};

const MISE_A_JOUR = "Octobre 2026";

export const CGU: DocumentJuridique = {
  titre: "Conditions générales d'utilisation",
  resume:
    "Règles d'usage de SIGRH-PORTEFEUILLE, le système de gestion des ressources humaines du Ministère du Portefeuille de l'État et des Entreprises Publiques. Elles s'appliquent à toute personne qui s'y connecte.",
  tuiles: [
    { libelle: "Dernière mise à jour", valeur: MISE_A_JOUR },
    { libelle: "Utilisateurs concernés", valeur: "Agents, responsables, gestionnaires RH, administrateur" },
    { libelle: "Droit applicable", valeur: "Droit ivoirien" },
  ],
  sections: [
    {
      id: "objet",
      titre: "1. Objet",
      paragraphes: [
        "SIGRH-PORTEFEUILLE est le système d'information qui permet au Ministère du Portefeuille de l'État et des Entreprises Publiques (MPEEP) de gérer les dossiers, les carrières, les congés, les demandes d'actes, la formation et la programmation des effectifs de ses agents.",
        "En vous connectant, vous acceptez les présentes conditions. Elles s'ajoutent à la politique de confidentialité et au document de protection des données, que vous acceptez aussi lors de votre première connexion.",
      ],
    },
    {
      id: "acces",
      titre: "2. Accès et compte personnel",
      paragraphes: ["Votre compte est personnel. Votre identifiant est votre matricule, sauf pour le compte technique d'administration."],
      liste: [
        "Votre mot de passe est confidentiel : ne le communiquez à personne, pas même à un collègue ou à un administrateur, et changez le mot de passe initial dès votre première connexion.",
        "Vous êtes responsable de ce qui est fait avec votre compte. Fermez votre session en quittant un poste partagé.",
        "La session se ferme automatiquement après une période d'inactivité.",
        "En cas de perte, de vol ou de soupçon d'usage par un tiers, prévenez immédiatement l'administrateur de la plateforme.",
      ],
    },
    {
      id: "engagements",
      titre: "3. Vos engagements",
      liste: [
        "N'utiliser la plateforme que pour les besoins de vos fonctions ou de la gestion de votre propre dossier.",
        "Saisir des informations exactes et à jour : un diplôme, une ancienneté ou un acte inexacts engagent la responsabilité de celui qui les enregistre.",
        "Ne consulter que les dossiers que vos habilitations et votre périmètre de supervision vous permettent de voir, même si une manipulation technique en donnait l'accès.",
        "Ne pas copier, extraire ou diffuser des données de la plateforme hors du cadre de vos missions.",
        "Ne pas chercher à contourner les contrôles d'accès, à perturber le service ou à y introduire du code malveillant.",
      ],
    },
    {
      id: "habilitations",
      titre: "4. Habilitations et traçabilité",
      paragraphes: [
        "Vos droits dépendent de votre rôle et de votre rattachement. Un responsable supervise les agents de sa structure et des structures qu'elle contient ; il ne voit ni ses pairs, ni les agents d'une autre branche.",
        "Les visas, les décisions et les opérations sensibles sont enregistrés avec leur auteur et leur date. Ces enregistrements servent à la sécurité, à l'audit et à la preuve des décisions.",
        "Vos demandes suivent le circuit de validation prévu pour votre poste.",
      ],
    },
    {
      id: "signature",
      titre: "5. Signature et visas électroniques",
      paragraphes: [
        "Les visas et signatures apposés dans l'application sont rattachés à votre compte. Leur valeur juridique est celle que leur reconnaît la loi n° 2013-546 du 30 juillet 2013 relative aux transactions électroniques.",
        "Votre signature électronique enregistrée est personnelle : ne la déposez pas pour le compte d'un autre agent et ne l'utilisez pas pour un acte que vous n'avez pas examiné.",
      ],
    },
    {
      id: "donnees",
      titre: "6. Données personnelles",
      paragraphes: [
        "La plateforme traite des données à caractère personnel, dans le cadre de la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel. Le détail figure dans la politique de confidentialité et dans le document de protection des données.",
      ],
    },
    {
      id: "manquements",
      titre: "7. Manquements et sanctions",
      paragraphes: [
        "Un usage contraire aux présentes conditions peut entraîner la suspension du compte. Il peut aussi donner lieu aux sanctions disciplinaires prévues par le statut qui s'applique à l'agent concerné.",
        "L'accès frauduleux à un système d'information, l'atteinte aux données ou leur usage détourné sont des infractions prévues notamment par la loi n° 2013-451 du 19 juin 2013 relative à la lutte contre la cybercriminalité.",
      ],
    },
    {
      id: "disponibilite",
      titre: "8. Disponibilité du service",
      paragraphes: [
        "Le ministère s'efforce d'assurer la disponibilité de la plateforme, mais le service peut être interrompu pour maintenance, mise à jour ou incident. Vous restez tenu de respecter les délais de vos démarches : en cas d'indisponibilité prolongée, adressez-vous à votre direction des ressources humaines.",
      ],
    },
    {
      id: "evolution",
      titre: "9. Évolution des conditions",
      paragraphes: [
        "Ces conditions peuvent évoluer, notamment avec la réglementation. Chaque version porte une date. Lorsqu'elles changent de façon substantielle, votre acceptation est demandée de nouveau à votre prochaine connexion.",
      ],
    },
    {
      id: "contact",
      titre: "10. Questions",
      paragraphes: ["Pour toute question sur ces conditions ou sur l'usage de la plateforme, adressez-vous à la direction des ressources humaines de votre structure de rattachement ou à l'administrateur de la plateforme."],
    },
  ],
};

export const CONFIDENTIALITE: DocumentJuridique = {
  titre: "Politique de confidentialité",
  resume:
    "Quelles informations SIGRH-PORTEFEUILLE conserve sur vous, pourquoi, qui peut les consulter, combien de temps, et comment exercer vos droits.",
  tuiles: [
    { libelle: "Dernière mise à jour", valeur: MISE_A_JOUR },
    { libelle: "Responsable du traitement", valeur: "Ministère du Portefeuille de l'État et des Entreprises Publiques" },
    { libelle: "Cadre légal", valeur: "Loi n° 2013-450 du 19 juin 2013" },
    { libelle: "Autorité de protection", valeur: "ARTCI" },
  ],
  sections: [
    {
      id: "responsable",
      titre: "1. Qui est responsable de vos données",
      paragraphes: [
        "Le responsable du traitement est le Ministère du Portefeuille de l'État et des Entreprises Publiques (MPEEP). La gestion du dossier de chaque agent est assurée par les services de ressources humaines habilités.",
      ],
    },
    {
      id: "donnees",
      titre: "2. Les informations traitées",
      liste: [
        "Identité et état civil : matricule, nom, prénoms, sexe, date et lieu de naissance, situation matrimoniale, pièce d'identité.",
        "Coordonnées : adresse, téléphone, courriel, personne à prévenir en cas d'urgence, conjoint.",
        "Situation administrative et carrière : emploi, grade, échelon, structure d'affectation, position, mouvements, distinctions, procédures disciplinaires.",
        "Congés, absences, autorisations et demandes d'actes.",
        "Parcours académique et formations suivies.",
        "Pièces justificatives que vous ou le service déposez dans votre dossier, votre photo et votre signature électronique.",
        "Données de connexion et de traçabilité : identifiant, visas et décisions enregistrés avec leur auteur et leur date.",
      ],
      note: "Les informations relatives à la santé ne sont traitées que lorsque la réglementation l'exige, avec un accès restreint aux personnes habilitées.",
    },
    {
      id: "finalites",
      titre: "3. Pourquoi ces informations sont utilisées",
      liste: [
        "Gérer votre dossier administratif et votre carrière.",
        "Instruire vos demandes (congés, actes, formation, mutation) et en suivre les décisions.",
        "Planifier les effectifs, les besoins en emplois et les formations du ministère.",
        "Établir des statistiques et des états de gestion.",
        "Assurer la sécurité de la plateforme et la traçabilité des décisions.",
      ],
      paragraphes: ["Ces informations ne sont pas utilisées à d'autres fins sans base légale, ni vendues ou cédées à des fins commerciales."],
    },
    {
      id: "destinataires",
      titre: "4. Qui peut consulter vos informations",
      liste: [
        "Vous-même, sur votre propre dossier.",
        "Votre supérieur hiérarchique, pour les informations utiles à la gestion de son équipe, dans son périmètre de supervision.",
        "Les gestionnaires des ressources humaines habilités, selon leur rôle.",
        "L'administrateur technique de la plateforme, pour son exploitation et sa sécurité.",
        "Une autre administration ou une autorité, uniquement lorsqu'un texte l'impose.",
      ],
    },
    {
      id: "conservation",
      titre: "5. Durée de conservation",
      paragraphes: [
        "Le dossier d'un agent est conservé pendant sa carrière, puis archivé selon les règles applicables à l'administration. Les informations ne sont pas gardées plus longtemps que ne le justifient les finalités ci-dessus ou les obligations légales.",
      ],
    },
    {
      id: "securite",
      titre: "6. Sécurité",
      liste: [
        "Authentification par identifiant et mot de passe personnels, avec fermeture de session après inactivité.",
        "Cloisonnement des accès : chacun ne voit que ce que son rôle et son périmètre permettent.",
        "Traçabilité des visas et des décisions.",
        "Échanges chiffrés entre votre navigateur et la plateforme lorsqu'elle est publiée en ligne.",
      ],
    },
    {
      id: "session",
      titre: "7. Données conservées dans votre navigateur",
      paragraphes: [
        "La plateforme enregistre dans votre navigateur un jeton de session, nécessaire pour rester connecté, ainsi que quelques préférences d'affichage. Si vous cochez « Maintenir ma session sur ce poste », le jeton est conservé après la fermeture du navigateur : ne le faites que sur un appareil qui vous est réservé.",
      ],
    },
    {
      id: "droits",
      titre: "8. Vos droits",
      paragraphes: ["Conformément à la loi n° 2013-450 du 19 juin 2013, vous pouvez :"],
      liste: [
        "être informé du traitement de vos données ;",
        "accéder à vos données ;",
        "faire rectifier une information inexacte ou incomplète ;",
        "demander la suppression d'une donnée qui n'a plus lieu d'être conservée ;",
        "vous opposer, pour un motif légitime, à un traitement.",
      ],
      note: "Une partie de ces droits s'exerce directement dans votre profil. Pour le reste, adressez votre demande à la direction des ressources humaines de votre structure de rattachement.",
    },
    {
      id: "recours",
      titre: "9. Recours",
      paragraphes: [
        "Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir l'Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI), autorité chargée de la protection des données à caractère personnel, sans préjudice des recours devant les juridictions compétentes.",
      ],
    },
  ],
};

export const PROTECTION_DONNEES: DocumentJuridique = {
  titre: "Protection des données personnelles",
  resume:
    "Le cadre légal, les principes que le ministère s'engage à respecter, et les obligations de chaque utilisateur qui manipule des données personnelles dans SIGRH-PORTEFEUILLE.",
  tuiles: [
    { libelle: "Dernière mise à jour", valeur: MISE_A_JOUR },
    { libelle: "Loi de référence", valeur: "Loi n° 2013-450 du 19 juin 2013" },
    { libelle: "Autorité de protection", valeur: "ARTCI" },
  ],
  sections: [
    {
      id: "cadre",
      titre: "1. Cadre légal",
      paragraphes: ["En Côte d'Ivoire, le traitement des données à caractère personnel est encadré par plusieurs textes :"],
      liste: [
        "la loi n° 2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel ;",
        "la loi n° 2013-451 du 19 juin 2013 relative à la lutte contre la cybercriminalité ;",
        "la loi n° 2013-546 du 30 juillet 2013 relative aux transactions électroniques ;",
        "l'ordonnance n° 2012-293 du 21 mars 2012 relative aux télécommunications et aux technologies de l'information et de la communication, qui a créé l'ARTCI.",
      ],
    },
    {
      id: "autorite",
      titre: "2. L'autorité de protection",
      paragraphes: [
        "L'Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI) est l'autorité de protection des données à caractère personnel. Elle reçoit les déclarations et délivre les autorisations prévues par la loi, informe les personnes sur leurs droits, instruit les plaintes et peut sanctionner les manquements.",
        "Le ministère n'est soumis à aucune autorité étrangère pour ces traitements : ce sont la loi ivoirienne et l'ARTCI qui s'appliquent.",
      ],
    },
    {
      id: "principes",
      titre: "3. Les principes à respecter",
      liste: [
        "Licéité et loyauté : les données sont collectées pour une mission du ministère, dans les cas que la loi permet.",
        "Finalité : elles servent à gérer les agents et leur carrière, pas à autre chose.",
        "Proportionnalité : on ne collecte que ce qui est nécessaire.",
        "Exactitude : les informations sont tenues à jour et corrigées sur demande.",
        "Conservation limitée : elles ne sont pas gardées au-delà de ce qui est utile ou imposé par la loi.",
        "Confidentialité et sécurité : seules les personnes habilitées y accèdent, avec des protections adaptées.",
        "Transparence : les agents sont informés de ce qui est fait de leurs données.",
      ],
    },
    {
      id: "formalites",
      titre: "4. Formalités auprès de l'ARTCI",
      paragraphes: [
        "Selon la nature des données et des traitements, la loi impose une déclaration ou une autorisation préalable de l'ARTCI. Les traitements de la plateforme sont soumis à ces formalités. Les données sensibles, notamment celles relatives à la santé, bénéficient d'une protection renforcée.",
      ],
    },
    {
      id: "droits",
      titre: "5. Droits des personnes et exercice",
      paragraphes: [
        "Chaque agent peut demander l'accès à ses données, leur rectification ou leur suppression, et s'opposer à un traitement pour un motif légitime. La demande se fait auprès de la direction des ressources humaines de la structure de rattachement, de préférence par écrit. Une réponse motivée est apportée dans un délai raisonnable.",
        "En l'absence de réponse satisfaisante, l'agent peut saisir l'ARTCI, puis les juridictions compétentes.",
      ],
    },
    {
      id: "utilisateurs",
      titre: "6. Obligations de chaque utilisateur",
      liste: [
        "Respecter le secret professionnel sur toute information issue des dossiers.",
        "Ne consulter un dossier que lorsque votre mission l'exige.",
        "Ne pas exporter, imprimer ou transmettre de données personnelles sans nécessité et sans autorisation.",
        "Ne jamais envoyer de données personnelles par un canal non sécurisé.",
        "Signaler sans délai toute anomalie, tout accès suspect ou toute perte de données.",
      ],
    },
    {
      id: "incident",
      titre: "7. En cas d'incident de sécurité",
      paragraphes: [
        "Une fuite, une perte ou un accès non autorisé à des données personnelles doit être signalé immédiatement à l'administrateur de la plateforme et au responsable hiérarchique. Le ministère évalue l'incident, prend les mesures pour en limiter les effets et informe les personnes concernées et l'autorité compétente lorsque la réglementation l'exige.",
      ],
    },
    {
      id: "transferts",
      titre: "8. Transfert de données hors de Côte d'Ivoire",
      paragraphes: [
        "Les données ne sont transférées à l'étranger que dans les conditions fixées par la loi : destination offrant un niveau de protection suffisant et formalités auprès de l'ARTCI.",
      ],
    },
    {
      id: "sanctions",
      titre: "9. Sanctions",
      paragraphes: [
        "Le détournement de données, l'accès frauduleux et la violation du secret professionnel exposent leur auteur à des sanctions disciplinaires et pénales, notamment sur le fondement des lois n° 2013-450 et n° 2013-451 du 19 juin 2013.",
      ],
    },
  ],
};
