import { describe, expect, it } from "vitest";
import type {
  ActivePiece,
  GameStateSnapshot,
  MarathonOptions,
  RotationState,
  TetrominoType,
} from "../contracts/game-contract";
import { createInitialState, applyCommand, validateSnapshot } from "./engine";
import { SHAPES } from "./constants";

function setPiece(
  s: GameStateSnapshot,
  type: TetrominoType,
  x: number,
  y: number,
  rotation: RotationState = 0,
): ActivePiece {
  const a: ActivePiece = {
    type,
    x,
    y,
    rotation,
    ghostY: y,
    lockTimerMs: 0,
    lockResetsUsed: 0,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  };
  const fits = (candidateY: number) =>
    SHAPES[type][rotation].every((row, dy) =>
      row.every(
        (cell, dx) =>
          !cell ||
          (candidateY + dy < 24 &&
            x + dx >= 0 &&
            x + dx < 10 &&
            !s.board[candidateY + dy][x + dx]),
      ),
    );
  while (fits(a.ghostY + 1)) a.ghostY++;
  s.active = a;
  return a;
}

function fourLine(s: GameStateSnapshot): void {
  s.board = Array.from({ length: 24 }, () => Array(10).fill(null));
  for (let y = 20; y < 24; y++)
    s.board[y] = Array.from({ length: 10 }, (_, x) => (x === 5 ? null : "J"));
  setPiece(s, "I", 3, 20, 1);
}

describe("deterministic generator and movement", () => {
  it("replays the same seed and preserves a complete seven-piece bag", () => {
    const a = createInitialState("marathon", 42);
    const b = createInitialState("marathon", 42);
    const drawn: TetrominoType[] = [];
    for (let i = 0; i < 28; i++) {
      drawn.push(a.active!.type);
      for (const state of [a, b]) {
        applyCommand(state, { type: "HARD_DROP" });
        state.board.forEach((row) => row.fill(null));
        setPiece(state, state.active!.type, state.active!.x, state.active!.y);
      }
      expect(a).toEqual(b);
    }
    for (let i = 0; i < 28; i += 7)
      expect(new Set(drawn.slice(i, i + 7)).size).toBe(7);
    expect(a.nextQueue).toHaveLength(5);
    expect(createInitialState("marathon", 7).nextQueue).not.toEqual(
      createInitialState("marathon", 42).nextQueue,
    );
  });

  it("uses gravity and awards soft and hard drop distance", () => {
    const s = createInitialState("marathon", 1);
    setPiece(s, "O", 4, 2);
    applyCommand(s, { type: "TICK", dtMs: 999 });
    expect(s.active!.y).toBe(2);
    applyCommand(s, { type: "TICK", dtMs: 1 });
    expect(s.active!.y).toBe(3);
    applyCommand(s, { type: "SOFT_DROP", active: true });
    applyCommand(s, { type: "TICK", dtMs: 70 });
    expect(s.active!.y).toBe(5);
    expect(s.score).toBe(2);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.score).toBe(36);
    expect(s.piecesPlaced).toBe(1);
  });

  it("produces identical frame-partitioned gravity and lock results", () => {
    const a = createInitialState("marathon", 123);
    const b = structuredClone(a);
    applyCommand(a, { type: "TICK", dtMs: 30000 });
    for (let i = 0; i < 300; i++) applyCommand(b, { type: "TICK", dtMs: 100 });
    expect(a).toEqual(b);
  });

  it("holds only once per piece and restores a fresh orientation", () => {
    const s = createInitialState("marathon", 4);
    const original = s.active!.type;
    const next = s.nextQueue[0];
    applyCommand(s, { type: "HOLD" });
    expect(s.hold).toBe(original);
    expect(s.active!.type).toBe(next);
    const snapshot = structuredClone(s);
    applyCommand(s, { type: "HOLD" });
    expect(s).toEqual(snapshot);
    applyCommand(s, { type: "HARD_DROP" });
    applyCommand(s, { type: "ROTATE_CW" });
    applyCommand(s, { type: "HOLD" });
    expect(s.active!.type).toBe(original);
    expect(s.active!.rotation).toBe(0);
    expect(s.active!.lockResetsUsed).toBe(0);
  });

  it.each(["ROTATE_CW", "ROTATE_CCW"] as const)(
    "rotates four times back to spawn using %s",
    (type) => {
      const s = createInitialState("marathon", 1);
      setPiece(s, "T", 3, 5);
      for (let i = 0; i < 4; i++) applyCommand(s, { type });
      expect(s.active!.rotation).toBe(0);
      expect(s.active!.x).toBe(3);
      expect(s.active!.y).toBe(5);
    },
  );

  it("uses normal and I SRS wall kicks in both directions", () => {
    for (const type of ["T", "I"] as const) {
      for (const command of ["ROTATE_CCW", "ROTATE_CW"] as const) {
        const s = createInitialState("marathon", 1);
        setPiece(s, type, type === "I" ? -2 : -1, 5, 1);
        applyCommand(s, { type: command });
        expect(s.active!.rotation).toBe(command === "ROTATE_CCW" ? 0 : 2);
        expect(s.active!.x).toBeGreaterThanOrEqual(0);
        expect(s.active!.lastKickIndex).toBeGreaterThan(0);
      }
    }
  });

  it("uses upward floor kicks for both SRS tables", () => {
    for (const type of ["T", "I"] as const) {
      const s = createInitialState("marathon", 1);
      setPiece(s, type, 3, 22);
      applyCommand(s, { type: "ROTATE_CW" });
      expect(s.active!.rotation).toBe(1);
      expect(s.active!.y).toBeLessThan(22);
      expect(validateSnapshot(s)).not.toBeNull();
    }
  });
});

