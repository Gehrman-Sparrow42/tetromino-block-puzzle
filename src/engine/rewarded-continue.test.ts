import { describe, expect, it } from "vitest";
import {
  applyCommand,
  applyRewardedContinue,
  canRewardedContinue,
  createInitialState,
  validateSnapshot,
} from "./engine";

function blockOut() {
  const state = createInitialState("marathon", 37);
  // Holding attempts to spawn the next piece into an obstructed spawn area.
  state.board[2].fill("J");
  state.board[3].fill("J");
  applyCommand(state, { type: "HOLD" });
  expect(state.status).toBe("gameover");
  expect(state.blockedPiece).toBeDefined();
  return state;
}

describe("rewarded Marathon continue", () => {
  it("recovers a hidden-row lock-out by spawning the next queued piece once", () => {
    const state = createInitialState("marathon", 52);
    state.active = {
      type: "O",
      rotation: 0,
      x: 0,
      y: 0,
      ghostY: 0,
      lockTimerMs: 0,
      lockResetsUsed: 0,
      lastActionWasRotation: false,
      lastKickIndex: 0,
    };
    state.board[2][0] = "J";
    state.board[2][1] = "J";
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.status).toBe("gameover");
    expect(state.blockedPiece).toBeUndefined();
    const nextPiece = state.nextQueue[0];
    const remainingQueue = state.nextQueue.slice(1);
    expect(applyRewardedContinue(state)).toBe(true);
    expect(state.active?.type).toBe(nextPiece);
    expect(state.nextQueue.slice(0, 4)).toEqual(remainingQueue);
    expect(state.piecesPlaced).toBe(1);
    expect(validateSnapshot(state)).not.toBeNull();
  });
  it("revives a real block-out with exactly two rows removed and retries the consumed piece", () => {
    const state = blockOut();
    state.board[22][0] = "L";
    state.board[23][1] = "Z";
    state.rewardRunId = "a-test-run";
    const before = structuredClone(state);
    expect(canRewardedContinue(state)).toBe(true);
    expect(state).toEqual(before);
    expect(applyRewardedContinue(state)).toBe(true);
    expect(state).toMatchObject({
      status: "paused",
      continuesUsed: 1,
      score: before.score,
      lines: before.lines,
      level: before.level,
      elapsedMs: before.elapsedMs,
      piecesPlaced: before.piecesPlaced,
      gravityTimerMs: 0,
      softDropActive: false,
      rewardRunId: "a-test-run",
    });
    expect(state.active).toMatchObject({
      type: before.blockedPiece,
      lockTimerMs: 0,
      lockResetsUsed: 0,
    });
    expect(state.board.slice(2)).toEqual(before.board.slice(0, 22));
    expect(
      state.board
        .slice(0, 2)
        .flat()
        .every((cell) => cell === null),
    ).toBe(true);
    expect(state.nextQueue).toEqual(before.nextQueue);
    expect(state.bag).toEqual(before.bag);
    expect(state.prngState).toBe(before.prngState);
    expect(validateSnapshot(state)).not.toBeNull();
    const paused = structuredClone(state);
    applyCommand(state, { type: "TICK", dtMs: 1000 });
    expect(state).toEqual(paused);
    applyCommand(state, { type: "RESUME" });
    applyCommand(state, { type: "TICK", dtMs: 100 });
    expect(state.elapsedMs).toBe(before.elapsedMs + 100);
    state.status = "gameover";
    state.active = null;
    const secondDeath = structuredClone(state);
    expect(applyRewardedContinue(state)).toBe(false);
    expect(state).toEqual(secondDeath);
  });

  it("rejects unrecoverable top rows without mutation or clearing hidden cells", () => {
    const state = blockOut();
    state.board[0].fill("Z");
    state.board[1].fill("Z");
    const before = structuredClone(state);
    expect(canRewardedContinue(state)).toBe(false);
    expect(applyRewardedContinue(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it("rejects non-Marathon, live, paused and victorious runs", () => {
    for (const mode of ["marathon", "sprint40", "ultra120"] as const) {
      for (const status of [
        "playing",
        "paused",
        "victory",
        "gameover",
      ] as const) {
        if (mode === "marathon" && status === "gameover") continue;
        const state = createInitialState(mode, 12);
        state.status = status;
        if (status === "gameover" || status === "victory") state.active = null;
        const before = structuredClone(state);
        expect(applyRewardedContinue(state)).toBe(false);
        expect(state).toEqual(before);
      }
    }
  });

  it("validates reward metadata while retaining legacy snapshots", () => {
    const state = createInitialState("marathon", 1);
    expect(validateSnapshot(state)).not.toBeNull();
    for (const continuesUsed of [-1, 2, 0.5, null, "1"]) {
      expect(validateSnapshot({ ...state, continuesUsed })).toBeNull();
    }
    for (const rewardRunId of ["", " ", "a".repeat(129), 5, null]) {
      expect(validateSnapshot({ ...state, rewardRunId })).toBeNull();
    }
    expect(
      validateSnapshot({
        ...state,
        continuesUsed: 1,
        rewardRunId: "f6933e3a-687d-443b-bc57-46dd40ee0377",
      }),
    ).not.toBeNull();
    expect(validateSnapshot({ ...state, blockedPiece: "O" })).toBeNull();
    expect(
      validateSnapshot({ ...blockOut(), blockedPiece: "invalid" }),
    ).toBeNull();
  });
});
