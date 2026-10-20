import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, api, mediaUrl } from "../api/client";
import { useFeedback } from "../ui/Feedback";
import { Icone } from "../ui/Icone";
import { BOUTON_DANGER, BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../ui/Modale";
import { ActionsImport } from "./ImportAgents";

type Reglages = {
  logo_url: string;
  peut_modifier: boolean;
  referentiel: { emplois_fonction_publique: number; emplois_ministere: number; grades: number };
};

const CARTE = "motion-rise rounded-xl border border-hairline bg-surface-container-lowest p-6";

/** Logo de la structure : il remplace les armoiries dans l'application et sur les documents officiels. */
export function CarteLogo({ reglages }: { reglages: Reglages | undefined }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const entree = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const apercuRef = useRef("");
  useEffect(() => { apercuRef.current = apercu; }, [apercu]);
  useEffect(() => () => { if (apercuRef.current.startsWith("blob:")) URL.revokeObjectURL(apercuRef.current); }, []);

  const actuel = mediaUrl(reglages?.logo_url);
  const modifiable = Boolean(reglages?.peut_modifier);

  function choisir(choisi: File | null) {
    setErreur("");
    if (!choisi) return;
    if (!/\.(png|jpe?g|webp)$/i.test(choisi.name)) { setFichier(null); setApercu(""); setErreur("Choisissez une image PNG, JPG ou WEBP."); return; }
    if (choisi.size > 2 * 1024 * 1024) { setFichier(null); setApercu(""); setErreur("Le logo dépasse 2 Mo."); return; }
    setFichier(choisi);
    setApercu((precedent) => { if (precedent.startsWith("blob:")) URL.revokeObjectURL(precedent); return URL.createObjectURL(choisi); });
  }

  async function terminer() {
    await client.invalidateQueries({ queryKey: ["parametres"] });
    await client.invalidateQueries({ queryKey: ["logo"] });
    setFichier(null);
    setApercu("");
    if (entree.current) entree.current.value = "";
  }

  async function enregistrer() {
    if (!fichier) return;
    setEnCours(true);
    setErreur("");
    const corps = new FormData();
    corps.append("fichier", fichier);
    try {
      await feedback.run("Enregistrement du logo…", () => api<Reglages>("/api/v1/parametres/logo/", { method: "POST", body: corps }), { success: { title: "Logo enregistré", message: "Il remplace les armoiries dans l'application et sur les documents." } });
      await terminer();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Le logo n'a pas pu être enregistré.");
    } finally {
      setEnCours(false);
    }
  }

  async function retirer() {
    setEnCours(true);
    setErreur("");
    try {
      await feedback.run("Retrait du logo…", () => api<Reglages>("/api/v1/parametres/logo/retirer/", { method: "DELETE" }), { success: { title: "Logo retiré", message: "Les armoiries par défaut sont rétablies." } });
      await terminer();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Le logo n'a pas pu être retiré.");
    } finally {
      setEnCours(false);
    }
  }

  const visible = apercu || actuel || `${import.meta.env.BASE_URL}logo.png`;
  return (
    <section className={CARTE} style={{ "--delay": "120ms" } as CSSProperties} aria-labelledby="titre-logo">
      <h2 id="titre-logo" className="font-headline-sm text-headline-sm text-on-surface">Logo de la structure</h2>
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="h-32 w-32 shrink-0 rounded-xl border border-hairline bg-surface-container flex items-center justify-center p-3">
          <img src={visible} alt="Logo de la structure" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="space-y-3">
          <p className="font-body-sm text-body-sm text-on-surface-variant">{apercu ? "Aperçu : le logo n'est pas encore enregistré." : actuel ? "Logo de la structure en vigueur." : "Armoiries par défaut."}</p>
          {modifiable ? (
            <div className="flex flex-wrap items-center gap-2">
              <input ref={entree} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" aria-label="Choisir un logo" onChange={(e) => choisir(e.target.files?.[0] ?? null)} />
              <button type="button" className={BOUTON_SECONDAIRE} onClick={() => entree.current?.click()}><Icone nom="image" className="text-lg" />Choisir un logo</button>
              <button type="button" className={BOUTON_PRIMAIRE} disabled={!fichier || enCours} onClick={() => void enregistrer()}><Icone nom="save" className="text-lg" />Enregistrer le logo</button>
              {actuel ? <button type="button" className={BOUTON_DANGER} disabled={enCours} onClick={() => void retirer()}><Icone nom="restart_alt" className="text-lg" />Rétablir les armoiries</button> : null}
            </div>
          ) : <p className="font-body-sm text-body-sm text-on-surface-variant">Vous n'avez pas l'habilitation pour changer le logo.</p>}
          {erreur ? <p role="alert" className="font-body-sm text-body-sm text-error">{erreur}</p> : null}
        </div>
      </div>
    </section>
  );
}

/** Les emplois reconnus par la Fonction publique : le référentiel de base des dossiers, des besoins et de la dotation. */
export function CarteEmplois({ reglages }: { reglages: Reglages | undefined }) {
  const ref = reglages?.referentiel;
  return (
    <section className={CARTE} style={{ "--delay": "200ms" } as CSSProperties} aria-labelledby="titre-emplois">
      <h2 id="titre-emplois" className="font-headline-sm text-headline-sm text-on-surface">Emplois reconnus par la Fonction publique</h2>
      <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 font-body-sm text-body-sm">
        <div className="rounded-lg bg-surface-container-low p-4"><dt className="text-on-surface-variant">Emplois reconnus par la Fonction publique</dt><dd className="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">{ref ? ref.emplois_fonction_publique.toLocaleString("fr-FR") : "—"}</dd></div>
        <div className="rounded-lg bg-surface-container-low p-4"><dt className="text-on-surface-variant">Emplois ajoutés par le ministère</dt><dd className="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">{ref ? ref.emplois_ministere.toLocaleString("fr-FR") : "—"}</dd></div>
        <div className="rounded-lg bg-surface-container-low p-4"><dt className="text-on-surface-variant">Grades</dt><dd className="mt-1 font-headline-sm text-headline-sm font-bold text-on-surface">{ref ? ref.grades.toLocaleString("fr-FR") : "—"}</dd></div>
      </dl>
      {reglages?.peut_modifier ? (
        <div className="mt-5">
          <ActionsImport
            modeleUrl="/api/v1/parametres/emplois/modele/"
            modeleNom="modele-emplois-fonction-publique.xlsx"
            importUrl="/api/v1/parametres/emplois/import/"
            titre="Charger les emplois reconnus"
            sousTitre="Une ligne crée un emploi, ou met à jour un emploi déjà nommé."
            aide="Le modèle a deux feuilles : Grades et Emplois. La famille se saisit par son code ou son libellé, le grade par son code (A4…). Les emplois chargés sont marqués « reconnus par la Fonction publique »."
            toastTitre="Emplois chargés"
            invalidations={[["parametres"], ["nomenclature"], ["structures"]]}
          />
        </div>
      ) : <p className="mt-5 font-body-sm text-body-sm text-on-surface-variant">Vous n'avez pas l'habilitation pour charger le référentiel.</p>}
    </section>
  );
}
