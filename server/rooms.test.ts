import { describe, expect, it } from "vitest";
import { RoomService } from "./rooms";
import type { GameStateSnapshot } from "../src/contracts/game-contract";
import { attackPercent } from "../src/online/protocol";
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

// Test-only access to the authoritative state; clients have no fixture/input API.
function playerState(service: RoomService, id: string): GameStateSnapshot {
  return (
    service as unknown as { players: Map<string, { state: GameStateSnapshot }> }
  ).players.get(id)!.state;
}
function prepareTetris(state: GameStateSnapshot): void {
  state.board = Array.from({ length: 24 }, () => Array(10).fill(null));
  for (let y = 20; y < 24; y++)
    state.board[y] = Array.from({ length: 10 }, (_, x) =>
      x === 5 ? null : "J",
    );
  state.board[19][0] = "J"; // Do not award a perfect-clear bonus.
  state.active = {
    type: "I",
    rotation: 1,
    x: 3,
    y: 4,
    ghostY: 20,
    lockTimerMs: 0,
    lockResetsUsed: 0,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  };
  state.combo = -1;
  state.backToBack = false;
}

describe("authoritative Battle attacks", () => {
  for (const level of [-3, -2, -1, 0, 1, 2, 3])
    it(`applies attack tier ${level} to a real Tetris`, () => {
      const { service, a, b, start } = setup();
      a.send({
        v: 1,
        type: "balance",
        playerId: a.id,
        balance: { attackLevel: level },
      });
      start();
      prepareTetris(playerState(service, a.id));
      a.send(
        { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
        101,
      );
      service.tick(150);
      const view = b.messages.at(-1)!;
      if (view.type !== "snapshot") throw Error("Missing snapshot");
      const attack = Math.floor((4 * attackPercent(level)) / 100);
      expect(view.boards[b.id].incoming).toBe(attack);
      expect(view.boards[a.id].sent).toBe(attack);
      expect(view.boards[a.id].lines).toBe(4);
      expect(view.boards[a.id].level).toBe(view.boards[b.id].level);
      expect(view.boards[a.id].elapsedMs).toBe(view.boards[b.id].elapsedMs);
    });

  it("delays incoming rows until a mature piece boundary and inserts actual garbage", () => {
    const { service, a, b, start } = setup();
    start();
    prepareTetris(playerState(service, a.id));
    a.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      101,
    );
    b.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      200,
    );
    expect(
      playerState(service, b.id)
        .board.flat()
        .filter((x) => x === "G"),
    ).toHaveLength(0);
    service.tick(850);
    b.send(
      { v: 1, type: "input", seq: 2, command: { type: "HARD_DROP" } },
      851,
    );
    const state = playerState(service, b.id);
    expect(state.board.flat().filter((x) => x === "G")).toHaveLength(36);
    expect(
      state.board
        .slice(-4)
        .every((row) => row.filter((x) => x === null).length === 1),
    ).toBe(true);
    service.tick(900);
    expect(b.messages.at(-1)).toMatchObject({
      boards: { [b.id]: { incoming: 0 } },
    });
  });

  it("cancels pending garbage with an actual clear before sending leftovers", () => {
    const { service, a, b, start } = setup();
    start();
    prepareTetris(playerState(service, a.id));
    a.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      101,
    );
    prepareTetris(playerState(service, b.id));
    b.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      200,
    );
    service.tick(250);
    expect(a.messages.at(-1)).toMatchObject({
      boards: {
        [a.id]: { incoming: 0, sent: 4 },
        [b.id]: { incoming: 0, sent: 0 },
      },
    });
  });

  it("caps pending rows and lets garbage overflow finish a match", () => {
    const { service, a, b, start } = setup();
    start();
    for (let seq = 1; seq <= 12; seq++) {
      prepareTetris(playerState(service, a.id));
      a.send({ v: 1, type: "input", seq, command: { type: "HARD_DROP" } }, 101);
    }
    service.tick(150);
    expect(a.messages.at(-1)).toMatchObject({
      boards: { [b.id]: { incoming: 40 } },
    });
    // A settled block in the outgoing top rows overflows on the next rise.
    playerState(service, b.id).board[0][0] = "J";
    b.send(
      { v: 1, type: "input", seq: 1, command: { type: "HARD_DROP" } },
      851,
    );
    expect(a.messages.at(-1)).toMatchObject({
      room: { phase: "finished", winnerId: a.id, resultReason: "topout" },
    });
  });
});

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
      attackLevel: -2,
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
                attackLevel: 0,
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
      balance: { ...balance, attackLevel: 3 },
    });
    expect(a.messages.at(-1)).toMatchObject({ code: "not_waiting" });
    start();
    a.send({ v: 1, type: "balance", playerId: b.id, balance });
    expect(a.messages.at(-1)).toMatchObject({ code: "not_waiting" });
  });
});
it("rejects invalid attack levels and ignores forged extra configuration", () => {
  for (const attackLevel of [-4, 4, 1.5, "2", null])
    expect(
      parseClientMessage({
        v: 1,
        type: "balance",
        playerId: "p",
        balance: { attackLevel },
      }),
    ).toBeNull();
  expect(
    parseClientMessage({
      v: 1,
      type: "balance",
      playerId: "p",
      balance: { attackLevel: 2, score: 999 },
    }),
  ).toEqual({
    v: 1,
    type: "balance",
    playerId: "p",
    balance: { attackLevel: 2 },
  });
});

it("rejects forged clocks, pause, malformed commands and incompatible protocol versions", () => {
  for (const value of [
    { v: 2, type: "create", name: "Alice" },
    { v: 1, type: "create", name: "" },
    { v: 1, type: "join", name: "Bob", code: "../bad" },
    { v: 1, type: "input", seq: -1, command: { type: "HARD_DROP" } },
    { v: 1, type: "input", seq: 1, command: { type: "TICK", dtMs: 99999 } },
    { v: 1, type: "input", seq: 1, command: { type: "PAUSE" } },
    { v: 1, type: "attack", lines: 999 },
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
