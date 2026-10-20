import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.project.name === "small-phone") {
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
  }
});

test("play, hold, pause, save, resume, and settings survive reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AFTER");
  await page.locator('[data-mode="marathon"]').click();
  await expect(page.locator("#game")).toBeVisible();
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await page.getByRole("button", { name: "Hard drop", exact: true }).click();
  await expect(page.locator("#piece-count")).toHaveText("1 PIECES");
  await page.locator(".pause-button").click();
  await expect(page.getByRole("dialog")).toContainText("On pause.");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
  expect(saved.piecesPlaced).toBe(1);
  expect(saved.hold).not.toBeNull();
  expect(saved.softDropActive).toBe(false);
  await page.reload();
  await page.locator("#resume-card").click();
  await expect(page.locator("#piece-count")).toHaveText("1 PIECES");
  await page.locator(".pause-button").click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator('input[name="soundEnabled"]').uncheck();
  await page.locator('input[name="reducedMotion"]').check();
  await page.getByRole("button", { name: /All set/ }).click();
  await expect(page.getByRole("dialog")).toContainText("On pause.");
  const settings = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_settings")!),
  );
  expect(settings.soundEnabled).toBe(false);
  expect(settings.reducedMotion).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator('input[name="soundEnabled"]')).not.toBeChecked();
  await expect(page.locator('input[name="reducedMotion"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test("game board and controls fit screen without overlap", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-mode="sprint40"]').click();
  const board = await page.locator("#board").boundingBox();
  const controls = await page.locator(".control-deck").boundingBox();
  const viewport = page.viewportSize()!;
  expect(board).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(board!.width).toBeGreaterThan(120);
  expect(board!.height / board!.width).toBeCloseTo(2, 1);
  expect(board!.y + board!.height).toBeLessThanOrEqual(controls!.y);
  const bottomInset = await page.evaluate(
    () =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--safe-area-inset-bottom",
        ),
      ) || 0,
  );
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(
    viewport.height - bottomInset + 1,
  );
  const buttons = await page.locator(".control-deck .control").all();
  for (const button of buttons) {
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});

test("background pause and cancelled pointer stop repeat", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-mode="marathon"]').click();
  const left = page.getByRole("button", { name: "Left", exact: true });
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await left.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("dialog")).toContainText("On pause.");
  const first = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
  await page.getByRole("button", { name: /Keep playing/ }).click();
  await page.waitForTimeout(450);
  await page.locator(".pause-button").click();
  const second = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
  expect(second.active.x).toBe(first.active.x);
  expect(second.softDropActive).toBe(false);
});

test("replacing a saved run requires confirmation", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-mode="marathon"]').click();
  await page.locator(".pause-button").click();
  await page.getByRole("button", { name: "Main menu", exact: true }).click();
  await page.locator('[data-mode="ultra120"]').click();
  await expect(page.getByRole("dialog")).toContainText("Replace this run?");
  await page
    .getByRole("button", { name: "Keep current run", exact: true })
    .click();
  await page.locator("#resume-card").click();
  await expect(page.locator("#mode-label")).toHaveText("MARATHON");
});

test("Ultra completion displays result, records it once, clears saved run", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    // Use the public engine to prepare a valid near-complete run, without a test-only app API.
    const engine = await import("/src/engine/engine.ts");
    const run = engine.createInitialState("ultra120", 12345);
    run.elapsedMs = 119950;
    run.score = 456;
    localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
  });
  await page.reload();
  await page.locator("#resume-card").click();
  await expect(page.getByRole("dialog")).toContainText("You did that.");
  await expect(page.locator(".result-score")).toContainText("456");
  const result = await page.evaluate(() => ({
    stats: JSON.parse(localStorage.getItem("tetromino_v2_stats")!),
    run: localStorage.getItem("tetromino_v2_run"),
  }));
  expect(result.stats.gamesPlayed).toBe(1);
  expect(result.stats.ultra120HighScore).toBe(456);
  expect(result.run).toBeNull();
  await page.getByRole("button", { name: "Main menu", exact: true }).click();
  await expect(page.locator("#resume-card")).toBeHidden();
  await page.reload();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_stats")!).gamesPlayed,
    ),
  ).toBe(1);
});

test("P toggles pause without navigating out and leaves settings alone", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-mode="marathon"]').click();
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toContainText("On pause.");
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("#game")).toBeVisible();
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.keyboard.press("p");
  await expect(page.getByRole("dialog")).toContainText("Your setup.");
});
