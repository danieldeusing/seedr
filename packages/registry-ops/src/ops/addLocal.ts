import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { canonicalAgent, storageAgents } from "../agents.js";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { localSourceOf } from "../localSource.js";
import { assertLabelDefined, fileTree, itemExists } from "../read.js";
import { assertStructurallyValid, formatErrors, validateItem } from "../validate.js";
import { copyDereferenced, removeIgnoredFiles } from "./copy.js";
import type { AddLocalOp, OpResult } from "./types.js";

export const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Copy a local source tree into the registry as a first-party (`seedr`) item.
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
  // Unknown ids are refused by name; aliases and duplicates normalise to the
  // B1 storage vocabulary (STORAGE_ALIASES), which is what gets validated and written.
  const unknown = op.compatibility.filter((agent) => canonicalAgent(agent) === null);
  if (unknown.length > 0) {
    throw new Error(`Item would be invalid: compatibility: unknown coding agent(s) ${unknown.join(", ")}`);
  }
  const provisional: RegistryItem = {
    slug: op.slug,
    name: op.name,
    type: op.type,
    description: op.description,
    longDescription: op.longDescription,
    compatibility: storageAgents(op.compatibility),
    sourceType: "seedr",
    author: op.author,
    ...(op.externalUrl ? { externalUrl: op.externalUrl } : {}),
    ...(op.targetScope ? { targetScope: op.targetScope } : {}),
    ...(op.label ? { label: op.label } : {}),
    updatedAt: today(),
    contents: { files: [] },
  };
  const errors = validateItem(provisional);
  if (errors.length > 0) throw new Error(`Item would be invalid: ${formatErrors(errors)}`);
  assertLabelDefined(registryDir, op.label);

  mkdirSync(dir, { recursive: true });
  if (sourceIsDir) copyDereferenced(op.sourcePath, dir);
  else copyDereferenced(op.sourcePath, join(dir, basename(op.sourcePath)));
  removeIgnoredFiles(dir);

  const item: RegistryItem = {
    ...provisional,
    // Where it came from, so the copy can be checked against the original later.
    // Recorded from the source as it was *before* the copy dropped ignored files,
    // because that is what a later check re-reads.
    localSource: localSourceOf(op.sourcePath),
    contents: { files: fileTree(dir), ...(op.triggers?.length ? { triggers: op.triggers } : {}) },
  };
  assertStructurallyValid(item, { expectedType: op.type, expectedSlug: op.slug });
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(item, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}
