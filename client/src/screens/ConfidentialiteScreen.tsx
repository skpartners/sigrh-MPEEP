import { Link } from "react-router-dom";
import { PublicHeaderNav } from "./PublicHeaderNav";

export function ConfidentialiteScreen() {
  return (
    <>
    <header className={"fixed top-0 w-full z-50 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"w-full bg-primary text-on-primary px-margin-desktop py-space-xs"}>
        <div className={"max-w-[1600px] mx-auto flex items-center justify-between font-label-sm text-label-sm"}>
          <div className={"flex items-center gap-space-md"}>
            <span>
              RÉPUBLIQUE DE CÔTE D'IVOIRE
            </span>
            <span className={"opacity-40"}>
              |
            </span>
            <span className={"italic text-primary-fixed"}>
              Union - Discipline - Travail
            </span>
          </div>
          <div className={"flex items-center gap-space-md"}>
            <span>
              Exercice Budgétaire : 2026
            </span>
          </div>
        </div>
      </div>
      <div className={"h-16 max-w-[1600px] mx-auto px-margin-desktop flex items-center justify-between gap-space-md"}>
        <div className={"flex items-center gap-space-md"}>
          <img alt="Armoiries de la République de Côte d'Ivoire" className="h-12 w-12 object-contain" src="/logo.png" />
          <div className={"flex flex-col"}>
            <span className={"font-label-lg text-label-lg text-primary uppercase tracking-tight"}>
              SIGRH-PORTFEUILLE
            </span>
            <span className={"font-label-sm text-label-sm text-on-surface-variant truncate max-w-xl"}>
              Ministère du Portefeuille de l'État et des Entreprises Publiques
            </span>
          </div>
        </div>
        <PublicHeaderNav />
        <div className={"flex items-center gap-space-md"}>
          <div className={"hidden sm:flex items-center gap-space-xs bg-surface-container-high px-space-md py-space-xs rounded"}>
            <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
              Plateforme Souveraine
            </span>
          </div>
          <div className={"w-8 h-8 rounded-full bg-primary flex items-center justify-center"}>
            <span className={"material-symbols-outlined text-on-primary text-[18px]"}>
              person
            </span>
          </div>
        </div>
      </div>
    </header>
    <main className={"w-full pt-20 bg-surface"}>
      <div className={"flex flex-col w-full"}>
        {/* Bandeau de contexte et fil d'ariane */}
        <section className={"w-full bg-surface-container-low py-space-md"}>
          <div className={"max-w-[1600px] mx-auto px-margin-desktop flex flex-col md:flex-row md:items-center justify-between gap-space-sm"}>
            <nav aria-label={"Fil d'Ariane"} className={"flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant"}>
              <Link className={"hover:text-primary transition-colors flex items-center gap-1"} to="/">
                <span className={"material-symbols-outlined text-[16px]"}>
                  account_balance
                </span>
                <span>
                  Accueil
                </span>
              </Link>
              <span className={"material-symbols-outlined text-[14px] text-on-surface-variant"}>
                chevron_right
              </span>
              <span className={"hover:text-primary transition-colors"}>
                Conformité & Sécurité
              </span>
              <span className={"material-symbols-outlined text-[14px] text-on-surface-variant"}>
                chevron_right
              </span>
              <span className={"text-on-surface font-semibold"}>
                Politique de Confidentialité
              </span>
            </nav>
            <div className={"flex items-center gap-space-sm"}>
              <div className={"hidden sm:inline-flex items-center gap-1 px-space-sm py-1 rounded bg-primary-container text-on-primary text-label-sm font-label-sm"}>
                <span className={"material-symbols-outlined text-[14px]"}>
                  shield_locked
                </span>
                <span>
                  Accès réservé aux agents habilités
                </span>
              </div>
            </div>
          </div>
        </section>
        {/* En-tête éditorial régalien avec cartouche institutionnel */}
        <section className={"w-full bg-surface-container-lowest py-space-xl shadow-sm relative overflow-hidden"}>
          <div className={"max-w-[1600px] mx-auto px-margin-desktop relative z-10"}>
            <div className={"grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-center"}>
              <div className={"lg:col-span-8 space-y-space-md"}>
                <div className={"inline-flex items-center gap-2 px-3 py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm tracking-wide uppercase"}>
                  <span className={"material-symbols-outlined text-[15px]"}>
                    verified
                  </span>
                  
            Régime Républicain de Protection des Données Agents
          
                </div>
                <h1 className={"font-headline-xl text-headline-xl text-primary tracking-tight"}>
                  
            Politique de Confidentialité & Traitement des Données Nominatives
          
                </h1>
                <p className={"font-body-lg text-body-lg text-on-surface-variant max-w-3xl leading-relaxed"}>
                  
            Engagement solennel de la République de Côte d'Ivoire et du Ministère du Portefeuille de l'État pour la souveraineté, l'intégrité, et la stricte imperméabilité des données individuelles des fonctionnaires, cadres dirigeants et agents des entreprises publiques.
          
                </p>
                <div className={"flex flex-wrap items-center gap-space-md pt-2 text-label-sm font-label-sm text-on-surface-variant"}>
                  <span className={"flex items-center gap-1.5"}>
                    <span className={"material-symbols-outlined text-[16px] text-primary"}>
                      calendar_today
                    </span>
                    
              Entrée en vigueur légale : 1er Janvier 2026
            
                  </span>
                  <span className={"opacity-40"}>
                    |
                  </span>
                  <span className={"flex items-center gap-1.5"}>
                    <span className={"material-symbols-outlined text-[16px] text-primary"}>
                      gavel
                    </span>
                    
              Loi N° 2013-450 relative à la protection des données
            
                  </span>
                  <span className={"opacity-40"}>
                    |
                  </span>
                  <span className={"flex items-center gap-1.5"}>
                    <span className={"material-symbols-outlined text-[16px] text-secondary"}>
                      database
                    </span>
                    
              Stockage Souverain Datacenter National (Yamoussoukro / Abidjan)
            
                  </span>
                </div>
              </div>
              {/* Cartouche armoiries & certification numérique */}
              <div className={"lg:col-span-4 flex flex-col items-center justify-center p-space-lg rounded-xl bg-surface-container-low shadow-sm text-center relative"}>
                <div className={"w-24 h-24 rounded-full bg-surface-container-lowest p-2 shadow-sm flex items-center justify-center mb-space-sm relative"}>
                  <img className={"w-20 h-20 object-contain"} alt="Armoiries de la République de Côte d'Ivoire" src="/logo.png" />
                  <span className={"absolute -bottom-1 -right-1 bg-primary text-on-primary w-7 h-7 rounded-full flex items-center justify-center shadow"}>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      lock
                    </span>
                  </span>
                </div>
                <span className={"font-label-lg text-label-lg text-on-surface"}>
                  Ministère du Portefeuille de l'État
                </span>
                <span className={"font-label-sm text-label-sm text-on-surface-variant mt-0.5"}>
                  Direction des Systèmes d'Information & des Normes RH
                </span>
              </div>
            </div>
          </div>
        </section>
        {/* 3 Piliers directeurs régaliens */}
        <section className={"w-full py-space-xl bg-surface"}>
          <div className={"max-w-[1600px] mx-auto px-margin-desktop"}>
            <div className={"grid grid-cols-1 md:grid-cols-3 gap-space-lg"}>
              {/* Pilier 1 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline flex flex-col justify-between hover:shadow-md transition-shadow"}>
                <div>
                  <div className={"w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-primary mb-space-md"}>
                    <span className={"material-symbols-outlined text-[28px]"}>
                      assignment_turned_in
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-secondary uppercase font-semibold tracking-wider"}>
                    Principe Fondateur 01
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface mt-1 mb-space-xs"}>
                    Finalité Statutaire Exclusive
                  </h3>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Toute donnée collectée sert exclusivement l'administration régalienne : avancements statutaires, liquidation de soldes, affiliation à la CNPS/CGRAE, suivi médical d'aptitude et plans ministériels de perfectionnement.
            
                  </p>
                </div>
                <div className={"mt-space-md pt-space-sm flex items-center text-primary font-label-md text-label-md font-semibold"}>
                  <span className={"material-symbols-outlined text-[18px] mr-1"}>
                    block
                  </span>
                  
            Zéro cession marchande ou croisement tiers
          
                </div>
              </div>
              {/* Pilier 2 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline flex flex-col justify-between hover:shadow-md transition-shadow"}>
                <div>
                  <div className={"w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-primary mb-space-md"}>
                    <span className={"material-symbols-outlined text-[28px]"}>
                      security
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-secondary uppercase font-semibold tracking-wider"}>
                    Principe Fondateur 02
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface mt-1 mb-space-xs"}>
                    Contrôle d'Accès Réparti (RBAC)
                  </h3>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Isolation cryptographique stricte par profil d'habilitation ministériel. Un gestionnaire RH sectoriel ne peut jamais accéder aux dossiers médicaux confidentiels ni aux fiches disciplinaires classifiées.
            
                  </p>
                </div>
                <div className={"mt-space-md pt-space-sm flex items-center text-primary font-label-md text-label-md font-semibold"}>
                  <span className={"material-symbols-outlined text-[18px] mr-1"}>
                    lock_clock
                  </span>
                  
            Journal des consultations
          
                </div>
              </div>
              {/* Pilier 3 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline flex flex-col justify-between hover:shadow-md transition-shadow"}>
                <div>
                  <div className={"w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center text-primary mb-space-md"}>
                    <span className={"material-symbols-outlined text-[28px]"}>
                      cloud_sync
                    </span>
                  </div>
                  <span className={"font-label-sm text-label-sm text-secondary uppercase font-semibold tracking-wider"}>
                    Principe Fondateur 03
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface mt-1 mb-space-xs"}>
                    Pièces du dossier
                  </h3>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Les pièces jointes sont versées dans le dossier de l'agent.
            
                  </p>
                </div>
                <div className={"mt-space-md pt-space-sm flex items-center text-primary font-label-md text-label-md font-semibold"}>
                  <span className={"material-symbols-outlined text-[18px] mr-1"}>
                    domain
                  </span>
                  
            Hébergement territorial 100% en Côte d'Ivoire
          
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Corps principal : Bento Grid avec Navigation Latérale Interactive & Sections de Contenu */}
        <section className={"w-full pb-space-xl"}>
          <div className={"max-w-[1600px] mx-auto px-margin-desktop"}>
            <div className={"grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start"}>
              {/* Sommaire latéral fixe (Sticky Menu) */}
              <div className={"lg:col-span-4 sticky top-24 space-y-space-md"}>
                <div className={"bg-surface-container-lowest p-space-md rounded-xl border border-hairline"}>
                  <div className={"flex items-center gap-2 mb-space-md pb-space-sm bg-surface-container-low px-space-sm py-2 rounded-lg"}>
                    <span className={"material-symbols-outlined text-primary text-[20px]"}>
                      menu_book
                    </span>
                    <span className={"font-label-lg text-label-lg text-primary uppercase"}>
                      Sections du Décret
                    </span>
                  </div>
                  <nav className={"flex flex-col space-y-1"} id={"policy-nav"}>
                    <a className={"policy-link px-3 py-2 rounded text-left font-label-md text-label-md text-primary bg-surface-container font-semibold transition-colors flex items-center justify-between"} href={"#section-collecte"}>
                      <span>
                        1. Données Collectées & Nature
                      </span>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        chevron_right
                      </span>
                    </a>
                    <a className={"policy-link px-3 py-2 rounded text-left font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center justify-between"} href={"#section-destinataires"}>
                      <span>
                        2. Destinataires Habilités
                      </span>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        chevron_right
                      </span>
                    </a>
                    <a className={"policy-link px-3 py-2 rounded text-left font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center justify-between"} href={"#section-conservation"}>
                      <span>
                        3. Délais de Conservation
                      </span>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        chevron_right
                      </span>
                    </a>
                    <a className={"policy-link px-3 py-2 rounded text-left font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center justify-between"} href={"#section-securite"}>
                      <span>
                        4. Sécurité & Journalisation
                      </span>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        chevron_right
                      </span>
                    </a>
                    <a className={"policy-link px-3 py-2 rounded text-left font-label-md text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center justify-between"} href={"#section-droits"}>
                      <span>
                        5. Exercice des Droits de l'Agent
                      </span>
                      <span className={"material-symbols-outlined text-[16px]"}>
                        chevron_right
                      </span>
                    </a>
                  </nav>
                </div>
                {/* Encadré métrique et audit de transparence */}
                <div className={"bg-primary text-on-primary p-space-md rounded-xl shadow-md space-y-space-sm relative overflow-hidden"}>
                  <div className={"flex items-center justify-between"}>
                    <span className={"font-label-sm text-label-sm uppercase tracking-wider text-primary-fixed"}>
                      Indicateurs de Conformité
                    </span>
                    <span className={"material-symbols-outlined text-[20px] text-primary-fixed"}>
                      policy
                    </span>
                  </div>
                  <div className={"grid grid-cols-2 gap-space-sm pt-2"}>
                    <div className={"bg-primary-container p-space-sm rounded-lg"}>
                      <span className={"font-code-num text-headline-sm font-bold block text-primary-fixed"}>
                        100%
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-primary opacity-80"}>
                        Données Chiffrées
                      </span>
                    </div>
                    <div className={"bg-primary-container p-space-sm rounded-lg"}>
                      <span className={"font-code-num text-headline-sm font-bold block text-primary-fixed"}>
                        0 Incident
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-primary opacity-80"}>
                        Fuite Données 2025-26
                      </span>
                    </div>
                  </div>
                  <div className={"pt-2 text-label-sm text-on-primary opacity-85 leading-normal"}>
                    
              Les accès aux dossiers sont journalisés.
            
                  </div>
                </div>
                {/* Téléchargement officiel */}
                <div className={"bg-surface-container-lowest p-space-md rounded-xl border border-hairline flex items-center justify-between"}>
                  <div className={"flex items-center gap-space-sm"}>
                    <div className={"w-10 h-10 rounded bg-error-container text-error flex items-center justify-center font-bold"}>
                      <span className={"material-symbols-outlined text-[22px]"}>
                        picture_as_pdf
                      </span>
                    </div>
                    <div>
                      <span className={"font-label-md text-label-md text-on-surface block"}>
                        Recueil Légal PDF
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        Édition Journal Officiel (3.2 Mo)
                      </span>
                    </div>
                  </div>
                  <button className={"px-space-md py-1.5 rounded bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md transition-colors flex items-center gap-1"} title={"Télécharger le texte officiel"} type="button" data-long-action="Préparation du texte officiel…" data-long-action-done="Texte officiel prêt">
                    <span>
                      PDF
                    </span>
                    <span className={"material-symbols-outlined text-[16px]"}>
                      download
                    </span>
                  </button>
                </div>
              </div>
              {/* Colonne détaillée des chapitres de confidentialité */}
              <div className={"lg:col-span-8 space-y-space-lg"}>
                {/* Section 1 : Données Collectées */}
                <article className={"bg-surface-container-lowest p-space-xl rounded-xl border border-hairline space-y-space-md scroll-mt-24"} id={"section-collecte"}>
                  <div className={"flex items-center gap-space-sm pb-space-xs"}>
                    <span className={"px-2.5 py-1 rounded bg-surface-container-high text-primary font-code-num font-bold text-label-md"}>
                      01
                    </span>
                    <h2 className={"font-headline-md text-headline-md text-primary"}>
                      Périmètre et Nature des Données Collectées
                    </h2>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Dans le cadre strict des prérogatives conférées par les textes régissant les entreprises publiques et le statut général des personnels d'État, le système SIGRH procède au traitement des catégories suivantes :
            
                  </p>
                  <div className={"grid grid-cols-1 md:grid-cols-2 gap-space-md pt-2"}>
                    <div className={"p-space-md rounded-lg bg-surface-container-low space-y-1"}>
                      <div className={"flex items-center gap-2 text-on-surface font-label-lg text-label-lg"}>
                        <span className={"material-symbols-outlined text-primary text-[18px]"}>
                          badge
                        </span>
                        <span>
                          Identification & État Civil
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Numéro National Unique (NNU), Matricule civil ministériel, nom patronymique, prénoms, date et lieu de naissance, filiation, nationalité, extrait d'acte de naissance authentifié.
                
                      </p>
                    </div>
                    <div className={"p-space-md rounded-lg bg-surface-container-low space-y-1"}>
                      <div className={"flex items-center gap-2 text-on-surface font-label-lg text-label-lg"}>
                        <span className={"material-symbols-outlined text-primary text-[18px]"}>
                          military_tech
                        </span>
                        <span>
                          Carrière & Statut Administratif
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Grade indiciaire, corps de métier, échelon, arrêté de nomination, décrets d'avancement, historique des affectations territoriales et d'entreprises publiques de rattachement.
                
                      </p>
                    </div>
                    <div className={"p-space-md rounded-lg bg-surface-container-low space-y-1"}>
                      <div className={"flex items-center gap-2 text-on-surface font-label-lg text-label-lg"}>
                        <span className={"material-symbols-outlined text-primary text-[18px]"}>
                          family_restroom
                        </span>
                        <span>
                          Situation Familiale & Ayants Droit
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Situation matrimoniale certifiée, conjoint(s), enfants à charge reconnus légalement, pièces justificatives pour le calcul des allocations familiales et de la fiscalité IGR.
                
                      </p>
                    </div>
                    <div className={"p-space-md rounded-lg bg-surface-container-low space-y-1"}>
                      <div className={"flex items-center gap-2 text-on-surface font-label-lg text-label-lg"}>
                        <span className={"material-symbols-outlined text-primary text-[18px]"}>
                          health_and_safety
                        </span>
                        <span>
                          Aptitude Médicale Réglementaire
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Certificats d'aptitude au poste émis par la médecine du travail étatique, congés de longue durée, avis de la commission médicale supérieure (strict secret médical préservé).
                
                      </p>
                    </div>
                  </div>
                  {/* Photographie d'illustration institutionnelle intégrée */}
                  <div className={"mt-space-md rounded-lg overflow-hidden relative shadow-sm"}>
                    <div className={"w-full h-48 bg-primary-container flex items-center justify-center"} aria-hidden="true">
                      <span className={"material-symbols-outlined text-6xl text-on-primary-container"}>dns</span>
                    </div>
                    <div className={"absolute bottom-0 inset-x-0 bg-surface-container-lowest/90 backdrop-blur-md p-space-sm flex items-center justify-between text-label-sm font-label-sm"}>
                      <span className={"text-on-surface font-medium flex items-center gap-1"}>
                        <span className={"material-symbols-outlined text-[16px] text-primary"}>
                          fingerprint
                        </span>
                        
                  Registre National Dématérialisé des Actes Ministériels
                
                      </span>
                      <span className={"text-on-surface-variant font-code-num"}>
                        Protocole SEC-CIV-2026
                      </span>
                    </div>
                  </div>
                </article>
                {/* Section 2 : Destinataires habilités */}
                <article className={"bg-surface-container-lowest p-space-xl rounded-xl border border-hairline space-y-space-md scroll-mt-24"} id={"section-destinataires"}>
                  <div className={"flex items-center gap-space-sm pb-space-xs"}>
                    <span className={"px-2.5 py-1 rounded bg-surface-container-high text-primary font-code-num font-bold text-label-md"}>
                      02
                    </span>
                    <h2 className={"font-headline-md text-headline-md text-primary"} id="rbac">
                      Destinataires Habilités & Matrice d'Accès
                    </h2>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Les données à caractère personnel sont strictement cloisonnées. Aucun accès direct n'est octroyé sans ordonnancement formel validé par arrêté ministériel.
            
                  </p>
                  <div className={"overflow-x-auto rounded-lg"}>
                    <table className={"w-full text-left font-body-sm text-body-sm"}>
                      <thead className={"bg-surface-container-low font-label-md text-label-md text-on-surface"}>
                        <tr>
                          <th className={"p-space-sm"}>
                            Organe / Direction
                          </th>
                          <th className={"p-space-sm"}>
                            Périmètre Autorisé
                          </th>
                          <th className={"p-space-sm"}>
                            Base Juridique
                          </th>
                          <th className={"p-space-sm"}>
                            Niveau RBAC
                          </th>
                        </tr>
                      </thead>
                      <tbody className={"divide-y-0"}>
                        <tr className={"hover:bg-surface-container-low transition-colors"}>
                          <td className={"p-space-sm font-medium text-on-surface"}>
                            Direction des Ressources Humaines (DRH)
                          </td>
                          <td className={"p-space-sm text-on-surface-variant"}>
                            Dossier individuel intégral, avancements, congés
                          </td>
                          <td className={"p-space-sm text-on-surface-variant font-code-num"}>
                            Décret Organique RH
                          </td>
                          <td className={"p-space-sm"}>
                            <span className={"px-2 py-0.5 rounded bg-primary-container text-on-primary font-label-sm font-semibold"}>
                              Niveau 4 (Admin)
                            </span>
                          </td>
                        </tr>
                        <tr className={"bg-surface-container-lowest hover:bg-surface-container-low transition-colors"}>
                          <td className={"p-space-sm font-medium text-on-surface"}>
                            Direction Générale du Portefeuille de l'État (DGPE)
                          </td>
                          <td className={"p-space-sm text-on-surface-variant"}>
                            Données consolidées d'effectifs
                          </td>
                          <td className={"p-space-sm text-on-surface-variant font-code-num"}>
                            Loi des Finances
                          </td>
                          <td className={"p-space-sm"}>
                            <span className={"px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm font-semibold"}>
                              Niveau 2 (Macro)
                            </span>
                          </td>
                        </tr>
                        <tr className={"hover:bg-surface-container-low transition-colors"}>
                          <td className={"p-space-sm font-medium text-on-surface"}>
                            Direction du Contrôle Financier
                          </td>
                          <td className={"p-space-sm text-on-surface-variant"}>
                            Visas de conformité budgétaire, liquidations, régimes indemnitaires
                          </td>
                          <td className={"p-space-sm text-on-surface-variant font-code-num"}>
                            Ordonnance Budgétaire
                          </td>
                          <td className={"p-space-sm"}>
                            <span className={"px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm font-semibold"}>
                              Niveau 3 (Audit)
                            </span>
                          </td>
                        </tr>
                        <tr className={"hover:bg-surface-container-low transition-colors"}>
                          <td className={"p-space-sm font-medium text-on-surface"}>
                            Organismes de Prévoyance (CGRAE / CNPS)
                          </td>
                          <td className={"p-space-sm text-on-surface-variant"}>
                            Historique cotisations, calcul des rentes et droits à pension
                          </td>
                          <td className={"p-space-sm text-on-surface-variant font-code-num"}>
                            Code Prévoyance Sociale
                          </td>
                          <td className={"p-space-sm"}>
                            <span className={"px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm font-semibold"}>
                              Interface API Sécurisée
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
                {/* Section 3 : Délais de Conservation */}
                <article className={"bg-surface-container-lowest p-space-xl rounded-xl border border-hairline space-y-space-md scroll-mt-24"} id={"section-conservation"}>
                  <div className={"flex items-center gap-space-sm pb-space-xs"}>
                    <span className={"px-2.5 py-1 rounded bg-surface-container-high text-primary font-code-num font-bold text-label-md"}>
                      03
                    </span>
                    <h2 className={"font-headline-md text-headline-md text-primary"}>
                      Durées Légales de Conservation & Archivage National
                    </h2>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Conformément à la réglementation des Archives Nationales de Côte d'Ivoire, les dossiers administratifs d'agents bénéficient d'un calendrier de conservation précis visant la garantie imprescriptible de leurs droits à la retraite.
            
                  </p>
                  {/* Visualisation de la frise temporelle régalienne */}
                  <div className={"space-y-space-sm pt-2"}>
                    <div className={"flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-low"}>
                      <div className={"w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 mt-0.5"}>
                        <span className={"material-symbols-outlined text-[20px]"}>
                          badge
                        </span>
                      </div>
                      <div className={"flex-1"}>
                        <div className={"flex flex-col sm:flex-row sm:items-center justify-between"}>
                          <span className={"font-label-lg text-label-lg text-on-surface"}>
                            Période d'Activité Titulaire ou Contractuelle
                          </span>
                          <span className={"font-code-num text-primary font-semibold"}>
                            Base Active Temps Réel
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                          
                    Conservation dynamique intégrale pendant toute la durée des fonctions exercées au sein de la fonction publique ou d'un établissement public d'État.
                  
                        </p>
                      </div>
                    </div>
                    <div className={"flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-low"}>
                      <div className={"w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 mt-0.5"}>
                        <span className={"material-symbols-outlined text-[20px]"}>
                          history_edu
                        </span>
                      </div>
                      <div className={"flex-1"}>
                        <div className={"flex flex-col sm:flex-row sm:items-center justify-between"}>
                          <span className={"font-label-lg text-label-lg text-on-surface"}>
                            Post-Liquidation de Retraite
                          </span>
                          <span className={"font-code-num text-secondary font-semibold"}>
                            30 Ans (Archive Intermédiaire)
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                          
                    À compter de la date d'admission à la retraite ou de cessation définitive de fonctions, afin de garantir les droits de réversion aux conjoints survivants et orphelins.
                  
                        </p>
                      </div>
                    </div>
                    <div className={"flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-low"}>
                      <div className={"w-10 h-10 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center shrink-0 mt-0.5"}>
                        <span className={"material-symbols-outlined text-[20px]"}>
                          museum
                        </span>
                      </div>
                      <div className={"flex-1"}>
                        <div className={"flex flex-col sm:flex-row sm:items-center justify-between"}>
                          <span className={"font-label-lg text-label-lg text-on-surface"}>
                            Archives Historiques Nationales
                          </span>
                          <span className={"font-code-num text-on-surface-variant font-semibold"}>
                            Conservation Perpétuelle Triée
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                          
                    Versement aux Archives Nationales d'Abidjan pour les dossiers des hauts fonctionnaires, ministres et directeurs généraux, selon inventaire scientifique.
                  
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
                {/* Section 4 : Sécurité & Traçabilité */}
                <article className={"bg-surface-container-lowest p-space-xl rounded-xl border border-hairline space-y-space-md scroll-mt-24"} id={"section-securite"}>
                  <div className={"flex items-center gap-space-sm pb-space-xs"}>
                    <span className={"px-2.5 py-1 rounded bg-surface-container-high text-primary font-code-num font-bold text-label-md"}>
                      04
                    </span>
                    <h2 className={"font-headline-md text-headline-md text-primary"}>
                      Sécurité Technique, Cryptographie & Journalisation
                    </h2>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              L'accès aux dossiers est réservé aux agents habilités.
            
                  </p>
                  <div className={"grid grid-cols-1 md:grid-cols-2 gap-space-md pt-2"}>
                    <div className={"bg-surface-container-low p-space-md rounded-lg space-y-2"}>
                      <span className={"flex items-center gap-2 font-label-lg text-label-lg text-primary"}>
                        <span className={"material-symbols-outlined"}>
                          history_toggle_off
                        </span>
                        
                  Journal des consultations
                
                      </span>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Les consultations de dossiers sont enregistrées.
                
                      </p>
                    </div>
                    <div className={"bg-surface-container-low p-space-md rounded-lg space-y-2"}>
                      <span className={"flex items-center gap-2 font-label-lg text-label-lg text-primary"}>
                        <span className={"material-symbols-outlined"}>
                          phonelink_lock
                        </span>
                        
                  Connexion
                
                      </span>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  La connexion se fait avec le matricule et le mot de passe.
                
                      </p>
                    </div>
                  </div>
                </article>
                {/* Section 5 : Droits de l'Agent */}
                <article className={"bg-surface-container-lowest p-space-xl rounded-xl border border-hairline space-y-space-md scroll-mt-24"} id={"section-droits"}>
                  <div className={"flex items-center gap-space-sm pb-space-xs"}>
                    <span className={"px-2.5 py-1 rounded bg-surface-container-high text-primary font-code-num font-bold text-label-md"}>
                      05
                    </span>
                    <h2 className={"font-headline-md text-headline-md text-primary"}>
                      Exercice des Droits des Fonctionnaires & Agents
                    </h2>
                  </div>
                  <p className={"font-body-md text-body-md text-on-surface-variant leading-relaxed"}>
                    
              Tout fonctionnaire ou agent régi par le portefeuille dispose des garanties fondamentales consacrées par la Constitution ivoirienne et la loi N° 2013-450 :
            
                  </p>
                  <div className={"space-y-space-sm"}>
                    <div className={"p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-md"}>
                      <span className={"material-symbols-outlined text-primary text-[24px] shrink-0 mt-0.5"}>
                        visibility
                      </span>
                      <div>
                        <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                          Droit d'Accès et Consultation du Fascicule Personnel
                        </h4>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                          
                    L'agent peut à tout instant télécharger l'intégralité de sa fiche matriculaire, ses notations annuelles et la liste des actes signés le concernant via son Espace Numérique Sécurisé.
                  
                        </p>
                      </div>
                    </div>
                    <div className={"p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-md"}>
                      <span className={"material-symbols-outlined text-primary text-[24px] shrink-0 mt-0.5"}>
                        edit_document
                      </span>
                      <div>
                        <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                          Droit de Rectification des Mentions Erronées
                        </h4>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                          
                    En cas de coquille sur l'état civil, d'omission d'un ayant droit ou de non-prise en compte d'un diplôme d'État homologué, une demande formelle peut être initiée avec accusé de réception automatique.
                  
                        </p>
                      </div>
                    </div>
                    <div className={"p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-md"}>
                      <span className={"material-symbols-outlined text-primary text-[24px] shrink-0 mt-0.5"}>
                        contact_support
                      </span>
                      <div>
                        <h4 className={"font-label-lg text-label-lg text-on-surface"}>
                          Droit de Recours auprès du Délégué à la Protection des Données
                        </h4>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                          
                    En l'absence de réponse de la DRH de rattachement sous un délai de 30 jours francs, l'agent peut saisir directement le DPO Ministériel ou l'ARTCI (Autorité de Régulation).
                  
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
                {/* Widget Interactif Réactif : Contact du Délégué à la Protection des Données (DPO) */}
                <div className={"bg-gradient-to-br from-surface-container-low to-surface-container p-space-xl rounded-xl shadow-md space-y-space-md"}>
                  <div className={"flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-sm border-b-0"}>
                    <div>
                      <span className={"font-label-sm text-label-sm text-secondary uppercase font-semibold"}>
                        Guichet Officiel de Recours
                      </span>
                      <h3 className={"font-headline-sm text-headline-sm text-primary mt-0.5"}>
                        Formuler une Requête auprès du Délégué (DPO)
                      </h3>
                    </div>
                    <div className={"inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-lowest text-on-surface text-label-sm font-label-sm shadow-sm"}>
                      <span className={"material-symbols-outlined text-[16px] text-primary"}>
                        mail
                      </span>
                      <span>
                        dpo-portefeuille@gouv.ci
                      </span>
                    </div>
                  </div>
                  <form className={"space-y-space-md"} id={"dpo-request-form"}>
                    <div className={"grid grid-cols-1 md:grid-cols-2 gap-space-md"}>
                      <div className={"space-y-1"}>
                        <label className={"block font-label-md text-label-md text-on-surface"} htmlFor={"agent-matricule"}>
                          
                    Matricule Fonctionnaire / Code Agent 
                          <span className={"text-error"}>
                            *
                          </span>
                        </label>
                        <input className={"w-full h-10 px-3 rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"} id={"agent-matricule"} placeholder={"Ex: 489201-B"} required type={"text"} />
                      </div>
                      <div className={"space-y-1"}>
                        <label className={"block font-label-md text-label-md text-on-surface"} htmlFor={"request-type"}>
                          
                    Nature de la Demande Républicaine 
                          <span className={"text-error"}>
                            *
                          </span>
                        </label>
                        <select className={"w-full h-10 px-3 rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"} id={"request-type"} required>
                          <option value={""}>
                            Sélectionner l'objet officiel
                          </option>
                          <option value={"rectification"}>
                            Demande de rectification de données erronées
                          </option>
                          <option value={"audit-acces"}>
                            Vérification de l'historique des accès DRH
                          </option>
                          <option value={"contestation"}>
                            Contestation de traitement administratif
                          </option>
                          <option value={"attestation"}>
                            Délivrance d'attestation de conformité légale
                          </option>
                        </select>
                      </div>
                    </div>
                    <div className={"space-y-1"}>
                      <label className={"block font-label-md text-label-md text-on-surface"} htmlFor={"agent-entity"}>
                        
                  Ministère ou Société d'État de Rattachement 
                        <span className={"text-error"}>
                          *
                        </span>
                      </label>
                      <input className={"w-full h-10 px-3 rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"} id={"agent-entity"} placeholder={"Ex: Port Autonome d'Abidjan, SODECI, Ministère de tutelle..."} required type={"text"} />
                    </div>
                    <div className={"space-y-1"}>
                      <label className={"block font-label-md text-label-md text-on-surface"} htmlFor={"request-details"}>
                        
                  Exposé des Motifs & Références des Actes 
                        <span className={"text-error"}>
                          *
                        </span>
                      </label>
                      <textarea className={"w-full p-3 rounded bg-surface-container-lowest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm resize-none"} id={"request-details"} placeholder={"Précisez les références de l'acte, la date et la nature exacte des éléments à examiner par le Délégué à la Protection des Données..."} required rows={3}></textarea>
                    </div>
                    <div className={"p-space-sm rounded bg-surface-container-lowest flex items-center justify-between text-label-sm font-label-sm"}>
                      <span className={"flex items-center gap-1.5 text-on-surface-variant"}>
                        <span className={"material-symbols-outlined text-[16px] text-primary"}>
                          security
                        </span>
                        
                  Délai indiqué : 15 jours ouvrés
                
                      </span>
                      <span className={"text-primary font-semibold"}>
                        Transmission Cryptée
                      </span>
                    </div>
                    <div className={"flex items-center justify-end gap-space-sm pt-2"}>
                      <button className={"px-space-md h-10 rounded bg-transparent hover:bg-surface-container text-on-surface-variant font-label-md text-label-md transition-colors"} type={"reset"} data-soon>
                        
                  Réinitialiser
                
                      </button>
                      <button className={"px-space-lg h-10 rounded bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-semibold transition-colors shadow flex items-center gap-2"} type={"submit"}>
                        <span className={"material-symbols-outlined text-[18px]"}>
                          send
                        </span>
                        <span>
                          Soumettre au DPO Ministériel
                        </span>
                      </button>
                    </div>
                  </form>
                  {/* Notification de validation d'envoi */}
                  <div className={"hidden p-space-md rounded-lg bg-primary text-on-primary shadow-md flex items-start gap-space-sm animate-fade-in"} id={"confirmation-banner"}>
                    <span className={"material-symbols-outlined text-[24px] text-primary-fixed mt-0.5"}>
                      task_alt
                    </span>
                    <div className={"flex-1 font-body-sm text-body-sm"}>
                      <span className={"font-bold text-label-md block"}>
                        Requête enregistrée sous le récépissé républicain N° DPO-CI-2026-9938
                      </span>
                      
                Votre saisine a été signée cryptographiquement et acheminée au Cabinet du Délégué à la Protection des Données. Une copie certifiée a été transmise à votre adresse électronique d'agent d'État.
              
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Script d'interaction pour la navigation d'ancrage et la soumission du formulaire */}
      </div>
    </main>
    <footer className={"w-full bg-surface-container-low mt-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"max-w-[1600px] mx-auto px-margin-desktop py-space-xl"}>
        <div className={"grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-lg"}>
          <div className={"space-y-space-sm"}>
            <div className={"flex items-center gap-space-sm"}>
              <span className={"material-symbols-outlined text-primary text-[24px]"}>
                account_balance
              </span>
              <span className={"font-headline-sm text-headline-sm text-primary"}>
                MPEEP - SIGRH
              </span>
            </div>
            <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
              Système Intégré de Gestion des Ressources Humaines du Portefeuille de l'État et des Sociétés à Participation Publique. République de Côte d'Ivoire.
            </p>
          </div>
          <div className={"space-y-space-xs"}>
            <span className={"font-label-lg text-label-lg text-on-surface"}>
              Gouvernance & Textes
            </span>
            <ul className={"space-y-space-xs font-body-sm text-body-sm text-on-surface-variant"}>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Loi portant organisation des Entreprises Publiques
                </a>
              </li>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Statut Général de la Fonction Publique
                </a>
              </li>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Recueil des Décrets d'Avancement 2025-2026
                </a>
              </li>
            </ul>
          </div>
          <div className={"space-y-space-xs"}>
            <span className={"font-label-lg text-label-lg text-on-surface"}>
              Sécurité Souveraine
            </span>
            <ul className={"space-y-space-xs font-body-sm text-body-sm text-on-surface-variant"}>
              <li>
                <a className={"hover:text-on-surface"} href={"#"} data-soon>
                  Authentification Multi-facteurs Agent (AMF)
                </a>
              </li>
              <li>
                <Link className={"hover:text-on-surface"} to="/confidentialite">
                  Politique de Protection des Données Personnelles
                </Link>
              </li>
            </ul>
          </div>
          <div className={"space-y-space-xs"}>
            <span className={"font-label-lg text-label-lg text-on-surface"}>
              Centre d'Assistance
            </span>
            <div className={"font-body-sm text-body-sm text-on-surface-variant space-y-space-xs"}>
              <p>
                Support Technique DSI : +225 20 21 00 00
              </p>
              <p>
                Abidjan-Plateau, Immeuble SCIAM
              </p>
              <p>
                Lundi - Vendredi : 07h30 - 16h30 GMT
              </p>
            </div>
          </div>
        </div>
        <div className={"pt-space-md flex flex-col md:flex-row items-center justify-between gap-space-md font-label-sm text-label-sm text-on-surface-variant"}>
          <p>
            © 2026 Ministère du Portefeuille de l'État et des Entreprises Publiques. République de Côte d'Ivoire. Tous droits réservés.
          </p>
          <div className={"flex items-center gap-space-md"}>
            <span>
              Version 4.2.1-SEC
            </span>
            <span>
              Infrastructure Cloud Souverain National
            </span>
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
