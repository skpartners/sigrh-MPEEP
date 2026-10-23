import { useEffect, useRef, useState } from "react";
import { ApiError, chargerMedia, telecharger } from "../api/client";
import type { PieceMessage } from "../api/types";
import { Icone } from "../ui/Icone";

// --- Chargement des médias protégés --------------------------------------------------------------

const MEMOIRE_MAX = 40;
const memoire = new Map<string, Promise<string>>();

/** URL locale d'un média de la messagerie : le fichier est protégé, une balise <img> ne peut pas envoyer le jeton. */
function urlLocale(chemin: string): Promise<string> {
  let promesse = memoire.get(chemin);
  if (!promesse) {
    promesse = chargerMedia(chemin).then((blob) => URL.createObjectURL(blob));
    memoire.set(chemin, promesse);
    promesse.catch(() => memoire.delete(chemin));
    // Les plus anciens médias sont relâchés : la mémoire du navigateur ne grossit pas avec la conversation.
    while (memoire.size > MEMOIRE_MAX) {
      const [ancienne] = memoire.keys();
      void memoire.get(ancienne)?.then((url) => URL.revokeObjectURL(url));
      memoire.delete(ancienne);
    }
  }
  return promesse;
}

function useMedia(chemin: string | null, actif = true) {
  const [url, setUrl] = useState("");
  const [erreur, setErreur] = useState("");
  useEffect(() => {
    if (!chemin || !actif) return;
    let vivant = true;
    urlLocale(chemin).then(
      (valeur) => vivant && setUrl(valeur),
      (cause) => vivant && setErreur(cause instanceof ApiError ? cause.message : "Média indisponible."),
    );
    return () => {
      vivant = false;
    };
  }, [chemin, actif]);
  return { url, erreur };
}

const cheminPiece = (piece: PieceMessage, apercu = false) => `/api/v1/messagerie/pieces/${piece.id}/${apercu ? "?apercu=1" : ""}`;

export function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function delaiRestant(iso: string): string {
  const reste = new Date(iso).getTime() - Date.now();
  if (reste <= 0) return "expire bientôt";
  const heures = Math.floor(reste / 3_600_000);
  if (heures >= 1) return `expire dans ${heures} h`;
  return `expire dans ${Math.max(1, Math.round(reste / 60_000))} min`;
}

// --- Coches (envoyé, reçu, lu) -------------------------------------------------------------------

export function Coches({ statut }: { statut?: "envoye" | "recu" | "lu" }) {
  if (!statut) return null;
  return (
    <span title={statut === "lu" ? "Lu" : statut === "recu" ? "Reçu" : "Envoyé"} className="inline-flex">
      <Icone nom={statut === "envoye" ? "done" : "done_all"} className={`text-base leading-none ${statut === "lu" ? "text-primary" : "text-on-surface-variant"}`} />
    </span>
  );
}

// --- Média dans une bulle ------------------------------------------------------------------------

export function PieceBulle({ piece, surMoi }: { piece: PieceMessage; surMoi: boolean }) {
  const [agrandie, setAgrandie] = useState(false);
  const [erreur, setErreur] = useState("");
  const apercu = useMedia(cheminPiece(piece, piece.apercu), !piece.expiree && piece.categorie === "image");
  const direct = useMedia(cheminPiece(piece), !piece.expiree && (piece.categorie === "audio" || piece.categorie === "video"));
  const original = useMedia(cheminPiece(piece), agrandie);
  const sourdine = surMoi ? "text-on-primary/80" : "text-on-surface-variant";

  if (piece.expiree) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 ${surMoi ? "border-on-primary/40" : "border-outline-variant"}`}>
        <Icone nom="hourglass_disabled" className="text-xl" />
        <span className="font-body-sm text-body-sm">
          {piece.categorie === "image" ? "Photo" : piece.categorie === "audio" ? "Message vocal" : piece.categorie === "video" ? "Vidéo" : piece.nom} expiré
          <span className={`block font-label-sm text-label-sm ${sourdine}`}>Les fichiers se gardent 48 h</span>
        </span>
      </div>
    );
  }

  const pied = <span className={`mt-0.5 block font-label-sm text-label-sm ${sourdine}`}>{delaiRestant(piece.expire_le)}</span>;

  if (piece.categorie === "image") {
    return (
      <div>
        <button type="button" onClick={() => setAgrandie(true)} className="block overflow-hidden rounded-lg" aria-label={`Ouvrir la photo ${piece.nom}`}>
          {apercu.url ? (
            <img src={apercu.url} alt={piece.nom} className="max-h-60 max-w-full rounded-lg object-cover" loading="lazy" />
          ) : (
            <span className="flex h-32 w-48 items-center justify-center rounded-lg bg-black/10">
              {apercu.erreur ? <Icone nom="broken_image" className="text-2xl" /> : <Icone nom="progress_activity" className="motion-spin text-2xl" />}
            </span>
          )}
        </button>
        {pied}
        {agrandie ? (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label={piece.nom} onClick={() => setAgrandie(false)}>
            {original.url ? <img src={original.url} alt={piece.nom} className="max-h-full max-w-full rounded-lg object-contain" /> : <Icone nom="progress_activity" className="motion-spin text-4xl text-white" />}
            <button type="button" aria-label="Fermer" className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30" onClick={() => setAgrandie(false)}>
              <Icone nom="close" className="text-2xl" />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (piece.categorie === "audio" || piece.categorie === "video") {
    return (
      <div>
        {direct.url ? (
          piece.categorie === "audio" ? (
            <audio controls src={direct.url} className="h-10 w-60 max-w-full" preload="metadata" />
          ) : (
            <video controls src={direct.url} className="max-h-60 max-w-full rounded-lg" preload="metadata" />
          )
        ) : (
          <span className="flex items-center gap-2 font-body-sm text-body-sm">
            <Icone nom={direct.erreur ? "error" : "progress_activity"} className={direct.erreur ? "text-xl" : "motion-spin text-xl"} />
            {direct.erreur || "Chargement…"}
          </span>
        )}
        {pied}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void telecharger(cheminPiece(piece), piece.nom).catch((cause) => setErreur(cause instanceof ApiError ? cause.message : "Téléchargement impossible."))}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left ${surMoi ? "bg-white/15 hover:bg-white/25" : "bg-surface-container hover:bg-surface-container-high"}`}
      >
        <Icone nom={piece.type === "application/pdf" ? "picture_as_pdf" : "description"} className="text-2xl" />
        <span className="min-w-0">
          <span className="block truncate font-label-md text-label-md font-semibold">{piece.nom}</span>
          <span className={`block font-label-sm text-label-sm ${sourdine}`}>{taille(piece.taille)}</span>
        </span>
        <Icone nom="download" className="ml-auto text-xl" />
      </button>
      {erreur ? <span className="block font-label-sm text-label-sm text-error">{erreur}</span> : null}
      {pied}
    </div>
  );
}

