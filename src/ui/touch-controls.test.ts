import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameCommand, UserSettings } from "../contracts/game-contract";
import { TouchControls } from "./touch-controls";

class ButtonStub extends EventTarget {
  dataset: { command: string };
  classList = { add: vi.fn(), remove: vi.fn() };
  setPointerCapture = vi.fn();
  constructor(command: string) {
    super();
    this.dataset = { command };
  }
}

function setup() {
  const windowStub = new EventTarget();
  vi.stubGlobal("window", windowStub);
  const left = new ButtonStub("MOVE_LEFT"),
    down = new ButtonStub("SOFT_DROP");
  const canvas = new EventTarget();
  const root = {
    querySelectorAll: () => [left, down],
    querySelector: () => canvas,
  } as unknown as HTMLElement;
  const commands: GameCommand[] = [];
  const settings: UserSettings = {
    soundEnabled: false,
    soundVolume: 0,
    hapticsEnabled: false,
    ghostEnabled: true,
    reducedMotion: false,
    controlScheme: "buttons",
    dasMs: 150,
    arrMs: 40,
  };
  const controls = new TouchControls(
    root,
    (command) => commands.push(command),
    () => settings,
    () => true,
    () => {},
  );
  function pointer(button: ButtonStub, type: string, pointerId: number) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId });
    button.dispatchEvent(event);
  }
  return { controls, left, down, pointer, commands, windowStub };
}

afterEach(() => vi.unstubAllGlobals());

describe("held touch input", () => {
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
