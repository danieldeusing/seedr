import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { fileTree, itemExists } from "../read.js";
import { assertStructurallyValid, formatErrors, validateItem } from "../validate.js";
import type { AddLocalOp, OpResult } from "./types.js";

export const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Copy a local source tree into the registry as a first-party (`toolr`) item.
 * The item is validated in full — including the description gate — before a
 * single byte is written, so a rejected operation leaves no trace.
 */
export function addLocal(registryDir: string, op: AddLocalOp): OpResult {
  if (itemExists(registryDir, op.type, op.slug)) {
    throw new Error(`A ${op.type} item "${op.slug}" already exists — use update, or remove it first`);
  }
  if (!existsSync(op.sourcePath)) throw new Error(`Source path does not exist: ${op.sourcePath}`);
  const sourceIsDir = statSync(op.sourcePath).isDirectory();

  const dir = itemDir(registryDir, op.type, op.slug);
  // Prepare the item first with a provisional file tree, so every validation
  // failure happens before the copy.
  const provisional: RegistryItem = {
    slug: op.slug,
    name: op.name,
    type: op.type,
    description: op.description,
    longDescription: op.longDescription,
    compatibility: op.compatibility,
    sourceType: "toolr",
    author: op.author,
    ...(op.externalUrl ? { externalUrl: op.externalUrl } : {}),
    ...(op.targetScope ? { targetScope: op.targetScope } : {}),
    updatedAt: today(),
    contents: { files: [] },
  };
  const errors = validateItem(provisional);
  if (errors.length > 0) throw new Error(`Item would be invalid: ${formatErrors(errors)}`);

  mkdirSync(dir, { recursive: true });
  if (sourceIsDir) cpSync(op.sourcePath, dir, { recursive: true });
  else cpSync(op.sourcePath, join(dir, basename(op.sourcePath)));

  const item: RegistryItem = {
    ...provisional,
    contents: { files: fileTree(dir), ...(op.triggers?.length ? { triggers: op.triggers } : {}) },
  };
  assertStructurallyValid(item, { expectedType: op.type, expectedSlug: op.slug });
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(item, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}
