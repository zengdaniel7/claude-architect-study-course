import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const studioRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // Read the flag from both the shell and .env files so the preview alias can
  // never disagree with import.meta.env's view of VITE_CCAF_PUBLIC_PREVIEW.
  const env = loadEnv(mode, studioRoot, "VITE_");
  const publicPreview = (process.env.VITE_CCAF_PUBLIC_PREVIEW ?? env.VITE_CCAF_PUBLIC_PREVIEW) === "true";
  return {
  root: studioRoot,
  base: "./",
  publicDir: path.resolve(studioRoot, "../fonts"),
  resolve: {
    alias: publicPreview ? [{
      find: /^(?:\.\/|\.\.\/)api$/,
      replacement: path.resolve(studioRoot, "src/api.preview.ts")
    }] : []
  },
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
  };
});
