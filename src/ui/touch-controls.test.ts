import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameCommand, UserSettings } from "../contracts/game-contract";
import { TouchControls } from "./touch-controls";
import { DEFAULT_SETTINGS } from "../platform/storage";

class ButtonStub extends EventTarget {
  dataset: { command: string };
  private classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  };
  setPointerCapture = vi.fn();
  closest = () => null;
  style = { left: "0px", top: "0px" };
  hidden = false;
  parentElement = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  getBoundingClientRect = () => ({
    ...this.bounds,
    width: this.bounds.right - this.bounds.left,
    height: this.bounds.bottom - this.bounds.top,
  });
  constructor(command: string) {
    super();
    this.dataset = { command };
  }
}

function setup(gamepad = false) {
  const windowStub = new EventTarget();
  vi.stubGlobal("window", windowStub);
  const left = new ButtonStub("MOVE_LEFT"),
    down = new ButtonStub("SOFT_DROP"),
    right = new ButtonStub("MOVE_RIGHT");
  const canvas = new ButtonStub("CANVAS");
  const rotate = new ButtonStub("ROTATE_CW");
  const pad = new ButtonStub("PAD") as ButtonStub & {
    contains: (button: ButtonStub) => boolean;
  };
  pad.contains = (button) => [left, down, right].includes(button);
  pad.bounds = { left: 0, top: 0, right: 150, bottom: 100 };
  const zone = new ButtonStub("ZONE");
  zone.bounds = { left: 0, top: 0, right: 170, bottom: 150 };
  left.bounds = { left: 0, top: 0, right: 50, bottom: 50 };
  right.bounds = { left: 100, top: 0, right: 150, bottom: 50 };
  down.bounds = { left: 50, top: 50, right: 100, bottom: 100 };
  const obstacles: ButtonStub[] = [];
  const root = {
    querySelectorAll: (selector: string) =>
      selector.startsWith("#board,") ? obstacles : [left, down, right, rotate],
    querySelector: (selector: string) =>
      selector === "#board"
        ? canvas
        : gamepad && selector === "[data-movement-pad]"
          ? pad
          : selector === ".play-area" ||
              (gamepad && selector === "[data-dynamic-pad-zone]")
            ? zone
            : null,
  } as unknown as HTMLElement;
  const commands: GameCommand[] = [];
  const settings: UserSettings = {
    ...DEFAULT_SETTINGS,
    soundEnabled: false,
    soundVolume: 0,
    hapticsEnabled: false,
    ghostEnabled: true,
    reducedMotion: false,
    controlScheme: "buttons",
    dasMs: 150,
    arrMs: 40,
  };
  if (gamepad) settings.controlLayout = "gamepad";
  let enabled = true;
  const controls = new TouchControls(
    root,
    (command) => commands.push(command),
    () => settings,
    () => enabled,
    () => {},
  );
  function pointer(
    button: ButtonStub,
    type: string,
    pointerId: number,
    clientX = 10,
    clientY = 10,
  ) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId, clientX, clientY });
    button.dispatchEvent(event);
  }
  return {
    controls,
    obstacles,
    left,
    down,
    right,
    canvas,
    settings,
    pointer,
    commands,
    windowStub,
    pad,
    rotate,
    zone,
    setEnabled: (value: boolean) => {
      enabled = value;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("held touch input", () => {
  it("repeats only the latest direction and resumes the remaining source", () => {
    const { controls, left, right, pointer, commands } = setup();
    pointer(left, "pointerdown", 1);
    pointer(right, "pointerdown", 2);
    controls.update(performance.now() + 1000);
    expect(commands).toEqual([
      { type: "MOVE_LEFT" },
      { type: "MOVE_RIGHT" },
      { type: "MOVE_RIGHT" },
    ]);
    pointer(right, "pointerup", 2);
    controls.update(performance.now() + 2000);
    expect(commands.at(-1)).toEqual({ type: "MOVE_LEFT" });
    expect(commands).toHaveLength(4);
    controls.destroy();
  });

  it("deduplicates sources holding the same direction and shares their repeat clock", () => {
    const { controls, left, pointer, commands } = setup();
    pointer(left, "pointerdown", 1);
    pointer(left, "pointerdown", 2);
    expect(commands).toHaveLength(1);
    const now = performance.now() + 1000;
    controls.update(now);
    expect(commands).toHaveLength(2);
    pointer(left, "pointerup", 2);
    controls.update(now + 1);
    expect(commands).toHaveLength(2);
    controls.destroy();
  });

  it("cancels stale gestures after a piece change while preserving physical holds", () => {
    const { controls, left, down, canvas, settings, pointer, commands } =
      setup();
    settings.controlScheme = "hybrid";
    pointer(left, "pointerdown", 1);
    pointer(down, "pointerdown", 2);
    pointer(canvas, "pointerdown", 3);
    controls.pieceChanged();
    pointer(canvas, "pointerup", 3);
    expect(commands).toEqual([
      { type: "MOVE_LEFT" },
      { type: "SOFT_DROP", active: true },
    ]);
    controls.update(performance.now() + 1000);
    expect(commands.at(-1)).toEqual({ type: "MOVE_LEFT" });
    expect(
      commands.some(
        (command) => command.type === "SOFT_DROP" && !command.active,
      ),
    ).toBe(false);
    pointer(down, "pointerup", 2);
    expect(commands.at(-1)).toEqual({ type: "SOFT_DROP", active: false });
    controls.destroy();
  });

  it("cancels a gesture when canvas capture is lost", () => {
    const { controls, canvas, settings, pointer, commands } = setup();
    settings.controlScheme = "hybrid";
    pointer(canvas, "pointerdown", 3);
    pointer(canvas, "lostpointercapture", 3);
    pointer(canvas, "pointerup", 3);
    expect(commands).toHaveLength(0);
    controls.destroy();
  });
  it("moves immediately, repeats after DAS, and stops on pointercancel", () => {
    const { controls, left, pointer, commands } = setup();
    pointer(left, "pointerdown", 1);
    expect(commands).toEqual([{ type: "MOVE_LEFT" }]);
    controls.update(performance.now() + 1000);
    expect(commands).toHaveLength(2);
    pointer(left, "pointercancel", 1);
    controls.update(performance.now() + 2000);
    expect(commands).toHaveLength(2);
    controls.destroy();
  });

  it("window blur releases horizontal repetition and soft drop", () => {
    const { controls, left, down, pointer, commands, windowStub } = setup();
    pointer(left, "pointerdown", 1);
    pointer(down, "pointerdown", 2);
    windowStub.dispatchEvent(new Event("blur"));
    expect(commands.at(-1)).toEqual({ type: "SOFT_DROP", active: false });
    const count = commands.length;
    controls.update(performance.now() + 2000);
    expect(commands).toHaveLength(count);
    controls.destroy();
  });

  it("keeps soft drop active until every pointer holding it is released", () => {
    const { controls, down, pointer, commands } = setup();
    pointer(down, "pointerdown", 1);
    pointer(down, "pointerdown", 2);
    pointer(down, "lostpointercapture", 1);
    expect(
      commands.filter(
        (command) => command.type === "SOFT_DROP" && !command.active,
      ),
    ).toHaveLength(0);
    pointer(down, "pointerup", 2);
    expect(commands.at(-1)).toEqual({ type: "SOFT_DROP", active: false });
    controls.destroy();
  });
});

describe("connected gamepad buttons", () => {
  it("keeps saved button placement fixed even with a legacy dynamic setting", () => {
    const { controls, zone, pad, pointer, commands, settings } = setup(true);
    settings.padMode = "dynamic";
    pointer(zone, "pointerdown", 1, 85, 60);
    expect(pad.style.left).toBe("0px");
    expect(pad.style.top).toBe("0px");
    expect(commands).toEqual([]);
    pointer(zone, "pointerdown", 2, 85, 25);
    expect(pad.style.top).toBe("0px");
    expect(commands).toEqual([]);
    controls.releaseAll();
    expect(pad.style.left).toBe("0px");
    expect(pad.style.top).toBe("0px");
    controls.destroy();
  });

  it.each(["fixed", "dynamic"] as const)(
    "taps and holds arrows directly in %s mode without sliding commands",
    (mode) => {
      const { controls, left, down, right, pad, pointer, commands, settings } =
        setup(true);
      settings.padMode = mode;
      pointer(left, "pointerdown", 1, 25, 25);
      expect(commands).toEqual([{ type: "MOVE_LEFT" }]);
      controls.update(performance.now() + 1000);
      expect(commands).toHaveLength(2);
      pointer(left, "pointermove", 1, 125, 25);
      pointer(pad, "pointermove", 1, 75, 75);
      expect(commands).toHaveLength(2);
      pointer(left, "pointerup", 1);
      pointer(down, "pointerdown", 2);
      pointer(right, "pointerdown", 3);
      expect(commands.slice(-2)).toEqual([
        { type: "SOFT_DROP", active: true },
        { type: "MOVE_RIGHT" },
      ]);
      pointer(down, "pointercancel", 2);
      expect(commands.at(-1)).toEqual({ type: "SOFT_DROP", active: false });
      pointer(right, "pointerup", 3);
      pointer(pad, "pointerdown", 4, 75, 25);
      pointer(pad, "pointermove", 4, 125, 25);
      const count = commands.length;
      controls.update(performance.now() + 2000);
      expect(commands).toHaveLength(count);
      controls.destroy();
    },
  );

  it("supports accessible arrow activation and isolates multi-pointer releases", () => {
    const { controls, left, pointer, commands } = setup(true);
    const click = new Event("click");
    Object.assign(click, { detail: 0 });
    left.dispatchEvent(click);
    expect(commands).toEqual([{ type: "MOVE_LEFT" }]);
    pointer(left, "pointerdown", 1);
    pointer(left, "pointerdown", 2);
    pointer(left, "pointerup", 1);
    expect(left.classList.contains("pressed")).toBe(true);
    pointer(left, "pointerup", 2);
    expect(left.classList.contains("pressed")).toBe(false);
    controls.destroy();
  });
});