// --- Note vocale -----------------------------------------------------------------------------------

const DUREE_VOCAL_MAX_S = 180;

/** Enregistre une note vocale avec le micro ; rend le fichier à l'arrêt, sans l'envoyer. */
export function EnregistreurVocal({ onFichier, desactive }: { onFichier: (fichier: File) => void; desactive?: boolean }) {
  const [duree, setDuree] = useState<number | null>(null);
  const [erreur, setErreur] = useState("");
  const enregistreur = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const minuteur = useRef(0);
  const annule = useRef(false);

  function arreter(annulation: boolean) {
    annule.current = annulation;
    if (enregistreur.current?.state === "recording") enregistreur.current.stop();
  }

  useEffect(() => () => arreter(true), []);

  async function demarrer() {
    setErreur("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErreur("L'enregistrement n'est pas disponible sur ce navigateur.");
      return;
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((candidat) => MediaRecorder.isTypeSupported(candidat)) ?? "";
      const appareil = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
      morceaux.current = [];
      annule.current = false;
      appareil.ondataavailable = (evenement) => evenement.data.size && morceaux.current.push(evenement.data);
      appareil.onstop = () => {
        window.clearInterval(minuteur.current);
        flux.getTracks().forEach((piste) => piste.stop());
        setDuree(null);
        if (annule.current || morceaux.current.length === 0) return;
        const mime = appareil.mimeType || "audio/webm";
        const extension = mime.includes("mp4") ? "m4a" : "webm";
        onFichier(new File(morceaux.current, `voix-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.${extension}`, { type: mime }));
      };
      enregistreur.current = appareil;
      appareil.start();
      setDuree(0);
      minuteur.current = window.setInterval(() => {
        setDuree((valeur) => {
          if ((valeur ?? 0) + 1 >= DUREE_VOCAL_MAX_S) arreter(false);
          return (valeur ?? 0) + 1;
        });
      }, 1000);
    } catch {
      setErreur("Le micro n'est pas accessible : autorisez-le dans le navigateur.");
    }
  }

  if (duree !== null) {
    return (
      <div className="flex items-center gap-2" role="status" aria-label="Enregistrement en cours">
        <button type="button" aria-label="Annuler l'enregistrement" onClick={() => arreter(true)} className="flex h-10 w-10 items-center justify-center rounded-full text-error hover:bg-error-container/50">
          <Icone nom="delete" className="text-xl" />
        </button>
        <span className="flex items-center gap-1.5 font-code-num text-code-num text-error">
          <span className="h-2 w-2 animate-pulse rounded-full bg-error" />
          {String(Math.floor(duree / 60)).padStart(2, "0")}:{String(duree % 60).padStart(2, "0")}
        </span>
        <button type="button" aria-label="Terminer l'enregistrement" onClick={() => arreter(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary-container">
          <Icone nom="check" className="text-xl" />
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label="Enregistrer un message vocal"
        title="Message vocal"
        disabled={desactive}
        onClick={() => void demarrer()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
      >
        <Icone nom="mic" className="text-xl" />
      </button>
      {erreur ? <span role="alert" className="sr-only">{erreur}</span> : null}
    </>
  );
}
