import type {
  GameStateSnapshot,
  TetrominoType,
} from "../contracts/game-contract";
import { SHAPES, HIDDEN_ROWS } from "../engine/constants";

export const COLORS: Record<TetrominoType, string> = {
  I: "#8be5df",
  O: "#ead783",
  T: "#b7a0e4",
  S: "#a6d99b",
  Z: "#ed9792",
  J: "#91b6e7",
  L: "#edbb89",
};

function fit(
  canvas: HTMLCanvasElement,
): [CanvasRenderingContext2D, number, number] {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser does not support the game canvas.");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return [ctx, w, h];
}

function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: TetrominoType,
  ghost = false,
) {
  const gap = Math.max(1, size * 0.055);
  if (ghost) {
    ctx.strokeStyle = COLORS[type];
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(
      x + gap + 0.7,
      y + gap + 0.7,
      size - 2 * gap - 1.4,
      size - 2 * gap - 1.4,
    );
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = COLORS[type];
    ctx.fillRect(x + gap, y + gap, size - gap * 2, size - gap * 2);
  } else {
    ctx.fillStyle = COLORS[type];
    ctx.globalAlpha = 1;
    ctx.fillRect(x + gap, y + gap, size - 2 * gap, size - 2 * gap);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.24;
    ctx.fillRect(x + gap, y + gap, size - 2 * gap, Math.max(1, size * 0.08));
    ctx.fillStyle = "#142421";
    ctx.globalAlpha = 0.17;
    ctx.fillRect(
      x + gap,
      y + size - gap - Math.max(2, size * 0.12),
      size - 2 * gap,
      Math.max(2, size * 0.12),
    );
  }
  ctx.globalAlpha = 1;
}

export function drawBoard(
  canvas: HTMLCanvasElement,
  state: GameStateSnapshot,
  ghost: boolean,
  flashRows: number[] = [],
) {
  const [ctx, w, h] = fit(canvas),
    cell = w / 10;
  ctx.fillStyle = "#101a19";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ffffff07";
  ctx.lineWidth = 1;
  for (let x = 1; x < 10; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, h);
    ctx.stroke();
  }
  for (let y = 1; y < 20; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(w, y * cell);
    ctx.stroke();
  }
  for (let y = HIDDEN_ROWS; y < state.board.length; y++)
    state.board[y].forEach((type, x) => {
      if (type) block(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, type);
    });
  const active = state.active;
  if (active && state.status !== "paused") {
    const matrix = SHAPES[active.type][active.rotation];
    const piece = (py: number, isGhost: boolean) =>
      matrix.forEach((row, y) =>
        row.forEach((v, x) => {
          if (v && y + py >= HIDDEN_ROWS)
            block(
              ctx,
              (x + active.x) * cell,
              (y + py - HIDDEN_ROWS) * cell,
              cell,
              active.type,
              isGhost,
            );
        }),
      );
    if (ghost && active.ghostY !== active.y) piece(active.ghostY, true);
    piece(active.y, false);
  }
  for (const row of flashRows) {
    ctx.fillStyle = "#ddf9df30";
    ctx.fillRect(0, (row - HIDDEN_ROWS) * cell, w, cell);
  }
  if (state.status === "paused") {
    ctx.fillStyle = "#101a19b8";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c3d7cd";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("TAKE YOUR TIME", w / 2, h / 2);
  }
}

export function drawPreview(
  canvas: HTMLCanvasElement,
  type: TetrominoType | null,
  dim = false,
) {
  const [ctx, w, h] = fit(canvas);
  if (!type) return;
  const cells: [number, number][] = [];
  SHAPES[type][0].forEach((row, y) =>
    row.forEach((v, x) => {
      if (v) cells.push([x, y]);
    }),
  );
  const minX = Math.min(...cells.map((c) => c[0])),
    maxX = Math.max(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1])),
    maxY = Math.max(...cells.map((c) => c[1]));
  const size = Math.min(w / 5, h / 3.2, 19),
    ox = (w - (maxX - minX + 1) * size) / 2,
    oy = (h - (maxY - minY + 1) * size) / 2;
  if (dim) ctx.filter = "grayscale(1) opacity(.4)";
  cells.forEach(([x, y]) =>
    block(ctx, ox + (x - minX) * size, oy + (y - minY) * size, size, type),
  );
  ctx.filter = "none";
}
