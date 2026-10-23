import type {
  ActivePiece,
  GameCommand,
  GameMode,
  GameStateSnapshot,
  MarathonOptions,
  RotationState,
  TetrominoType,
} from "../contracts/game-contract";
import { COLS, HIDDEN_ROWS, ROWS, SHAPES, WALL_KICKS } from "./constants";

const TYPES: TetrominoType[] = ["I", "J", "L", "O", "S", "T", "Z"];
const LOCK_MS = 500;
const MAX_RESETS = 15;
const ULTRA_DURATION_MS = 120000;

function validMarathonOptions(value: unknown): value is MarathonOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const options = value as MarathonOptions;
  return (
    Number.isInteger(options.startingLevel) &&
    options.startingLevel >= 1 &&
    options.startingLevel <= 15 &&
    (options.speedMode === "progressive" || options.speedMode === "fixed")
  );
}

function levelForLines(state: GameStateSnapshot): number {
  const options = state.mode === "marathon" ? state.marathonOptions : undefined;
  const startingLevel = options?.startingLevel ?? 1;
  return options?.speedMode === "fixed"
    ? startingLevel
    : Math.min(30, startingLevel + Math.floor(state.lines / 10));
}

function random(state: GameStateSnapshot): number {
  // xorshift32: all generator state is serialized, so resumes are deterministic.
  let n = state.prngState;
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  state.prngState = n >>> 0;
  return state.prngState / 4294967296;
}

function next(state: GameStateSnapshot): TetrominoType {
  if (!state.bag.length) {
    state.bag = [...TYPES];
    for (let i = 6; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
    }
  }
  return state.bag.pop()!;
}

function cells(piece: ActivePiece): [number, number][] {
  const result: [number, number][] = [];
  SHAPES[piece.type][piece.rotation].forEach((row, y) =>
    row.forEach((value, x) => {
      if (value) result.push([piece.x + x, piece.y + y]);
    }),
  );
  return result;
}

function fits(state: GameStateSnapshot, piece: ActivePiece): boolean {
  return cells(piece).every(
    ([x, y]) => x >= 0 && x < COLS && y >= 0 && y < ROWS && !state.board[y][x],
  );
}

function grounded(state: GameStateSnapshot): boolean {
  return (
    !!state.active && !fits(state, { ...state.active, y: state.active.y + 1 })
  );
}

function ghost(state: GameStateSnapshot): void {
  if (!state.active) return;
  const probe = { ...state.active };
  while (fits(state, { ...probe, y: probe.y + 1 })) probe.y++;
  state.active.ghostY = probe.y;
}

function spawn(state: GameStateSnapshot, type?: TetrominoType): void {
  const selected = type ?? state.nextQueue.shift()!;
  if (!type) state.nextQueue.push(next(state));
  state.active = {
    type: selected,
    rotation: 0,
    x: selected === "O" ? 4 : 3,
    y: 2,
    ghostY: 2,
    lockTimerMs: 0,
    lockResetsUsed: 0,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  };
  state.gravityTimerMs = 0;
  if (!fits(state, state.active)) {
    state.blockedPiece = selected;
    state.active = null;
    state.status = "gameover";
    state.softDropActive = false;
  } else {
    delete state.blockedPiece;
    ghost(state);
  }
}

/** Probe on a validated copy so failed offers and rewards never alter the run. */
function rewardedContinueCandidate(
  state: GameStateSnapshot,
): GameStateSnapshot | null {
  if (
    state.mode !== "marathon" ||
    state.status !== "gameover" ||
    (state.continuesUsed ?? 0) !== 0
  )
    return null;
  const candidate = validateSnapshot(state);
  if (!candidate) return null;
  candidate.board.splice(ROWS - 2, 2);
  candidate.board.unshift(
    Array<TetrominoType | null>(COLS).fill(null),
    Array<TetrominoType | null>(COLS).fill(null),
  );
  candidate.status = "paused";
  spawn(candidate, candidate.blockedPiece);
  if (candidate.status !== "paused" || !candidate.active) return null;
  candidate.continuesUsed = 1;
  candidate.gravityTimerMs = 0;
  candidate.softDropActive = false;
  candidate.lastEvent = null;
  return candidate;
}

