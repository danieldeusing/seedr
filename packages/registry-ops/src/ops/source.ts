import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { itemDir, itemJsonPath } from "../fsPaths.js";
import { localSourceOf } from "../localSource.js";
import { isFirstParty } from "../sourceTypes.js";
import { itemStateHash } from "../hash.js";
import { fileTree, readItem } from "../read.js";
import { omit } from "../util.js";
import { assertStructurallyValid } from "../validate.js";
import { copyDereferenced, removeIgnoredFiles } from "./copy.js";
import type { AdoptSourceOp, OpResult, ResyncSourceOp } from "./types.js";

/**
 * The item, held to the same two conditions as an update: it must be first-party
 * (a synced item is the sync's to own), and it must not have moved since the
 * caller read it.
 */
function itemToChange(registryDir: string, op: AdoptSourceOp | ResyncSourceOp): RegistryItem {
  const current = readItem(registryDir, op.type, op.slug);
  if (!isFirstParty(current.sourceType)) {
    throw new Error(`Only first-party items have a local source; ${op.type} "${op.slug}" is ${current.sourceType}`);
  }
  const actualHash = itemStateHash(registryDir, op.type, op.slug);
  if (actualHash !== op.expectedHash) {
    throw new Error(`${op.type} "${op.slug}" changed since it was read (expected ${op.expectedHash}, found ${actualHash}) — re-read and retry`);
  }
  return current;
}

/**
 * Stop tracking where an item came from: the source is gone, or it has been
 * taken over here and should no longer be compared against anything.
 *
 * Deliberately a separate operation rather than a side effect of an update. It
 * is the one irreversible thing about a local source — the path is not recorded
 * anywhere else — so it is confirmed on its own.
 */
export function adoptSource(registryDir: string, op: AdoptSourceOp): OpResult {
  const item = itemToChange(registryDir, op);
  if (!item.localSource) throw new Error(`${op.type}/${op.slug} records no source to adopt`);
  const adopted = omit(item, "localSource");
  writeFileSync(itemJsonPath(registryDir, op.type, op.slug), JSON.stringify(adopted, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item: adopted };
}

/**
 * Copy the item's content from its source again, and note the source's state as
 * it is now. The file set is replaced, not merged: a file deleted at the source
 * is a file the item should no longer carry.
 */
export function resyncSource(registryDir: string, op: ResyncSourceOp): OpResult {
  const item = itemToChange(registryDir, op);
  const source = item.localSource;
  if (!source) throw new Error(`${op.type}/${op.slug} records no source to copy from`);
  if (!existsSync(source.path)) throw new Error(`Source path does not exist: ${source.path} — adopt the item instead`);

  const dir = itemDir(registryDir, op.type, op.slug);
  // The whole directory goes, item.json aside: this replaces the content rather
  // than layering a new copy over whatever the last one left behind.
  const json = itemJsonPath(registryDir, op.type, op.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  if (statSync(source.path).isDirectory()) copyDereferenced(source.path, dir);
  else copyDereferenced(source.path, join(dir, basename(source.path)));
  removeIgnoredFiles(dir);

  const resynced: RegistryItem = {
    ...item,
    localSource: localSourceOf(source.path),
    contents: { ...item.contents, files: fileTree(dir) },
  };
  assertStructurallyValid(resynced, { expectedType: op.type, expectedSlug: op.slug });
  writeFileSync(json, JSON.stringify(resynced, null, 2) + "\n");
  return { kind: op.kind, type: op.type, slug: op.slug, item: resynced };
}
