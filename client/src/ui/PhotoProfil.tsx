import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ApiError, api, mediaUrl } from "../api/client";
import type { Dossier } from "../api/types";
import { useFeedback } from "./Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "./Modale";

type Identite = { matricule: string; nom_complet: string; initiales: string; photo_url?: string };

/** Portrait de l'agent : la photo versée, ou ses initiales. */
export function Portrait({ agent, className }: { agent: Identite; className: string }) {
  const src = mediaUrl(agent.photo_url);
  if (src) return <img src={src} alt="" className={`${className} object-cover`} />;
  return (
    <span className={`${className} flex items-center justify-center font-bold`} aria-hidden="true">
      {agent.initiales}
    </span>
  );
}

/** L'agent choisit une image ou la prend avec l'appareil photo, puis l'enregistre sur son dossier. */
export function EditeurPhoto({ agent, onClose }: { agent: Identite; onClose: () => void }) {
  const client = useQueryClient();
  const feedback = useFeedback();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const fluxRef = useRef<MediaStream | null>(null);
  const apercuRef = useRef("");
  const [apercu, setApercu] = useState("");
  const [fichier, setFichier] = useState<File | null>(null);
  const [camera, setCamera] = useState(false);
  const [face, setFace] = useState<"user" | "environment">("user");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const appareil = typeof navigator.mediaDevices?.getUserMedia === "function";

  useEffect(() => {
    return () => {
      arreter(fluxRef.current);
      if (apercuRef.current.startsWith("blob:")) URL.revokeObjectURL(apercuRef.current);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const flux = fluxRef.current;
    if (!camera || !video || !flux) return;
    video.srcObject = flux;
    void video.play();
  }, [camera, face]);

  function montrer(url: string) {
    if (apercuRef.current.startsWith("blob:")) URL.revokeObjectURL(apercuRef.current);
    apercuRef.current = url;
    setApercu(url);
  }

  async function ouvrirCamera(cible: "user" | "environment") {
    setErreur("");
    setFace(cible);
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: cible }, audio: false });
      arreter(fluxRef.current);
      fluxRef.current = flux;
      setCamera(true);
    } catch (cause) {
      setCamera(false);
      setErreur(messageCamera(cause instanceof DOMException ? cause : new DOMException("appareil photo")));
    }
  }

  function choisir(choisi: File | null) {
    if (!choisi) return;
    const type = choisi.type || (/\.png$/i.test(choisi.name) ? "image/png" : /\.jpe?g$/i.test(choisi.name) ? "image/jpeg" : /\.webp$/i.test(choisi.name) ? "image/webp" : "");
    if (!/^image\/(png|jpeg|webp)$/.test(type)) {
      setErreur("Choisissez une image PNG, JPG ou WEBP.");
      return;
    }
    if (choisi.size > 5 * 1024 * 1024) {
      setErreur("La photo dépasse 5 Mo.");
      return;
    }
    setErreur("");
    setCamera(false);
    arreter(fluxRef.current);
    fluxRef.current = null;
    setFichier(choisi);
    montrer(URL.createObjectURL(choisi));
  }

  async function capturer() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setErreur("L'image de l'appareil photo n'est pas encore prête.");
      return;
    }
    const blob = await cadre(video, face === "user");
    const photo = new File([blob], "photo.jpg", { type: "image/jpeg" });
    setCamera(false);
    choisir(photo);
  }

  async function enregistrer() {
    if (!fichier) return;
    setEnCours(true);
    setErreur("");
    const corps = new FormData();
    corps.set("fichier", fichier);
    try {
      const dossier = await feedback.run(
        "Enregistrement de la photo…",
        () => api<Dossier>(`/api/v1/agents/${encodeURIComponent(agent.matricule)}/photo/`, { method: "POST", body: corps }),
        { success: { title: "Photo enregistrée", message: `Elle figure sur le dossier de ${agent.nom_complet}.` } },
      );
      client.setQueryData(["agent", agent.matricule], dossier);
      void client.invalidateQueries({ queryKey: ["agents"] });
      onClose();
    } catch (cause) {
      setErreur(cause instanceof ApiError ? cause.message : "La photo n'a pas pu être enregistrée.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      titre="Photo de profil"
      sousTitre={`${agent.nom_complet} · ${agent.matricule}`}
      icone="add_a_photo"
      taille="md"
      onClose={onClose}
      enCours={enCours}
      erreur={erreur || undefined}
      pied={
        camera ? (
          <>
            <button type="button" className={BOUTON_SECONDAIRE} onClick={() => { setCamera(false); arreter(fluxRef.current); fluxRef.current = null; }}>
              Retour
            </button>
            <button type="button" className={BOUTON_SECONDAIRE} onClick={() => void ouvrirCamera(face === "user" ? "environment" : "user")}>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">cameraswitch</span>
              Changer de caméra
            </button>
            <button type="button" className={BOUTON_PRIMAIRE} onClick={() => void capturer()}>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">photo_camera</span>
              Prendre la photo
            </button>
          </>
        ) : (
          <>
            <button type="button" className={BOUTON_SECONDAIRE} onClick={() => fichierRef.current?.click()}>
              <span className="material-symbols-outlined text-lg" aria-hidden="true">image</span>
              Choisir une image
            </button>
            {appareil ? (
              <button type="button" className={BOUTON_SECONDAIRE} onClick={() => void ouvrirCamera(face)}>
                <span className="material-symbols-outlined text-lg" aria-hidden="true">photo_camera</span>
                Prendre une photo
              </button>
            ) : null}
            <button type="button" className={BOUTON_PRIMAIRE} disabled={!fichier || enCours} onClick={() => void enregistrer()}>
              {enCours ? <span className="material-symbols-outlined text-lg motion-spin" aria-hidden="true">progress_activity</span> : null}
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </>
        )
      }
    >
        <div>
          {camera ? (
            <video ref={videoRef} className={`w-full aspect-square rounded-xl bg-inverse-surface object-cover ${face === "user" ? "-scale-x-100" : ""}`} autoPlay playsInline muted />
          ) : apercu ? (
            <img src={apercu} alt={`Aperçu de la photo de ${agent.nom_complet}`} className="w-full aspect-square rounded-xl object-cover bg-surface-container" />
          ) : (
            <div className="w-full aspect-square max-h-64 mx-auto rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <Portrait agent={agent} className="w-full h-full rounded-xl bg-primary-fixed text-on-primary-fixed font-headline-lg text-headline-lg" />
            </div>
          )}
        </div>

        <input ref={fichierRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => choisir(event.target.files?.[0] ?? null)} />
    </Modale>
  );
}

function arreter(flux: MediaStream | null) {
  flux?.getTracks().forEach((piste) => piste.stop());
}

function messageCamera(cause: DOMException): string {
  if (cause.name === "NotAllowedError") return "L'accès à l'appareil photo a été refusé. Vous pouvez choisir une image déjà enregistrée.";
  if (cause.name === "NotFoundError" || cause.name === "OverconstrainedError") return "Aucun appareil photo n'est disponible sur ce poste.";
  return "L'appareil photo n'a pas pu être ouvert.";
}

function cadre(video: HTMLVideoElement, miroir: boolean): Promise<Blob> {
  const taille = 640;
  const canvas = document.createElement("canvas");
  canvas.width = taille;
  canvas.height = taille;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas"));
  const cote = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - cote) / 2;
  const sy = (video.videoHeight - cote) / 2;
  if (miroir) {
    ctx.translate(taille, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, cote, cote, 0, 0, taille, taille);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/jpeg", 0.9);
  });
}
