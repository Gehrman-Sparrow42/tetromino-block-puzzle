import type {
  GameStateSnapshot,
  TetrominoType,
} from "../contracts/game-contract";
import { SHAPES, HIDDEN_ROWS } from "../engine/constants";
import { THEMES, type ThemePalette } from "./themes";

export const COLORS = THEMES.ink.pieces;

function fit(
  canvas: HTMLCanvasElement,
): [CanvasRenderingContext2D, number, number] | null {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (w <= 0 || h <= 0) return null;
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

/** Light cutouts in dark phosphor keep LCD pieces identifiable without color. */
function lcdPattern(
  ctx: CanvasRenderingContext2D,
  type: TetrominoType,
  size: number,
) {
  ctx.lineWidth = Math.max(1, size * 0.055);
  const lo = size * 0.27,
    hi = size * 0.73,
    mid = size / 2;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  };
  ctx.beginPath();
  switch (type) {
    case "I":
      line(lo, mid, hi, mid);
      break;
    case "O":
      ctx.rect(lo, lo, hi - lo, hi - lo);
      break;
    case "T":
      line(lo, mid, hi, mid);
      line(mid, lo, mid, hi);
      break;
    case "S":
      line(lo, hi, hi, lo);
      break;
    case "Z":
      line(lo, lo, hi, hi);
      break;
    case "J":
      line(lo, lo, lo, hi);
      line(lo, hi, hi, hi);
      break;
    case "L":
      line(hi, lo, hi, hi);
      line(lo, hi, hi, hi);
      break;
  }
  ctx.stroke();
}

/** Deliberately sparse marks stay readable in next/hold previews as well as the board. */
function printPattern(
  ctx: CanvasRenderingContext2D,
  type: TetrominoType,
  size: number,
) {
  const lo = size * 0.27,
    hi = size * 0.73,
    mid = size / 2;
  ctx.lineWidth = Math.max(0.7, size * 0.055);
  ctx.beginPath();
  const line = (x: number, y: number, a: number, b: number) => {
    ctx.moveTo(x, y);
    ctx.lineTo(a, b);
  };
  switch (type) {
    case "I":
      line(lo, lo, hi, lo);
      line(lo, mid, hi, mid);
      line(lo, hi, hi, hi);
      break;
    case "O":
      for (const x of [lo, hi])
        for (const y of [lo, hi]) {
          ctx.moveTo(x + size * 0.055, y);
          ctx.arc(x, y, size * 0.055, 0, Math.PI * 2);
        }
      break;
    case "T":
      line(mid, lo, mid, hi);
      line(lo, mid, hi, mid);
      break;
    case "S":
      line(lo, mid, mid, lo);
      line(lo, hi, hi, lo);
      line(mid, hi, hi, mid);
      break;
    case "Z":
      line(lo, lo, hi, hi);
      line(lo, mid, mid, hi);
      line(mid, lo, hi, mid);
      break;
    case "J":
      line(lo, lo, lo, hi);
      line(mid, lo, mid, hi);
      line(hi, lo, hi, hi);
      break;
    case "L":
      ctx.rect(lo, lo, hi - lo, hi - lo);
      ctx.rect(
        mid - size * 0.055,
        mid - size * 0.055,
        size * 0.11,
        size * 0.11,
      );
      break;
  }
  ctx.stroke();
}

