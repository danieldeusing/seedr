#!/usr/bin/env node
/* global console, process, URL, document */
// Opens a playground page under the production Content-Security-Policy and
// reports every console error, page error, CSP violation and failed request,
// then clicks through every interactive control once. Used while converting
// the playgrounds away from inline scripts/styles; the Playwright e2e suite
// repeats the same checks against the production build.
//
//   node scripts/check-playground.mjs cli-explorer
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { parseHeadersFile, headersFor } from "./headers-file.mjs";

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/check-playground.mjs <playground-name>");
  process.exit(2);
}

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(webRoot, "public");
const rules = parseHeadersFile(readFileSync(join(publicDir, "_headers"), "utf8"));

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = normalize(join(publicDir, urlPath));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  for (const [header, value] of headersFor(rules, urlPath)) res.setHeader(header, value);
  res.setHeader("Content-Type", mime[extname(filePath)] ?? "application/octet-stream");
  res.end(readFileSync(filePath));
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", (e) => {
    console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || "inline"} at ${e.sourceFile}:${e.lineNumber}`);
  });
});
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") problems.push(`console.${msg.type()}: ${msg.text()}`);
});
page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => problems.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));
page.on("response", (res) => {
  if (res.status() >= 400) problems.push(`http ${res.status()}: ${res.url()}`);
});
page.on("request", (req) => {
  const url = new URL(req.url());
  if (url.origin !== origin) problems.push(`third-party request: ${req.url()}`);
});

await page.goto(`${origin}/playgrounds/${name}.html`, { waitUntil: "networkidle" });

const inlineHandlers = await page.evaluate(() =>
  [...document.querySelectorAll("*")].flatMap((el) =>
    [...el.attributes].filter((a) => /^on[a-z]+$/i.test(a.name) || a.name === "style").map((a) => `<${el.tagName.toLowerCase()} ${a.name}>`)
  )
);
if (inlineHandlers.length) problems.push(`inline handler/style attributes: ${[...new Set(inlineHandlers)].join(", ")}`);
const inlineScripts = await page.evaluate(() => document.querySelectorAll("script:not([src]), style").length);
if (inlineScripts) problems.push(`${inlineScripts} inline <script>/<style> element(s)`);

// click through every control once (the selectors cover all four playgrounds)
const controls = page.locator(
  ".cmd-tab, .preset-btn, .view-tab, .type-chip, .tool-chip, .source-chip, .radio-btn, .toggle, .copy-btn, td[data-type], td[data-tool], .node, input[type=checkbox], .matrix td"
);
const count = await controls.count();
for (let i = 0; i < count; i++) {
  const control = controls.nth(i);
  if (!(await control.isVisible().catch(() => false))) continue;
  // natively disabled controls are supposed to refuse clicks
  if (await control.isDisabled().catch(() => false)) continue;
  await control.click({ timeout: 2000 }).catch((e) => problems.push(`click ${i}: ${e.message.split("\n")[0]}`));
}
await page.waitForTimeout(200);

await browser.close();
server.close();

if (problems.length) {
  console.error(`${name}: ${problems.length} problem(s)`);
  for (const p of [...new Set(problems)]) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${name}: OK (${count} controls clicked, no console errors, no CSP violations, no third-party requests)`);
