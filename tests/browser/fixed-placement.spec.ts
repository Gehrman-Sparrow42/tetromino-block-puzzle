import { test, expect } from "@playwright/test";
test("fixed saved controls and draggable board move independently and allow overlap", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 384, height: 853 });
  await page.goto("/");
  await page.locator('#home [data-action="settings"]').click();
  await expect(page.locator('[name="padMode"]')).toHaveCount(0);
  await page.locator('[data-action="edit-controls"]').click();
  const frame = (await page.locator(".control-editor-frame").boundingBox())!;
  const scale = frame.width / 384;
  await page.locator('[name="editorSelection"]').selectOption("board");
  const board = page.locator(".control-editor-board"),
    b = (await board.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    b.x + b.width / 2 + 20 * scale,
    b.y + b.height / 2 + 80 * scale,
    { steps: 5 },
  );
  await page.mouse.up();
  const position = await board.evaluate((n) => ({
    x: n.style.left,
    y: n.style.top,
    width: n.style.width,
    height: n.style.height,
  }));
  expect(parseFloat(position.y)).toBeCloseTo(80, 0);
  await page.locator('[name="editorSelection"]').selectOption("left");
  const left = page.locator('[data-editor-control="left"]'),
    l = (await left.boundingBox())!,
    placed = (await board.boundingBox())!;
  await page.mouse.move(l.x + l.width / 2, l.y + l.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    placed.x + placed.width / 2,
    placed.y + placed.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  expect(
    await board.evaluate((n) => ({
      x: n.style.left,
      y: n.style.top,
      width: n.style.width,
      height: n.style.height,
    })),
  ).toEqual(position);
  const leftPosition = await left.evaluate((n) => ({
    x: n.style.left,
    y: n.style.top,
  }));
  await page.locator('[data-editor-action="done"]').click();
  await page.locator('#dialog [data-action="close"]').last().click();
  await page.locator('[data-mode="marathon"]').click();
  await page.locator('[data-action="start-marathon"]').click();
  const gameLeft = page.locator('.control-deck [data-command="MOVE_LEFT"]');
  expect(
    await gameLeft.evaluate((n) => ({ x: n.style.left, y: n.style.top })),
  ).toEqual(leftPosition);
  expect(
    await page.locator(".board-wrap").evaluate((n) => ({
      x: n.style.left,
      y: n.style.top,
      width: n.style.width,
      height: n.style.height,
    })),
  ).toEqual(position);
  await gameLeft.click();
  await page.mouse.click(380, 620);
  expect(
    await gameLeft.evaluate((n) => ({ x: n.style.left, y: n.style.top })),
  ).toEqual(leftPosition);
  await page.screenshot({
    path: info.outputPath("fixed-board-2.10.png"),
  });
  await page.reload();
  await page.locator('#home [data-action="settings"]').click();
  await page.locator('[data-action="edit-controls"]').click();
  expect(
    await page.locator(".control-editor-board").evaluate((n) => ({
      x: n.style.left,
      y: n.style.top,
      width: n.style.width,
      height: n.style.height,
    })),
  ).toEqual(position);
  expect(
    await page
      .locator('[data-editor-control="left"]')
      .evaluate((n) => ({ x: n.style.left, y: n.style.top })),
  ).toEqual(leftPosition);
});
