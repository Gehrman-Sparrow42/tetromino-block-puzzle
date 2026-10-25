import { describe, expect, it } from "vitest";
import { RoomService } from "./rooms";
import {
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "../src/online/protocol";

function setup(maxRooms = 100) {
  const service = new RoomService(100, maxRooms);
  const peer = () => {
    const messages: ServerMessage[] = [];
    const id = service.connect((message) =>
      messages.push(structuredClone(message)),
    );
    return {
      id,
      messages,
      send: (message: ClientMessage, now = 0) =>
        service.receive(id, message, now),
    };
  };
  const a = peer(),
    b = peer();
  a.send({ v: 1, type: "create", name: "Alice" });
  const room = a.messages.find((m) => m.type === "room")!;
  if (room.type !== "room") throw new Error("Missing room");
  b.send({ v: 1, type: "join", code: room.room.code, name: "Bob" });
  const start = () => {
    a.send({ v: 1, type: "ready", ready: true });
    b.send({ v: 1, type: "ready", ready: true });
    service.tick(100);
  };
  return { service, a, b, peer, code: room.room.code, start };
}

describe("private authoritative Survival rooms", () => {
  it("requires both ready, starts after countdown, and gives both the same piece sequence", () => {
    const { service, a, b, start } = setup();
    a.send({ v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } });
    expect(a.messages.at(-1)).toMatchObject({
      type: "error",
      code: "not_playing",
    });
    a.send({ v: 1, type: "ready", ready: true });
    service.tick(99);
    expect(a.messages.some((m) => m.type === "snapshot")).toBe(false);
    start();
    const frame = a.messages.at(-1)!;
    expect(frame.type).toBe("snapshot");
    if (frame.type !== "snapshot") return;
    expect(frame.room.phase).toBe("playing");
    expect(frame.boards[a.id].active).toEqual(frame.boards[b.id].active);
    expect(frame.boards[a.id].next).toBe(frame.boards[b.id].next);
    expect(frame.boards[a.id]).not.toHaveProperty("seed");
    expect(frame.boards[a.id]).not.toHaveProperty("bag");
  });

  it("applies inputs only to the sender and rejects duplicate sequences", () => {
    const { service, a, b, start } = setup();
    start();
    a.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      101,
    );
    a.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      102,
    );
    expect(a.messages.at(-1)).toMatchObject({
      type: "error",
      code: "stale_input",
    });
    service.tick(150);
    const frame = a.messages.at(-1)!;
    if (frame.type !== "snapshot") throw new Error("Missing snapshot");
    expect(frame.boards[a.id].piecesPlaced).toBe(1);
    expect(frame.boards[a.id].ack).toBe(1);
    expect(frame.boards[b.id].piecesPlaced).toBe(0);
  });

  it("keeps clocks authoritative, ends on topout and does not keep ticking a finished match", () => {
    const { service, a, b, start } = setup();
    start();
    for (let seq = 1; seq <= 30; seq++)
      a.send({ v: 1, type: "input", seq, command: { type: "HARD_DROP" } }, 101);
    const result = b.messages.find(
      (m) => m.type === "snapshot" && m.room.phase === "finished",
    );
    expect(result).toMatchObject({
      room: { winnerId: b.id, resultReason: "topout" },
    });
    const count = b.messages.length;
    service.tick(200);
    expect(b.messages).toHaveLength(count);
  });

  it("forfeits on disconnect during countdown or play, but lets a waiting lobby replace a player", () => {
    const { service, a, b, code, peer } = setup();
    a.send({ v: 1, type: "ready", ready: true });
    service.disconnect(b.id);
    const c = peer();
    c.send({ v: 1, type: "join", code, name: "Carol" });
    expect(a.messages.at(-1)).toMatchObject({
      room: { phase: "waiting", players: [{ ready: false }, { ready: false }] },
    });
    a.send({ v: 1, type: "ready", ready: true });
    c.send({ v: 1, type: "ready", ready: true });
    service.disconnect(c.id);
    expect(a.messages.at(-1)).toMatchObject({
      room: { phase: "finished", winnerId: a.id, resultReason: "disconnect" },
    });
    service.disconnect(a.id);
    expect(service.roomCount).toBe(0);
  });

  it("bounds room capacity and occupancy and expires abandoned lobbies", () => {
    const { service, peer, code } = setup(1);
    const third = peer();
    third.send({ v: 1, type: "join", code, name: "Third" });
    expect(third.messages.at(-1)).toMatchObject({ code: "room_full" });
    third.send({ v: 1, type: "create", name: "Third" });
    expect(third.messages.at(-1)).toMatchObject({ code: "capacity" });
    service.tick(15 * 60_000 + 1);
    expect(service.roomCount).toBe(0);
    third.send({ v: 1, type: "create", name: "Third" }, 15 * 60_000 + 2);
    expect(third.messages.at(-1)).toMatchObject({
      type: "room",
      room: { phase: "waiting" },
    });
  });

  it("lets only the waiting host set visible balance and clears both ready states", () => {
    const { a, b, start } = setup();
    const balance = {
      gravityPercent: 50,
      startingLevel: 3,
      speedMode: "fixed" as const,
    };
    a.send({ v: 1, type: "ready", ready: true });
    b.send({ v: 1, type: "balance", playerId: a.id, balance });
    expect(b.messages.at(-1)).toMatchObject({ code: "not_host" });
    a.send({ v: 1, type: "balance", playerId: b.id, balance });
    for (const peer of [a, b])
      expect(peer.messages.at(-1)).toMatchObject({
        type: "room",
        room: {
          hostId: a.id,
          players: [
            {
              ready: false,
              balance: {
                gravityPercent: 100,
                startingLevel: 1,
                speedMode: "progressive",
              },
            },
            { ready: false, balance },
          ],
        },
      });
    a.send({ v: 1, type: "balance", playerId: "outsider", balance });
    expect(a.messages.at(-1)).toMatchObject({ code: "invalid_balance" });
    a.send({ v: 1, type: "ready", ready: true });
    b.send({ v: 1, type: "ready", ready: true });
    a.send({
      v: 1,
      type: "balance",
      playerId: b.id,
      balance: { ...balance, gravityPercent: 200 },
    });
    expect(a.messages.at(-1)).toMatchObject({ code: "not_waiting" });
    start();
    a.send({ v: 1, type: "balance", playerId: b.id, balance });
    expect(a.messages.at(-1)).toMatchObject({ code: "not_waiting" });
  });

  it("applies per-player gravity without changing clocks or seeded pieces", () => {
    const { service, a, b, start } = setup();
    a.send({
      v: 1,
      type: "balance",
      playerId: a.id,
      balance: {
        gravityPercent: 50,
        startingLevel: 1,
        speedMode: "progressive",
      },
    });
    a.send({
      v: 1,
      type: "balance",
      playerId: b.id,
      balance: { gravityPercent: 200, startingLevel: 1, speedMode: "fixed" },
    });
    start();
    const first = a.messages.at(-1)!;
    if (first.type !== "snapshot") throw Error("Missing snapshot");
    const initialY = first.boards[a.id].active!.y;
    for (let i = 1; i < 20; i++) service.tick(100 + i * 50);
    const frame = a.messages.at(-1)!;
    if (frame.type !== "snapshot") throw Error("Missing snapshot");
    expect(frame.boards[a.id].active!.y).toBe(initialY);
    expect(frame.boards[b.id].active!.y).toBe(initialY + 2);
    expect(frame.boards[a.id].elapsedMs).toBe(1000);
    expect(frame.boards[b.id].elapsedMs).toBe(1000);
    expect(frame.boards[a.id].next).toBe(frame.boards[b.id].next);
    service.disconnect(a.id, 1100);
    b.send({ v: 1, type: "leave" }, 1100);
    b.send({ v: 1, type: "create", name: "Bob" }, 1101);
    expect(b.messages.at(-1)).toMatchObject({
      room: {
        hostId: b.id,
        players: [
          {
            balance: {
              gravityPercent: 100,
              startingLevel: 1,
              speedMode: "progressive",
            },
          },
        ],
      },
    });
  });
});

