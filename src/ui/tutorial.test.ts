import { describe, expect, it } from "vitest";
import { applyCommand, validateSnapshot } from "../engine/engine";
import { createTutorialState } from "./tutorial";

describe("tutorial practice fixtures", () => {
  it("uses valid isolated snapshots for every lesson", () => {
    for (const track of ["basics", "advanced"] as const) {
      for (let lesson = 0; lesson < (track === "basics" ? 5 : 4); lesson++) {
        const state = createTutorialState(track, lesson);
        expect(validateSnapshot(state), `${track} ${lesson}`).not.toBeNull();
        expect(state.mode).toBe("marathon");
      }
    }
  });
  it("clears the basic row using a real lock", () => {
    const state = createTutorialState("basics", 3);
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.lastEvent?.linesCleared).toBe(1);
  });
  it("supports an authentic Tetris and back-to-back bonus", () => {
    const state = createTutorialState("advanced", 3);
    applyCommand(state, { type: "ROTATE_CW" });
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.lastEvent?.linesCleared).toBe(4);
    expect(state.lastEvent?.backToBack).toBe(false);
    applyCommand(state, { type: "ROTATE_CW" });
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.lines).toBe(8);
    expect(state.lastEvent?.backToBack).toBe(true);
    expect(state.status).toBe("playing");
  });
  it("keeps the second Hold blocked until the piece locks", () => {
    const state = createTutorialState("advanced", 1);
    applyCommand(state, { type: "HOLD" });
    expect(state.active?.type).toBe("I");
    applyCommand(state, { type: "HOLD" });
    expect(state.active?.type).toBe("I");
    applyCommand(state, { type: "HARD_DROP" });
    expect(state.holdUsedThisTurn).toBe(false);
  });
});
