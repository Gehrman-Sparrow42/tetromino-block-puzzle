import { test, expect, type Page } from "@playwright/test";
import { THEME_IDS } from "../../src/contracts/game-contract";
import { createInitialState } from "../../src/engine/engine";

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === "small-phone")
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.setProperty(
          "--safe-area-inset-top",
          "24px",
        );
        document.documentElement.style.setProperty(
          "--safe-area-inset-bottom",
          "48px",
        );
      });
    });
});

async function startMarathon(page: Page) {
  await page.locator('[data-mode="marathon"]').click();
  await page.locator('[data-action="start-marathon"]').click();
}
async function pausedRun(page: Page) {
  await page.locator(".pause-button").click();
  await expect(page.getByRole("dialog")).toContainText("Paused");
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
}
async function closeSettings(page: Page) {
  await page.locator('#dialog [data-action="close"]').last().click();
}

test("dynamic connected buttons reposition without moving and reset their home on pause", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await page.locator('[name="padMode"]').selectOption("dynamic");
  await closeSettings(page);
  await startMarathon(page);
  const pad = page.locator("[data-movement-pad]");
  const home = (await pad.boundingBox())!;
  const zone = (await page.locator("[data-dynamic-pad-zone]").boundingBox())!;
  await page.mouse.click(
    zone.x + home.width / 2 - 12,
    zone.y + zone.height - 8,
  );
  await expect(page.locator(".control-deck .pressed")).toHaveCount(0);
  const moved = (await pad.boundingBox())!;
  expect(
    Math.abs(moved.x - home.x) + Math.abs(moved.y - home.y),
  ).toBeGreaterThan(8);
  const left = (await page
    .locator('[data-command="MOVE_LEFT"]')
    .boundingBox())!;
  await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2);
  await page.mouse.down();
  await expect(page.locator('[data-command="MOVE_LEFT"]')).toHaveClass(
    /pressed/,
  );
  await page.mouse.move(left.x + left.width * 2.5, left.y + left.height / 2);
  await expect(page.locator('[data-command="MOVE_RIGHT"]')).not.toHaveClass(
    /pressed/,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toContainText("Paused");
  await expect(page.locator(".control-deck .pressed")).toHaveCount(0);
  expect(await pad.boundingBox()).toEqual(home);
});

