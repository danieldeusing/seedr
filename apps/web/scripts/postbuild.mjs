#!/usr/bin/env node
/* global console, process */
// Runs after `vite build`:
//   1. prerender the <head> of every route (+ 404.html, sitemap.xml, robots.txt)
//   2. pin the CSP script hash in dist/_headers to the inline script actually built
//   3. enforce the bundle budget
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prerender } from "./prerender-meta.mjs";
import { headersScriptHashes, inlineScriptHash, withScriptHash } from "./csp-hash.mjs";
import { checkBundleBudget } from "./check-bundle-budget.mjs";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(webRoot, "dist");

const routes = prerender(distDir);
console.log(`prerendered ${routes.length} routes + 404.html, sitemap.xml, robots.txt`);

const builtHash = inlineScriptHash(readFileSync(join(distDir, "index.html"), "utf8"));
const headersPath = join(distDir, "_headers");
const headersText = readFileSync(headersPath, "utf8");
const listed = headersScriptHashes(headersText);
if (listed.length !== 1 || listed[0] !== builtHash) {
  writeFileSync(headersPath, withScriptHash(headersText, builtHash));
  // Exiting 0 here meant `pnpm build` alone never failed on a CSP drift, and
  // the unit test checks different inputs (source index.html vs public/_headers).
  console.error(`dist/_headers: script-src hash pinned to ${builtHash} — update public/_headers to match`);
  process.exit(1);
} else {
  console.log(`dist/_headers: script-src hash ${builtHash} matches the built inline script`);
}

const { chunks, problems } = checkBundleBudget(distDir);
for (const chunk of chunks.slice(0, 6)) console.log(`  ${String(chunk.bytes).padStart(8)} B  ${chunk.name}`);
if (problems.length) {
  console.error("bundle budget exceeded:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("bundle budget OK");
