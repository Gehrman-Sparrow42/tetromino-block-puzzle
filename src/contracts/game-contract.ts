export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type BoardCell = TetrominoType | "G" | null;
export type RotationState = 0 | 1 | 2 | 3;
export type GameMode = "marathon" | "sprint40" | "ultra120" | "story";
export interface StoryOptions {
  storyLevelId: number;
}
export interface MarathonOptions {
  startingLevel: number;
  speedMode: "progressive" | "fixed";
}
export type RunStatus = "playing" | "paused" | "gameover" | "victory";
export type GameCommand =
  | {
      type:
        | "MOVE_LEFT"
        | "MOVE_RIGHT"
        | "HARD_DROP"
        | "ROTATE_CW"
        | "ROTATE_CCW"
        | "HOLD"
        | "PAUSE"
        | "RESUME";
    }
  | { type: "SOFT_DROP"; active: boolean }
  | { type: "TICK"; dtMs: number };
export interface ActivePiece {
  type: TetrominoType;
  rotation: RotationState;
  x: number;
  y: number;
  ghostY: number;
  lockTimerMs: number;
  lockResetsUsed: number;
  lastActionWasRotation: boolean;
  lastKickIndex: number;
}
export interface ClearEvent {
  linesCleared: number;
  rows: number[];
  tSpin: "none" | "mini" | "full";
  backToBack: boolean;
  combo: number;
  pointsAwarded: number;
  perfectClear: boolean;
}
export interface GameStateSnapshot {
  version: 2;
  mode: GameMode;
  /** Absent in legacy saves, which progress normally from level one. */
  marathonOptions?: MarathonOptions;
  /** Required only for Story. level stores the current phase's gravity speed. */
  storyLevelId?: number;
  status: RunStatus;
  seed: number;
  prngState: number;
  board: BoardCell[][];
  active: ActivePiece | null;
  /** The already-consumed piece whose spawn caused a block-out. */
  blockedPiece?: TetrominoType;
  /** Legacy runs omit these fields. Assisted Marathon runs never set records. */
  continuesUsed?: number;
  rewardRunId?: string;
  hold: TetrominoType | null;
  holdUsedThisTurn: boolean;
  bag: TetrominoType[];
  nextQueue: TetrominoType[];
  score: number;
  lines: number;
  level: number;
  combo: number;
  backToBack: boolean;
  elapsedMs: number;
  gravityTimerMs: number;
  softDropActive: boolean;
  piecesPlaced: number;
  lastEvent: ClearEvent | null;
}
export const THEME_IDS = [
  "ink",
  "lcd",
  "neon",
  "paper",
  "basalt",
  "workshop",
  "sleeve",
  "score",
  "folio",
  "gate",
  "annual",
  "data",
  "classic",
  "amber",
  "glacier",
  "clay",
  "blueprint",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export type ControlLayoutId = "gamepad" | "thumbs" | "mirror" | "floating";
export const GAMEPAD_CONTROL_IDS = [
  "pad",
  "board",
  "left",
  "down",
  "right",
  "hardDrop",
  "rotateCW",
  "rotateCCW",
  "hold",
] as const;
export type GamepadControlId = (typeof GAMEPAD_CONTROL_IDS)[number];
export type ControlOrientation = "portrait" | "landscape";
export interface GamepadControlPlacement {
  /** Center relative to the full playable area, independent of screen pixels. */
  x: number;
  y: number;
  size: number;
  opacity: number;
  hidden?: boolean;
}
export type GamepadLayouts = Record<
  ControlOrientation,
  Partial<Record<GamepadControlId, GamepadControlPlacement>>
>;
export interface UserSettings {
  soundEnabled: boolean;
  soundVolume: number;
  hapticsEnabled: boolean;
  ghostEnabled: boolean;
  reducedMotion: boolean;
  controlScheme: "buttons" | "hybrid";
  dasMs: number;
  arrMs: number;
  theme: ThemeId;
  controlLayout: ControlLayoutId;
  gamepadPreset: "balanced" | "compact" | "mirrored";
  padMode: "fixed" | "dynamic";
  controlScale: number;
  controlOpacity: number;
  controlSpread: number;
  controlHeight: number;
  gamepadLayouts: GamepadLayouts;
  boardScale?: number;
  controlProfiles?: Record<
    string,
    { layouts: GamepadLayouts; boardScale: number }
  >;
}
export interface PersonalBestStats {
  marathonHighScore: number;
  marathonMaxLines: number;
  marathonFixedHighScore?: number;
  marathonFixedMaxLines?: number;
  sprint40BestTimeMs: number | null;
  ultra120HighScore: number;
  gamesPlayed: number;
  migratedLegacyHighScore: boolean;
}

export const EDITABLE_CONTROL_IDS = GAMEPAD_CONTROL_IDS.filter(
  (id) => id !== "pad" && id !== "board",
);
export function controlProfileKey(
  settings: Pick<UserSettings, "controlLayout" | "gamepadPreset">,
): string {
  return settings.controlLayout === "gamepad"
    ? `gamepad:${settings.gamepadPreset}`
    : settings.controlLayout;
}
