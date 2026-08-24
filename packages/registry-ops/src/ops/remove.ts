import { rmSync } from "node:fs";
import { itemStateHash } from "../hash.js";
import { itemDir } from "../fsPaths.js";
import { readItem } from "../read.js";
import type { OpResult, RemoveOp } from "./types.js";

/**
 * Delete an item directory. Takes the composite key, the source type and the
 * state hash, so it cannot delete the wrong item or one that changed since it
 * was listed. Official items cannot be removed: the daily sync would restore
 * them and the operation would silently undo itself.
 */
export function remove(registryDir: string, op: RemoveOp): OpResult {
  const current = readItem(registryDir, op.type, op.slug);
  if (current.sourceType !== op.sourceType) {
    throw new Error(`${op.type} "${op.slug}" is ${current.sourceType}, not ${op.sourceType} — refusing to remove`);
  }
  if (current.sourceType === "official") {
    throw new Error(`Official items cannot be removed: the next sync would restore ${op.type} "${op.slug}"`);
  }
  const actualHash = itemStateHash(registryDir, op.type, op.slug);
  if (actualHash !== op.expectedHash) {
    throw new Error(`${op.type} "${op.slug}" changed since it was read (expected ${op.expectedHash}, found ${actualHash}) — re-read and retry`);
  }
  rmSync(itemDir(registryDir, op.type, op.slug), { recursive: true, force: true });
  return { kind: op.kind, type: op.type, slug: op.slug, item: null };
}
