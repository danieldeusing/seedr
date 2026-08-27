import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { RegistryItem } from "@seedr/shared";
import { itemDir, itemJsonPath, repoRootOf } from "../fsPaths.js";
import { forgetLocalSource, localSourceOf, rememberLocalSource } from "../localSources.js";
import { isFirstParty } from "../sourceTypes.js";
import { itemStateHash } from "../hash.js";
import { fileTree, readItem } from "../read.js";
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
  const repoRoot = repoRootOf(registryDir);
  if (!localSourceOf(repoRoot, op.type, op.slug)) throw new Error(`${op.type}/${op.slug} records no source to adopt`);
  forgetLocalSource(repoRoot, op.type, op.slug);
  // The item itself does not change — only this checkout stops looking at a folder.
  return { kind: op.kind, type: op.type, slug: op.slug, item };
}

/**
 * Copy the item's content from its source again, and note the source's state as
 * it is now. The file set is replaced, not merged: a file deleted at the source
 * is a file the item should no longer carry.
 */
export function resyncSource(registryDir: string, op: ResyncSourceOp): OpResult {
  const item = itemToChange(registryDir, op);
  const repoRoot = repoRootOf(registryDir);
  const source = localSourceOf(repoRoot, op.type, op.slug);
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

  const resynced: RegistryItem = { ...item, contents: { ...item.contents, files: fileTree(dir) } };
  assertStructurallyValid(resynced, { expectedType: op.type, expectedSlug: op.slug });
  writeFileSync(json, JSON.stringify(resynced, null, 2) + "\n");
  // Both sides are level again, so both digests are noted anew.
  rememberLocalSource(repoRoot, registryDir, op.type, op.slug, source.path);
  return { kind: op.kind, type: op.type, slug: op.slug, item: resynced };
}
