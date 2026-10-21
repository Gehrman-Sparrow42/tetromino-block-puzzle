import type { UserSettings } from "../contracts/game-contract";

export type ControlAction =
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "SOFT_DROP"
  | "HARD_DROP"
  | "ROTATE_CW"
  | "ROTATE_CCW"
  | "HOLD";

export interface ControlGeometry {
  width: number;
  /** Actual control deck height, including the empty space below the buttons. */
  height: number;
  buttonSize: number;
  bottomPadding: number;
  buttons: Record<
    ControlAction,
    { x: number; y: number; width: number; height: number }
  >;
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
): ControlGeometry {
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
