import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  applyRewardedContinue,
  createInitialState,
} from "../engine/engine";
import { THEME_IDS } from "../contracts/game-contract";

let data: Map<string, string>;
let storage: typeof import("./storage");

beforeEach(async () => {
  vi.resetModules();
  data = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  });
  storage = await import("./storage");
});

describe("settings and scores", () => {
  it("persists assisted resume metadata and counts its final result without records", () => {
    const run = createInitialState("marathon", 42);
    run.rewardRunId = "resume-test-42";
    run.board[2].fill("J");
    run.board[3].fill("J");
    applyCommand(run, { type: "HOLD" });
    expect(applyRewardedContinue(run)).toBe(true);
    expect(storage.saveRun(run)).toBe(true);
    const restored = storage.loadRun()!;
    expect(restored).toEqual(run);
    expect(applyRewardedContinue(restored)).toBe(false);
    restored.status = "gameover";
    restored.active = null;
    restored.score = 99999;
    restored.lines = 200;
    restored.level = 21;
    const result = storage.recordResult(restored);
    expect(result.gamesPlayed).toBe(1);
    expect(result.marathonHighScore).toBe(0);
    expect(result.marathonMaxLines).toBe(0);
    restored.marathonOptions = { startingLevel: 1, speedMode: "fixed" };
    restored.level = 1;
    const fixedResult = storage.recordResult(restored);
    expect(fixedResult.marathonFixedHighScore).toBe(0);
    expect(fixedResult.marathonFixedMaxLines).toBe(0);
  });
  it("defaults legacy pad settings safely and round-trips new presets and pad modes", () => {
    data.set(
      "tetromino_v2_settings",
      JSON.stringify({
        soundEnabled: false,
        gamepadPreset: "unknown",
        padMode: "bad",
      }),
    );
    expect(storage.loadSettings()).toMatchObject({
      soundEnabled: false,
      gamepadPreset: "balanced",
      padMode: "fixed",
    });
    for (const gamepadPreset of ["balanced", "compact", "mirrored"] as const) {
      for (const padMode of ["fixed", "dynamic"] as const) {
        const prefs = { ...storage.loadSettings(), gamepadPreset, padMode };
        expect(storage.saveSettings(prefs)).toBe(true);
        expect(storage.loadSettings()).toMatchObject({
          ...prefs,
          padMode: "fixed",
        });
      }
    }
  });

  it("keeps existing presets, defaults fresh installs to gamepad, and isolates nested settings", () => {
    expect(storage.loadSettings().controlLayout).toBe("gamepad");
    const first = storage.loadSettings();
    first.gamepadLayouts.portrait.pad = {
      x: 0.2,
      y: 0.8,
      size: 1.2,
      opacity: 0.3,
    };
    expect(storage.loadSettings().gamepadLayouts.portrait).toEqual({});
    expect(storage.DEFAULT_SETTINGS.gamepadLayouts.portrait).toEqual({});
    for (const controlLayout of ["thumbs", "mirror", "floating"]) {
      data.set("tetromino_v2_settings", JSON.stringify({ controlLayout }));
      expect(storage.loadSettings().controlLayout).toBe(controlLayout);
    }
  });

  it("round-trips independent orientation edits and sanitizes malformed placements", () => {
    const settings = storage.loadSettings();
    settings.gamepadLayouts.portrait.pad = {
      x: 0.2,
      y: 0.8,
      size: 1.2,
      opacity: 0.3,
    };
    settings.gamepadLayouts.landscape.hold = {
      x: 0.9,
      y: 0.4,
      size: 0.8,
      opacity: 0.1,
    };
    storage.saveSettings(settings);
    expect(storage.loadSettings()).toMatchObject({
      ...settings,
      controlProfiles: expect.any(Object),
    });
    const normalized = storage.normalizeGamepadLayouts({
      portrait: {
        pad: { x: -1, y: 8, size: 50, opacity: 0 },
        hold: { x: 0.2, y: 0.2, size: NaN, opacity: 0.2 },
        rotateCW: { x: 0.2, y: 0.3, size: 1 },
      },
      landscape: [],
    });
    expect(normalized).toEqual({
      portrait: { pad: { x: 0, y: 1, size: 2, opacity: 0.08 } },
      landscape: {},
    });
  });
  it("adds appearance defaults to old settings without changing saved runs or audio", () => {
    const run = JSON.stringify(createInitialState("marathon", 123));
    data.set("tetromino_v2_run", run);
    data.set(
      "tetromino_v2_settings",
      JSON.stringify({
        soundEnabled: false,
        soundVolume: 0.7,
        controlScheme: "hybrid",
        dasMs: 180,
        arrMs: 24,
      }),
    );
    expect(storage.loadSettings()).toEqual({
      ...storage.DEFAULT_SETTINGS,
      controlProfiles: expect.any(Object),
      soundEnabled: false,
      soundVolume: 0.7,
      controlScheme: "hybrid",
      dasMs: 180,
      arrMs: 24,
    });
    expect(data.get("tetromino_v2_run")).toBe(run);
  });

  it("clamps appearance fields and rejects invalid theme or layout names", () => {
    data.set(
      "tetromino_v2_settings",
      JSON.stringify({
        theme: "__proto__",
        controlLayout: "custom",
        controlScale: 100,
        controlOpacity: -1,
        controlSpread: 2,
        controlHeight: -5,
      }),
    );
    expect(storage.loadSettings()).toMatchObject({
      theme: "ink",
      controlLayout: "gamepad",
      controlScale: 2,
      controlOpacity: 0.08,
      controlSpread: 1,
      controlHeight: 0,
    });
    storage.saveSettings({
      ...storage.DEFAULT_SETTINGS,
      controlScale: NaN,
      controlOpacity: Infinity,
      controlHeight: -Infinity,
      controlSpread: NaN,
    });
    expect(storage.loadSettings()).toMatchObject({
      ...storage.DEFAULT_SETTINGS,
      controlProfiles: expect.any(Object),
    });
  });

  it("round-trips all themes and control presets", () => {
    for (const theme of THEME_IDS) {
      for (const controlLayout of [
        "gamepad",
        "thumbs",
        "mirror",
        "floating",
      ] as const) {
        const settings = {
          ...storage.DEFAULT_SETTINGS,
          theme,
          controlLayout,
          controlScale: 1.15,
          controlOpacity: 0.35,
          controlSpread: 0.8,
          controlHeight: 0.6,
        };
        expect(storage.saveSettings(settings)).toBe(true);
        expect(storage.loadSettings()).toMatchObject({
          ...settings,
          controlProfiles: expect.any(Object),
        });
      }
    }
  });

  it("normalizes finite bounds, invalid fields and corrupted JSON", () => {
    data.set("tetromino_v2_settings", "{broken");
    expect(storage.loadSettings()).toMatchObject({
      ...storage.DEFAULT_SETTINGS,
      controlProfiles: expect.any(Object),
    });
    data.set(
      "tetromino_v2_settings",
      JSON.stringify({
        soundEnabled: "yes",
        soundVolume: 8,
        arrMs: -3,
        dasMs: "slow",
        controlScheme: "hybrid",
      }),
    );
    expect(storage.loadSettings()).toMatchObject({
      soundEnabled: true,
      soundVolume: 1,
      arrMs: 16,
      dasMs: 150,
      controlScheme: "hybrid",
    });
    storage.saveSettings({
      ...storage.DEFAULT_SETTINGS,
      soundVolume: NaN,
      dasMs: Infinity,
    });
    expect(storage.loadSettings()).toMatchObject({
      ...storage.DEFAULT_SETTINGS,
      controlProfiles: expect.any(Object),
    });
  });

  it("migrates legacy score without removing it or lowering an existing record", () => {
    data.set("block_puzzle_highscore", "12000");
    data.set(
      "tetromino_v2_stats",
      JSON.stringify({
        marathonHighScore: 15000,
        gamesPlayed: -4,
        sprint40BestTimeMs: "bad",
      }),
    );
    expect(storage.loadStats()).toMatchObject({
      marathonHighScore: 15000,
      gamesPlayed: 0,
      sprint40BestTimeMs: null,
      migratedLegacyHighScore: true,
    });
    expect(data.get("block_puzzle_highscore")).toBe("12000");
    data.set("block_puzzle_highscore", "20000");
    expect(storage.loadStats().marathonHighScore).toBe(15000);
  });

  it("records terminal games, with sprint times only for victories", () => {
    const state = createInitialState("sprint40", 42);
    expect(storage.recordResult(state).gamesPlayed).toBe(0);
    state.status = "gameover";
    state.active = null;
    state.elapsedMs = 50000;
    expect(storage.recordResult(state)).toMatchObject({
      gamesPlayed: 1,
      sprint40BestTimeMs: null,
    });
    state.status = "victory";
    state.lines = 40;
    state.level = 5;
    state.elapsedMs = 65000;
    expect(storage.recordResult(state)).toMatchObject({
      gamesPlayed: 2,
      sprint40BestTimeMs: 65000,
    });
    state.elapsedMs = 70000;
    expect(storage.recordResult(state).sprint40BestTimeMs).toBe(65000);
    const marathon = createInitialState("marathon", 42);
    marathon.status = "gameover";
    marathon.active = null;
    marathon.score = 400;
    marathon.lines = 8;
    expect(storage.recordResult(marathon)).toMatchObject({
      marathonHighScore: 400,
      marathonMaxLines: 8,
    });
    const ultra = createInitialState("ultra120", 42);
    ultra.status = "victory";
    ultra.active = null;
    ultra.score = 900;
    ultra.elapsedMs = 120000;
    expect(storage.recordResult(ultra).ultra120HighScore).toBe(900);
  });
});