test("Marathon speed setup persists with the run and can be cancelled", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-mode="marathon"]').click();
  await expect(page.getByRole("dialog")).toContainText(
    "Faster every 10 lines.",
  );
  await page.getByLabel("Speed", { exact: true }).selectOption("fixed");
  await page.getByLabel("Starting level").selectOption("7");
  await expect(page.getByRole("dialog")).toContainText("Speed stays constant.");
  await page.locator('[data-action="start-marathon"]').click();
  expect((await pausedRun(page)).marathonOptions).toEqual({
    startingLevel: 7,
    speedMode: "fixed",
  });
  await page.reload();
  await page.locator("#resume-card").click();
  await expect(page.locator("#level")).toHaveText("7");
  await pausedRun(page);
  await page.locator('[data-action="restart"]').click();
  await expect(page.getByLabel("Speed", { exact: true })).toHaveValue("fixed");
  await page.getByLabel("Starting level").selectOption("2");
  await closeSettings(page);
  expect(
    (
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("tetromino_v2_run")!),
      )
    ).marathonOptions.startingLevel,
  ).toBe(7);
});
async function setRange(page: Page, name: string, value: number) {
  await page.locator('input[name="' + name + '"]').evaluate((node, value) => {
    const input = node as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("play, hold, pause, resume and settings persist", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Afterblock",
  );
  await startMarathon(page);
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await page.getByRole("button", { name: "Hard drop", exact: true }).click();
  const saved = await pausedRun(page);
  expect(saved.piecesPlaced).toBe(1);
  expect(saved.hold).not.toBeNull();
  expect(saved.softDropActive).toBe(false);
  await page.reload();
  await page.locator("#resume-card").click();
  const resumed = await pausedRun(page);
  expect(resumed.piecesPlaced).toBe(1);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.locator('input[name="soundEnabled"]').uncheck();
  await page.locator('input[name="reducedMotion"]').check();
  await closeSettings(page);
  await expect(page.getByRole("dialog")).toContainText("Paused");
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('input[name="soundEnabled"]')).not.toBeChecked();
  await expect(page.locator('input[name="reducedMotion"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test("larger board, seven spacious controls and no overlap", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.locator('[data-mode="sprint40"]').click();
  const board = (await page.locator("#board").boundingBox())!;
  const deck = (await page.locator(".control-deck").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(board.height / board.width).toBeCloseTo(2, 1);
  expect(
    Math.abs(board.x + board.width / 2 - (deck.x + deck.width / 2)),
  ).toBeLessThan(1);
  // The complete board stays above or beside the controls, including its bottom rows.
  expect(board.y + board.height).toBeLessThanOrEqual(deck.y + deck.height + 1);
  if (info.project.name === "phone")
    expect(board.width).toBeGreaterThanOrEqual(250);
  if (info.project.name === "small-phone")
    expect(board.width).toBeGreaterThanOrEqual(130);
  const inset = await page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--safe-area-inset-bottom",
        ),
      ) || 0,
  );
  const rects = await page
    .locator(".control-deck .control")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
  expect(rects).toHaveLength(7);
  for (const r of rects) {
    expect(
      board.x + board.width <= r.x - 7 ||
        board.x >= r.x + r.width + 7 ||
        board.y + board.height <= r.y - 7,
    ).toBe(true);
    expect(r.width).toBeGreaterThanOrEqual(48);
    expect(r.height).toBeGreaterThanOrEqual(48);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(r.y + r.height).toBeLessThanOrEqual(viewport.height - inset + 1);
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i],
        b = rects[j];
      expect(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      ).toBe(true);
    }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await expect(page.locator(".left-rail")).toBeVisible();
  await expect(page.locator(".next-rail")).toBeVisible();
  await expect(page.locator(".game-hud,.preview-strip")).toHaveCount(0);
  const topInset = await page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--safe-area-inset-top",
        ),
      ) || 0,
  );
  expect(board.y).toBeLessThanOrEqual(topInset + 8);
  const leftRail = (await page.locator(".left-rail").boundingBox())!;
  const nextRail = (await page.locator(".next-rail").boundingBox())!;
  expect(leftRail.x + leftRail.width).toBeLessThanOrEqual(board.x + 1);
  expect(nextRail.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
});

test("side rails fit large scores and keep all previews beside the top-aligned board", async ({
  page,
}) => {
  const run = createInitialState("marathon", 47);
  run.status = "paused";
  run.score = 12345678;
  await page.addInitScript(
    (run) => localStorage.setItem("tetromino_v2_run", JSON.stringify(run)),
    run,
  );
  for (const viewport of [
    { width: 384, height: 853 },
    { width: 853, height: 384 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator("#resume-card").click();
    const board = (await page.locator("#board").boundingBox())!;
    const topInset = await page.evaluate(
      () =>
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--safe-area-inset-top",
          ),
        ) || 0,
    );
    expect(board.y).toBeLessThanOrEqual(topInset + 8);
    await expect(page.locator(".next-rail canvas")).toHaveCount(5);
    for (const preview of await page.locator(".next-rail canvas").all())
      await expect(preview).toBeVisible();
    const score = page.locator("#score");
    expect(
      await score.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    const pause = (await page.locator(".pause-button").boundingBox())!;
    expect(pause.width).toBeGreaterThanOrEqual(48);
    expect(pause.height).toBeGreaterThanOrEqual(48);
    expect(pause.x).toBeGreaterThanOrEqual(board.x + board.width - 1);
  }
});

test("saved high custom controls cannot hide side information or Pause", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "tetromino_v2_settings",
      JSON.stringify({
        controlLayout: "gamepad",
        gamepadLayouts: {
          portrait: { pad: { x: 0.25, y: 0.15, size: 1, opacity: 0.2 } },
          landscape: {},
        },
      }),
    ),
  );
  await page.goto("/");
  await startMarathon(page);
  const rail = (await page.locator(".next-rail").boundingBox())!;
  const pause = (await page.locator(".pause-button").boundingBox())!;
  expect(pause.y + pause.height).toBeLessThanOrEqual(rail.y + rail.height + 1);
  for (const item of await page.locator(".next-rail canvas").all()) {
    const r = (await item.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(rail.y + rail.height + 1);
  }
  await page.locator(".pause-button").click();
  await expect(page.getByRole("dialog")).toContainText("Paused");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tetromino_v2_settings")!)
          .gamepadLayouts.portrait.pad.y,
    ),
  ).toBe(0.15);
});

