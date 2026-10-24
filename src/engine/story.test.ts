import { describe, expect, it } from "vitest";
import type { GameStateSnapshot } from "../contracts/game-contract";
import {
  applyCommand,
  canRewardedContinue,
  createInitialState,
  validateSnapshot,
} from "./engine";
import { getStoryLevel, STORY_LEVELS, storySpeedForLines } from "./story";

const interval = (speed: number) =>
  Math.max(
    16,
    1000 * Math.pow(Math.max(0.05, 0.8 - (speed - 1) * 0.007), speed - 1),
  );

function fourLine(state: GameStateSnapshot, y = 20) {
  state.board.forEach((row) => row.fill(null));
  for (let row = y; row < y + 4; row++)
    state.board[row] = Array.from({ length: 10 }, (_, x) =>
      x === 5 ? null : "J",
    );
  state.active = {
    type: "I",
    rotation: 1,
    x: 3,
    y,
    ghostY: y,
    lockTimerMs: 0,
    lockResetsUsed: 0,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  };
}

function atLines(id: number, lines: number) {
  const state = createInitialState("story", 123, { storyLevelId: id });
  state.lines = lines;
  state.level = storySpeedForLines(getStoryLevel(id)!, lines);
  return state;
}

describe("Story campaign and gravity", () => {
  it("defines twelve bounded chapters with increasingly demanding weighted fall rates", () => {
    expect(STORY_LEVELS.map((level) => level.targetLines)).toEqual([
      12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 60,
    ]);
    let previousRate = 0;
    let previousPeak = 0;
    for (const level of STORY_LEVELS) {
      expect(getStoryLevel(level.id)).toBe(level);
      expect(level.phases).toHaveLength(4);
      expect(level.phases[0].fromLine).toBe(0);
      let weightedRate = 0;
      for (const [index, phase] of level.phases.entries()) {
        const end = level.phases[index + 1]?.fromLine ?? level.targetLines;
        expect(Number.isInteger(phase.fromLine)).toBe(true);
        expect(end).toBeGreaterThan(phase.fromLine);
        expect(phase.speed).toBeGreaterThanOrEqual(1);
        expect(phase.speed).toBeLessThanOrEqual(11);
        expect(interval(phase.speed)).toBeGreaterThan(16);
        weightedRate +=
          ((end - phase.fromLine) * 1000) /
          interval(phase.speed) /
          level.targetLines;
        expect(storySpeedForLines(level, phase.fromLine)).toBe(phase.speed);
        if (index > 0)
          expect(storySpeedForLines(level, phase.fromLine - 1)).toBe(
            level.phases[index - 1].speed,
          );
      }
      const peak = Math.max(...level.phases.map((phase) => phase.speed));
      expect(peak).toBeGreaterThanOrEqual(previousPeak);
      expect(level.phases[2].speed).toBeLessThan(level.phases[1].speed);
      expect(level.phases[3].speed).toBe(peak);
      expect(weightedRate).toBeGreaterThan(previousRate);
      previousRate = weightedRate;
      previousPeak = peak;
    }
    expect(getStoryLevel(0)).toBeUndefined();
    expect(getStoryLevel(13)).toBeUndefined();
    expect(getStoryLevel(1.5)).toBeUndefined();
  });

  it("uses each phase's actual gravity interval without changing its line goal", () => {
    for (const level of STORY_LEVELS) {
      for (const phase of level.phases) {
        const state = atLines(level.id, phase.fromLine);
        const y = state.active!.y;
        applyCommand(state, {
          type: "TICK",
          dtMs: interval(phase.speed) - 0.01,
        });
        expect(state.active!.y).toBe(y);
        applyCommand(state, { type: "TICK", dtMs: 0.02 });
        expect(state.active!.y).toBe(y + 1);
        expect(state.lines).toBe(phase.fromLine);
      }
    }
  });

  it("selects the final reached phase when a Tetris crosses multiple boundaries", () => {
    const state = atLines(1, 3);
    fourLine(state);
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.lines).toBe(7);
    // Both the burst at 4 and recovery at 6 were crossed by this clear.
    expect(state.level).toBe(1);
    expect(state.status).toBe("playing");
    expect(validateSnapshot(state)).not.toBeNull();
  });

  it("accelerates, recovers, and accelerates again on real line clears", () => {
    const level = getStoryLevel(6)!;
    for (const phase of level.phases.slice(1)) {
      const state = atLines(level.id, phase.fromLine - 4);
      fourLine(state);
      applyCommand(state, { type: "HARD_DROP" });
      expect(state.lines).toBe(phase.fromLine);
      expect(state.level).toBe(phase.speed);
      expect(validateSnapshot(state)).not.toBeNull();
    }
  });

  it("wins on goal overshoot before hidden-row lock-out or another spawn", () => {
    const state = atLines(1, 11);
    fourLine(state, 0);
    // Ground the vertical I in hidden rows while completing four rows.
    state.board[4][5] = "O";
    const queue = [...state.nextQueue];
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.lines).toBe(15);
    expect(state.status).toBe("victory");
    expect(state.active).toBeNull();
    expect(state.nextQueue).toEqual(queue);
    expect(validateSnapshot(state)).not.toBeNull();
    expect(canRewardedContinue(state)).toBe(false);
  });

  it("resumes deterministically from a validated paused Story snapshot", () => {
    const state = atLines(8, 22);
    applyCommand(state, { type: "TICK", dtMs: 20 });
    applyCommand(state, { type: "PAUSE" });
    const restored = validateSnapshot(JSON.parse(JSON.stringify(state)))!;
    expect(restored).not.toBeNull();
    for (const run of [state, restored]) {
      applyCommand(run, { type: "TICK", dtMs: 5000 });
      applyCommand(run, { type: "RESUME" });
      applyCommand(run, { type: "MOVE_LEFT" });
      applyCommand(run, { type: "TICK", dtMs: 100 });
      applyCommand(run, { type: "HARD_DROP" });
    }
    expect(restored).toEqual(state);
  });

  it("rejects invalid IDs, cross-mode metadata, wrong phase speeds and impossible completion states", () => {
    expect(() => createInitialState("story", 1)).toThrow(RangeError);
    for (const id of [0, 13, 1.5, NaN]) {
      expect(() =>
        createInitialState("story", 1, { storyLevelId: id }),
      ).toThrow(RangeError);
    }
    const state = atLines(1, 6);
    expect(validateSnapshot({ ...state, storyLevelId: undefined })).toBeNull();
    expect(validateSnapshot({ ...state, storyLevelId: "1" })).toBeNull();
    expect(validateSnapshot({ ...state, level: 2 })).toBeNull();
    expect(
      validateSnapshot({
        ...state,
        marathonOptions: { startingLevel: 1, speedMode: "fixed" },
      }),
    ).toBeNull();
    expect(
      validateSnapshot({ ...state, status: "victory", active: null }),
    ).toBeNull();
    const completed = {
      ...atLines(1, 12),
      active: null,
      status: "victory" as const,
    };
    expect(validateSnapshot(completed)).not.toBeNull();
    expect(validateSnapshot({ ...completed, status: "gameover" })).toBeNull();
    expect(
      validateSnapshot({
        ...completed,
        status: "paused",
        active: state.active,
      }),
    ).toBeNull();
    expect(validateSnapshot({ ...completed, lines: 16 })).toBeNull();
    expect(validateSnapshot({ ...state, continuesUsed: 1 })).toBeNull();
    const dead = { ...state, status: "gameover" as const, active: null };
    expect(canRewardedContinue(dead)).toBe(false);
    for (const mode of ["marathon", "sprint40", "ultra120"] as const) {
      const legacy = createInitialState(mode, 1);
      delete legacy.marathonOptions;
      expect(validateSnapshot(legacy)).not.toBeNull();
      expect(validateSnapshot({ ...legacy, storyLevelId: 1 })).toBeNull();
    }
  });
});