describe("resume and unavailable storage", () => {
  it("saves fixed Marathon speed and keeps its records separate", () => {
    const state = createInitialState("marathon", 42, {
      startingLevel: 7,
      speedMode: "fixed",
    });
    expect(storage.saveRun(state)).toBe(true);
    expect(storage.loadRun()?.marathonOptions).toEqual({
      startingLevel: 7,
      speedMode: "fixed",
    });
    state.status = "gameover";
    state.active = null;
    state.score = 5000;
    state.lines = 25;
    expect(storage.recordResult(state)).toMatchObject({
      marathonFixedHighScore: 5000,
      marathonFixedMaxLines: 25,
      marathonHighScore: 0,
      marathonMaxLines: 0,
    });
    expect(storage.loadStats().marathonFixedHighScore).toBe(5000);
  });
  it("roundtrips a deeply copied paused run and rejects terminal saves", () => {
    const state = createInitialState("marathon", 42);
    state.softDropActive = true;
    expect(storage.saveRun(state)).toBe(true);
    const resumed = storage.loadRun()!;
    expect(resumed).toMatchObject({ status: "paused", softDropActive: false });
    expect(state.status).toBe("playing");
    resumed.board[23][0] = "I";
    expect(storage.loadRun()!.board[23][0]).toBeNull();
    state.status = "gameover";
    state.active = null;
    expect(storage.saveRun(state)).toBe(false);
    expect(storage.clearRun()).toBe(true);
    expect(storage.loadRun()).toBeNull();
  });

  it.each(["active", "board", "queue", "event"])(
    "rejects corrupted nested %s state",
    (field) => {
      const state = createInitialState("marathon", 42);
      const bad = JSON.parse(JSON.stringify(state));
      if (field === "active") bad.active.rotation = 9;
      if (field === "board") bad.board[0][0] = "X";
      if (field === "queue") bad.nextQueue = ["I", {}];
      if (field === "event") bad.lastEvent = { linesCleared: 4, rows: [] };
      data.set("tetromino_v2_run", JSON.stringify(bad));
      expect(storage.loadRun()).toBeNull();
      expect(storage.saveRun(bad)).toBe(false);
    },
  );

  it("keeps session changes during quota failures, including clear tombstones", () => {
    const state = createInitialState("marathon", 42);
    storage.saveRun(state);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(
      storage.saveSettings({
        ...storage.DEFAULT_SETTINGS,
        soundEnabled: false,
      }),
    ).toBe(false);
    expect(storage.loadSettings().soundEnabled).toBe(false);
    expect(storage.clearRun()).toBe(false);
    expect(storage.loadRun()).toBeNull();
  });

  it("works in memory when storage reads and writes throw", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("disabled");
      },
      setItem() {
        throw new Error("disabled");
      },
    });
    expect(storage.loadStats().gamesPlayed).toBe(0);
    const state = createInitialState("marathon", 42);
    expect(storage.saveRun(state)).toBe(false);
    expect(storage.loadRun()?.status).toBe("paused");
  });
});

