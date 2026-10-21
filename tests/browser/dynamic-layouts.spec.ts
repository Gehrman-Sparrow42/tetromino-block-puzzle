import { test, expect } from "@playwright/test";

for (const layout of ["gamepad", "thumbs", "mirror", "floating"]) {
  test(`dynamic relocation and direct actions: ${layout}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "phone");
    await page.setViewportSize({ width: 384, height: 853 });
    await page.goto("/");
    await page.locator('#home [data-action="settings"]').click();
    await page.locator('[name="controlLayout"]').selectOption(layout);
    await expect(page.locator('[data-action="edit-controls"]')).toBeVisible();
    await page.locator('[data-action="edit-controls"]').click();
    await expect(page.locator(".control-editor")).toHaveAttribute(
      "data-layout",
      layout,
    );
    const box = (await page
      .locator('[data-editor-control="hardDrop"]')
      .boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 24, {
      steps: 4,
    });
    await page.mouse.up();
    await page.locator('[data-editor-action="done"]').click();
    await expect(page.locator('[name="controlLayout"]')).toHaveValue(layout);
    await expect(page.locator('[name="padMode"]')).toBeVisible();
    await page.locator('[name="padMode"]').selectOption("dynamic");
    await page.locator('#dialog [data-action="close"]').last().click();
    await page.locator('[data-mode="marathon"]').click();
    await page.locator('[data-action="start-marathon"]').click();
    const positions = () =>
      page.locator(".control-deck [data-command]").evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return [r.x, r.y];
        }),
      );
    const home = await positions();
    const candidates = await page.locator(".play-area").evaluate((area) => {
      const r = area.getBoundingClientRect(),
        points = [];
      for (let y = r.bottom - 20; y > r.top; y -= 24)
        for (let x = r.left + 20; x < r.right; x += 24) {
          const hit = document.elementFromPoint(x, y);
          if (hit && area.contains(hit) && !hit.closest("button,#board,aside"))
            points.push({ x, y });
        }
      return points;
    });
    let moved = false;
    for (const point of candidates) {
      await page.touchscreen.tap(point.x, point.y);
      if (JSON.stringify(await positions()) !== JSON.stringify(home)) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
    await page.locator('.control-deck [data-command="ROTATE_CW"]').tap();
    await page.locator('.control-deck [data-command="HARD_DROP"]').tap();
    await page.locator(".pause-button").tap();
    const run = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tetromino_v2_run")!),
    );
    expect(run.piecesPlaced).toBe(1);
    expect(await positions()).toEqual(home);
  });
}
