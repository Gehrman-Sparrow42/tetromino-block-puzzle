import type {
  GameStateSnapshot,
  PersonalBestStats,
  UserSettings,
  GamepadLayouts,
} from "../contracts/game-contract";
import { validateSnapshot } from "../engine/engine";
import { THEME_IDS, GAMEPAD_CONTROL_IDS } from "../contracts/game-contract";

export const DEFAULT_SETTINGS: Readonly<UserSettings> = Object.freeze({
  soundEnabled: true,
  soundVolume: 0.45,
  hapticsEnabled: true,
  ghostEnabled: true,
  reducedMotion: false,
  controlScheme: "buttons",
  dasMs: 150,
  arrMs: 40,
  theme: "ink",
  controlLayout: "gamepad",
  controlScale: 1,
  controlOpacity: 0.18,
  controlSpread: 0.65,
  controlHeight: 0.3,
  gamepadLayouts: Object.freeze({
    portrait: Object.freeze({}),
    landscape: Object.freeze({}),
  }),
});

const KEYS = {
  settings: "tetromino_v2_settings",
  stats: "tetromino_v2_stats",
  run: "tetromino_v2_run",
};
const memory = new Map<string, string | null>();
const pending = new Set<string>();

function read(key: string): string | null {
  if (pending.has(key)) return memory.get(key) ?? null;
  try {
    const value = globalThis.localStorage.getItem(key);
    memory.set(key, value);
    return value;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string | null): boolean {
  memory.set(key, value);
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
    pending.delete(key);
    return true;
  } catch {
    pending.add(key);
    return false;
  }
}

