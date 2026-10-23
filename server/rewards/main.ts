import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { startRewardsServer } from "./http";

const databasePath = resolve(
  process.env.REWARDS_DATABASE ?? "artifacts/rewards/rewards.sqlite",
);
const port = Number(process.env.REWARDS_PORT ?? "8173");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid REWARDS_PORT");
await mkdir(dirname(databasePath), { recursive: true });
const server = await startRewardsServer({
  port,
  databasePath,
  host: process.env.REWARDS_HOST ?? "127.0.0.1",
  adUnits: (process.env.REWARDED_AD_UNITS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ...(process.env.REWARDS_ORIGINS
    ? {
        origins: process.env.REWARDS_ORIGINS.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }
    : {}),
});
console.log(
  `Afterblock reward backend: http://127.0.0.1:${server.port}/health`,
);
console.log(
  "Live verification is disabled until REWARDED_AD_UNITS is configured. Ctrl+C stops the service.",
);
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  void server.close().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
