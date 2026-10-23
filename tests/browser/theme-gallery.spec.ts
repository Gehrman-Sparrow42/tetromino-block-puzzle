import { expect, test } from "@playwright/test";
import { applyCommand, createInitialState } from "../../src/engine/engine";
import { THEME_IDS } from "../../src/contracts/game-contract";

test("locked theme previews fit the small phone and restore the selected palette", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "small-phone");
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await page.locator(".theme-picker summary").click();
  await page
    .getByRole("button", { name: "Preview Amber Terminal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Unlock Amber Terminal" }),
  ).toBeVisible();
  const back = page.getByRole("button", { name: "Back", exact: true });
  const bounds = await back.boundingBox();
  expect(
    bounds && bounds.y >= 0 && bounds.y + bounds.height <= 600,
  ).toBeTruthy();
  await page.screenshot({ path: info.outputPath("locked-preview.png") });
  await back.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await expect(page.getByRole("radio")).toHaveCount(4);
});

test("new themes keep the same mobile play geometry and render their full palettes", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone");
  const run = createInitialState("marathon", 42);
  for (let i = 0; i < 12; i++) {
    for (let x = 0; x < i % 4; x++)
      applyCommand(run, { type: i % 2 ? "MOVE_LEFT" : "MOVE_RIGHT" });
    if (i % 3 === 0) applyCommand(run, { type: "ROTATE_CW" });
    applyCommand(run, { type: "HARD_DROP" });
  }
  run.status = "paused";
  let geometry: { x: number; y: number; width: number; height: number } | null =
    null;
  for (const id of ["amber", "glacier", "clay", "blueprint"] as const) {
    await page.addInitScript(
      ({ id, run, ids }) => {
        localStorage.setItem(
          "tetromino_v2_settings",
          JSON.stringify({ theme: id }),
        );
        localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
        localStorage.setItem(
          "afterblock_theme_access_v1",
          JSON.stringify({
            version: 1,
            profileId: "gallery-test-profile",
            unlocked: ids,
          }),
        );
      },
      { id, run, ids: THEME_IDS },
    );
    await page.goto("/");
    await page.locator("#resume-card").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", id);
    const board = await page.locator(".board-wrap").boundingBox();
    expect(board).not.toBeNull();
    if (geometry) expect(board).toEqual(geometry);
    else geometry = board;
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`${id}.png`) });
  }
});
