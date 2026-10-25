import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_SETTINGS } from "../../src/platform/storage";
import { createInitialState } from "../../src/engine/engine";

async function turkish(page: Page) {
  await page.addInitScript(
    (settings) =>
      localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings)),
    { ...DEFAULT_SETTINGS, language: "tr" },
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
}

test("language quick swap is immediate, persistent and preserves a paused run", async ({
  page,
}) => {
  const run = createInitialState("marathon", 533);
  run.status = "paused";
  run.score = 1234;
  await page.addInitScript(
    ({ run, settings }) => {
      localStorage.setItem("tetromino_v2_run", JSON.stringify(run));
      if (!localStorage.getItem("tetromino_v2_settings"))
        localStorage.setItem("tetromino_v2_settings", JSON.stringify(settings));
    },
    { run, settings: { ...DEFAULT_SETTINGS, theme: "lcd", controlScale: 1.4 } },
  );
  await page.goto("/");
  const saved = await page.evaluate(() =>
    localStorage.getItem("tetromino_v2_run"),
  );
  await page.locator('#home [data-action="settings"]').click();
  await page.locator(".theme-picker summary").click();
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.locator('[name="language"]').selectOption("tr");
  await expect(page.locator("#dialog h2")).toHaveText("Ayarlar");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.locator(".theme-picker")).toHaveAttribute("open", "");
  await expect(page.locator('[name="language"]')).toHaveValue("tr");
  await expect(page.locator('#home [data-mode="marathon"] strong')).toHaveText(
    "Maraton",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("tetromino_v2_run")),
  ).toBe(saved);
  const settings = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("tetromino_v2_settings")!),
  );
  expect(settings.language).toBe("tr");
  expect(settings.theme).toBe("lcd");
  expect(settings.controlScale).toBe(1.4);
  expect(navigations).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("turkish-settings.png"),
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await page.locator('#home [data-action="settings"]').click();
  await page.locator('[name="language"]').selectOption("en");
  await expect(page.locator("#dialog h2")).toHaveText("Settings");
  await expect(page.locator('#home [data-mode="marathon"] strong')).toHaveText(
    "Marathon",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("Turkish covers Story, theme choices, control editor, records and help", async ({
  page,
}) => {
  await turkish(page);
  await page.locator('[data-action="story-levels"]').click();
  await expect(page.locator("#dialog")).toContainText("İlk Adımlar");
  await expect(page.locator("#dialog")).not.toContainText("Clear 12 lines");
  await expect(page.locator(".story-phases")).toContainText("Hız 1");
  await page.locator('[data-action="close"]').first().click();
  await page.locator('#home [data-action="settings"]').click();
  await page.locator(".theme-picker summary").click();
  await expect(page.locator(".theme-picker")).not.toContainText("Watch 1 ad");
  await page.locator('[data-action="edit-controls"]').click();
  const editor = page.locator(".control-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Kontroller");
  await expect(editor).toContainText("Boyut");
  await expect(editor).not.toContainText("Drag to move");
  const hint = await editor.locator("[data-editor-feedback]").boundingBox();
  const orientation = await editor
    .locator("[data-editor-orientation]")
    .boundingBox();
  expect(hint!.x + hint!.width + 4).toBeLessThanOrEqual(orientation!.x);
  await page.screenshot({
    path: test.info().outputPath("turkish-controls.png"),
  });
  await editor.locator('[data-editor-action="cancel"]').click();
  await page.locator('[data-action="close"]').first().click();
  await page.locator('#home [data-action="records"]').click();
  await expect(page.locator("#dialog")).toContainText("Rekorlar");
  await expect(page.locator("#dialog")).not.toContainText("fastest");
  await page.locator('[data-action="close"]').first().click();
  await page.locator('#home [data-action="help"]').click();
  await expect(page.locator("#dialog")).toContainText("Yardım");
  await expect(page.locator("#dialog")).not.toContainText(
    "Fill a horizontal row",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("both playable tutorials including T-spin use Turkish instructions and actions", async ({
  page,
}) => {
  await turkish(page);
  async function choose(action: string) {
    await page.locator('#home [data-action="tutorial"]').click();
    await page.locator(`[data-action="${action}"]`).click();
  }
  async function command(action: string) {
    await page.locator(`.tutorial [data-command="${action}"]`).click();
  }
  async function next() {
    await page.locator(".tutorial [data-continue]").click();
  }
  await choose("tutorial-basics");
  await expect(page.locator(".tutorial h1")).toHaveText("Temel eğitim");
  await expect(page.locator(".tutorial h2")).toHaveText(
    "Parçanı hareket ettir",
  );
  await command("MOVE_LEFT");
  await command("MOVE_RIGHT");
  await next();
  await command("ROTATE_CW");
  await next();
  await command("SOFT_DROP");
  await command("HARD_DROP");
  await next();
  await command("HARD_DROP");
  await next();
  await command("HOLD");
  await next();
  await expect(page.locator(".tutorial h2")).toHaveText("Alıştırma tamamlandı");
  await page.locator(".tutorial [data-tutorial-exit]").click();
  await choose("tutorial-advanced");
  await command("MOVE_RIGHT");
  await command("MOVE_RIGHT");
  await command("HARD_DROP");
  await next();
  await command("HOLD");
  await command("HOLD");
  await command("HARD_DROP");
  await next();
  await command("ROTATE_CW");
  await command("HARD_DROP");
  await next();
  for (let i = 0; i < 2; i++) {
    await command("ROTATE_CW");
    await command("HARD_DROP");
  }
  await next();
  await expect(page.locator(".tutorial h2")).toHaveText(
    "Döndürerek boşluğa gir",
  );
  await expect(page.locator(".tutorial .tutorial-prompt")).not.toContainText(
    "Soft drop",
  );
  expect(
    await page
      .locator(".tutorial")
      .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("turkish-t-spin.png") });
  await command("SOFT_DROP");
  await command("ROTATE_CW");
  await command("HARD_DROP");
  await expect(page.locator(".tutorial")).toHaveAttribute(
    "data-t-spin",
    "full",
  );
  await next();
  await expect(page.locator(".tutorial h2")).toHaveText("Alıştırma tamamlandı");
});

test("Turkish Online setup and unsafe-address errors are localized", async ({
  page,
}) => {
  await turkish(page);
  await page.locator('#home [data-action="online"]').click();
  await expect(page.locator(".online-screen h2")).toHaveText(
    "Çevrimiçi Mücadele",
  );
  await expect(page.locator(".online-screen")).toContainText("Sunucu adresi");
  await page.locator('[name="onlineEndpoint"]').fill("ws://public.example/ws");
  await page.locator('[data-online="connect"]').click();
  await expect(page.locator(".online-error")).toContainText("wss://");
  await expect(page.locator(".online-error")).not.toContainText("Use wss://");
  await page.screenshot({ path: test.info().outputPath("turkish-online.png") });
  await page.locator('[data-online="exit"]').click();
  await expect(page.locator("#home")).toBeVisible();
});
