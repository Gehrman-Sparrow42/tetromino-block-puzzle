import { THEME_IDS, type ThemeId } from "./game-contract";
export type { ThemeId } from "./game-contract";

export const STARTER_THEME_IDS: readonly ThemeId[] = [
  "ink",
  "lcd",
  "paper",
  "classic",
];
export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as readonly string[]).includes(value)
  );
}
export function isStarterTheme(id: ThemeId): boolean {
  return STARTER_THEME_IDS.includes(id);
}
