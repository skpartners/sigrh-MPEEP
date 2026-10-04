import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/sigrh/",
  plugins: [react(), tailwindcss()],
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
