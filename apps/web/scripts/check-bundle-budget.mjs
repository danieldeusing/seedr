// Production bundle budget. Numbers (minified bytes, before gzip):
//   entry chunk (dist/assets/index-*.js)  ≤ 260 kB — React app code + Radix + icons
//   any other chunk                       ≤ 320 kB — vendor-react is the largest (~230 kB)
// and no chunk may carry an editor (Monaco was replaced by a plain text viewer).
// vite.config.ts mirrors the per-chunk ceiling in build.chunkSizeWarningLimit.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const ENTRY_BUDGET_BYTES = 260 * 1024;
export const CHUNK_BUDGET_BYTES = 320 * 1024;

export function checkBundleBudget(distDir) {
  const assetsDir = join(distDir, "assets");
  const chunks = readdirSync(assetsDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => ({ name, bytes: statSync(join(assetsDir, name)).size }))
    .sort((a, b) => b.bytes - a.bytes);
  const problems = [];
  for (const chunk of chunks) {
    if (/monaco|editor/i.test(chunk.name)) problems.push(`${chunk.name}: editor chunk in the bundle`);
    const isEntry = /^index-[\w-]+\.js$/.test(chunk.name);
    const budget = isEntry ? ENTRY_BUDGET_BYTES : CHUNK_BUDGET_BYTES;
    if (chunk.bytes > budget) problems.push(`${chunk.name}: ${chunk.bytes} bytes exceeds the ${isEntry ? "entry" : "chunk"} budget of ${budget}`);
  }
  return { chunks, problems };
}
