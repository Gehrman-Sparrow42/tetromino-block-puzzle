export type TetrominoType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type RotationState = 0 | 1 | 2 | 3;
export type GameMode = "marathon" | "sprint40" | "ultra120";
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
  status: RunStatus;
  seed: number;
  prngState: number;
  board: (TetrominoType | null)[][];
  active: ActivePiece | null;
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
export interface UserSettings {
  soundEnabled: boolean;
  soundVolume: number;
  hapticsEnabled: boolean;
  ghostEnabled: boolean;
  reducedMotion: boolean;
  controlScheme: "buttons" | "hybrid";
  dasMs: number;
  arrMs: number;
}
export interface PersonalBestStats {
  marathonHighScore: number;
  marathonMaxLines: number;
  sprint40BestTimeMs: number | null;
  ultra120HighScore: number;
  gamesPlayed: number;
  migratedLegacyHighScore: boolean;
}
