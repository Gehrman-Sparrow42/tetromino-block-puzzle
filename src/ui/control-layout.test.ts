import { describe, expect, it } from "vitest";
import type { UserSettings } from "../contracts/game-contract";
import { DEFAULT_SETTINGS } from "../platform/storage";
import {
  canPlaceGamepadGroup,
  clampGamepadResize,
  computeBoardGeometry,
  computeControlGeometry,
  controlObstacles,
  computeRailGeometry,
  SIDE_RAIL_SPACE,
} from "./control-layout";
import { GAMEPAD_CONTROL_IDS } from "../contracts/game-contract";

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
  it("uses comfortable two-row action clusters for every gamepad preset", () => {
    for (const gamepadPreset of ["balanced", "compact", "mirrored"] as const) {
      for (const [width, height] of [
        [360, 600],
        [393, 851],
        [780, 340],
      ]) {
        const g = computeControlGeometry(
          width!,
          height!,
          settings({ controlLayout: "gamepad", gamepadPreset }),
        );
        const b = g.buttons;
        expect(b.HARD_DROP.y).toBe(b.HOLD.y);
        expect(b.ROTATE_CCW.y).toBe(b.ROTATE_CW.y);
        expect(b.HARD_DROP.y + b.HARD_DROP.height + 8).toBeLessThanOrEqual(
          b.ROTATE_CCW.y,
        );
        expect(b.HARD_DROP.x).toBe(b.ROTATE_CCW.x);
        expect(b.HOLD.x).toBe(b.ROTATE_CW.x);
        expect(b.ROTATE_CCW.x + b.ROTATE_CCW.width + 8).toBeLessThanOrEqual(
          b.ROTATE_CW.x,
        );
        expect(b.MOVE_LEFT.x).toBeLessThan(b.MOVE_RIGHT.x);
        expect(
          gamepadPreset === "mirrored"
            ? b.HOLD.x < b.MOVE_LEFT.x
            : b.MOVE_RIGHT.x < b.HARD_DROP.x,
        ).toBe(true);
        for (const id of GAMEPAD_CONTROL_IDS)
          expect(canPlaceGamepadGroup(g, id, g.groups![id])).toBe(true);
        expect(g.pad!.x).toBeGreaterThan(0);
        expect(g.groups!.rotateCW.x + g.groups!.rotateCW.width).toBeLessThan(
          width!,
        );
      }
    }
  });

  it("rejects colliding editor moves and preserves unrelated positions after a valid move", () => {
    const prefs = settings({ controlLayout: "gamepad" });
    const g = computeControlGeometry(393, 851, prefs);
    const r = g.groups!.hold;
    expect(canPlaceGamepadGroup(g, "hold", g.groups!.rotateCW)).toBe(false);
    expect(canPlaceGamepadGroup(g, "hold", { ...r, x: -1 })).toBe(false);
    const moved = { ...r, y: r.y - 12 };
    expect(canPlaceGamepadGroup(g, "hold", moved)).toBe(true);
    const next = computeControlGeometry(393, 851, {
      ...prefs,
      gamepadLayouts: {
        portrait: {
          hold: {
            x: (moved.x + moved.width / 2) / 393,
            y: (moved.y + moved.height / 2) / 851,
            size: 1,
            opacity: 0.3,
          },
        },
        landscape: {},
      },
    });
    expect(next.groups!.hold).toEqual(moved);
    for (const id of GAMEPAD_CONTROL_IDS.filter((id) => id !== "hold"))
      expect(next.groups![id]).toEqual(g.groups![id]);
    expect(
      computeBoardGeometry(393, 851, next, "gamepad").width,
    ).toBeGreaterThanOrEqual(
      computeBoardGeometry(393, 851, g, "gamepad").width - 6,
    );
  });

  it("resizes a separately moved control without changing other group positions", () => {
    const prefs = settings({
      controlLayout: "gamepad",
      gamepadLayouts: {
        portrait: { hold: { x: 0.8, y: 0.5, size: 1, opacity: 0.3 } },
        landscape: {},
      },
    });
    const before = computeControlGeometry(393, 851, prefs);
    prefs.gamepadLayouts.portrait.hold!.size = 1.3;
    const after = computeControlGeometry(393, 851, prefs);
    expect(after.groups!.hold.width).toBeGreaterThan(before.groups!.hold.width);
    for (const id of GAMEPAD_CONTROL_IDS.filter((id) => id !== "hold"))
      expect(after.groups![id]).toEqual(before.groups![id]);
  });

  it("keeps all twenty board rows clear of default and edited gamepad controls", () => {
    for (const [width, height] of [
      [377, 755],
      [344, 432],
      [560, 1100],
      [600, 250],
    ]) {
      for (const y of [undefined, 0.6, 0.85]) {
        const prefs = settings({
          controlLayout: "gamepad",
          gamepadLayouts: {
            portrait:
              y === undefined
                ? {}
                : { hold: { x: 0.9, y, size: 1.3, opacity: 0.2 } },
            landscape: {},
          },
        });
        const controls = computeControlGeometry(width!, height!, prefs);
        const board = computeBoardGeometry(
          width!,
          height!,
          controls,
          "gamepad",
        );
        expect(board.width).toBeGreaterThan(0);
        expect(board.height).toBe(board.width * 2);
        expect(board.y).toBe(0);
        expect(board.x + board.width / 2).toBeCloseTo(width! / 2);
        expect(board.x).toBeGreaterThanOrEqual(0);
        expect(board.x + board.width).toBeLessThanOrEqual(width!);
        for (const r of Object.values(controls.groups!)) {
          expect(
            board.x + board.width <= r.x - 8 ||
              board.x >= r.x + r.width + 8 ||
              board.y + board.height <= r.y - 8,
          ).toBe(true);
        }
      }
    }
  });
  it("makes a three-direction pad with neutral center and no up command", () => {
    const g = computeControlGeometry(
      375,
      700,
      settings({ controlLayout: "gamepad" }),
    );
    expect(g.overlay).toBe(true);
    expect(g.height).toBe(700);
    expect(g.pad).toEqual(g.groups!.pad);
    expect(g.buttons.MOVE_LEFT.y).toBe(g.buttons.MOVE_RIGHT.y);
    expect(g.buttons.SOFT_DROP.y).toBe(g.buttons.MOVE_LEFT.y + g.buttonSize);
    expect(g.buttons.SOFT_DROP.x).toBe(g.buttons.MOVE_LEFT.x + g.buttonSize);
    expect(Object.keys(g.buttons)).toHaveLength(7);
  });

  it("bounds custom groups and prevents collisions across portrait and landscape resizes", () => {
    for (const [width, height] of [
      [302, 440],
      [375, 700],
      [740, 230],
      [850, 300],
      [276, 104],
    ]) {
      for (const size of [0.75, 1, 1.4, 2]) {
        for (const coordinate of [0, 0.5, 1]) {
          const edits = Object.fromEntries(
            GAMEPAD_CONTROL_IDS.map((id) => [
              id,
              { x: coordinate, y: coordinate, size, opacity: 0.6 },
            ]),
          );
          const g = computeControlGeometry(
            width!,
            height!,
            settings({
              controlLayout: "gamepad",
              gamepadLayouts: { portrait: edits, landscape: edits },
            }),
          );
          const groups = Object.values(g.groups!);
          for (const r of groups) {
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.y).toBeGreaterThanOrEqual(0);
            expect(r.x + r.width).toBeLessThanOrEqual(width!);
            expect(r.y + r.height).toBeLessThanOrEqual(height!);
          }
          for (const b of Object.values(g.buttons)) {
            expect(b.width).toBeGreaterThanOrEqual(48);
            expect(b.height).toBeGreaterThanOrEqual(48);
          }
          for (let i = 0; i < groups.length; i++)
            for (let j = i + 1; j < groups.length; j++) {
              const a = groups[i]!,
                b = groups[j]!;
              expect(
                Math.max(
                  b.x - a.x - a.width,
                  a.x - b.x - b.width,
                  b.y - a.y - a.height,
                  a.y - b.y - b.height,
                ),
              ).toBeGreaterThanOrEqual(8);
            }
        }
      }
    }
  });

  it("uses separate orientation edits and allows explicit viewport orientation", () => {
    const s = settings({
      controlLayout: "gamepad",
      gamepadLayouts: {
        portrait: { pad: { x: 0.25, y: 0.2, size: 1, opacity: 0.15 } },
        landscape: { pad: { x: 0.25, y: 0.8, size: 1, opacity: 0.5 } },
      },
    });
    const portrait = computeControlGeometry(740, 400, s, "portrait");
    const landscape = computeControlGeometry(740, 400, s, "landscape");
    expect(portrait.groups!.pad.y).toBeLessThan(landscape.groups!.pad.y);
    expect(portrait.groupOpacity!.pad).toBe(0.15);
    expect(landscape.groupOpacity!.pad).toBe(0.5);
  });
  it("keeps seven separated, reachable targets inside every supported viewport", () => {
    let layoutsChecked = 0;
    for (const width of [320, 344, 377, 414, 752]) {
      for (const height of [400, 440, 760, 936]) {
        for (const controlLayout of ["thumbs", "mirror", "floating"] as const) {
          for (const controlScale of [0.85, 1, 1.3, 2]) {
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
    expect(layoutsChecked).toBe(2160);
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
    ).toBe(52);
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

describe("board-first side rails", () => {
  it("keeps the top aligned full board and rails clear of every preset at slider extremes", () => {
    for (const [width, height] of [
      [377, 847],
      [344, 524],
      [368, 849],
      [584, 389],
    ]) {
      for (const controlLayout of [
        "gamepad",
        "thumbs",
        "mirror",
        "floating",
      ] as const) {
        for (const controlScale of [0.85, 1.3, 2]) {
          const g = computeControlGeometry(
            width!,
            height!,
            settings({
              controlLayout,
              controlScale,
              controlHeight: 1,
              controlSpread: 1,
            }),
          );
          const board = computeBoardGeometry(width!, height!, g, controlLayout);
          expect(board.y).toBe(0);
          expect(board.x + board.width / 2).toBe(width! / 2);
          expect(board.height).toBe(board.width * 2);
          expect(board.width).toBeGreaterThan(90);
          expect(board.x).toBeGreaterThanOrEqual(SIDE_RAIL_SPACE);
          for (const r of [
            board,
            ...Object.values(
              computeRailGeometry(board, height!, g, controlLayout),
            ),
          ]) {
            for (const c of controlObstacles(height!, g, controlLayout)) {
              expect(
                r.x + r.width <= c.x ||
                  c.x + c.width <= r.x ||
                  r.y + r.height <= c.y ||
                  c.y + c.height <= r.y,
              ).toBe(true);
            }
          }
        }
      }
    }
  });
});

it("rejects high editor moves and renders unsafe saved maps without hiding side information", () => {
  for (const [width, height, orientation] of [
    [377, 847, "portrait"],
    [344, 524, "portrait"],
    [584, 389, "landscape"],
  ] as const) {
    const prefs = structuredClone(settings({ controlLayout: "gamepad" }));
    const baseline = computeControlGeometry(width, height, prefs, orientation);
    const high = {
      ...baseline.groups!.hold,
      x: Math.round(width / 2 - 30),
      y: 8,
    };
    expect(canPlaceGamepadGroup(baseline, "hold", high)).toBe(false);
    prefs.gamepadLayouts[orientation].hold = {
      x: (high.x + high.width / 2) / width,
      y: (high.y + high.height / 2) / height,
      size: 1,
      opacity: 0.3,
    };
    const saved = structuredClone(prefs.gamepadLayouts);
    const resolved = computeControlGeometry(width, height, prefs, orientation);
    expect(prefs.gamepadLayouts).toEqual(saved);
    expect(resolved.groups!.hold).toEqual(baseline.groups!.hold);
    for (const id of GAMEPAD_CONTROL_IDS)
      expect(resolved.groups![id]).toEqual(baseline.groups![id]);
    const board = computeBoardGeometry(width, height, resolved, "gamepad");
    for (const rail of Object.values(
      computeRailGeometry(board, height, resolved, "gamepad"),
    ))
      expect(rail.height).toBeGreaterThanOrEqual(resolved.minimumRailHeight!);
    const safe = { ...baseline.groups!.hold, y: baseline.groups!.hold.y - 12 };
    expect(canPlaceGamepadGroup(baseline, "hold", safe)).toBe(true);
  }
});

it("uses the full landscape width to keep side information readable at maximum controls", () => {
  for (const controlLayout of [
    "gamepad",
    "thumbs",
    "mirror",
    "floating",
  ] as const) {
    const geometry = computeControlGeometry(
      837,
      308,
      settings({
        controlLayout,
        controlScale: 1.3,
        controlHeight: 1,
        controlSpread: 1,
      }),
      "landscape",
    );
    const board = computeBoardGeometry(837, 308, geometry, controlLayout);
    expect(board.height).toBe(308);
    for (const rail of Object.values(
      computeRailGeometry(board, 308, geometry, controlLayout),
    ))
      expect(rail.height).toBeGreaterThanOrEqual(220);
  }
});

it("grows the square phone board using the old horizontal gutters", () => {
  const controls = computeControlGeometry(
    384,
    849,
    settings({ controlLayout: "gamepad" }),
  );
  const board = computeBoardGeometry(384, 849, controls, "gamepad");
  expect(board.width).toBe(284);
  expect(board.height).toBe(568);
});

it("permits a 200% individual action in free space without moving other controls", () => {
  const prefs = structuredClone(settings({ controlLayout: "gamepad" }));
  const baseline = computeControlGeometry(384, 849, prefs, "portrait");
  prefs.gamepadLayouts.portrait.hold = {
    x: 0.447,
    y: 0.75,
    size: 2,
    opacity: 0.3,
  };
  const grown = computeControlGeometry(384, 849, prefs, "portrait");
  expect(grown.groups!.hold.width).toBe(120);
  expect(canPlaceGamepadGroup(grown, "hold", grown.groups!.hold)).toBe(true);
  for (const id of GAMEPAD_CONTROL_IDS.filter((id) => id !== "hold"))
    expect(grown.groups![id]).toEqual(baseline.groups![id]);
});

it("supports a larger global size where space exists and preserves board and rail access at 200%", () => {
  const roomy = computeControlGeometry(
    1440,
    896,
    settings({ controlLayout: "gamepad", controlScale: 2 }),
    "landscape",
  );
  expect(roomy.baseButtonSize).toBe(120);
  expect(roomy.groups!.rotateCW.width).toBeGreaterThan(78);
  for (const [width, height] of [
    [384, 849],
    [360, 524],
    [853, 308],
    [1440, 896],
  ]) {
    for (const controlLayout of [
      "gamepad",
      "thumbs",
      "mirror",
      "floating",
    ] as const) {
      const g = computeControlGeometry(
        width!,
        height!,
        settings({ controlLayout, controlScale: 2, controlHeight: 1 }),
        width! > height! ? "landscape" : "portrait",
      );
      const board = computeBoardGeometry(width!, height!, g, controlLayout);
      expect(board.width).toBeGreaterThan(90);
      for (const rail of Object.values(
        computeRailGeometry(board, height!, g, controlLayout),
      ))
        expect(rail.height).toBeGreaterThanOrEqual(Math.min(200, board.height));
    }
  }
});

it("accepts a default pad resize by moving only its own center inward at an edge", () => {
  const prefs = structuredClone(settings({ controlLayout: "gamepad" }));
  const before = computeControlGeometry(384, 849, prefs, "portrait");
  const pad = before.groups!.pad;
  const placement = clampGamepadResize(before, "pad", {
    x: (pad.x + pad.width / 2) / 384,
    y: (pad.y + pad.height / 2) / 849,
    size: 1.2,
    opacity: 0.18,
  });
  prefs.gamepadLayouts.portrait.pad = placement;
  const after = computeControlGeometry(384, 849, prefs, "portrait");
  expect(after.groups!.pad.x).toBe(0);
  expect(after.groups!.pad.width).toBe(216);
  expect(canPlaceGamepadGroup(before, "pad", after.groups!.pad)).toBe(true);
  for (const id of GAMEPAD_CONTROL_IDS.filter((id) => id !== "pad"))
    expect(after.groups![id]).toEqual(before.groups![id]);
  expect(
    canPlaceGamepadGroup(before, "pad", {
      ...after.groups!.pad,
      x: before.groups!.hardDrop.x,
    }),
  ).toBe(false);
});
