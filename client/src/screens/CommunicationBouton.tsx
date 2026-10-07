import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useIntervalle } from "../ui/TempsReel";
import { Icone } from "../ui/Icone";

type Apercu = { id: number; reference: string; intitule: string; nature_libelle: string; etape_visa: string };
type Compteur = { decompte: number; peut_viser: boolean; visas: Apercu[]; non_lues: Apercu[] };

export const CLE_COMMUNICATION = ["communication-compteur"];

/** Icône de la barre du haut : visas du DRH et publications non lues. */
export function CommunicationBouton() {
  const intervalle = useIntervalle(30_000);
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const requete = useQuery({
    queryKey: CLE_COMMUNICATION,
    queryFn: () => api<Compteur>("/api/v1/communication/compteur/"),
    refetchInterval: intervalle,
  });
  const decompte = requete.data?.decompte ?? 0;
  const precedent = useRef<number | null>(null);
  const [rebond, setRebond] = useState(0);

  useEffect(() => {
    if (precedent.current !== null && decompte > precedent.current) setRebond((n) => n + 1);
    if (requete.data) precedent.current = decompte;
  }, [decompte, requete.data]);

  useEffect(() => {
    if (!ouvert) return;
    function auClic(event: MouseEvent) {
      if (!conteneur.current?.contains(event.target as Node)) setOuvert(false);
    }
    function auClavier(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
      }
    }
    document.addEventListener("mousedown", auClic);
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("mousedown", auClic);
      document.removeEventListener("keydown", auClavier);
    };
  }, [ouvert]);

  function ouvrirRegistre() {
    setOuvert(false);
    navigate("/app/communication");
  }

  const visas = requete.data?.visas ?? [];
  const nonLues = requete.data?.non_lues ?? [];

  return (
    <div ref={conteneur} className="relative">
      <button
        ref={bouton}
        type="button"
        onClick={() => setOuvert((valeur) => !valeur)}
        aria-expanded={ouvert}
        aria-haspopup="dialog"
        aria-controls="apercu-communication"
        aria-label={decompte ? `Communication, ${decompte} à traiter` : "Communication, rien à traiter"}
        className={`relative p-2 rounded hover:bg-surface-container-high ${ouvert ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
      >
        <Icone nom="campaign" className="text-xl" />
        {decompte ? (
          <span
            key={rebond}
            className={`absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-on-primary font-label-sm text-label-sm font-bold flex items-center justify-center ring-2 ring-surface-container-lowest ${rebond ? "motion-bump" : ""}`}
            aria-hidden="true"
          >
            {decompte > 9 ? "9+" : decompte}
          </span>
        ) : null}
      </button>
      {ouvert ? (
        <div
          id="apercu-communication"
          role="dialog"
          aria-labelledby="titre-apercu-communication"
          className="motion-overlay-card fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-[calc(var(--haut-entete)+0.5rem)] sm:top-auto sm:mt-2 sm:w-[22rem] z-50 rounded-lg border border-hairline bg-surface-container-lowest shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-hairline">
            <h2 id="titre-apercu-communication" className="font-headline-sm text-headline-sm text-on-surface">Communication</h2>
            <span className="font-label-sm text-label-sm text-on-surface-variant">{decompte ? `${decompte} à traiter` : "Rien à traiter"}</span>
          </div>
          <div className="max-h-80 overflow-y-auto overscroll-contain">
            {requete.isPending ? <p className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Chargement…</p> : null}
            {requete.isError ? <p className="px-4 py-6 text-center font-body-sm text-body-sm text-error" role="alert">Le registre est indisponible.</p> : null}
            {visas.length > 0 ? (
              <section>
                <h3 className="px-4 pt-3 pb-1 font-label-sm text-label-sm uppercase tracking-wider text-secondary">Visa du DRH</h3>
                <ul>
                  {visas.map((item) => (
                    <li key={item.id} className="border-b border-hairline">
                      <button type="button" onClick={ouvrirRegistre} className="w-full px-4 py-2.5 text-left hover:bg-surface-container-low">
                        <span className="block font-label-sm text-label-sm text-secondary font-bold">{item.reference}</span>
                        <span className="block font-body-sm text-body-sm text-on-surface line-clamp-2">{item.intitule}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {nonLues.length > 0 ? (
              <section>
                <h3 className="px-4 pt-3 pb-1 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Non lues</h3>
                <ul>
                  {nonLues.map((item) => (
                    <li key={item.id} className="border-b border-hairline last:border-0">
                      <button type="button" onClick={ouvrirRegistre} className="w-full px-4 py-2.5 text-left hover:bg-surface-container-low bg-primary-fixed/15">
                        <span className="block font-label-sm text-label-sm text-primary font-bold">{item.nature_libelle} {item.reference}</span>
                        <span className="block font-body-sm text-body-sm text-on-surface line-clamp-2">{item.intitule}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {requete.data && visas.length === 0 && nonLues.length === 0 ? (
              <p className="px-4 py-6 text-center font-body-sm text-body-sm text-on-surface-variant">Aucune publication en attente.</p>
            ) : null}
          </div>
          <button type="button" onClick={ouvrirRegistre} className="w-full px-4 py-3 border-t border-hairline font-label-md text-label-md text-primary hover:bg-surface-container-low">
            Ouvrir le registre
          </button>
        </div>
      ) : null}
    </div>
  );
}
