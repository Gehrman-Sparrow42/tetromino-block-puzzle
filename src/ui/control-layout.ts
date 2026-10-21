import { GAMEPAD_CONTROL_IDS } from "../contracts/game-contract";
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
  buttonSize: number;
  bottomPadding: number;
  pad?: ControlRect;
  groups?: Record<GamepadControlId, ControlRect>;
  groupOpacity?: Record<GamepadControlId, number>;
  overlay?: boolean;
  orientation?: ControlOrientation;
  minimumRailHeight?: number;
  baseButtonSize?: number;
  buttons: Record<
    ControlAction,
    { x: number; y: number; width: number; height: number }
  >;
}

/** Controls in play-area coordinates, shared by the board, rails and previews. */
export function controlObstacles(
  height: number,
  controls: ControlGeometry,
  layout: UserSettings["controlLayout"],
): ControlRect[] {
  if (layout === "gamepad") return Object.values(controls.groups!);
  const deckTop = height - controls.height;
  return Object.values(controls.buttons).map((rect) => ({
    ...rect,
    y: rect.y + deckTop,
  }));
}

/** Full, centered board starts at the top; side rails and every preset stay clear. */
export function computeBoardGeometry(
  width: number,
  height: number,
  controls: ControlGeometry,
  layout: UserSettings["controlLayout"],
): ControlRect {
  const obstacles = controlObstacles(height, controls, layout);
  const railSpace = SIDE_RAIL_SPACE;
  const gap = 8;
  const maxWidth = Math.max(0, width - railSpace * 2);
  // Changes in obstacle intersection occur only at their horizontal edges.
  const candidates = [
    maxWidth,
    height / 2,
    ...obstacles.flatMap((rect) => [
      width - 2 * (rect.x + rect.width + gap),
      2 * (rect.x - gap) - width,
      Math.max(0, rect.y - gap) / 2,
      width - 2 * (rect.x + rect.width + gap + SIDE_RAIL_SPACE),
      2 * (rect.x - gap - SIDE_RAIL_SPACE) - width,
    ]),
  ];
  let best = 0;
  for (const candidate of candidates) {
    const size = Math.max(0, Math.min(maxWidth, height / 2, candidate));
    const left = (width - size) / 2;
    const right = left + size;
    if (
      size > best &&
      obstacles.every(
        (rect) =>
          right + gap <= rect.x ||
          left >= rect.x + rect.width + gap ||
          size * 2 + gap <= rect.y,
      ) &&
      [left - SIDE_RAIL_SPACE, right + SIDE_RAIL_GUTTER].every((x) =>
        obstacles.every(
          (rect) =>
            x + SIDE_RAIL_WIDTH <= rect.x ||
            x >= rect.x + rect.width ||
            Math.min(size * 2, width > height ? 220 : 256) + gap <= rect.y,
        ),
      )
    )
      best = size;
  }
  return { x: (width - best) / 2, y: 0, width: best, height: best * 2 };
}