describe("locking and lifecycle", () => {
  it("waits 500ms on ground and caps resets at 15 per piece", () => {
    const s = createInitialState("marathon", 1);
    setPiece(s, "O", 4, 22);
    for (let i = 0; i < 15; i++) {
      applyCommand(s, { type: "TICK", dtMs: 490 });
      applyCommand(s, { type: i % 2 ? "MOVE_RIGHT" : "MOVE_LEFT" });
      expect(s.active!.lockTimerMs).toBe(0);
      expect(s.piecesPlaced).toBe(0);
    }
    applyCommand(s, { type: "TICK", dtMs: 490 });
    applyCommand(s, { type: "MOVE_RIGHT" });
    expect(s.active!.lockResetsUsed).toBe(15);
    expect(s.active!.lockTimerMs).toBe(490);
    applyCommand(s, { type: "TICK", dtMs: 10 });
    expect(s.piecesPlaced).toBe(1);
  });

  it("does not renew the reset allowance when a piece reaches a lower ledge", () => {
    const s = createInitialState("marathon", 1);
    s.board[21][4] = "J";
    const a = setPiece(s, "O", 4, 19);
    a.lockResetsUsed = 15;
    a.lockTimerMs = 400;
    applyCommand(s, { type: "MOVE_RIGHT" });
    applyCommand(s, { type: "MOVE_RIGHT" });
    applyCommand(s, { type: "TICK", dtMs: 3000 });
    expect(s.active!.y).toBe(22);
    expect(s.active!.lockResetsUsed).toBe(15);
    applyCommand(s, { type: "TICK", dtMs: 100 });
    expect(s.piecesPlaced).toBe(1);
  });

  it("pauses elapsed time and clears held soft drop on pause and resume", () => {
    const s = createInitialState("ultra120", 1);
    applyCommand(s, { type: "SOFT_DROP", active: true });
    applyCommand(s, { type: "PAUSE" });
    expect(s.softDropActive).toBe(false);
    const paused = structuredClone(s);
    applyCommand(s, { type: "TICK", dtMs: 1000 });
    applyCommand(s, { type: "HARD_DROP" });
    expect(s).toEqual(paused);
    applyCommand(s, { type: "RESUME" });
    expect(s.status).toBe("playing");
    expect(s.softDropActive).toBe(false);
  });

  it("blocks out when the next spawn overlaps the stack", () => {
    const s = createInitialState("marathon", 1);
    setPiece(s, "O", 0, 22);
    s.board[2].fill("J");
    s.board[3].fill("J");
    // Keep the spawn rows incomplete so they do not clear away.
    s.board[2][0] = null;
    s.board[3][0] = null;
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.status).toBe("gameover");
    expect(s.active).toBeNull();
  });

  it("locks out a piece entirely in the hidden spawn area", () => {
    const s = createInitialState("marathon", 1);
    s.board[4][4] = "J";
    s.board[4][5] = "J";
    setPiece(s, "O", 4, 2);
    applyCommand(s, { type: "TICK", dtMs: 500 });
    expect(s.status).toBe("gameover");
    expect(s.piecesPlaced).toBe(1);
  });

  it("finishes Sprint at 40 lines and keeps Marathon playing", () => {
    for (const mode of ["sprint40", "marathon"] as const) {
      const s = createInitialState(mode, 1);
      s.lines = 36;
      s.level = 4;
      fourLine(s);
      applyCommand(s, { type: "HARD_DROP" });
      expect(s.lines).toBe(40);
      expect(s.level).toBe(5);
      expect(s.status).toBe(mode === "sprint40" ? "victory" : "playing");
    }
  });

  it("finishes Ultra at exactly 120000ms without consuming excess time", () => {
    const s = createInitialState("ultra120", 1);
    s.elapsedMs = 119950;
    applyCommand(s, { type: "TICK", dtMs: 100 });
    expect(s.status).toBe("victory");
    expect(s.elapsedMs).toBe(120000);
    expect(s.active).toBeNull();
  });
});

