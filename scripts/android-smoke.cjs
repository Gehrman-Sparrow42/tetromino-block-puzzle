// This driver selects an emulator only, never a connected physical phone.
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { chromium, expect } = require("@playwright/test");
const adb = process.env.ADB || "adb";
const packageName = "com.berkay.afterblock";
const port = Number(process.env.AFTERBLOCK_CDP_PORT || 9227);
const output = process.env.AFTERBLOCK_SMOKE_OUTPUT || "android-smoke";
const command = (...args) =>
  execFileSync(adb, ["-e", ...args], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();
let browser;
const errors = [];
async function attach() {
  const pid = command("shell", "pidof", packageName);
  if (!/^\d+$/.test(pid))
    throw new Error("Expected one running Afterblock process.");
  command(
    "forward",
    `tcp:${port}`,
    `localabstract:webview_devtools_remote_${pid}`,
  );
  // WebView does not implement browser-context/download management.
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
    noDefaults: true,
  });
  const page = browser
    .contexts()[0]
    .pages()
    .find((page) => page.url().startsWith("https://localhost"));
  if (!page) throw new Error("The installed offline game page did not load.");
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  return page;
}
(async () => {
  mkdirSync(output, { recursive: true });
  try {
    let page = await attach();
    if (await page.locator("#game").isVisible()) {
      if (!(await page.getByRole("dialog").isVisible()))
        await page.locator(".pause-button").click();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
    }
    await expect(page.locator("#home")).toBeVisible();
    await expect(page.locator('[data-mode="marathon"]')).toContainText(
      "Marathon",
    );
    await page.screenshot({ path: `${output}/home.png` });
    await page.locator('[data-mode="marathon"]').click();
    if (await page.locator("#dialog").isVisible())
      await page.locator('[data-action="confirm-new"]').click();
    await page.getByRole("button", { name: "Hard drop", exact: true }).click();
    await expect(page.locator("#score")).not.toHaveText("0");
    await page.screenshot({ path: `${output}/game.png` });
    command("shell", "input", "keyevent", "4");
    await expect(page.getByRole("dialog")).toContainText("Paused");
    const run = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tetromino_v2_run")),
    );
    if (run.piecesPlaced !== 1 || run.status !== "paused")
      throw new Error("Hardware Back did not save the run.");
    await page.getByRole("dialog").locator('[data-action="resume"]').click();
    command("shell", "input", "keyevent", "3");
    command("wait-for-device");
    command("shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`);
    await expect(page.getByRole("dialog")).toContainText("Paused");
    // Restart the real native process; a WebView page.reload is not an Android lifecycle restart.
    await browser.close();
    browser = null;
    command("shell", "am", "force-stop", packageName);
    command("shell", "am", "start", "-W", "-n", `${packageName}/.MainActivity`);
    page = await attach();
    await page.locator("#resume-card").click();
    await expect(page.locator("#game")).toBeVisible();
    await page.locator(".pause-button").click();
    const restored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tetromino_v2_run")),
    );
    if (restored.piecesPlaced !== 1)
      throw new Error("Native restart lost the saved run.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    for (const theme of ["ink", "lcd", "neon", "paper"]) {
      await page.locator('select[name="theme"]').selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    }
    await page.locator('select[name="controlLayout"]').selectOption("floating");
    await page.locator('input[name="controlScale"]').press("End");
    await page.locator('input[name="controlOpacity"]').press("Home");
    await page.screenshot({ path: `${output}/settings.png` });
    await page.locator('#dialog [data-action="close"]').last().click();
    await page.getByRole("dialog").locator('[data-action="resume"]').click();
    const buttons = await page
      .locator(".control-deck .control")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    for (const b of buttons)
      if (b.w < 48 || b.h < 48) throw new Error("Native control below 48px.");
    await page.screenshot({ path: `${output}/floating-paper.png` });
    await page.locator(".pause-button").click();
    await page.screenshot({ path: `${output}/paused.png` });
    if (errors.length) throw new Error(`WebView errors: ${errors.join("; ")}`);
    writeFileSync(
      `${output}/result.json`,
      JSON.stringify(
        {
          passed: true,
          package: packageName,
          page: page.url(),
          checks: [
            "offline home",
            "new game",
            "hard drop",
            "hardware Back pause",
            "rapid background pause",
            "native process restart resume",
            "all four themes",
            "floating controls and size/opacity settings",
          ],
          browser: await browser.version(),
          errors,
        },
        null,
        2,
      ),
    );
    console.log("Android WebView smoke checks passed.");
  } finally {
    if (browser) await browser.close();
    try {
      command("forward", "--remove", `tcp:${port}`);
    } catch {
      /* Do not mask a test failure if transport disconnected. */
    }
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
