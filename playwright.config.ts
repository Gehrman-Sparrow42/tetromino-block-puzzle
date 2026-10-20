import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  timeout: 30000,
  expect: { timeout: 5000 },
  use: { baseURL: "http://127.0.0.1:5178", trace: "retain-on-failure" },
  projects: [
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 393, height: 851 } },
    },
    {
      name: "small-phone",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 600 } },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev -- --port 5178 --strictPort",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: !process.env.CI,
  },
});
