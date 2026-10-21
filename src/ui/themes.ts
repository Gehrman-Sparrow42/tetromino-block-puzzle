import type { ThemeId, TetrominoType } from "../contracts/game-contract";

export interface ThemePalette {
  id: ThemeId;
  name: string;
  css: Record<string, string>;
  board: {
    background: string;
    grid: string;
    ghost: string;
    flash: string;
    pausedOverlay: string;
    text: string;
  };
  pieces: Record<TetrominoType, string>;
  blockStyle: "bevel" | "lcd" | "neon" | "flat";
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  ink: {
    id: "ink",
    name: "Ink",
    blockStyle: "bevel",
    css: {
      "--bg": "#0b0d12",
      "--surface": "#131722",
      "--panel": "#1c2230",
      "--text": "#f1f3f8",
      "--muted": "#a7b1c6",
      "--border": "#354058",
      "--accent": "#94f1d0",
      "--accent-ink": "#0b2820",
      "--control-rgb": "151 174 208",
      "--board-border": "#3b465d",
    },
    board: {
      background: "#0f131c",
      grid: "#1b2230",
      ghost: "#a9b7cd",
      flash: "#c6ffed70",
      pausedOverlay: "#0b0d12bb",
      text: "#f1f3f8",
    },
    pieces: {
      I: "#48dce5",
      O: "#f3cd50",
      T: "#bb85ef",
      S: "#7cdb88",
      Z: "#f77888",
      J: "#6e9df6",
      L: "#f2a05a",
    },
  },
  lcd: {
    id: "lcd",
    name: "LCD",
    blockStyle: "lcd",
    css: {
      "--bg": "#b9c49a",
      "--surface": "#cbd5ad",
      "--panel": "#d9e1be",
      "--text": "#22331c",
      "--muted": "#435334",
      "--border": "#6a7a4b",
      "--accent": "#2b431d",
      "--accent-ink": "#e1edbf",
      "--control-rgb": "39 60 29",
      "--board-border": "#354e23",
    },
    board: {
      background: "#a9bc78",
      grid: "#9aae6b",
      ghost: "#4a622e",
      flash: "#263f2370",
      pausedOverlay: "#a9bc78c9",
      text: "#22331c",
    },
    pieces: {
      I: "#263f23",
      O: "#263f23",
      T: "#263f23",
      S: "#263f23",
      Z: "#263f23",
      J: "#263f23",
      L: "#263f23",
    },
  },
  neon: {
    id: "neon",
    name: "Neon",
    blockStyle: "neon",
    css: {
      "--bg": "#0a0614",
      "--surface": "#170e29",
      "--panel": "#25143d",
      "--text": "#f4edff",
      "--muted": "#c3addb",
      "--border": "#654483",
      "--accent": "#5df5eb",
      "--accent-ink": "#09272a",
      "--control-rgb": "200 139 255",
      "--board-border": "#8253a8",
    },
    board: {
      background: "#0c071b",
      grid: "#251538",
      ghost: "#cc9bff",
      flash: "#ff73ee80",
      pausedOverlay: "#10081bc4",
      text: "#f4edff",
    },
    pieces: {
      I: "#49f5ed",
      O: "#ffe764",
      T: "#d983ff",
      S: "#a1ff65",
      Z: "#ff649b",
      J: "#6baaff",
      L: "#ffae5e",
    },
  },
  paper: {
    id: "paper",
    name: "Paper",
    blockStyle: "flat",
    css: {
      "--bg": "#f4f1ea",
      "--surface": "#eae5db",
      "--panel": "#fcfbf8",
      "--text": "#2c2a29",
      "--muted": "#686055",
      "--border": "#ada294",
      "--accent": "#30594c",
      "--accent-ink": "#ffffff",
      "--control-rgb": "64 56 45",
      "--board-border": "#8f8475",
    },
    board: {
      background: "#fcfbf9",
      grid: "#e3ded6",
      ghost: "#62594d",
      flash: "#b88b3860",
      pausedOverlay: "#f4f1eac4",
      text: "#2c2a29",
    },
    pieces: {
      I: "#4f9a9d",
      O: "#c8a545",
      T: "#9a789f",
      S: "#6f9868",
      Z: "#c57767",
      J: "#7293b8",
      L: "#c89159",
    },
  },
};

export function getTheme(id: ThemeId): ThemePalette {
  return Object.prototype.hasOwnProperty.call(THEMES, id)
    ? THEMES[id]
    : THEMES.ink;
}

export function applyTheme(
  id: ThemeId,
  root: HTMLElement = document.documentElement,
): ThemePalette {
  const theme = getTheme(id);
  root.dataset.theme = theme.id;
  root.style.colorScheme =
    theme.id === "paper" || theme.id === "lcd" ? "light" : "dark";
  for (const [property, value] of Object.entries(theme.css))
    root.style.setProperty(property, value);
  return theme;
}