export function canRewardedContinue(state: GameStateSnapshot): boolean {
  return rewardedContinueCandidate(state) !== null;
}

/** Apply only after a rewarded-ad provider confirms completion. Resume is manual. */
export function applyRewardedContinue(state: GameStateSnapshot): boolean {
  const candidate = rewardedContinueCandidate(state);
  if (!candidate) return false;
  Object.assign(state, candidate);
  delete state.blockedPiece;
  return true;
}

export function createInitialState(
  mode: GameMode,
  seed: number,
  options?: MarathonOptions,
): GameStateSnapshot {
  if (
    mode === "marathon" &&
    options !== undefined &&
    !validMarathonOptions(options)
  )
    throw new RangeError(
      "Marathon requires a starting level from 1 to 15 and a fixed or progressive speed mode.",
    );
  const normalized = seed >>> 0 || 0x6d2b79f5;
  const state: GameStateSnapshot = {
    version: 2,
    mode,
    ...(mode === "marathon"
      ? {
          marathonOptions: {
            ...(options ?? {
              startingLevel: 1,
              speedMode: "progressive" as const,
            }),
          },
        }
      : {}),
    status: "playing",
    seed: normalized,
    prngState: normalized,
    board: Array.from({ length: ROWS }, () =>
      Array<TetrominoType | null>(COLS).fill(null),
    ),
    active: null,
    hold: null,
    holdUsedThisTurn: false,
    bag: [],
    nextQueue: [],
    score: 0,
    lines: 0,
    level: mode === "marathon" ? (options?.startingLevel ?? 1) : 1,
    combo: -1,
    backToBack: false,
    elapsedMs: 0,
    gravityTimerMs: 0,
    softDropActive: false,
    piecesPlaced: 0,
    lastEvent: null,
  };
  for (let i = 0; i < 5; i++) state.nextQueue.push(next(state));
  spawn(state);
  return state;
}

function spin(
  state: GameStateSnapshot,
  piece: ActivePiece,
): "none" | "mini" | "full" {
  if (piece.type !== "T" || !piece.lastActionWasRotation) return "none";
  const occupied = (x: number, y: number) =>
    x < 0 || x >= COLS || y < 0 || y >= ROWS || !!state.board[y][x];
  const corners = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ].map(([x, y]) => occupied(piece.x + x, piece.y + y));
  if (corners.filter(Boolean).length < 3) return "none";
  const fronts = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ][piece.rotation];
  return (corners[fronts[0]] && corners[fronts[1]]) || piece.lastKickIndex === 4
    ? "full"
    : "mini";
}

function lock(state: GameStateSnapshot): void {
  const piece = state.active!;
  const tSpin = spin(state, piece);
  const occupiedCells = cells(piece);
  occupiedCells.forEach(([x, y]) => {
    state.board[y][x] = piece.type;
  });
  state.piecesPlaced++;
  const rows = state.board.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
  const count = rows.length;
  state.board = state.board.filter((_, y) => !rows.includes(y));
  while (state.board.length < ROWS)
    state.board.unshift(Array<TetrominoType | null>(COLS).fill(null));
  const perfectClear =
    count > 0 && state.board.every((row) => row.every((cell) => cell === null));
  const difficult = count > 0 && (count === 4 || tSpin !== "none");
  const b2b = difficult && state.backToBack;
  state.combo = count ? state.combo + 1 : -1;
  const base =
    tSpin === "full"
      ? [400, 800, 1200, 1600][count]
      : tSpin === "mini"
        ? [100, 200, 400][count]
        : [0, 100, 300, 500, 800][count];
  let points = (base ?? 0) * (b2b ? 1.5 : 1);
  if (count) points += Math.max(0, state.combo) * 50;
  if (perfectClear) points += [0, 800, 1200, 1800, b2b ? 3200 : 2000][count];
  points *= state.level;
  state.score += points;
  state.lines += count;
  state.level = levelForLines(state);
  if (count) state.backToBack = difficult;
  state.lastEvent = {
    linesCleared: count,
    rows,
    tSpin,
    backToBack: b2b,
    combo: state.combo,
    pointsAwarded: points,
    perfectClear,
  };
  state.holdUsedThisTurn = false;
  if (state.mode === "sprint40" && state.lines >= 40) {
    state.status = "victory";
    state.active = null;
    state.softDropActive = false;
  } else if (occupiedCells.every(([, y]) => y < HIDDEN_ROWS)) {
    state.status = "gameover";
    state.active = null;
    state.softDropActive = false;
  } else spawn(state);
}

