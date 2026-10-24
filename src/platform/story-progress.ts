import type { GameStateSnapshot } from "../contracts/game-contract";
import { validateSnapshot } from "../engine/engine";
import { STORY_LEVELS, getStoryLevel } from "../engine/story";

const KEY = "afterblock_story_progress_v1";
export interface StoryResult {
  bestScore: number;
  bestTimeMs: number;
}
export interface StoryProgress {
  version: 1;
  completed: Record<string, StoryResult>;
}

export function loadStoryProgress(): StoryProgress {
  const progress: StoryProgress = { version: 1, completed: {} };
  try {
    const value = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<StoryProgress> | null;
    if (
      value?.version !== 1 ||
      !value.completed ||
      typeof value.completed !== "object" ||
      Array.isArray(value.completed)
    )
      return progress;
    for (const level of STORY_LEVELS) {
      const result = value.completed[String(level.id)];
      // A damaged later entry must not unlock stages across a missing completion.
      if (
        !result ||
        !Number.isSafeInteger(result.bestScore) ||
        result.bestScore < 0 ||
        result.bestScore > 1e12 ||
        !Number.isFinite(result.bestTimeMs) ||
        result.bestTimeMs < 0 ||
        result.bestTimeMs > 1e12
      )
        break;
      progress.completed[String(level.id)] = {
        bestScore: result.bestScore,
        bestTimeMs: result.bestTimeMs,
      };
    }
  } catch {
    /* Campaign failure never prevents the offline game from starting. */
  }
  return progress;
}
export function isStoryLevelUnlocked(
  progress: StoryProgress,
  id: number,
): boolean {
  return (
    !!getStoryLevel(id) &&
    STORY_LEVELS.filter((level) => level.id < id).every(
      (level) => !!progress.completed[String(level.id)],
    )
  );
}
export function isStoryCampaignComplete(progress: StoryProgress): boolean {
  return STORY_LEVELS.every((level) => !!progress.completed[String(level.id)]);
}
/** Saves a completed stage only; replay improves records without adding another stage. */
export function recordStoryCompletion(state: GameStateSnapshot): boolean {
  const valid = validateSnapshot(state);
  if (
    !valid ||
    valid.mode !== "story" ||
    valid.status !== "victory" ||
    !valid.storyLevelId
  )
    return false;
  const progress = loadStoryProgress();
  if (!isStoryLevelUnlocked(progress, valid.storyLevelId)) return false;
  const id = String(valid.storyLevelId),
    previous = progress.completed[id];
  progress.completed[id] = {
    bestScore: Math.max(previous?.bestScore ?? 0, valid.score),
    bestTimeMs: Math.min(previous?.bestTimeMs ?? Infinity, valid.elapsedMs),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
