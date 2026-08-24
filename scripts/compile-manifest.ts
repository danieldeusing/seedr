#!/usr/bin/env npx tsx
/**
 * Compile individual item.json files into the registry manifests.
 *
 * Usage: npx tsx scripts/compile-manifest.ts
 *
 * The logic lives in @seedr/registry-ops (`compileRegistry`); this is the `pnpm
 * compile` entry point and the module sync.ts imports.
 */
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TYPES, collectItems, compileRegistry, typeDirName } from "@seedr/registry-ops";
import type { Manifest, ManifestItem } from "./sync/types.js";

const registryDir = join(dirname(fileURLToPath(import.meta.url)), "..", "registry");

/** Every item with its content hash, in manifest order. sync.ts reads these before it writes. */
export function readAllItems(): ManifestItem[] {
  // sync/types.ts keeps its own looser item shape; the data on disk is the same.
  return collectItems(registryDir) as unknown as ManifestItem[];
}

export function compileManifest(): Manifest {
  const { items, counts } = compileRegistry(registryDir);
  console.log(`Compiled ${items.length} items into split manifests`);
  for (const type of ALL_TYPES) {
    if (counts[type] > 0) console.log(`  - ${typeDirName(type)}/manifest.json: ${counts[type]} items`);
  }
  return { version: "2.0.0", items: items as unknown as ManifestItem[] };
}

if (process.argv[1] && basename(process.argv[1]).includes("compile-manifest")) {
  compileManifest();
}
