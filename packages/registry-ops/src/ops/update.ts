import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { storageAgents } from "../agents.js";
import { isFirstParty } from "../sourceTypes.js";
import { itemStateHash } from "../hash.js";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { fileTree, readItem } from "../read.js";
import { omit } from "../util.js";
import { formatErrors, validateItem } from "../validate.js";
import { today } from "./addLocal.js";
import type { OpResult, UpdateOp } from "./types.js";

/**
 * Resolve an edit path inside the item directory, refusing anything that could
 * land outside it: absolute paths, `..`, backslashes and drive letters (which
 * `resolve` would send to another drive on Windows), and any existing symlink
 * on the way — a link would carry the write out of the repository.
 */
function insideItemDir(dir: string, editPath: string): string {
  const segments = editPath.split("/");
  const plainSegments = segments.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes("\\") && !s.includes(":"));
  const root = resolve(dir);
  const target = resolve(root, editPath);
  if (!plainSegments || !target.startsWith(root + sep)) {
    throw new Error(`Content edit path escapes the item directory: ${editPath}`);
  }
  for (let walked = root, i = 0; i < segments.length; i++) {
    walked = resolve(walked, segments[i] as string);
    if (existsSync(walked) && lstatSync(walked).isSymbolicLink()) {
      throw new Error(`Content edit path goes through a symlink: ${editPath}`);
    }
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
  if (!isFirstParty(current.sourceType)) {
    throw new Error(`Only first-party items can be updated; ${op.type} "${op.slug}" is ${current.sourceType} and would be overwritten by the next sync`);
  }
  const actualHash = itemStateHash(registryDir, op.type, op.slug);
  if (actualHash !== op.expectedHash) {
    throw new Error(`${op.type} "${op.slug}" changed since it was read (expected ${op.expectedHash}, found ${actualHash}) — re-read and retry`);
  }

  const dir = itemDir(registryDir, op.type, op.slug);
  const edits = (op.contentEdits ?? []).map((edit) => ({ target: insideItemDir(dir, edit.path), content: edit.content }));

  const next: RegistryItem = { ...omit(current, "contentHash"), ...op.patch, updatedAt: today() };
  // A patch names what changes inside contents (usually triggers); the file list stays.
  if (op.patch.contents) next.contents = { ...current.contents, ...op.patch.contents };
  // Content edits change the file tree; validate against the tree they will produce.
  const errors = validateItem(next, { expectedType: op.type, expectedSlug: op.slug });
  if (errors.length > 0) throw new Error(`Item would be invalid: ${formatErrors(errors)}`);

  for (const edit of edits) {
    mkdirSync(dirname(edit.target), { recursive: true });
    writeFileSync(edit.target, edit.content);
  }
  // Written in the B1 storage vocabulary (STORAGE_ALIASES): deduplicated with
  // aliases resolved, but `antigravity` stays stored as `gemini` until the
  // published CLI understands it. The raw list was validated above, so an
  // unknown id still names itself.
  next.compatibility = storageAgents(next.compatibility);
  const item: RegistryItem = edits.length > 0 ? { ...next, contents: { ...next.contents, files: fileTree(dir) } } : next;
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(item, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}
