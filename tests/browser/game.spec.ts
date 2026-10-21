import { test, expect, type Page } from "@playwright/test";

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
  await page.locator('[data-mode="marathon"]').click();
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
  expect(board.y + board.height).toBeLessThanOrEqual(deck.y + 1);
  if (info.project.name === "phone")
    expect(board.width).toBeGreaterThanOrEqual(280);
  if (info.project.name === "small-phone")
    expect(board.width).toBeGreaterThanOrEqual(150);
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
  await expect(
    page.locator(".left-rail,.next-rail,.lock-row,.keyboard-hint"),
  ).toHaveCount(0);
});

test("background and pointer cancellation stop held movement", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-mode="marathon"]').click();
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
  await page.locator('[data-mode="marathon"]').click();
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
  await page.locator('[data-mode="marathon"]').click();
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
  await page.locator('[data-mode="marathon"]').click();
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const pixels: string[] = [];
  for (const theme of ["ink", "lcd", "neon", "paper"]) {
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
  expect(new Set(pixels).size).toBe(4);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('select[name="theme"]')).toHaveValue("paper");
});

test("control presets, sliders and reset are live and safe", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.locator('[data-mode="marathon"]').click();
  const initial = (await page.locator("#board").boundingBox())!;
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page.locator(".control-preview i")).toHaveCount(7);
  const settingsTargets = await page
    .locator('#settings-form select, #settings-form input[type="range"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  for (const height of settingsTargets)
    expect(height).toBeGreaterThanOrEqual(48);
  const runBefore = await page.evaluate(() =>
    localStorage.getItem("tetromino_v2_run"),
  );
  for (const preset of ["thumbs", "mirror", "floating"]) {
    await page.locator('select[name="controlLayout"]').selectOption(preset);
    await setRange(page, "controlScale", 1.3);
    await setRange(page, "controlSpread", 1);
    await setRange(page, "controlHeight", 1);
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
  expect(floating.width).toBeGreaterThan(initial.width);
  if (info.project.name === "phone")
    expect(floating.width).toBeGreaterThanOrEqual(340);
  await pausedRun(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset controls", exact: true })
    .click();
  await expect(page.locator('select[name="controlLayout"]')).toHaveValue(
    "thumbs",
  );
  expect(await page.locator('input[name="controlScale"]').inputValue()).toBe(
    "1",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_settings")!),
  );
  expect(saved.controlOpacity).toBe(0.18);
  expect(saved.controlLayout).toBe("thumbs");
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('select[name="controlLayout"]')).toHaveValue(
    "thumbs",
  );
});

test("home and dialogs contain plain concise copy", async ({ page }) => {
  await page.goto("/");
  const text = await page.locator("#home").innerText();
  expect(text).not.toMatch(
    /find your flow|one more piece|pure play|your pace|no distractions|offline arcade|just blocks/i,
  );
  await page.locator('[data-mode="marathon"]').click();
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
  await setRange(page, "controlScale", 1.3);
  await setRange(page, "controlSpread", 1);
  for (const layout of ["thumbs", "mirror", "floating"]) {
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
