import { GAMEPAD_CONTROL_IDS } from "../contracts/game-contract";
import type {
  ControlOrientation,
  GamepadControlId,
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
  buttons: Record<
    ControlAction,
    { x: number; y: number; width: number; height: number }
  >;
}

/** Keep the full board horizontally centered and clear of the edited Gamepad. */
export function computeBoardGeometry(
  width: number,
  height: number,
  controls: ControlGeometry,
  layout: UserSettings["controlLayout"],
): ControlRect {
  if (layout !== "gamepad") {
    const available = Math.max(
      0,
      height - (layout === "floating" ? 0 : controls.height),
    );
    const size = Math.min(width, available / 2);
    return {
      x: (width - size) / 2,
      y: (available - size * 2) / 2,
      width: size,
      height: size * 2,
    };
  }
  const obstacles = Object.values(controls.groups!);
  const gap = 8;
  // Every free horizontal interval is bounded by the screen or a control edge.
  // Only consider board widths that keep the board on the screen's centerline.
  const edges = [
    0,
    width,
    ...obstacles.flatMap((r) => [
      Math.max(0, r.x - gap),
      Math.min(width, r.x + r.width + gap),
    ]),
  ];
  let best: ControlRect = { x: width / 2, y: 0, width: 0, height: 0 };
  for (const left of edges)
    for (const right of edges) {
      if (right <= left) continue;
      const ceiling = Math.min(
        height,
        ...obstacles
          .filter((r) => r.x < right + gap && r.x + r.width > left - gap)
          .map((r) => Math.max(0, r.y - gap)),
      );
      const size = Math.max(
        0,
        Math.min(width - 2 * left, 2 * right - width, ceiling / 2),
      );
      const x = (width - size) / 2;
      if (size > best.width) best = { x, y: 0, width: size, height: size * 2 };
    }
  return best;
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
  const scale = bounded(settings.controlScale, 1, 0.85, 1.3);
  const spread = bounded(settings.controlSpread, 0.65, 0, 1);
  const verticalOffset = bounded(settings.controlHeight, 0.3, 0, 1);
  const floating = settings.controlLayout === "floating";
  const gap = 8;
  const maxByWidth = Math.floor((usableWidth - 36) / 5);
  // Reserve 280px of board plus 8px separation whenever the viewport allows it.
  const maxByHeight = Math.floor(
    (usableHeight - (floating ? gap : 280 + 16)) / 2,
  );
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
  const clusterGap = 12 + Math.round(spread * horizontalSlack);
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
  const baseCell = Math.min(
    maxCell,
    Math.round(
      (settings.gamepadPreset === "compact" ? 50 : 60) *
        bounded(settings.controlScale, 1, 0.85, 1.3),
    ),
  );
  const custom = settings.gamepadLayouts?.[facing] ?? {};
  const cells = Object.fromEntries(
    GAMEPAD_CONTROL_IDS.map((id) => [
      id,
      Math.round(
        bounded(
          baseCell * bounded(custom[id]?.size ?? 1, 1, 0.75, 1.4),
          baseCell,
          48,
          maxCell,
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
  const pad = groups.pad;
  const s = pad.width / 3;
  return {
    width: w,
    height: h,
    buttonSize: s,
    bottomPadding: bottom,
    overlay: true,
    orientation: facing,
    pad,
    groups,
    groupOpacity: opacity,
    buttons: {
      MOVE_LEFT: { x: pad.x, y: pad.y, width: s, height: s },
      MOVE_RIGHT: { x: pad.x + 2 * s, y: pad.y, width: s, height: s },
      SOFT_DROP: { x: pad.x + s, y: pad.y + s, width: s, height: s },
      HARD_DROP: groups.hardDrop,
      ROTATE_CW: groups.rotateCW,
      ROTATE_CCW: groups.rotateCCW,
      HOLD: groups.hold,
    },
  };
}