test("background and pointer cancellation stop held movement", async ({
  page,
}) => {
  await page.goto("/");
  await startMarathon(page);
  const left = page.getByRole("button", { name: "Left", exact: true });
  const r = (await left.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await left.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("dialog")).toContainText("Paused");
  const first = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
  await page.getByRole("dialog").locator('[data-action="resume"]').click();
  await page.waitForTimeout(450);
  const second = await pausedRun(page);
  expect(second.active.x).toBe(first.active.x);
  expect(second.softDropActive).toBe(false);
});

test("replacement confirmation preserves current run on cancel", async ({
  page,
}) => {
  await page.goto("/");
  await startMarathon(page);
  await pausedRun(page);
  await page.getByRole("dialog").locator('[data-action="home"]').click();
  await page.locator('[data-mode="ultra120"]').click();
  await expect(page.getByRole("dialog")).toContainText("Replace saved run?");
  await closeSettings(page);
  await page.locator("#resume-card").click();
  await expect(page.locator("#mode-label")).toHaveText("Marathon");
});

test("Ultra completion records once and clears the saved run", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const engine = await import("/src/engine/engine.ts");
    const run = engine.createInitialState("ultra120", 12345);
    run.elapsedMs = 119950;
    run.score = 456;
    localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
  });
  await page.reload();
  await page.locator("#resume-card").click();
  await expect(page.getByRole("dialog")).toContainText("Complete");
  await expect(page.getByRole("dialog")).toContainText("456");
  const result = await page.evaluate(() => ({
    stats: JSON.parse(localStorage.getItem("tetromino_v2_stats")!),
    run: localStorage.getItem("tetromino_v2_run"),
  }));
  expect(result.stats.gamesPlayed).toBe(1);
  expect(result.stats.ultra120HighScore).toBe(456);
  expect(result.run).toBeNull();
  await page.getByRole("dialog").locator('[data-action="home"]').click();
  await expect(page.locator("#resume-card")).toBeHidden();
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_stats")!).gamesPlayed,
    ),
  ).toBe(1);
});

test("pause key toggles without closing Settings", async ({ page }) => {
  await page.goto("/");
  await startMarathon(page);
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toContainText("Paused");
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.keyboard.press("p");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toContainText("Settings");
});

test("themes change chrome and canvas immediately and persist", async ({
  page,
}) => {
  await page.goto("/");
  await startMarathon(page);
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const pixels: string[] = [];
  await expect(page.locator('select[name="theme"] option')).toHaveCount(
    THEME_IDS.length,
  );
  for (const theme of THEME_IDS) {
    await page.locator('select[name="theme"]').selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.waitForTimeout(60);
    pixels.push(
      await page.locator("#board").evaluate((node) => {
        const c = node as HTMLCanvasElement;
        return Array.from(
          c.getContext("2d")!.getImageData(3, 3, 1, 1).data,
        ).join(",");
      }),
    );
  }
  expect(new Set(pixels).size).toBe(THEME_IDS.length);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "classic");
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('select[name="theme"]')).toHaveValue("classic");
});

