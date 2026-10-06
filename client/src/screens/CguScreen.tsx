import { Link } from "react-router-dom";
import { PublicHeaderNav } from "./PublicHeaderNav";
import { Icone } from "../ui/Icone";

export function CguScreen() {
  return (
    <>
    <header className={"fixed top-0 w-full z-50 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"w-full bg-primary text-on-primary px-margin-desktop py-space-xs"}>
        <div className={"mx-auto flex items-center justify-between font-label-sm text-label-sm"}>
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
      <div className={"h-16 mx-auto px-margin-desktop flex items-center justify-between gap-space-md"}>
        <div className={"flex items-center gap-space-md"}>
          <img alt="Armoiries de la République de Côte d'Ivoire" className="h-12 w-12 object-contain" src={`${import.meta.env.BASE_URL}logo.png`} />
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
            <Icone nom="person" className="text-on-primary text-[18px]" />
          </div>
        </div>
      </div>
    </header>
    <main className={"w-full pt-28 sm:pt-24 bg-surface"}>
      <div className={"flex flex-col w-full"}>
        <div className={"w-full bg-surface-container-high/60 backdrop-blur-md"}>
          <div className={"mx-auto px-margin-desktop py-space-md"}>
            <nav aria-label={"Fil d'Ariane"} className={"flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant mb-space-sm"}>
              <Link className={"hover:text-primary transition-colors flex items-center gap-1"} to="/">
                <Icone nom="home" className="text-[16px]" />
                <span>
                  Accueil
                </span>
              </Link>
              <span className={"text-outline-variant"}>
                /
              </span>
              <a className={"hover:text-primary transition-colors"} href={"#"} data-soon>
                Cadre Juridique & Normes
              </a>
              <span className={"text-outline-variant"}>
                /
              </span>
              <span className={"text-primary font-label-md font-semibold"}>
                Conditions Générales d'Utilisation (CGU)
              </span>
            </nav>
            <div className={"flex flex-col lg:flex-row lg:items-end justify-between gap-space-md"}>
              <div className={"space-y-space-xs max-w-4xl"}>
                <div className={"flex flex-wrap items-center gap-space-xs"}>
                  <span className={"inline-flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-primary text-on-primary font-label-sm text-label-sm uppercase tracking-wider"}>
                    <span className={"w-1.5 h-1.5 rounded-full bg-primary-fixed"}></span>
                    
              Document Régalien Officiel
            
                  </span>
                  <span className={"inline-flex items-center gap-1 px-space-sm py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm font-code-num"}>
                    
              Réf : MPEEP/CAB/DGPE/2026-REG-04
            
                  </span>
                </div>
                <h1 className={"font-headline-xl text-headline-xl text-on-surface tracking-tight"}>
                  
            Conditions Générales d'Utilisation Régaliennes
          
                </h1>
                <p className={"font-body-lg text-body-lg text-on-surface-variant"}>
                  
            Règlementation d'exploitation, de gouvernance numérique et d'opposabilité juridique de la plateforme SIGRH-PORTEFEUILLE applicable aux 84 sociétés d'État, sociétés à participation financière publique et administrations de tutelle.
          
                </p>
              </div>
              <div className={"flex flex-wrap sm:flex-nowrap items-center gap-space-sm"}>
                <button className={"px-space-md py-space-sm rounded bg-surface-container hover:bg-surface-container-highest text-on-surface font-label-md text-label-md transition-colors flex items-center gap-space-xs shadow-sm"} type="button" onClick={() => window.print()}>
                  <Icone nom="print" className="text-[18px]" />
                  <span>
                    Imprimer
                  </span>
                </button>
                <a className={"px-space-md py-space-sm rounded bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md transition-all shadow-sm flex items-center gap-space-xs"} href={"#telecharger-cgu"}>
                  <Icone nom="download_for_offline" className="text-[18px]" />
                  <span>
                    Télécharger
                  </span>
                </a>
              </div>
            </div>
            <div className={"grid grid-cols-2 sm:grid-cols-4 gap-space-sm mt-space-md pt-space-sm"}>
              <div className={"bg-surface-container-lowest p-space-sm rounded shadow-sm"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Date d'effet légal
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-code-num"}>
                  1er Février 2026
                </span>
              </div>
              <div className={"bg-surface-container-lowest p-space-sm rounded shadow-sm"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Version normative
                </span>
                <span className={"font-label-lg text-label-lg text-primary font-code-num"}>
                  v2.6.4
                </span>
              </div>
              <div className={"bg-surface-container-lowest p-space-sm rounded shadow-sm"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Champs d'application
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface font-code-num"}>
                  84 Entités Publiques
                </span>
              </div>
              <div className={"bg-surface-container-lowest p-space-sm rounded shadow-sm"}>
                <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                  Autorité Dépositaire
                </span>
                <span className={"font-label-lg text-label-lg text-on-surface truncate block"}>
                  DGPE / MPEEP Côte d'Ivoire
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className={"mx-auto px-margin-desktop py-space-lg w-full motion-rise"}>
          <div className={"grid grid-cols-1 lg:grid-cols-12 gap-gutter-desktop items-start"}>
            <aside className={"hidden lg:block lg:col-span-3 sticky top-24 space-y-space-md"}>
              <div className={"bg-surface-container-lowest p-space-md rounded shadow-sm"}>
                <div className={"flex items-center justify-between pb-space-xs mb-space-sm"}>
                  <div className={"flex items-center gap-space-xs text-primary"}>
                    <Icone nom="account_tree" className="text-[20px]" />
                    <span className={"font-label-lg text-label-lg tracking-wide uppercase"}>
                      Sommaire des Articles
                    </span>
                  </div>
                  <span className={"font-code-num text-label-sm text-on-surface-variant"}>
                    6 Articles
                  </span>
                </div>
                <nav className={"space-y-1"} id={"cgu-nav"}>
                  <a className={"flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all font-body-sm text-body-sm group"} href={"#art-1"}>
                    <span className={"truncate"}>
                      Art. 1 : Objet & Périmètre Régalien
                    </span>
                    <span className={"font-code-num text-label-sm opacity-60 group-hover:opacity-100"}>
                      § 01
                    </span>
                  </a>
                  <a className={"flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all font-body-sm text-body-sm group"} href={"#art-2"}>
                    <span className={"truncate"}>
                      Art. 2 : Modalités d'accès
                    </span>
                    <span className={"font-code-num text-label-sm opacity-60 group-hover:opacity-100"}>
                      § 02
                    </span>
                  </a>
                  <a className={"flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all font-body-sm text-body-sm group"} href={"#art-3"}>
                    <span className={"truncate"}>
                      Art. 3 : Devoirs et Éthique RH
                    </span>
                    <span className={"font-code-num text-label-sm opacity-60 group-hover:opacity-100"}>
                      § 03
                    </span>
                  </a>
                  <a className={"flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all font-body-sm text-body-sm group"} href={"#art-4"}>
                    <span className={"truncate"}>
                      Art. 4 : Force Probante des Décrets
                    </span>
                    <span className={"font-code-num text-label-sm opacity-60 group-hover:opacity-100"}>
                      § 04
                    </span>
                  </a>
                  <a className={"flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all font-body-sm text-body-sm group"} href={"#art-5"}>
                    <span className={"truncate"}>
                      Art. 5 : Continuité Républicaine 24/7
                    </span>
                    <span className={"font-code-num text-label-sm opacity-60 group-hover:opacity-100"}>
                      § 05
                    </span>
                  </a>
                  <a className={"flex items-center justify-between px-space-sm py-2 rounded text-on-surface-variant hover:text-primary hover:bg-surface-container transition-all font-body-sm text-body-sm group"} href={"#art-6"}>
                    <span className={"truncate"}>
                      Art. 6 : Audit & Sanctions Pénales
                    </span>
                    <span className={"font-code-num text-label-sm opacity-60 group-hover:opacity-100"}>
                      § 06
                    </span>
                  </a>
                </nav>
              </div>
              <div className={"bg-primary/5 p-space-md rounded space-y-space-xs"}>
                <div className={"flex items-center gap-space-xs text-primary"}>
                  <Icone nom="shield" className="text-[20px]" />
                  <span className={"font-label-md text-label-md uppercase"}>
                    Sécurité Souveraine
                  </span>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Les consultations sont enregistrées dans le journal de la plateforme.
          
                </p>
                <div className={"pt-space-xs"}>
                  <a className={"font-label-sm text-label-sm text-primary hover:underline flex items-center gap-1 font-semibold"} href={"#assistance-dsi"}>
                    <span>
                      Signaler une anomalie d'habilitation
                    </span>
                    <Icone nom="arrow_forward" className="text-[14px]" />
                  </a>
                </div>
              </div>
              <div className={"bg-surface-container-low p-space-md rounded space-y-space-sm"}>
                <div className={"flex items-center gap-space-sm"}>
                  <div className={"w-10 h-10 rounded-full bg-secondary-container/20 text-secondary flex items-center justify-center font-bold"}>
                    <Icone nom="gavel" className="text-[20px]" />
                  </div>
                  <div>
                    <span className={"font-label-sm text-label-sm text-on-surface-variant block"}>
                      Cadre Légal de Référence
                    </span>
                    <span className={"font-label-md text-label-md text-on-surface"}>
                      Loi N° 2013-450 & 451
                    </span>
                  </div>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Textes ivoiriens régissant la protection des données nominatives et la répression des atteintes aux systèmes d'information d'État.
          
                </p>
              </div>
            </aside>
            <main className={"col-span-1 lg:col-span-9 space-y-space-lg"}>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md"}>
                <div className={"flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm bg-surface-container-low p-space-md rounded"}>
                  <div className={"flex items-center gap-space-md"}>
                    <div className={"w-12 h-12 rounded bg-primary text-on-primary flex items-center justify-center shrink-0"}>
                      <Icone nom="policy" className="text-[28px]" />
                    </div>
                    <div>
                      <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                        Préambule Souverain
                      </h2>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Décret N° 2024-118/PR fixant le régime de gouvernance numérique des entreprises publiques de l'État de Côte d'Ivoire.
                
                      </p>
                    </div>
                  </div>
                  <span className={"px-space-sm py-1 rounded bg-primary/10 text-primary font-label-sm text-label-sm self-start sm:self-center font-semibold uppercase"}>
                    
              Application Immédiate
            
                  </span>
                </div>
                <div className={"prose font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              Le Système Intégré de Gestion des Ressources Humaines du Portefeuille de l'État (ci-après désigné 
                    <strong>
                      « SIGRH-PORTEFEUILLE »
                    </strong>
                    ) constitue l'infrastructure numérique unique, souveraine et exclusive dédiée au pilotage, à la liquidation statutaire, à l'avancement hiérarchique et à la gestion prévisionnelle des emplois et compétences pour l'ensemble des organismes sous tutelle du Ministère du Portefeuille de l'État et des Entreprises Publiques (MPEEP).
            
                  </p>
                  <p>
                    
              L'accès et l'utilisation de cet instrument de souveraineté administrative sont subordonnés à l'acceptation sans réserve des présentes Conditions Générales d'Utilisation. Tout acte accompli sur la plateforme engage solennellement la responsabilité administrative, disciplinaire et pénale de l'agent habilité, au titre des principes constitutionnels de neutralité, probité et continuité du service républicain.
            
                  </p>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md scroll-mt-24"} id={"art-1"}>
                <div className={"flex items-start justify-between gap-space-md pb-space-xs"}>
                  <div className={"space-y-1"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-code-num text-label-md text-primary font-bold"}>
                        ARTICLE PREMIER
                      </span>
                      <span className={"text-outline-variant"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Champ Régalien
                      </span>
                    </div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Objet et Périmètre d'Application
              
                    </h2>
                  </div>
                  <span className={"w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary font-code-num text-label-md font-bold"}>
                    
              01
            
                  </span>
                </div>
                <div className={"font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              Les présentes CGU ont pour objet de prescrire les normes de conformité, d'intégrité et de sécurité applicables à l'ensemble des opérations de traitement RH automatisées. Sont impérativement soumises aux dispositions du présent règlement :
            
                  </p>
                  <div className={"grid grid-cols-1 md:grid-cols-3 gap-space-sm my-space-md"}>
                    <div className={"bg-surface-container-low p-space-sm rounded space-y-1"}>
                      <Icone nom="apartment" className="text-primary text-[20px]" />
                      <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                        Sociétés d'État
                      </h3>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Sociétés anonymes unipersonnelles créées par la loi dont le capital est intégralement détenu par l'État de Côte d'Ivoire.
                      </p>
                    </div>
                    <div className={"bg-surface-container-low p-space-sm rounded space-y-1"}>
                      <Icone nom="pie_chart" className="text-primary text-[20px]" />
                      <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                        Sociétés d'Économie Mixte
                      </h3>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        Entreprises dans lesquelles l'État ou une personne publique détient une participation financière directe ou indirecte.
                      </p>
                    </div>
                    <div className={"bg-surface-container-low p-space-sm rounded space-y-1"}>
                      <Icone nom="assured_workload" className="text-primary text-[20px]" />
                      <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                        Établissements Publics
                      </h3>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        EPN, EPA, et agences exécutives à compétence sectorielle relevant du portefeuille de l'État sous double tutelle.
                      </p>
                    </div>
                  </div>
                  <p>
                    <strong>
                      1.2.
                    </strong>
                     Aucune transaction RH, nomination d'administrateur ou reclassement catégoriel ne peut être validée hors de l'écosystème SIGRH-PORTEFEUILLE, sous peine de nullité de plein droit pour vice de forme légale. La masse salariale est suivie par la solde, hors de cette application.
            
                  </p>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md scroll-mt-24"} id={"art-2"}>
                <div className={"flex items-start justify-between gap-space-md pb-space-xs"}>
                  <div className={"space-y-1"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-code-num text-label-md text-primary font-bold"}>
                        ARTICLE DEUXIÈME
                      </span>
                      <span className={"text-outline-variant"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Identification Sécurisée
                      </span>
                    </div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Habilitations Récaliennes, Authentification
              
                    </h2>
                  </div>
                  <span className={"w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary font-code-num text-label-md font-bold"}>
                    
              02
            
                  </span>
                </div>
                <div className={"font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              L'accès est nominatif : chaque utilisateur se connecte avec son matricule et son mot de passe.
            
                  </p>
                  <div className={"bg-surface-container p-space-md rounded space-y-space-sm"}>
                    <div className={"flex items-center gap-space-xs text-primary font-label-lg text-label-lg"}>
                      <Icone nom="fingerprint" className="text-[20px]" />
                      <span>
                        Conditions d'Accès Cumulatives Obligatoires
                      </span>
                    </div>
                    <ul className={"space-y-2 font-body-sm text-body-sm text-on-surface"}>
                      <li className={"flex items-start gap-space-xs"}>
                        <Icone nom="check_circle" className="text-primary text-[18px] shrink-0" />
                        <span>
                          <strong>
                            Matricule et mot de passe :
                          </strong>
                           Identifiants attribués à l'agent pour ouvrir sa session.
                        </span>
                      </li>
                    </ul>
                  </div>
                  <div className={"p-space-md rounded bg-secondary-container/15 flex items-start gap-space-sm"}>
                    <Icone nom="warning" className="text-secondary text-[24px] shrink-0 mt-0.5" />
                    <div className={"space-y-1"}>
                      <span className={"font-label-lg text-label-lg text-on-surface block"}>
                        Stricte Incessibilité des Identifiants
                      </span>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Les identifiants et certificats de signature sont personnels, incessibles et inaliénables. La transmission volontaire d'accès à un tiers, même collaborateur subordonné, constitue une faute disciplinaire de 3ème degré sanctionnée par la révocation sans indemnité.
                
                      </p>
                    </div>
                  </div>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md scroll-mt-24"} id={"art-3"}>
                <div className={"flex items-start justify-between gap-space-md pb-space-xs"}>
                  <div className={"space-y-1"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-code-num text-label-md text-primary font-bold"}>
                        ARTICLE TROISIÈME
                      </span>
                      <span className={"text-outline-variant"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Déontologie des Données
                      </span>
                    </div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Obligations et Responsabilités des Gestionnaires RH
              
                    </h2>
                  </div>
                  <span className={"w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary font-code-num text-label-md font-bold"}>
                    
              03
            
                  </span>
                </div>
                <div className={"font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              Les Directeurs des Ressources Humaines (DRH), chefs de services administratifs, contrôleurs financiers délégués et administrateurs de données s'engagent formellement à :
            
                  </p>
                  <div className={"grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs"}>
                    <div className={"bg-surface-container-low p-space-md rounded space-y-space-xs"}>
                      <div className={"flex items-center gap-space-xs text-primary"}>
                        <Icone nom="verified" className="text-[20px]" />
                        <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                          Sincérité des Éléments de Carrière
                        </h3>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Garantir l'exactitude des informations saisies (diplômes, échelons, avancements, congés statutaires). Tout enregistrement d'une ancienneté fictive ou falsifiée constitue un faux en écriture publique réprimé par le Code Pénal ivoirien.
                
                      </p>
                    </div>
                    <div className={"bg-surface-container-low p-space-md rounded space-y-space-xs"}>
                      <div className={"flex items-center gap-space-xs text-primary"}>
                        <Icone nom="lock" className="text-[20px]" />
                        <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                          Secret Professionnel Renforcé
                        </h3>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Observer une confidentialité absolue sur les fiches de paie, avis médicaux d'aptitude, données disciplinaires et notations des agents, conformément à la Loi N° 2013-450 sur la protection des données personnelles.
                
                      </p>
                    </div>
                    <div className={"bg-surface-container-low p-space-md rounded space-y-space-xs"}>
                      <div className={"flex items-center gap-space-xs text-primary"}>
                        <Icone nom="history_toggle_off" className="text-[20px]" />
                        <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                          Respect des Délais Réglementaires
                        </h3>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Soumettre les projets d'actes d'avancement au moins 45 jours avant la session trimestrielle de la Commission Mixte Portefeuille-Fonction Publique pour instruction contradictoire.
                
                      </p>
                    </div>
                    <div className={"bg-surface-container-low p-space-md rounded space-y-space-xs"}>
                      <div className={"flex items-center gap-space-xs text-primary"}>
                        <Icone nom="cloud_sync" className="text-[20px]" />
                        <h3 className={"font-label-lg text-label-lg text-on-surface"}>
                          Dépôt Numérique des Originaux
                        </h3>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Téléverser exclusivement des pièces justificatives au format PDF/A-1b signé, scannées en résolution optique certifiée (300 DPI minimum) avec les pièces jointes.
                
                      </p>
                    </div>
                  </div>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md scroll-mt-24"} id={"art-4"}>
                <div className={"flex items-start justify-between gap-space-md pb-space-xs"}>
                  <div className={"space-y-1"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-code-num text-label-md text-primary font-bold"}>
                        ARTICLE QUATRIÈME
                      </span>
                      <span className={"text-outline-variant"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Validité Juridique
                      </span>
                    </div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Force Probante de la Signature Électronique & Décrets Dématérialisés
              
                    </h2>
                  </div>
                  <span className={"w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary font-code-num text-label-md font-bold"}>
                    
              04
            
                  </span>
                </div>
                <div className={"font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              En application de l'Ordonnance N° 2012-293 relative aux télécommunications et technologies de l'information et des décrets d'application subséquents :
            
                  </p>
                  <div className={"p-space-md rounded bg-surface-container-low space-y-space-sm"}>
                    <div className={"flex items-center justify-between"}>
                      <span className={"font-label-lg text-label-lg text-on-surface font-semibold"}>
                        Chaîne d'Opposabilité d'un Acte SIGRH
                      </span>
                    </div>
                    <div className={"grid grid-cols-1 sm:grid-cols-3 gap-space-xs pt-space-xs"}>
                      <div className={"bg-surface-container-lowest p-space-sm rounded"}>
                        <div className={"flex items-center gap-2 mb-1"}>
                          <span className={"w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-code-num text-label-sm"}>
                            1
                          </span>
                          <span className={"font-label-md text-label-md text-on-surface"}>
                            Visa DGPE
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          Image de signature déposée par le responsable.
                        </p>
                      </div>
                      <div className={"bg-surface-container-lowest p-space-sm rounded"}>
                        <div className={"flex items-center gap-2 mb-1"}>
                          <span className={"w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-code-num text-label-sm"}>
                            2
                          </span>
                          <span className={"font-label-md text-label-md text-on-surface"}>
                            Papier à en-tête
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          Établi hors ligne, puis scanné dans le dossier.
                        </p>
                      </div>
                      <div className={"bg-surface-container-lowest p-space-sm rounded"}>
                        <div className={"flex items-center gap-2 mb-1"}>
                          <span className={"w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-code-num text-label-sm"}>
                            3
                          </span>
                          <span className={"font-label-md text-label-md text-on-surface"}>
                            Enregistrement
                          </span>
                        </div>
                        <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                          La date retenue est celle de l'enregistrement du visa.
                        </p>
                      </div>
                    </div>
                  </div>
                  <p>
                    <strong>
                      4.2.
                    </strong>
                     Le visa enregistré autorise l'établissement du papier à en-tête. Le droit de l'agent s'ouvre lorsque ce papier est scanné dans le dossier.
            
                  </p>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md scroll-mt-24"} id={"art-5"}>
                <div className={"flex items-start justify-between gap-space-md pb-space-xs"}>
                  <div className={"space-y-1"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-code-num text-label-md text-primary font-bold"}>
                        ARTICLE CINQUIÈME
                      </span>
                      <span className={"text-outline-variant"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Continuité Régalien
                      </span>
                    </div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Disponibilité de Service, Maintenance et PRA National
              
                    </h2>
                  </div>
                  <span className={"w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary font-code-num text-label-md font-bold"}>
                    
              05
            
                  </span>
                </div>
                <div className={"font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              L'État s'engage à garantir un taux de disponibilité cible de 
                    <strong>
                      99,8%
                    </strong>
                     en période ouvrable (du lundi au vendredi, de 07h00 à 19h00 GMT) hors interventions préventives ordonnées par la Direction des Systèmes d'Information (DSI).
            
                  </p>
                  <div className={"grid grid-cols-1 md:grid-cols-2 gap-space-sm"}>
                    <div className={"p-space-md rounded bg-surface-container-low space-y-1"}>
                      <div className={"flex items-center gap-space-xs text-primary"}>
                        <Icone nom="build" className="text-[18px]" />
                        <span className={"font-label-lg text-label-lg text-on-surface"}>
                          Fenêtres de Maintenance Régulière
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  Chaque premier samedi du mois entre 00h00 et 06h00 GMT. Les usagers et DRH sont notifiés au moins 72 heures à l'avance via bandeau d'alerte souverain.
                
                      </p>
                    </div>
                    <div className={"p-space-md rounded bg-surface-container-low space-y-1"}>
                      <div className={"flex items-center gap-space-xs text-primary"}>
                        <Icone nom="emergency_home" className="text-[18px]" />
                        <span className={"font-label-lg text-label-lg text-on-surface"}>
                          Plan de Reprise d'Activité (PRA)
                        </span>
                      </div>
                      <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                        
                  En cas d'incident majeur ou d'état de force majeure républicain, le basculement sur le datacenter de secours national de Yamoussoukro s'opère dans un délai RTO maximal de 4 heures.
                
                      </p>
                    </div>
                  </div>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md scroll-mt-24"} id={"art-6"}>
                <div className={"flex items-start justify-between gap-space-md pb-space-xs"}>
                  <div className={"space-y-1"}>
                    <div className={"flex items-center gap-space-xs"}>
                      <span className={"font-code-num text-label-md text-error font-bold"}>
                        ARTICLE SIXIÈME
                      </span>
                      <span className={"text-outline-variant"}>
                        •
                      </span>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant uppercase"}>
                        Contentieux & Pénalités
                      </span>
                    </div>
                    <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Sanctions, Audit Légal et Dispositions Pénales
              
                    </h2>
                  </div>
                  <span className={"w-8 h-8 rounded bg-error-container text-on-error-container font-code-num text-label-md font-bold flex items-center justify-center"}>
                    
              06
            
                  </span>
                </div>
                <div className={"font-body-md text-body-md text-on-surface space-y-space-sm leading-relaxed"}>
                  <p>
                    
              Les connexions et les consultations de dossiers sont enregistrées.
            
                  </p>
                  <div className={"p-space-md rounded bg-error-container/20 space-y-space-sm"}>
                    <div className={"flex items-center gap-space-xs text-error font-label-lg text-label-lg"}>
                      <Icone nom="gavel" className="text-[22px]" />
                      <span>
                        Rappel Sévère des Sanctions Prévues par la Loi N° 2013-451
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface"}>
                      
                Sont passibles de 
                      <strong>
                        cinq (05) à dix (10) ans d'emprisonnement ferme
                      </strong>
                       et d'une amende de 
                      <strong>
                        10 000 000 à 50 000 000 de FCFA
                      </strong>
                       :
              
                    </p>
                    <ul className={"space-y-1.5 font-body-sm text-body-sm text-on-surface-variant list-disc pl-space-md"}>
                      <li>
                        L'accès frauduleux ou le maintien sans droit dans le système automatisé de données de l'État ;
                      </li>
                      <li>
                        L'altération volontaire, la suppression ou l'ajout indu de mentions statutaires, notes d'évaluation ou montants indemnitaies ;
                      </li>
                      <li>
                        L'extraction massive ou la divulgation non autorisée de la base de données nominative des agents du secteur public ;
                      </li>
                      <li>
                        Toute tentative d'entrave ou d'interférence avec les mécanismes de cryptographie et de traçabilité républicains.
                      </li>
                    </ul>
                  </div>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant pt-space-xs"}>
                    
              Les poursuites pénales s'exercent sans préjudice des sanctions disciplinaires prévues par le Statut Général de la Fonction Publique, pouvant aller jusqu'à la destitution immédiate avec perte des droits à pension pour faute contre la Nation.
            
                  </p>
                </div>
              </section>
              <section className={"bg-surface-container-high/40 p-space-lg rounded space-y-space-md"} id={"telecharger-cgu"}>
                <div className={"flex flex-col sm:flex-row items-center justify-between gap-space-md"}>
                  <div className={"space-y-1 text-center sm:text-left"}>
                    <span className={"font-label-sm text-label-sm text-primary uppercase font-bold tracking-wider"}>
                      
                Exemplaire Authentifié pour Impression Officielle
              
                    </span>
                    <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                      
                Télécharger l'Arrêté Portant Approbation des CGU
              
                    </h3>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      
                Ce document n'est pas encore disponible au téléchargement.
              
                    </p>
                  </div>
                  <button className={"px-space-lg py-space-sm bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md rounded flex items-center gap-space-xs transition-colors shrink-0 shadow-sm"} type="button" data-soon>
                    <Icone nom="verified_user" className="text-[20px]" />
                    <span>
                      Télécharger
                    </span>
                  </button>
                </div>
                <div className={"pt-space-sm flex flex-wrap items-center justify-between gap-space-sm text-on-surface-variant font-label-sm text-label-sm"}>
                  <span className={"font-code-num"}>
                    Registre N° REG-2026-MPEEP-CI
                  </span>
                </div>
              </section>
              <section className={"bg-surface-container-lowest p-space-lg rounded shadow-sm space-y-space-md"} id={"assistance-dsi"}>
                <div className={"flex items-center gap-space-xs pb-space-xs"}>
                  <Icone nom="contact_support" className="text-primary text-[22px]" />
                  <h2 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    
              Contact Régalien & Délégué à la Protection des Données (DPO)
            
                  </h2>
                </div>
                <p className={"font-body-md text-body-md text-on-surface-variant"}>
                  
            Pour toute demande d'interprétation statutaire, notification de violation de sécurité ou saisine de l'autorité de contrôle informatique :
          
                </p>
                <div className={"grid grid-cols-1 md:grid-cols-3 gap-space-md"}>
                  <div className={"bg-surface-container-low p-space-md rounded space-y-1"}>
                    <span className={"font-label-md text-label-md text-primary font-bold"}>
                      Secrétariat Général Juridique
                    </span>
                    <p className={"font-body-sm text-body-sm text-on-surface"}>
                      Ministère du Portefeuille de l'État
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Abidjan-Plateau, Immeuble SCIAM, 14ème étage
                    </p>
                    <p className={"font-label-sm text-label-sm text-primary font-code-num pt-1"}>
                      affaires-juridiques@mpeep.gouv.ci
                    </p>
                  </div>
                  <div className={"bg-surface-container-low p-space-md rounded space-y-1"}>
                    <span className={"font-label-md text-label-md text-primary font-bold"}>
                      Délégué à la protection des données
                    </span>
                    <p className={"font-body-sm text-body-sm text-on-surface"}>
                      Délégation aux Droits Numériques
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Guichet unique d'exercice des droits CNIL-CI
                    </p>
                    <p className={"font-label-sm text-label-sm text-primary font-code-num pt-1"}>
                      dpo-sigrh@mpeep.gouv.ci
                    </p>
                  </div>
                  <div className={"bg-surface-container-low p-space-md rounded space-y-1"}>
                    <span className={"font-label-md text-label-md text-secondary font-bold"}>
                      Centre de Réponse Incidents DSI
                    </span>
                    <p className={"font-body-sm text-body-sm text-on-surface"}>
                      CERT Souverain Administration
                    </p>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      Ligne directe d'urgence 24/7
                    </p>
                    <p className={"font-label-sm text-label-sm text-secondary font-code-num pt-1"}>
                      +225 20 21 00 99 (Poste 112)
                    </p>
                  </div>
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
    </main>
    <footer className={"w-full bg-surface-container-low mt-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"mx-auto px-margin-desktop py-space-xl"}>
        <div className={"grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-lg"}>
          <div className={"space-y-space-sm"}>
            <div className={"flex items-center gap-space-sm"}>
              <Icone nom="account_balance" className="text-primary text-[24px]" />
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
