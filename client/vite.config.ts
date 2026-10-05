import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

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
  plugins: [redirigerRacine(), react(), tailwindcss()],
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