test("control presets, sliders and reset are live and safe", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await page.locator('select[name="controlLayout"]').selectOption("thumbs");
  await closeSettings(page);
  await startMarathon(page);
  const initial = (await page.locator("#board").boundingBox())!;
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.locator(".control-preview i")).toHaveCount(7);
  const settingsTargets = await page
    .locator(
      '#settings-form select:visible, #settings-form input[type="range"]:visible',
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  for (const height of settingsTargets)
    expect(height).toBeGreaterThanOrEqual(48);
  const runBefore = await page.evaluate(() =>
    localStorage.getItem("tetromino_v2_run"),
  );
  for (const preset of ["gamepad", "thumbs", "mirror", "floating"]) {
    await page.locator('select[name="controlLayout"]').selectOption(preset);
    await setRange(page, "controlScale", 2);
    await setRange(page, "controlSpread", 1);
    await setRange(page, "controlHeight", 1);
    for (const [railSelector, childSelector] of [
      [".left-rail", "#time"],
      [".next-rail", "#next-4"],
    ]) {
      const rail = (await page.locator(railSelector).boundingBox())!;
      const child = (await page.locator(childSelector).boundingBox())!;
      expect(child.y + child.height).toBeLessThanOrEqual(
        rail.y + rail.height + 1,
      );
    }
    const positions = await page
      .locator(".control-deck .control")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    for (const r of positions) {
      expect(r.w).toBeGreaterThanOrEqual(48);
      expect(r.h).toBeGreaterThanOrEqual(48);
      const board = (await page.locator("#board").boundingBox())!;
      expect(
        board.x + board.width <= r.x - 7 ||
          board.x >= r.x + r.w + 7 ||
          board.y + board.height <= r.y - 7,
      ).toBe(true);
    }
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i],
          b = positions[j];
        expect(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
        ).toBe(true);
      }
  }
  await setRange(page, "controlOpacity", 0.08);
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toBe(runBefore);
  await closeSettings(page);
  await page.getByRole("dialog").locator('[data-action="resume"]').click();
  const floating = (await page.locator("#board").boundingBox())!;
  expect(floating.width).toBeGreaterThan(0);
  expect(floating.y).toBeLessThanOrEqual(initial.y + 1);
  if (info.project.name === "phone")
    expect(floating.width).toBeGreaterThanOrEqual(200);
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset controls", exact: true })
    .click();
  await expect(page.locator('select[name="controlLayout"]')).toHaveValue(
    "gamepad",
  );
  expect(await page.locator('input[name="controlScale"]').inputValue()).toBe(
    "1",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_settings")!),
  );
  expect(saved.controlOpacity).toBe(0.18);
  expect(saved.controlLayout).toBe("gamepad");
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('select[name="controlLayout"]')).toHaveValue(
    "gamepad",
  );
});

test("home and dialogs contain plain concise copy", async ({ page }) => {
  await page.goto("/");
  const text = await page.locator("#home").innerText();
  expect(text).not.toMatch(
    /find your flow|one more piece|pure play|your pace|no distractions|offline arcade|just blocks/i,
  );
  await startMarathon(page);
  await pausedRun(page);
  expect(await page.getByRole("dialog").innerText()).not.toMatch(
    /breathing room|take a breath|your next move can wait/i,
  );
  await expect(
    page.getByRole("dialog").locator('[data-action="resume"]'),
  ).toHaveText("Resume");
});

test("settings preview fits a 320px screen at maximum size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await setRange(page, "controlScale", 2);
  await setRange(page, "controlSpread", 1);
  for (const layout of ["gamepad", "thumbs", "mirror", "floating"]) {
    await page.locator('select[name="controlLayout"]').selectOption(layout);
    const preview = (await page.locator(".control-preview").boundingBox())!;
    const indicators = await page.locator(".control-preview i").all();
    expect(indicators).toHaveLength(7);
    for (const indicator of indicators) {
      const box = (await indicator.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(preview.x);
      expect(box.y).toBeGreaterThanOrEqual(preview.y);
      expect(box.x + box.width).toBeLessThanOrEqual(
        preview.x + preview.width + 1,
      );
      expect(box.y + box.height).toBeLessThanOrEqual(
        preview.y + preview.height + 1,
      );
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

async function openControlEditor(page: Page) {
  await page.locator('[data-action="edit-controls"]').click();
  await expect(page.locator(".control-editor")).toBeVisible();
}
async function dragEditorControl(
  page: Page,
  id: string,
  dx: number,
  dy: number,
) {
  const box = (await page
    .locator(`[data-editor-control="${id}"]`)
    .boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + dx,
    box.y + box.height / 2 + dy,
    { steps: 8 },
  );
  await page.mouse.up();
}

test("gamepad has three movement zones and saves edited controls without changing the run", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto("/");
  await startMarathon(page);
  await expect(page.locator("#game")).toHaveAttribute("data-layout", "gamepad");
  const commands = await page
    .locator("[data-movement-pad] [data-command]")
    .evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.command),
    );
  expect(commands.sort()).toEqual(["MOVE_LEFT", "MOVE_RIGHT", "SOFT_DROP"]);
  const savedRun = await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await openControlEditor(page);
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await dragEditorControl(page, "pad", 0, -70);
  await page.locator('[data-editor-control="hold"]').click();
  await page.locator('[name="editorControlOpacity"]').press("Home");
  await expect(page.locator('[name="editorControlOpacity"]')).toHaveValue(
    "0.08",
  );
  // Move Hold away from the packed action cluster before doubling its size.
  // Use logical gameplay coordinates so the same free area works in the scaled
  // editor with and without the injected native safe-area insets.
  const frame = (await page.locator(".control-editor-frame").boundingBox())!;
  const logicalWidth = Number(
    await page
      .locator(".control-editor-frame")
      .getAttribute("data-viewport-width"),
  );
  const scale = frame.width / logicalWidth;
  const hold = (await page
    .locator('[data-editor-control="hold"]')
    .boundingBox())!;
  await dragEditorControl(
    page,
    "hold",
    frame.x + 150 * scale - hold.x - hold.width / 2,
    frame.y + 430 * scale - hold.y - hold.height / 2,
  );
  await setRange(page, "editorControlSize", 2);
  await expect(page.locator('[name="editorControlSize"]')).toHaveValue("2");
  await setRange(page, "editorControlOpacity", 0.1);
  await page.locator('[data-editor-action="done"]').click();
  await expect(page.locator("#dialog")).toContainText("Settings");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_settings")!),
  );
  expect(saved.controlLayout).toBe("gamepad");
  expect(saved.gamepadLayouts.portrait.pad).toBeDefined();
  expect(saved.gamepadLayouts.portrait.hold).toMatchObject({
    size: 2,
    opacity: 0.1,
  });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tetromino_v2_run")!),
    ),
  ).toEqual(savedRun);
  await closeSettings(page);
  await page.getByRole("dialog").locator('[data-action="resume"]').click();
  expect(
    await page
      .locator('.control-deck [data-command="HOLD"]')
      .evaluate((n) =>
        (n as HTMLElement).style.getPropertyValue("--control-opacity"),
      ),
  ).toBe("0.1");
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await openControlEditor(page);
  await page.locator('[data-editor-control="hold"]').click();
  await expect(page.locator('[name="editorControlOpacity"]')).toHaveValue(
    "0.1",
  );
  await expect(page.locator('[name="editorControlSize"]')).toHaveValue("2");
});

