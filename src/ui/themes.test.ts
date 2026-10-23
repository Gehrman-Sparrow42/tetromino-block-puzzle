import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThemeId, TetrominoType } from "../contracts/game-contract";
import { applyTheme, getTheme, THEMES } from "./themes";
import { drawBoard, drawPreview } from "./canvas-renderer";
import { createInitialState } from "../engine/engine";
import { THEME_IDS } from "../contracts/game-contract";

const ids = THEME_IDS;
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
  it("provides complete CSS and canvas palettes for every selectable theme", () => {
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
    expect(new Set(ids.map((id) => THEMES[id].board.background)).size).toBe(
      ids.length,
    );
    expect(new Set(ids.map((id) => THEMES[id].css["--bg"])).size).toBe(
      ids.length,
    );
    expect(new Set(ids.map((id) => THEMES[id].blockStyle)).size).toBe(
      ids.length,
    );
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
        [
          "lcd",
          "paper",
          "workshop",
          "score",
          "folio",
          "annual",
          "glacier",
          "clay",
        ].includes(id)
          ? "light"
          : "dark",
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

  it("keeps body, secondary labels and primary button text readable in every shell", () => {
    const luminance = (hex: string) => {
      const channels = hex
        .slice(1)
        .match(/../g)!
        .map((v) => parseInt(v, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (a: string, b: string) => {
      const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const id of ids) {
      const css = THEMES[id].css;
      for (const surface of ["--bg", "--surface", "--panel"]) {
        expect(
          contrast(css["--text"], css[surface]),
          `${id} text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(css["--muted"], css[surface]),
          `${id} secondary text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(css["--accent"], css[surface]),
          `${id} accent text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(css["--accent"], css["--accent-ink"]),
        `${id} primary button`,
      ).toBeGreaterThanOrEqual(4.5);
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

  it("renders distinct static patterns for all seven Score and Data pieces", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    for (const theme of [THEMES.score, THEMES.data, THEMES.amber]) {
      const patterns = new Set<string>();
      for (const type of Object.keys(theme.pieces) as TetrominoType[]) {
        const paths: unknown[][] = [];
        let recording = false;
        const context = new Proxy(
          { globalAlpha: 1 } as Record<PropertyKey, unknown>,
          {
            get(target, key) {
              if (key in target) return target[key];
              return (...args: unknown[]) => {
                if (key === "translate") recording = true;
                if (
                  recording &&
                  ["rect", "moveTo", "lineTo", "arc"].includes(String(key))
                )
                  paths.push([key, ...args]);
                if (key === "stroke") recording = false;
              };
            },
            set(target, key, value) {
              target[key] = value;
              return true;
            },
          },
        );
        const canvas = {
          clientWidth: 80,
          clientHeight: 48,
          width: 80,
          height: 48,
          getContext: () => context,
        } as unknown as HTMLCanvasElement;
        drawPreview(canvas, type, false, theme);
        expect(paths.length).toBeGreaterThan(0);
        patterns.add(JSON.stringify(paths));
      }
      expect(patterns.size).toBe(7);
    }
  });

  it("renders all theme treatments on tiny canvases without negative or nonfinite geometry", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    for (const id of ids) {
      for (const size of [1, 3, 12, 40]) {
        const context = new Proxy(
          { globalAlpha: 1 } as Record<PropertyKey, unknown>,
          {
            get(target, key) {
              if (key in target) return target[key];
              return (...args: unknown[]) => {
                for (const n of args)
                  if (typeof n === "number")
                    expect(Number.isFinite(n)).toBe(true);
                if (["fillRect", "strokeRect", "rect"].includes(String(key))) {
                  expect(args[2]).toBeGreaterThanOrEqual(0);
                  expect(args[3]).toBeGreaterThanOrEqual(0);
                }
              };
            },
            set(target, key, value) {
              target[key] = value;
              return true;
            },
          },
        );
        const canvas = {
          clientWidth: size,
          clientHeight: size * 2,
          width: size,
          height: size * 2,
          getContext: () => context,
        } as unknown as HTMLCanvasElement;
        drawBoard(
          canvas,
          createInitialState("marathon", 1),
          true,
          [],
          THEMES[id],
        );
        drawPreview(canvas, "O", true, THEMES[id]);
      }
    }
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
