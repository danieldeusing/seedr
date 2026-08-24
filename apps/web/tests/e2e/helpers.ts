import type { Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

/** The five widths the remediation requires every control to work at. */
export const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

/**
 * Terminal typing animation off before any script runs, so content is present
 * immediately and assertions never race the typewriter.
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("anim", "off");
    } catch {
      /* storage unavailable */
    }
  });
}

/** Fails the test on any console error or uncaught page error. */
export function failOnConsoleErrors(page: Page, testInfo: TestInfo): void {
  page.on("console", (message) => {
    if (message.type() === "error") {
      testInfo.annotations.push({ type: "console-error", description: message.text() });
      throw new Error(`Console error on ${page.url()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    throw new Error(`Uncaught page error on ${page.url()}: ${error.message}`);
  });
}

/** Asserts the document itself never scrolls horizontally (controls may scroll inside their own boxes). */
export async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, "the page must not scroll horizontally").toBeLessThanOrEqual(1);
}

/** Visible and fully inside the current viewport. */
export async function expectInViewport(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error(`no bounding box for ${selector}`);
  expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(viewport.width + 1);
}

export { expect, test };
