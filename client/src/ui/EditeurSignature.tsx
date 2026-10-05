import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { api, mediaUrl } from "../api/client";
import type { SessionUser } from "../api/types";
import { useFeedback } from "./Feedback";
import { BOUTON_PRIMAIRE, BOUTON_SECONDAIRE, Modale } from "./Modale";
import { Icone } from "./Icone";

/** Ouvre le cadre où le responsable dessine sa signature, puis enregistre ce tracé. */
export function EditeurSignature({ user, onClose }: { user: SessionUser | undefined; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const client = useQueryClient();
  const feedback = useFeedback();
  const [vide, setVide] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, {
      penColor: "#1a4fbf",
      minWidth: 0.8,
      maxWidth: 2.6,
      backgroundColor: "rgba(0,0,0,0)",
    });
    const suivre = () => setVide(pad.isEmpty());
    pad.addEventListener("endStroke", suivre);
    padRef.current = pad;
    return () => {
      pad.removeEventListener("endStroke", suivre);
      pad.off();
    };
  }, []);

  async function enregistrer(fichier: File) {
    const corps = new FormData();
    corps.append("fichier", fichier);
    const moi = await feedback.run(
      "Enregistrement de la signature…",
      () => api<SessionUser>("/api/v1/me/signature/", { method: "POST", body: corps }),
      { success: { title: "Signature enregistrée", message: "Elle sera apposée à chaque visa." } },
    );
    client.setQueryData(["me"], moi);
    onClose();
  }

  function enregistrerTrace() {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas || pad.isEmpty()) {
      feedback.toast("Le cadre est vide", "Dessinez votre signature avant de l'enregistrer.", "info");
      return;
    }
    void enregistrer(fichierDepuis(recadrer(canvas)));
  }

  function effacer() {
    padRef.current?.clear();
    setVide(true);
  }

  return (
    <Modale
      titre="Dessiner votre signature"
      sousTitre="Signez dans le cadre. C'est ce tracé qui sera enregistré et apposé à chaque visa."
      icone="draw"
      taille="md"
      onClose={onClose}
      pied={
        <>
          <label className="mr-auto inline-flex cursor-pointer items-center gap-1.5 font-label-md text-label-md font-semibold text-primary">
            <Icone nom="upload" className="text-lg" />
            Importer une image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const fichier = event.target.files?.[0];
                event.target.value = "";
                if (fichier) void enregistrer(fichier);
              }}
            />
          </label>
          <button type="button" className={BOUTON_SECONDAIRE} onClick={effacer}>
            Effacer
          </button>
          <button type="button" className={BOUTON_PRIMAIRE} disabled={vide} onClick={enregistrerTrace}>
            Enregistrer
          </button>
        </>
      }
    >
        {user?.signature_url
 ? (
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant mb-1.5">Signature actuelle</p>
            <div className="flex h-16 items-center justify-center rounded-lg border border-hairline bg-white px-4">
              <img src={mediaUrl(user.signature_url)} alt="Signature enregistrée" className="max-h-12 max-w-full object-contain" />
            </div>
          </div>
        ) : null}
        <div className={`relative rounded-lg border border-hairline bg-white ${user?.signature_url ? "mt-4" : ""}`}>
          <canvas ref={canvasRef} className="block w-full h-44 touch-none cursor-crosshair" aria-label="Zone de signature" />
          <span className="pointer-events-none absolute left-8 right-8 bottom-8 border-b border-outline-variant" aria-hidden="true" />
        </div>
    </Modale>
  );
}

function recadrer(source: HTMLCanvasElement): HTMLCanvasElement {
  const contexte = source.getContext("2d");
  if (!contexte) return source;
  const { width, height } = source;
  const pixels = contexte.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return source;
  const marge = 16;
  minX = Math.max(0, minX - marge);
  minY = Math.max(0, minY - marge);
  maxX = Math.min(width - 1, maxX + marge);
  maxY = Math.min(height - 1, maxY + marge);
  const largeur = maxX - minX + 1;
  const hauteur = maxY - minY + 1;
  const sortie = document.createElement("canvas");
  sortie.width = largeur;
  sortie.height = hauteur;
  sortie.getContext("2d")?.drawImage(source, minX, minY, largeur, hauteur, 0, 0, largeur, hauteur);
  return sortie;
}

function fichierDepuis(canvas: HTMLCanvasElement): File {
  const url = canvas.toDataURL("image/png");
  const binaire = atob(url.split(",")[1] ?? "");
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) octets[i] = binaire.charCodeAt(i);
  return new File([octets], "signature.png", { type: "image/png" });
}
