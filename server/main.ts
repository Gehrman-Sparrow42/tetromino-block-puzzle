import { startOnlineServer } from "./server";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rawPort = process.env.ONLINE_PORT ?? "8172";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("ONLINE_PORT must be from 1 to 65535.");
const production = process.env.NODE_ENV === "production";
if (production && process.env.ONLINE_LAN === "1")
  throw new Error("ONLINE_LAN is for local development only.");
const lan = !production && process.env.ONLINE_LAN === "1";
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
// Resolves identically when invoked from another working directory. The bundled
// entry is dist-online/main.js, with the unified page at ../dist/index.html.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const configuredPath = process.env.ONLINE_APP_PATH;
const appPath = configuredPath
  ? isAbsolute(configuredPath)
    ? configuredPath
    : resolve(projectRoot, configuredPath)
  : fileURLToPath(new URL("../dist/index.html", import.meta.url));
let appHtml: string;
try {
  appHtml = await readFile(appPath, "utf8");
} catch (error) {
  throw new Error(
    `Cannot read unified app at ${appPath}. Run npm run build or set ONLINE_APP_PATH.`,
    { cause: error },
  );
}
const configuredOrigins = process.env.ONLINE_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (production && !configuredOrigins?.length)
  throw new Error(
    "Production requires ONLINE_ORIGINS with exact approved origins.",
  );
for (const origin of configuredOrigins ?? []) {
  // file:// standalone clients have an opaque browser Origin, serialized as null.
  if (origin === "null") continue;
  let valid = false;
  try {
    const url = new URL(origin);
    valid =
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === origin &&
      !url.username &&
      !url.password &&
      !origin.includes("*");
  } catch {
    /* Rejected below. */
  }
  if (!valid)
    throw new Error(
      `Invalid ONLINE_ORIGINS entry: ${origin}. Use exact http(s) origins without paths or wildcards.`,
    );
}
const localOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
const service = await startOnlineServer({
  host: process.env.ONLINE_HOST ?? (lan ? "0.0.0.0" : "127.0.0.1"),
  port,
  appHtml,
  origins: configuredOrigins ?? [
    ...localOrigins,
    "http://127.0.0.1:5178",
    "http://localhost:5178",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
    "null",
    ...(lan ? lanAddresses.map((address) => `http://${address}:${port}`) : []),
  ],
});
console.log(`Afterblock: http://${service.host}:${service.port}/health`);
console.log(`App: http://127.0.0.1:${port}/`);
if (lan)
  for (const address of lanAddresses)
    console.log(`Phone (same Wi-Fi): http://${address}:${port}/`);
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
