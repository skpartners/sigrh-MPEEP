import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, mediaUrl } from "../api/client";
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
  connexion: {
    active: boolean;
    matricule: string;
    nom: string;
    prenoms: string;
    fonction: string;
    organisme: string;
  };
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
  const [adminMatricule, setAdminMatricule] = useState("");
  const [adminNom, setAdminNom] = useState("");
  const [adminPrenoms, setAdminPrenoms] = useState("");
  const [adminFonction, setAdminFonction] = useState("");
  const [adminOrganisme, setAdminOrganisme] = useState("");
  const [adminPasse, setAdminPasse] = useState("");
  const [adminConfirmation, setAdminConfirmation] = useState("");
  const [erreurConnexion, setErreurConnexion] = useState("");
  const [inactivite, setInactivite] = useState("15");
  const [erreurInactivite, setErreurInactivite] = useState("");
  const apercuRef = useRef("");
  const organismes = useQuery({
    queryKey: ["organismes"],
    queryFn: () => api<{ code: string; nom: string; sigle: string }[]>("/api/v1/public/organismes/"),
  });

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
    setAdminMatricule(page.data.connexion.matricule);
    setAdminNom(page.data.connexion.nom);
    setAdminPrenoms(page.data.connexion.prenoms);
    setAdminFonction(page.data.connexion.fonction);
    setAdminOrganisme(page.data.connexion.organisme);
    setInactivite(String(page.data.inactivite_minutes ?? 15));
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

  async function enregistrerConnexion() {
    if ((adminPasse || adminConfirmation) && adminPasse !== adminConfirmation) {
      setErreurConnexion("La confirmation du mot de passe ne correspond pas.");
      return;
    }
    setEnCours(true);
    setErreurConnexion("");
    try {
      const reponse = await feedback.run(
        "Enregistrement des paramètres de connexion…",
        () =>
          api<Parametres>("/api/v1/parametres/connexion/", {
            method: "POST",
            body: JSON.stringify({
              matricule: adminMatricule.trim(),
              nom: adminNom.trim(),
              prenoms: adminPrenoms.trim(),
              fonction: adminFonction.trim(),
              organisme: adminOrganisme,
              mot_de_passe: adminPasse,
              confirmation: adminConfirmation,
            }),
          }),
        { success: { title: "Connexion mise à jour", message: "Les paramètres de l'administrateur sont enregistrés." } },
      );
      client.setQueryData(["parametres"], reponse);
      setAdminPasse("");
      setAdminConfirmation("");
    } catch (cause) {
      setErreurConnexion(cause instanceof ApiError ? cause.message : "Les paramètres de connexion n'ont pas pu être enregistrés.");
    } finally {
      setEnCours(false);
    }
  }

  async function enregistrerInactivite() {
    const minutes = Number(inactivite);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      setErreurInactivite("Indiquez une durée entre 1 et 240 minutes.");
      return;
    }
    setEnCours(true);
    setErreurInactivite("");
    try {
      const reponse = await feedback.run(
        "Enregistrement du délai d'inactivité…",
        () =>
          api<Parametres>("/api/v1/parametres/inactivite/", {
            method: "POST",
            body: JSON.stringify({ minutes }),
          }),
        { success: { title: "Délai enregistré", message: `La session se ferme après ${minutes} minute${minutes > 1 ? "s" : ""} sans action.` } },
      );
      client.setQueryData(["parametres"], reponse);
    } catch (cause) {
      setErreurInactivite(cause instanceof ApiError ? cause.message : "Le délai n'a pas pu être enregistré.");
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
        <div className="bg-surface-container-lowest p-6 rounded-lg border border-hairline space-y-1.5">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Gouvernance · Paramètres</p>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Paramètres du ministère</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
            Les paramètres de connexion ouvrent l'accès. La civilité, le nom et le portrait de la ministre s'affichent ensuite sur le portail public.
          </p>
        </div>

        {page.isError ? (
          <p className="font-body-md text-body-md text-error" role="alert">
            {page.error instanceof ApiError ? page.error.message : "Les paramètres n'ont pas pu être chargés."}
          </p>
        ) : null}

        <section className="rounded-xl border border-hairline bg-surface-container-lowest p-6" aria-labelledby="titre-connexion">
          <h2 id="titre-connexion" className="font-headline-sm text-headline-sm text-on-surface">Paramètres de connexion</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            Le matricule et le mot de passe initiaux viennent du fichier d'environnement. L'administrateur peut les modifier ici. Laissez le mot de passe vide pour le conserver.
          </p>
          {data && !data.connexion.active ? (
            <p className="mt-6 font-body-md text-body-md text-on-surface">
              La connexion n'est pas encore activée. Renseignez SIGRH_ADMIN_MATRICULE et SIGRH_ADMIN_MOT_DE_PASSE, puis redémarrez le service.
            </p>
          ) : data && !data.peut_modifier ? (
            <p className="mt-6 font-body-md text-body-md text-on-surface">
              {[data.connexion.prenoms, data.connexion.nom].filter(Boolean).join(" ") || data.connexion.matricule}
              {data.connexion.fonction ? ` · ${data.connexion.fonction}` : ""}. La modification est réservée aux comptes habilités à saisir ces paramètres.
            </p>
          ) : (
            <form
              className="mt-6 grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                void enregistrerConnexion();
              }}
            >
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Matricule</span>
                <input className={CHAMP} value={adminMatricule} maxLength={150} disabled={enCours || !data} autoComplete="off" onChange={(event) => setAdminMatricule(event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Fonction</span>
                <input className={CHAMP} value={adminFonction} maxLength={160} disabled={enCours || !data} onChange={(event) => setAdminFonction(event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Nom</span>
                <input className={CHAMP} value={adminNom} maxLength={150} disabled={enCours || !data} onChange={(event) => setAdminNom(event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Prénoms</span>
                <input className={CHAMP} value={adminPrenoms} maxLength={150} disabled={enCours || !data} onChange={(event) => setAdminPrenoms(event.target.value)} />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Organisme</span>
                <select className={CHAMP} value={adminOrganisme} disabled={enCours || !data} onChange={(event) => setAdminOrganisme(event.target.value)}>
                  {(organismes.data ?? []).map((item) => (
                    <option key={item.code} value={item.code}>{item.sigle ? `${item.nom} (${item.sigle})` : item.nom}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Nouveau mot de passe</span>
                <input className={CHAMP} type="password" value={adminPasse} autoComplete="new-password" disabled={enCours || !data} onChange={(event) => setAdminPasse(event.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Confirmation</span>
                <input className={CHAMP} type="password" value={adminConfirmation} autoComplete="new-password" disabled={enCours || !data} onChange={(event) => setAdminConfirmation(event.target.value)} />
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours || !data}>Enregistrer</button>
                {erreurConnexion ? <p className="font-body-sm text-body-sm text-error" role="alert">{erreurConnexion}</p> : null}
              </div>
            </form>
          )}
          {data ? (
            <form
              className="mt-6 flex flex-wrap items-end gap-3 border-t border-hairline pt-6"
              onSubmit={(event) => {
                event.preventDefault();
                void enregistrerInactivite();
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
                  disabled={enCours || !data.peut_modifier}
                  onChange={(event) => setInactivite(event.target.value)}
                />
              </label>
              {data.peut_modifier ? (
                <button type="submit" className={BOUTON_PRIMAIRE} disabled={enCours}>Enregistrer</button>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">La modification est réservée aux comptes habilités à saisir ces paramètres.</p>
              )}
              <p className="basis-full font-body-sm text-body-sm text-on-surface-variant">
                Après la connexion, la session se ferme au bout de cette durée sans clic, frappe ni défilement. La page de connexion, elle, renvoie à l'accueil après 15 secondes.
              </p>
              {erreurInactivite ? <p className="basis-full font-body-sm text-body-sm text-error" role="alert">{erreurInactivite}</p> : null}
            </form>
          ) : null}
        </section>

        <section className="rounded-xl border border-hairline bg-surface-container-lowest p-6" aria-labelledby="titre-identite-ministre">
          <h2 id="titre-identite-ministre" className="font-headline-sm text-headline-sm text-on-surface">Identité de la ministre</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
            La civilité et le nom accompagnent le portrait sur le portail.
          </p>
          {data && !data.peut_modifier ? (
            <p className="mt-6 font-body-md text-body-md text-on-surface">
              {data.civilite || data.nom
                ? [data.civilite, data.nom].filter(Boolean).join(" ")
                : "Aucune identité n'est encore enregistrée."}{" "}
              La modification est réservée aux comptes habilités à saisir ces paramètres.
            </p>
          ) : (
            <form
              className="mt-6 grid gap-4 sm:grid-cols-[12rem_minmax(0,24rem)_auto] sm:items-end"
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
                Enregistrer
              </button>
              {erreurIdentite ? (
                <p className="sm:col-span-3 font-body-sm text-body-sm text-error" role="alert">{erreurIdentite}</p>
              ) : null}
            </form>
          )}
        </section>

        <section className="rounded-xl border border-hairline bg-surface-container-lowest p-6" aria-labelledby="titre-photo-ministre">
          <h2 id="titre-photo-ministre" className="font-headline-sm text-headline-sm text-on-surface">Photo de la ministre</h2>
          <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">Image PNG, JPG ou WEBP, au plus 5 Mo.</p>

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

            <div className="min-w-0 space-y-3">
              {data && !data.peut_modifier ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {visible ? "Portrait en vigueur." : "Aucun portrait n'est encore déposé."} La modification est réservée aux comptes habilités à saisir ces paramètres.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={BOUTON_SECONDAIRE} disabled={enCours || !data} onClick={() => fichierRef.current?.click()}>
                      <Icone nom="upload" className="text-lg" />
                      Choisir une photo
                    </button>
                    <button type="button" className={BOUTON_PRIMAIRE} disabled={enCours || !fichier} onClick={() => void enregistrer()}>
                      Enregistrer
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
                </>
              )}
              {erreur ? (
                <p className="font-body-sm text-body-sm text-error" role="alert">{erreur}</p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </AppChrome>
  );
}
