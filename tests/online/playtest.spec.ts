import { expect, test } from "@playwright/test";

test("phone and PC create, join, play and leave a Survival room", async ({
  browser,
}) => {
  const phone = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });
  const desktop = await browser.newContext({
    viewport: { width: 1200, height: 900 },
  });
  const a = await phone.newPage();
  const b = await desktop.newPage();
  const errors: string[] = [];
  for (const page of [a, b])
    page.on("pageerror", (error) => errors.push(error.message));
  await Promise.all([
    a.goto("http://127.0.0.1:8172/play"),
    b.goto("http://127.0.0.1:8172/play"),
  ]);
  await expect(a.locator("#connection")).toHaveText("Connected");
  await expect(b.locator("#connection")).toHaveText("Connected");
  await a.locator("#name").fill("Phone");
  await a.locator("#create").tap();
  await expect(a.locator("#room-code")).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  const code = await a.locator("#room-code").innerText();
  await b.locator("#name").fill("PC");
  await b.locator("#code").fill(code);
  await b.locator("#join").click();
  await expect(a.locator("#players")).toContainText("PC");
  await a.locator("#match-options summary").tap();
  await b.locator("#match-options summary").click();
  await expect(b.locator("#balance-players select").first()).toBeDisabled();
  await a.locator("#ready").tap();
  await expect(a.locator("#ready")).toHaveText("Not ready");
  const self = a
    .locator("#balance-players fieldset")
    .filter({ has: a.locator("legend", { hasText: "Phone" }) });
  const other = a
    .locator("#balance-players fieldset")
    .filter({ has: a.locator("legend", { hasText: "PC" }) });
  await self.locator('[name="gravityPercent"]').selectOption("50");
  await expect(a.locator("#ready")).toHaveText("Ready");
  await expect(b.locator("#balance-summary")).toContainText("Phone: 50%");
  await other.locator('[name="startingLevel"]').selectOption("5");
  await expect(b.locator("#balance-summary")).toContainText("Lv 5");
  await a.screenshot({ path: "test-results/online-balance-phone.png" });
  await a.setViewportSize({ width: 360, height: 600 });
  expect(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await a.screenshot({ path: "test-results/online-balance-small-phone.png" });
  await a.locator("#reset-balance").tap();
  await expect(b.locator("#balance-summary")).not.toContainText("50%");
  await expect(b.locator("#balance-summary")).not.toContainText("Lv 5");
  await self.locator('[name="gravityPercent"]').selectOption("50");
  await expect(b.locator("#balance-summary")).toContainText("Phone: 50%");
  await a.setViewportSize({ width: 393, height: 851 });
  await a.locator("#ready").tap();
  await b.locator("#ready").click();
  await expect(a.locator("#phase")).toHaveText("Playing", { timeout: 6_000 });
  await expect(a.locator("#match-options")).toBeHidden();
  // Elapsed-time-only snapshots must not repaint a stationary own board. The
  // assisted player takes two seconds per gravity cell at this starting level.
  await a.evaluate(() => {
    const ctx = document
      .querySelector<HTMLCanvasElement>("#board")!
      .getContext("2d")!;
    const original = ctx.fillRect.bind(ctx);
    (window as unknown as { paints: number }).paints = 0;
    ctx.fillRect = (...args) => {
      (window as unknown as { paints: number }).paints++;
      original(...args);
    };
  });
  await a.waitForTimeout(150);
  expect(
    await a.evaluate(() => (window as unknown as { paints: number }).paints),
  ).toBe(0);
  await a.getByRole("button", { name: "Move left", exact: true }).tap();
  await a.getByRole("button", { name: "Drop", exact: true }).tap();
  await expect
    .poll(async () => Number(await a.locator("#score").innerText()))
    .toBeGreaterThan(0);
  await expect(a.locator("#opponent-name")).toHaveText("PC");
  const board = await a.locator("#board").boundingBox();
  const controls = await a.locator(".controls").boundingBox();
  expect(
    board && controls && board.y + board.height <= controls.y,
  ).toBeTruthy();
  expect(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await a.screenshot({ path: "test-results/online-phone.png" });
  await b.screenshot({ path: "test-results/online-pc.png" });
  await a.setViewportSize({ width: 360, height: 600 });
  expect(
    await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await a.screenshot({ path: "test-results/online-small-phone.png" });
  await b.locator("#leave").click();
  await expect(a.locator("#phase")).toContainText("You win");
  expect(errors).toEqual([]);
  await phone.close();
  await desktop.close();
});