it("rejects invalid balance payloads and strips untrusted extra configuration", () => {
  const balance = { gravityPercent: 75, startingLevel: 4, speedMode: "fixed" };
  for (const bad of [
    { ...balance, gravityPercent: 0 },
    { ...balance, gravityPercent: 110 },
    { ...balance, gravityPercent: "50" },
    { ...balance, startingLevel: 16 },
    { ...balance, startingLevel: 1.5 },
    { ...balance, speedMode: "cheat" },
    null,
  ])
    expect(
      parseClientMessage({
        v: 1,
        type: "balance",
        playerId: "p",
        balance: bad,
      }),
    ).toBeNull();
  expect(
    parseClientMessage({
      v: 1,
      type: "balance",
      playerId: "p",
      balance: { ...balance, score: 999 },
    }),
  ).toEqual({ v: 1, type: "balance", playerId: "p", balance });
});

it("rejects forged clocks, pause, malformed commands and incompatible protocol versions", () => {
  for (const value of [
    { v: 2, type: "create", name: "Alice" },
    { v: 1, type: "create", name: "" },
    { v: 1, type: "join", name: "Bob", code: "../bad" },
    { v: 1, type: "input", seq: -1, command: { type: "HARD_DROP" } },
    { v: 1, type: "input", seq: 1, command: { type: "TICK", dtMs: 99999 } },
    { v: 1, type: "input", seq: 1, command: { type: "PAUSE" } },
    {
      v: 1,
      type: "input",
      seq: 1,
      command: { type: "SOFT_DROP", active: "true" },
    },
  ])
    expect(parseClientMessage(value)).toBeNull();
  expect(
    parseClientMessage({ v: 1, type: "create", name: "  Alice  " }),
  ).toEqual({ v: 1, type: "create", name: "Alice" });
});
