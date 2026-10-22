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
  await a.locator("#ready").tap();
  await b.locator("#ready").click();
  await expect(a.locator("#phase")).toHaveText("Playing", { timeout: 6_000 });
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