test("control editor cancel, escape and pointer cancellation preserve saved settings", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  const before = await page.evaluate(() =>
    localStorage.getItem("tetromino_v2_settings"),
  );
  await openControlEditor(page);
  await dragEditorControl(page, "pad", 0, -60);
  await setRange(page, "editorControlOpacity", 0.5);
  await page.keyboard.press("KeyP");
  await expect(page.locator(".control-editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".control-editor")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_settings")),
  ).toBe(before);
  await openControlEditor(page);
  const pad = page.locator('[data-editor-control="pad"]');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 55, {
    steps: 4,
  });
  await pad.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.locator('[data-editor-action="done"]').click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tetromino_v2_settings")!)
          .gamepadLayouts.portrait,
    ),
  ).toEqual({});
});

test("control editor keeps portrait and landscape layouts separate and resets only the current orientation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await openControlEditor(page);
  await dragEditorControl(page, "pad", 0, -55);
  await page.locator('[data-editor-action="done"]').click();
  const portrait = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("tetromino_v2_settings")!).gamepadLayouts
        .portrait,
  );
  await openControlEditor(page);
  await page.setViewportSize({ width: 851, height: 393 });
  await expect(page.locator("[data-editor-orientation]")).toHaveText(
    "Landscape",
  );
  await expect(page.locator('[data-editor-action="done"]')).toBeInViewport();
  await dragEditorControl(page, "rotateCW", 0, 4);
  await page.locator('[data-editor-action="done"]').click();
  const edited = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("tetromino_v2_settings")!).gamepadLayouts,
  );
  expect(edited.portrait).toEqual(portrait);
  expect(edited.landscape.rotateCW).toBeDefined();
  await openControlEditor(page);
  await page.locator('[data-editor-action="reset"]').click();
  await page.locator('[data-editor-action="done"]').click();
  const reset = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("tetromino_v2_settings")!).gamepadLayouts,
  );
  expect(reset.portrait).toEqual(portrait);
  expect(reset.landscape).toEqual({});
});

