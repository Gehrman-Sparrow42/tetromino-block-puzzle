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
  const root = {
    querySelectorAll: () => [left, down, right, rotate],
    querySelector: (selector: string) =>
      selector === "#board"
        ? canvas
        : gamepad && selector === "[data-movement-pad]"
          ? pad
          : gamepad && selector === "[data-dynamic-pad-zone]"
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
  it("anchors dynamic movement at touch-down with a dead zone and no up action", () => {
    const { controls, zone, pad, pointer, commands, settings, rotate } =
      setup(true);
    settings.padMode = "dynamic";
    pointer(zone, "pointerdown", 1, 85, 30);
    expect(commands).toEqual([]);
    expect(pad.style.left).toBe("10px");
    pointer(zone, "pointermove", 1, 89, 32);
    expect(commands).toEqual([]);
    pointer(zone, "pointermove", 1, 110, 30);
    pointer(rotate, "pointerdown", 2);
    pointer(zone, "pointermove", 1, 85, 65);
    pointer(zone, "pointermove", 1, 85, 0);
    pointer(zone, "pointerup", 1);
    expect(commands).toEqual([
      { type: "MOVE_RIGHT" },
      { type: "ROTATE_CW" },
      { type: "SOFT_DROP", active: true },
      { type: "SOFT_DROP", active: false },
    ]);
    expect(pad.style.left).toBe("0px");
    expect(rotate.classList.contains("pressed")).toBe(true);
    controls.destroy();
  });
  it("ignores a second dynamic thumb and releases movement on blur", () => {
    const { controls, zone, pointer, commands, settings, windowStub } =
      setup(true);
    settings.padMode = "dynamic";
    pointer(zone, "pointerdown", 1, 85, 30);
    pointer(zone, "pointerdown", 2, 40, 30);
    pointer(zone, "pointermove", 2, 5, 30);
    expect(commands).toEqual([]);
    pointer(zone, "pointermove", 1, 85, 65);
    windowStub.dispatchEvent(new Event("blur"));
    controls.update(performance.now() + 1000);
    pointer(zone, "pointermove", 1, 110, 30);
    expect(commands).toEqual([
      { type: "SOFT_DROP", active: true },
      { type: "SOFT_DROP", active: false },
    ]);
    controls.destroy();
  });
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

describe("sliding gamepad input", () => {
  it("retains keyboard soft drop when a pad pointer leaves its down region", () => {
    const { controls, pad, down, pointer, commands, windowStub } = setup(true);
    const key = new Event("keydown", { cancelable: true });
    Object.assign(key, { code: "ArrowDown", repeat: false });
    windowStub.dispatchEvent(key);
    pointer(pad, "pointerdown", 1, 75, 75);
    pointer(pad, "pointermove", 1, 75, 25);
    expect(
      commands.some(
        (command) => command.type === "SOFT_DROP" && !command.active,
      ),
    ).toBe(false);
    expect(down.classList.contains("pressed")).toBe(true);
    const up = new Event("keyup");
    Object.assign(up, { code: "ArrowDown" });
    windowStub.dispatchEvent(up);
    expect(commands.at(-1)).toEqual({ type: "SOFT_DROP", active: false });
    expect(down.classList.contains("pressed")).toBe(false);
    controls.destroy();
  });

  it("keeps movement buttons accessible without a pointer gesture", () => {
    const { controls, left, commands } = setup(true);
    const click = new Event("click");
    Object.assign(click, { detail: 0 });
    left.dispatchEvent(click);
    controls.update(performance.now() + 1000);
    expect(commands).toEqual([{ type: "MOVE_LEFT" }]);
    expect(left.classList.contains("pressed")).toBe(false);
    controls.destroy();
  });

  it("slides left, right, down and neutral without lifting, then cancels", () => {
    const { controls, pad, left, right, down, pointer, commands } = setup(true);
    pointer(pad, "pointerdown", 1, 25, 25);
    expect(pad.setPointerCapture).toHaveBeenCalledWith(1);
    expect(left.classList.contains("pressed")).toBe(true);
    pointer(pad, "pointermove", 1, 125, 25);
    expect(left.classList.contains("pressed")).toBe(false);
    expect(right.classList.contains("pressed")).toBe(true);
    pointer(pad, "pointermove", 1, 75, 75);
    expect(down.classList.contains("pressed")).toBe(true);
    pointer(pad, "pointermove", 1, 75, 25);
    expect(down.classList.contains("pressed")).toBe(false);
    pointer(pad, "pointermove", 1, 25, 25);
    pointer(pad, "pointercancel", 1);
    const count = commands.length;
    controls.update(performance.now() + 1000);
    pointer(pad, "pointermove", 1, 125, 25);
    expect(commands).toHaveLength(count);
    expect(commands).toEqual([
      { type: "MOVE_LEFT" },
      { type: "MOVE_RIGHT" },
      { type: "SOFT_DROP", active: true },
      { type: "SOFT_DROP", active: false },
      { type: "MOVE_LEFT" },
    ]);
    controls.destroy();
  });

  it("starts in neutral and releases outside the pad without triggering action buttons", () => {
    const { controls, pad, pointer, commands } = setup(true);
    pointer(pad, "pointerdown", 1, 75, 25);
    expect(commands).toHaveLength(0);
    pointer(pad, "pointermove", 1, 75, 75);
    pointer(pad, "pointermove", 1, 250, 25);
    pointer(pad, "pointerup", 1);
    expect(commands).toEqual([
      { type: "SOFT_DROP", active: true },
      { type: "SOFT_DROP", active: false },
    ]);
    controls.destroy();
  });

  it("preserves another pointer and keyboard ownership while the pad slides or releases", () => {
    const { controls, pad, left, rotate, pointer, commands, windowStub } =
      setup(true);
    const key = new Event("keydown", { cancelable: true });
    Object.assign(key, { code: "ArrowLeft", repeat: false });
    windowStub.dispatchEvent(key);
    pointer(pad, "pointerdown", 1, 25, 25);
    pointer(rotate, "pointerdown", 2);
    pointer(pad, "pointermove", 1, 125, 25);
    expect(left.classList.contains("pressed")).toBe(true);
    expect(rotate.classList.contains("pressed")).toBe(true);
    pointer(pad, "lostpointercapture", 1);
    controls.update(performance.now() + 1000);
    expect(commands).toEqual([
      { type: "MOVE_LEFT" },
      { type: "ROTATE_CW" },
      { type: "MOVE_RIGHT" },
      { type: "MOVE_LEFT" },
    ]);
    expect(rotate.classList.contains("pressed")).toBe(true);
    pointer(rotate, "pointerup", 2);
    expect(rotate.classList.contains("pressed")).toBe(false);
    const up = new Event("keyup");
    Object.assign(up, { code: "ArrowLeft" });
    windowStub.dispatchEvent(up);
    expect(left.classList.contains("pressed")).toBe(false);
    controls.destroy();
  });

  it.each(["pointerup", "pointercancel", "lostpointercapture"])(
    "releases soft drop on %s",
    (event) => {
      const { controls, pad, pointer, commands } = setup(true);
      pointer(pad, "pointerdown", 1, 75, 75);
      pointer(pad, event, 1);
      expect(commands).toEqual([
        { type: "SOFT_DROP", active: true },
        { type: "SOFT_DROP", active: false },
      ]);
      controls.destroy();
    },
  );

  it("clears tracked pad pointers when disabled, blurred or destroyed", () => {
    for (const release of ["disabled", "blur", "destroy"]) {
      const { controls, pad, pointer, commands, windowStub, setEnabled } =
        setup(true);
      pointer(pad, "pointerdown", 1, 75, 75);
      if (release === "disabled") {
        setEnabled(false);
        controls.update(performance.now());
        setEnabled(true);
      } else if (release === "blur")
        windowStub.dispatchEvent(new Event("blur"));
      else controls.destroy();
      pointer(pad, "pointermove", 1, 125, 25);
      expect(commands).toEqual([
        { type: "SOFT_DROP", active: true },
        { type: "SOFT_DROP", active: false },
      ]);
      if (release !== "destroy") controls.destroy();
    }
  });

  it("keeps a pressed button marked until its last pointer releases", () => {
    const { controls, left, pointer } = setup();
    pointer(left, "pointerdown", 1);
    pointer(left, "pointerdown", 2);
    pointer(left, "pointerup", 1);
    expect(left.classList.contains("pressed")).toBe(true);
    pointer(left, "pointerup", 2);
    expect(left.classList.contains("pressed")).toBe(false);
    controls.destroy();
  });
});
