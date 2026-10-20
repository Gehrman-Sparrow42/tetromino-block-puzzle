import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.berkay.afterblock",
  appName: "Afterblock",
  webDir: "dist",
  backgroundColor: "#101715",
  android: { backgroundColor: "#101715", allowMixedContent: false },
  plugins: {
    SystemBars: {
      style: "DARK",
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};
export default config;
