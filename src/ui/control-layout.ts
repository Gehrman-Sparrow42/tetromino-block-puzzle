import { EDITABLE_CONTROL_IDS } from "../contracts/game-contract";
import type {
  ControlOrientation,
  GamepadControlId,
  GamepadControlPlacement,
  UserSettings,
} from "../contracts/game-contract";

export type ControlAction =
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "SOFT_DROP"
  | "HARD_DROP"
  | "ROTATE_CW"
  | "ROTATE_CCW"
  | "HOLD";

type LegacyControlId = "pad" | "hardDrop" | "hold" | "rotateCW" | "rotateCCW";

export interface ControlRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const SIDE_RAIL_WIDTH = 48;
export const SIDE_RAIL_GUTTER = 2;
export const SIDE_RAIL_SPACE = SIDE_RAIL_WIDTH + SIDE_RAIL_GUTTER;

export interface ControlGeometry {
  width: number;
  /** Actual control deck height, including the empty space below the buttons. */
  height: number;
  playAreaHeight?: number;
  buttonSize: number;
  bottomPadding: number;
  pad?: ControlRect;
  groups?: Record<GamepadControlId, ControlRect>;
  groupOpacity?: Record<GamepadControlId, number>;
  overlay?: boolean;
  orientation?: ControlOrientation;
  boardPosition?: { x: number; y: number };
  baseButtonSize?: number;
  boardScale?: number;
  groupHidden?: Partial<Record<GamepadControlId, boolean>>;
  buttons: Record<
    ControlAction,
    { x: number; y: number; width: number; height: number }
  >;
}

/** Controls in play-area coordinates, shared by the board, rails and previews. */
export function controlObstacles(
  _height: number,
  controls: ControlGeometry,
  _layout: UserSettings["controlLayout"],
): ControlRect[] {
  if (controls.groups)
    return EDITABLE_CONTROL_IDS.filter((id) => !controls.groupHidden?.[id]).map(
      (id) => controls.groups![id],
    );
  return Object.values(controls.buttons);
}

/** Full, centered board starts at the top; side rails and every preset stay clear. */
export function computeBoardGeometry(
  width: number,
  height: number,
  controls: ControlGeometry,
  _layout: UserSettings["controlLayout"],
): ControlRect {
  const size =
    Math.max(0, Math.min(width - SIDE_RAIL_SPACE * 2, height / 2)) *
    (controls.boardScale ?? 1);
  const x = controls.boardPosition
    ? controls.boardPosition.x * width - size / 2
    : (width - size) / 2;
  const y = controls.boardPosition
    ? controls.boardPosition.y * height - size
    : 0;
  return {
    x: Math.max(0, Math.min(width - size, x)),
    y: Math.max(0, Math.min(height - size * 2, y)),
    width: size,
    height: size * 2,
  };
}

/** Side information follows the board while staying within the viewport. */
export function computeRailGeometry(
  board: ControlRect,
  height: number,
  controls: ControlGeometry,
  _layout: UserSettings["controlLayout"],
): { left: ControlRect; right: ControlRect } {
  const y = Math.max(0, Math.min(height - Math.min(height, 300), board.y));
  const rail = (x: number): ControlRect => ({
    x: Math.max(0, Math.min(controls.width - SIDE_RAIL_WIDTH, x)),
    y,
    width: SIDE_RAIL_WIDTH,
    height: height - y,
  });
  return {
    left: rail(board.x - SIDE_RAIL_SPACE),
    right: rail(board.x + board.width + SIDE_RAIL_GUTTER),
  };
}

