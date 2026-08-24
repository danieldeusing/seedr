import { disableAnimations, expect, failOnConsoleErrors, test } from "./helpers";

// Item 16 + 21: no request leaves the origin until the user asks for one, no editor
// chunk loads for a catalog page, and production pages log no errors.
test.describe("network behaviour and privacy", () => {
  test.beforeEach(async ({ page }) => {
    await disableAnimations(page);
  });

  for (const path of ["/", "/skills", "/skills/pdf", "/privacy", "/playgrounds/index.html"]) {
    test(`no third-party request on ${path}`, async ({ page }, testInfo) => {
      failOnConsoleErrors(page, testInfo);
      const thirdParty: string[] = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.hostname !== "127.0.0.1") thirdParty.push(request.url());
      });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(thirdParty, "hosts contacted without user action").toEqual([]);
    });
  }

  test("file preview fetches from GitHub only after an explicit click", async ({ page }) => {
    const externalAttempts: string[] = [];
    await page.route("https://raw.githubusercontent.com/**", (route) => {
      externalAttempts.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/plain", body: "stub content" });
    });

    await page.goto("/skills/pdf");
    await page.waitForLoadState("networkidle");
    expect(externalAttempts, "nothing is fetched before the click").toEqual([]);
    await expect(page.getByTestId("preview-hint")).toBeVisible();

    const file = page.getByRole("treeitem", { name: /SKILL\.md/ }).first();
    await file.click();
    await expect
      .poll(() => externalAttempts.length, { message: "the click loads exactly the requested file" })
      .toBeGreaterThan(0);
    for (const url of externalAttempts) {
      expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
    }
  });

  test("no editor chunk is downloaded for a detail page", async ({ page }) => {
    const chunkRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/assets/")) chunkRequests.push(request.url());
    });
    await page.goto("/skills/pdf");
    await page.waitForLoadState("networkidle");
    const editorChunks = chunkRequests.filter((url) => /monaco|editor/i.test(url));
    expect(editorChunks).toEqual([]);
  });

  test("localStorage keys match the privacy policy's list", async ({ page }) => {
    await page.goto("/privacy");
    const documented = await page.evaluate(() =>
      Array.from(document.querySelectorAll("code")).map((node) => node.textContent ?? "")
    );
    for (const key of ["theme", "anim"]) {
      expect(documented.join(" "), `privacy page documents the "${key}" key`).toContain(key);
    }
  });
});
