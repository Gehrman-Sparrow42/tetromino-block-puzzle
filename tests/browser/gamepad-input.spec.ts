import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/engine/engine";
import { DEFAULT_SETTINGS } from "../../src/platform/storage";

async function saved(page: Page) {
  await page.locator(".pause-button").click();
  await expect(page.getByRole("dialog")).toContainText("Paused");
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
}
async function resume(page: Page) {
  await page.locator('#dialog [data-action="resume"]').click();
}
async function tap(page: Page, command: string) {
  const box = (await page
    .locator(`[data-command="${command}"]`)
    .boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
for (const viewport of [
  { width: 384, height: 853 },
  { width: 360, height: 600 },
  { width: 853, height: 384 },
]) {
  test(`real touch gamepad commands change the piece ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "phone");
    await page.setViewportSize(viewport);
    const state = createInitialState("marathon", 42);
    await page.addInitScript(
      ({ state, settings }) => {
        localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings));
        localStorage.setItem("tetromino_v2_run", JSON.stringify(state));
      },
      {
        state,
        settings: {
          ...DEFAULT_SETTINGS,
          soundEnabled: false,
          hapticsEnabled: false,
        },
      },
    );
    await page.goto("/");
    await page.locator("#resume-card").click();
    await tap(page, "MOVE_LEFT");
    let after = await saved(page);
    expect(after.active.x).toBe(state.active!.x - 1);
    await resume(page);
    await tap(page, "ROTATE_CW");
    after = await saved(page);
    expect(after.active.rotation).toBe(1);
    await resume(page);
    await tap(page, "HARD_DROP");
    after = await saved(page);
    expect(after.piecesPlaced).toBe(1);
  });
}

for (const padMode of ["fixed", "dynamic"] as const) {
  for (const viewport of [
    { width: 384, height: 853 },
    { width: 360, height: 600 },
    { width: 853, height: 384 },
  ]) {
    test(`real held ${padMode} mirrored gamepad survives multi-touch ${viewport.width}x${viewport.height}`, async ({
      page,
    }, info) => {
      test.skip(info.project.name !== "phone");
      await page.setViewportSize(viewport);
      const state = createInitialState("marathon", 42);
      await page.addInitScript(
        ({ state, settings }) => {
          localStorage.setItem(
            "tetromino_v2_settings",
            JSON.stringify(settings),
          );
          localStorage.setItem("tetromino_v2_run", JSON.stringify(state));
        },
        {
          state,
          settings: {
            ...DEFAULT_SETTINGS,
            padMode,
            gamepadPreset: "mirrored",
            soundEnabled: false,
            hapticsEnabled: false,
          },
        },
      );
      await page.goto("/");
      await page.locator("#resume-card").click();
      const cdp = await page.context().newCDPSession(page);
      const right = (await page
        .locator('[data-command="MOVE_RIGHT"]')
        .boundingBox())!;
      const cw = (await page
        .locator('[data-command="ROTATE_CW"]')
        .boundingBox())!;
      const x = right.x + right.width / 2,
        y = right.y + right.height / 2;
      const finger = { x, y, id: 1 };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [finger],
      });
      const action = { x: cw.x + cw.width / 2, y: cw.y + cw.height / 2, id: 2 };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [finger, action],
      });
      await page.waitForTimeout(340);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      const afterMove = await saved(page);
      expect(afterMove.active.x).toBeGreaterThan(state.active!.x + 1);
      expect(afterMove.active.rotation).toBe(1);
      await resume(page);
      const down = (await page
        .locator('[data-command="SOFT_DROP"]')
        .boundingBox())!;
      const drop = {
        x: down.x + down.width / 2,
        y: down.y + down.height / 2,
        id: 3,
      };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [drop],
      });
      await page.waitForTimeout(280);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      const afterDrop = await saved(page);
      expect(afterDrop.active.y).toBeGreaterThan(afterMove.active.y + 1);
      expect(afterDrop.softDropActive).toBe(false);
    });
  }
}

test("independent arrows ignore neutral gestures and retain their original command while dragging", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone");
  const state = createInitialState("marathon", 42);
  await page.addInitScript(
    ({ state, settings }) => {
      localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings));
      localStorage.setItem("tetromino_v2_run", JSON.stringify(state));
    },
    {
      state,
      settings: {
        ...DEFAULT_SETTINGS,
        padMode: "dynamic",
        soundEnabled: false,
        hapticsEnabled: false,
      },
    },
  );
  await page.goto("/");
  await page.locator("#resume-card").click();
  const leftHome = (await page
    .locator('.control-deck [data-command="MOVE_LEFT"]')
    .boundingBox())!;
  const rightHome = (await page
    .locator('.control-deck [data-command="MOVE_RIGHT"]')
    .boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const finger = {
    x: (leftHome.x + leftHome.width + rightHome.x) / 2,
    y: leftHome.y + leftHome.height / 2,
    id: 1,
  };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  finger.x = rightHome.x + rightHome.width / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [finger],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect((await saved(page)).active.x).toBe(state.active!.x);
  await resume(page);
  const left = (await page
    .locator('[data-command="MOVE_LEFT"]')
    .boundingBox())!;
  finger.x = left.x + left.width / 2;
  finger.y = left.y + left.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [finger],
  });
  finger.x = rightHome.x + rightHome.width / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [finger],
  });
  await page.waitForTimeout(220);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect((await saved(page)).active.x).toBeLessThan(state.active!.x - 1);
});

test("saved custom movement positions keep direct touch hitboxes aligned", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone");
  await page.setViewportSize({ width: 384, height: 853 });
  const state = createInitialState("marathon", 42);
  const placement = { x: 0.3, y: 0.8, size: 0.9, opacity: 0.3 };
  await page.addInitScript(
    ({ state, settings }) => {
      localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings));
      localStorage.setItem("tetromino_v2_run", JSON.stringify(state));
    },
    {
      state,
      settings: {
        ...DEFAULT_SETTINGS,
        padMode: "dynamic",
        gamepadLayouts: { portrait: { left: placement }, landscape: {} },
        soundEnabled: false,
        hapticsEnabled: false,
      },
    },
  );
  await page.goto("/");
  await page.locator("#resume-card").click();
  const area = (await page.locator(".play-area").boundingBox())!;
  const bounds = (await page
    .locator('.control-deck [data-command="MOVE_LEFT"]')
    .boundingBox())!;
  expect((bounds.x + bounds.width / 2 - area.x) / area.width).toBeCloseTo(
    placement.x,
    2,
  );
  expect((bounds.y + bounds.height / 2 - area.y) / area.height).toBeCloseTo(
    placement.y,
    2,
  );
  await tap(page, "MOVE_LEFT");
  expect((await saved(page)).active.x).toBe(state.active!.x - 1);
});

for (const viewport of [
  { width: 360, height: 600 },
  { width: 853, height: 384 },
]) {
  test(`legacy dynamic preferences keep fixed buttons and board gestures reachable ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "phone");
    await page.setViewportSize(viewport);
    const state = createInitialState("marathon", 42);
    await page.addInitScript(
      ({ state, settings }) => {
        localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings));
        localStorage.setItem("tetromino_v2_run", JSON.stringify(state));
      },
      {
        state,
        settings: {
          ...DEFAULT_SETTINGS,
          padMode: "dynamic",
          controlScheme: "hybrid",
          soundEnabled: false,
          hapticsEnabled: false,
        },
      },
    );
    await page.goto("/");
    await page.locator("#resume-card").click();
    const board = (await page.locator("#board").boundingBox())!;
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.id,
      { x: board.x + board.width / 2, y: board.y + board.height / 2 },
    );
    expect(hit).toBe("board");
    await page.touchscreen.tap(
      board.x + board.width / 2,
      board.y + board.height / 2,
    );
    expect((await saved(page)).active.rotation).toBe(1);
    await resume(page);
    const left = page.locator('.control-deck [data-command="MOVE_LEFT"]');
    const home = await left.boundingBox();
    await page.touchscreen.tap(10, viewport.height - 5);
    expect(await left.boundingBox()).toEqual(home);
    await tap(page, "MOVE_LEFT");
    expect((await saved(page)).active.x).toBe(state.active!.x - 1);
  });
}
