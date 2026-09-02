#!/usr/bin/env npx tsx
/**
 * Report items whose declared `compatibility` is narrower than what the CLI can
 * actually install: every agent for a skill, and for a plugin every agent that
 * can hold each component it bundles.
 *
 * `add` intersects an item's own array with the capability table, so the item
 * always wins. When the tooling gains an agent and the data does not follow,
 * the capability is real but unreachable — five working plugin stores were
 * reachable through one catalogue item for exactly that reason, and nothing
 * anywhere noticed.
 *
 * This is a REPORT, not a gate. A narrow item is often deliberate: a plugin
 * that bundles Claude hooks genuinely does not port. Widening is a judgement
 * call per item, which is why this prints and exits 0 unless `--strict`.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listItemsChecked, resolveRegistryDir, unclaimedAgents } from "@seedr/registry-ops";
import type { ComponentType } from "@seedr/shared";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

interface Narrow {
  type: ComponentType;
  slug: string;
  declared: string[];
  missing: string[];
}

function main(): void {
  const registryDir = resolveRegistryDir(repoRoot);
  const items = listItemsChecked(registryDir).items.map((located) => located.item);

  const narrow: Narrow[] = [];
  for (const item of items) {
    const missing = unclaimedAgents(item);
    if (missing.length > 0) {
      narrow.push({ type: item.type, slug: item.slug, declared: [...item.compatibility], missing });
    }
  }

  if (narrow.length === 0) {
    console.log(`check-compatibility: ${items.length} items, none narrower than the tooling`);
    return;
  }

  const byType = new Map<ComponentType, Narrow[]>();
  for (const entry of narrow) {
    byType.set(entry.type, [...(byType.get(entry.type) ?? []), entry]);
  }

  console.log(
    `check-compatibility: ${narrow.length} of ${items.length} items declare fewer agents than the CLI supports\n`
  );
  for (const [type, entries] of [...byType].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${type} (${entries.length})`);
    for (const entry of entries.slice(0, 8)) {
      console.log(`    ${entry.slug.padEnd(28)} declares ${entry.declared.join(",")} — could also install for ${entry.missing.join(", ")}`);
    }
    if (entries.length > 8) console.log(`    … and ${entries.length - 8} more`);
  }
  console.log(
    "\nNarrow is not automatically wrong: an item that genuinely only works on one\nagent should say so. Widen the ones where the content is portable."
  );

  if (strict) process.exit(1);
}

main();
