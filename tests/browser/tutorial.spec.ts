import { test, expect, type Page } from "@playwright/test";
import { createInitialState } from "../../src/engine/engine";
async function open(page: Page, track: "Basics" | "Advanced") {
  await page.goto("/");
  await page.getByRole("button", { name: "Tutorial", exact: true }).click();
  await page.getByRole("button", { name: track, exact: true }).click();
  return page.getByRole("dialog", { name: `${track} tutorial`, exact: true });
}
async function action(page: Page, label: string) {
  await page
    .locator(".tutorial")
    .getByRole("button", { name: label, exact: true })
    .click();
}
test("basics requires real actions and clears its prepared line", async ({
  page,
}) => {
  const dialog = await open(page, "Basics");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await action(page, "Move left");
  await action(page, "Move right");
  await action(page, "Continue");
  await action(page, "Rotate clockwise");
  await action(page, "Continue");
  await action(page, "Soft drop");
  await action(page, "Hard drop");
  await action(page, "Continue");
  await action(page, "Hard drop");
  await expect(dialog).toHaveAttribute("data-lines", "1");
  await action(page, "Continue");
  await action(page, "Hold");
  await action(page, "Continue");
  await expect(
    dialog.getByRole("heading", { name: "Practice complete" }),
  ).toBeVisible();
  await action(page, "Replay tutorial");
  await expect(dialog).toHaveAttribute("data-lesson", "1");
});
test("advanced teaches real back-to-back Tetrises and a T-spin double", async ({
  page,
}) => {
  const dialog = await open(page, "Advanced");
  await action(page, "Move right");
  await action(page, "Move right");
  await action(page, "Hard drop");
  await action(page, "Continue");
  await action(page, "Hold");
  await action(page, "Hold");
  await action(page, "Hard drop");
  await action(page, "Continue");
  await action(page, "Rotate clockwise");
  await action(page, "Hard drop");
  await expect(dialog).toHaveAttribute("data-lines", "4");
  await action(page, "Continue");
  for (let n = 0; n < 2; n++) {
    await action(page, "Rotate clockwise");
    await action(page, "Hard drop");
  }
  await expect(dialog).toHaveAttribute("data-lines", "8");
  await expect(dialog).toHaveAttribute("data-back-to-back", "true");
  await action(page, "Continue");
  await expect(
    dialog.getByRole("heading", { name: "Spin into a pocket" }),
  ).toBeVisible();
  const bounds = await dialog.locator(".tutorial-footer").boundingBox();
  await page.screenshot({ path: test.info().outputPath("t-spin-lesson.png") });
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  // A plain drop is not a T-spin and must not complete the objective.
  await action(page, "Hard drop");
  await expect(dialog).toHaveAttribute("data-t-spin", "none");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await action(page, "Reset lesson");
  await action(page, "Soft drop");
  await action(page, "Rotate clockwise");
  await action(page, "Hard drop");
  await expect(dialog).toHaveAttribute("data-t-spin", "full");
  await expect(dialog).toHaveAttribute("data-lines", "2");
  await action(page, "Continue");
  await expect(
    dialog.getByRole("heading", { name: "Practice complete" }),
  ).toBeVisible();
});
test("practice preserves stored run and progress and removes its keyboard listener", async ({
  page,
}) => {
  const run = createInitialState("marathon", 123);
  run.status = "paused";
  await page.addInitScript((run) => {
    localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
    localStorage.setItem(
      "afterblock_story_progress_v1",
      JSON.stringify({ version: 1, completed: {} }),
    );
  }, run);
  const dialog = await open(page, "Basics");
  const before = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    ),
  );
  await action(page, "Move left");
  await action(page, "Exit tutorial");
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  const after = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    ),
  );
  expect(after).toEqual(before);
  const reopened = await open(page, "Advanced");
  await page.keyboard.press("Escape");
  await expect(reopened).toHaveCount(0);
});
test("practice controls stay below the board and pause requires resume", async ({
  page,
}) => {
  const dialog = await open(page, "Basics");
  const board = await dialog.locator("#board").boundingBox();
  const deck = await dialog.locator(".tutorial-controls").boundingBox();
  expect(board).not.toBeNull();
  expect(deck).not.toBeNull();
  expect(deck!.y).toBeGreaterThanOrEqual(board!.y + board!.height);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    dialog.getByRole("button", { name: "Resume practice" }),
  ).toBeVisible();
  await action(page, "Move left");
  await action(page, "Move right");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await action(page, "Resume practice");
  await action(page, "Move left");
  await action(page, "Move right");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: `artifacts/tutorial-${page.viewportSize()!.width}.png`,
  });
});
