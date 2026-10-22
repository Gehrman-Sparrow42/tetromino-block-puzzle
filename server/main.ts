import { startOnlineServer } from "./server";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const rawPort = process.env.ONLINE_PORT ?? "8172";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("ONLINE_PORT must be from 1 to 65535.");
const lan = process.env.ONLINE_LAN === "1";
const lanAddresses = Object.values(networkInterfaces()).flatMap((addresses) =>
  (addresses ?? [])
    .filter(
      (address) =>
        address.family === "IPv4" &&
        !address.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address),
    )
    .map((address) => address.address),
);
let playtestHtml: string | undefined;
try {
  playtestHtml = await readFile(resolve("dist-playtest/online.html"), "utf8");
} catch (error) {
  if (lan || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const configuredOrigins = process.env.ONLINE_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
const service = await startOnlineServer({
  host: process.env.ONLINE_HOST ?? (lan ? "0.0.0.0" : "127.0.0.1"),
  port,
  playtestHtml,
  origins: configuredOrigins ?? [
    ...localOrigins,
    "http://127.0.0.1:5178",
    "http://localhost:5178",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
    ...(lan ? lanAddresses.map((address) => `http://${address}:${port}`) : []),
  ],
});
console.log(
  `Afterblock online foundation: http://${service.host}:${service.port}/health`,
);
if (playtestHtml) console.log(`PC playtest: http://127.0.0.1:${port}/play`);
if (lan)
  for (const address of lanAddresses)
    console.log(`Phone (same Wi-Fi): http://${address}:${port}/play`);
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  void service.close().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
