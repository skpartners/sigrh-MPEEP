import { useEffect, useState } from "react";
import { mediaUrl } from "../api/client";
import { Chargement } from "./Chargement";
import { Icone } from "./Icone";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "./Modale";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function extensionDe(url: string): string {
  return url.split("?")[0].match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
}

/** Récupère le fichier puis l’enregistre ; à défaut (accès croisé refusé), l’ouvre dans un nouvel onglet. */
export async function telechargerFichier(chemin: string, nom: string): Promise<void> {
  const href = mediaUrl(chemin);
  if (!href) return;
  try {
    const reponse = await fetch(href);
    if (!reponse.ok) throw new Error("indisponible");
    const url = URL.createObjectURL(await reponse.blob());
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = `${nom}${extensionDe(href)}`;
    lien.click();
    URL.revokeObjectURL(url);
  } catch {
    window.open(href, "_blank", "noreferrer");
  }
}

type Etat = { statut: "chargement" } | { statut: "erreur" } | { statut: "pret"; url: string; type: string };

/**
 * Prévisualisation d’une image ou d’un PDF, avec téléchargement.
 * Le fichier est lu puis affiché depuis une URL locale : le navigateur n’a pas à encadrer l’adresse du serveur
 * (interdit entre deux origines, comme le front et l’API en développement).
 */
export function ApercuFichier({ chemin, titre, sousTitre, onClose }: { chemin: string; titre: string; sousTitre?: string; onClose: () => void }) {
  const href = mediaUrl(chemin);
  const [etat, setEtat] = useState<Etat>({ statut: "chargement" });

  useEffect(() => {
    let annule = false;
    let local = "";
    setEtat({ statut: "chargement" });
    (async () => {
      try {
        const reponse = await fetch(href);
        if (!reponse.ok) throw new Error("indisponible");
        const type = TYPES[extensionDe(href)] ?? reponse.headers.get("Content-Type") ?? "application/octet-stream";
        local = URL.createObjectURL(new Blob([await reponse.arrayBuffer()], { type }));
        if (annule) URL.revokeObjectURL(local);
        else setEtat({ statut: "pret", url: local, type });
      } catch {
        if (!annule) setEtat({ statut: "erreur" });
      }
    })();
    return () => {
      annule = true;
      if (local) URL.revokeObjectURL(local);
    };
  }, [href]);

  return (
    <Modale titre={titre} sousTitre={sousTitre} icone="visibility" taille="xl" onClose={onClose}
      pied={
        <>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={onClose}>Fermer</button>
          <a className={BOUTON_SECONDAIRE} href={href} target="_blank" rel="noreferrer">
            <Icone nom="open_in_new" className="text-lg" />Ouvrir dans un onglet
          </a>
          <button type="button" className={BOUTON_PRIMAIRE} onClick={() => void telechargerFichier(chemin, titre)}>
            <Icone nom="download" className="text-lg" />Télécharger
          </button>
        </>
      }>
      {etat.statut === "chargement" ? (
        <Chargement libelle="Chargement du document…" />
      ) : etat.statut === "erreur" ? (
        <p className="py-16 text-center font-body-md text-error" role="alert">
          Le document n’a pas pu être affiché. Essayez de l’ouvrir dans un onglet ou de le télécharger.
        </p>
      ) : etat.type.startsWith("image/") ? (
        <img src={etat.url} alt={titre} className="max-h-[70vh] mx-auto rounded-lg object-contain" />
      ) : (
        <iframe src={etat.url} title={titre} className="w-full h-[70vh] rounded-lg bg-surface-container-low" />
      )}
    </Modale>
  );
}