it("preserves six independent profiles and migrates the old map only into its selected profile", () => {
  const legacy = {
    ...storage.DEFAULT_SETTINGS,
    controlLayout: "thumbs",
    gamepadLayouts: {
      portrait: { hold: { x: 0.8, y: 0.8, size: 1.5, opacity: 0.3 } },
      landscape: {},
    },
  };
  data.set("tetromino_v2_settings", JSON.stringify(legacy));
  const s = storage.loadSettings();
  expect(s.controlProfiles!.thumbs.layouts.portrait.hold!.size).toBe(1.5);
  expect(s.controlProfiles!["gamepad:balanced"]).toBeUndefined();
  for (const key of [
    "gamepad:balanced",
    "gamepad:compact",
    "gamepad:mirrored",
    "thumbs",
    "mirror",
    "floating",
  ])
    s.controlProfiles![key] = {
      layouts: {
        portrait: {
          left: { x: 0.2, y: 0.8, size: 1.2, opacity: 0.3, hidden: true },
        },
        landscape: {},
      },
      boardScale: 0.7,
    };
  s.gamepadLayouts = s.controlProfiles!.thumbs.layouts;
  s.boardScale = 0.7;
  storage.saveSettings(s);
  const reloaded = storage.loadSettings();
  expect(Object.keys(reloaded.controlProfiles!)).toHaveLength(6);
  expect(
    reloaded.controlProfiles!["gamepad:compact"].layouts.portrait.left!.hidden,
  ).toBe(true);
  expect(reloaded.boardScale).toBe(0.7);
});
