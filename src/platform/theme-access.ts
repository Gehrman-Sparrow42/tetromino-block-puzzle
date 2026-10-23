import type { ThemeId } from "../contracts/game-contract";
import { isThemeId, isStarterTheme } from "../contracts/theme-catalog";

const KEY = "afterblock_theme_access_v1";
export interface ThemeAccess {
  version: 1;
  profileId: string;
  unlocked: ThemeId[];
}
function newProfileId(): string {
  // getRandomValues also works in file:// and older Android WebViews.
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function save(access: ThemeAccess): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(access));
    return true;
  } catch {
    return false;
  }
}
export function loadThemeAccess(selectedTheme: ThemeId): ThemeAccess {
  let value: unknown;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) value = JSON.parse(raw);
  } catch {
    /* Keep the free themes usable if storage is unavailable. */
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Partial<ThemeAccess>;
    if (
      candidate.version === 1 &&
      typeof candidate.profileId === "string" &&
      /^[A-Za-z0-9_-]{16,128}$/.test(candidate.profileId) &&
      Array.isArray(candidate.unlocked)
    ) {
      const access: ThemeAccess = {
        version: 1,
        profileId: candidate.profileId,
        unlocked: [...new Set(candidate.unlocked.filter(isThemeId))],
      };
      // An incomplete or edited settings record cannot silently select a locked theme.
      return access;
    }
  }
  // Upgrade from the pre-lock theme picker: retain the currently chosen theme only.
  const access: ThemeAccess = {
    version: 1,
    profileId: newProfileId(),
    unlocked:
      isThemeId(selectedTheme) && !isStarterTheme(selectedTheme)
        ? [selectedTheme]
        : [],
  };
  save(access);
  return access;
}
export function isThemeUnlocked(access: ThemeAccess, id: ThemeId): boolean {
  return isStarterTheme(id) || access.unlocked.includes(id);
}
/** Call only for a completed, target-scoped reward. Mutate access only after storage succeeds. */
export function grantThemeUnlock(access: ThemeAccess, id: ThemeId): boolean {
  if (!isThemeId(id)) return false;
  if (isThemeUnlocked(access, id)) return true;
  const updated: ThemeAccess = {
    ...access,
    unlocked: [...access.unlocked, id],
  };
  if (!save(updated)) return false;
  access.unlocked = updated.unlocked;
  return true;
}