function resetLock(state: GameStateSnapshot, wasGrounded: boolean): void {
  const piece = state.active!;
  if (wasGrounded && piece.lockResetsUsed < MAX_RESETS) {
    piece.lockTimerMs = 0;
    piece.lockResetsUsed++;
  }
}

function rotate(state: GameStateSnapshot, direction: number): void {
  const piece = state.active!;
  if (piece.type === "O") return;
  const rotation = ((piece.rotation + direction + 4) % 4) as RotationState;
  const table = WALL_KICKS[piece.type === "I" ? "I" : "NORMAL"] as Record<
    string,
    number[][]
  >;
  const wasGrounded = grounded(state);
  for (const [index, [dx, dy]] of table[
    `${piece.rotation}->${rotation}`
  ].entries()) {
    const candidate = { ...piece, rotation, x: piece.x + dx, y: piece.y + dy };
    if (fits(state, candidate)) {
      Object.assign(piece, candidate, {
        lastActionWasRotation: true,
        lastKickIndex: index,
      });
      resetLock(state, wasGrounded);
      ghost(state);
      return;
    }
  }
}

function gravityInterval(state: GameStateSnapshot): number {
  const normal = Math.max(
    16,
    1000 *
      Math.pow(
        Math.max(0.05, 0.8 - (state.level - 1) * 0.007),
        state.level - 1,
      ),
  );
  return state.softDropActive ? Math.min(normal, 35) : normal;
}

function tick(state: GameStateSnapshot, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  // Event-sized steps make gravity/lock results independent of render-frame boundaries.
  let remaining = Math.min(dt, 60000);
  const isUltra = state.mode === "ultra120";
  const reachesTimeLimit =
    isUltra && remaining >= ULTRA_DURATION_MS - state.elapsedMs;
  if (isUltra)
    remaining = Math.min(remaining, ULTRA_DURATION_MS - state.elapsedMs);
  while (remaining > 0 && state.status === "playing") {
    const interval = gravityInterval(state);
    const onGround = grounded(state);
    const toGravity = Math.max(0, interval - state.gravityTimerMs);
    const toLock = onGround
      ? Math.max(0, LOCK_MS - state.active!.lockTimerMs)
      : Infinity;
    const step = Math.min(remaining, toGravity, toLock);
    state.elapsedMs += step;
    // Fractional gravity events can round the sum a fraction above the deadline,
    // including on a step that also locks out and leaves the loop immediately.
    if (isUltra) state.elapsedMs = Math.min(ULTRA_DURATION_MS, state.elapsedMs);
    state.gravityTimerMs += step;
    if (onGround) state.active!.lockTimerMs += step;
    remaining -= step;
    if (onGround && state.active!.lockTimerMs >= LOCK_MS) {
      lock(state);
    } else if (state.gravityTimerMs >= interval) {
      state.gravityTimerMs = 0;
      if (!onGround) {
        state.active!.y++;
        if (state.softDropActive) state.score++;
        // Gravity preserves rotation eligibility for T-spin recognition.
        ghost(state);
      }
    }
  }
  // Use the consumed time budget to recognize the deadline instead of comparing
  // repeated floating-point additions, which can round just below 120000.
  const boundaryRoundingTolerance = Number.EPSILON * ULTRA_DURATION_MS * 4;
  if (reachesTimeLimit && remaining <= boundaryRoundingTolerance) {
    state.elapsedMs = ULTRA_DURATION_MS;
  }
  if (
    isUltra &&
    state.elapsedMs >= ULTRA_DURATION_MS &&
    state.status === "playing"
  ) {
    state.status = "victory";
    state.active = null;
    state.softDropActive = false;
  }
}

