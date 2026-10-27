import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["replicad-opencascadejs", "manifold-3d"] },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