describe("Marathon speed options", () => {
  it("starts at the selected level using the existing gravity curve", () => {
    const options: MarathonOptions = {
      startingLevel: 5,
      speedMode: "progressive",
    };
    const s = createInitialState("marathon", 1, options);
    options.startingLevel = 1;
    expect(s.level).toBe(5);
    expect(s.marathonOptions?.startingLevel).toBe(5);
    setPiece(s, "O", 4, 2);
    const interval = 1000 * Math.pow(0.8 - 4 * 0.007, 4);
    applyCommand(s, { type: "TICK", dtMs: interval - 1 });
    expect(s.active!.y).toBe(2);
    applyCommand(s, { type: "TICK", dtMs: 1 });
    expect(s.active!.y).toBe(3);
    expect(validateSnapshot(s)).toEqual(s);
  });

  it.each(["progressive", "fixed"] as const)(
    "%s applies its selected speed after crossing ten lines",
    (speedMode) => {
      const s = createInitialState("marathon", 1, {
        startingLevel: 5,
        speedMode,
      });
      s.lines = 8;
      fourLine(s);
      applyCommand(s, { type: "HARD_DROP" });
      expect(s.lines).toBe(12);
      const expectedLevel = speedMode === "fixed" ? 5 : 6;
      expect(s.level).toBe(expectedLevel);
      setPiece(s, "O", 4, 2);
      const interval =
        1000 * Math.pow(0.8 - (expectedLevel - 1) * 0.007, expectedLevel - 1);
      applyCommand(s, { type: "TICK", dtMs: interval - 1 });
      expect(s.active!.y).toBe(2);
      applyCommand(s, { type: "TICK", dtMs: 1 });
      expect(s.active!.y).toBe(3);
      expect(validateSnapshot(s)).toEqual(s);
    },
  );

  it("caps progressive Marathon at level thirty", () => {
    const s = createInitialState("marathon", 1, {
      startingLevel: 15,
      speedMode: "progressive",
    });
    s.lines = 158;
    s.level = 30;
    fourLine(s);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.level).toBe(30);
    expect(validateSnapshot(s)).toEqual(s);
  });

  it("preserves legacy saves and their normal progression", () => {
    const s = createInitialState("marathon", 1);
    delete s.marathonOptions;
    s.lines = 8;
    const restored = validateSnapshot(s)!;
    expect(restored).toEqual(s);
    fourLine(restored);
    applyCommand(restored, { type: "HARD_DROP" });
    expect(restored.level).toBe(2);
    expect(validateSnapshot(restored)).toEqual(restored);
    restored.level = 5;
    expect(validateSnapshot(restored)).toBeNull();
  });

  it.each([
    null,
    {},
    [],
    { startingLevel: 0, speedMode: "fixed" },
    { startingLevel: 16, speedMode: "progressive" },
    { startingLevel: 1.5, speedMode: "fixed" },
    { startingLevel: "5", speedMode: "fixed" },
    { startingLevel: 5, speedMode: "fast" },
    { startingLevel: Infinity, speedMode: "fixed" },
  ])("rejects malformed Marathon options %#", (options) => {
    expect(() =>
      createInitialState("marathon", 1, options as MarathonOptions),
    ).toThrow(RangeError);
    const s = {
      ...createInitialState("marathon", 1),
      marathonOptions: options,
    };
    expect(validateSnapshot(s)).toBeNull();
  });

  it("rejects inconsistent configured levels and explicitly missing configuration", () => {
    for (const speedMode of ["fixed", "progressive"] as const) {
      const s = createInitialState("marathon", 1, {
        startingLevel: 5,
        speedMode,
      });
      s.lines = 10;
      s.level = speedMode === "fixed" ? 6 : 5;
      expect(validateSnapshot(s)).toBeNull();
    }
    expect(
      validateSnapshot({
        ...createInitialState("marathon", 1),
        marathonOptions: undefined,
      }),
    ).toBeNull();
  });

  it.each(["sprint40", "ultra120"] as const)(
    "keeps %s progression unchanged",
    (mode) => {
      const s = createInitialState(mode, 1, {
        startingLevel: 15,
        speedMode: "fixed",
      });
      expect(s.level).toBe(1);
      expect(s.marathonOptions).toBeUndefined();
      s.lines = 8;
      fourLine(s);
      applyCommand(s, { type: "HARD_DROP" });
      expect(s.level).toBe(2);
      expect(validateSnapshot(s)).toEqual(s);
      s.marathonOptions = { startingLevel: 1, speedMode: "progressive" };
      expect(validateSnapshot(s)).toBeNull();
    },
  );
});

