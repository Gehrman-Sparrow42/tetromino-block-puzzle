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
  blockStyle:
    | "bevel"
    | "lcd"
    | "neon"
    | "flat"
    | "facet"
    | "enamel"
    | "outline"
    | "notation"
    | "botanical"
    | "segment"
    | "plate"
    | "data"
    | "solid"
    | "phosphor"
    | "crystal"
    | "glaze"
    | "draft";
}

/** Keep the complete shell palette together so switching themes never leaves stale tokens. */
function palette(
  id: ThemeId,
  name: string,
  blockStyle: ThemePalette["blockStyle"],
  shell: [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ],
  board: [string, string, string, string],
  pieces: [string, string, string, string, string, string, string],
): ThemePalette {
  const [background, grid, ghost, flash] = board;
  return {
    id,
    name,
    blockStyle,
    css: Object.fromEntries(
      [
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
      ].map((key, index) => [key, shell[index]]),
    ),
    board: {
      background,
      grid,
      ghost,
      flash,
      pausedOverlay: `${background}d9`,
      text: shell[3],
    },
    pieces: Object.fromEntries(
      ["I", "O", "T", "S", "Z", "J", "L"].map((key, index) => [
        key,
        pieces[index],
      ]),
    ) as Record<TetrominoType, string>,
  };
}

