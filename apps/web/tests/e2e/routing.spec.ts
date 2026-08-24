import { disableAnimations, expect, test } from "./helpers";

// Item 24 + 25: prerendered per-route metadata, real status codes, robots/sitemap,
// and the security headers from public/_headers (served by the preview shim exactly
// as Cloudflare Pages serves them).
test.describe("routing, metadata and headers", () => {
  test("route-specific titles, canonicals and Open Graph tags are prerendered", async ({ request }) => {
    const cases = [
      { path: "/", title: "Seedr — seed your coding agents with capabilities", canonical: "https://seedr.danieldeusing.de/" },
      { path: "/skills/pdf", title: "Pdf — Skill — Seedr", canonical: "https://seedr.danieldeusing.de/skills/pdf" },
      { path: "/privacy", title: "Privacy — Seedr", canonical: "https://seedr.danieldeusing.de/privacy" },
    ];
    for (const { path, title, canonical } of cases) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toContain(`<title>${title}</title>`);
      expect(html, path).toContain(`<link rel="canonical" href="${canonical}" />`);
      expect(html, path).toContain(`<meta property="og:title" content="${title}" />`);
      expect(html, path).toMatch(/<meta name="description" content="[^"]+"/);
    }
  });

  test("unknown paths are real 404s, not soft-200 SPA pages", async ({ request }) => {
    const response = await request.get("/definitely-not-a-page");
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain("Page not found");
  });

  test("/api/* never falls through to SPA HTML", async ({ request }) => {
    const response = await request.get("/api/installs");
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.text()).not.toContain("<html");
  });

  test("robots.txt and sitemap.xml are served", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Disallow: /api/");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("<urlset");
    expect((xml.match(/<url>/g) ?? []).length).toBeGreaterThan(100);
  });

  test("security headers are present", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).not.toContain("unsafe-inline");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toBeTruthy();
  });

  test("the page works with the CSP enforced (no violations, one exact h1)", async ({ page }) => {
    await disableAnimations(page);
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });
    await page.goto("/skills");
    await expect(page.getByTestId("results-grid")).toBeVisible();
    expect(violations).toEqual([]);
    await expect(page.locator("h1")).toHaveCount(1);
    await page.goto("/skills/pdf");
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("embed mode still renders inside the frame policy", async ({ page }) => {
    await disableAnimations(page);
    await page.goto("/skills?embed");
    await expect(page.getByTestId("results-grid")).toBeVisible();
    await expect(page.getByTestId("status-bar")).toHaveCount(0);
  });
});
