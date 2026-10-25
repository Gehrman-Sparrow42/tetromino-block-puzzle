import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  ONLINE_VERSION,
  parseClientMessage,
  type ServerMessage,
} from "../src/online/protocol";
import { RoomService } from "./rooms";

export interface ServerOptions {
  host?: string;
  port?: number;
  origins?: string[];
  countdownMs?: number;
  maxRooms?: number;
  maxConnections?: number;
  /** Prebuilt unified app; only the root and /play routes serve this exact HTML. */
  appHtml?: string;
  /** Legacy standalone playtest fixture. Prefer appHtml for deployment. */
  playtestHtml?: string;
}
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5178",
  "http://127.0.0.1:5178",
  "https://localhost",
  "null",
];

export async function startOnlineServer(options: ServerOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8172;
  const rooms = new RoomService(options.countdownMs, options.maxRooms);
  const allowedOrigins = new Set(options.origins ?? DEFAULT_ORIGINS);
  const http = createServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    const path = req.url?.split("?")[0];
    const html = options.appHtml ?? options.playtestHtml;
    if (
      req.method === "GET" &&
      (path === "/" || path === "/play") &&
      html !== undefined
    ) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200).end(html);
      return;
    }
    if (req.method === "GET" && (path === "/" || path === "/health")) {
      res.writeHead(200).end(
        JSON.stringify({
          service: "afterblock-online",
          protocol: ONLINE_VERSION,
          status: "ok",
          mode: "battle",
          rooms: rooms.roomCount,
        }),
      );
    } else res.writeHead(404).end(JSON.stringify({ error: "not_found" }));
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    // Exact origin checks are a browser boundary, not authentication. Native/test
    // clients can omit Origin. Never derive approval from Host or forwarded headers.
    if (
      req.url !== "/ws" ||
      (origin && !allowedOrigins.has(origin)) ||
      sockets.clients.size >= (options.maxConnections ?? 256)
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) =>
      sockets.emit("connection", ws),
    );
  });
  const alive = new Set<WebSocket>();
  // Both peers receive the same publication. Serialize it once; WeakMap entries
  // disappear when that publication is no longer referenced.
  const encoded = new WeakMap<ServerMessage, string>();
  sockets.on("connection", (socket) => {
    alive.add(socket);
    const id = rooms.connect((message) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 256 * 1024) {
        socket.terminate();
        return;
      }
      // Preview updates are replaceable. Do not queue stale boards behind a slow peer.
      if (message.type === "snapshot" && socket.bufferedAmount > 64 * 1024)
        return;
      let payload = encoded.get(message);
      if (payload === undefined) {
        payload = JSON.stringify(message);
        encoded.set(message, payload);
      }
      socket.send(payload);
    });
    let windowStart = Date.now();
    let messages = 0;
    socket.on("message", (data, binary) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        messages = 0;
      }
      if (++messages > 120) {
        socket.close(1008, "Message rate exceeded");
        return;
      }
      let message = null;
      try {
        if (!binary) message = parseClientMessage(JSON.parse(data.toString()));
      } catch {
        /* Rejected below. */
      }
      if (!message) {
        socket.send(
          JSON.stringify({
            v: 1,
            type: "error",
            code: "invalid_message",
            message: "Unsupported protocol version or invalid message.",
          }),
        );
        return;
      }
      rooms.receive(id, message, now);
    });
    socket.on("pong", () => alive.add(socket));
    socket.on("error", () => socket.terminate());
    socket.on("close", () => {
      alive.delete(socket);
      rooms.disconnect(id);
    });
  });
  const tick = setInterval(() => rooms.tick(), 50);
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, 30_000);
  tick.unref();
  heartbeat.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(port, host, () => {
        http.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    clearInterval(tick);
    clearInterval(heartbeat);
    sockets.close();
    throw error;
  }
  const address = http.address() as AddressInfo;
  return {
    port: address.port,
    host,
    close: async () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      for (const socket of sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
