import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThemeId, TetrominoType } from "../contracts/game-contract";
import { applyTheme, getTheme, THEMES } from "./themes";
import { drawBoard, drawPreview } from "./canvas-renderer";
import { createInitialState } from "../engine/engine";

const ids: ThemeId[] = ["ink", "lcd", "neon", "paper"];
const tokens = [
  "--bg",
  "--surface",
  "--panel",
  "--text",
  "--muted",
  "--border",
  "--accent",
  "--accent-ink",
  "--control-rgb",
  "--board-border",
];

describe("themes", () => {
  it("provides complete CSS and canvas palettes for all four themes", () => {
    for (const id of ids) {
      const theme = getTheme(id);
      expect(theme.id).toBe(id);
      expect(Object.keys(theme.css).sort()).toEqual([...tokens].sort());
      expect(theme.css["--control-rgb"]).toMatch(/^\d+ \d+ \d+$/);
      expect(Object.keys(theme.pieces).sort()).toEqual([
        "I",
        "J",
        "L",
        "O",
        "S",
        "T",
        "Z",
      ]);
      expect(Object.values(theme.board).every(Boolean)).toBe(true);
      expect(Object.values(theme.pieces).every(Boolean)).toBe(true);
    }
    expect(new Set(ids.map((id) => THEMES[id].board.background)).size).toBe(4);
    expect(new Set(ids.map((id) => THEMES[id].css["--bg"])).size).toBe(4);
    expect(new Set(ids.map((id) => THEMES[id].blockStyle)).size).toBe(4);
    expect(new Set(Object.values(THEMES.ink.pieces)).size).toBe(7);
  });

  it("updates every CSS variable and browser color scheme when switching themes", () => {
    const properties = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        colorScheme: "",
        setProperty: (key: string, value: string) => properties.set(key, value),
      },
    };
    for (const id of [...ids, "ink"] as ThemeId[]) {
      expect(applyTheme(id, root as unknown as HTMLElement)).toBe(THEMES[id]);
      expect(root.dataset.theme).toBe(id);
      expect(root.style.colorScheme).toBe(
        id === "lcd" || id === "paper" ? "light" : "dark",
      );
      expect(Object.fromEntries(properties)).toEqual(THEMES[id].css);
    }
  });

  it("falls back safely for unsupported and inherited theme names", () => {
    for (const id of [
      "removed-theme",
      "constructor",
      "__proto__",
      null,
      undefined,
    ]) {
      expect(getTheme(id as ThemeId)).toBe(THEMES.ink);
      const root = {
        dataset: {},
        style: { colorScheme: "", setProperty: () => {} },
      };
      expect(applyTheme(id as ThemeId, root as unknown as HTMLElement)).toBe(
        THEMES.ink,
      );
      expect(root.dataset).toEqual({ theme: "ink" });
      expect(root.style.colorScheme).toBe("dark");
    }
  });
});

describe("themed canvas rendering", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ignores collapsed canvases during responsive layout", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    const getContext = vi.fn();
    const canvas = {
      clientWidth: 0,
      clientHeight: 0,
      getContext,
    } as unknown as HTMLCanvasElement;
    drawPreview(canvas, "T");
    drawBoard(canvas, createInitialState("marathon", 1), true);
    expect(getContext).not.toHaveBeenCalled();
  });

  it("gives all seven monochrome pieces distinct internal patterns", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const patterns = new Set<string>();
    for (const type of Object.keys(THEMES.lcd.pieces) as TetrominoType[]) {
      const path: unknown[][] = [];
      let recording = false;
      const context = {
        globalAlpha: 1,
        setTransform() {},
        clearRect() {},
        save() {},
        restore() {},
        beginPath() {},
        clip() {},
        fillRect() {},
        translate() {
          recording = true;
        },
        rect(...args: number[]) {
          if (recording) path.push(["rect", ...args]);
        },
        moveTo(...args: number[]) {
          if (recording) path.push(["move", ...args]);
        },
        lineTo(...args: number[]) {
          if (recording) path.push(["line", ...args]);
        },
        stroke() {
          recording = false;
        },
      };
      const canvas = {
        clientWidth: 80,
        clientHeight: 48,
        width: 80,
        height: 48,
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
      drawPreview(canvas, type, false, THEMES.lcd);
      expect(path.length).toBeGreaterThan(0);
      patterns.add(JSON.stringify(path));
    }
    expect(patterns.size).toBe(7);
  });
});
