import { expect, test } from "@playwright/test";
import { createInitialState } from "../../src/engine/engine";

const online = (page: import("@playwright/test").Page) =>
  page.locator(".online-screen");

test("Online entry requires an explicit connection and preserves the offline run", async ({
  page,
}) => {
  const saved = createInitialState("marathon", 525);
  saved.status = "paused";
  saved.score = 1234;
  await page.addInitScript(
    (value) => localStorage.setItem("tetromino_v2_run", JSON.stringify(value)),
    saved,
  );
  const sockets: string[] = [];
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).searchParams.has("token"))
      sockets.push(socket.url());
  });
  await page.goto("/");
  const before = await page.evaluate(() =>
    localStorage.getItem("tetromino_v2_run"),
  );
  await page.locator('#home [data-action="online"]').click();
  await expect(online(page)).toBeVisible();
  await expect(
    online(page).getByRole("heading", { name: "Online Battle" }),
  ).toBeVisible();
  await expect(
    online(page).getByRole("button", { name: "Connect", exact: true }),
  ).toBeEnabled();
  await expect(
    online(page).getByRole("button", { name: "Create room", exact: true }),
  ).toBeDisabled();
  await expect(
    online(page).getByRole("button", { name: "Join", exact: true }),
  ).toBeDisabled();
  await online(page).locator('[name="onlineName"]').fill("PXZ C");
  await page.keyboard.press("p");
  await expect(online(page)).toBeVisible();
  await page.waitForTimeout(150);
  expect(sockets).toEqual([]);
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toEqual(before);
  await online(page).getByRole("button", { name: "Exit", exact: true }).click();
  await expect(online(page)).toHaveCount(0);
  await expect(page.locator("#home")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toEqual(before);
  await expect(page.locator("#resume-card")).toBeVisible();
});

test("Unsafe public ws address is rejected without opening a socket or persisting it", async ({
  page,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).searchParams.has("token"))
      sockets.push(socket.url());
  });
  await page.goto("/");
  await page.locator('#home [data-action="online"]').click();
  await online(page)
    .locator('[name="onlineEndpoint"]')
    .fill("ws://public.example/ws");
  await online(page)
    .getByRole("button", { name: "Connect", exact: true })
    .click();
  await expect(online(page).getByRole("alert")).toContainText("wss://");
  expect(sockets).toEqual([]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("afterblock_online_endpoint_v1"),
    ),
  ).toBeNull();
  await expect(online(page).locator('[name="onlineEndpoint"]')).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(online(page)).toHaveCount(0);
});
