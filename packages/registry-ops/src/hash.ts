import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ComponentType } from "@seedr/shared";
import { itemDir, itemJsonPath } from "./fsPaths.js";

/** Every file below `dir` except item.json, sorted, as absolute paths. */
export function contentFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      // Symlinks are not content, matching fileTree — following one could leave the item directory.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== "item.json") files.push(full);
    }
  };
  walk(dir);
  return files.sort();
}

/**
 * The content hash recorded in manifests for toolr items: 16 hex chars over the
 * sorted relative paths and per-file sha1s. Null when the item has no content
 * files. Identical to what `pnpm compile` has always written.
 */
export function contentHash(dir: string): string | null {
  const files = contentFiles(dir);
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of files) {
    const rel = relative(dir, file).split("\\").join("/");
    hash.update(`${rel}:${createHash("sha1").update(readFileSync(file)).digest("hex")}\n`);
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * The state hash an `update` or `remove` must present: item.json bytes plus the
 * content hash, so an operation planned against a listing cannot land on an item
 * that changed in between. Null when the item does not exist.
 */
export function itemStateHash(registryDir: string, type: ComponentType, slug: string): string | null {
  const jsonPath = itemJsonPath(registryDir, type, slug);
  if (!existsSync(jsonPath)) return null;
  const hash = createHash("sha256");
  hash.update(readFileSync(jsonPath));
  hash.update("\n");
  hash.update(contentHash(itemDir(registryDir, type, slug)) ?? "");
  return hash.digest("hex").slice(0, 16);
}

/**
 * The full-integrity digest (docs/registry-integrity.md §2): for every content
 * file, `path + "\n" + sha256hex(bytes) + "\n"`, paths sorted by plain
 * code-unit comparison, hashed once more with SHA-256. Null when the item has
 * no content files. This is what the CLI recomputes after downloading and
 * refuses to install on a mismatch.
 */
export function contentDigestOfDir(dir: string): string | null {
  const files = contentFiles(dir);
  if (files.length === 0) return null;
  const entries = files
    .map((file) => ({ path: relative(dir, file).split("\\").join("/"), bytes: readFileSync(file) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(entry.path);
    digest.update("\n");
    digest.update(createHash("sha256").update(entry.bytes).digest("hex"));
    digest.update("\n");
  }
  return digest.digest("hex");
}

/** The item's content files as sorted registry-relative paths (item.json excluded). */
export function contentFilePaths(dir: string): string[] {
  return contentFiles(dir).map((file) => relative(dir, file).split("\\").join("/")).sort();
}
