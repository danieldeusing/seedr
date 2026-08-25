import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentType, FileTreeNode, LabelDefinition, RegistryItem, RegistryManifestIndex, TypeManifest } from "@seedr/shared";
import { indexManifestPath, itemDir, itemJsonPath, labelsPath, typeDir, typeManifestPath } from "./fsPaths.js";
import { parseLabels } from "./labels.js";
import { ALL_TYPES, isValidSlug } from "./paths.js";
import { assertStructurallyValid, structuralErrors, validateItem } from "./validate.js";
import { isFirstParty } from "./sourceTypes.js";
import { contentFilePaths } from "./hash.js";

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

/**
 * Every item on disk with every violation found, keyed by (type, slug), in type
 * order then directory order. Violations cover the structural rules, and for
 * first-party items the `contents.files` tree must equal the files on disk
 * (the digest is computed over exactly that set).
 */
export function listItemsChecked(registryDir: string): { items: LocatedItem[]; violations: string[] } {
  const items: LocatedItem[] = [];
  const violations: string[] = [];
  for (const type of ALL_TYPES) {
    const dir = typeDir(registryDir, type);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !existsSync(join(dir, entry.name, "item.json"))) continue;
      if (!isValidSlug(entry.name)) {
        // Still validate the file's contents so a run reports every problem at once.
        const badPath = join(dir, entry.name, "item.json");
        violations.push(`${badPath}: directory name ${JSON.stringify(entry.name)} is not a valid slug`);
        const badErrors = structuralErrors(validateItem(readJson(badPath), { expectedType: type }));
        violations.push(...badErrors.map((e) => `${badPath}: ${e.field ? `${e.field}: ` : ""}${e.message}`));
        continue;
      }
      const location = itemDir(registryDir, type, entry.name);
      const path = itemJsonPath(registryDir, type, entry.name);
      const value = readJson(path);
      const firstParty = isObject(value) && isFirstParty((value as { sourceType?: unknown }).sourceType);
      const errors = structuralErrors(
        validateItem(value, {
          expectedType: type,
          expectedSlug: entry.name,
          ...(firstParty ? { diskFiles: contentFilePaths(location) } : {}),
        })
      );
      if (errors.length > 0) {
        violations.push(...errors.map((e) => `${path}: ${e.field ? `${e.field}: ` : ""}${e.message}`));
        continue;
      }
      items.push({ type, slug: entry.name, dir: location, item: value as RegistryItem });
    }
  }
  return { items, violations };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Every item on disk, parsed but NOT validated. The sync's migration path reads
 * a pre-integrity registry with this and pins what it carries over; everything
 * that WRITES back must go through the validating paths.
 */
export function listItemsRaw(registryDir: string): LocatedItem[] {
  const items: LocatedItem[] = [];
  for (const type of ALL_TYPES) {
    const dir = typeDir(registryDir, type);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !existsSync(join(dir, entry.name, "item.json"))) continue;
      const location = join(dir, entry.name);
      items.push({ type, slug: entry.name, dir: location, item: readJson(join(location, "item.json")) as RegistryItem });
    }
  }
  return items;
}

/** Every item on disk; throws one aggregated error when anything is invalid. */
export function listItems(registryDir: string): LocatedItem[] {
  const { items, violations } = listItemsChecked(registryDir);
  if (violations.length > 0) {
    throw new Error(`Invalid registry (${violations.length} violation(s)):\n  ${violations.join("\n  ")}`);
  }
  return items;
}

export function readIndex(registryDir: string): RegistryManifestIndex {
  return readJson(indexManifestPath(registryDir)) as RegistryManifestIndex;
}

export function readTypeManifest(registryDir: string, type: ComponentType): TypeManifest {
  return readJson(typeManifestPath(registryDir, type)) as TypeManifest;
}

/** The label catalogue on disk. A checkout from before labels existed simply has none. */
export function readLabels(registryDir: string): LabelDefinition[] {
  const path = labelsPath(registryDir);
  return existsSync(path) ? parseLabels(readJson(path)) : [];
}

/**
 * Refuse a label the catalogue does not define, naming it. `validateItem` stays
 * pure and catalogue-free, so the existence check lives here, where disk is.
 */
export function assertLabelDefined(registryDir: string, label: string | undefined): void {
  if (label === undefined) return;
  const defined = readLabels(registryDir);
  if (!defined.some((entry) => entry.slug === label)) {
    const known = defined.length > 0 ? defined.map((entry) => entry.slug).join(", ") : "none";
    throw new Error(`Unknown label "${label}": registry/labels.json defines ${known}`);
  }
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
