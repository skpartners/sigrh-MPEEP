import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, api, mediaUrl } from "../api/client";
import {
  CLE_COULEURS,
  COULEURS_DEFAUT,
  appliquerCouleurs,
  contraste,
  couleursCourantes,
  couleurValide,
  paletteGraphique,
  useCouleursEnregistrees,
  type Couleurs,
} from "../ui/Couleurs";
import { useFeedback } from "../ui/Feedback";
import { BOUTON_DANGER, BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "../ui/Modale";
import { AppChrome } from "./AppChrome";
import { Icone } from "../ui/Icone";

type Parametres = {
  photo_url: string;
  peut_modifier: boolean;
  civilite: string;
  nom: string;
  inactivite_minutes: number;
  delais: {
    visa_acte_jours: number;
    validation_hierarchie_jours: number;
  };
  couleurs: Couleurs;
};

const PAGE = "w-full px-4 sm:px-6 lg:px-8 py-6 mx-auto flex-1 space-y-6";
const CHAMP = "w-full h-10 px-3 rounded border border-outline-variant bg-surface-container-lowest font-body-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary";
const CIVILITES = ["Madame", "Monsieur"];

export function ParametresScreen() {
  const client = useQueryClient();
  const feedback = useFeedback();
  const fichierRef = useRef<HTMLInputElement>(null);
  const page = useQuery({ queryKey: ["parametres"], queryFn: () => api<Parametres>("/api/v1/parametres/") });
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [civilite, setCivilite] = useState("");
  const [nom, setNom] = useState("");
  const [erreurIdentite, setErreurIdentite] = useState("");
  const [inactivite, setInactivite] = useState("15");
  const [delaiVisa, setDelaiVisa] = useState("2");
  const [delaiHierarchie, setDelaiHierarchie] = useState("3");
  const [erreurDelais, setErreurDelais] = useState("");
  const apercuRef = useRef("");

  useEffect(() => {
    apercuRef.current = apercu;
  }, [apercu]);

  useEffect(() => {
    return () => {
      if (apercuRef.current.startsWith("blob:")) URL.revokeObjectURL(apercuRef.current);
    };
  }, []);

  useEffect(() => {
    if (!page.data) return;
    setCivilite(page.data.civilite);
    setNom(page.data.nom);
    setInactivite(String(page.data.inactivite_minutes ?? 15));
    setDelaiVisa(String(page.data.delais?.visa_acte_jours ?? 2));
    setDelaiHierarchie(String(page.data.delais?.validation_hierarchie_jours ?? 3));
  }, [page.data]);

  const data = page.data;
  const actuelle = mediaUrl(data?.photo_url);
  const visible = apercu || actuelle;

  function choisir(choisi: File | null) {
    setErreur("");
    if (!choisi) return;
    const type = choisi.type || (/\.png$/i.test(choisi.name) ? "image/png" : /\.jpe?g$/i.test(choisi.name) ? "image/jpeg" : /\.webp$/i.test(choisi.name) ? "image/webp" : "");
    if (!/^image\/(png|jpeg|webp)$/.test(type)) {
      setFichier(null);
      setApercu("");
      setErreur("Choisissez une image PNG, JPG ou WEBP.");
      return;
    }
    if (choisi.size > 5 * 1024 * 1024) {
      setFichier(null);
      setApercu("");
      setErreur("La photo dépasse 5 Mo.");
      return;
    }
    setFichier(choisi);
    setApercu((precedent) => {
      if (precedent.startsWith("blob:")) URL.revokeObjectURL(precedent);
      return URL.createObjectURL(choisi);
    });
  }

  async function enregistrerDelais() {
    const minutes = Number(inactivite);
    const visa = Number(delaiVisa);
    const hierarchie = Number(delaiHierarchie);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      setErreurDelais("Indiquez une durée d'inactivité entre 1 et 240 minutes.");
      return;
    }
    if (!Number.isInteger(visa) || visa < 1 || visa > 90 || !Number.isInteger(hierarchie) || hierarchie < 1 || hierarchie > 90) {
      setErreurDelais("Indiquez une durée de visa ou de validation entre 1 et 90 jours.");
      return;
    }
    setEnCours(true);
    setErreurDelais("");
    try {
      const reponse = await feedback.run(
        "Enregistrement des délais…",
        async () => {
          await api<Parametres>("/api/v1/parametres/inactivite/", {
            method: "POST",
            body: JSON.stringify({ minutes }),
          });
          return api<Parametres>("/api/v1/parametres/delais/", {
            method: "POST",
            body: JSON.stringify({ visa_acte_jours: visa, validation_hierarchie_jours: hierarchie }),
          });
        },
        {
          success: {
            title: "Délais enregistrés",
            message: `Inactivité : ${minutes} min. Visa d'un acte : ${visa} j. Validation hiérarchique : ${hierarchie} j.`,
          },
        },
      );
      client.setQueryData(["parametres"], reponse);
    } catch (cause) {
      setErreurDelais(cause instanceof ApiError ? cause.message : "Les délais n'ont pas pu être enregistrés.");
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrerIdentite() {
    const nomNettoye = nom.trim();
    if (nomNettoye && !civilite) {
      setErreurIdentite("Choisissez la civilité.");
      return;
    }
    setEnCours(true);
    setErreurIdentite("");
    try {
      const reponse = await feedback.run(
        "Enregistrement de l'identité…",
        () =>
          api<Parametres>("/api/v1/parametres/identite/", {
            method: "POST",
            body: JSON.stringify({ civilite, nom: nomNettoye }),
          }),
        { success: { title: "Identité enregistrée", message: "La civilité et le nom sont publiés sur le portail." } },
      );
      client.setQueryData(["parametres"], reponse);
      await client.invalidateQueries({ queryKey: ["accueil"] });
    } catch (cause) {
      setErreurIdentite(cause instanceof ApiError ? cause.message : "L'identité n'a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrer() {
    if (!fichier) return;
    setEnCours(true);
    setErreur("");
    const corps = new FormData();
    corps.append("fichier", fichier);
    try {
      const reponse = await feedback.run(
        "Enregistrement de la photo…",
        () => api<Parametres>("/api/v1/parametres/photo/", { method: "POST", body: corps }),
        { success: { title: "Photo enregistrée", message: "Le portrait de la ministre est publié sur le portail." } },
      );
      client.setQueryData(["parametres"], reponse);
      await client.invalidateQueries({ queryKey: ["accueil"] });
      setFichier(null);
      setApercu("");
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La photo n'a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
    }
  }

  async function retirer() {
    setEnCours(true);
    setErreur("");
    try {
      const reponse = await feedback.run(
        "Retrait de la photo…",
        () => api<Parametres>("/api/v1/parametres/photo/retirer/", { method: "DELETE" }),
        { success: { title: "Photo retirée" } },
      );
      client.setQueryData(["parametres"], reponse);
      await client.invalidateQueries({ queryKey: ["accueil"] });
      setFichier(null);
      setApercu("");
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La photo n'a pas pu être retirée.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <AppChrome>
      <div className={PAGE}>
        <div className="motion-rise bg-surface-container-lowest p-6 rounded-lg border border-hairline space-y-1.5">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Gouvernance · Paramètres</p>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Paramètres du ministère</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
            La ministre — civilité, nom et portrait — s'affiche sur le portail public. Les délais regroupent l'inactivité de session, le visa des actes et la validation par la hiérarchie. Les couleurs habillent tout le SIGRH.
          </p>
        </div>

        {page.isError ? (
          <p className="font-body-md text-body-md text-error" role="alert">
            {page.error instanceof ApiError ? page.error.message : "Les paramètres n'ont pas pu être chargés."}
          </p>
        ) : null}

        <section className="motion-rise rounded-xl border border-hairline bg-surface-container-lowest p-6" style={{ "--delay": "80ms" } as CSSProperties} aria-labelledby="titre-ministre">
          <h2 id="titre-ministre" className="font-headline-sm text-headline-sm text-on-surface">La ministre</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            La civilité, le nom et le portrait s'affichent sur le portail public, à côté des armoiries. Image PNG, JPG ou WEBP, au plus 5 Mo.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row sm:items-start gap-6">
            <div className="h-40 w-40 shrink-0 overflow-hidden rounded-full border border-hairline bg-surface-container">
              {visible ? (
                <img src={visible} alt="Portrait de la ministre" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-on-surface-variant">
                  <Icone nom="person" className="text-5xl" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              {data && !data.peut_modifier ? (
                <p className="font-body-md text-body-md text-on-surface">
                  {data.civilite || data.nom
                    ? [data.civilite, data.nom].filter(Boolean).join(" ")
                    : "Aucune identité n'est encore enregistrée."}
                  {" "}
                  {visible ? "Portrait en vigueur." : "Aucun portrait n'est encore déposé."}
                  {" "}
                  La modification est réservée aux comptes habilités à saisir ces paramètres.
                </p>
              ) : (
                <>
                  <form
                    className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void enregistrerIdentite();
                    }}
                  >
                    <label className="block space-y-1.5">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Civilité</span>
                      <select
                        className={CHAMP}
                        value={civilite}
                        disabled={enCours || !data}
                        onChange={(event) => setCivilite(event.target.value)}
                      >
                        <option value="">Choisir</option>
                        {CIVILITES.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1.5">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
                      <input
                        className={CHAMP}
                        value={nom}
                        maxLength={160}
                        disabled={enCours || !data}
                        autoComplete="name"
                        onChange={(event) => setNom(event.target.value)}
                      />
                    </label>
                    <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours || !data}>
                      Enregistrer l'identité
                    </button>
                    {erreurIdentite ? (
                      <p className="sm:col-span-3 font-body-sm text-body-sm text-error" role="alert">{erreurIdentite}</p>
                    ) : null}
                  </form>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={BOUTON_SECONDAIRE} disabled={enCours || !data} onClick={() => fichierRef.current?.click()}>
                        <Icone nom="upload" className="text-lg" />
                        Choisir une photo
                      </button>
                      <button type="button" className={BOUTON_PRIMAIRE} disabled={enCours || !fichier} onClick={() => void enregistrer()}>
                        Enregistrer la photo
                      </button>
                      {actuelle && !fichier ? (
                        <button type="button" className={BOUTON_DANGER} disabled={enCours} onClick={() => void retirer()}>
                          Retirer
                        </button>
                      ) : null}
                    </div>
                    <input
                      ref={fichierRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        choisir(event.target.files?.[0] ?? null);
                        event.target.value = "";
                      }}
                    />
                    {fichier ? <p className="font-body-sm text-body-sm text-on-surface-variant">{fichier.name}</p> : null}
                    {erreur ? (
                      <p className="font-body-sm text-body-sm text-error" role="alert">{erreur}</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="motion-rise rounded-xl border border-hairline bg-surface-container-lowest p-6" style={{ "--delay": "160ms" } as CSSProperties} aria-labelledby="titre-delais">
          <h2 id="titre-delais" className="font-headline-sm text-headline-sm text-on-surface">Délais</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            L'inactivité ferme la session. Le visa d'un acte et la validation hiérarchique s'affichent sur la file et à chaque palier. Les dossiers déjà ouverts gardent l'échéance indiquée à leur transmission.
          </p>
          {data && !data.peut_modifier ? (
            <p className="mt-6 font-body-md text-body-md text-on-surface">
              Inactivité : {data.inactivite_minutes} minute{data.inactivite_minutes > 1 ? "s" : ""}.
              Visa d'un acte : {data.delais?.visa_acte_jours ?? 2} jour{(data.delais?.visa_acte_jours ?? 2) > 1 ? "s" : ""}.
              Validation par la hiérarchie : {data.delais?.validation_hierarchie_jours ?? 3} jour{(data.delais?.validation_hierarchie_jours ?? 3) > 1 ? "s" : ""}.
              La modification est réservée aux comptes habilités à saisir ces paramètres.
            </p>
          ) : (
            <form
              className="mt-6 flex flex-wrap items-end gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void enregistrerDelais();
              }}
            >
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Inactivité avant déconnexion (minutes)</span>
                <input
                  className={`${CHAMP} w-28`}
                  type="number"
                  min={1}
                  max={240}
                  step={1}
                  inputMode="numeric"
                  value={inactivite}
                  disabled={enCours || !data}
                  onChange={(event) => setInactivite(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Visa d'un acte (jours)</span>
                <input
                  className={`${CHAMP} w-28`}
                  type="number"
                  min={1}
                  max={90}
                  step={1}
                  inputMode="numeric"
                  value={delaiVisa}
                  disabled={enCours || !data}
                  onChange={(event) => setDelaiVisa(event.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Validation par la hiérarchie (jours)</span>
                <input
                  className={`${CHAMP} w-28`}
                  type="number"
                  min={1}
                  max={90}
                  step={1}
                  inputMode="numeric"
                  value={delaiHierarchie}
                  disabled={enCours || !data}
                  onChange={(event) => setDelaiHierarchie(event.target.value)}
                />
              </label>
              <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours || !data}>Enregistrer</button>
              <p className="basis-full font-body-sm text-body-sm text-on-surface-variant">
                Après connexion, la session se ferme sans clic, frappe ni défilement. Le visa d'un acte court dès la transmission au DRH. La hiérarchie est relancée au bout du délai (chef de service ou sous-direction). La page de connexion, elle, renvoie à l'accueil après 15 secondes.
              </p>
              {erreurDelais ? <p className="basis-full font-body-sm text-body-sm text-error" role="alert">{erreurDelais}</p> : null}
            </form>
          )}
        </section>

        <SectionCouleurs peutModifier={Boolean(data?.peut_modifier)} pret={Boolean(data)} />
      </div>
    </AppChrome>
  );
}

const CHAMPS_COULEUR = [
  { cle: "principale", libelle: "Couleur principale", aide: "Barre latérale, bannières, boutons et liens." },
  { cle: "accent", libelle: "Couleur d'accent", aide: "Repères, pastilles, onglet actif et fonds teintés." },
] as const;

function SectionCouleurs({ peutModifier, pret }: { peutModifier: boolean; pret: boolean }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const enregistrees = useCouleursEnregistrees();
  const [brouillon, setBrouillon] = useState<Couleurs>(couleursCourantes);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const reference = enregistrees.data ?? COULEURS_DEFAUT;
  const valides = couleurValide(brouillon.principale) && couleurValide(brouillon.accent);
  const modifiees = brouillon.principale !== reference.principale || brouillon.accent !== reference.accent;
  const parDefaut = brouillon.principale === COULEURS_DEFAUT.principale && brouillon.accent === COULEURS_DEFAUT.accent;
  const tropClaire = couleurValide(brouillon.principale) && contraste(brouillon.principale, "#FFFFFF") < 4.5;

  useEffect(() => {
    if (enregistrees.data) setBrouillon(enregistrees.data);
  }, [enregistrees.data]);

  // Aperçu en direct : tout l'écran prend les couleurs du brouillon.
  useEffect(() => {
    if (valides) appliquerCouleurs(brouillon);
  }, [brouillon, valides]);

  // En quittant la page sans enregistrer, les couleurs enregistrées reviennent.
  useEffect(() => {
    return () => appliquerCouleurs(client.getQueryData<Couleurs>(CLE_COULEURS) ?? COULEURS_DEFAUT);
  }, [client]);

  function changer(cle: keyof Couleurs, valeur: string) {
    setErreur("");
    const texte = valeur.trim();
    setBrouillon((precedent) => ({ ...precedent, [cle]: (texte.startsWith("#") ? texte : `#${texte}`).toUpperCase() }));
  }

  async function enregistrer() {
    if (!valides) {
      setErreur("Chaque couleur doit s'écrire #RRVVBB, par exemple #042F32.");
      return;
    }
    setEnCours(true);
    setErreur("");
    try {
      const reponse = await feedback.run(
        "Enregistrement des couleurs…",
        () => api<Parametres>("/api/v1/parametres/couleurs/", { method: "POST", body: JSON.stringify(brouillon) }),
        { success: { title: "Couleurs enregistrées", message: "Le SIGRH s'affiche désormais avec ces couleurs pour tous." } },
      );
      client.setQueryData(["parametres"], reponse);
      client.setQueryData(CLE_COULEURS, reponse.couleurs);
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "Les couleurs n'ont pas pu être enregistrées.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="motion-rise rounded-xl border border-hairline bg-surface-container-lowest p-6" style={{ "--delay": "240ms" } as CSSProperties} aria-labelledby="titre-couleurs">
      <h2 id="titre-couleurs" className="font-headline-sm text-headline-sm text-on-surface">Couleurs de l'application</h2>
      <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
        Deux couleurs suffisent : les nuances, les textes lisibles et les graphiques en découlent. L'écran les essaie en direct ; elles ne s'appliquent à tous qu'une fois enregistrées.
      </p>

      <form
        className="mt-6 space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void enregistrer();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {CHAMPS_COULEUR.map((champ) => {
            const valeur = brouillon[champ.cle];
            const bloque = enCours || !pret || !peutModifier;
            return (
              <div key={champ.cle} className="space-y-1.5">
                <label htmlFor={`couleur-${champ.cle}`} className="font-label-sm text-label-sm text-on-surface-variant">{champ.libelle}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${champ.libelle} : nuancier`}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded border border-outline-variant bg-surface-container-lowest p-1 disabled:cursor-not-allowed"
                    value={couleurValide(valeur) ? valeur.toLowerCase() : "#000000"}
                    disabled={bloque}
                    onChange={(event) => changer(champ.cle, event.target.value)}
                  />
                  <input
                    id={`couleur-${champ.cle}`}
                    className={`${CHAMP} font-code-num uppercase`}
                    value={valeur}
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={!couleurValide(valeur)}
                    disabled={bloque}
                    onChange={(event) => changer(champ.cle, event.target.value)}
                  />
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{champ.aide}</p>
              </div>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-lg border border-hairline" aria-label="Aperçu des couleurs">
          <div className="flex flex-wrap items-center gap-3 bg-primary px-4 py-3 text-on-primary">
            <span className="font-label-md text-label-md font-bold">SIGRH · MPEEP</span>
            <span className="rounded-full bg-secondary-container px-2.5 py-0.5 font-label-sm text-label-sm text-on-secondary-container">Onglet actif</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-surface-container-lowest px-4 py-3">
            <span className={BOUTON_PRIMAIRE}>Bouton principal</span>
            <span className="font-label-md text-label-md text-primary underline">Lien</span>
            <span className="rounded bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm text-on-primary-fixed">Étiquette</span>
            <span className="ml-auto flex h-6 items-end gap-0.5" aria-hidden="true">
              {(valides ? paletteGraphique(brouillon) : []).map((teinte, index) => (
                <span key={index} className="w-2.5 rounded-sm" style={{ backgroundColor: teinte, height: `${40 + ((index * 37) % 60)}%` }} />
              ))}
            </span>
          </div>
        </div>

        {tropClaire ? (
          <p className="font-body-sm text-body-sm text-on-surface" role="status">
            La couleur principale est claire : les liens et titres qui la portent seront difficiles à lire sur fond blanc. Une teinte plus foncée est conseillée.
          </p>
        ) : null}

        {peutModifier ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours || !pret || !modifiees || !valides}>Enregistrer</button>
            <button type="button" className={BOUTON_SECONDAIRE} disabled={enCours || !modifiees} onClick={() => { setErreur(""); setBrouillon(reference); }}>
              Annuler
            </button>
            <button type="button" className={BOUTON_SECONDAIRE} disabled={enCours || parDefaut} onClick={() => { setErreur(""); setBrouillon(COULEURS_DEFAUT); }}>
              Couleurs par défaut
            </button>
            {erreur ? <p className="font-body-sm text-body-sm text-error" role="alert">{erreur}</p> : null}
          </div>
        ) : pret ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">La modification est réservée aux comptes habilités à saisir ces paramètres.</p>
        ) : null}
      </form>
    </section>
  );
}