export const THEMES: Record<ThemeId, ThemePalette> = {
  amber: palette(
    "amber",
    "Amber Terminal",
    "phosphor",
    [
      "#21180c",
      "#302312",
      "#3c2c16",
      "#ffe0a0",
      "#dbb77d",
      "#967243",
      "#ffc65e",
      "#2c1d08",
      "255 198 94",
      "#b78c4f",
    ],
    ["#271c0d", "#3a2b15", "#d9b778", "#ffc65e60"],
    [
      "#ffc65e",
      "#ffc65e",
      "#ffc65e",
      "#ffc65e",
      "#ffc65e",
      "#ffc65e",
      "#ffc65e",
    ],
  ),
  glacier: palette(
    "glacier",
    "Glacier",
    "crystal",
    [
      "#eaf3f7",
      "#dceaf0",
      "#f7fcff",
      "#173a4c",
      "#436270",
      "#809fab",
      "#205a73",
      "#f7fcff",
      "32 90 115",
      "#638b9d",
    ],
    ["#f0f9fc", "#d1e5ed", "#547a8a", "#3b8cab45"],
    [
      "#3e8298",
      "#ac9149",
      "#8679a9",
      "#528b7b",
      "#ae6b79",
      "#5278a9",
      "#b17b50",
    ],
  ),
  clay: palette(
    "clay",
    "Fired Clay",
    "glaze",
    [
      "#ead7c4",
      "#ddc4ad",
      "#f6e9d9",
      "#442a23",
      "#694a3c",
      "#a17a62",
      "#833c2c",
      "#fff0df",
      "131 60 44",
      "#865a43",
    ],
    ["#edddca", "#d8bea5", "#815c47", "#a9483345"],
    [
      "#4a7b7c",
      "#b58c38",
      "#8c657d",
      "#688154",
      "#a94c39",
      "#58708b",
      "#b46f3c",
    ],
  ),
  blueprint: palette(
    "blueprint",
    "Blueprint",
    "draft",
    [
      "#102b45",
      "#173750",
      "#1e425c",
      "#e3f5fa",
      "#aed1df",
      "#6594ac",
      "#9fe5f3",
      "#103149",
      "159 229 243",
      "#7db9cc",
    ],
    ["#12334e", "#214b66", "#b3dbe9", "#9fe5f350"],
    [
      "#90dbed",
      "#eddb9b",
      "#c5bce7",
      "#addbc3",
      "#ecaeb2",
      "#accbf0",
      "#edc09e",
    ],
  ),
  basalt: palette(
    "basalt",
    "Basalt",
    "facet",
    [
      "#17252c",
      "#233840",
      "#2b4249",
      "#e6f0e9",
      "#b4c9c7",
      "#607b80",
      "#b4edb8",
      "#172c21",
      "180 237 184",
      "#75928e",
    ],
    ["#20343b", "#294149", "#bed8ce", "#b4edb860"],
    [
      "#88beb1",
      "#e4d188",
      "#d5b9e3",
      "#b4edb8",
      "#d99591",
      "#a4c9d7",
      "#efaa78",
    ],
  ),
  workshop: palette(
    "workshop",
    "Workshop",
    "enamel",
    [
      "#f3eddd",
      "#e7deca",
      "#fffaf0",
      "#172e45",
      "#525d64",
      "#9a9386",
      "#af3020",
      "#fffaf0",
      "23 46 69",
      "#172e45",
    ],
    ["#e4dbc7", "#d3c9b4", "#59616a", "#cf402d45"],
    [
      "#172e45",
      "#e5b345",
      "#ad779b",
      "#6b9e89",
      "#cf402d",
      "#48799e",
      "#d88f55",
    ],
  ),
  sleeve: palette(
    "sleeve",
    "Night Sleeve",
    "outline",
    [
      "#101216",
      "#191b20",
      "#22252a",
      "#f0eee8",
      "#bcbab4",
      "#66686b",
      "#eb7758",
      "#21130d",
      "240 238 232",
      "#777971",
    ],
    ["#15171b", "#25272c", "#d3d0c7", "#f0eee850"],
    [
      "#5ebdc4",
      "#d7c86d",
      "#b29bcc",
      "#92bc8b",
      "#eb7758",
      "#8aa9d3",
      "#dba26d",
    ],
  ),
  score: palette(
    "score",
    "Movement Score",
    "notation",
    [
      "#f6f2e8",
      "#eae6db",
      "#fffdf7",
      "#282b30",
      "#626159",
      "#aaa79c",
      "#a74233",
      "#fffdf7",
      "40 43 48",
      "#63645e",
    ],
    ["#f9f6ee", "#e3e0d6", "#737268", "#dc715e50"],
    [
      "#282b30",
      "#414448",
      "#b94e3c",
      "#373c3b",
      "#4e4441",
      "#454952",
      "#53504a",
    ],
  ),
  folio: palette(
    "folio",
    "Botanical Folio",
    "botanical",
    [
      "#eee8d8",
      "#e2ddca",
      "#faf6e9",
      "#263c2b",
      "#57664e",
      "#929d81",
      "#305b3a",
      "#fffcef",
      "48 91 58",
      "#75856a",
    ],
    ["#f6f1e1", "#e0e3ce", "#607756", "#b73d3540"],
    [
      "#517c73",
      "#b6a350",
      "#95728a",
      "#5d8553",
      "#b73d35",
      "#5b7892",
      "#ba8150",
    ],
  ),
  gate: palette(
    "gate",
    "Gate Board",
    "segment",
    [
      "#1e303b",
      "#273d48",
      "#304854",
      "#e9eceb",
      "#b7c5cb",
      "#738893",
      "#eab644",
      "#202c31",
      "233 236 235",
      "#879aa1",
    ],
    ["#172833", "#223a46", "#b9c9ce", "#eab64460"],
    [
      "#a9d5db",
      "#eab644",
      "#c5b5da",
      "#a3c99b",
      "#e79781",
      "#93b6db",
      "#e4b17a",
    ],
  ),
  annual: palette(
    "annual",
    "Design Annual",
    "plate",
    [
      "#f5f4f6",
      "#e9e8ed",
      "#ffffff",
      "#16181a",
      "#60616c",
      "#aaaab8",
      "#535491",
      "#ffffff",
      "67 68 101",
      "#8a8b9d",
    ],
    ["#fbfafc", "#e3e2e9", "#6a6b85", "#a8a9d860"],
    [
      "#727ba5",
      "#c9ac65",
      "#9291ba",
      "#7d9d88",
      "#b87d89",
      "#688caa",
      "#ba9576",
    ],
  ),
  data: palette(
    "data",
    "Data Field",
    "data",
    [
      "#101112",
      "#191a1b",
      "#242526",
      "#f3f4f1",
      "#b8bcb7",
      "#696e68",
      "#f3f4f1",
      "#101112",
      "243 244 241",
      "#8b918a",
    ],
    ["#121415", "#242728", "#b4beb3", "#f3f4f145"],
    [
      "#f3f4f1",
      "#f3f4f1",
      "#f3f4f1",
      "#f3f4f1",
      "#f3f4f1",
      "#f3f4f1",
      "#f3f4f1",
    ],
  ),
  classic: palette(
    "classic",
    "Classic Arcade",
    "solid",
    [
      "#101a24",
      "#192938",
      "#233648",
      "#f3f5f7",
      "#b2c5d4",
      "#526d83",
      "#59c5df",
      "#10242e",
      "131 183 220",
      "#708fa6",
    ],
    ["#0b1520", "#192b3a", "#98b7ce", "#ffbe5c65"],
    [
      "#36d6ef",
      "#f8d447",
      "#b47cff",
      "#6cd65e",
      "#fa6474",
      "#588fff",
      "#ffa44e",
    ],
  ),
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
  root.style.colorScheme = [
    "glacier",
    "clay",
    "paper",
    "lcd",
    "workshop",
    "score",
    "folio",
    "annual",
  ].includes(theme.id)
    ? "light"
    : "dark";
  for (const [property, value] of Object.entries(theme.css))
    root.style.setProperty(property, value);
  return theme;
}
