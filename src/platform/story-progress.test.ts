import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInitialState } from "../engine/engine";
import {
  STORY_LEVELS,
  getStoryLevel,
  storySpeedForLines,
} from "../engine/story";
import {
  isStoryCampaignComplete,
  isStoryLevelUnlocked,
  loadStoryProgress,
  recordStoryCompletion,
} from "./story-progress";

let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function victory(id: number, score = 100, elapsedMs = 60_000) {
  const run = createInitialState("story", 47, { storyLevelId: id });
  const level = getStoryLevel(id)!;
  Object.assign(run, {
    status: "victory",
    active: null,
    lines: level.targetLines,
    level: storySpeedForLines(level, level.targetLines),
    score,
    elapsedMs,
  });
  return run;
}
it("starts with only stage one unlocked and never accepts a locked completion", () => {
  const progress = loadStoryProgress();
  expect(
    STORY_LEVELS.filter((level) =>
      isStoryLevelUnlocked(progress, level.id),
    ).map((level) => level.id),
  ).toEqual([1]);
  expect(recordStoryCompletion(victory(2))).toBe(false);
  expect(isStoryLevelUnlocked(progress, 0)).toBe(false);
});
it("unlocks sequentially, retains replay bests and survives reloading", () => {
  expect(recordStoryCompletion(victory(1))).toBe(true);
  expect(isStoryLevelUnlocked(loadStoryProgress(), 2)).toBe(true);
  expect(isStoryLevelUnlocked(loadStoryProgress(), 3)).toBe(false);
  expect(recordStoryCompletion(victory(1, 200, 70_000))).toBe(true);
  expect(recordStoryCompletion(victory(1, 50, 50_000))).toBe(true);
  expect(loadStoryProgress().completed).toEqual({
    "1": { bestScore: 200, bestTimeMs: 50_000 },
  });
});
it("marks the campaign complete only after the final sequential victory", () => {
  for (const level of STORY_LEVELS)
    expect(recordStoryCompletion(victory(level.id))).toBe(true);
  expect(isStoryCampaignComplete(loadStoryProgress())).toBe(true);
  expect(Object.keys(loadStoryProgress().completed)).toHaveLength(12);
});
it("does not unlock on top-out or a non-Story victory", () => {
  const lost = createInitialState("story", 1, { storyLevelId: 1 });
  lost.status = "gameover";
  lost.active = null;
  expect(recordStoryCompletion(lost)).toBe(false);
  const sprint = createInitialState("sprint40", 1);
  Object.assign(sprint, {
    status: "victory",
    active: null,
    lines: 40,
    level: 5,
  });
  expect(recordStoryCompletion(sprint)).toBe(false);
});
it("ignores corrupt metadata and never unlocks across a gap", () => {
  data.set(
    "afterblock_story_progress_v1",
    JSON.stringify({
      version: 1,
      completed: {
        "1": { bestScore: 100, bestTimeMs: 50_000 },
        "3": { bestScore: 999, bestTimeMs: 1 },
      },
    }),
  );
  expect(Object.keys(loadStoryProgress().completed)).toEqual(["1"]);
  data.set("afterblock_story_progress_v1", "{bad");
  expect(loadStoryProgress().completed).toEqual({});
});
it("reports storage failure instead of claiming an unlock", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage full");
    },
  });
  expect(recordStoryCompletion(victory(1))).toBe(false);
});
