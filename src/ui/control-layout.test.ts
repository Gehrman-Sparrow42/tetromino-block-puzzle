import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../platform/storage";
import {
  EDITABLE_CONTROL_IDS,
  type UserSettings,
} from "../contracts/game-contract";
import {
  computeControlGeometry,
  computeBoardGeometry,
  controlObstacles,
  canPlaceGamepadGroup,
} from "./control-layout";
const prefs = (overrides: Partial<UserSettings> = {}): UserSettings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...overrides,
});
describe("independent control customization", () => {
  it("keeps seven independent bounded controls for every layout and orientation", () => {
    for (const controlLayout of [
      "gamepad",
      "thumbs",
      "mirror",
      "floating",
    ] as const)
      for (const [w, h] of [
        [384, 849],
        [360, 524],
        [853, 308],
      ]) {
        const g = computeControlGeometry(
          w!,
          h!,
          prefs({ controlLayout, controlScale: 2 }),
        );
        expect(g.pad).toBeUndefined();
        expect(Object.keys(g.buttons)).toHaveLength(7);
        for (const id of EDITABLE_CONTROL_IDS) {
          const r = g.groups![id];
          expect(r.width).toBeGreaterThanOrEqual(48);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.width).toBeLessThanOrEqual(w!);
          expect(r.y + r.height).toBeLessThanOrEqual(h!);
        }
      }
  });
  it("allows actual overlapping actions without moving their neighbors", () => {
    const s = prefs();
    const before = computeControlGeometry(384, 849, s);
    const r = before.groups!.hold;
    s.gamepadLayouts.portrait.left = {
      x: (r.x + r.width / 2) / 384,
      y: (r.y + r.height / 2) / 849,
      size: 1,
      opacity: 0.2,
    };
    const after = computeControlGeometry(384, 849, s);
    expect(after.groups!.left).toEqual(after.groups!.hold);
    expect(canPlaceGamepadGroup(before, "left", after.groups!.left)).toBe(true);
    expect(after.groups!.right).toEqual(before.groups!.right);
  });
  it("removes hidden controls from fitting obstacles and keeps independent directions", () => {
    const s = prefs();
    s.gamepadLayouts.portrait.down = {
      x: 0.5,
      y: 0.8,
      size: 1,
      opacity: 0.2,
      hidden: true,
    };
    const g = computeControlGeometry(384, 849, s);
    expect(g.groupHidden!.down).toBe(true);
    expect(controlObstacles(849, g, "gamepad")).toHaveLength(6);
    expect(g.groupHidden!.left).toBe(false);
    expect(g.groupHidden!.right).toBe(false);
  });
  it("uses one centered square-cell board fitter for manual and automatic sizes", () => {
    const full = computeControlGeometry(384, 849, prefs());
    const smaller = computeControlGeometry(
      384,
      849,
      prefs({ boardScale: 0.7 }),
    );
    const a = computeBoardGeometry(384, 849, full, "gamepad"),
      b = computeBoardGeometry(384, 849, smaller, "gamepad");
    expect(b.width).toBeCloseTo(a.width * 0.7);
    expect(b.height).toBe(b.width * 2);
    expect(b.x + b.width / 2).toBe(192);
  });
  it("retains legacy movement-group placements as separate direction defaults", () => {
    const s = prefs();
    s.gamepadLayouts.portrait.pad = { x: 0.3, y: 0.8, size: 1.2, opacity: 0.3 };
    const g = computeControlGeometry(384, 849, s);
    expect(g.groups!.left.width).toBe(72);
    expect(g.groups!.down.width).toBe(72);
    expect(g.groupOpacity!.right).toBe(0.3);
  });
});

