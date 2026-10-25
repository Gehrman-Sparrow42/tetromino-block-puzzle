import { expect, test } from "@playwright/test";
import { createInitialState } from "../../src/engine/engine";
import { DEFAULT_SETTINGS } from "../../src/platform/storage";
import type { ServerMessage } from "../../src/online/protocol";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

test("merged phone and PC app plays Battle and returns to the preserved offline run", async ({
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
  const a = await phone.newPage(),
    b = await desktop.newPage();
  const packets: ServerMessage[] = [];
  a.on("websocket", (socket) =>
    socket.on("framereceived", (frame) => {
      try {
        packets.push(JSON.parse(String(frame.payload)));
      } catch {
        /* Ignore unrelated frames. */
      }
    }),
  );
  const run = createInitialState("marathon", 525);
  run.status = "paused";
  run.score = 1234;
  await a.addInitScript(
    ({ run, settings }) => {
      localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
      localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings));
    },
    { run, settings: { ...DEFAULT_SETTINGS, theme: "lcd" } },
  );
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  try {
    await Promise.all([a.goto("/"), b.goto("/play")]);
    const saved = await a.evaluate(() =>
      localStorage.getItem("tetromino_v2_run"),
    );
    for (const [p, name] of [
      [a, "Phone"],
      [b, "PC"],
    ] as const) {
      await p.locator('#home [data-action="online"]').click();
      await p.locator('.online-screen [name="onlineName"]').fill(name);
      await p.locator('[data-online="connect"]').click();
      await expect(p.locator('[data-online="create"]')).toBeEnabled();
    }
    await expect(a.locator(".online-screen")).toHaveAttribute(
      "data-theme",
      "lcd",
    );
    await a.locator('[data-online="create"]').click();
    await expect(a.locator(".online-code")).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
    const code = await a.locator(".online-code").innerText();
    await b.locator('[name="onlineCode"]').fill(code);
    await b.locator('[data-online="join"]').click();
    await expect(a.locator(".online-players")).toContainText("PC");
    await a.locator(".online-balance summary").click();
    await expect(b.locator("select[data-player]").first()).toBeDisabled();
    const selects = a.locator("select[data-player]");
    await expect(selects).toHaveCount(2);
    await expect(selects.first().locator("option")).toHaveCount(7);
    await a.locator('[data-online="ready"]').click();
    await selects.first().selectOption("-2");
    await expect(a.locator('[data-online="ready"]')).toHaveText("Ready");
    await expect(b.locator(".online-balance-summary")).toContainText("Nerf 2");
    await selects.nth(1).selectOption("3");
    await expect(b.locator(".online-balance-summary")).toContainText("Buff 3");
    await a.locator('[data-online="reset-balance"]').click();
    await expect(b.locator(".online-balance-summary")).not.toContainText(
      "Buff 3",
    );
    await expect(b.locator(".online-balance-summary")).not.toContainText(
      "Nerf 2",
    );
    await selects.first().selectOption("-2");
    await expect(b.locator(".online-balance-summary")).toContainText("Nerf 2");
    await a.screenshot({ path: "test-results/merged-online-lobby.png" });
    await a.locator('[data-online="ready"]').click();
    await b.locator('[data-online="ready"]').click();
    await expect(a.locator(".online-match-status")).toContainText(
      "Live round",
      {
        timeout: 6000,
      },
    );
    await expect(a.locator("select[data-player]").first()).toBeDisabled();
    await a.evaluate(() => {
      const ctx = document
        .querySelector<HTMLCanvasElement>(".online-screen #board")!
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
    await a.locator('.online-screen [data-command="HARD_DROP"]').tap();
    const welcome = packets.find((m) => m.type === "welcome");
    if (welcome?.type !== "welcome") throw Error("Missing welcome");
    await expect
      .poll(() =>
        packets.some(
          (m) =>
            m.type === "snapshot" &&
            m.boards[welcome.playerId]?.piecesPlaced === 1,
        ),
      )
      .toBe(true);
    await expect(a.locator(".online-lines")).toHaveText("0");
    await a.screenshot({ path: "test-results/merged-online-game-phone.png" });
    for (const size of [
      { width: 360, height: 600 },
      { width: 853, height: 393 },
    ]) {
      await a.setViewportSize(size);
      await a.waitForTimeout(100);
      expect(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const board = await a.locator(".online-board").boundingBox();
      expect(board!.width).toBeGreaterThan(70);
      expect(board!.height).toBeGreaterThan(140);
      await a.screenshot({
        path: `test-results/merged-online-${size.width}.png`,
      });
    }
    await a.setViewportSize({ width: 393, height: 851 });
    await a.locator('[data-online="exit"]').click();
    await expect(a.locator(".online-confirm")).toBeVisible();
    await a.locator('[data-online="cancel-exit"]').click();
    await expect(a.locator(".online-confirm")).toBeHidden();
    await a.locator('[data-online="exit"]').click();
    await a.locator('[data-online="forfeit"]').click();
    await expect(a.locator(".online-screen")).toHaveCount(0);
    await expect(b.locator(".online-match-status")).toContainText("You won");
    expect(
      await a.evaluate(() => localStorage.getItem("tetromino_v2_run")),
    ).toEqual(saved);
    await a.locator("#resume-card").click();
    await expect(a.locator("#game")).toBeVisible();
    await expect(a.locator("#score")).toHaveText("1,234");
    expect(errors).toEqual([]);
  } finally {
    await phone.close();
    await desktop.close();
  }
});

test("standalone HTML can retry a failed connection and use the same server", async ({
  page,
}) => {
  await page.goto(pathToFileURL(resolve("dist/index.html")).href);
  await page.locator('#home [data-action="online"]').click();
  const endpoint = page.locator('[name="onlineEndpoint"]');
  await endpoint.fill("ws://127.0.0.1:9/ws");
  await page.locator('[data-online="connect"]').click();
  await expect(page.locator('[data-online="connect"]')).toHaveText("Retry");
  await expect(endpoint).toBeEnabled();
  await endpoint.fill("ws://127.0.0.1:8172/ws");
  await page.locator('[data-online="connect"]').click();
  await expect(page.locator('[data-online="create"]')).toBeEnabled();
  await page.locator('[data-online="create"]').click();
  await expect(page.locator(".online-code")).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
  await page.locator('[data-online="exit"]').click();
  await expect(page.locator("#home")).toBeVisible();
  await page.locator('[data-mode="marathon"]').click();
  await page.locator('[data-action="start-marathon"]').click();
  await expect(page.locator("#game")).toBeVisible();
});

test("Turkish and English clients share a room without translating names or protocol values", async ({
  browser,
}) => {
  const tr = await browser.newContext({
      viewport: { width: 360, height: 600 },
    }),
    en = await browser.newContext();
  const a = await tr.newPage(),
    b = await en.newPage();
  await a.addInitScript(
    (settings) =>
      localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings)),
    { ...DEFAULT_SETTINGS, language: "tr" },
  );
  try {
    for (const p of [a, b]) {
      await p.goto("/");
      await p.locator('#home [data-action="online"]').click();
      await p.locator('[data-online="connect"]').click();
      await expect(p.locator('[data-online="create"]')).toBeEnabled();
    }
    await a.locator('[name="onlineName"]').fill("Settings");
    await a.locator('[name="onlineCode"]').fill("AAAAAA");
    await a.locator('[data-online="join"]').click();
    await expect(a.locator(".online-error")).toHaveText(
      "Bu oda kullanılamıyor.",
    );
    await a.locator('[data-online="create"]').click();
    await expect(a.locator(".online-code")).toHaveText(/^[A-HJ-NP-Z2-9]{6}$/);
    const code = await a.locator(".online-code").innerText();
    await b.locator('[name="onlineName"]').fill("Records");
    await b.locator('[name="onlineCode"]').fill(code);
    await b.locator('[data-online="join"]').click();
    await expect(a.locator(".online-players")).toContainText("Records");
    await expect(a.locator(".online-players")).not.toContainText("Rekorlar");
    await a.locator(".online-balance summary").click();
    await a.locator("select[data-player]").nth(1).selectOption("2");
    await expect(a.locator(".online-balance-summary")).toContainText(
      "Güçlendirme 2",
    );
    await expect(b.locator(".online-balance-summary")).toContainText("Buff 2");
    await a.locator('[data-online="ready"]').click();
    await b.locator('[data-online="ready"]').click();
    await expect(a.locator(".online-match-status")).toContainText("Canlı tur", {
      timeout: 6000,
    });
    await expect(b.locator(".online-opponent-name")).toHaveText("Settings");
    await a.screenshot({ path: "test-results/turkish-online-match.png" });
    await a.locator('[data-online="exit"]').click();
    await expect(a.locator(".online-confirm")).not.toContainText(
      "Forfeit this round?",
    );
    await a.locator('[data-online="forfeit"]').click();
    await expect(a.locator('#home [data-action="settings"]')).toHaveText(
      "Ayarlar",
    );
    await expect(b.locator(".online-match-status")).toContainText("You won");
  } finally {
    await tr.close();
    await en.close();
  }
});
