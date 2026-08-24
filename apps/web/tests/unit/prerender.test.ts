// @vitest-environment node
import { describe, expect, it } from "vitest";
import { collectRoutes, readRegistry, renderHead, renderRobots, renderSitemap } from "../../scripts/prerender-meta.mjs";
import { SITE_ORIGIN, TYPE_LABELS, TYPE_LABELS_PLURAL, TYPE_PATHS, categoryMeta, homeMeta, itemMeta, itemsInCategory, notFoundMeta } from "../../scripts/site-meta.mjs";
import { typeLabelPlural, typeLabels, typeToPath } from "../../src/lib/colors";

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="generic" />
    <meta name="theme-color" content="#f5efe2" />
    <title>Generic</title>
    <script>
      (() => { /* theme gate */ })();
    </script>
  </head>
  <body><div id="root"></div></body>
</html>
`;

describe("site-meta", () => {
  it("counts a category the way the app lists it — wrapper plugins included", () => {
    const items = [
      { type: "skill", slug: "a" },
      { type: "plugin", slug: "b", pluginType: "wrapper", wrapper: "skill" },
      { type: "plugin", slug: "c", pluginType: "package" },
    ];
    // A wrapper plugin is listed on the page of the capability it wraps, so a
    // raw per-type count would advertise "0 agents" on a page showing one.
    expect(itemsInCategory(items, "skill").map((i) => i.slug)).toEqual(["a", "b"]);
    // ...but the plugins page lists plugins only, never the wrapped capability.
    expect(itemsInCategory(items, "plugin").map((i) => i.slug)).toEqual(["b", "c"]);
    expect(itemsInCategory(items, "agent")).toEqual([]);
  });

  it("prerenders the cross-listed count, not the raw per-type length", () => {
    const itemsByType = readRegistry();
    const allItems = Object.values(itemsByType).flat();
    const routes = collectRoutes(itemsByType);

    // The bug this pins: using `itemsByType[type].length` shipped
    // "Browse 0 agents" on a page that lists a wrapper plugin.
    let sawCrossListed = false;
    for (const type of Object.keys(TYPE_PATHS) as (keyof typeof TYPE_PATHS)[]) {
      const route = routes.find((r) => r.path === `/${TYPE_PATHS[type]}`);
      const expected = itemsInCategory(allItems, type).length;
      expect(route?.description).toContain(`Browse ${expected} `);
      if (expected !== (itemsByType[type] ?? []).length) sawCrossListed = true;
    }
    // Guards the guard: if no type cross-lists today, the loop proves nothing.
    expect(sawCrossListed).toBe(true);
  });

  it("mirrors the app's type maps (one source of truth for titles)", () => {
    expect(TYPE_PATHS).toEqual(typeToPath);
    expect(TYPE_LABELS_PLURAL).toEqual(typeLabelPlural);
    // The singular table was uncompared: renaming a label in colors.ts changed
    // the heading while <title> and the prerendered <head> kept the old name.
    expect(TYPE_LABELS).toEqual(typeLabels);
  });

  it("builds titles, descriptions and clips long descriptions at 160 characters", () => {
    expect(homeMeta().path).toBe("/");
    expect(categoryMeta("mcp", 3)).toMatchObject({ path: "/mcps", title: "MCP Servers — Seedr", index: true });
    const meta = itemMeta({ type: "skill", slug: "pdf", name: "Pdf", description: "x ".repeat(200) });
    expect(meta.title).toBe("Pdf — Skill — Seedr");
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.description.endsWith("…")).toBe(true);
    expect(notFoundMeta().index).toBe(false);
  });
});

describe("renderHead", () => {
  it("replaces the generic title/description with route tags, keeps the inline script byte for byte", () => {
    const html = renderHead(TEMPLATE, itemMeta({ type: "skill", slug: "pdf", name: 'Pdf "quoted" <b>', description: "Desc & more" }));
    expect(html).toContain("<title>Pdf &quot;quoted&quot; &lt;b&gt; — Skill — Seedr</title>");
    expect(html).toContain('<meta name="description" content="Desc &amp; more" />');
    expect(html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/skills/pdf" />`);
    expect(html).toContain('<meta property="og:url" content="https://seedr.danieldeusing.de/skills/pdf" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).toContain('<meta name="robots" content="index, follow" />');
    expect(html).not.toContain('content="generic"');
    expect(html).not.toContain("<title>Generic</title>");
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
    expect(html).toContain("(() => { /* theme gate */ })();");
  });

  it("marks the 404 page noindex", () => {
    expect(renderHead(TEMPLATE, notFoundMeta())).toContain('<meta name="robots" content="noindex" />');
  });

  it("refuses templates without exactly one title and description", () => {
    expect(() => renderHead("<html><head></head></html>", homeMeta())).toThrow(/exactly one/);
  });
});

describe("routes, sitemap and robots", () => {
  const registry = readRegistry();
  const routes = collectRoutes(registry);
  const itemCount = Object.values(registry).reduce((sum, items) => sum + items.length, 0);

  it("lists home, legal pages, every category and every item", () => {
    expect(routes).toHaveLength(3 + Object.keys(TYPE_PATHS).length + itemCount);
    expect(routes.map((r) => r.path)).toContain("/skills");
    expect(routes.map((r) => r.path)).toContain("/settings");
    expect(new Set(routes.map((r) => r.path)).size).toBe(routes.length);
  });

  it("writes a sitemap of indexable routes with lastmod where known", () => {
    const sitemap = renderSitemap([...routes, notFoundMeta()]);
    expect(sitemap.match(/<url>/g)).toHaveLength(routes.length);
    expect(sitemap).not.toContain("/404");
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
    expect(sitemap).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("points robots at the sitemap and keeps crawlers out of the API", () => {
    expect(renderRobots()).toBe(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
  });
});
