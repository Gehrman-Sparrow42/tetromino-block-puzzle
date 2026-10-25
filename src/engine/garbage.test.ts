import { describe, expect, it } from "vitest";
import type { TetrominoType } from "../contracts/game-contract";
import {
  applyCommand,
  applyGarbage,
  createInitialState,
  validateSnapshot,
} from "./engine";

describe("battle garbage", () => {
  it("raises settled cells and appends one-hole rows in supplied order", () => {
    const s = createInitialState("marathon", 123);
    s.board[20][0] = "T";
    expect(applyGarbage(s, [2, 8])).toBe(true);
    expect(s.board).toHaveLength(24);
    expect(s.board[18][0]).toBe("T");
    expect(s.board[20].every((cell) => cell === null)).toBe(true);
    expect(s.board[22]).toEqual(
      Array.from({ length: 10 }, (_, x) => (x === 2 ? null : "G")),
    );
    expect(s.board[23]).toEqual(
      Array.from({ length: 10 }, (_, x) => (x === 8 ? null : "G")),
    );
    expect(validateSnapshot(s)).toEqual(s);
  });

  it("changes neither score, piece randomization, clocks nor clear history", () => {
    const s = createInitialState("marathon", 123);
    applyCommand(s, { type: "HARD_DROP" });
    const before = structuredClone(s);
    expect(applyGarbage(s, [0, 9])).toBe(true);
    for (const key of [
      "score",
      "lines",
      "level",
      "combo",
      "backToBack",
      "piecesPlaced",
      "lastEvent",
      "seed",
      "prngState",
      "bag",
      "nextQueue",
      "hold",
      "elapsedMs",
      "gravityTimerMs",
    ] as const) {
      expect(s[key]).toEqual(before[key]);
    }
    expect(s.active!.ghostY).toBeLessThan(before.active!.ghostY);
    expect(validateSnapshot(s)).not.toBeNull();
  });

  it("clears actual garbage rows through ordinary line-clear gameplay", () => {
    const s = createInitialState("marathon", 123);
    expect(applyGarbage(s, [5, 5, 5, 5])).toBe(true);
    Object.assign(s.active!, {
      type: "I",
      rotation: 1,
      x: 3,
      y: 2,
      ghostY: 20,
    });
    expect(validateSnapshot(s)).not.toBeNull();
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.lines).toBe(4);
    expect(s.lastEvent).toMatchObject({ linesCleared: 4, perfectClear: true });
    expect(s.score).toBeGreaterThan(0);
    expect(s.board.every((row) => row.every((cell) => cell === null))).toBe(
      true,
    );
  });

  it("accepts a 20-row packet and refreshes the spawn ghost", () => {
    const s = createInitialState("marathon", 123);
    expect(applyGarbage(s, Array(20).fill(0))).toBe(true);
    expect(s.status).toBe("playing");
    expect(s.active!.ghostY).toBe(2);
    expect(validateSnapshot(s)).not.toBeNull();
  });

  it("tops out when any occupied settled cell is shifted above the board", () => {
    const s = createInitialState("marathon", 123);
    s.board[0][0] = "G";
    s.softDropActive = true;
    expect(applyGarbage(s, [9])).toBe(true);
    expect(s.status).toBe("gameover");
    expect(s.active).toBeNull();
    expect(s.softDropActive).toBe(false);
    expect(s.board[23][9]).toBeNull();
    expect(validateSnapshot(s)).not.toBeNull();
  });

  it("tops out if the raised stack overlaps the active spawn", () => {
    const s = createInitialState("marathon", 123);
    Object.assign(s.active!, { type: "O", rotation: 0, x: 4, y: 2 });
    s.board[5][4] = "J";
    expect(applyGarbage(s, [0, 0, 0])).toBe(true);
    expect(s.board[2][4]).toBe("J");
    expect(s.status).toBe("gameover");
    expect(s.active).toBeNull();
    expect(validateSnapshot(s)).not.toBeNull();
  });

  it.each([
    [],
    [-1],
    [10],
    [1.5],
    [NaN],
    [Infinity],
    [0, 2, -1],
    Array(21).fill(0),
    Array(2),
    ["2"],
    null,
  ])("rejects invalid holes atomically: %j", (holes) => {
    const s = createInitialState("marathon", 123);
    const before = structuredClone(s);
    expect(applyGarbage(s, holes as readonly number[])).toBe(false);
    expect(s).toEqual(before);
  });

  it.each(["paused", "gameover", "victory"] as const)(
    "does not alter a %s run",
    (status) => {
      const s = createInitialState("marathon", 123);
      s.status = status;
      const before = structuredClone(s);
      expect(applyGarbage(s, [0])).toBe(false);
      expect(s).toEqual(before);
    },
  );

  it("allows G in the board while excluding it from playable piece fields", () => {
    const s = createInitialState("marathon", 123);
    applyGarbage(s, [0]);
    expect(validateSnapshot(s)).not.toBeNull();
    for (const field of ["bag", "nextQueue"] as const) {
      const corrupt = structuredClone(s);
      corrupt[field][0] = "G" as TetrominoType;
      expect(validateSnapshot(corrupt)).toBeNull();
    }
    const corrupt = structuredClone(s);
    corrupt.active!.type = "G" as TetrominoType;
    expect(validateSnapshot(corrupt)).toBeNull();
  });
});