function designedBlock(
  ctx: CanvasRenderingContext2D,
  size: number,
  type: TetrominoType,
  theme: ThemePalette,
  opacity: number,
) {
  const a = size * 0.16,
    edge = size * 0.68;
  ctx.lineWidth = Math.max(0.6, size * 0.04);
  switch (theme.blockStyle) {
    case "phosphor":
      ctx.strokeStyle = theme.board.background;
      printPattern(ctx, type, size);
      ctx.globalAlpha = opacity * 0.45;
      ctx.strokeRect(a * 0.6, a * 0.6, size - a * 1.2, size - a * 1.2);
      break;
    case "crystal":
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = opacity * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, 0);
      ctx.lineTo(size * 0.3, size * 0.42);
      ctx.lineTo(0, size);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.board.text;
      ctx.globalAlpha = opacity * 0.45;
      ctx.beginPath();
      ctx.moveTo(size * 0.3, size * 0.42);
      ctx.lineTo(size, size);
      ctx.stroke();
      break;
    case "glaze":
      ctx.strokeStyle = theme.board.text;
      ctx.globalAlpha = opacity * 0.5;
      ctx.strokeRect(a * 0.65, a * 0.65, size - a * 1.3, size - a * 1.3);
      ctx.fillStyle = "#fff0df";
      ctx.globalAlpha = opacity * 0.5;
      ctx.fillRect(a * 1.4, a * 1.4, size * 0.4, size * 0.09);
      ctx.fillRect(a * 1.4, a * 2.3, size * 0.09, size * 0.15);
      break;
    case "draft":
      ctx.fillStyle = theme.board.background;
      ctx.fillRect(a * 0.6, a * 0.6, size - a * 1.2, size - a * 1.2);
      ctx.strokeStyle = theme.pieces[type];
      ctx.strokeRect(a * 0.6, a * 0.6, size - a * 1.2, size - a * 1.2);
      ctx.globalAlpha = opacity * 0.7;
      ctx.beginPath();
      ctx.moveTo(a, size - a);
      ctx.lineTo(size - a, a);
      ctx.moveTo(a, a);
      ctx.lineTo(a * 2, a);
      ctx.lineTo(a * 2, a * 2);
      ctx.stroke();
      break;
    case "facet":
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = opacity * 0.19;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.3);
      ctx.lineTo(size * 0.3, 0);
      ctx.lineTo(size, 0);
      ctx.lineTo(size * 0.68, size * 0.24);
      ctx.lineTo(size * 0.24, size * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = opacity * 0.17;
      ctx.fillStyle = theme.board.background;
      ctx.beginPath();
      ctx.moveTo(0, size);
      ctx.lineTo(size * 0.25, size * 0.78);
      ctx.lineTo(size * 0.78, size * 0.73);
      ctx.lineTo(size, size * 0.5);
      ctx.lineTo(size, size);
      ctx.closePath();
      ctx.fill();
      break;
    case "enamel":
      ctx.strokeStyle = theme.board.text;
      ctx.globalAlpha = opacity * 0.55;
      ctx.strokeRect(a, a, edge, edge);
      ctx.globalAlpha = opacity * 0.45;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(a * 1.3, a * 1.3, edge * 0.8, Math.max(0.6, size * 0.045));
      break;
    case "outline":
      ctx.strokeStyle = "#f0eee8";
      ctx.globalAlpha = opacity * 0.8;
      ctx.strokeRect(a * 0.65, a * 0.65, size - a * 1.3, size - a * 1.3);
      break;
    case "notation":
    case "data":
      ctx.strokeStyle = theme.board.background;
      printPattern(ctx, type, size);
      break;
    case "botanical":
      ctx.strokeStyle = theme.board.background;
      ctx.globalAlpha = opacity * 0.65;
      ctx.beginPath();
      ctx.moveTo(a, a);
      ctx.lineTo(size - a, a);
      ctx.lineTo(size - a, size - a);
      ctx.stroke();
      ctx.fillStyle = theme.board.background;
      ctx.fillRect(a, size - a * 1.5, size * 0.11, size * 0.11);
      break;
    case "segment":
      ctx.fillStyle = theme.board.background;
      ctx.globalAlpha = opacity * 0.65;
      ctx.fillRect(0, size * 0.47, size, Math.max(0.7, size * 0.055));
      ctx.strokeStyle = theme.board.background;
      ctx.strokeRect(a * 0.65, a * 0.65, size - a * 1.3, size - a * 1.3);
      break;
    case "plate":
      ctx.strokeStyle = theme.board.text;
      ctx.globalAlpha = opacity * 0.62;
      ctx.strokeRect(a, a, edge, edge);
      ctx.fillStyle = theme.board.text;
      ctx.fillRect(size * 0.64, size * 0.64, size * 0.1, size * 0.1);
      break;
    // Classic uses uninterrupted, bright solid tiles.
    case "solid":
      break;
  }
}

