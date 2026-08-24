#!/usr/bin/env node
/* global console, process */
// Post-build prerender of the document <head>: writes dist/<route>/index.html for
// every route (home, privacy, imprint, each category, each item) with the
// route's title, description, canonical URL and Open Graph / Twitter tags, plus
// dist/404.html (noindex), dist/sitemap.xml and dist/robots.txt.
//
// The body stays the SPA shell — React renders the page — so crawlers and link
// previews get correct metadata while the app behaves exactly as before. The
// inline theme script is copied byte for byte (its CSP hash must keep matching).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_NAME, SITE_ORIGIN, TYPE_PATHS, canonicalUrl, categoryMeta, homeMeta, impressumMeta, itemMeta, notFoundMeta, privacyMeta } from "./site-meta.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryDir = join(webRoot, "..", "..", "registry");

function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeXml(text) {
  return escapeHtml(text).replace(/'/g, "&apos;");
}

/** Reads every item from the compiled manifests, keyed by the index file. */
export function readRegistry(dir = registryDir) {
  const index = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const itemsByType = {};
  for (const [type, descriptor] of Object.entries(index.types)) {
    itemsByType[type] = JSON.parse(readFileSync(join(dir, descriptor.file), "utf8")).items;
  }
  return itemsByType;
}

/** All routes with their metadata; items carry `lastmod` for the sitemap. */
export function collectRoutes(itemsByType) {
  const routes = [homeMeta(), privacyMeta(), impressumMeta()];
  for (const type of Object.keys(TYPE_PATHS)) {
    const items = itemsByType[type] ?? [];
    routes.push(categoryMeta(type, items.length));
    for (const item of items) {
      routes.push({ ...itemMeta(item), lastmod: item.updatedAt ? item.updatedAt.slice(0, 10) : undefined });
    }
  }
  return routes;
}

/** Replaces the generic head tags of the built index.html with a route's tags. */
export function renderHead(template, meta) {
  const url = canonicalUrl(meta.path);
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta name="robots" content="${meta.index ? "index, follow" : "noindex"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ].join("\n    ");

  const titleCount = (template.match(/<title>[\s\S]*?<\/title>/g) ?? []).length;
  const descriptionCount = (template.match(/<meta name="description"[^>]*>/g) ?? []).length;
  if (titleCount !== 1 || descriptionCount !== 1) {
    throw new Error(`index.html must contain exactly one <title> and one description meta (found ${titleCount}/${descriptionCount})`);
  }
  return template.replace(/<meta name="description"[^>]*>\s*/, "").replace(/<title>[\s\S]*?<\/title>/, tags);
}

export function renderSitemap(routes) {
  const entries = routes
    .filter((route) => route.index)
    .map((route) => {
      const lastmod = route.lastmod ? `<lastmod>${escapeXml(route.lastmod)}</lastmod>` : "";
      return `  <url><loc>${escapeXml(canonicalUrl(route.path))}</loc>${lastmod}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

export function renderRobots() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}

export function prerender(distDir = join(webRoot, "dist")) {
  const template = readFileSync(join(distDir, "index.html"), "utf8");
  const routes = collectRoutes(readRegistry());

  for (const route of routes) {
    const html = renderHead(template, route);
    if (route.path === "/") {
      writeFileSync(join(distDir, "index.html"), html);
      continue;
    }
    const dir = join(distDir, ...route.path.split("/").filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
  }
  writeFileSync(join(distDir, "404.html"), renderHead(template, notFoundMeta()));
  writeFileSync(join(distDir, "sitemap.xml"), renderSitemap(routes));
  writeFileSync(join(distDir, "robots.txt"), renderRobots());
  return routes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = prerender();
  console.log(`prerendered ${routes.length} routes + 404.html, sitemap.xml, robots.txt`);
}
