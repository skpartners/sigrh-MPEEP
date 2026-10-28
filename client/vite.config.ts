import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const versionApplication = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

function redirigerRacine(): Plugin {
  const rediriger: Connect.NextHandleFunction = (req, res, next) => {
    const chemin = (req.url ?? "").split("?")[0];
    if (chemin === "/" || chemin === "") {
      res.writeHead(302, { Location: "/sigrh/" });
      res.end();
      return;
    }
    next();
  };
  return {
    name: "rediriger-racine",
    configureServer(server) {
      server.middlewares.use(rediriger);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rediriger);
    },
  };
}

export default defineConfig({
  base: "/sigrh/",
  define: {
    __VERSION_APPLICATION__: JSON.stringify(versionApplication),
  },
  plugins: [
    redirigerRacine(),
    react(),
    tailwindcss(),
    // Mode hors ligne : le service worker garde l'application (coquille, scripts, styles, polices) pour qu'elle s'ouvre sans
    // réseau. Il ne touche jamais à l'API : les données hors ligne vivent dans le coffre chiffré (src/hors-ligne/).
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: {
        name: "SIGRH — Portefeuille de l'État",
        short_name: "SIGRH",
        description: "Système intégré de gestion des ressources humaines du Ministère du Portefeuille de l'État.",
        lang: "fr",
        start_url: "/sigrh/app",
        scope: "/sigrh/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1a2430",
        icons: [
          { src: "icones/icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Les grandes photos (fonds d'écran) ne sont pas précachées : elles se gardent à la première vue.
        globPatterns: ["**/*.{js,css,html,woff2,woff,ico,svg,png}"],
        globIgnores: ["**/*.{gz,br}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/sigrh/index.html",
        navigateFallbackDenylist: [/^\/sigrh\/(api|media|admin|ws)\//, /\.[a-z0-9]+$/i],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          { urlPattern: ({ url }) => /\.(jpe?g|webp)$/i.test(url.pathname) && url.pathname.startsWith("/sigrh/"), handler: "CacheFirst", options: { cacheName: "sigrh-photos", expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 3600 } } },
        ],
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 9100,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 9100,
    strictPort: true,
  },
});