export function applyCommand(
  state: GameStateSnapshot,
  command: GameCommand,
): void {
  if (command.type === "PAUSE" && state.status === "playing") {
    state.status = "paused";
    state.softDropActive = false;
    return;
  }
  if (command.type === "RESUME" && state.status === "paused") {
    state.status = "playing";
    state.softDropActive = false;
    return;
  }
  if (state.status !== "playing" || !state.active) return;
  switch (command.type) {
    case "MOVE_LEFT":
    case "MOVE_RIGHT": {
      const wasGrounded = grounded(state);
      const candidate = {
        ...state.active,
        x: state.active.x + (command.type === "MOVE_LEFT" ? -1 : 1),
      };
      if (fits(state, candidate)) {
        Object.assign(state.active, candidate, {
          lastActionWasRotation: false,
        });
        resetLock(state, wasGrounded);
        ghost(state);
      }
      break;
    }
    case "ROTATE_CW":
      rotate(state, 1);
      break;
    case "ROTATE_CCW":
      rotate(state, -1);
      break;
    case "SOFT_DROP":
      state.softDropActive = command.active;
      break;
    case "TICK":
      tick(state, command.dtMs);
      break;
    case "HARD_DROP": {
      const distance = state.active.ghostY - state.active.y;
      state.active.y = state.active.ghostY;
      state.score += distance * 2;
      lock(state);
      break;
    }
    case "HOLD": {
      if (state.holdUsedThisTurn) break;
      const current = state.active.type;
      const held = state.hold;
      state.hold = current;
      spawn(state, held ?? undefined);
      state.holdUsedThisTurn = true;
      break;
    }
  }
}

