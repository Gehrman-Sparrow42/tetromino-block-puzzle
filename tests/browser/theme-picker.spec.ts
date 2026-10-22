import { test, expect } from "@playwright/test";
import { THEME_IDS } from "../../src/contracts/game-contract";
import { THEMES } from "../../src/ui/themes";
for (const mode of ["light", "dark", "forced"] as const) {
  test(`in-app theme choices remain readable and persist in ${mode}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "phone");
    await page.emulateMedia({
      colorScheme: mode === "light" ? "light" : "dark",
      forcedColors: mode === "forced" ? "active" : "none",
    });
    await page.goto("/");
    await page.locator('#home [data-action="settings"]').click();
    await expect(page.locator('select[name="theme"]')).toHaveCount(0);
    const summary = page.locator(".theme-picker summary");
    await summary.focus();
    await summary.press("Enter");
    await expect(
      page.getByRole("group", { name: "Choose theme" }),
    ).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(13);
    for (const id of THEME_IDS) {
      const radio = page.getByRole("radio", {
        name: THEMES[id].name,
        exact: true,
      });
      await radio.check();
      await expect(radio).toBeChecked();
      await expect(page.locator("html")).toHaveAttribute("data-theme", id);
      await expect(page.locator("[data-current-theme]")).toHaveText(
        THEMES[id].name,
      );
      const contrast = await radio.evaluate((n) => {
        const label = n.closest("label")!,
          style = getComputedStyle(label);
        const rgb = (value: string) =>
          (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const luminance = (v: number[]) =>
          v
            .map((x) => x / 255)
            .map((x) =>
              x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4),
            )
            .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i]!, 0);
        const a = luminance(rgb(style.color)),
          b = luminance(rgb(style.backgroundColor));
        return {
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          height: label.getBoundingClientRect().height,
        };
      });
      expect(contrast.height).toBeGreaterThanOrEqual(48);
      expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
    }
    await page.getByRole("radio", { name: "Basalt", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("radio", { name: "Workshop", exact: true }),
    ).toBeChecked();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      "workshop",
    );
    await page.locator('#home [data-action="settings"]').click();
    await expect(page.locator("[data-current-theme]")).toHaveText("Workshop");
    await page.locator(".theme-picker summary").click();
    await expect(
      page.getByRole("radio", { name: "Workshop", exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: info.outputPath(`theme-picker-${mode}-2.10.1.png`),
    });
  });
}
