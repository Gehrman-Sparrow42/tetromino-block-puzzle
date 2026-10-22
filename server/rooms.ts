import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { applyCommand, createInitialState } from "../src/engine/engine";
import type { GameStateSnapshot } from "../src/contracts/game-contract";
import type {
  BoardView,
  ClientMessage,
  RoomView,
  ServerMessage,
} from "../src/online/protocol";

interface Player {
  id: string;
  name: string;
  ready: boolean;
  seq: number;
  state: GameStateSnapshot | null;
  send: (message: ServerMessage) => void;
  room: Room | null;
}
interface Room {
  code: string;
  players: Player[];
  phase: RoomView["phase"];
  startAt: number | null;
  winnerId: string | null;
  resultReason: RoomView["resultReason"];
  seed: number;
  frame: number;
  createdAt: number;
  matchEndedAt: number | null;
}
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STEP_MS = 50;
const WAITING_TTL = 15 * 60_000;
const MATCH_TTL = 60 * 60_000;
const RESULT_TTL = 60_000;

/** One process owns room state and the unchanged offline engine. No client ticks. */
export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly players = new Map<string, Player>();
  private readonly countdownMs: number;
  private readonly maxRooms: number;
  constructor(countdownMs = 3000, maxRooms = 100) {
    this.countdownMs = countdownMs;
    this.maxRooms = maxRooms;
  }

  connect(send: Player["send"]): string {
    const id = randomUUID();
    this.players.set(id, {
      id,
      name: "",
      ready: false,
      seq: 0,
      state: null,
      send,
      room: null,
    });
    send({ v: 1, type: "welcome", playerId: id });
    return id;
  }
  private view(room: Room): RoomView {
    return {
      code: room.code,
      mode: "survival",
      phase: room.phase,
      players: room.players.map(({ id, name, ready }) => ({ id, name, ready })),
      startAt: room.startAt,
      winnerId: room.winnerId,
      resultReason: room.resultReason,
    };
  }
  private publish(room: Room, snapshot = false): void {
    const view = this.view(room);
    const boards: Record<string, BoardView> = {};
    if (snapshot)
      for (const p of room.players) {
        const s = p.state;
        if (!s) continue;
        boards[p.id] = {
          board: s.board,
          active: s.active
            ? {
                type: s.active.type,
                rotation: s.active.rotation,
                x: s.active.x,
                y: s.active.y,
              }
            : null,
          hold: s.hold,
          next: s.nextQueue[0]!,
          status: s.status,
          score: s.score,
          lines: s.lines,
          level: s.level,
          elapsedMs: s.elapsedMs,
          piecesPlaced: s.piecesPlaced,
          ack: p.seq,
        };
      }
    const message: ServerMessage = snapshot
      ? { v: 1, type: "snapshot", frame: room.frame, room: view, boards }
      : { v: 1, type: "room", room: view };
    for (const p of room.players) p.send(message);
  }
  private error(p: Player, code: string, message: string): void {
    p.send({ v: 1, type: "error", code, message });
  }

  receive(id: string, message: ClientMessage, now = Date.now()): void {
    const p = this.players.get(id);
    if (!p) return;
    if (message.type === "leave") {
      this.leave(p, now);
      p.send({ v: 1, type: "left" });
      return;
    }
    if (message.type === "create" || message.type === "join") {
      if (p.room)
        return this.error(
          p,
          "already_joined",
          "Leave your current room first.",
        );
      let room: Room;
      if (message.type === "create") {
        if (this.rooms.size >= this.maxRooms)
          return this.error(
            p,
            "capacity",
            "The server is full. Try again later.",
          );
        let code: string;
        do {
          code = Array.from(
            randomBytes(6),
            (byte) => ALPHABET[byte % ALPHABET.length],
          ).join("");
        } while (this.rooms.has(code));
        room = {
          code,
          players: [],
          phase: "waiting",
          startAt: null,
          winnerId: null,
          resultReason: null,
          seed: randomInt(1, 0x100000000),
          frame: 0,
          createdAt: now,
          matchEndedAt: null,
        };
        this.rooms.set(code, room);
      } else {
        const found = this.rooms.get(message.code);
        if (!found)
          return this.error(p, "not_found", "That room is unavailable.");
        if (found.phase !== "waiting" || found.players.length >= 2)
          return this.error(
            p,
            "room_full",
            "That room is full or already started.",
          );
        room = found;
      }
      p.name = message.name;
      p.room = room;
      p.ready = false;
      p.seq = 0;
      p.state = null;
      room.players.push(p);
      // A changed lobby always requires fresh consent from both players.
      for (const member of room.players) member.ready = false;
      this.publish(room);
      return;
    }
    const room = p.room;
    if (!room) return this.error(p, "no_room", "Create or join a room first.");
    if (message.type === "ready") {
      if (room.phase !== "waiting")
        return this.error(p, "not_waiting", "This round has already started.");
      p.ready = message.ready;
      if (
        room.players.length === 2 &&
        room.players.every((member) => member.ready)
      ) {
        room.phase = "countdown";
        room.startAt = now + this.countdownMs;
      }
      this.publish(room);
      return;
    }
    if (room.phase !== "playing")
      return this.error(p, "not_playing", "Wait for the round to start.");
    if (message.seq <= p.seq)
      return this.error(p, "stale_input", "Input sequence must increase.");
    p.seq = message.seq;
    if (p.state) applyCommand(p.state, message.command);
    this.resolveResult(room, now);
  }
  private finish(
    room: Room,
    winnerId: string | null,
    reason: RoomView["resultReason"],
    now: number,
  ): void {
    room.phase = "finished";
    room.winnerId = winnerId;
    room.resultReason = reason;
    room.matchEndedAt = now;
    for (const p of room.players) if (p.state) p.state.softDropActive = false;
    this.publish(room, true);
  }
  private resolveResult(room: Room, now: number): void {
    if (room.phase !== "playing") return;
    const alive = room.players.filter((p) => p.state?.status === "playing");
    if (alive.length < 2)
      this.finish(
        room,
        alive[0]?.id ?? null,
        alive.length ? "topout" : "draw",
        now,
      );
  }
  /** Fixed server-time steps; an overloaded process slows down rather than trusting client dt. */
  tick(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      if (
        (room.phase === "waiting" && now - room.createdAt > WAITING_TTL) ||
        (room.phase === "finished" && now - room.matchEndedAt! > RESULT_TTL) ||
        now - room.createdAt > MATCH_TTL
      ) {
        for (const p of room.players) {
          p.room = null;
          p.state = null;
          p.send({ v: 1, type: "left" });
        }
        this.rooms.delete(room.code);
        continue;
      }
      if (room.phase === "countdown" && now >= room.startAt!) {
        for (const p of room.players)
          p.state = createInitialState("marathon", room.seed);
        room.phase = "playing";
      }
      if (room.phase !== "playing") continue;
      for (const p of room.players)
        if (p.state) applyCommand(p.state, { type: "TICK", dtMs: STEP_MS });
      room.frame++;
      this.resolveResult(room, now);
      if (room.phase === "playing") this.publish(room, true);
    }
  }
  private leave(p: Player, now: number): void {
    const room = p.room;
    if (!room) return;
    if (room.phase === "playing" || room.phase === "countdown")
      this.finish(
        room,
        room.players.find((other) => other !== p)?.id ?? null,
        "disconnect",
        now,
      );
    room.players = room.players.filter((other) => other !== p);
    p.room = null;
    p.state = null;
    p.ready = false;
    if (!room.players.length) this.rooms.delete(room.code);
    else {
      for (const member of room.players) member.ready = false;
      this.publish(room);
    }
  }
  disconnect(id: string, now = Date.now()): void {
    const p = this.players.get(id);
    if (p) this.leave(p, now);
    this.players.delete(id);
  }
  get roomCount(): number {
    return this.rooms.size;
  }
}