function parse(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function bounded(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/** Reject malformed placements as a whole; clamp finite edited values safely. */
export function normalizeGamepadLayouts(value: unknown): GamepadLayouts {
  const result: GamepadLayouts = { portrait: {}, landscape: {} };
  if (!value || typeof value !== "object") return result;
  for (const orientation of ["portrait", "landscape"] as const) {
    const entries = (value as Record<string, unknown>)[orientation];
    if (!entries || typeof entries !== "object" || Array.isArray(entries))
      continue;
    for (const id of GAMEPAD_CONTROL_IDS) {
      if (!Object.prototype.hasOwnProperty.call(entries, id)) continue;
      const entry = (entries as Record<string, unknown>)[id];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const placement = entry as Record<string, unknown>;
      if (
        !["x", "y", "size", "opacity"].every(
          (key) =>
            typeof placement[key] === "number" &&
            Number.isFinite(placement[key]),
        )
      )
        continue;
      result[orientation][id] = {
        x: bounded(placement.x, 0.5, 0, 1),
        y: bounded(placement.y, 0.5, 0, 1),
        size: bounded(placement.size, 1, 0.75, 1.4),
        opacity: bounded(placement.opacity, 0.18, 0.08, 0.6),
      };
    }
  }
  return result;
}

function settingsFrom(value: Record<string, unknown>): UserSettings {
  const defaults = DEFAULT_SETTINGS;
  const bool = (key: keyof UserSettings): boolean =>
    typeof value[key] === "boolean"
      ? (value[key] as boolean)
      : (defaults[key] as boolean);
  return {
    soundEnabled: bool("soundEnabled"),
    soundVolume: bounded(value.soundVolume, defaults.soundVolume, 0, 1),
    hapticsEnabled: bool("hapticsEnabled"),
    ghostEnabled: bool("ghostEnabled"),
    reducedMotion: bool("reducedMotion"),
    controlScheme: value.controlScheme === "hybrid" ? "hybrid" : "buttons",
    dasMs: bounded(value.dasMs, defaults.dasMs, 80, 300),
    arrMs: bounded(value.arrMs, defaults.arrMs, 16, 100),
    theme: THEME_IDS.find((id) => id === value.theme) ?? defaults.theme,
    controlLayout:
      value.controlLayout === "thumbs" ||
      value.controlLayout === "mirror" ||
      value.controlLayout === "floating"
        ? value.controlLayout
        : "gamepad",
    controlScale: bounded(value.controlScale, defaults.controlScale, 0.85, 1.3),
    controlOpacity: bounded(
      value.controlOpacity,
      defaults.controlOpacity,
      0.08,
      0.6,
    ),
    controlSpread: bounded(value.controlSpread, defaults.controlSpread, 0, 1),
    controlHeight: bounded(value.controlHeight, defaults.controlHeight, 0, 1),
    gamepadLayouts: normalizeGamepadLayouts(value.gamepadLayouts),
  };
}

export function loadSettings(): UserSettings {
  return settingsFrom(parse(read(KEYS.settings)));
}
export function saveSettings(settings: UserSettings): boolean {
  return write(
    KEYS.settings,
    JSON.stringify(
      settingsFrom(settings as unknown as Record<string, unknown>),
    ),
  );
}

function counter(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export function loadStats(): PersonalBestStats {
  const value = parse(read(KEYS.stats));
  const stats: PersonalBestStats = {
    marathonHighScore: counter(value.marathonHighScore),
    marathonMaxLines: counter(value.marathonMaxLines),
    sprint40BestTimeMs:
      typeof value.sprint40BestTimeMs === "number" &&
      Number.isFinite(value.sprint40BestTimeMs) &&
      value.sprint40BestTimeMs > 0
        ? value.sprint40BestTimeMs
        : null,
    ultra120HighScore: counter(value.ultra120HighScore),
    gamesPlayed: counter(value.gamesPlayed),
    migratedLegacyHighScore: value.migratedLegacyHighScore === true,
  };
  if (!stats.migratedLegacyHighScore) {
    const legacy = read("block_puzzle_highscore");
    const score =
      legacy !== null && /^\d+$/.test(legacy.trim())
        ? counter(Number(legacy))
        : 0;
    stats.marathonHighScore = Math.max(stats.marathonHighScore, score);
    stats.migratedLegacyHighScore = true;
    write(KEYS.stats, JSON.stringify(stats));
  }
  return stats;
}

/** Call once after a run reaches a terminal state. */
export function recordResult(state: GameStateSnapshot): PersonalBestStats {
  const stats = loadStats();
  const valid = validateSnapshot(state);
  if (!valid || (valid.status !== "gameover" && valid.status !== "victory"))
    return stats;
  stats.gamesPlayed = Math.min(Number.MAX_SAFE_INTEGER, stats.gamesPlayed + 1);
  if (valid.mode === "marathon") {
    stats.marathonHighScore = Math.max(stats.marathonHighScore, valid.score);
    stats.marathonMaxLines = Math.max(stats.marathonMaxLines, valid.lines);
  } else if (valid.mode === "ultra120") {
    stats.ultra120HighScore = Math.max(stats.ultra120HighScore, valid.score);
  } else if (valid.status === "victory" && valid.elapsedMs > 0) {
    stats.sprint40BestTimeMs = Math.min(
      stats.sprint40BestTimeMs ?? Infinity,
      valid.elapsedMs,
    );
  }
  write(KEYS.stats, JSON.stringify(stats));
  return stats;
}

export function loadRun(): GameStateSnapshot | null {
  const valid = validateSnapshot(parse(read(KEYS.run)));
  if (!valid || (valid.status !== "playing" && valid.status !== "paused"))
    return null;
  return { ...valid, status: "paused", softDropActive: false };
}

export function saveRun(state: GameStateSnapshot): boolean {
  const valid = validateSnapshot(state);
  if (!valid || (valid.status !== "playing" && valid.status !== "paused"))
    return false;
  return write(
    KEYS.run,
    JSON.stringify({ ...valid, status: "paused", softDropActive: false }),
  );
}

export function clearRun(): boolean {
  return write(KEYS.run, null);
}
