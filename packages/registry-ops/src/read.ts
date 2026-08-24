import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentType, FileTreeNode, RegistryItem, RegistryManifestIndex, TypeManifest } from "@seedr/shared";
import { indexManifestPath, itemDir, itemJsonPath, typeDir, typeManifestPath } from "./fsPaths.js";
import { ALL_TYPES } from "./paths.js";
import { assertStructurallyValid } from "./validate.js";

export interface LocatedItem {
  type: ComponentType;
  slug: string;
  dir: string;
  item: RegistryItem;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${path}: ${(error as Error).message}`, { cause: error });
  }
}

/** Parse and structurally validate one item, checking it against the directory it lives in. */
export function readItem(registryDir: string, type: ComponentType, slug: string): RegistryItem {
  const path = itemJsonPath(registryDir, type, slug);
  if (!existsSync(path)) throw new Error(`No ${type} item "${slug}" at ${path}`);
  const value = readJson(path);
  assertStructurallyValid(value, { expectedType: type, expectedSlug: slug });
  return value;
}

export function itemExists(registryDir: string, type: ComponentType, slug: string): boolean {
  return existsSync(itemJsonPath(registryDir, type, slug));
}

/** Every item on disk, keyed by (type, slug), in type order then directory order. */
export function listItems(registryDir: string): LocatedItem[] {
  const items: LocatedItem[] = [];
  for (const type of ALL_TYPES) {
    const dir = typeDir(registryDir, type);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !existsSync(join(dir, entry.name, "item.json"))) continue;
      items.push({ type, slug: entry.name, dir: itemDir(registryDir, type, entry.name), item: readItem(registryDir, type, entry.name) });
    }
  }
  return items;
}

export function readIndex(registryDir: string): RegistryManifestIndex {
  return readJson(indexManifestPath(registryDir)) as RegistryManifestIndex;
}

export function readTypeManifest(registryDir: string, type: ComponentType): TypeManifest {
  return readJson(typeManifestPath(registryDir, type)) as TypeManifest;
}

/** The file tree under `dir`, directories first, sorted, item.json excluded. */
export function fileTree(dir: string): FileTreeNode[] {
  return readdirSync(dir, { withFileTypes: true })
    // item.json is metadata, and a symlink is not content — following one could
    // leave the item directory entirely.
    .filter((entry) => !entry.isSymbolicLink() && !(entry.isFile() && entry.name === "item.json"))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1))
    .map((entry) =>
      entry.isDirectory()
        ? { name: entry.name, type: "directory", children: fileTree(join(dir, entry.name)) }
        : { name: entry.name, type: "file" }
    );
}