describe("scoring", () => {
  it.each([
    [1, 100],
    [2, 300],
    [3, 500],
    [4, 800],
  ])("scores a %i line clear at %i before perfect clear", (count, score) => {
    const s = createInitialState("marathon", 1);
    for (let y = 24 - count; y < 24; y++)
      s.board[y] = Array.from({ length: 10 }, (_, x) => (x === 5 ? null : "J"));
    s.board[10][0] = "J";
    setPiece(s, "I", 3, 20, 1);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.lastEvent!.linesCleared).toBe(count);
    expect(s.lastEvent!.pointsAwarded).toBe(score);
  });

  it("awards four-line perfect clears, consecutive B2B, combos, and breaks the chain on ordinary clears", () => {
    const s = createInitialState("marathon", 1);
    fourLine(s);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.lastEvent).toMatchObject({
      pointsAwarded: 2800,
      perfectClear: true,
      backToBack: false,
      combo: 0,
    });
    fourLine(s);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.lastEvent).toMatchObject({
      pointsAwarded: 4450,
      perfectClear: true,
      backToBack: true,
      combo: 1,
    });
    s.board[23] = Array.from({ length: 10 }, (_, x) =>
      x === 4 || x === 5 ? null : "J",
    );
    setPiece(s, "O", 4, 22);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.backToBack).toBe(false);
    expect(s.lastEvent!.combo).toBe(2);
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.combo).toBe(-1);
  });

  it("recognizes full and mini T-spins using occupied corners and rotation history", () => {
    for (const full of [true, false]) {
      const s = createInitialState("marathon", 1);
      s.board[21][3] = "J";
      s.board[23][3] = "J";
      s.board[23][5] = "J";
      if (full) {
        s.board[21][5] = "J";
        s.board[23][3] = null;
      }
      const a = setPiece(s, "T", 3, 21);
      a.lastActionWasRotation = true;
      applyCommand(s, { type: "HARD_DROP" });
      expect(s.lastEvent!.tSpin).toBe(full ? "full" : "mini");
      expect(s.lastEvent!.pointsAwarded).toBe(full ? 400 : 100);
    }
  });

  it("upgrades a mini on the fifth kick and requires rotation history", () => {
    const s = createInitialState("marathon", 1);
    s.board[21][3] = "J";
    s.board[23][3] = "J";
    s.board[23][5] = "J";
    const a = setPiece(s, "T", 3, 21);
    a.lastActionWasRotation = true;
    a.lastKickIndex = 4;
    applyCommand(s, { type: "HARD_DROP" });
    expect(s.lastEvent!.tSpin).toBe("full");
    const noSpin = createInitialState("marathon", 1);
    noSpin.board[21][3] = "J";
    noSpin.board[23][3] = "J";
    noSpin.board[23][5] = "J";
    setPiece(noSpin, "T", 3, 21);
    applyCommand(noSpin, { type: "HARD_DROP" });
    expect(noSpin.lastEvent!.tSpin).toBe("none");
  });
});

