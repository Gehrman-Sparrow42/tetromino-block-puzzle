import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "server/main.ts",
    outDir: "dist-online",
    emptyOutDir: true,
    sourcemap: true,
  },
});
