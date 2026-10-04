import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, api, setToken } from "../api/client";
import type { SessionUser } from "../api/types";
import { useSlideNavigate } from "../ui/Motion";
import { useFeedback } from "../ui/Feedback";
import { SoonBadge } from "../ui/SoonBadge";

const SUPPORT_PHONE = (import.meta.env.VITE_SUPPORT_PHONE ?? "").trim();

export function LoginScreen() {
  const navigate = useNavigate();
  const slideTo = useSlideNavigate();
  const organisme = "dgpe";
  const [matricule, setMatricule] = useState("DRH-2018-044");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [remember, setRemember] = useState(false);
  const feedback = useFeedback();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await feedback.run(
        "Vérification des habilitations…",
        () =>
          api<{ token: string; user: SessionUser }>("/api/v1/auth/login/", {
            method: "POST",
            // Mot de passe ignoré pour l'instant : session du compte de démonstration.
            body: JSON.stringify({ matricule, password: "Sigrh-Dev-2026", organisme }),
          }),
        { detail: "Connexion sécurisée au SIGRH en cours." },
      );
      setToken(result.token, remember);
      navigate("/app");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Connexion impossible.");
      setErrorKey((key) => key + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
    <main className="flex min-h-screen w-full flex-col bg-surface-container-lowest">
          <div className="flex w-full flex-1 flex-col md:flex-row">
            {/* Colonne Visuelle Institutionnelle & Sécurité Défense (Gauche) */}
            <div className="relative flex w-full flex-col justify-between overflow-hidden bg-primary p-space-xl text-on-primary md:w-5/12">
              <img
                src="/fond-connexion.jpg"
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full origin-center scale-150 object-cover object-center"
              />
              <div className="pointer-events-none absolute inset-0 bg-primary/50" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/75 via-transparent to-primary/80" />
              {/* Ruban décoratif tricolore / souverain discret */}
              <div className={"absolute top-0 left-0 right-0 z-10 h-1.5 flex"}>
                <div className={"w-1/3 h-full bg-secondary-container"}></div>
                <div className={"w-1/3 h-full bg-surface-container-lowest"}></div>
                <div className={"w-1/3 h-full bg-primary-fixed"}></div>
              </div>
              <div className="relative z-10 flex flex-1 flex-col items-center justify-center space-y-space-lg text-center">
                <div className="flex flex-col items-center gap-3">
                  <img alt="Armoiries de la République de Côte d'Ivoire" className="h-24 w-24 object-contain" src="/logo.png" />
                  <div className="flex flex-col items-center">
                    <span className="font-label-lg text-label-lg font-bold uppercase tracking-widest text-primary-fixed">
                      République de Côte d'Ivoire
                    </span>
                    <span className="font-body-md text-body-md italic text-on-primary-container">
                      Union · Discipline · Travail
                    </span>
                  </div>
                </div>
                <div className="max-w-xl">
                  <p className="mb-space-xs font-label-lg text-label-lg font-semibold uppercase tracking-wider text-secondary-fixed">
                    Portail ministériel
                  </p>
                  <h1 className="font-headline-xl text-headline-xl font-bold leading-tight text-on-primary">
                    Ministère du Portefeuille de l'État et des Entreprises Publiques
                  </h1>
                  <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-on-primary-container">
                    Plateforme unifiée d'ordonnancement statutaire, de suivi de carrière et de gouvernance du personnel des sociétés d'État.
                  </p>
                </div>
              </div>
              {/* Astreinte : affichée seulement si la DSI a fourni le numéro (VITE_SUPPORT_PHONE). */}
              {SUPPORT_PHONE ? (
                <div className={"pt-space-lg relative z-10"}>
                  <div className={"bg-primary-container/40 p-space-sm rounded-lg flex items-center gap-2 text-on-primary"}>
                    <span className={"material-symbols-outlined text-secondary-fixed text-[20px]"} aria-hidden="true">
                      headset_mic
                    </span>
                    <div>
                      <span className={"block font-label-sm text-label-sm text-primary-fixed uppercase"}>
                        Astreinte DSI & DRH
                      </span>
                      <a className={"font-label-md text-label-md font-bold text-on-primary hover:underline"} href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}>
                        {SUPPORT_PHONE}
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}
              <p className="relative z-10 pt-space-lg text-center font-label-sm text-[11px] leading-snug text-on-primary/80">
                Le Plateau, Abidjan, depuis le pont Alassane Ouattara.{" "}
                <a
                  className="underline decoration-on-primary/40 underline-offset-2 hover:decoration-on-primary"
                  href="https://commons.wikimedia.org/wiki/File:Le_Plateau_depuis_le_Pont_ADO_%E2%80%93_Abidjan.jpg"
                  target="_blank"
                  rel="noreferrer"
                >
                  Edison McCullen
                </a>
                ,{" "}
                <a
                  className="underline decoration-on-primary/40 underline-offset-2 hover:decoration-on-primary"
                  href="https://creativecommons.org/licenses/by/4.0/deed.fr"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 4.0
                </a>
                .
              </p>
            </div>
            {/* Colonne Formulaire Régalien (Droite) */}
            <div className="flex w-full flex-1 flex-col justify-between bg-surface-container-lowest p-space-xl md:p-16">
              <div>
                <Link
                  to="/"
                  onClick={(event) => {
                    // Ctrl/Cmd+clic : laisser le navigateur ouvrir un onglet.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    slideTo("/", "back");
                  }}
                  className="mb-space-md inline-flex items-center gap-1 rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 font-label-md text-label-md font-semibold text-primary shadow-sm hover:bg-surface-container"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Accueil
                </Link>
                {/* En-tête de carte */}
                <div className={"mb-space-lg"}>
                  <div className={"flex items-center space-x-2 mb-space-xs"}>
                    <span className={"px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-label-sm text-label-sm uppercase font-semibold"}>
                      SIGRH MPEEP
                    </span>
                    <span className={"px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold"}>
                      Niveau Confidentiel
                    </span>
                  </div>
                  <h2 className={"font-headline-sm text-headline-sm text-on-surface font-bold"}>
                    Connexion Sécurisée SIGRH
                  </h2>
                  <p className={"font-body-sm text-body-sm text-on-surface-variant mt-1"}>
                    
              Accès réservé aux agents statutaires, directeurs généraux et gestionnaires RH habilités.
            
                  </p>
                </div>
                <form className="w-full space-y-space-md" id="auth-form" onSubmit={onSubmit}>
                  <div>
                    <p className="mb-1 font-label-md text-label-md font-semibold text-on-surface-variant">Direction</p>
                    <div className="flex h-10 items-center gap-2 rounded border border-outline-variant/40 bg-surface-container px-3 font-body-md text-body-md text-on-surface">
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant/70" aria-hidden="true">account_balance</span>
                      Direction des Ressources Humaines
                    </div>
                  </div>
                  {/* Matricule / Code Agent */}
                  <div>
                    <div className={"flex items-center justify-between mb-1"}>
                      <label className={"block font-label-md text-label-md text-on-surface font-semibold"} htmlFor={"matricule-input"}>
                        
                  Matricule Civil ou Identifiant DRH 
                        <span className={"text-error"}>
                          *
                        </span>
                      </label>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        Norme FOP / Statut Public
                      </span>
                    </div>
                    <div className={"relative"}>
                      <span className={"material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]"}>
                        badge
                      </span>
                      <input className={"w-full h-10 pl-10 pr-3 bg-surface-container-lowest text-on-surface placeholder:text-outline-variant rounded font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"} id={"matricule-input"} placeholder={"Ex: 349 812-K ou DRH-2018-044"} required type={"text"} autoComplete="username" value={matricule} onChange={(event) => setMatricule(event.target.value)} />
                    </div>
                  </div>
                  {/* Mot de Passe Sécurisé */}
                  <div>
                    <div className={"flex items-center justify-between mb-1"}>
                      <label className={"block font-label-md text-label-md text-on-surface font-semibold"} htmlFor={"password-input"}>
                        
                  Mot de passe régalien 
                        <span className={"text-error"}>
                          *
                        </span>
                      </label>
                      <a className={"font-label-sm text-label-sm text-secondary hover:underline font-semibold"} href={"#"} data-soon="La réinitialisation en ligne arrive bientôt. En attendant, contactez l'astreinte DSI ou votre gestionnaire RH.">
                        Oublié ou compte verrouillé ?
                      </a>
                    </div>
                    <div className={"relative"}>
                      <span className={"material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]"}>
                        lock
                      </span>
                      <input className={"w-full h-10 pl-10 pr-10 bg-surface-container-lowest text-on-surface rounded font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"} id={"password-input"} placeholder={"••••••••••••"} type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                      <button className={"absolute right-3 top-1/2 -translate-y-1/2 rounded text-on-surface-variant hover:text-on-surface"} type={"button"} onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword}>
                        <span className={"material-symbols-outlined text-[18px]"} id={"pwd-icon"}>
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                    {/* Contrôle PSSI-État : la jauge reste vide tant que l'analyse n'est pas branchée. */}
                    <div className={"mt-2 flex items-center gap-2"}>
                      <div className={"flex-1 h-1 bg-surface-container rounded-full"} aria-hidden="true"></div>
                      <span className={"font-label-sm text-label-sm text-on-surface-variant"}>
                        Robustesse du mot de passe
                      </span>
                      <SoonBadge />
                    </div>
                  </div>
                  {/* Double authentification : annoncée, pas encore active. */}
                  <div className={"p-space-sm bg-surface-container-low rounded-lg flex items-start gap-2"}>
                    <span className={"material-symbols-outlined text-on-surface-variant text-[20px] shrink-0 mt-0.5"} aria-hidden="true">
                      phonelink_lock
                    </span>
                    <div className={"font-body-sm text-body-sm text-on-surface-variant"}>
                      <p className={"flex flex-wrap items-center gap-2"}>
                        <strong className={"font-semibold text-on-surface"}>
                          Double authentification (2FA)
                        </strong>
                        <SoonBadge />
                      </p>
                      <p className={"mt-1"}>
                        Un code à usage unique sera envoyé par SMS au numéro enregistré auprès de la DRH. Cette vérification n'est pas encore active.
                      </p>
                    </div>
                  </div>
                  {/* Options & Mémorisation */}
                  <div className={"flex items-center justify-between"}>
                    <label className={"flex items-center space-x-2 cursor-pointer"}>
                      <input className={"w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"} type={"checkbox"} checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                      <span className={"font-body-sm text-body-sm text-on-surface"}>
                        Mémoriser sur ce terminal de travail agréé
                      </span>
                    </label>
                  </div>
                  {/* Bouton CTA Principal Républicain */}
                  {error ? (
                    <p key={errorKey} role="alert" className="motion-shake flex items-center gap-1.5 font-body-sm text-body-sm text-error">
                      <span className="material-symbols-outlined text-[18px]">error</span>
                      {error}
                    </p>
                  ) : null}
                  <button className={"w-full h-11 bg-primary-container hover:bg-primary text-on-primary rounded font-label-lg text-label-lg font-bold flex items-center justify-center space-x-2 shadow-md transition transform active:scale-[0.99] cursor-pointer disabled:opacity-60"} id={"btn-submit"} type={"submit"} disabled={pending} aria-busy={pending}>
                    <span className={`material-symbols-outlined text-[20px] ${pending ? "motion-spin" : ""}`}>
                      {pending ? "progress_activity" : "lock_open"}
                    </span>
                    <span>
                      Se connecter à l'espace SIGRH
                    </span>
                    <span className={"material-symbols-outlined text-[18px]"}>
                      arrow_forward
                    </span>
                  </button>
                </form>
              </div>
            </div>
          </div>
          {/* Mentions Réglementaires & Sécurité Républicaine en Pied de Page */}
          <div className={"mt-auto w-full text-center"}>
            <div className={"flex w-full items-center gap-2 border-t border-outline-variant/30 px-space-xl py-space-sm text-on-surface-variant"}>
              <span className={"material-symbols-outlined shrink-0 text-error text-[16px]"}>
                gavel
              </span>
              <p className={"w-full text-center font-body-sm text-body-sm"}>
                <strong className={"font-semibold text-on-surface"}>
                  Avertissement pénal :
                </strong>
                {" "}
                L'accès non autorisé à ce système d'information de l'État constitue une infraction punie par la loi ivoirienne n° 2013-451 relative à la lutte contre la cybercriminalité.
              </p>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-2 px-space-xl pt-space-sm" aria-label="Informations légales">
              <Link to="/conditions-generales" className="rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container">
                CGU
              </Link>
              <Link to="/confidentialite" className="rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container">
                Confidentialité
              </Link>
              <Link to="/protection-des-donnees" className="rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-1.5 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container">
                Protection des données
              </Link>
            </nav>
            <div className={"pt-space-xs font-label-sm text-label-sm text-on-surface-variant"}>
              
        © République de Côte d'Ivoire · Ministère du Portefeuille de l'État et des Entreprises Publiques · Tous droits réservés
      
            </div>
          </div>
    </main>
    </>
  );
}