function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: TetrominoType,
  theme: ThemePalette,
  ghost = false,
) {
  if (size <= 0) return;
  const gap = Math.min(size / 5, Math.max(0.7, size * 0.055));
  const side = size - 2 * gap;
  ctx.save();
  const opacity = ctx.globalAlpha;
  ctx.beginPath();
  ctx.rect(x + gap, y + gap, side, side);
  ctx.clip();
  if (ghost) {
    ctx.strokeStyle = theme.board.ghost;
    ctx.lineWidth = Math.min(1.5, side / 3);
    if (theme.blockStyle === "lcd") ctx.setLineDash([2, 2]);
    else
      ctx.setLineDash([Math.max(2, size * 0.15), Math.max(1.5, size * 0.09)]);
    const inset = ctx.lineWidth / 2;
    ctx.strokeRect(
      x + gap + inset,
      y + gap + inset,
      side - 2 * inset,
      side - 2 * inset,
    );
    ctx.globalAlpha = opacity * 0.07;
    ctx.fillStyle = theme.board.ghost;
    ctx.fillRect(x + gap, y + gap, side, side);
  } else {
    ctx.fillStyle = theme.pieces[type];
    ctx.fillRect(x + gap, y + gap, side, side);
    if (!["lcd", "flat", "neon", "bevel"].includes(theme.blockStyle)) {
      if (size >= 4) {
        ctx.translate(x, y);
        designedBlock(ctx, size, type, theme, opacity);
      }
    } else if (theme.blockStyle === "lcd" && size >= 4) {
      ctx.translate(x, y);
      ctx.strokeStyle = theme.board.background;
      lcdPattern(ctx, type, size);
    } else if (theme.blockStyle === "flat") {
      ctx.strokeStyle = theme.board.text;
      ctx.lineWidth = Math.min(1.2, side / 3);
      const inset = ctx.lineWidth / 2;
      ctx.strokeRect(
        x + gap + inset,
        y + gap + inset,
        side - 2 * inset,
        side - 2 * inset,
      );
    } else if (theme.blockStyle === "neon") {
      ctx.fillStyle = theme.board.background;
      ctx.globalAlpha = opacity * 0.3;
      const inset = Math.min(2, side / 4);
      ctx.fillRect(
        x + gap + inset,
        y + gap + inset,
        side - inset * 2,
        side - inset * 2,
      );
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = theme.pieces[type];
      ctx.shadowColor = theme.pieces[type];
      ctx.shadowBlur = Math.min(6, size * 0.2);
      ctx.lineWidth = Math.min(1.5, side / 3);
      ctx.strokeRect(
        x + gap + 1,
        y + gap + 1,
        Math.max(0, side - 2),
        Math.max(0, side - 2),
      );
    } else if (theme.blockStyle === "bevel") {
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = opacity * 0.3;
      ctx.fillRect(
        x + gap,
        y + gap,
        side,
        Math.min(side, Math.max(1, size * 0.08)),
      );
      ctx.fillStyle = theme.board.background;
      ctx.globalAlpha = opacity * 0.22;
      const bevel = Math.min(side, Math.max(1, size * 0.1));
      ctx.fillRect(x + gap, y + size - gap - bevel, side, bevel);
    }
  }
  ctx.restore();
}

export function drawBoard(
  canvas: HTMLCanvasElement,
  state: GameStateSnapshot,
  ghost: boolean,
  flashRows: number[] = [],
  theme: ThemePalette = THEMES.ink,
) {
  const fitted = fit(canvas);
  if (!fitted) return;
  const [ctx, w, h] = fitted,
    cell = w / 10;
  ctx.fillStyle = theme.board.background;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = theme.board.grid;
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
      if (type)
        block(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, type, theme);
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
              theme,
              isGhost,
            );
        }),
      );
    if (ghost && active.ghostY !== active.y) piece(active.ghostY, true);
    piece(active.y, false);
  }
  for (const row of flashRows) {
    ctx.fillStyle = theme.board.flash;
    ctx.fillRect(0, (row - HIDDEN_ROWS) * cell, w, cell);
  }
  if (state.status === "paused") {
    ctx.fillStyle = theme.board.pausedOverlay;
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawPreview(
  canvas: HTMLCanvasElement,
  type: TetrominoType | null,
  dim = false,
  theme: ThemePalette = THEMES.ink,
) {
  const fitted = fit(canvas);
  if (!fitted) return;
  const [ctx, w, h] = fitted;
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
  ctx.save();
  if (dim) ctx.globalAlpha = 0.4;
  cells.forEach(([x, y]) =>
    block(
      ctx,
      ox + (x - minX) * size,
      oy + (y - minY) * size,
      size,
      type,
      theme,
    ),
  );
  ctx.restore();
}
