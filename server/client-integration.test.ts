import { expect, it } from "vitest";
import { OnlineClient } from "../src/online/client";
import type { ServerMessage } from "../src/online/protocol";
import { startOnlineServer } from "./server";

it("connects two native clients through create/join/ready/input/leave over actual sockets", async () => {
  const server = await startOnlineServer({ port: 0, countdownMs: 20 });
  const a = new OnlineClient(`ws://127.0.0.1:${server.port}/ws`);
  const b = new OnlineClient(`ws://127.0.0.1:${server.port}/ws`);
  const messages: ServerMessage[] = [];
  const off = b.subscribe((message) => messages.push(message));
  try {
    await Promise.all([a.connect(), b.connect()]);
    let code = "";
    a.subscribe((message) => {
      if (message.type === "room") code = message.room.code;
    });
    a.createRoom("Alice");
    await expect.poll(() => code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    b.joinRoom(code, "Bob");
    await expect
      .poll(() =>
        messages.some((m) => m.type === "room" && m.room.players.length === 2),
      )
      .toBe(true);
    a.setReady(true);
    b.setReady(true);
    await expect
      .poll(() =>
        messages.some(
          (m) => m.type === "snapshot" && m.room.phase === "playing",
        ),
      )
      .toBe(true);
    a.sendInput({ type: "HARD_DROP" });
    await expect
      .poll(() =>
        messages.some(
          (m) =>
            m.type === "snapshot" && m.boards[a.playerId!]?.piecesPlaced === 1,
        ),
      )
      .toBe(true);
    b.leaveRoom();
    await expect.poll(() => messages.some((m) => m.type === "left")).toBe(true);
    expect(b.playerId).toBeTruthy(); // Leaving a room keeps the connection available.
    b.createRoom("Bob");
    await expect
      .poll(() =>
        messages.some((m) => m.type === "room" && m.room.code !== code),
      )
      .toBe(true);
  } finally {
    off();
    a.close();
    b.close();
    await server.close();
  }
});
