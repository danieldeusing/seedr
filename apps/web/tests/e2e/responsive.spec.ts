import {
  VIEWPORTS,
  disableAnimations,
  expect,
  expectInViewport,
  expectNoHorizontalPageScroll,
  test,
} from "./helpers";

// Item 17 + 26: every search/filter/sort/footer/tree/CLI-detail control stays visible
// and usable at 320, 390, 820, 1024 and 1440 px, and nothing hides behind page-level
// horizontal overflow.
for (const viewport of VIEWPORTS) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await disableAnimations(page);
    });

    test("browse controls are visible and usable", async ({ page }) => {
      await page.goto("/skills");
      await expect(page.getByTestId("results-grid")).toBeVisible();
      await expectNoHorizontalPageScroll(page);

      const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
      await expectInViewport(page, "[data-testid=filter-bar]");
      await expect(search).toBeVisible();
      await search.fill("pdf");
      await expect(page.getByTestId("item-card").first()).toBeVisible();

      // Every control in the filter bar can actually be reached and clicked.
      const filterBar = page.getByTestId("filter-bar");
      const controls = filterBar.locator("button, summary, [role=button]");
      const count = await controls.count();
      expect(count, "filter bar renders its controls").toBeGreaterThan(0);
      for (let index = 0; index < count; index++) {
        await expect(controls.nth(index)).toBeVisible();
      }
    });

    test("detail page: CLI table scrolls inside its own container, tree usable", async ({ page }) => {
      await page.goto("/skills/pdf");
      await expectNoHorizontalPageScroll(page);
      await expectInViewport(page, "[data-testid=cli-table]");
      await expect(page.getByRole("tree")).toBeVisible();
      await expect(page.getByTestId("preview-panel").or(page.getByTestId("preview-hint")).first()).toBeVisible();

      if (viewport.width < 768) {
        // Phones: tree and preview stack vertically (each panel spans the content width
        // instead of sharing the row; the tree scrolls inside its own max-height box).
        const treeBox = await page.getByRole("tree").boundingBox();
        const previewBox = await page
          .getByTestId("preview-panel")
          .or(page.getByTestId("preview-hint"))
          .first()
          .boundingBox();
        if (treeBox && previewBox) {
          expect(treeBox.width, "tree spans the content column").toBeGreaterThan(viewport.width * 0.7);
          expect(previewBox.width, "preview spans the content column").toBeGreaterThan(viewport.width * 0.7);
          expect(previewBox.y, "preview starts below the tree's top").toBeGreaterThan(treeBox.y);
        }
      }
    });

    test("footer controls never clip", async ({ page }) => {
      await page.goto("/");
      await expectInViewport(page, "[data-testid=status-bar]");
      await expectInViewport(page, "[data-testid=theme-picker]");
      await expectInViewport(page, "[data-testid=anim-toggle]");
      await expectInViewport(page, "[data-testid=status-bar] a[href='/privacy']");
    });
  });
}
