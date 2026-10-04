import { NavLink } from "react-router-dom";

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
  return (
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
  );
}
