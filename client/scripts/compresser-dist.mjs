// Compresse le front construit (gzip et brotli) à côté des originaux : WhiteNoise sert la version compressée aux
// navigateurs qui l'acceptent, ce qui allège fortement les premières visites quand plusieurs utilisateurs se connectent.
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const DIST = new URL("../dist", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXTENSIONS = new Set([".js", ".css", ".html", ".svg", ".json", ".map", ".txt", ".xml"]);
const SEUIL = 1024;

let total = 0;
let gagne = 0;

function parcourir(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) parcourir(chemin);
    else if (EXTENSIONS.has(extname(nom)) && statSync(chemin).size >= SEUIL) compresser(chemin);
  }
}

function compresser(chemin) {
  const source = readFileSync(chemin);
  const gz = gzipSync(source, { level: 9 });
  const br = brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  writeFileSync(`${chemin}.gz`, gz);
  writeFileSync(`${chemin}.br`, br);
  total += source.length;
  gagne += source.length - Math.min(gz.length, br.length);
}

parcourir(DIST);
console.log(`Front compressé : ${(total / 1024 / 1024).toFixed(1)} Mo → ${((total - gagne) / 1024 / 1024).toFixed(1)} Mo envoyés (brotli).`);
