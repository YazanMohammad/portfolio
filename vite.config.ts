import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { siteHead } from "./vite-plugins/site-head";

export default defineConfig({
  base: "/",
  plugins: [
    siteHead({
      fallbackPath: path.resolve(import.meta.dirname, "src/content/fallback.json"),
      siteOrigin: process.env.SITE_ORIGIN,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    // Netlify serves the production CSP locally; React Refresh needs an inline preamble.
    hmr: process.env.NETLIFY_DEV === "true" ? false : undefined,
    watch: { ignored: ["**/.taste-skill/**", "**/shots/**"] },
  },
});
