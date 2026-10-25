import { afterEach, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { ServerMessage } from "../src/online/protocol";
import { startOnlineServer } from "./server";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function connect(port: number) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    origin: "http://127.0.0.1:5178",
  });
  const messages: ServerMessage[] = [];
  socket.on("message", (data) =>
    messages.push(JSON.parse(data.toString()) as ServerMessage),
  );
  cleanup.push(async () => {
    socket.terminate();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const wait = async (predicate: (message: ServerMessage) => boolean) => {
    let found: ServerMessage | undefined;
    await expect
      .poll(
        () => {
          found = messages.find(predicate);
          return !!found;
        },
        { timeout: 3000 },
      )
      .toBe(true);
    return found!;
  };
  const welcome = await wait((m) => m.type === "welcome");
  if (welcome.type !== "welcome") throw new Error("Missing welcome");
  return {
    socket,
    wait,
    id: welcome.playerId,
    send: (message: unknown) => socket.send(JSON.stringify(message)),
  };
}

it("serves healthy HTTP and runs two real WebSocket players with validated inputs and disconnect result", async () => {
  const server = await startOnlineServer({ port: 0, countdownMs: 20 });
  cleanup.push(server.close);
  expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(
    200,
  );
  expect((await fetch(`http://127.0.0.1:${server.port}/`)).status).toBe(200);
  const a = await connect(server.port),
    b = await connect(server.port);
  a.send({ v: 1, type: "create", name: "Alice" });
  const created = await a.wait((m) => m.type === "room");
  if (created.type !== "room") throw new Error("Missing room");
  b.send({ v: 1, type: "join", code: created.room.code, name: "Bob" });
  await a.wait((m) => m.type === "room" && m.room.players.length === 2);
  for (const p of [a, b]) p.send({ v: 1, type: "ready", ready: true });
  await b.wait((m) => m.type === "snapshot" && m.room.phase === "playing");
  a.send({ v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } });
  const frame = await b.wait(
    (m) => m.type === "snapshot" && m.boards[a.id]?.piecesPlaced === 1,
  );
  if (frame.type !== "snapshot") throw new Error("Missing frame");
  expect(frame.boards[b.id].piecesPlaced).toBe(0);
  a.send({
    v: 1,
    type: "input",
    seq: 2,
    command: { type: "TICK", dtMs: 9999 },
  });
  await a.wait((m) => m.type === "error" && m.code === "invalid_message");
  a.socket.close();
  await b.wait(
    (m) =>
      m.type === "snapshot" &&
      m.room.winnerId === b.id &&
      m.room.resultReason === "disconnect",
  );
});

it("rejects unapproved browser origins and oversized frames without killing the service", async () => {
  const server = await startOnlineServer({ port: 0 });
  cleanup.push(server.close);
  const denied = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
    origin: "https://unapproved.example",
  });
  cleanup.push(async () => {
    denied.terminate();
  });
  await new Promise<void>((resolve) => denied.once("error", () => resolve()));
  expect(denied.readyState).not.toBe(WebSocket.OPEN);
  const peer = await connect(server.port);
  const closed = new Promise<number>((resolve) =>
    peer.socket.once("close", (code) => resolve(code)),
  );
  peer.socket.send("x".repeat(4097));
  expect(await closed).toBe(1009);
  expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(
    200,
  );
});

it("serves only the bundled playtest page and allows an explicitly configured LAN origin", async () => {
  const origin = "http://192.168.1.118:8172";
  const server = await startOnlineServer({
    port: 0,
    origins: [origin],
    playtestHtml: "<!doctype html><title>Afterblock</title>",
  });
  cleanup.push(server.close);
  const page = await fetch(`http://127.0.0.1:${server.port}/play?room=ABC234`);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toContain("text/html");
  expect(await page.text()).toContain("Afterblock");
  expect(
    (await fetch(`http://127.0.0.1:${server.port}/src/online/client.ts`))
      .status,
  ).toBe(404);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { origin });
  cleanup.push(async () => {
    socket.terminate();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
});

it("serves the unified app at root and play while keeping health JSON and paths bounded", async () => {
  const html = "<!doctype html><title>Afterblock unified app</title>";
  const server = await startOnlineServer({
    port: 0,
    appHtml: html,
    playtestHtml: "obsolete",
  });
  cleanup.push(server.close);
  const base = `http://127.0.0.1:${server.port}`;
  for (const path of ["/", "/?room=ABC234", "/play", "/play?room=ABC234"]) {
    const page = await fetch(base + path);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).toBe(html);
  }
  const health = await fetch(base + "/health");
  expect(health.headers.get("content-type")).toContain("application/json");
  expect(await health.json()).toMatchObject({
    service: "afterblock-online",
    status: "ok",
    rooms: 0,
  });
  for (const path of [
    "/dist/index.html",
    "/server/main.ts",
    "/.env",
    "/missing",
    "/ws",
  ]) {
    expect((await fetch(base + path)).status).toBe(404);
  }
  expect((await fetch(base + "/", { method: "POST" })).status).toBe(404);
});

it("allows opaque standalone origins only through the exact configured entry", async () => {
  const server = await startOnlineServer({ port: 0, origins: ["null"] });
  cleanup.push(server.close);
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
    origin: "null",
  });
  cleanup.push(async () => {
    socket.terminate();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const denied = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
    origin: "https://localhost",
  });
  cleanup.push(async () => {
    denied.terminate();
  });
  await new Promise<void>((resolve) => denied.once("error", () => resolve()));
  expect(denied.readyState).not.toBe(WebSocket.OPEN);
});
