import { describe, expect, it } from "vitest";
import type { ClearEvent } from "../src/contracts/game-contract";
import { ATTACK_LEVELS } from "../src/online/protocol";
import {
  baseAttack,
  cancelIncoming,
  createBattleState,
  GARBAGE_DELAY_MS,
  MAX_RISE,
  scaledAttack,
  takeGarbage,
} from "./battle";

function clear(lines: number, extra: Partial<ClearEvent> = {}): ClearEvent {
  return {
    linesCleared: lines,
    rows: Array.from({ length: lines }, (_, index) => 23 - index),
    tSpin: "none",
    backToBack: false,
    combo: 0,
    pointsAwarded: 0,
    perfectClear: false,
    ...extra,
  };
}

describe("Battle attack calculation", () => {
  it.each([
    [1, "none", 0],
    [2, "none", 1],
    [3, "none", 2],
    [4, "none", 4],
    [1, "mini", 1],
    [2, "mini", 2],
    [1, "full", 2],
    [2, "full", 4],
    [3, "full", 6],
  ] as const)(
    "sends %i-line %s attacks at the exact normal rate of %i",
    (lines, tSpin, expected) => {
      const event = clear(lines, { tSpin });
      expect(baseAttack(event)).toBe(expected);
      expect(scaledAttack(createBattleState(), event, 0)).toBe(expected);
    },
  );

  it.each([
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 2],
    [6, 3],
    [8, 4],
    [100, 4],
  ])("adds the bounded combo bonus for combo %i", (combo, bonus) => {
    expect(baseAttack(clear(2, { combo }))).toBe(1 + bonus);
  });

  it("adds B2B and perfect-clear bonuses together with the clear and combo", () => {
    expect(baseAttack(clear(4, { backToBack: true }))).toBe(5);
    expect(baseAttack(clear(1, { perfectClear: true }))).toBe(4);
    expect(
      baseAttack(
        clear(2, {
          tSpin: "full",
          backToBack: true,
          combo: 4,
          perfectClear: true,
        }),
      ),
    ).toBe(11);
    expect(
      scaledAttack(
        createBattleState(),
        clear(4, { backToBack: true, combo: 8, perfectClear: true }),
        0,
      ),
    ).toBe(13);
  });

  it("never attacks for a missing event or a non-clear, even with spin/bonus flags", () => {
    expect(baseAttack(null)).toBe(0);
    expect(
      baseAttack(
        clear(0, {
          tSpin: "full",
          backToBack: true,
          combo: 8,
          perfectClear: true,
        }),
      ),
    ).toBe(0);
  });

  it("makes all three nerfs and all three buffs strictly monotonic over repeated Tetrises", () => {
    const totals = ATTACK_LEVELS.map((level) => {
      const state = createBattleState();
      let total = 0;
      for (let i = 0; i < 10; i++)
        total += scaledAttack(state, clear(4), level);
      expect(state.fraction).toBe(0);
      return total;
    });
    expect(totals).toEqual([20, 28, 34, 40, 48, 56, 68]);
    for (let index = 1; index < totals.length; index++)
      expect(totals[index]).toBeGreaterThan(totals[index - 1]);
  });

  it.each([
    [-3, [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]],
    [-2, [0, 1, 1, 0, 1, 1, 0, 1, 1, 1]],
    [3, [1, 2, 2, 1, 2, 2, 1, 2, 2, 2]],
  ] as const)(
    "retains exact integer fractional carry at attack level %i",
    (level, expected) => {
      const state = createBattleState();
      const actual: number[] = [];
      for (let index = 0; index < 10; index++) {
        actual.push(scaledAttack(state, clear(2), level));
        expect(Number.isInteger(state.fraction)).toBe(true);
        expect(state.fraction).toBeGreaterThanOrEqual(0);
        expect(state.fraction).toBeLessThan(100);
        const fraction = state.fraction;
        expect(scaledAttack(state, null, level)).toBe(0);
        expect(scaledAttack(state, clear(0), level)).toBe(0);
        expect(scaledAttack(state, clear(1), level)).toBe(0);
        expect(state.fraction).toBe(fraction);
      }
      expect(actual).toEqual(expected);
      expect(state.fraction).toBe(0);
    },
  );
});

describe("incoming cancellation and rise", () => {
  it("cancels the oldest pending rows regardless of maturity before sending remainder", () => {
    const state = createBattleState();
    state.pending = [
      { hole: 2, readyAt: 100 },
      { hole: 5, readyAt: 200 },
      { hole: 7, readyAt: 900 },
    ];
    state.fraction = 70;
    expect(cancelIncoming(state, 2)).toBe(0);
    expect(state.pending).toEqual([{ hole: 7, readyAt: 900 }]);
    expect(state.fraction).toBe(70);
    expect(cancelIncoming(state, 4)).toBe(3);
    expect(state.pending).toEqual([]);
    expect(cancelIncoming(state, 3)).toBe(3);
  });

  it("does not consume incoming rows for a zero-strength clear", () => {
    const state = createBattleState();
    state.pending = [{ hole: 4, readyAt: 100 }];
    const before = structuredClone(state);
    expect(cancelIncoming(state, 0)).toBe(0);
    expect(state).toEqual(before);
  });

  it("waits the full 750ms and matures rows exactly at their deadline", () => {
    expect(GARBAGE_DELAY_MS).toBe(750);
    const state = createBattleState();
    state.pending = [
      { hole: 3, readyAt: 1000 + GARBAGE_DELAY_MS },
      { hole: 8, readyAt: 1001 + GARBAGE_DELAY_MS },
    ];
    expect(takeGarbage(state, 1749.999)).toEqual([]);
    expect(state.pending).toHaveLength(2);
    expect(takeGarbage(state, 1750)).toEqual([3]);
    expect(state.pending).toEqual([{ hole: 8, readyAt: 1751 }]);
    expect(takeGarbage(state, 1751)).toEqual([8]);
  });

  it("raises at most eight mature rows and preserves every remaining hole/deadline", () => {
    expect(MAX_RISE).toBe(8);
    const state = createBattleState();
    const pending = Array.from({ length: 13 }, (_, index) => ({
      hole: index % 10,
      readyAt: index < 11 ? 750 : 1000,
    }));
    state.pending = structuredClone(pending);
    state.fraction = 85;
    state.sent = 12;
    expect(takeGarbage(state, 750)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(state.pending).toEqual(pending.slice(8));
    expect(takeGarbage(state, 750)).toEqual([8, 9, 0]);
    expect(state.pending).toEqual(pending.slice(11));
    expect(takeGarbage(state, 999)).toEqual([]);
    expect(takeGarbage(state, 1000)).toEqual([1, 2]);
    expect(state.pending).toEqual([]);
    expect(state.fraction).toBe(85);
    expect(state.sent).toBe(12);
  });
});
