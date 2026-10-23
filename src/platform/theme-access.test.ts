import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { THEME_IDS } from "../contracts/game-contract";
import { STARTER_THEME_IDS } from "../contracts/theme-catalog";
import {
  grantThemeUnlock,
  isThemeUnlocked,
  loadThemeAccess,
} from "./theme-access";

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

it("gives a fresh installation exactly four starter themes and a stable profile", () => {
  const access = loadThemeAccess("ink");
  expect(THEME_IDS.filter((id) => isThemeUnlocked(access, id))).toEqual(
    STARTER_THEME_IDS,
  );
  expect(access.profileId).toMatch(/^[a-f0-9]{48}$/);
  expect(loadThemeAccess("paper").profileId).toBe(access.profileId);
});
it("preserves the previously selected paid theme on first migration, without unlocking every theme", () => {
  const access = loadThemeAccess("basalt");
  expect(isThemeUnlocked(access, "basalt")).toBe(true);
  expect(isThemeUnlocked(access, "neon")).toBe(false);
  expect(loadThemeAccess("neon").unlocked).toEqual(["basalt"]);
});
it("persists a rewarded unlock and keeps it unlocked after reload and repeated grants", () => {
  const access = loadThemeAccess("ink");
  expect(grantThemeUnlock(access, "neon")).toBe(true);
  expect(grantThemeUnlock(access, "neon")).toBe(true);
  expect(access.unlocked).toEqual(["neon"]);
  expect(isThemeUnlocked(loadThemeAccess("ink"), "neon")).toBe(true);
});
it("does not treat a changed settings theme as a new migration", () => {
  loadThemeAccess("ink");
  expect(isThemeUnlocked(loadThemeAccess("neon"), "neon")).toBe(false);
});
it("filters malformed unlock entries and retains known IDs only", () => {
  data.set(
    "afterblock_theme_access_v1",
    JSON.stringify({
      version: 1,
      profileId: "a".repeat(48),
      unlocked: ["neon", "neon", "unknown", null, 3],
    }),
  );
  expect(loadThemeAccess("ink").unlocked).toEqual(["neon"]);
});
it("does not apply a new unlock when it cannot be saved", () => {
  const access = loadThemeAccess("ink");
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("Quota");
    },
  });
  expect(grantThemeUnlock(access, "neon")).toBe(false);
  expect(isThemeUnlocked(access, "neon")).toBe(false);
});
it("keeps starter themes usable when storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Blocked");
    },
    setItem: () => {
      throw new Error("Blocked");
    },
  });
  const access = loadThemeAccess("ink");
  expect(STARTER_THEME_IDS.every((id) => isThemeUnlocked(access, id))).toBe(
    true,
  );
});
