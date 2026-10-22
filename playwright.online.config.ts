import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/online",
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:8172", trace: "retain-on-failure" },
  webServer: {
    command: "npm run online:lan",
    env: { ONLINE_LAN: "1" },
    url: "http://127.0.0.1:8172/health",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
