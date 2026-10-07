import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Icone } from "../ui/Icone";

const idle =
  "px-space-md py-space-xs text-on-surface-variant hover:text-on-surface transition-colors font-label-md text-label-md";
const current =
  "px-space-md py-space-xs transition-colors bg-primary-container text-on-primary font-label-md text-label-md rounded-lg";

const links = [
  { to: "/", label: "Accueil Institutionnel", end: true },
  { to: "/conditions-generales", label: "Conditions générales", end: false },
  { to: "/confidentialite", label: "Confidentialité", end: false },
  { to: "/protection-des-donnees", label: "Protection des données", end: false },
];

export function PublicHeaderNav() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button
        type="button"
        className="lg:hidden inline-flex items-center justify-center min-h-11 min-w-11 rounded text-on-surface"
        aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={ouvert}
        onClick={() => setOuvert((valeur) => !valeur)}
      >
        <Icone nom={ouvert ? "close" : "menu"} className="text-2xl" />
      </button>
      <nav className="hidden lg:flex items-center gap-space-sm" aria-label="Pages publiques">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => (isActive ? current : idle)}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      {ouvert ? (
        <nav
          className="lg:hidden fixed inset-x-4 top-[calc(var(--haut-entete)+0.5rem)] z-50 rounded-xl border border-hairline bg-surface-container-lowest p-2 shadow-xl"
          aria-label="Pages publiques"
        >
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              onClick={() => setOuvert(false)}
              className={({ isActive }) => `flex min-h-11 items-center rounded-lg px-3 ${isActive ? "bg-primary-container text-on-primary font-semibold" : "text-on-surface hover:bg-surface-container-low"}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </>
  );
}
