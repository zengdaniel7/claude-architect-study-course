import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const studioRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: studioRoot,
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["./src/**/*.test.{ts,tsx}"],
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1
  }
});