function bounded(
  value: number,
  fallback: number,
  min: number,
  max: number,
): number {
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

/**
 * Width is the content width after padding/safe areas. Available height includes
 * the board and deck, but excludes the HUD. Floating decks overlay the board.
 * Size requests yield to available space, with a 48px minimum touch target.
 * Below 276px content width, the caller must allow horizontal overflow: five
 * button columns plus their minimum gaps cannot fit into a smaller space.
 */
export function computeControlGeometry(
  width: number,
  height: number,
  settings: UserSettings,
  orientation?: ControlOrientation,
): ControlGeometry {
  if (settings.controlLayout === "gamepad")
    return computeGamepadGeometry(width, height, settings, orientation);
  const usableWidth = Math.floor(bounded(width, 360, 276, 10000));
  const usableHeight = Math.floor(bounded(height, 600, 104, 10000));
  const facing =
    orientation ?? (usableWidth > usableHeight ? "landscape" : "portrait");
  const scale = bounded(settings.controlScale, 1, 0.85, 2);
  const spread = bounded(settings.controlSpread, 0.65, 0, 1);
  const verticalOffset = bounded(settings.controlHeight, 0.3, 0, 1);
  const floating = settings.controlLayout === "floating";
  const gap = 8;
  const maxByWidth = Math.floor((usableWidth - 36) / 5);
  // Reserve 280px of board plus 8px separation whenever the viewport allows it.
  const maxByHeight = Math.floor((usableHeight - (280 + 16)) / 2);
  const buttonSize = Math.max(
    48,
    Math.min(Math.round(60 * scale), maxByWidth, maxByHeight),
  );
  const rowsHeight = 2 * buttonSize + gap;
  const verticalSlack = Math.max(
    0,
    usableHeight - rowsHeight - (floating ? gap : 280 + gap),
  );
  const bottomPadding = Math.round(
    verticalOffset * Math.min(floating ? 48 : 32, verticalSlack),
  );
  const horizontalSlack = usableWidth - (5 * buttonSize + 3 * gap + 12);
  const clusterGap =
    12 +
    Math.round((usableWidth > usableHeight ? 1 : spread) * horizontalSlack);
  const movementWidth = 3 * buttonSize + 2 * gap;
  const rotationWidth = 2 * buttonSize + gap;
  const outerMargin = Math.floor(
    (usableWidth - movementWidth - rotationWidth - clusterGap) / 2,
  );
  const mirrored = settings.controlLayout === "mirror";
  // Move whole clusters instead of reflecting each button, preserving left/right
  // arrow order and the familiar clockwise upper-right rotation position.
  const movementX = mirrored
    ? outerMargin + rotationWidth + clusterGap
    : outerMargin;
  const rotationX = mirrored
    ? outerMargin
    : outerMargin + movementWidth + clusterGap;
  const lowerY = buttonSize + gap;
  const deckHeight = rowsHeight + bottomPadding;
  const deckTop = usableHeight - deckHeight;
  const rect = (x: number, y: number): ControlRect => ({
    x,
    y,
    width: buttonSize,
    height: buttonSize,
  });
  return resolveControlGroups(
    usableWidth,
    usableHeight,
    deckHeight,
    bottomPadding,
    buttonSize,
    facing,
    false,
    {
      pad: {
        x: movementX,
        y: deckTop + lowerY,
        width: movementWidth,
        height: buttonSize,
      },
      hardDrop: rect(movementX, deckTop),
      hold: rect(movementX + 2 * (buttonSize + gap), deckTop),
      rotateCCW: rect(rotationX, deckTop + lowerY),
      rotateCW: rect(rotationX + buttonSize + gap, deckTop),
    },
    settings,
  );
}

/** A resize may move only its own center inward to fit the screen edge. */
export function clampGamepadResize(
  geometry: ControlGeometry,
  id: GamepadControlId,
  placement: GamepadControlPlacement,
): GamepadControlPlacement {
  const stageHeight = geometry.playAreaHeight ?? geometry.height;
  const connected = !!geometry.pad;
  const cell = Math.max(
    48,
    Math.round(geometry.baseButtonSize! * placement.size),
  );
  const width = id === "pad" ? cell * 3 + (connected ? 0 : 16) : cell;
  const height = cell * (id === "pad" && connected ? 2 : 1);
  const halfWidth = width / geometry.width / 2;
  const halfHeight = height / stageHeight / 2;
  return {
    ...placement,
    x: Math.max(halfWidth, Math.min(1 - halfWidth, placement.x)),
    y: Math.max(halfHeight, Math.min(1 - halfHeight, placement.y)),
  };
}

/** Validate a proposed editor move without repositioning any other control. */
export function canPlaceGamepadGroup(
  geometry: ControlGeometry,
  id: GamepadControlId,
  rect: ControlRect,
): boolean {
  const stageHeight = geometry.playAreaHeight ?? geometry.height;
  const connected = !!geometry.pad;
  return (
    Object.values(rect).every(Number.isFinite) &&
    rect.width >= (id === "pad" ? (connected ? 144 : 160) : 48) &&
    rect.height >= (id === "pad" && connected ? 96 : 48) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= geometry.width &&
    rect.y + rect.height <= stageHeight
  );
}

/** The pad has three directions and a neutral center: deliberately no up zone. */
function computeGamepadGeometry(
  width: number,
  height: number,
  settings: UserSettings,
  orientation?: ControlOrientation,
): ControlGeometry {
  const w = Math.floor(bounded(width, 360, 276, 10000));
  const h = Math.floor(bounded(height, 600, 104, 10000));
  const facing = orientation ?? (w > h ? "landscape" : "portrait");
  const gap = 8;
  const inset = Math.min(16, Math.max(0, (w - 256) / 2));
  const maxCell = Math.max(
    48,
    Math.floor(Math.min((w - 2 * inset - 2 * gap) / 5, (h - gap) / 2)),
  );
  let baseCell = Math.min(
    maxCell,
    Math.round(
      (settings.gamepadPreset === "compact" ? 50 : 60) *
        bounded(settings.controlScale, 1, 0.85, 2),
    ),
  );
  // Large packed controls must still leave a readable center and both side rails.
  const requestedBottom =
    16 + Math.round(bounded(settings.controlHeight, 0.3, 0, 1) * 24);
  if (
    facing === "landscape" &&
    h - requestedBottom - 2 * baseCell - gap < 220
  ) {
    const fitBetweenSides = Math.floor(
      (w / 2 - inset - SIDE_RAIL_SPACE - 220 / 4 - gap) / 3,
    );
    baseCell = Math.min(baseCell, Math.max(48, fitBetweenSides));
  }
  const padSize = baseCell;
  const actionSize = baseCell;
  const bottom = Math.min(
    16 + Math.round(bounded(settings.controlHeight, 0.3, 0, 1) * 24),
    Math.max(0, h - Math.max(2 * padSize, 2 * actionSize + gap)),
  );
  const mirrored = settings.gamepadPreset === "mirrored";
  const padX = mirrored ? w - inset - 3 * padSize : inset;
  const actionX = mirrored ? inset : w - inset - 2 * actionSize - gap;
  const lowerY = h - bottom - actionSize;
  const rect = (id: GamepadControlId, x: number, y: number): ControlRect => ({
    x: Math.round(x),
    y: Math.round(y),
    width: baseCell * (id === "pad" ? 3 : 1),
    height: baseCell * (id === "pad" ? 2 : 1),
  });
  const defaults: Record<LegacyControlId, ControlRect> = {
    pad: rect("pad", padX, h - bottom - 2 * padSize),
    hardDrop: rect("hardDrop", actionX, lowerY - actionSize - gap),
    hold: rect("hold", actionX + actionSize + gap, lowerY - actionSize - gap),
    rotateCCW: rect("rotateCCW", actionX, lowerY),
    rotateCW: rect("rotateCW", actionX + actionSize + gap, lowerY),
  };
  return resolveControlGroups(
    w,
    h,
    h,
    bottom,
    baseCell,
    facing,
    true,
    defaults,
    settings,
  );
}

function resolveControlGroups(
  w: number,
  h: number,
  _deckHeight: number,
  bottom: number,
  baseCell: number,
  facing: ControlOrientation,
  connected: boolean,
  defaults: Record<LegacyControlId, ControlRect>,
  settings: UserSettings,
): ControlGeometry {
  const custom = settings.gamepadLayouts?.[facing] ?? {};
  // Migrate the old movement-group edit visually without changing the saved map.
  const oldPad = custom.pad;
  const padCell = oldPad
    ? Math.max(48, Math.round(baseCell * oldPad.size))
    : baseCell;
  const padWidth = connected ? padCell * 3 : padCell * 3 + 16;
  const padHeight = connected ? padCell * 2 : padCell;
  const pad = oldPad
    ? {
        x: Math.max(
          0,
          Math.min(w - padWidth, Math.round(oldPad.x * w - padWidth / 2)),
        ),
        y: Math.max(
          0,
          Math.min(h - padHeight, Math.round(oldPad.y * h - padHeight / 2)),
        ),
        width: padWidth,
        height: padHeight,
      }
    : defaults.pad;
  const step = padCell + (connected ? 0 : 8);
  const base: Record<GamepadControlId, ControlRect> = {
    ...defaults,
    board: { x: 0, y: 0, width: 0, height: 0 },
    left: { x: pad.x, y: pad.y, width: padCell, height: padCell },
    right: { x: pad.x + step * 2, y: pad.y, width: padCell, height: padCell },
    down: {
      x: pad.x + step,
      y: pad.y + (connected ? padCell : 0),
      width: padCell,
      height: padCell,
    },
  };
  const opacity = {} as Record<GamepadControlId, number>;
  const hidden: Partial<Record<GamepadControlId, boolean>> = {};
  const groups = { ...base };
  for (const id of EDITABLE_CONTROL_IDS) {
    const p = custom[id];
    const inherited = ["left", "down", "right"].includes(id)
      ? oldPad
      : undefined;
    const cell = p
      ? Math.min(
          w,
          h,
          Math.max(48, Math.round(baseCell * bounded(p.size, 1, 0.75, 2))),
        )
      : base[id].width;
    groups[id] = p
      ? {
          x: Math.max(0, Math.min(w - cell, Math.round(p.x * w - cell / 2))),
          y: Math.max(0, Math.min(h - cell, Math.round(p.y * h - cell / 2))),
          width: cell,
          height: cell,
        }
      : base[id];
    opacity[id] = bounded(
      p?.opacity ?? inherited?.opacity ?? settings.controlOpacity,
      0.18,
      0.08,
      0.6,
    );
    hidden[id] = p?.hidden ?? inherited?.hidden ?? false;
  }
  opacity.pad = settings.controlOpacity;
  const createGeometry = (
    placements: Record<GamepadControlId, ControlRect>,
  ): ControlGeometry => ({
    width: w,
    height: h,
    playAreaHeight: h,
    buttonSize: baseCell,
    baseButtonSize: baseCell,
    bottomPadding: bottom,
    overlay: true,
    orientation: facing,
    groups: placements,
    groupOpacity: opacity,
    groupHidden: hidden,
    boardScale: settings.boardScale ?? 1,
    boardPosition: custom.board
      ? { x: custom.board.x, y: custom.board.y }
      : undefined,
    buttons: {
      MOVE_LEFT: placements.left,
      SOFT_DROP: placements.down,
      MOVE_RIGHT: placements.right,
      HARD_DROP: placements.hardDrop,
      HOLD: placements.hold,
      ROTATE_CW: placements.rotateCW,
      ROTATE_CCW: placements.rotateCCW,
    },
  });
  return createGeometry(groups);
}