test("editor and settings preview preserve gameplay coordinates and reject overlaps", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      "--safe-area-inset-left",
      "24px",
    );
    document.documentElement.style.setProperty(
      "--safe-area-inset-right",
      "24px",
    );
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(50);
  await page.locator('#home [data-action="settings"]').click();
  const homeViewport = await page.locator(".control-preview").evaluate((n) => ({
    width: n.getAttribute("data-viewport-width"),
    height: n.getAttribute("data-viewport-height"),
  }));
  await closeSettings(page);
  await startMarathon(page);
  const actual = await page
    .locator(".play-area")
    .evaluate((n) => ({ width: n.clientWidth, height: n.clientHeight }));
  expect(homeViewport).toEqual({
    width: String(actual.width),
    height: String(actual.height),
  });
  const gameRects = await page
    .locator(".movement-pad, .control-deck > .control")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: (n as HTMLElement).dataset.command ?? "pad",
        x: parseFloat((n as HTMLElement).style.left),
        y: parseFloat((n as HTMLElement).style.top),
        width: parseFloat((n as HTMLElement).style.width),
        height: parseFloat((n as HTMLElement).style.height),
      })),
    );
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const preview = await page.locator(".control-preview").evaluate((n) => {
    const frame = n.getBoundingClientRect();
    const target = n.querySelector<HTMLElement>(
      '[data-preview-command="ROTATE_CW"]',
    )!;
    const rect = target.getBoundingClientRect();
    const scale =
      frame.height / Number((n as HTMLElement).dataset.viewportHeight);
    const offset =
      (frame.width - Number((n as HTMLElement).dataset.viewportWidth) * scale) /
      2;
    return {
      x: (rect.x - frame.x - offset) / scale,
      y: (rect.y - frame.y) / scale,
      width: rect.width / scale,
    };
  });
  const cw = gameRects.find((r) => r.id === "ROTATE_CW")!;
  expect(preview.x).toBeCloseTo(cw.x, 0);
  expect(preview.y).toBeCloseTo(cw.y, 0);
  expect(preview.width).toBeCloseTo(cw.width, 0);
  await openControlEditor(page);
  const frame = page.locator(".control-editor-frame");
  await expect(frame).toHaveAttribute(
    "data-viewport-height",
    String(actual.height),
  );
  const original = await page
    .locator("[data-editor-control]")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: (n as HTMLElement).dataset.editorControl,
        x: parseFloat((n as HTMLElement).style.left),
        y: parseFloat((n as HTMLElement).style.top),
      })),
    );
  expect(original.find((r) => r.id === "rotateCW")).toMatchObject({
    x: cw.x,
    y: cw.y,
  });
  const otherBefore = await page
    .locator('[data-editor-control="rotateCW"]')
    .getAttribute("style");
  await dragEditorControl(page, "pad", 200, 0);
  expect(
    await page
      .locator('[data-editor-control="rotateCW"]')
      .getAttribute("style"),
  ).toBe(otherBefore);
  await page.locator('[data-editor-action="cancel"]').click();
});

test("gamepad preset and movement mode persist and preset clears custom maps only", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await openControlEditor(page);
  await dragEditorControl(page, "pad", 0, -30);
  await page.locator('[data-editor-action="done"]').click();
  await setRange(page, "controlOpacity", 0.3);
  await page.locator('[name="padMode"]').selectOption("dynamic");
  await page.locator('[name="gamepadPreset"]').selectOption("mirrored");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_settings")!),
  );
  expect(saved).toMatchObject({
    gamepadPreset: "mirrored",
    padMode: "dynamic",
    controlOpacity: 0.3,
    gamepadLayouts: { portrait: {}, landscape: {} },
  });
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('[name="padMode"]')).toHaveValue("dynamic");
  await expect(page.locator('[name="gamepadPreset"]')).toHaveValue("mirrored");
  await page.locator('[name="padMode"]').selectOption("fixed");
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('[name="padMode"]')).toHaveValue("fixed");
});

test("landscape side information stays inside rails at maximum control settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 853, height: 384 });
  await page.goto("/");
  await page.locator('[data-mode="sprint40"]').click();
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  for (const preset of ["gamepad", "thumbs", "mirror", "floating"]) {
    await page.locator('[name="controlLayout"]').selectOption(preset);
    await setRange(page, "controlScale", 2);
    await setRange(page, "controlSpread", 1);
    await setRange(page, "controlHeight", 1);
    for (const [railSelector, childSelector] of [
      [".left-rail", "#time"],
      [".next-rail", "#next-4"],
    ]) {
      const rail = (await page.locator(railSelector).boundingBox())!;
      const child = (await page.locator(childSelector).boundingBox())!;
      expect(child.y + child.height).toBeLessThanOrEqual(
        rail.y + rail.height + 1,
      );
    }
    const pause = (await page.locator(".pause-button").boundingBox())!;
    expect(pause.height).toBeGreaterThanOrEqual(48);
    expect(pause.width).toBeGreaterThanOrEqual(48);
  }
});
