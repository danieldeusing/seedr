import { disableAnimations, expect, test } from "./helpers";

// Item 19 + 26/36: filters stay visible and reversible; animation re-enables live.
test.describe("filter state and animation toggle", () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test("active filters render as removable chips with a reset action", async ({ page }) => {
    // scope is a dependent filter: it only applies together with source=seedr.
    await page.goto("/skills?source=seedr&scope=user");
    await expect(page.getByTestId("filter-chip")).toHaveCount(2);
    await expect(page.getByTestId("reset-filters")).toBeVisible();
    await page.getByTestId("filter-chip").filter({ hasText: "Scope" }).click();
    await expect(page).not.toHaveURL(/scope=user/);
    await expect(page).toHaveURL(/source=seedr/);
    await page.getByTestId("reset-filters").click();
    await expect(page).not.toHaveURL(/source=/);
  });

  test("an invalid filter is ignored loudly instead of silently emptying results", async ({ page }) => {
    await page.goto("/skills?scope=bogus&ext=nonsense");
    await expect(page.getByTestId("results-grid")).toBeVisible();
    await expect(page.getByTestId("item-card").first()).toBeVisible();
    await expect(page.getByTestId("ignored-filters")).toBeVisible();
  });

  test("a filter from another category is dropped loudly, and in-app navigation starts clean", async ({ page }) => {
    // ext belongs to the plugins category; on /skills it must be ignored with a notice,
    // never silently produce zero results (item 19).
    await page.goto("/skills?ext=lsp");
    await expect(page.getByTestId("item-card").first()).toBeVisible();
    await expect(page.getByTestId("ignored-filters")).toBeVisible();

    // Navigating between categories through the app yields clean URLs.
    await page.goto("/plugins?ext=lsp");
    await page.getByRole("link", { name: "Seedr", exact: false }).first().click();
    await page.getByRole("link", { name: /skills/i }).first().click();
    await expect(page).toHaveURL(/\/skills$/);
  });

  test("re-enabling animations takes effect immediately, no reload", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByTestId("anim-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // The terminal session restarts without a reload: typed output grows again.
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.classList.contains("term-anim")), {
        message: "the typing session re-arms",
      })
      .toBe(true);
  });

  test("the theme picker switches themes and persists", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-picker").locator("summary").click();
    await page.getByRole("button", { name: "green" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "green");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "green");
  });
});
