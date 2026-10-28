import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icone } from "./Icone";
import { correspond } from "./recherche";

/** Au-delà de ce nombre de choix, la liste se filtre en tapant ; en dessous, la liste native suffit. */
const SEUIL_RECHERCHE = 7;

type Choix = { valeur: string; libelle: string; groupe: string; desactive: boolean };

function texteDe(noeud: ReactNode): string {
  if (typeof noeud === "string" || typeof noeud === "number") return String(noeud);
  if (Array.isArray(noeud)) return noeud.map(texteDe).join("");
  if (isValidElement(noeud)) return texteDe((noeud.props as { children?: ReactNode }).children);
  return "";
}

/** Lit les <option> et <optgroup> enfants, comme le ferait un <select> natif. */
function lireChoix(enfants: ReactNode, groupe = "", sortie: Choix[] = []): Choix[] {
  Children.forEach(enfants, (enfant) => {
    if (!isValidElement(enfant)) return;
    const element = enfant as ReactElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>;
    if (element.type === Fragment) {
      lireChoix(element.props.children, groupe, sortie);
    } else if (element.type === "optgroup") {
      lireChoix(element.props.children, element.props.label ?? "", sortie);
    } else if (element.type === "option") {
      const libelle = texteDe(element.props.children);
      sortie.push({ valeur: String(element.props.value ?? libelle), libelle, groupe, desactive: Boolean(element.props.disabled) });
    }
  });
  return sortie;
}

/**
 * Remplace <select> : même écriture (value, onChange, <option>, <optgroup>), mais une longue liste se filtre
 * au fil de la frappe. Une liste courte reste un <select> natif.
 */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, multiple, value } = props;
  const choix = useMemo(() => lireChoix(children), [children]);
  if (multiple || value === undefined || choix.length <= SEUIL_RECHERCHE) return <select {...props} />;
  return <ListeRecherche {...props} choix={choix} />;
}

function ListeRecherche({
  children: _enfants,
  choix,
  value,
  onChange,
  className = "",
  required,
  disabled,
  id,
  name,
  ...reste
}: SelectHTMLAttributes<HTMLSelectElement> & { choix: Choix[] }) {
  const identifiant = useId();
  const racine = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const [place, setPlace] = useState<{ gauche: number; largeur: number; haut?: number; bas?: number; hauteurMax: number } | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [actif, setActif] = useState(0);
  const courant = String(value ?? "");
  const selection = choix.find((item) => item.valeur === courant);
  // Le choix vide (« Choisir… ») sert d'indication, il ne s'affiche pas comme une valeur.
  const vide = choix.find((item) => item.valeur === "");
  const affichage = courant === "" ? "" : (selection?.libelle ?? courant);

  const filtres = useMemo(() => {
    return choix.filter((item) => item.valeur !== "" && correspond(`${item.libelle} ${item.groupe}`, saisie));
  }, [choix, saisie]);

  useEffect(() => setActif(0), [saisie, ouvert]);
  useLayoutEffect(() => {
    if (!ouvert) return;
    function placer() {
      const champ = racine.current?.getBoundingClientRect();
      if (!champ) return;
      const dessous = window.innerHeight - champ.bottom - 12;
      const dessus = champ.top - 12;
      const enHaut = dessous < 200 && dessus > dessous;
      setPlace({
        gauche: champ.left,
        largeur: champ.width,
        hauteurMax: Math.max(120, Math.min(280, enHaut ? dessus : dessous)),
        ...(enHaut ? { bas: window.innerHeight - champ.top + 4 } : { haut: champ.bottom + 4 }),
      });
    }
    placer();
    window.addEventListener("scroll", placer, true);
    window.addEventListener("resize", placer);
    return () => {
      window.removeEventListener("scroll", placer, true);
      window.removeEventListener("resize", placer);
    };
  }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return;
    function dehors(event: MouseEvent) {
      const cible = event.target as Node;
      if (!racine.current?.contains(cible) && !liste.current?.contains(cible)) fermer();
    }
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);
  // La flèche du clavier garde le choix actif visible.
  useEffect(() => {
    if (ouvert) document.getElementById(`${identifiant}-o${actif}`)?.scrollIntoView({ block: "nearest" });
  }, [actif, ouvert, identifiant]);

  function fermer() {
    setOuvert(false);
    setSaisie("");
  }

  function choisir(item: Choix) {
    if (item.desactive) return;
    onChange?.({ target: { value: item.valeur, name }, currentTarget: { value: item.valeur, name } } as unknown as ChangeEvent<HTMLSelectElement>);
    fermer();
  }

  function touche(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOuvert(true);
      setActif((index) => Math.min(index + 1, filtres.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActif((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && ouvert) {
      event.preventDefault();
      if (filtres[actif]) choisir(filtres[actif]);
    } else if (event.key === "Escape" && ouvert) {
      event.stopPropagation();
      fermer();
    }
  }

  // Les titres de groupe ne s'affichent qu'une fois, au premier choix du groupe.
  let dernierGroupe = "";
  return (
    <div ref={racine} className="relative">
      <input
        {...(reste as object)}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={`${identifiant}-liste`}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        disabled={disabled}
        value={ouvert ? saisie : affichage}
        placeholder={ouvert ? "Tapez pour filtrer…" : (vide?.libelle ?? "")}
        className={`${className} pr-9`}
        onFocus={() => setOuvert(true)}
        onClick={() => setOuvert(true)}
        onChange={(event) => {
          setOuvert(true);
          setSaisie(event.target.value);
        }}
        onKeyDown={touche}
      />
      <Icone nom="expand_more" className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`} />
      {ouvert && place
        ? createPortal(
        <ul
          ref={liste}
          id={`${identifiant}-liste`}
          role="listbox"
          style={{ position: "fixed", left: place.gauche, width: place.largeur, top: place.haut, bottom: place.bas, maxHeight: place.hauteurMax }}
          className="z-[200] overflow-y-auto rounded-lg border border-hairline bg-surface-container-lowest py-1 shadow-xl"
        >
          {filtres.length === 0 ? <li className="px-3 py-2 font-body-sm text-body-sm text-on-surface-variant">Aucun résultat pour « {saisie} ».</li> : null}
          {filtres.map((item, index) => {
            const titre = item.groupe && item.groupe !== dernierGroupe ? item.groupe : "";
            dernierGroupe = item.groupe;
            return (
              <Fragment key={`${item.groupe}|${item.valeur}`}>
                {titre ? <li role="presentation" className="px-3 pb-1 pt-2 font-label-sm text-label-sm font-bold uppercase tracking-wide text-primary">{titre}</li> : null}
                <li
                  id={`${identifiant}-o${index}`}
                  role="option"
                  aria-selected={item.valeur === courant}
                  aria-disabled={item.desactive || undefined}
                  // mousedown : le choix doit passer avant la perte de focus du champ
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choisir(item);
                  }}
                  onMouseEnter={() => setActif(index)}
                  className={`cursor-pointer px-3 py-2 font-body-sm text-body-sm ${item.desactive ? "cursor-not-allowed opacity-50" : ""} ${index === actif ? "bg-primary-fixed text-on-surface" : "text-on-surface"} ${item.valeur === courant ? "font-semibold" : ""}`}
                >
                  {item.libelle}
                </li>
              </Fragment>
            );
          })}
        </ul>,
        document.body,
      )
        : null}
    </div>
  );
}
