import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const studioRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: studioRoot,
  base: "./",
  publicDir: path.resolve(studioRoot, "../fonts"),
  plugins: [react()],
  build: {
    outDir: path.resolve(studioRoot, "dist"),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8765",
      "/__health": "http://127.0.0.1:8765",
      "/__save": "http://127.0.0.1:8765",
      "/my-progress.json": "http://127.0.0.1:8765",
      "/legacy": "http://127.0.0.1:8765"
    }
  }
});
