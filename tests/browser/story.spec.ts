import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/engine/engine";
import { STORY_LEVELS, storySpeedForLines } from "../../src/engine/story";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name === "desktop");
});
async function levels(page: Page) {
  await page.goto("/");
  await page.locator('#home [data-action="story-levels"]').click();
}
async function winFixture(page: Page, id = 1) {
  const level = STORY_LEVELS[id - 1]!;
  const run = createInitialState("story", 12345, { storyLevelId: id });
  run.lines = level.targetLines - 1;
  run.level = storySpeedForLines(level, run.lines);
  run.elapsedMs = 10000;
  run.board[23] = Array(10).fill("J");
  for (let x = 3; x < 7; x++) run.board[23]![x] = null;
  run.active = {
    ...run.active!,
    type: "I",
    rotation: 0,
    x: 3,
    y: 2,
    ghostY: 22,
  };
  run.status = "paused";
  await page.addInitScript(
    ({ run, id, marker }) => {
      if (localStorage.getItem(marker)) return;
      localStorage.setItem(marker, "1");
      localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
      const completed =
        JSON.parse(
          localStorage.getItem("afterblock_story_progress_v1") ?? "null",
        )?.completed ?? {};
      for (let n = 1; n < id; n++)
        completed[String(n)] = { bestScore: 1, bestTimeMs: 10000 };
      localStorage.setItem(
        "afterblock_story_progress_v1",
        JSON.stringify({ version: 1, completed }),
      );
    },
    { run, id, marker: `fixture-${Date.now()}-${Math.random()}` },
  );
  await page.goto("/");
  await page.locator("#resume-card").click();
}
async function clearGoal(page: Page) {
  await page.locator('.control-deck [data-command="HARD_DROP"]').click();
}
test("fresh campaign has one available level with readable speed bands", async ({
  page,
}, info) => {
  await levels(page);
  await expect(page.locator(".story-level")).toHaveCount(12);
  await expect(page.locator(".story-level:not(:disabled)")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Selected level" }),
  ).toContainText("Clear 12 lines");
  await expect(page.getByRole("list", { name: "Speed bands" })).toContainText(
    "Speed 2",
  );
  const locked = page.locator('[data-story-level="2"]');
  await locked.evaluate((el) => {
    el.removeAttribute("disabled");
    (el as HTMLButtonElement).click();
  });
  await expect(
    page.getByRole("button", { name: "Start level 1", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".story-detail")).toContainText("First Steps");
  await locked.evaluate((el) => el.setAttribute("disabled", ""));
  await page.screenshot({ path: info.outputPath("story-levels.png") });
  await page
    .getByRole("button", { name: "Start level 1", exact: true })
    .click();
  await expect(page.locator("#mode-label")).toHaveText("Story 1");
  await expect(page.locator("#speed-label")).toHaveText("Speed");
  await expect(page.locator("#lines")).toHaveText("0/12");
  await page.locator(".pause-button").click();
  await page.reload();
  await page.locator("#resume-card").click();
  await expect(page.locator("#mode-label")).toHaveText("Story 1");
});
test("Story restart retains its level and replacement cancel preserves saved run", async ({
  page,
}) => {
  await levels(page);
  await page
    .getByRole("button", { name: "Start level 1", exact: true })
    .click();
  await page.locator(".pause-button").click();
  await page.locator('[data-action="restart"]').click();
  await expect(
    page.getByRole("heading", { name: "Replace saved run?" }),
  ).toBeVisible();
  await page.locator('[data-action="confirm-new"]').click();
  await expect(page.locator("#mode-label")).toHaveText("Story 1");
  await page.locator(".pause-button").click();
  await page.locator('#dialog [data-action="home"]').click();
  await page.locator('[data-mode="sprint40"]').click();
  await page.locator('[data-action="confirm-new"]').click();
  await page.locator(".pause-button").click();
  await page.locator('#dialog [data-action="home"]').click();
  await page.locator('#home [data-action="story-levels"]').click();
  await page
    .getByRole("button", { name: "Start level 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_run")!).mode,
    ),
  ).toBe("sprint40");
});
test("actual goal clear unlocks Next and replay keeps one campaign completion", async ({
  page,
}, info) => {
  await winFixture(page);
  await clearGoal(page);
  await expect(
    page.getByRole("heading", { name: "Level 1 complete", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next level", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("story-complete.png") });
  await page.getByRole("button", { name: "Next level", exact: true }).click();
  await expect(page.locator("#mode-label")).toHaveText("Story 2");
  await page.locator(".pause-button").click();
  await page.locator('[data-action="restart"]').click();
  await page.locator('[data-action="confirm-new"]').click();
  await expect(page.locator("#mode-label")).toHaveText("Story 2");
  await winFixture(page);
  await clearGoal(page);
  await expect(
    page.getByRole("heading", { name: "Level 1 complete", exact: true }),
  ).toBeVisible();
  const progress = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("afterblock_story_progress_v1")!),
  );
  expect(Object.keys(progress.completed)).toEqual(["1"]);
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await expect(page.locator('[data-story-level="1"]')).toContainText(
    "Completed",
  );
  await expect(page.locator('[data-story-level="2"]')).toBeEnabled();
});
test("failed progress write blocks Next until explicit successful retry", async ({
  page,
}) => {
  await winFixture(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "afterblock_story_progress_v1")
        throw new Error("Storage full");
      original.call(this, key, value);
    };
    (window as any).restoreStoryStorage = () => {
      Storage.prototype.setItem = original;
    };
  });
  await clearGoal(page);
  await expect(
    page.getByRole("button", { name: "Next level", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Progress could not be saved",
  );
  await page.evaluate(() => (window as any).restoreStoryStorage());
  await page
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next level", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tetromino_v2_stats")!).gamesPlayed,
    ),
  ).toBe(1);
});
test("final victory ends campaign without another level", async ({ page }) => {
  await winFixture(page, 12);
  await clearGoal(page);
  await expect(
    page.getByRole("heading", { name: "Story complete", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next level", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await expect(page.locator(".story-level")).toHaveCount(12);
  await expect(page.locator(".story-level:disabled")).toHaveCount(0);
});
