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
    await page.locator('[data-action="start-marathon"]').click();
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
    for (const theme of [
      "ink",
      "lcd",
      "neon",
      "paper",
      "basalt",
      "workshop",
      "sleeve",
      "score",
      "folio",
      "gate",
      "annual",
      "data",
      "classic",
    ]) {
      await page.locator('select[name="theme"]').selectOption(theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    }
    await page.locator('select[name="theme"]').selectOption("basalt");
    await page.locator('select[name="controlLayout"]').selectOption("gamepad");
    await page.locator('[data-action="edit-controls"]').click();
    await expect(page.locator(".control-editor")).toBeVisible();
    const touch = await page.context().newCDPSession(page);
    const touchDrag = async (locator, dx, dy) => {
      const r = await locator.boundingBox();
      const x = r.x + r.width / 2,
        y = r.y + r.height / 2;
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }],
      });
      for (let step = 1; step <= 6; step++)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            { x: x + (dx * step) / 6, y: y + (dy * step) / 6, id: 1 },
          ],
        });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await touchDrag(page.locator('[data-editor-control="pad"]'), 0, -45);
    await page.locator('[data-editor-control="hold"]').click();
    await page.locator('[name="editorControlOpacity"]').press("End");
    await page.screenshot({ path: `${output}/editor-portrait.png` });
    await page.locator('[data-editor-action="done"]').click();
    const portrait = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tetromino_v2_settings")).gamepadLayouts
          .portrait,
    );
    if (!portrait.pad || portrait.hold?.opacity !== 0.6)
      throw new Error("Native editor did not save touch drag/opacity.");
    await page.locator('[data-action="edit-controls"]').click();
    command("shell", "input", "keyevent", "4");
    await expect(page.locator(".control-editor")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText("Settings");
    command(
      "shell",
      "settings",
      "put",
      "system",
      "accelerometer_rotation",
      "0",
    );
    command("shell", "settings", "put", "system", "user_rotation", "1");
    await expect
      .poll(() => page.evaluate(() => innerWidth > innerHeight), {
        timeout: 10000,
      })
      .toBe(true);
    await page.locator('[data-action="edit-controls"]').click();
    await expect(page.locator("[data-editor-orientation]")).toHaveText(
      "Landscape",
    );
    await touchDrag(page.locator('[data-editor-control="hardDrop"]'), -40, -10);
    await page.screenshot({ path: `${output}/editor-landscape.png` });
    await page.locator('[data-editor-action="done"]').click();
    const layouts = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("tetromino_v2_settings"))
          .gamepadLayouts,
    );
    if (
      !layouts.landscape.hardDrop ||
      JSON.stringify(layouts.portrait) !== JSON.stringify(portrait)
    )
      throw new Error("Native orientation layouts were not isolated.");
    command("shell", "settings", "put", "system", "user_rotation", "0");
    await expect
      .poll(() => page.evaluate(() => innerWidth < innerHeight), {
        timeout: 10000,
      })
      .toBe(true);
    await page.locator('#dialog [data-action="close"]').last().click();
    await page.getByRole("dialog").locator('[data-action="resume"]').click();
    const left = await page
      .locator('[data-movement-pad] [data-command="MOVE_LEFT"]')
      .boundingBox();
    const right = await page
      .locator('[data-movement-pad] [data-command="MOVE_RIGHT"]')
      .boundingBox();
    const down = await page
      .locator('[data-movement-pad] [data-command="SOFT_DROP"]')
      .boundingBox();
    const pad = await page.locator("[data-movement-pad]").boundingBox();
    const point = (r) => ({
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
      id: 1,
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(left)],
    });
    for (const r of [right, down])
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [point(r)],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: pad.x + pad.width / 2, y: pad.y + pad.height / 4, id: 1 },
      ],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.screenshot({ path: `${output}/gamepad.png` });
    await page.locator(".pause-button").click();
    const released = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tetromino_v2_run")),
    );
    if (released.softDropActive || released.piecesPlaced !== 1)
      throw new Error(
        "Sliding pad left a held drop or triggered a discrete action.",
      );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    await page.locator('select[name="padMode"]').selectOption("dynamic");
    await page.locator('#dialog [data-action="close"]').last().click();
    await page.getByRole("dialog").locator('[data-action="resume"]').click();
    const zone = await page.locator("[data-dynamic-pad-zone]").boundingBox();
    const origin = {
      x: zone.x + zone.width / 2,
      y: zone.y + zone.height / 3,
      id: 1,
    };
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [origin],
    });
    await expect(page.locator("[data-dynamic-origin]")).toBeVisible();
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...origin, x: origin.x + 25 }],
    });
    await expect(page.locator('[data-command="MOVE_RIGHT"]')).toHaveClass(
      /pressed/,
    );
    const rotateBounds = await page
      .locator('[data-command="ROTATE_CW"]')
      .boundingBox();
    const rotationTouch = {
      x: rotateBounds.x + rotateBounds.width / 2,
      y: rotateBounds.y + rotateBounds.height / 2,
      id: 2,
    };
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...origin, x: origin.x + 25 }, rotationTouch],
    });
    await expect(page.locator('[data-command="ROTATE_CW"]')).toHaveClass(
      /pressed/,
    );
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...origin, y: origin.y + 30 }, rotationTouch],
    });
    await expect(page.locator('[data-command="SOFT_DROP"]')).toHaveClass(
      /pressed/,
    );
    await page.screenshot({ path: `${output}/dynamic-pad.png` });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator("[data-dynamic-origin]")).toBeHidden();
    await expect(page.locator('[data-command="ROTATE_CW"]')).not.toHaveClass(
      /pressed/,
    );
    await expect(page.locator('[data-command="SOFT_DROP"]')).not.toHaveClass(
      /pressed/,
    );
    await page.locator(".pause-button").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
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
    // Theme selection updates DOM immediately; Canvas paints on the next frame.
    await expect
      .poll(() =>
        page
          .locator("#board")
          .evaluate((node) =>
            Array.from(node.getContext("2d").getImageData(10, 10, 1, 1).data),
          ),
      )
      .toEqual([32, 52, 59, 255]);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    // Android's compositor can trail WebView Canvas readback after native resume.
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${output}/floating-basalt.png` });
    // Keep an OS-level capture too: WebView CDP captures may omit GPU layers.
    writeFileSync(
      `${output}/android-display.png`,
      execFileSync(adb, ["-e", "exec-out", "screencap", "-p"], {
        timeout: 30000,
      }),
    );
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
            "all thirteen themes",
            "three-way sliding gamepad touch input",
            "dynamic thumb origin and simultaneous two-finger movement/rotation",
            "editable controls, Back cancellation and separate native orientation layouts",
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
    try {
      command("shell", "settings", "put", "system", "user_rotation", "0");
      command(
        "shell",
        "settings",
        "put",
        "system",
        "accelerometer_rotation",
        "1",
      );
    } catch {
      /* The test owns this emulator; restore its rotation settings when reachable. */
    }
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
