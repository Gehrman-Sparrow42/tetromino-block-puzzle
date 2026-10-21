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
  const maxCell = Math.max(
    48,
    Math.floor(Math.min((w - 16) / 5, (h - gap) / 2)),
  );
  const baseCell = Math.min(
    maxCell,
    Math.round(64 * bounded(settings.controlScale, 1, 0.85, 1.3)),
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
  const padSize = cells.pad;
  const actionSize = Math.max(
    cells.hardDrop,
    cells.rotateCW,
    cells.rotateCCW,
    cells.hold,
  );
  const bottom = Math.min(
    12 + Math.round(bounded(settings.controlHeight, 0.3, 0, 1) * 32),
    Math.max(0, h - Math.max(2 * padSize, 3 * actionSize + 2 * gap)),
  );
  const padX = Math.min(
    8,
    Math.max(0, w - 3 * padSize - 2 * actionSize - 2 * gap),
  );
  const right = w - actionSize;
  const left = right - actionSize - gap;
  const bottomY = h - bottom - actionSize;
  // Short screens use two action rows so controls leave a readable board above.
  const roomy = 3 * actionSize + 2 * gap + 320 <= h - bottom;
  const rect = (id: GamepadControlId, x: number, y: number): ControlRect => ({
    x: Math.round(x),
    y: Math.round(y),
    width: cells[id] * (id === "pad" ? 3 : 1),
    height: cells[id] * (id === "pad" ? 2 : 1),
  });
  const defaults: Record<GamepadControlId, ControlRect> = {
    pad: rect("pad", padX, h - bottom - 2 * padSize),
    hardDrop: rect("hardDrop", left, bottomY - (roomy ? actionSize + gap : 0)),
    rotateCW: rect("rotateCW", right, bottomY - actionSize - gap),
    rotateCCW: rect("rotateCCW", right, bottomY),
    hold: rect(
      "hold",
      roomy ? right : left,
      bottomY - (roomy ? 2 : 1) * (actionSize + gap),
    ),
  };
  const clampRect = (r: ControlRect): ControlRect => ({
    ...r,
    x: Math.round(bounded(r.x, 0, 0, w - r.width)),
    y: Math.round(bounded(r.y, 0, 0, h - r.height)),
  });
  const separated = (a: ControlRect, b: ControlRect) =>
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y;
  let groups = {} as Record<GamepadControlId, ControlRect>;
  let failed = false;
  for (const id of GAMEPAD_CONTROL_IDS) {
    const p = custom[id];
    const target = clampRect(
      p
        ? {
            ...defaults[id],
            x: bounded(p.x, 0.5, 0, 1) * w - defaults[id].width / 2,
            y: bounded(p.y, 0.5, 0, 1) * h - defaults[id].height / 2,
          }
        : defaults[id],
    );
    const placed = Object.values(groups);
    const xs = [
      target.x,
      0,
      w - target.width,
      ...placed.flatMap((r) => [r.x - target.width - gap, r.x + r.width + gap]),
    ];
    const ys = [
      target.y,
      0,
      h - target.height,
      ...placed.flatMap((r) => [
        r.y - target.height - gap,
        r.y + r.height + gap,
      ]),
    ];
    let winner: ControlRect | undefined;
    let distance = Infinity;
    for (const x of xs)
      for (const y of ys) {
        const candidate = clampRect({ ...target, x, y });
        if (!placed.every((other) => separated(candidate, other))) continue;
        const d = (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2;
        if (d < distance) {
          winner = candidate;
          distance = d;
        }
      }
    if (!winner) {
      failed = true;
      break;
    }
    groups[id] = winner;
  }
  // Pathological edits can partition the remaining space. A deterministic 2x2
  // action cluster always fits alongside the pad at the clamped target sizes.
  if (failed) {
    groups = {
      pad: rect("pad", 0, h - 2 * padSize),
      hardDrop: rect("hardDrop", left, h - actionSize),
      rotateCW: rect("rotateCW", right, h - 2 * actionSize - gap),
      rotateCCW: rect("rotateCCW", right, h - actionSize),
      hold: rect("hold", left, h - 2 * actionSize - gap),
    };
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
