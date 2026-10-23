import { isThemeId, isStarterTheme } from "../../src/contracts/theme-catalog";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { RewardStore } from "./store";
import {
  googleKeyResolver,
  verifyAdmobCallback,
  type KeyResolver,
} from "./ssv";

export interface RewardsServerOptions {
  port?: number;
  host?: string;
  databasePath: string;
  adUnits: string[];
  origins?: string[];
  resolveKey?: KeyResolver;
}

export async function startRewardsServer(options: RewardsServerOptions) {
  const store = new RewardStore(options.databasePath);
  const adUnits = new Set(options.adUnits);
  const resolveKey = options.resolveKey ?? googleKeyResolver();
  const origins = new Set(
    options.origins ?? [
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5178",
      "http://localhost:5173",
      "http://localhost:5178",
      "https://localhost",
    ],
  );
  const rates = new Map<string, { at: number; count: number }>();
  const server = createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      if (!res.headersSent) res.writeHead(status).end(JSON.stringify(body));
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) {
        reply(403, { error: "Origin not allowed" });
        return;
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        reply(204, null);
        return;
      }
      const now = Date.now(),
        ip = req.socket.remoteAddress ?? "unknown";
      for (const [key, rate] of rates)
        if (now - rate.at >= 60_000) rates.delete(key);
      const rate = rates.get(ip) ?? { at: now, count: 0 };
      if (!rates.has(ip) && rates.size >= 1024) {
        reply(503, { error: "Busy" });
        return;
      }
      rates.set(ip, rate);
      if (++rate.count > 120) {
        reply(429, { error: "Too many requests" });
        return;
      }
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && ["/", "/health"].includes(url.pathname)) {
        reply(200, {
          service: "afterblock-rewards",
          status: "ok",
          configured: adUnits.size > 0,
        });
        return;
      }
      if (!adUnits.size) {
        reply(503, {
          error: "Rewarded ads are disabled until ad units are configured",
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/rewards/admob/ssv") {
        try {
          store.verify(
            await verifyAdmobCallback(url.search.slice(1), resolveKey, adUnits),
          );
          reply(200, { accepted: true });
        } catch {
          reply(403, { error: "Reward callback rejected" });
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/rewards/attempts") {
        if (req.headers["content-type"]?.split(";")[0] !== "application/json") {
          reply(415, { error: "JSON required" });
          return;
        }
        let raw = "";
        for await (const chunk of req) {
          raw += chunk.toString();
          if (Buffer.byteLength(raw) > 4096) {
            reply(413, { error: "Request too large" });
            return;
          }
        }
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          reply(400, { error: "Invalid JSON" });
          return;
        }
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const target = value as Record<string, unknown>;
          if (target.placement === "theme") {
            if (
              typeof target.profileId !== "string" ||
              !/^[A-Za-z0-9_-]{1,128}$/.test(target.profileId) ||
              !isThemeId(target.themeId) ||
              isStarterTheme(target.themeId)
            ) {
              reply(400, { error: "Invalid theme target" });
              return;
            }
            try {
              reply(201, store.createTheme(target.profileId, target.themeId));
            } catch {
              reply(409, {
                error: "Theme already rewarded or attempt limit reached",
              });
            }
            return;
          }
          if (
            target.placement !== undefined &&
            target.placement !== "continue"
          ) {
            reply(400, { error: "Invalid placement" });
            return;
          }
        }
        const runId =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as { runId?: unknown }).runId
            : undefined;
        if (
          typeof runId !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(runId)
        ) {
          reply(400, { error: "Invalid run ID" });
          return;
        }
        try {
          reply(201, store.create(runId));
        } catch {
          reply(409, {
            error: "Run already rewarded or attempt limit reached",
          });
        }
        return;
      }
      const match =
        /^\/v1\/rewards\/attempts\/([A-Za-z0-9_-]{32})(\/claim)?$/.exec(
          url.pathname,
        );
      if (
        match &&
        ((!match[2] && req.method === "GET") ||
          (match[2] && req.method === "POST"))
      ) {
        const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
          req.headers.authorization ?? "",
        )?.[1];
        if (!token) {
          reply(401, { error: "Reward token required" });
          return;
        }
        try {
          const value = store.read(match[1], token, !!match[2]);
          reply(value ? 200 : 404, value ?? { error: "Unknown attempt" });
        } catch {
          reply(409, { error: "Reward not verified" });
        }
        return;
      }
      reply(404, { error: "Not found" });
    } catch {
      reply(500, { error: "Reward service error" });
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 8173, options.host ?? "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    store.close();
    throw error;
  }
  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      store.close();
    },
  };
}
