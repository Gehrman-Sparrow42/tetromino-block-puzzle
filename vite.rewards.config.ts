import { defineConfig } from "vite";
export default defineConfig({
  build: {
    ssr: "server/rewards/main.ts",
    outDir: "dist-rewards",
    sourcemap: true,
  },
});
