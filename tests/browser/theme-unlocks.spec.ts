import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "phone");
});
async function picker(page: Page, query = "?rewardedAds=test") {
  await page.goto(`/${query}`);
  await page.locator('#home [data-action="settings"]').click();
  await page.locator(".theme-picker summary").click();
}
async function preview(page: Page, name = "Neon") {
  await page
    .getByRole("button", { name: `Preview ${name}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `Unlock ${name}` }),
  ).toBeVisible();
}
test("fresh profile offers four free choices; preview Back restores selection", async ({
  page,
}) => {
  await picker(page);
  await expect(page.getByRole("radio")).toHaveCount(4);
  for (const name of ["Ink", "LCD", "Paper", "Classic Arcade"])
    await expect(page.getByRole("radio", { name, exact: true })).toBeVisible();
  await preview(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await expect(page.getByRole("radio")).toHaveCount(4);
});
test("one earned reward selects theme and persists after reload", async ({
  page,
}) => {
  await picker(page);
  await preview(page);
  await page
    .getByRole("button", { name: "Test ad · unlock", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete test ad", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Neon", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "neon");
  await page.locator('#home [data-action="settings"]').click();
  await page.locator(".theme-picker summary").click();
  await expect(
    page.getByRole("radio", { name: "Neon", exact: true }),
  ).toBeChecked();
});
test("canceled ad never unlocks and permits retry", async ({ page }) => {
  await picker(page);
  await preview(page);
  await page
    .getByRole("button", { name: "Test ad · unlock", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel test ad", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Ad not completed");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Preview Neon", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
});
test("unconfigured ads cannot unlock; free themes work", async ({ page }) => {
  await picker(page, "");
  await preview(page);
  await expect(
    page.getByRole("button", { name: "Ads unavailable", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
});
test("leaving pending ad aborts it before switching preview target", async ({
  page,
}) => {
  await picker(page);
  await preview(page);
  await page
    .getByRole("button", { name: "Test ad · unlock", exact: true })
    .click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Test ad", exact: true }),
  ).toHaveCount(0);
  await preview(page, "Basalt");
  await page
    .getByRole("button", { name: "Test ad · unlock", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete test ad", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Basalt", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Preview Neon", exact: true }),
  ).toBeVisible();
});
test("selected legacy nonstarter theme is grandfathered", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "tetromino_v2_settings",
      JSON.stringify({ theme: "neon" }),
    ),
  );
  await picker(page);
  await expect(
    page.getByRole("radio", { name: "Neon", exact: true }),
  ).toBeChecked();
});

test("storage failure keeps theme locked and selection unchanged", async ({
  page,
}) => {
  await picker(page);
  await preview(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "afterblock_theme_access_v1")
        throw new DOMException("Storage full", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page
    .getByRole("button", { name: "Test ad · unlock", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Complete test ad", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Unlock could not be saved",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
  await expect(
    page.getByRole("button", { name: "Preview Neon", exact: true }),
  ).toBeVisible();
});
test("existing access does not silently authorize edited selected theme", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "tetromino_v2_settings",
      JSON.stringify({ theme: "neon" }),
    );
    localStorage.setItem(
      "afterblock_theme_access_v1",
      JSON.stringify({ version: 1, profileId: "a".repeat(48), unlocked: [] }),
    );
  });
  await picker(page);
  await expect(
    page.getByRole("radio", { name: "Ink", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Preview Neon", exact: true }),
  ).toBeVisible();
});
