import { disableAnimations, expect, test } from "./helpers";

// Item 18: the browser's Back/Forward and Seedr's own controls represent ONE history.
test.describe("unified navigation history", () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  test("browser back/forward and Seedr back/forward agree", async ({ page }) => {
    await page.goto("/");
    await page.goto("/skills");
    await page.getByTestId("item-card").first().click();
    await expect(page).toHaveURL(/\/skills\/[a-z0-9-]+$/);
    const detailUrl = page.url();

    await page.goBack();
    await expect(page).toHaveURL(/\/skills$/);

    // Seedr's Forward reflects the browser POP: it must lead back to the detail page.
    const forward = page.getByRole("navigation", { name: "Breadcrumb and history" }).getByLabel("Forward");
    await expect(forward).toBeEnabled();
    await forward.click();
    await expect(page).toHaveURL(detailUrl);

    // Seedr's Back, then the BROWSER's forward — same entry again.
    const back = page.getByRole("navigation", { name: "Breadcrumb and history" }).getByLabel("Back");
    await expect(back).toBeEnabled();
    await back.click();
    await expect(page).toHaveURL(/\/skills$/);
    await page.goForward();
    await expect(page).toHaveURL(detailUrl);
  });

  test("query-only changes replace instead of stacking forward entries", async ({ page }) => {
    await page.goto("/skills");
    const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
    await search.fill("pdf");
    await expect(page).toHaveURL(/q=pdf/);
    await search.fill("pd");
    await search.fill("");
    // One browser back leaves the browse page entirely instead of unwinding keystrokes.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/skills/);
  });

  test("direct load starts a fresh history where only the browser can go back", async ({ page }) => {
    await page.goto("/skills/pdf");
    const nav = page.getByRole("navigation", { name: "Breadcrumb and history" });
    await expect(nav.getByLabel("Back")).toBeDisabled();
    await expect(nav.getByLabel("Forward")).toBeDisabled();
  });

  test("category -> detail -> category transitions keep one entry per page", async ({ page }) => {
    await page.goto("/plugins");
    await page.getByTestId("item-card").first().click();
    await expect(page).toHaveURL(/\/plugins\/[a-z0-9-]+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plugins$/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/plugins/);
  });
});
