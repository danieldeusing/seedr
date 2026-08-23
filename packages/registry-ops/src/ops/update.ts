import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { itemStateHash } from "../hash.js";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { fileTree, readItem } from "../read.js";
import { omit } from "../util.js";
import { formatErrors, validateItem } from "../validate.js";
import { today } from "./addLocal.js";
import type { OpResult, UpdateOp } from "./types.js";

/** Resolve an edit path inside the item directory, refusing anything that escapes it. */
function insideItemDir(dir: string, editPath: string): string {
  const target = resolve(dir, editPath);
  const rel = relative(dir, target);
  if (rel === "" || rel.startsWith("..") || resolve(dir, rel) !== target) {
    throw new Error(`Content edit path escapes the item directory: ${editPath}`);
  }
  return target;
}

/**
 * Patch a first-party item's metadata and/or content files. Synced items are
 * refused: the next sync would overwrite the edit. The caller's `expectedHash`
 * must match the item as it is now, so an update planned against a stale listing
 * cannot land.
 */
export function update(registryDir: string, op: UpdateOp): OpResult {
  const current = readItem(registryDir, op.type, op.slug);
  if (current.sourceType !== "toolr") {
    throw new Error(`Only toolr items can be updated; ${op.type} "${op.slug}" is ${current.sourceType} and would be overwritten by the next sync`);
  }
  const actualHash = itemStateHash(registryDir, op.type, op.slug);
  if (actualHash !== op.expectedHash) {
    throw new Error(`${op.type} "${op.slug}" changed since it was read (expected ${op.expectedHash}, found ${actualHash}) — re-read and retry`);
  }

  const dir = itemDir(registryDir, op.type, op.slug);
  const edits = (op.contentEdits ?? []).map((edit) => ({ target: insideItemDir(dir, edit.path), content: edit.content }));

  const next: RegistryItem = { ...omit(current, "contentHash"), ...op.patch, updatedAt: today() };
  // Content edits change the file tree; validate against the tree they will produce.
  const errors = validateItem(next, { expectedType: op.type, expectedSlug: op.slug });
  if (errors.length > 0) throw new Error(`Item would be invalid: ${formatErrors(errors)}`);

  for (const edit of edits) {
    mkdirSync(dirname(edit.target), { recursive: true });
    writeFileSync(edit.target, edit.content);
  }
  const item: RegistryItem = edits.length > 0 ? { ...next, contents: { ...next.contents, files: fileTree(dir) } } : next;
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(item, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}
