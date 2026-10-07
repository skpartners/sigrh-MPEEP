import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api, getToken, setToken } from "../api/client";
import type { SessionUser } from "../api/types";
import { useSlideNavigate } from "../ui/Motion";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";

const SUPPORT_PHONE = (import.meta.env.VITE_SUPPORT_PHONE ?? "").trim();
const CHAMP = "h-11 court:h-10 tres-court:h-9 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest/90 px-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary";

const INACTIVITE_MS = 15_000;

export function LoginScreen() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const slideTo = useSlideNavigate();
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [remember, setRemember] = useState(false);
  const feedback = useFeedback();
  const versIntro = useRef(slideTo);
  versIntro.current = slideTo;

  // La page de connexion ne défile jamais : la carte s'adapte à la hauteur de l'écran.
  useEffect(() => {
    const racine = document.documentElement;
    const avant = racine.style.overflow;
    racine.style.overflow = "hidden";
    return () => {
      racine.style.overflow = avant;
    };
  }, []);

  // Zoom du navigateur, taille de police, message d'erreur : la carte est mesurée telle qu'elle
  // s'affiche et réduite juste assez pour tenir dans la hauteur utile.
  const pageRef = useRef<HTMLElement>(null);
  const carteRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const page = pageRef.current;
    const carte = carteRef.current;
    if (!page || !carte) return;
    const ajuster = () => {
      const style = getComputedStyle(page);
      const utile = page.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const naturelle = carte.offsetHeight;
      const echelle = naturelle > utile && naturelle > 0 ? Math.max(0.4, utile / naturelle) : 1;
      carte.style.setProperty("--echelle-carte", echelle.toFixed(3));
    };
    ajuster();
    const observateur = new ResizeObserver(ajuster);
    observateur.observe(page);
    observateur.observe(carte);
    return () => observateur.disconnect();
  }, []);

  useEffect(() => {
    if (pending) return;
    // Session déjà ouverte : on entre dans l'application, sans le renvoi vers l'accueil.
    if (getToken()) {
      navigate("/app", { replace: true });
      return;
    }
    let delai = 0;
    const armer = () => {
      window.clearTimeout(delai);
      delai = window.setTimeout(() => {
        // Un minuteur encore en mémoire après la connexion ne doit pas quitter l'application.
        if (!window.location.pathname.endsWith("/connexion")) return;
        versIntro.current("/", "back");
      }, INACTIVITE_MS);
    };
    armer();
    const evenements = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    evenements.forEach((nom) => window.addEventListener(nom, armer, { passive: true }));
    return () => {
      window.clearTimeout(delai);
      evenements.forEach((nom) => window.removeEventListener(nom, armer));
    };
  }, [pending, navigate]);

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
            body: JSON.stringify({ matricule, password }),
          }),
        { detail: "Connexion sécurisée au SIGRH en cours." },
      );
      client.clear();
      setToken(result.token, remember);
      navigate("/app");
      return;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Connexion impossible.");
      setErrorKey((key) => key + 1);
    }
    setPending(false);
  }

  return (
    <main ref={pageRef} className="relative flex h-dvh items-center justify-center overflow-hidden bg-[#1a2430] px-4 pt-16 pb-6 court:pt-14 court:pb-3 tres-court:pt-11 tres-court:pb-2 text-on-primary">
      <img
        src={`${import.meta.env.BASE_URL}DGPE%20siege.jpg`}
        alt=""
        className="pointer-events-none fixed inset-0 h-dvh w-full object-cover object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10" />

      <Link
        to="/"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          slideTo("/", "back");
        }}
        className="absolute top-6 court:top-3 left-4 z-20 inline-flex items-center gap-1 rounded-full bg-surface-container-lowest/80 px-3 py-1.5 font-label-lg text-label-lg font-semibold text-primary shadow-sm backdrop-blur-sm hover:bg-surface-container-lowest"
      >
        <Icone nom="arrow_back" className="text-[1.125rem]" />
        Accueil
      </Link>

      <section ref={carteRef} className="login-carte motion-overlay-card relative z-10 w-full max-w-lg rounded-2xl border border-white/40 bg-white/20 px-6 py-8 court:py-5 tres-court:py-4 shadow-[0_20px_60px_color-mix(in_oklab,var(--color-primary)_32%,transparent)] backdrop-blur-2xl sm:px-8">
        <header className="mb-8 court:mb-5 tres-court:mb-3 text-center">
          <img alt="Armoiries de la République de Côte d'Ivoire" className="mx-auto h-16 w-16 court:h-12 court:w-12 tres-court:h-10 tres-court:w-10 object-contain" src={`${import.meta.env.BASE_URL}logo.png`} />
          <p className="mt-4 court:mt-2 tres-court:hidden font-label-lg text-label-lg font-bold tracking-widest text-primary uppercase">
            République de Côte d'Ivoire
          </p>
          <h1 className="mt-2 court:mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">
            Ministère du Portefeuille de l'État et des Entreprises Publiques
          </h1>
          <p className="mt-1 court:hidden font-body-md text-body-md text-on-surface-variant">
            Système intégré de gestion des ressources humaines (SIGRH)
          </p>
        </header>

        <form className="space-y-4 court:space-y-3" id="auth-form" onSubmit={onSubmit}>
          <label className="block" htmlFor="matricule-input">
            <span className="mb-1 block font-label-lg text-label-lg font-semibold text-on-surface-variant">
              Matricule
            </span>
            <input
              className={CHAMP}
              id="matricule-input"
              placeholder="Votre matricule"
              required
              type="text"
              autoComplete="username"
              value={matricule}
              onChange={(event) => setMatricule(event.target.value)}
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="font-label-lg text-label-lg font-semibold text-on-surface-variant" htmlFor="password-input">
                Mot de passe
              </label>
              <a
                className="font-label-lg text-label-lg font-semibold text-secondary hover:underline"
                href="#"
                data-soon="La réinitialisation en ligne arrive bientôt. En attendant, contactez l'astreinte DSI ou votre gestionnaire RH."
              >
                Mot de passe oublié
              </a>
            </div>
            <div className="relative">
              <input
                className={`${CHAMP} pr-10`}
                id="password-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded text-on-surface-variant hover:text-on-surface"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
              >
                <Icone nom={showPassword ? "visibility_off" : "visibility"} className="text-[1.125rem]" />
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1">
            <input className="h-4 w-4 accent-primary" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            <span className="font-body-md text-body-md text-on-surface">
              Maintenir ma session sur ce poste
            </span>
          </label>

          {error ? (
            <p key={errorKey} role="alert" className="motion-shake flex items-center gap-1.5 font-body-sm text-body-sm text-error">
              <Icone nom="error" className="text-[1.125rem]" />
              {error}
            </p>
          ) : null}

          <button
            className="btn-ripple flex h-11 court:h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary font-label-lg text-label-lg font-bold text-on-primary hover:bg-primary-container disabled:opacity-60"
            id="btn-submit"
            type="submit"
            disabled={pending}
            aria-busy={pending}
          >
            <Icone nom={pending ? "progress_activity" : "lock_open"} className={`text-[1.25rem] ${pending ? "motion-spin" : ""}`} />
            Accéder à mon espace SIGRH
            <Icone nom="arrow_forward" className="text-[1.125rem]" />
          </button>
        </form>

        {SUPPORT_PHONE ? (
          <p className="mt-4 court:mt-3 tres-court:mt-2 text-center font-label-lg text-label-lg text-on-surface-variant">
            Astreinte DSI{" "}
            <a className="font-semibold text-primary hover:underline" href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}>
              {SUPPORT_PHONE}
            </a>
          </p>
        ) : null}

        <nav className="mt-6 court:mt-4 tres-court:mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="Informations légales">
          <Link to="/conditions-generales" className="font-label-lg text-label-lg text-primary hover:underline">CGU</Link>
          <Link to="/confidentialite" className="font-label-lg text-label-lg text-primary hover:underline">Confidentialité</Link>
          <Link to="/protection-des-donnees" className="font-label-lg text-label-lg text-primary hover:underline">Protection des données</Link>
        </nav>
      </section>
    </main>
  );
}
