import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/engine/engine";

test("ending during a pending ad aborts the reward and records once", async ({
  page,
}) => {
  await reachGameOver(page);
  await page.getByRole("button", { name: "Test ad · clear 2 rows" }).click();
  await expect(
    page.getByRole("button", { name: "Complete test ad", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "End run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete test ad", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_stats")!).gamesPlayed,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toBeNull();
});

async function reachGameOver(page: Page, preview = true) {
  const run = createInitialState("marathon", 47);
  run.status = "paused";
  run.score = 1234;
  run.rewardRunId = "browser-reward-run";
  run.board[2][4] = "T";
  run.board[2][5] = "T";
  run.nextQueue[0] = "O";
  run.active = {
    type: "I",
    rotation: 0,
    x: 0,
    y: 20,
    ghostY: 22,
    lockTimerMs: 0,
    lockResetsUsed: 0,
    lastActionWasRotation: false,
    lastKickIndex: 0,
  };
  await page.addInitScript((run) => {
    if (!sessionStorage.getItem("reward-seeded")) {
      localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
      sessionStorage.setItem("reward-seeded", "yes");
    }
  }, run);
  await page.goto(preview ? "/?rewardedAds=test" : "/");
  await page.locator("#resume-card").click();
  await page.getByRole("button", { name: "Hard drop", exact: true }).click();
}

test("disabled ads retain normal game over and record once", async ({
  page,
}) => {
  await reachGameOver(page, false);
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
  await expect(page.locator('[data-action="watch-ad"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_stats")!).gamesPlayed,
    ),
  ).toBe(1);
});

test("completed test ad continues paused and persists one assisted run", async ({
  page,
}, testInfo) => {
  await reachGameOver(page);
  await expect(
    page.getByRole("heading", { name: "Continue?", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_stats")!).gamesPlayed,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("continue-offer.png") });
  await page.getByRole("button", { name: "Test ad · clear 2 rows" }).click();
  await page
    .getByRole("button", { name: "Complete test ad", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paused", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_run")!),
  );
  expect(saved).toMatchObject({
    status: "paused",
    continuesUsed: 1,
    rewardRunId: "browser-reward-run",
    lines: 0,
  });
  await page.reload();
  await page.locator("#resume-card").click();
  await page.locator(".pause-button").click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_run")!).rewardRunId,
    ),
  ).toBe("browser-reward-run");
  await page.evaluate(() => {
    const run = JSON.parse(localStorage.getItem("tetromino_v2_run")!);
    run.board = run.board.map((row: unknown[]) => row.map(() => null));
    run.board[2][4] = "T";
    run.board[2][5] = "T";
    run.nextQueue[0] = "O";
    run.active = {
      type: "I",
      rotation: 0,
      x: 0,
      y: 20,
      ghostY: 22,
      lockTimerMs: 0,
      lockResetsUsed: 0,
      lastActionWasRotation: false,
      lastKickIndex: 0,
    };
    localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
  });
  await page.reload();
  await page.locator("#resume-card").click();
  await page.getByRole("button", { name: "Hard drop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
  await expect(page.locator('[data-action="watch-ad"]')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tetromino_v2_stats")!),
    ),
  ).toMatchObject({ gamesPlayed: 1, marathonHighScore: 0 });
});

test("cancelled ad grants nothing and end run remains available", async ({
  page,
}) => {
  await reachGameOver(page);
  await page.getByRole("button", { name: "Test ad · clear 2 rows" }).click();
  await page
    .getByRole("button", { name: "Cancel test ad", exact: true })
    .click();
  await expect(page.locator("[data-reward-status]")).toHaveText(
    "Ad not completed. Try again or end the run.",
  );
  await page.getByRole("button", { name: "End run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible();
  const stats = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_stats")!),
  );
  expect(stats.gamesPlayed).toBe(1);
  expect(stats.marathonHighScore).toBeGreaterThanOrEqual(1234);
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toBeNull();
});
