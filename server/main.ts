import { startOnlineServer } from "./server";

const rawPort = process.env.ONLINE_PORT ?? "8172";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("ONLINE_PORT must be from 1 to 65535.");
const service = await startOnlineServer({
  host: process.env.ONLINE_HOST ?? "127.0.0.1",
  port,
  ...(process.env.ONLINE_ORIGINS
    ? {
        origins: process.env.ONLINE_ORIGINS.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean),
      }
    : {}),
});
console.log(
  `Afterblock online foundation: http://${service.host}:${service.port}/health`,
);
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
