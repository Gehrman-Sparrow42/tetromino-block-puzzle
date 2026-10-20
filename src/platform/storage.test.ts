import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../engine/engine";

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
  it("normalizes finite bounds, invalid fields and corrupted JSON", () => {
    data.set("tetromino_v2_settings", "{broken");
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
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
    expect(storage.loadSettings()).toEqual(storage.DEFAULT_SETTINGS);
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
