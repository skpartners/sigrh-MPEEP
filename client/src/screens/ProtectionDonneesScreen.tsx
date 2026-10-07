import { useRef } from "react";
import { Link } from "react-router-dom";
import { PublicHeaderNav } from "./PublicHeaderNav";
import { useHauteurFixe } from "../ui/HauteurFixe";
import { Icone } from "../ui/Icone";

export function ProtectionDonneesScreen() {
  const enteteRef = useRef<HTMLElement>(null);
  useHauteurFixe(enteteRef, "--haut-entete");
  return (
    <>
    <header ref={enteteRef} className={"fixed top-0 w-full z-50 bg-surface/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
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
            <Icone nom="person" className="text-on-primary text-[1.125rem]" />
          </div>
        </div>
      </div>
    </header>
    <main className={"w-full pt-[calc(var(--haut-entete)+0.5rem)] bg-surface motion-rise"}>
      <div className={"flex flex-col w-full"}>
        {/* Fil d'ariane & Contexte Régalien */}
        <section className={"w-full bg-surface-container-low py-space-md"}>
          <div className={"mx-auto px-margin-desktop flex flex-col md:flex-row md:items-center justify-between gap-space-sm"}>
            <nav aria-label={"Breadcrumb"} className={"flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant"}>
              <Link className={"hover:text-primary transition-colors flex items-center gap-1"} to="/">
                <Icone nom="home" className="text-[1rem]" />
                <span>
                  Accueil
                </span>
              </Link>
              <Icone nom="chevron_right" className="text-[0.875rem] text-on-surface-variant" />
              <a className={"hover:text-primary transition-colors"} href={"#"} data-soon>
                Gouvernance & Droits
              </a>
              <Icone nom="chevron_right" className="text-[0.875rem] text-on-surface-variant" />
              <span className={"text-primary font-semibold"}>
                Conformité Données Personnelles (Loi n° 2013-450 & RGPD)
              </span>
            </nav>
            <div className={"flex items-center gap-space-sm self-start md:self-auto"}>
            </div>
          </div>
        </section>
        {/* En-tête Institutionnel & Statut de Protection */}
        <section className={"w-full bg-surface py-space-xl"}>
          <div className={"mx-auto px-margin-desktop"}>
            <div className={"grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-center"}>
              <div className={"lg:col-span-8 space-y-space-md"}>
                <div className={"inline-flex items-center gap-2 bg-primary/10 text-primary px-space-md py-1 rounded text-label-sm font-label-sm tracking-wide uppercase"}>
                  <Icone nom="shield_with_heart" className="text-[1rem]" />
                  <span>
                    Régime de Souveraineté & Protection des Libertés Numériques
                  </span>
                </div>
                <h1 className={"font-headline-xl text-headline-xl text-on-surface tracking-tight"}>
                  
            Registre Réglementaire & Sécurisation des Données à Caractère Personnel
          
                </h1>
                <p className={"font-body-lg text-body-lg text-on-surface-variant max-w-3xl leading-relaxed"}>
                  
            Conformément à la 
                  <strong className={"text-on-surface"}>
                    Loi n° 2013-450 du 19 juin 2013
                  </strong>
                   régissant la République de Côte d'Ivoire, renforcée par l'alignement sur la 
                  <strong className={"text-on-surface"}>
                    Convention de Malabo
                  </strong>
                   et les exigences d'interopérabilité transfrontalière 
                  <strong className={"text-on-surface"}>
                    RGPD
                  </strong>
                  , le Système Intégré SIGRH-Portefeuille applique les plus hauts standards de préservation des identités des agents de l'État et des cadres des sociétés publiques.
          
                </p>
                {/* Double Ancrage Juridique */}
                <div className={"grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs"}>
                  <div className={"bg-surface-container-low p-space-md rounded-xl space-y-2 relative overflow-hidden"}>
                    <div className={"w-1.5 h-full bg-primary absolute left-0 top-0"}></div>
                    <div className={"flex items-center gap-2 pl-space-xs"}>
                      <Icone nom="account_balance" className="text-primary text-[1.25rem]" />
                      <span className={"font-label-lg text-label-lg text-primary uppercase"}>
                        Droit Souverain Ivoirien
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant pl-space-xs"}>
                      
                Loi n° 2013-450 : Déclaration intégrale auprès de l'Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire (ARTCI). Garantie d'inaliénabilité des registres de carrière et des données biométriques.
              
                    </p>
                  </div>
                  <div className={"bg-surface-container-low p-space-md rounded-xl space-y-2 relative overflow-hidden"}>
                    <div className={"w-1.5 h-full bg-secondary absolute left-0 top-0"}></div>
                    <div className={"flex items-center gap-2 pl-space-xs"}>
                      <Icone nom="public" className="text-secondary text-[1.25rem]" />
                      <span className={"font-label-lg text-label-lg text-secondary uppercase"}>
                        Normes Panafricaines & RGPD
                      </span>
                    </div>
                    <p className={"font-body-sm text-body-sm text-on-surface-variant pl-space-xs"}>
                      
                Protocole de Malabo & RGPD (Règlement UE 2016/679) : Assure l'extraterritorialité protectrice pour les diplomates, fonctionnaires détachés au sein des missions d'État et cadres de filiales internationales.
              
                    </p>
                  </div>
                </div>
              </div>
              {/* Sceau Officiel de Certification */}
              <div className={"lg:col-span-4 flex flex-col items-center justify-center p-space-lg bg-surface-container-lowest rounded-xl shadow-md text-center relative"}>
                <div className={"w-32 h-32 mb-space-sm rounded-full bg-surface-container-low flex items-center justify-center relative shadow-sm"}>
                  <img className={"w-24 h-24 object-contain"} alt="Armoiries de la République de Côte d'Ivoire" src={`${import.meta.env.BASE_URL}logo.png`} />
                  <div className={"absolute -bottom-1 -right-1 bg-primary text-on-primary rounded-full p-1.5 shadow"}>
                    <Icone nom="verified" className="text-[1rem] block" />
                  </div>
                </div>
                <span className={"font-headline-sm text-headline-sm text-on-surface"}>
                  Homologation Déléguée
                </span>
                <p className={"font-label-sm text-label-sm text-on-surface-variant mt-1 mb-space-md"}>
                  DPO / CIL Ministériel : Bureau de Conformité Numérique
                </p>
                <div className={"w-full bg-surface-container-low p-space-sm rounded text-left space-y-1 mb-space-md"}>
                  <div className={"flex justify-between font-label-sm text-label-sm"}>
                    <span className={"text-on-surface-variant"}>
                      Autorité de Contrôle :
                    </span>
                    <span className={"font-semibold text-on-surface"}>
                      ARTCI Côte d'Ivoire
                    </span>
                  </div>
                  <div className={"flex justify-between font-label-sm text-label-sm"}>
                    <span className={"text-on-surface-variant"}>
                      Agrément Traitement :
                    </span>
                    <span className={"font-code-num text-code-num text-primary"}>
                      N° CI-DP-2025-089
                    </span>
                  </div>
                  <div className={"flex justify-between font-label-sm text-label-sm"}>
                    <span className={"text-on-surface-variant"}>
                      Niveau d'exigence :
                    </span>
                    <span className={"font-semibold text-primary"}>
                      Souverain - Défense
                    </span>
                  </div>
                </div>
                <button className={"w-full bg-primary hover:bg-primary-container text-on-primary py-space-xs px-space-md rounded font-label-lg text-label-lg flex items-center justify-center gap-2 shadow-sm transition-colors"} type="button" data-long-action="Génération du document certifié…" data-long-action-done="Document prêt">
                  <Icone nom="download_for_offline" className="text-[1.125rem]" />
                  <span>
                    Attestation de Conformité 2026
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>
        {/* Métriques & Cartographie des Traitements */}
        <section className={"w-full bg-surface-container-low py-space-lg"}>
          <div className={"mx-auto px-margin-desktop"}>
            <div className={"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md"}>
              {/* KPI 1 */}
              <div className={"bg-surface-container-lowest p-space-md rounded-xl border border-hairline space-y-2"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Agrément Légal
                  </span>
                  <Icone nom="policy" className="text-primary text-[1.375rem]" />
                </div>
                <div className={"font-headline-lg text-headline-lg text-on-surface font-code-num"}>
                  100%
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1"}>
                  <span className={"text-primary font-semibold"}>
                    En cours
                  </span>
                   - Exercice budgétaire 2026
          
                </p>
              </div>
              {/* KPI 2 */}
              <div className={"bg-surface-container-lowest p-space-md rounded-xl border border-hairline space-y-2"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Registres Actifs
                  </span>
                  <Icone nom="inventory_2" className="text-secondary text-[1.375rem]" />
                </div>
                <div className={"font-headline-lg text-headline-lg text-on-surface font-code-num"}>
                  14
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Fichiers RH, soldes, avancements & carrières
          
                </p>
              </div>
              {/* KPI 3 */}
              <div className={"bg-surface-container-lowest p-space-md rounded-xl border border-hairline space-y-2"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Agents Protégés
                  </span>
                  <Icone nom="badge" className="text-primary text-[1.375rem]" />
                </div>
                <div className={"font-headline-lg text-headline-lg text-on-surface font-code-num"}>
                  48 720
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Fonctionnaires & cadres entreprises publiques
          
                </p>
              </div>
              {/* KPI 4 */}
              <div className={"bg-surface-container-lowest p-space-md rounded-xl border border-hairline space-y-2"}>
                <div className={"flex items-center justify-between"}>
                  <span className={"font-label-md text-label-md text-on-surface-variant uppercase tracking-wider"}>
                    Hébergement Souverain
                  </span>
                  <Icone nom="cloud_done" className="text-primary text-[1.375rem]" />
                </div>
                <div className={"font-headline-lg text-headline-lg text-primary font-code-num"}>
                  Tier-III CI
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Abidjan Plateau & Grand-Bassam VITIB
          
                </p>
              </div>
            </div>
          </div>
        </section>
        {/* Les 6 Piliers d'application concrète dans le SIGRH */}
        <section className={"w-full bg-surface py-space-xl"}>
          <div className={"mx-auto px-margin-desktop space-y-space-lg"}>
            <div className={"space-y-space-xs max-w-2xl"}>
              <span className={"font-label-sm text-label-sm text-secondary uppercase font-semibold tracking-wider"}>
                Cadre Opérationnel
              </span>
              <h2 className={"font-headline-lg text-headline-lg text-on-surface"}>
                Les 6 Piliers du Traitement Statutaire
              </h2>
              <p className={"font-body-md text-body-md text-on-surface-variant"}>
                
          Chaque manipulation de dossier agent au sein du portefeuille ministériel obéit aux six impératifs légaux prescrits par la directive ARTCI et les préceptes RGPD.
        
              </p>
            </div>
            <div className={"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md"}>
              {/* Pilier 1 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline space-y-space-sm relative"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary"}>
                  <Icone nom="gavel" className="text-[1.5rem]" />
                </div>
                <div className={"space-y-1"}>
                  <span className={"font-code-num text-code-num text-primary font-bold"}>
                    PILIER 01
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Licéité, Loyauté & Transparence
                  </h3>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Les actes d'affectation, arrêtés ministériels et avancements d'échelon reposent exclusivement sur des fondements législatifs établis et notifiés à l'agent avant toute inscription administrative.
          
                </p>
                <div className={"pt-2"}>
                  <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-primary"}>
                    <Icone nom="check_circle" className="text-[0.875rem]" />
                     Art. 14 Loi 2013-450
            
                  </span>
                </div>
              </div>
              {/* Pilier 2 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline space-y-space-sm relative"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary"}>
                  <Icone nom="target" className="text-[1.5rem]" />
                </div>
                <div className={"space-y-1"}>
                  <span className={"font-code-num text-code-num text-secondary font-bold"}>
                    PILIER 02
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Limitation Stricte des Finalités
                  </h3>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Les informations recueillies sont cantonnées rigoureusement à la gestion de la carrière publique, du versement des traitements indiciaires et de la tutelle économique du Ministère. Aucun usage tiers commercial n'est autorisé.
          
                </p>
                <div className={"pt-2"}>
                  <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary"}>
                    <Icone nom="check_circle" className="text-[0.875rem]" />
                     Finalité statutaire exclusive
            
                  </span>
                </div>
              </div>
              {/* Pilier 3 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline space-y-space-sm relative"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary"}>
                  <Icone nom="filter_alt" className="text-[1.5rem]" />
                </div>
                <div className={"space-y-1"}>
                  <span className={"font-code-num text-code-num text-primary font-bold"}>
                    PILIER 03
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Minimisation des Données
                  </h3>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Seules les données indispensables à l'exercice républicain sont requises. La collecte de données sensibles (santé, confession, opinions) fait l'objet d'un chiffrement asymétrique et d'une stricte interdiction de consultation générale.
          
                </p>
                <div className={"pt-2"}>
                  <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-primary"}>
                    <Icone nom="check_circle" className="text-[0.875rem]" />
                     Principe de parcimonie
            
                  </span>
                </div>
              </div>
              {/* Pilier 4 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline space-y-space-sm relative"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary"}>
                  <Icone nom="sync" className="text-[1.5rem]" />
                </div>
                <div className={"space-y-1"}>
                  <span className={"font-code-num text-code-num text-primary font-bold"}>
                    PILIER 04
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Exactitude & Synchronisation FOP
                  </h3>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Interconnexion sécurisée en temps réel avec le référentiel central de la Fonction Publique de Côte d'Ivoire (FOP-CI) et la Direction Générale du Budget pour éradiquer les doublons et faux matricules civils.
          
                </p>
                <div className={"pt-2"}>
                  <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-primary"}>
                    <Icone nom="check_circle" className="text-[0.875rem]" />
                     Contrôle biométrique continu
            
                  </span>
                </div>
              </div>
              {/* Pilier 5 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline space-y-space-sm relative"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary"}>
                  <Icone nom="history_edu" className="text-[1.5rem]" />
                </div>
                <div className={"space-y-1"}>
                  <span className={"font-code-num text-code-num text-secondary font-bold"}>
                    PILIER 05
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Conservation & Archives Nationales
                  </h3>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Les pièces administratives courantes sont conservées le temps de l'activité de l'agent majoré de 5 ans pour calcul des droits de retraite, avant versement légal aux Archives Nationales de Côte d'Ivoire.
          
                </p>
                <div className={"pt-2"}>
                  <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary"}>
                    <Icone nom="check_circle" className="text-[0.875rem]" />
                     DUA & Tri Réglementaire
            
                  </span>
                </div>
              </div>
              {/* Pilier 6 */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline space-y-space-sm relative"}>
                <div className={"w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary"}>
                  <Icone nom="vpn_lock" className="text-[1.5rem]" />
                </div>
                <div className={"space-y-1"}>
                  <span className={"font-code-num text-code-num text-primary font-bold"}>
                    PILIER 06
                  </span>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Intégrité & Souveraineté Territoriale
                  </h3>
                </div>
                <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                  
            Les données de la plateforme sont conservées pour le ministère.
          
                </p>
                <div className={"pt-2"}>
                  <span className={"inline-flex items-center gap-1 font-label-sm text-label-sm text-primary"}>
                    <Icone nom="check_circle" className="text-[0.875rem]" />
                     Souveraineté Cloud 100% CI
            
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* Section Interactive : Exercice des Droits des Fonctionnaires & Cadres */}
        <section className={"w-full bg-surface-container-low py-space-xl"}>
          <div className={"mx-auto px-margin-desktop space-y-space-lg"}>
            <div className={"flex flex-col md:flex-row md:items-end justify-between gap-space-md"}>
              <div className={"space-y-space-xs max-w-2xl"}>
                <span className={"font-label-sm text-label-sm text-primary uppercase font-semibold tracking-wider"}>
                  Espace Agent & Mandataire
                </span>
                <h2 className={"font-headline-lg text-headline-lg text-on-surface"}>
                  Guichet Numérique des Droits Individuels
                </h2>
                <p className={"font-body-md text-body-md text-on-surface-variant"}>
                  
            Chaque agent rattaché au portefeuille ministériel peut déclencher instantanément ses droits statutaires garantis par les articles 28 à 34 de la Loi n° 2013-450.
          
                </p>
              </div>
              <div className={"bg-surface-container-highest px-space-md py-space-xs rounded text-primary font-label-md text-label-md flex items-center gap-2"}>
                <Icone nom="lock_clock" className="text-[1.125rem]" />
                <span>
                  {"D\u00e9lai d'instruction l\u00e9gal garanti : < 72 heures ouvr\u00e9es"}
                </span>
              </div>
            </div>
            <div className={"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md"}>
              {/* Action 1 : Droit d'Accès & Portabilité */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline flex flex-col justify-between space-y-space-md"}>
                <div className={"space-y-space-xs"}>
                  <div className={"flex items-center justify-between"}>
                    <Icone nom="file_open" className="text-primary text-[1.75rem]" />
                    <span className={"bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded font-label-sm text-label-sm"}>
                      Art. 28 Loi 2013
                    </span>
                  </div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Accès & Portabilité de Carrière
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    
              Générez une copie certifiée conforme de l'intégralité de vos données administratives (dossier indiciaire, historique des grades, avis de notation, attestations de présence au poste).
            
                  </p>
                </div>
                <button className={"w-full bg-primary hover:bg-primary-container text-on-primary py-space-xs px-space-md rounded font-label-md text-label-md flex items-center justify-center gap-2 transition-colors"} type="button" data-long-action="Génération du document certifié…" data-long-action-done="Document prêt">
                  <Icone nom="download" className="text-[1.125rem]" />
                  <span>
                    Demander mon Extrait Nominatif
                  </span>
                </button>
              </div>
              {/* Action 2 : Rectification d'État Civil */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline flex flex-col justify-between space-y-space-md"}>
                <div className={"space-y-space-xs"}>
                  <div className={"flex items-center justify-between"}>
                    <Icone nom="edit_document" className="text-secondary text-[1.75rem]" />
                    <span className={"bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded font-label-sm text-label-sm"}>
                      Art. 30 Loi 2013
                    </span>
                  </div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Rectification d'État Civil & Grade
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    
              Signalez une divergence entre votre Registre National des Personnes Physiques (RNPP) et vos mentions de solde ou diplômes enregistrés auprès de votre direction RH.
            
                  </p>
                </div>
                <button className={"w-full bg-surface-container hover:bg-surface-container-high text-on-surface py-space-xs px-space-md rounded font-label-md text-label-md flex items-center justify-center gap-2 transition-colors"} type="button" data-soon>
                  <Icone nom="edit_calendar" className="text-[1.125rem]" />
                  <span>
                    Signaler une Anomalie de Registre
                  </span>
                </button>
              </div>
              {/* Action 3 : Limitation & Opposition */}
              <div className={"bg-surface-container-lowest p-space-lg rounded-xl border border-hairline flex flex-col justify-between space-y-space-md"}>
                <div className={"space-y-space-xs"}>
                  <div className={"flex items-center justify-between"}>
                    <Icone nom="block" className="text-on-surface-variant text-[1.75rem]" />
                    <span className={"bg-surface-container-low text-on-surface-variant px-2 py-0.5 rounded font-label-sm text-label-sm"}>
                      Art. 32 Loi 2013
                    </span>
                  </div>
                  <h3 className={"font-headline-sm text-headline-sm text-on-surface"}>
                    Opposition & Verrouillage Régalien
                  </h3>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant"}>
                    
              Demandez la mise en réserve de visibilité de vos coordonnées personnelles au sein de l'annuaire ministériel public pour raisons de sécurité ou de statut spécial.
            
                  </p>
                </div>
                <button className={"w-full bg-surface-container hover:bg-surface-container-high text-on-surface py-space-xs px-space-md rounded font-label-md text-label-md flex items-center justify-center gap-2 transition-colors"} type="button" data-soon>
                  <Icone nom="lock" className="text-[1.125rem]" />
                  <span>
                    Formuler une Requête Réservée
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>
        {/* Répertoire des Établissements & Sous-Traitants Agréés */}
        <section className={"w-full bg-surface py-space-xl"}>
          <div className={"mx-auto px-margin-desktop space-y-space-lg"}>
            <div className={"space-y-space-xs"}>
              <span className={"font-label-sm text-label-sm text-primary uppercase font-semibold tracking-wider"}>
                Cartographie des Tiers
              </span>
              <h2 className={"font-headline-lg text-headline-lg text-on-surface"}>
                Sous-traitants & Sociétés Publiques du Portefeuille Agréées
              </h2>
              <p className={"font-body-md text-body-md text-on-surface-variant max-w-3xl"}>
                
          Entités et tiers mentionnés dans les échanges de la plateforme.
        
              </p>
            </div>
            <div className={"overflow-x-auto bg-surface-container-lowest rounded-xl border border-hairline"}>
              <table className={"w-full text-left"}>
                <thead className={"bg-surface-container-low font-label-md text-label-md text-on-surface-variant"}>
                  <tr>
                    <th className={"py-space-sm px-space-md"}>
                      Entité / Opérateur
                    </th>
                    <th className={"py-space-sm px-space-md"}>
                      Typologie d'Organisme
                    </th>
                    <th className={"py-space-sm px-space-md"} data-min="">
                      Nature des Traitements
                    </th>
                    <th className={"py-space-sm px-space-md"}>
                      Localisation Infrastructure
                    </th>
                    <th className={"py-space-sm px-space-md"}>
                      Statut Convention ARTCI
                    </th>
                  </tr>
                </thead>
                <tbody className={"divide-none font-body-sm text-body-sm text-on-surface"}>
                  <tr className={"hover:bg-surface-container-low/50 transition-colors"}>
                    <td className={"py-space-sm px-space-md font-semibold flex items-center gap-2"}>
                      <span className={"w-2.5 h-2.5 rounded-full bg-primary"}></span>
                      
                BNI (Banque Nationale d'Investissement)
              
                    </td>
                    <td className={"py-space-sm px-space-md text-on-surface-variant"}>
                      Société d'État Bancaire
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Virements des émoluments et régimes de prévoyance
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Abidjan-Plateau (Côte d'Ivoire)
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      <span className={"inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded font-label-sm text-label-sm font-semibold"}>
                        <Icone nom="check" className="text-[0.875rem]" />
                         Conforme Certifié
                
                      </span>
                    </td>
                  </tr>
                  <tr className={"hover:bg-surface-container-low/50 transition-colors"}>
                    <td className={"py-space-sm px-space-md font-semibold flex items-center gap-2"}>
                      <span className={"w-2.5 h-2.5 rounded-full bg-primary"}></span>
                      
                PETROCI Holding
              
                    </td>
                    <td className={"py-space-sm px-space-md text-on-surface-variant"}>
                      Société d'État Énergétique
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Supervision des effectifs stratégiques et mobilités
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Abidjan-Plateau (Côte d'Ivoire)
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      <span className={"inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded font-label-sm text-label-sm font-semibold"}>
                        <Icone nom="check" className="text-[0.875rem]" />
                         Conforme Certifié
                
                      </span>
                    </td>
                  </tr>
                  <tr className={"hover:bg-surface-container-low/50 transition-colors"}>
                    <td className={"py-space-sm px-space-md font-semibold flex items-center gap-2"}>
                      <span className={"w-2.5 h-2.5 rounded-full bg-primary"}></span>
                      
                SOGEPIE
              
                    </td>
                    <td className={"py-space-sm px-space-md text-on-surface-variant"}>
                      Société de Gestion du Patrimoine Immobilier
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Affectations des logements d'astreinte ministériels
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Abidjan-Cocody (Côte d'Ivoire)
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      <span className={"inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded font-label-sm text-label-sm font-semibold"}>
                        <Icone nom="check" className="text-[0.875rem]" />
                         Conforme Certifié
                
                      </span>
                    </td>
                  </tr>
                  <tr className={"hover:bg-surface-container-low/50 transition-colors"}>
                    <td className={"py-space-sm px-space-md font-semibold flex items-center gap-2"}>
                      <span className={"w-2.5 h-2.5 rounded-full bg-secondary"}></span>
                      
                SMMG (Mines de Côte d'Ivoire)
              
                    </td>
                    <td className={"py-space-sm px-space-md text-on-surface-variant"}>
                      Société d'Économie Mixte
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Gestion des experts miniers détachés d'État
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      Yamoussoukro / Abidjan
                    </td>
                    <td className={"py-space-sm px-space-md"}>
                      <span className={"inline-flex items-center gap-1 px-2 py-0.5 bg-secondary-container/20 text-secondary rounded font-label-sm text-label-sm font-semibold"}>
                        <Icone nom="schedule" className="text-[0.875rem]" />
                         Réaudit Trimestriel
                
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        {/* Bannière DPO & Contact Réclamations */}
        <section className={"w-full bg-surface-container py-space-xl"}>
          <div className={"mx-auto px-margin-desktop"}>
            <div className={"bg-surface-container-lowest p-space-lg rounded-xl shadow-md flex flex-col lg:flex-row items-center justify-between gap-space-lg"}>
              <div className={"space-y-space-xs max-w-3xl"}>
                <div className={"flex items-center gap-2 text-primary font-semibold text-label-md"}>
                  <Icone nom="support_agent" className="text-[1.25rem]" />
                  <span>
                    Bureau du Délégué à la Protection des Données (DPO / CIL)
                  </span>
                </div>
                <h3 className={"font-headline-md text-headline-md text-on-surface"}>
                  Une interrogation sur la gestion de vos droits civils ?
                </h3>
                <p className={"font-body-md text-body-md text-on-surface-variant"}>
                  
            Le Délégué Ministériel à la Protection des Données est joignable pour tout recours préalable, demande d'arbitrage statutaire ou signalement de manquement.
          
                </p>
                <div className={"flex flex-wrap items-center gap-space-md pt-2 text-on-surface font-label-md text-label-md"}>
                  <span className={"flex items-center gap-1"}>
                    <Icone nom="mail" className="text-primary text-[1rem]" />
                    
              dp-rgpd@portefeuille.gouv.ci
            
                  </span>
                  <span className={"flex items-center gap-1"}>
                    <Icone nom="call" className="text-primary text-[1rem]" />
                    
              +225 20 21 00 89 (Ligne Directe CIL)
            
                  </span>
                  <span className={"flex items-center gap-1"}>
                    <Icone nom="pin_drop" className="text-primary text-[1rem]" />
                    
              Immeuble SCIAM, 14e étage, Abidjan-Plateau
            
                  </span>
                </div>
              </div>
              <div className={"flex flex-col sm:flex-row items-center gap-space-sm w-full lg:w-auto"}>
                <a className={"w-full sm:w-auto text-center bg-primary hover:bg-primary-container text-on-primary font-label-lg text-label-lg px-space-lg py-space-xs rounded shadow transition-colors"} href={"#"} data-soon>
                  
            Saisir le DPO en ligne
          
                </a>
                <a className={"w-full sm:w-auto text-center bg-surface-container hover:bg-surface-container-high text-on-surface font-label-lg text-label-lg px-space-lg py-space-xs rounded transition-colors"} href={"#"} data-soon>
                  
            Portail Officiel ARTCI
          
                </a>
              </div>
            </div>
          </div>
        </section>
        {/* Notification Toast Container */}
        <div className={"fixed bottom-6 right-6 z-50 transform translate-y-20 opacity-0 transition-all duration-300 pointer-events-none"} id={"statusToast"}>
          <div className={"bg-primary text-on-primary px-space-md py-space-sm rounded-xl shadow-xl flex items-center gap-space-sm"}>
            <Icone nom="check_circle" className="text-[1.25rem]" id="toastIcon" />
            <span className={"font-label-md text-label-md"} id={"toastMessage"}>
              Action enregistrée avec succès.
            </span>
          </div>
        </div>
      </div>
    </main>
    <footer className={"w-full bg-surface-container-low mt-space-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"}>
      <div className={"mx-auto px-margin-desktop py-space-xl"}>
        <div className={"grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-lg"}>
          <div className={"space-y-space-sm"}>
            <div className={"flex items-center gap-space-sm"}>
              <Icone nom="account_balance" className="text-primary text-[1.5rem]" />
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
