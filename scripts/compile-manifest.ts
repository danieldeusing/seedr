#!/usr/bin/env npx tsx
/**
 * Compile individual item.json files into registry/manifest.json.
 *
 * Usage: npx tsx scripts/compile-manifest.ts
 *
 * Reads registry/<type>s/<slug>/item.json files, sorts by sourceType then slug,
 * and writes the assembled manifest.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";
import { findDuplicateItems, validateItem } from "./lib/validate-item.js";
import { computeContentDigest } from "./sync/digest.js";
import type { ComponentType, Manifest, ManifestIndex, ManifestItem, SourceType, TypeManifest } from "./sync/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY_DIR = join(__dirname, "..", "registry");

const SOURCE_ORDER: Record<SourceType, number> = {
  toolr: 0,
  community: 1,
  official: 2,
};

export const ALL_TYPES: ComponentType[] = ["skill", "plugin", "hook", "agent", "mcp", "settings", "command"];

/** Folder name for a type: plural except `mcp` and `settings`, which are used as-is. */
export function typeDirName(type: ComponentType): string {
  return type === "settings" || type === "mcp" ? type : type + "s";
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full));
    } else if (entry.name !== "item.json") {
      files.push(full);
    }
  }
  return files;
}

function computeLocalContentHash(itemDir: string): string | null {
  const files = collectFiles(itemDir).sort();
  if (files.length === 0) return null;

  const hash = createHash("sha256");
  for (const file of files) {
    const rel = relative(itemDir, file);
    const content = readFileSync(file);
    hash.update(`${rel}:${createHash("sha1").update(content).digest("hex")}\n`);
  }
  return hash.digest("hex").slice(0, 16);
}

export interface ReadOptions {
  registryDir?: string;
  /**
   * Validate every item against docs/registry-integrity.md (default true). The sync reads
   * the pre-run registry with `validate: false` so that an invalid item on disk cannot stop
   * it from carrying that item over unchanged; it validates the proposed registry itself.
   */
  validate?: boolean;
}

export function readAllItems(options: ReadOptions = {}): ManifestItem[] {
  const registryDir = options.registryDir ?? DEFAULT_REGISTRY_DIR;
  const validate = options.validate ?? true;
  const items: ManifestItem[] = [];
  const violations: string[] = [];

  // Each top-level dir in registry/ is a type category (skills/, plugins/, hooks/, etc.)
  for (const typeDir of readdirSync(registryDir, { withFileTypes: true })) {
    if (!typeDir.isDirectory()) continue;
    const typePath = join(registryDir, typeDir.name);

    // Each subdir is a slug
    for (const slugDir of readdirSync(typePath, { withFileTypes: true })) {
      if (!slugDir.isDirectory()) continue;
      const itemDir = join(typePath, slugDir.name);
      const itemJsonPath = join(itemDir, "item.json");
      if (!existsSync(itemJsonPath)) continue;

      const content = readFileSync(itemJsonPath, "utf-8");
      let item: unknown;
      try {
        item = JSON.parse(content);
      } catch (err) {
        throw new Error(`Failed to parse ${itemJsonPath}: ${(err as Error).message}`, { cause: err });
      }
      const files = collectFiles(itemDir);
      if (validate) {
        violations.push(...validateItem(item, {
          file: relative(registryDir, itemJsonPath),
          slugDir: slugDir.name,
          typeDir: typeDir.name,
          diskFiles: files.map((file) => relative(itemDir, file).split(sep).join("/")),
        }));
      }
      const parsed = item as ManifestItem;

      // Toolr content lives in this repo: hash it from disk (legacy contentHash + contract digest)
      if (parsed.sourceType === "toolr") {
        const contentHash = computeLocalContentHash(itemDir);
        if (contentHash) {
          parsed.contentHash = contentHash;
        }
        const digest = computeContentDigest(
          files.map((file) => ({ path: relative(itemDir, file).split(sep).join("/"), bytes: readFileSync(file) })),
        );
        if (digest) {
          parsed.contentDigest = digest;
        }
      }

      items.push(parsed);
    }
  }

  if (validate) {
    violations.push(...findDuplicateItems(items));
    if (violations.length > 0) {
      throw new Error(`Invalid registry (${violations.length} violation(s)):\n  ${violations.join("\n  ")}`);
    }
  }

  return items;
}

function typeManifestPath(type: ComponentType): string {
  return `${typeDirName(type)}/manifest.json`;
}

export function compileManifest(options: { registryDir?: string } = {}): Manifest {
  const registryDir = options.registryDir ?? DEFAULT_REGISTRY_DIR;
  const manifestPath = join(registryDir, "manifest.json");
  const items = readAllItems({ registryDir });

  // Sort: by sourceType order, then alphabetically by slug.
  // Fall back to a high order for any unknown sourceType so the comparison never
  // produces NaN (which would leave the sort order undefined).
  const sourceOrder = (sourceType: SourceType): number => SOURCE_ORDER[sourceType] ?? Number.MAX_SAFE_INTEGER;
  items.sort((a, b) => {
    const orderDiff = sourceOrder(a.sourceType) - sourceOrder(b.sourceType);
    if (orderDiff !== 0) return orderDiff;
    return a.slug.localeCompare(b.slug);
  });

  // Group items by type
  const byType = new Map<ComponentType, ManifestItem[]>();
  for (const item of items) {
    const group = byType.get(item.type) ?? [];
    group.push(item);
    byType.set(item.type, group);
  }

  // Write per-type manifest files into their type folders
  // Exclude longDescription and contents — they stay in item.json and are loaded on demand
  for (const type of ALL_TYPES) {
    const typeItems = (byType.get(type) ?? []).map((item) => {
      const { longDescription: _longDescription, ...rest } = item;
      // Strip contents from plugins only — hooks still need contents.files and contents.triggers
      if (type === "plugin") {
        const { contents: _contents, ...withoutContents } = rest;
        return withoutContents;
      }
      return rest;
    });
    const typeManifest: TypeManifest = { type, items: typeItems };
    const dirPath = join(registryDir, typeDirName(type));
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    writeFileSync(join(registryDir, typeManifestPath(type)), JSON.stringify(typeManifest, null, 2) + "\n");
  }

  // Build index with all types
  const types = {} as ManifestIndex["types"];
  for (const type of ALL_TYPES) {
    types[type] = { file: typeManifestPath(type), count: byType.get(type)?.length ?? 0 };
  }

  const index: ManifestIndex = { version: "2.0.0", types };
  writeFileSync(manifestPath, JSON.stringify(index, null, 2) + "\n");

  console.log(`Compiled ${items.length} items into split manifests`);
  for (const type of ALL_TYPES) {
    const count = byType.get(type)?.length ?? 0;
    if (count > 0) {
      console.log(`  - ${typeManifestPath(type)}: ${count} items`);
    }
  }

  // Return assembled Manifest for callers (e.g. sync.ts)
  return { version: "2.0.0", items };
}

// Run directly when invoked as a script
if (
  process.argv[1] &&
  basename(process.argv[1]).includes("compile-manifest")
) {
  compileManifest();
}
