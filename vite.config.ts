import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  // Vite exposes only prefixed vars to the browser. The Clerk publishable key arrives
  // from the Vercel Marketplace as NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — a publishable key
  // is public by design, so exposing it is correct. CLERK_SECRET_KEY matches neither
  // prefix and therefore never reaches the bundle.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
  },
});
