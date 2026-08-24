import AxeBuilder from "@axe-core/playwright";
import { disableAnimations, expect, test } from "./helpers";

// Item 22: automated axe checks plus real keyboard operation.
const PAGES = ["/", "/skills", "/skills/pdf", "/privacy"];

test.describe("accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  for (const path of PAGES) {
    test(`axe finds no serious or critical violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical"
      );
      expect(
        blocking.map((violation) => `${violation.id}: ${violation.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      ).toEqual([]);
    });
  }

  test("cards are keyboard-activatable and no control is nested in a link", async ({ page }) => {
    await page.goto("/skills");
    const firstCard = page.getByTestId("item-card").first();
    await expect(firstCard).toBeVisible();
    // Interactive content must not nest: the card is an <article> whose main link is a
    // sibling of the filter buttons, never their ancestor.
    const nested = await page
      .locator("[data-testid=item-card] a button, [data-testid=item-card] a a, [data-testid=item-card] button button")
      .count();
    expect(nested, "no interactive content nested inside links or buttons").toBe(0);

    const cardLink = firstCard.getByRole("link").first();
    await cardLink.focus();
    await expect(cardLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/skills\/[a-z0-9-]+$/);
  });

  test("the file tree is a keyboard-operable tree", async ({ page }) => {
    await page.goto("/skills/pdf");
    const tree = page.getByRole("tree");
    await expect(tree).toBeVisible();
    const items = page.getByRole("treeitem");
    expect(await items.count()).toBeGreaterThan(0);

    await items.first().focus();
    await page.keyboard.press("ArrowDown");
    const focusedIsTreeitem = await page.evaluate(
      () => document.activeElement?.getAttribute("role") === "treeitem"
    );
    expect(focusedIsTreeitem, "arrow keys move focus within the tree").toBe(true);
    const expandable = page.locator("[role=treeitem][aria-expanded]").first();
    if (await expandable.count()) {
      const before = await expandable.getAttribute("aria-expanded");
      await expandable.focus();
      await page.keyboard.press(before === "true" ? "ArrowLeft" : "ArrowRight");
      await expect(expandable).toHaveAttribute("aria-expanded", before === "true" ? "false" : "true");
    }
  });

  test("keyboard-only walk of the browse page reaches search, filters and cards", async ({ page }) => {
    await page.goto("/skills");
    await page.keyboard.press("Tab");
    const reached = new Set<string>();
    for (let presses = 0; presses < 60; presses++) {
      const info = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return null;
        return {
          inCard: Boolean(active.closest("[data-testid=item-card]")),
          inFilterBar: Boolean(active.closest("[data-testid=filter-bar]")),
          isSearch: active.matches("input"),
        };
      });
      if (info?.isSearch) reached.add("search");
      if (info?.inFilterBar) reached.add("filters");
      if (info?.inCard) reached.add("card");
      if (reached.size === 3) break;
      await page.keyboard.press("Tab");
    }
    expect([...reached].sort()).toEqual(["card", "filters", "search"]);
  });
});
