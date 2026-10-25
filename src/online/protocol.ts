import type {
  ActivePiece,
  RunStatus,
  TetrominoType,
  BoardCell,
} from "../contracts/game-contract";

export const ONLINE_VERSION = 1;
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
export const ATTACK_LEVELS = [-3, -2, -1, 0, 1, 2, 3] as const;
export const ATTACK_PERCENTAGES = [50, 70, 85, 100, 120, 140, 170] as const;
export function attackPercent(level: number): number {
  return ATTACK_PERCENTAGES[level + 3] ?? 100;
}
export function attackLabel(level: number): string {
  return level === 0
    ? "Normal"
    : `${level < 0 ? "Nerf" : "Buff"} ${Math.abs(level)}`;
}
export interface PlayerBalance {
  attackLevel: number;
}
export const DEFAULT_BALANCE: Readonly<PlayerBalance> = {
  attackLevel: 0,
};
export function validBalance(value: unknown): value is PlayerBalance {
  if (!object(value)) return false;
  return ATTACK_LEVELS.some((n) => n === value.attackLevel);
}
export type OnlineInput =
  | {
      type:
        | "MOVE_LEFT"
        | "MOVE_RIGHT"
        | "ROTATE_CW"
        | "ROTATE_CCW"
        | "HARD_DROP"
        | "HOLD";
    }
  | { type: "SOFT_DROP"; active: boolean };
export type ClientMessage =
  | { v: 1; type: "create"; name: string }
  | { v: 1; type: "join"; code: string; name: string }
  | { v: 1; type: "ready"; ready: boolean }
  | { v: 1; type: "balance"; playerId: string; balance: PlayerBalance }
  | { v: 1; type: "input"; seq: number; command: OnlineInput }
  | { v: 1; type: "leave" };
export interface RoomView {
  code: string;
  mode: "survival" | "battle";
  phase: "waiting" | "countdown" | "playing" | "finished";
  /** Optional only for compatibility with older development servers. */
  hostId?: string;
  players: {
    id: string;
    name: string;
    ready: boolean;
    balance?: PlayerBalance;
  }[];
  startAt: number | null;
  winnerId: string | null;
  resultReason: "topout" | "disconnect" | "draw" | null;
}
/** Only renderable data: no PRNG, hidden bag or complete opponent queue. */
export interface BoardView {
  board: BoardCell[][];
  incoming?: number;
  sent?: number;
  active: Pick<ActivePiece, "type" | "rotation" | "x" | "y"> | null;
  hold: TetrominoType | null;
  next: TetrominoType;
  status: RunStatus;
  score: number;
  lines: number;
  level: number;
  elapsedMs: number;
  piecesPlaced: number;
  ack: number;
}
export type ServerMessage =
  | { v: 1; type: "welcome"; playerId: string }
  | { v: 1; type: "room"; room: RoomView }
  | {
      v: 1;
      type: "snapshot";
      frame: number;
      room: RoomView;
      boards: Record<string, BoardView>;
    }
  | { v: 1; type: "left" }
  | { v: 1; type: "error"; code: string; message: string };

const actionTypes = new Set([
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "ROTATE_CW",
  "ROTATE_CCW",
  "HARD_DROP",
  "HOLD",
]);
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 24 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}
/** Parse an untrusted wire message without accepting client clocks or snapshots. */
export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!object(value) || value.v !== ONLINE_VERSION) return null;
  switch (value.type) {
    case "create":
      return validName(value.name)
        ? { v: 1, type: "create", name: value.name.trim() }
        : null;
    case "join":
      return validName(value.name) &&
        typeof value.code === "string" &&
        ROOM_CODE.test(value.code)
        ? { v: 1, type: "join", code: value.code, name: value.name.trim() }
        : null;
    case "ready":
      return typeof value.ready === "boolean"
        ? { v: 1, type: "ready", ready: value.ready }
        : null;
    case "balance":
      return typeof value.playerId === "string" &&
        value.playerId.length > 0 &&
        value.playerId.length <= 64 &&
        validBalance(value.balance)
        ? {
            v: 1,
            type: "balance",
            playerId: value.playerId,
            balance: {
              attackLevel: value.balance.attackLevel,
            },
          }
        : null;
    case "leave":
      return { v: 1, type: "leave" };
    case "input": {
      const c = value.command;
      if (
        !Number.isSafeInteger(value.seq) ||
        (value.seq as number) < 1 ||
        !object(c)
      )
        return null;
      if (c.type === "SOFT_DROP" && typeof c.active === "boolean")
        return {
          v: 1,
          type: "input",
          seq: value.seq as number,
          command: { type: "SOFT_DROP", active: c.active },
        };
      if (typeof c.type === "string" && actionTypes.has(c.type))
        return {
          v: 1,
          type: "input",
          seq: value.seq as number,
          command: { type: c.type } as OnlineInput,
        };
      return null;
    }
    default:
      return null;
  }
}
