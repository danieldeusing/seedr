#!/usr/bin/env npx tsx
/**
 * Main sync orchestrator.
 * Syncs items from all configured sources and updates individual item.json files,
 * then compiles the manifest.
 *
 * Usage: npx tsx scripts/sync.ts
 *
 * Sources:
 * - anthropic: Skills and plugins from Anthropic repos
 * - community: Manually-added community items (re-synced from their GitHub repos)
 * - toolr: (future) Toolr Suite items from toolr-suite repos
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { syncAnthropic } from "./sync/anthropic.js";
import { syncCommunity } from "./sync/community.js";
import { compileManifest, readAllItems, typeDirName } from "./compile-manifest.js";
import type { ManifestItem } from "./sync/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryDir = join(__dirname, "..", "registry");

function writeItem(item: ManifestItem): void {
  const typeDir = typeDirName(item.type);
  const itemDir = join(registryDir, typeDir, item.slug);
  mkdirSync(itemDir, { recursive: true });
  writeFileSync(join(itemDir, "item.json"), JSON.stringify(item, null, 2) + "\n");
}

function deleteItemDir(item: ManifestItem): void {
  const typeDir = typeDirName(item.type);
  const itemDir = join(registryDir, typeDir, item.slug);
  if (!existsSync(itemDir)) return;

  // Only delete if directory contains just item.json (metadata-only)
  const contents = readdirSync(itemDir);
  if (contents.length === 1 && contents[0] === "item.json") {
    rmSync(itemDir, { recursive: true });
  }
}

async function main() {
  console.log("Starting manifest sync...\n");

  // Read all existing items from item.json files
  const existingItems = readAllItems();

  // Keep toolr items (always manually maintained, never touched by sync)
  const toolrItems = existingItems.filter((item) => item.sourceType === "toolr");
  const existingSyncedItems = existingItems.filter((item) => item.sourceType !== "toolr");

  // Sync from all sources
  const syncedItems: ManifestItem[] = [];

  // Anthropic (skills + plugins)
  const anthropicItems = await syncAnthropic();
  syncedItems.push(...anthropicItems);

  // Only update if we fetched items, otherwise keep existing
  if (syncedItems.length > 0) {
    // Find manually-added community items (not covered by Anthropic sync)
    const syncedSlugs = new Set(syncedItems.map((item) => item.slug));
    const manualCommunityItems = existingItems.filter(
      (item) => item.sourceType === "community" && !syncedSlugs.has(item.slug)
    );

    // Re-sync manual community items from their GitHub repos
    const updatedCommunityItems = await syncCommunity(manualCommunityItems);

    // Build set of all valid synced slugs
    const allSyncedSlugs = new Set([
      ...syncedItems.map((i) => i.slug),
      ...updatedCommunityItems.map((i) => i.slug),
    ]);

    // Write each synced item as item.json
    for (const item of [...syncedItems, ...updatedCommunityItems]) {
      writeItem(item);
    }

    // Delete stale non-toolr item directories
    const toolrSlugs = new Set(toolrItems.map((i) => i.slug));
    for (const existing of existingSyncedItems) {
      if (!allSyncedSlugs.has(existing.slug) && !toolrSlugs.has(existing.slug)) {
        deleteItemDir(existing);
        console.log(`  Removed stale: ${existing.slug}`);
      }
    }

    console.log(`\n✓ Updated item.json files`);
    console.log(`  - Toolr: ${toolrItems.length} (unchanged)`);
    console.log(`  - Community (manual): ${updatedCommunityItems.length}`);
    console.log(`  - Synced (Anthropic): ${syncedItems.length}`);
  } else {
    console.log(`\n⚠ No items fetched (rate limited?), keeping existing ${existingSyncedItems.length} synced items`);
  }

  // Always compile manifest from item.json files
  compileManifest();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