describe("saved state validation", () => {
  it.each([
    ["T", -1, 2],
    ["I", -2, 2],
  ] as const)(
    "accepts a legal %s matrix origin at y=%i",
    (type, y, rotation) => {
      const s = createInitialState("marathon", 1);
      setPiece(s, type, 3, y, rotation);
      expect(validateSnapshot(s)).toEqual(s);
      s.active!.y--;
      expect(validateSnapshot(s)).toBeNull();
    },
  );

  it("can save an actual upward SRS kick above the matrix origin boundary", () => {
    const s = createInitialState("marathon", 1);
    // Block the first three 1->2 kick candidates while leaving [0,-2] open.
    s.board[2][3] = "J";
    s.board[2][6] = "J";
    s.board[3][5] = "J";
    setPiece(s, "T", 3, 1, 1);
    expect(validateSnapshot(s)).not.toBeNull();
    applyCommand(s, { type: "ROTATE_CW" });
    expect(s.active).toMatchObject({ y: -1, rotation: 2, lastKickIndex: 3 });
    expect(validateSnapshot(s)).toEqual(s);
  });

  it.each([false, true])(
    "finishes Ultra exactly across fractional gravity events (soft=%s)",
    (soft) => {
      for (const fraction of [
        0.01337, 0.1, 0.123456789, 0.333333333, 0.999999,
      ]) {
        const s = createInitialState("ultra120", 1);
        s.elapsedMs = 119950 + fraction;
        s.lines = 20;
        s.level = 3;
        s.gravityTimerMs = soft ? 12.987654321 : 610.987654321;
        s.softDropActive = soft;
        applyCommand(s, { type: "TICK", dtMs: 100.123456789 });
        expect(s.status).toBe("victory");
        expect(s.elapsedMs).toBe(120000);
        expect(validateSnapshot(s)).toEqual(s);
      }
    },
  );

  it("keeps simultaneous Ultra lockout and deadline snapshots valid", () => {
    const s = createInitialState("ultra120", 1);
    s.board[4][4] = "J";
    s.board[4][5] = "J";
    const piece = setPiece(s, "O", 4, 2);
    piece.lockTimerMs = 450.25;
    s.elapsedMs = 119950.25;
    s.gravityTimerMs = 15.123;
    s.softDropActive = true;
    applyCommand(s, { type: "TICK", dtMs: 100 });
    // A lockout at the exact deadline retains its gameover result.
    expect(s.status).toBe("gameover");
    expect(s.elapsedMs).toBe(120000);
    expect(s.piecesPlaced).toBe(1);
    expect(validateSnapshot(s)).toEqual(s);
  });

  it("finishes at the deadline when level-nine event additions would round below it", () => {
    const s = createInitialState("ultra120", 1);
    s.lines = 80;
    s.level = 9;
    s.elapsedMs = 119900.0071099289;
    s.gravityTimerMs = 87.777776979;
    applyCommand(s, { type: "TICK", dtMs: 100 });
    expect(s.elapsedMs).toBe(120000);
    expect(s.status).toBe("victory");
    expect(validateSnapshot(s)).toEqual(s);
  });

  it("normalizes fractional simultaneous lockout events to the exact deadline", () => {
    const s = createInitialState("ultra120", 1);
    s.lines = 80;
    s.level = 9;
    s.board[4][4] = "J";
    s.board[4][5] = "J";
    s.elapsedMs = 119900.0071099289;
    setPiece(s, "O", 4, 2).lockTimerMs = s.elapsedMs - 119500;
    s.gravityTimerMs = 87.777776979;
    applyCommand(s, { type: "TICK", dtMs: 100 });
    expect(s.elapsedMs).toBe(120000);
    expect(s.status).toBe("gameover");
    expect(validateSnapshot(s)).toEqual(s);
  });

  it("records an earlier Ultra lockout at its actual time", () => {
    const s = createInitialState("ultra120", 1);
    s.board[4][4] = "J";
    s.board[4][5] = "J";
    setPiece(s, "O", 4, 2).lockTimerMs = 490;
    s.elapsedMs = 119950;
    applyCommand(s, { type: "TICK", dtMs: 100 });
    expect(s.status).toBe("gameover");
    expect(s.elapsedMs).toBe(119960);
    expect(validateSnapshot(s)).toEqual(s);
  });

  it("preserves physically held soft drop through locks, holds, and remaining frame time", () => {
    const s = createInitialState("marathon", 1);
    setPiece(s, "O", 4, 22).lockTimerMs = 490;
    applyCommand(s, { type: "SOFT_DROP", active: true });
    applyCommand(s, { type: "TICK", dtMs: 60 });
    expect(s.piecesPlaced).toBe(1);
    expect(s.softDropActive).toBe(true);
    expect(s.active!.y).toBe(3);
    applyCommand(s, { type: "HOLD" });
    expect(s.softDropActive).toBe(true);
    applyCommand(s, { type: "TICK", dtMs: 35 });
    expect(s.active!.y).toBe(3);
    expect(validateSnapshot(s)).not.toBeNull();
  });

  it("returns a deep independent clone and resumes identical future bags", () => {
    const original = createInitialState("marathon", 99);
    const clone = validateSnapshot(JSON.parse(JSON.stringify(original)))!;
    expect(clone).toEqual(original);
    expect(clone.board).not.toBe(original.board);
    applyCommand(original, { type: "HARD_DROP" });
    applyCommand(clone, { type: "HARD_DROP" });
    expect(clone).toEqual(original);
  });

  it.each([
    (s: GameStateSnapshot) => {
      s.board.pop();
    },
    (s: GameStateSnapshot) => {
      s.board[0].push(null);
    },
    (s: GameStateSnapshot) => {
      s.board[0] = Array(10);
    },
    (s: GameStateSnapshot) => {
      s.board = Array(24);
    },
    (s: GameStateSnapshot) => {
      s.board[0][0] = "X" as TetrominoType;
    },
    (s: GameStateSnapshot) => {
      s.score = Infinity;
    },
    (s: GameStateSnapshot) => {
      s.elapsedMs = NaN;
    },
    (s: GameStateSnapshot) => {
      s.level = 2;
    },
    (s: GameStateSnapshot) => {
      s.prngState = 0;
    },
    (s: GameStateSnapshot) => {
      s.active!.lockResetsUsed = 16;
    },
    (s: GameStateSnapshot) => {
      s.active!.rotation = 7 as RotationState;
    },
    (s: GameStateSnapshot) => {
      s.active!.x = -20;
    },
    (s: GameStateSnapshot) => {
      s.active!.ghostY = 3;
    },
    (s: GameStateSnapshot) => {
      s.active = null;
    },
    (s: GameStateSnapshot) => {
      s.nextQueue.pop();
    },
    (s: GameStateSnapshot) => {
      s.nextQueue = Array(5);
    },
    (s: GameStateSnapshot) => {
      s.status = "victory";
    },
    (s: GameStateSnapshot) => {
      s.status = "paused";
      s.softDropActive = true;
    },
    (s: GameStateSnapshot) => {
      s.bag = ["I", "I"];
    },
    (s: GameStateSnapshot) => {
      setPiece(s, "O", 4, 2);
      s.board[2][4] = "J";
    },
  ])("rejects a corrupted save %#", (mutate) => {
    const s = createInitialState("marathon", 1);
    mutate(s);
    expect(validateSnapshot(s)).toBeNull();
  });

  it("rejects missing fields, invalid types and non-objects without throwing", () => {
    for (const value of [
      null,
      undefined,
      false,
      1,
      {},
      { version: 2 },
      [],
      "save",
    ])
      expect(validateSnapshot(value)).toBeNull();
    const s = createInitialState("marathon", 1);
    s.lastEvent = {
      linesCleared: 1,
      rows: [24],
      tSpin: "none",
      backToBack: false,
      combo: 0,
      pointsAwarded: 100,
      perfectClear: false,
    };
    expect(validateSnapshot(s)).toBeNull();
  });
});
