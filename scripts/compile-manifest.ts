#!/usr/bin/env npx tsx
/**
 * Compile individual item.json files into the registry manifests.
 *
 * Usage: npx tsx scripts/compile-manifest.ts
 *
 * The logic — including the single validator and the first-party content
 * digests — lives in @seedr/registry-ops; this is the `pnpm compile` entry
 * point and the module sync.ts and the sync tests import. `registryDir` is
 * overridable so tests compile disposable registries.
 */
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_TYPES, collectItems, compileRegistry, listItemsRaw, resolveRegistryDir, typeDirName } from "@seedr/registry-ops";
import type { Manifest, ManifestItem } from "./sync/types.js";

// Not `<repo>/registry` unconditionally: a fork keeps its own items in the
// directory `seedr.config.json` names, so that upstream's `registry/` is never
// modified locally and every merge from it stays clean.
export const DEFAULT_REGISTRY_DIR = resolveRegistryDir(join(dirname(fileURLToPath(import.meta.url)), ".."));

export interface CompileOptions {
  registryDir?: string;
  /** `false` reads items without validation — the sync's migration path only. */
  validate?: boolean;
}

/** Every item with its content hash and digest, in manifest order. sync.ts reads these before it writes. */
export function readAllItems(options: CompileOptions = {}): ManifestItem[] {
  const registryDir = options.registryDir ?? DEFAULT_REGISTRY_DIR;
  // sync/types.ts keeps its own looser item shape; the data on disk is the same.
  if (options.validate === false) {
    return listItemsRaw(registryDir).map(({ item }) => item) as unknown as ManifestItem[];
  }
  return collectItems(registryDir) as unknown as ManifestItem[];
}

export function compileManifest(options: CompileOptions = {}): Manifest {
  const registryDir = options.registryDir ?? DEFAULT_REGISTRY_DIR;
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