it("places movement on the left normally and on the right when mirrored, preserving arrow meanings", () => {
  for (const controlLayout of ["thumbs", "mirror", "floating"] as const) {
    const { buttons } = computeControlGeometry(
      377,
      760,
      legacySettings({ controlLayout }),
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
  expect(computeControlGeometry(752, 936, legacySettings()).buttonSize).toBe(
    60,
  );
  expect(
    computeControlGeometry(752, 936, legacySettings({ controlScale: 1.3 }))
      .buttonSize,
  ).toBe(78);
  expect(
    computeControlGeometry(320, 936, legacySettings({ controlScale: 1.3 }))
      .buttonSize,
  ).toBe(56);
  expect(
    computeControlGeometry(752, 400, legacySettings({ controlScale: 1.3 }))
      .buttonSize,
  ).toBe(52);
  expect(
    computeControlGeometry(
      752,
      400,
      legacySettings({ controlScale: 1.3, controlLayout: "floating" }),
    ).buttonSize,
  ).toBe(52);
});

it("treats malformed slider numbers as defaults, and finite outliers as slider endpoints", () => {
  const defaults = computeControlGeometry(377, 760, legacySettings());
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(
      computeControlGeometry(
        377,
        760,
        legacySettings({
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
      legacySettings({
        controlScale: -100,
        controlSpread: -100,
        controlHeight: -100,
      }),
    ),
  ).toEqual(
    computeControlGeometry(
      377,
      760,
      legacySettings({
        controlScale: 0.85,
        controlSpread: 0,
        controlHeight: 0,
      }),
    ),
  );
  expect(
    computeControlGeometry(
      377,
      760,
      legacySettings({
        controlScale: 100,
        controlSpread: 100,
        controlHeight: 100,
      }),
    ),
  ).toEqual(
    computeControlGeometry(
      377,
      760,
      legacySettings({ controlScale: 1.3, controlSpread: 1, controlHeight: 1 }),
    ),
  );
});

it("returns finite geometry when viewport measurements are unavailable or malformed", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(computeControlGeometry(value, value, legacySettings())).toEqual(
      computeControlGeometry(360, 600, legacySettings()),
    );
  }
  for (const value of [0, -1]) {
    const geometry = computeControlGeometry(value, value, legacySettings());
    expect(geometry.width).toBe(276);
    expect(geometry.height).toBe(104);
    expect(geometry.buttonSize).toBe(48);
  }
});

function legacySettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return prefs({
    controlLayout: "thumbs",
    controlScale: 1,
    controlOpacity: 0.18,
    controlSpread: 0.65,
    controlHeight: 0.3,
    ...overrides,
  });
}
it("preserves centered 10x20 fitting and control clearance across safe-area sized viewports", () => {
  for (const controlLayout of [
    "gamepad",
    "thumbs",
    "mirror",
    "floating",
  ] as const)
    for (const [w, h] of [
      [384, 849],
      [360, 524],
      [853, 308],
    ])
      for (const scale of [0.85, 1, 2]) {
        const g = computeControlGeometry(
          w!,
          h!,
          prefs({ controlLayout, controlScale: scale }),
        );
        const b = computeBoardGeometry(w!, h!, g, controlLayout);
        expect(b.width).toBeGreaterThan(0);
        expect(b.height).toBe(b.width * 2);
        expect(b.x + b.width / 2).toBe(w! / 2);
        expect(b.y).toBe(0);
        for (const c of controlObstacles(h!, g, controlLayout))
          expect(
            b.x + b.width <= c.x ||
              c.x + c.width <= b.x ||
              b.y + b.height <= c.y ||
              c.y + c.height <= b.y,
          ).toBe(true);
      }
});

it("scales the fitted landscape board after its height and obstacle constraints", () => {
  const full = computeControlGeometry(853, 308, prefs());
  const half = computeControlGeometry(853, 308, prefs({ boardScale: 0.5 }));
  const a = computeBoardGeometry(853, 308, full, "gamepad"),
    b = computeBoardGeometry(853, 308, half, "gamepad");
  expect(b.width).toBe(a.width * 0.5);
  expect(b.height).toBe(a.height * 0.5);
  expect(b.x + b.width / 2).toBe(853 / 2);
  for (const c of controlObstacles(308, half, "gamepad"))
    expect(
      b.x + b.width <= c.x ||
        c.x + c.width <= b.x ||
        b.y + b.height <= c.y ||
        c.y + c.height <= b.y,
    ).toBe(true);
});