/** Rails stop before control targets even when a custom group moves upward. */
export function computeRailGeometry(
  board: ControlRect,
  height: number,
  controls: ControlGeometry,
  layout: UserSettings["controlLayout"],
): { left: ControlRect; right: ControlRect } {
  const obstacles = controlObstacles(height, controls, layout);
  const rail = (x: number): ControlRect => ({
    x,
    y: 0,
    width: SIDE_RAIL_WIDTH,
    height: Math.max(
      0,
      Math.min(
        board.height,
        ...obstacles
          .filter(
            (rect) => rect.x < x + SIDE_RAIL_WIDTH && rect.x + rect.width > x,
          )
          .map((rect) => rect.y - 8),
      ),
    ),
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
  const rect = (x: number, y: number) => ({
    x,
    y,
    width: buttonSize,
    height: buttonSize,
  });

  return {
    width: usableWidth,
    height: rowsHeight + bottomPadding,
    buttonSize,
    bottomPadding,
    buttons: {
      MOVE_LEFT: rect(movementX, lowerY),
      SOFT_DROP: rect(movementX + buttonSize + gap, lowerY),
      MOVE_RIGHT: rect(movementX + 2 * (buttonSize + gap), lowerY),
      HARD_DROP: rect(movementX, 0),
      HOLD: rect(movementX + 2 * (buttonSize + gap), 0),
      ROTATE_CCW: rect(rotationX, lowerY),
      ROTATE_CW: rect(rotationX + buttonSize + gap, 0),
    },
  };
}

function separated(a: ControlRect, b: ControlRect): boolean {
  return (
    a.x + a.width + 8 <= b.x ||
    b.x + b.width + 8 <= a.x ||
    a.y + a.height + 8 <= b.y ||
    b.y + b.height + 8 <= a.y
  );
}

function availableRailHeight(geometry: ControlGeometry): number {
  const board = computeBoardGeometry(
    geometry.width,
    geometry.height,
    geometry,
    "gamepad",
  );
  const rails = computeRailGeometry(
    board,
    geometry.height,
    geometry,
    "gamepad",
  );
  return Math.min(rails.left.height, rails.right.height);
}

/** A resize may move only its own center inward to fit the screen edge. */
export function clampGamepadResize(
  geometry: ControlGeometry,
  id: GamepadControlId,
  placement: GamepadControlPlacement,
): GamepadControlPlacement {
  const cell = Math.max(
    48,
    Math.round(geometry.baseButtonSize! * placement.size),
  );
  const halfWidth = (cell * (id === "pad" ? 3 : 1)) / geometry.width / 2;
  const halfHeight = (cell * (id === "pad" ? 2 : 1)) / geometry.height / 2;
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
  return (
    Object.values(rect).every(Number.isFinite) &&
    rect.width >= (id === "pad" ? 144 : 48) &&
    rect.height >= (id === "pad" ? 96 : 48) &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= geometry.width &&
    rect.y + rect.height <= geometry.height &&
    availableRailHeight({
      ...geometry,
      groups: { ...geometry.groups!, [id]: rect },
    }) >= (geometry.minimumRailHeight ?? 0) &&
    GAMEPAD_CONTROL_IDS.every(
      (other) =>
        other === id ||
        !geometry.groups?.[other] ||
        separated(rect, geometry.groups[other]),
    )
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
  const custom = settings.gamepadLayouts?.[facing] ?? {};
  const cells = Object.fromEntries(
    GAMEPAD_CONTROL_IDS.map((id) => [
      id,
      Math.round(
        bounded(
          baseCell * bounded(custom[id]?.size ?? 1, 1, 0.75, 2),
          baseCell,
          48,
          Math.min(w / (id === "pad" ? 3 : 1), h / (id === "pad" ? 2 : 1)),
        ),
      ),
    ]),
  ) as Record<GamepadControlId, number>;
  const opacity = Object.fromEntries(
    GAMEPAD_CONTROL_IDS.map((id) => [
      id,
      bounded(custom[id]?.opacity ?? settings.controlOpacity, 0.18, 0.08, 0.6),
    ]),
  ) as Record<GamepadControlId, number>;
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
  const defaults: Record<GamepadControlId, ControlRect> = {
    pad: rect("pad", padX, h - bottom - 2 * padSize),
    hardDrop: rect("hardDrop", actionX, lowerY - actionSize - gap),
    hold: rect("hold", actionX + actionSize + gap, lowerY - actionSize - gap),
    rotateCCW: rect("rotateCCW", actionX, lowerY),
    rotateCW: rect("rotateCW", actionX + actionSize + gap, lowerY),
  };
  const groups = Object.fromEntries(
    GAMEPAD_CONTROL_IDS.map((id) => {
      const p = custom[id];
      const r = {
        ...defaults[id],
        width: cells[id] * (id === "pad" ? 3 : 1),
        height: cells[id] * (id === "pad" ? 2 : 1),
      };
      return [
        id,
        p
          ? {
              ...r,
              x: Math.round(bounded(p.x, 0.5, 0, 1) * w - r.width / 2),
              y: Math.round(bounded(p.y, 0.5, 0, 1) * h - r.height / 2),
            }
          : r,
      ];
    }),
  ) as Record<GamepadControlId, ControlRect>;
  for (const id of GAMEPAD_CONTROL_IDS) {
    const r = groups[id];
    groups[id] = {
      ...r,
      x: Math.max(0, Math.min(w - r.width, r.x)),
      y: Math.max(0, Math.min(h - r.height, r.y)),
    };
  }
  // Reject invalid legacy edits in place. Never search for spare space or move
  // unrelated groups when an editor changes one control. New edits are checked
  // with canPlaceGamepadGroup before being stored.
  const rejected = new Set<GamepadControlId>();
  for (let pass = 0; pass < GAMEPAD_CONTROL_IDS.length; pass++) {
    let changed = false;
    for (const id of GAMEPAD_CONTROL_IDS) {
      if (!custom[id] || rejected.has(id)) continue;
      if (
        !GAMEPAD_CONTROL_IDS.every(
          (other) => other === id || separated(groups[id], groups[other]),
        )
      ) {
        groups[id] = defaults[id];
        rejected.add(id);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const createGeometry = (
    placements: Record<GamepadControlId, ControlRect>,
  ): ControlGeometry => {
    const pad = placements.pad;
    const s = pad.width / 3;
    return {
      width: w,
      height: h,
      buttonSize: s,
      baseButtonSize: baseCell,
      bottomPadding: bottom,
      overlay: true,
      orientation: facing,
      pad,
      groups: placements,
      groupOpacity: opacity,
      buttons: {
        MOVE_LEFT: { x: pad.x, y: pad.y, width: s, height: s },
        MOVE_RIGHT: { x: pad.x + 2 * s, y: pad.y, width: s, height: s },
        SOFT_DROP: { x: pad.x + s, y: pad.y + s, width: s, height: s },
        HARD_DROP: placements.hardDrop,
        ROTATE_CW: placements.rotateCW,
        ROTATE_CCW: placements.rotateCCW,
        HOLD: placements.hold,
      },
    };
  };
  // Preserve saved maps, but never let an old custom placement remove access to
  // Pause or run information. The default arrangement defines the achievable
  // floor on very short screens; portrait and landscape use their actual tools.
  const minimum = Math.min(
    facing === "portrait" ? 256 : 220,
    availableRailHeight(createGeometry(defaults)),
  );
  const pending = new Set(
    GAMEPAD_CONTROL_IDS.filter((id) => !!custom[id] && !rejected.has(id)),
  );
  const collisionCount = (placements: Record<GamepadControlId, ControlRect>) =>
    GAMEPAD_CONTROL_IDS.reduce(
      (total, id, index) =>
        total +
        GAMEPAD_CONTROL_IDS.slice(index + 1).filter(
          (other) => !separated(placements[id], placements[other]),
        ).length,
      0,
    );
  while (
    (availableRailHeight(createGeometry(groups)) < minimum ||
      collisionCount(groups) > 0) &&
    pending.size
  ) {
    let best = [...pending][0]!;
    let bestHeight = -Infinity;
    for (const id of pending) {
      const candidate = { ...groups, [id]: defaults[id] };
      const candidateHeight =
        availableRailHeight(createGeometry(candidate)) -
        collisionCount(candidate) * 10000;
      if (candidateHeight > bestHeight) {
        best = id;
        bestHeight = candidateHeight;
      }
    }
    groups[best] = defaults[best];
    pending.delete(best);
  }
  return { ...createGeometry(groups), minimumRailHeight: minimum };
}