/** Only complete, internally consistent version-2 saves may enter the engine. */
export function validateSnapshot(value: unknown): GameStateSnapshot | null {
  try {
    if (!value || typeof value !== "object") return null;
    const s = value as GameStateSnapshot;
    const number = (v: unknown, min: number, max: number, integer = true) =>
      typeof v === "number" &&
      Number.isFinite(v) &&
      v >= min &&
      v <= max &&
      (!integer || Number.isInteger(v));
    const type = (v: unknown): v is TetrominoType =>
      TYPES.includes(v as TetrominoType);
    if (
      s.version !== 2 ||
      !["marathon", "sprint40", "ultra120"].includes(s.mode) ||
      !["playing", "paused", "gameover", "victory"].includes(s.status)
    )
      return null;
    if (!number(s.seed, 1, 0xffffffff) || !number(s.prngState, 1, 0xffffffff))
      return null;
    if (
      ("continuesUsed" in s && !number(s.continuesUsed, 0, 1)) ||
      ("rewardRunId" in s &&
        (typeof s.rewardRunId !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(s.rewardRunId))) ||
      ("blockedPiece" in s &&
        (s.status !== "gameover" || !type(s.blockedPiece))) ||
      (s.mode !== "marathon" && (s.continuesUsed ?? 0) !== 0)
    )
      return null;
    if (
      "marathonOptions" in s &&
      (s.mode !== "marathon" || !validMarathonOptions(s.marathonOptions))
    )
      return null;
    // Array.from also checks holes in sparse arrays; Array.every alone skips them.
    if (
      !Array.isArray(s.board) ||
      s.board.length !== ROWS ||
      !Array.from(s.board).every(
        (row) =>
          Array.isArray(row) &&
          row.length === COLS &&
          Array.from(row).every((v) => v === null || type(v)),
      )
    )
      return null;
    if (
      !Array.isArray(s.nextQueue) ||
      s.nextQueue.length !== 5 ||
      !Array.from(s.nextQueue).every(type)
    )
      return null;
    if (
      !Array.isArray(s.bag) ||
      s.bag.length > 7 ||
      !Array.from(s.bag).every(type) ||
      new Set(s.bag).size !== s.bag.length
    )
      return null;
    if (s.hold !== null && !type(s.hold)) return null;
    if (
      typeof s.holdUsedThisTurn !== "boolean" ||
      typeof s.backToBack !== "boolean" ||
      typeof s.softDropActive !== "boolean"
    )
      return null;
    if (
      !number(s.score, 0, 1e12) ||
      !number(s.lines, 0, 1e8) ||
      !number(s.piecesPlaced, 0, 1e9) ||
      !number(s.level, 1, 30) ||
      s.level !== levelForLines(s) ||
      !number(s.combo, -1, 1e8)
    )
      return null;
    if (
      !number(s.elapsedMs, 0, 1e12, false) ||
      !number(s.gravityTimerMs, 0, 1000, false)
    )
      return null;
    if (s.mode === "ultra120" && s.elapsedMs > 120000) return null;
    const terminal = s.status === "gameover" || s.status === "victory";
    if (
      terminal !== (s.active === null) ||
      (s.status !== "playing" && s.softDropActive)
    )
      return null;
    if (
      s.status === "victory" &&
      (s.mode === "marathon" ||
        (s.mode === "sprint40" && s.lines < 40) ||
        (s.mode === "ultra120" && s.elapsedMs !== 120000))
    )
      return null;
    if (
      !terminal &&
      ((s.mode === "sprint40" && s.lines >= 40) ||
        (s.mode === "ultra120" && s.elapsedMs >= 120000))
    )
      return null;
    if (s.active === null) {
      if (s.status === "playing" || s.status === "paused") return null;
    } else {
      const a = s.active;
      if (
        !a ||
        typeof a !== "object" ||
        !type(a.type) ||
        !number(a.rotation, 0, 3) ||
        !number(a.x, -3, 9) ||
        // Matrix origins may be above the board when their leading rows are
        // empty (I rotation 2 permits -2); fits still checks every occupied cell.
        !number(a.y, -2, 23) ||
        !number(a.ghostY, a.y, 23) ||
        !number(a.lockTimerMs, 0, 500, false) ||
        !number(a.lockResetsUsed, 0, 15) ||
        typeof a.lastActionWasRotation !== "boolean" ||
        !number(a.lastKickIndex, 0, 4) ||
        !fits(s, a)
      )
        return null;
      const probe = { ...a };
      while (fits(s, { ...probe, y: probe.y + 1 })) probe.y++;
      if (a.ghostY !== probe.y) return null;
    }
    if (s.lastEvent !== null) {
      const e = s.lastEvent;
      if (
        !e ||
        typeof e !== "object" ||
        !number(e.linesCleared, 0, 4) ||
        !Array.isArray(e.rows) ||
        e.rows.length !== e.linesCleared ||
        new Set(e.rows).size !== e.rows.length ||
        !Array.from(e.rows).every((y) => number(y, 0, ROWS - 1)) ||
        !["none", "mini", "full"].includes(e.tSpin) ||
        typeof e.backToBack !== "boolean" ||
        typeof e.perfectClear !== "boolean" ||
        !number(e.combo, -1, 1e8) ||
        !number(e.pointsAwarded, 0, 1e12)
      )
        return null;
    }
    return structuredClone(s);
  } catch {
    return null;
  }
}
