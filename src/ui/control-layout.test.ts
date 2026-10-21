import { describe, expect, it } from "vitest";
import type { UserSettings } from "../contracts/game-contract";
import { DEFAULT_SETTINGS } from "../platform/storage";
import { computeControlGeometry } from "./control-layout";

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    controlLayout: "thumbs",
    controlScale: 1,
    controlOpacity: 0.18,
    controlSpread: 0.65,
    controlHeight: 0.3,
    ...overrides,
  };
}

describe("ergonomic touch geometry", () => {
  it("keeps seven separated, reachable targets inside every supported viewport", () => {
    let layoutsChecked = 0;
    for (const width of [320, 344, 377, 414, 752]) {
      for (const height of [400, 440, 760, 936]) {
        for (const controlLayout of ["thumbs", "mirror", "floating"] as const) {
          for (const controlScale of [0.85, 1, 1.3]) {
            for (const controlSpread of [0, 0.65, 1]) {
              for (const controlHeight of [0, 0.3, 1]) {
                const geometry = computeControlGeometry(
                  width,
                  height,
                  settings({
                    controlLayout,
                    controlScale,
                    controlSpread,
                    controlHeight,
                  }),
                );
                const buttons = Object.values(geometry.buttons);
                expect(buttons).toHaveLength(7);
                expect(geometry.width).toBe(width);
                expect(geometry.height).toBeLessThanOrEqual(height);
                for (const button of buttons) {
                  expect(button.width).toBeGreaterThanOrEqual(48);
                  expect(button.height).toBeGreaterThanOrEqual(48);
                  expect(button.x).toBeGreaterThanOrEqual(0);
                  expect(button.y).toBeGreaterThanOrEqual(0);
                  expect(button.x + button.width).toBeLessThanOrEqual(width);
                  expect(button.y + button.height).toBeLessThanOrEqual(
                    geometry.height,
                  );
                  for (const coordinate of Object.values(button)) {
                    expect(Number.isInteger(coordinate)).toBe(true);
                  }
                }
                for (let i = 0; i < buttons.length; i++) {
                  for (let j = i + 1; j < buttons.length; j++) {
                    const a = buttons[i]!;
                    const b = buttons[j]!;
                    const horizontalGap = Math.max(
                      b.x - (a.x + a.width),
                      a.x - (b.x + b.width),
                    );
                    const verticalGap = Math.max(
                      b.y - (a.y + a.height),
                      a.y - (b.y + b.height),
                    );
                    expect(
                      Math.max(horizontalGap, verticalGap),
                    ).toBeGreaterThanOrEqual(8);
                  }
                }
                if (controlLayout !== "floating") {
                  expect(height - geometry.height).toBeGreaterThanOrEqual(280);
                }
                layoutsChecked++;
              }
            }
          }
        }
      }
    }
    expect(layoutsChecked).toBe(1620);
  });

  it("places movement on the left normally and on the right when mirrored, preserving arrow meanings", () => {
    for (const controlLayout of ["thumbs", "mirror", "floating"] as const) {
      const { buttons } = computeControlGeometry(
        377,
        760,
        settings({ controlLayout }),
      );
      expect(buttons.MOVE_LEFT.x).toBeLessThan(buttons.SOFT_DROP.x);
      expect(buttons.SOFT_DROP.x).toBeLessThan(buttons.MOVE_RIGHT.x);
      expect(buttons.MOVE_LEFT.y).toBe(buttons.MOVE_RIGHT.y);
      expect(buttons.HARD_DROP.y).toBeLessThan(buttons.MOVE_LEFT.y);
      expect(buttons.HOLD.y).toBeLessThan(buttons.MOVE_RIGHT.y);
      expect(buttons.ROTATE_CCW.y).toBeGreaterThan(buttons.ROTATE_CW.y);
      expect(buttons.ROTATE_CCW.x).toBeLessThan(buttons.ROTATE_CW.x);
      if (controlLayout === "mirror") {
        expect(buttons.ROTATE_CW.x).toBeLessThan(buttons.MOVE_LEFT.x);
      } else {
        expect(buttons.MOVE_RIGHT.x).toBeLessThan(buttons.ROTATE_CCW.x);
      }
    }
  });

  it("honors size requests when space allows and reduces them to preserve the board on short screens", () => {
    expect(computeControlGeometry(752, 936, settings()).buttonSize).toBe(60);
    expect(
      computeControlGeometry(752, 936, settings({ controlScale: 1.3 }))
        .buttonSize,
    ).toBe(78);
    expect(
      computeControlGeometry(320, 936, settings({ controlScale: 1.3 }))
        .buttonSize,
    ).toBe(56);
    expect(
      computeControlGeometry(752, 400, settings({ controlScale: 1.3 }))
        .buttonSize,
    ).toBe(52);
    expect(
      computeControlGeometry(
        752,
        400,
        settings({ controlScale: 1.3, controlLayout: "floating" }),
      ).buttonSize,
    ).toBe(78);
  });

  it("moves clusters toward the edges with spread and raises them with height without moving hitboxes into each other", () => {
    const compact = computeControlGeometry(
      752,
      936,
      settings({ controlSpread: 0, controlHeight: 0 }),
    );
    const spread = computeControlGeometry(
      752,
      936,
      settings({ controlSpread: 1, controlHeight: 1 }),
    );
    expect(spread.buttons.MOVE_LEFT.x).toBe(0);
    expect(spread.buttons.ROTATE_CW.x + spread.buttonSize).toBe(752);
    expect(spread.buttons.MOVE_LEFT.x).toBeLessThan(
      compact.buttons.MOVE_LEFT.x,
    );
    expect(spread.bottomPadding).toBe(32);
    expect(compact.bottomPadding).toBe(0);
    expect(spread.height - compact.height).toBe(32);
    expect(
      computeControlGeometry(
        752,
        936,
        settings({ controlLayout: "floating", controlHeight: 1 }),
      ).bottomPadding,
    ).toBe(48);
  });

  it("treats malformed slider numbers as defaults, and finite outliers as slider endpoints", () => {
    const defaults = computeControlGeometry(377, 760, settings());
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(
        computeControlGeometry(
          377,
          760,
          settings({
            controlScale: value,
            controlSpread: value,
            controlHeight: value,
          }),
        ),
      ).toEqual(defaults);
    }
    expect(
      computeControlGeometry(
        377,
        760,
        settings({
          controlScale: -100,
          controlSpread: -100,
          controlHeight: -100,
        }),
      ),
    ).toEqual(
      computeControlGeometry(
        377,
        760,
        settings({ controlScale: 0.85, controlSpread: 0, controlHeight: 0 }),
      ),
    );
    expect(
      computeControlGeometry(
        377,
        760,
        settings({ controlScale: 100, controlSpread: 100, controlHeight: 100 }),
      ),
    ).toEqual(
      computeControlGeometry(
        377,
        760,
        settings({ controlScale: 1.3, controlSpread: 1, controlHeight: 1 }),
      ),
    );
  });

  it("returns finite geometry when viewport measurements are unavailable or malformed", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(computeControlGeometry(value, value, settings())).toEqual(
        computeControlGeometry(360, 600, settings()),
      );
    }
    for (const value of [0, -1]) {
      const geometry = computeControlGeometry(value, value, settings());
      expect(geometry.width).toBe(276);
      expect(geometry.height).toBe(104);
      expect(geometry.buttonSize).toBe(48);
    }
  });
});
