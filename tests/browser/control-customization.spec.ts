import { test, expect } from "@playwright/test";
test("profiles preserve independent hidden and overlapping buttons with one Next and board sizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 384, height: 853 });
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('[name="controlSpread"]')).toHaveCount(0);
  await expect(page.locator('[name="controlHeight"]')).toHaveCount(0);
  await page.locator('[name="boardScale"]').fill("0.7");
  await page.locator('[data-action="edit-controls"]').click();
  await expect(page.locator("[data-editor-control]")).toHaveCount(7);
  await page.locator('[name="editorControlSize"]').fill("1.2");
  await expect(page.locator('[name="editorControlSize"]')).toHaveValue("1.2");
  const left = await page.locator('[data-editor-control="left"]').boundingBox(),
    hold = await page.locator('[data-editor-control="hold"]').boundingBox();
  await page.mouse.move(left!.x + left!.width / 2, left!.y + left!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hold!.x + hold!.width / 2, hold!.y + hold!.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.locator('[name="editorSelection"]').selectOption("down");
  await page.locator('[name="editorControlEnabled"]').uncheck();
  await page.locator('[data-editor-action="done"]').click();
  await page.locator('[name="gamepadPreset"]').selectOption("compact");
  await expect(page.locator('[name="boardScale"]')).toHaveValue("1");
  await page.locator('[data-action="edit-controls"]').click();
  await page.locator('[name="editorSelection"]').selectOption("down");
  await expect(page.locator('[name="editorControlEnabled"]')).toBeChecked();
  await page.locator('[data-editor-action="cancel"]').click();
  await page.locator('[name="gamepadPreset"]').selectOption("balanced");
  await expect(page.locator('[name="boardScale"]')).toHaveValue("0.7");
  await page.locator('[data-action="edit-controls"]').click();
  await page.locator('[name="editorSelection"]').selectOption("left");
  await expect(page.locator('[name="editorControlSize"]')).toHaveValue("1.2");
  await page.locator('[name="editorSelection"]').selectOption("down");
  await expect(page.locator('[name="editorControlEnabled"]')).not.toBeChecked();
  await page.locator('[name="editorControlEnabled"]').check();
  await page.locator('[name="editorControlEnabled"]').uncheck();
  await page.locator('[data-editor-action="done"]').click();
  await page.locator('#dialog [data-action="close"]').last().click();
  await page.locator('[data-mode="marathon"]').click();
  await page.locator('[data-action="start-marathon"]').click();
  await expect(page.locator(".next-strip canvas")).toHaveCount(1);
  await expect(
    page.locator('[data-movement-pad] [data-command="SOFT_DROP"]'),
  ).toBeHidden();
  const a = (await page
      .locator('.control-deck [data-command="MOVE_LEFT"]')
      .boundingBox())!,
    b = (await page
      .locator('.control-deck>[data-command="HOLD"]')
      .boundingBox())!;
  expect(a.x).toBeLessThan(b.x + b.width);
  expect(a.x + a.width).toBeGreaterThan(b.x);
  expect(a.y).toBeLessThan(b.y + b.height);
  await page.screenshot({
    path: "C:/Tools/tetromino-remake-artifacts/custom-2.9-overlap.png",
  });
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('[name="boardScale"]')).toHaveValue("0.7");
  await page.setViewportSize({ width: 360, height: 600 });
  await page.locator('[name="boardScale"]').fill("0.5");
  await page.locator('#dialog [data-action="close"]').last().click();
  await page.locator("#resume-card").click();
  for (const selector of [".pause-button", ".hold-panel", "#time", "#next-0"]) {
    const child = (await page.locator(selector).boundingBox())!;
    const rail = await page.locator(selector).evaluate((n) => {
      const r = n.closest("aside")!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    expect(child.y).toBeGreaterThanOrEqual(rail.top);
    expect(child.y + child.height).toBeLessThanOrEqual(rail.bottom + 1);
  }
});
